/* ============================================================
   STKSZ CAPITAL — FAZ 3 Portföy / Hesaplar Veri Motoru
   Kurumdan Bağımsız Hesaplar Modeli
   (Account / Institution / Asset / Position / Snapshot /
    CashBalance / Transaction) + Import-OCR-Vision orkestrasyonu.

   KURALLAR:
   - Sahte veri üretmez; veri yoksa VERİ YOK / VERİ YETERSİZ — KARAR YOK.
   - Nakit deltası kâr/zarar sanılmaz; çıkarım etiketli ve güven seviyelidir.
   - Snapshot karşılaştırması YALNIZ aynı account+institution zincirinde.
   - ENR/TP2 karar kurumu adıyla değil includeInAggregate/scope policy ile yönetilir.
   - Bağımlılık yok; browser (window.STKSZPortfolioDataEngine) + node (module.exports).
   ============================================================ */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.STKSZPortfolioDataEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------------- yardımcılar ---------------- */
  function finite(v) {
    if (v === null || v === undefined || String(v).trim() === "") return null;
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function round6(n) { return Math.round((Number(n) || 0) * 1e6) / 1e6; }
  function clone(obj) { return obj == null ? obj : JSON.parse(JSON.stringify(obj)).valueOf(); }
  function upperKey(s) { return String(s || "").toUpperCase().trim(); }

  /* ---------------- kurum kataloğu (metadata, ana MODEL değil) ---------------- */
  var INSTITUTIONS = {
    midas:     { name: "Midas", type: "broker", country: "TR", providerKey: "midas", scope: "private" },
    enpara:    { name: "Enpara", type: "bank", country: "TR", providerKey: "enpara", scope: "private" },
    isyatirim: { name: "İş Yatırım", type: "broker", country: "TR", providerKey: "isyatirim", scope: "private" },
    akbank:    { name: "Akbank", type: "bank", country: "TR", providerKey: "akbank", scope: "private" },
    yapikredi: { name: "Yapı Kredi", type: "bank", country: "TR", providerKey: "yapikredi", scope: "private" },
    garanti:   { name: "Garanti BBVA", type: "bank", country: "TR", providerKey: "garanti", scope: "private" },
    deniz:     { name: "Deniz Yatırım", type: "broker", country: "TR", providerKey: "deniz", scope: "private" },
    hsbc:      { name: "HSBC", type: "bank", country: "TR", providerKey: "hsbc", scope: "private" },
    vakif:     { name: "Vakıf Yatırım", type: "broker", country: "TR", providerKey: "vakif", scope: "private" },
    tefas:     { name: "TEFAS / Fon", type: "fund", country: "TR", providerKey: "tefas", scope: "public" },
    "qnb":     { name: "QNB Finansbank", type: "bank", country: "TR", providerKey: "qnb", scope: "private" },
    ziraat:    { name: "Ziraat Bankası", type: "bank", country: "TR", providerKey: "ziraat", scope: "private" },
    "crypto":  { name: "Kripto Borsası", type: "crypto", country: "", providerKey: "crypto", scope: "private" },
    "generic": { name: "Diğer Kurum", type: "generic", country: "", providerKey: "generic", scope: "private" }
  };

  /* ---------------- 3.5 kaynak (kurum) otomatik tespiti ---------------- */
  var DETECTION_RULES = [
    { key: "midas",     re: /(midas|pozisyonum|to[pl]+am\s+(midas|portf)|bugünkü\s+getiri|ort\.?\s*fiyat|valör)/i, c: 0.92 },
    { key: "enpara",    re: /(enpara|enr\b|qnb\s+portf|lütfen\s+giriş\s+yapınız\b|yarım\s+saat\b)/i, c: 0.9 },
    { key: "isyatirim", re: /(i[şs]\s+yat[ıi]r[ıi]m|isyatirim|is\s+yatirim)/i, c: 0.88 },
    { key: "akbank",    re: /(\bakbank|ak\s+bank\b)/i, c: 0.88 },
    { key: "yapikredi", re: /(yap[ıi]\s*kredi|yapikredi|ykbnk\s+bank)/i, c: 0.88 },
    { key: "garanti",   re: /(garanti\s*(bbva)?\b|garan)/i, c: 0.85 },
    { key: "deniz",     re: /(deniz\s*(yat[ıi]r[ıi]m)?\b|denizbank)/i, c: 0.85 },
    { key: "hsbc",      re: /(\bhsbc\b)/i, c: 0.9 },
    { key: "vakif",     re: /(vak[ıi]f\s*(yat[ıi]r[ıi]m)?\b|vak[ıi]fbank)/i, c: 0.85 },
    { key: "tefas",     re: /(tefas|fon\s*b[ıi]r[ıi]m\s*f[ıi]yat[ıi]|fon\s*detay)/i, c: 0.8 },
    { key: "qnb",       re: /(qnb|finansbank)/i, c: 0.8 }
  ];

  function detectInstitution(text) {
    var t = String(text || "");
    var best = null;
    for (var i = 0; i < DETECTION_RULES.length; i++) {
      if (DETECTION_RULES[i].re.test(t)) {
        var r = DETECTION_RULES[i];
        if (!best || r.c > best.c) best = r;
      }
    }
    if (!best) return { key: "unknown", name: "Kurum bilinmiyor", confidence: 0, matched: [] };
    return { key: best.key, name: (INSTITUTIONS[best.key] || {}).name || best.key, confidence: best.c, matched: [best.key] };
  }

  /* ---------------- 3.1 model üreticileri (plain objects) ---------------- */
  function account(a) {
    a = a || {};
    return {
      key: a.key || "acc_" + Date.now(),
      institutionKey: a.institutionKey || "generic",
      institutionName: a.institutionName || ((INSTITUTIONS[a.institutionKey] || {}).name || "Diğer Kurum"),
      name: a.name || "Hesap",
      scope: a.scope || "private",
      includeInAggregate: a.includeInAggregate !== false,
      masked: Boolean(a.masked),
      currency: a.currency || "TRY",
      providerKey: a.providerKey || null,
      note: a.note || "",
      positions: Array.isArray(a.positions) ? a.positions : [],
      cashBalance: a.cashBalance || null,             // {tl,usd,eur,fxTl}
      meta: a.meta || {},
      source: a.source || "",
      createdAt: a.createdAt || null
    };
  }

  function position(p) {
    p = p || {};
    return {
      id: p.id || "pos_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
      symbol: upperKey(p.symbol),
      name: p.name || null,
      type: p.type || "asset",           // stock|fund|crypto|commodity|cash|other
      quantity: finite(p.quantity) != null ? round6(p.quantity) : null,
      avgCost: finite(p.avgCost),        // birim maliyet
      price: finite(p.price),            // güncel birim fiyat (odağı)
      value: finite(p.value),            // güncel toplam değer
      daily: finite(p.daily),            // günlük kâr/zarar (TL)
      dailyPct: finite(p.dailyPct),
      unrealized: finite(p.unrealized),  // kâğıt kâr/zarar (TL)
      fieldConfidence: p.fieldConfidence || {},
      uncertain: Boolean(p.uncertain),
      segment: p.segment || "",
      source: p.source || ""
    };
  }

  function cashBalance(c) {
    c = c || {};
    return {
      tl: finite(c.tl),
      usd: finite(c.usd),
      eur: finite(c.eur),
      fxTl: finite(c.fxTl)               // dövizin TL karşılığı (toplama dahil)
    };
  }

  function transaction(t) {
    t = t || {};
    return {
      id: t.id || String(Date.now()),
      symbol: upperKey(t.symbol),
      side: t.side === "sell" ? "sell" : t.side === "buy" ? "buy" : t.type || "unknown",
      kind: t.kind || "trade",           // trade|deposit|withdrawal|dividend|fee
      quantity: finite(t.quantity),
      price: finite(t.price),
      amount: finite(t.amount),
      date: t.date || "",
      source: t.source || "",
      accountKey: t.accountKey || null,
      confidence: finite(t.confidence)   // 0-100
    };
  }

  /* ---------------- 3.10 scope / kapsam politikası ---------------- */
  function scopePolicy(acc) {
    acc = acc || {};
    var inc = acc.includeInAggregate !== false;
    var masked = Boolean(acc.masked);
    var sensitivity = masked ? "sensitive" : (acc.scope === "private" ? "private" : "public");
    return { includeInAggregate: inc, masked: masked, sensitivity: sensitivity };
  }

  /* ---------------- 3.1 legacy (mevcut) veriden hesapları türetme ---------------- */
  function legacyPositionsFromAssets(assets) {
    if (!Array.isArray(assets)) return [];
    return assets.map(function (a) {
      var p = position({
        symbol: a.s,
        name: a.name,
        type: a.type,
        quantity: a.q,
        avgCost: a.avgCost,
        price: a.p,
        value: a.v != null ? a.v : (finite(a.q) != null && finite(a.p) != null ? round6(a.q * a.p) : null),
        daily: a.d,
        dailyPct: a.dp,
        unrealized: a.unrealized,
        source: a.source || "",
        fieldConfidence: { q: finite(a.q) != null ? 85 : 0, avgCost: finite(a.avgCost) != null ? 85 : 0, p: a.marketVerified ? 90 : (finite(a.p) != null ? 70 : 0) },
        uncertain: finite(a.q) == null || finite(a.p) == null
      });
      if (a._orderHistory) p._orderHistory = a._orderHistory;
      if (a._dividends) p._dividends = a._dividends;
      return p;
    }).filter(function (p) { return p.symbol; });
  }

  function legacyEnrAccount(enr) {
    /* ENR/TP2 ayrı hesap: includeInAggregate:false + masked:true —
       kurum adıyla değil scope policy ile yönetilir. */
    var total = finite(enr && enr.total), units = finite(enr && enr.units), unitPrice = finite(enr && enr.unit);
    var dist = Array.isArray(enr && enr.dist) ? enr.dist : [];
    var positions = dist
      .map(function (row) {
        return position({ symbol: upperKey(row[0]), name: upperKey(row[0]), type: "fund", quantity: finite(row[1]), price: null, uncertain: finite(row[1]) == null, fieldConfidence: {} });
      })
      .filter(function (p) { return p.symbol; });
    return account({
      key: "enr", institutionKey: "enpara", name: "Enpara (ENR/TP2)", scope: "private",
      includeInAggregate: false, masked: true, currency: "TRY", providerKey: "enpara",
      positions: positions,
      cashBalance: cashBalance({}),
      meta: { total: total, units: units, unitPrice: unitPrice, dist: dist, todayChangePct: finite(enr && enr.todayChangePct), dailyGainTL: finite(enr && enr.dailyGainTL), totalProfit: finite(enr && enr.profit), profitPct: finite(enr && enr.profitPct) },
      source: "ENR görsel/uygulama kaydı"
    });
  }

  function hydrateLegacy(data) {
    data = data || {};
    var accounts = [];
    /* Ana (seçili) hesap — mevcut düz varlık listesi kurumdan bağımsız 'primary' hesaba bağlanır */
    var primary = account({
      key: "primary", institutionKey: "midas", name: "Seçili Hesap", scope: "private",
      includeInAggregate: true, masked: false, currency: "TRY", providerKey: "midas",
      positions: legacyPositionsFromAssets(stripEnr(data.assets)),
      cashBalance: cashBalance({ tl: finite(data.midasCash), usd: finite(data.midasCashUsd), eur: finite(data.midasCashEur), fxTl: finite(data.fxCashTl) != null ? data.fxCashTl : null }),
      meta: { settlement: data.settlement || null, dailySource: data.midasDailySource || "", dailyVerified: Boolean(data.midasDailyVerified) },
      source: "Kurumdan bağımsız ana hesap"
    });
    accounts.push(primary);
    /* ENR ayrı hassas hesap */
    if (data.enr && typeof data.enr === "object" && (finite(data.enr.total) != null || finite(data.enr.units) != null || Array.isArray(data.enr.dist))) {
      accounts.push(legacyEnrAccount(data.enr));
    }
    return { accounts: accounts, primaryAccountKey: "primary", generatedAt: new Date().toISOString() };
  }

  function stripEnr(assets) {
    if (!Array.isArray(assets)) return assets;
    var iso = { ENR: 1, ENPARA: 1, "ENR.F": 1, ENRFON: 1 };
    return assets.filter(function (a) { return !iso[upperKey(a && a.s)]; });
  }

  /* ---------------- 3.2 / 3.9 toplam & nakit hesabı ---------------- */
  function accountTotals(acc) {
    acc = acc || {};
    var positions = Array.isArray(acc.positions) ? acc.positions : [];
    var invValue = 0, posCount = 0, unrealized = null, unrealizedPos = 0, unrealizedNeg = 0, dailyNet = null;
    positions.forEach(function (p) {
      var v = finite(p.value);
      if (v != null) { invValue += v; }
      if (finite(p.quantity) != null) posCount++;
      var u = finite(p.unrealized);
      if (u != null) { if (unrealized == null) unrealized = 0; unrealized += u; if (u > 0) unrealizedPos += u; else if (u < 0) unrealizedNeg += Math.abs(u); }
      var d = finite(p.daily);
      if (d != null) { if (dailyNet == null) dailyNet = 0; dailyNet += d; }
    });
    var cash = acc.cashBalance || {};
    var cashTl = finite(cash.tl), fxTl = finite(cash.fxTl), usd = finite(cash.usd), eur = finite(cash.eur);
    var cashTotal = null;
    var has = function (v) { return v != null; };
    var anyCash = has(cashTl) || has(fxTl) || has(usd) || has(eur);
    if (anyCash) {
      cashTotal = 0;
      if (has(cashTl)) cashTotal += cashTl;
      if (has(fxTl)) cashTotal += fxTl;
    }
    return {
      totalValue: finite(cashTotal) != null ? round6(cashTotal + invValue) : (positions.length ? round6(invValue) : null),
      investmentValue: positions.length ? round6(invValue) : null,
      cashTotal: cashTotal != null ? round6(cashTotal) : null,
      cashTl: cashTl, fxTl: fxTl, usd: usd, eur: eur,
      unrealized: unrealized != null ? round6(unrealized) : null,
      unrealizedProfit: round6(unrealizedPos),
      unrealizedLoss: round6(unrealizedNeg),
      dailyNet: dailyNet != null ? round6(dailyNet) : null,
      posCount: posCount,
      positions: positions
    };
  }

  function aggregate(dataOrModel) {
    var model = dataOrModel && dataOrModel.accounts ? dataOrModel : hydrateLegacy(dataOrModel || {});
    var accounts = model.accounts || [];
    var total = null, inv = null, cash = null, unrealPos = 0, unrealNeg = 0, daily = null, posCount = 0;
    accounts.forEach(function (acc) {
      if (!scopePolicy(acc).includeInAggregate) return;
      var t = accountTotals(acc);
      if (t.totalValue != null) total = (total == null ? 0 : total) + t.totalValue;
      if (t.investmentValue != null) inv = (inv == null ? 0 : inv) + t.investmentValue;
      if (t.cashTotal != null) cash = (cash == null ? 0 : cash) + t.cashTotal;
      unrealPos += t.unrealizedProfit || 0; unrealNeg += t.unrealizedLoss || 0;
      if (t.dailyNet != null) daily = (daily == null ? 0 : daily) + t.dailyNet;
      posCount += t.posCount;
    });
    return {
      accounts: accounts,
      totalValue: total != null ? round6(total) : null,
      investmentValue: inv != null ? round6(inv) : null,
      cashTotal: cash != null ? round6(cash) : null,
      unrealizedProfit: round6(unrealPos), unrealizedLoss: round6(unrealNeg),
      dailyNet: daily != null ? round6(daily) : null,
      posCount: posCount,
      primaryAccountKey: model.primaryAccountKey || "primary",
      status: total == null ? "VERİ YOK" : "OK"
    };
  }

  /* ---------------- 3.2 seçili hesap + provider aksiyonu ---------------- */
  function selectedAccount(model, prefs) {
    var accounts = (model && model.accounts) || [];
    var key = (prefs && prefs.selectedAccountKey) || (model && model.primaryAccountKey) || "primary";
    var found = null;
    for (var i = 0; i < accounts.length; i++) { if (accounts[i].key === key) { found = accounts[i]; break; } }
    return found || accounts[0] || null;
  }

  function providerAction(model, prefs) {
    var acc = selectedAccount(model, prefs);
    if (!acc) return null;
    var ik = upperKey(acc.institutionKey);
    if (ik === "MIDAS" || acc.providerKey === "midas") {
      return { key: "midas", label: "MIDAS'A GİT", kind: "app", intents: ["midas://", "getmidas://", "midasapp://"] };
    }
    return null;
  }

  /* ---------------- 3.8 snapshot zinciri (aynı account öncel) ---------------- */
  function buildSnapshot(model, accountKey, opts) {
    opts = opts || {};
    model = model && model.accounts ? model : hydrateLegacy(model || {});
    var acc = null;
    for (var i = 0; i < (model.accounts || []).length; i++) { if (model.accounts[i].key === accountKey) { acc = model.accounts[i]; break; } }
    if (!acc) acc = selectedAccount(model, {});
    var t = accountTotals(acc);
    return {
      id: opts.id || "snap_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6),
      accountKey: accountKey || acc.key,
      institutionKey: acc.institutionKey,
      institutionName: acc.institutionName,
      maskPolicy: scopePolicy(acc).masked ? "masked" : "plain",
      at: opts.at || new Date().toISOString(),
      seq: opts.seq || null,
      cashBalance: t.cashTotal,
      cash: acc.cashBalance || {},
      totalValue: t.totalValue,
      investmentValue: t.investmentValue,
      positions: (t.positions || []).map(function (p) {
        return { symbol: p.symbol, name: p.name, quantity: p.quantity, avgCost: p.avgCost, price: p.price, value: p.value, daily: p.daily, unrealized: p.unrealized };
      }),
      includeInAggregate: scopePolicy(acc).includeInAggregate,
      confidence: opts.confidence != null ? opts.confidence : 85,
      source: opts.source || "hesap snapshot"
    };
  }

  function nextSeq(history, accountKey) {
    var list = (history || []).filter(function (s) { return s && s.accountKey === accountKey; });
    var seqs = list.map(function (s) { return finite(s.seq) || 0; });
    var max = seqs.length ? Math.max.apply(null, seqs) : 0;
    return max + 1;
  }

  function snapshotsByAccount(history) {
    var map = {};
    (history || []).forEach(function (s) {
      if (!s || !s.accountKey) return;
      map[s.accountKey] = map[s.accountKey] || [];
      map[s.accountKey].push(s);
    });
    Object.keys(map).forEach(function (k) {
      map[k].sort(function (a, b) { return String(a.at < b.at ? -1 : a.at > b.at ? 1 : a.seq - b.seq || 0); });
    });
    return map;
  }

  /** Önceki snapshot: YALNIZ aynı accountKey ve aynı institutionKey zincirinde. */
  function predecessorFor(history, snapshot) {
    if (!snapshot || !snapshot.accountKey) return null;
    var same = (history || []).filter(function (s) {
      return s && s.accountKey === snapshot.accountKey && s.institutionKey === snapshot.institutionKey &&
        s.id !== snapshot.id && String(s.at || "") < String(snapshot.at || "");
    });
    if (!same.length) return null;
    same.sort(function (a, b) { return String(a.at < b.at ? 1 : a.at > b.at ? -1 : 0); });
    return same[0];
  }

  /** 3.8: NEW / CHANGE / REMOVED + adet/değer/nakit delta (yalnız aynı hesap zinciri). */
  function compareSnapshots(current, previous) {
    if (!current || !previous) {
      return { comparable: false, note: "Karşılaştırma için önceki snapshot gereklidir." };
    }
    if (current.accountKey && previous.accountKey && current.accountKey !== previous.accountKey) {
      return { comparable: false, note: "Farklı hesap zinciri; karşılaştırılmaz.", mismatchedAccount: true };
    }
    if (current.institutionKey && previous.institutionKey && current.institutionKey !== previous.institutionKey) {
      return { comparable: false, note: "Farklı kurum zinciri; karşılaştırılmaz.", mismatchedInstitution: true };
    }
    var cur = indexPositions(current.positions), prev = indexPositions(previous.positions);
    var changes = [];
    Object.keys(cur).forEach(function (sym) {
      var c = cur[sym], p = prev[sym];
      if (!p) {
        changes.push({ type: "NEW", symbol: sym, name: c.name, quantity: c.quantity, value: c.value, deltaValue: finite(c.value) });
      } else {
        var dv = finite(c.value) != null && finite(p.value) != null ? round6(c.value - p.value) : null;
        var dq = finite(c.quantity) != null && finite(p.quantity) != null ? round6(c.quantity - p.quantity) : null;
        if ((dv != null && Math.abs(dv) > 0.01) || (dq != null && Math.abs(dq) > 0.0001)) {
          changes.push({ type: "CHANGE", symbol: sym, name: c.name, previousValue: p.value, currentValue: c.value, deltaValue: dv, previousQuantity: p.quantity, currentQuantity: c.quantity, deltaQuantity: dq });
        }
      }
    });
    Object.keys(prev).forEach(function (sym) {
      if (!cur[sym]) changes.push({ type: "REMOVED", symbol: sym, name: prev[sym].name, value: prev[sym].value, deltaValue: finite(prev[sym].value) != null ? -round6(prev[sym].value) : null });
    });
    var cashDelta = finite(current.cashBalance) != null && finite(previous.cashBalance) != null ? round6(current.cashBalance - previous.cashBalance) : null;
    var totalDelta = finite(current.totalValue) != null && finite(previous.totalValue) != null ? round6(current.totalValue - previous.totalValue) : null;
    return {
      comparable: true,
      previousAt: previous.at,
      currentAt: current.at,
      cashDelta: cashDelta,
      totalDelta: totalDelta,
      assetChanges: changes,
      note: changes.length ? null : "Aynı hesap zincirinde algılanan değişiklik yok."
    };
  }

  function indexPositions(list) {
    var map = {};
    (list || []).forEach(function (p) { if (p && p.symbol) map[p.symbol] = p; });
    return map;
  }

  /* ---------------- 3.9 nakit delta ≠ kâr/zarar ---------------- */
  function classifyCashDelta(cashAfter, cashBefore, txBetween) {
    var a = finite(cashAfter), b = finite(cashBefore);
    if (a == null || b == null) {
      return { kind: "none", label: "VERİ YOK", isPnl: false, confidence: 0, note: "Nakit verisi eksik; delta hesaplanmadı." };
    }
    var delta = round6(a - b);
    if (Math.abs(delta) < 0.01) {
      return { kind: "none", label: "Nakit değişimi yok", isPnl: false, confidence: 100, delta: 0, note: "" };
    }
    var tx = Array.isArray(txBetween) ? txBetween : [];
    var flows = 0, trades = 0;
    tx.forEach(function (t) {
      var amt = finite(t.amount);
      if (amt == null) return;
      if (t.kind === "deposit" || t.kind === "withdrawal" || t.side === "deposit" || t.side === "withdrawal") flows += t.kind === "withdrawal" ? amt : (t.side === "withdrawal" ? amt : -amt);
      else if (t.kind === "trade" || t.side === "buy" || t.side === "sell") trades += amt;
    });
    var residual = round6(delta - (flowSigned(flows)));
    var hasFlow = Math.abs(flowSigned(flows)) > 0.01;
    var note = "Nakit artışı/azalışı doğrudan kâr/zarar kabul edilmez. ";
    if (!tx.length) note += "İşlem kaydı yok; yalnız delta gösterilir.";
    else if (hasFlow) note += "Para yatırma/çekme dahil edildi; kalıntı çıkarım değildir.";
    else note += "İşlem kayıtları nakit hareketini tam açıklamıyor; çıkarım yapılmadı.";
    return {
      kind: hasFlow ? "delta_with_flows" : "delta",
      label: "NAKİT DELTA", delta: delta, residualAfterFlows: residual,
      isPnl: false, confidence: hasFlow ? 50 : 30,
      flows: round6(flowSigned(flows)),
      note: note
    };
  }
  function flowSigned(v) { return round6(-(Number(v) || 0)); }

  /* ---------------- 3.6 parse sonucunu normalize etme ---------------- */
  function normalizeParsed(parsed) {
    parsed = parsed || {};
    var assets = Array.isArray(parsed.assets) ? parsed.assets : [];
    var institution = detectInstitution((parsed.rawText || "") + " " + (parsed.institution || ""));
    var positions = assets.map(function (a) {
      var fc = a.fieldConfidence || {};
      var q = finite(a.q != null ? a.q : a.quantity), p = finite(a.p != null ? a.p : a.price), avg = finite(a.avgCost != null ? a.avgCost : a.cost);
      return position({
        symbol: a.s != null ? a.s : a.symbol, name: a.name, type: a.type, quantity: q, avgCost: avg, price: p,
        value: finite(a.v != null ? a.v : a.totalValue != null ? a.totalValue : a.currentValue),
        daily: finite(a.d), dailyPct: finite(a.dp), unrealized: finite(a.unrealized),
        fieldConfidence: fc, uncertain: a.uncertain || q == null || p == null, segment: a.segment, source: a.source || parsed.broker || parsed.source
      });
    }).filter(function (p) { return p.symbol; });
    return {
      parsed: parsed,
      institution: institution,
      positions: positions,
      source: parsed.source || parsed.broker || "bilinmiyor",
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : []
    };
  }

  /* ---------------- 3.7 import önizleme diff'i ---------------- */
  function previewDiff(parsed, dataOrModel, opts) {
    opts = opts || {};
    var model = dataOrModel && dataOrModel.accounts ? dataOrModel : hydrateLegacy(dataOrModel || {});
    var acc = selectedAccount(model, opts.prefs);
    var current = indexPositions(acc ? acc.positions : []);
    var norm = normalizeParsed(parsed);
    var rows = [];
    norm.positions.forEach(function (np) {
      var cur = current[np.symbol];
      var prevValue = cur ? finite(cur.value) : null;
      var prevQty = cur ? finite(cur.quantity) : null;
      var newValue = finite(np.value) != null ? np.value : (finite(np.quantity) != null && finite(np.price) != null ? round6(np.quantity * np.price) : null);
      var changeValue = newValue != null && prevValue != null ? round6(newValue - prevValue) : null;
      var changeQty = finite(np.quantity) != null && prevQty != null ? round6(np.quantity - prevQty) : null;
      var isChanged = (changeValue != null && Math.abs(changeValue) > 0.01) || (changeQty != null && Math.abs(changeQty) > 0.0001) || np.uncertain;
      rows.push({
        symbol: np.symbol, name: np.name, type: np.type, quantity: np.quantity, avgCost: np.avgCost, price: np.price, value: newValue,
        status: cur ? (isChanged ? "CHANGE" : "NO_CHANGE") : "NEW",
        changeValue: changeValue, changeQty: changeQty,
        confidence: Math.round(finite(np.confidence) != null ? np.confidence : 70),
        uncertain: np.uncertain, fieldConfidence: np.fieldConfidence, segment: np.segment
      });
    });
    var removed = [];
    if (opts.authoritative) {
      Object.keys(current).forEach(function (sym) {
        if (!norm.positions.some(function (p) { return p.symbol === sym; })) {
          var c = current[sym];
          removed.push({ symbol: sym, name: c.name, value: finite(c.value), status: "REMOVED", confidence: 100, uncertain: false });
        }
      });
    }
    return {
      institution: norm.institution,
      targetAccountKey: acc ? acc.key : "primary",
      targetAccountName: acc ? acc.name : "—",
      rows: rows.concat(removed),
      newCount: rows.filter(function (r) { return r.status === "NEW"; }).length,
      changeCount: rows.filter(function (r) { return r.status === "CHANGE" && !r.uncertain; }).length,
      removeCount: removed.length,
      writeApprovalRequired: true,
      warnings: norm.warnings,
      source: norm.source
    };
  }

  /* ---------------- 3.12 tek veri kaynağı sorguları ---------------- */
  function orderHistory(dataOrModel, prefs) {
    var model = dataOrModel && dataOrModel.accounts ? dataOrModel : hydrateLegacy(dataOrModel || {});
    var acc = selectedAccount(model, prefs);
    var out = [];
    (acc ? acc.positions : []).forEach(function (p) {
      var oh = p._orderHistory || [];
      if (!Array.isArray(oh)) return;
      oh.forEach(function (o) {
        out.push(transaction({ symbol: p.symbol, side: o.side, quantity: o.quantity, price: o.price, amount: o.amount, date: o.date || o.time || "", kind: "trade", source: o.source || "yerel kayıt", accountKey: acc.key }));
      });
    });
    /* Eski global emir kuyruğu (bekleyenler) */
    var pending = dataOrModel && dataOrModel.pendingOrders;
    if (pending && Array.isArray(pending.items)) {
      pending.items.forEach(function (o) {
        out.push(transaction({ symbol: o.symbol, side: o.side, quantity: o.quantity, price: o.price, amount: o.amount, date: o.date || "", kind: "pending", source: "bekleyen emir" }));
      });
    }
    return out.sort(function (a, b) { return String((b.date || "") < (a.date || "") ? -1 : 1); });
  }

  function cashMovements(dataOrModel, opts) {
    opts = opts || {};
    var tx = Array.isArray(dataOrModel && dataOrModel.transactions) ? dataOrModel.transactions : [];
    return tx.map(function (t) {
      return transaction({ symbol: t.symbol, side: (t.type || t.side || "unknown"), kind: t.kind || classifyKind(t), quantity: t.quantity, price: t.price, amount: t.amount, date: t.date, source: t.source || "yerel kayıt" });
    }).filter(function (t) { return t.kind !== "trade" || opts.includeTrades; });
  }
  function classifyKind(t) {
    var s = (t.type || t.side || "").toLowerCase();
    if (/deposit|para\s*yatır|kasa/i.test(s)) return "deposit";
    if (/withdraw|para\s*çek|çekim/i.test(s)) return "withdrawal";
    if (/dividend|temettü/i.test(s)) return "dividend";
    return "trade";
  }

  function dividends(dataOrModel, prefs) {
    var model = dataOrModel && dataOrModel.accounts ? dataOrModel : hydrateLegacy(dataOrModel || {});
    var schedule = [];
    var pend = dataOrModel && dataOrModel.pendingDividends;
    if (pend && Array.isArray(pend.items)) {
      schedule = pend.items.map(function (d) {
        return { symbol: upperKey(d.symbol), amount: finite(d.amount), date: d.date || d.payDate || "", note: d.note || "", source: (d.source || "OCR") };
      });
    }
    var acc = selectedAccount(model, prefs);
    (acc ? acc.positions : []).forEach(function (p) {
      if (p._dividends && Array.isArray(p._dividends)) {
        p._dividends.forEach(function (d) {
          schedule.push({ symbol: p.symbol, amount: finite(d.amount), date: d.date || "", note: d.note || "", source: p.symbol + " kaydı" });
        });
      }
    });
    return schedule;
  }

  function snapshotHistory(history) {
    return (history || []).map(function (s) {
      return { id: s.id, accountKey: s.accountKey, institutionName: s.institutionName || "", at: s.at, seq: s.seq, cashBalance: finite(s.cashBalance), totalValue: finite(s.totalValue), posCount: (s.positions || []).length, confidence: finite(s.confidence), masked: s.maskPolicy === "masked" };
    }).sort(function (a, b) { return String((b.at || "") < (a.at || "") ? -1 : 1); });
  }

  /* ---------------- 3.11 portföy kart özelleştirme (prefs) ---------------- */
  var CARD_PREFS_KEY = "stkszPortfolioCardPrefs";
  var cardDefaults = function () {
    return {
      visibleKpis: { value: true, daily: true, cost: false, kz: true, qty: true, pct: false },
      includeInstitutions: [],          // boş = tümü
      favoritesOnly: false,
      hideZeroPositions: true,
      sort: "value_desc"
    };
  };
  function loadCardPrefs(storageAccess) {
    var raw = (typeof storageAccess === "function" ? storageAccess(CARD_PREFS_KEY) : null) || "{}";
    try { return mergeCardPrefs(cardDefaults(), JSON.parse(raw)); } catch (e) { return cardDefaults(); }
  }
  function saveCardPrefs(prefs, storageWrite) {
    if (typeof storageWrite === "function") storageWrite(CARD_PREFS_KEY, JSON.stringify(prefs));
  }
  function mergeCardPrefs(base, over) {
    base = base || cardDefaults();
    over = over || {};
    var out = { visibleKpis: {}, includeInstitutions: [], favoritesOnly: false, hideZeroPositions: true, sort: "value_desc" };
    var k = base.visibleKpis || {};
    out.visibleKpis = {};
    Object.keys(k).forEach(function (key) { out.visibleKpis[key] = over.visibleKpis && typeof over.visibleKpis[key] === "boolean" ? over.visibleKpis[key] : k[key]; });
    if (Array.isArray(over.includeInstitutions)) out.includeInstitutions = over.includeInstitutions.slice();
    out.favoritesOnly = Boolean(over.favoritesOnly);
    if ("hideZeroPositions" in over) out.hideZeroPositions = Boolean(over.hideZeroPositions);
    if (typeof over.sort === "string") out.sort = over.sort;
    return out;
  }
  function applyCardPrefs(rows, prefs) {
    prefs = prefs || cardDefaults();
    var list = (rows || []).filter(function (r) { return r; });
    if (prefs.favoritesOnly) {
      var fav = prefs.favorites || [];
      list = list.filter(function (r) { return fav.indexOf(upperKey(r.symbol)) !== -1; });
    }
    if (Array.isArray(prefs.includeInstitutions) && prefs.includeInstitutions.length) {
      list = list.filter(function (r) { return prefs.includeInstitutions.indexOf(r.institutionKey) !== -1; });
    }
    if (prefs.hideZeroPositions) {
      list = list.filter(function (r) { return finite(r.quantity) != null && Number(r.quantity) > 0; });
    }
    var sort = prefs.sort || "value_desc";
    list.sort(function (a, b) {
      if (sort === "value_desc") return (finite(b.value) || 0) - (finite(a.value) || 0);
      if (sort === "value_asc") return (finite(a.value) || 0) - (finite(b.value) || 0);
      if (sort === "symbol_asc") return String(a.symbol || "").localeCompare(String(b.symbol || ""));
      return (finite(b.value) || 0) - (finite(a.value) || 0);
    });
    return list;
  }

  /* ---------------- 3.13 deterministic fixture yardımcıları ---------------- */
  function fixtureResult(status, message) { return { ok: status === "ok", status: status, message: String(message || "") }; }

  return {
    version: "2026.09.08-faz3",
    INSTITUTIONS: INSTITUTIONS,
    /* model üreticileri */
    account: account, position: position, cashBalance: cashBalance, transaction: transaction,
    /* kurum tespiti */
    detectInstitution: detectInstitution,
    /* legacy hidrasyon + toplam */
    hydrateLegacy: hydrateLegacy, stripEnr: stripEnr, accountTotals: accountTotals, aggregate: aggregate,
    scopePolicy: scopePolicy,
    /* seçili hesap + provider aksiyonu */
    selectedAccount: selectedAccount, providerAction: providerAction,
    /* snapshot zinciri */
    buildSnapshot: buildSnapshot, nextSeq: nextSeq, snapshotsByAccount: snapshotsByAccount,
    predecessorFor: predecessorFor, compareSnapshots: compareSnapshots, snapshotHistory: snapshotHistory,
    /* nakit delta */
    classifyCashDelta: classifyCashDelta,
    /* import normalize + önizleme diff */
    normalizeParsed: normalizeParsed, previewDiff: previewDiff,
    /* tek veri kaynağı sorguları */
    orderHistory: orderHistory, cashMovements: cashMovements, dividends: dividends,
    /* 3.11 kart tercihleri */
    CARD_PREFS_KEY: CARD_PREFS_KEY, cardDefaults: cardDefaults, loadCardPrefs: loadCardPrefs, saveCardPrefs: saveCardPrefs, applyCardPrefs: applyCardPrefs,
    /* test yardımcısı */
    fixtureResult: fixtureResult,
    /* test için içsel */
    _internal: { flowSigned: flowSigned, indexPositions: indexPositions, classifyKind: classifyKind }
  };
});