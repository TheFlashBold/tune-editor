import { render } from 'preact'
import './index.css'
import { App } from './app.tsx'

const MIN_SPLASH_MS = 1000;
const splashStart = performance.now();

function mount() {
    const elapsed = performance.now() - splashStart;
    const remaining = Math.max(0, MIN_SPLASH_MS - elapsed);
    setTimeout(() => render(<App />, document.getElementById('app')!), remaining);
}

mount();
