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
    let dataPromise = null;

    // 💡 데이터 로드를 Promise로 관리하여 중복 요청 방지 및 대기 보장
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
          dataPromise = null; // 실패 시 재시도 가능하도록 초기화
          throw err;
        });
        
      return dataPromise;
    }

    function renderMatches(query) {
      results.innerHTML = '';
      if (!query || query.length < 2) {
        results.style.display = 'none';
        return;
      }
      const q = query.toLowerCase().trim();
      
      // 데이터가 로드된 후 매칭 실행
      loadIndex().then(() => {
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
      }).catch(() => {
        // 에러 발생 시 무시 (이미 콘솔에 로깅됨)
      });
    }

    // 💡 검색 실행 함수 (데이터 로딩 대기 보장)
    function executeSearch() {
      const q = input.value.trim().toLowerCase();
      if (!q) return;
      
      // 로딩 상태 표시
      const originalText = searchBtn.textContent;
      searchBtn.textContent = '...';
      searchBtn.disabled = true;

      loadIndex().then(() => {
        const matches = data.filter((item) => item.name.toLowerCase().includes(q));
        if (matches.length > 0) {
          // 가장 첫 번째 매칭 결과로 이동
          const m = matches[0];
          const link = m.type === 'county' 
            ? `${baseUrl}/counties/${m.slug}.html` 
            : `${baseUrl}/states/${m.slug}.html`;
          window.location.href = link;
        } else {
          // 검색 결과 없음 알림
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

    // ── 이벤트 리스너 ──────────────────────────────
    input.addEventListener('focus', loadIndex);
    
    input.addEventListener('input', (e) => {
      renderMatches(e.target.value);
    });

    searchBtn.addEventListener('click', executeSearch);
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') executeSearch();
      if (e.key === 'Escape') {
        results.style.display = 'none';
        input.blur();
      }
    });

    // 인기 검색어 클릭 시 즉시 검색 실행
    popularLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const query = e.target.dataset.query;
        input.value = query;
        executeSearch(); // 대기 시간(setTimeout) 없이 바로 실행
      });
    });

    // ── 내 위치 사용 (Geolocation + Census API) ─────────
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
                executeSearch(); // 데이터 로드를 기다렸다가 바로 이동
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

    // 외부 클릭 시 드롭다운 닫기
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