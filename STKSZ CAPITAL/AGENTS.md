# STKSZ CAPITAL — Geliştirme Kuralları

## Proje mimarisi
- Uygulama Capacitor 6 tabanlıdır: `www/` web/PWA kaynakları, `android/` Android Studio projesi, `ios/` Xcode projesidir.
- Ön yüz vanilla HTML, CSS ve JavaScript kullanır. Yeni framework, bundler veya mimari katman eklemeyin; açıkça istenmedikçe mevcut yapıyı koruyun.
- `www/index.html`, `www/style.css` ve modüler JavaScript dosyaları uygulamanın ana kaynaklarıdır.
- `server/stksz-ai-server.js` bağımsız Node.js backend’idir; gereksiz bağımlılık eklemeyin.
- Kullanıcı verileri ve API anahtarları local-first yaklaşımına göre ele alınır. Gizli anahtarları koda, loglara, Git’e veya istemciye gömmeyin.

## Çalışma biçimi
- Her değişiklikten önce ilgili dosyaları, çağrı noktalarını ve mevcut davranışı inceleyin.
- İsteği karşılayan en küçük, hedefli değişikliği yapın.
- Gereksiz dosya, geçici çıktı, alternatif mimari veya kullanılmayan bağımlılık oluşturmayın.
- Mevcut çalışan özellikleri, platform eşliğini ve kullanıcı verisi uyumluluğunu koruyun.
- Dokümantasyon ile gerçek yapılandırma çelişirse, değişiklik yapmadan önce gerçek kaynak ve yapılandırmayı esas alın; tutarsızlığı sonuçta belirtin.

## Doğrulama
- Her değişiklikten sonra ilgili testleri çalıştırın.
- Testler bağımsız olarak `node tests/<dosya>.test.js` komutuyla çalışır; kapsamlı değişikliklerde uygun test grubunu çalıştırın.
- Web kaynakları veya native köprü değiştiğinde, mümkün olduğunda `npm run sync:android` ve/veya `npm run sync:ios` ile platform senkronunu doğrulayın.
- Android değişikliklerinde ilgili Gradle derleme kontrolünü, iOS değişikliklerinde mevcut ortam izin veriyorsa Xcode/Pods kontrolünü uygulayın.
- Bir hata oluşursa önce nedeni analiz edin, güvenli düzeltmeyi uygulayın ve doğrulamayı yeniden çalıştırın.
- Çalıştırılamayan bir kontrol varsa, nedeni ve etkisini açıkça raporlayın.

## Güvenlik ve veri
- Gerçek para/emir özelliklerinin güvenlik kilitlerini gevşetmeyin.
- API anahtarı, token, kişisel veri ve senkron verisini test çıktısına veya loglara yazmayın.
- Veritabanı, localStorage veri şeması veya senkron protokolünü geriye dönük uyumluluk değerlendirmeden değiştirmeyin.

## Onay gerektiren işlemler
Aşağıdaki işlemler öncesinde kullanıcı onayı alın:
- Git commit veya GitHub’a push.
- Dosya ya da klasör silme.
- Geri dönüşü zor veri dönüşümü, veri temizliği veya kalıcı kullanıcı verisini değiştirme.
- Büyük mimari değişiklik, framework/büyük bağımlılık değişimi veya platform yapılandırmasının köklü değiştirilmesi.
- Üçüncü taraf servislere gerçek veri gönderen, ücret doğurabilecek veya üretim ortamını etkileyebilecek işlemler.

## Teslim
- Sonuçta değişen dosyaları, doğrulama komutlarını ve sonuçlarını kısa biçimde belirtin.
- İlgisiz dosyalara dokunmayın; mevcut kullanıcı değişikliklerini koruyun.
