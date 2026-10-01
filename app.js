const state = { step: 1, category: 'cafe', cuisine: 'restaurants', price: '', sort: 'best_match', openNow: false, people: [], results: [], map: null, trafficAware: false, placesPowered: false, optionsConsidered: 0 };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const screens = ['homeScreen', 'plannerScreen', 'loadingScreen', 'resultsScreen'];

function showScreen(id) {
  screens.forEach((screen) => document.getElementById(screen).classList.toggle('hidden', screen !== id));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function addPerson(name = '', address = '') {
  if ($$('.person-card').length >= 6) return;
  const card = $('#personTemplate').content.firstElementChild.cloneNode(true);
  card.querySelector('.person-name').value = name;
  card.querySelector('.person-address').value = address;
  setupAddressAutocomplete(card.querySelector('.person-address'));
  card.querySelector('.remove-person').addEventListener('click', () => { card.remove(); renumberPeople(); });
  $('#peopleList').append(card);
  renumberPeople();
}

function renumberPeople() {
  $$('.person-card').forEach((card, index) => card.querySelector('.person-number').textContent = index + 1);
  $$('.remove-person').forEach((button) => button.hidden = $$('.person-card').length <= 2);
  $('#addPersonButton').hidden = $$('.person-card').length >= 6;
}

function collectPeople() {
  return $$('.person-card').map((card, index) => ({
    name: card.querySelector('.person-name').value.trim() || `Person ${index + 1}`,
    address: card.querySelector('.person-address').value.trim(),
    lat: Number(card.querySelector('.person-address').dataset.lat) || null,
    lon: Number(card.querySelector('.person-address').dataset.lon) || null
  }));
}

function debounce(fn, delay = 280) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

function setupAddressAutocomplete(input) {
  const menu = input.parentElement.querySelector('.address-suggestions');
  input.addEventListener('input', debounce(async () => {
    delete input.dataset.lat; delete input.dataset.lon;
    const query = input.value.trim();
    if (query.length < 3) { menu.classList.remove('open'); return; }
    try {
      const response = await fetch(`./api/autocomplete?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error();
      const { suggestions = [] } = await response.json();
      menu.innerHTML = suggestions.map(item => `<button type="button" class="suggestion" data-id="${escapeHtml(item.id)}">${escapeHtml(item.text)}</button>`).join('');
      menu.classList.toggle('open', suggestions.length > 0);
    } catch { menu.classList.remove('open'); }
  }));
  menu.addEventListener('click', async event => {
    const button = event.target.closest('.suggestion');
    if (!button) return;
    input.value = button.textContent;
    menu.classList.remove('open');
    const response = await fetch(`./api/place-details?id=${encodeURIComponent(button.dataset.id)}`);
    if (response.ok) {
      const place = await response.json();
      input.value = place.address || input.value;
      input.dataset.lat = place.lat;
      input.dataset.lon = place.lon;
    }
  });
  input.addEventListener('blur', () => setTimeout(() => menu.classList.remove('open'), 180));
}

function setStep(step) {
  state.step = Math.max(1, Math.min(3, step));
  $$('.step').forEach(el => el.classList.toggle('hidden', Number(el.dataset.step) !== state.step));
  const titles = ['Who’s meeting?', 'What are you looking for?', 'Ready to find your Between?'];
  $('#stepLabel').textContent = `STEP ${state.step} OF 3`;
  $('#stepTitle').textContent = titles[state.step - 1];
  $('#progressBar').style.width = `${state.step * 33.33}%`;
  $('#nextButton').innerHTML = state.step === 3 ? 'Find our Between <span>→</span>' : 'Continue <span>→</span>';
  if (state.step === 3) renderReview();
}

function renderReview() {
  state.people = collectPeople();
  $('#reviewCard').innerHTML = state.people.map(p => `<div class="review-person"><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.address)}</span></div>`).join('') + `<div class="review-person"><strong>Looking for</strong><span>${escapeHtml(state.category === 'restaurant' && state.cuisine !== 'restaurants' ? $('#cuisineFilter').selectedOptions[0].textContent : friendlyCategory(state.category))} · ${escapeHtml(state.price || 'any price')} · ${escapeHtml(state.sort.replace('_',' '))}</span></div>`;
}

function validateStep() {
  $('#formError').textContent = '';
  if (state.step === 1) {
    const people = collectPeople();
    if (people.length < 2 || people.some(person => !person.address)) {
      $('#formError').textContent = 'Add a starting location for at least two people.';
      return false;
    }
  }
  return true;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function geocode(address) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(address)}`;
  const response = await fetch(url, { headers: { 'Accept-Language': 'en-US,en' } });
  if (!response.ok) throw new Error('Location search is unavailable right now.');
  const data = await response.json();
  if (!data.length) throw new Error(`We could not find “${address}.” Try a full address or city.`);
  return { lat: Number(data[0].lat), lon: Number(data[0].lon), label: data[0].display_name };
}

async function findVenues(lat, lon, category, radius) {
  const params = new URLSearchParams({ lat, lon, radius: Math.round(radius), category, cuisine: state.cuisine, price: state.price, sort: state.sort, open_now: state.openNow ? 'true' : 'false' });
  try {
    const placesResponse = await fetch(`./api/places-search?${params}`);
    if (placesResponse.ok) {
      const places = await placesResponse.json();
      if (Array.isArray(places.businesses) && places.businesses.length) {
        state.placesPowered = true;
        state.optionsConsidered = places.businesses.length;
        return places.businesses.slice(0, 12);
      }
    }
  } catch (error) {
    console.info('Google place search unavailable; using OpenStreetMap venues.', error);
  }
  state.placesPowered = false;
  const tags = {
    cafe: 'node["amenity"="cafe"]', restaurant: 'node["amenity"="restaurant"]',
    bar: 'node["amenity"~"bar|pub"]', library: 'node["amenity"="library"]',
    park: 'node["leisure"="park"]', fast_food: 'node["amenity"~"fast_food|cafe|restaurant"]'
  };
  const tag = tags[category] || tags.cafe;
  const query = `[out:json][timeout:20];(${tag}(around:${Math.round(radius)},${lat},${lon});way${tag.slice(4)}(around:${Math.round(radius)},${lat},${lon}););out center 18;`;
  const response = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query });
  if (!response.ok) throw new Error('Venue search is temporarily busy. Please try again.');
  const data = await response.json();
  const fallback = data.elements.map((item, i) => ({
    id: item.id,
    name: item.tags?.name || `${friendlyCategory(category)} option ${i + 1}`,
    type: item.tags?.cuisine || item.tags?.amenity || item.tags?.leisure || friendlyCategory(category),
    lat: item.lat || item.center?.lat,
    lon: item.lon || item.center?.lon
  })).filter(item => item.lat && item.lon).slice(0, 12);
  state.optionsConsidered = fallback.length;
  return fallback;
}

async function routeMatrix(origins, venues) {
  try {
    const response = await fetch('./api/route-matrix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origins: origins.map(({ lat, lon }) => ({ lat, lon })),
        destinations: venues.map(({ lat, lon }) => ({ lat, lon }))
      })
    });
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.durations)) {
        state.trafficAware = data.trafficAware === true;
        return data.durations;
      }
    }
  } catch (error) {
    console.info('Traffic-aware routing unavailable; using road-network estimates.', error);
  }

  state.trafficAware = false;
  const points = [...origins, ...venues].map(p => `${p.lon},${p.lat}`).join(';');
  const sources = origins.map((_, i) => i).join(';');
  const destinations = venues.map((_, i) => i + origins.length).join(';');
  const url = `https://router.project-osrm.org/table/v1/driving/${points}?sources=${sources}&destinations=${destinations}&annotations=duration`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Drive-time calculation is unavailable right now.');
  const data = await response.json();
  if (data.code !== 'Ok') throw new Error('We could not calculate routes for those locations.');
  return data.durations;
}

function distanceMeters(a, b) {
  const rad = d => d * Math.PI / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
}

function friendlyCategory(value) {
  return ({cafe:'Coffee',restaurant:'Restaurant',bar:'Drinks',library:'Study spot',park:'Park',fast_food:'Casual spot'})[value] || value;
}

async function calculateBetween() {
  showScreen('loadingScreen');
  try {
    const origins = [];
    for (let i = 0; i < state.people.length; i++) {
      $('#loadingMessage').textContent = `Locating ${state.people[i].name}`;
      if (state.people[i].lat && state.people[i].lon) origins.push({ lat: state.people[i].lat, lon: state.people[i].lon, label: state.people[i].address });
      else { origins.push(await geocode(state.people[i].address)); if (i < state.people.length - 1) await wait(1050); }
    }
    const center = origins.reduce((acc, p) => ({ lat: acc.lat + p.lat / origins.length, lon: acc.lon + p.lon / origins.length }), {lat:0,lon:0});
    $('#loadingMessage').textContent = `Finding nearby ${friendlyCategory(state.category).toLowerCase()} options`;
    // Search close to the midpoint: about a third of the way to the farthest person, between 2 and 15 km.
    const spread = Math.max(...origins.map(p => distanceMeters(center, p)));
    const venues = await findVenues(center.lat, center.lon, state.category, Math.min(15000, Math.max(2000, spread / 3)));
    if (!venues.length) throw new Error('No matching venues were found near the fair meeting area. Try another category.');
    $('#loadingMessage').textContent = 'Comparing everyone’s traffic-aware drive times';
    const matrix = await routeMatrix(origins, venues);
    state.results = venues.map((venue, venueIndex) => {
      const times = matrix.map(row => row[venueIndex] == null ? null : Math.round(row[venueIndex] / 60));
      const valid = times.filter(Number.isFinite);
      const gap = valid.length ? Math.max(...valid) - Math.min(...valid) : 999;
      const average = valid.length ? Math.round(valid.reduce((a,b)=>a+b,0)/valid.length) : 999;
      // Fair and short: a 0-minute gap doesn't win if everyone drives an hour.
      return { ...venue, times, gap, average, score: average + gap };
    }).filter(r => r.gap < 999).sort((a,b) => a.score - b.score || a.gap - b.gap).slice(0, 12);
    // Show the screen first so the map knows its real size before it loads tiles.
    showScreen('resultsScreen');
    renderResults(origins);
  } catch (error) {
    showScreen('plannerScreen');
    setStep(1);
    $('#formError').textContent = error.message;
  }
}

// Send the place's name and street address (plus Google's place ID) instead of bare coordinates,
// which map apps can snap to the wrong street or the back of a building.
function directionsLinks(place) {
  const coords = `${place.lat},${place.lon}`;
  const where = encodeURIComponent(place.address ? `${place.name}, ${place.address}` : coords);
  const googlePlace = place.address && place.id && !/^\d+$/.test(String(place.id)) ? `&destination_place_id=${encodeURIComponent(place.id)}` : '';
  return [
    ['Google Maps', `https://www.google.com/maps/dir/?api=1&destination=${where}${googlePlace}`],
    ['Apple Maps', `https://maps.apple.com/?daddr=${place.address ? encodeURIComponent(place.address) : coords}&q=${encodeURIComponent(place.name)}`],
    ['Waze', place.address ? `https://waze.com/ul?q=${where}&navigate=yes` : `https://waze.com/ul?ll=${coords}&navigate=yes`]
  ];
}

function renderResults(origins) {
  const timingLabel = state.trafficAware ? 'Live traffic-aware ETA' : 'Road-network ETA';
  $('.results-heading h2').textContent = `Fair places everyone can reach · ${state.optionsConsidered} considered`;
  $('#resultCards').innerHTML = state.results.map((place, index) => `
    <article class="result-card ${index === 0 ? 'best' : ''}">
      <div><div class="rank">${index === 0 ? 'BEST BETWEEN' : `OPTION ${index + 1}`} · ${timingLabel.toUpperCase()}</div><div class="place-name">${escapeHtml(place.name)}</div><div class="place-type">${escapeHtml(place.type)}</div>
      ${place.rating ? `<div class="rating-meta"><span class="stars">★ ${place.rating}</span><span class="reviews">${place.reviewCount.toLocaleString()} Google reviews</span><span class="price">${escapeHtml(place.price || 'Price not listed')}</span></div>` : ''}
      <div class="eta-list">${place.times.map((time, i) => `<span class="eta"><b>${escapeHtml(state.people[i].name)}</b> · ${time} min</span>`).join('')}</div></div>
      <div class="gap-badge"><strong>${place.gap} min</strong><span>TIME GAP</span></div>
      <div class="place-actions">${place.placeUrl ? `<a class="map-link" href="${escapeHtml(place.placeUrl)}" target="_blank" rel="noopener">Google reviews</a>` : ''}${directionsLinks(place).map(([name,url]) => `<a class="map-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">${name}</a>`).join('')}</div>
    </article>`).join('');

  if (state.map) state.map.remove();
  state.map = L.map('map', { zoomControl: false, attributionControl: true }).setView([state.results[0].lat, state.results[0].lon], 12);
  L.control.zoom({ position: 'bottomright' }).addTo(state.map);
  // OpenFreeMap: a modern vector basemap that is free and needs no API key.
  const attribution = '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';
  if (L.maplibreGL && window.maplibregl?.supported?.() !== false) L.maplibreGL({ style: 'https://tiles.openfreemap.org/styles/positron', attribution }).addTo(state.map);
  else L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(state.map);
  const pin = (html, className, size) => L.divIcon({ html, className: `pin ${className}`, iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] });
  const best = state.results[0];
  origins.forEach((origin, i) => {
    const name = state.people[i].name;
    L.polyline([[origin.lat, origin.lon], [best.lat, best.lon]], { color: '#3f8efc', weight: 2, opacity: .45, dashArray: '4 7' }).addTo(state.map);
    L.marker([origin.lat, origin.lon], { icon: pin(escapeHtml(name.trim().charAt(0).toUpperCase() || i + 1), 'pin-person', 34) }).addTo(state.map).bindPopup(`${escapeHtml(name)} starts here`);
  });
  state.results.slice().reverse().forEach(place => {
    const i = state.results.indexOf(place);
    const icon = i === 0 ? pin('★', 'pin-best', 42) : pin(String(i + 1), 'pin-option', 26);
    L.marker([place.lat, place.lon], { icon, zIndexOffset: i === 0 ? 1000 : 0 }).addTo(state.map).bindPopup(`${i === 0 ? 'Best Between: ' : ''}${escapeHtml(place.name)}`);
  });
  // Frame everyone plus the top few options; refit once layout has settled.
  const bounds = [...origins, ...state.results.slice(0, 5)].map(p => [p.lat, p.lon]);
  const fit = () => { state.map.invalidateSize(); state.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 }); };
  fit();
  setTimeout(fit, 400);
}

function loadDemo() {
  $('#peopleList').innerHTML = '';
  addPerson('Maria', 'University of Southern California, Los Angeles');
  addPerson('Sofia', 'Santa Monica Pier, Santa Monica');
  addPerson('Alex', 'Silver Lake Reservoir, Los Angeles');
  showScreen('plannerScreen'); setStep(1);
}

$('#startButton').addEventListener('click', () => { $('#peopleList').innerHTML=''; addPerson('You'); addPerson('Friend'); showScreen('plannerScreen'); setStep(1); });
$('#demoButton').addEventListener('click', loadDemo);
$('#addPersonButton').addEventListener('click', () => addPerson());
$('#backButton').addEventListener('click', () => state.step === 1 ? showScreen('homeScreen') : setStep(state.step - 1));
$('#categoryGrid').addEventListener('click', event => { const button = event.target.closest('.category'); if (!button) return; $$('.category').forEach(b => b.classList.remove('selected')); button.classList.add('selected'); state.category = button.dataset.category; const dinner = state.category === 'restaurant'; $('#cuisineLabel').classList.toggle('hidden', !dinner); if (!dinner) { state.cuisine = 'restaurants'; $('#cuisineFilter').value = 'restaurants'; } });
$('#cuisineFilter').addEventListener('change', event => state.cuisine = event.target.value);
$('#priceFilter').addEventListener('change', event => state.price = event.target.value);
$('#sortFilter').addEventListener('change', event => state.sort = event.target.value);
$('#openNowFilter').addEventListener('change', event => state.openNow = event.target.checked);
$('#plannerForm').addEventListener('submit', event => { event.preventDefault(); if (!validateStep()) return; if (state.step < 3) setStep(state.step + 1); else { state.people = collectPeople(); calculateBetween(); } });
$('#newSearchButton').addEventListener('click', () => { showScreen('plannerScreen'); setStep(1); });
$('#shareButton').addEventListener('click', async () => { const text = `Our fairest option is ${state.results[0]?.name} with a ${state.results[0]?.gap}-minute travel-time gap.`; if (navigator.share) await navigator.share({title:'Our Between',text}); else { await navigator.clipboard.writeText(text); $('#shareButton').textContent='Copied!'; setTimeout(()=>$('#shareButton').textContent='Share to Messages or…',1600); } });

let installPrompt;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
$('#installButton').addEventListener('click', async () => {
  if (installPrompt) {
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    return;
  }
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  alert(isIOS
    ? 'To install Between: tap the Share button in Safari, then choose “Add to Home Screen.”'
    : 'Open this page in Chrome or Safari and choose “Install app” or “Add to Home Screen” from the browser menu.');
});
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
