const TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const ALLOWED_SORTS = new Set(['best_match', 'rating', 'review_count', 'distance']);
const PRICE_LEVELS = { '1': 'PRICE_LEVEL_INEXPENSIVE', '2': 'PRICE_LEVEL_MODERATE', '3': 'PRICE_LEVEL_EXPENSIVE', '4': 'PRICE_LEVEL_VERY_EXPENSIVE' };
const PRICE_SIGNS = { PRICE_LEVEL_FREE: 'Free', PRICE_LEVEL_INEXPENSIVE: '$', PRICE_LEVEL_MODERATE: '$$', PRICE_LEVEL_EXPENSIVE: '$$$', PRICE_LEVEL_VERY_EXPENSIVE: '$$$$' };
const ALLOWED_PRICES = new Set(['', '1', '1,2', '2,3', '3,4', '4']);
const CUISINES = {
  restaurants: 'restaurants', italian: 'Italian restaurants', mexican: 'Mexican restaurants', japanese: 'Japanese restaurants',
  chinese: 'Chinese restaurants', korean: 'Korean restaurants', thai: 'Thai restaurants', indpak: 'Indian restaurants',
  mediterranean: 'Mediterranean restaurants', newamerican: 'American restaurants', vegan: 'vegan restaurants',
  seafood: 'seafood restaurants', steak: 'steakhouses'
};
const FIELD_MASK = [
  'places.id', 'places.displayName', 'places.location', 'places.rating', 'places.userRatingCount',
  'places.priceLevel', 'places.googleMapsUri', 'places.formattedAddress', 'places.primaryTypeDisplayName'
].join(',');

// Text Search can only strictly limit results to a rectangle, so box in the circle around the midpoint.
function boxAround(lat, lon, radius) {
  const dLat = radius / 111320;
  const dLon = radius / (111320 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
  return { rectangle: { low: { latitude: lat - dLat, longitude: lon - dLon }, high: { latitude: lat + dLat, longitude: lon + dLon } } };
}

async function search(apiKey, body) {
  const response = await fetch(TEXT_SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': FIELD_MASK },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Google Places returned ${response.status}`);
  return (await response.json()).places || [];
}

function queryFor(category, cuisine) {
  if (category === 'cafe') return 'coffee shops and cafes';
  if (category === 'bar') return 'bars and pubs';
  if (category === 'park') return 'parks';
  if (category === 'library') return 'libraries';
  if (category === 'fast_food') return 'fast food and casual restaurants';
  return CUISINES[cuisine] || 'restaurants';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Place search is not configured' });

  const lat = Number(req.query.lat), lon = Number(req.query.lon);
  const sort = ALLOWED_SORTS.has(req.query.sort) ? req.query.sort : 'best_match';
  const radius = Math.min(30000, Math.max(1000, Number(req.query.radius) || 5000));
  const price = ALLOWED_PRICES.has(req.query.price || '') ? (req.query.price || '') : '';
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return res.status(400).json({ error: 'Invalid search location' });

  const body = {
    textQuery: queryFor(req.query.category, req.query.cuisine),
    pageSize: 20,
    languageCode: 'en',
    rankPreference: sort === 'distance' ? 'DISTANCE' : 'RELEVANCE',
    locationRestriction: boxAround(lat, lon, radius)
  };
  if (req.query.open_now === 'true') body.openNow = true;
  if (price) body.priceLevels = price.split(',').map(p => PRICE_LEVELS[p]);

  try {
    // One request per search (two only when the area is empty) keeps usage inside Google's free monthly allowance.
    let places = await search(apiKey, body);
    if (!places.length) places = await search(apiKey, { ...body, locationRestriction: boxAround(lat, lon, radius * 2) });
    const businesses = places.filter(p => p.location?.latitude && p.location?.longitude).map(p => ({
      id: p.id, name: p.displayName?.text || 'Unnamed place', lat: p.location.latitude, lon: p.location.longitude,
      type: p.primaryTypeDisplayName?.text || '', rating: p.rating, reviewCount: p.userRatingCount || 0,
      price: PRICE_SIGNS[p.priceLevel] || '', placeUrl: p.googleMapsUri || '', address: p.formattedAddress || ''
    }));
    if (sort === 'rating') businesses.sort((a, b) => (b.rating || 0) - (a.rating || 0) || b.reviewCount - a.reviewCount);
    if (sort === 'review_count') businesses.sort((a, b) => b.reviewCount - a.reviewCount);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ businesses, total: businesses.length, poweredBy: 'Google' });
  } catch (error) {
    console.error('Google place search failed', error);
    return res.status(502).json({ error: 'Place search failed' });
  }
};
