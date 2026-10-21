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
  const STORAGE_KEY = 'livability_weights_v2';  // 🆕 v2 (스키마 변경)
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

  // 🆕 합계 100 보장 유틸
  function totalWeights() {
    return AXES.reduce((s, k) => s + state.weights[k], 0);
  }

  function normalizeTo100() {
    const total = totalWeights();
    if (total === 0) {
      // 모두 0이면 균등 분배
      const each = Math.floor(100 / AXES.length);
      AXES.forEach((k, i) => {
        state.weights[k] = i === AXES.length - 1 ? 100 - each * (AXES.length - 1) : each;
      });
      return;
    }
    if (total === 100) return;

    // 비례 조정
    let allocated = 0;
    AXES.forEach((k, i) => {
      if (i === AXES.length - 1) {
        state.weights[k] = Math.max(0, 100 - allocated);
      } else {
        const v = Math.round(state.weights[k] / total * 100);
        state.weights[k] = Math.max(0, v);
        allocated += state.weights[k];
      }
    });
  }

  // 🆕 특정 축을 newVal로 바꾸고, 나머지를 비례 재분배해서 합계 100 유지
  function setWeightAndRebalance(changedAxis, newVal) {
    newVal = Math.max(0, Math.min(100, parseInt(newVal, 10) || 0));
    const others = AXES.filter(a => a !== changedAxis);
    const remaining = 100 - newVal;

    const otherTotal = others.reduce((s, a) => s + state.weights[a], 0);
    state.weights[changedAxis] = newVal;

    if (remaining === 0) {
      others.forEach(a => state.weights[a] = 0);
    } else if (otherTotal === 0) {
      // 나머지가 모두 0이면 균등 분배
      const each = Math.floor(remaining / others.length);
      others.forEach((a, i) => {
        state.weights[a] = i === others.length - 1
          ? remaining - each * (others.length - 1)
          : each;
      });
    } else {
      // 비례 재분배
      let allocated = 0;
      others.forEach((a, i) => {
        if (i === others.length - 1) {
          state.weights[a] = remaining - allocated;
        } else {
          const share = Math.round(state.weights[a] / otherTotal * remaining);
          state.weights[a] = share;
          allocated += share;
        }
      });
    }
    normalizeTo100();  // 반올림 오차 보정
  }

    function loadWeights() {
    // 1순위: URL 파라미터 (?w=25,15,15,15,10,20)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const wParam = urlParams.get('w');
      if (wParam) {
        const parts = wParam.split(',').map(v => parseInt(v, 10));
        if (parts.length === AXES.length && parts.every(v => !isNaN(v) && v >= 0 && v <= 100)) {
          AXES.forEach((k, i) => { state.weights[k] = parts[i]; });
          normalizeTo100();
          return;
        }
      }
    } catch (e) { /* ignore */ }

    // 2순위: localStorage
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && typeof saved === 'object') {
        AXES.forEach(function (k) {
          if (typeof saved[k] === 'number' && saved[k] >= 0 && saved[k] <= 100) {
            state.weights[k] = saved[k];
          }
        });
        normalizeTo100();
      }
    } catch (e) { /* ignore */ }
  }

  function saveWeights() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.weights));
    } catch (e) { /* ignore */ }
  }

  // 🆕 URL 자동 갱신 (히스토리 오염 없이 replaceState 사용)
  function updateURL() {
    try {
      const parts = AXES.map(k => state.weights[k]).join(',');
      const url = new URL(window.location.href);
      url.searchParams.set('w', parts);
      window.history.replaceState({}, '', url.toString());
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
        +          ' min="0" max="100" step="1" value="' + state.weights[k] + '">'
        +   '<span class="weight-value" id="val-' + k + '">' + state.weights[k] + '%</span>'
        + '</div>';
    }).join('');

    AXES.forEach(function (k) {
      const el = document.getElementById('w-' + k);
      el.addEventListener('input', onWeightChange);
    });
  }

  function updateAllSliders() {
    AXES.forEach(function (k) {
      document.getElementById('w-' + k).value = state.weights[k];
      document.getElementById('val-' + k).textContent = state.weights[k] + '%';
    });
    const totalEl = document.getElementById('weight-total');
    if (totalEl) totalEl.textContent = '100';
    document.querySelectorAll('.preset').forEach(b => b.classList.remove('active'));
  }

  function onWeightChange(e) {
    const k = e.target.dataset.axis;
    const newVal = parseInt(e.target.value, 10) || 0;
    setWeightAndRebalance(k, newVal);
    updateAllSliders();
    saveWeights();
    updateURL();

    clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(renderTable, 150);
  }

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

    renderCards(rows);

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
        updateAllSliders();
        saveWeights();
        updateURL();
        renderTable();
      });
    }
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

    // 🆕 Share 버튼
    const shareBtn = document.getElementById('share-view');
    if (shareBtn) {
      shareBtn.addEventListener('click', async function () {
        updateURL();
        const shareUrl = window.location.href;
        try {
          if (navigator.share) {
            await navigator.share({ title: 'U.S. County Livability Score', url: shareUrl });
          } else {
            await navigator.clipboard.writeText(shareUrl);
            shareBtn.textContent = '✅ Copied!';
            setTimeout(() => { shareBtn.textContent = '🔗 Share'; }, 2000);
          }
        } catch (e) {
          // 클립보드 권한 없을 때 폴백: prompt로 표시
          window.prompt('Copy this link:', shareUrl);
        }
      });
    }

    // 🆕 CSV 다운로드 버튼
    const csvBtn = document.getElementById('download-csv');
    if (csvBtn) {
      csvBtn.addEventListener('click', downloadCSV);
    }
    document.querySelectorAll('.preset').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const preset = PRESETS[btn.dataset.preset];
        if (!preset) return;
        state.weights = Object.assign({}, preset);
        normalizeTo100();
        updateAllSliders();
        btn.classList.add('active');
        saveWeights();
        updateURL();
        renderTable();
      });
    });
  }

  // 🆕 CSV 다운로드 (BOM 포함 → Excel 한글/특수문자 대응)
  function downloadCSV() {
    if (!state.counties) return;

    // 현재 가중치로 정렬된 Top 100 산출
    const rows = [];
    Object.keys(state.counties).forEach(function (fips) {
      const c = state.counties[fips];
      const comp = composite(c.axes, state.weights);
      if (comp == null) return;
      rows.push({ fips, c, comp });
    });
    rows.sort((a, b) => b.comp - a.comp);
    const top = rows.slice(0, TOP_N);

    const header = ['Rank', 'County', 'State', 'Overall Score']
      .concat(AXES.map(k => LABELS[k]))
      .concat(['FIPS']);
    const lines = [header.join(',')];

    top.forEach((row, i) => {
      const c = row.c;
      const ax = c.axes;
      const rowData = [
        i + 1,
        '"' + (c.county_name || '').replace(/"/g, '""') + '"',
        c.state_abbr || '',
        row.comp.toFixed(1),
      ].concat(AXES.map(k => (ax[k] != null ? ax[k].toFixed(1) : '')))
       .concat([row.fips]);
      lines.push(rowData.join(','));
    });

    // 메타 정보 (파일 상단 주석)
    const meta = [
      '# U.S. County Livability Score — Top ' + TOP_N,
      '# Generated: ' + new Date().toISOString(),
      '# Weights: ' + AXES.map(k => k + '=' + state.weights[k]).join('; '),
      '# Source: ACS 5-Year, FBI UCR, CDC PLACES, OpenStreetMap (ODbL)',
      '',
    ];
    const content = '\uFEFF' + meta.concat(lines).join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'livability_top100_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
    normalizeTo100();
    renderSliders();
    updateAllSliders();
    bindControls();
    loadData();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();