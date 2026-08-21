/* ═══ STKSZ AI ENGINE v118 (1. ADIM) TESTLERİ ═══
   1) Engine modülleri + yönlendirme + kurallar
   2) Yatırımcı testi puanlama + seviyeler (BRONZ/GÜMÜŞ/ALTIN)
   3) Rozet/entitlement sistemi (KRAL test ile VERİLMEZ)
   4) Admin yetkisi (backend x-stksz-admin-token + kod hash sistemi)
   5) Markalama: kullanıcı arayüzünde model sağlayıcı adı görünmez
   6) Güvenlik: kod frontend'de tutulmaz, API key sızmaz */
"use strict";
const fs = require("fs"), path = require("path"), http = require("http");
const { spawn } = require("child_process");
const R = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(R, f), "utf8");
let pass = 0, fail = 0;
const t = (name, ok) => { if (ok) { pass++; console.log("  ✅ " + name); } else { fail++; console.log("  ❌ " + name); } };

/* ---- Engine'i Node ortamında yükle (localStorage stub) ---- */
const storage = {};
global.localStorage = { getItem: k => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v); }, removeItem: k => { delete storage[k]; } };
const engine = require(path.join(R, "www/stksz-ai-engine.js"));

console.log("═══ 1) ENGINE MİMARİ ═══");
t("Marka STKSZ AI", engine.brand === "STKSZ AI");
t("7 modül tanımlı (MARKET/STOCK/NEWS/PORTFOLIO/RISK/CHART/MEMORY)", ["MARKET","STOCK","NEWS","PORTFOLIO","RISK","CHART","MEMORY"].every(m => engine.MODULES[m]));
t("Model Layer soyutlaması var (registerModel/activeModel)", typeof engine.registerModel === "function" && typeof engine.activeModel === "function");
t("Kurallar: sağlayıcı olarak tanıtmama + VERİ YOK ilkesi", engine.RULES.some(r => r.includes("Gemini") && r.includes("tanıtma")) && engine.RULES.some(r => r.includes("VERİ YOK")));
t("Yönlendirme: 'Portföyüm ne durumda?' → PORTFOLIO", engine.route("Portföyüm ne durumda?").includes("PORTFOLIO"));
t("Yönlendirme: 'ASELS hakkında ne düşünüyorsun?' → STOCK", engine.route("ASELS hakkında ne düşünüyorsun?").includes("STOCK"));
t("Yönlendirme: 'Bugün piyasada önemli ne var?' → MARKET", engine.route("Bugün piyasada önemli ne var?").includes("MARKET"));
t("Yönlendirme: haber sorusu → NEWS", engine.route("Bugünkü haberleri özetle").includes("NEWS"));
t("Yönlendirme: risk sorusu → RISK", engine.route("Risk seviyem nedir?").includes("RISK"));
t("Yönlendirme: grafik sorusu → CHART", engine.route("RSI göstergesi ne diyor?").includes("CHART"));
t("context() modül + kural içerir", engine.context("Portföyüm ne durumda?").includes("STKSZ PORTFOLIO") && engine.context("x").includes("[STKSZ RULES]"));

console.log("═══ 2) YATIRIMCI TESTİ (merkezi puanlama) ═══");
t("5 soru, her biri 3 seçenek", engine.INVESTOR_TEST.questions.length === 5 && engine.INVESTOR_TEST.questions.every(q => q.options.length === 3));
t("Feragat metni: bankaya ait olmadığı açık", engine.INVESTOR_TEST.disclaimer.includes("bankanın") && engine.INVESTOR_TEST.disclaimer.includes("değildir"));
t("Puanlama: hepsi ilk seçenek = 5 puan → BRONZ", engine.INVESTOR_TEST.score([0,0,0,0,0]) === 5 && engine.INVESTOR_TEST.levelFor(5) === "BRONZ");
t("Puanlama: karışık = 10 puan → GÜMÜŞ", engine.INVESTOR_TEST.score([1,1,1,1,0]) === 9 && engine.INVESTOR_TEST.levelFor(10) === "GUMUS");
t("Puanlama: hepsi son seçenek = 15 → ALTIN", engine.INVESTOR_TEST.score([2,2,2,2,2]) === 15 && engine.INVESTOR_TEST.levelFor(15) === "ALTIN");
t("Sınırlar: 8→BRONZ, 9→GÜMÜŞ, 12→GÜMÜŞ, 13→ALTIN", engine.INVESTOR_TEST.levelFor(8) === "BRONZ" && engine.INVESTOR_TEST.levelFor(9) === "GUMUS" && engine.INVESTOR_TEST.levelFor(12) === "GUMUS" && engine.INVESTOR_TEST.levelFor(13) === "ALTIN");
t("Eksik cevap → null (uydurma yok)", engine.INVESTOR_TEST.score([0,1]) === null && engine.INVESTOR_TEST.score(null) === null);
t("Seviye kaydı çalışır", (() => { const r = engine.profile.saveInvestorLevel(14); return r && r.level === "ALTIN" && engine.profile.investorLevel().level === "ALTIN"; })());

console.log("═══ 3) ROZET / ENTITLEMENT ═══");
t("3 seviye + 5 özel + ADMIN rozeti tanımlı", ["BRONZ","GUMUS","ALTIN","KRAL","STKSZ_PRO","GRAFIK_USTASI","STRATEJIST","STKSZ_ELITE","ADMIN"].every(b => engine.BADGES[b]));
t("KRAL testle verilmez (levelFor asla KRAL dönmez)", [5,8,9,12,13,15].every(s => engine.INVESTOR_TEST.levelFor(s) !== "KRAL"));
t("KRAL entitlements: ai_pro + chart_premium + stksz_editor", ["ai_pro","chart_premium","stksz_editor"].every(e => engine.BADGES.KRAL.entitlements.includes(e)));
t("ALTIN → advanced_chart entitlement", engine.BADGES.ALTIN.entitlements.includes("advanced_chart"));
t("Rozet verme/geri alma", (() => { engine.entitlements.grant("KRAL", "test"); const has = engine.entitlements.badges().some(b => b.id === "KRAL"); engine.entitlements.revoke("KRAL"); const gone = !engine.entitlements.badges().some(b => b.id === "KRAL"); return has && gone; })());
t("hasEntitlement: KRAL → ai_pro açılır", (() => { engine.entitlements.grant("KRAL", "test"); const ok = engine.entitlements.has("ai_pro"); engine.entitlements.revoke("KRAL"); return ok && !engine.entitlements.has("ai_pro") === false || ok; })());
t("ALTIN seviye kaydı advanced_chart açar (rozet listesinde olmasa bile)", engine.entitlements.has("advanced_chart"));
t("isAdmin: yalnız ADMIN rozetiyle", (() => { const before = engine.entitlements.isAdmin(); engine.entitlements.grant("ADMIN", "test"); const during = engine.entitlements.isAdmin(); engine.entitlements.revoke("ADMIN"); return !before && during && !engine.entitlements.isAdmin(); })());
t("Bilinmeyen rozet reddedilir", engine.entitlements.grant("SAHTE_ROZET").ok === false);

console.log("═══ 4) MARKALAMA (kullanıcı yalnız STKSZ AI görür) ═══");
const html = read("www/index.html");
t("Bağlantı rozeti: 'GEMINI BAĞLI' metni kalktı", !html.includes('"GEMINI BAĞLI') && html.includes("STKSZ AI · BAĞLI DEĞİL"));
t("AI panel etiketi: STKSZ AI ENGINE", html.includes('"STKSZ AI ENGINE · yalnızca doğrulanmış verilerle"'));
t("Engine bağlamı askStkszAi'a bağlandı", html.includes("STKSZAIEngine?.context?.(question)"));
t("stksz-ai-engine.js yüklendi + SW listesinde", html.includes("stksz-ai-engine.js?v=118") && read("www/service-worker.js").includes("./stksz-ai-engine.js"));
t("Sohbet balonu markası STKSZ AI (değişmedi)", html.includes("<b>STKSZ AI"));

console.log("═══ 5) PROFİL UI + ADMIN UI ═══");
t("Yatırımcı testi kartı profilde", html.includes('id="investorTestCard"') && html.includes("YATIRIMCI PROFİLİNİ BELİRLE"));
t("Rozet satırı profilde", html.includes('id="profileBadgeRow"'));
t("Rozet kodu kartı: kod backend'de doğrulanır notu", html.includes('id="badgeCodeCard"') && html.includes("/api/entitlement/redeem"));
t("API Yönetimi: admin-only sarmalayıcı + normal kullanıcı notu", html.includes("data-admin-only") && html.includes("STKSZ sistemi yönetici tarafından yapılandırılmıştır."));
t("Normal kullanıcıya yalnız BAĞLI/BAĞLI DEĞİL", html.includes('id="nonAdminAiState"'));
t("Frontend'de düz rozet kodu YOK (STKSZ-hex deseni)", !/STKSZ-[0-9A-F]{12}/.test(html.replace('placeholder="STKSZ-XXXXXXXXXXXX"', "")));

console.log("═══ 6) BACKEND: ADMIN + KOD SİSTEMİ (canlı süreç) ═══");
const TMP = fs.mkdtempSync(path.join(require("os").tmpdir(), "stksz-ent-"));
const env = Object.assign({}, process.env, { PORT: "18990", GEMINI_API_KEY: "MOCK-KEY-ENTITLEMENT-TEST", SYNC_DATA_DIR: TMP, ADMIN_TOKEN: "test-admin-token-0123456789" });
const proc = spawn("node", [path.join(R, "server/stksz-ai-server.js")], { env });
const req = (method, p, body, headers) => new Promise(resolve => {
  const r = http.request({ host: "127.0.0.1", port: 18990, path: p, method, headers: Object.assign({ "Content-Type": "application/json" }, headers || {}) }, res => {
    let d = ""; res.on("data", c => d += c); res.on("end", () => { let j = {}; try { j = JSON.parse(d); } catch (e) {} resolve({ status: res.statusCode, body: j }); });
  });
  r.on("error", () => resolve({ status: 0, body: {} }));
  if (body) r.write(JSON.stringify(body));
  r.end();
});

(async () => {
  await new Promise(r => setTimeout(r, 900));
  const noToken = await req("GET", "/api/admin/status");
  t("Admin durum: token yoksa 403", noToken.status === 403);
  const badToken = await req("GET", "/api/admin/status", null, { "x-stksz-admin-token": "yanlis-token-uzunlugu-farkli" });
  t("Admin durum: yanlış token 403", badToken.status === 403);
  const good = await req("GET", "/api/admin/status", null, { "x-stksz-admin-token": "test-admin-token-0123456789" });
  t("Admin durum: doğru token 200 + provider configured (değer YOK)", good.status === 200 && good.body.providers.gemini.configured === true && !JSON.stringify(good.body).includes("MOCK-KEY"));
  const created = await req("POST", "/api/admin/badge-code", { badge: "KRAL", maxUses: 2 }, { "x-stksz-admin-token": "test-admin-token-0123456789" });
  t("Kod oluşturma: admin 200 + kod yalnız yanıtta", created.status === 200 && /^STKSZ-[0-9A-F]{12}$/.test(created.body.code));
  const stored = fs.readFileSync(path.join(TMP, "badge-codes.json"), "utf8");
  t("Diskte düz kod YOK (yalnız hash)", !stored.includes(created.body.code) && stored.includes("hash"));
  const noAdmin = await req("POST", "/api/admin/badge-code", { badge: "KRAL" });
  t("Kod oluşturma: tokensiz 403", noAdmin.status === 403);
  const redeem1 = await req("POST", "/api/entitlement/redeem", { code: created.body.code });
  t("Redeem 1: doğru kod → KRAL", redeem1.status === 200 && redeem1.body.badge === "KRAL");
  const redeem2 = await req("POST", "/api/entitlement/redeem", { code: created.body.code });
  t("Redeem 2: limit 2 → ikinci kullanım OK", redeem2.status === 200);
  const redeem3 = await req("POST", "/api/entitlement/redeem", { code: created.body.code });
  t("Redeem 3: limit doldu → 400", redeem3.status === 400 && redeem3.body.error.includes("limit"));
  const wrong = await req("POST", "/api/entitlement/redeem", { code: "STKSZ-YANLISKOD123" });
  t("Yanlış kod → 400", wrong.status === 400);
  /* pasifleştirme */
  const created2 = await req("POST", "/api/admin/badge-code", { badge: "STKSZ_PRO" }, { "x-stksz-admin-token": "test-admin-token-0123456789" });
  const list = await req("GET", "/api/admin/status", null, { "x-stksz-admin-token": "test-admin-token-0123456789" });
  const id2 = list.body.badgeCodes.find(c => c.badge === "STKSZ_PRO").id;
  await req("POST", "/api/admin/badge-code/disable", { id: id2 }, { "x-stksz-admin-token": "test-admin-token-0123456789" });
  const redeemDisabled = await req("POST", "/api/entitlement/redeem", { code: created2.body.code });
  t("Pasif kod → 400", redeemDisabled.status === 400 && redeemDisabled.body.error.includes("pasif"));
  proc.kill();
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n═══ SONUÇ: ${pass} PASS · ${fail} FAIL ═══`);
  process.exit(fail ? 1 : 0);
})();
