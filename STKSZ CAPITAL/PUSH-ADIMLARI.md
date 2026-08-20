# STKSZ — GitHub'a Push ve IPA İndirme Adımları (Windows)

Yerel git deposu hazır ve commit'li (`main` dalı, 390 dosya, temiz geçmiş).
Push için GitHub kimliğiniz gerekiyor — aşağıdaki 3 yoldan birini seçin.

---

## YOL A — stksz-repo.bundle ile (önerilen, en temiz)

`stksz-repo.bundle` dosyası commit geçmişi dahil tüm repoyu içerir.

```bat
:: 1. Boş bir klasörde bundle'ı klonla
git clone stksz-repo.bundle stksz
cd stksz

:: 2. GitHub'da BOŞ bir repo oluştur (README'siz), sonra:
git remote set-url origin https://github.com/KULLANICI_ADIN/REPO_ADIN.git
:: (origin yoksa: git remote add origin https://github.com/KULLANICI_ADIN/REPO_ADIN.git)

:: 3. Push (tarayıcıda GitHub girişi açılır)
git push -u origin main
```

## YOL B — stksz-github-repo.zip ile

```bat
:: Zip'i çıkar, içeriğin bulunduğu klasörde:
git init -b main
git add -A
git commit -m "STKSZ: Capacitor 6 + CI workflows"
git remote add origin https://github.com/KULLANICI_ADIN/REPO_ADIN.git
git push -u origin main
```

## YOL C — GitHub web arayüzü (git kurulu değilse)

1. Repo sayfası → **Add file → Upload files**
2. Zip'ten çıkan TÜM içeriği sürükleyin (`.github` klasörü dahil —
   görünmüyorsa Explorer'da "Gizli öğeler"i açın)
3. Commit'leyin.
> Not: Web upload bazen `.github` klasörünü atlar; workflow'lar
> tetiklenmezse `.github/workflows/*.yml` dosyalarını tek tek
> "Create new file" ile ekleyin.

---

## Push SONRASI — sizin kontrol listeniz

1. **Actions sekmesi** → şu üç workflow otomatik tetiklenir:
   - ✅ Build STKSZ unsigned IPA (~10-15 dk)
   - ✅ Build STKSZ Android APK (~5-10 dk)
   - ✅ Deploy STKSZ to GitHub Pages
     (Pages için önce: Settings → Pages → Source: **GitHub Actions**)

2. **IPA indirme:** Actions → "Build STKSZ unsigned IPA" → yeşil ✓ olan
   çalıştırma → sayfanın altında **Artifacts** → `STKSZ-unsigned-ipa`
   → tıklayınca zip iner, içinden `STKSZ-unsigned.ipa` çıkar.

3. **APK indirme:** Aynı şekilde → Artifacts → `STKSZ-debug-apk`.

4. **Web adresi:** Pages deploy bitince
   `https://KULLANICI_ADIN.github.io/REPO_ADIN/`

## Hata alırsanız

İlgili çalıştırmayı açın → kırmızı adıma tıklayın → log metnini
kopyalayıp Arena'ya yapıştırın; kesin teşhis konur.
