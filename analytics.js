// Hawaii Car Price Index — Shared Analytics
// Loaded on all pages for Vercel Web Analytics + Speed Insights

// Vercel Web Analytics
(function() {
    var s = document.createElement('script');
    s.defer = true;
    s.src = '/_vercel/insights/script.js';
    document.head.appendChild(s);
})();

// Vercel Speed Insights
(function() {
    var s = document.createElement('script');
    s.defer = true;
    s.src = '/_vercel/speed-insights/script.js';
    document.head.appendChild(s);
})();

// Simple page view tracking (logged to console, ready for any analytics backend)
console.log('[HCPI]', {
    event: 'pageview',
    path: window.location.pathname,
    referrer: document.referrer,
    timestamp: new Date().toISOString()
});
