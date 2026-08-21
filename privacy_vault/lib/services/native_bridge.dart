import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../core/constants.dart';
import '../models/models.dart';

/// Android/iOS native katmanıyla tek noktadan iletişim.
/// iOS'ta uygulanamayan çağrılar güvenli varsayılanlara düşer (platform sınırı).
///
/// FAZ 12 sertleştirmesi (md.3): kanal yok (MissingPluginException), platform
/// hatası (PlatformException) veya YANLIŞ TİP yük gelmesi durumlarında köprü
/// asla fırlatmaz; dürüst ve güvenli varsayılan döner (boş liste / false /
/// null / no-op). Native çağrı başarısızlığı uygulamayı çökertmez.
class NativeBridge {
  NativeBridge._();
  static const _ch = MethodChannel(K.nativeChannel);

  /// Test kancası: yalnızca birim testleri platform koşulunu zorlamak için kullanır.
  /// Üretimde null'dır; gerçek platform kullanılır.
  @visibleForTesting
  static bool? debugIsAndroid;

  static bool get isAndroid => debugIsAndroid ?? Platform.isAndroid;

  /// invokeMethod çevresinde ortak güvenlik ağı: PlatformException VEYA
  /// MissingPluginException durumunda [fallback] döner. Yanlış tipli yükler
  /// çağrı noktasında `is` kontrolüyle elenir (cast yok → _CastError yok).
  static Future<T> _guard<T>(Future<T> Function() call, T fallback) async {
    try {
      return await call();
    } on PlatformException {
      return fallback;
    } on MissingPluginException {
      return fallback;
    }
  }

  /// Cihazdaki başlatılabilir uygulamalar (yalnızca Android; iOS'ta API yoktur).
  static Future<List<InstalledApp>> getInstalledApps() async {
    if (!isAndroid) return const [];
    final raw = await _guard(() => _ch.invokeMethod<List<dynamic>>('getInstalledApps'), null);
    if (raw == null) return const [];
    final apps = raw
        .whereType<Map>() // bozuk elemanlar elenir
        .map((e) {
          try {
            return InstalledApp.fromMap(Map<dynamic, dynamic>.from(e));
          } catch (_) {
            return null; // eksik alanlı eleman: atla, listeyi bozma
          }
        })
        .nonNulls
        .toList()
      ..sort((a, b) => a.label.toLowerCase().compareTo(b.label.toLowerCase()));
    return apps;
  }

  static Future<Uint8List?> getAppIcon(String packageName) async {
    if (!isAndroid) return null;
    return _guard(() async {
      final v = await _ch.invokeMethod('getAppIcon', {'package': packageName});
      return v is Uint8List ? v : null;
    }, null);
  }

  /// Tüm kilit yapılandırmasını native tarafla senkronlar.
  /// Hash'ler PBKDF2 — native taraf doğrulamayı kendi başına yapar. Düz metin asla gitmez.
  static Future<void> syncLockState(Map<String, dynamic> payload) async {
    if (!isAndroid) return;
    await _guard(() async {
      await _ch.invokeMethod('syncLockState', payload);
      return true;
    }, false);
  }

  static Future<void> setFlagSecure(bool enabled) async {
    if (!isAndroid) return;
    await _guard(() async {
      await _ch.invokeMethod('setFlagSecure', {'enabled': enabled});
      return true;
    }, false);
  }

  static Future<bool> _boolCall(String method) async {
    if (!isAndroid) return false;
    return _guard(() async {
      final v = await _ch.invokeMethod(method);
      return v is bool ? v : false; // yanlış tip → güvenli false (md.3)
    }, false);
  }

  static Future<bool> isAccessibilityEnabled() => _boolCall('isAccessibilityEnabled');
  static Future<bool> canDrawOverlays() => _boolCall('canDrawOverlays');
  static Future<bool> isNotificationListenerEnabled() => _boolCall('isNotificationListenerEnabled');
  static Future<bool> isDeviceAdminActive() => _boolCall('isDeviceAdminActive');

  static Future<void> openAccessibilitySettings() => _intent('openAccessibilitySettings');
  static Future<void> openOverlaySettings() => _intent('openOverlaySettings');
  static Future<void> openNotificationListenerSettings() => _intent('openNotificationListenerSettings');
  static Future<void> openAppNotificationSettings(String pkg) =>
      _intent('openAppNotificationSettings', {'package': pkg});

  // ---------- FAZ 10: başlatıcı kimliği + cihaz koruması ----------

  /// Android: activity-alias ile başlatıcı simgesi/etiketi değişimi (resmi API).
  /// iOS: UIApplication.setAlternateIconName — yalnızca alternatif simge
  /// build'e yapılandırılmışsa başarılı döner (isim iOS'ta değişmez).
  /// Dönen: kimlik fiilen uygulandıysa true; her hata/eksik yapılandırmada
  /// dürüstçe false (mock başarı YOK).
  static Future<bool> setLauncherIdentity(String id) => _guard(() async {
        final v = await _ch.invokeMethod('setLauncherIdentity', {'id': id});
        return v is bool ? v : false;
      }, false);

  static Future<void> requestDeviceAdmin() => _intent('requestDeviceAdmin');
  static Future<void> removeDeviceAdmin() => _intent('removeDeviceAdmin');

  /// Native kilit ekranında biriken güvenlik olaylarını çeker (ve native kuyruğu boşaltır).
  static Future<List<Map<String, dynamic>>> drainNativeEvents() async {
    if (!isAndroid) return const [];
    final raw = await _guard(() => _ch.invokeMethod<List<dynamic>>('drainNativeEvents'), null);
    if (raw == null) return const [];
    return raw
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList(growable: false);
  }

  static Future<void> _intent(String method, [Map<String, dynamic>? args]) async {
    if (!isAndroid) return;
    await _guard(() async {
      await _ch.invokeMethod(method, args);
      return true;
    }, false);
  }
}
