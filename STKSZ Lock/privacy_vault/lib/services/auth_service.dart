import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/constants.dart';
import '../core/hash_service.dart';
import 'security_log_service.dart';

enum AuthResult { ok, failed, lockedOut }

class AuthState {
  final int failedAttempts;
  final bool lockedOut;
  const AuthState({this.failedAttempts = 0, this.lockedOut = false});
  int get attemptsLeft => (K.maxAttempts - failedAttempts).clamp(0, K.maxAttempts);
}

/// Kimlik doğrulama & kayıt servisi.
/// - Sırların yalnızca PBKDF2 hash'i flutter_secure_storage içinde tutulur
///   (Android Keystore / iOS Keychain destekli şifreli depo).
/// - Biyometrik veri ASLA uygulamaya alınmaz; yalnızca OS API sonucu (true/false) kullanılır.
class AuthService extends StateNotifier<AuthState> {
  AuthService(this._ref) : super(const AuthState()) {
    _restored = _restore();
  }

  /// FAZ 12 — kalıcı deneme sayacının geri yüklendiğinin garantisi.
  /// Bu future tamamlanmadan yapılan doğrulama/deneme, restore edilmemiş
  /// (sıfır) sayaç üzerinden yazıp eski lockout'u silebilirdi; doğrulama
  /// yollarının tamamı önce bunu bekler. (madde 12: lockout persistence)
  late final Future<void> _restored;

  final Ref _ref;
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
  );
  final LocalAuthentication _bio = LocalAuthentication();

  SecurityLogService get _log => _ref.read(securityLogProvider.notifier);

  Future<void> _restore() async {
    final prefs = await SharedPreferences.getInstance();
    final failed = prefs.getInt(K.pFailedAttempts) ?? 0;
    state = AuthState(failedAttempts: failed, lockedOut: failed >= K.maxAttempts);
  }

  Future<void> _persistAttempts() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(K.pFailedAttempts, state.failedAttempts);
  }

  // ---------- Kayıt (enroll) ----------
  Future<void> _enroll(String hashKey, String saltKey, String secret) async {
    final salt = HashService.randomSalt();
    await _storage.write(key: saltKey, value: base64Encode(salt));
    await _storage.write(key: hashKey, value: HashService.hashB64(secret, salt));
  }

  Future<void> enrollPin(String pin) => _enroll(K.credPinHash, K.credPinSalt, pin);
  Future<void> enrollPassword(String pw) => _enroll(K.credPasswordHash, K.credPasswordSalt, pw);
  Future<void> enrollPattern(String pattern) => _enroll(K.credPatternHash, K.credPatternSalt, pattern);
  Future<void> enrollRecovery(String symbolSeq) => _enroll(K.recoveryHash, K.recoverySalt, symbolSeq);
  Future<void> enrollCalcTrigger(String trigger) => _enroll(K.pCalcTriggerHash, K.pCalcTriggerSalt, trigger);

  // ---------- FAZ 8: decoy başına tetikleyici ----------
  // 'calculator' geriye dönük uyumluluk için eski anahtarını kullanmaya devam eder.
  String _decoyHashKey(String kind) =>
      kind == 'calculator' ? K.pCalcTriggerHash : K.decoyTriggerHashKey(kind);
  String _decoySaltKey(String kind) =>
      kind == 'calculator' ? K.pCalcTriggerSalt : K.decoyTriggerSaltKey(kind);

  Future<void> enrollDecoyTrigger(String kind, String trigger) =>
      _enroll(_decoyHashKey(kind), _decoySaltKey(kind), trigger);

  Future<bool> hasDecoyTrigger(String kind) async =>
      await _storage.read(key: _decoyHashKey(kind)) != null;

  Future<bool> verifyDecoyTrigger(String kind, String trigger) =>
      _verifyOnly(_decoyHashKey(kind), _decoySaltKey(kind), trigger);

  Future<bool> hasPin() async => await _storage.read(key: K.credPinHash) != null;
  Future<bool> hasPassword() async => await _storage.read(key: K.credPasswordHash) != null;
  Future<bool> hasPattern() async => await _storage.read(key: K.credPatternHash) != null;
  Future<bool> hasRecovery() async => await _storage.read(key: K.recoveryHash) != null;
  Future<bool> hasCalcTrigger() async => await _storage.read(key: K.pCalcTriggerHash) != null;

  // ---------- Doğrulama ----------
  Future<bool> _verifyOnly(String hashKey, String saltKey, String secret) async {
    final hash = await _storage.read(key: hashKey);
    final salt = await _storage.read(key: saltKey);
    if (hash == null || salt == null) return false;
    return HashService.verify(secret, salt, hash);
  }

  Future<AuthResult> verifyPin(String pin) => _verify(K.credPinHash, K.credPinSalt, pin, 'pinWrong');
  Future<AuthResult> verifyPassword(String pw) => _verify(K.credPasswordHash, K.credPasswordSalt, pw, 'passwordWrong');
  Future<AuthResult> verifyPattern(String p) => _verify(K.credPatternHash, K.credPatternSalt, p, 'patternWrong');

  Future<AuthResult> _verify(String hashKey, String saltKey, String secret, String failType) async {
    await _restored; // FAZ 12: kalıcı sayaç/lockout okunmadan deneme yapılmaz
    if (state.lockedOut) return AuthResult.lockedOut;
    final ok = await _verifyOnly(hashKey, saltKey, secret);
    if (ok) {
      await _resetFailures();
      await _log.add('loginSuccess', failType == 'pinWrong' ? 'PIN' : failType == 'patternWrong' ? 'Desen' : 'Parola');
      return AuthResult.ok;
    }
    final failed = state.failedAttempts + 1;
    final locked = failed >= K.maxAttempts;
    state = AuthState(failedAttempts: failed, lockedOut: locked);
    await _persistAttempts();
    await _log.add(failType, '${K.maxAttempts - failed} hak kaldı');
    if (locked) await _log.add('lockout3', 'SECURITY LOCKED — yalnızca kurtarma sembolü');
    return locked ? AuthResult.lockedOut : AuthResult.failed;
  }

  Future<bool> verifyRecovery(String symbolSeq) async {
    await _restored; // FAZ 12
    final ok = await _verifyOnly(K.recoveryHash, K.recoverySalt, symbolSeq);
    if (ok) {
      await _resetFailures();
      await _log.add('recoveryUsed', 'Kurtarma sembolü ile kilit sıfırlandı');
    } else {
      await _log.add('recoveryFail', 'Hatalı kurtarma sembolü');
    }
    return ok;
  }

  Future<bool> verifyCalcTrigger(String trigger) =>
      _verifyOnly(K.pCalcTriggerHash, K.pCalcTriggerSalt, trigger);

  Future<void> _resetFailures() async {
    state = const AuthState();
    await _persistAttempts();
  }

  /// Ayarlardan değiştirirken eski kimliği doğrulama zorunluluğu için.
  Future<bool> verifyNoPenalty(String hashKey, String saltKey, String secret) =>
      _verifyOnly(hashKey, saltKey, secret);

  // ---------- Biyometrik (veri uygulamaya ALINMAZ) ----------
  Future<bool> biometricsAvailable() async {
    try {
      final canCheck = await _bio.canCheckBiometrics;
      final supported = await _bio.isDeviceSupported();
      final methods = await _bio.getAvailableBiometrics();
      return (canCheck || supported) && methods.isNotEmpty;
    } on PlatformException {
      return false;
    }
  }

  Future<bool> authenticateBiometric(String reason) async {
    try {
      final ok = await _bio.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(biometricOnly: true, stickyAuth: true, useErrorDialogs: true),
      );
      await _log.add(ok ? 'bioSuccess' : 'bioFail', '');
      return ok;
    } on PlatformException {
      await _log.add('bioFail', 'sistem hatası');
      return false;
    }
  }
}

final authProvider = StateNotifierProvider<AuthService, AuthState>((ref) => AuthService(ref));

/// Uygulama geçidi: true ise ana ekran görünür, false ise kilit ekranı.
final appUnlockedProvider = StateProvider<bool>((ref) => false);
