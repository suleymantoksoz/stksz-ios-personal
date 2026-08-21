# 🛡 PRIVACY VAULT

Android + iOS için gerçek çalışan **Privacy Vault / App Lock / Gizli Kasa** uygulaması.
Tek kod tabanı (Flutter 3.47) + platform başına gerçek native modüller (Kotlin / Swift).
Mock yok, sahte vaat yok — her özellik işletim sisteminin izin verdiği en güçlü resmi API ile uygulanır.

---

## 1. Mimari

```
┌────────────────────────────────────────────────────────────┐
│ FLUTTER (ortak UI + iş mantığı)                            │
│  lib/                                                      │
│   ├─ core/        sabitler, PBKDF2 hash servisi, tema       │
│   ├─ models/      ProtectedAppConfig, SecurityEvent, Vault  │
│   ├─ services/    auth, protection, vault (AES-256-GCM),   │
│   │               security log, settings, native bridge     │
│   └─ ui/          onboarding, lock gate, dashboard/apps,    │
│                   vault, decoy/calculator, security center, │
│                   settings                                  │
├────────────── MethodChannel: "privacy_vault/native" ────────┤
│ ANDROID (Kotlin)                      iOS (Swift)          │
│  MainActivity · LockPrefs · HashUtil   AppDelegate          │
│  LockAccessibilityService (motor)      (privacy overlay)    │
│  LockOverlayActivity (native kilit UI) LocalAuthentication  │
│  NotificationGuardService              Keychain (plugin)    │
└────────────────────────────────────────────────────────────┘
```

**Veri sınırlaması:** Native kilit ekranı bağımsız çalışır; Flutter'a yalnızca
PBKDF2 **hash + salt** senkronlanır. Düz metin PIN/parola/sembol/tetikleyici
**hiçbir zaman** diske yazılmaz, loglanmaz, native'e gönderilmez.

## 2. Güvenlik tasarımı

| Sır | Saklama | Not |
|---|---|---|
| PIN / Parola / Desen | PBKDF2-HMAC-SHA256 (60k tur) hash + rastgele salt | `flutter_secure_storage` → Android Keystore / iOS Keychain |
| Kurtarma sembolü | Aynı şekilde hash | 3 hatalı girişte tek açma yolu |
| Hesap makinesi tetikleyicisi | Aynı şekilde hash | UI'da asla gösterilmez |
| Gizli Kasa içeriği | AES-256-GCM (authenticated encryption) | Anahtar secure storage'da |
| Kasa dosyaları (FAZ 9) | Aynı TEK anahtar + **PVF1 akış formatı**: 4 MiB'lık parçalar, her parçaya ayrı nonce + AAD(parça no, son-bayrağı) ile AES-256-GCM | RAM asla dosya boyuna çıkmaz; sıralama değişikliği/kısaltma MAC hatasıyla reddedilir; dosya adı/MIME/boyut bile şifreli metadata'dadır; içerik `<id>.pvf`, thumbnail `<id>.pvt` (şifreli) |
| Geçici plaintext (FAZ 9) | Yalnızca uygulama-içi `vault/tmp` (video oynatma/dışa aktarım) | Ekran kapanışında silinir + 15 dk yaş budaması |
| Biyometrik | **Uygulamaya hiç gelmez** | Android `BiometricPrompt` / iOS `LocalAuthentication` |
| Güvenlik günlüğü | Halka tampon, 300 kayıt | Kullanıcı temizleyebilir; gerçek dosya adları ASLA loglanmaz |

Dart ve Kotlin tarafındaki PBKDF2 implementasyonları birim testinde
RFC bilinen vektörüyle doğrulanır (iki taraf birebir aynı hash'i üretir →
native kilit ekranı Flutter'ın ürettiği hash'i doğrulayabilir).

## 3. Platform gerçekleri (dürüst matris)

| Özellik | Android | iOS |
|---|---|---|
| Uygulama listesi + ikonlar | ✅ PackageManager | ❌ Apple API'si yok |
| Başka uygulamayı kilitleme | ✅ AccessibilityService + overlay + native kilit ekranı | ⚠️ Ancak Screen Time / `FamilyControls` yetkisiyle (aşağıya bak) |
| Biyometrik kilit | ✅ BiometricPrompt | ✅ Face ID / Touch ID |
| 3 hatalı giriş + kurtarma sembolü | ✅ (native + Flutter) | ✅ (Flutter) |
| Gizli Kasa (AES-256-GCM) | ✅ | ✅ |
| Hesap makinesi decoy + tetikleyici | ✅ | ✅ |
| Bildirim engelleme (gizli uygulamalar) | ✅ NotificationListenerService (kullanıcı izinli) | ❌ Apple başka uygulamaların bildirimlerine dokundurmaz |
| Uygulamanın KENDİ recent apps içeriğini gizleme | ✅ `FLAG_SECURE` | ✅ privacy overlay (AppDelegate.swift) |
| Başka uygulamanın recent apps önizlemesi | ❌ Sistem izin vermez | ❌ Sistem izin vermez |
| Uygulamayı başlatıcıdan tamamen gizleme | ⚠️ Yalnızca cihaz sahipliği (Android Enterprise kiosk) — tüketici kapsamı dışı | ❌ |

> **Kural (spec md.23):** İmkânsız olan, imkânsızdır. UI ve README bunu açıkça söyler;
> sahte switch/ekran koymayız.

## 4. iOS tarafı ve App Lock durumu — ÖNEMLİ

iOS'ta "başka uygulamayı kilitleme" için tek resmi yol **Screen Time API'si**
(`FamilyControls` + `ManagedSettings` + `DeviceActivity` framework'leri, iOS 16+).
Bunun için:

1. **Apple Developer hesabı** (99$/yıl)
2. Apple'a **Family Controls entitlement başvurusu** ve onayı

**AltStore ile test:** AltStore ücretsiz Apple ID ile imzalar; vault, hesap makinesi
decoy'u, biyometrik, AES kasa, gizlilik katmanı gibi iOS'ta desteklenen TÜM
özellikler çalışır. Sadece Screen Time entitlement'ı ücretsiz imzalamada
kullanılamaz. Mac'in yoksa GitHub Actions (macos runner) veya Codemagic ile
derleyip AltStore'a kurabilirsin.

Yol haritası kodu: `ios/Runner/FamilyControlsManager.swift` (etkinleştirme adımları içeride).

## 5. Derleme

```bash
# Gereksinimler: Flutter 3.47+, Android platform 34, JDK 17 (Gradle için)
flutter pub get
flutter analyze        # 0 sorun
flutter test           # PBKDF2 vektör testleri

# Android
flutter build apk --debug
# İmzalı sürüm için: keytool ile keystore üret → android/key.properties → flutter build apk --release

# iOS (macOS gerekir)
cd ios && pod install && cd ..
flutter build ipa       # veya Xcode'da Archive
```

APK, `build/app/outputs/flutter-apk/app-debug.apk` altında oluşur.
Ayrıntılar: `RUNBOOK.md` · Bulut derleme: `.github/workflows/build.yml`

## 6. İlk kurulum akışı (gerçekleştirilen)

Uygulama açılır → Karşılama → 6 haneli PIN (2 kez) → isteğe bağlı biyometrik
→ kurtarma sembolü (≥3 sembol, 2 kez) → Android izinleri (erişilebilirlik,
overlay, bildirim) → korunacak uygulamaları seç → bitti.
Sonraki açılışlarda kilit ekranı; 3 yanlış denemede `SECURITY LOCKED` →
yalnızca kurtarma sembolü.

## 7. Faz durumu

| Faz | İçerik | Durum |
|---|---|---|
| 1 | UI, navigasyon, uygulama listesi, yerel güvenlik | ✅ |
| 2 | PIN + Desen + Parola + Biyometrik (her uygulamaya ayrı) | ✅ |
| 3 | 3 hatalı giriş + kurtarma sembolü (Flutter + native) | ✅ |
| 4 | Android app-lock motoru (Accessibility + overlay + native ekran) | ✅ |
| 5 | Gizle + bildirim engelleme + `FLAG_SECURE` / iOS privacy overlay | ✅ |
| 6–7 | Decoy kimliği + tam işlevsel Hesap Makinesi + tetikleyici | ✅ |
| 8 | Not Defteri / Saat / Hava Durumu decoy'ları + decoy başına tetikleyici + DecoyEngine | ✅ |
| 9 | Secure File Vault: foto/video/PDF/belge/ZIP içe aktarım, PVF1 chunk şifreleme, galeri sekmeleri, şifreli thumbnail, arama, auth'lu dışa aktarım, kontrollü orijinal silme | ✅ |
| 10 | Güvenlik sertleştirme: başlatıcı kimliği (Android activity-alias), native hesap makinesi örtüsü, seviyeli bildirim gizliliği, arka plan kilidi, panik kilit, Device Admin (opsiyonel), tetikleyici+2FA seviyeleri, log redaksiyonu | ✅ |

## 7.2 FAZ 10 — Güvenlik sertleştirme ayrıntıları

- **Başlatıcı kimliği (Android):** resmi `activity-alias` mekanizması — uygulama simgesi ve adı
  "Hesap Makinesi / Hızlı Notlar / Saat / Hava Durumu" olabilir. Sahte ikon üretimi YOK; alias'lar
  manifest'te sabittir. Bazı başlatıcılar simge önbelleği tutar (OS davranışı; yeniden başlatma gerekebilir).
  **iOS:** yalnızca alternatif SİMGE (`setAlternateIconName`); uygulama adı Apple politikası
  gereği değişmez — UI bunu açıkça söyler, mock başarı göstermez.
- **Native hesap makinesi örtüsü:** per-app decoy = calculator seçiliyse, kilitli uygulama açıldığında
  önce **gerçek çalışan** Kotlin hesap makinesi gelir; gizli tetikleyici (PBKDF2 hash, Flutter ile
  birebir normalize) "=" anında doğrulanır → kilit ekranı. Yanlışsa ifade normal hesaplanır.
- **Tetikleyici + ikinci faktör:** gizli açılış sonrası doğrulama seviyesi seçilebilir
  (PIN / Desen / Parola / Biyometrik / Bio+PIN). "Yalnızca tetikleyici" modu ZAYIF olarak kırmızı
  uyarıyla gösterilir. Tetikleyici PIN/parola gibi yalnızca PBKDF2 hash saklanır; log/analytics/crash
  kanallarına asla düz yazılmaz; güvenlik günlüğünde ek redaksiyon katmanı (`redactLogDetail`) vardır.
- **Seviyeli bildirim gizliliği:** uygulama başına `Normal / İçeriği gizle / Bildirimi gizle`.
  Maskeleme: bildirim kaldırılır + sessiz (IMPORTANCE_LOW) yer tutucu bırakılır; ses/titreşim
  Android kanal ayarındandır. Yalnız kullanıcının verdiği NotificationListener izniyle.
- **Arka plan kilidi:** "Arka plana geçince kilitle" açıksa oturum paused'ta anında düşer.
- **Panik kilit:** tek dokunuş (Güvenlik Merkezi ⚡ / Ayarlar > KORUMA) — tüm oturumlar sonlanır,
  veri silinmez.
- **Device Admin (opsiyonel, yalnız Android):** resmi, kullanıcı onaylı, geri alınabilir; ek politika
  talebi yoktur — admin varlığı kaldırmayı bloke eder. iOS desteklemez.

## 7.1 FAZ 9 — Secure File Vault ayrıntıları

- **İçe aktarım:** Galeri (`photo_manager`: albümler, çoklu seçim, sistem onaylı kontrollü orijinal silme) veya dosya seçici (`file_picker`: PDF/TXT/DOC/XLSX/ZIP ve bilinmeyen türler generic binary olarak). Hiçbir ağ/sunucu — tamamen **OFFLINE, local-first**.
- **RAM güvenliği:** şifreleme 4 MiB parçalarla akış halinde; 100 MB / 500 MB / 1 GB+ dosyalarda bellek profili sabit kalır. Yarıda kesilen şifrelemede `.tmp` artıkları silinir, indekse yarım kayıt düşmez, yetim dosyalar her kasa açılışında budanır.
- **Kasa girişi:** Mevcut tek doğrulama sistemi (PIN/Desen/Parola/Biyometrik + 3-hak lockout + recovery). Dışa aktarım ayrıca işlem bazında doğrulama ister (`QuickAuthDialog`) — servis katmanı doğrulamasız çözümü reddeder.
- **Dışa aktarım:** auth → parça akışlı decrypt → `share_plus` paylaşım menüsü (hedefi kullanıcı seçer) → geçici plaintext hemen silinir.
- **Video oynatma (dürüst not):** OS oynatıcıları şifreli akışı doğrudan okuyamaz; içerik uygulama-içi geçici alana çözülüp oradan oynatılır ve kapanışta silinir. "İz bırakmaz" diye pazarlanmaz.
- **Silme gerçeği (dürüst):** içerik/thumbnail/metadata/geçici kopya silinir; ancak flash/SSD'de fiziksel üzerine yazma OS düzeyinde garanti edilemez — silinen veri anahtar olmadan okunamaz. Bu not silme onayında kullanıcıya gösterilir.
- **Screenshot/recents:** Kasa ekranları mevcut global `FLAG_SECURE` (Android) ve iOS privacy overlay kapsamındadır. iOS'ta ekran görüntüsü sistem düzeyinde engellenemez — uygulama bunu engellediğini İDDİA ETMEZ.

## 8. Play Store notu

`QUERY_ALL_PACKAGES` izni Play'de "core functionality" gerekçesi ister
(app-lock uygulamaları için geçerli bir gerekçedir; form doldurulur).
Sideloading/direkt APK kurulumunda kısıt yoktur.
