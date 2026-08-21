import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:privacy_vault/core/constants.dart';
import 'package:privacy_vault/models/models.dart';
import 'package:privacy_vault/services/app_settings.dart';
import 'package:privacy_vault/services/auth_service.dart';
import 'package:privacy_vault/services/file_vault_service.dart';
import 'package:privacy_vault/services/native_bridge.dart';
import 'package:privacy_vault/services/security_log_service.dart';
import 'package:privacy_vault/services/security_policies.dart';
import 'package:privacy_vault/services/vault_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// FAZ 12 — üretim öncesi entegrasyon & stabilizasyon testleri:
/// native bridge fallback / yanlış tip / kanal yok, izin reddi, arka plan
/// kilidi, lockout kalıcılığı, kimlik kalıcılığı, kasa kesinti/budama,
/// bildirim modu, iOS politikası (dürüst fallback), log redaksiyonu.
/// Mevcut 66 test aynen durur.

const _pvChannel = MethodChannel(K.nativeChannel);
const _secureChannel = MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
const _pathChannel = MethodChannel('plugins.flutter.io/path_provider');

TestDefaultBinaryMessenger get _m => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

/// async yüklenen state'i (restore/load) bekleme yardımcısı.
Future<T> waitState<T>(T Function() read, bool Function(T) ok) async {
  for (var i = 0; i < 200; i++) {
    final v = read();
    if (ok(v)) return v;
    await Future<void>.delayed(const Duration(milliseconds: 5));
  }
  fail('state beklenen koşula ulaşmadı (zaman aşımı)');
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  tearDown(() {
    NativeBridge.debugIsAndroid = null;
    _m.setMockMethodCallHandler(_pvChannel, null);
    _m.setMockMethodCallHandler(_secureChannel, null);
    _m.setMockMethodCallHandler(_pathChannel, null);
  });

  // -------------------------------------------------------------------------
  group('NativeBridge dayanıklılığı (md.3-5): çökme yok, dürüst fallback', () {
    setUp(() => NativeBridge.debugIsAndroid = true);

    test('platform hatası (PlatformException) → güvenli varsayılanlar', () async {
      _m.setMockMethodCallHandler(_pvChannel, (call) async {
        throw PlatformException(code: 'unavailable', message: 'servis kapalı');
      });
      expect(await NativeBridge.getInstalledApps(), isEmpty);
      expect(await NativeBridge.getAppIcon('com.x'), isNull);
      expect(await NativeBridge.isAccessibilityEnabled(), isFalse);
      expect(await NativeBridge.canDrawOverlays(), isFalse);
      expect(await NativeBridge.isNotificationListenerEnabled(), isFalse);
      expect(await NativeBridge.isDeviceAdminActive(), isFalse);
      expect(await NativeBridge.drainNativeEvents(), isEmpty);
      expect(await NativeBridge.setLauncherIdentity('calculator'), isFalse);
      // void çağrılar da fırlatmamalı (izin ekranı açma / sync / bayrak)
      await NativeBridge.syncLockState({'lockedPackages': <String>[]});
      await NativeBridge.setFlagSecure(true);
      await NativeBridge.openAccessibilitySettings();
      await NativeBridge.requestDeviceAdmin();
    });

    test('kanal yok (MissingPluginException) → güvenli varsayılanlar', () async {
      // handler kurulu değil → invokeMethod MissingPluginException fırlatır
      expect(await NativeBridge.getInstalledApps(), isEmpty);
      expect(await NativeBridge.isAccessibilityEnabled(), isFalse);
      expect(await NativeBridge.setLauncherIdentity('weather'), isFalse);
      expect(await NativeBridge.drainNativeEvents(), isEmpty);
      await NativeBridge.syncLockState({'k': 'v'}); // no-op, fırlatmaz
      await NativeBridge.setFlagSecure(false);
    });

    test('yanlış tipli yük → varsayılan/crash yok; bozuk eleman elenir', () async {
      _m.setMockMethodCallHandler(_pvChannel, (call) async {
        switch (call.method) {
          case 'isAccessibilityEnabled':
            return 'evet'; // bool bekleniyor → false
          case 'getAppIcon':
            return 'png-degil';
          case 'getInstalledApps':
            return [
              'bozuk-eleman',
              {'package': 'com.iyi.app', 'label': 'İyi', 'category': 'Diğer'},
              {'label': 'package-eksik'}, // packageName yok → elenir
            ];
          case 'drainNativeEvents':
            return [
              42,
              {'at': 1000, 'type': 'appUnlock', 'detail': 'com.x'},
            ];
          case 'setLauncherIdentity':
            return 1; // bool değil
        }
        return null;
      });
      expect(await NativeBridge.isAccessibilityEnabled(), isFalse);
      expect(await NativeBridge.getAppIcon('com.x'), isNull);
      final apps = await NativeBridge.getInstalledApps();
      expect(apps.length, 1);
      expect(apps.single.packageName, 'com.iyi.app');
      final events = await NativeBridge.drainNativeEvents();
      expect(events.length, 1);
      expect(events.single['type'], 'appUnlock');
      expect(await NativeBridge.setLauncherIdentity('notes'), isFalse);
    });

    test('başarılı native yanıt → değer aynen geçer (izin verildi senaryosu)', () async {
      _m.setMockMethodCallHandler(_pvChannel, (call) async {
        switch (call.method) {
          case 'isAccessibilityEnabled':
          case 'isNotificationListenerEnabled':
          case 'isDeviceAdminActive':
            return true;
          case 'setLauncherIdentity':
            return true;
        }
        return null;
      });
      expect(await NativeBridge.isAccessibilityEnabled(), isTrue);
      expect(await NativeBridge.isNotificationListenerEnabled(), isTrue);
      expect(await NativeBridge.isDeviceAdminActive(), isTrue);
      expect(await NativeBridge.setLauncherIdentity('clock'), isTrue);
    });
  });

  // -------------------------------------------------------------------------
  group('iOS / Android-dışı platform politikası (md.3, md.11): dürüst no-op', () {
    setUp(() => NativeBridge.debugIsAndroid = false);

    test('Android-only çağrılar kanala HİÇ çıkmadan güvenli varsayılan döner', () async {
      var channelHit = 0;
      _m.setMockMethodCallHandler(_pvChannel, (call) async {
        channelHit++;
        return true; // ulaşılmamalı
      });
      expect(await NativeBridge.getInstalledApps(), isEmpty);
      expect(await NativeBridge.isAccessibilityEnabled(), isFalse);
      expect(await NativeBridge.isNotificationListenerEnabled(), isFalse);
      expect(await NativeBridge.canDrawOverlays(), isFalse);
      expect(await NativeBridge.isDeviceAdminActive(), isFalse);
      expect(await NativeBridge.drainNativeEvents(), isEmpty);
      await NativeBridge.setFlagSecure(true); // iOS'ta pencere bayrağı yok → no-op
      await NativeBridge.syncLockState({'a': 1});
      await NativeBridge.openOverlaySettings();
      expect(channelHit, 0, reason: 'iOS/Android-dışında native kanala çıkılmamalı');
    });

    test('setLauncherIdentity handler yoksa dürüst false (iOS CFBundleIcons sınırı)', () async {
      expect(await NativeBridge.setLauncherIdentity('calculator'), isFalse);
    });
  });

  // -------------------------------------------------------------------------
  group('Arka plan kilidi politikası (md.10)', () {
    test('yalnızca bgLock AÇIK + oturum AÇIK iken yeniden kilitlenir', () {
      expect(shouldRelockOnBackground(bgLockEnabled: true, sessionUnlocked: true), isTrue);
      expect(shouldRelockOnBackground(bgLockEnabled: true, sessionUnlocked: false), isFalse);
      expect(shouldRelockOnBackground(bgLockEnabled: false, sessionUnlocked: true), isFalse);
      expect(shouldRelockOnBackground(bgLockEnabled: false, sessionUnlocked: false), isFalse);
    });
  });

  // -------------------------------------------------------------------------
  group('Lockout kalıcılığı (md.12): process yeniden başlasa da sayaç korunur', () {
    setUp(() {
      // secure storage: hiç kimlik yok → her doğrulama başarısız sayılır
      _m.setMockMethodCallHandler(_secureChannel, (call) async => null);
    });

    test('3+ hata kalıcıysa restore sonrası SECURITY LOCKED doğar', () async {
      SharedPreferences.setMockInitialValues({K.pFailedAttempts: 3});
      final c = ProviderContainer();
      addTearDown(c.dispose);
      final st = await waitState(() => c.read(authProvider), (s) => s.failedAttempts == 3);
      expect(st.lockedOut, isTrue);
      expect(st.attemptsLeft, 0);
      // kilitliyken doğrulama denemesi lockout döner, sayaç daha da artmaz
      expect(await c.read(authProvider.notifier).verifyPin('000000'), AuthResult.lockedOut);
    });

    test('2 hata → kilit yok, 1 hak kalır; sonraki hata kalıcı 3 olur (race yok)', () async {
      SharedPreferences.setMockInitialValues({K.pFailedAttempts: 2});
      final c = ProviderContainer();
      addTearDown(c.dispose);
      await waitState(() => c.read(authProvider), (s) => s.failedAttempts == 2);
      expect(c.read(authProvider).lockedOut, isFalse);
      expect(c.read(authProvider).attemptsLeft, 1);
      // restart sonrası İLK deneme: restore beklenir, sayaç 0'dan değil 2'den ilerler
      final res = await c.read(authProvider.notifier).verifyPin('yanlis-deneme');
      expect(res, AuthResult.lockedOut);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getInt(K.pFailedAttempts), 3, reason: 'sayaç kalıcı olarak 3 olmalı');
      expect(c.read(authProvider).lockedOut, isTrue);
    });

    test('sıfır hata → açık doğar; başarısız deneme 1 olarak kalıcılaşır', () async {
      SharedPreferences.setMockInitialValues({});
      final c = ProviderContainer();
      addTearDown(c.dispose);
      await waitState(() => c.read(authProvider), (s) => s.failedAttempts == 0);
      final res = await c.read(authProvider.notifier).verifyPin('yanlis');
      expect(res, AuthResult.failed);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getInt(K.pFailedAttempts), 1);
      expect(c.read(authProvider).lockedOut, isFalse);
    });
  });

  // -------------------------------------------------------------------------
  group('Kimlik kalıcılığı + Android alias uzlaşısı (md.8)', () {
    test('seçilen kimlik yeniden başlatmada korunur (SharedPreferences)', () async {
      SharedPreferences.setMockInitialValues({K.pLauncherIdentity: 'weather'});
      final c = ProviderContainer();
      addTearDown(c.dispose);
      final st = await waitState(() => c.read(settingsProvider), (s) => s.launcherIdentity == 'weather');
      expect(st.launcherIdentity, 'weather');
    });

    test('bilinmeyen kimlik → default; alias adları MainActivity.kt ile birebir', () {
      expect(launcherIdentityFor('bilinmeyen').id, 'default');
      final m = {for (final e in kLauncherIdentities) e.id: e.androidComponentSuffix};
      expect(m, {
        'default': 'MainActivity',
        'calculator': 'AliasCalculator',
        'notes': 'AliasNotes',
        'clock': 'AliasClock',
        'weather': 'AliasWeather',
      });
    });
  });

  // -------------------------------------------------------------------------
  group('Bildirim gizliliği modu (md.6)', () {
    test('gizli işareti her zaman hide yapar; normal seçim korunur', () {
      expect(effectiveNotifMode(hidden: true, mode: NotifMode.normal), NotifMode.hide);
      expect(effectiveNotifMode(hidden: true, mode: NotifMode.mask), NotifMode.hide);
      expect(effectiveNotifMode(hidden: false, mode: NotifMode.normal), NotifMode.normal);
      expect(effectiveNotifMode(hidden: false, mode: NotifMode.mask), NotifMode.mask);
      expect(effectiveNotifMode(hidden: false, mode: NotifMode.hide), NotifMode.hide);
    });

    test('eski bool kayıt → hide migrasyonu; roundtrip notifMode KORUR (md.15)', () {
      final legacy = ProtectedAppConfig.fromMap({
        'packageName': 'com.whatsapp',
        'label': 'WhatsApp',
        'locked': true,
        'hideNotifications': true, // FAZ 9 öncesi format — notifMode alanı YOK
      });
      expect(legacy.notifMode, NotifMode.hide);

      final modern = ProtectedAppConfig(
        packageName: 'com.instagram',
        label: 'Instagram',
        locked: true,
        notifMode: NotifMode.mask,
        decoy: DecoyKind.calculator,
        method: AuthMethod.bioPin,
      );
      final back = ProtectedAppConfig.decodeList(ProtectedAppConfig.encodeList([modern])).single;
      expect(back.notifMode, NotifMode.mask);
      expect(back.decoy, DecoyKind.calculator);
      expect(back.method, AuthMethod.bioPin);
    });
  });

  // -------------------------------------------------------------------------
  group('Kasa kesinti/budama + migration-güvenli indeks (md.9, md.15)', () {
    late Directory dir;
    FileVaultService svc() => FileVaultService(
          crypto: VaultCrypto(keyStore: MemoryVaultKeyStore()),
          testDir: dir,
        );
    setUp(() async => dir = await Directory.systemTemp.createTemp('pv12_test'));
    tearDown(() async {
      if (await dir.exists()) await dir.delete(recursive: true);
    });

    test('yarım .tmp, yetim .pvf/.pvt, eskiyen geçici silinir; taze geçici KORUNUR', () async {
      final files = Directory('${dir.path}/vault/files')..createSync(recursive: true);
      final thumbs = Directory('${dir.path}/vault/thumbs')..createSync(recursive: true);
      final tmp = Directory('${dir.path}/vault/tmp')..createSync(recursive: true);
      File('${files.path}/yetim.pvf').writeAsBytesSync([1, 2, 3]);
      File('${files.path}/yarim.tmp').writeAsBytesSync([4, 5]);
      File('${thumbs.path}/yetimthumb.pvt').writeAsBytesSync([6]);
      final oldTmp = File('${tmp.path}/eski_plain.bin')..writeAsBytesSync([7]);
      oldTmp.setLastModifiedSync(DateTime.now().subtract(const Duration(minutes: 60)));
      final freshTmp = File('${tmp.path}/taze_plain.bin')..writeAsBytesSync([8]);
      // indeks dosyası YOK → tüm pvf/pvt yetim sayılır
      await svc().load();
      expect(File('${files.path}/yetim.pvf').existsSync(), isFalse);
      expect(File('${files.path}/yarim.tmp').existsSync(), isFalse);
      expect(File('${thumbs.path}/yetimthumb.pvt').existsSync(), isFalse);
      expect(oldTmp.existsSync(), isFalse, reason: '15 dk üstü geçici plaintext silinmeli');
      expect(freshTmp.existsSync(), isTrue, reason: 'taze geçici (muhtemel aktif export) korunmalı');
    });

    test('bozuk indeks → mevcut şifreli dosyalar SİLİNMEZ (veri kaybı yok)', () async {
      final files = Directory('${dir.path}/vault/files')..createSync(recursive: true);
      File('${files.path}/degerli.pvf').writeAsBytesSync([9, 9, 9]);
      File('${dir.path}/vault/index.json').writeAsStringSync('{bozuk-json!!');
      await svc().load();
      expect(File('${files.path}/degerli.pvf').existsSync(), isTrue,
          reason: 'indeks okunamıyorsa içerik yetim sayılamaz');
    });

    test('kısmen bozuk indeks → sağlam kayıtlar korunur, gerçek yetimler budanır', () async {
      final files = Directory('${dir.path}/vault/files')..createSync(recursive: true);
      File('${files.path}/k1.pvf').writeAsBytesSync([1]);
      File('${files.path}/k2_gercek_yetim.pvf').writeAsBytesSync([2]);
      final idx = jsonEncode([
        {'id': 'k1', 'createdAt': DateTime.now().toIso8601String(), 'blob': 'AAAA'},
        {'bozuk': 1}, // alanları eksik bozuk kayıt → atlanmalı
      ]);
      File('${dir.path}/vault/index.json').writeAsStringSync(idx);
      await svc().load();
      expect(File('${files.path}/k1.pvf').existsSync(), isTrue);
      expect(File('${files.path}/k2_gercek_yetim.pvf').existsSync(), isFalse);
    });
  });

  // -------------------------------------------------------------------------
  group('Güvenlik log redaksiyonu (md.13) + halka tampon', () {
    test('redactLogDetail: PIN benzeri rakam/sembol dizileri maskelenir', () {
      expect(redactLogDetail('123456'), '•••');
      expect(redactLogDetail('★✦◆'), '•••');
      expect(redactLogDetail('com.whatsapp'), 'com.whatsapp'); // sıradan metin korunur
      expect(redactLogDetail('2 hak kaldı'), '2 hak kaldı'); // tek rakam korunur
    });

    test('log servisi: detay dosyaya redakte yazılır, tampon 300 ile sınırlı', () async {
      final dir = await Directory.systemTemp.createTemp('pv12_log');
      addTearDown(() async {
        if (await dir.exists()) await dir.delete(recursive: true);
      });
      _m.setMockMethodCallHandler(_pathChannel, (call) async {
        if (call.method == 'getApplicationDocumentsDirectory') return dir.path;
        return null;
      });
      final svc = SecurityLogService();
      // sır değeri asla loglanmamalı; redaksiyon hataya karşı da sigortalamalı
      await svc.add('panicLock', 'hatalı-detay-987654-★✦◆');
      final raw = await File('${dir.path}/security_log.json').readAsString();
      expect(raw.contains('987654'), isFalse, reason: 'PIN benzeri detay diske DÜZ yazılmamalı');
      expect(raw.contains('★✦◆'), isFalse, reason: 'kurtarma sembolleri diske yazılmamalı');
      expect(raw.contains('•••'), isTrue);
      // halka tampon: K.maxSecurityEvents üstü eskiyi atar
      // (not: 'app0'..'app304' üç haneliye çıkınca rakamlar redaksiyona uğrar —
      //  bu beklenen davranış; sıralama kontrolünü redakte-edilmeyen işaretle yapıyoruz)
      for (var i = 0; i < K.maxSecurityEvents + 5; i++) {
        await svc.add('appUnlock', i < 100 ? 'com.app$i' : 'com.appx');
      }
      await svc.add('appUnlock', 'en-yeni-isaret');
      expect(svc.state.length, K.maxSecurityEvents);
      expect(svc.state.first.detail, 'en-yeni-isaret'); // en yeni başta
      expect(svc.state.any((e) => e.type == 'panicLock'), isFalse); // en eskiler düştü
    });
  });

  // -------------------------------------------------------------------------
  group('Decoy trigger freni sınırı (md.7): farklı aday anında serbest', () {
    test('ayrı adaylar aynı milisaniyede bile engellenmez (kullanılabilirlik korunur)', () {
      expect(
        allowTriggerAttempt(candidate: '!!!', lastCandidate: '???', lastAttemptMs: 5000, nowMs: 5000),
        isTrue,
      );
      expect(
        allowTriggerAttempt(candidate: '!!!', lastCandidate: '!!!', lastAttemptMs: 5000, nowMs: 5000),
        isFalse,
      );
    });
  });
}
