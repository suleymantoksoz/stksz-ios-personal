/* FAZ 4 entegrasyon testi (4.13): nav loop'lar, no-data dürüstlüğü,
   kripto favoriler, FG metadata, key moments dürüst entegrasyon,
   backtest kaynak/aralık metadata, PAPER simülasyon koşul motoru. */
const {JSDOM}=require("jsdom");const fs=require("fs");const path=require("path");const {webcrypto}=require("crypto");
const root=path.resolve(__dirname,"..");
const html=fs.readFileSync(path.join(root,"www","index.html"),"utf8");
const css=fs.readFileSync(path.join(root,"www","style.css"),"utf8");
const vwSrc=fs.readFileSync(path.join(root,"www","virtual-wallet.js"),"utf8");
let pass=0,fail=0;function t(n,c){c?(pass++,console.log("✅ "+n)):(fail++,console.log("❌ "+n));}
const dom=new JSDOM(html,{runScripts:"dangerously",url:"http://localhost/",pretendToBeVisual:true,beforeParse(w){
 Object.defineProperty(w,"crypto",{value:webcrypto});
 w.HTMLCanvasElement.prototype.getContext=function(){return new Proxy({},{get:(t,p)=>p==="measureText"?()=>({width:10}):()=>{}});};
 w.HTMLCanvasElement.prototype.toDataURL=function(){throw new Error("jsdom canvas yok");};
 w.matchMedia=w.matchMedia||(()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));
 w.scrollTo=()=>{};w.fetch=()=>Promise.reject(new Error("offline"));w.confirm=()=>true;
 w.Notification=function Notification(){};
 new Function("window","localStorage",vwSrc)(w,w.localStorage);
}});
const w=dom.window,d=w.document;
setTimeout(()=>{try{
 w.eval(`window.STKSZAIEngine={analysis:{detectKeyMoments:function(h,v){var out=[];for(var i=1;i<h.length;i++){if(h[i]&&h[i-1]&&Math.abs(h[i]-h[i-1])/h[i-1]>0.015)out.push({index:i,type:'GAP_'+((h[i]-h[i-1])>0?'UP':'DOWN'),price:h[i]});}return out;}}};`);

 const fns=["openNewsForSymbol","whyMoved","generateReport","openCryptoStkszEditor","openPriceAlertModal","setRadarHub","setIpoFilter","renderNews","renderOpportunityData","runBacktest","computeFearGreed","toggleCryptoFavorite","activateTrailingStop","activatePartialTP","activateMaxDrawdownKill","evalPaperConditions","detectAndRenderKeyMoments","renderKeyMomentsOnChart","buildMomentSeries","exportReportImage"];
 t("FAZ4: nav loop + özellik fonksiyonları tanımlı", fns.every(f=>w.eval(`typeof ${f}==="function"`)));

 t("FAZ4: haber filtresi + connection/empty state", ["newsCategorySelect","newsSymbolSelect","newsConnectionState","newsSelectionState","newsStatus","newsList"].every(id=>!!d.getElementById(id)));
 t("FAZ4: sahte haber üretilmez mesajı", html.indexOf("sahte haber üretilmez")!==-1);
 t("FAZ4: haber boş state", d.getElementById("newsList").textContent.indexOf("boştur")!==-1);
 t("FAZ4: fırsat kartları boş state", d.getElementById("opportunityCards").textContent.indexOf("VERİ YETERSİZ")!==-1&&d.getElementById("opportunityCards").textContent.indexOf("fırsat üretilmedi")!==-1);
 t("FAZ4: partner ürün başlığı ayrıştırıldı", html.indexOf("ORTAK FİNANSAL ÜRÜNLER")!==-1&&html.indexOf("BOŞTA DURAN PARANI DEĞERLENDİR")===-1);
 t("FAZ4: radar 9 hub butonu", d.querySelectorAll(".radar-hub-btn").length>=9);
 t("FAZ4: setRadarHub ipos içerik üretir", (()=>{try{w.eval(`setRadarHub("ipos");`);}catch(e){return false;}return d.getElementById("radarHubContent").innerHTML.length>0;})());
 t("FAZ4: rapor dışa aktar fonksiyonları + kilit", w.eval(`typeof exportReportImage==="function"&&typeof exportReportPdf==="function"&&typeof setExportEnabled==="function"`));
 t("FAZ4: IPO nakit / hisse nakit ayrımı", ["ipoCashNeeded","stockCashNeeded","totalCashNeeded","cashPlanMidas"].every(id=>!!d.getElementById(id)));
 t("FAZ4: asset detail fiyat nowrap CSS", css.indexOf("asset-detail-price-row{display:flex;align-items:baseline;gap:10px;margin-top:8px;flex-wrap:nowrap")!==-1);

 w.eval(`data.assets=[];computeFearGreed();`);
 t("FAZ4: FG veri yoksa empty", d.getElementById("fearGreedGauge").textContent.indexOf("Yeterli veri yok")!==-1);

 w.eval(`data.assets=[hydrateAsset({s:"TCELL",type:"Hisse",q:10,p:6.05,avgCost:5.5,marketVerified:true,source:"Test verisi",history:[{c:6,v:100},{c:6.1,v:110},{c:6.05,v:90},{c:6.2,v:120},{c:6.3,v:105}]})];data.lastUpdate="11.09.2026 10:00";data.market={source:"Doğrulanmış test",lastSuccess:"2026-09-11T10:00:00Z"};computeFearGreed();`);
 const fgMeta=d.querySelector("#fearGreedGauge .fg-meta");
 t("FAZ4: FG metadata kaynak+güven", fgMeta&&fgMeta.textContent.indexOf("Kaynak")!==-1&&fgMeta.textContent.indexOf("Güven")!==-1&&fgMeta.textContent.indexOf("piyasa endeksi değildir")!==-1);

 w.eval(`cryptoPriceCache=[];renderCryptoList();`);
 t("FAZ4: kripto boş state", d.getElementById("cryptoList").textContent.indexOf("Kripto verisi yok")!==-1);
 w.eval(`cryptoPriceCache=[{symbol:"BTC",price:65000,change:1.2,volume:2000000000,high:66000,low:64000},{symbol:"ETH",price:3200,change:-0.5,volume:500000000,high:3300,low:3100}];renderCryptoList();toggleCryptoFavorite("BTC");`);
 t("FAZ4: kripto favori ekler", w.eval(`Array.isArray(data.cryptoFavorites)&&data.cryptoFavorites.includes("BTC")`)===true);
 t("FAZ4: kripto favori persist", (()=>{try{const s=JSON.parse(w.localStorage.getItem("stkszData"));return Array.isArray(s.cryptoFavorites)&&s.cryptoFavorites.includes("BTC");}catch(e){return false;}})());
 t("FAZ4: kripto kartında yıldız aktif", d.querySelectorAll(".crypto-fav-btn.active").length>=1);
 t("FAZ4: kripto detay favori butonu", !!d.getElementById("cryptoDetailFavBtn"));
 w.eval(`openCryptoDetail(0,{skipEditor:true});`);
 t("FAZ4: kripto detay açılır", d.getElementById("cryptoDetailSymbol").textContent.indexOf("BTC")!==-1);
 t("FAZ4: kripto→STKSZ EDITOR bağı", !!d.querySelector("#page-crypto-detail .crypto-detail-header")&&html.indexOf("⚙ STKSZ EDİTÖR")!==-1);

 w.eval(`data.assets=[hydrateAsset({s:"TCELL",type:"Hisse",q:10,p:6.05,avgCost:5.5,marketVerified:true,source:"Test kaynağı",history:(function(){var arr=[];for(var i=0;i<40;i++){arr.push({close:100+Math.sin(i/2.5)*15+i*0.4,volume:1000+i});}return arr;})()})];document.getElementById("backtestSymbol").innerHTML='<option value="TCELL">TCELL</option>';document.getElementById("backtestSymbol").value="TCELL";document.getElementById("backtestStrategy").value="sma_cross";runBacktest();`);
 const btResult=d.getElementById("backtestResult").textContent;
 t("FAZ4: backtest sonuç + kaynak/aralık", btResult.indexOf("Kaynak: Test kaynağı")!==-1&&btResult.indexOf("%")!==-1&&btResult.indexOf("Maks. Drawdown")!==-1&&btResult.indexOf("NaN")===-1);

 w.eval(`data.assets[0].history=(function(){var arr=[];for(var i=0;i<8;i++){arr.push({c:100+i,v:1000});}return arr;})();document.getElementById("backtestSymbol").value="TCELL";document.getElementById("backtestStrategy").value="sma_cross";runBacktest();`);
 t("FAZ4: backtest yetersiz veri dürüstlüğü", d.getElementById("toast").textContent.indexOf("yeterli tarihi veri")!==-1);

 w.eval(`window.STKSZVirtualWallet.init(100000);renderPaperTradingPanel();data.assets[0].history=(function(){var arr=[];for(var i=0;i<40;i++){arr.push({close:100+Math.sin(i/2.5)*15+i*0.4,volume:1000+i});}return arr;})();data.assets[0].p=100;document.getElementById("trailingSymbol").innerHTML='<option value="TCELL">TCELL</option>';document.getElementById("trailingSymbol").value="TCELL";document.getElementById("trailingActivation").value="5";document.getElementById("trailingTrail").value="3";activateTrailingStop();`);
 t("FAZ4: PAPER trailing koşul oluşturulur", w.eval(`data.paperConditions.length===1&&data.paperConditions[0].kind==="trailing"&&data.paperConditions[0].status==="ACTIVE"`)===true);
 w.eval(`data.assets[0].p=100*1.06;evalPaperConditions();`);
 const tPhase=w.eval(`data.paperConditions[0].status==="TRAILING"`)===true;
 w.eval(`data.assets[0].p=106*0.96;evalPaperConditions();`);
 const tTrigger=w.eval(`data.paperConditions[0].status==="TRIGGERED"`)===true;
 t("FAZ4: PAPER trailing aktivasyon→trail→tetik akışı", tPhase&&tTrigger);
 t("FAZ4: PAPER tetik sonrası sinyal", w.eval(`signalLog.length>0&&signalLog[signalLog.length-1].payload&&signalLog[signalLog.length-1].payload.paper==="SIMULASYON"`)===true);

 w.eval(`data.paperConditions=[];if(window.STKSZVirtualWallet.reset)window.STKSZVirtualWallet.reset();document.getElementById("maxDrawdownPct").value="15";activateMaxDrawdownKill();`);
 t("FAZ4: PAPER drawdown cüzdansız reddeder", w.eval(`data.paperConditions.length===0`)===true);
 w.eval(`window.STKSZVirtualWallet.init(100000);document.getElementById("maxDrawdownPct").value="15";activateMaxDrawdownKill();`);
 t("FAZ4: PAPER drawdown cüzdan ile oluşur", w.eval(`data.paperConditions.some(c=>c.kind==="drawdown"&&c.status==="ACTIVE")`)===true);

 w.eval(`data.assets[0].history=(function(){var arr=[];for(var i=0;i<30;i++){arr.push({c:100+i*0.5,v:1000});}return arr;})();detectAndRenderKeyMoments("TCELL");`);
 t("FAZ4: key moments gerçek geçmişle işaretler", d.getElementById("toast").textContent.indexOf("kilit an")!==-1);
 w.eval(`data.assets[0].history=[];detectAndRenderKeyMoments("TCELL");`);
 t("FAZ4: key moments verisiz dürüst red", d.getElementById("toast").textContent.indexOf("VERİ YETERSİZ")!==-1);

 t("FAZ4: SIMULASYON etiketi dosyada", html.indexOf("SIMULASYON")!==-1);
 console.log(`FAZ4 INTEGRATION: ${pass}/${pass+fail}`);
 process.exit(fail?1:0);
}catch(e){console.error("HATA:",e);process.exit(1);}},1500);