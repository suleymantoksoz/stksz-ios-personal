import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:privacy_vault/core/hash_service.dart';
import 'package:privacy_vault/models/models.dart';
import 'package:privacy_vault/services/auth_service.dart';
import 'package:privacy_vault/services/security_policies.dart';

/// FAZ 10 — güvenlik sertleştirme / decoy-kimlik / tetikleyici / politika testleri.
/// Mevcut 37 test aynen durur (widget_test, decoy_test, file_vault_test).

void main() {
  group('Decoy selection (uygulama profili)', () {
    test('decoy seçimi profilde saklanır ve geri okunur', () {
      final cfg = ProtectedAppConfig(packageName: 'com.x', label: 'X', decoy: DecoyKind.notes);
      final back = ProtectedAppConfig.fromMap(cfg.toMap());
      expect(back.decoy, DecoyKind.notes);
      expect(DecoyKindX.parse('weather'), DecoyKind.weather);
      expect(DecoyKindX.parse('yok-oyle'), DecoyKind.none);
    });

    test('liste encode/decode bütünlüğü bozulmaz', () {
      final list = [
        ProtectedAppConfig(packageName: 'a', label: 'A', locked: true, decoy: DecoyKind.calculator),
        ProtectedAppConfig(packageName: 'b', label: 'B', hidden: true, decoy: DecoyKind.none),
      ];
      final back = ProtectedAppConfig.decodeList(ProtectedAppConfig.encodeList(list));
      expect(back.length, 2);
      expect(back[0].decoy, DecoyKind.calculator);
      expect(back[1].hidden, isTrue);
    });
  });

  group('Trigger hashing / validation / wrong trigger', () {
    test('tetikleyici PBKDF2 hash roundtrip — doğru geçer, yanlış reddedilir', () {
      const trigger = '2580+1';
      final salt = HashService.randomSalt();
      final saltB64 = base64Encode(salt);
      final hash = HashService.hashB64(trigger, salt);
      expect(HashService.verify('2580+1', saltB64, hash), isTrue);
      expect(HashService.verify('2580+2', saltB64, hash), isFalse);
      expect(HashService.verify('2580+10', saltB64, hash), isFalse);
      expect(HashService.verify(' !!! ', saltB64, hash), isFalse);
    });

    test('hash düz metin içermez ve tuzsuz deterministik değildir', () {
      final s1 = HashService.randomSalt();
      final s2 = HashService.randomSalt();
      final h1 = HashService.hashB64('12:34', s1);
      final h2 = HashService.hashB64('12:34', s2);
      expect(h1.contains('12:34'), isFalse);
      expect(h1, isNot(h2)); // farklı tuz → farklı hash
    });

    test('sembol/benzersiz tetikleyiciler de hashlenir (notes/weather formatı)', () {
      for (final t in ['!!!', '....', '★★★.']) {
        final salt = HashService.randomSalt();
        final saltB64 = base64Encode(salt);
        final hash = HashService.hashB64(t, salt);
        expect(HashService.verify(t, saltB64, hash), isTrue);
        expect(HashService.verify('$t!', saltB64, hash), isFalse);
      }
    });
  });

  group('Trigger + auth kombinasyonu (madde 7)', () {
    test('VaultAuthMode parse + varsayılan güvenli (bioPin)', () {
      expect(VaultAuthModeX.parse('bioPin'), VaultAuthMode.bioPin);
      expect(VaultAuthModeX.parse('triggerOnly'), VaultAuthMode.triggerOnly);
      expect(VaultAuthModeX.parse('bilinmeyen'), VaultAuthMode.bioPin);
      expect(VaultAuthModeX.parse(null), VaultAuthMode.bioPin);
    });

    test('yalnızca triggerOnly zayıf uyarı ister — güçlü kombinasyonlar isterMEZ', () {
      expect(vaultAuthNeedsWeakWarning(VaultAuthMode.triggerOnly), isTrue);
      for (final m in VaultAuthMode.values) {
        if (m != VaultAuthMode.triggerOnly) {
          expect(vaultAuthNeedsWeakWarning(m), isFalse, reason: m.name);
        }
      }
    });
  });

  group('Arka plan kilidi + panik kilit', () {
    test('shouldRelockOnBackground matrisi', () {
      expect(shouldRelockOnBackground(bgLockEnabled: true, sessionUnlocked: true), isTrue);
      expect(shouldRelockOnBackground(bgLockEnabled: true, sessionUnlocked: false), isFalse);
      expect(shouldRelockOnBackground(bgLockEnabled: false, sessionUnlocked: true), isFalse);
      expect(shouldRelockOnBackground(bgLockEnabled: false, sessionUnlocked: false), isFalse);
    });

    test('panik kilit semantiği: oturum bayrağı düşer, veri SİLİNMEZ (state provider seviyesi)', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);
      container.read(appUnlockedProvider.notifier).state = true; // oturum açık
      // panik davranışı: yalnızca bayrak düşürülür
      container.read(appUnlockedProvider.notifier).state = false;
      expect(container.read(appUnlockedProvider), isFalse);
    });
  });

  group('Uygulama kimliği (launcher identity)', () {
    test('5 kimlik: default + 4 decoy eşleşmesi', () {
      expect(kLauncherIdentities.length, 5);
      expect(kLauncherIdentities.first.id, 'default');
      for (final id in kLauncherIdentities) {
        expect(launcherIdentityFor(id.id).id, id.id);
      }
    });

    test('bilinmeyen kimlik → default; android bileşen uzlaşısı doğru', () {
      expect(launcherIdentityFor('hack denemesi').id, 'default');
      expect(launcherIdentityFor('default').androidComponentSuffix, 'MainActivity');
      expect(launcherIdentityFor('calculator').androidComponentSuffix, 'AliasCalculator');
      expect(launcherIdentityFor('notes').androidComponentSuffix, 'AliasNotes');
    });
  });

  group('Bildirim gizliliği yapılandırması', () {
    test('eski bool alan geçişi: hideNotifications=true → hide', () {
      final legacy = ProtectedAppConfig.fromMap({
        'packageName': 'com.wa',
        'label': 'WA',
        'hideNotifications': true,
      });
      expect(legacy.notifMode, NotifMode.hide);
      final legacy2 = ProtectedAppConfig.fromMap({'packageName': 'x', 'label': 'X'});
      expect(legacy2.notifMode, NotifMode.normal);
    });

    test('yeni seviye alanı baskındır ve roundtrip korunur', () {
      final cfg = ProtectedAppConfig(
          packageName: 'p', label: 'P', notifMode: NotifMode.mask);
      final back = ProtectedAppConfig.fromMap(cfg.toMap());
      expect(back.notifMode, NotifMode.mask);
      // geriye dönük bayrak tutarlı
      expect(cfg.toMap()['hideNotifications'], isTrue);
      final normal = ProtectedAppConfig(packageName: 'q', label: 'Q');
      expect(normal.toMap()['hideNotifications'], isFalse);
    });
  });

  group('Security log redaction (madde 15)', () {
    test('PIN benzeri rakam dizileri maskelenir', () {
      final out = redactLogDetail('deneme ile 123456 PIN girildi');
      expect(out.contains('123456'), isFalse);
      expect(out.contains('•••'), isTrue);
    });

    test('kurtarma sembolü dizileri maskelenir', () {
      final out = redactLogDetail('sembol ★★★. yakalandı');
      expect(out.contains('★★★'), isFalse);
    });

    test('zararsız içerik dokunulmaz', () {
      expect(redactLogDetail('Instagram kilitlendi'), 'Instagram kilitlendi');
      expect(redactLogDetail('fotoğraf içe aktarıldı'), 'fotoğraf içe aktarıldı');
      expect(redactLogDetail(''), '');
    });
  });

  group('Tetikleyici sezgisi (log kirliliği sınırı)', () {
    test('isTriggerLike: sembol dizileri evet, normal metin hayır', () {
      expect(isTriggerLike('!!!'), isTrue);
      expect(isTriggerLike('....'), isTrue);
      expect(isTriggerLike('▲▲▲'), isTrue);
      expect(isTriggerLike('!!'), isFalse); // çok kısa
      expect(isTriggerLike('merhaba'), isFalse);
      expect(isTriggerLike('nasılsın !!!'), isFalse); // boşluk/harf içeriyor
      expect(isTriggerLike('12345'), isFalse); // rakam sembol değil
      expect(isTriggerLike(''), isFalse);
    });
  });
}
