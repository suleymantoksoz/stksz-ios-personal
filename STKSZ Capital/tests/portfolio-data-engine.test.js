/* STKSZ CAPITAL — FAZ 3 portfolio-data-engine deterministik testleri
   Kapsam: kurum-bağımsız model, kurum tespiti, hidrasyon, aggregate,
   snapshot zinciri (account-keyed + öncel), nakit delta ≠ K/Z, preview diff,
   scope policy (ENR/TP2), tek veri kaynağı sorguları, determinant fixtures. */
const PF = require('../www/portfolio-data-engine.js');

let passed = 0, failed = 0;
function t(name, ok, extra) {
  if (ok) { passed++; console.log('PASS ' + name); }
  else { failed++; console.log('FAIL ' + name + (extra ? ' :: ' + JSON.stringify(extra) : '')); }
}

/* ---- 3.13 deterministik fixture'lar (sahte veri DEĞİL; kurum/kaynak biçimleri) ---- */
const MidasSample = {
  midasCash: 1200.5, midasCashUsd: 100, midasCashEur: 50,
  assets: [
    { s: 'THYAO', q: 100, avgCost: 265, p: 285, v: 28500, d: 320, unrealized: 2000, type: 'Hisse' },
    { s: 'ASELS', q: 0.5, avgCost: 370, p: 386, v: 193, d: 5, unrealized: 8, type: 'Hisse' },
    { s: 'GARAN', q: null, p: 95, type: 'Hisse' },        // eksik adet -> belirsiz
    { s: 'ENR',  q: 1, p: 5, v: 5, type: 'Fon' }           // ENR primary içinden çıkarılmalı
  ],
  enr: { total: 12345, units: 500, dist: [['ENR', 500]], todayChangePct: 0.4, dailyGainTL: 30 }
};

/* ---- hidrasyon + aggregate ---- */
{
  const model = PF.hydrateLegacy(MidasSample);
  t('2 hesap türetildi (primary+ENR)', model.accounts.length === 2);
  const agg = PF.aggregate(model);
  t('ENR aggregate dışı', agg.totalValue !== null && model.accounts[1].includeInAggregate === false);
  t('ENR masked + hassas scope', PF.scopePolicy(model.accounts[1]).sensitivity === 'sensitive');
  t('primary ENR pozisyonu strip edildi', !model.accounts[0].positions.some(p => p.symbol === 'ENR'));
  t('aggregate status OK', agg.status === 'OK');
  t('belirsiz pozisyon işaretli', model.accounts[0].positions.find(p => p.symbol === 'GARAN').uncertain === true);
}

/* ---- kurum tespiti (3.5) ---- */
{
  t('Midas tespit', PF.detectInstitution('Midas portföy ekranı pozisyonum').key === 'midas');
  t('Enpara tespit', PF.detectInstitution('ENR / Enpara fon birim fiyatı').key === 'enpara');
  t('bilinmeyen -> unknown', PF.detectInstitution('rastgele bir tablo çıktısı').key === 'unknown');
}

/* ---- seçili hesap + provider aksiyonu (3.2) ---- */
{
  const model = PF.hydrateLegacy(MidasSample);
  t('varsayılan seçili hesap primary', PF.selectedAccount(model, {}).key === 'primary');
  const pa = PF.providerAction(model, { selectedAccountKey: 'primary' });
  t('primary (Midas) provider aksiyonu MIDAS', pa && pa.key === 'midas' && pa.label === "MIDAS'A GİT");
  const paEnr = PF.providerAction(model, { selectedAccountKey: 'enr' });
  t('ENR hesabı provider aksiyonu YOK (pasif)', paEnr === null);
}

/* ---- snapshot zinciri (3.8) ---- */
{
  const model = PF.hydrateLegacy(MidasSample);
  const s1 = PF.buildSnapshot(model, 'primary', { at: '2026-09-08T08:00:00Z', seq: 1 });
  const s2 = PF.buildSnapshot(model, 'primary', { at: '2026-09-09T08:00:00Z', seq: 2 });
  t('buildSnapshot accountKey+maskPolicy', s1.accountKey === 'primary' && s1.maskPolicy === 'plain');
  const seq = PF.nextSeq([s1], 'primary');
  t('nextSeq aynı hesap bazlı', seq === 2);
  const pred = PF.predecessorFor([s1, s2], s2);
  t('öncel YALNIZ aynı account+institution', pred && pred.id === s1.id);
  const cmp = PF.compareSnapshots(s2, s1);
  // aynı model olduğu için değişiklik yok
  t('aynı model karşılaştırması değişikliksiz', cmp.comparable === true && cmp.assetChanges.length === 0);
  const sOther = PF.buildSnapshot(model, 'enr', { at: '2026-09-10T08:00:00Z' });
  const crossAcc = PF.compareSnapshots(s2, sOther);
  t('farklı hesap zinciri karşılaştırılmaz', crossAcc.comparable === false && crossAcc.mismatchedAccount === true);
}

/* ---- nakit delta ≠ K/Z (3.9) ---- */
{
  const none = PF.classifyCashDelta(null, 100, []);
  t('nakit verisi eksik -> VERİ YOK', none.kind === 'none' && none.label === 'VERİ YOK');
  const noChange = PF.classifyCashDelta(500, 500, []);
  t('değişim yok delta 0', noChange.kind === 'none' && noChange.delta === 0);
  const delta = PF.classifyCashDelta(1500, 1000, []);
  t('delta asla PnL sanılmaz', delta.isPnl === false && delta.label === 'NAKİT DELTA');
  t('delta işlem kaydı yok -> düşük güven', delta.confidence <= 50);
}

/* ---- import önizleme diff (3.7) ---- */
{
  const pdiff = PF.previewDiff(
    { assets: [{ s: 'THYAO', q: 120, avgCost: 270, p: 290, v: 34800 }], rawText: 'Midas pozisyonlar' },
    MidasSample, {}
  );
  t('önizleme kurum tespiti Midas', pdiff.institution.key === 'midas');
  t('önizleme CHANGE satırı (adet 100->120)', pdiff.rows.some(r => r.symbol === 'THYAO' && r.status === 'CHANGE'));
  t('önizleme yazma onayı zorunlu', pdiff.writeApprovalRequired === true);
}

/* ---- tek veri kaynağı sorguları (3.12) ---- */
{
  const sample = { ...MidasSample, transactions: [{ symbol: 'THYAO', type: 'deposit', amount: 500, date: '2026-09-01' }] };
  sample.assets[0]._orderHistory = [{ side: 'buy', quantity: 100, price: 265, amount: 26500, date: '2026-08-01' }];
  const oh = PF.orderHistory(sample, {});
  t('orderHistory pozisyon emirlerini birleştirir', oh.some(o => o.symbol === 'THYAO' && o.side === 'buy'));
  const cm = PF.cashMovements(sample, {});
  t('cashMovements deposit sınıflar', cm.some(m => m.kind === 'deposit'));
  /* normalize */
  const norm = PF.normalizeParsed({ assets: [{ s: 'ASELS', q: 10, p: 300 }], rawText: '' });
  t('normalize uppercase + sayısal', norm.positions[0].symbol === 'ASELS' && norm.positions[0].quantity === 10);
}

/* ---- 3.13 genişletilmiş deterministik fixture'lar ---- */
{
  const akbank = PF.detectInstitution('Akbank yatırım portföyüm ekranı');
  t('farklı banka tespiti Akbank', akbank.key === 'akbank');
  const crypto = PF.detectInstitution('BTC/USDT bakiye USD 1200');
  t('kripto/cüzdan bilinmeyen kurum (uydurma kurum yok)', crypto.key === 'unknown');
  const csvLike = PF.normalizeParsed({ assets: [{ s: 'thyao', q: '10', p: '280', avgCost: '250' }], rawText: 'CSV satırları' });
  t('CSV/text biçimi normalize edildi', csvLike.positions[0].symbol === 'THYAO' && csvLike.positions[0].quantity === 10 && csvLike.positions[0].avgCost === 250);
  const partial = PF.normalizeParsed({ assets: [{ s: 'GARAN', q: null, p: 95 }], rawText: 'kısmi ekran' });
  t('kısmi ekran -> belirsiz pozisyon', partial.positions[0].uncertain === true);
  const empty = PF.normalizeParsed({ assets: [], rawText: '' });
  t('boş/bozuk görsel -> pozisyon yok (VERİ YETERSİZ yolu)', Array.isArray(empty.positions) && empty.positions.length === 0);
  /* "1 lot bile" yanlış merge edilmemeli: aynı sembolden iki satır ayrı kalır */
  const noMerge = PF.previewDiff(
    { assets: [{ s: 'THYAO', q: 1, p: 285 }, { s: 'THYAO', q: 2, p: 286 }], rawText: 'Midas kopya satırlar' },
    MidasSample, {}
  );
  t('aynı sembol iki satır ASLA merge edilmedi', noMerge.rows.filter(r => r.symbol === 'THYAO').length === 2);
  t('önceki THYAO 100 lot CHANGE satırı ayrı', noMerge.rows.some(r => r.status === 'CHANGE'));
}
/* ---- fixtureResult helper ---- */
{
  t('fixtureResult ok', PF.fixtureResult('ok', 'x').ok === true);
  t('fixtureResult err', PF.fixtureResult('err', 'x').ok === false);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
