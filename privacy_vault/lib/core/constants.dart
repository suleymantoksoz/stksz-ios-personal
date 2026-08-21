/// Merkezi sabitler: storage anahtarları ve güvenlik parametreleri.
/// DİKKAT: Burada asla gerçek PIN/parola/sembol tutulmaz; yalnızca HASH anahtar adları.
class K {
  K._();

  /// Native (Android) MethodChannel adı.
  static const nativeChannel = 'privacy_vault/native';

  // --- flutter_secure_storage anahtarları (yalnızca PBKDF2 hash + salt saklanır) ---
  static const credPinHash = 'cred.pin.hash';
  static const credPinSalt = 'cred.pin.salt';
  static const credPasswordHash = 'cred.pass.hash';
  static const credPasswordSalt = 'cred.pass.salt';
  static const credPatternHash = 'cred.pattern.hash';
  static const credPatternSalt = 'cred.pattern.salt';
  static const recoveryHash = 'cred.recovery.hash';
  static const recoverySalt = 'cred.recovery.salt';
  static const vaultAesKey = 'vault.aes256.key'; // Gizli Kasa AES-256-GCM anahtarı

  // --- shared_preferences anahtarları (gizli olmayan yapılandırma) ---
  static const pOnboarded = 'setup.onboarded';
  static const pProtectionMap = 'protection.apps.v1';
  static const pFailedAttempts = 'lock.failed_attempts';
  static const pBiometricEntry = 'settings.biometric_entry';
  static const pMasterAlt = 'settings.master_alt'; // pin | password | pattern
  static const pAutoLockSec = 'settings.autolock_sec';
  static const pFlagSecure = 'settings.flag_secure';
  static const pStealthVault = 'settings.stealth_vault'; // Kasa = Hesap Makinesi
  static const pCalcTrigger = 'settings.calc_trigger'; // Hash'i güvenli depoda!
  static const pCalcTriggerHash = 'settings.calc_trigger.hash';
  static const pCalcTriggerSalt = 'settings.calc_trigger.salt';
  static const pNotifHide = 'settings.notif_hide'; // kilitli+gizli bildirimlerini kes
  static const pAccent = 'settings.accent'; // cyan | purple | green

  // --- FAZ 10: güvenlik sertleştirme + kimlik ---
  static const pVaultAuthMode = 'settings.vault_auth_mode'; // triggerOnly|pin|pattern|password|biometric|bioPin
  static const pBgLock = 'settings.bg_lock'; // arka plana geçince anında kilitle
  static const pLauncherIdentity = 'settings.launcher_identity'; // default|calculator|notes|clock|weather

  // --- FAZ 8: decoy seçimi + decoy başına tetikleyici (hash/salt anahtar adları) ---
  static const pDecoyKind = 'settings.decoy_kind'; // calculator | notes | clock | weather
  static String decoyTriggerHashKey(String kind) => 'decoy.trigger.$kind.hash';
  static String decoyTriggerSaltKey(String kind) => 'decoy.trigger.$kind.salt';

  // --- Güvenlik parametreleri ---
  static const kdfIterations = 60000; // PBKDF2-HMAC-SHA256 tur sayısı (native ile birebir aynı)
  static const pinLength = 6;
  static const maxAttempts = 3; // 3 hatalı giriş -> SECURITY LOCKED
  static const unlockGraceMs = 5 * 60 * 1000; // kilit ekranı başarılı açılış sonrası esame süresi
  static const maxSecurityEvents = 300;

  // --- FAZ 9: şifreli dosya kasası sınırları ---
  static const vaultFileChunkSize = 4 * 1024 * 1024; // akış şifreleme parça boyu (RAM üst sınırı)
  static const vaultFileMaxBytes = 3 * 1024 * 1024 * 1024; // tek dosya üst sınırı: 3 GiB
  static const vaultMemoryViewMaxBytes = 80 * 1024 * 1024; // bellek içi görüntüleme üst sınırı
  static const vaultThumbMaxSide = 360; // şifreli thumbnail piksel üst kenarı
  static const vaultTempMaxAgeMin = 15; // geçici plaintext artıklarının azami yaşı (dk)
  static const vaultFileNameMax = 120; // metadata'da saklanan adaş üst sınırı
}
