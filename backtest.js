/* TQQQ FTLT long-history backtest tab — renders site/backtest.json (scripts/build_backtest.py).
   Allocations come from the same Python Pine port as the live tab; this file only compounds
   the precomputed daily returns for the selected window/options and draws them. */
(function () {
  'use strict';
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pct = (x, d = 1) => (x == null || !isFinite(x) ? '—' : (x > 0 ? '+' : '') + (x * 100).toFixed(d) + '%');
  const pctU = (x, d = 1) => (x == null || !isFinite(x) ? '—' : (x * 100).toFixed(d) + '%');
  const money = (x) => {
    if (x == null || !isFinite(x)) return '—';
    const a = Math.abs(x);
    if (a >= 1e15) return '$' + (x / 1e15).toLocaleString('en-US', { maximumFractionDigits: 2 }) + 'Q';
    if (a >= 1e12) return '$' + (x / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return '$' + (x / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (x / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return '$' + (x / 1e3).toFixed(1) + 'K';
    return '$' + x.toFixed(0);
  };

  const ST = {
    Q: { label: 'TQQQ · above 200d', short: 'TQQQ', color: '#4CAF50' },
    B: { label: 'TQQQ · below 200d, above 20d', short: '20&lt;TQQQ&lt;200', color: '#C0CA33' },
    C: { label: 'Cash · BOXX (channel stop)', short: 'BOXX', color: '#089981' },
    D: { label: 'DIP · 25% TECL/TMF/GLD/QUAL', short: 'DIP', color: '#FF9800' },
    S: { label: 'SQQQ', short: 'SQQQ', color: '#FF5252' },
    T: { label: 'TLT', short: 'TLT', color: '#2196F3' },
    O: { label: 'OB basket · 50/50 bottom-2 RSI', short: 'OB', color: '#9C27B0' },
    W: { label: 'Warm-up · cash', short: 'Warm-up', color: '#5d6471' },
  };
  const ORDER = ['Q', 'B', 'C', 'O', 'D', 'S', 'T', 'W'];
  const ERAS = [
    { a: '1953-01-02', b: '1970-12-31', name: 'Hypothetical', q: 'hyp', note: 'No Nasdaq index existed; repo prefix is an undocumented Stooq construction. Gold pegged (monthly interpolation), bonds from monthly yields. No intraday highs/lows.' },
    { a: '1971-01-01', b: '1985-09-30', name: 'Synthetic · close-only', q: 'syn', note: 'Real Nasdaq Composite moves under a Nasdaq-100 label, leveraged with real T-bill costs. No intraday highs/lows, so the channel and trailing stop see closes only.' },
    { a: '1985-10-01', b: '2010-02-10', name: 'Synthetic · real index bars', q: 'syn', note: 'Real Nasdaq-100 (total return from 1999) leveraged with real financing costs; TQQQ highs/lows derived from real index bars. DIP/hedge funds synthetic before their launches.' },
    { a: '2010-02-11', b: '2099-12-31', name: 'Real TQQQ / SQQQ', q: 'real', note: 'Actual TQQQ/SQQQ/GLD/TLT/TMF/TECL/BIL bars. QUAL real from Jul 2013, BOXX from Dec 2022; earlier legs use the models listed below.' },
  ];
  const ERA_FILL = { hyp: 'rgba(255,82,82,0.07)', syn: 'rgba(255,152,0,0.06)', real: 'rgba(76,175,80,0.05)' };

  let D = null, loaded = false, loading = false, needsRender = false;
  const opt = { sem: '1H', chan: 'tv', fill: 'same', cost: 2, start: '1953-01-02', end: null, log: true, bench: { TQQQ: true, QQQ: true, SPY: false }, bal0: 10000, monthly: 0, trail: null, unit: 'usd' };
  let view = null;     // computed window for drawing / hover

  // ------------------------------------------------------------------ tabs
  function setTab(name) {
    document.querySelectorAll('.tabs button[data-tab]').forEach((b) => {
      const on = b.dataset.tab === name;
      b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    el('tab-live').hidden = name !== 'live';
    el('tab-bt').hidden = name !== 'bt';
    if (name === 'bt') { if (needsRender && loaded) { needsRender = false; render(); } else load(); }
    else requestAnimationFrame(() => { window.dispatchEvent(new Event('resize')); setTimeout(() => { const b = document.querySelector('[data-range].on'); if (b) b.click(); }, 60); });
    if (history.replaceState) history.replaceState(null, '', name === 'bt' ? '#backtest' : location.pathname + location.search);
  }
  document.querySelectorAll('.tabs button[data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  if (location.hash === '#backtest') setTab('bt');

  function load() {
    if (loaded || loading) { if (loaded) render(); return; }
    loading = true;
    el('btStatus').textContent = 'Loading 74 years of daily data…';
    window.FTLTFeed.loadBacktest()
      .then((j) => { D = prep(j); loaded = true; btStatusText(); buildControls(); render(); })
      .catch((e) => { el('btStatus').innerHTML = `<span class="err">Could not load backtest.json — ${esc(e.message)}</span>`; });
  }

  // Daily refresh: the feed job rebuilds backtest.json after each close; swap it in without a reload.
  window.FTLTFeed.onBacktest((j) => {
    if (!loaded) return;
    D = prep(j); MC.cache = {}; btStatusText();
    if (opt.trail) { applyTrail(); syncSelects(); }
    if (!el('tab-bt').hidden) render(); else needsRender = true;
  });
  function btStatusText() {
    const f = window.FTLTFeed.info();
    el('btStatus').innerHTML = `<span class="feed ${f.btSrc === 'feed' ? 'ok' : 'off'}">Data through ${esc(D.meta.end)} · ${f.btSrc === 'feed' ? 'rebuilt automatically after each market close' : 'bundled snapshot (live feed unavailable)'}</span>`;
  }

  function prep(j) {
    const n = j.dates.length, sr = j.meta.scale_r, stc = j.meta.scale_t, off = j.meta.tv_offset;
    const dec = (a) => Float64Array.from(a, (v) => v / sr);
    const full = {};
    for (const sem of ['1D', '1H']) for (const fill of ['same', 'next']) {
      const c = j.modes[`${sem}_cont_${fill}`], t = j.modes[`${sem}_tv_${fill}`];
      const rc = dec(c.r), tc = Float64Array.from(c.t, (v) => v / stc);
      const rt = rc.slice(), tt = tc.slice();
      t.r.forEach((v, k) => { rt[off + k] = v / sr; }); t.t.forEach((v, k) => { tt[off + k] = v / stc; });
      full[`${sem}_cont_${fill}`] = { r: rc, t: tc };
      full[`${sem}_tv_${fill}`] = { r: rt, t: tt };
    }
    const states = {};
    for (const sem of ['1D', '1H']) {
      states[`${sem}_cont`] = j.states[`${sem}_cont`];
      states[`${sem}_tv`] = j.states[`${sem}_cont`].slice(0, off) + j.states[`${sem}_tv`];
    }
    const bench = {}; for (const k in j.bench) bench[k] = dec(j.bench[k]);
    const rf = Float64Array.from(j.rf, (v) => v / 1e8);
    const years = j.dates.map((d) => +d.slice(0, 4));
    return { ...j, n, full, statesFull: states, benchR: bench, rfR: rf, years };
  }

  const ddTxt = (x) => (x > -0.00005 ? '0.0% (at peak)' : (x * 100).toFixed(1) + '%');
  const stKey = (c) => ('123456'.includes(c) ? 'O' : c);
  function stateLabel(c) {
    if ('123456'.includes(c)) return 'OB 50/50 · ' + D.meta.ob_pairs[c];
    return ST[c] ? ST[c].label : c;
  }
  function weightsText(c) {
    if ('123456'.includes(c)) return D.meta.ob_pairs[c].split('/').map((s) => s + ' 50%').join(', ');
    return { Q: 'TQQQ 100%', B: 'TQQQ 100%', C: 'BOXX 100%', D: 'TECL/TMF/GLD/QUAL 25% each', S: 'SQQQ 100%', T: 'TLT 100%', W: 'Cash 100%' }[c] || '';
  }
  const idxOf = (date) => { let lo = 0, hi = D.n - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (D.dates[m] < date) lo = m + 1; else hi = m; } return lo; };

  // ------------------------------------------------------------------ controls
  function seg(id, items, key, cb) {
    const box = el(id);
    box.innerHTML = items.map(([v, l, t]) => `<button data-v="${v}" title="${esc(t || '')}" class="${String(opt[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('');
    box.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      opt[key] = typeof opt[key] === 'number' ? +b.dataset.v : b.dataset.v;
      box.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      (cb || render)();
    }));
  }
  function buildControls() {
    seg('btSem', [['1H', '1H chart replay', 'Same daily values replayed per hourly bar, like your TradingView 1H chart and the live tab'], ['1D', 'Daily close', 'One evaluation per completed daily bar']], 'sem');
    seg('btChan', [['tv', 'Match live chart from 2010', 'Indicators/channels restart at TQQQ launch (Feb 2010), as on TradingView and the live tab'], ['cont', 'Continuous since 1953', 'Channels and indicators run unbroken from 1953']], 'chan');
    seg('btFill', [['same', 'Same close', 'Trade at the close that produced the signal (optimistic)'], ['next', 'Next close', 'Trade one day later at the next close (conservative)']], 'fill');
    seg('btCost', [[0, '0 bp'], [2, '2 bp'], [5, '5 bp'], [10, '10 bp']], 'cost');
    seg('btScale', [['log', 'Log'], ['lin', 'Linear']], 'scaleMode', () => { opt.log = opt.scaleMode !== 'lin'; draw(); });
    opt.scaleMode = 'log'; el('btScale').querySelector('[data-v="log"]').classList.add('on');
    const firstY = D.years[0], lastY = D.years[D.n - 1];
    const ys = []; for (let y = firstY; y <= lastY; y++) ys.push(y);
    el('btStartY').innerHTML = ys.map((y) => `<option value="${y}">${y}</option>`).join('');
    el('btEndY').innerHTML = ys.map((y) => `<option value="${y}">${y}</option>`).join('');
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    ['btStartM', 'btEndM'].forEach((id) => { el(id).innerHTML = MON.map((m, i) => `<option value="${String(i + 1).padStart(2, '0')}">${m}</option>`).join(''); });
    // From/To month + year: start = first day of the start month, end = last day of the end month.
    const fromSelects = () => {
      opt.trail = null;
      let s = `${el('btStartY').value}-${el('btStartM').value}-01`;
      const ey = +el('btEndY').value, em = +el('btEndM').value;
      let e = new Date(Date.UTC(ey, em, 0)).toISOString().slice(0, 10);
      if (s < D.dates[0]) s = D.dates[0];
      if (e <= s) { e = new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7), 0)).toISOString().slice(0, 10); }
      opt.start = s; opt.end = e >= D.dates[D.n - 1] ? null : e;
      syncSelects(); markPreset(); render();
    };
    ['btStartM', 'btStartY', 'btEndM', 'btEndY'].forEach((id) => el(id).addEventListener('change', fromSelects));
    document.querySelectorAll('#btPresets button').forEach((b) => b.addEventListener('click', () => {
      opt.trail = null; opt.start = b.dataset.start; opt.end = null; syncSelects(); markPreset(); render();
    }));
    document.querySelectorAll('#btTrail button').forEach((b) => b.addEventListener('click', () => {
      opt.trail = +b.dataset.m; applyTrail(); syncSelects(); markPreset(); render();
    }));
    syncSelects();
    // $ | % toggle on the chart: dollars = funded balance; % = time-weighted cumulative return (deposits excluded).
    document.querySelectorAll('#btUnit button').forEach((b) => b.addEventListener('click', () => {
      opt.unit = b.dataset.u; document.querySelectorAll('#btUnit button').forEach((x) => x.classList.toggle('on', x === b)); draw();
    }));
    ['TQQQ', 'QQQ', 'SPY'].forEach((k) => {
      const cb = el('btB' + k); cb.checked = opt.bench[k];
      cb.addEventListener('change', () => { opt.bench[k] = cb.checked; render(); });
    });
    const moneyIn = (id, key) => {
      const inp = el(id);
      const apply = () => { const v = Math.max(0, Math.min(1e9, Math.round(+String(inp.value).replace(/[^0-9.]/g, '') || 0))); inp.value = v.toLocaleString('en-US'); if (v !== opt[key]) { opt[key] = v; render(); } };
      inp.addEventListener('change', apply); inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { apply(); inp.blur(); } });
    };
    moneyIn('btBal0', 'bal0'); moneyIn('btMonthly', 'monthly');
    markPreset();
    setupHover();
    window.addEventListener('resize', () => { if (!el('tab-bt').hidden && view) { draw(); drawYears(); if (MC.rows) renderMC(); } });
  }
  function markPreset() {
    document.querySelectorAll('#btPresets button').forEach((b) => b.classList.toggle('on', !opt.trail && !opt.end && b.dataset.start === opt.start));
    document.querySelectorAll('#btTrail button').forEach((b) => b.classList.toggle('on', opt.trail === +b.dataset.m));
  }
  // Trailing N months ending at the latest close (recomputed when the daily rebuild adds a day).
  function applyTrail() {
    const last = D.dates[D.n - 1];
    const d = new Date(last + 'T00:00:00Z'); const day = d.getUTCDate();
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - opt.trail);
    const dim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, dim));
    // Start at the last close on or before the anniversary, so returns run close-to-close over N months.
    const s = d.toISOString().slice(0, 10);
    const k = Math.max(0, idxOf(s) - (D.dates[idxOf(s)] > s ? 1 : 0));
    opt.start = D.dates[k]; opt.end = null;
  }
  function syncSelects() {
    const s = opt.start < D.dates[0] ? D.dates[0] : opt.start, e = opt.end || D.dates[D.n - 1];
    el('btStartY').value = s.slice(0, 4); el('btStartM').value = s.slice(5, 7);
    el('btEndY').value = e.slice(0, 4); el('btEndM').value = e.slice(5, 7);
  }

  // ------------------------------------------------------------------ compute
  function compute() {
    const key = `${opt.sem}_${opt.chan}_${opt.fill}`;
    const S = D.full[key], states = D.statesFull[`${opt.sem}_${opt.chan}`];
    let i0 = idxOf(opt.start), i1 = opt.end ? Math.min(D.n - 1, idxOf(opt.end) - (D.dates[Math.min(D.n - 1, idxOf(opt.end))] > opt.end ? 1 : 0)) : D.n - 1;
    if (i1 <= i0 + 5) i1 = Math.min(D.n - 1, i0 + 260);
    const c = opt.cost / 1e4, len = i1 - i0 + 1;
    const net = new Float64Array(len), eq = new Float64Array(len), dd = new Float64Array(len);
    const bEq = {}; for (const k in D.benchR) bEq[k] = new Float64Array(len);
    eq[0] = 10000; for (const k in bEq) bEq[k][0] = 10000;
    let peak = 10000, mdd = 0, pkI = 0, ddPk = 0, ddTr = 0;
    for (let j = 1; j < len; j++) {
      const i = i0 + j;
      const r = (1 + S.r[i]) * (1 - c * S.t[i]) - 1;
      net[j] = r; eq[j] = eq[j - 1] * (1 + r);
      if (eq[j] > peak) { peak = eq[j]; pkI = j; }
      dd[j] = eq[j] / peak - 1;
      if (dd[j] < mdd) { mdd = dd[j]; ddPk = pkI; ddTr = j; }
      for (const k in bEq) bEq[k][j] = bEq[k][j - 1] * (1 + D.benchR[k][i]);
    }
    // account balances: starting balance + monthly funding (first trading day of each new month). Display only; all metrics use eq (time-weighted).
    const B0 = opt.bal0, MC_ = opt.monthly, bal = new Float64Array(len), contrib = new Float64Array(len), bBal = {};
    for (const k in bEq) bBal[k] = new Float64Array(len);
    bal[0] = B0; contrib[0] = B0; for (const k in bEq) bBal[k][0] = B0;
    for (let j = 1; j < len; j++) {
      const i = i0 + j, dep = D.dates[i].slice(0, 7) !== D.dates[i - 1].slice(0, 7) ? MC_ : 0;
      bal[j] = bal[j - 1] * (1 + net[j]) + dep; contrib[j] = contrib[j - 1] + dep;
      for (const k in bEq) bBal[k][j] = bBal[k][j - 1] * (1 + D.benchR[k][i]) + dep;
    }
    const bDD = {};
    for (const k in bEq) { const a = bEq[k], o = new Float64Array(len); let p = 0; for (let j = 0; j < len; j++) { if (a[j] > p) p = a[j]; o[j] = a[j] / p - 1; } bDD[k] = o; }
    const yrs = (Date.parse(D.dates[i1]) - Date.parse(D.dates[i0])) / (365.25 * 864e5);
    const cagr = Math.pow(eq[len - 1] / eq[0], 1 / yrs) - 1;
    let m = 0, s2 = 0, ex = 0;
    for (let j = 1; j < len; j++) { m += net[j]; ex += net[j] - D.rfR[i0 + j]; }
    m /= len - 1; ex /= len - 1;
    for (let j = 1; j < len; j++) s2 += (net[j] - m) ** 2;
    const vol = Math.sqrt(s2 / (len - 2)) * Math.sqrt(252);
    const sharpe = vol > 0 ? (ex * 252) / vol : null;
    const bStats = {};
    for (const k in bEq) {
      let p = bEq[k][0], md = 0; for (let j = 1; j < len; j++) { if (bEq[k][j] > p) p = bEq[k][j]; md = Math.min(md, bEq[k][j] / p - 1); }
      let bm = 0, bs = 0; for (let j = 1; j < len; j++) bm += D.benchR[k][i0 + j]; bm /= len - 1;
      for (let j = 1; j < len; j++) bs += (D.benchR[k][i0 + j] - bm) ** 2;
      bStats[k] = { cagr: Math.pow(bEq[k][len - 1] / 1e4, 1 / yrs) - 1, mdd: md, end: bEq[k][len - 1], vol: Math.sqrt(bs / (len - 2)) * Math.sqrt(252) };
    }
    // sleeve time, switches, annual table
    const time = {}; let sw = 0;
    for (let i = i0; i < i1; i++) { const k = stKey(states[i]); time[k] = (time[k] || 0) + 1; if (i > i0 && states[i] !== states[i - 1]) sw++; }
    const annual = [];
    const SER = ['S'].concat(Object.keys(bEq));
    const newYear = (y, first) => { const o = { y, s: 1, b: {}, st: {}, sw: 0, first, m: {} }; for (const k in bEq) o.b[k] = 1; SER.forEach((k) => { o.m[k] = { n: 0, s1: 0, s2: 0, v: 1, p: 1, md: 0 }; }); return o; };
    const acc = (o, k, r) => { const m = o.m[k]; m.n++; m.s1 += r; m.s2 += r * r; m.v *= 1 + r; if (m.v > m.p) m.p = m.v; m.md = Math.min(m.md, m.v / m.p - 1); };
    let y = D.years[i0], cur = newYear(y, D.dates[i0]); cur.partial = D.dates[i0].slice(5) > '01-05';
    for (let j = 1; j < len; j++) {
      const i = i0 + j;
      if (D.years[i] !== y) { cur.last = D.dates[i - 1]; annual.push(cur); y = D.years[i]; cur = newYear(y, D.dates[i]); }
      cur.s *= 1 + net[j]; for (const k in bEq) cur.b[k] *= 1 + D.benchR[k][i];
      acc(cur, 'S', net[j]); for (const k in bEq) acc(cur, k, D.benchR[k][i]);
      const sk = stKey(states[i - 1]); cur.st[sk] = (cur.st[sk] || 0) + 1;
      if (states[i - 1] !== states[i - 2 >= 0 ? i - 2 : 0]) cur.sw++;
    }
    cur.last = D.dates[i1]; cur.partial = cur.partial || D.dates[i1].slice(5) < '12-24'; annual.push(cur);
    annual.forEach((a) => { for (const k of SER) { const m = a.m[k], ret = m.v - 1; m.ret = ret; m.vol = m.n > 2 ? Math.sqrt(Math.max(0, (m.s2 - m.s1 * m.s1 / m.n) / (m.n - 1))) * Math.sqrt(252) : null; m.calmar = m.md < -1e-9 ? ret / -m.md : null; } });
    return { key, i0, i1, len, eq, dd, bEq, bDD, bal, bBal, contrib, net, cagr, mdd, ddPk: i0 + ddPk, ddTr: i0 + ddTr, vol, sharpe, yrs, time, sw, annual, bStats, states };
  }

  // ------------------------------------------------------------------ render
  function render() {
    if (!loaded) return;
    view = compute();
    view.ddEp = ddEpisodes(view.eq); renderKpis(); draw(); drawYears(); renderAnnual(); renderDD(); renderMC(); renderValidation();
  }

  function renderKpis() {
    const v = view, T = v.bStats.TQQQ;
    const card = (l, val, sub, cls = '') => `<div class="stat ${cls}"><div class="l">${l}</div><div class="v">${val}</div><div class="n">${sub}</div></div>`;
    const tot = Object.values(v.time).reduce((a, b) => a + b, 0) || 1;
    const top = ORDER.filter((k) => v.time[k]).map((k) => `<span class="sw"><i style="background:${ST[k].color}"></i>${ST[k].short} ${v.time[k] / tot < 0.005 ? '<1' : (100 * v.time[k] / tot).toFixed(0)}%</span>`).join('');
    el('btKpis').innerHTML =
      (v.yrs < 0.99
        ? card('Total return', pct(v.eq[v.len - 1] / v.eq[0] - 1), `Under 1 year, not annualized · TQQQ B&amp;H ${pct(v.bEq.TQQQ[v.len - 1] / v.bEq.TQQQ[0] - 1)}`)
        : card('CAGR', pct(v.cagr), `TQQQ buy-and-hold ${pct(T.cagr)}`)) +
      card('Max drawdown', pct(v.mdd), `${D.dates[v.ddPk]} → ${D.dates[v.ddTr]} · TQQQ B&amp;H ${pct(T.mdd)}`, 'hot') +
      card('Ending balance', money(v.bal[v.len - 1]), `${money(v.contrib[v.len - 1])} contributed · TQQQ B&amp;H ${money(v.bBal.TQQQ[v.len - 1])} · ${v.yrs.toFixed(1)} yrs`) +
      card('Volatility · Sharpe', `${pctU(v.vol, 0)} · ${v.sharpe == null ? '—' : v.sharpe.toFixed(2)}`, 'Annualized; Sharpe vs T-bills') +
      card('Signal changes', (v.sw / v.yrs).toFixed(0) + '/yr', `${v.sw.toLocaleString()} total in window`) +
      `<div class="stat wide"><div class="l">Time in each sleeve</div><div class="mix">${top}</div></div>`;
    const era = ERAS.filter((e) => e.b >= D.dates[v.i0] && e.a <= D.dates[v.i1]);
    const realOnly = D.dates[v.i0] >= '2010-02-11';
    el('btWindow').innerHTML = `${D.dates[v.i0]} → ${D.dates[v.i1]} · ${opt.sem === '1H' ? '1H chart replay' : 'Daily close'} · ${opt.chan === 'tv' ? 'live-chart-matched from 2010' : 'continuous channels'} · ${opt.fill === 'same' ? 'same-close fills' : 'next-close fills'} · ${opt.cost} bp per unit traded` +
      ` · <span class="q-${realOnly ? 'real' : 'syn'}">${realOnly ? 'Real TQQQ era only' : (era.some((e) => e.q === 'hyp') ? 'Includes hypothetical (pre-1971) and synthetic (pre-2010) history' : 'Includes synthetic (pre-2010) history')}</span>`;
  }

  // ------------------------------------------------------------------ main canvas (equity / drawdown / state strip)
  function canvasCtx(cv) {
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    return { g, w, h };
  }
  const isLight = () => document.documentElement.getAttribute('data-theme') === 'light';
  const TH = () => isLight()
    ? { grid: '#e6e9ee', axis: '#5c6370', faint: '#8a909b', base: '#c9ced6', era: { hyp: '#c62828', syn: '#b26a00', real: '#2e7d32' }, eraFill: { hyp: 'rgba(229,57,53,0.06)', syn: 'rgba(255,152,0,0.07)', real: 'rgba(76,175,80,0.06)' }, up: '#00897b', down: '#d32f2f' }
    : { grid: '#1d222b', axis: '#8a919e', faint: '#5d6471', base: '#2c3340', era: { hyp: '#e57373', syn: '#ffb74d', real: '#81c784' }, eraFill: ERA_FILL, up: '#26a69a', down: '#ef5350' };
  const BCOL_D = { TQQQ: '#B2B5BE', QQQ: '#00BCD4', SPY: '#E040FB' }, BCOL_L = { TQQQ: '#6b7280', QQQ: '#0097a7', SPY: '#c2185b' };
  const BCOL = new Proxy({}, { get: (_, k) => (isLight() ? BCOL_L : BCOL_D)[k] });
  window.addEventListener('themechange', () => { if (view && !el('tab-bt').hidden) { draw(); drawYears(); renderAnnual(); renderDD(); renderMC(); } });

  function draw() {
    if (!view) return;
    const cv = el('btCanvas'), { g, w, h } = canvasCtx(cv), v = view, T = TH();
    const L = 8, R = 64, top = 8, eqH = Math.round((h - 40) * 0.66), gap = 10, ddH = Math.round((h - 40) * 0.24), stH = h - 40 - eqH - ddH - gap * 2 + 12;
    const P = { x0: L, x1: w - R, eq: [top, top + eqH], dd: [top + eqH + gap, top + eqH + gap + ddH], st: [top + eqH + ddH + gap * 2, top + eqH + ddH + gap * 2 + stH] };
    const X = (j) => P.x0 + (j / (v.len - 1)) * (P.x1 - P.x0);
    view.P = P; view.X = X;
    // eras
    ERAS.forEach((e) => {
      const a = Math.max(v.i0, idxOf(e.a)), b = Math.min(v.i1, idxOf(e.b));
      if (b <= a) return;
      g.fillStyle = T.eraFill[e.q]; g.fillRect(X(a - v.i0), P.eq[0], X(b - v.i0) - X(a - v.i0), P.st[1] - P.eq[0]);
      if (X(b - v.i0) - X(a - v.i0) > 90) { g.fillStyle = T.era[e.q]; g.font = '500 11px Geist, system-ui'; g.fillText(e.name, X(a - v.i0) + 6, P.eq[0] + 14); }
    });
    // equity range
    const isPct = opt.unit === 'pct';
    // % mode plots growth multiples (1 = 0%) of the time-weighted equity, so deposits never move the lines.
    const rel = (a) => { const o = new Float64Array(v.len), b = a[0] || 1; for (let j = 0; j < v.len; j++) o[j] = a[j] / b; return o; };
    const series = [{ a: isPct ? rel(v.eq) : v.bal, c: '#FF9800', w: 2 }];
    for (const k of ['SPY', 'QQQ', 'TQQQ']) if (opt.bench[k]) series.unshift({ a: isPct ? rel(v.bEq[k]) : v.bBal[k], c: BCOL[k], w: 1.2, dash: k === 'TQQQ' ? [5, 3] : null });
    const lab = isPct ? (t) => { const r = (t - 1) * 100, a = Math.abs(r); return (r > 0.05 ? '+' : r < -0.05 ? '−' : '') + (a >= 1e4 ? Math.round(a).toLocaleString('en-US') : a >= 100 ? a.toFixed(0) : a >= 10 ? a.toFixed(0) : a.toFixed(1)) + '%'; } : money;
    let lo = Infinity, hi = -Infinity;
    series.forEach((s) => { for (let j = 0; j < v.len; j++) { const x = s.a[j]; if (x > 0) { lo = Math.min(lo, x); hi = Math.max(hi, x); } } });
    if (!opt.log) lo = isPct ? Math.min(1, lo) : 0;
    const tf = opt.log ? Math.log10 : (x) => x;
    const yl = tf(lo), yh = tf(hi);
    const Y = (x) => P.eq[1] - ((tf(Math.max(x, lo)) - yl) / (yh - yl || 1)) * (P.eq[1] - P.eq[0] - 18);
    view.Y = Y;
    // grid + labels
    g.strokeStyle = T.grid; g.lineWidth = 1; g.fillStyle = T.axis; g.font = '11px Geist Mono, monospace'; g.textAlign = 'left';
    const ticks = [];
    if (isPct && (opt.log ? yh - yl < 0.6 : true)) { const step = niceStep((hi - lo) / 5); for (let t = Math.ceil((lo - 1) / step) * step + 1; t <= hi + 1e-9; t += step) ticks.push(t); }
    else if (opt.log) { for (let e = Math.floor(yl); e <= Math.ceil(yh); e++) for (const m of (yh - yl > 5 ? [1] : yh - yl > 2 ? [1, 3] : [1, 2, 5])) { const val = m * 10 ** e; if (tf(val) >= yl && tf(val) <= yh) ticks.push(val); } }
    else { const step = niceStep(hi / 5); for (let t = 0; t <= hi; t += step) ticks.push(t); }
    const tk = ticks.length > 9 ? ticks.filter((t, i) => i % Math.ceil(ticks.length / 9) === 0) : ticks;
    tk.forEach((t) => { const y = Y(t); g.beginPath(); g.moveTo(P.x0, y); g.lineTo(P.x1, y); g.stroke(); g.fillText(lab(t), P.x1 + 6, y + 4); });
    if (isPct && lo < 1 && hi > 1) { const y = Y(1); g.strokeStyle = T.axis; g.globalAlpha = 0.5; g.beginPath(); g.moveTo(P.x0, y); g.lineTo(P.x1, y); g.stroke(); g.globalAlpha = 1; }
    // year ticks
    const yrs = (v.i1 - v.i0) / 252, stepY = yrs > 50 ? 10 : yrs > 25 ? 5 : yrs > 10 ? 2 : 1;
    g.textAlign = 'center';
    if (yrs < 3) {   // short windows: month ticks
      const stepM = yrs < 0.8 ? 1 : yrs < 1.6 ? 2 : 3, MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      for (let j = 1; j < v.len; j++) {
        const i = v.i0 + j, m = +D.dates[i].slice(5, 7);
        if (D.dates[i].slice(5, 7) !== D.dates[i - 1].slice(5, 7) && (m - 1) % stepM === 0) {
          const x = X(j); g.strokeStyle = T.grid; g.beginPath(); g.moveTo(x, P.eq[0]); g.lineTo(x, P.st[1]); g.stroke();
          g.fillStyle = T.axis; g.fillText(m === 1 ? String(D.years[i]) : `${MN[m - 1]} '${D.dates[i].slice(2, 4)}`, x, P.st[1] + 14);
        }
      }
    }
    for (let j = 1; j < v.len && yrs >= 3; j++) {
      const i = v.i0 + j;
      if (D.years[i] !== D.years[i - 1] && D.years[i] % stepY === 0) {
        const x = X(j); g.strokeStyle = T.grid; g.beginPath(); g.moveTo(x, P.eq[0]); g.lineTo(x, P.st[1]); g.stroke();
        g.fillStyle = T.axis; g.fillText(String(D.years[i]), x, P.st[1] + 14);
      }
    }
    // lines (decimated: min/max per pixel column)
    if (opt.monthly > 0 && !isPct) line(g, { a: v.contrib, c: T.axis, w: 1, dash: [2, 3] }, X, Y, v.len);
    series.forEach((s) => line(g, s, X, Y, v.len));
    // drawdown panel
    let ddLo = v.mdd; series.length; const bdd = {};
    if (opt.bench.TQQQ) { let p = 0; bdd.TQQQ = new Float64Array(v.len); for (let j = 0; j < v.len; j++) { p = Math.max(p, v.bEq.TQQQ[j]); bdd.TQQQ[j] = v.bEq.TQQQ[j] / p - 1; ddLo = Math.min(ddLo, bdd.TQQQ[j]); } }
    const YD = (x) => P.dd[0] + (x / (ddLo || -1)) * (P.dd[1] - P.dd[0]);
    g.textAlign = 'left'; g.fillStyle = T.axis;
    [0, -0.25, -0.5, -0.75, -1].filter((t) => t >= ddLo - 0.001).forEach((t) => { const y = YD(t); g.strokeStyle = T.grid; g.beginPath(); g.moveTo(P.x0, y); g.lineTo(P.x1, y); g.stroke(); g.fillText((t * 100).toFixed(0) + '%', P.x1 + 6, y + 4); });
    if (bdd.TQQQ) line(g, { a: bdd.TQQQ, c: isLight() ? 'rgba(107,114,128,0.6)' : 'rgba(178,181,190,0.55)', w: 1, dash: [5, 3] }, X, YD, v.len);
    g.fillStyle = 'rgba(255,82,82,0.28)'; g.beginPath(); g.moveTo(X(0), YD(0));
    for (let j = 0; j < v.len; j++) g.lineTo(X(j), YD(v.dd[j]));
    g.lineTo(X(v.len - 1), YD(0)); g.closePath(); g.fill();
    line(g, { a: v.dd, c: '#FF5252', w: 1 }, X, YD, v.len);
    
    // state strip
    const pxPer = (P.x1 - P.x0) / v.len;
    let j0 = 0;
    for (let j = 1; j <= v.len; j++) {
      if (j === v.len || v.states[v.i0 + j] !== v.states[v.i0 + j0]) {
        g.fillStyle = ST[stKey(v.states[v.i0 + j0])].color; g.fillRect(X(j0), P.st[0], Math.max(pxPer, X(j) - X(j0)), P.st[1] - P.st[0]);
        j0 = j;
      }
    }
    g.fillStyle = T.faint; g.font = '500 10.5px Geist, system-ui'; g.textAlign = 'left'; g.fillText('HELD', P.x1 + 6, (P.st[0] + P.st[1]) / 2 + 4);
    // legend
    const items = [['Strategy', '#FF9800']].concat(['TQQQ', 'QQQ', 'SPY'].filter((k) => opt.bench[k]).map((k) => [k + ' buy & hold', BCOL[k]])).concat(opt.monthly > 0 && !isPct ? [['Total contributed', T.axis]] : []);
    el('btLegend').innerHTML = items.map(([l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join('') +
      ORDER.filter((k) => k !== 'W' || view.time.W).map((k) => `<span><i class="sq" style="background:${ST[k].color}"></i>${ST[k].short}</span>`).join('');
  }
  function niceStep(x) { const p = 10 ** Math.floor(Math.log10(x)); const m = x / p; return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p; }
  function line(g, s, X, Y, len) {
    g.strokeStyle = s.c; g.lineWidth = s.w; g.setLineDash(s.dash || []); g.beginPath();
    let lastX = -1, mn = 0, mx = 0, started = false;
    for (let j = 0; j < len; j++) {
      const x = Math.round(X(j)), y = Y(s.a[j]);
      if (x !== lastX) { if (started) { g.lineTo(lastX, mn); g.lineTo(lastX, mx); } if (!started) { g.moveTo(x, y); started = true; } g.lineTo(x, y); mn = mx = y; lastX = x; }
      else { mn = Math.min(mn, y); mx = Math.max(mx, y); }
    }
    g.stroke(); g.setLineDash([]);
  }

  // Tooltip value: funded balance in $ mode, time-weighted cumulative return in % mode.
  function fmtV(bal, eq, j) { if (opt.unit !== 'pct') return money(bal[j]); return pct(eq[j] / eq[0] - 1); }
  function setupHover() {
    const cv = el('btCanvas'), tip = el('btTip');
    const move = (ev) => {
      if (!view || !view.P) return;
      const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, P = view.P;
      if (x < P.x0 || x > P.x1) { tip.hidden = true; el('btCross').hidden = true; return; }
      const j = Math.max(0, Math.min(view.len - 1, Math.round(((x - P.x0) / (P.x1 - P.x0)) * (view.len - 1)))), i = view.i0 + j;
      const st = view.states[Math.max(0, i - 1 - (opt.fill === 'next' ? 1 : 0))];
      const era = ERAS.find((e) => D.dates[i] >= e.a && D.dates[i] <= e.b);
      let html = `<div class="d">${D.dates[i]} <span class="q-${era.q}">${era.name}</span></div>` +
        `<div><b style="color:#FF9800">Strategy</b> ${fmtV(view.bal, view.eq, j)} <span class="ddv">DD ${ddTxt(view.dd[j])}</span></div>`;
      ['TQQQ', 'QQQ', 'SPY'].forEach((k) => { if (opt.bench[k]) html += `<div><b style="color:${BCOL[k]}">${k}</b> ${fmtV(view.bBal[k], view.bEq[k], j)} <span class="ddv">DD ${ddTxt(view.bDD[k][j])}</span></div>`; });
      if (opt.monthly > 0 && opt.unit !== 'pct') html += `<div class="muted">Contributed to date ${money(view.contrib[j])} · DD is time-weighted</div>`;
      const ep = (view.ddEp || []).find((e) => j >= e.pk && j <= (e.rec == null ? view.len - 1 : e.rec) && j > e.pk);
      if (ep) html += `<div class="muted">In drawdown since ${D.dates[view.i0 + ep.pk]} · ${j - ep.pk} trading days · episode low ${pct(ep.depth)} on ${D.dates[view.i0 + ep.tr]}${ep.rec == null ? ' · not yet recovered' : ' · recovered ' + D.dates[view.i0 + ep.rec]}</div>`;
      html += `<div class="al"><i style="background:${ST[stKey(st)].color}"></i>Holding: ${esc(stateLabel(st))}<br><span class="muted">${esc(weightsText(st))}</span></div>`;
      const sig = view.states[i];
      if (sig !== st) html += `<div class="muted">Signal at this close → ${esc(stateLabel(sig))}</div>`;
      tip.innerHTML = html; tip.hidden = false;
      const tw = tip.offsetWidth; tip.style.left = (x + 14 + tw > r.width ? x - tw - 14 : x + 14) + 'px'; tip.style.top = '10px';
      const cr = el('btCross'); cr.hidden = false; cr.style.left = x + 'px';
    };
    cv.addEventListener('mousemove', move);
    cv.addEventListener('mouseleave', () => { tip.hidden = true; el('btCross').hidden = true; });
    cv.addEventListener('touchmove', (e) => { if (e.touches[0]) move(e.touches[0]); }, { passive: true });
  }

  // ------------------------------------------------------------------ yearly allocation bars
  function drawYears() {
    if (!view) return;
    const cv = el('btYears'), { g, w, h } = canvasCtx(cv), A = view.annual, T = TH();
    const L = 8, R = 64, top = 8, barH = h - 70, n = A.length, bw = (w - L - R) / n;
    view.yb = { L, R, bw, top, barH, n };
    A.forEach((a, k) => {
      const tot = Object.values(a.st).reduce((s, x) => s + x, 0) || 1;
      let y = top;
      ORDER.forEach((s) => { const c = a.st[s] || 0; if (!c) return; const hh = (c / tot) * barH; g.fillStyle = ST[s].color; g.fillRect(L + k * bw + (bw > 6 ? 1 : 0), y, Math.max(1, bw - (bw > 6 ? 2 : 0)), hh); y += hh; });
    });
    // annual return markers
    const ret = A.map((a) => a.s - 1), mx = Math.max(1, ...ret.map((x) => Math.abs(x)));
    const base = top + barH + 30, sc = 26;
    g.strokeStyle = T.base; g.beginPath(); g.moveTo(L, base); g.lineTo(w - R, base); g.stroke();
    A.forEach((a, k) => { const r = a.s - 1; g.fillStyle = r >= 0 ? T.up : T.down; const hh = Math.max(1, Math.min(26, Math.abs(r) * sc)); g.fillRect(L + k * bw + bw * 0.2, r >= 0 ? base - hh : base, Math.max(1, bw * 0.6), hh); });
    g.fillStyle = T.axis; g.font = '11px Geist Mono, monospace'; g.textAlign = 'center';
    const step = n > 50 ? 10 : n > 25 ? 5 : n > 12 ? 2 : 1;
    A.forEach((a, k) => { if (a.y % step === 0) g.fillText(String(a.y), L + k * bw + bw / 2, h - 4); });
    g.textAlign = 'left'; g.fillStyle = T.faint; g.font = '500 10.5px Geist, system-ui';
    g.fillText('MIX', w - R + 6, top + 12); g.fillText('RETURN', w - R + 6, base - 14); g.fillText('±100%', w - R + 6, base + 2);
    if (!cv._hover) {
      cv._hover = true;
      const tip = el('btYTip');
      cv.addEventListener('mousemove', (ev) => {
        const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, Y = view.yb, k = Math.floor((x - Y.L) / Y.bw);
        if (k < 0 || k >= view.annual.length) { tip.hidden = true; return; }
        const a = view.annual[k], tot = Object.values(a.st).reduce((s, v) => s + v, 0) || 1;
        tip.innerHTML = `<div class="d">${a.y}${a.partial ? ' <span class="muted">(partial)</span>' : ''}</div><div>Strategy <b>${pct(a.s - 1)}</b> · TQQQ ${pct(a.b.TQQQ - 1)}</div>` +
          ORDER.filter((s) => a.st[s]).map((s) => `<div class="al"><i style="background:${ST[s].color}"></i>${ST[s].short} ${(100 * a.st[s] / tot).toFixed(0)}%</div>`).join('');
        tip.hidden = false; const tw = tip.offsetWidth; tip.style.left = (x + 12 + tw > r.width ? x - tw - 12 : x + 12) + 'px'; tip.style.top = '6px';
      });
      cv.addEventListener('mouseleave', () => { tip.hidden = true; });
    }
  }

  // ------------------------------------------------------------------ tables
  // drawdown episodes on an equity array (indices are window-relative)
  function ddEpisodes(eq) {
    const out = []; let pk = 0, cur = null;
    for (let j = 1; j < eq.length; j++) {
      if (eq[j] >= eq[pk]) { if (cur) { cur.rec = j; out.push(cur); cur = null; } pk = j; continue; }
      const d = eq[j] / eq[pk] - 1;
      if (!cur) cur = { pk, tr: j, depth: d, rec: null };
      else if (d < cur.depth) { cur.depth = d; cur.tr = j; }
    }
    if (cur) out.push(cur);
    return out;
  }

  function renderAnnual() {
    const A = view.annual.slice().reverse();
    const cls = (x) => (x == null ? '' : x >= 0 ? 'up' : 'down');
    const num = (x, d = 2) => (x == null || !isFinite(x) ? '—' : x.toFixed(d));
    const G = [['S', 'Strategy', '#FF9800'], ['TQQQ', 'TQQQ', BCOL.TQQQ], ['QQQ', 'QQQ', BCOL.QQQ], ['SPY', 'SPY', BCOL.SPY]];
    const head = `<thead><tr><th rowspan="2">Year</th>${G.map(([, l, c]) => `<th class="grp gl" colspan="3"><span style="color:${c}">●</span> ${l}</th>`).join('')}<th rowspan="2" class="gl">Main sleeve</th><th rowspan="2">Changes</th><th rowspan="2">Data</th></tr>` +
      `<tr>${G.map(() => '<th class="c gl">Return</th><th class="c">Vol</th><th class="c">Calmar</th>').join('')}</tr></thead>`;
    // selected-window summary row
    const v = view, W = { S: { ret: v.cagr, vol: v.vol, md: v.mdd } };
    for (const k of ['TQQQ', 'QQQ', 'SPY']) W[k] = { ret: v.bStats[k].cagr, vol: v.bStats[k].vol, md: v.bStats[k].mdd };
    const win = `<tr class="win"><td>Selected window<div class="sub">CAGR · vol · CAGR÷max DD</div></td>` + G.map(([k]) => {
      const m = W[k], cal = m.md < 0 ? m.ret / -m.md : null;
      return `<td class="c gl ${cls(m.ret)}">${pct(m.ret)}</td><td class="c">${pctU(m.vol, 1)}</td><td class="c">${num(cal)}</td>`;
    }).join('') + `<td class="gl"></td><td>${v.sw.toLocaleString()}</td><td></td></tr>`;
    el('btAnnual').innerHTML = head + '<tbody>' + win +
      A.map((a) => {
        const tot = Object.values(a.st).reduce((s, x) => s + x, 0) || 1;
        const main = ORDER.filter((s) => a.st[s]).sort((p, q) => a.st[q] - a.st[p])[0];
        const era = ERAS.find((e) => `${a.y}-06-30` >= e.a && `${a.y}-06-30` <= e.b) || ERAS[3];
        const eraQ = a.y === 2010 ? 'real' : era.q;
        return `<tr><td>${a.y}${a.partial ? '<sup title="Partial year in this window">p</sup>' : ''}</td>` +
          G.map(([k]) => { const m = a.m[k]; return `<td class="c gl ${cls(m.ret)}">${pct(m.ret)}</td><td class="c">${pctU(m.vol, 1)}</td><td class="c" title="Max drawdown within year ${pct(m.md)}">${num(m.calmar)}</td>`; }).join('') +
          `<td class="gl">${main ? `<span class="tag" style="background:${ST[main].color}">${ST[main].short}</span> <span class="muted">${(100 * a.st[main] / tot).toFixed(0)}%</span>` : '—'}</td><td>${a.sw}</td>` +
          `<td><span class="q-${eraQ}">${eraQ === 'real' ? 'Real' : eraQ === 'syn' ? 'Synthetic' : 'Hypothetical'}</span></td></tr>`;
      }).join('') + '</tbody>';
  }

  let ddSel = 'S';
  function renderDD() {
    const box = el('btDDSel');
    if (!box._init) {
      box._init = true;
      box.innerHTML = [['S', 'Strategy'], ['TQQQ', 'TQQQ'], ['QQQ', 'QQQ'], ['SPY', 'SPY']].map(([k, l]) => `<button data-v="${k}" class="${k === ddSel ? 'on' : ''}">${l}</button>`).join('');
      box.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { ddSel = b.dataset.v; box.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); renderDD(); }));
    }
    const v = view, eps = ddSel === 'S' ? v.ddEp : ddEpisodes(v.bEq[ddSel]);
    const top = eps.slice().sort((p, q) => p.depth - q.depth).slice(0, 10);
    const dt = (j) => D.dates[v.i0 + j];
    const cal = (a, b) => Math.round((Date.parse(dt(b)) - Date.parse(dt(a))) / 864e5);
    el('btDD').innerHTML = `<thead><tr><th>#</th><th>Peak</th><th>Low</th><th>Recovered</th><th class="c">Depth</th><th class="c">Days down</th><th class="c">Days to recover</th><th class="c">Total days</th><th>Held at the low</th><th>Data</th></tr></thead><tbody>` +
      (top.length ? top.map((e, n) => {
        const down = e.tr - e.pk, rec = e.rec == null ? null : e.rec - e.tr;
        const st = v.states[Math.max(0, v.i0 + e.tr - 1 - (opt.fill === 'next' ? 1 : 0))];
        const era = ERAS.find((x) => dt(e.tr) >= x.a && dt(e.tr) <= x.b);
        return `<tr><td>${n + 1}</td><td>${dt(e.pk)}</td><td>${dt(e.tr)}</td><td>${e.rec == null ? '<span class="muted">ongoing</span>' : dt(e.rec)}</td>` +
          `<td class="c down">${pct(e.depth)}</td><td class="c" title="${cal(e.pk, e.tr).toLocaleString()} calendar days">${down.toLocaleString()}</td>` +
          `<td class="c" title="${rec == null ? '' : cal(e.tr, e.rec).toLocaleString() + ' calendar days'}">${rec == null ? `<span class="muted">${(v.len - 1 - e.tr).toLocaleString()}+ (ongoing)</span>` : rec.toLocaleString()}</td>` +
          `<td class="c">${e.rec == null ? `<span class="muted">${(v.len - 1 - e.pk).toLocaleString()}+</span>` : (e.rec - e.pk).toLocaleString()}</td>` +
          `<td>${ddSel === 'S' ? `<span class="tag" style="background:${ST[stKey(st)].color}">${ST[stKey(st)].short}</span>` : '<span class="muted">buy &amp; hold</span>'}</td>` +
          `<td><span class="q-${era.q}">${era.q === 'real' ? 'Real' : era.q === 'syn' ? 'Synthetic' : 'Hypothetical'}</span></td></tr>`;
      }).join('') : '<tr><td colspan="10" class="muted">No drawdowns in this window.</td></tr>') + '</tbody>';
  }

  // ------------------------------------------------------------------ By period: history + Monte Carlo (block bootstrap of daily returns per period)
  // Market regimes: approximate Nasdaq / US-equity peak-to-trough and cycle boundaries. Labels are descriptive context only; the strategy never sees them.
  const REGIMES = [
    { id: 'r1', a: '1953-01-02', b: '1968-11-29', name: 'Postwar expansion', note: 'Long 1950s–60s bull with mild recessions (1957, 1960) and the 1962 "Kennedy slide".' },
    { id: 'r2', a: '1968-12-02', b: '1974-12-31', name: 'Go-go bust & 1973–74 bear', note: 'End of the go-go era, 1970 recession, Nifty Fifty collapse, oil embargo; Nasdaq fell about 60% in 1973–74.' },
    { id: 'r3', a: '1975-01-02', b: '1982-08-12', name: 'Stagflation & Volcker', note: 'High inflation, 1980 and 1981–82 recessions, short rates near 20% under Volcker.' },
    { id: 'r4', a: '1982-08-13', b: '1987-08-26', name: 'Disinflation bull', note: 'Falling rates and inflation; strong 1982–87 equity bull market.' },
    { id: 'r5', a: '1987-08-27', b: '1990-10-16', name: '1987 crash & S&L / Gulf War', note: 'Black Monday (Oct 1987), Savings & Loan crisis, 1990 recession and Gulf War selloff.' },
    { id: 'r6', a: '1990-10-17', b: '1997-12-31', name: '1990s expansion', note: 'Post-1990 recovery, 1994 bond-market rout, mid-90s tech bull.' },
    { id: 'r7', a: '1998-01-02', b: '2000-03-10', name: 'Tech bubble', note: 'LTCM / Asian-crisis shakeout in 1998, then the dot-com melt-up to the Nasdaq-100 peak on 10 Mar 2000.' },
    { id: 'r8', a: '2000-03-13', b: '2002-10-09', name: 'Dot-com bust', note: 'Nasdaq-100 fell about 83% peak to trough; 2001 recession and 9/11.' },
    { id: 'r9', a: '2002-10-10', b: '2007-10-31', name: 'Mid-2000s recovery', note: 'Recovery and housing-boom bull market; Fed hikes 2004–06.' },
    { id: 'r10', a: '2007-11-01', b: '2009-03-09', name: 'Global Financial Crisis', note: 'Subprime and banking crisis, Lehman failure; equities bottomed 9 Mar 2009.' },
    { id: 'r11', a: '2009-03-10', b: '2018-09-28', name: 'Post-GFC QE bull', note: 'Zero rates and QE; 2010 flash crash, 2011 debt-ceiling and Euro crisis, 2015–16 China / oil scare.' },
    { id: 'r12', a: '2018-10-01', b: '2020-02-19', name: 'Late cycle: Q4-2018 & 2019', note: 'Q4 2018 Fed-tightening selloff, 2019 rate cuts and rebound.' },
    { id: 'r13', a: '2020-02-20', b: '2021-11-19', name: 'COVID crash & stimulus boom', note: 'Fastest bear market on record (Feb–Mar 2020), then the stimulus-driven rally to the Nov 2021 peak.' },
    { id: 'r14', a: '2021-11-22', b: '2022-12-28', name: '2022 inflation bear', note: 'Fastest Fed hiking cycle in decades; Nasdaq-100 fell about 35%, bonds fell too.' },
    { id: 'r15', a: '2023-01-03', b: '2099-12-31', name: 'AI-led bull', note: 'Rate peak, AI / mega-cap tech rally; 2025 tariff shock included.' },
  ];
  const MC = { N: 2000, H: 2520, sel: { era: 'real', regime: 'r10' }, group: 'era', block: 63, cache: {} };
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const QLAB = { hyp: 'Hypothetical', syn: 'Synthetic', real: 'Real' };
  function periodList() {
    const span = (x) => { const a = idxOf(x.a), bi = Math.min(D.n - 1, idxOf(x.b)); return [a, bi - (D.dates[bi] > x.b ? 1 : 0)]; };
    let list;
    if (MC.group === 'era') list = ERAS.map((e, k) => ({ id: ['hyp', 'syn1', 'syn2', 'real'][k], name: e.name, q: e.q, note: e.note, ab: span(e) }));
    else list = REGIMES.map((r) => {
      const ab = span(r), qs = [...new Set(ERAS.filter((e) => e.b >= D.dates[ab[0]] && e.a <= D.dates[ab[1]]).map((e) => e.q))];
      return { id: r.id, name: r.name, q: qs.length === 1 ? qs[0] : 'mix', qs, note: r.note, ab };
    });
    list.push({ id: 'win', name: 'Selected window', q: 'win', note: 'The period currently highlighted by the start/end controls above.', ab: [view.i0, view.i1] });
    return list;
  }
  function periodData(list) {
    const key = `${opt.sem}_${opt.chan}_${opt.fill}`, S = D.full[key], c = opt.cost / 1e4, st = D.statesFull[`${opt.sem}_${opt.chan}`];
    list.forEach((o) => {
      const [a, b] = o.ab, n = b - a;
      o.from = D.dates[a]; o.to = D.dates[b];
      // historical stats over the exact period (all days, as the backtest experienced them)
      let v = 1, p = 1, md = 0, tq = 0, tot = 0; const br = {}, bp_ = {}, BK = ['TQQQ', 'QQQ', 'SPY'], bb = {}; BK.forEach((k) => { bb[k] = { v: 1, pk: 1, md: 0 }; });
      o.r = new Float64Array(Math.max(n, 0)); o.tq = new Float64Array(Math.max(n, 0)); o.qq = new Float64Array(Math.max(n, 0));
      let k = 0;
      for (let i = a + 1; i <= b; i++) {
        const r = (1 + S.r[i]) * (1 - c * S.t[i]) - 1;
        v *= 1 + r; p = Math.max(p, v); md = Math.min(md, v / p - 1);
        for (const k of BK) { const B = bb[k]; B.v *= 1 + D.benchR[k][i]; if (B.v > B.pk) B.pk = B.v; else B.md = Math.min(B.md, B.v / B.pk - 1); }
        const sk = stKey(st[i - 1]); if (sk === 'Q' || sk === 'B') tq++; if (sk !== 'W') { tot++; br[sk] = (br[sk] || 0) + 1; const P = bp_[sk] || (bp_[sk] = { v: 1, pk: 1, md: 0 }); P.v *= 1 + r; if (P.v > P.pk) P.pk = P.v; else P.md = Math.min(P.md, P.v / P.pk - 1); }
        // Monte Carlo sample: warm-up days (no signal yet) excluded
        if (st[i - 1] !== 'W') { o.r[k] = r; o.tq[k] = D.benchR.TQQQ[i]; o.qq[k] = D.benchR.QQQ[i]; k++; }
      }
      const yrs = Math.max(1e-9, (Date.parse(o.to) - Date.parse(o.from)) / (365.25 * 864e5));
      o.yrs = yrs; o.ret = v - 1; o.cagr = yrs >= 1 ? Math.pow(v, 1 / yrs) - 1 : null; o.mdd = md;
      o.bench = {}; BK.forEach((k) => { const B = bb[k]; o.bench[k] = { ret: B.v - 1, cagr: yrs >= 1 ? Math.pow(B.v, 1 / yrs) - 1 : null, mdd: B.md }; });
      o.tqs = tot ? tq / tot : 0; o.br = br; o.brTot = tot; o.brP = bp_;
      o.n = k; o.r = o.r.subarray(0, k); o.tq = o.tq.subarray(0, k); o.qq = o.qq.subarray(0, k);
      o.blk = Math.max(5, Math.min(MC.block, Math.floor(k / 3)));
    });
    return list;
  }
  function q(arr, p) { const i = (arr.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return arr[lo] + (arr[hi] - arr[lo]) * (i - lo); }
  function simulate(src, block, seed) {
    const { N, H } = MC, M = H / 21, rnd = mulberry32(seed), n = src.n;
    const end = new Float64Array(N), mdd = new Float64Array(N), qEnd = new Float64Array(N), tEnd = new Float64Array(N);
    // balances in dollars: starting balance + monthly funding every 21 trading days. Metrics (CAGR, DD, P(loss)) use the time-weighted v only.
    const B0 = opt.bal0, C = opt.monthly;
    const ck = Array.from({ length: M + 1 }, () => new Float64Array(N)), qck = Array.from({ length: M + 1 }, () => new Float64Array(N)), tck = Array.from({ length: M + 1 }, () => new Float64Array(N));
    const balEnd = new Float64Array(N);
    for (let p = 0; p < N; p++) {
      let v = 1, pk = 1, md = 0, qv = 1, tv = 1, t = 0, pos = 0, left = 0, b = B0, qb = B0, tb = B0;
      ck[0][p] = B0; qck[0][p] = B0; tck[0][p] = B0;
      while (t < H) {
        if (left === 0) { pos = Math.floor(rnd() * n); left = block; }
        const r = src.r[pos];
        v *= 1 + r; qv *= 1 + src.qq[pos]; tv *= 1 + src.tq[pos];
        b *= 1 + r; qb *= 1 + src.qq[pos]; tb *= 1 + src.tq[pos];
        if (v > pk) pk = v; else { const d = v / pk - 1; if (d < md) md = d; }
        pos = pos + 1 === n ? 0 : pos + 1; left--; t++;
        if (t % 21 === 0) { const m = t / 21; if (m < M) { b += C; qb += C; tb += C; } ck[m][p] = b; qck[m][p] = qb; tck[m][p] = tb; }
      }
      end[p] = v; mdd[p] = md; qEnd[p] = qv; tEnd[p] = tv; balEnd[p] = b;
    }
    const contribTot = B0 + C * (M - 1); let under = 0; for (let p = 0; p < N; p++) if (balEnd[p] < contribTot) under++;
    let beatQ = 0, beatT = 0, loss = 0, dd50 = 0, dd70 = 0;
    for (let p = 0; p < N; p++) { if (end[p] > qEnd[p]) beatQ++; if (end[p] > tEnd[p]) beatT++; if (end[p] < 1) loss++; if (mdd[p] <= -0.5) dd50++; if (mdd[p] <= -0.7) dd70++; }
    const sorted = (a) => Float64Array.from(a).sort();
    const E = sorted(end), Md = sorted(mdd), QE = sorted(qEnd), TE = sorted(tEnd);
    const cg = (x) => Math.pow(Math.max(x, 1e-12), 1 / (H / 252)) - 1;
    const P = [0.05, 0.25, 0.5, 0.75, 0.95];
    const fan = ck.map((col) => { const s = sorted(col); return P.map((pp) => q(s, pp)); });
    const qMed = qck.map((col) => q(sorted(col), 0.5)), tMed = tck.map((col) => q(sorted(col), 0.5));
    return {
      cagr: P.map((pp) => cg(q(E, pp))), end: P.map((pp) => q(E, pp)), mddMed: q(Md, 0.5), mdd5: q(Md, 0.05),
      pLoss: loss / N, pBeatQ: beatQ / N, pBeatT: beatT / N, pDD50: dd50 / N, pDD70: dd70 / N,
      qCagr: cg(q(QE, 0.5)), tCagr: cg(q(TE, 0.5)), fan, qMed, tMed, B0, C, contribTot, pUnder: under / N,
      contrib: Array.from({ length: M + 1 }, (_, m) => B0 + C * Math.min(m, M - 1)),
    };
  }
  const MIN_MC_DAYS = 60;
  function qTag(r) {
    if (r.q === 'win') return '';
    if (r.q === 'mix') return `<span class="qtag">${r.qs.map((x) => `<span class="q-${x}">${QLAB[x]}</span>`).join(' → ')}</span>`;
    return MC.group === 'era' ? '' : `<span class="qtag q-${r.q}">${QLAB[r.q]}</span>`;
  }
  function renderMC() {
    if (!view) return;
    const ctlKey = `${MC.group}|${opt.sem}_${opt.chan}_${opt.fill}|${opt.cost}|${MC.block}|${view.i0}-${view.i1}|${opt.bal0}|${opt.monthly}`;
    if (!MC.cache[ctlKey]) {
      const rows0 = periodData(periodList());
      MC.cache = {}; // keep only the latest settings
      MC.cache[ctlKey] = rows0.map((s0) => ({ ...s0, ok: s0.n >= MIN_MC_DAYS, res: null }));
    }
    const rows = MC.cache[ctlKey];
    MC.rows = rows;
    // controls
    const gb = el('mcGroup');
    gb.innerHTML = [['era', 'Data era'], ['regime', 'Market regime']].map(([v, l]) => `<button data-v="${v}" class="${v === MC.group ? 'on' : ''}">${l}</button>`).join('');
    gb.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { MC.group = b.dataset.v; renderMC(); }));
    const bb = el('mcBlock');
    bb.innerHTML = [[21, '1 mo'], [63, '3 mo'], [252, '1 yr']].map(([v, l]) => `<button data-v="${v}" class="${+v === MC.block ? 'on' : ''}" title="Length of each consecutive run of real days sampled">${l}</button>`).join('');
    bb.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { MC.block = +b.dataset.v; renderMC(); }));
    const sel = MC.sel[MC.group];
    const pk = el('mcPick');
    pk.innerHTML = rows.map((r) => `<option value="${r.id}"${r.id === sel ? ' selected' : ''}${r.ok ? '' : ' disabled'}>${esc(r.q === 'win' ? 'Selected window' : r.name)}${r.ok ? '' : ' (too short)'}</option>`).join('');
    pk.onchange = () => { MC.sel[MC.group] = pk.value; renderMC(); };
    // history + time-in-branch table (no Monte Carlo columns here)
    const cls = (x) => (x >= 0 ? 'up' : 'down');
    const cagrCell = (c, ret, gl) => (c == null ? `<td class="c ${gl ? 'gl ' : ''}${cls(ret)}" title="Under 1 year: total return, not annualized">${pct(ret)}<span class="muted">*</span></td>` : `<td class="c ${gl ? 'gl ' : ''}${cls(c)}">${pct(c)}</td>`);
    const BR = ORDER.filter((k) => k !== 'W' && rows.some((r) => r.br[k]));
    const BKS = ['TQQQ', 'QQQ', 'SPY'].filter((k) => opt.bench[k]);
    const perf = (c, ret, mdd) => `${cagrCell(c, ret, true)}<td class="c down">${pct(mdd, 0)}</td><td class="c">${c != null && mdd < -1e-9 ? (c / -mdd).toFixed(2) : '–'}</td>`;
    el('mcTable').innerHTML = `<thead><tr><th>${MC.group === 'era' ? 'Data era' : 'Market regime'}</th><th class="c">Dates</th>` +
      [0].concat(BKS).map(() => `<th class="c gl">CAGR</th><th class="c">Max DD</th><th class="c" title="CAGR ÷ |max drawdown| over the period">Calmar</th>`).join('') + `<th class="gl"></th>` +
      BR.map((k) => `<th class="c" title="${esc(ST[k].label)}"><span class="dot" style="background:${ST[k].color}"></span>${ST[k].short}</th>`).join('') + `</tr>` +
      `<tr><th></th><th></th><th class="grp gl" colspan="3"><span class="dot" style="background:#FF9800"></span>Strategy</th>${BKS.map((k) => `<th class="grp gl" colspan="3"><span class="dot" style="background:${BCOL[k]}"></span>${k}</th>`).join('')}<th class="grp gl" colspan="${BR.length + 1}">Each branch · time held and strategy performance while in it</th></tr></thead><tbody>` +
      rows.map((r) => {
        const nm = r.q === 'win' ? `<span class="muted">Selected window</span>` : MC.group === 'era' ? `<span class="q-${r.q}">${r.name}</span>` : `<b>${r.name}</b><br>${qTag(r)}`;
        const brc = `<td class="gl bcl"><div class="bc"><span>Time</span><span>Ret/yr</span><span>Max DD</span><span>Calmar</span></div></td>` + BR.map((k) => {
          const n = r.br[k] || 0, f = r.brTot ? n / r.brTot : 0, P = r.brP[k];
          if (!n) return `<td class="c br0">–</td>`;
          const ann = n >= 63 ? Math.pow(P.v, 252 / n) - 1 : null, tot = P.v - 1;
          const retS = ann != null ? `<span class="${cls(ann)}">${pct(ann, 0)}</span>` : `<span class="${cls(tot)}" title="Fewer than 63 days in this branch: total return, not annualized">${pct(tot, 0)}<span class="muted">†</span></span>`;
          const cal = ann == null ? '–' : P.md > -0.02 ? '<span class="muted" title="Max drawdown under 2%, so Calmar is not meaningful">n/m</span>' : (ann / -P.md).toFixed(2);
          return `<td class="c"><div class="bc"><b>${f < 0.005 ? '<1%' : pctU(f, 0)}</b>${retS}<span class="down">${pct(P.md, 0)}</span><span>${cal}</span></div></td>`;
        }).join('');
        return `<tr${r.ok ? ` data-id="${r.id}"` : ''} class="${r.id === sel ? 'sel' : ''}"><td>${nm}<div class="sub">${esc(r.note)}</div></td><td class="c" style="white-space:nowrap">${r.from} →<br>${r.to}<div class="sub">${r.yrs.toFixed(1)} yrs</div></td>` +
          perf(r.cagr, r.ret, r.mdd) + BKS.map((k) => perf(r.bench[k].cagr, r.bench[k].ret, r.bench[k].mdd)).join('') + `${brc}</tr>`;
      }).join('') + '</tbody>';
    el('mcTable').querySelectorAll('tbody tr[data-id]').forEach((tr) => tr.addEventListener('click', () => { MC.sel[MC.group] = tr.dataset.id; renderMC(); }));
    el('mcHint').innerHTML = `Branch columns, top to bottom: share of trading days spent in that branch (warm-up excluded); the strategy's return per year while in it (its in-branch days chained together and annualized per 252 days held, after costs); the max drawdown of that chained in-branch curve; and Calmar = return/yr ÷ |max DD|. † Under 63 days held: total return, not annualized, and no Calmar. n/m = max drawdown under 2%, so Calmar isn't meaningful (mostly BOXX). Short stints annualize to large numbers, so read Ret/yr alongside Time. Branch performance depends on when the strategy enters each branch, so it is not a standalone return for that holding. Hover a header for the full branch name. Click a row to load that period into the Monte Carlo below. ` +
      (rows.some((r) => r.cagr == null) ? '* Periods under 1 year show total return, not CAGR. ' : '');
    const cur = rows.find((r) => r.id === sel && r.ok) || rows.find((r) => r.ok);
    // simulate lazily: only the period being shown (seeded per period id, so results are repeatable)
    if (cur && !cur.res) cur.res = simulate(cur, cur.blk, 1953 + [...cur.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 0) * 7919);
    const R = cur.res;
    el('mcSide').innerHTML = !R ? '<div class="muted">Not enough data.</div>' :
      `<h4>${esc(cur.q === 'win' ? 'Selected window' : cur.name)}</h4><div class="muted" style="font-size:11.5px;margin-bottom:6px">Sampled from ${cur.from} → ${cur.to} (${cur.n.toLocaleString()} trading days)</div>` +
      [['Median 10-yr CAGR', pct(R.cagr[2])], ['Middle 50% of CAGRs', `${pct(R.cagr[1])} to ${pct(R.cagr[3])}`], ['Balance after 10 yrs · median', money(R.fan[R.fan.length - 1][2])], ['Balance · 5th to 95th pct', `${money(R.fan[R.fan.length - 1][0])} – ${money(R.fan[R.fan.length - 1][4])}`],
       ['Total contributed', money(R.contribTot)], ['Ends below amount contributed', pctU(R.pUnder, 1)],
       ['Chance of a negative 10-yr return', pctU(R.pLoss, 1)], ['Chance of a ≥50% drawdown', pctU(R.pDD50, 0)], ['Chance of a ≥70% drawdown', pctU(R.pDD70, 0)], ['Worst 5% max drawdown', pct(R.mdd5, 0)], ['Beats QQQ / TQQQ (same days)', `${pctU(R.pBeatQ, 0)} / ${pctU(R.pBeatT, 0)}`], ['QQQ / TQQQ median CAGR', `${pct(R.qCagr)} / ${pct(R.tCagr)}`]]
        .map(([l, v]) => `<div class="row"><span>${l}</span><b>${v}</b></div>`).join('') +
      `<div class="sub">Balances use your ${money(opt.bal0)} start and ${money(opt.monthly)}/month funding. CAGR, drawdown, negative-return and beat-benchmark figures are time-weighted on strategy returns, so funding doesn't change them.</div>` +
      `<div class="sub">${MC.N.toLocaleString()} paths of 2,520 trading days, built from ${cur.blk}-day blocks of consecutive real days from this period${cur.blk < MC.block ? ` (block capped at one-third of the period's ${cur.n} days)` : ''}.</div>`;
    el('mcNote').innerHTML = `Method: block bootstrap. Each path strings together randomly chosen runs of consecutive daily returns (strategy after ${opt.cost} bp costs, plus TQQQ and QQQ on the very same days) until it reaches 10 years. Uses the current Chart / Channels / Fill / Cost settings and your starting balance and monthly funding (added every 21 trading days, the same amount to the strategy, TQQQ and QQQ paths); warm-up days are excluded from the resample. Longer blocks keep more of each period's trends and crashes intact. Each sample period answers "what if the next 10 years looked like this period?" — crisis regimes are deliberately extreme stress cases, not forecasts. Regime dates are approximate peak/trough and cycle boundaries chosen for context; the strategy itself never uses them. Periods before 2010 use synthetic or hypothetical data. Seeded, so results are repeatable.`;
    drawMC(cur);
  }
  function drawMC(cur) {
    const cv = el('mcCanvas'), { g, w, h } = canvasCtx(cv), T = TH();
    if (!cur.res) return;
    const R = cur.res, M = R.fan.length - 1, L = 8, Rr = 64, top = 10, bot = h - 24;
    const X = (m) => L + (m / M) * (w - L - Rr);
    let lo = Infinity, hi = -Infinity;
    R.fan.forEach((f) => { lo = Math.min(lo, f[0]); hi = Math.max(hi, f[4]); });
    R.qMed.concat(R.tMed).forEach((x) => { lo = Math.min(lo, x); hi = Math.max(hi, x); });
    const base = Math.max(1, R.B0 || R.C || 1); hi = Math.max(hi, R.contribTot); lo = Math.max(Math.min(lo, base), base * 1e-3, 1);
    const yl = Math.log10(lo), yh = Math.log10(hi);
    const Y = (x) => bot - ((Math.log10(Math.max(x, lo)) - yl) / (yh - yl || 1)) * (bot - top);
    g.strokeStyle = T.grid; g.fillStyle = T.axis; g.font = '11px Geist Mono, monospace'; g.lineWidth = 1;
    for (let e = Math.floor(yl); e <= Math.ceil(yh); e++) for (const m of (yh - yl > 3 ? [1] : [1, 3])) { const v = m * 10 ** e; const lv = Math.log10(v); if (lv < yl || lv > yh) continue; const y = Y(v); g.beginPath(); g.moveTo(L, y); g.lineTo(w - Rr, y); g.stroke(); g.textAlign = 'left'; g.fillText(money(v), w - Rr + 6, y + 4); }
    for (let yr = 0; yr <= 10; yr += 2) { const x = X(yr * 12); g.beginPath(); g.moveTo(x, top); g.lineTo(x, bot); g.stroke(); g.textAlign = yr === 0 ? 'left' : yr === 10 ? 'right' : 'center'; g.fillText(`Yr ${yr}`, x, h - 6); }
    const band = (i0, i1, col) => { g.fillStyle = col; g.beginPath(); for (let m = 0; m <= M; m++) g.lineTo(X(m), Y(R.fan[m][i1])); for (let m = M; m >= 0; m--) g.lineTo(X(m), Y(R.fan[m][i0])); g.closePath(); g.fill(); };
    band(0, 4, 'rgba(255,152,0,0.13)'); band(1, 3, 'rgba(255,152,0,0.26)');
    const pl = (arr, col, wd, dash) => { g.strokeStyle = col; g.lineWidth = wd; g.setLineDash(dash || []); g.beginPath(); arr.forEach((v, m) => (m ? g.lineTo(X(m), Y(v)) : g.moveTo(X(m), Y(v)))); g.stroke(); g.setLineDash([]); };
    pl(R.tMed, BCOL.TQQQ, 1.2, [5, 3]); pl(R.qMed, BCOL.QQQ, 1.2, [5, 3]); pl(R.fan.map((f) => f[2]), '#FF9800', 2);
    pl(R.contrib, T.axis, 1, [2, 3]);
    // legend
    g.textAlign = 'left'; g.font = '11px Geist, system-ui'; let lx = L + 8; const ly = top + 12;
    [['Median', '#FF9800'], ['25–75th pct', 'rgba(255,152,0,0.45)'], ['5–95th pct', 'rgba(255,152,0,0.2)'], ['QQQ median', BCOL.QQQ], ['TQQQ median', BCOL.TQQQ], [R.C > 0 ? 'Contributed' : 'Starting balance', T.axis]].forEach(([l, c]) => { g.fillStyle = c; g.fillRect(lx, ly - 8, 12, 8); g.fillStyle = T.axis; g.fillText(l, lx + 16, ly); lx += g.measureText(l).width + 34; });
    cv._mc = { X, M, R, L, Rr, w };
    if (!cv._hover) {
      cv._hover = true; const tip = el('mcTip');
      cv.addEventListener('mousemove', (ev) => {
        const o = cv._mc; if (!o) return; const r = cv.getBoundingClientRect(), x = ev.clientX - r.left;
        const m = Math.max(0, Math.min(o.M, Math.round(((x - o.L) / (o.w - o.L - o.Rr)) * o.M))), f = o.R.fan[m], yr = m / 12;
        tip.innerHTML = `<div class="d">Year ${yr.toFixed(1)} · contributed ${money(o.R.contrib[m])}</div>` + [['95th', 4], ['75th', 3], ['Median', 2], ['25th', 1], ['5th', 0]].map(([l, k]) => `<div>${l} ${money(f[k])}</div>`).join('') +
          `<div style="margin-top:4px"><b style="color:${BCOL.QQQ}">QQQ</b> median ${money(o.R.qMed[m])}</div><div><b style="color:${BCOL.TQQQ}">TQQQ</b> median ${money(o.R.tMed[m])}</div>`;
        tip.hidden = false; const tw = tip.offsetWidth; tip.style.left = (x + 12 + tw > r.width ? x - tw - 12 : x + 12) + 'px'; tip.style.top = '10px';
      });
      cv.addEventListener('mouseleave', () => { tip.hidden = true; });
    }
  }

  function renderValidation() {
    const C = D.checks, M = D.meta;
    const lc = C.live_agreement_continuous, lt = C.live_agreement_tv_matched;
    const f = (k, r) => { const v = C[k] && C[k][r]; return v ? `${pct(v[0])} / ${pct(v[1])}` : '—'; };
    const yrs = (o) => Object.entries(o.mismatch_by_year || {}).map(([y, n]) => `${y}: ${n}`).join(', ') || 'none';
    el('btValid').innerHTML = `
      <h3>Does it track the live dashboard?</h3>
      <ul>
        <li><b>Live-chart-matched mode:</b> ${lt.agree.toLocaleString()} of ${lt.days.toLocaleString()} days (${(100 * lt.agree / lt.days).toFixed(1)}%) carry the same allocation as the live tab's own engine since ${lt.first}. Remaining differences: ${yrs(lt)} — the first 200 trading days after TQQQ's launch, where the live chart is still warming up and this backtest keeps the long-history signal.</li>
        <li><b>Continuous mode:</b> ${lc.agree.toLocaleString()} of ${lc.days.toLocaleString()} days (${(100 * lc.agree / lc.days).toFixed(1)}%). Every difference is the channel-stop latch (TQQQ vs BOXX): the ChartPrime channel is path-dependent, so its state depends on where history starts. Differences fade out by 2019 (${yrs(lc)}).</li>
      </ul>
      <h3>Reference results (no costs, CAGR / max drawdown)</h3>
      <table><tr><th>Mode</th><th>Jul 2013 – Oct 2026</th><th>1998 – 2012</th><th>Full 1953 – now</th></tr>
      ${['1H_tv_same', '1H_tv_next', '1H_cont_same', '1H_cont_next', '1D_cont_same', '1D_cont_next'].map((k) => `<tr><td>${k.replace('1H', '1H replay').replace('1D', 'Daily').replace('_tv', ' · live-matched').replace('_cont', ' · continuous').replace('_same', ' · same close').replace('_next', ' · next close')}</td><td>${f(k, '2013-07-22..2026-10-29')}</td><td>${f(k, '1998..2012')}</td><td>${f(k, '1953..')}</td></tr>`).join('')}
      </table>
      <p>Prior project study (1998-analog stress test, daily close, channels from 1995): 83.0% same-close and 32.8% next-close for Jul 2013 – Oct 2026, versus 80.6% and 31.2% here (daily, continuous). For 1998–2012 that study found 33.4% same-close; this build finds 23.0%. The inputs agree closely (daily return correlation 0.94–1.00 by fund), and 90% of 1997–2009 allocation days match. The gap comes from channel-latch days (start-date dependence) and from SQQQ-vs-TLT RSI ties that flip on slightly different long-bond yield inputs. Treat pre-2010 results as model-sensitive.</p>
      <h3>Data sources and models</h3>
      <table class="prov"><tr><th>Input</th><th>Real data used</th><th>Before that (simulated)</th></tr>
        <tr><td>TQQQ</td><td>Actual from ${M.launch.TQQQ} (dashboard feed)</td><td>networthcast repo synthetic: 3× Nasdaq-100 daily less 0.88% fee and 2× (short rate + 0.65%) financing. Highs/lows from Nasdaq-100 bars back to ${M.hl_start}; none before (close-only).</td></tr>
        <tr><td>SQQQ</td><td>Actual from ${M.launch.SQQQ}</td><td>Repo inverse model (−3× Nasdaq-100 plus interest on cash, fitted to real SQQQ).</td></tr>
        <tr><td>GLD</td><td>Actual from Nov 2004 (repo) / ${M.launch.GLD} (dashboard)</td><td>Repo: gold price less 0.40%. Daily Frankfurt fix 1968–1998; monthly London prices interpolated before 1968 (gold pegged near $35).</td></tr>
        <tr><td>TLT</td><td>Actual price from ${M.launch.TLT}, plus income at the long Treasury yield</td><td>25-year par bond priced daily off FRED yields: 30-yr (1977+), 20-yr (1962–77), monthly long-term government yield interpolated (1953–61).</td></tr>
        <tr><td>TMF</td><td>Actual from ${M.launch.TMF}</td><td>3× the modeled long bond less 2× T-bill financing and 1.00% fee, plus ${(M.calibration_drift.TMF * 100).toFixed(2)}%/yr drift calibrated to real TMF.</td></tr>
        <tr><td>TECL</td><td>Actual from ${M.launch.TECL}</td><td>3× Nasdaq-100 (repo series) as a tech proxy, less financing and 0.95% fee, plus ${(M.calibration_drift.TECL * 100).toFixed(2)}%/yr drift calibrated to real TECL. A proxy, not the S&amp;P tech sector.</td></tr>
        <tr><td>QUAL</td><td>Actual from ${M.launch.QUAL} + 1.4%/yr dividends</td><td>Repo SPY total return (S&amp;P 500 total return from 1988; price-only + 3.5%/yr dividend estimate before).</td></tr>
        <tr><td>BIL</td><td>Signal: actual price from ${M.launch.BIL}. Return: T-bill − 0.135%/yr throughout.</td><td>Signal: monthly sawtooth that mimics BIL's price-only distributions.</td></tr>
        <tr><td>Cash (BOXX)</td><td>Actual from ${M.launch.BOXX}</td><td>3-month T-bill (FRED) − 0.135%/yr.</td></tr>
        <tr><td>Benchmarks</td><td colspan="2">TQQQ and QQQ buy-and-hold use the same spliced series (synthetic before launch). SPY is the repo series (price-only before 1988).</td></tr>
      </table>
      <p>Data-quality fix: the repo's 1971–1985 Nasdaq prefix has a few one-day bad prints that FRED's Nasdaq Composite doesn't show (e.g. 1972-04-13 −13.5% then +16.2%). On ${M.patched_days.length} days where they differ by more than 3 points, the Composite's move is used (TQQQ ×3, SQQQ ×−3). Repo snapshot ${esc(M.repo_commit)}; data through ${M.end}.</p>
      <h3>How returns are computed</h3>
      <ul>
        <li>Allocations come from the same Python port of your Pine script that drives the live tab (unchanged logic: 200/20-day MAs, RSI10 80/31, 2% armed trailing stop, OB bottom-2 basket, DIP 25% basket, SQQQ-vs-TLT, ChartPrime daily channel stop → BOXX).</li>
        <li>Holdings drift inside a sleeve and are rebalanced only when the target allocation changes. Costs are charged per unit of portfolio traded at each change.</li>
        <li>Same close assumes you trade at the close that generated the signal, which a live account can't quite do. Next close is a full one-day delay. Real trading falls between the two, usually nearer next close.</li>
        <li>No taxes, no slippage beyond the cost setting, no fund closures or limit-down events. Hypothetical results only, not investment advice.</li>
      </ul>`;
  }
})();
