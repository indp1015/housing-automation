/* Homepage county/state search — autocomplete + navigation + geolocation */
(function () {
  'use strict';

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
      
      // 간단한 퍼지 매칭 (이름에 포함되거나, 단어가 포함된 경우)
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

    // ── 이벤트 리스너 ──────────────────────────────
    input.addEventListener('focus', loadIndex);
    input.addEventListener('input', (e) => {
      loadIndex();
      renderMatches(e.target.value);
    });

    // 검색 버튼 클릭 시 (가장 첫 번째 매칭 결과로 이동)
    function executeSearch() {
      const q = input.value.trim().toLowerCase();
      if (!q) return;
      
      const matches = data.filter((item) => item.name.toLowerCase().includes(q));
      if (matches.length > 0) {
        const m = matches[0];
        const link = m.type === 'county' 
          ? `${baseUrl}/counties/${m.slug}.html` 
          : `${baseUrl}/states/${m.slug}.html`;
        window.location.href = link;
      }
    }

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
        loadIndex();
        const query = e.target.dataset.query;
        input.value = query;
        // 약간의 딜레이 후 검색 실행 (데이터 로드 대기)
        setTimeout(() => {
          renderMatches(query);
          executeSearch();
        }, 300);
      });
    });

    // ── 내 위치 사용 (Geolocation + Census API) ─────────
    locationBtn.addEventListener('click', () => {
      if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser.');
        return;
      }

      const originalText = locationBtn.innerHTML;
      locationBtn.innerHTML = '<span class="loc-icon">⏳</span> Locating...';
      locationBtn.disabled = true;

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          
          // 미국 인구조사국 API를 통해 좌표 -> 카운티 정보 역추적
          const censusUrl = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${lon}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;

          fetch(censusUrl)
            .then(res => res.json())
            .then(json => {
              // 응답 구조 확인 필요 (보통 result.geographies.Counties 배열)
              const counties = json.result?.geographies?.Counties;
              if (counties && counties.length > 0) {
                // 예: "Los Angeles County"
                const rawName = counties[0].NAME; 
                // "County" 제거하여 검색어 최적화
                const countyName = rawName.replace(/ County$/i, '').trim();
                const stateAbbr = counties[0].STATE;
                
                loadIndex();
                input.value = `${countyName}, ${stateAbbr}`;
                
                // 데이터 로드 후 해당 카운티로 이동
                setTimeout(() => {
                  renderMatches(input.value);
                  executeSearch();
                }, 300);
              } else {
                alert('Could not determine your county from your location.');
                resetButton();
              }
            })
            .catch(err => {
              console.error('Census API error:', err);
              alert('Failed to fetch location data. Please try searching manually.');
              resetButton();
            });
        },
        (error) => {
          console.error('Geolocation error:', error);
          alert('Unable to retrieve your location. Please check browser permissions.');
          resetButton();
        },
        { timeout: 10000 }
      );

      function resetButton() {
        locationBtn.innerHTML = originalText;
        locationBtn.disabled = false;
      }
    });

    // Close dropdown on outside click
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