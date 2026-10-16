/**
 * County Comparison Dashboard
 * - 6-axis radar chart
 * - URL shareable (?fips=26071,38055)
 */
(function() {
  'use strict';

  const MAX_COUNTIES = 5;
  const COLORS = [
    { border: '#1a3d5c', bg: 'rgba(26, 61, 92, 0.18)' },
    { border: '#e67e22', bg: 'rgba(230, 126, 34, 0.18)' },
    { border: '#27ae60', bg: 'rgba(39, 174, 96, 0.18)' },
    { border: '#8e44ad', bg: 'rgba(142, 68, 173, 0.18)' },
    { border: '#c0392b', bg: 'rgba(192, 57, 43, 0.18)' },
  ];

  const AXES = [
    { key: 'affordability', label: 'Affordability' },
    { key: 'stability', label: 'Stability' },
    { key: 'momentum', label: 'Momentum' },
    { key: 'vitality', label: 'Vitality' },
    { key: 'tax_friendliness', label: 'Tax Friendly' },
    { key: 'rental_yield', label: 'Rental Yield' },
  ];

  let countiesData = null;
  let selected = [];
  let chart = null;

  fetch('/static/counties_data.json')
    .then(r => r.json())
    .then(data => {
      countiesData = data.counties;
      console.log('[Compare] Loaded', Object.keys(countiesData).length, 'counties');
      loadFromUrl();
      bindEvents();
    })
    .catch(err => console.error('데이터 로드 실패:', err));

  function bindEvents() {
    const input = document.getElementById('countySearch');
    input.addEventListener('input', handleSearch);
    input.addEventListener('focus', handleSearch);
    document.getElementById('clearBtn').addEventListener('click', clearAll);
    document.getElementById('copyBtn').addEventListener('click', copyUrl);

    document.addEventListener('click', e => {
      if (!e.target.closest('.county-search')) {
        document.getElementById('searchResults').innerHTML = '';
      }
    });
  }

  function handleSearch(e) {
    const q = e.target.value.trim().toLowerCase();
    const resultsEl = document.getElementById('searchResults');

    if (q.length < 2) { resultsEl.innerHTML = ''; return; }

    const selectedFips = new Set(selected.map(s => s.fips));
    const matches = [];
    for (const [fips, c] of Object.entries(countiesData)) {
      if (selectedFips.has(fips)) continue;
      const label = (c.name + ' ' + c.state + ' ' + c.state_abbr).toLowerCase();
      if (label.includes(q)) {
        matches.push({ fips, ...c });
        if (matches.length >= 15) break;
      }
    }

    if (matches.length === 0) {
      resultsEl.innerHTML = '<div class="no-match">No matches</div>';
      return;
    }

    resultsEl.innerHTML = matches.map(m => `
      <div class="search-result" data-fips="${m.fips}">
        <span class="sr-name">${m.name}</span>
        <span class="sr-state">${m.state}</span>
      </div>
    `).join('');

    resultsEl.querySelectorAll('.search-result').forEach(el => {
      el.addEventListener('click', () => addCounty(el.dataset.fips));
    });
  }

  function addCounty(fips) {
    if (selected.length >= MAX_COUNTIES) {
      alert('Maximum ' + MAX_COUNTIES + ' counties');
      return;
    }
    if (selected.find(s => s.fips === fips)) return;
    const c = countiesData[fips];
    if (!c) return;
    selected.push({ fips, ...c });
    document.getElementById('countySearch').value = '';
    document.getElementById('searchResults').innerHTML = '';
    render();
  }

  function removeCounty(fips) {
    selected = selected.filter(s => s.fips !== fips);
    render();
  }

  function clearAll() { selected = []; render(); }

  function render() {
    renderSelected();
    if (selected.length >= 2) {
      renderChart();
      renderTable();
      document.getElementById('chartWrapper').style.display = '';
      document.getElementById('tableWrapper').style.display = '';
      document.getElementById('linkWrapper').style.display = '';
      document.getElementById('emptyState').style.display = 'none';
      updateUrl();
    } else {
      document.getElementById('chartWrapper').style.display = 'none';
      document.getElementById('tableWrapper').style.display = 'none';
      document.getElementById('linkWrapper').style.display = 'none';
      document.getElementById('emptyState').style.display = '';
    }
  }

  function renderSelected() {
    const el = document.getElementById('selectedCounties');
    el.innerHTML = selected.map((c, i) => `
      <div class="selected-card" style="border-left-color:${COLORS[i].border}">
        <div class="sc-info">
          <div class="sc-name">${c.name}, ${c.state_abbr}</div>
          <div class="sc-meta">$${c.home.toLocaleString()} · Score ${c.market_score}</div>
        </div>
        <button class="sc-remove" data-fips="${c.fips}">×</button>
      </div>
    `).join('');

    el.querySelectorAll('.sc-remove').forEach(btn => {
      btn.addEventListener('click', () => removeCounty(btn.dataset.fips));
    });
  }

  function renderChart() {
    const ctx = document.getElementById('compareRadar');
    if (!ctx) return;

    const datasets = selected.map((c, i) => ({
      label: c.name + ', ' + c.state_abbr,
      data: AXES.map(a => c.axes[a.key]),
      borderColor: COLORS[i].border,
      backgroundColor: COLORS[i].bg,
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 5,
    }));

    if (chart) chart.destroy();

    chart = new Chart(ctx.getContext('2d'), {
      type: 'radar',
      data: { labels: AXES.map(a => a.label), datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 13 } } },
          tooltip: { callbacks: { label: c => c.dataset.label + ': ' + c.parsed.r.toFixed(1) } },
        },
        scales: {
          r: {
            min: 0, max: 100,
            ticks: { stepSize: 20, showLabelBackdrop: false },
            pointLabels: { font: { size: 12, weight: 'bold' } },
          },
        },
      },
    });
  }

  function renderTable() {
    const el = document.getElementById('compareTable');
    const metrics = [
      { label: 'Median Home Value', key: 'home', fmt: v => '$' + v.toLocaleString() },
      { label: 'Median Rent', key: 'rent', fmt: v => '$' + v.toLocaleString() + '/mo' },
      { label: 'Median Income', key: 'income', fmt: v => '$' + v.toLocaleString() },
      { label: 'Owner Occupancy', key: 'owner', fmt: v => v + '%' },
      { label: 'Price/Rent Ratio', key: 'p2r', fmt: v => v },
      { label: 'Price/Income Ratio', key: 'p2i', fmt: v => v },
      { label: 'Property Tax Rate', key: 'tax_rate', fmt: v => v + '%' },
      { label: 'Rental Yield', key: 'rental_yield', fmt: v => v + '%' },
      { label: 'Market Score', key: 'market_score', fmt: v => v + ' / 100' },
    ];

    let html = '<thead><tr><th>Metric</th>';
    selected.forEach(c => { html += `<th>${c.name}, ${c.state_abbr}</th>`; });
    html += '</tr></thead><tbody>';

    metrics.forEach(m => {
      html += `<tr><td>${m.label}</td>`;
      selected.forEach(c => { html += `<td>${m.fmt(c[m.key])}</td>`; });
      html += '</tr>';
    });

    html += '</tbody>';
    el.innerHTML = html;
  }

  function updateUrl() {
    const fips = selected.map(s => s.fips).join(',');
    const url = new URL(window.location.href);
    url.searchParams.set('fips', fips);
    window.history.replaceState(null, '', url.toString());
    document.getElementById('shareUrl').value = url.toString();
  }

  function loadFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const fipsParam = params.get('fips');
    if (!fipsParam) return;
    const fipsList = fipsParam.split(',').slice(0, MAX_COUNTIES);
    fipsList.forEach(fips => {
      const c = countiesData[fips];
      if (c) selected.push({ fips, ...c });
    });
    render();
  }

  function copyUrl() {
    const input = document.getElementById('shareUrl');
    input.select();
    document.execCommand('copy');
    document.getElementById('copyBtn').textContent = 'Copied!';
    setTimeout(() => document.getElementById('copyBtn').textContent = 'Copy', 1500);
  }
})();