import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/constants.dart';
import '../core/theme.dart';
import 'native_bridge.dart';
import 'security_log_service.dart';
import 'security_policies.dart';

/// Basit tercihler (gizli OLMAYAN ayarlar): kimlik bilgisi HASH'leri burada tutulmaz.
class AppSettings extends StateNotifier<AppSettingsState> {
  AppSettings(this._ref) : super(const AppSettingsState()) {
    _load();
  }

  final Ref _ref;

  Future<void> _load() async {
    final p = await SharedPreferences.getInstance();
    state = AppSettingsState(
      onboarded: p.getBool(K.pOnboarded) ?? false,
      biometricEntry: p.getBool(K.pBiometricEntry) ?? false,
      autoLockSec: p.getInt(K.pAutoLockSec) ?? 0,
      flagSecure: p.getBool(K.pFlagSecure) ?? false,
      stealthVault: p.getBool(K.pStealthVault) ?? false,
      notifHide: p.getBool(K.pNotifHide) ?? false,
      accent: p.getString(K.pAccent) ?? 'cyan',
      masterAlt: p.getString(K.pMasterAlt) ?? 'pin',
      decoyKind: p.getString(K.pDecoyKind) ?? 'calculator',
      vaultAuthMode: p.getString(K.pVaultAuthMode) ?? 'bioPin',
      bgLock: p.getBool(K.pBgLock) ?? false,
      launcherIdentity: p.getString(K.pLauncherIdentity) ?? 'default',
    );
    // FAZ 12 — native pencere bayrağı (FLAG_SECURE) yalnızca çalışan activity'de
    // yaşar: process yeniden başlatıldığında (cold start, bellek baskısı, reboot)
    // sıfırlanır. Kalıcı tercih AÇIKSA bayrağı her başlangıçta yeniden uygula;
    // aksi halde Recent Apps/ekran kaydı koruması sessizce kaybolurdu. (madde 11)
    if (state.flagSecure) await NativeBridge.setFlagSecure(true);
  }

  Future<void> _set(Future<bool> Function(SharedPreferences) write) async {
    final p = await SharedPreferences.getInstance();
    await write(p);
  }

  Future<void> completeOnboarding() async {
    state = state.copyWith(onboarded: true);
    await _set((p) => p.setBool(K.pOnboarded, true));
  }

  Future<void> setBiometricEntry(bool v) async {
    state = state.copyWith(biometricEntry: v);
    await _set((p) => p.setBool(K.pBiometricEntry, v));
  }

  Future<void> setAutoLockSec(int v) async {
    state = state.copyWith(autoLockSec: v);
    await _set((p) => p.setInt(K.pAutoLockSec, v));
  }

  Future<void> setFlagSecure(bool v) async {
    state = state.copyWith(flagSecure: v);
    await _set((p) => p.setBool(K.pFlagSecure, v));
    await NativeBridge.setFlagSecure(v);
  }

  Future<void> setStealthVault(bool v) async {
    state = state.copyWith(stealthVault: v);
    await _set((p) => p.setBool(K.pStealthVault, v));
  }

  Future<void> setNotifHide(bool v) async {
    state = state.copyWith(notifHide: v);
    await _set((p) => p.setBool(K.pNotifHide, v));
  }

  Future<void> setAccent(String v) async {
    state = state.copyWith(accent: v);
    await _set((p) => p.setString(K.pAccent, v));
  }

  Future<void> setMasterAlt(String v) async {
    state = state.copyWith(masterAlt: v);
    await _set((p) => p.setString(K.pMasterAlt, v));
  }

  Future<void> setDecoyKind(String v) async {
    state = state.copyWith(decoyKind: v);
    await _set((p) => p.setString(K.pDecoyKind, v));
  }

  // --- FAZ 10 ---
  Future<void> setVaultAuthMode(String v) async {
    state = state.copyWith(vaultAuthMode: v);
    await _set((p) => p.setString(K.pVaultAuthMode, v));
  }

  Future<void> setBgLock(bool v) async {
    state = state.copyWith(bgLock: v);
    await _set((p) => p.setBool(K.pBgLock, v));
  }

  Future<void> setLauncherIdentity(String v) async {
    state = state.copyWith(launcherIdentity: v);
    await _set((p) => p.setString(K.pLauncherIdentity, v));
    final applied = await NativeBridge.setLauncherIdentity(v);
    if (applied) {
      await _ref.read(securityLogProvider.notifier).add('identityChanged', launcherIdentityFor(v).label);
    }
  }
}

class AppSettingsState {
  final bool onboarded;
  final bool biometricEntry;
  final int autoLockSec; // 0 = hemen
  final bool flagSecure;
  final bool stealthVault; // Gizli Kasa sekmesi hesap makinesi olarak açılır
  final bool notifHide;
  final String accent;
  final String masterAlt; // pin | password | pattern
  final String decoyKind; // calculator | notes | clock | weather
  // FAZ 10:
  final String vaultAuthMode; // triggerOnly|pin|pattern|password|biometric|bioPin
  final bool bgLock; // arka plana geçince anında kilitle
  final String launcherIdentity; // default|calculator|notes|clock|weather

  const AppSettingsState({
    this.onboarded = false,
    this.biometricEntry = false,
    this.autoLockSec = 0,
    this.flagSecure = false,
    this.stealthVault = false,
    this.notifHide = false,
    this.accent = 'cyan',
    this.masterAlt = 'pin',
    this.decoyKind = 'calculator',
    this.vaultAuthMode = 'bioPin',
    this.bgLock = false,
    this.launcherIdentity = 'default',
  });

  Color get accentColor => switch (accent) {
        'purple' => AppColors.purple,
        'green' => AppColors.green,
        _ => AppColors.cyan,
      };

  AppSettingsState copyWith({
    bool? onboarded,
    bool? biometricEntry,
    int? autoLockSec,
    bool? flagSecure,
    bool? stealthVault,
    bool? notifHide,
    String? accent,
    String? masterAlt,
    String? decoyKind,
    String? vaultAuthMode,
    bool? bgLock,
    String? launcherIdentity,
  }) =>
      AppSettingsState(
        onboarded: onboarded ?? this.onboarded,
        biometricEntry: biometricEntry ?? this.biometricEntry,
        autoLockSec: autoLockSec ?? this.autoLockSec,
        flagSecure: flagSecure ?? this.flagSecure,
        stealthVault: stealthVault ?? this.stealthVault,
        notifHide: notifHide ?? this.notifHide,
        accent: accent ?? this.accent,
        masterAlt: masterAlt ?? this.masterAlt,
        decoyKind: decoyKind ?? this.decoyKind,
        vaultAuthMode: vaultAuthMode ?? this.vaultAuthMode,
        bgLock: bgLock ?? this.bgLock,
        launcherIdentity: launcherIdentity ?? this.launcherIdentity,
      );
}

final settingsProvider = StateNotifierProvider<AppSettings, AppSettingsState>((ref) => AppSettings(ref));
