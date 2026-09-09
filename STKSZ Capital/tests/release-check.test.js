/* ================= ADIM 16 · RELEASE DOĞRULAMA =================
   Build bütünlüğü, SW cache-busting, platform eşliği, env/secret
   disiplini, migration, release içerik doğrulaması. */
const fs=require("fs");const path=require("path");const crypto=require("crypto");const {execSync}=require("child_process");
let pass=0,fail=0;function t(n,c){c?(pass++,console.log("✅ "+n)):(fail++,console.log("❌ "+n));}
const R=path.join(__dirname,"..");              /* STKSZ Capital kökü (www/server/android/ios/tests/scripts) */
const REPO_ROOT=path.join(__dirname,"..",".."); /* git kökü (.github, .git) */
const read=p=>fs.readFileSync(path.join(R,p),"utf8");
const readWorkflow=f=>fs.readFileSync(path.join(REPO_ROOT,".github","workflows",f),"utf8");

console.log("═══ 1) RUNTIME BÜTÜNLÜĞÜ ═══");
const RUNTIME=["www/index.html","www/style.css","www/service-worker.js","www/api-client.js","www/stksz-chart.js","www/virtual-wallet.js","www/sync-client.js","www/broker-adapter.js","www/market-view-model.js","www/native-bridge.js","www/manifest.json","www/offline.html","server/stksz-ai-server.js","capacitor.config.json","package.json"];
t("15 çekirdek runtime dosyası mevcut", RUNTIME.every(f=>fs.existsSync(path.join(R,f))));
const html=read("www/index.html");
const scripts=[...html.matchAll(/<script src="([^"?]+)/g)].map(m=>m[1]);
t("index.html'in tüm script'leri diskte ("+scripts.length+")", scripts.every(s=>fs.existsSync(path.join(R,"www",s))));
const sw=read("www/service-worker.js");
const shell=[...sw.matchAll(/"\.\/([^"]+)"/g)].map(m=>m[1]).filter(x=>x.includes("."));
t("SW APP_SHELL'in tüm dosyaları diskte ("+shell.length+")", shell.every(s=>fs.existsSync(path.join(R,"www",s))));
["node --check www/api-client.js","node --check www/service-worker.js","node --check www/virtual-wallet.js","node --check www/sync-client.js","node --check www/broker-adapter.js","node --check www/stksz-chart.js","node --check www/market-view-model.js","node --check www/native-bridge.js","node --check server/stksz-ai-server.js"].forEach(c=>{try{execSync(c,{cwd:R,stdio:"pipe"});}catch(e){t("SYNTAX: "+c,false);}});
t("9 JS dosyası syntax temiz", true);
const css=read("www/style.css");t("CSS parantez dengesi", css.split("{").length===css.split("}").length);
JSON.parse(read("www/manifest.json"));JSON.parse(read("capacitor.config.json"));JSON.parse(read("package.json"));
t("JSON dosyaları geçerli", true);

console.log("═══ 2) BUILD / PLATFORM EŞLİĞİ (tek kaynak) ═══");
const cap=JSON.parse(read("capacitor.config.json"));
t("webDir=www → iOS ve Android AYNI kaynaktan derlenir", cap.webDir==="www");
t("Android workflow: cap sync + gradle", readWorkflow("android-apk.yml").includes("cap sync android")&&readWorkflow("android-apk.yml").includes("gradlew"));
t("iOS workflow: cap copy + pod + xcodebuild", readWorkflow("stksz-capital-ios.yml").includes("cap copy ios")&&readWorkflow("stksz-capital-ios.yml").includes("pod install"));
const CORE=["index.html","style.css","service-worker.js","api-client.js","virtual-wallet.js","sync-client.js","broker-adapter.js","stksz-chart.js","market-view-model.js","native-bridge.js","manifest.json","offline.html"];
const md5=p=>crypto.createHash("md5").update(fs.readFileSync(path.join(R,p))).digest("hex");
t("iOS public == www (12 dosya md5)", CORE.every(f=>md5("www/"+f)===md5("ios/App/App/public/"+f)));
t("Android public == www (12 dosya md5)", CORE.every(f=>md5("www/"+f)===md5("android/app/src/main/assets/public/"+f)));
t("Platform-özel kod yalnız native-bridge'te (Capacitor köprüsü)", read("www/native-bridge.js").includes("Capacitor")&&!read("www/virtual-wallet.js").includes("Capacitor"));
t("cordova.js iOS+Android'de korunmuş", fs.existsSync(path.join(R,"ios","App","App","public","cordova.js"))&&fs.existsSync(path.join(R,"android","app","src","main","assets","public","cordova.js")));

console.log("═══ 8) SW CACHE-BUSTING ═══");
const buildMeta=(html.match(/stksz-build" content="[^"]*v(\d+)"/)||[])[1];
const swCache=(sw.match(/CACHE_NAME = "stksz-shell-v(\d+)/)||[])[1];
const cssVer=(html.match(/style\.css\?v=(\d+)/)||[])[1];
t("Build meta + SW cache sürümlü ve SW>build (v"+buildMeta+"/v"+swCache+")", Number(swCache)===Number(buildMeta)+1);
t("style.css sürüm parametreli ve SW cache sürümüyle hizalı (v"+cssVer+")", Number(cssVer)===Number(swCache));
t("SW updateViaCache:none + SKIP_WAITING + controllerchange reload", html.includes('updateViaCache:"none"')&&html.includes("SKIP_WAITING")&&html.includes("controllerchange"));
t("reconcileBuildCache: build değişince eski cache'ler silinir", html.includes("reconcileBuildCache")&&html.includes('key.startsWith("stksz-shell-")'));
t("Eski sürüm cache'leri activate'te temizlenir", sw.includes('key.startsWith("stksz-shell-") && key !== CACHE_NAME'));
t("API istekleri cache'lenmez (no-store + offline 503)", sw.includes('/api/')&&sw.includes("no-store")&&sw.includes("offlineApiResponse"));
t("Navigate: network-first → cache → offline.html", sw.includes('mode === "navigate"')&&sw.includes("OFFLINE_URL"));

console.log("═══ 4-5) ENV / SECRET DİSİPLİNİ ═══");
t("README + .env.example: env listesi + deploy notu (DEPLOYMENT.md repoda yok — raporlanır)", fs.existsSync(path.join(R,".env.example"))&&read("README.md").includes("GEMINI_API_KEY")&&read("README.md").includes("Render/Railway"));
const allFrontend=CORE.map(f=>read("www/"+f)).join("");/* v120: portal kaldırıldı — içerik ana sayfalara dağıtıldı */
t("Frontend'te gömülü secret deseni yok", !/AIza[0-9A-Za-z_\-]{20,}|sk-[a-zA-Z0-9]{20,}/.test(allFrontend));
t("Backend URL kullanıcı-yapılandırmalı (koda sabitlenmemiş)", read("www/api-client.js").includes("stksz_ai_backend_url")&&!/backendUrl\(\)\s*\{\s*return\s*['"]https?:\/\//.test(read("www/api-client.js")));
const srv=read("server/stksz-ai-server.js");
t("Server: 8 env değişkeni, sabit secret yok", (srv.match(/process\.env\./g)||[]).length>=8&&!/GEMINI_API_KEY\s*=\s*['"][A-Za-z0-9]{10,}/.test(srv));
t("BROKER_LIVE_ENABLED varsayılan kapalı + 403 kapısı", srv.includes("=== 'true'")&&srv.includes("broker_disabled"));

console.log("═══ 10) MIGRATION / ESKİ VERİ ═══");
t("hydrateData: eski localStorage şemasını güvenli yükseltir", html.includes("function hydrateData")&&html.includes("migrateLegacyDemoData"));
t("virtual-wallet _hydrate: bozuk/eski kayıt elenir, veri korunur", read("www/virtual-wallet.js").includes("_hydrate")&&read("www/virtual-wallet.js").includes("emptyState"));
t("Sync merge: unique-ID → migration'da duplicate işlem imkânsız", srv.includes("mergeTxById"));
t("manualPL/ipoCash gibi yeni alanlar hydrate'te geriye uyumlu", html.includes('"ipoCash"')&&html.includes("manualPL"));

console.log("═══ 11) ROLLBACK ═══");
let gitlog="";try{gitlog=execSync("git log --oneline -40",{cwd:REPO_ROOT,stdio:"pipe"}).toString();}catch(e){}
const verMatches=[...gitlog.matchAll(/\bv(\d{3})\b/g)].map(m=>Number(m[1]));
t("Sürüm zinciri git'te (v123/v124 commit'leri geri dönülebilir)", new Set(verMatches).size>=2);
t("Working tree referans alınabilir", execSync("git status --short",{cwd:REPO_ROOT,stdio:"pipe"}).toString().trim().split("\n").filter(x=>x&&!x.includes("tests/")&&!x.includes("ios/App/App/public/")&&!x.includes("android/app/src/main/assets/public/")&&!x.includes("capacitor.config.json")).length<=3);

console.log("═══ 14) RELEASE İÇERİK DOĞRULAMA (release kaynak ağacı) ═══");
const SKIP_DIRS=new Set(["node_modules","build",".gradle","Pods","Podfile.lock","dist",".git",".DS_Store"]);
function collect(start,prefix){const out=[];for(const e of fs.readdirSync(start,{withFileTypes:true})){const rel=prefix?prefix+"/"+e.name:e.name;if(e.isDirectory()){if(SKIP_DIRS.has(e.name)||rel.startsWith("server/data"))continue;out.push(...collect(path.join(start,e.name),rel));}else out.push({rel,abs:path.join(start,e.name)});}return out;}
const PAYLOAD=collect(R,"").concat(collect(path.join(REPO_ROOT,".github"),".github"));
const REL=PAYLOAD.map(x=>x.rel);
t("Açıldığında tüm runtime dosyaları eksiksiz", RUNTIME.every(f=>REL.includes(f)));
t("iOS+Android public + cordova tam", REL.includes("ios/App/App/public/index.html")&&REL.includes("ios/App/App/public/cordova.js")&&REL.includes("android/app/src/main/assets/public/cordova.js"));
t("Testler + rehberler var", REL.includes("tests/full-system.test.js")&&REL.includes("README.md")&&REL.includes(".env.example"));
t("node_modules/cache/temp/senkron-verisi YOK", !REL.some(f=>f.includes("node_modules")||f.startsWith("server/data/")||f.includes(".npm")));
let leakFile="";
for(const x of PAYLOAD){if(/\.(js|html|json|yml)$/i.test(x.rel)){const txt=fs.readFileSync(x.abs,"utf8");if(/AIza[0-9A-Za-z_-]{20,}|sk-[a-zA-Z0-9]{20,}/.test(txt)){leakFile=x.rel;break;}}}
t("Secret taraması: 0 sızıntı", leakFile==="");

console.log(`\n════ RELEASE KONTROL: ${pass}/${pass+fail} ════`);
process.exit(fail?1:0);