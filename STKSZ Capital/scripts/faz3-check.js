/* STKSZ CAPITAL — FAZ 3 bütünlük kontrolü
   Birleştirme noktaları:
   - portfolio-data-engine.js yüklü ve node'dan kullanılabilir
   - index.html: script etiketi, legacy OCR UI kaldırıldı, tek içe aktarma merkezi,
     provider aksiyonu, sunucu-Vision->yerel-OCR akışı, görünür Midas etiketleri genelleşti
   - stksz-ai-engine.js: saveSnapshot accountKey/seq + getAccountSnapshots + zincir-öncel karşılaştırma
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const www = path.join(ROOT, 'www');
const idx = path.join(www, 'index.html');
const engineFile = path.join(www, 'stksz-ai-engine.js');
const pfFile = path.join(www, 'portfolio-data-engine.js');

let pass = 0, fail = 0;
const results = [];
function ok(name, cond, extra) {
  if (cond) { pass++; results.push('PASS ' + name); }
  else { fail++; results.push('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

/* 1) motor parse + kullanılabilirlik */
try {
  execFileSync(process.execPath, ['-e', `require(${JSON.stringify(pfFile)});`], { stdio: 'pipe' });
  ok('portfolio-data-engine.js node tarağı', true);
} catch (e) { ok('portfolio-data-engine.js node tarağı', false, String(e.stderr || e.message)); }

/* 2) index.html içerik denetimleri */
const html = fs.readFileSync(idx, 'utf8');
ok('script etiketi portfolio-data-engine', html.includes('portfolio-data-engine.js?v=1"'));
ok('legacy OCR wrap kaldırıldı (id yok)', !html.includes('id="legacyOcrWrap"'));
ok('legacy OCR toggle butonu kaldırıldı', !/ESKİ OCR ALANINI AÇ\/KAPAT/.test(html));
ok('tek içe aktarma merkezi mevcut', html.includes('id="portfolioImportCard"'));
ok('openImportCenter tanımlı', /function openImportCenter\(\)/.test(html));
ok('providerAction tanımlı', /function providerAction\(\)/.test(html));
ok('sunucu-Vision->yerel-OCR akışı (visionBackend + fallback)', html.includes('visionBackend') && html.includes('yerel OCR'));
ok('KURUM BİLİNMİYOR davranışı (auto kaynakta yazma yok)', html.includes('KURUM BİLİNMİYOR'));
ok("MIDAS'A GİT linki artık koşullu provider aksiyonu", html.includes('providerActionButton'));
ok('görünür MİDAS TOPLAM etiketi yok', !/MİDAS TOPLAM/.test(html));
ok('görünür TOPLAM MİDAS etiketi yok', !/TOPLAM MİDAS/.test(html));
ok('MİDAS PORTFÖYÜ başlığı yok', !/MİDAS PORTFÖYÜ/.test(html));
ok('GÜNLÜK SONUÇLAR · MİDAS yok', !/GÜNLÜK SONUÇLAR · MİDAS/.test(html));
ok('KÜMÜLATİF SONUÇLAR · MİDAS yok', !/KÜMÜLATİF SONUÇLAR · MİDAS/.test(html));

/* 3) stksz-ai-engine.js denetimleri */
const eng = fs.readFileSync(engineFile, 'utf8');
ok('saveSnapshot accountKey/seq ekliyor', /snapshot\.accountKey = snapshot\.accountKey \|\| 'primary'/.test(eng) && /snapshot\.seq/.test(eng));
ok('getAccountSnapshots mevcut', /getAccountSnapshots\(/.test(eng));
ok('zincir-öncel karşılaştırma (same account+institution)', /candidate\.accountKey === targetSnapshot\.accountKey/.test(eng));

/* 4) stksz-ai-engine.js çalışma zamanı sanal yük testi (smoke subset) */
function smokeEngine() {
  const src = fs.readFileSync(engineFile, 'utf8');
  const store = {};
  const sandbox = {
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    console, fetch: async () => ({}),
    URLSearchParams, FormData, Blob,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  const engObj = sandbox.STKSZAccountEngine;
  const s1 = { id: 's1', accountKey: 'primary', institutionKey: 'midas', cashBalance: 1000, totalValue: 5000, assets: [{ symbol: 'A', currentValue: 100 }], timestamp: '2026-09-08T00:00:00Z' };
  const s2 = { id: 's2', accountKey: 'primary', institutionKey: 'midas', cashBalance: 1200, totalValue: 5200, assets: [{ symbol: 'A', currentValue: 120 }], timestamp: '2026-09-09T00:00:00Z' };
  engObj.saveSnapshot(s1);
  engObj.saveSnapshot(s2);
  const seq1 = engObj.getSnapshots().find(s => s.id === 's1').seq;
  const seq2 = engObj.getSnapshots().find(s => s.id === 's2').seq;
  ok('saveSnapshot seq sıralaması (s1=1, s2=2)', seq1 === 1 && seq2 === 2);
  const acc = engObj.getAccountSnapshots('primary');
  ok('getAccountSnapshots filtre', acc.length === 2);
  const cmp = engObj.compareWithPrevious(s2);
  ok('compareWithPrevious hesap-öncel kullandı (cashDelta 200)', cmp.hasPrevious === true && cmp.cashDelta === 200);
}
try { smokeEngine(); } catch (e) { ok('STKSZAccountEngine sanal yükleme', false, String(e && e.message)); }

/* 5) görsel testler */
ok('tests/portfolio-data-engine.test.js mevcut', fs.existsSync(path.join(ROOT, 'tests', 'portfolio-data-engine.test.js')));

/* 6) görünür ocrReview etiketleri genelleşti (köprü bölgesi) */
const ocrReviewTitle = /Midas verilerini kontrol et/.test(html);
ok('ocrReview başlığı Midas içermiyor', !ocrReviewTitle);

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);