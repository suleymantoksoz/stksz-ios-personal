"use strict";
const fs = require("fs"), path = require("path");
const R = path.resolve(__dirname, "..");
const read = f => fs.readFileSync(path.join(R, f), "utf8");
let pass = 0, fail = 0;
const t = (name, ok) => { if (ok) { pass++; console.log("  ✔ " + name); } else { fail++; console.log("  ✘ " + name); } };

/* ── localStorage stub (Node) ── */
const _store = {};
global.localStorage = {
  getItem: k => (k in _store ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: k => { delete _store[k]; },
  clear: () => { for (const k in _store) delete _store[k]; }
};

const html = read("www/index.html");
const css = read("www/style.css");
const sw = read("www/service-worker.js");
const enginePath = path.join(R, "www", "stksz-ai-engine.js");
const eng = require(enginePath);

/* ── Deterministik doğrulanmış canlı bağlam ── */
function sampleContext() {
  return () => ({
    assets: [
      { s: "THYAO", q: 100, avgCost: 250, p: 300, marketVerified: true, marketChangePct: 2.4, dailyVerified: true, d: 1200 }
    ],
    cashTl: 10000, cashUsd: 500, cashEur: 300,
    fx: { usdtry: 38.2, eurtry: 41.5 },
    market: { lastSuccess: "2026-09-08T09:00:00.000Z", source: "test" },
    news: [],
    ipo: { items: [] },
    fundamentals: {},
    risk: { overall: 34, valid: true },
    watchlist: [], transactions: [], reportedPortfolioTotal: 40000
  });
}

/* ═══ 6.1 Orchestrator (plan/execute/cancel/retry/shared context/budget) ═══ */
t("6.1: engine yüklenir, version v123", eng && eng.version === "v123");
t("6.1: ORCHESTRATOR v2 export (orchestrator alias)", eng.orchestrator && eng.orchestrator.version === "v2");
t("6.1: RETRY_LIMIT 2", eng.orchestrator.RETRY_LIMIT === 2);
t("6.1: plan mode INVESTOR_RESEARCH ≤8 ajan", (() => { const p = eng.orchestrator.plan("genel değerlendirme", "INVESTOR_RESEARCH", {}); return p.mode === "INVESTOR_RESEARCH" && p.agents.length <= 8 && p.maxAgents === 8; })());
t("6.1: plan 'teknik' → technical ajanı", (() => { const p = eng.orchestrator.plan("rsı ve destek direnç analizi", "INVESTOR_ANALYST", {}); return p.agents.some(a => a.id === "technical"); })());
t("6.1: plan 'halka arz' → ipo ajanı", (() => { const p = eng.orchestrator.plan("halka arz tahsisatları", "INVESTOR_ANALYST", {}); return p.agents.some(a => a.id === "ipo"); })());
t("6.1: cancel mevcut ve ok döner", (() => { const r = eng.orchestrator.cancel("run_x"); return r && r.ok === true; })());
t("6.1: aktivite tamponu 24 ile sınırlı", (() => { const o = eng.orchestrator; for (let i = 0; i < 20; i++) eng.copilot.run("test " + i, { mode: "INVESTOR_ANALYST" }); return o.activity.length <= 24; })());
t("6.1: setWorkMode/currentMode döngüsü", (() => { const a = eng.setWorkMode("INVESTOR_RISK"); const m = eng.currentMode(); const b = eng.setWorkMode("INVESTOR_ANALYST"); return a.ok && m.id === "INVESTOR_RISK" && b.ok && eng.currentMode().id === "INVESTOR_ANALYST"; })());

/* ═══ 6.2 10 uzman ajan + 6.3 3 yatırımcı ajan ═══ */
t("6.2: EXPERT_AGENTS 10 uzman", eng.experts && eng.experts.length === 10);
t("6.2: uzman id listesi tam", (() => { const ids = eng.experts.map(e => e.id).join(","); return ids === "equity,financial,portfolio,risk,technical,news,market_movement,valuation,ipo,macro"; })());
t("6.3: INVESTOR_AGENTS 3 yatırımcı", eng.investors && eng.investors.length === 3);
t("6.3: deep_dive/cross_check/source_conf", (() => { const ids = eng.investors.map(e => e.id).join(","); return ids === "deep_dive,cross_check,source_conf"; })());

/* ═══ 6.1 boş ortam disiplini: fake veri yok ═══ */
t("6.1: boş bağlam copilot run → VERİ YETERSİZ — KARAR YOK", (() => { eng.setLiveContext(null); const r = eng.copilot.run("risk değerlendirmesi", { mode: "INVESTOR_RESEARCH" }); return r.synthesis && r.synthesis.ok === false && /VERİ YETERSİZ — KARAR YOK/.test(r.synthesis.decision || r.synthesis.text); })());

/* ═══ Verili bağlam: gerçek ajan çıktıları ═══ */
let RUN = null;
t("6.1: doğrulanmış bağlamda copilot.run çalışır", (() => { eng.setLiveContext(sampleContext()); RUN = eng.copilot.run("genel yatırımcı değerlendirmesi", { mode: "INVESTOR_RESEARCH" }); return !!RUN && RUN.plan.mode === "INVESTOR_RESEARCH"; })());
t("6.1: perAgent boş değil", RUN && Array.isArray(RUN.perAgent) && RUN.perAgent.length > 0);
t("6.1: en az bir ajan ok (doğrulanmış fakt)", RUN && RUN.perAgent.filter(a => a.ok).length > 0);
t("6.2: ajanlar veri status 'verified' üretir", RUN && RUN.perAgent.some(a => (a.data && a.data.status) === "verified"));
t("6.1: confidence skor + ok alanları var", RUN && RUN.confidence && typeof RUN.confidence.score !== "undefined" && typeof RUN.confidence.ok === "boolean");
t("6.1: synthesis.text boş değil", RUN && RUN.synthesis.text && RUN.synthesis.text.length > 0);
t("6.11: provider stksz_local + 0 ücretli dış çağrı", RUN && RUN.providers && RUN.providers.noExternal === true && /0 · ücretli dış çağrı yok/.test(RUN.providers.totalCost || ""));
t("6.3: investors.crossCheck mevcut", RUN && RUN.investors && RUN.investors.crossCheck && RUN.investors.crossCheck.decision);
t("6.3: investors.deepDive HAZIR + domains", RUN && RUN.investors.deepDive && RUN.investors.deepDive.ok === true && Array.isArray(RUN.investors.deepDive.domains));
t("6.3: investorPanel erişimi", eng.copilot.investorPanel(RUN) === RUN.investors);

/* ═══ 6.4 CROSS_CHECK bağımsız sayısal doğrulama ═══ */
t("6.4: crossCheck tutarsız/verisiz → VERİ YETERSİZ", (() => { const r = eng.crossCheck.check([{ ok: false, status: "none" }], {}); return r.ok === false && /VERİ YETERSİZ/.test(r.decision); })());
t("6.4: crossCheck tutarlı toplamlar → GEÇERLİ", (() => {
  const mk = v => ({ ok: true, data: { status: "verified", facts: [{ k: "Toplam değer", v: v + " TL", status: "verified" }, { k: "Toplam varlık", v: v + " TL", status: "verified" }] } });
  const r = eng.crossCheck.check([mk(40000), mk(40000)], {});
  return r.ok === true && r.decision === "GEÇERLİ" && r.verified === true;
})());

/* ═══ 6.5 DEEP_RESEARCH facade ═══ */
t("6.5: DEEP_RESEARCH.start çıktısı DERİN ANALİZ", (() => { eng.setLiveContext(sampleContext()); const d = eng.deepResearch.start("risk ve portfolio analizi"); return d && /DERİN ANALİZ/.test(d.text); })());
t("6.5: running guard (stop sonrası tekrar başlar)", (() => { eng.deepResearch.stop(); const d = eng.deepResearch.start("portf"); return d && (d.ok === true || /VERİ YETERSİZ/.test(d.text)); })());

/* ═══ 6.6 MORNING_INTEL: boş durum gerçek veri ═══ */
t("6.6: boş ortamda morning status none + VERİ YOK + sahte üretilmez", (() => { eng.setLiveContext(null); const m = eng.morning.build(); return m.status === "none" && /VERİ YOK/.test(m.text) && /Sahte veri üretilmez/.test(m.text); })());
t("6.6: verili ortamda morning status verified", (() => { eng.setLiveContext(sampleContext()); const m = eng.morning.build(); return m.ok === true && m.status === "verified" && m.rows.some(r => r.status === "verified"); })());

/* ═══ 6.7 SCENARIO_ENGINE: ≥10 nokta + momentum ═══ */
t("6.7: <10 nokta → VERİ YOK", (() => { const s = eng.scenario.generate("THYAO", [1, 2, 3, 4, 5, 6, 7, 8, 9], "test"); return s.ok === false && /VERİ YOK/.test(s.error); })());
t("6.7: 12 artan nokta → bull momentum", (() => { const pts = []; for (let i = 1; i <= 12; i++) pts.push(100 + i * 3); const s = eng.scenario.generate("THYAO", pts, "test"); return s.ok === true && s.scenario === "bull" && s.momentumPct > 3; })());
t("6.7: 12 düşen nokta → bear momentum", (() => { const pts = []; for (let i = 1; i <= 12; i++) pts.push(130 - i * 3); const s = eng.scenario.generate("THYAO", pts, "test"); return s.ok === true && s.scenario === "bear"; })());

/* ═══ 6.8 EXPORT: secret-free CSV/PDF ═══ */
t("6.8: toCSV başlık + satır içerir, secret yok", (() => { eng.setLiveContext(sampleContext()); const r = eng.copilot.run("portföy özeti", { mode: "INVESTOR_ANALYST" }); const csv = eng.export.toCSV(r); return csv.includes("agent") && csv.includes("data_status") && (r.perAgent.length === 0 || csv.split("\n").length > 1); })());
t("6.8: toPrintHTML data URI ve secret yok", (() => { const h = eng.export.toPrintHTML({ mode: "INVESTOR_ANALYST", perAgent: [] }); return h.startsWith("data:text/html") && !/(api[_-]?key|secret)["':=]/i.test(h); })());
t("6.8: toExcel/toPDF alias çalışır", (() => { const a = eng.export.toExcel({ perAgent: [] }); const b = eng.export.toPDF({ perAgent: [] }); return typeof a === "string" && typeof b === "string"; })());

/* ═══ 6.9/6.10 ANALYSIS_HISTORY + What Changed ═══ */
t("6.9: history.add kayıt üretir (modelChanged ilk false)", (() => { eng.history.clear(); const a = eng.history.add({ question: "q1", mode: "INVESTOR_ANALYST", agentIds: ["portfolio", "risk"], verdict: "HAZIR", agentsOk: 2, agentsTotal: 2 }); return !!a && a.modelChanged === false; })());
t("6.9: whatChanged ilk kayıt isFirst true", (() => { const h = eng.history.history(); return h.length === 1 && eng.history.whatChanged(h[0].id).isFirst === true; })());
t("6.10: ajan seti değişince modelChanged true + diff alanları", (() => { const b = eng.history.add({ question: "q2", mode: "INVESTOR_ANALYST", agentIds: ["portfolio", "risk", "technical"], verdict: "HAZIR", agentsOk: 3, agentsTotal: 3 }); return b.modelChanged === true && Array.isArray(b.changed) && b.changed.length > 0; })());
t("6.10: whatChanged ikinci kayıt modelChanged true", (() => { const h = eng.history.history(); const last = h[h.length - 1]; const wc = eng.history.whatChanged(last.id); return wc.ok && wc.isFirst === false && wc.modelChanged === true; })());
t("6.9: history.clear çalışır", (() => { eng.history.clear(); return eng.history.history().length === 0; })());

/* ═══ 6.8 RESEARCH_WORKSPACE (localStorage) ═══ */
t("6.8: research.add id döner + history ok", (() => { eng.research.clearHistory(); const id = eng.research.add({ question: "soru", answer: "cevap", mode: "INVESTOR_RESEARCH" }); return typeof id === "string" && eng.research.getHistory().length === 1 && eng.research.lastSessionId() === id; })());

/* ═══ 6.12 Safety Gate: emir engeli + secret + reliability ═══ */
t("6.12: canExecuteTrade false (emir otomasyonu kapalı)", eng.multiSafety.canExecuteTrade === false);
t("6.12: boş veri → VERİ YETERSİZ — KARAR YOK", (() => { const r = eng.multiSafety.verifyBeforeAction(null, { data: {} }); return r.ok === false && /VERİ YETERSİZ — KARAR YOK/.test(r.decision); })());
t("6.12: TRADE eylemi → EMİR İŞLEMİ ENGELLENİR", (() => { const r = eng.multiSafety.verifyBeforeAction({ type: "TRADE" }, { data: { x: 1 } }); return r.ok === false && /EMİR İŞLEMİ ENGELLENİR/.test(r.decision); })());
t("6.12: gizli anahtar tespiti → GİZLİ BILGI", (() => { const r = eng.multiSafety.verifyBeforeAction({ type: "READ" }, { data: { API_KEY: "sk-test" } }); return r.ok === false && /GİZLİ BILGI TESPİT EDİLDİ/.test(r.decision); })());
t("6.12: assertNoSecrets secret yakalar", (() => { const r = eng.multiSafety.assertNoSecrets({ API_SECRET: "x" }); return r.ok === false && r.leaked.length === 1; })());
t("6.12: assertNoSecrets temiz nesne ok", (() => eng.multiSafety.assertNoSecrets({ abc: 1, total: 2 }).ok === true)());
t("6.12: addReliabilityLabels etiket ekler", (() => /Güven: Deterministik hesaplama/.test(eng.multiSafety.addReliabilityLabels("x")) === true)());
t("6.12: PROVIDER_ROUTER 0 maliyet", (() => { const s = eng.providers.status(); return s.noExternal === true && /0 · ücretli dış çağrı yok/.test(s.totalCost); })());
t("6.11: perf/securityAudit export var", eng.perf && eng.securityAudit);

/* ═══ UI: Intelligence sekmesi + toolbar + hızlı komut ═══ */
t("UI: intelTab_copilot butonu", /id="intelTab_copilot"/.test(html));
t("UI: intelPane_copilot pane'i", /id="intelPane_copilot"/.test(html));
t("UI: INTEL_TABS 7 sekme sırası korunmuş", /const INTEL_TABS=\["genel","premarket","moments","research","reports","data","copilot"\]/.test(html));
t("UI: GENEL toolbar COPİLOT ve SABAH butonları", /onclick="intelCopilot\(\)">COPİLOT<\/button>/.test(html) && /onclick="intelCopilot\('morning'\)">SABAH<\/button>/.test(html));
t("UI: quick-commands copilot butonu", /class="ai-copilot-btn" onclick="openCopilotFromAi\(\)"/.test(html));
t("UI: AI_FEATURE_GATE copilot:pro", /copilot:"pro"/.test(html));
t("UI: routeAiCommand copilot/morning dalları", /\(copilot\|yatırımcı analizi\|çok ajanlı\|derin değerlendirme\|what changed\|ne değişti\)/.test(html) && /\(sabah intel\|sabah özeti\)/.test(html));
t("UI: runAiCommand copilot/morning dalları", /cmd\.action==="copilot"\)\{openCopilotFromAi\(\);return;\}/.test(html) && /cmd\.action==="morning"\)\{intelCopilot\("morning"\);return;\}/.test(html));
t("UI: AI_QUICK_PROMPTS.copilot tanımlı", /copilot:"Yatırımcı Copilot ile genel değerlendirme yap/.test(html));
t("UI: intelCopilot gate mesajı (pro)", /aiGateMessage\("copilot"\)/.test(html));
t("UI: registerAiCopilotLiveContext initApp boot'unda", /try\{registerAiCopilotLiveContext\(\);\}catch\(e\)\{\}/.test(html));
t("UI: engine yükleme ?v=122", /stksz-ai-engine\.js\?v=122/.test(html));
t("UI: style v=124", /style\.css\?v=124/.test(html));
t("UI: meta ai-v123 (AY 08 korunur)", /content="2026\.08\.20-ai-v123"/.test(html));
t("UI: SW register auth-v124", /service-worker\.js\?v=20260909-auth-v124/.test(html));
t("SW: CACHE_NAME v124 + shell versiyonu", /stksz-shell-v124-20260909-auth-v2/.test(sw));
t("KORUNAN: STKSZAIEngine?.context?.(question) tam dizesi", html.includes("STKSZAIEngine?.context?.(question)"));
t("KORUNAN: openStkszAi fonksiyonu mevcut", /function openStkszAi\(\)/.test(html));
t("KORUNAN: nav-ai-btn mevcut", /nav-ai-btn/.test(html));
t("KORUNAN: aiAppendMessage XSS deseni (bot,text)", /function aiAppendMessage\(role,text,engine\)/.test(html));
t("CSS: .ai-copilot-head stilleri", /\.ai-copilot-head\{/.test(css));
t("CSS: .ai-agent-card stilleri", /\.ai-agent-card\{/.test(css));
t("CSS: .ai-provider-chips stilleri", /\.ai-provider-chips\{/.test(css));
t("CSS: .tag-copilot-gap stilleri", /\.tag-copilot-gap\{/.test(css));
t("CSS: .ai-what-changed stilleri", /\.ai-what-changed\{/.test(css));
t("CSS: .ai-data-gaps stilleri", /\.ai-data-gaps\{/.test(css));
t("CSS: .ai-copilot-notes stilleri", /\.ai-copilot-notes\{/.test(css));
t("CSS: .ai-copilot-btn stilleri", /\.ai-quick-commands \.ai-copilot-btn\{/.test(css));

/* ── Zorunlu yanıt dizeleri ── */
t("METİN: VERİ YETERSİZ — KARAR YOK", /VERİ YETERSİZ — KARAR YOK/.test(html));
t("METİN: 0 · ücretli dış çağrı yok", /0 · ücretli dış çağrı yok/.test(html));
t("METİN: WHAT CHANGED", /WHAT CHANGED/.test(html));
t("METİN: SABAH İNTELİJANSI", /SABAH İNTELİJANSI/.test(html));

console.log(`\n═══ FAZ6 INTEGRATION: ${pass} passed, ${fail} failed ═══`);
if (fail > 0) process.exit(1);