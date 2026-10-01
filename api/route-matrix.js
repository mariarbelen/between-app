const GOOGLE_MATRIX_URL = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
const MAX_ORIGINS = 6;
const MAX_DESTINATIONS = 12;

function isCoordinate(point) {
  return point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lon)) &&
    Number(point.lat) >= -90 && Number(point.lat) <= 90 && Number(point.lon) >= -180 && Number(point.lon) <= 180;
}

function waypoint(point) {
  return {
    waypoint: {
      location: {
        latLng: { latitude: Number(point.lat), longitude: Number(point.lon) }
      }
    }
  };
}

function secondsFromDuration(duration) {
  if (typeof duration !== 'string') return null;
  const match = duration.match(/^([0-9]+(?:\.[0-9]+)?)s$/);
  return match ? Number(match[1]) : null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Traffic routing is not configured' });

  const { origins, destinations } = req.body || {};
  if (!Array.isArray(origins) || !Array.isArray(destinations) || origins.length < 2 ||
      origins.length > MAX_ORIGINS || destinations.length < 1 || destinations.length > MAX_DESTINATIONS ||
      !origins.every(isCoordinate) || !destinations.every(isCoordinate)) {
    return res.status(400).json({ error: 'Invalid route matrix request' });
  }

  try {
    const googleResponse = await fetch(GOOGLE_MATRIX_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,condition,status'
      },
      body: JSON.stringify({
        origins: origins.map(waypoint),
        destinations: destinations.map(waypoint),
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE_OPTIMAL'
      })
    });

    if (!googleResponse.ok) {
      const details = await googleResponse.text();
      console.error('Google Routes API error', googleResponse.status, details.slice(0, 500));
      return res.status(502).json({ error: 'Traffic provider request failed' });
    }

    const elements = await googleResponse.json();
    const durations = Array.from({ length: origins.length }, () => Array(destinations.length).fill(null));
    for (const element of elements) {
      if (element.condition === 'ROUTE_EXISTS') {
        durations[element.originIndex][element.destinationIndex] = secondsFromDuration(element.duration);
      }
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({ durations, trafficAware: true, calculatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Route matrix function failed', error);
    return res.status(500).json({ error: 'Traffic routing failed' });
  }
};
