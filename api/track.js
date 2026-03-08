// Hawaii Car Price Index — Event Tracking API
// POST /api/track
// Receives pageview, event, and session data from analytics.js
// All events are logged as structured JSON to Vercel Runtime Logs
// View in: Vercel Dashboard > Project > Logs > filter "HCPI_TRACK"

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    try {
        const events = Array.isArray(req.body) ? req.body : [req.body];
        const ip = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim();
        const ua = (req.headers['user-agent'] || '').slice(0, 300);
        const geo = {
            country: req.headers['x-vercel-ip-country'] || null,
            region: req.headers['x-vercel-ip-country-region'] || null,
            city: req.headers['x-vercel-ip-city'] || null,
        };

        for (const evt of events) {
            if (!evt || !evt.type) continue;

            const record = {
                _tag: 'HCPI_TRACK',
                type: String(evt.type).slice(0, 50),
                sid: String(evt.sid || '').slice(0, 40),
                uid: String(evt.uid || '').slice(0, 40),
                path: String(evt.path || '').slice(0, 500),
                referrer: String(evt.referrer || '').slice(0, 500),
                title: String(evt.title || '').slice(0, 200),
                ts: evt.ts || Date.now(),
                // Event-specific data
                data: evt.data ? JSON.parse(JSON.stringify(evt.data)) : null,
                // Server-enriched
                ip: ip.replace(/\.\d+$/, '.x'), // partial IP for privacy
                ua,
                geo,
                // Device info from client
                device: evt.device || null,
            };

            // Structured log — searchable in Vercel Logs
            console.log(JSON.stringify(record));
        }

        // Forward to analytics aggregator (fire-and-forget)
        try {
            const host = req.headers.host || 'hawaiicarpriceindex.com';
            const proto = host.includes('localhost') ? 'http' : 'https';
            fetch(`${proto}://${host}/api/analytics`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(events)
            }).catch(() => {});
        } catch(e) {}

        return res.status(200).json({ ok: true, count: events.length });
    } catch (err) {
        console.error('HCPI_TRACK_ERROR', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
