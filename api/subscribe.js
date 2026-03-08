// Vercel Serverless Function — Email Capture
// Stores emails in Vercel KV (or logs them for now)
// POST /api/subscribe { email, source, make?, model?, year?, island? }

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', 'https://hawaiicarpriceindex.com');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { email, source, make, model, year, island } = req.body;

        // Validate email
        if (!email || !email.includes('@') || !email.includes('.')) {
            return res.status(400).json({ error: 'Invalid email address' });
        }

        // Sanitize
        const cleanEmail = email.trim().toLowerCase().slice(0, 254);
        const timestamp = new Date().toISOString();

        // Log the subscription (visible in Vercel Runtime Logs)
        console.log(JSON.stringify({
            event: 'email_subscribe',
            email: cleanEmail,
            source: source || 'unknown',
            make: make || null,
            model: model || null,
            year: year || null,
            island: island || null,
            timestamp,
            ip: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown',
            userAgent: req.headers['user-agent']?.slice(0, 200) || 'unknown'
        }));

        // TODO: When ready, connect to:
        // - Vercel KV: await kv.set(`sub:${cleanEmail}`, { source, make, model, year, island, timestamp });
        // - ConvertKit: await fetch('https://api.convertkit.com/v3/forms/FORM_ID/subscribe', { ... });
        // - Mailchimp: await fetch('https://us1.api.mailchimp.com/3.0/lists/LIST_ID/members', { ... });

        return res.status(200).json({
            success: true,
            message: 'Subscribed successfully'
        });

    } catch (error) {
        console.error('Subscribe error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
}
