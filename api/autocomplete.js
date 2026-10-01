const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const input = String(req.query.q || '').trim().slice(0, 160);
  if (!apiKey) return res.status(503).json({ error: 'Address suggestions are not configured' });
  if (input.length < 3) return res.status(200).json({ suggestions: [] });
  try {
    const response = await fetch(AUTOCOMPLETE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text'
      },
      body: JSON.stringify({ input, includedRegionCodes: ['us'], languageCode: 'en' })
    });
    if (!response.ok) throw new Error(`Google Places returned ${response.status}`);
    const data = await response.json();
    const suggestions = (data.suggestions || []).map(item => item.placePrediction).filter(Boolean).map(item => ({ id: item.placeId, text: item.text?.text })).filter(item => item.id && item.text);
    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.status(200).json({ suggestions });
  } catch (error) {
    console.error('Autocomplete failed', error);
    return res.status(502).json({ error: 'Address suggestions failed' });
  }
};
