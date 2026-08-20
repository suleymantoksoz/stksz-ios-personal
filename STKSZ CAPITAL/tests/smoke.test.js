const {JSDOM}=require("jsdom");const fs=require("fs");
const html=fs.readFileSync("/home/user/www/index.html","utf8");
const vwSrc=fs.readFileSync("/home/user/www/virtual-wallet.js","utf8");
let pass=0,fail=0;function t(n,c){c?(pass++,console.log("✅ "+n)):(fail++,console.log("❌ "+n));}
const dom=new JSDOM(html,{runScripts:"dangerously",url:"http://localhost/",pretendToBeVisual:true,beforeParse(w){
 w.HTMLCanvasElement.prototype.getContext=function(){return new Proxy({},{get:(t,p)=>p==="measureText"?()=>({width:10}):()=>{}});};
 w.matchMedia=w.matchMedia||(()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));
 w.scrollTo=()=>{};w.fetch=()=>Promise.reject(new Error("offline"));w.confirm=()=>true;
 new Function("window","localStorage",vwSrc)(w,w.localStorage);
}});
const w=dom.window,d=dom.window.document;
setTimeout(()=>{try{
 w.eval(`fxRates={usdtry:47.9,eurtry:52.1,updated:"",fetchedIso:new Date().toISOString()};data.midasCash=963.75;data.midasCashUsd=2.94;data.midasCashEur=0;data.assets=[hydrateAsset({s:"TCELL",type:"Hisse",q:17,p:6.0529,avgCost:5.9,marketVerified:true,source:"t"})];render();`);
 t("calc() USD dahil (v84)", Math.abs(w.eval("calc()")-(17*6.0529+963.75+2.94*47.9))<0.01);
 t("Nakit kırılımı (v93)", d.getElementById("cashLineTl").textContent.includes("963,75"));
 t("Sanal cüzdan motoru (v94)", (()=>{w.eval("window.STKSZVirtualWallet.init(100000)");return w.eval("window.STKSZVirtualWallet.executeOrder({symbol:'TCELL',side:'AL',quantity:3,price:103}).ok")===true;})());
 t("SANAL AL/SAT detayda (v95)", (()=>{w.eval("openAssetDetailForSymbol('TCELL')");return !!d.querySelector(".vw-buy-btn");})());
 t("AI + GÖRSEL butonu (v97)", !!d.getElementById("aiImageBtn")&&!!d.getElementById("aiImageFile"));
 t("Ayrı yükleme alanı AI'ya yönlendirildi (v97)", !!d.querySelector(".ai-upload-redirect")&&d.getElementById("legacyOcrWrap").hidden===true);
 t("Legacy OCR aç/kapat çalışır", (()=>{w.eval("toggleLegacyOcr()");return d.getElementById("legacyOcrWrap").hidden===false;})());
 t("uploadMidasTotal hâlâ render ediliyor", d.getElementById("uploadMidasTotal").textContent.includes("₺"));
 t("AI overlay + öneri işleyicisi", w.eval("typeof aiHandleImage")==="function"&&w.eval("typeof aiRenderVisionResult")==="function");
 t("render() hatasız", (()=>{try{w.eval("render()");return true;}catch(e){return false;}})());
 console.log(`SMOKE v97: ${pass}/${pass+fail}`);process.exit(fail?1:0);
}catch(e){console.error("HATA:",e);process.exit(1);}},1200);
