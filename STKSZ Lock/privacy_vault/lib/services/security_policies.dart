/// FAZ 10 — Saf (plugin'siz) güvenlik politikaları.
/// Bu dosya VM testlerinde çalışır: karar mantığı tek yerde, UI ve native bundan beslenir.
library;

import '../models/models.dart';

// ---------------------------------------------------------------------------
// Başlatıcı kimliği (Launcher identity)
// ---------------------------------------------------------------------------

class LauncherIdentity {
  final String id;

  /// Kullanıcıya görünen Türkçe ad (uygulamanın görünen adı).
  final String label;
  final DecoyKind decoy;

  const LauncherIdentity({required this.id, required this.label, required this.decoy});

  /// Android native activity-alias bileşen adı (MainActivity ile aynı uzlaşı).
  String get androidComponentSuffix =>
      id == 'default' ? 'MainActivity' : 'Alias${id[0].toUpperCase()}${id.substring(1)}';
}

/// Desteklenen kimlikler. Android'de manifest'teki activity-alias'larla,
/// iOS'ta alternatif simge yapılandırmasıyla (platform izin verdikçe) birebir.
const kLauncherIdentities = <LauncherIdentity>[
  LauncherIdentity(id: 'default', label: 'Privacy Vault', decoy: DecoyKind.none),
  LauncherIdentity(id: 'calculator', label: 'Hesap Makinesi', decoy: DecoyKind.calculator),
  LauncherIdentity(id: 'notes', label: 'Hızlı Notlar', decoy: DecoyKind.notes),
  LauncherIdentity(id: 'clock', label: 'Saat', decoy: DecoyKind.clock),
  LauncherIdentity(id: 'weather', label: 'Hava Durumu', decoy: DecoyKind.weather),
];

LauncherIdentity launcherIdentityFor(String? id) =>
    kLauncherIdentities.firstWhere((e) => e.id == id, orElse: () => kLauncherIdentities.first);

// ---------------------------------------------------------------------------
// Kasa doğrulama modu (tetikleyici SONRASI ikinci faktör)
// ---------------------------------------------------------------------------

enum VaultAuthMode { triggerOnly, pin, pattern, password, biometric, bioPin }

extension VaultAuthModeX on VaultAuthMode {
  String get tr => switch (this) {
        VaultAuthMode.triggerOnly => 'Yalnızca tetikleyici',
        VaultAuthMode.pin => 'Tetikleyici + PIN',
        VaultAuthMode.pattern => 'Tetikleyici + Desen',
        VaultAuthMode.password => 'Tetikleyici + Parola',
        VaultAuthMode.biometric => 'Tetikleyici + Biyometrik',
        VaultAuthMode.bioPin => 'Tetikleyici + Biyometrik + PIN',
      };

  static VaultAuthMode parse(String? s) =>
      VaultAuthMode.values.asNameMap()[s] ?? VaultAuthMode.bioPin;
}

/// Tetikleyici tek başına güvenlik faktörü olarak kullanılıyorsa kullanıcıya
/// AÇIK uyarı gösterilmesi şart (spec md.7): bu mod zayıftır.
bool vaultAuthNeedsWeakWarning(VaultAuthMode m) => m == VaultAuthMode.triggerOnly;

// ---------------------------------------------------------------------------
// Arka plan kilidi politikası
// ---------------------------------------------------------------------------

/// Uygulama arka plana/etkinliğini yitirdiğinde oturum düşürülmeli mi?
/// (Ayrıca LockGate'teki autoLockSec==0 kuralı da anında kilitler.)
bool shouldRelockOnBackground({required bool bgLockEnabled, required bool sessionUnlocked}) =>
    bgLockEnabled && sessionUnlocked;

// ---------------------------------------------------------------------------
// Tetikleyici "denemeye benziyor" sezgisi (log kirliliğini sınırlamak için)
// ---------------------------------------------------------------------------

/// Yalnız sembollerden oluşan, en az 3 karakterli girdileri "tetikleyici
/// formatında" sayar (ör: "!!!", "....", "▲▲▲'). Normal arama metinleri/hesap
/// sonuçları loglanmaz; hesap makinesi her "=" tuşunda denediği için orada
/// fail loglanMAZ (kirlilik + gerçek tetikleyicinin açığa çıkması önlenir).
bool isTriggerLike(String s) {
  final t = s.trim();
  if (t.length < 3 || t.length > 24) return false;
  return RegExp(r'^[^\p{L}\p{N}\s]+$', unicode: true).hasMatch(t);
}

/// FAZ 11 — Tetikleyici brute-force freni.
/// AYNI adayın art arda denenmesi en az [minGapMs] bekler (otomasyon kırılır);
/// FARKLI adaylar için kısıt yoktur — PBKDF2 (60k tur) maliyeti zaten doğal
/// hız sınırıdır ve normal decoy kullanımı (karakter karakter yazma) etkilenmez.
bool allowTriggerAttempt({
  required String candidate,
  required String? lastCandidate,
  required int? lastAttemptMs,
  required int nowMs,
  int minGapMs = 800,
}) {
  if (lastCandidate == null || lastAttemptMs == null) return true;
  if (candidate == lastCandidate && nowMs - lastAttemptMs < minGapMs) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Güvenlik günlüğü redaksiyonu
// ---------------------------------------------------------------------------

/// FAZ 10/12 — Uygulama başına EFEKTİF bildirim modu (saf politika).
/// Kural: uygulama "gizli" işaretliyse bu her zaman en güçlü moddur (hide);
/// aksi halde kullanıcının seçtiği seviye geçerlidir. UI (Flutter) ve native
/// NotificationGuardService'in beslendiği sync payload'ı bu tek kuraldan çıkar —
/// böylece iki tarafta sapma olmaz.
NotifMode effectiveNotifMode({required bool hidden, required NotifMode mode}) =>
    hidden ? NotifMode.hide : mode;

/// Log ayrıntısına asla sır karışmasın diye son savunma hattı:
///  - 3+ ardışık rakam (PIN benzeri) maskelenir,
///  - kurtarma sembolü karakterlerinden 2+ ardışık dizi maskelenir.
/// Gerçek tetikleyici/PIN/parola DEĞERİ hiçbir çağrıcıda log'lanmaz; bu katman
/// hataya karşı sigortadır.
String redactLogDetail(String s) {
  var out = s.replaceAll(RegExp(r'\d{3,}'), '•••');
  out = out.replaceAll(RegExp(r'[★✦◆●■▲✚◐]{2,}'), '•••');
  return out;
}
