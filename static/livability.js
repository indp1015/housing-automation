(function () {
  'use strict';

  const AXES = ['affordability','stability','momentum','safety','health','amenities'];
  const LABELS = {
    affordability: 'Affordability',
    stability: 'Stability',
    momentum: 'Momentum',
    safety: 'Safety',
    health: 'Health',
    amenities: 'Amenities'
  };
  const DEFAULT_WEIGHTS = {
    affordability: 25, stability: 15, momentum: 15,
    safety: 15, health: 10, amenities: 20
  };
  const STORAGE_KEY = 'livability_weights_v1';
  const TOP_N = 100;

  const state = {
    counties: null,
    weights: Object.assign({}, DEFAULT_WEIGHTS),
    sortBy: 'composite',
    debounceTimer: null
  };
    const PRESETS = {
    family:   { affordability: 25, stability: 20, momentum: 10, safety: 20, health: 15, amenities: 10 },
    investor: { affordability: 15, stability: 10, momentum: 35, safety: 10, health: 5,  amenities: 25 },
    budget:   { affordability: 50, stability: 15, momentum: 5,  safety: 15, health: 5,  amenities: 10 },
    young:    { affordability: 25, stability: 5,  momentum: 15, safety: 15, health: 10, amenities: 30 },
    };
  function loadWeights() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && typeof saved === 'object') {
        AXES.forEach(function (k) {
          if (typeof saved[k] === 'number' && saved[k] >= 0 && saved[k] <= 100) {
            state.weights[k] = saved[k];
          }
        });
      }
    } catch (e) { /* ignore */ }
  }

  function saveWeights() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.weights));
    } catch (e) { /* ignore */ }
  }

  function composite(axes, weights) {
    let num = 0, den = 0;
    AXES.forEach(function (k) {
      const v = axes[k];
      const w = weights[k];
      if (v != null && w > 0) {
        num += v * w;
        den += w;
      }
    });
    return den ? num / den : null;
  }

  function renderSliders() {
    const wrap = document.getElementById('weight-controls');
    wrap.innerHTML = AXES.map(function (k) {
      return ''
        + '<div class="weight-row">'
        +   '<label for="w-' + k + '">' + LABELS[k] + '</label>'
        +   '<input type="range" id="w-' + k + '" data-axis="' + k + '"'
        +          ' min="0" max="50" step="1" value="' + state.weights[k] + '">'
        +   '<span class="weight-value" id="val-' + k + '">' + state.weights[k] + '</span>'
        + '</div>';
    }).join('');

    AXES.forEach(function (k) {
      const el = document.getElementById('w-' + k);
      el.addEventListener('input', onWeightChange);
    });
  }

  function onWeightChange(e) {
    const k = e.target.dataset.axis;
    state.weights[k] = parseInt(e.target.value, 10) || 0;
    document.getElementById('val-' + k).textContent = state.weights[k];
    updateTotal();
    saveWeights();

    clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(renderTable, 150);
  }

  function updateTotal() {
    const total = AXES.reduce(function (s, k) { return s + state.weights[k]; }, 0);
    const el = document.getElementById('weight-total');
    el.textContent = total;
    el.classList.toggle('warn', total !== 100);
  }

  // 🆕 tier 계산
function tierOf(score) {
  if (score >= 80) return { cls: 'excellent', label: 'Excellent' };
  if (score >= 70) return { cls: 'strong', label: 'Strong' };
  if (score >= 60) return { cls: 'balanced', label: 'Balanced' };
  if (score >= 50) return { cls: 'challenging', label: 'Challenging' };
  return { cls: 'stressed', label: 'Stressed' };
}

const AXIS_COLORS = {
  affordability: '#2e86ab',
  stability: '#5a9e7c',
  momentum: '#d4a72c',
  safety: '#b8452c',
  health: '#8e5aa8',
  amenities: '#4a90d9',
};

function renderCards(rows) {
  const wrap = document.getElementById('top-cards');
  if (!wrap) return;
  const top = rows.slice(0, 10);

  wrap.innerHTML = top.map(function (row, i) {
    const c = row.c;
    const tier = tierOf(row.comp);
    const bars = AXES.map(function (k) {
      const v = c.axes[k];
      const w = v != null ? Math.max(0, Math.min(100, Math.round(v))) : 0;
      const disp = v != null ? Math.round(v) : '–';
      return ''
        + '<div class="liv-card-bar-row">'
        +   '<span class="lbl">' + LABELS[k] + '</span>'
        +   '<div class="liv-card-bar-track">'
        +     '<div class="liv-card-bar-fill" style="width:' + w + '%;background:' + AXIS_COLORS[k] + '"></div>'
        +   '</div>'
        +   '<span class="val">' + disp + '</span>'
        + '</div>';
    }).join('');

    return ''
      + '<div class="liv-card" style="border-left-color:' + tierColor(tier.cls) + '">'
      +   '<div class="liv-card-rank">#' + (i + 1) + '</div>'
      +   '<div class="liv-card-name">' + escapeHtml(c.county_name) + '</div>'
      +   '<div class="liv-card-state">' + (c.state_abbr || '') + '</div>'
      +   '<div class="liv-card-score-row">'
      +     '<span class="liv-card-score">' + row.comp.toFixed(1) + '</span>'
      +     '<span class="liv-card-badge badge-' + tier.cls + '">' + tier.label + '</span>'
      +   '</div>'
      +   '<div class="liv-card-bars">' + bars + '</div>'
      + '</div>';
  }).join('');
}

function tierColor(cls) {
  return {
    excellent: '#2ecc71', strong: '#3498db', balanced: '#f1c40f',
    challenging: '#e67e22', stressed: '#e74c3c'
  }[cls] || '#2ecc71';
}

function renderTable() {
  if (!state.counties) return;

  const rows = [];
  Object.keys(state.counties).forEach(function (fips) {
    const c = state.counties[fips];
    const comp = composite(c.axes, state.weights);
    if (comp == null) return;
    rows.push({ fips: fips, c: c, comp: comp });
  });

  // 정렬
  if (state.sortBy === 'composite') {
    rows.sort(function (a, b) { return b.comp - a.comp; });
  } else {
    const key = state.sortBy;
    rows.sort(function (a, b) {
      const va = a.c.axes[key], vb = b.c.axes[key];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return vb - va;
    });
  }

  // 🆕 카드 렌더 (Top 10)
  renderCards(rows);

  // 표 렌더 (Top 100)
  const wrap = document.getElementById('results-table-wrap');
  const top = rows.slice(0, TOP_N);
  let body = top.map(function (row, i) {
    const c = row.c;
    const axes = c.axes;
    const bars = AXES.map(function (k) {
      const v = axes[k];
      const w = v != null ? Math.max(0, Math.min(100, Math.round(v))) : 0;
      const title = LABELS[k] + ': ' + (v != null ? v : 'N/A');
      return '<div class="bar-wrap" title="' + title + '">'
           +   '<div class="bar bar-' + k + '" style="width:' + w + '%"></div>'
           + '</div>';
    }).join('');
    return ''
      + '<tr>'
      +   '<td class="rank">' + (i + 1) + '</td>'
      +   '<td><strong>' + escapeHtml(c.county_name) + '</strong>'
      +       ' <span class="state">' + (c.state_abbr || '') + '</span></td>'
      +   '<td class="composite">' + row.comp.toFixed(1) + '</td>'
      +   '<td class="axis-bars">' + bars + '</td>'
      + '</tr>';
  }).join('');

  wrap.innerHTML = ''
    + '<table class="livability-table">'
    +   '<thead><tr>'
    +     '<th>#</th><th>County</th><th>Score</th>'
    +     '<th class="axis-head">' + AXES.map(function (k) { return LABELS[k]; }).join(' · ') + '</th>'
    +   '</tr></thead>'
    +   '<tbody>' + body + '</tbody>'
    + '</table>';
}

  function escapeHtml(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function bindControls() {
    const sel = document.getElementById('sort-select');
    if (sel) {
      sel.addEventListener('change', function (e) {
        state.sortBy = e.target.value;
        renderTable();
      });
    }
    const reset = document.getElementById('reset-weights');
    if (reset) {
      reset.addEventListener('click', function () {
        state.weights = Object.assign({}, DEFAULT_WEIGHTS);
        AXES.forEach(function (k) {
          document.getElementById('w-' + k).value = state.weights[k];
          document.getElementById('val-' + k).textContent = state.weights[k];
        });
        updateTotal();
        saveWeights();
        renderTable();
      });
    }
    // 🆕 Show Full 100 토글
    const toggle = document.getElementById('toggle-view');
    if (toggle) {
        toggle.addEventListener('click', function () {
        const wrap = document.getElementById('results-table-wrap');
        const cards = document.getElementById('top-cards');
        const hidden = wrap.classList.toggle('is-hidden');
        cards.classList.toggle('is-hidden', !hidden);
        toggle.textContent = hidden ? 'Show Full 100' : 'Show Top 10';
        });
    }
  }

  async function loadData() {
    const wrap = document.getElementById('results-table-wrap');
    try {
      const resp = await fetch('/static/counties_livability.json', { cache: 'force-cache' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      state.counties = data.counties || {};
      renderTable();
    } catch (err) {
      console.error(err);
      wrap.innerHTML = '<p class="error">Failed to load county data. Please refresh.</p>';
    }
  }

  function init() {
    loadWeights();
    renderSliders();
    updateTotal();
    bindControls();
    loadData();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();