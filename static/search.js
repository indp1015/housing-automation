/* Homepage county/state search — autocomplete + navigation */
(function () {
  'use strict';

  function initSearch() {
    const container = document.getElementById('home-search');
    if (!container) return;

    const input = document.getElementById('search-input');
    const results = document.getElementById('search-results');
    const dataUrl = container.dataset.searchUrl;
    const baseUrl = container.dataset.baseUrl || '';

    let data = [];
    let loaded = false;

    // Lazy load the index on first focus
    function loadIndex() {
      if (loaded) return;
      loaded = true;
      fetch(dataUrl)
        .then((res) => res.json())
        .then((json) => {
          data = json;
        })
        .catch((err) => console.error('Search index load failed:', err));
    }

    function renderMatches(query) {
      results.innerHTML = '';
      if (!query || query.length < 2) {
        results.style.display = 'none';
        return;
      }
      const q = query.toLowerCase().trim();
      const matches = data
        .filter((item) => item.name.toLowerCase().includes(q))
        .slice(0, 8);

      if (matches.length === 0) {
        results.style.display = 'none';
        return;
      }

      matches.forEach((m) => {
        const li = document.createElement('li');
        li.className = 'search-item';

        const link =
          m.type === 'county'
            ? `${baseUrl}/counties/${m.slug}.html`
            : `${baseUrl}/states/${m.slug}.html`;

        const badgeLabel = m.type === 'county' ? 'County' : 'State';
        const badgeClass = m.type === 'county' ? 'si-county' : 'si-state';

        li.innerHTML =
          '<a href="' + link + '">' +
          '<span class="si-name">' + m.name + '</span>' +
          '<span class="si-badge ' + badgeClass + '">' + badgeLabel + '</span>' +
          '</a>';

        results.appendChild(li);
      });

      results.style.display = 'block';
    }

    input.addEventListener('focus', loadIndex);
    input.addEventListener('input', (e) => {
      loadIndex();
      renderMatches(e.target.value);
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!container.contains(e.target)) {
        results.style.display = 'none';
      }
    });

    // ESC to close
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        results.style.display = 'none';
        input.blur();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSearch);
  } else {
    initSearch();
  }
})();