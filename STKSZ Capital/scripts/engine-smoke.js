const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILE = path.join(__dirname, '..', 'www', 'stksz-ai-engine.rebuilt.js');
const src = fs.readFileSync(FILE, 'utf8');

async function makeStubs() {
  const store = {};
  return {
    window: {
      location: { origin: 'https://app.local', href: 'https://app.local/' },
      localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
      },
      navigator: { userAgent: 'test-agent', platform: 'test' },
      fetch: async () => ({}),
    },
    document: {
      createElement: () => ({ appendChild() {} }),
    },
    globalThis: null,
  };
}

(async () => {
  const stubs = await makeStubs();
  const sandbox = Object.assign({}, stubs.window);
  sandbox.window = stubs.window;
  sandbox.document = stubs.document;
  sandbox.localStorage = stubs.window.localStorage;
  sandbox.navigator = stubs.window.navigator;
  sandbox.fetch = stubs.window.fetch;
  sandbox.console = console;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'stksz-ai-engine.rebuilt.js' });

  const eng = sandbox.window.STKSZAIEngine || sandbox.STKSZAIEngine;
  if (!eng) throw new Error('STKSZAIEngine not exported');
  console.log('engine version:', eng.version, 'brand:', eng.brand);

  const checks = {
    'analysis.calculatePortfolioSummary': typeof eng.analysis.calculatePortfolioSummary,
    'analysis.compareWithBenchmarks': typeof eng.analysis.compareWithBenchmarks,
    'analysis.calculateRiskMetrics': typeof eng.analysis.calculateRiskMetrics,
    'analysis.generatePreMarketBriefing': typeof eng.analysis.generatePreMarketBriefing,
    'analysis.detectKeyMoments': typeof eng.analysis.detectKeyMoments,
    'analysis.generateMovementTimeline': typeof eng.analysis.generateMovementTimeline,
    'analysis.prepareInsightsCenterData': typeof eng.analysis.prepareInsightsCenterData,
    'analysis.analyzeConcentration': typeof eng.analysis.analyzeConcentration,
    'write.addToWatchlist': typeof eng.write.addToWatchlist,
    'write.saveUserPreference': typeof eng.write.saveUserPreference,
    'admin.getSystemInfo': typeof eng.admin.getSystemInfo,
    'admin.resetUserData': typeof eng.admin.resetUserData,
    'centralContext': typeof eng.centralContext,
    'STKSZAccountEngine global': typeof sandbox.window.STKSZAccountEngine,
    'STKSZAccountEngine.processAccountImage': typeof sandbox.window.STKSZAccountEngine?.processAccountImage,
    'STKSZAccountEngine.getSnapshots': typeof sandbox.window.STKSZAccountEngine?.getSnapshots,
    'STKSZAccountEngine.saveSnapshot': typeof sandbox.window.STKSZAccountEngine?.saveSnapshot,
    'STKSZAccountEngine.compareWithPrevious': typeof sandbox.window.STKSZAccountEngine?.compareWithPrevious,
  };
  let fail = 0;
  for (const [k, v] of Object.entries(checks)) {
    const ok = v !== 'undefined';
    if (!ok) fail++;
    console.log((ok ? 'PASS' : 'MISS'), k, '->', v);
  }

  const portfolio = {
    items: [
      { symbol: 'THYAO', currentPrice: 300, quantity: 10, avgCost: 250, dailyChangePct: 2, sector: 'Havacılık', pnl: 500, pnlPercent: 20 },
      { symbol: 'ASELS', currentPrice: 800, quantity: 4, avgCost: 900, dailyChangePct: -3, sector: 'Savunma', pnl: -400, pnlPercent: -11 },
    ],
  };
  const bench = { BIST100: { return: 1.5 } };
  const cmp = eng.analysis.compareWithBenchmarks(portfolio, bench);
  console.log('compareWithBenchmarks:', JSON.stringify(cmp));
  const ins = eng.analysis.prepareInsightsCenterData(portfolio, bench, { usdtry: 40 });
  console.log('prepInsights totalValue:', ins.portfolio.totalValue, 'benchmark keys:', Object.keys((ins.performance.benchmarks) || {}).join(',') || '(none)', 'portfolioReturn:', ins.performance.portfolioReturn);
  const cmpB = eng.analysis.compareWithBenchmarks(portfolio, bench);
  console.log('cmpReturn portfolioReturn:', cmpB.portfolioReturn, 'benchmark keys:', Object.keys(cmpB.benchmarks || {}).join(','));
  if (!ins.performance.benchmarks || Object.keys(ins.performance.benchmarks).length === 0) { console.log('INSIGHTS BENCHMARKS MISSING'); fail++; }
  const sum = eng.analysis.calculatePortfolioSummary(portfolio);
  console.log('summary winners/losers:', sum.winners, '/', sum.losers);

  for (const q of ['BIST nedir?', 'Hisse senedi F/K oranı nasıl hesaplanır?', 'gold fiyatları ne durumda?', 'günaydın']) {
    try {
      const r = eng.route(q);
      console.log('route OK [' + q + '] ->', (r && (r.text || r.data || '').toString().slice(0, 60)));
    } catch (e) {
      console.log('route FAIL [' + q + '] ->', e.message);
      fail++;
    }
  }
  if (typeof sandbox.window.STKSZAccountEngine === 'undefined') {
    console.log('NOTE: STKSZAccountEngine not exposed on window');
  }
  console.log(fail ? 'FAILURES: ' + fail : 'ALL RUNTIME CHECKS OK');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('REJECTED:', e.message); process.exit(2); });