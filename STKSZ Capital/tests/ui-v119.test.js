/* ═══ UI v119 (2. ADIM) — GLOBAL 3D UI/UX TESTLERİ ═══
   1) Üst bar: AI butonu kalktı, durum+küçük 3D yenile responsive
   2) Alt bar: merkez STKSZ AI 3D yuvarlak buton + halka animasyonu
   3) Risk sekmesi kaldırıldı → içerik Durum'da (ID'ler ve renderRisk korunur)
   4) Yön okları SVG 3D kapsül (tüm uygulama)
   5) Grafik araçları / rapor modalı / eski siyah kartlar 3D dile
   6) Responsive taşma önlemleri */
"use strict";
const fs = require("fs"), path = require("path");
const R = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(R, f), "utf8");
let pass = 0, fail = 0;
const t = (name, ok) => { if (ok) { pass++; console.log("  ✅ " + name); } else { fail++; console.log("  ❌ " + name); } };

const html = read("www/index.html");
const css = read("www/style.css");

console.log("═══ 1) ÜST BAR ═══");
t("Üst bardaki eski AI butonu kaldırıldı", !html.includes('class="ai-header-btn"'));
t("Durum metni + yenile aynı satırda (header-status-row korundu)", html.includes('class="header-status-row"') && html.includes('id="headerRefreshBtn"'));
t("Durum metni taşma korumalı (ellipsis)", css.includes(".header-data-status{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis"));
t("Yenile butonu küçültüldü + 3D bakır (30px)", css.includes('.header-refresh-btn{\n  flex:0 0 30px;width:30px;height:30px'));
t("Mobilde daha da kompakt (28px)", css.includes("flex-basis:28px;width:28px;height:28px"));

console.log("═══ 2) ALT BAR MERKEZİ: STKSZ AI ═══");
const navBlock = html.slice(html.indexOf('<nav class="nav"'), html.indexOf("</nav>"));
t("Merkez STKSZ AI butonu navda", navBlock.includes('class="nav-ai-btn"') && navBlock.includes("openStkszAi()"));
t("Buton içinde STKSZ AI yazısı", navBlock.includes("<b>STKSZ</b><b>AI</b>"));
t("Konum: Haberler ile Durum arasında (merkez)", navBlock.indexOf("Haberler") < navBlock.indexOf("nav-ai-btn") && navBlock.indexOf("nav-ai-btn") < navBlock.indexOf("Durum"));
t("Dışarı taşan yuvarlak tasarım (negatif margin + %50 radius)", css.includes(".nav-ai-btn{") && css.includes("margin-top:-26px") && css.includes("border-radius:50%"));
t("Metalik halka + yavaş LED dönüşü (6s)", css.includes("conic-gradient") && css.includes("aiRingSpin 6s linear infinite"));
t("Reduced-motion desteği (göz yormaz)", css.includes("@media(prefers-reduced-motion:reduce){.nav-ai-ring{animation:none}}"));
t("Nav overflow visible (buton kesilmez)", css.includes(".nav{overflow:visible!important}"));
t("Diğer butonlardan büyük (64px vs 30px kapsül)", css.includes("width:64px;height:64px"));

console.log("═══ 3) RİSK → DURUM BİRLEŞMESİ ═══");
t("Risk sekmesi navdan kalktı", !navBlock.includes('data-page="risk"'));
t("Risk hero + riskList artık Durum sayfası içinde", (() => { const st = html.indexOf('id="page-status"'), end = html.indexOf('id="page-risk"'); const statusBlock = html.slice(st, end); return statusBlock.includes('id="overallRisk"') && statusBlock.includes('id="riskList"') && statusBlock.includes('id="riskFill"'); })());
t("page-risk uyumluluk kabuğu (boş+gizli, eski linkler kırılmaz)", html.includes('<section class="page" id="page-risk" hidden aria-hidden="true"></section>'));
t("showPage('risk') → Durum'a yönlenir", html.includes('if(id==="risk")id="status"'));
t("Durum açılışında renderRisk çağrılır", html.includes('if(id==="status")renderRisk()'));
t("renderRisk fonksiyonu korundu (bilgi kaybolmadı)", html.includes("function renderRisk()"));
t("Durum sayfası: CORE+SCORE+risk+çeşitlendirme tek yerde", (() => { const st = html.indexOf('id="page-status"'); const block = html.slice(st, html.indexOf('id="page-risk"')); return block.includes("coreCurrentScore") && block.includes("coreScoreAlias") && block.includes("statusDiversification") && block.includes("statusRiskLevel"); })());

console.log("═══ 4) 3D YÖN OKLARI (tüm uygulama) ═══");
t("Bölüm okları SVG oldu (↑↓ metni kalktı)", !html.includes('data-section-move="up" aria-label="Bölümü yukarı taşı" title="Yukarı taşı">↑<') && html.includes('data-section-move="up" aria-label="Bölümü yukarı taşı" title="Yukarı taşı"><svg'));
t("Kart okları SVG oldu", html.includes('data-card-move="up" aria-label="Kartı yukarı taşı" title="Yukarı taşı"><svg'));
t("Ok kapsülleri 3D bakır + disabled soft", css.includes('body:not([data-theme="light"]) .page-section-control,') && css.includes(".card-reorder-button:disabled"));

console.log("═══ 5) DETAY/GRAFİK/RAPOR/KARTLAR 3D ═══");
t("Grafik araç butonları 3D (aktif bakır kapsül)", css.includes('.chart-toolbar-v2 .chart-tool.active{background:var(--c3d)'));
t("Tam ekran + kapat butonları 3D", css.includes('.chart-fullscreen-btn{border:0;border-radius:9px;background:var(--c3d-soft)') && css.includes(".asset-detail-close{"));
t("STKSZ Editör alanı yeni kart dili", css.includes("#stkszEditorZone,"));
t("Rapor modalı: KAPAT + paylaşım butonları 3D", css.includes(".btn-close-action{\n  border:0;border-radius:10px") && css.includes(".report-actions .btn{border-radius:999px"));
t("Rapor buton işlevleri değişmedi", html.includes('onclick="shareReport()"') && html.includes('onclick="shareReportWhatsApp()"') && html.includes('onclick="copyReport()"'));
t("Eski siyah kartlar yeni dile (strategy/core/risk/opportunity/plan)", css.includes(".strategy-card,") && css.includes(".opportunity-hero,") && css.includes(".plan-card{"));
t("Üst bar aksiyon kapsülleri 3D metalik", css.includes('.hbtn{\n  border:0;border-radius:10px;background:var(--c3d-soft)'));

console.log("═══ 6) RESPONSIVE ═══");
t("Uzun isimler overflow-wrap:anywhere (ASELSAN vb.)", css.includes(".holding-name,.asset-chip-name,.opportunity-company") && css.includes("overflow-wrap:anywhere"));
t("Modal genişlik sınırı (taşma yok)", css.includes(".modal-box{max-width:min(720px,calc(100vw - 20px))"));
t("Grafik araç çubuğu taşma yerine yatay kaydırma", css.includes(".chart-toolbar-v2{overflow-x:auto"));
t("Alt bar-içerik çakışma payı (AI butonu taşması)", css.includes("main{padding-bottom:calc(var(--fixed-nav-height,76px) + 34px)}"));
t("Toolbar/rapor/işlem butonları wrap", css.includes(".toolbar,.report-actions,.trade-actions,.tv-actions{flex-wrap:wrap"));

console.log("═══ 7) ÇALIŞAN SİSTEM KORUNDU ═══");
t("STKSZ AI Engine bağlantısı duruyor", html.includes("STKSZAIEngine?.context?.(question)") && html.includes("stksz-ai-engine.js"));
t("openStkszAi işlevi korundu", html.includes("function openStkszAi()"));
t("Sürüm zinciri arttı (v119+)", /content="2026\.08\.\d{2}-ai-v1(19|[2-9][0-9])"/.test(html) && /style\.css\?v=1(19|[2-9][0-9])/.test(html) && /stksz-shell-v1[2-9][0-9]/.test(read("www/service-worker.js")));/* v120: literal sabitlenmez */
t("Auth + sanal cüzdan + rozetler dokunulmadı", html.includes('id="authGate"') && html.includes("SANAL AL") && html.includes('id="profileBadgeRow"'));

console.log(`\n═══ SONUÇ: ${pass} PASS · ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
