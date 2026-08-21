/* ================= ADIM 12 · STKSZ TAM SİSTEM TESTİ =================
   Gerçek backend süreci + mock Gemini + iki cihaz (iPhone/Android).
   Her madde gerçek fonksiyon çağrısı ve durum kontrolüyle doğrulanır. */
const {JSDOM}=require("jsdom");const fs=require("fs");const httpMod=require("http");
const html=fs.readFileSync("/home/user/www/index.html","utf8");
const apiSrc=fs.readFileSync("/home/user/www/api-client.js","utf8");
const vwSrc=fs.readFileSync("/home/user/www/virtual-wallet.js","utf8");
const syncSrc=fs.readFileSync("/home/user/www/sync-client.js","utf8");
const brokerSrc=fs.readFileSync("/home/user/www/broker-adapter.js","utf8");
const chartSrc=fs.readFileSync("/home/user/www/stksz-chart.js","utf8");
let pass=0,fail=0;function t(n,c){c?(pass++,console.log((c?"✅":"❌")+" "+n)):(fail++,console.log("❌ "+n));}

const MOCK_KEY="MOCK-GEMINI-SECRET-abc123";
const mock=httpMod.createServer((req,res)=>{let b="";req.on("data",c=>b+=c);req.on("end",()=>{
 if((req.url||"").includes("key=")){res.writeHead(400);res.end('{"error":{"message":"URL key ihlal"}}');return;}
 if(req.headers["x-goog-api-key"]!==MOCK_KEY){res.writeHead(403);res.end('{"error":{"message":"gecersiz"}}');return;}
 const s=b||"";
 if(s.includes("inlineData")){res.end(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({kind:"trade",trades:[{symbol:"TCELL",side:"AL",quantity:3,price:103,totalAmount:309,date:"18.08.2026",currency:"TRY",confidence:"yüksek"}],dividends:[],positions:[],cashTRY:null,notes:"Midas işlem ekranı"})}]}}]}));return;}
 if(s.includes("functionResponse")){
  const markers=["sanalNakitTRY","toplamDeger","gerceklesenNetKZ"].filter(k=>s.includes(k)).join("+");
  const sums=(s.match(/"sanalNakitTRY":([\d.]+)/)||[])[1]||"?";
  res.end(JSON.stringify({candidates:[{content:{parts:[{text:"PORTFÖY RAPORU: sanal nakit "+sums+" TL, alanlar:"+markers+". Bu bir yatırım tavsiyesi değildir."}]}}]}));return;}
 const q=(s.match(/SORU\/GÖREV: ([^"\\]{0,150})/)||[])[1]||"";
 if(q.includes("Portföyüm ne durumda")){res.end(JSON.stringify({candidates:[{content:{parts:[{functionCall:{name:"getVirtualWallet",args:{}}}]}}]}));return;}
 res.end(JSON.stringify({candidates:[{content:{parts:[{text:"Tamam. Bu bir yatırım tavsiyesi değildir."}]}}]}));
});});
process.env.GEMINI_API_KEY=MOCK_KEY;process.env.GEMINI_ENDPOINT="http://127.0.0.1:9990";
process.env.SYNC_DATA_DIR="/tmp/final-sync-"+Date.now();process.env.PORT="9991";
delete process.env.BROKER_LIVE_ENABLED;
mock.listen(9990,"127.0.0.1",()=>{const {server}=require("/home/user/server/stksz-ai-server.js");server.listen(9991,"127.0.0.1",()=>{
 function mkDevice(){return new Promise(r=>{const dom=new JSDOM(html,{runScripts:"dangerously",url:"http://localhost/",pretendToBeVisual:true,beforeParse(w){
  w.HTMLCanvasElement.prototype.getContext=function(){return new Proxy({},{get:(t,p)=>p==="measureText"?()=>({width:10}):()=>{}});};
  w.matchMedia=w.matchMedia||(()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));
  w.scrollTo=()=>{};w.confirm=()=>true;
  w.fetch=(url,opts={})=>new Promise((res2,rej2)=>{const u=new URL(url);if(u.hostname!=="127.0.0.1"){rej2(new Error("dış ağ yok"));return;}
   const rq=httpMod.request({hostname:u.hostname,port:u.port,path:u.pathname+u.search,method:opts.method||"GET",headers:opts.headers||{}},rs=>{let d="";rs.on("data",c=>d+=c);rs.on("end",()=>res2({ok:rs.statusCode<300,status:rs.statusCode,text:()=>Promise.resolve(d),json:()=>Promise.resolve(JSON.parse(d))}));});rq.on("error",rej2);if(opts.body)rq.write(opts.body);rq.end();});
  new Function("window","localStorage",vwSrc)(w,w.localStorage);
  try{new Function("window","localStorage","document","requestAnimationFrame",chartSrc)(w,w.localStorage,{createElement:()=>({style:{},getContext:()=>new Proxy({},{get:()=>()=>{}})}),addEventListener(){}},f=>{});}catch(e){}
  new Function("window","localStorage",brokerSrc)(w,w.localStorage);
  new Function("window","localStorage","document","fetch",apiSrc)(w,w.localStorage,{addEventListener(){},createElement:()=>({style:{}})},w.fetch);
  new Function("window","localStorage",syncSrc)(w,w.localStorage);
 }});setTimeout(()=>r(dom),1300);});}
 (async()=>{try{
  const iDom=await mkDevice();const iW=iDom.window,iD=iDom.window.document; // iPhone
  iW.eval(`apiKeyStore().set("stksz_ai_backend_url","http://127.0.0.1:9991");`);

  console.log("═══ 1) SANAL CÜZDANA ₺100.000 ═══");
  iW.eval(`openUnifiedMenu();openMenuPanel('menuVirtualWallet');document.getElementById("vwStartBalance").value="100000";vwInit();`);
  t("1. Sanal bakiye ₺100.000 (UI'dan kuruldu)", iW.eval("window.STKSZVirtualWallet.getWallet().totalCashTRY")===100000&&iD.getElementById("vwCash").textContent.includes("100.000,00"));

  console.log("═══ 2-4) TCELL 3 lot ₺103 SANAL AL ═══");
  iW.eval(`data.assets=[hydrateAsset({s:"TCELL",name:"Turkcell",type:"Hisse",q:17,p:103,avgCost:100,marketVerified:true,marketChangePct:1.4,source:"test"})];openAssetDetailForSymbol("TCELL");openVwTrade('AL','TCELL');`);
  iD.getElementById("vwTradeQty").value="3";iD.getElementById("vwTradePrice").value="103";
  iW.eval("vwTradePreview()");
  t("2a. Onay öncesi işlem YOK", iW.eval("window.STKSZVirtualWallet.getWallet().transactionCount")===0);
  iW.eval("vwTradeConfirm()");
  t("2b. SANAL AL gerçekleşti (BrokerAdapter üzerinden)", iW.eval("window.STKSZVirtualWallet.getWallet().transactionCount")===1);
  const pos=iW.eval("JSON.stringify(window.STKSZVirtualWallet.getPositions()[0])");
  t("3. Portföyde 3 lot TCELL görünür", JSON.parse(pos).symbol==="TCELL"&&JSON.parse(pos).quantity===3);
  iW.eval("renderVirtualWallet()");
  t("3b. UI pozisyon listesinde TCELL", iD.getElementById("vwPositions").textContent.includes("TCELL"));
  t("4. Nakit doğru düştü: 100.000−309=99.691", iW.eval("window.STKSZVirtualWallet.getWallet().totalCashTRY")===99691&&iD.getElementById("vwCash").textContent.includes("99.691,00"));

  console.log("═══ 5-6) TCELL SATIŞI + K/Z ═══");
  iW.eval(`openVwTrade('SAT','TCELL')`);
  iD.getElementById("vwTradeQty").value="3";iD.getElementById("vwTradePrice").value="110";
  iW.eval("vwTradePreview();vwTradeConfirm()");
  t("5. SANAL SAT gerçekleşti; nakit 99.691+330=100.021", iW.eval("window.STKSZVirtualWallet.getWallet().totalCashTRY")===100021);
  t("6. Gerçekleşen K/Z doğru: (110−103)×3=+21", Math.abs(iW.eval("window.STKSZVirtualWallet.getWallet().realizedNet")-21)<0.01);
  iW.eval("renderVirtualWallet()");
  t("6b. UI'da gerçekleşen net +21,00", iD.getElementById("vwRealizedNet").textContent.includes("21,00"));

  console.log("═══ 7) İŞLEM GEÇMİŞİ ═══");
  const txs=JSON.parse(iW.eval("JSON.stringify(window.STKSZVirtualWallet.getTransactions(10))"));
  t("7. Geçmişte 2 kayıt: SAT ve AL, tüm alanlar dolu", txs.length===2&&txs[0].side==="SAT"&&txs[1].side==="AL"&&txs.every(x=>x.id&&x.timestamp&&x.totalAmount>0));
  t("7b. UI geçmiş listesi 2 satır + rozetler", iD.querySelectorAll("#vwTransactions .vw-tx-row").length===2&&iD.querySelector(".vw-tx-side.buy")&&iD.querySelector(".vw-tx-side.sell"));

  console.log("═══ 8-9) ANDROID AYNI KULLANICI ═══");
  const reg=await iW.eval("window.STKSZSync.register()");
  await iW.eval("window.STKSZSync.syncNow()");
  const aDom=await mkDevice();const aW=aDom.window,aD=aDom.window.document; // Android
  aW.eval(`apiKeyStore().set("stksz_ai_backend_url","http://127.0.0.1:9991");`);
  t("8. Android eşleştirme koduyla giriş", aW.eval(`window.STKSZSync.pair(${JSON.stringify(JSON.stringify(reg.pairCode))}==""?"":JSON.parse(${JSON.stringify(JSON.stringify(reg.pairCode))})).ok`)===true);
  const pull=await aW.eval("window.STKSZSync.syncNow()");
  t("9. Android'de AYNI portföy: bakiye 100.021 + K/Z +21 + 2 işlem", pull.ok&&aW.eval("window.STKSZVirtualWallet.getWallet().totalCashTRY")===100021&&Math.abs(aW.eval("window.STKSZVirtualWallet.getWallet().realizedNet")-21)<0.01&&aW.eval("window.STKSZVirtualWallet.getWallet().transactionCount")===2);

  console.log("═══ 10) AI: 'Portföyüm ne durumda?' ═══");
  iW.eval("openStkszAi()");
  const inp=iD.getElementById("aiQuestionInput");inp.value="Portföyüm ne durumda?";
  await iW.eval("askStkszAi()");await new Promise(r=>setTimeout(r,600));
  const aiReply=[...iD.querySelectorAll(".ai-msg-bot")].pop().textContent;
  t("10. AI gerçek sanal veriyi okudu (getVirtualWallet→100021)", aiReply.includes("100021")&&aiReply.includes("sanalNakitTRY"));

  console.log("═══ 11-13) GÖRSEL → ÇIKARIM → ONAY → GÜNCELLEME ═══");
  const vis=await iW.window.STKSZProviders.stkszAiProvider.visionBackend(Buffer.from("midas-islem-ekrani-".repeat(15)).toString("base64"),"image/png");
  const tr=vis.extraction.trades[0];
  t("11. AI görselden doğru çıkardı: TCELL · 3 lot · ₺103 · ALIM", tr.symbol==="TCELL"&&tr.quantity===3&&tr.price===103&&tr.side==="AL");
  iW.eval(`aiRenderVisionResult(JSON.parse(${JSON.stringify(JSON.stringify(vis))}))`);
  const txBefore=iW.eval("window.STKSZVirtualWallet.getWallet().transactionCount");
  t("12. Kullanıcı onaylamadan işlem OLUŞMADI", txBefore===2);
  const visCard=[...iD.querySelectorAll(".ai-extract-card")].pop();
  visCard.querySelector(".btn.primary").click();
  await new Promise(r=>setTimeout(r,200));
  iW.eval("vwTradeConfirm()");
  t("13. Onaydan sonra sanal portföy güncellendi (3 işlem, TCELL 3 lot, nakit 99.712)", iW.eval("window.STKSZVirtualWallet.getWallet().transactionCount")===3&&iW.eval("window.STKSZVirtualWallet.getPositions()[0].quantity")===3&&iW.eval("window.STKSZVirtualWallet.getWallet().totalCashTRY")===99712);

  console.log("═══ 14) API KEY SIZINTI TARAMASI ═══");
  iW.eval(`apiKeyStore().set("twelve_data","CIHAZ-GIZLI-KEY-777");`);
  const uiDump=iD.documentElement.outerHTML;
  t("14a. UI DOM'da anahtar yok", !uiDump.includes("CIHAZ-GIZLI-KEY-777")&&!uiDump.includes(MOCK_KEY));
  t("14b. AI context'te anahtar yok", !(iW.eval("stkszAiContext()")).includes("CIHAZ-GIZLI-KEY-777"));
  const frontendFiles=[html,apiSrc,vwSrc,syncSrc,brokerSrc,chartSrc].join("");
  t("14c. Frontend kaynak dosyalarında gömülü anahtar yok", !/AIza[0-9A-Za-z_\-]{20,}/.test(frontendFiles)&&!frontendFiles.includes(MOCK_KEY));
  const iosBundle=fs.readdirSync("/home/user/ios/App/App/public").filter(f=>f.endsWith(".js")||f.endsWith(".html")).map(f=>fs.readFileSync("/home/user/ios/App/App/public/"+f,"utf8")).join("");
  const andBundle=fs.readdirSync("/home/user/android/app/src/main/assets/public").filter(f=>f.endsWith(".js")||f.endsWith(".html")).map(f=>fs.readFileSync("/home/user/android/app/src/main/assets/public/"+f,"utf8")).join("");
  t("14d. iOS + Android mobil bundle'da anahtar deseni yok", !/AIza[0-9A-Za-z_\-]{20,}/.test(iosBundle+andBundle));
  const chatHistory=iW.eval(`localStorage.getItem("stkszAiHistory")||""`);
  t("14e. Chat history'de anahtar yok", !chatHistory.includes("CIHAZ-GIZLI-KEY-777")&&!chatHistory.includes(MOCK_KEY));
  const syncDir=process.env.SYNC_DATA_DIR;
  const serverData=fs.readdirSync(syncDir).map(f=>fs.readFileSync(syncDir+"/"+f,"utf8")).join("");
  t("14f. Sunucu kayıtlarında (log/audit/sync) anahtar yok", !serverData.includes("CIHAZ-GIZLI-KEY-777")&&!serverData.includes(MOCK_KEY));

  console.log("═══ 15) GERÇEK PARA İMKANSIZ ═══");
  const ord=await iW.fetch("http://127.0.0.1:9991/api/broker/place-order",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({symbol:"TCELL",side:"AL",quantity:3,price:103})});
  t("15a. Backend gerçek emir kapısı 403", ord.status===403);
  t("15b. MidasAdapter kilitli (setActive=locked)", iW.eval("window.STKSZBroker.setActive('midas').code")==="locked");
  t("15c. Aktif adapter mock, realMoney:false", iW.eval("window.STKSZBroker.active().id")==="mock"&&iW.eval("window.STKSZBroker.active().capabilities.realMoney")===false);
  // intent onaylansa bile
  const it=await iW.fetch("http://127.0.0.1:9991/api/broker/intent",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({symbol:"TCELL",side:"BUY",quantity:3})});
  const itJ=JSON.parse(await it.text());
  const cf=await iW.fetch("http://127.0.0.1:9991/api/broker/intent/confirm",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({intentId:itJ.intentId,userConfirmed:true})});
  t("15d. Kullanıcı onaylasa bile gerçek gönderim 403 + audit", cf.status===403&&(await cf.text()).includes("broker_disabled"));

  console.log("═══ 16) iOS/ANDROID MERKEZİ VERİ ═══");
  await iW.eval("window.STKSZSync.syncNow()");
  await aW.eval("window.STKSZSync.syncNow()");
  t("16. İki cihaz merkezi veriden aynı duruma geldi (3 işlem, bakiye eşit)", aW.eval("window.STKSZVirtualWallet.getWallet().transactionCount")===3&&Math.abs(aW.eval("window.STKSZVirtualWallet.getWallet().totalCashTRY")-iW.eval("window.STKSZVirtualWallet.getWallet().totalCashTRY"))<0.01);
  t("16b. Sunucuda tek kullanıcı dosyası (merkezi database)", fs.readdirSync(syncDir).filter(f=>f.startsWith("stksz-")).length===1);

  console.log("═══ 17) MEVCUT ÖZELLİKLER BOZULMADI ═══");
  iW.eval(`fxRates={usdtry:47.9,eurtry:52.1,updated:"",fetchedIso:new Date().toISOString()};data.midasCash=963.75;data.midasCashUsd=2.94;data.midasCashEur=0;render();`);
  t("17a. Gerçek portföy calc() doğru (USD dahil, sanaldan izole)", Math.abs(iW.eval("calc()")-(17*103+963.75+2.94*47.9))<0.01);
  t("17b. Nakit kırılımı + hero kartlar", iD.getElementById("cashLineTl").textContent.includes("963,75")&&iD.getElementById("portfolioHeroTotal").textContent.includes("₺"));
  ["home","portfolio","news","status","risk","opportunities"].forEach(p=>iW.eval(`showPage('${p}')`));
  t("17c. 6 sayfa navigasyonu çalışır (aktif sayfa: opportunities; rozet v114'te kullanıcı isteğiyle kaldırıldı)", iD.getElementById("page-opportunities").classList.contains("active")&&iD.querySelector('.nav button[data-page="opportunities"]').classList.contains("active"));
  t("17d. Grafik motoru yüklü + panel fonksiyonları", typeof iW.window.STKSZChart?.StkszChart==="function"&&iW.eval("typeof toggleChartFullscreen")==="function");
  t("17e. Haber/risk/K-Z/OCR fonksiyonları duruyor", ["refreshNews","renderRisk","openPlEditor","prepareDataOcr","refreshFxPanel","openCashEditor"].every(f=>iW.eval(`typeof ${f}`)==="function"));
  t("17f. render() son durumda hatasız", (()=>{try{iW.eval("render()");return true;}catch(e){return false;}})());

  console.log(`\n════════ FİNAL SONUÇ: ${pass}/${pass+fail} ════════`);
  process.exit(fail?1:0);
 }catch(e){console.error("HATA:",e);process.exit(1);}})();
});});
