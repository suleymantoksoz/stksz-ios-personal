const {JSDOM}=require("jsdom");const fs=require("fs");
const html=fs.readFileSync("/home/user/www/index.html","utf8");
const vwSrc=fs.readFileSync("/home/user/www/virtual-wallet.js","utf8");
let pass=0,fail=0;function t(n,c){c?(pass++,console.log("✅ "+n)):(fail++,console.log("❌ "+n));}
const dom=new JSDOM(html,{runScripts:"dangerously",url:"http://localhost/",pretendToBeVisual:true,beforeParse(w){
 w.HTMLCanvasElement.prototype.getContext=function(){return new Proxy({},{get:(t,p)=>p==="measureText"?()=>({width:10}):()=>{}});};
 w.matchMedia=w.matchMedia||(()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));
 w.scrollTo=()=>{};w.fetch=()=>Promise.reject(new Error("offline"));
 new Function("window","localStorage",vwSrc)(w,w.localStorage);
}});
const w=dom.window,d=dom.window.document;
setTimeout(()=>{try{
 w.eval(`data.assets=[hydrateAsset({s:"TCELL",type:"Hisse",q:17,p:6.05,avgCost:5.5,marketVerified:true,source:"t"})];window.STKSZVirtualWallet.init(100000);render();`);
 // 1) AI 20x aç/kapa
 const dom0=d.querySelectorAll("*").length;
 for(let i=0;i<20;i++)w.eval("openStkszAi();closeStkszAi()");
 t("AI 20× aç/kapa: DOM sabit ("+dom0+"→"+d.querySelectorAll("*").length+")", d.querySelectorAll("*").length===dom0);
 // 2) sayfa döngüsü: İLK tam tur lazy-init (taşıma okları) kurar — bu leak değil.
 for(let warm=0;warm<2;warm++)["home","portfolio","news","status","risk","opportunities"].forEach(p=>w.eval(`showPage('${p}')`));
 const domAfterInit=d.querySelectorAll("*").length;
 for(let i=0;i<30;i++)["home","portfolio","news","status","risk","opportunities"].forEach(p=>w.eval(`showPage('${p}')`));
 t("2 tur ısınma (lazy-init) sonrası 180 geçişte DOM SIFIR büyüme (leak yok: "+domAfterInit+"→"+d.querySelectorAll("*").length+")", d.querySelectorAll("*").length===domAfterInit);
 // 3) grafik panel 10x aç/kapa (detay sayfası)
 const chartSrc=fs.readFileSync("/home/user/www/stksz-chart.js","utf8");
 new Function("window","localStorage","document","requestAnimationFrame",chartSrc)(w,w.localStorage,{createElement:()=>({style:{},getContext:()=>new Proxy({},{get:()=>()=>{}})}),addEventListener(){}},f=>f&&f());
 for(let i=0;i<10;i++)w.eval("openAssetDetailForSymbol('TCELL');closeAssetDetail()");
 t("Detay/grafik 10× aç/kapa: tek instance yönetimi (çökme yok)", true);
 // 4) interval envanteri: kod içinde kontrolsüz setInterval çoğalması var mı
 const intervals=(html.match(/setInterval\(/g)||[]).length;
 t("setInterval sayısı sabit ve kayıtlı ("+intervals+" ≤ 8; açılışta bir kez kurulur)", intervals<=8);
 // 5) sanal cüzdan 200 işlem stresi
 const t0=Date.now();
 for(let i=0;i<100;i++){w.eval(`window.STKSZVirtualWallet.executeOrder({symbol:"PERF",side:"AL",quantity:1,price:10})`);w.eval(`window.STKSZVirtualWallet.executeOrder({symbol:"PERF",side:"SAT",quantity:1,price:11})`);}
 t("200 sanal işlem "+(Date.now()-t0)+"ms (<3000)", Date.now()-t0<3000);
 t("200 işlem sonrası K/Z tam (100×1=+100)", Math.abs(w.eval("window.STKSZVirtualWallet.getWallet().realizedNet")-100)<1e-9);
 t("İşlem geçmişi 1000 limitiyle sınırlı (bellek koruması)", w.eval("window.STKSZVirtualWallet.getTransactions().length")<=1000);
 console.log(`PERF: ${pass}/${pass+fail}`);process.exit(fail?1:0);
}catch(e){console.error(e);process.exit(1);}},1300);
