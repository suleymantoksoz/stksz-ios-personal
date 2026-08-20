const {JSDOM}=require("jsdom");const fs=require("fs");
const html=fs.readFileSync("/home/user/www/index.html","utf8");
const vwSrc=fs.readFileSync("/home/user/www/virtual-wallet.js","utf8");
const brokerSrc=fs.readFileSync("/home/user/www/broker-adapter.js","utf8");
const report=fs.readFileSync("/home/user/server/BROKER-API-DURUM.md","utf8");
let pass=0,fail=0;function t(n,c){c?(pass++,console.log("✅ "+n)):(fail++,console.log("❌ "+n));}

console.log("── ARAŞTIRMA BELGESİ (resmî API kontrolü) ──");
t("Durum raporu var + 9 kontrol başlığı", ["Resmî API desteği","Emir gönderme","Portföy sorgulama","Bakiye sorgulama","Emir durumu","Authentication","Rate limit","Kullanıcı yetkilendirmesi","Güvenlik gereksinimleri"].every(k=>report.includes(k)));
t("AlgoLab kapanışı belgelendi (31.12.2025)", report.includes("31.12.2025"));
t("Midas public API yok tespiti", report.includes("404"));
t("Scraping/şifre taklidi YASAK ilkesi", report.includes("KULLANILMAYACAK"));
t("Kodda scraping/şifre taklidi YOK", !/puppeteer|selenium|playwright|password.*replay/i.test(brokerSrc+vwSrc));

const dom=new JSDOM(html,{runScripts:"dangerously",url:"http://localhost/",pretendToBeVisual:true,beforeParse(w){
 w.HTMLCanvasElement.prototype.getContext=function(){return new Proxy({},{get:(t,p)=>p==="measureText"?()=>({width:10}):()=>{}});};
 w.matchMedia=w.matchMedia||(()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));
 w.scrollTo=()=>{};w.fetch=()=>Promise.reject(new Error("offline"));
 new Function("window","localStorage",vwSrc)(w,w.localStorage);
 new Function("window","localStorage",brokerSrc)(w,w.localStorage);
}});
const w=dom.window,d=dom.window.document;
setTimeout(async()=>{try{
 console.log("── SANAL / GERÇEK AYRIM UI ──");
 w.eval("openUnifiedMenu();openMenuPanel('menuVirtualWallet')");
 t("İki sekme: SANAL CÜZDAN + GERÇEK HESAP", !!d.getElementById("accTabVirtual")&&!!d.getElementById("accTabReal"));
 t("Varsayılan SANAL aktif, gerçek bölüm gizli", d.getElementById("accTabVirtual").classList.contains("active")&&d.getElementById("realAccountSection").hidden===true);
 w.eval("setAccountView('real')");await new Promise(r=>setTimeout(r,200));
 t("GERÇEK sekmesi: bölüm açılır, sanal gizlenir", d.getElementById("realAccountSection").hidden===false&&d.getElementById("virtualAccountSection").hidden===true);
 t("GERÇEK durum: BAĞLI DEĞİL (resmî API bekleniyor)", d.getElementById("realBrokerStatus").textContent.includes("BAĞLI DEĞİL")&&d.getElementById("accRealState").textContent==="BAĞLI DEĞİL");
 t("Portföy/Nakit/Emirler/Pozisyonlar alanları GERÇEK bölümde ayrı", ["realBrokerPositions","realBrokerCash","realBrokerOrders","realBrokerPosCount"].every(id=>d.getElementById(id).textContent==="BAĞLI DEĞİL"));
 t("Dürüst açıklama: AlgoLab kapandı + Midas API yok", d.getElementById("realBrokerNote").textContent.includes("31.12.2025")&&d.getElementById("realBrokerNote").textContent.includes("public API"));
 w.eval("setAccountView('virtual')");
 t("SANAL sekmesine dönüş çalışır", d.getElementById("virtualAccountSection").hidden===false);

 console.log("── BAKİYELER KARIŞMAZ ──");
 w.eval(`data.midasCash=963.75;window.STKSZVirtualWallet.init(100000);window.STKSZVirtualWallet.executeOrder({symbol:"TCELL",side:"AL",quantity:3,price:103});render();renderVirtualWallet();`);
 const realTotal=w.eval("calc()");
 t("Gerçek portföy calc() sanal bakiye İÇERMEZ", Math.abs(realTotal-963.75)<0.01);
 t("Sanal bakiye ayrı: 99691", w.eval("window.STKSZVirtualWallet.getWallet().totalCashTRY")===99691);
 t("Gerçek nakit kartı sanaldan etkilenmez", d.getElementById("cashLineTl").textContent.includes("963,75")&&!d.getElementById("cashLineTl").textContent.includes("99.691"));
 t("AI araçları da ayrı raporlar (getCashBalances)", (()=>{const r=JSON.parse(w.eval(`JSON.stringify(runAiReadTool("getCashBalances",{}))`));return r.TL===963.75&&r.sanalCuzdanTL===99691;})());

 console.log("── ADAPTER ÜZERİNDEN GERÇEK HESAP (kilit) ──");
 t("MidasAdapter hâlâ kilitli (setActive reddeder)", w.eval("window.STKSZBroker.setActive('midas').code")==="locked");
 t("Gerçek hesap verisi adapter'dan istenirse dürüst hata", w.eval("JSON.stringify(window.STKSZBroker.list().find(a=>a.id==='midas'))").includes("false"));
 t("UI değişmeden bağlanabilir mimari (tek kapı korunuyor)", w.eval("typeof window.STKSZBroker.getBrokerBalance")==="function"&&html.includes("STKSZBroker.placeOrder"));
 t("Sanal cüzdan MockBrokerAdapter ile çalışmaya devam", w.eval("window.STKSZBroker.active().id")==="mock");
 t("render() hatasız", (()=>{try{w.eval("render()");return true;}catch(e){return false;}})());
 console.log(`\nSONUÇ: ${pass}/${pass+fail}`);process.exit(fail?1:0);
}catch(e){console.error("HATA:",e);process.exit(1);}},1200);
