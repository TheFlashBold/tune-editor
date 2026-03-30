const DOMAIN = 'theflashbold.github.io';
const API = 'https://signals.holzer-consulting.ch/api/event';
const V = 33;

let ignorePageview = false;
let listenersAttached = false;
let currentUrl = location.href;
let currentProps: Record<string, unknown> = {};
let focusStartTime = 0;
let accumulatedEngagementTime = 0;
let pageHeight = getPageHeight();
let maxScrollPosition = getMaxScrollPosition();
let lastScrollPosition = -1;

function send(payload: Record<string, unknown>) {
    try {
        fetch(API, {
            method: 'POST',
            headers: {'Content-Type': 'text/plain'},
            keepalive: true,
            body: JSON.stringify(payload),
        }).catch(() => {});
    } catch { /* noop */ }
}

function getPageHeight() {
    const body = document.body || {} as HTMLElement;
    const doc = document.documentElement || {} as HTMLElement;
    return Math.max(body.scrollHeight || 0, body.offsetHeight || 0, body.clientHeight || 0,
        doc.scrollHeight || 0, doc.offsetHeight || 0, doc.clientHeight || 0);
}

function getMaxScrollPosition() {
    const doc = document.documentElement || {} as HTMLElement;
    const viewportHeight = window.innerHeight || doc.clientHeight || 0;
    const scrollTop = window.scrollY || doc.scrollTop || (document.body || {} as HTMLElement).scrollTop || 0;
    return pageHeight <= viewportHeight ? pageHeight : scrollTop + viewportHeight;
}

function getEngagementTime() {
    return focusStartTime ? accumulatedEngagementTime + (Date.now() - focusStartTime) : accumulatedEngagementTime;
}

function sendEngagement() {
    const engagementTime = getEngagementTime();
    if (!ignorePageview && (lastScrollPosition < maxScrollPosition || engagementTime >= 3000)) {
        lastScrollPosition = maxScrollPosition;
        send({
            n: 'engagement',
            sd: Math.round(maxScrollPosition / pageHeight * 100),
            d: DOMAIN, u: currentUrl, p: currentProps, e: engagementTime, v: V,
        });
        focusStartTime = 0;
        accumulatedEngagementTime = 0;
    }
}

function onVisibilityOrFocusChange() {
    if (document.visibilityState === 'visible' && document.hasFocus() && focusStartTime === 0) {
        focusStartTime = Date.now();
    } else if (document.visibilityState === 'hidden' || !document.hasFocus()) {
        accumulatedEngagementTime = getEngagementTime();
        focusStartTime = 0;
        sendEngagement();
    }
}

function isIgnored(): boolean {
    if (/^localhost$|^127(\.[0-9]+){0,2}\.[0-9]+$|^\[::1?\]$/.test(location.hostname) || location.protocol === 'file:') return true;
    if ((window as any)._phantom || (window as any).__nightmare || navigator.webdriver || (window as any).Cypress) return true;
    try { if (localStorage.plausible_ignore === 'true') return true; } catch { /* noop */ }
    return false;
}

export function track(event: string, props?: Record<string, string | number | boolean>) {
    const isPageview = event === 'pageview';

    if (isPageview && listenersAttached) {
        sendEngagement();
        pageHeight = getPageHeight();
        maxScrollPosition = getMaxScrollPosition();
    }

    if (isIgnored()) {
        if (isPageview) ignorePageview = true;
        return;
    }

    const payload: Record<string, unknown> = {
        n: event, u: location.href, d: DOMAIN, r: document.referrer || null, v: V,
    };
    if (props) payload.p = props;

    if (isPageview) {
        ignorePageview = false;
        currentUrl = payload.u as string;
        currentProps = (payload.p || {}) as Record<string, unknown>;
        lastScrollPosition = -1;
        accumulatedEngagementTime = 0;
        focusStartTime = Date.now();
        if (!listenersAttached) {
            document.addEventListener('visibilitychange', onVisibilityOrFocusChange);
            window.addEventListener('blur', onVisibilityOrFocusChange);
            window.addEventListener('focus', onVisibilityOrFocusChange);
            listenersAttached = true;
        }
    }

    send(payload);
}

// Scroll tracking
document.addEventListener('scroll', () => {
    pageHeight = getPageHeight();
    const pos = getMaxScrollPosition();
    if (pos > maxScrollPosition) maxScrollPosition = pos;
});

// Initial pageview
track('pageview');
