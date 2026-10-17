/**
 * Buy vs Rent Calculator
 * - Compares long-term net worth of buying vs renting
 * - Uses counties_data.json for defaults
 */
(function() {
    // 🆕 선택 연도 세로선 플러그인
  const selectedYearLinePlugin = {
    id: 'selectedYearLine',
    afterDatasetsDraw(chart, args, opts) {
      const year = opts.year;
      if (!year || year < 1) return;
      
      const xAxis = chart.scales.x;
      const yAxis = chart.scales.y;
      const idx = year - 1;
      if (idx < 0 || idx >= xAxis.ticks.length) return;
      
      const xPos = xAxis.getPixelForTick(idx);
      const ctx = chart.ctx;
      
      ctx.save();
      ctx.strokeStyle = 'rgba(192, 57, 43, 0.7)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(xPos, yAxis.top);
      ctx.lineTo(xPos, yAxis.bottom);
      ctx.stroke();
      
      // 라벨
      ctx.fillStyle = 'rgba(192, 57, 43, 0.9)';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Yr ' + year, xPos, yAxis.top - 4);
      ctx.restore();
    }
  };
  'use strict';

  const MAX_YEARS = 30;
  const MAINTENANCE_RATE = 1.0;    // 1% of home value per year
  const INSURANCE_YEARLY = 1500;
  const CLOSING_COST_PCT = 3.0;
  const SELLING_COST_PCT = 6.0;
  const MORTGAGE_TERM_YEARS = 30;

  let countiesData = null;
  let selectedFips = null;
  let chart = null;

  // ─── Load data ───
  fetch('/static/counties_data.json')
    .then(r => r.json())
    .then(data => {
      countiesData = data.counties;
      console.log('[BvR] Loaded', Object.keys(countiesData).length, 'counties');
      bindEvents();
      loadFromUrl();
    })
    .catch(err => console.error('Data load failed:', err));

  function bindEvents() {
    const input = document.getElementById('bvrSearch');
    input.addEventListener('input', handleSearch);
    input.addEventListener('focus', handleSearch);
    document.addEventListener('click', e => {
      if (!e.target.closest('.bvr-picker')) {
        document.getElementById('bvrSearchResults').innerHTML = '';
      }
    });

    // Input changes
    ['bvrHomePrice', 'bvrDownPct', 'bvrRate', 'bvrTaxRate', 'bvrAppreciation',
     'bvrRent', 'bvrRentInflation', 'bvrInvestReturn', 'bvrYears'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => {
          if (id === 'bvrYears') {
            document.getElementById('bvrYearsDisplay').textContent = el.value + ' years';
            document.getElementById('bvrYearsLabel').textContent = el.value;
          }
          calculate();
        });
      }
    });
  }

  function handleSearch(e) {
    const q = e.target.value.trim().toLowerCase();
    const resultsEl = document.getElementById('bvrSearchResults');
    if (q.length < 2) { resultsEl.innerHTML = ''; return; }

    const matches = [];
    for (const [fips, c] of Object.entries(countiesData)) {
      const label = (c.name + ' ' + c.state + ' ' + c.state_abbr).toLowerCase();
      if (label.includes(q)) {
        matches.push({ fips, ...c });
        if (matches.length >= 15) break;
      }
    }

    if (matches.length === 0) {
      resultsEl.innerHTML = '<div class="bvr-no-match">No matches</div>';
      return;
    }

    resultsEl.innerHTML = matches.map(m => `
      <div class="bvr-search-result" data-fips="${m.fips}">
        <span class="sr-name">${m.name}</span>
        <span class="sr-state">${m.state}</span>
      </div>
    `).join('');

    resultsEl.querySelectorAll('.bvr-search-result').forEach(el => {
      el.addEventListener('click', () => selectCounty(el.dataset.fips));
    });
  }

  function selectCounty(fips) {
    const c = countiesData[fips];
    if (!c) return;
    selectedFips = fips;

    // Populate defaults
    document.getElementById('bvrHomePrice').value = c.home;
    document.getElementById('bvrRent').value = c.rent;
    document.getElementById('bvrTaxRate').value = c.tax_rate;

    // Selected card
    const selEl = document.getElementById('bvrSelected');
    selEl.innerHTML = `
      <div class="bvr-selected-inner">
        <div>
          <div class="bvr-selected-name">${c.name}, ${c.state_abbr}</div>
          <div class="bvr-selected-meta">Median home $${c.home.toLocaleString()} · Rent $${c.rent}/mo</div>
        </div>
        <button id="bvrClear" class="bvr-clear-btn">×</button>
      </div>
    `;
    selEl.style.display = '';
    document.getElementById('bvrClear').addEventListener('click', clearCounty);

    // Hide search + empty, show content
    document.getElementById('bvrSearch').value = '';
    document.getElementById('bvrSearchResults').innerHTML = '';
    document.getElementById('bvrEmpty').style.display = 'none';
    document.getElementById('bvrContent').style.display = '';

    updateUrl(fips);
    calculate();
  }

  function clearCounty() {
    selectedFips = null;
    document.getElementById('bvrSelected').style.display = 'none';
    document.getElementById('bvrEmpty').style.display = '';
    document.getElementById('bvrContent').style.display = 'none';
    updateUrl(null);
  }

  function loadFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const fips = params.get('fips') || params.get('county');
    if (fips && countiesData[fips]) {
      selectCounty(fips);
    }
  }

  function updateUrl(fips) {
    const url = new URL(window.location.href);
    if (fips) {
      url.searchParams.set('fips', fips);
    } else {
      url.searchParams.delete('fips');
    }
    window.history.replaceState(null, '', url.toString());
  }

  // ─── Calculator ───
  function calculate() {
    if (!selectedFips) return;

    const homePrice = parseFloat(document.getElementById('bvrHomePrice').value) || 0;
    const downPct = parseFloat(document.getElementById('bvrDownPct').value) || 0;
    const rate = parseFloat(document.getElementById('bvrRate').value) || 0;
    const taxRate = parseFloat(document.getElementById('bvrTaxRate').value) || 0;
    const appreciation = parseFloat(document.getElementById('bvrAppreciation').value) || 0;
    const rent = parseFloat(document.getElementById('bvrRent').value) || 0;
    const rentInflation = parseFloat(document.getElementById('bvrRentInflation').value) || 0;
    const investmentReturn = parseFloat(document.getElementById('bvrInvestReturn').value) || 0;
    const years = parseInt(document.getElementById('bvrYears').value) || 10;

    if (homePrice <= 0 || rent <= 0) return;

    const downPayment = homePrice * downPct / 100;
    const loanAmount = homePrice - downPayment;
    const closingCosts = homePrice * CLOSING_COST_PCT / 100;
    const monthlyRate = rate / 100 / 12;
    const nMonths = MORTGAGE_TERM_YEARS * 12;

    let pi = 0;
    if (loanAmount > 0 && monthlyRate > 0) {
      pi = loanAmount * monthlyRate * Math.pow(1 + monthlyRate, nMonths)
         / (Math.pow(1 + monthlyRate, nMonths) - 1);
    }

    const annualTax = homePrice * taxRate / 100;
    const annualMaintenance = homePrice * MAINTENANCE_RATE / 100;
    const monthlyOwnCost = pi + (annualTax + INSURANCE_YEARLY + annualMaintenance) / 12;

    // Year-by-year simulation
    const buySeries = [];
    const rentSeries = [];

    let homeValue = homePrice;
    let balance = loanAmount;
    let currentRent = rent;
    let invested = downPayment + closingCosts;   // renter invests down payment + avoided closing

    for (let y = 1; y <= MAX_YEARS; y++) {
      // Amortize for 12 months
      for (let m = 0; m < 12; m++) {
        if (balance > 0) {
          const interest = balance * monthlyRate;
          const principal = pi - interest;
          balance = Math.max(0, balance - principal);
        }
      }
      // Home appreciates
      homeValue *= (1 + appreciation / 100);

      // Buyer net worth
      const sellingCosts = homeValue * SELLING_COST_PCT / 100;
      const buyerNet = homeValue - balance - sellingCosts;

      // Renter invests difference (or withdraws if owning is cheaper)
      const monthlyDifference = monthlyOwnCost - currentRent;
      for (let m = 0; m < 12; m++) {
        invested = invested * (1 + investmentReturn / 100 / 12) + monthlyDifference;
      }

      // Rent grows
      currentRent *= (1 + rentInflation / 100);

      buySeries.push(buyerNet);
      rentSeries.push(invested);
    }

    // Break-even year
    let breakEven = -1;
    for (let i = 0; i < MAX_YEARS; i++) {
      if (buySeries[i] >= rentSeries[i]) {
        breakEven = i + 1;
        break;
      }
    }

    renderVerdict(buySeries[years - 1], rentSeries[years - 1], years);
    renderChart(buySeries, rentSeries, years);   // 🆕 years 전달
    renderBreakEven(breakEven, years);
  }

  function renderVerdict(buyWorth, rentWorth, years) {
    const diff = buyWorth - rentWorth;
    const winnerEl = document.getElementById('bvrWinner');
    const diffEl = document.getElementById('bvrDifference');

    if (diff > 0) {
      winnerEl.textContent = '🏠 Buying Wins';
      winnerEl.className = 'bvr-verdict-winner buy';
      diffEl.textContent = `Buying is ahead by ${fmt(diff)} after ${years} years`;
    } else {
      winnerEl.textContent = '🏢 Renting Wins';
      winnerEl.className = 'bvr-verdict-winner rent';
      diffEl.textContent = `Renting is ahead by ${fmt(-diff)} after ${years} years`;
    }

    document.getElementById('bvrBuyWorth').textContent = fmt(buyWorth);
    document.getElementById('bvrRentWorth').textContent = fmt(rentWorth);
  }

  function renderBreakEven(breakEven, currentYears) {
    const el = document.getElementById('bvrBreakEvenLine');
    if (breakEven < 0) {
      el.innerHTML = `📊 <strong>No break-even</strong> within 30 years at these assumptions — renting comes out ahead on net worth.`;
    } else if (breakEven <= currentYears) {
      el.innerHTML = `📊 <strong>Break-even at year ${breakEven}</strong> — after this point, buying pulls ahead.`;
    } else {
      el.innerHTML = `📊 <strong>Break-even at year ${breakEven}</strong> — beyond your chosen ${currentYears}-year horizon.`;
    }
  }

  function renderChart(buyData, rentData, selectedYears) {
    const ctx = document.getElementById('bvrChart');
    if (!ctx) return;

    const labels = Array.from({length: MAX_YEARS}, (_, i) => 'Yr ' + (i + 1));

    if (chart) chart.destroy();

    chart = new Chart(ctx.getContext('2d'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: '🏠 Buy Net Worth',
            data: buyData,
            borderColor: '#1a3d5c',
            backgroundColor: 'rgba(26, 61, 92, 0.1)',
            borderWidth: 3,
            tension: 0.3,
            fill: true,
            pointRadius: 0,
            pointHoverRadius: 5,
          },
          {
            label: '🏢 Rent Net Worth',
            data: rentData,
            borderColor: '#e67e22',
            backgroundColor: 'rgba(230, 126, 34, 0.1)',
            borderWidth: 3,
            tension: 0.3,
            fill: true,
            pointRadius: 0,
            pointHoverRadius: 5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top' },
          tooltip: {
            callbacks: {
              label: c => c.dataset.label + ': ' + fmt(c.parsed.y),
            },
          },
          // 🆕 선택 연도 표시
          selectedYearLine: { year: selectedYears },
        },
        // 🆕 애니메이션 시간 축소 (산만함 감소)
        animation: { duration: 300 },
        scales: {
          y: {
            title: { display: true, text: 'Net Worth' },
            ticks: { callback: v => '$' + (v / 1000).toFixed(0) + 'k' },
          },
          x: {
            grid: { display: false },
            // 🆕 X축 라벨 명확화: 5년 단위 + 선택 연도
            ticks: {
              autoSkip: false,
              maxRotation: 0,
              minRotation: 0,
              font: { size: 10 },
              callback: function(value, index) {
                const yearNum = index + 1;
                if (yearNum === 1 || yearNum === selectedYears || yearNum % 5 === 0) {
                  return 'Yr ' + yearNum;
                }
                return '';
              }
            }
          },
        },
      },
      // 🆕 플러그인 등록
      plugins: [selectedYearLinePlugin],
    });
  }

  function fmt(n) {
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1000000) return sign + '$' + (abs / 1000000).toFixed(2) + 'M';
    if (abs >= 1000) return sign + '$' + Math.round(abs).toLocaleString('en-US');
    return sign + '$' + Math.round(abs);
  }

})();