# Between

Between is an installable mobile-first web app that finds fair meeting places using actual driving times rather than a geographic midpoint.

## Run locally

Serve this folder over HTTP. For example:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## MVP capabilities

- Add 2–6 people and starting locations
- Select starting locations from Google-powered address suggestions
- Choose a venue category
- Filter restaurants by cuisine, price level, open-now status, Google rating priority, review count, or distance
- Geocode addresses with OpenStreetMap Nominatim
- Search up to 20 places with Google Places and show Google ratings, review counts, price levels, categories, and links
- Traffic-rank a practical shortlist of up to 12 places from the filtered Google results
- Fall back to nearby OpenStreetMap venues when Google Places is not configured
- Compare live traffic-aware driving times with Google Routes API
- Fall back to OSRM road-network estimates when traffic routing is not configured
- Rank options by the gap between the longest and shortest trip
- Open directions in Google Maps, Apple Maps, or Waze
- Install as a Progressive Web App
- Share the winning recommendation

## Deploy with live traffic on Vercel

1. Push this folder to a GitHub repository.
2. Import the repository at [vercel.com](https://vercel.com).
3. In Google Cloud, enable **Routes API** and connect billing.
4. Also enable **Places API (New)** for the starting-location dropdown.
5. Create an API key restricted to Routes API and Places API (New).
6. In the Vercel project, open **Settings → Environment Variables**.
7. Add `GOOGLE_MAPS_API_KEY`.
8. Redeploy the project.

The API key is read only by the serverless functions in `api/`. Never place the key in `app.js`, commit it to GitHub, or include it in a screenshot.

When the key is connected, result cards display **Live traffic-aware ETA**. Without the key, the app remains usable and displays **Road-network ETA**.

## Messages extension roadmap

The installable web app can share a result link through the phone's standard share sheet. A true app that appears inside Apple Messages requires a separate native iOS container app and iMessage extension built with Xcode and Apple's Messages framework. That native target is a later release and cannot be delivered by this PWA alone.

## Production note

The public OpenStreetMap, Overpass, and OSRM endpoints are suitable for a limited portfolio demo, not heavy production traffic. Before a public launch, connect managed geocoding, places, and routing services and add a small backend to protect API credentials and enforce rate limits.
