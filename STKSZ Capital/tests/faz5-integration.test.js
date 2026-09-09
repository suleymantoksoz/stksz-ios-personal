"use strict";
const fs = require("fs"), path = require("path");
const R = path.resolve(__dirname, "..");
const read = f => fs.readFileSync(path.join(R, f), "utf8");
let pass = 0, fail = 0;
const t = (name, ok) => { if (ok) { pass++; console.log("  ✅ " + name); } else { fail++; console.log("  ❌ " + name); } };

const html = read("www/index.html");
const css = read("www/style.css");

/* ═══ FAZ5: 5.1 Normal kullanıcıya teknik yapılandırma gizli ═══ */
t("5.1: aiKeyWarning'da 'API Yönetimi' buton/link metni yok", !/API Yönetimi[^]*<\/button>/i.test(html.match(/id="aiKeyWarning"[^]*?<\/div>/i)?.[0] || ""));
t("5.1: askStkszAi empty-key toast'ta 'API Yönetimi' görünmüyor", !/Önce STKSZ AI anahtarı ekle.*API Yönetimi/.test(html));
t("5.1: aiHandleImage error'da 'API Yönetimi → STKSZ AI → AI Backend' yok", !/Menü → API Yönetimi → STKSZ AI → AI Backend URL/.test(html));
t("5.1: aiKeyWarning safe exist (service-ready style message)", /STKSZ AI servisi şu anda hazır değil/.test(html));
t("5.1: syncCreateAccount'ta 'API Yönetimi' teknik detayı yok", !/Önce API Yönetimi → STKSZ AI → Backend URL girin/.test(html));

/* ═══ FAZ5: 5.2 AI Komut Yönlendirme ═══ */
t("5.2: routeAiCommand fonksiyonu mevcut", /function routeAiCommand\(question\)/.test(html));
t("5.2: aiPortfolioSnapshot fonksiyonu mevcut", /function aiPortfolioSnapshot\(\)/.test(html));
t("5.2: runAiCommand fonksiyonu mevcut", /function runAiCommand\(cmd,q\)/.test(html));
t("5.2: __aiSkipRoute flag tanımı mevcut", /let __aiSkipRoute\s*=\s*false/.test(html));
t("5.2: routeAiCommand 'araştır' → research", /\(araştır\|arastır\|derinlemesine\)/.test(html));
t("5.2: routeAiCommand 'rapor' → report", /rapor.*üret.*hazırla.*oluştur.*indir/.test(html));
t("5.2: routeAiCommand 'aktar/import' → import", /aktar.*import.*içe aktar.*yükle/.test(html));
t("5.2: routeAiCommand snapshot = portf + analiz/özet/incele", /analiz\|özet\|incele\|değerlendir\|durum\|summary/.test(html) && /portf/.test(html));

/* ═══ FAZ5: 5.5 AI Research Center ═══ */
t("5.5: openResearchCenter fonksiyonu mevcut", /function openResearchCenter\(symbol\)/.test(html));
t("5.5: closeResearchCenter fonksiyonu mevcut", /function closeResearchCenter\(\)/.test(html));
t("5.5: renderResearchWorkspace fonksiyonu mevcut", /function renderResearchWorkspace\(symbol\)/.test(html));
t("5.5: researchThesisInput textarea mevcut", /id="researchThesisInput"/.test(html));
t("5.5: openResearchFromAi fonksiyonu mevcut", /function openResearchFromAi\(\)/.test(html));
t("5.5: stkszResearchOverlay HTML mevcut", /id="stkszResearchOverlay"/.test(html));
t("5.5: Araştırma overlay badge'inde 'YALNIZCA' ifadesi var", /Yalnız uygulamadaki doğrulanmış veriyle üretilir; kaynağı olmayan değer uydurulmaz/.test(html));

/* ═══ FAZ5: 5.8 Gizlilik + Güvenlik + Kullanıcı Kapsamı ═══ */
t("5.8: aiHistoryKey fonksiyonu mevcut", /function aiHistoryKey\(\)/.test(html));
t("5.8: aiUserScope fonksiyonu mevcut", /function aiUserScope\(\)/.test(html));
t("5.8: aiAppendMessage user-scoped storage kullanıyor (histKey ile)", /const histKey=aiHistoryKey\(\)/.test(html));
t("5.8: askStkszAi bot yanıtına güvenlik cümlesi ekleniyor", /tavsiye\|bu bilgilendirmedir/.test(html));
t("5.8: openStkszAi disclaimer 'yatırım tavsiyesi değildir' içeriyor", /Yanıtlar bilgilendirme amaçlıdır, yatırım tavsiyesi değildir/.test(html));
t("5.8: authState guard: typeof authState !== 'undefined'", /typeof authState!==\"undefined\"/.test(html));

/* ═══ FAZ5: 5.9 AI Rol Kapıları ═══ */
t("5.9: aiRoleLevel fonksiyonu mevcut", /function aiRoleLevel\(\)/.test(html));
t("5.9: AI_FEATURE_GATE objesi mevcut", /const AI_FEATURE_GATE\s*=/.test(html));
t("5.9: aiAllowed fonksiyonu mevcut", /function aiAllowed\(feature\)/.test(html));
t("5.9: aiGateMessage fonksiyonu mevcut", /function aiGateMessage\(feature\)/.test(html));
t("5.9: research kapısı pro seviyesinde", /research.*\"pro\"/.test(html));
t("5.9: ask kapısı guest seviyesinde", /ask.*\"guest\"/.test(html));
t("5.9: askStkszAi'da aiAllowed('ask') kontrolü var", /aiAllowed\(\"ask\"\)/.test(html));
t("5.9: aiHandleImage'da aiAllowed('image') kontrolü var", /aiAllowed\(\"image\"\)/.test(html));

/* ═══ FAZ5: 5.7 No-Change Rapor Guard ═══ */
t("5.7: generateAndSendReport opts parametresi alıyor", /function generateAndSendReport\(type,opts\)/.test(html));
t("5.7: no-change guard sig === scheduledReports[lastKey] kontrolü var", /scheduledReports\[lastKey\]===sig/.test(html) || /unchanged.*skip.*no value change/.test(html));
t("5.7: preview parametresi var", /opts&&opts.preview/.test(html) || /const preview=Boolean\(opts&&opts\.preview\)/.test(html));
t("5.7: preview'da bildirim gönderilmiyor", /if\(unchanged&&!preview\)/.test(html));

/* ═══ FAZ5: 5.11 Unified Intelligence Center ═══ */
t("5.11: openIntelligenceCenter fonksiyonu (stub değil, overlay açar)", /function openIntelligenceCenter\(\)[\s\S]{0,200}stkszIntelOverlay/.test(html));
t("5.11: closeIntelligenceCenter fonksiyonu mevcut", /function closeIntelligenceCenter\(\)/.test(html));
t("5.11: openIntelTab fonksiyonu mevcut", /function openIntelTab\(tab\)/.test(html));
t("5.11: stkszIntelOverlay HTML mevcut", /id="stkszIntelOverlay"/.test(html));
t("5.11: 6 sekme butonu mevcut (genel/premarket/moments/research/reports/data)", /intelTab_genel.*intelTab_premarket.*intelTab_moments.*intelTab_research.*intelTab_reports.*intelTab_data/s.test(html));
t("5.11: intelSchedLast elementi mevcut", /id="intelSchedLast"/.test(html));
t("5.11: Intelligence overlay AI overlay'den açılır (AI butonu mevcut)", /ai-intel-btn.*openIntelligenceCenter/.test(html));
t("5.11: renderIntelOverview fonksiyonu mevcut", /function renderIntelOverview\(\)/.test(html));
t("5.11: intelData fonksiyonu mevcut", /function intelData\(\)/.test(html));
t("5.11: intelReports fonksiyonu mevcut", /function intelReports\(\)/.test(html));

/* ═══ FAZ5: 5.4 Pre-Market + Kaynak/Zaman/Güven ═══ */
t("5.4: renderPreMarketBriefing opsiyonel targetEl alıyor", /function renderPreMarketBriefing\(briefing,targetEl\)/.test(html));
t("5.4: generatePreMarketBriefing opsiyonel targetEl alıyor", /function generatePreMarketBriefing\(targetEl\)/.test(html));
t("5.4: renderPreMarketBriefing pre-market-meta satırı var", /pre-market-meta/.test(html));
t("5.4: premarket 'doğrulanmış'/'güncel değil' güven etiketi mevcut", /doğrulanmış.*güncel değil/.test(html));
t("5.4: renderKeyMomentsOnChart opsiyonel canvasEl alıyor", /function renderKeyMomentsOnChart\(symbol,moments,closes,canvasEl\)/.test(html));
t("5.4: renderMovementTimeline opsiyonel containerEl alıyor", /function renderMovementTimeline\(symbol,timeline,containerEl\)/.test(html));
t("5.4: renderMovementTimeline boş timeline'da sahte veri mesajı", /sahte hareket üretilmedi/.test(html));

/* ═══ FAZ5: 5.3 Rapor Veri Durumu Satırı ═══ */
t("5.3: generateAndSendReport rapora veri durumu satırı ekliyor", /Veri durumu:.*doğrulanmış.*piyasa verisi güncel değil/.test(html));

/* ═══ FAZ5: 5.2 AI Chip + Prompt ═══ */
t("5.2: AI_QUICK_PROMPTS radar girişi mevcut", /radar.*Radar göstergelerimi özetle/.test(html));
t("5.2: AI_QUICK_PROMPTS portfolioimport girişi mevcut", /portfolioimport.*içe aktarmalıyım/.test(html));
t("5.2: AI_QUICK_TRACK dışında radar/portfolioimport butonları (test bustluk)", /ai-quick-commands/.test(html) && /askStkszAi\('radar'\)/.test(html) && /askStkszAi\('portfolioimport'\)/.test(html));
t("5.2: openResearchFromAi butonu quick commands'de", /openResearchFromAi\(\)/.test(html));

/* ═══ FAZ5: CSS ═══ */
t("CSS: .ai-intel-btn stilleri mevcut", /\.ai-intel-btn\{/.test(css));
t("CSS: .research-section stilleri mevcut", /\.research-section\{/.test(css));
t("CSS: .intel-tabs stilleri mevcut", /\.intel-tabs\{/.test(css));
t("CSS: .intel-kpi-row stilleri mevcut", /\.intel-kpi-row\{/.test(css));
t("CSS: .provider-chip stilleri mevcut", /\.provider-chip\{/.test(css));
t("CSS: .ai-quick-commands stilleri mevcut", /\.ai-quick-commands\{/.test(css));
t("CSS: light tema research/intel uyumu", /body\[data-theme="light"\]\s+\.\s*research-section/.test(css) && /body\[data-theme="light"\]\s+\.\s*intel-kpi/.test(css));

/* ═══ FAZ5: Eski test-stringleri korundu ═══ */
t("KORUNAN: STKSZAIEngine?.context?.(question) dizesi mevcut", html.includes("STKSZAIEngine?.context?.(question)") || html.includes("STKSZAIEngine?.context?.(question)"));
t("KORUNAN: openStkszAi fonksiyonu hâlâ mevcut", /function openStkszAi\(\)/.test(html));
t("KORUNAN: aiAppendMessage fonksiyonu hâlâ mevcut", /function aiAppendMessage\(role,text,engine\)/.test(html));
t("KORUNAN: aiRedactSecrets fonksiyonu hâlâ mevcut", /function aiRedactSecrets\(text\)/.test(html));
t("KORUNAN: aiBusy global flag hâlâ mevcut", /let aiBusy\s*=\s*false/.test(html));

console.log(`\n═══ FAZ5 INTEGRATION: ${pass} passed, ${fail} failed ═══`);
if (fail > 0) process.exit(1);
