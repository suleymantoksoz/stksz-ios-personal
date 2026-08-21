/* ═══ UI v115 (ADIM 20) — Eski görünüm tam temizliği + metalik bakır + 3D ikonlar ═══
   Kullanıcı geri bildirimi doğrulama:
   1) Alt bar SVG 3D ikonlar (eski unicode ⌂▣▤◫◉◎ kalktı)
   2) Menüdeki eski yeşil kart kalıntıları bakır dile
   3) Haberler sayfası yeni görünüm
   4) Sayfayı düzenle = yalnız kalem ikonu (yazı yok)
   5) Varlık detay: Midas tarzı fiyat başlığı + POZİSYONUM/İSTATİSTİKLER bölümleri
   6) Geçmiş otomatik çekilir (bayat/boşsa)
   7) Metalik bakır ton (#B87333 zinciri; yavruağzı #C87A53 zinciri kalktı)
   8) Borsa Portalı yeni tasarım + ana uygulamayla hizalı bar yapısı
   9) mountain-neon.png kullanılmayan görsel kaldırıldı */
"use strict";
const fs = require("fs"), path = require("path");
const R = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(R, f), "utf8");
let pass = 0, fail = 0;
const t = (name, ok) => { if (ok) { pass++; console.log("  ✅ " + name); } else { fail++; console.log("  ❌ " + name); } };

const html = read("www/index.html");
const css = read("www/style.css");
const chart = read("www/stksz-chart.js");
const sw = read("www/service-worker.js");
/* v120 (3. ADIM): portal kaldırıldı — içerik Durum/Haberler/Fırsatlar/Portföy sayfalarına dağıtıldı */

console.log("═══ 1) ALT BAR: 3D SVG ikonlar ═══");
const navBlock = html.slice(html.indexOf('<nav class="nav"'), html.indexOf("</nav>"));
t("Alt bar 5 sayfa SVG ikonu içeriyor (v119: Risk→Durum birleşti)", (navBlock.match(/<svg viewBox="0 0 24 24">/g) || []).length === 5);
t("Eski unicode nav ikonları kalktı", !/[⌂▣▤◫◉◎]/.test(navBlock));
t("nav-icon svg 1.5px stroke kuralı var", css.includes(".nav-icon svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.5"));
t("Aktif nav ikonu 3D bakır kapsül", css.includes('.nav button.active .nav-icon{\n  background:linear-gradient(145deg,#E2A968 0%,#B87333 45%,#6E3F17 100%)'));
t("Nav etiketleri (v119): Ana Sayfa/Portföy/Haberler/Durum/Fırsatlar + merkez STKSZ AI", ["Ana Sayfa","Portföy","Haberler","Durum","Fırsatlar"].every(l => navBlock.includes(l)) && navBlock.includes("nav-ai-btn"));
t("showPage onclick bağları korundu (5 sayfa)", (navBlock.match(/onclick="showPage\(/g) || []).length === 5);

console.log("═══ 2) MENÜ: eski yeşil kart kalıntıları ═══");
t("menu-nav-card hover bakır kuralı (v115)", css.includes('body:not([data-theme="light"]) .menu-nav-card:hover'));
t("AI kartı (eski mavi) bakır dile alındı", css.includes('body:not([data-theme="light"]) .ai-nav-card{border-color:rgba(208,144,78,.4)'));
t("menu-nav-trigger oku bakır", css.includes('body:not([data-theme="light"]) .menu-nav-trigger i{color:#D9A96A}'));
t("Tema anahtarı bakır dile alındı", css.includes('.theme-switch input:checked+.theme-slider:before{background:#D0904E'));

console.log("═══ 3) HABERLER: yeni görünüm ═══");
t("Haber kartı neumorphic panel", css.includes('body:not([data-theme="light"]) .news-item.news-card-pro{border-color:var(--card-line)'));
t("Haber filtre aktif hâli bakır", css.includes('body:not([data-theme="light"]) .news-filter-card.active{'));
t("Haber başlık hover bakır", css.includes('body:not([data-theme="light"]) .news-title:hover{color:#D9A96A}'));
t("Sembol etiketi bakır zemin", css.includes('body:not([data-theme="light"]) .news-tags .symbol-tag{color:#E3BC84'));

console.log("═══ 4) SAYFAYI DÜZENLE: yalnız kalem ═══");
t("Buton HTML'inde 'SAYFAYI DÜZENLE' yazısı yok", !html.includes("</span> SAYFAYI DÜZENLE"));
t("Kalem SVG butonda duruyor (pen-ic)", html.includes("class=\"btn small page-edit-toggle\"") && html.includes('pen-ic'));
t("Kare kapsül CSS (38px) eklendi", css.includes(".page-edit-toggle{display:inline-grid;place-items:center;width:38px;height:38px"));
t("Düzenleme modunda ✔ BİTTİ korundu", html.includes('button.textContent="✔ BİTTİ"'));

console.log("═══ 5) VARLIK DETAY: Midas tarzı düzen ═══");
t("Fiyat kutusu markup'ı eklendi", html.includes('id="assetDetailPriceBox"') && html.includes('id="assetDetailPrice"') && html.includes('id="assetDetailChange"'));
t("openAssetDetail fiyat kutusunu dolduruyor", html.includes('priceEl.textContent=money(priceValue)'));
t("Fiyat yoksa kutu gizli (VERİ YOK ilkesi)", html.includes('priceBox.hidden=true'));
t("POZİSYONUM bölümü var", html.includes('POZİSYONUM</div>'));
t("İSTATİSTİKLER bölümü var", html.includes('asset-section-gap">İSTATİSTİKLER'));
t("Pozisyon yoksa POZİSYONUM gizlenir", html.includes('hasPosition?`<div class="section-title asset-section-gap">POZİSYONUM'));
t("Bildirim butonu SVG çan ikonu oldu", html.includes('id="assetDetailAlertBtn"') && !html.includes('🔔 BİLDİRİM EKLE'));
t("Büyük fiyat CSS (30px tabular)", css.includes(".asset-detail-price-row b{font-size:30px"));

console.log("═══ 6) GEÇMİŞ OTOMATİK ÇEKME ═══");
t("initStkszChartPanel bayatlık kontrolü + otomatik fetch", html.includes("stkszChartFetchHistory(stkszChartSymbol);}catch(error){}},250)"));
t("24 saat bayatlık eşiği", html.includes("Date.now()-latestDate>24*60*60*1000"));
t("Manuel GEÇMİŞİ ÇEK butonu korundu", html.includes('data-chart-load="${esc(clean)}">GEÇMİŞİ ÇEK'));

console.log("═══ 7) METALİK BAKIR TONU ═══");
t("Yavruağzı ton zinciri CSS'ten kalktı (#C87A53/#D48C6A/#A65B32)", !/#C87A53|#D48C6A|#A65B32/i.test(css));
t("Metalik bakır tokenlar aktif (#B87333/#D0904E/#8C5220)", css.includes("--copper:#B87333") && css.includes("#D0904E") && css.includes("#8C5220"));
t("Grafik çizim renkleri metalik bakır", chart.includes("draw: '#B87333'") && chart.includes("drawActive: '#D0904E'"));
t("Grafik crosshair metalik bakır", chart.includes("cross: 'rgba(208,144,78,.6)'"));
t("index.html'de eski ton kalmadı", !/#C87A53|#D48C6A/i.test(html));

console.log("═══ 8) PORTAL KALDIRILDI (v120: içerik ana sayfalara dağıtıldı) ═══");
t("www/portal klasörü yok", !fs.existsSync(path.join(R, "www/portal")));
t("SW listesinde portal yok", !sw.includes("portal/"));
t("index.html'de portal linki yok", !html.includes("portal/index.html"));
t("Menüde Piyasa Durumu + Halka Arz yönlendirme kartları", html.includes("PİYASA DURUMU") && html.includes("HALKA ARZ &amp; FIRSATLAR"));

console.log("═══ 9) WORKSPACE TEMİZLİĞİ ═══");
t("mountain-neon.png dosyası silindi", !fs.existsSync(path.join(R, "www/assets/icons/mountain-neon.png")));
t("SW cache listesinde mountain-neon yok", !sw.includes("mountain-neon"));
t("SW cache sürümü artırıldı (v116+)", /stksz-shell-v1(1[6-9]|[2-9][0-9])-/.test(sw));/* v115b: sürüm literal'i sabitlenmez */

console.log("═══ 10) SÜRÜM ZİNCİRİ + REGRESYON EMNİYETİ ═══");
t("Build meta v115+", /content="2026\.08\.\d{2}-ai-v1(1[5-9]|[2-9][0-9])"/.test(html));/* v115b: sürüm literal'i sabitlenmez */
t("style.css?v=115+", /style\.css\?v=1(1[5-9]|[2-9][0-9])/.test(html));
t("Sürüm gösterimi v1 korundu", html.includes('setText("menuBuildInfo","v1")'));
t("SANAL AL/SAT butonları korundu", html.includes("SANAL AL") && html.includes("SANAL SAT"));
t("Auth gate korundu (v114)", html.includes('id="authGate"'));
t("AI hazır soru alanı korundu (v120: carousel)", html.includes('id="aiQuickCarousel"'));
t("Açık tema kuralları dokunulmadı (body[data-theme=light] sayısı korunur)", (css.match(/body\[data-theme="light"\]/g) || []).length > 50);

console.log("═══ 11) v115b: ALT BAR ZEMİNİ + AKTİF ÇİZGİ DÜZELTMESİ ═══");
t("Alt bar yeni cam zemin !important ile eski koyu-yeşili ezer", css.includes('body:not([data-theme="light"]) .nav{\n  background:rgba(37,42,52,.92)!important'));
t("Aktif sekme alt çizgisi (::after) kaldırıldı — yazıyı kapatıyordu", css.includes(".nav button.active::after{display:none!important;content:none!important}"));
t("Aktif sekme zemini bakır tint (eski yeşil tint ezildi)", css.includes('body:not([data-theme="light"]) .nav button.active{background:rgba(208,144,78,.12)!important}'));
t("v115b kuralları en son katmanda (eski 639. satır kuralından sonra)", css.lastIndexOf("background:rgba(37,42,52,.92)!important") > css.indexOf("background:#070b0d!important"));

console.log(`\n═══ SONUÇ: ${pass} PASS · ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
