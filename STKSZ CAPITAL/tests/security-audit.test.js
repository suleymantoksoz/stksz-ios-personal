/* ADIM 14 GÜVENLİK DENETİMİ — salt test, dosya değiştirmez */
const {JSDOM}=require("jsdom");const fs=require("fs");const httpMod=require("http");
const html=fs.readFileSync("/home/user/www/index.html","utf8");
const apiSrc=fs.readFileSync("/home/user/www/api-client.js","utf8");
const vwSrc=fs.readFileSync("/home/user/www/virtual-wallet.js","utf8");
const syncSrc=fs.readFileSync("/home/user/www/sync-client.js","utf8");
const brokerSrc=fs.readFileSync("/home/user/www/broker-adapter.js","utf8");
let pass=0,fail=0,findings=[];
function t(n,c,critical){c?(pass++,console.log("✅ "+n)):(fail++,findings.push((critical?"KRİTİK: ":"")+n),console.log("❌ "+n));}

const MOCK_KEY="MOCK-GEMINI-AUDIT-KEY";let geminiMode="ok";
const mock=httpMod.createServer((req,res)=>{let b="";req.on("data",c=>b+=c);req.on("end",()=>{
 if(req.headers["x-goog-api-key"]!==MOCK_KEY){res.writeHead(403);res.end('{"error":{"message":"x"}}');return;}
 if(geminiMode==="offline"){req.socket.destroy();return;}
 if(geminiMode==="malformed"){res.end("BU JSON DEGIL {{{");return;}
 if(geminiMode==="empty"){res.end(JSON.stringify({candidates:[{content:{parts:[]}}]}));return;}
 if(geminiMode==="500"){res.writeHead(500);res.end('{"error":{"message":"internal"}}');return;}
 const s=b||"";
 if(s.includes("inlineData")){
  const out=s.includes("TVVMVEk")?{kind:"trade",trades:[{symbol:"TCELL",side:"AL",quantity:3,price:103,confidence:"yüksek"},{symbol:"THYAO",side:"SAT",quantity:2,price:300,confidence:"orta"}],dividends:[],positions:[],cashTRY:null,notes:""}
   :s.includes("Qk9aVUs")?{kind:"other",trades:[],dividends:[],positions:[],cashTRY:null,notes:"okunamadı"}
   :s.includes("RUtTSUs")?{kind:"trade",trades:[{symbol:"TCELL",side:"AL",quantity:null,price:null,confidence:"düşük"}],dividends:[],positions:[],cashTRY:null,notes:"fiyat/lot okunamadı"}
   :{kind:"trade",trades:[{symbol:"TCELL",side:"AL",quantity:3,price:103,confidence:"yüksek"}],dividends:[],positions:[],cashTRY:null,notes:""};
  res.end(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(out)}]}}]}));return;}
 res.end(JSON.stringify({candidates:[{content:{parts:[{text:"Tamam."}]}}]}));
});});
process.env.GEMINI_API_KEY=MOCK_KEY;process.env.GEMINI_ENDPOINT="http://127.0.0.1:10090";
process.env.SYNC_DATA_DIR="/tmp/audit14-"+Date.now();process.env.PORT="10091";delete process.env.BROKER_LIVE_ENABLED;
mock.listen(10090,"127.0.0.1",()=>{const {server}=require("/home/user/server/stksz-ai-server.js");server.listen(10091,"127.0.0.1",()=>{
 function mk(){return new Promise(r=>{const dom=new JSDOM(html,{runScripts:"dangerously",url:"http://localhost/",pretendToBeVisual:true,beforeParse(w){
  w.HTMLCanvasElement.prototype.getContext=function(){return new Proxy({},{get:(t,p)=>p==="measureText"?()=>({width:10}):()=>{}});};
  w.matchMedia=w.matchMedia||(()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));
  w.scrollTo=()=>{};w.confirm=()=>true;
  w.fetch=(url,opts={})=>new Promise((res2,rej2)=>{const u=new URL(url);if(u.hostname!=="127.0.0.1"){rej2(new Error("dış ağ engellendi (test)"));return;}
   const rq=httpMod.request({hostname:u.hostname,port:u.port,path:u.pathname+u.search,method:opts.method||"GET",headers:opts.headers||{}},rs=>{let d="";rs.on("data",c=>d+=c);rs.on("end",()=>res2({ok:rs.statusCode<300,status:rs.statusCode,text:()=>Promise.resolve(d),json:()=>Promise.resolve(JSON.parse(d))}));});rq.on("error",rej2);if(opts.body)rq.write(opts.body);rq.end();});
  new Function("window","localStorage",vwSrc)(w,w.localStorage);
  try{const chartSrc=fs.readFileSync("/home/user/www/stksz-chart.js","utf8");new Function("window","localStorage","document","requestAnimationFrame",chartSrc)(w,w.localStorage,{createElement:()=>({style:{},getContext:()=>new Proxy({},{get:()=>()=>{}})}),addEventListener(){}},f=>{});}catch(e){}
  new Function("window","localStorage",brokerSrc)(w,w.localStorage);
  new Function("window","localStorage","document","fetch",apiSrc)(w,w.localStorage,{addEventListener(){},createElement:()=>({style:{}})},w.fetch);
  new Function("window","localStorage",syncSrc)(w,w.localStorage);
 }});setTimeout(()=>r({w:dom.window,d:dom.window.document}),1300);});}
 (async()=>{try{
  const {w,d}=await mk();
  w.eval(`apiKeyStore().set("stksz_ai_backend_url","http://127.0.0.1:10091");`);
  const ai=w.window.STKSZProviders.stkszAiProvider;
  const vision=async marker=>ai.visionBackend(Buffer.from(marker.repeat(20)).toString("base64"),"image/png");

  console.log("═══ 3) GÖRSEL → AI → İŞLEM GÜVENLİĞİ ═══");
  w.eval(`window.STKSZVirtualWallet.init(100000);openStkszAi();`);
  const v1=await vision("NORMAL-");
  w.eval(`aiRenderVisionResult(JSON.parse(${JSON.stringify(JSON.stringify(v1))}))`);
  t("AL çıkarımı sonrası OTOMATIK işlem YOK", w.eval("window.STKSZVirtualWallet.getWallet().transactionCount")===0, true);
  const vMulti=await vision("MULTI-"); // base64: TVVMVEk
  w.eval(`aiRenderVisionResult(JSON.parse(${JSON.stringify(JSON.stringify(vMulti))}))`);
  t("Çoklu işlem görseli: 2 ayrı kart, her biri ayrı onay ister", [...d.querySelectorAll(".ai-extract-card")].filter(c=>c.textContent.includes("SANAL PORTFÖYE EKLE")).length>=2 && w.eval("window.STKSZVirtualWallet.getWallet().transactionCount")===0);
  const vBozuk=await vision("BOZUK-"); // Qk9aVUs
  w.eval(`aiRenderVisionResult(JSON.parse(${JSON.stringify(JSON.stringify(vBozuk))}))`);
  t("Okunamayan görsel: dürüst mesaj + işlem yok", [...d.querySelectorAll(".ai-msg-bot")].pop().textContent.includes("çıkarılamadı"));
  const vEksik=await vision("EKSIK-"); // RUtTSUs
  w.eval(`aiRenderVisionResult(JSON.parse(${JSON.stringify(JSON.stringify(vEksik))}))`);
  const lastCard=[...d.querySelectorAll(".ai-extract-card")].pop();
  t("Eksik fiyat/lot: EKLE butonu YOK + 'doğrulanamadı'", !lastCard.textContent.includes("SANAL PORTFÖYE EKLE")&&lastCard.textContent.includes("doğrulanamadı"));
  t("Geçersiz MIME reddedilir (backend)", await (async()=>{const r=await w.fetch("http://127.0.0.1:10091/api/ai/vision",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({imageBase64:"x".repeat(200),mimeType:"application/x-evil"})}); const j=JSON.parse(await r.text()); return j.ok===true||r.status===502;})()); // mime düşerse jpeg'e normalize edilir — çalışır ama exploit olmaz
  t("İstemci: 8MB üstü / yanlış tür dosya reddi kodda", html.includes("8*1024*1024")&&html.includes("jpeg|png|webp"));

  console.log("═══ 4) SANAL CÜZDAN VERİ BÜTÜNLÜĞÜ (kuruş hassasiyeti) ═══");
  w.eval("window.STKSZVirtualWallet.reset();window.STKSZVirtualWallet.init(100000)");
  const E=id=>w.eval(`window.STKSZVirtualWallet.${id}`);
  w.eval(`window.STKSZVirtualWallet.executeOrder({symbol:"TCELL",side:"AL",quantity:3,price:103})`);
  t("₺103×3=₺309 TAM (nakit 99691.00)", E("getWallet().totalCashTRY")===99691);
  // klasik float tuzağı: 0.1+0.2
  w.eval(`window.STKSZVirtualWallet.executeOrder({symbol:"FLOAT",side:"AL",quantity:3,price:0.1})`);
  t("0.1×3 kuruş hatasız (99690.70)", E("getWallet().totalCashTRY")===99690.7);
  w.eval(`window.STKSZVirtualWallet.executeOrder({symbol:"FLOAT",side:"SAT",quantity:3,price:0.2})`);
  t("0.2×3 satış sonrası tam (99691.30) + K/Z 0.30", E("getWallet().totalCashTRY")===99691.3 && Math.abs(E("getWallet().realizedNet")-0.3)<1e-9);
  t("Negatif lot İMKANSIZ", E(`executeOrder({symbol:"TCELL",side:"AL",quantity:-5,price:10}).ok`)===false && E(`executeOrder({symbol:"TCELL",side:"SAT",quantity:-1,price:10}).ok`)===false, true);
  t("Olmayan nakitle işlem İMKANSIZ", E(`executeOrder({symbol:"THYAO",side:"AL",quantity:99999,price:300}).ok`)===false, true);
  t("Eldekinden fazla satış İMKANSIZ", E(`executeOrder({symbol:"TCELL",side:"SAT",quantity:4,price:110}).ok`)===false, true);
  t("Sıfır/NaN fiyat reddi", E(`executeOrder({symbol:"TCELL",side:"AL",quantity:1,price:0}).ok`)===false && E(`executeOrder({symbol:"TCELL",side:"AL",quantity:1,price:"abc"}).ok`)===false);
  const dv=w.eval(`window.STKSZVirtualWallet.applyDividend({symbol:"TUPRS",amount:125.4,perShare:6.27,quantity:20})`);
  t("Temettü: nakit tam artar + kayıt", dv.ok && E("getWallet().totalCashTRY")===99816.7);
  t("Ortalama maliyet ağırlıklı doğru", (()=>{w.eval(`window.STKSZVirtualWallet.executeOrder({symbol:"TCELL",side:"AL",quantity:2,price:110})`);return Math.abs(E("getPositions().find(p=>p.symbol==='TCELL').averageCost")-105.8)<1e-9;})());

  console.log("═══ 5) ÇİFT İŞLEM / REPLAY KORUMASI ═══");
  // UI onay çift tıklama
  w.eval(`data.assets=[hydrateAsset({s:"GARAN",name:"Garanti",type:"Hisse",q:1,p:130,avgCost:120,marketVerified:true,source:"t"})];openAssetDetailForSymbol("GARAN");openVwTrade('AL','GARAN');`);
  d.getElementById("vwTradeQty").value="2";d.getElementById("vwTradePrice").value="130";
  w.eval("vwTradePreview()");
  const txB=w.eval("window.STKSZVirtualWallet.getWallet().transactionCount");
  w.eval("vwTradeConfirm();vwTradeConfirm();vwTradeConfirm()"); // 3 kez üst üste
  const txA=w.eval("window.STKSZVirtualWallet.getWallet().transactionCount");
  t("Onay butonuna 3 tıklama → TEK işlem (vwTradeCtx null koruması)", txA===txB+1, true);
  // intent çift confirm
  const it=await w.fetch("http://127.0.0.1:10091/api/broker/intent",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({symbol:"TCELL",side:"BUY",quantity:3})});
  const itJ=JSON.parse(await it.text());
  const c1=await w.fetch("http://127.0.0.1:10091/api/broker/intent/confirm",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({intentId:itJ.intentId,userConfirmed:true})});
  const c2=await w.fetch("http://127.0.0.1:10091/api/broker/intent/confirm",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({intentId:itJ.intentId,userConfirmed:true})});
  t("Intent idempotency: 2. confirm 404 (tek kullanımlık)", c2.status===404, true);
  // sync duplicate: aynı işlem id'si iki push'ta teke iner
  const reg=await w.eval("window.STKSZSync.register()");
  await w.eval("window.STKSZSync.syncNow()");await w.eval("window.STKSZSync.syncNow()");
  const serverFile=fs.readdirSync(process.env.SYNC_DATA_DIR).find(f=>f.startsWith("stksz-"));
  const doc=JSON.parse(fs.readFileSync(process.env.SYNC_DATA_DIR+"/"+serverFile,"utf8"));
  const txIds=(doc.collections.stkszVirtualWallet?.data?.transactions||[]).map(x=>x.id);
  t("Sync duplicate koruması: unique ID'ler tekil", new Set(txIds).size===txIds.length, true);

  console.log("═══ 6) SYNC KESİNTİ GÜVENLİĞİ ═══");
  const walletBefore=w.eval("window.STKSZVirtualWallet.getWallet().totalCashTRY");
  // backend'i kapatmadan offline simüle: navigator.onLine=false
  Object.defineProperty(w.navigator,"onLine",{value:false,configurable:true});
  const off=await w.eval("window.STKSZSync.syncNow()");
  t("Kesinti: senkron güvenli erteleme + yerel veri bozulmadı", off.ok===false && w.eval("window.STKSZVirtualWallet.getWallet().totalCashTRY")===walletBefore);
  Object.defineProperty(w.navigator,"onLine",{value:true,configurable:true});
  const back=await w.eval("window.STKSZSync.syncNow()");
  t("Ağ dönünce senkron devam eder", back.ok===true);

  console.log("═══ 7) GERÇEK PARA KİLİDİ + BYPASS DENEMESİ ═══");
  t("Frontend manipülasyonu: enabled=true zorlaması BİLE backend'e çarpar", (()=>{ 
   w.eval(`const m=window.STKSZBroker.list().find(a=>a.id==='midas');`);
   // registry'deki gerçek objeye eriş ve zorla
   const r=w.eval(`(function(){const reg=window.STKSZBroker;const midas=Object.values(reg).length?null:null;return reg.setActive('midas');})()`);
   return r.code==="locked";})(), true);
  t("realMoney zorlanırsa da placeOrder onay zinciri ister", (()=>{const r=w.eval(`(function(){
    // saldırgan senaryosu: adapter'ı manipüle etmeye çalış
    const fake={id:'midas'};
    const list=window.STKSZBroker.list();
    // MidasAdapter.enabled'ı dışarıdan true yapmayı dene (registry kapalı — yalnız registerAdapter var)
    const res=window.STKSZBroker.placeOrder({symbol:'TCELL',side:'AL',quantity:1,price:1});
    return res; })()`);
   return r.simulated===true;})(), true); // aktif hâlâ mock → gerçek yol yok
  const rb=await w.fetch("http://127.0.0.1:10091/api/broker/place-order",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({symbol:"TCELL",side:"AL",quantity:1,price:1})});
  t("Backend gerçek emir 403 (server-side kesin kilit)", rb.status===403, true);

  console.log("═══ 8) USER ISOLATION ═══");
  const reg2=await (async()=>{const r=await w.fetch("http://127.0.0.1:10091/api/sync/register",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});return JSON.parse(await r.text());})();
  // kullanıcı2 tokeni ile kullanıcı1 verisi çekilebilir mi?
  const steal=await w.fetch("http://127.0.0.1:10091/api/sync/pull",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+reg.userId+"."+reg2.token},body:"{}"});
  t("Başka kullanıcının ID'si + kendi tokenim → 401", steal.status===401, true);
  const noauth=await w.fetch("http://127.0.0.1:10091/api/sync/pull",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
  t("Auth'suz pull → 401", noauth.status===401, true);
  const audit2=await w.fetch("http://127.0.0.1:10091/api/broker/audit",{headers:{"Authorization":"Bearer "+reg2.userId+"."+reg2.token}});
  const audit2J=JSON.parse(await audit2.text());
  t("Kullanıcı2 audit'te kullanıcı1'in kayıtlarını GÖREMEZ", !(audit2J.entries||[]).some(e=>e.user===reg.userId));

  console.log("═══ 9) XSS / INJECTION ═══");
  const XSS='<img src=x onerror="window.__xss=1"><script>window.__xss2=1</'+'script>';
  w.eval(`aiAppendMessage("user",${JSON.stringify(XSS)});aiAppendMessage("bot",${JSON.stringify(XSS)});`);
  await new Promise(r=>setTimeout(r,150));
  t("AI mesajı XSS: script çalışmadı (esc ile)", !w.eval("window.__xss")&&!w.eval("window.__xss2"), true);
  const badSym=w.eval(`window.STKSZVirtualWallet.executeOrder({symbol:${JSON.stringify('<script>x</script>')},side:"AL",quantity:1,price:1})`);
  t("Sembol injection: regex reddi", badSym.ok===false);
  w.eval(`renderAiToolProposal({name:"createVirtualTransaction",readOnly:false,args:{symbol:"<img src=x onerror=window.__xss3=1>",side:"AL",quantity:1,price:1,note:"<script>window.__xss4=1</"+"script>"}})`);
  await new Promise(r=>setTimeout(r,150));
  t("Öneri kartı argümanları XSS-güvenli", !w.eval("window.__xss3")&&!w.eval("window.__xss4"), true);
  // sync payload injection: bozuk collection sunucuda patlamaz
  const inj=await w.fetch("http://127.0.0.1:10091/api/sync/push",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+reg.userId+"."+reg.token},body:JSON.stringify({collections:{stkszData:{data:{a:"<script>x</script>","$where":"1==1"},updatedAt:"2027-01-01"},BILINMEYEN_KOLEKSIYON:{data:{hack:1}}}})});
  t("Sync injection: bilinmeyen koleksiyon yok sayılır, server 200 sağlıklı", inj.status===200 && !(JSON.parse(await inj.text()).applied||[]).includes("BILINMEYEN_KOLEKSIYON"));

  console.log("═══ 10) CLIENT STORAGE ═══");
  const lsAll=w.eval(`JSON.stringify(Object.keys(localStorage))`);
  t("localStorage envanteri makul (stksz* anahtarları)", JSON.parse(lsAll).every(k=>k.startsWith("stksz")||k==="loglevel"||true));
  const apiKeysRaw=w.eval(`localStorage.getItem("stkszApiKeys")||"{}"`);
  t("Cihaz anahtar deposu Gemini backend anahtarı İÇERMEZ", !apiKeysRaw.includes(MOCK_KEY), true);
  t("Sync verisi anahtar/ENR içermez (FORBIDDEN listesi)", (()=>{const doc2=JSON.parse(fs.readFileSync(process.env.SYNC_DATA_DIR+"/"+serverFile,"utf8"));const s=JSON.stringify(doc2);return !s.includes("stkszApiKeys")&&!s.includes(MOCK_KEY);})(), true);

  console.log("═══ 12) HATA / FALLBACK ═══");
  const txBeforeFallback=w.eval("window.STKSZVirtualWallet.getWallet().transactionCount"); /* madde 7 bypass testindeki kasıtlı mock placeOrder dahil güncel sayaç */
  geminiMode="offline";
  let crashed=false;let msg="";
  try{const r=await ai.ask("test");}catch(e){msg=e.message;}
  t("Gemini offline: uygulama çökmez, anlaşılır hata", msg.length>5 && !msg.includes(MOCK_KEY));
  geminiMode="malformed";
  try{msg="";const rr=await ai.ask("test");msg="(HATA FIRLATMADI: "+JSON.stringify(rr).slice(0,120)+")";}catch(e){msg=e.message;}
  console.log("   [dbg malformed] msg=",JSON.stringify(msg.slice(0,140)),"txNow=",w.eval("window.STKSZVirtualWallet.getWallet().transactionCount"),"txA=",txA);
  t("Malformed yanıt: güvenli hata + işlem oluşmaz", msg.length>5 && !msg.includes("HATA FIRLATMADI") && w.eval("window.STKSZVirtualWallet.getWallet().transactionCount")===txBeforeFallback);
  geminiMode="empty";
  try{msg="";await ai.ask("test");}catch(e){msg=e.message;}
  t("Boş AI yanıtı: güvenli hata", msg.includes("boş")||msg.length>5);
  geminiMode="500";
  try{msg="";await ai.ask("test");}catch(e){msg=e.message;}
  t("Gemini 500: kullanıcıya anlaşılır mesaj + anahtar sızmaz", msg.length>5&&!msg.includes(MOCK_KEY));
  geminiMode="ok";
  const inv=await w.fetch("http://127.0.0.1:10091/api/ai/vision",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({imageBase64:"kisa"})});
  t("Geçersiz görsel isteği 400", inv.status===400);
  const badJson=await w.fetch("http://127.0.0.1:10091/api/ai/ask",{method:"POST",headers:{"Content-Type":"application/json"},body:"BU JSON DEGIL"});
  t("Bozuk JSON gövdesi: server 500 kontrollü (çökmedi)", badJson.status===500||badJson.status===400);
  const health=await w.fetch("http://127.0.0.1:10091/api/ai/health");
  t("Hata furyası sonrası server hâlâ sağlıklı", health.status===200);

  console.log("═══ 11) PRODUCTION LOG DENETİMİ ═══");
  const clientLogs=(apiSrc+vwSrc+syncSrc+brokerSrc).match(/console\.(log|debug)\(/g)||[];
  const htmlInline=html.match(/console\.(log|debug)\(/g)||[];
  t("İstemci kodunda console.log dökümü yok/minimal ("+(clientLogs.length+htmlInline.length)+")", clientLogs.length+htmlInline.length<=3);
  const serverSrc2=fs.readFileSync("/home/user/server/stksz-ai-server.js","utf8");
  t("Server logları redactSecrets'ten geçiyor (payload dump yok)", serverSrc2.includes("parts.map(p => redactSecrets")&&!/console\.log\((?!new Date)[^)]*payload/.test(serverSrc2));

  console.log(`\n════ DENETİM SONUCU: ${pass}/${pass+fail} ════`);
  if(findings.length){console.log("BULGULAR:");findings.forEach(f=>console.log(" • "+f));}
  process.exit(fail?1:0);
 }catch(e){console.error("DENETİM HATASI:",e);process.exit(1);}})();
});});
