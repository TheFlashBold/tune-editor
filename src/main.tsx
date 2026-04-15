import {render} from 'preact'
import './index.css'
import {App} from './app.tsx'
import {track} from "./lib/track.ts";

const MIN_SPLASH_MS = 1000;
const splashStart = performance.now();
const SW_CLEANUP_KEY = 'tune-editor-sw-cleanup-v1';
const SW_RELOAD_KEY = 'tune-editor-sw-reloaded-v1';

function mount() {
    const elapsed = performance.now() - splashStart;
    const remaining = Math.max(0, MIN_SPLASH_MS - elapsed);
    setTimeout(() => render(<App/>, document.getElementById('app')!), remaining);
}

async function cleanupLegacyServiceWorkers() {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (localStorage.getItem(SW_CLEANUP_KEY) === 'done') return;

    try {
        const regs = await navigator.serviceWorker.getRegistrations();
        const scopeBase = new URL(import.meta.env.BASE_URL, window.location.origin).pathname;
        const matchingRegs = regs.filter(reg => reg.scope.includes(scopeBase));

        if (matchingRegs.length === 0) {
            localStorage.setItem(SW_CLEANUP_KEY, 'done');
            return;
        }

        await Promise.all(matchingRegs.map(reg => reg.unregister()));

        if ('caches' in window) {
            const keys = await caches.keys();
            const staleKeys = keys.filter(key =>
                key.includes('workbox') ||
                key.includes('vite-pwa') ||
                key.includes('precache') ||
                key.includes('runtime')
            );
            await Promise.all(staleKeys.map(key => caches.delete(key)));
        }

        localStorage.setItem(SW_CLEANUP_KEY, 'done');

        if (navigator.serviceWorker.controller && sessionStorage.getItem(SW_RELOAD_KEY) !== 'done') {
            sessionStorage.setItem(SW_RELOAD_KEY, 'done');
            window.location.reload();
            return;
        }
    } catch (err) {
        console.warn('Failed to clean up legacy service workers:', err);
    }
}

cleanupLegacyServiceWorkers().finally(() => {
    mount();
});

window.addEventListener('error', (e) => {
    try {
        track("Error", {
            message: e.message,
            filename: e.filename,
            lineno: e.lineno,
            colno: e.colno,
        });
    } catch (_) {
    }
});

window.addEventListener('unhandledrejection', (e) => {
    try {
        track("UnhandledPromiseRejection", {
            message: e.reason?.message ?? String(e.reason),
        });
    } catch (_) {
    }
});