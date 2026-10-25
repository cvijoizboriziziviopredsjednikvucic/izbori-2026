// Local stand-in for the dashboard runtime: loads the CSVs in ./data,
// swaps in live Polymarket numbers when the API answers, and redraws.
(function () {
  const EVENT = 'serbia-parliamentary-election-winner-2026';
  const NAMES = {'Aleksandar Vučić – United Serbia': 'United Serbia (SNS)', 'Student List – Students Win': 'Student List'};
  const REFRESH_MS = 60000;

  // Serbian (Latin, ijekavian) dates and numbers
  d3.timeFormatDefaultLocale({
    dateTime: '%A, %e. %B %Y. %X', date: '%d.%m.%Y.', time: '%H:%M:%S', periods: ['', ''],
    days: ['nedjelja', 'ponedjeljak', 'utorak', 'srijeda', 'četvrtak', 'petak', 'subota'],
    shortDays: ['ned', 'pon', 'uto', 'sri', 'čet', 'pet', 'sub'],
    months: ['januar', 'februar', 'mart', 'april', 'maj', 'jun', 'jul', 'avgust', 'septembar', 'oktobar', 'novembar', 'decembar'],
    shortMonths: ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov', 'dec']
  });
  d3.formatDefaultLocale({decimal: ',', thousands: '.', grouping: [3], currency: ['', ' $']});
  const store = {};
  const fns = [];
  const css = getComputedStyle(document.documentElement);
  const colors = [1, 2, 3, 4, 5, 6, 7, 8].map(i => `var(--series-${i})`);

  function set(id, rows) { store[id] = {status: 'ok', data: rows, columns: rows.columns || Object.keys(rows[0] || {}), refreshing: false, meta: []}; }
  function run() { fns.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }

  window.dash = {
    colors,
    data: id => store[id] || {status: 'loading', data: [], columns: [], refreshing: false, meta: []},
    onData(fn) { fns.push(fn); try { fn(); } catch (e) { console.error(e); } },
    calc() {}, loader() {}, refresh() {}, params: () => ({}), setParams() {}, resetParams() {}, setLink() {}
  };

  function stamp(text, live) {
    const el = document.getElementById('pm-stamp');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('live', live);
  }

  async function loadFiles() {
    const ids = ['pm_odds', 'pm_history', 'turnout', 'polls', 'results_2023', 'facts', 'projections'];
    const files = {pm_odds: 'polymarket_odds', pm_history: 'polymarket_history'};
    await Promise.all(ids.map(async id => {
      try { set(id, await d3.csv(`data/${files[id] || id}.csv`)); }
      catch (e) { store[id] = {status: 'error', data: [], message: String(e)}; }
    }));
    run();
  }

  async function loadLive() {
    try {
      const ev = (await (await fetch(`https://gamma-api.polymarket.com/events?slug=${EVENT}`)).json())[0];
      const markets = ev.markets.filter(m => !/^List [A-Z]$/.test(m.groupItemTitle) && m.groupItemTitle !== 'Other');
      const odds = markets.map(m => ({
        list: m.groupItemTitle,
        yes: String(JSON.parse(m.outcomePrices)[0]),
        volume: String(Math.round(+m.volume || 0)),
        day_change: String(m.oneDayPriceChange || 0)
      })).sort((a, b) => b.yes - a.yes || b.volume - a.volume);
      set('pm_odds', odds);

      const facts = store.facts && store.facts.status === 'ok' ? store.facts.data.map(r => ({...r})) : [];
      facts.forEach(r => {
        if (r.key === 'pm_volume') r.value = String(Math.round(ev.volume));
        if (r.key === 'pm_liquidity') r.value = String(Math.round(ev.liquidity));
      });
      if (facts.length) set('facts', facts);

      const hist = [];
      await Promise.all(markets.filter(m => NAMES[m.groupItemTitle]).map(async m => {
        const tok = JSON.parse(m.clobTokenIds)[0];
        const h = (await (await fetch(`https://clob.polymarket.com/prices-history?market=${tok}&interval=max&fidelity=60`)).json()).history || [];
        h.forEach(p => hist.push({time: new Date(p.t * 1000).toISOString(), list: NAMES[m.groupItemTitle], yes: String(p.p)}));
        // end each line at the current price
        hist.push({time: new Date().toISOString(), list: NAMES[m.groupItemTitle], yes: JSON.parse(m.outcomePrices)[0]});
      }));
      if (hist.length) set('pm_history', hist);

      stamp(`Uživo s Polymarketa · ažurirano u ${d3.timeFormat('%H:%M:%S')(new Date())}, osvježava se svakog minuta.`, true);
      run();
    } catch (e) {
      console.warn('Polymarket nije dostupan, prikazujem sačuvani snimak', e);
      stamp('Polymarket trenutno nije dostupan. Prikazan je snimak sačuvan prije zatvaranja birališta.', false);
    }
  }

  let lastW = window.innerWidth;
  window.addEventListener('resize', () => { if (window.innerWidth !== lastW) { lastW = window.innerWidth; run(); } });

  document.addEventListener('DOMContentLoaded', async () => {
    await loadFiles();
    await loadLive();
    setInterval(loadLive, REFRESH_MS);
  });
})();
