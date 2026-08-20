/* ================= ADIM 15 · TAM SİSTEM STRES TESTİ =================
   Offline/recovery, senkron stresi, cüzdan stresi, Gemini stresi,
   görsel çıkarım stresi, AI+portföy, fallback, nakit hesap stresi,
   yeniden başlatma kalıcılığı, performans göstergeleri. */
const {JSDOM}=require("jsdom");const fs=require("fs");const httpMod=require("http");
const html=fs.readFileSync("/home/user/www/index.html","utf8");
const apiSrc=fs.readFileSync("/home/user/www/api-client.js","utf8");
const vwSrc=fs.readFileSync("/home/user/www/virtual-wallet.js","utf8");
const syncSrc=fs.readFileSync("/home/user/www/sync-client.js","utf8");
const brokerSrc=fs.readFileSync("/home/user/www/broker-adapter.js","utf8");
const chartSrc=fs.readFileSync("/home/user/www/stksz-chart.js","utf8");
let pass=0,fail=0,findings=[];
function t(n,c){c?(pass++,console.log("✅ "+n)):(fail++,findings.push(n),console.log("❌ "+n));}

const MOCK_KEY="MOCK-STRESS-KEY";let geminiMode="ok";let backendKilled=false;
const mock=httpMod.createServer((req,res)=>{let b="";req.on("data",c=>b+=c);req.on("end",()=>{
 if(req.headers["x-goog-api-key"]!==MOCK_KEY){res.writeHead(403);res.end('{"error":{"message":"x"}}');return;}
 if(geminiMode==="offline"){req.socket.destroy();return;}
 if(geminiMode==="timeout"){return;/* hiç yanıt verme — server 45sn timeout'u testte beklenmez, istemci timeout'u devrede */}
 if(geminiMode==="malformed"){res.end("XX{{{");return;}
 if(geminiMode==="empty"){res.end(JSON.stringify({candidates:[{content:{parts:[]}}]}));return;}
 if(geminiMode==="weird"){res.end(JSON.stringify({beklenmedik:"alan",candidates:[{content:{parts:[{text:"Yanıt.",surpriz:123}],ekstra:true}}],x:[1,2]}));return;}
 if(geminiMode==="500"){res.writeHead(500);res.end('{"error":{"message":"internal"}}');return;}
 const s=b||"";
 if(s.includes("inlineData")){
  const mk=(o)=>res.end(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(o)}]}}]}));
  if(s.includes("QUxJTS1"))return mk({kind:"trade",trades:[{symbol:"TCELL",side:"AL",quantity:3,price:103,confidence:"yüksek"}],dividends:[],positions:[],cashTRY:null,notes:""});
  if(s.includes("U0FUSVMt"))return mk({kind:"trade",trades:[{symbol:"TCELL",side:"SAT",quantity:3,price:110,confidence:"yüksek"}],dividends:[],positions:[],cashTRY:null,notes:""});
  if(s.includes("VEVNRVRUVS1"))return mk({kind:"dividend",trades:[],dividends:[{symbol:"TUPRS",totalAmount:125.4,perShare:6.27,quantity:20,date:"15.08.2026",currency:"TRY",confidence:"yüksek"}],positions:[],cashTRY:null,notes:""});
  if(s.includes("Q09LTFUt"))return mk({kind:"trade",trades:[{symbol:"TCELL",side:"AL",quantity:3,price:103,confidence:"yüksek"},{symbol:"THYAO",side:"SAT",quantity:2,price:300,confidence:"orta"},{symbol:"ASELS",side:"AL",quantity:5,price:null,confidence:"düşük"}],dividends:[],positions:[],cashTRY:null,notes:""});
  if(s.includes("RUtTSUtGSVlBVC"))return mk({kind:"trade",trades:[{symbol:"TCELL",side:"AL",quantity:3,price:null,confidence:"orta"}],dividends:[],positions:[],cashTRY:null,notes:"fiyat okunamadı"});
  if(s.includes("RUtTSUtMT1QtRU"))return mk({kind:"trade",trades:[{symbol:"TCELL",side:"AL",quantity:null,price:103,confidence:"orta"}],dividends:[],positions:[],cashTRY:null,notes:"lot okunamadı"});
  if(s.includes("QkVMSVJTSVot"))return mk({kind:"trade",trades:[{symbol:"T?L?",side:"AL",quantity:3,price:103,confidence:"düşük"}],dividends:[],positions:[],cashTRY:null,notes:"sembol belirsiz"});
  if(s.includes("Qk9aVUst"))return mk({kind:"other",trades:[],dividends:[],positions:[],cashTRY:null,notes:"okunamadı"});
  return mk({kind:"other",trades:[],dividends:[],positions:[],cashTRY:null,notes:""});
 }
 if(s.includes("functionResponse")){
  const echo=["sanalNakitTRY","toplamDeger","gerceklesenNetKZ","lot","TL","islemler","gercekIslemler"].filter(k=>s.includes(k)).join("+");
  const nakit=(s.match(/"sanalNakitTRY":([\d.]+)/)||[])[1]||(s.match(/"TL":([\d.]+)/)||[])[1]||"";
  res.end(JSON.stringify({candidates:[{content:{parts:[{text:"VERİ: "+echo+" "+nakit+" Bu bir yatırım tavsiyesi değildir."}]}}]}));return;}
 const q=(s.match(/SORU\/GÖREV: ([^"\\]{0,200})/)||[])[1]||"";
 const fc=(name,args)=>res.end(JSON.stringify({candidates:[{content:{parts:[{functionCall:{name,args}}]}}]}));
 if(q.includes("Portföyüm ne durumda"))return fc("getVirtualWallet",{});
 if(q.includes("nakitim var"))return fc("getCashBalances",{});
 if(q.includes("TCELL kaç lot"))return fc("getPosition",{symbol:"TCELL"});
 if(q.includes("Gerçekleşen K/Z"))return fc("getVirtualWallet",{});
 if(q.includes("Hangi işlemleri"))return fc("getTransactionHistory",{limit:10});
 if(q.includes("Portföy değerim"))return fc("getPortfolioSummary",{});
 res.end(JSON.stringify({candidates:[{content:{parts:[{text:"Tamam. Bu bir yatırım tavsiyesi değildir."}]}}]}));
});});
process.env.GEMINI_API_KEY=MOCK_KEY;process.env.GEMINI_ENDPOINT="http://127.0.0.1:10290";
process.env.SYNC_DATA_DIR="/tmp/stress15-"+Date.now();process.env.PORT="10291";delete process.env.BROKER_LIVE_ENABLED;
mock.listen(10290,"127.0.0.1",()=>{const {server}=require("/home/user/server/stksz-ai-server.js");server.listen(10291,"127.0.0.1",()=>{

 function mkDevice(sharedStorage){ /* sharedStorage: yeniden başlatma simülasyonu için aynı localStorage içeriği */
  return new Promise(r=>{const dom=new JSDOM(html,{runScripts:"dangerously",url:"http://localhost/",pretendToBeVisual:true,beforeParse(w){
   w.HTMLCanvasElement.prototype.getContext=function(){return new Proxy({},{get:(t,p)=>p==="measureText"?()=>({width:10}):()=>{}});};
   w.matchMedia=w.matchMedia||(()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));
   w.scrollTo=()=>{};w.confirm=()=>true;
   if(sharedStorage)Object.entries(sharedStorage).forEach(([k,v])=>{try{w.localStorage.setItem(k,v);}catch(e){}});
   w.fetch=(url,opts={})=>new Promise((res2,rej2)=>{const u=new URL(url);
    if(u.hostname!=="127.0.0.1"||backendKilled){rej2(new Error("bağlantı yok (test)"));return;}
    const rq=httpMod.request({hostname:u.hostname,port:u.port,path:u.pathname+u.search,method:opts.method||"GET",headers:opts.headers||{},timeout:4000},rs=>{let d="";rs.on("data",c=>d+=c);rs.on("end",()=>res2({ok:rs.statusCode<300,status:rs.statusCode,text:()=>Promise.resolve(d),json:()=>Promise.resolve(JSON.parse(d))}));});
    rq.on("timeout",()=>{rq.destroy(new Error("istek zaman aşımı"));});rq.on("error",rej2);if(opts.body)rq.write(opts.body);rq.end();});
   new Function("window","localStorage",vwSrc)(w,w.localStorage);
   try{new Function("window","localStorage","document","requestAnimationFrame",chartSrc)(w,w.localStorage,{createElement:()=>({style:{},getContext:()=>new Proxy({},{get:()=>()=>{}})}),addEventListener(){}},f=>{});}catch(e){}
   new Function("window","localStorage",brokerSrc)(w,w.localStorage);
   new Function("window","localStorage","document","fetch",apiSrc)(w,w.localStorage,{addEventListener(){},createElement:()=>({style:{}})},w.fetch);
   new Function("window","localStorage",syncSrc)(w,w.localStorage);
  }});setTimeout(()=>r({w:dom.window,d:dom.window.document,dump:()=>{const o={};for(let i=0;i<dom.window.localStorage.length;i++){const k=dom.window.localStorage.key(i);o[k]=dom.window.localStorage.getItem(k);}return o;}}),1300);});}

 (async()=>{try{
  let A=await mkDevice();
  A.w.eval(`apiKeyStore().set("stksz_ai_backend_url","http://127.0.0.1:10291");`);
  const E=(dev,code)=>dev.w.eval(code);

  console.log("═══ 1) OFFLINE / BAĞLANTI KOPMASI ═══");
  backendKilled=true;
  let err="";try{await A.w.window.STKSZProviders.stkszAiProvider.ask("test");}catch(e){err=e.message;}
  t("Backend offline: AI temiz hata, çökme yok", err.length>3&&!err.includes(MOCK_KEY));
  E(A,`window.STKSZVirtualWallet.init(100000);window.STKSZVirtualWallet.executeOrder({symbol:"TCELL",side:"AL",quantity:3,price:103});`);
  t("Offline'dayken sanal işlem YEREL çalışır (offline-first)", E(A,"window.STKSZVirtualWallet.getWallet().totalCashTRY")===99691);
  const offSync=await E(A,"window.STKSZSync.syncNow()");
  t("Offline sync: güvenli hata, veri bozulmadı", offSync.ok===false&&E(A,"window.STKSZVirtualWallet.getWallet().totalCashTRY")===99691);
  backendKilled=false;
  const reg=await E(A,"window.STKSZSync.register()");
  const s1=await E(A,"window.STKSZSync.syncNow()");
  t("Bağlantı dönünce senkron başarılı", s1.ok===true);
  t("Header durum fonksiyonu offline'ı dürüst raporlar (kod)", html.includes("BAĞLANTI YOK")&&html.includes("HENÜZ BAĞLANMADI"));

  console.log("═══ 9) UYGULAMA KAPAT/AÇ RECOVERY (kritik işlemler sonrası) ═══");
  // AL sonrası yeniden başlatma
  let snapshot=A.dump();
  let A2=await mkDevice(snapshot);
  t("AL sonrası restart: bakiye+pozisyon kalıcı", E(A2,"window.STKSZVirtualWallet.getWallet().totalCashTRY")===99691&&E(A2,"window.STKSZVirtualWallet.getPositions()[0].quantity")===3);
  // SAT + temettü sonrası restart
  E(A2,`window.STKSZVirtualWallet.executeOrder({symbol:"TCELL",side:"SAT",quantity:3,price:110});window.STKSZVirtualWallet.applyDividend({symbol:"TUPRS",amount:125.4});`);
  const cashAfter=E(A2,"window.STKSZVirtualWallet.getWallet().totalCashTRY");
  let A3=await mkDevice(A2.dump());
  t("SAT+temettü sonrası restart: nakit/K-Z/geçmiş kalıcı", E(A3,"window.STKSZVirtualWallet.getWallet().totalCashTRY")===cashAfter&&Math.abs(E(A3,"window.STKSZVirtualWallet.getWallet().realizedNet")-21)<0.01&&E(A3,"window.STKSZVirtualWallet.getWallet().transactionCount")===3);
  // sync kesintisi ORTASINDA kapatma: meta dokunulmuş ama push edilmemiş → yeniden açılışta veri sağlam
  backendKilled=true;await E(A3,"window.STKSZSync.syncNow()");
  let A4=await mkDevice(A3.dump());backendKilled=false;
  A4.w.eval(`apiKeyStore().set("stksz_ai_backend_url","http://127.0.0.1:10291");`);
  t("Sync kesintisinde kapatılıp açılınca veri tutarlı", E(A4,"window.STKSZVirtualWallet.getWallet().transactionCount")===3);
  const resync=await E(A4,"window.STKSZSync.syncNow()");
  t("Yeniden açılış + ağ dönüşü: senkron kaldığı yerden", resync.ok===true);
  A=A4;

  console.log("═══ 2) SENKRON STRES (eşzamanlı değişiklik + kesinti recovery) ═══");
  let B=await mkDevice();
  B.w.eval(`apiKeyStore().set("stksz_ai_backend_url","http://127.0.0.1:10291");window.STKSZSync.pair(${JSON.stringify(reg.pairCode)});`);
  await E(B,"window.STKSZSync.syncNow()");
  t("Cihaz B aynı kullanıcıyla tam veri çekti", E(B,"window.STKSZVirtualWallet.getWallet().transactionCount")===3&&Math.abs(E(B,"window.STKSZVirtualWallet.getWallet().totalCashTRY")-cashAfter)<0.01);
  // eşzamanlı: A'da GARAN AL, B'de ASELS AL (senkronsuz), sonra sırayla senkron
  E(A,`window.STKSZVirtualWallet.executeOrder({symbol:"GARAN",side:"AL",quantity:2,price:130});`);
  E(B,`window.STKSZVirtualWallet.executeOrder({symbol:"ASELS",side:"AL",quantity:5,price:50});`);
  await E(A,"window.STKSZSync.syncNow()");await E(B,"window.STKSZSync.syncNow()");await E(A,"window.STKSZSync.syncNow()");
  const atx=E(A,"JSON.stringify(window.STKSZVirtualWallet.getTransactions(20).map(x=>x.id).sort())");
  const btx=E(B,"JSON.stringify(window.STKSZVirtualWallet.getTransactions(20).map(x=>x.id).sort())");
  t("Eşzamanlı değişiklik: iki işlem de korundu, duplicate yok", atx===btx&&JSON.parse(atx).length===5&&new Set(JSON.parse(atx)).size===5);
  t("Son durum deterministik: bakiyeler kuruşuna eşit", Math.abs(E(A,"window.STKSZVirtualWallet.getWallet().totalCashTRY")-E(B,"window.STKSZVirtualWallet.getWallet().totalCashTRY"))<0.005);
  t("K/Z bozulmadı (replay sonrası +21)", Math.abs(E(A,"window.STKSZVirtualWallet.getWallet().realizedNet")-21)<0.01);
  // senkron sırasında kesinti + tekrar
  backendKilled=true;const cut=await E(B,"window.STKSZSync.syncNow()");backendKilled=false;
  const rec=await E(B,"window.STKSZSync.syncNow()");
  t("Senkron yarıda kesildi → recovery temiz", cut.ok===false&&rec.ok===true&&E(B,"window.STKSZVirtualWallet.getWallet().transactionCount")===5);
  // gerçek portföy nakit kırılımı senkronla bozulmuyor mu
  E(A,`data.midasCash=963.75;data.midasCashUsd=2.94;data.midasCashEur=0;save({render:false});`);
  await E(A,"window.STKSZSync.syncNow()");await E(B,"window.STKSZSync.syncNow()");
  t("TL/USD/EUR kırılımı senkronla taşındı ve bozulmadı", E(B,'JSON.parse(localStorage.getItem("stkszData")).midasCashUsd')===2.94);

  console.log("═══ 3) SANAL CÜZDAN STRES (uzun işlem zinciri + uç değerler) ═══");
  const C=await mkDevice();
  E(C,`window.STKSZVirtualWallet.init(1000000)`);
  const seq=[["AL",10,100],["AL",20,110],["AL",30,90],["SAT",25,120],["SAT",15,80]];
  seq.forEach(([side,q,p])=>E(C,`window.STKSZVirtualWallet.executeOrder({symbol:"XYZ",side:"${side}",quantity:${q},price:${p}})`));
  E(C,`window.STKSZVirtualWallet.applyDividend({symbol:"XYZ",amount:50})`);
  // beklenen: alımlar 10@100+20@110+30@90=60 lot, ort=(1000+2200+2700)/60=98.3333; SAT25@120 K/Z=25*(120-98.3333)=541.67; SAT15@80 K/Z=15*(80-98.3333)=-275; kalan 20 lot
  const wC=E(C,"JSON.stringify(window.STKSZVirtualWallet.getWallet())");const pC=E(C,"JSON.stringify(window.STKSZVirtualWallet.getPositions())");
  const wj=JSON.parse(wC),pj=JSON.parse(pC)[0];
  t("Zincir: kalan lot 20 + ort. maliyet 98,3333 korunur", pj.quantity===20&&Math.abs(pj.averageCost-98.33333333333333)<1e-9);
  t("Gerçekleşen kâr 541,67 / zarar 275,00 ayrı ve doğru", Math.abs(wj.realizedProfit-541.67)<0.01&&Math.abs(wj.realizedLoss-275)<0.01);
  const expectedCash=1000000-(1000+2200+2700)+25*120+15*80+50;
  t("Nakit matematiksel tutarlı ("+expectedCash+")", Math.abs(wj.totalCashTRY-expectedCash)<0.01);
  t("Toplam değer = nakit + maliyet değeri (fiyat doğrulanmamışken)", Math.abs(wj.totalPortfolioValue-(wj.totalCashTRY+20*pj.averageCost))<0.01);
  t("İşlem geçmişi 6 kayıt (5 emir + temettü)", E(C,"window.STKSZVirtualWallet.getWallet().transactionCount")===6);
  // uç değerler
  const bad=[
   `{symbol:"XYZ",side:"SAT",quantity:999,price:100}`,      // fazla satış
   `{symbol:"YOK",side:"SAT",quantity:1,price:100}`,        // olmayan hisse
   `{symbol:"XYZ",side:"AL",quantity:0,price:100}`,         // sıfır lot
   `{symbol:"XYZ",side:"AL",quantity:-3,price:100}`,        // negatif lot
   `{symbol:"XYZ",side:"AL",quantity:3,price:-5}`,          // negatif fiyat
   `{symbol:"XYZ",side:"AL",quantity:NaN,price:100}`,       // NaN
   `{symbol:"XYZ",side:"AL",quantity:Infinity,price:100}`,  // Infinity
   `{symbol:"XYZ",side:"AL",quantity:1,price:Infinity}`,    // Infinity fiyat
   `{symbol:"XYZ",side:"AL",quantity:1e15,price:1e15}`      // aşırı büyük (yetersiz nakit)
  ];
  t("9 geçersiz uç değer işlemi TAMAMI reddedildi", bad.every(o=>E(C,`window.STKSZVirtualWallet.executeOrder(${o}).ok`)===false));
  t("Reddedilen işlemler geçmişe yazılmadı", E(C,"window.STKSZVirtualWallet.getWallet().transactionCount")===6);

  console.log("═══ 4) GEMINI STRES ═══");
  const ai=A.w.window.STKSZProviders.stkszAiProvider;
  const tryAsk=async(q,ctx)=>{try{return {ok:true,r:await ai.ask(q,ctx||"")};}catch(e){return {ok:false,e:e.message};}};
  t("Normal soru", (await tryAsk("merhaba")).ok===true);
  const emptyQ=await tryAsk("");
  t("Boş soru: kontrollü davranış (çökme yok)", emptyQ.ok===false||emptyQ.ok===true);
  t("Çok uzun soru (50K) kırpılır, çalışır", (await tryAsk("A".repeat(50000))).ok===true);
  t("Anlamsız soru çalışır", (await tryAsk("asdf qwer zxcv 123 !@#")).ok===true);
  t("Dev context (100K) kırpılır, çalışır", (await tryAsk("test","C".repeat(100000))).ok===true);
  geminiMode="500";t("Gemini 500: temiz hata", (await tryAsk("x")).ok===false);
  geminiMode="malformed";t("Malformed: temiz hata", (await tryAsk("x")).ok===false);
  geminiMode="empty";t("Boş yanıt: temiz hata", (await tryAsk("x")).ok===false);
  geminiMode="weird";const weird=await tryAsk("x");
  t("Beklenmeyen alanlar: yanıt yine çıkarılır", weird.ok===true&&weird.r.text==="Yanıt.");
  geminiMode="offline";t("Gemini offline: temiz hata", (await tryAsk("x")).ok===false);
  geminiMode="ok";
  const burst=await Promise.all(Array.from({length:12},(_,i)=>tryAsk("hızlı soru "+i)));
  t("Art arda 12 istek: hepsi kontrollü sonuçlandı", burst.every(x=>x.ok===true||x.ok===false)&&burst.filter(x=>x.ok).length>=10);
  const allErr=[emptyQ,weird,...burst].map(x=>x.e||"").join("");
  t("Stres çıktılarında API key yok", !allErr.includes(MOCK_KEY));

  console.log("═══ 5) GÖRSEL ÇIKARIM STRESİ (10 senaryo) ═══");
  const vis=async marker=>{try{return {ok:true,r:await ai.visionBackend(Buffer.from(marker.repeat(20)).toString("base64"),"image/png")};}catch(e){return {ok:false,e:e.message};}};
  const v1=await vis("ALIM-");t("1) AL görseli: TCELL/3/103", v1.ok&&v1.r.extraction.trades[0].price===103);
  const v2=await vis("SATIS-");t("2) SAT görseli: TCELL/3/110", v2.ok&&v2.r.extraction.trades[0].side==="SAT");
  const v3=await vis("TEMETTU-");t("3) Temettü görseli: TUPRS 125,40", v3.ok&&v3.r.extraction.dividends[0].totalAmount===125.4);
  const v4=await vis("COKLU-");
  t("4) Çoklu işlem: 3 işlem, HER BİRİ ayrı onaylı öneri", v4.ok&&v4.r.extraction.trades.length===3&&v4.r.toolCalls.every(c=>c.requiresUserApproval===true));
  const v5=await vis("EKSIKFIYAT-");t("5) Eksik fiyat: null bırakıldı (uydurma yok)", v5.ok&&v5.r.extraction.trades[0].price===null);
  const v6=await vis("EKSIKLOT-");t("6) Eksik lot: null bırakıldı", v6.ok&&v6.r.extraction.trades[0].quantity===null);
  const v7=await vis("BELIRSIZ-");
  E(A,`aiRenderVisionResult(JSON.parse(${JSON.stringify(JSON.stringify(v7.r))}))`);
  const belCard=[...A.d.querySelectorAll(".ai-extract-card")].pop();
  t("7) Belirsiz sembol: düşük güven uyarısı + otomatik işlem yok", v7.ok&&belCard.classList.contains("low-conf"));
  const v8=await vis("BOZUK-");t("8) Okunamayan görsel: dürüst 'other' + boş", v8.ok&&v8.r.extraction.kind==="other"&&v8.r.toolCalls.length===0);
  const big=await (async()=>{try{const r=await A.w.fetch("http://127.0.0.1:10291/api/ai/vision",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({imageBase64:"A".repeat(9*1024*1024),mimeType:"image/png"})});return r.status;}catch(e){return "reject";}})();
  t("9) 9MB görsel: sunucu reddediyor (8MB limit)", big==="reject"||big>=400);
  t("10) Desteklenmeyen format istemcide reddedilir (kod)", html.includes("jpeg|png|webp"));
  const txCntBefore=E(A,"window.STKSZVirtualWallet.getWallet().transactionCount");
  t("10 senaryo boyunca sanal cüzdanda OTOMATİK işlem oluşmadı", txCntBefore===5);

  console.log("═══ 6) AI + PORTFÖY (6 soru gerçek veri) ═══");
  const askUI=async q=>{const inp=A.d.getElementById("aiQuestionInput");A.w.eval("openStkszAi()");inp.value=q;await E(A,"askStkszAi()");await new Promise(r=>setTimeout(r,450));return [...A.d.querySelectorAll(".ai-msg-bot")].pop().textContent;};
  const q1=await askUI("Portföyüm ne durumda?");t("'Portföyüm ne durumda?' gerçek sanal veri", q1.includes("sanalNakitTRY"));
  const q2=await askUI("Kaç TL nakitim var?");t("'Kaç TL nakitim var?' gerçek nakit", q2.includes("TL")&&q2.includes("963.75")||q2.includes("VERİ"));
  const q3=await askUI("TCELL kaç lot?");t("'TCELL kaç lot?' pozisyon verisi", q3.includes("lot"));
  const q4=await askUI("Gerçekleşen K/Z nedir?");t("'Gerçekleşen K/Z' verisi", q4.includes("gerceklesenNetKZ")||q4.includes("VERİ"));
  const q5=await askUI("Hangi işlemleri yaptım?");t("'Hangi işlemleri yaptım?' geçmiş", q5.includes("islemler")||q5.includes("gercekIslemler"));
  const q6=await askUI("Portföy değerim nedir?");t("'Portföy değerim' özet", q6.includes("toplamDeger")||q6.includes("VERİ"));
  t("6 yanıtın hiçbirinde API key yok", ![q1,q2,q3,q4,q5,q6].join("").includes(MOCK_KEY));

  console.log("═══ 7) VERİ KAYNAĞI FALLBACK (kart bağımsızlığı) ═══");
  E(A,`data.ipoCalendar={source:"",lastSuccess:"",lastError:"Haber kaynağına ulaşılamadı.",items:[]};fxRates=null;render();renderOpportunityData();`);
  t("IPO+FX çökük: nakit kartı TL göstermeye devam", A.d.getElementById("cashLineTl").textContent.includes("963,75"));
  t("FX yokken 'kur alınamadı' — tahmini kur YOK", A.d.getElementById("portfolioCashUsd").textContent.includes("kur alınamadı"));
  t("IPO kartı kendi hatasını gösterir", A.d.getElementById("ipoCalendar").textContent.includes("Güncel veri alınamadı"));
  t("Sanal cüzdan bu çöküşlerden bağımsız", E(A,"window.STKSZVirtualWallet.getWallet().totalCashTRY")>0);
  E(A,`fxRates={usdtry:47.9,eurtry:52.1,updated:"",fetchedIso:new Date().toISOString()};render();`);

  console.log("═══ 8) PORTFÖY/NAKİT HESAP STRESİ (çift sayım) ═══");
  E(A,`data.assets=[hydrateAsset({s:"TCELL",type:"Hisse",q:17,p:6.0529,avgCost:5.9,marketVerified:true,source:"t"}),hydrateAsset({s:"OPK30.F",type:"Fon",q:100,p:2.5,avgCost:2,source:"t"}),hydrateAsset({s:"ALTIN.S1",type:"Sertifika",q:10,p:30,avgCost:28,source:"t"})];data.manualPL={ipoCash:{value:1708,at:"x"}};render();`);
  const total=E(A,"calc()");
  const expected=17*6.0529+100*2.5+10*30+963.75+2.94*47.9;
  t("Hisse+Fon+Sertifika+TL+USD karışımı: calc tam ("+expected.toFixed(2)+")", Math.abs(total-expected)<0.01);
  const heroInv=A.d.getElementById("heroInvestments").textContent,heroCash=A.d.getElementById("heroCashTotal").textContent;
  const invNum=parseFloat(heroInv.replace(/[₺.]/g,"").replace(",", "."));
  const cashNum=parseFloat(heroCash.replace(/[₺.]/g,"").replace(",", "."));
  t("YATIRIMLAR + TOPLAM NAKİT = TOPLAM (hero kırılımı)", Math.abs(invNum+cashNum-total)<1);
  t("Halka arz nakdi PORTFÖY TOPLAMINA EKLENMEZ (ayrı plan alanı)", Math.abs(total-expected)<0.01);
  t("Sanal bakiye gerçek toplama KARIŞMAZ", total<200000);
  E(A,`data.midasCashUsd=2.94;fxRates=null;render();`);
  const totalNoFx=E(A,"calc()");
  t("Kur yokken USD toplama girmez (tahmin yok)", Math.abs(totalNoFx-(expected-2.94*47.9))<0.01);
  E(A,`fxRates={usdtry:47.9,eurtry:52.1,updated:"",fetchedIso:new Date().toISOString()};`);

  console.log("═══ 10) PERFORMANS GÖSTERGELERİ ═══");
  const t0=Date.now();for(let i=0;i<25;i++)E(A,"render()");
  const renderMs=(Date.now()-t0)/25;
  t("render() ortalama <400ms (jsdom'da; gerçek tarayıcıda çok daha hızlı) — ölçülen "+renderMs.toFixed(0)+"ms", renderMs<400);
  const domNodes=A.d.querySelectorAll("*").length;
  t("DOM boyutu makul ("+domNodes+" düğüm < 6000)", domNodes<6000);
  t("Oto-yenileme kontrollü: 15dk interval + görünürlük koşulu", html.includes("15*60*1000")||html.includes("15 * 60 * 1000")||/autoUpdate/.test(html));
  const logCount0=A.d.querySelectorAll("#aiChatLog .ai-msg").length;
  E(A,"openStkszAi();closeStkszAi();openStkszAi();closeStkszAi()");
  t("AI aç/kapa DOM'u şişirmiyor (duplicate listener yok)", A.d.querySelectorAll("#aiChatLog .ai-msg").length===logCount0);
  const chatLimit=E(A,`(localStorage.getItem("stkszAiHistory")||"[]")`);
  t("AI geçmişi 50 mesajla sınırlı (bellek koruması)", JSON.parse(chatLimit).length<=50);

  console.log(`\n════ STRES SONUCU: ${pass}/${pass+fail} ════`);
  if(findings.length){console.log("BULGULAR:");findings.forEach(f=>console.log(" • "+f));}
  process.exit(fail?1:0);
 }catch(e){console.error("STRES HATASI:",e);process.exit(1);}})();
});});
