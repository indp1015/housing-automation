/* Homepage county/state search — autocomplete + navigation + geolocation */
(function () {
  'use strict';

  // 🆕 주 약자 -> 풀네임 매핑 (검색 시 자동 변환)
  const STATE_ABBR_TO_NAME = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
    "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho",
    "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
    "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
    "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
    "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia",
    "WI": "Wisconsin", "WY": "Wyoming", "DC": "District of Columbia"
  };

  // 🆕 도시명 별칭 (도시 이름으로 검색해도 해당 카운티로 이동)
  const CITY_ALIASES = {
    "nyc": "new york",
    "new york city": "new york",
    "la": "los angeles",
    "sf": "san francisco",
    "houston": "harris",
    "phoenix": "maricopa",
    "chicago": "cook",
    "seattle": "king",
    "miami": "miami-dade",
    "atlanta": "fulton",
    "dallas": "dallas",
    "denver": "denver",
    "boston": "suffolk",
    "detroit": "wayne",
    "philadelphia": "philadelphia",
    "las vegas": "clark",
    "san diego": "san diego"
  };

  // 🆕 검색어 정규화 (주 약자 변환, 도시 별칭 변환)
  function normalizeQuery(query) {
    let q = query.trim().toLowerCase();
    
    // 도시명 별칭 변환 (정확히 일치하는 경우만)
    if (CITY_ALIASES[q]) {
      return CITY_ALIASES[q];
    }
    
    // "도시명, 주약자" 형태 변환 (예: "new york, ny" -> "new york, new york")
    const parts = q.split(',').map(s => s.trim());
    if (parts.length >= 2) {
      const lastPart = parts[parts.length - 1].toUpperCase();
      if (STATE_ABBR_TO_NAME[lastPart]) {
        parts[parts.length - 1] = STATE_ABBR_TO_NAME[lastPart].toLowerCase();
      }
    }
    return parts.join(', ');
  }

  // 🆕 퍼지 매칭 (단어 기반)
  function matchesQuery(itemName, query) {
    const normalizedName = itemName.toLowerCase();
    const normalizedQuery = normalizeQuery(query);
    
    // 1. 정확히 포함되는 경우
    if (normalizedName.includes(normalizedQuery)) return true;
    
    // 2. 단어 기반 매칭 (모든 검색어 단어가 이름에 포함되어야 함)
    const queryWords = normalizedQuery.split(/[\s,]+/).filter(w => w.length > 0);
    const nameWords = normalizedName.split(/[\s,]+/).filter(w => w.length > 0);
    
    return queryWords.every(qw => 
      nameWords.some(nw => nw.includes(qw) || qw.includes(nw))
    );
  }

  function initSearch() {
    const container = document.getElementById('home-search');
    if (!container) return;

    const input = document.getElementById('search-input');
    const results = document.getElementById('search-results');
    const searchBtn = document.getElementById('search-btn');
    const locationBtn = document.getElementById('use-location-btn');
    const popularLinks = document.querySelectorAll('.popular-query');
    
    const dataUrl = container.dataset.searchUrl;
    const baseUrl = container.dataset.baseUrl || '';

    let data = [];
    let dataPromise = null;

    function loadIndex() {
      if (dataPromise) return dataPromise;
      
      dataPromise = fetch(dataUrl)
        .then((res) => {
          if (!res.ok) throw new Error('Network response was not ok');
          return res.json();
        })
        .then((json) => {
          data = json;
          return data;
        })
        .catch((err) => {
          console.error('Search index load failed:', err);
          dataPromise = null;
          throw err;
        });
        
      return dataPromise;
    }

    // 🆕 개선된 매칭 함수 사용
    function findMatches(query) {
      return data.filter((item) => matchesQuery(item.name, query));
    }

    function renderMatches(query) {
      results.innerHTML = '';
      if (!query || query.length < 2) {
        results.style.display = 'none';
        return;
      }
      
      loadIndex().then(() => {
        const matches = findMatches(query).slice(0, 8);

        if (matches.length === 0) {
          results.style.display = 'none';
          return;
        }

        matches.forEach((m) => {
          const li = document.createElement('li');
          li.className = 'search-item';

          const link = m.type === 'county'
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
      }).catch(() => {});
    }

    function executeSearch() {
      const q = input.value.trim();
      if (!q) return;
      
      const originalText = searchBtn.textContent;
      searchBtn.textContent = '...';
      searchBtn.disabled = true;

      loadIndex().then(() => {
        const matches = findMatches(q);
        if (matches.length > 0) {
          const m = matches[0];
          const link = m.type === 'county' 
            ? `${baseUrl}/counties/${m.slug}.html` 
            : `${baseUrl}/states/${m.slug}.html`;
          window.location.href = link;
        } else {
          searchBtn.textContent = originalText;
          searchBtn.disabled = false;
          alert('No matching county or state found. Please try a different search.');
        }
      }).catch(() => {
        searchBtn.textContent = originalText;
        searchBtn.disabled = false;
        alert('Failed to load search data. Please try again.');
      });
    }

    input.addEventListener('focus', loadIndex);
    input.addEventListener('input', (e) => renderMatches(e.target.value));
    searchBtn.addEventListener('click', executeSearch);
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') executeSearch();
      if (e.key === 'Escape') {
        results.style.display = 'none';
        input.blur();
      }
    });

    // 인기 검색어 클릭
    popularLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const query = e.target.dataset.query;
        input.value = query;
        executeSearch();
      });
    });

    // 내 위치 사용
    locationBtn.addEventListener('click', () => {
      if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser.');
        return;
      }

      const originalLocationText = locationBtn.innerHTML;
      locationBtn.innerHTML = '<span class="loc-icon">⏳</span> Locating...';
      locationBtn.disabled = true;

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          const censusUrl = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${lon}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;

          fetch(censusUrl)
            .then(res => res.json())
            .then(json => {
              const counties = json.result?.geographies?.Counties;
              if (counties && counties.length > 0) {
                const rawName = counties[0].NAME; 
                const countyName = rawName.replace(/ County$/i, '').trim();
                const stateAbbr = counties[0].STATE;
                input.value = `${countyName}, ${stateAbbr}`;
                executeSearch();
              } else {
                alert('Could not determine your county from your location.');
                resetLocationBtn();
              }
            })
            .catch(err => {
              console.error('Census API error:', err);
              alert('Failed to fetch location data. Please try searching manually.');
              resetLocationBtn();
            });
        },
        (error) => {
          console.error('Geolocation error:', error);
          alert('Unable to retrieve your location. Please check browser permissions.');
          resetLocationBtn();
        },
        { timeout: 10000 }
      );

      function resetLocationBtn() {
        locationBtn.innerHTML = originalLocationText;
        locationBtn.disabled = false;
      }
    });

    document.addEventListener('click', (e) => {
      if (!container.contains(e.target) && !locationBtn.contains(e.target)) {
        results.style.display = 'none';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSearch);
  } else {
    initSearch();
  }
})();