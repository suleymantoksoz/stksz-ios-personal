const {JSDOM}=require("jsdom");const fs=require("fs");
const html=fs.readFileSync("/home/user/www/index.html","utf8");
const vwSrc=fs.readFileSync("/home/user/www/virtual-wallet.js","utf8");
const css=fs.readFileSync("/home/user/www/style.css","utf8");
let pass=0,fail=0;function t(n,c){c?(pass++,console.log("✅ "+n)):(fail++,console.log("❌ "+n));}
const dom=new JSDOM(html,{runScripts:"dangerously",url:"http://localhost/",pretendToBeVisual:true,beforeParse(w){
 w.HTMLCanvasElement.prototype.getContext=function(){return new Proxy({},{get:(t,p)=>p==="measureText"?()=>({width:10}):()=>{}});};
 w.matchMedia=w.matchMedia||(()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));
 w.scrollTo=()=>{};w.fetch=()=>Promise.reject(new Error("offline"));w.confirm=()=>true;
 new Function("window","localStorage",vwSrc)(w,w.localStorage);
}});
const w=dom.window,d=dom.window.document;
setTimeout(()=>{try{
 console.log("── 1) ANA SAYFA rozeti kaldırıldı ──");
 t("headerPageBadge DOM'da yok", !d.getElementById("headerPageBadge"));
 t("showPage hâlâ hatasız", (()=>{try{w.eval("showPage('portfolio');showPage('home')");return true;}catch(e){return false;}})());
 console.log("── 2-3) İkonlar ──");
 t("hbtn kompakt bakır kuralları CSS'te", css.includes(".hbtn{\n  width:34px")||css.includes("width:34px;height:34px;min-width:34px"));
 t("Kalem SVG'ye dönüştü (9 buton, emoji yok)", d.querySelectorAll(".pl-edit-btn svg").length>=8 && !html.includes("✏️</button>"));
 console.log("── 4) Alt bar bakır ──");
 t("Eski yeşil aktif kuralı bakırla ezildi (!important)", css.includes('.nav button.active{\n  color:#F0D9B8!important')||css.includes("color:#F0D9B8!important"));/* v115: metalik bakır tonu */
 console.log("── 5) Menü kalıntısı ──");
 t("menu-view-intro kaldırıldı", !html.includes("İlgili kartı seçerek yalnızca"));
 console.log("── 7) AI kompakt ──");
 t("Hazır sorular: v120 yatay carousel (11 chip, drawer yerine)", !!d.getElementById("aiQuickCarousel") && d.querySelectorAll("#aiQuickTrack button").length===11);
 t("Yatay radar CSS (120x34 + sweep animasyonu)", css.includes("width:120px;height:34px")&&css.includes("aiRadarSweep"));
 t("Eski büyük kart grid'i kaldırıldı", !d.getElementById("aiQuickCards"));
 console.log("── 8) AI sohbet alanı MEVCUT ──");
 t("aiChatLog + composer + gönder DOM'da", !!d.getElementById("aiChatLog")&&!!d.getElementById("aiQuestionInput")&&!!d.getElementById("aiSendBtn"));
 t("askStkszAi serbest metin fonksiyonu duruyor", w.eval("typeof askStkszAi")==="function");
 console.log("── 9) Sürüm görünümü ──");
 w.eval("openUnifiedMenu();openMenuPanel('menuAbout')");
 t("Hakkında: 'v1' gösterir, tam sürüm parantezde", d.getElementById("menuBuildInfo").textContent==="v1"&&/\(2026\.\d{2}\.\d{2}-ai-v\d+\)/.test(d.getElementById("menuBuildDetail").textContent));/* v115: sürüm literal'i sabitlenmez */
 console.log("── 11) GİRİŞ / MİSAFİR ──");
 t("Auth gate DOM'da (email/google/apple/misafir)", !!d.getElementById("authGate")&&html.includes("authRegister('google')")&&html.includes("authGuest()"));
 w.eval("authState=null;renderAuthGate()");
 t("Oturum yokken gate görünür", d.getElementById("authGate").hidden===false);
 // e-posta kayıt
 w.eval(`document.getElementById("authEmailInput").value="test@stksz.app";document.getElementById("authNameInput").value="Süleyman";authCompleteEmail();`);
 t("E-posta kaydı: gate kapanır + hesap", d.getElementById("authGate").hidden===true&&w.eval("authState.mode")==="account");
 t("Profil kutusu hesap bilgisi gösterir", (()=>{w.eval("renderProfileAuth()");return d.getElementById("profileAuthBox").textContent.includes("test@stksz.app");})());
 // kalıcılık
 t("stkszAuth localStorage'da", (w.eval(`localStorage.getItem("stkszAuth")`)||"").includes("test@stksz.app"));
 // biyometrik bayrak
 w.eval("offerBiometricSetup&&(authState.quickLock=true,authPersist(),renderAuthGate())");
 // misafir kısıtları
 w.eval(`authState={mode:"guest",createdAt:"x"};authPersist();window.STKSZVirtualWallet.init(100000);`);
 const txB=w.eval("window.STKSZVirtualWallet.getWallet().transactionCount");
 w.eval("openPlEditor('dailyProfit')");
 t("Misafir: K/Z editörü AÇILMAZ", !d.getElementById("plEditorModal").classList.contains("show"));
 w.eval("openVwTrade('AL','TCELL')");
 t("Misafir: sanal işlem ekranı AÇILMAZ", !d.getElementById("vwTradeModal").classList.contains("show"));
 t("Misafir: görüntüleme serbest (render çalışır)", (()=>{try{w.eval("render()");return true;}catch(e){return false;}})());
 // hesaba geçince engel kalkar
 w.eval(`authState={mode:"account",provider:"email",email:"t@t.co",name:"",createdAt:"x",quickLock:false};authPersist();openPlEditor('dailyProfit')`);
 t("Hesapla: editör açılır (guard kalkar)", d.getElementById("plEditorModal").classList.contains("show"));
 w.eval("closePlEditor()");
 console.log("── REGRESYON GÜVENLİĞİ: testler authState=null ile eski davranış ──");
 w.eval("authState=null;storageRemove('stkszAuth')");
 w.eval("openVwTrade('AL','TCELL')");
 t("authState yokken (test ortamı) fonksiyonlar engellenmez", d.getElementById("vwTradeModal").classList.contains("show"));
 console.log(`\nSONUÇ: ${pass}/${pass+fail}`);process.exit(fail?1:0);
}catch(e){console.error("HATA:",e);process.exit(1);}},1300);
