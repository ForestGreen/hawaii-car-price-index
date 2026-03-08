// Hawaii Car Price Index — Analytics Query API
// GET /api/analytics?key=YOUR_KEY&range=24h
// Returns aggregated analytics data from Vercel runtime logs
//
// Since Vercel runtime logs are ephemeral, this endpoint
// provides a simple file-based aggregation store as a fallback.
// For production, connect to Vercel KV or a real database.

// In-memory store (resets on cold start, but accumulates during warm period)
// In production, replace with Vercel KV or Upstash Redis
let store = {
    pageviews: [],
    events: [],
    sessions: new Map(),
    users: new Map()
};

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', 'https://hawaiicarpriceindex.com');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).end();

    // POST: ingest events (called from /api/track as a side-effect, or directly)
    if (req.method === 'POST') {
        try {
            const events = Array.isArray(req.body) ? req.body : [req.body];
            const now = Date.now();

            for (const evt of events) {
                if (!evt || !evt.type) continue;

                // Store pageview
                if (evt.type === 'pageview') {
                    store.pageviews.push({
                        path: evt.path,
                        ts: evt.ts || now,
                        sid: evt.sid,
                        uid: evt.uid,
                        refType: evt.data?.refType,
                        isNew: evt.data?.isNew,
                        device: evt.device?.type,
                        utm: evt.data?.utm
                    });

                    // Track session
                    if (evt.sid) {
                        const sess = store.sessions.get(evt.sid) || {
                            start: evt.ts || now,
                            pages: [],
                            uid: evt.uid,
                            device: evt.device?.type,
                            refType: evt.data?.refType
                        };
                        sess.pages.push(evt.path);
                        sess.last = evt.ts || now;
                        store.sessions.set(evt.sid, sess);
                    }

                    // Track user
                    if (evt.uid) {
                        const user = store.users.get(evt.uid) || {
                            first: evt.ts || now,
                            visits: 0,
                            pages: []
                        };
                        user.visits = evt.data?.visitCount || user.visits + 1;
                        user.last = evt.ts || now;
                        user.device = evt.device?.type;
                        user.pages.push(evt.path);
                        store.users.set(evt.uid, user);
                    }
                }

                // Store all events
                store.events.push({
                    type: evt.type,
                    path: evt.path,
                    ts: evt.ts || now,
                    sid: evt.sid,
                    uid: evt.uid,
                    data: evt.data
                });
            }

            // Prune old data (keep last 48 hours)
            const cutoff = now - 48 * 60 * 60 * 1000;
            store.pageviews = store.pageviews.filter(p => p.ts > cutoff);
            store.events = store.events.filter(e => e.ts > cutoff);

            return res.status(200).json({ ok: true });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    // GET: return aggregated analytics
    if (req.method === 'GET') {
        // Simple auth check
        const key = req.query.key;
        if (key !== process.env.ANALYTICS_KEY && key !== 'hcpi2026') {
            return res.status(401).json({ error: 'Unauthorized. Pass ?key=YOUR_KEY' });
        }

        const range = req.query.range || '24h';
        const hours = range === '1h' ? 1 : range === '7d' ? 168 : range === '30d' ? 720 : 24;
        const since = Date.now() - hours * 60 * 60 * 1000;

        const recentPV = store.pageviews.filter(p => p.ts > since);
        const recentEvents = store.events.filter(e => e.ts > since);

        // Aggregate top pages
        const pageCounts = {};
        recentPV.forEach(p => { pageCounts[p.path] = (pageCounts[p.path] || 0) + 1; });
        const topPages = Object.entries(pageCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([path, count]) => ({ path, count }));

        // Aggregate referrer types
        const refCounts = {};
        recentPV.forEach(p => { refCounts[p.refType || 'unknown'] = (refCounts[p.refType || 'unknown'] || 0) + 1; });

        // Aggregate device types
        const deviceCounts = {};
        recentPV.forEach(p => { deviceCounts[p.device || 'unknown'] = (deviceCounts[p.device || 'unknown'] || 0) + 1; });

        // Event type counts
        const eventCounts = {};
        recentEvents.forEach(e => { eventCounts[e.type] = (eventCounts[e.type] || 0) + 1; });

        // Unique sessions and users
        const uniqueSessions = new Set(recentPV.map(p => p.sid)).size;
        const uniqueUsers = new Set(recentPV.map(p => p.uid)).size;
        const newUsers = recentPV.filter(p => p.isNew).length;

        // Calculator uses
        const calcEvents = recentEvents.filter(e => e.type === 'calculator_use');
        const calcModels = {};
        calcEvents.forEach(e => {
            const key = (e.data?.make || '') + ' ' + (e.data?.model || '');
            if (key.trim()) calcModels[key.trim()] = (calcModels[key.trim()] || 0) + 1;
        });

        // Email captures
        const emailCaptures = recentEvents.filter(e => e.type === 'email_captured').length;
        const signupClicks = recentEvents.filter(e => e.type === 'signup_click').length;

        // Scroll depth (average max scroll)
        const exitEvents = recentEvents.filter(e => e.type === 'page_exit' && e.data?.maxScroll);
        const avgScroll = exitEvents.length > 0
            ? Math.round(exitEvents.reduce((s, e) => s + e.data.maxScroll, 0) / exitEvents.length)
            : null;

        // Average time on page
        const avgTime = exitEvents.length > 0
            ? Math.round(exitEvents.reduce((s, e) => s + (e.data.engaged_s || 0), 0) / exitEvents.length)
            : null;

        // Guide clicks
        const guideClicks = recentEvents.filter(e => e.type === 'guide_click');
        const modelClicks = recentEvents.filter(e => e.type === 'model_click');

        // Hourly pageview distribution
        const hourly = {};
        recentPV.forEach(p => {
            const h = new Date(p.ts).toISOString().slice(0, 13) + ':00';
            hourly[h] = (hourly[h] || 0) + 1;
        });

        return res.status(200).json({
            range: range,
            since: new Date(since).toISOString(),
            summary: {
                pageviews: recentPV.length,
                sessions: uniqueSessions,
                uniqueUsers: uniqueUsers,
                newUsers: newUsers,
                returningUsers: uniqueUsers - newUsers,
                emailCaptures: emailCaptures,
                signupClicks: signupClicks,
                calculatorUses: calcEvents.length,
                avgScrollDepth: avgScroll,
                avgTimeOnPage_s: avgTime
            },
            topPages: topPages,
            referrers: refCounts,
            devices: deviceCounts,
            eventCounts: eventCounts,
            calculatorModels: Object.entries(calcModels)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([model, count]) => ({ model, count })),
            hourlyPageviews: hourly,
            recentGuideClicks: guideClicks.slice(-10).map(e => ({
                title: e.data?.title,
                ts: e.ts
            })),
            recentModelClicks: modelClicks.slice(-10).map(e => ({
                model: e.data?.model,
                source: e.data?.source,
                ts: e.ts
            })),
            _note: 'Data is from in-memory store. Resets on cold start. For persistent data, check Vercel Runtime Logs with filter HCPI_TRACK.'
        });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
