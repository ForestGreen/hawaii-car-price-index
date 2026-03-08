// ═══════════════════════════════════════════════════════════
// Hawaii Car Price Index — User Tracking & Analytics
// Version 2.0
//
// Tracks: pageviews, sessions, scroll depth, time on page,
//         outbound clicks, CTA clicks, calculator usage,
//         email signups, and custom events.
//
// All data is sent to /api/track (Vercel serverless function)
// and viewable in Vercel Dashboard > Logs (filter: HCPI_TRACK)
//
// Privacy: No cookies. Uses sessionStorage for session ID.
// Partial IP logged server-side. No PII collected.
// ═══════════════════════════════════════════════════════════

(function() {
    'use strict';

    var ENDPOINT = '/api/track';
    var FLUSH_INTERVAL = 10000; // batch-send every 10s
    var queue = [];

    // ── Session & User ID ──────────────────────────────────
    // Session: new per tab/window (sessionStorage)
    // User: persists across sessions (localStorage), anonymous
    function getSessionId() {
        var sid = sessionStorage.getItem('hcpi_sid');
        if (!sid) {
            sid = 's_' + Math.random().toString(36).slice(2, 12) + '_' + Date.now().toString(36);
            sessionStorage.setItem('hcpi_sid', sid);
        }
        return sid;
    }

    function getUserId() {
        var uid;
        try {
            uid = localStorage.getItem('hcpi_uid');
            if (!uid) {
                uid = 'u_' + Math.random().toString(36).slice(2, 14) + '_' + Date.now().toString(36);
                localStorage.setItem('hcpi_uid', uid);
            }
        } catch(e) {
            uid = 'anon_' + Math.random().toString(36).slice(2, 10);
        }
        return uid;
    }

    function isNewUser() {
        try {
            var visits = parseInt(localStorage.getItem('hcpi_visits') || '0', 10);
            localStorage.setItem('hcpi_visits', String(visits + 1));
            return visits === 0;
        } catch(e) {
            return true;
        }
    }

    function getVisitCount() {
        try { return parseInt(localStorage.getItem('hcpi_visits') || '1', 10); }
        catch(e) { return 1; }
    }

    var SID = getSessionId();
    var UID = getUserId();
    var IS_NEW = isNewUser();
    var VISIT_COUNT = getVisitCount();
    var PAGE_START = Date.now();

    // ── Device Info ────────────────────────────────────────
    function getDevice() {
        var w = window.innerWidth;
        var type = w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop';
        return {
            type: type,
            w: w,
            h: window.innerHeight,
            dpr: window.devicePixelRatio || 1,
            touch: 'ontouchstart' in window,
            lang: (navigator.language || '').slice(0, 10)
        };
    }

    // ── UTM / Referrer Parsing ─────────────────────────────
    function getUtm() {
        var params = new URLSearchParams(window.location.search);
        var utm = {};
        ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(function(k) {
            var v = params.get(k);
            if (v) utm[k.replace('utm_', '')] = v.slice(0, 100);
        });
        return Object.keys(utm).length ? utm : null;
    }

    function getReferrerType() {
        var ref = document.referrer;
        if (!ref) return 'direct';
        try {
            var host = new URL(ref).hostname;
            if (host.includes('google')) return 'google';
            if (host.includes('bing')) return 'bing';
            if (host.includes('facebook') || host.includes('fb.')) return 'facebook';
            if (host.includes('reddit')) return 'reddit';
            if (host.includes('twitter') || host.includes('t.co') || host.includes('x.com')) return 'twitter';
            if (host.includes('instagram')) return 'instagram';
            if (host.includes('tiktok')) return 'tiktok';
            if (host.includes('youtube')) return 'youtube';
            if (host.includes('hawaiicarpriceindex.com')) return 'internal';
            return 'other';
        } catch(e) { return 'other'; }
    }

    // ── Core Tracking ──────────────────────────────────────
    function track(type, data) {
        queue.push({
            type: type,
            sid: SID,
            uid: UID,
            path: window.location.pathname,
            referrer: document.referrer,
            title: document.title.slice(0, 150),
            ts: Date.now(),
            data: data || null,
            device: getDevice()
        });
    }

    function flush() {
        if (queue.length === 0) return;
        var batch = queue.splice(0, queue.length);
        try {
            if (navigator.sendBeacon) {
                navigator.sendBeacon(ENDPOINT, JSON.stringify(batch));
            } else {
                fetch(ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(batch),
                    keepalive: true
                }).catch(function() {});
            }
        } catch(e) {}
    }

    // ── 1. PAGEVIEW ────────────────────────────────────────
    track('pageview', {
        isNew: IS_NEW,
        visitCount: VISIT_COUNT,
        utm: getUtm(),
        refType: getReferrerType(),
        hash: window.location.hash || null,
        queryParams: window.location.search ? Object.fromEntries(new URLSearchParams(window.location.search)) : null
    });

    // ── 2. SCROLL DEPTH ────────────────────────────────────
    var maxScroll = 0;
    var scrollMilestones = { 25: false, 50: false, 75: false, 90: false, 100: false };

    function onScroll() {
        var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        var docHeight = Math.max(
            document.body.scrollHeight, document.documentElement.scrollHeight,
            document.body.offsetHeight, document.documentElement.offsetHeight
        );
        var winHeight = window.innerHeight;
        var pct = Math.min(100, Math.round((scrollTop + winHeight) / docHeight * 100));

        if (pct > maxScroll) {
            maxScroll = pct;
            [25, 50, 75, 90, 100].forEach(function(milestone) {
                if (pct >= milestone && !scrollMilestones[milestone]) {
                    scrollMilestones[milestone] = true;
                    track('scroll', { depth: milestone });
                }
            });
        }
    }
    window.addEventListener('scroll', throttle(onScroll, 500), { passive: true });

    // ── 3. TIME ON PAGE ────────────────────────────────────
    var engagedTime = 0;
    var isVisible = true;
    var lastTick = Date.now();

    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            engagedTime += Date.now() - lastTick;
            isVisible = false;
        } else {
            lastTick = Date.now();
            isVisible = true;
        }
    });

    // Send time-on-page heartbeat every 30s
    setInterval(function() {
        if (isVisible) {
            engagedTime += Date.now() - lastTick;
            lastTick = Date.now();
        }
        if (engagedTime > 5000) { // only track if >5s engaged
            track('heartbeat', {
                engaged_ms: engagedTime,
                engaged_s: Math.round(engagedTime / 1000),
                maxScroll: maxScroll
            });
        }
    }, 30000);

    // ── 4. OUTBOUND LINK CLICKS ────────────────────────────
    document.addEventListener('click', function(e) {
        var el = e.target.closest('a[href]');
        if (!el) return;
        var href = el.getAttribute('href') || '';

        // Outbound link
        if (href.startsWith('http') && !href.includes('hawaiicarpriceindex.com')) {
            track('outbound_click', {
                url: href.slice(0, 500),
                text: (el.textContent || '').trim().slice(0, 100)
            });
        }

        // CTA button clicks
        if (el.classList.contains('nav-cta') || el.closest('.bottom-cta') || el.closest('.cta-bar')) {
            track('cta_click', {
                url: href.slice(0, 500),
                text: (el.textContent || '').trim().slice(0, 100),
                location: el.closest('.bottom-cta') ? 'bottom_cta' :
                          el.closest('.cta-bar') ? 'page_cta' : 'nav_cta'
            });
        }

        // Guide card clicks (from homepage)
        if (el.classList.contains('why-card') || el.closest('.why-card')) {
            var card = el.classList.contains('why-card') ? el : el.closest('.why-card');
            track('guide_click', {
                url: href.slice(0, 500),
                title: (card.querySelector('h3') || {}).textContent || ''
            });
        }

        // Vehicle model clicks (from Browse by Model or Popular Models)
        if (href.startsWith('/prices/')) {
            track('model_click', {
                url: href,
                model: (el.textContent || '').trim().slice(0, 60),
                source: el.closest('#models') ? 'browse_grid' :
                        el.closest('.card-grid') ? 'island_popular' : 'inline_link'
            });
        }

        // Island page clicks
        if (/^\/(oahu|maui|big-island|kauai)/.test(href)) {
            track('island_click', {
                island: href.replace('/', ''),
                source: el.closest('.island-grid') ? 'island_grid' :
                        el.closest('footer') ? 'footer' : 'inline'
            });
        }
    });

    // ── 5. BUTTON CLICKS ───────────────────────────────────
    document.addEventListener('click', function(e) {
        var btn = e.target.closest('button');
        if (!btn) return;

        var text = (btn.textContent || '').trim().slice(0, 80);

        // Calculator submit
        if (text.includes('Check Price') || text.includes('Calculate') || btn.id === 'calc-btn') {
            var make = (document.getElementById('make') || {}).value || '';
            var model = (document.getElementById('model') || {}).value || '';
            var year = (document.getElementById('year') || {}).value || '';
            var island = (document.getElementById('island') || {}).value || '';
            track('calculator_use', { make: make, model: model, year: year, island: island });
        }

        // Email signup buttons
        if (text.includes('Alert') || text.includes('Subscribe') || text.includes('Sign Up') || text.includes('Get Free')) {
            track('signup_click', {
                text: text,
                location: btn.closest('.bottom-cta') ? 'bottom_cta' :
                          btn.closest('#lead-capture') ? 'calculator' :
                          btn.closest('.cta-bar') ? 'page_cta' : 'other'
            });
        }

        // FAQ toggles
        if (btn.closest('.faq-q') || text.includes('?')) {
            track('faq_click', {
                question: text.slice(0, 120),
                path: window.location.pathname
            });
        }

        // Hamburger menu
        if (btn.classList.contains('hamburger')) {
            track('hamburger_toggle', {});
        }
    });

    // ── 6. FORM SUBMISSIONS ────────────────────────────────
    // Track successful email captures (hook into existing functions)
    var _origSubmitLead = window.submitLead;
    var _origSubmitBottom = window.submitBottomEmail;

    if (typeof _origSubmitLead === 'function') {
        window.submitLead = function() {
            var email = (document.getElementById('lead-email') || {}).value || '';
            if (email && email.includes('@')) {
                track('email_captured', {
                    source: 'calculator',
                    hasEmail: true,
                    make: (document.getElementById('make') || {}).value || '',
                    model: (document.getElementById('model') || {}).value || ''
                });
            }
            return _origSubmitLead.apply(this, arguments);
        };
    }

    if (typeof _origSubmitBottom === 'function') {
        window.submitBottomEmail = function() {
            var email = (document.getElementById('bottom-email') || {}).value || '';
            if (email && email.includes('@')) {
                track('email_captured', { source: 'bottom_cta', hasEmail: true });
            }
            return _origSubmitBottom.apply(this, arguments);
        };
    }

    // ── 7. SEARCH / QUERY TRACKING ─────────────────────────
    // If user arrived from Google, extract search query (rarely available but worth trying)
    (function() {
        var ref = document.referrer;
        if (ref && ref.includes('google.com/search')) {
            try {
                var q = new URL(ref).searchParams.get('q');
                if (q) track('search_arrival', { query: q.slice(0, 200), engine: 'google' });
            } catch(e) {}
        }
    })();

    // ── 8. PAGE EXIT ───────────────────────────────────────
    function onExit() {
        if (isVisible) engagedTime += Date.now() - lastTick;
        track('page_exit', {
            engaged_s: Math.round(engagedTime / 1000),
            maxScroll: maxScroll,
            totalTime_s: Math.round((Date.now() - PAGE_START) / 1000)
        });
        flush();
    }

    // Use both pagehide and visibilitychange for reliability
    window.addEventListener('pagehide', onExit);
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') onExit();
    });

    // ── Batch Flush Timer ──────────────────────────────────
    setInterval(flush, FLUSH_INTERVAL);

    // Initial flush after 2s (send pageview quickly)
    setTimeout(flush, 2000);

    // ── Vercel Web Analytics + Speed Insights ──────────────
    (function() {
        var s = document.createElement('script');
        s.defer = true;
        s.src = '/_vercel/insights/script.js';
        document.head.appendChild(s);
    })();
    (function() {
        var s = document.createElement('script');
        s.defer = true;
        s.src = '/_vercel/speed-insights/script.js';
        document.head.appendChild(s);
    })();

    // ── Utility ────────────────────────────────────────────
    function throttle(fn, wait) {
        var last = 0;
        return function() {
            var now = Date.now();
            if (now - last >= wait) {
                last = now;
                fn.apply(this, arguments);
            }
        };
    }

    // ── Public API ─────────────────────────────────────────
    // Allow other scripts to track custom events:
    // window.hcpi.track('custom_event', { key: 'value' })
    window.hcpi = {
        track: track,
        flush: flush,
        getSid: function() { return SID; },
        getUid: function() { return UID; }
    };

})();
