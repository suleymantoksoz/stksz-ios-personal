/* ============================================================
   STKSZ CHART ENGINE + STKSZ EDİTÖR ÇALIŞMA ZAMANI
   Tamamen yerli, bağımsız, telifsiz. Harici kütüphane YOK.
   - Canvas mum grafik: zoom (tekerlek/pinch), kaydırma, crosshair
   - Çizim araçları: trend çizgisi, yatay seviye, dikdörtgen, silgi
   - Çizimler sembol bazında localStorage'da kalıcı
   - STKSZ Editör: sma/ema/rsi/macd... ile plot/hline/marker
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------------- İNDİKATÖR KÜTÜPHANESİ ---------------- */
  const IND = {
    sma(src, len) {
      const out = new Array(src.length).fill(null); let sum = 0;
      for (let i = 0; i < src.length; i++) {
        sum += src[i]; if (i >= len) sum -= src[i - len];
        if (i >= len - 1) out[i] = sum / len;
      } return out;
    },
    ema(src, len) {
      const out = new Array(src.length).fill(null);
      const k = 2 / (len + 1); let prev = null;
      for (let i = 0; i < src.length; i++) {
        if (i === len - 1) { let s = 0; for (let j = 0; j < len; j++) s += src[i - j]; prev = s / len; out[i] = prev; }
        else if (i >= len) { prev = src[i] * k + prev * (1 - k); out[i] = prev; }
      } return out;
    },
    wma(src, len) {
      const out = new Array(src.length).fill(null);
      const denom = len * (len + 1) / 2;
      for (let i = len - 1; i < src.length; i++) {
        let s = 0; for (let j = 0; j < len; j++) s += src[i - j] * (len - j);
        out[i] = s / denom;
      } return out;
    },
    rsi(src, len) {
      const out = new Array(src.length).fill(null);
      let gain = 0, loss = 0;
      for (let i = 1; i < src.length; i++) {
        const ch = src[i] - src[i - 1];
        const g = Math.max(ch, 0), l = Math.max(-ch, 0);
        if (i <= len) { gain += g; loss += l; if (i === len) { const rs = loss === 0 ? 100 : gain / loss; out[i] = 100 - 100 / (1 + rs); gain /= len; loss /= len; } }
        else { gain = (gain * (len - 1) + g) / len; loss = (loss * (len - 1) + l) / len; const rs = loss === 0 ? 100 : gain / loss; out[i] = 100 - 100 / (1 + rs); }
      } return out;
    },
    macd(src, fast, slow, signal) {
      fast = fast || 12; slow = slow || 26; signal = signal || 9;
      const ef = IND.ema(src, fast), es = IND.ema(src, slow);
      const line = src.map((_, i) => ef[i] !== null && es[i] !== null ? ef[i] - es[i] : null);
      const valid = line.map(v => v === null ? 0 : v);
      const sig = IND.ema(valid, signal).map((v, i) => line[i] === null ? null : v);
      const hist = line.map((v, i) => v !== null && sig[i] !== null ? v - sig[i] : null);
      return { macd: line, signal: sig, hist };
    },
    highest(src, len) {
      const out = new Array(src.length).fill(null);
      for (let i = len - 1; i < src.length; i++) { let m = -Infinity; for (let j = 0; j < len; j++) m = Math.max(m, src[i - j]); out[i] = m; }
      return out;
    },
    lowest(src, len) {
      const out = new Array(src.length).fill(null);
      for (let i = len - 1; i < src.length; i++) { let m = Infinity; for (let j = 0; j < len; j++) m = Math.min(m, src[i - j]); out[i] = m; }
      return out;
    },
    change(src, len) { len = len || 1; return src.map((v, i) => i >= len ? v - src[i - len] : null); },
    crossover(a, b) { return a.map((v, i) => i > 0 && v !== null && b[i] !== null && a[i - 1] !== null && b[i - 1] !== null && a[i - 1] <= b[i - 1] && v > b[i]); },
    crossunder(a, b) { return a.map((v, i) => i > 0 && v !== null && b[i] !== null && a[i - 1] !== null && b[i - 1] !== null && a[i - 1] >= b[i - 1] && v < b[i]); }
  };

  /* ---------------- STKSZ EDİTÖR ÇALIŞMA ZAMANI ----------------
     Kullanıcı betiği güvenli sarmalayıcıda çalışır: DOM/ağ erişimi
     kapalıdır; yalnızca veri dizileri ve indikatör yardımcıları verilir. */
  function runStkszScript(code, candles) {
    if (typeof code !== 'string' || code.length > 20000) throw new Error('Betik çok uzun (max 20.000 karakter).');
    if (/\beval\s*\(|\bimport\s*\(|\bimport\s+/.test(code)) throw new Error('Güvenlik: eval/import kullanılamaz.');
    const open = candles.map(c => c.o), high = candles.map(c => c.h),
      low = candles.map(c => c.l), close = candles.map(c => c.c),
      volume = candles.map(c => c.v ?? 0), time = candles.map(c => c.t);
    const plots = [], hlines = [], markers = [];
    const plot = (series, opts) => {
      if (!Array.isArray(series)) throw new Error('plot(): dizi bekleniyor.');
      opts = opts || {};
      plots.push({ data: series.slice(0, candles.length), color: opts.renk || opts.color || '#00df78', width: opts.kalinlik || opts.width || 2, title: opts.isim || opts.title || 'seri', pane: opts.panel === 'alt' || opts.pane === 'sub' ? 'sub' : 'main' });
    };
    const hline = (value, opts) => { opts = opts || {}; hlines.push({ value: Number(value), color: opts.renk || opts.color || '#e7b51e', dash: opts.kesik !== false, title: opts.isim || opts.title || '' }); };
    const marker = (cond, opts) => {
      if (!Array.isArray(cond)) throw new Error('marker(): koşul dizisi bekleniyor.');
      opts = opts || {};
      markers.push({ cond: cond.slice(0, candles.length), text: opts.yazi || opts.text || '▲', color: opts.renk || opts.color || '#00df78', below: (opts.yazi || opts.text || '') !== 'SAT' && opts.konum !== 'ust' });
    };
    /* Sarmalayıcı: tehlikeli globaller parametre olarak gölgelenir */
    const fn = new Function(
      'open', 'high', 'low', 'close', 'volume', 'time',
      'sma', 'ema', 'wma', 'rsi', 'macd', 'highest', 'lowest', 'change', 'crossover', 'crossunder',
      'plot', 'hline', 'marker', 'Math',
      'window', 'document', 'globalThis', 'self', 'fetch', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'Function', 'importScripts', 'navigator', 'location', 'globalEval',
      '"use strict";\n' + code
    );
    fn(open, high, low, close, volume, time,
      IND.sma, IND.ema, IND.wma, IND.rsi, IND.macd, IND.highest, IND.lowest, IND.change, IND.crossover, IND.crossunder,
      plot, hline, marker, Math,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined);
    return { plots, hlines, markers };
  }

  /* ---------------- GRAFİK MOTORU ---------------- */
  /* v112 (ADIM 19): yalnız GÖRSEL palet — referans design system
     (zemin #1E222A ailesi, pozitif emerald, çizimler bakır).
     Motor mantığı/zoom/pan/araçlar DEĞİŞMEDİ. */
  const COLORS = {
    bg: '#20252E', grid: 'rgba(156,163,175,.10)', axis: '#9CA3AF',
    up: '#00E676', down: '#FF5C5C', wick: 'rgba(203,213,225,.75)',
    volUp: 'rgba(0,230,118,.26)', volDown: 'rgba(255,92,92,.26)',
    cross: 'rgba(208,144,78,.6)', crossBg: '#3A2A20',
    draw: '#B87333', drawActive: '#D0904E'
  };

  class StkszChart {
    constructor(canvas) {
      this.cv = canvas; this.ctx = canvas.getContext('2d');
      this.candles = []; this.start = 0; this.bars = 60;
      this.tool = 'cursor'; this.drawings = []; this.pendingDraw = null;
      this.overlay = { plots: [], hlines: [], markers: [] };
      this.cross = null; this.symbol = '';
      this.onDrawingsChanged = null;
      this._pointers = new Map(); this._pinch = null; this._drag = null;
      this.manualScale = null; this._axisDrag = null; /* fiyat ekseni sürüklenerek ölçeklenir; null = otomatik */
      this._bind();
    }
    setSymbol(sym) { this.symbol = sym; this._loadDrawings(); }
    setData(candles) {
      this.candles = candles || [];
      this.bars = Math.min(80, Math.max(20, this.candles.length));
      this.start = Math.max(0, this.candles.length - this.bars);
      this.render();
    }
    setOverlay(ov) { this.overlay = ov || { plots: [], hlines: [], markers: [] }; this.render(); }
    setTool(t) { this.tool = t; this.pendingDraw = null; this.render(); }
    clearDrawings() { this.drawings = []; this._saveDrawings(); this.render(); }
    resize() {
      const r = this.cv.getBoundingClientRect(), dpr = Math.min(global.devicePixelRatio || 1, 3);
      this.cv.width = Math.max(50, Math.round(r.width * dpr));
      this.cv.height = Math.max(50, Math.round(r.height * dpr));
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.W = r.width; this.H = r.height; this.render();
    }
    /* --- geometri --- */
    _lay() {
      const axW = 54, tH = 18;
      const subPlots = (this.overlay.plots || []).some(p => p.pane === 'sub');
      const volH = Math.round(this.H * 0.14);
      const subH = subPlots ? Math.round(this.H * 0.2) : 0;
      const mainH = this.H - tH - volH - subH - 6;
      return { axW, tH, volH, subH, mainH, plotW: this.W - axW };
    }
    _visible() { const e = Math.min(this.candles.length, this.start + this.bars); return { s: Math.max(0, this.start), e }; }
    _scale() {
      const { s, e } = this._visible(); let lo = Infinity, hi = -Infinity;
      for (let i = s; i < e; i++) { lo = Math.min(lo, this.candles[i].l); hi = Math.max(hi, this.candles[i].h); }
      (this.overlay.plots || []).forEach(p => { if (p.pane !== 'main') return; for (let i = s; i < e; i++) { const v = p.data[i]; if (v !== null && v !== undefined && isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } } });
      (this.overlay.hlines || []).forEach(h => { if (isFinite(h.value)) { lo = Math.min(lo, h.value); hi = Math.max(hi, h.value); } });
      if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
      const pad = (hi - lo) * 0.07 || hi * 0.01 || 1;
      if (this.manualScale && isFinite(this.manualScale.lo) && isFinite(this.manualScale.hi) && this.manualScale.hi > this.manualScale.lo) return { ...this.manualScale };
      return { lo: lo - pad, hi: hi + pad };
    }
    _x(i) { const L = this._lay(); const { s } = this._visible(); const bw = L.plotW / this.bars; return (i - s) * bw + bw / 2; }
    _y(p, sc, L) { return L.mainH * (1 - (p - sc.lo) / (sc.hi - sc.lo)); }
    _idxAt(x) { const L = this._lay(); const { s } = this._visible(); const bw = L.plotW / this.bars; return Math.round(x / bw - 0.5) + s; }
    _priceAt(y, sc, L) { return sc.lo + (1 - y / L.mainH) * (sc.hi - sc.lo); }
    _tToIdx(t) {
      const a = this.candles; if (!a.length) return 0;
      let lo = 0, hi = a.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (a[m].t < t) lo = m + 1; else hi = m; }
      return lo;
    }
    /* --- render --- */
    render() {
      const ctx = this.ctx; if (!this.W) return;
      const L = this._lay(), sc = this._scale(), { s, e } = this._visible();
      const bw = L.plotW / this.bars, body = Math.max(1, bw * 0.66);
      ctx.clearRect(0, 0, this.W, this.H);
      ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, this.W, this.H);
      if (!this.candles.length) {
        ctx.fillStyle = COLORS.axis; ctx.font = '12px Arial'; ctx.textAlign = 'center';
        ctx.fillText('Grafik verisi yok — "GEÇMİŞİ ÇEK" ile yükleyin.', this.W / 2, this.H / 2);
        return;
      }
      /* grid + fiyat ekseni */
      ctx.font = '10px Arial'; ctx.textAlign = 'left';
      const steps = 5;
      for (let g = 0; g <= steps; g++) {
        const p = sc.lo + (sc.hi - sc.lo) * g / steps, y = this._y(p, sc, L);
        ctx.strokeStyle = COLORS.grid; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(L.plotW, y); ctx.stroke();
        ctx.fillStyle = COLORS.axis; ctx.fillText(this._fmt(p), L.plotW + 4, y + 3);
      }
      /* zaman ekseni */
      const every = Math.max(1, Math.round(this.bars / (L.plotW / 76)));
      ctx.textAlign = 'center';
      for (let i = s; i < e; i += every) {
        const x = this._x(i), d = new Date(this.candles[i].t);
        ctx.fillStyle = COLORS.axis;
        ctx.fillText(`${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`, x, this.H - 5);
      }
      /* hacim */
      let vMax = 0; for (let i = s; i < e; i++) vMax = Math.max(vMax, this.candles[i].v || 0);
      if (vMax > 0) for (let i = s; i < e; i++) {
        const c = this.candles[i], x = this._x(i);
        const vh = (c.v || 0) / vMax * (L.volH - 4);
        ctx.fillStyle = c.c >= c.o ? COLORS.volUp : COLORS.volDown;
        ctx.fillRect(x - body / 2, L.mainH + L.subH + (L.volH - vh), body, vh);
      }
      /* alt panel plotları (ör. RSI) */
      const subs = (this.overlay.plots || []).filter(p => p.pane === 'sub');
      if (subs.length && L.subH > 10) {
        let slo = Infinity, shi = -Infinity;
        subs.forEach(p => { for (let i = s; i < e; i++) { const v = p.data[i]; if (v != null && isFinite(v)) { slo = Math.min(slo, v); shi = Math.max(shi, v); } } });
        if (isFinite(slo) && isFinite(shi)) {
          if (shi - slo < 1e-9) { shi += 1; slo -= 1; }
          const sy = v => L.mainH + 4 + (L.subH - 8) * (1 - (v - slo) / (shi - slo));
          ctx.strokeStyle = COLORS.grid; ctx.strokeRect(0, L.mainH + 2, L.plotW, L.subH - 2);
          subs.forEach(p => this._polyline(p, s, e, i => { const v = p.data[i]; return v == null ? null : sy(v); }));
          ctx.fillStyle = COLORS.axis; ctx.textAlign = 'left';
          ctx.fillText(this._fmt(shi), L.plotW + 4, L.mainH + 12);
          ctx.fillText(this._fmt(slo), L.plotW + 4, L.mainH + L.subH - 2);
        }
      }
      /* mumlar */
      for (let i = s; i < e; i++) {
        const c = this.candles[i], x = this._x(i);
        const yO = this._y(c.o, sc, L), yC = this._y(c.c, sc, L), yH = this._y(c.h, sc, L), yL = this._y(c.l, sc, L);
        ctx.strokeStyle = COLORS.wick; ctx.beginPath(); ctx.moveTo(x, yH); ctx.lineTo(x, yL); ctx.stroke();
        ctx.fillStyle = c.c >= c.o ? COLORS.up : COLORS.down;
        ctx.fillRect(x - body / 2, Math.min(yO, yC), body, Math.max(1, Math.abs(yC - yO)));
      }
      /* ana panel plotları */
      (this.overlay.plots || []).filter(p => p.pane === 'main')
        .forEach(p => this._polyline(p, s, e, i => { const v = p.data[i]; return v == null ? null : this._y(v, sc, L); }));
      /* hline'lar */
      (this.overlay.hlines || []).forEach(h => {
        if (!isFinite(h.value)) return;
        const y = this._y(h.value, sc, L);
        ctx.strokeStyle = h.color; ctx.setLineDash(h.dash ? [5, 4] : []);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(L.plotW, y); ctx.stroke(); ctx.setLineDash([]);
      });
      /* marker'lar */
      (this.overlay.markers || []).forEach(m => {
        ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center';
        for (let i = s; i < e; i++) if (m.cond[i]) {
          const c = this.candles[i], x = this._x(i);
          const y = m.below ? this._y(c.l, sc, L) + 14 : this._y(c.h, sc, L) - 8;
          ctx.fillStyle = m.color; ctx.fillText(m.text, x, y);
        }
      });
      /* kullanıcı çizimleri */
      [...this.drawings, ...(this.pendingDraw ? [this.pendingDraw] : [])].forEach(d => this._drawShape(d, sc, L, d === this.pendingDraw));
      /* crosshair */
      if (this.cross && this.tool === 'cursor') this._drawCross(sc, L);
      /* plot lejantı */
      let lx = 6; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'left';
      (this.overlay.plots || []).forEach(p => { ctx.fillStyle = p.color; ctx.fillText('— ' + p.title, lx, 12); lx += ctx.measureText('— ' + p.title).width + 12; });
    }
    _polyline(p, s, e, yFn) {
      const ctx = this.ctx; ctx.strokeStyle = p.color; ctx.lineWidth = p.width; ctx.beginPath();
      let started = false;
      for (let i = s; i < e; i++) { const y = yFn(i); if (y === null) { started = false; continue; } const x = this._x(i); if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y); }
      ctx.stroke(); ctx.lineWidth = 1;
    }
    _drawShape(d, sc, L, active) {
      const ctx = this.ctx;
      const x1 = this._x(this._tToIdx(d.t1)), y1 = this._y(d.p1, sc, L);
      ctx.strokeStyle = active ? COLORS.drawActive : COLORS.draw; ctx.lineWidth = 1.6;
      if (d.type === 'hline') {
        ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(L.plotW, y1); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = COLORS.draw; ctx.font = '9px Arial'; ctx.textAlign = 'left'; ctx.fillText(this._fmt(d.p1), 4, y1 - 3);
      } else if (d.type === 'vline') {
        ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, L.mainH + L.subH + L.volH); ctx.stroke(); ctx.setLineDash([]);
        const dt = new Date(d.t1); ctx.fillStyle = COLORS.draw; ctx.font = '9px Arial'; ctx.textAlign = 'center';
        ctx.fillText(`${String(dt.getDate()).padStart(2,'0')}.${String(dt.getMonth()+1).padStart(2,'0')}`, x1, 10);
      } else if (d.type === 'mark') {
        ctx.fillStyle = active ? COLORS.drawActive : '#ffd75e'; ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center';
        ctx.fillText('📍', x1, y1); ctx.font = '8px Arial'; ctx.fillText(this._fmt(d.p1), x1, y1 + 11);
      } else {
        const x2 = this._x(this._tToIdx(d.t2)), y2 = this._y(d.p2, sc, L);
        if (d.type === 'trend') { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
        else if (d.type === 'rect') { ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); ctx.fillStyle = 'rgba(75,156,255,.08)'; ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); }
        else if (d.type === 'channel') {
          /* paralel kanal: ana çizgi + fiyat farkı kadar kaydırılmış paralel */
          const off = (d.off !== undefined ? d.off : (sc.hi - sc.lo) * 0.06);
          const yo = off / (sc.hi - sc.lo) * L.mainH;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x1, y1 - yo); ctx.lineTo(x2, y2 - yo); ctx.stroke();
          ctx.fillStyle = 'rgba(0,223,120,.06)';
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2 - yo); ctx.lineTo(x1, y1 - yo); ctx.closePath(); ctx.fill();
        }
        else if (d.type === 'fib') {
          const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
          const xa = Math.min(x1, x2), xb = Math.max(x1, x2);
          ctx.font = '8px Arial'; ctx.textAlign = 'left';
          levels.forEach(lv => {
            const pv = d.p1 + (d.p2 - d.p1) * lv, y = this._y(pv, sc, L);
            ctx.strokeStyle = lv === 0.5 ? '#ffd75e' : (active ? COLORS.drawActive : COLORS.draw);
            ctx.setLineDash(lv === 0 || lv === 1 ? [] : [4, 3]);
            ctx.beginPath(); ctx.moveTo(xa, y); ctx.lineTo(xb, y); ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = '#9fd4b8'; ctx.fillText(`${(lv * 100).toFixed(1)}% ${this._fmt(pv)}`, xb + 3, y + 3);
          });
        }
        else if (d.type === 'measure') {
          ctx.strokeStyle = d.p2 >= d.p1 ? '#00df78' : '#ff5b6a'; ctx.setLineDash([5, 3]);
          ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); ctx.setLineDash([]);
          const chg = d.p2 - d.p1, pct = d.p1 ? chg / d.p1 * 100 : 0;
          const barsN = Math.abs(this._tToIdx(d.t2) - this._tToIdx(d.t1));
          const txt = `${chg >= 0 ? '+' : ''}${this._fmt(chg)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%) · ${barsN} mum`;
          const tx = (x1 + x2) / 2, ty = Math.min(y1, y2) - 6;
          ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(5,9,8,.92)'; const tw = ctx.measureText(txt).width; ctx.fillRect(tx - tw / 2 - 5, ty - 11, tw + 10, 14);
          ctx.fillStyle = chg >= 0 ? '#7dffbe' : '#ff9aa5'; ctx.fillText(txt, tx, ty);
        }
      }
      ctx.lineWidth = 1;
    }
    _drawCross(sc, L) {
      const ctx = this.ctx, { x, y } = this.cross;
      if (x > L.plotW || y > L.mainH + L.subH + L.volH) return;
      ctx.strokeStyle = COLORS.cross; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.H - L.tH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(L.plotW, y); ctx.stroke(); ctx.setLineDash([]);
      const i = Math.max(0, Math.min(this.candles.length - 1, this._idxAt(x)));
      const c = this.candles[i];
      if (c && y <= L.mainH) {
        const p = this._priceAt(y, sc, L);
        ctx.fillStyle = COLORS.crossBg; ctx.fillRect(L.plotW, y - 8, 54, 16);
        ctx.fillStyle = '#aef7d3'; ctx.font = '10px Arial'; ctx.textAlign = 'left'; ctx.fillText(this._fmt(p), L.plotW + 4, y + 3);
        const d = new Date(c.t);
        const txt = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} · A:${this._fmt(c.o)} Y:${this._fmt(c.h)} D:${this._fmt(c.l)} K:${this._fmt(c.c)}`;
        ctx.fillStyle = 'rgba(5,9,8,.9)'; ctx.fillRect(4, 16, ctx.measureText(txt).width + 10, 16);
        ctx.fillStyle = '#d7e7df'; ctx.fillText(txt, 9, 28);
      }
    }
    _fmt(v) {
      if (!isFinite(v)) return '—';
      const a = Math.abs(v);
      return a >= 1000 ? v.toFixed(0) : a >= 100 ? v.toFixed(1) : a >= 1 ? v.toFixed(2) : v.toFixed(4);
    }
    /* --- etkileşim --- */
    _bind() {
      const cv = this.cv;
      cv.style.touchAction = 'none';
      cv.addEventListener('pointerdown', e => this._down(e));
      cv.addEventListener('pointermove', e => this._move(e));
      cv.addEventListener('pointerup', e => this._up(e));
      cv.addEventListener('pointercancel', e => this._up(e));
      cv.addEventListener('pointerleave', () => { if (!this._drag && !this.pendingDraw) { this.cross = null; this.render(); } });
      cv.addEventListener('wheel', e => {
        e.preventDefault();
        const f = e.deltaY > 0 ? 1.15 : 0.87;
        this._zoom(f, this._pt(e).x);
      }, { passive: false });
    }
    _pt(e) { const r = this.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    _down(e) {
      this.cv.setPointerCapture(e.pointerId);
      this._pointers.set(e.pointerId, this._pt(e));
      if (this._pointers.size === 2) {
        const [a, b] = [...this._pointers.values()];
        this._pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), bars: this.bars };
        this._drag = null; this.pendingDraw = null; return;
      }
      const p = this._pt(e), L = this._lay(), sc = this._scale();
      /* Fiyat ekseni bölgesi: yukarı/aşağı sürükle = ölçekle (Midas/TradingView mantığı); çift dokunuş = otomatik ölçek */
      if (p.x > L.plotW && p.y <= L.mainH) {
        const now = Date.now();
        if (this._axisTapAt && now - this._axisTapAt < 320) { this.manualScale = null; this._axisTapAt = 0; this.render(); return; }
        this._axisTapAt = now;
        this._axisDrag = { y: p.y, sc: { lo: sc.lo, hi: sc.hi } };
        return;
      }
      if (this.tool === 'cursor') this._drag = { x: p.x, start: this.start };
      else if (this.tool === 'erase') this._erase(p, sc, L);
      else {
        const i = Math.max(0, Math.min(this.candles.length - 1, this._idxAt(p.x)));
        const t = this.candles[i] ? this.candles[i].t : Date.now();
        const price = this._priceAt(Math.min(p.y, L.mainH), sc, L);
        if (this.tool === 'hline') { this.drawings.push({ type: 'hline', t1: t, p1: price, t2: t, p2: price }); this._saveDrawings(); this.render(); }
        else if (this.tool === 'vline') { this.drawings.push({ type: 'vline', t1: t, p1: price, t2: t, p2: price }); this._saveDrawings(); this.render(); }
        else if (this.tool === 'mark') { this.drawings.push({ type: 'mark', t1: t, p1: price, t2: t, p2: price }); this._saveDrawings(); this.render(); }
        else this.pendingDraw = { type: this.tool, t1: t, p1: price, t2: t, p2: price };
      }
    }
    _move(e) {
      const p = this._pt(e);
      if (this._pointers.has(e.pointerId)) this._pointers.set(e.pointerId, p);
      if (this._pinch && this._pointers.size === 2) {
        const [a, b] = [...this._pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const nb = Math.round(this._pinch.bars * this._pinch.d / Math.max(20, d));
        this._setBars(nb, (a.x + b.x) / 2); return;
      }
      if (this._axisDrag) {
        const L = this._lay();
        const k = Math.exp((p.y - this._axisDrag.y) / 140); /* aşağı çek = aralığı genişlet, yukarı = daralt */
        const mid = (this._axisDrag.sc.lo + this._axisDrag.sc.hi) / 2, half = (this._axisDrag.sc.hi - this._axisDrag.sc.lo) / 2 * k;
        this.manualScale = { lo: mid - half, hi: mid + half };
        this.render(); return;
      }
      if (this._drag) {
        const L = this._lay(), bw = L.plotW / this.bars;
        const shift = Math.round((this._drag.x - p.x) / bw);
        this.start = Math.max(0, Math.min(this.candles.length - Math.min(this.bars, this.candles.length), this._drag.start + shift));
        this.render(); this.cross = p; return;
      }
      if (this.pendingDraw) {
        const L = this._lay(), sc = this._scale();
        const i = Math.max(0, Math.min(this.candles.length - 1, this._idxAt(p.x)));
        this.pendingDraw.t2 = this.candles[i] ? this.candles[i].t : this.pendingDraw.t1;
        this.pendingDraw.p2 = this._priceAt(Math.min(p.y, L.mainH), sc, L);
        this.render(); return;
      }
      this.cross = p; this.render();
    }
    _up(e) {
      this._pointers.delete(e.pointerId);
      if (this._pointers.size < 2) this._pinch = null;
      if (this.pendingDraw) {
        if (this.pendingDraw.t1 !== this.pendingDraw.t2 || this.pendingDraw.p1 !== this.pendingDraw.p2) {
          this.drawings.push(this.pendingDraw); this._saveDrawings();
        }
        this.pendingDraw = null; this.render();
      }
      this._drag = null; this._axisDrag = null;
    }
    _zoom(f, cx) { this._setBars(Math.round(this.bars * f), cx); }
    _setBars(nb, cx) {
      const L = this._lay();
      nb = Math.max(10, Math.min(Math.max(this.candles.length, 10), nb));
      const anchor = this._idxAt(cx || L.plotW / 2);
      const ratio = (cx || L.plotW / 2) / L.plotW;
      this.bars = nb;
      this.start = Math.max(0, Math.min(this.candles.length - Math.min(nb, this.candles.length), Math.round(anchor - nb * ratio)));
      this.render();
    }
    _erase(p, sc, L) {
      const hit = this.drawings.findIndex(d => {
        const x1 = this._x(this._tToIdx(d.t1)), y1 = this._y(d.p1, sc, L);
        if (d.type === 'hline') return Math.abs(p.y - y1) < 9;
        if (d.type === 'vline') return Math.abs(p.x - x1) < 9;
        if (d.type === 'mark') return Math.hypot(p.x - x1, p.y - y1) < 14;
        if (d.type === 'fib' || d.type === 'measure' || d.type === 'channel') {
          const x2f = this._x(this._tToIdx(d.t2)), y2f = this._y(d.p2, sc, L);
          return p.x > Math.min(x1, x2f) - 8 && p.x < Math.max(x1, x2f) + 8 && p.y > Math.min(y1, y2f) - 8 && p.y < Math.max(y1, y2f) + 8;
        }
        const x2 = this._x(this._tToIdx(d.t2)), y2 = this._y(d.p2, sc, L);
        if (d.type === 'rect') {
          const inX = p.x > Math.min(x1, x2) - 6 && p.x < Math.max(x1, x2) + 6;
          const inY = p.y > Math.min(y1, y2) - 6 && p.y < Math.max(y1, y2) + 6;
          const nearEdge = Math.abs(p.x - x1) < 8 || Math.abs(p.x - x2) < 8 || Math.abs(p.y - y1) < 8 || Math.abs(p.y - y2) < 8;
          return inX && inY && nearEdge;
        }
        /* trend: nokta-doğru mesafesi */
        const A = p.x - x1, B = p.y - y1, C = x2 - x1, D = y2 - y1;
        const len2 = C * C + D * D || 1; let t = (A * C + B * D) / len2; t = Math.max(0, Math.min(1, t));
        return Math.hypot(p.x - (x1 + C * t), p.y - (y1 + D * t)) < 9;
      });
      if (hit >= 0) { this.drawings.splice(hit, 1); this._saveDrawings(); this.render(); }
    }
    /* --- kalıcılık --- */
    _key() { return 'stkszDrawings'; }
    _loadDrawings() {
      try { const all = JSON.parse(localStorage.getItem(this._key()) || '{}'); this.drawings = Array.isArray(all[this.symbol]) ? all[this.symbol] : []; }
      catch (e) { this.drawings = []; }
    }
    _saveDrawings() {
      try { const all = JSON.parse(localStorage.getItem(this._key()) || '{}'); all[this.symbol] = this.drawings.slice(-40); localStorage.setItem(this._key(), JSON.stringify(all)); } catch (e) {}
      if (this.onDrawingsChanged) this.onDrawingsChanged();
    }
  }

  global.STKSZChart = { StkszChart, runStkszScript, indicators: IND };
})(typeof window !== 'undefined' ? window : globalThis);
