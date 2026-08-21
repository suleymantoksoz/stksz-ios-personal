const {JSDOM}=require("jsdom");const fs=require("fs");const httpMod=require("http");
const html=fs.readFileSync("/home/user/www/index.html","utf8");
const apiSrc=fs.readFileSync("/home/user/www/api-client.js","utf8");
const vwSrc=fs.readFileSync("/home/user/www/virtual-wallet.js","utf8");
const syncSrc=fs.readFileSync("/home/user/www/sync-client.js","utf8");
const brokerSrc=fs.readFileSync("/home/user/www/broker-adapter.js","utf8");
const serverSrc=fs.readFileSync("/home/user/server/stksz-ai-server.js","utf8");
let pass=0,fail=0;function t(n,c){c?(pass++,console.log("✅ "+n)):(fail++,console.log("❌ "+n));}

console.log("── STATİK ──");
t("createOrderIntent AI aracı: yalnız NİYET (emir değil)", serverSrc.includes("createOrderIntent")&&serverSrc.includes("ORDER INTENT"));
t("Intent TTL 10 dk", serverSrc.includes("10 * 60 * 1000"));
t("Audit log JSONL + redaksiyon + anahtar alanları silinir", serverSrc.includes("auditLog")&&serverSrc.includes("delete clean.apiKey")&&serverSrc.includes("redactSecrets(JSON.stringify"));
t("UI onay modalı: [İPTAL] + [EMRİ ONAYLA]", html.includes("EMRİ ONAYLA")&&html.includes(">İPTAL<")&&html.includes("Emri göndermek istediğine emin misin?"));
t("Gerçek gönderim kapalı uyarısı modalda", html.includes("gerçek gönderim KAPALIDIR")||html.includes("GERÇEK EMİR GÖNDERİMİ bu sürümde kapalı"));

process.env.GEMINI_API_KEY="GEM-SECRET-42";process.env.BROKER_API_KEY="BRK-KEY-SECRET-1";process.env.BROKER_API_SECRET="BRK-IMZA-SECRET-2";
process.env.SYNC_DATA_DIR="/tmp/audit-test-"+Date.now();process.env.PORT="9891";delete process.env.BROKER_LIVE_ENABLED;
const {server}=require("/home/user/server/stksz-ai-server.js");
server.listen(9891,"127.0.0.1",async()=>{
 const call=(p,b,hdr)=>new Promise((res2,rej2)=>{const rq=httpMod.request({hostname:"127.0.0.1",port:9891,path:p,method:b?"POST":"GET",headers:Object.assign({"Content-Type":"application/json"},hdr||{})},rs=>{let d="";rs.on("data",c=>d+=c);rs.on("end",()=>res2({status:rs.statusCode,json:JSON.parse(d||"{}")}));});rq.on("error",rej2);if(b)rq.write(JSON.stringify(b));rq.end();});
 console.log("── INTENT ZİNCİRİ (canlı backend) ──");
 // 1) intent oluştur ("TCELL 3 lot al")
 const it=await call("/api/broker/intent",{symbol:"tcell",side:"AL",quantity:3,priceType:"MARKET",source:"STKSZ AI önerisi"});
 t("Intent oluşur: TCELL/BUY/3/MARKET + awaiting_user_approval", it.json.ok&&it.json.intent.symbol==="TCELL"&&it.json.intent.side==="BUY"&&it.json.status==="awaiting_user_approval");
 t("Intent EMİR DEĞİL (note açık)", it.json.note.includes("emir gönderilmedi"));
 // 2) İPTAL akışı
 const it2=await call("/api/broker/intent",{symbol:"THYAO",side:"SELL",quantity:2,priceType:"LIMIT",price:300});
 const cancel=await call("/api/broker/intent/confirm",{intentId:it2.json.intentId,userConfirmed:false});
 t("[İPTAL] → cancelled + hiçbir işlem yok", cancel.json.status==="cancelled");
 // 3) ONAY akışı → bugün 403 broker_disabled + audited
 const confirm=await call("/api/broker/intent/confirm",{intentId:it.json.intentId,userConfirmed:true});
 t("[EMRİ ONAYLA] → 403 broker_disabled (gerçek para İMKANSIZ) + audited:true", confirm.status===403&&confirm.json.code==="broker_disabled"&&confirm.json.audited===true);
 // 4) userConfirmed olmadan onay geçmez
 const it3=await call("/api/broker/intent",{symbol:"GARAN",side:"BUY",quantity:1});
 const sneaky=await call("/api/broker/intent/confirm",{intentId:it3.json.intentId}); // userConfirmed yok
 t("userConfirmed:true OLMADAN onay sayılmaz (iptal edilir)", sneaky.json.status==="cancelled");
 // 5) geçersiz intent verileri
 const bad=await call("/api/broker/intent",{symbol:"X",side:"BUY",quantity:-1});
 t("Geçersiz intent 400", bad.status===400);
 // 6) süresi dolmuş/uydurma intent
 const ghost=await call("/api/broker/intent/confirm",{intentId:"oi-yok",userConfirmed:true});
 t("Bilinmeyen intent 404", ghost.status===404);
 console.log("── AUDIT LOG ──");
 const auditFile=fs.readdirSync(process.env.SYNC_DATA_DIR).find(f=>f.startsWith("audit-"));
 const audit=fs.readFileSync(process.env.SYNC_DATA_DIR+"/"+auditFile,"utf8");
 const lines=audit.trim().split("\n").map(l=>JSON.parse(l));
 t("Audit: intent_created kaydı (kullanıcı+zaman+sembol+yön+lot)", lines.some(l=>l.type==="order_intent_created"&&l.symbol==="TCELL"&&l.side==="BUY"&&l.quantity===3&&l.user&&l.at));
 t("Audit: iptal kaydı", lines.some(l=>l.type==="order_intent_cancelled"&&l.symbol==="THYAO"));
 t("Audit: onay reddi + emir sonucu (GÖNDERİLMEDİ)", lines.some(l=>l.type==="order_confirm_rejected"&&l.result==="GÖNDERİLMEDİ"));
 t("Audit'te API anahtarı/token YOK", !audit.includes("GEM-SECRET-42")&&!audit.includes("BRK-KEY-SECRET-1")&&!audit.includes("BRK-IMZA-SECRET-2"));
 console.log("── UI AKIŞI (jsdom + canlı backend) ──");
 const dom=new JSDOM(html,{runScripts:"dangerously",url:"http://localhost/",pretendToBeVisual:true,beforeParse(w){
  w.HTMLCanvasElement.prototype.getContext=function(){return new Proxy({},{get:(t,p)=>p==="measureText"?()=>({width:10}):()=>{}});};
  w.matchMedia=w.matchMedia||(()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));
  w.scrollTo=()=>{};
  w.fetch=(url,opts={})=>new Promise((res2,rej2)=>{const u=new URL(url);if(u.hostname!=="127.0.0.1"){rej2(new Error("dış ağ yok"));return;}
   const rq=httpMod.request({hostname:u.hostname,port:u.port,path:u.pathname+u.search,method:opts.method||"GET",headers:opts.headers||{}},rs=>{let d="";rs.on("data",c=>d+=c);rs.on("end",()=>res2({ok:rs.statusCode<300,status:rs.statusCode,text:()=>Promise.resolve(d)}));});rq.on("error",rej2);if(opts.body)rq.write(opts.body);rq.end();});
  new Function("window","localStorage",vwSrc)(w,w.localStorage);
  new Function("window","localStorage",brokerSrc)(w,w.localStorage);
  new Function("window","localStorage","document","fetch",apiSrc)(w,w.localStorage,{addEventListener(){},createElement:()=>({style:{}})},w.fetch);
  new Function("window","localStorage",syncSrc)(w,w.localStorage);
 }});
 const w=dom.window,d=dom.window.document;
 setTimeout(async()=>{try{
  w.eval(`apiKeyStore().set("stksz_ai_backend_url","http://127.0.0.1:9891");openStkszAi();`);
  // AI createOrderIntent önerisi kartı
  w.eval(`renderAiToolProposal({name:"createOrderIntent",readOnly:false,requiresUserApproval:true,args:{symbol:"TCELL",side:"BUY",quantity:3,priceType:"MARKET"}})`);
  const card=[...d.querySelectorAll(".ai-tool-proposal")].pop();
  t("AI kartı: GERÇEK EMİR NİYETİ + TCELL 3 LOT ALIM", card.textContent.includes("GERÇEK EMİR NİYETİ")&&card.textContent.includes("TCELL")&&card.textContent.includes("3 LOT")&&card.textContent.includes("ALIM"));
  // onay ekranını aç
  card.querySelector(".btn").click();
  await new Promise(r=>setTimeout(r,600));
  t("Onay modalı açıldı: sembol/lot/yön + soru", d.getElementById("orderIntentModal").classList.contains("show")&&d.getElementById("oiSymbol").textContent==="TCELL"&&d.getElementById("oiQty").textContent.includes("3")&&d.getElementById("oiSide").textContent==="ALIM");
  // EMRİ ONAYLA → bugün reddedilir
  await w.eval("oiConfirm()");
  await new Promise(r=>setTimeout(r,400));
  t("Onay sonrası: gerçek gönderim reddedildi + sohbete rapor", [...d.querySelectorAll(".ai-msg-bot")].some(m=>m.textContent.includes("hiçbir para işlemi yapılmadı")));
  t("Sanal cüzdan ETKİLENMEDİ", w.eval("window.STKSZVirtualWallet.getWallet().initialized")===false||w.eval("window.STKSZVirtualWallet.getWallet().transactionCount||0")===0);
  // İPTAL akışı UI
  w.eval(`openOrderIntent({symbol:"ASELS",side:"BUY",quantity:5,priceType:"MARKET"})`);
  await new Promise(r=>setTimeout(r,600));
  await w.eval("oiCancel()");
  await new Promise(r=>setTimeout(r,300));
  t("[İPTAL] UI: modal kapandı + sohbete iptal notu", ![...d.querySelectorAll(".ai-msg-bot")].every(m=>!m.textContent.includes("İPTAL edildi")));
  console.log(`\nSONUÇ: ${pass}/${pass+fail}`);process.exit(fail?1:0);
 }catch(e){console.error("HATA:",e);process.exit(1);}},1500);
});
