/* ADIM 17 · Sandbox'ta koşulabilen EK kabul kontrolleri:
   production backend yaşam döngüsü, PWA sürüm geçişi, veri bütünlüğü finali */
const {JSDOM}=require("jsdom");const fs=require("fs");const httpMod=require("http");
const html=fs.readFileSync("/home/user/www/index.html","utf8");
const sw=fs.readFileSync("/home/user/www/service-worker.js","utf8");
let pass=0,fail=0;function t(n,c){c?(pass++,console.log("✅ "+n)):(fail++,console.log("❌ "+n));}

console.log("═══ 10) PRODUCTION BACKEND YAŞAM DÖNGÜSÜ ═══");
// GERÇEK sunucu süreci, GEMINI_API_KEY YOK (yeni deploy edilmiş gibi)
delete require.cache[require.resolve("/home/user/server/stksz-ai-server.js")];
process.env.GEMINI_API_KEY="";process.env.SYNC_DATA_DIR="/tmp/acc17-"+Date.now();process.env.PORT="10391";
delete process.env.BROKER_LIVE_ENABLED;delete process.env.GEMINI_ENDPOINT;
const {server}=require("/home/user/server/stksz-ai-server.js");
server.listen(10391,"127.0.0.1",async()=>{
 const call=(p,b,hdr)=>new Promise((res2,rej2)=>{const rq=httpMod.request({hostname:"127.0.0.1",port:10391,path:p,method:b!==undefined?"POST":"GET",headers:Object.assign({"Content-Type":"application/json"},hdr||{})},rs=>{let d="";rs.on("data",c=>d+=c);rs.on("end",()=>res2({status:rs.statusCode,body:d}));});rq.on("error",rej2);if(b!==undefined)rq.write(typeof b==="string"?b:JSON.stringify(b));rq.end();});
 const h=await call("/api/ai/health");
 t("Yeni deploy: health OK + keyConfigured:false dürüst", h.status===200&&h.body.includes('"keyConfigured":false'));
 const ask=await call("/api/ai/ask",{question:"test"});
 t("Anahtar yokken /ask: 503 + kurulum yönlendirmesi (çökme yok)", ask.status===503&&ask.body.includes("environment secret"));
 const bs=await call("/api/broker/status");
 t("Broker status: liveEnabled:false + credentials:false", bs.body.includes('"liveEnabled":false')&&bs.body.includes('"credentialsConfigured":false'));
 const po=await call("/api/broker/place-order",{symbol:"TCELL",side:"AL",quantity:1,price:1});
 t("Gerçek emir: 403 KİLİTLİ (production varsayılanı)", po.status===403);
 const reg=await call("/api/sync/register",{});
 const regJ=JSON.parse(reg.body);
 t("Sync register production'da çalışır (AI anahtarından bağımsız)", regJ.ok===true);
 const pull=await call("/api/sync/pull",{},{Authorization:"Bearer "+regJ.userId+"."+regJ.token});
 t("Sync pull kendi kullanıcısına döner", pull.status===200);
 const steal=await call("/api/sync/pull",{},{Authorization:"Bearer "+regJ.userId+".yanlistoken"});
 t("Yanlış token 401 (izolasyon)", steal.status===401);
 const to=await call("/api/ai/ask","{bozukjson");
 t("Bozuk istek: kontrollü hata (503 anahtar-kapısı da geçerli), süreç ayakta", [400,500,503].includes(to.status)&&(await call("/api/ai/health")).status===200);

 console.log("═══ 11) PWA CACHE SÜRÜM GEÇİŞİ (eski→yeni release) ═══");
 // Cache API simülasyonu: v109 kurulu → v110 SW aktive → eski cache silinmeli
 const cacheStore=new Map();
 const mkCache=()=>({_m:new Map(),async addAll(list){list.forEach(u=>this._m.set(u,"OK"));},async put(k,v){this._m.set(typeof k==="string"?k:k.url,"OK");},async match(k){return this._m.get(typeof k==="string"?k:k.url)||null;}});
 const caches={async open(n){if(!cacheStore.has(n))cacheStore.set(n,mkCache());return cacheStore.get(n);},async keys(){return [...cacheStore.keys()];},async delete(n){return cacheStore.delete(n);},async match(k){for(const c of cacheStore.values()){const r=await c.match(k);if(r)return r;}return null;}};
 // eski sürüm cache'i mevcut
 await (await caches.open("stksz-shell-v109-20260818-ai")).addAll(["./index.html","./style.css"]);
 // yeni SW activate mantığını birebir uygula (service-worker.js'ten)
 const CACHE_NAME=(sw.match(/CACHE_NAME = "([^"]+)"/)||[])[1];
 const keys=await caches.keys();
 await Promise.all(keys.filter(k=>k.startsWith("stksz-shell-")&&k!==CACHE_NAME).map(k=>caches.delete(k)));
 await (await caches.open(CACHE_NAME)).addAll(["./index.html","./style.css"]);
 t("Activate: eski release cache'i SİLİNDİ, yalnız "+CACHE_NAME+" kaldı", (await caches.keys()).length===1&&(await caches.keys())[0]===CACHE_NAME);
 // reconcileBuildCache istemci tarafı: build meta değişince stksz-shell-* temizliği (kod birebir)
 t("İstemci reconcile: build değişiminde tüm shell cache'leri temizler (kod)", html.includes('if(previous&&previous!==build&&"caches" in window)'));
 // offline cache yalnız izinli dosyalar: APP_SHELL'de api/ yok
 const shellList=[...sw.matchAll(/"\.\/([^"]+)"/g)].map(m=>m[1]);
 t("Offline cache yalnız izinli dosyalar (endpoint/secret yok; api-client.js meşru uygulama dosyası)", shellList.every(f=>!f.startsWith("api/")&&!f.includes("secret")&&!f.includes(".env"))&&shellList.length>=20);/* v120: portal 6 dosyası kaldırıldı - eşik bilinçli düşürüldü */

 console.log("═══ 12) VERİ BÜTÜNLÜĞÜ FİNALİ (çift sayım matrisi) ═══");
 const dom=new JSDOM(html,{runScripts:"dangerously",url:"http://localhost/",pretendToBeVisual:true,beforeParse(w){
  w.HTMLCanvasElement.prototype.getContext=function(){return new Proxy({},{get:(t,p)=>p==="measureText"?()=>({width:10}):()=>{}});};
  w.matchMedia=w.matchMedia||(()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));
  w.scrollTo=()=>{};w.fetch=()=>Promise.reject(new Error("offline"));
  const vwSrc=fs.readFileSync("/home/user/www/virtual-wallet.js","utf8");
  new Function("window","localStorage",vwSrc)(w,w.localStorage);
 }});
 const w=dom.window,d=dom.window.document;
 setTimeout(async()=>{try{
  w.eval(`
   fxRates={usdtry:47.9,eurtry:52.1,updated:"",fetchedIso:new Date().toISOString()};
   data.midasCash=963.75;data.midasCashUsd=2.94;data.midasCashEur=1.5;
   data.assets=[hydrateAsset({s:"TCELL",type:"Hisse",q:17,p:6.0529,avgCost:5.9,marketVerified:true,source:"t"}),
                hydrateAsset({s:"OPK30.F",type:"Fon",q:100,p:2.5,avgCost:2,source:"t"})];
   data.manualPL={ipoCash:{value:1708,at:"x"}};
   window.STKSZVirtualWallet.init(50000);
   render();
  `);
  const total=w.eval("calc()");
  const inv=17*6.0529+100*2.5, cashTl=963.75, fx=2.94*47.9+1.5*52.1;
  t("TOPLAM = yatırım+TL+USD+EUR (kuruş): "+total.toFixed(2), Math.abs(total-(inv+cashTl+fx))<0.01);
  t("Sanal 50.000 TOPLAMA KARIŞMADI", total<10000);
  t("Halka arz nakdi (1708) TOPLAMA KARIŞMADI", Math.abs(total-(inv+cashTl+fx))<0.01);
  const cashCard=d.getElementById("portfolioCashValue").textContent;
  t("Nakit kartı = TL+döviz TL (tek kaynak)", cashCard.replace(/[^\d]/g,"")===String(Math.round((cashTl+fx)*100)));
  const hero=parseFloat(d.getElementById("heroInvestments").textContent.replace(/[₺.]/g,"").replace(",","."))+parseFloat(d.getElementById("heroCashTotal").textContent.replace(/[₺.]/g,"").replace(",","."));
  t("Hero kırılımı toplamla tutarlı", Math.abs(hero-total)<1);
  // K/Z ayrımı
  w.eval(`window.STKSZVirtualWallet.executeOrder({symbol:"TCELL",side:"AL",quantity:3,price:103});window.STKSZVirtualWallet.executeOrder({symbol:"TCELL",side:"SAT",quantity:3,price:110});`);
  t("Sanal K/Z (+21) gerçek K/Z alanlarına YAZILMADI", w.eval("data.realizedProfit")===null&&Math.abs(w.eval("window.STKSZVirtualWallet.getWallet().realizedNet")-21)<0.01);

  console.log("═══ 13) GÜVENLİK FİNAL TARAMASI (release ZIP) ═══");
  const {execSync}=require("child_process");
  execSync(`cd /home/user && rm -rf /tmp/zx && mkdir -p /tmp/zx && cd /tmp/zx && unzip -q /home/user/stksz-github-repo.zip`);
  let hits="";
  try{hits=execSync(`grep -rlE "AIza[0-9A-Za-z_-]{20,}|sk-[a-zA-Z0-9]{20,}|BEGIN (RSA |EC )?PRIVATE KEY|ghp_[A-Za-z0-9]{20,}" /tmp/zx 2>/dev/null | head -3`,{stdio:"pipe"}).toString();}catch(e){}
  t("ZIP: Gemini/OpenAI/private-key/token deseni 0", hits.trim()==="");
  let enrHits="";
  const ENR_PROBE=[2,7,1,4,3,7].join("")+"\\|"+[2,2,6,4,2,0].join(""); /* gerçek ENR rakam deseni — düz metin olarak tutulmaz */
  try{enrHits=execSync(`grep -rl "${ENR_PROBE}" /tmp/zx --include="*.js" --include="*.html" --include="*.json" 2>/dev/null | grep -v acceptance-final | head -2`,{stdio:"pipe"}).toString();}catch(e){}
  t("ZIP: ENR kullanıcı verisi 0", enrHits.trim()==="");
  let dbg="";
  try{dbg=execSync(`grep -rn "console\\.log(" /tmp/zx/www/*.js 2>/dev/null | grep -v "server" | head -3`,{stdio:"pipe"}).toString();}catch(e){}
  t("ZIP: www JS'lerinde console.log 0", dbg.trim()==="");
  let testCred="";
  try{testCred=execSync(`grep -rl "MOCK-SECRET\\|TESTKEY123\\|CIHAZ-GIZLI" /tmp/zx/www /tmp/zx/server /tmp/zx/android /tmp/zx/ios 2>/dev/null | head -2`,{stdio:"pipe"}).toString();}catch(e){}
  t("ZIP: runtime'da test credential 0 (yalnız tests/ mock'ları — o da desen, gerçek anahtar değil)", testCred.trim()==="");
  execSync("rm -rf /tmp/zx");

  console.log("═══ 14) PERFORMANS GÖSTERGELERİ ═══");
  const t0=Date.now();for(let i=0;i<30;i++)w.eval("render()");
  const avg=(Date.now()-t0)/30;
  t("30× render ortalama "+avg.toFixed(0)+"ms (<400 jsdom)", avg<400);
  const mem0=process.memoryUsage().heapUsed;
  for(let i=0;i<50;i++)w.eval("render()");
  global.gc&&global.gc();
  const memGrow=(process.memoryUsage().heapUsed-mem0)/1024/1024;
  t("50× render bellek artışı "+memGrow.toFixed(1)+"MB (<50 — leak işareti yok)", memGrow<50);
  const t1=Date.now();["home","portfolio","news","status","risk","opportunities"].forEach(p=>w.eval(`showPage('${p}')`));
  t("6 sayfa geçişi toplam "+(Date.now()-t1)+"ms (<1500)", Date.now()-t1<1500);

  console.log(`\n════ EK KABUL: ${pass}/${pass+fail} ════`);
  process.exit(fail?1:0);
 }catch(e){console.error("HATA:",e);process.exit(1);}},1300);
});
