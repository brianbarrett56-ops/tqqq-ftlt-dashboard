/* Live feed client. A scheduled GitHub Action (private repo brianbarrett56-ops/tqqq-ftlt-feed) reruns the
   unchanged Python strategy engine on Yahoo daily bars at 3:00 PM ET (2:00 PM CT) on weekdays, rebuilds
   the backtest once after the close, and publishes data.json / backtest.json / status.json to an
   unlisted gist. This script polls the small status.json once a minute and downloads a full file only
   when it has changed, so the page updates in place without reloading. If the feed can't be reached, the
   copies bundled with the page are used. No strategy math happens here. */
(function () {
  'use strict';
  const BASE = 'https://gist.githubusercontent.com/brianbarrett56-ops/571ed90e36dd9708e0b9d96a4e0b495b/raw/';
  const POLL_MS = 60 * 1000;
  const subs = { data: [], backtest: [], tick: [] };
  const cur = { data: null, backtest: null, dataSrc: null, btSrc: null };
  const st = { lastCheck: null, ok: null, err: null, status: null, wantBacktest: false };

  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
  const getJSON = (url) => fetch(url, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  const feed = (f) => withTimeout(getJSON(BASE + f + '?t=' + Date.now()), 15000);
  const genAt = (d) => (d && d.meta && d.meta.generated_at) || '';
  const btEnd = (b) => (b && b.meta && b.meta.end) || '';
  const emit = (k, v) => subs[k].forEach((fn) => { try { fn(v); } catch (e) { console.error(e); } });

  // Initial live data: the feed and the bundled copy race; whichever is newer wins.
  function loadData() {
    const a = feed('data.json').then((j) => ({ j, src: 'feed' })).catch((e) => { st.err = e.message; return null; });
    const b = getJSON('data.json').then((j) => ({ j, src: 'bundled' })).catch(() => null);
    return Promise.all([a, b]).then(([fa, fb]) => {
      const pick = fa && (!fb || genAt(fa.j) >= genAt(fb.j)) ? fa : fb;
      if (!pick) throw new Error('feed and bundled data.json both unavailable');
      st.ok = !!fa; cur.data = pick.j; cur.dataSrc = pick.src; st.lastCheck = new Date();
      start();
      return pick.j;
    });
  }

  // Backtest (1.4 MB): feed first, bundled copy if the feed fails or is older.
  function loadBacktest() {
    st.wantBacktest = true;
    return feed('backtest.json').then((j) => ({ j, src: 'feed' })).catch(() => null).then((fa) =>
      getJSON('backtest.json').then((j) => ({ j, src: 'bundled' })).catch(() => null).then((fb) => {
        const pick = fa && (!fb || btEnd(fa.j) >= btEnd(fb.j)) ? fa : fb;
        if (!pick) throw new Error('backtest.json unavailable');
        cur.backtest = pick.j; cur.btSrc = pick.src;
        return pick.j;
      }));
  }

  let timer = null, busy = false;
  function check() {
    if (busy) return;
    busy = true;
    feed('status.json').then((s) => {
      st.status = s; st.ok = true; st.err = null;
      const jobs = [];
      if (s.data_generated_at && s.data_generated_at > genAt(cur.data)) {
        jobs.push(feed('data.json').then((j) => { if (genAt(j) > genAt(cur.data)) { cur.data = j; cur.dataSrc = 'feed'; emit('data', j); } }));
      }
      if (st.wantBacktest && cur.backtest && s.backtest_end && s.backtest_end > btEnd(cur.backtest)) {
        jobs.push(feed('backtest.json').then((j) => { if (btEnd(j) > btEnd(cur.backtest)) { cur.backtest = j; cur.btSrc = 'feed'; emit('backtest', j); } }));
      }
      return Promise.all(jobs);
    }).catch((e) => { st.ok = false; st.err = e.message; })
      .finally(() => { busy = false; st.lastCheck = new Date(); emit('tick', info()); });
  }
  function start() {
    if (timer) return;
    timer = setInterval(() => { if (!document.hidden) check(); }, POLL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  }

  function info() {
    return { ok: st.ok, err: st.err, lastCheck: st.lastCheck, status: st.status, dataSrc: cur.dataSrc, btSrc: cur.btSrc };
  }

  window.FTLTFeed = {
    loadData, loadBacktest, info, check,
    onData: (fn) => subs.data.push(fn),
    onBacktest: (fn) => subs.backtest.push(fn),
    onTick: (fn) => subs.tick.push(fn),
  };
})();
