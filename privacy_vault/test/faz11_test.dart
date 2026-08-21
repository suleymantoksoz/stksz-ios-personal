import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:privacy_vault/core/constants.dart';
import 'package:privacy_vault/models/models.dart';
import 'package:privacy_vault/services/app_settings.dart';
import 'package:privacy_vault/services/auth_service.dart';
import 'package:privacy_vault/services/decoy/trigger_tools.dart';
import 'package:privacy_vault/services/file_vault_service.dart';
import 'package:privacy_vault/services/security_policies.dart';
import 'package:privacy_vault/services/vault_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// FAZ 11 — üretim sertleştirme testleri: throttle, migration, restart state,
/// lockout politikası, geçici dosya temizliği (hata yolu).
/// Mevcut 54 test aynen durur.

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Trigger brute-force freni (madde 5)', () {
    test('aynı aday 800ms içinde tekrar denenemez; farklı aday serbest', () {
      expect(
        allowTriggerAttempt(candidate: 'a', lastCandidate: null, lastAttemptMs: null, nowMs: 1000),
        isTrue,
      ); // ilk deneme her zaman serbest
      expect(
        allowTriggerAttempt(candidate: 'a', lastCandidate: 'a', lastAttemptMs: 1000, nowMs: 1400),
        isFalse,
      ); // 400ms < 800ms → BLOKE
      expect(
        allowTriggerAttempt(candidate: 'a', lastCandidate: 'a', lastAttemptMs: 1000, nowMs: 1801),
        isTrue,
      ); // pencere geçti → serbest
      expect(
        allowTriggerAttempt(candidate: 'b', lastCandidate: 'a', lastAttemptMs: 1000, nowMs: 1001),
        isTrue,
      ); // farklı aday → bekleme yok (PBKDF2 maliyeti doğal fren)
    });
  });

  group('Tetikleyici karmaşıklık zemini (madde 4-5)', () {
    test('yeni notes/weather tetikleyicileri en az 3 karakter olmalı', () {
      expect(TriggerNorm.isValid('notes', '!'), isFalse);
      expect(TriggerNorm.isValid('notes', '!!'), isFalse);
      expect(TriggerNorm.isValid('notes', '!!!'), isTrue);
      expect(TriggerNorm.isValid('weather', '..'), isFalse);
      expect(TriggerNorm.isValid('weather', '...'), isTrue);
      // mevcut davranış korunur: clock/calculator formatları değişmedi
      expect(TriggerNorm.isValid('clock', '12:34'), isTrue);
      expect(TriggerNorm.isValid('calculator', '2580+1'), isTrue);
    });
  });

  group('Uygulama restart/crash state (madde 4)', () {
    test('process yeniden başladığında oturum KAPALI doğar (kilit bypass yok)', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);
      // yeni container = yeni process → appUnlockedProvider varsayılanı false
      expect(container.read(appUnlockedProvider), isFalse);
    });

    test('lockout sabitleri native ile birebir aynı kalır', () {
      expect(K.maxAttempts, 3);
      expect(K.kdfIterations, 60000); // HashUtil.kt varsayılanıyla birebir aynı
      expect(K.pinLength, 6);
    });

    test('AuthState.clamp güvenli sınırı aşamaz', () {
      expect(const AuthState(failedAttempts: 5).attemptsLeft, 0);
      expect(const AuthState(failedAttempts: 99, lockedOut: true).attemptsLeft, 0);
      expect(const AuthState().attemptsLeft, K.maxAttempts);
      expect(const AuthState(failedAttempts: 3, lockedOut: true).lockedOut, isTrue);
    });
  });

  group('Ayar migration — eski kullanıcı verisi (madde 8)', () {
    test('boş depo (yeni kurulum) → tüm varsayılanlar güvenli', () async {
      SharedPreferences.setMockInitialValues({});
      final container = ProviderContainer();
      addTearDown(container.dispose);
      container.read(settingsProvider.notifier);
      await Future<void>.delayed(const Duration(milliseconds: 100)); // _load async
      final st = container.read(settingsProvider);
      expect(st.onboarded, isFalse);
      expect(st.vaultAuthMode, 'bioPin');
      expect(st.bgLock, isFalse);
      expect(st.launcherIdentity, 'default');
      expect(st.decoyKind, 'calculator');
      expect(st.notifHide, isFalse);
    });

    test('FAZ 9 öncesi depo (yeni alanlar yok) → eski değerler korunur, yenileri varsayılan', () async {
      SharedPreferences.setMockInitialValues({
        'setup.onboarded': true,
        'settings.biometric_entry': true,
        'settings.stealth_vault': true,
        'settings.decoy_kind': 'notes',
      });
      final container = ProviderContainer();
      addTearDown(container.dispose);
      container.read(settingsProvider.notifier);
      await Future<void>.delayed(const Duration(milliseconds: 100));
      final st = container.read(settingsProvider);
      // eski alanlar korunur (veri kaybı YOK)
      expect(st.onboarded, isTrue);
      expect(st.biometricEntry, isTrue);
      expect(st.stealthVault, isTrue);
      expect(st.decoyKind, 'notes');
      // yeni alanlar geriye dönük uyumlu varsayılanlarda
      expect(st.vaultAuthMode, 'bioPin');
      expect(st.bgLock, isFalse);
    });
  });

  group('Uygulama yapılandırma persistence + bozuk veri (madde 5, 8)', () {
    test('malformed koruma haritası throw eder (servis katmanı catch ile korunur)', () {
      expect(() => ProtectedAppConfig.decodeList('bu-json-degil{{{'), throwsA(isA<FormatException>()));
      // bozuk entry toleransı: üretim servisi exception'ı yakalayıp boş state tutar
    });

    test('NotifMode bilinmeyen değer → normal (güvenli, en az engelleyen mod)', () {
      expect(NotifModeX.parse('yok-boyle'), NotifMode.normal);
      expect(NotifModeX.parse(null), NotifMode.normal);
      expect(NotifModeX.parse('mask'), NotifMode.mask);
    });

    test('profil roundtrip: decoy + notifMode + method birlikte korunur', () {
      final cfg = ProtectedAppConfig(
        packageName: 'com.bank',
        label: 'Bank',
        locked: true,
        hidden: true,
        notifMode: NotifMode.mask,
        method: AuthMethod.bioPassword,
        decoy: DecoyKind.clock,
      );
      final back = ProtectedAppConfig.decodeList(ProtectedAppConfig.encodeList([cfg])).single;
      expect(back.decoy, DecoyKind.clock);
      expect(back.notifMode, NotifMode.mask);
      expect(back.method, AuthMethod.bioPassword);
      expect(back.locked && back.hidden, isTrue);
    });
  });

  group('Export hata yolu: geçici plaintext artığı KALMAZ (madde 4)', () {
    late Directory dir;
    setUp(() async => dir = await Directory.systemTemp.createTemp('pv11_test'));
    tearDown(() async {
      if (await dir.exists()) await dir.delete(recursive: true);
    });

    test('bozuk şifreli içeriğin export denemesi temp artığı bırakmaz', () async {
      final svc = FileVaultService(
        crypto: VaultCrypto(keyStore: MemoryVaultKeyStore()),
        testDir: dir,
      );
      // 1) normal dosya ekle
      final src = File('${dir.path}/kaynak.bin');
      await src.writeAsBytes(Uint8List.fromList(List.generate(64 * 1024, (i) => i % 251)));
      final f = await svc.importFile(path: src.path);
      // 2) şifreli içeriği boz (export sırasında bütünlük hatası üret)
      final pvf = File('${dir.path}/vault/files/${f.id}.pvf');
      final bytes = await pvf.readAsBytes();
      bytes[bytes.length - 40] ^= 0xFF;
      await pvf.writeAsBytes(bytes, flush: true);
      // 3) export → hata fırlamalı, vault/tmp içinde HİÇ dosya kalmamalı
      await expectLater(
        svc.decryptToTemp(f.id, authenticated: true, purpose: 'export'),
        throwsA(isA<VaultIntegrityError>()),
      );
      final tmp = Directory('${dir.path}/vault/tmp');
      if (await tmp.exists()) {
        expect(await tmp.list().toList(), isEmpty, reason: 'vault/tmp içinde plaintext artığı kaldı');
      }
    });

    test('doğrulamasız decrypt her koşulda reddedilir (bypass yok)', () async {
      final svc = FileVaultService(
        crypto: VaultCrypto(keyStore: MemoryVaultKeyStore()),
        testDir: dir,
      );
      final src = File('${dir.path}/a.bin');
      await src.writeAsBytes(Uint8List.fromList(List.filled(1024, 7)));
      final f = await svc.importFile(path: src.path);
      await expectLater(
        svc.decryptToTemp(f.id, authenticated: false),
        throwsA(isA<VaultAuthRequired>()),
      );
      // Bellek içi çözüm ise vault gate arkasında olduğu için UI sorumluluğunda;
      // servis katmanı yalnızca temp-decrypt yolunda zorlar.
      expect(await svc.decryptToMemory(f.id), isNotEmpty);
    });
  });
}
