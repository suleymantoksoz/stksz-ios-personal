#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const root = process.cwd();
const iosApp = path.join(root, "ios", "App");
const publicDir = path.join(iosApp, "App", "public");
const wwwDir = path.join(root, "www");
let ok = true;
const fail = (msg) => { console.error("[FAIL] " + msg); ok = false; };
const pass = (msg) => { console.log("[OK]   " + msg); };

if (!fs.existsSync(path.join(iosApp, "Podfile"))) {
  fail("ios/App/Podfile bulunamadi. iOS projesi eksik.");
} else {
  pass("ios/App/Podfile mevcut");
}

if (!fs.existsSync(path.join(iosApp, "Podfile.lock"))) {
  fail("ios/App/Podfile.lock yok. CocoaPods calistirilmamis; bu paket Capacitor.framework'i govmemeyen/embed etmeyen bir yapi uretir.");
  console.error("  COZUM (macOS + Xcode + CocoaPods):");
  console.error("    cd ios/App && pod install");
  console.error("    # sonra App.xcworkspace ile build alin (App.xcodeproj DEGIL)");
} else {
  pass("ios/App/Podfile.lock mevcut (pod install calismis)");
}

if (!fs.existsSync(path.join(iosApp, "Pods", "Pods.xcodeproj"))) {
  fail("ios/App/Pods/Pods.xcodeproj yok -> Capacitor.framework/CapacitorCordova.framework derlenemez, uygulama dyld hatalariyla acilista ana ekrana doner.");
  console.error("  COZUM: yukaridaki pod install komutunu calistirin.");
} else {
  pass("ios/App/Pods/Pods.xcodeproj mevcut");
}

if (!fs.existsSync(path.join(iosApp, "App.xcworkspace"))) {
  fail("ios/App/App.xcworkspace yok; build mutlaka .xcworkspace uzerinden olmalidir.");
} else {
  pass("ios/App/App.xcworkspace mevcut (build .xcworkspace ile yapilmali)");
}

const expectSame = (name) => {
  const a = path.join(wwwDir, name);
  const b = path.join(publicDir, name);
  if (!fs.existsSync(a) || !fs.existsSync(b)) { fail("web bundle esitlismemis: " + name + " (www veya ios/App/App/public eksik)"); return; }
  const sa = fs.statSync(a).size, sb = fs.statSync(b).size;
  if (sa !== sb) { fail("web bundle eski: " + name + " www=" + sa + "B vs public=" + sb + "B. 'npm run sync:ios' calistirin."); }
  else { pass("web bundle senkron: " + name + " (" + sa + "B)"); }
};
expectSame("index.html");
expectSame("style.css");
expectSame("stksz-data-engine.js");

const plist = path.join(iosApp, "App", "Info.plist");
if (fs.existsSync(plist)) {
  const raw = fs.readFileSync(plist, "utf8");
  if (raw.indexOf("UIRequiredDeviceCapabilities") !== -1) {
    fail("Info.plist'te hantal UIRequiredDeviceCapabilities(armv7) kalmis; kaldirin.");
  } else {
    pass("Info.plist kullanilmayan UIRequiredDeviceCapabilities icermiyor");
  }
} else {
  fail("ios/App/App/Info.plist bulunamadi");
}

if (ok) console.log("\nSONUC: iOS kap hazir.");
else console.log("\nSONUC: iOS kap HAZIR DEGIL - yukaridaki adimlari tamamlayin.");
process.exit(ok ? 0 : 1);