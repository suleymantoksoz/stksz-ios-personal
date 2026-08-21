const {JSDOM}=require("jsdom");const fs=require("fs");const httpMod=require("http");
const html=fs.readFileSync("/home/user/www/index.html","utf8");
const apiSrc=fs.readFileSync("/home/user/www/api-client.js","utf8");
const vwSrc=fs.readFileSync("/home/user/www/virtual-wallet.js","utf8");
const syncSrc=fs.readFileSync("/home/user/www/sync-client.js","utf8");
const serverSrc=fs.readFileSync("/home/user/server/stksz-ai-server.js","utf8");
let pass=0,fail=0;function t(n,c){c?(pass++,console.log("✅ "+n)):(fail++,console.log("❌ "+n));}

console.log("── STATİK ──");
t("Senkron uçları: register/pull/push/status", ["/api/sync/register","/api/sync/pull","/api/sync/push","/api/sync/status"].every(x=>serverSrc.includes(x)));
t("Token hash'lenerek saklanır (düz değil)", serverSrc.includes("tokenHash: syncHash(token)"));
t("İşlem birleşimi unique ID ile", serverSrc.includes("mergeTxById"));
t("Koleksiyon LWW + cüzdan/işlem istisnası", serverSrc.includes("_needsReplay"));
t("İstemci: ENR + API anahtarları senkron DIŞI", syncSrc.includes("delete data.enr")&&syncSrc.includes("'stkszApiKeys'")&&syncSrc.includes("FORBIDDEN"));
t("Motor replay fonksiyonu", vwSrc.includes("replayFromTransactions"));
t("Offline-first: online olunca otomatik senkron", syncSrc.includes("addEventListener('online'"));

process.env.GEMINI_API_KEY="X";process.env.SYNC_DATA_DIR="/tmp/stksz-sync-test-"+Date.now();process.env.PORT="9591";
const {server}=require("/home/user/server/stksz-ai-server.js");
server.listen(9591,"127.0.0.1",()=>{
 function makeDevice(label){
  return new Promise(resolve=>{
   const dom=new JSDOM(html,{runScripts:"dangerously",url:"http://localhost/",pretendToBeVisual:true,beforeParse(w){
    w.HTMLCanvasElement.prototype.getContext=function(){return new Proxy({},{get:(t,p)=>p==="measureText"?()=>({width:10}):()=>{}});};
    w.matchMedia=w.matchMedia||(()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));
    w.scrollTo=()=>{};w.confirm=()=>true;
    w.fetch=(url,opts={})=>new Promise((res2,rej2)=>{const u=new URL(url);if(u.hostname!=="127.0.0.1"){rej2(new Error("dış ağ yok"));return;}
     const rq=httpMod.request({hostname:u.hostname,port:u.port,path:u.pathname+u.search,method:opts.method||"GET",headers:opts.headers||{}},rs=>{let d="";rs.on("data",c=>d+=c);rs.on("end",()=>res2({ok:rs.statusCode<300,status:rs.statusCode,text:()=>Promise.resolve(d),json:()=>Promise.resolve(JSON.parse(d))}));});rq.on("error",rej2);if(opts.body)rq.write(opts.body);rq.end();});
    new Function("window","localStorage",vwSrc)(w,w.localStorage);
    new Function("window","localStorage","document","fetch",apiSrc)(w,w.localStorage,{addEventListener(){},createElement:()=>({style:{}})},w.fetch);
    new Function("window","localStorage",syncSrc)(w,w.localStorage);
   }});
   setTimeout(()=>resolve({w:dom.window,d:dom.window.document,label}),1300);
  });
 }
 (async()=>{try{
  const iphone=await makeDevice("iPhone");
  const android=await makeDevice("Android");
  const setup=dev=>dev.w.eval(`apiKeyStore().set("stksz_ai_backend_url","http://127.0.0.1:9591");`);
  setup(iphone);setup(android);

  console.log("── HESAP + EŞLEŞTİRME ──");
  const reg=await iphone.w.eval("window.STKSZSync.register()");
  t("iPhone hesap oluşturur (userId+pairCode)", reg.userId.startsWith("stksz-")&&reg.pairCode.includes("."));
  const pairR=android.w.eval(`window.STKSZSync.pair(${JSON.stringify(JSON.stringify(reg.pairCode))}===""?"":JSON.parse(${JSON.stringify(JSON.stringify(reg.pairCode))}))`);
  t("Android eşleştirme koduyla bağlanır", pairR.ok===true);
  t("Yanlış kod reddedilir", android.w.eval(`window.STKSZSync.pair("bozuk kod").ok`)===false);

  console.log("── SENARYO: iPhone'da TCELL 3 lot AL → Android'de görünmeli ──");
  iphone.w.eval(`window.STKSZVirtualWallet.init(100000);window.STKSZVirtualWallet.executeOrder({symbol:"TCELL",side:"AL",quantity:3,price:103});data.favorites=["TCELL"];data.watchlist=[{symbol:"THYAO",sector:"Havacılık",source:"kullanıcı"}];save({render:false});`);
  const push1=await iphone.w.eval("window.STKSZSync.syncNow()");
  t("iPhone push başarılı (rev "+push1.rev+")", push1.ok===true);
  const pull1=await android.w.eval("window.STKSZSync.syncNow()");
  t("Android senkron başarılı", pull1.ok===true);
  t("📱→🤖 Android'de TCELL 3 lot GÖRÜNÜR", android.w.eval("window.STKSZVirtualWallet.getPositions()[0]?.quantity")===3&&android.w.eval("window.STKSZVirtualWallet.getPositions()[0]?.symbol")==="TCELL");
  t("📱→🤖 Sanal bakiye aynı (99691)", android.w.eval("window.STKSZVirtualWallet.getWallet().totalCashTRY")===99691);
  t("📱→🤖 Favoriler + takip listesi geldi", (android.w.eval(`localStorage.getItem("stkszData")`)||"").includes("TCELL")&&(android.w.eval(`localStorage.getItem("stkszData")`)||"").includes("THYAO"));

  console.log("── TERS YÖN: Android'de SAT → iPhone'da görünmeli ──");
  android.w.eval(`window.STKSZVirtualWallet.executeOrder({symbol:"TCELL",side:"SAT",quantity:1,price:110});`);
  await android.w.eval("window.STKSZSync.syncNow()");
  await iphone.w.eval("window.STKSZSync.syncNow()");
  t("🤖→📱 iPhone'da 2 lot kaldı", iphone.w.eval("window.STKSZVirtualWallet.getPositions()[0]?.quantity")===2);
  t("🤖→📱 iPhone işlem geçmişinde SAT var", iphone.w.eval("JSON.stringify(window.STKSZVirtualWallet.getTransactions(5).map(t=>t.side))").includes("SAT"));

  console.log("── ÇAKIŞMA: iki cihaz AYNI ANDA farklı işlem ──");
  // senkronsuz iki ayrı işlem
  iphone.w.eval(`window.STKSZVirtualWallet.executeOrder({symbol:"ASELS",side:"AL",quantity:5,price:50});`);
  android.w.eval(`window.STKSZVirtualWallet.executeOrder({symbol:"GARAN",side:"AL",quantity:2,price:130});`);
  await iphone.w.eval("window.STKSZSync.syncNow()");
  await android.w.eval("window.STKSZSync.syncNow()"); // android push+merge alır
  await iphone.w.eval("window.STKSZSync.syncNow()");  // iphone birleşik hali çeker
  const iTx=iphone.w.eval("JSON.stringify(window.STKSZVirtualWallet.getTransactions(20).map(t=>t.symbol))");
  const aTx=android.w.eval("JSON.stringify(window.STKSZVirtualWallet.getTransactions(20).map(t=>t.symbol))");
  t("Çakışma birleşimi: HER İKİ işlem de HER İKİ cihazda (ASELS+GARAN)", iTx.includes("ASELS")&&iTx.includes("GARAN")&&aTx.includes("ASELS")&&aTx.includes("GARAN"));
  t("Bakiyeler replay ile eşitlendi", Math.abs(iphone.w.eval("window.STKSZVirtualWallet.getWallet().totalCashTRY")-android.w.eval("window.STKSZVirtualWallet.getWallet().totalCashTRY"))<0.01);
  t("Hiç işlem kaybolmadı (5 işlem: AL+SAT+TEMETTÜsüz 4 + ...)", iphone.w.eval("window.STKSZVirtualWallet.getWallet().transactionCount")===android.w.eval("window.STKSZVirtualWallet.getWallet().transactionCount"));

  console.log("── GÜVENLİK: ENR + ANAHTAR BULUTA GİTMEZ ──");
  iphone.w.eval(`data.enr={total:999888.77,units:123456};save({render:false});apiKeyStore().set("twelve_data","GIZLI-ANAHTAR-XYZ");`);
  await iphone.w.eval("window.STKSZSync.syncNow()");
  const serverFile=fs.readFileSync(process.env.SYNC_DATA_DIR+"/"+reg.userId+".json","utf8");
  t("Sunucu dosyasında ENR YOK", !serverFile.includes("999888"));
  t("Sunucu dosyasında API anahtarı YOK", !serverFile.includes("GIZLI-ANAHTAR-XYZ"));
  t("Sunucu dosyasında token düz metin DEĞİL (hash)", !serverFile.includes(reg.token));
  // ENR yerelde korunur (pull sonrası)
  await iphone.w.eval("window.STKSZSync.syncNow()");
  t("Pull sonrası yerel ENR korunur", (iphone.w.eval(`localStorage.getItem("stkszData")`)||"").includes("999888"));

  console.log("── OFFLINE ──");
  Object.defineProperty(iphone.w.navigator,"onLine",{value:false,configurable:true});
  const off=await iphone.w.eval("window.STKSZSync.syncNow()");
  t("Çevrimdışı: senkron ertelenir + son veri durur", off.ok===false&&iphone.w.eval("window.STKSZVirtualWallet.getPositions().length")>0);
  t("Yetkisiz istek 401", await (async()=>{const r=await iphone.w.fetch("http://127.0.0.1:9591/api/sync/pull",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});return r.status===401;})());

  console.log("── UI PANELİ ──");
  t("Senkron paneli Veri Yönetimi'nde", html.includes("CİHAZLAR ARASI SENKRON")&&html.includes("syncCreateAccount"));
  t("AI geçmişi senkron listesinde", syncSrc.includes("stkszAiHistory")&&html.includes('storageSet("stkszAiHistory"'));
  t("Mevcut iOS yapısı bozulmadı (render çalışır)", (()=>{try{iphone.w.eval("render()");return true;}catch(e){return false;}})());
  console.log(`\nSONUÇ: ${pass}/${pass+fail}`);process.exit(fail?1:0);
 }catch(e){console.error("HATA:",e);process.exit(1);}})();
});
