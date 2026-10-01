module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const id = String(req.query.id || '');
  if (!apiKey) return res.status(503).json({ error: 'Place details are not configured' });
  if (!/^[A-Za-z0-9_-]{10,300}$/.test(id)) return res.status(400).json({ error: 'Invalid place identifier' });
  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
      headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'formattedAddress,location' }
    });
    if (!response.ok) throw new Error(`Google Places returned ${response.status}`);
    const place = await response.json();
    return res.status(200).json({ address: place.formattedAddress, lat: place.location?.latitude, lon: place.location?.longitude });
  } catch (error) {
    console.error('Place details failed', error);
    return res.status(502).json({ error: 'Place details failed' });
  }
};
