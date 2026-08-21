/* ═══ UI v120 (3. ADIM) — İÇERİK MİMARİSİ + CAROUSEL + ROZET TESTLERİ ═══ */
"use strict";
const fs = require("fs"), path = require("path");
const R = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(R, f), "utf8");
let pass = 0, fail = 0;
const t = (name, ok) => { if (ok) { pass++; console.log("  ✅ " + name); } else { fail++; console.log("  ❌ " + name); } };

const html = read("www/index.html");
const css = read("www/style.css");
const sw = read("www/service-worker.js");

console.log("═══ 1) PORTAL DAĞITIMI (bilgi kaybı yok) ═══");
t("Portal klasörü kaldırıldı (www + iOS + Android)", !fs.existsSync(path.join(R, "www/portal")) && !fs.existsSync(path.join(R, "ios/App/App/public/portal")) && !fs.existsSync(path.join(R, "android/app/src/main/assets/public/portal")));
t("SW cache listesinde portal kalmadı", !sw.includes("portal/"));
t("Piyasa özeti/CORE/SCORE Durum'da duruyor", html.includes("coreCurrentScore") && html.includes("STKSZ DURUM RAPORU"));
t("Halka arz Fırsatlar'da duruyor (ipoCalendar)", html.includes("ipoCalendar") && html.includes("Halka Arz Takvimi"));
t("Portföy sayfası duruyor", html.includes('id="page-portfolio"'));
t("Haberler sayfası duruyor", html.includes('id="page-news"'));
t("Menü: portal linki yerine iç yönlendirme kartları", !html.includes("portal/index.html") && html.includes("PİYASA DURUMU") && html.includes("HALKA ARZ &amp; FIRSATLAR"));

console.log("═══ 2) MENÜ BAŞLIĞI ═══");
t("Menü başlığında küçük STKSZ yazısı kalktı (yalnız MENÜ)", !html.includes("<small>STKSZ</small><h2>MENÜ</h2>"));
t("Menü kartları 3D derinlik + ok kapsülü", css.includes('.menu-nav-card{box-shadow:var(--neu-shadow),var(--neu-light)}') && css.includes(".menu-nav-trigger i{\n  display:grid"));

console.log("═══ 3) HAZIR SORULAR CAROUSEL ═══");
t("Carousel markup: track + ok butonları", html.includes('id="aiQuickCarousel"') && html.includes('id="aiQuickTrack"') && html.includes("aiQuickScroll(-1)"));
t("11 chip: yeni sorular dahil (piyasa durumu/ASELS/halka arz)", (() => { const start = html.indexOf('id="aiQuickTrack"'); const end = html.indexOf("</div>", start); return (html.slice(start, end).match(/<button/g) || []).length === 11; })());
t("Eski drawer kaldırıldı", !html.includes('id="aiQuickDrawer"'));
t("Yatay kaydırma + snap + taşma yok", css.includes(".ai-quick-track{\n  display:flex;gap:6px;overflow-x:auto") && css.includes("scroll-snap-type:x proximity"));
t("Mobilde oklar gizli (swipe)", css.includes("@media(max-width:700px){.aiqc-arrow{display:none}"));
t("aiQuickScroll fonksiyonu", html.includes("function aiQuickScroll(direction)"));
t("Yeni prompt'lar: asels + ipo (VERİ YOK kurallı)", html.includes('asels:"ASELS hakkında ne düşünüyorsun?') && html.includes('ipo:"Yaklaşan halka arzlar neler?') && html.includes("kayıt yoksa VERİ YOK"));

console.log("═══ 4) AI ROUTING (Engine üzerinden) ═══");
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const engine = require(path.join(R, "www/stksz-ai-engine.js"));
t("'Portföyüm ne durumda?' → PORTFOLIO", engine.route("Portföyüm ne durumda?").includes("PORTFOLIO"));
t("'ASELS hakkında ne düşünüyorsun?' → STOCK", engine.route("ASELS hakkında ne düşünüyorsun?").includes("STOCK"));
t("'Bugün piyasada ne oldu?' → MARKET", engine.route("Bugün piyasada ne oldu?").includes("MARKET"));
t("'Riskim ne?' → RISK", engine.route("Riskim ne? kaybetme ihtimalim").includes("RISK"));
t("'Grafiğimi analiz et' → CHART", engine.route("Grafiğimi analiz et, destek direnç").includes("CHART"));
t("Engine bağlamı askStkszAi'da kullanılıyor", html.includes("STKSZAIEngine?.context?.(question)"));
t("VERİ YOK kuralı Engine RULES'ta bağlayıcı", engine.RULES.some(r => r.includes("VERİ YOK") && r.includes("uydurma")));

console.log("═══ 5) RAPOR: KÂR/ZARAR AYRI ═══");
t("Rapor: Gerçekleşmemiş Kâr AYRI satır", html.includes("`Gerçekleşmemiş Kâr: ${moneyOrNoData(cumulative.unrealizedProfit)}`"));
t("Rapor: Gerçekleşmemiş Zarar AYRI satır", html.includes('`Gerçekleşmemiş Zarar: ${cumulative.unrealizedLoss===null?"VERİ YOK":"-"+money(cumulative.unrealizedLoss)}`'));
t("Rapor: Midas Portföy Değeri + Günlük K/Z + Gerçekleşen Net + Skor + Güven/Risk/Karar + MEVCUT VARLIKLAR", ["Midas Portföy Değeri","Günlük K/Z","Gerçekleşen Net","STKSZ Skoru","Güven: ${score.confidence}%","MEVCUT VARLIKLAR"].every(s => html.includes(s)));
t("Portföy ekranı: GERÇEKLEŞMEMİŞ KÂR ve ZARAR ayrı kartlar", html.includes("GERÇEKLEŞMEMİŞ KÂR") && html.includes("GERÇEKLEŞMEMİŞ ZARAR") && html.includes('id="unrealizedProfitTotal"') && html.includes('id="unrealizedLossTotal"'));

console.log("═══ 6) GÖRSEL VERİ GÜNCELLEME + 3D ═══");
t("OCR özelliği korundu (prepareDataOcr + applyOcrReview)", html.includes("prepareDataOcr") && html.includes("function applyOcrReview()"));
t("OCR sekmeleri 3D dile alındı", css.includes('.ocr-source-tab{border-radius:999px;background:var(--c3d-soft)'));

console.log("═══ 7) ROZET 3D CİLASI ═══");
t("Metalik parlama şeridi (::after)", css.includes(".profile-badge::after"));
t("Bronz/Gümüş/Altın ayrı metalik gölgeler", css.includes(".badge-bronz{box-shadow") && css.includes(".badge-gumus{box-shadow") && css.includes(".badge-altin{box-shadow"));
t("KRAL: özel premium glow animasyonu + reduced-motion", css.includes("kralGlow 3.6s") && css.includes('@media(prefers-reduced-motion:reduce){body:not([data-theme="light"]) .badge-kral{animation:none}}'));
t("ADMIN: farklı yönetici tasarımı (kırmızı ton)", css.includes(".badge-admin{box-shadow:0 0 10px rgba(255,92,92"));

console.log("═══ 8) ENTITLEMENT + API GÜVENLİĞİ (tekrar kontrol) ═══");
t("Entitlement altyapısı duruyor (özellik kilitleme YOK — mevcut özellikler alınmadı)", engine.BADGES.KRAL.entitlements.includes("ai_pro") && !html.includes("hasEntitlement('advanced_chart')&&") );
t("Normal kullanıcı API notu duruyor", html.includes("STKSZ sistemi yönetici tarafından yapılandırılmıştır."));
t("data-admin-only sarmalayıcı duruyor", html.includes("data-admin-only"));
t("Rozet kodu backend doğrulaması duruyor", html.includes("/api/entitlement/redeem"));
const server = read("server/stksz-ai-server.js");
t("Backend admin uçları token korumalı", server.includes("isAdminReq(req)") && server.includes("timingSafeEqual"));

console.log("═══ 9) SÜRÜM + BÜTÜNLÜK ═══");
t("Build v120 + SW v121", html.includes('content="2026.08.19-ai-v120"') && sw.includes("stksz-shell-v121"));
t("Alt bar STKSZ AI merkez butonu korundu (v119)", html.includes('class="nav-ai-btn"'));
t("Risk→Durum birleşmesi korundu (v119)", html.includes('if(id==="risk")id="status"'));

console.log(`\n═══ SONUÇ: ${pass} PASS · ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
