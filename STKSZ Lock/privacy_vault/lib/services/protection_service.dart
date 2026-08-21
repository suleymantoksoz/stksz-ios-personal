import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/constants.dart';
import '../models/models.dart';
import 'native_bridge.dart';
import 'security_log_service.dart';
import 'security_policies.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Korunan uygulamaların yapılandırması. Şifre/hash İÇERMEZ; gizli olmayan profil verisidir.
/// Her değişiklikte native kilit motoruna (Android Accessibility servisi) senkronlanır.
class ProtectionService extends StateNotifier<Map<String, ProtectedAppConfig>> {
  ProtectionService(this._ref) : super(const {}) {
    load();
  }

  final Ref _ref;
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
  );

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(K.pProtectionMap);
    if (raw == null) return;
    try {
      final list = ProtectedAppConfig.decodeList(raw);
      state = {for (final c in list) c.packageName: c};
    } catch (_) {}
  }

  Future<void> _persist() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(K.pProtectionMap, ProtectedAppConfig.encodeList(state.values.toList()));
    await syncNative();
  }

  /// Native tarafa yalnızca gerekli minimum veri gönderilir:
  /// kilitli paketler, yöntem eşleşmesi, hash'ler (PBKDF2), bildirim modu.
  Future<void> syncNative() async {
    final pinHash = await _storage.read(key: K.credPinHash);
    final pinSalt = await _storage.read(key: K.credPinSalt);
    final passHash = await _storage.read(key: K.credPasswordHash);
    final passSalt = await _storage.read(key: K.credPasswordSalt);
    final patternHash = await _storage.read(key: K.credPatternHash);
    final patternSalt = await _storage.read(key: K.credPatternSalt);
    final recHash = await _storage.read(key: K.recoveryHash);
    final recSalt = await _storage.read(key: K.recoverySalt);
    final calcHash = await _storage.read(key: K.pCalcTriggerHash);
    final calcSalt = await _storage.read(key: K.pCalcTriggerSalt);

    final locked = <String>[];
    final methods = <String, String>{};
    final decoys = <String, String>{};
    final notifHide = <String>[];
    final notifMask = <String>[];
    for (final c in state.values) {
      if (c.locked) {
        locked.add(c.packageName);
        methods[c.packageName] = c.method.name;
        decoys[c.packageName] = c.decoy.name;
        // FAZ 10/12: seviyeli bildirim politikası — tek saf kuraldan (security_policies)
        final mode = effectiveNotifMode(hidden: c.hidden, mode: c.notifMode);
        if (mode == NotifMode.hide) notifHide.add(c.packageName);
        if (mode == NotifMode.mask) notifMask.add(c.packageName);
      }
    }
    final prefs = await SharedPreferences.getInstance();
    await NativeBridge.syncLockState({
      'lockedPackages': locked,
      'methods': methods,
      'decoys': decoys,
      'notifHide': notifHide,
      'notifMask': notifMask,
      'pinHash': pinHash ?? '', 'pinSalt': pinSalt ?? '',
      'passHash': passHash ?? '', 'passSalt': passSalt ?? '',
      'patternHash': patternHash ?? '', 'patternSalt': patternSalt ?? '',
      'recHash': recHash ?? '', 'recSalt': recSalt ?? '',
      'calcTriggerHash': calcHash ?? '', 'calcTriggerSalt': calcSalt ?? '',
      'kdfIterations': K.kdfIterations,
      'maxAttempts': K.maxAttempts,
      'graceMs': K.unlockGraceMs,
      'notifHideEnabled': prefs.getBool(K.pNotifHide) ?? false,
    });
  }

  ProtectedAppConfig configFor(InstalledApp app) =>
      state[app.packageName] ?? ProtectedAppConfig(packageName: app.packageName, label: app.label);

  Future<void> upsert(ProtectedAppConfig cfg) async {
    state = {...state, cfg.packageName: cfg};
    await _persist();
  }

  Future<void> toggleLock(InstalledApp app, bool value) async {
    final cfg = configFor(app);
    cfg.locked = value;
    if (!value) cfg.hidden = false; // kilit kalkarsa gizlilik de kalkar
    await upsert(cfg);
    await _ref.read(securityLogProvider.notifier).add(value ? 'appLockEngaged' : 'appUnlock', app.label);
  }

  Future<void> lockAll(Iterable<InstalledApp> apps) async {
    final next = Map<String, ProtectedAppConfig>.from(state);
    for (final a in apps) {
      final cfg = next[a.packageName] ?? ProtectedAppConfig(packageName: a.packageName, label: a.label);
      cfg.locked = true;
      next[a.packageName] = cfg;
    }
    state = next;
    await _persist();
    await _ref.read(securityLogProvider.notifier).add('appLockEngaged', 'Tüm uygulamalar');
  }

  Future<void> unlockAll() async {
    final next = Map<String, ProtectedAppConfig>.from(state);
    for (final c in next.values) {
      c.locked = false;
      c.hidden = false;
    }
    state = next;
    await _persist();
    await _ref.read(securityLogProvider.notifier).add('appUnlock', 'Tüm kilitler kaldırıldı');
  }

  int get lockedCount => state.values.where((c) => c.locked).length;
  int get hiddenCount => state.values.where((c) => c.hidden && c.locked).length;
  bool get protectionActive => lockedCount > 0;
}

final protectionProvider =
    StateNotifierProvider<ProtectionService, Map<String, ProtectedAppConfig>>((ref) => ProtectionService(ref));

final deviceAppsProvider = FutureProvider<List<InstalledApp>>((ref) async {
  final apps = await NativeBridge.getInstalledApps();
  // Koruma motorumuzun kendisini kilitlemeyi engelle
  return apps.where((a) => !a.packageName.startsWith('com.privacyvault')).toList();
});
