# RUNBOOK — Derleme & Kurulum

## ⚠️ WORKSPACE HİJYENİ (bu sandbox için kural)

Sandbox ~128 MB / 10.000 dosya anlık görüntü limitine sahip.
**Derleme araç zinciri (Flutter SDK, Android SDK, JDK, .pub-cache, .gradle)
asla workspace'te kalıcı bırakılmamalı** — proje kaynağı (<5 MB) dışındaki
her şey geçicidir. Kurulduktan sonra iş bitiminde sil:

```bash
rm -rf /home/user/flutter /home/user/android-sdk /home/user/jdk17 \
       /home/user/.pub-cache /home/user/.gradle /home/user/.config \
       /home/user/privacy_vault/.dart_tool /home/user/privacy_vault/build
```

Tek komutla geri kurulum: `bash privacy_vault/scripts/setup_toolchain.sh`

---

## Yol A — Kendi bilgisayarında (önerilen)
```bash
# 1) Flutter 3.47+ kur: https://docs.flutter.dev/get-started/install
# 2) Android Studio kur (SDK + platform 34 otomatik gelir)
cd privacy_vault
flutter pub get
flutter analyze        # 0 sorun görmelisin
flutter test           # PBKDF2 vektör testleri geçmeli
flutter build apk --debug
# → build/app/outputs/flutter-apk/app-debug.apk
```

## Yol B — GitHub Actions (bilgisayarsız, ücretsiz)
1. `privacy_vault` klasörünü bir GitHub reposuna push et.
2. `.github/workflows/build.yml` hazır — Actions sekmesinden "Run workflow".
3. Bittiğinde **Artifacts → privacy-vault-debug-apk** indir ve telefona kur.

## Yol C — Bu sandbox'ta
```bash
bash privacy_vault/scripts/setup_toolchain.sh   # Flutter+JDK17+SDK indirir (~3 GB)
export PATH=/home/user/flutter/bin:/home/user/jdk17/bin:$PATH
export JAVA_HOME=/home/user/jdk17 ANDROID_HOME=/home/user/android-sdk
cd /home/user/privacy_vault && flutter build apk --debug
# İŞ BİTİNCE YUKARIDAKİ TEMİZLİK KOMUTUNU ÇALIŞTIR!
```
> Not: Sandbox 2 çekirdek/1.9 GB RAM - ilk derleme RAM sınırına takılabilir;
> bu bir kod sorunu değildir. Yol A/B çok daha hızlıdır.

## Android'de ilk çalıştırma
1. APK'yı kur → uygulamayı aç → onboarding: PIN + kurtarma sembolü oluştur.
2. Onboarding'deki izin ekranından **Erişilebilirlik** servisini aç
   (Ayarlar → Erişilebilirlik → Privacy Vault → Açık).
3. **Üzerine çizim** iznini ver (kilit örtüsü için).
4. "Kilitle" sekmesinden bir uygulama seç → switch aç → uygulamayı başlatıcıdan aç:
   native kilit ekranı gelmeli.

## iOS / AltStore
- macOS gerekir derleme için (veya Actions'daki macos job'u; o imzasız çıktı verir).
- AltStore ile test: Mac/PC'ye AltServer → iPhone'a AltStore → imzalı IPA'yı kur
  (ücretsiz Apple ID yeter; 7 günde bir yeniden imza).
- Face ID izni (`NSFaceIDUsageDescription`) ve recent-apps gizlilik katmanı hazır.
- App-lock (Screen Time) yalnızca Developer hesabı + FamilyControls onayı SONRASI
  aktive edilir → `ios/Runner/FamilyControlsManager.swift` içindeki adımları izle.

## FAZ 9 — dosya kasası notları (yeni plugin'ler!)
FAZ 9 ile 4 plugin eklendi: `photo_manager`, `file_picker`, `share_plus`, `video_player`.
İlk derlemeden önce MUTLAKA: `flutter pub get`.

- **Android izinleri (manifest'te hazır):** `READ_MEDIA_IMAGES/VIDEO` (API 33+),
  eski sürümler için `READ/WRITE_EXTERNAL_STORAGE` (sınırlandırılmış SDK'larla).
  Dosya seçici (SAF) ek izin istemez.
- **Galeri izni:** Uygulama ilk içe aktarımda sorar; reddedilirse içe aktarım
  sessizce yok sayılmaz, kullanıcı ayarla yönlendirilir.
- **Orijinali sil:** Android 11+ ve iOS'ta SİSTEM onay penceresi çıkar — kullanıcı
  onaylamazsa hiçbir şey silinmez. Beklenen davranış budur.
- **iOS:** `NSPhotoLibraryUsageDescription` Info.plist'te. CocoaPods gerekir:
  ilk iOS derlemesinde `cd ios && pod install`.
- **Çıktı temizliği:** APK/IPA üretildikten sonra `build/` dizinini workspace'ten sil.
