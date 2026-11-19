/* TQQQ FTLT dashboard — renders site/data.json (built by scripts/build_data.py). No strategy
   math happens here except display formatting; all values come from the Python Pine port. */
(function () {
  'use strict';
  const C = {
    green: '#4CAF50', lime: '#00E676', red: '#FF5252', orange: '#FF9800', purple: '#9C27B0',
    blue: '#2196F3', teal: '#089981', yellow: '#FFEB3B', fuchsia: '#E040FB', aqua: '#00BCD4',
    gray: '#787B86', silver: '#B2B5BE', white: '#FFFFFF',
    rsi80: '#2FA84F', ma200: '#B23AC9', ma20: 'rgba(154,160,172,0.85)', rsi31: '#D23B3B',
    chTop: '#337c4f', chBot: '#a52d2d', chCen: '#787b86',
  };
  const rgba = (hex, a) => {
    const h = hex.replace('#', '');
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  // Pine color.new(c, transp) -> alpha = 1 - transp/100
  const tr = (hex, transp) => rgba(hex, 1 - transp / 100);
  // Pine str.tostring(x, "#.#") / "#.##"
  const f1 = (x) => (x == null ? 'NaN' : String(Math.round(x * 10) / 10));
  const f2 = (x) => (x == null ? 'NaN' : String(Math.round(x * 100) / 100));
  const money = (x) => (x == null ? '—' : x.toFixed(2));
  const pctS = (x, d = 2) => (x == null ? '—' : (x > 0 ? '+' : '') + x.toFixed(d) + '%');
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const ALLOC_COLOR = {
    'TQQQ': C.green, 'TQQQ⚠': tr(C.yellow, 30), 'OB*': C.purple, 'OB⛒': C.purple,
    'TECL*': C.orange, 'SQQQ': C.red, 'TLT': C.blue, 'CASH': C.teal,
  };
  const BASE_COLOR = { TQQQ: C.green, OB: C.purple, TECL: C.orange, SQQQ: C.red, TLT: C.blue, CASH: C.teal };
  const allocLabel = (a) => (a === 'CASH' ? 'CASH (BOXX)' : a);

  // Live feed (feed.js): initial load, then in-place updates whenever the scheduled job publishes.
  let current = null, applyChart = null;
  window.FTLTFeed.loadData()
    .then(init)
    .catch((e) => { el('asOf').innerHTML = `<span class="err">Could not load data.json — ${esc(e.message)}</span>`; });
  window.FTLTFeed.onData((D) => init(D));
  window.FTLTFeed.onTick(() => { if (current) renderHeader(current, current.snapshot, current.meta); });

  function init(D) {
    const S = D.snapshot, M = D.meta;
    const idx = Object.fromEntries(D.bar_cols.map((k, i) => [k, i]));
    const bars = D.bars.map((b) => Object.fromEntries(D.bar_cols.map((k, i) => [k, b[idx[k]]])));
    current = D;
    renderHeader(D, S, M);
    renderTable(S, M);
    renderStats(S);
    renderPath(S);
    renderHistory(D.signal_history);
    renderQuotes(D.quotes);
    renderNotes(D, S, M);
    if (applyChart) applyChart(D, bars);
    else applyChart = renderChart(D, bars);
  }

  function feedText() {
    const f = window.FTLTFeed.info();
    const t = f.lastCheck ? f.lastCheck.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET' : '';
    if (f.ok) return `<span class="feed ok" title="The page checks the live feed every minute and updates in place. The feed updates at 3:00 PM ET (2:00 PM CT) and again after the close on weekdays.">Live feed · checked ${t}</span>`;
    return `<span class="feed off" title="${esc(f.err || '')}">Feed unreachable${f.dataSrc === 'bundled' ? ' · showing bundled snapshot' : ''}${t ? ' · retried ' + t : ''}</span>`;
  }

  // ------------------------------------------------------------------ header
  function renderHeader(D, S, M) {
    const fetched = new Date(M.fetched_at);
    const ageH = (Date.now() - fetched.getTime()) / 36e5;
    const ageTxt = ageH < 1 ? `${Math.max(1, Math.round(ageH * 60))}m ago` : ageH < 48 ? `${Math.round(ageH)}h ago` : `${Math.round(ageH / 24)}d ago`;
    const stale = ageH > 30;
    el('asOf').innerHTML =
      `<span class="pill ${M.intraday ? 'live' : 'close'}${stale ? ' stale' : ''}"><span class="dot"></span>${M.intraday ? 'Intraday · in-progress daily bar' : 'Last daily close'}</span>` +
      `<span>Data as of <b>${esc(M.fetched_at_et)}</b> (${ageTxt})</span>` +
      `<span>· bar ${esc(M.last_bar)}</span>` + (stale ? `<span class="pill stale">Stale — refresh pending</span>` : '') + feedText();
    const chg = S.close - S.prev_close, chgp = chg / S.prev_close * 100;
    const col = ALLOC_COLOR[S.alloc] || C.gray;
    el('headQuote').innerHTML =
      `<span class="sig">TQQQ</span><span class="px">${money(S.close)}</span>` +
      `<span class="chg ${chg >= 0 ? 'up' : 'down'}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)} (${pctS(chgp)})</span>` +
      `<span class="sig">Signal<b style="background:${col}">${esc(allocLabel(S.alloc))}</b></span>`;
  }

  // ------------------------------------------------------------------ Pine allocation table
  function renderTable(S, M) {
    const P = M.params;
    const base = S.alloc_base;
    const tqqq_alloc = base === 'TQQQ', ob_alloc = base === 'OB', tecl_alloc = base === 'TECL';
    const tlt_alloc = base === 'TLT', sqqq_alloc = base === 'SQQQ', cash_alloc = base === 'CASH';
    const bull = S.close > S.ma200;
    const rows = [];
    const cell = (txt, o = {}) => ({ txt, ...o });
    rows.push({ cls: 'hdr', cells: [cell('Ticker'), cell('Alloc %')] });
    rows.push({ cls: 'sig', cells: [cell('SIGNAL →', { fg: C.yellow, bg: tr(C.gray, 50) }), cell(allocLabel(S.alloc), { fg: C.white, bg: ALLOC_COLOR[S.alloc] })] });

    let tqqqTxt = '0';
    if (tqqq_alloc) tqqqTxt = bull && S.pct_to_ma200_pine != null ? `100 (-${f1(S.pct_to_ma200_pine)}% to 200MA)` : '100';
    rows.push({ cells: [cell('TQQQ', { fg: C.white }), cell(tqqqTxt, { fg: tqqq_alloc ? C.lime : C.gray, bg: tqqq_alloc ? tr(C.green, 60) : null, v: 1 })] });

    const ob_preview = (S.ts_armed || S.ts_touch) && !S.ts_filled;
    const ob_show = ob_alloc || ob_preview;
    const obHdrFg = ob_alloc ? C.fuchsia : S.ts_touch ? C.orange : ob_preview ? C.yellow : C.white;
    const obHdrBg = ob_alloc ? tr(C.purple, 60) : S.ts_touch ? tr(C.orange, 75) : ob_preview ? tr(C.yellow, 80) : null;
    const obLabel = `${S.ob1} 50% / ${S.ob2} 50%`;
    rows.push({ cells: [cell(ob_alloc ? 'OB ★ (RSI>80)' : ob_preview ? 'OB Branch (PREVIEW)' : 'OB Branch', { fg: obHdrFg, bg: obHdrBg }),
      cell(ob_show ? obLabel : '—', { fg: ob_alloc ? C.lime : S.ts_touch ? C.orange : ob_preview ? C.yellow : C.gray, bg: obHdrBg, sm: 1 })] });

    const tsStatusColor = { 'FILLED → FLIP': C.red, 'LIKELY FILLED': C.orange, 'ARMED (new)': C.yellow, 'RATCHETING ↑': C.lime, 'ARMED': C.aqua }[S.ts_status] || C.gray;
    const tsOn = S.ts_armed || S.ts_filled;
    const tsBg = tsOn ? tr(tsStatusColor, 75) : ob_alloc ? tr(C.purple, 82) : null;
    const tsTxt = tsOn ? `${S.ts_status} @ ${f2(S.ts_stop)}  (-${f1(P.trailPct)}%)` : S.ts_status;
    rows.push({ cells: [cell('└ Trail Stop', { fg: tsOn ? tsStatusColor : C.gray, bg: tsBg, sm: 1 }), cell(tsTxt, { fg: tsOn ? tsStatusColor : C.gray, bg: tsBg, sm: 1, v: 1 })] });

    const obRowBg = ob_alloc ? tr(C.purple, 82) : S.ts_touch ? tr(C.orange, 85) : ob_preview ? tr(C.yellow, 88) : null;
    const obRowFg = ob_alloc ? C.fuchsia : S.ts_touch ? C.orange : ob_preview ? C.yellow : C.gray;
    const obPctFg = ob_alloc ? C.lime : S.ts_touch ? C.orange : ob_preview ? C.yellow : C.gray;
    rows.push({ cells: [cell('└ ' + (ob_show ? S.ob1 : '—'), { fg: obRowFg, bg: obRowBg, sm: 1 }), cell(ob_show ? '50%' : '—', { fg: obPctFg, bg: obRowBg, sm: 1, v: 1 })] });
    rows.push({ cells: [cell('└ ' + (ob_show ? S.ob2 : '—'), { fg: obRowFg, bg: obRowBg, sm: 1 }), cell(ob_show ? '50%' : '—', { fg: obPctFg, bg: obRowBg, sm: 1, v: 1 })] });

    // DIP (TECL) branch — fixed 25% basket TECL/TMF/GLD/QUAL (Oct-30 display fix: QUAL never 0%)
    const teclBg = tecl_alloc ? tr(C.orange, 60) : null;
    rows.push({ cells: [cell(tecl_alloc ? 'TECL ★ (Dip)' : 'TECL (Dip)', { fg: tecl_alloc ? C.orange : C.white, bg: teclBg }), cell(tecl_alloc ? '25%' : '0', { fg: tecl_alloc ? C.lime : C.gray, bg: teclBg, v: 1 })] });
    const bsBg = tecl_alloc ? tr(C.orange, 82) : null;
    const hot = S.uvxy_hot;
    for (const t of ['TMF', 'GLD', 'QUAL']) {
      const lbl = '└ ' + t + (tecl_alloc && hot && t !== 'QUAL' ? ' (BSW↑)' : ' (BSW)');
      const fg = tecl_alloc ? (hot && t !== 'QUAL' ? C.fuchsia : C.silver) : C.gray;
      rows.push({ cells: [cell(lbl, { fg, bg: bsBg, sm: 1 }), cell(tecl_alloc ? '25%' : '—', { fg: tecl_alloc ? C.lime : C.gray, bg: bsBg, sm: 1, v: 1 })] });
    }

    const sw = S.sqqq_wins;
    const sqBg = sqqq_alloc ? tr(C.red, 60) : sw ? tr(C.red, 85) : null;
    rows.push({ cells: [cell(sw ? 'SQQQ ★' : 'SQQQ', { fg: sw ? '#ff6666' : C.white, bg: sqBg }), cell(sqqq_alloc ? '100' : '0', { fg: sqqq_alloc ? C.lime : sw ? '#ff6666' : C.gray, bg: sqBg, v: 1 })] });
    const tlBg = tlt_alloc ? tr(C.blue, 60) : !sw ? tr(C.blue, 85) : null;
    rows.push({ cells: [cell(!sw ? 'TLT ★' : 'TLT', { fg: !sw ? '#4da6ff' : C.white, bg: tlBg }), cell(tlt_alloc ? '100' : '0', { fg: tlt_alloc ? C.lime : !sw ? '#4da6ff' : C.gray, bg: tlBg, v: 1 })] });

    // CASH (channel risk) — proceeds held in BOXX (script labels it BIL)
    const cashBg = cash_alloc ? tr(C.teal, 55) : S.ch_risk_active ? tr(C.teal, 80) : null;
    rows.push({ cells: [cell(S.ch_risk_active ? 'CASH ★ (Downward Ch) – BOXX' : 'CASH (Ch Risk) – BOXX', { fg: cash_alloc || S.ch_risk_active ? C.aqua : C.gray, bg: cashBg }),
      cell(cash_alloc ? '100 (BOXX)' : S.ch_risk_active ? '→ OB (RSI>80)' : '0', { fg: cash_alloc ? C.lime : S.ch_risk_active ? C.aqua : C.gray, bg: cashBg, v: 1 })] });

    rows.push({ cells: [cell('TQQQ RSI', { fg: C.gray }), cell(`${f1(S.rsi)} | QQQ: ${f1(S.qqq_rsi)}`, { fg: C.gray, v: 1 })] });
    rows.push({ cells: [cell('SQQQ RSI', { fg: C.gray }), cell(`${f1(S.sqqq_rsi)} | TLT: ${f1(S.tlt_rsi)}`, { fg: sw ? '#ff6666' : '#4da6ff', v: 1 })] });
    rows.push({ cells: [cell('UVXY RSI14', { fg: C.gray }), cell(`${f1(S.uvxy_rsi)}${hot ? ' ↑ HOT' : ' cool'}`, { fg: hot ? C.fuchsia : C.gray, v: 1 })] });
    const chTxt = !P.ch_risk_on ? 'OFF' : !S.ch_above ? 'N/A (<200MA)' : S.ch_stopped ? (S.ch_fully_below_raw ? 'De-risk → CASH (candle fully below channel)' : 'De-risk → CASH (bearish break/channel)') : 'In TQQQ (bullish — held until bearish event)';
    const chFg = !P.ch_risk_on || !S.ch_above ? C.gray : S.ch_stopped ? C.aqua : C.lime;
    rows.push({ cells: [cell('Channel Risk', { fg: C.gray }), cell(chTxt, { fg: chFg, wrap: 1 })] });

    el('allocTable').innerHTML = rows.map((r) => `<tr class="${r.cls || ''}">` + r.cells.map((c) => {
      const st = [c.fg ? `color:${c.fg}` : '', c.bg ? `background:${c.bg}` : ''].filter(Boolean).join(';');
      const cls = [c.sm ? 'sm' : '', c.v ? 'v' : '', c.wrap ? 'wrap' : ''].filter(Boolean).join(' ');
      return `<td class="${cls}" style="${st}">${esc(c.txt)}</td>`;
    }).join('') + '</tr>').join('');
    el('tableNote').innerHTML = `${M.intraday ? 'Intraday values — today\'s daily bar is still forming; the signal can change before the close.' : 'Values from the last completed daily bar.'} Channel stops ON; cash proceeds held in BOXX.`;
  }

  // ------------------------------------------------------------------ stats
  function renderStats(S) {
    const c = S.close;
    const items = [];
    const add = (l, v, d, n, hot) => items.push({ l, v, d, n, hot });
    add('200MA (regime)', money(S.ma200), S.dist.ma200, c > S.ma200 ? 'Above → bull side' : 'Below → bear side', true);
    add('20MA (recovery)', money(S.ma20), S.dist.ma20, c > S.ma20 ? 'Above 20MA' : 'Below 20MA');
    add('Price @ RSI80', money(S.rsi80_line), S.dist.rsi80, 'OB trail stop arms above');
    add('Price @ RSI31', money(S.rsi31_raw), S.dist.rsi31, 'Dip (TECL) fires below, <200MA', true);
    add('RSI31 line (clamped)', money(S.rsi31_line), S.dist.rsi31_line, 'min(RSI31, cloud top) — plotted');
    if (S.ch_active) {
      add('Channel top (engine)', money(S.ch_top), S.dist.ch_top, 'Break Up if daily low > top');
      add('Channel bottom (engine)', money(S.ch_bottom), S.dist.ch_bottom, 'Break Down if daily high < bottom', true);
    } else {
      const br = S.ch_last_break;
      const dn = S.ch_drawn_now || {};
      add('Channel', 'No active', null, br ? `Broke ${br.dir} ${br.date}; waiting for new pivot channel` : 'Waiting for first channel');
      add('Drawn channel today', dn.bot != null ? `${money(dn.bot)}–${money(dn.top)}` : '—', null, `Live ${S.ch_live && S.ch_live.bull ? 'bull' : 'bear'} channel born ${S.ch_live ? S.ch_live.born_date : '—'} (display only)`);
    }
    add('Trailing stop', S.ts_armed || S.ts_filled ? money(S.ts_stop) : 'Disarmed', S.ts_armed ? S.dist.trail : null, S.ts_status);
    const spread = S.sqqq_rsi - S.tlt_rsi;
    add('SQQQ vs TLT RSI', `${f1(S.sqqq_rsi)} / ${f1(S.tlt_rsi)}`, null, `${spread >= 0 ? 'SQQQ' : 'TLT'} leads by ${Math.abs(spread).toFixed(1)}`);
    add('TQQQ RSI10', f1(S.rsi), null, `OB > 80 · Dip < 31 · QQQ ${f1(S.qqq_rsi)}`);
    el('stats').innerHTML = items.map((s) => {
      const dcol = s.d == null ? '' : s.d >= 0 ? 'up' : 'down';
      const dtxt = s.d == null ? '&nbsp;' : `${pctS(s.d)} from price`;
      return `<div class="stat${s.hot ? ' hot' : ''}"><div class="l">${esc(s.l)}</div><div class="v">${esc(s.v)}</div><div class="d ${dcol}">${dtxt}</div><div class="n">${esc(s.n)}</div></div>`;
    }).join('');
  }

  // ------------------------------------------------------------------ decision path (mirrors Pine allocation tree)
  function renderPath(S) {
    const steps = [];
    const c = S.close;
    const bull = c > S.ma200;
    steps.push({ q: 'Close > 200MA?', s: `${money(c)} vs ${money(S.ma200)}`, a: bull ? 'Yes → bull side' : 'No → bear side' });
    let final = S.alloc;
    if (bull) {
      steps.push({ q: 'Trailing stop filled?', s: S.ts_status, a: S.ts_filled ? 'Yes → OB*' : 'No' });
      if (!S.ts_filled) {
        const ob = S.rsi > 80 || S.ts_armed;
        steps.push({ q: 'RSI10 > 80 or stop armed?', s: `RSI ${f1(S.rsi)}`, a: ob ? (S.ts_armed ? 'Armed → TQQQ⚠' : 'Yes → TQQQ') : 'No → TQQQ' });
        if (!ob) steps.push({ q: 'Channel stop latched? (overlay)', s: S.ch_stopped ? 'bearish event latched' : 'no bearish latch', a: S.ch_risk_active ? (S.rsi > 80 ? 'Yes → OB⛒' : 'Yes → CASH (BOXX)') : 'No → keep TQQQ' });
      }
    } else {
      const dip = S.rsi < 31;
      steps.push({ q: 'TQQQ RSI10 < 31?', s: `RSI ${f1(S.rsi)}`, a: dip ? 'Yes → TECL* dip basket' : 'No' });
      if (!dip) {
        const above20 = c > S.ma20;
        steps.push({ q: 'Close > 20MA?', s: `${money(c)} vs ${money(S.ma20)}`, a: above20 ? 'Yes → TQQQ' : 'No' });
        if (!above20) steps.push({ q: 'SQQQ RSI ≥ TLT RSI?', s: `${f1(S.sqqq_rsi)} vs ${f1(S.tlt_rsi)}`, a: S.sqqq_wins ? 'Yes → SQQQ' : 'No → TLT' });
      }
    }
    const col = ALLOC_COLOR[final] || C.gray;
    el('path').innerHTML = steps.map((st, i) => `<li><span class="i">${i + 1}</span><span class="q">${esc(st.q)}<small>${esc(st.s)}</small></span><span class="a">${esc(st.a)}</span></li>`).join('') +
      `<li class="final"><span class="i">=</span><span class="q">Signal${S.alloc === 'TECL*' ? '<small>TECL / TMF / GLD / QUAL — 25% each</small>' : S.alloc_base === 'OB' ? `<small>${esc(S.ob1)} 50% / ${esc(S.ob2)} 50%</small>` : ''}</span><span class="a" style="background:${col};color:#fff">${esc(allocLabel(final))}</span></li>`;
  }

  function renderHistory(H) {
    const rows = H.slice().reverse();
    el('hist').innerHTML = '<thead><tr><th>Date</th><th>Signal</th><th>TQQQ close</th></tr></thead><tbody>' +
      rows.map((r) => `<tr><td>${r.date}</td><td><span class="tag" style="background:${ALLOC_COLOR[r.alloc] || BASE_COLOR[r.base] || C.gray}">${esc(allocLabel(r.alloc))}</span></td><td>${money(r.close)}</td></tr>`).join('') + '</tbody>';
  }

  function renderQuotes(Q) {
    const order = [['TQQQ', 'core'], ['QQQ', 'ref'], ['TECL', 'dip'], ['TMF', 'dip/OB'], ['GLD', 'dip/OB'], ['QUAL', 'dip'], ['SQQQ', 'bear'], ['TLT', 'bear'], ['UVXY', 'gauge'], ['BIL', 'OB'], ['BOXX', 'cash']];
    el('quotes').innerHTML = order.filter(([s]) => Q[s]).map(([s, role]) => {
      const q = Q[s];
      return `<div class="q"><div class="s">${s}<span>${role}</span></div><div class="p">${money(q.close)}</div><div class="c ${q.chg_pct >= 0 ? 'up' : 'down'}">${pctS(q.chg_pct)}</div></div>`;
    }).join('');
  }

  function renderNotes(D, S, M) {
    const V = M.validation;
    let vt = '';
    if (V) {
      const keys = [['Signal', 'alloc'], ['TQQQ price', 'c'], ['TQQQ RSI10', 'rsi'], ['QQQ RSI10', 'qqq_rsi'], ['SQQQ RSI10', 'sqqq_rsi'], ['TLT RSI10', 'tlt_rsi'], ['UVXY RSI14', 'uvxy_rsi'], ['200MA', 'ma200'], ['20MA', 'ma20'], ['RSI80 line', 'rsi80_line'], ['RSI31 line', 'rsi31_line']];
      vt = `<h3>Validation vs TradingView screenshot (Oct 30 2026, ~12:13 UTC-5)</h3>
      <p>Oct 30 daily bar rebuilt from 5-minute data through ${esc(V.until_utc)} UTC, then run through the same engine.</p>
      <table><tr><th>Metric</th><th>Screenshot</th><th>Dashboard engine</th><th>Diff</th></tr>` +
        keys.map(([l, k]) => {
          const e = V.expected[k], g = V.computed[k];
          const diff = typeof e === 'number' && typeof g === 'number' ? (g - e).toFixed(2) : (e === g ? 'match' : 'differs');
          return `<tr><td>${l}</td><td>${typeof e === 'number' ? e : esc(e)}</td><td>${typeof g === 'number' ? g.toFixed(2) : esc(g)}</td><td>${diff}</td></tr>`;
        }).join('') + '</table>';
    }
    el('notes').innerHTML = `
      <h3>What this is</h3>
      <ul>
        <li>A display-only port of the Pine v6 script. Strategy logic is unchanged; the Python engine reproduces SMA200/SMA20, Wilder RSI10 and UVXY RSI14, the RSI80/RSI31 price projections and clamps, cloud top, the overbought trailing-stop state machine, bottom-2 RSI OB basket, SQQQ-vs-TLT selector, the ChartPrime daily channel engine, the channel-risk latch and the allocation tree.</li>
        <li>Display fixes only: the DIP (TECL) branch shows TECL / TMF / GLD / QUAL at 25% each regardless of UVXY; the cash row is labelled BOXX (the script calls it BIL/CASH).</li>
        <li>Values follow <b>1-hour chart semantics</b>, matching your TradingView 1h chart: the script reads daily values with lookahead, so the RSI projections are based on the current daily close and the state machines run on every hourly bar of the day. On a 1D chart the same script would show RSI80 ≈ ${money(S.rsi80_line_1d)} and RSI31 ≈ ${money(S.rsi31_raw_1d)} today (signal ${esc(S.alloc_1d)}).</li>
        <li>Data basis: <b>${esc(M.basis)}</b>, fetched ${esc(M.fetched_at_et)}. ${M.intraday ? 'Intraday values can change until the 4:00 PM ET close.' : ''} The page checks the feed every minute and updates in place, with no reload. The feed reruns this engine on fresh prices once at 3:00 PM ET (2:00 PM CT), so you can check the signal before the close, and again after the 4:00 PM close. GitHub's scheduler can run late, so check the time shown above.</li>
      </ul>
      <h3>Chart drawing notes</h3>
      <ul>
        <li>Channels are drawn like the Pine line objects: start = birth date minus the look-back in <i>calendar</i> days, slope advanced once per daily bar, last ${M.params.ch_history} channels kept, live channel extended right. Break checks use the engine boundaries shown in the stats panel.</li>
        <li>The RSI80 projection is excluded from autoscale by default so candles stay readable; use “Fit RSI80” to include it. Line colours are brightened slightly for the dark background.</li>
        <li>With “High/Low” break style, the script's “entire candle below channel” trigger matches the break-down condition exactly, so it never fires on its own. This mirrors the Pine.</li>
      </ul>
      ${vt}
      <h3>Known gaps</h3>
      <ul>
        <li>Pivot tie-breaking (two identical daily highs/lows) follows the usual TradingView rule (earlier bar wins). Ties are rare and only affect channel timing.</li>
        <li>Prices come from ${esc(M.source || 'Perplexity Finance')}, not TradingView's feed. Small differences in history (especially UVXY reverse-split history) can shift RSI by a few tenths.</li>
      </ul>`;
  }

  // ------------------------------------------------------------------ chart
  function renderChart(D, bars) {
    const LW = window.LightweightCharts;
    const container = el('chart');
    const chart = LW.createChart(container, {
      autoSize: true,
      layout: { background: { type: 'solid', color: '#12151b' }, textColor: '#9aa1ad', fontFamily: "'Geist', system-ui, sans-serif", fontSize: 11 },
      grid: { vertLines: { color: 'rgba(42,48,60,0.45)' }, horzLines: { color: 'rgba(42,48,60,0.45)' } },
      rightPriceScale: { borderColor: '#2c3340', scaleMargins: { top: 0.06, bottom: 0.16 } },
      timeScale: { borderColor: '#2c3340', rightOffset: 12, barSpacing: 7, minBarSpacing: 0.5 },
      crosshair: { mode: LW.CrosshairMode.Normal },
      localization: { priceFormatter: (p) => p.toFixed(2) },
    });
    // light / dark theme (display only)
    const lwTheme = () => {
      const light = document.documentElement.getAttribute('data-theme') === 'light';
      const gridC = light ? 'rgba(200,205,214,0.6)' : 'rgba(42,48,60,0.45)', bord = light ? '#d3d7de' : '#2c3340';
      chart.applyOptions({
        layout: { background: { type: 'solid', color: light ? '#ffffff' : '#12151b' }, textColor: light ? '#5c6370' : '#9aa1ad' },
        grid: { vertLines: { color: gridC }, horzLines: { color: gridC } },
        rightPriceScale: { borderColor: bord }, timeScale: { borderColor: bord },
      });
    };
    lwTheme();
    window.addEventListener('themechange', lwTheme);
    let n = bars.length;

    const vol = chart.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.86, bottom: 0 } });
    const setVol = () => vol.setData(bars.map((b) => ({ time: b.date, value: b.v, color: b.c >= b.o ? 'rgba(38,166,154,0.35)' : 'rgba(239,83,80,0.35)' })));
    setVol();

    const candles = chart.addCandlestickSeries({
      upColor: '#089981', downColor: '#F23645', borderUpColor: '#089981', borderDownColor: '#F23645', wickUpColor: '#089981', wickDownColor: '#F23645',
    });
    const setCandles = () => candles.setData(bars.map((b) => ({ time: b.date, open: b.o, high: b.h, low: b.l, close: b.c })).concat(D.future.map((t) => ({ time: t }))));
    setCandles();

    const state = { channels: true, cloud: true, zones: true, patterns: false, fitall: false };
    const lines = [];
    const setLine = (s) => s.setData(bars.map((b) => (b[s.__key] == null ? { time: b.date } : { time: b.date, value: b[s.__key] })));
    const line = (key, color, width, title, extra = {}) => {
      const s = chart.addLineSeries({ color, lineWidth: width, title: '', priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false, ...extra });
      s.__key = key;
      setLine(s);
      lines.push(s);
      return s;
    };
    const rsi80 = line('rsi80', C.rsi80, 1, 'RSI80', { autoscaleInfoProvider: (orig) => (state.fitall ? orig() : null) });
    const ma200 = line('ma200', C.ma200, 1, '200MA');
    const ma20 = line('ma20', C.ma20, 1, '20MA');
    const rsi31 = line('rsi31', C.rsi31, 1, 'RSI31');
    const trail = line('trail', C.red, 2, 'Trail', { lastValueVisible: false });

    // markers (Pine plotshape equivalents)
    const SIG = {
      OB: { shape: 'square', position: 'aboveBar', color: C.purple },
      TECL: { shape: 'arrowUp', position: 'belowBar', color: C.orange },
      TLT: { shape: 'circle', position: 'belowBar', color: C.blue },
      SQQQ: { shape: 'circle', position: 'belowBar', color: C.red },
      TQQQ: { shape: 'arrowUp', position: 'belowBar', color: C.green },
      CASH: { shape: 'circle', position: 'belowBar', color: C.teal },
    };
    const buildMarkers = () => {
      const out = [];
      for (const m of D.markers) {
        if (m.kind === 'signal') out.push({ time: m.date, ...SIG[m.base], text: m.text === 'CASH' ? 'CASH' : m.text, size: 1 });
        else if (m.kind === 'break_up') out.push({ time: m.date, shape: 'arrowUp', position: 'belowBar', color: '#3fa265', text: 'Break Up', size: 0.6 });
        else if (m.kind === 'break_down') out.push({ time: m.date, shape: 'arrowDown', position: 'aboveBar', color: '#d04848', text: 'Break Down', size: 0.6 });
        else if (m.kind === 'below_ch') out.push({ time: m.date, shape: 'arrowDown', position: 'aboveBar', color: '#7a1f1f', text: 'Below Ch', size: 0.6 });
        else if (state.patterns) {
          const above = m.kind === 'ihammer' || m.kind === 'breng';
          out.push({ time: m.date, shape: above ? 'arrowDown' : 'arrowUp', position: above ? 'aboveBar' : 'belowBar', color: m.kind === 'ihammer' ? '#5b5dc9' : m.kind === 'breng' ? '#a52d2d' : '#337c4f', text: m.text.replace(/[+-]$/, ''), size: 0.4 });
        }
      }
      out.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
      candles.setMarkers(out);
    };
    buildMarkers();

    // ---- primitive: zones (bgcolor), strategy cloud (fill), channels (lines + linefills)
    const prim = {
      _p: null,
      attached(p) { this._p = p; },
      detached() { this._p = null; },
      updateAllViews() {},
      paneViews() { return [this._view]; },
      _view: {
        zOrder: () => 'bottom',
        renderer: () => ({ draw: (target) => target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => drawOverlay(ctx, mediaSize)) }),
      },
    };
    function drawOverlay(ctx, size) {
      const ts = chart.timeScale();
      const vr = ts.getVisibleLogicalRange();
      if (!vr) return;
      const from = Math.max(0, Math.floor(vr.from) - 1), to = Math.min(n - 1, Math.ceil(vr.to) + 1);
      const X = (i) => ts.logicalToCoordinate(i);
      const Y = (p) => candles.priceToCoordinate(p);
      // zones
      if (state.zones) {
        const half = Math.max(0.5, (X(1) - X(0)) / 2);
        for (let i = from; i <= to; i++) {
          const bg = bars[i].bg;
          if (!bg) continue;
          const x = X(i);
          if (x == null) continue;
          const cols = [];
          if (bg & 1) cols.push(tr(C.purple, 92));
          if (bg & 2) cols.push(tr(C.orange, 92));
          if (bg & 4) cols.push(tr(C.teal, 90));
          for (const c of cols) { ctx.fillStyle = c; ctx.fillRect(x - half, 0, half * 2 + 0.5, size.height); }
        }
      }
      // cloud: fill(cloudTop, rsi31)
      if (state.cloud) {
        for (let i = Math.max(1, from); i <= to; i++) {
          const a = bars[i - 1], b = bars[i];
          if (a.cloudTop == null || a.rsi31 == null || b.cloudTop == null || b.rsi31 == null) continue;
          const x0 = X(i - 1), x1 = X(i);
          ctx.fillStyle = b.sqqqWins ? tr(C.red, 80) : tr(C.blue, 80);
          ctx.beginPath();
          ctx.moveTo(x0, Y(a.cloudTop)); ctx.lineTo(x1, Y(b.cloudTop)); ctx.lineTo(x1, Y(b.rsi31)); ctx.lineTo(x0, Y(a.rsi31));
          ctx.closePath(); ctx.fill();
        }
      }
      // channels
      if (state.channels) {
        const farRight = Math.max(n + D.future.length + 50, Math.ceil(vr.to) + 5);
        for (const ch of D.channels) {
          const xa = ch.x1, xb = ch.x2;
          const xEnd = ch.live ? farRight : xb;
          if (xEnd < from - 2 || xa > to + 2 + (ch.live ? 1e9 : 0)) { if (!ch.live) continue; }
          const val = (k, x) => (xb === xa ? ch.y2[k] : ch.y1[k] + (ch.y2[k] - ch.y1[k]) * (x - xa) / (xb - xa));
          const seg = (k) => [[X(xa), Y(ch.y1[k])], [X(xEnd), Y(val(k, xEnd))]];
          const fillBand = (k1, k2, color) => {
            const p = seg(k1), q = seg(k2);
            if (p.flat().some((v) => v == null) || q.flat().some((v) => v == null)) return;
            ctx.fillStyle = color; ctx.beginPath();
            ctx.moveTo(p[0][0], p[0][1]); ctx.lineTo(p[1][0], p[1][1]); ctx.lineTo(q[1][0], q[1][1]); ctx.lineTo(q[0][0], q[0][1]);
            ctx.closePath(); ctx.fill();
          };
          fillBand('top', 'mid_t', tr(C.chTop, 50));
          fillBand('bot', 'mid_b', tr(C.chBot, 50));
          const stroke = (k, color, dash) => {
            const p = seg(k);
            if (p.flat().some((v) => v == null)) return;
            ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash(dash || []);
            ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); ctx.lineTo(p[1][0], p[1][1]); ctx.stroke();
          };
          stroke('top', C.chTop); stroke('mid_t', C.chTop); stroke('cen', C.chCen, [4, 4]); stroke('mid_b', C.chBot); stroke('bot', C.chBot);
          ctx.setLineDash([]);
        }
      }
    }
    candles.attachPrimitive(prim);

    // ---- legend
    const legend = el('legend');
    let byDate = Object.fromEntries(bars.map((b, i) => [b.date, i]));
    const showLegend = (i) => {
      const b = bars[i];
      if (!b) return;
      const ch = b.c - (i > 0 ? bars[i - 1].c : b.o);
      const sty = b.c >= b.o ? 'up' : 'down';
      legend.innerHTML = `<span class="k">${b.date}</span> O <span class="${sty}">${money(b.o)}</span> H <span class="${sty}">${money(b.h)}</span> L <span class="${sty}">${money(b.l)}</span> C <span class="${sty}">${money(b.c)}</span> <span class="${ch >= 0 ? 'up' : 'down'}">${pctS(ch / (b.c - ch) * 100)}</span><br>` +
        `<span style="color:${C.rsi80}">RSI80 ${money(b.rsi80)}</span> · <span style="color:${C.ma200}">200MA ${money(b.ma200)}</span> · <span style="color:#aab">20MA ${money(b.ma20)}</span> · <span style="color:${C.rsi31}">RSI31 ${money(b.rsi31)}</span><br>` +
        `<span class="k">RSI10</span> ${b.rsi == null ? '—' : b.rsi.toFixed(1)} · <span class="k">Signal</span> <span style="color:${ALLOC_COLOR[b.alloc] || '#fff'}">${esc(allocLabel(b.alloc))}</span>${b.trail != null ? ` · <span style="color:${C.red}">Trail ${money(b.trail)}</span>` : ''}`;
    };
    showLegend(n - 1);
    chart.subscribeCrosshairMove((p) => {
      if (!p || p.time == null || byDate[p.time] == null) { showLegend(n - 1); return; }
      showLegend(byDate[p.time]);
    });

    // ---- controls
    const setRange = (r) => {
      const N = r === 'all' ? n : Number(r);
      chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - N), to: n + 12 });
    };
    document.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('[data-range]').forEach((x) => x.classList.toggle('on', x === b));
      setRange(b.dataset.range);
    }));
    document.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.toggle;
      state[k] = !state[k];
      b.classList.toggle('on', state[k]);
      b.setAttribute('aria-pressed', String(state[k]));
      if (k === 'patterns') buildMarkers();
      if (k === 'fitall') { rsi80.applyOptions({}); chart.priceScale('right').applyOptions({ autoScale: true }); }
      chart.applyOptions({});
      // force a redraw of the primitive
      candles.applyOptions({});
    }));
    setRange(126);
    window.__chart = chart;

    // In-place update from the live feed: swap the data, keep the user's zoom/scroll and toggles.
    return function apply(D2, bars2) {
      const ts = chart.timeScale();
      const vr = ts.getVisibleLogicalRange();
      const grew = bars2.length - n;
      D = D2; bars = bars2; n = bars.length;
      byDate = Object.fromEntries(bars.map((b, i) => [b.date, i]));
      setVol(); setCandles(); lines.forEach(setLine); buildMarkers();
      if (vr) ts.setVisibleLogicalRange({ from: vr.from + Math.max(0, grew), to: vr.to + Math.max(0, grew) });
      showLegend(n - 1);
      candles.applyOptions({});
    };
  }
})();
