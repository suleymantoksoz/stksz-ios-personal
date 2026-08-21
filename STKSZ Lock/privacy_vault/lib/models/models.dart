import 'dart:convert';
import 'dart:typed_data';

/// Her uygulama için bağımsız seçilebilen güvenlik yöntemi.
enum AuthMethod { pin, pattern, password, biometric, bioPin, bioPassword }

extension AuthMethodX on AuthMethod {
  String get tr => switch (this) {
        AuthMethod.pin => 'PIN',
        AuthMethod.pattern => 'Desen (Pattern)',
        AuthMethod.password => 'Parola',
        AuthMethod.biometric => 'Biyometrik',
        AuthMethod.bioPin => 'Biyometrik + PIN',
        AuthMethod.bioPassword => 'Biyometrik + Parola',
      };
  bool get usesBio => this == AuthMethod.biometric || this == AuthMethod.bioPin || this == AuthMethod.bioPassword;
}

/// Gizli kimlik (decoy) türleri.
/// FAZ 7: calculator → tam işlevsel. FAZ 8: notes/clock/weather → tam işlevsel.
enum DecoyKind { none, calculator, notes, clock, weather }

extension DecoyKindX on DecoyKind {
  String get tr => switch (this) {
        DecoyKind.none => 'Kimlik yok',
        DecoyKind.calculator => 'Hesap Makinesi',
        DecoyKind.notes => 'Not Defteri',
        DecoyKind.clock => 'Saat',
        DecoyKind.weather => 'Hava Durumu',
      };

  /// Tetikleyici depo anahtarı için tür adı.
  String get key => name;

  static DecoyKind parse(String? s) => DecoyKind.values.asNameMap()[s] ?? DecoyKind.none;
}

/// Cihazdan native kanalla gelen kurulu uygulama bilgisi.
class InstalledApp {
  final String packageName;
  final String label;
  final String category; // Sosyal, Mesajlaşma, Banka & Finans, Galeri & Fotoğraf, Sistem, Oyunlar, Diğer
  Uint8List? iconBytes; // lazy: getAppIcon ile doldurulur

  InstalledApp({required this.packageName, required this.label, required this.category, this.iconBytes});

  factory InstalledApp.fromMap(Map m) => InstalledApp(
        packageName: m['package'] as String,
        label: m['label'] as String? ?? m['package'] as String,
        category: m['category'] as String? ?? 'Diğer',
      );
}

/// FAZ 10 — Bildirim gizliliği seviyesi (uygulama başına).
enum NotifMode { normal, mask, hide }

extension NotifModeX on NotifMode {
  String get tr => switch (this) {
        NotifMode.normal => 'Normal göster',
        NotifMode.mask => 'İçeriği gizle',
        NotifMode.hide => 'Bildirimi gizle',
      };
  static NotifMode parse(String? s) => NotifMode.values.asNameMap()[s] ?? NotifMode.normal;

  /// FAZ 9 öncesi bool alanın geçişi: true → hide.
  static NotifMode fromLegacy(bool hide) => hide ? NotifMode.hide : NotifMode.normal;
}

/// Kullanıcının bir uygulama için seçtiği koruma profili.
class ProtectedAppConfig {
  final String packageName;
  final String label;
  bool locked;
  bool hidden;
  bool hideNotifications; // DEPRECATED (FAZ 10): geriye dönük okuma; → notifMode
  NotifMode notifMode;
  AuthMethod method;
  DecoyKind decoy;

  ProtectedAppConfig({
    required this.packageName,
    required this.label,
    this.locked = false,
    this.hidden = false,
    this.hideNotifications = false,
    this.notifMode = NotifMode.normal,
    this.method = AuthMethod.bioPin,
    this.decoy = DecoyKind.none,
  });

  Map<String, dynamic> toMap() => {
        'packageName': packageName,
        'label': label,
        'locked': locked,
        'hidden': hidden,
        'hideNotifications': notifMode != NotifMode.normal, // geriye dönük bayrak
        'notifMode': notifMode.name,
        'method': method.name,
        'decoy': decoy.name,
      };

  factory ProtectedAppConfig.fromMap(Map<String, dynamic> m) => ProtectedAppConfig(
        packageName: m['packageName'] as String,
        label: m['label'] as String? ?? '',
        locked: m['locked'] as bool? ?? false,
        hidden: m['hidden'] as bool? ?? false,
        hideNotifications: m['hideNotifications'] as bool? ?? false,
        notifMode: m.containsKey('notifMode')
            ? NotifModeX.parse(m['notifMode'] as String?)
            : NotifModeX.fromLegacy(m['hideNotifications'] as bool? ?? false),
        method: AuthMethod.values.asNameMap()[m['method']] ?? AuthMethod.bioPin,
        decoy: DecoyKind.values.asNameMap()[m['decoy']] ?? DecoyKind.none,
      );

  static String encodeList(List<ProtectedAppConfig> list) =>
      jsonEncode(list.map((e) => e.toMap()).toList());

  static List<ProtectedAppConfig> decodeList(String raw) =>
      (jsonDecode(raw) as List).map((e) => ProtectedAppConfig.fromMap(Map<String, dynamic>.from(e))).toList();
}

/// Güvenlik Merkezi olay kaydı.
class SecurityEvent {
  final DateTime at;
  final String type; // loginSuccess, pinWrong, patternWrong, passwordWrong, bioFail, bioSuccess,
                     // lockout3, recoveryUsed, recoveryFail, appUnlock, appUnlockFail, appLockEngaged
  final String detail;

  SecurityEvent({required this.at, required this.type, required this.detail});

  Map<String, dynamic> toMap() => {'at': at.toIso8601String(), 'type': type, 'detail': detail};

  factory SecurityEvent.fromMap(Map<String, dynamic> m) => SecurityEvent(
        at: DateTime.tryParse(m['at'] as String? ?? '') ?? DateTime.now(),
        type: m['type'] as String? ?? 'unknown',
        detail: m['detail'] as String? ?? '',
      );
}

/// FAZ 9 — şifreli dosya kasası kayıt türü.
enum VaultFileKind { photo, video, file }

extension VaultFileKindX on VaultFileKind {
  String get tr => switch (this) {
        VaultFileKind.photo => 'fotoğraf',
        VaultFileKind.video => 'video',
        VaultFileKind.file => 'dosya',
      };
  String get code => switch (this) {
        VaultFileKind.photo => 'p',
        VaultFileKind.video => 'v',
        VaultFileKind.file => 'f',
      };
  static VaultFileKind fromCode(String? c) => switch (c) {
        'p' => VaultFileKind.photo,
        'v' => VaultFileKind.video,
        _ => VaultFileKind.file,
      };
}

/// FAZ 9 — Şifreli dosya kasası indeks kaydı.
/// Diske yalnızca {id, createdAt, metaBlob} yazılır; gerçek dosya adı/MIME/boyut
/// metaBlob içinde AES-256-GCM ile şifrelidir. İçerik dosyası <id>.pvf adıyla
/// (rastgele kimlik — orijinal ad sızdırmaz) tutulur.
class VaultFileEntry {
  final String id;
  final DateTime createdAt;
  final String metaBlob; // base64(nonce + ciphertext + mac) — {n, m, k, s}

  VaultFileEntry({required this.id, required this.createdAt, required this.metaBlob});

  Map<String, dynamic> toMap() => {'id': id, 'createdAt': createdAt.toIso8601String(), 'blob': metaBlob};

  factory VaultFileEntry.fromMap(Map<String, dynamic> m) => VaultFileEntry(
        id: m['id'] as String,
        createdAt: DateTime.tryParse(m['createdAt'] as String? ?? '') ?? DateTime.now(),
        metaBlob: m['blob'] as String,
      );
}

/// Gizli Kasa kaydı (title + body tek blob olarak AES-256-GCM ile şifrelenir).
class VaultEntry {
  final String id;
  final DateTime createdAt;
  final String blob; // base64(nonce + ciphertext + mac)

  VaultEntry({required this.id, required this.createdAt, required this.blob});

  Map<String, dynamic> toMap() => {'id': id, 'createdAt': createdAt.toIso8601String(), 'blob': blob};

  factory VaultEntry.fromMap(Map<String, dynamic> m) => VaultEntry(
        id: m['id'] as String,
        createdAt: DateTime.tryParse(m['createdAt'] as String? ?? '') ?? DateTime.now(),
        blob: m['blob'] as String,
      );
}
