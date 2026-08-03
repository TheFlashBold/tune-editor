import {useState} from 'preact/hooks';
import {Modal} from './Modal';
import {track} from '../lib/track';

const MANAGED_EDITOR_URL = 'https://simos.app/editor?utm_source=legacy-editor&utm_medium=in-app&utm_campaign=legacyeditor-august-2026';
const SESSION_STORAGE_KEY = 'tune-editor-deprecation-seen';

function shouldShowNotice(): boolean {
    try {
        return sessionStorage.getItem(SESSION_STORAGE_KEY) !== '1';
    } catch {
        return true;
    }
}

export function DeprecationModal() {
    const [visible, setVisible] = useState(shouldShowNotice);

    const dismiss = () => {
        try {
            sessionStorage.setItem(SESSION_STORAGE_KEY, '1');
        } catch {
            // Keep dismissal functional when browser storage is unavailable.
        }
        setVisible(false);
        track('Deprecation Notice Dismiss');
    };

    if (!visible) return null;

    return (
        <Modal
            title="The Tune Editor has moved"
            onClose={dismiss}
            width="md"
            footer={
                <div class="flex flex-col items-stretch gap-2">
                    <a
                        href={MANAGED_EDITOR_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => track('Open Managed Editor', {source: 'deprecation-notice'})}
                        class="group flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-base font-semibold text-white shadow-lg shadow-blue-600/20 transition-all hover:-translate-y-0.5 hover:bg-blue-500 hover:shadow-blue-600/30 active:translate-y-0"
                    >
                        Go to new Editor — 33% off
                        <svg class="h-4 w-4 transition-transform group-hover:translate-x-1" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                            <path d="M4 10h12m-5-5 5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </a>
                    <button
                        onClick={dismiss}
                        class="px-3 py-2 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                    >
                        Stay here and use my own .xdf / .ols files
                    </button>
                </div>
            }
        >
            <div class="overflow-hidden rounded-xl border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900">
                <div class="relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 px-5 py-6 text-white sm:px-6">
                    <div class="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/10"/>
                    <div class="absolute -bottom-16 right-16 h-28 w-28 rounded-full bg-indigo-300/10"/>

                    <div class="relative flex items-start gap-4">
                        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 shadow-inner ring-1 ring-white/20">
                            <svg class="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M13.5 2 5 14h6l-.5 8L19 10h-6l.5-8Z" fill="currentColor"/>
                            </svg>
                        </div>
                        <div>
                            <div class="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-100">
                                New home, better experience
                            </div>
                            <h3 class="text-xl font-bold leading-tight sm:text-2xl">
                                Continue tuning in the new Editor
                            </h3>
                            <p class="mt-2 max-w-sm text-sm leading-relaxed text-blue-100">
                                The managed Tune Editor now lives at simos.app/editor.
                            </p>
                        </div>
                    </div>
                </div>

                <div class="space-y-4 p-5 sm:p-6">
                    <div class="flex flex-col gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div class="text-sm font-bold">33% off for Legacy Editor users</div>
                            <div class="mt-0.5 text-xs text-emerald-800 dark:text-emerald-300">
                                Valid through August 31, 2026.
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Code</span>
                            <code class="rounded-lg border border-dashed border-emerald-400 bg-white px-3 py-1.5 text-sm font-bold tracking-wide text-emerald-800 dark:border-emerald-700 dark:bg-zinc-900 dark:text-emerald-200">
                                LEGACYEDITOR
                            </code>
                        </div>
                    </div>

                    <div>
                        <p class="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                            Everything you need in one place
                        </p>
                        <div class="grid gap-2 sm:grid-cols-2">
                            {[
                                'Create and manage projects with versions',
                                'More curated definitions',
                                'More tuning wizards',
                                'More ready-to-use patches',
                                'A more intuitive design',
                                'DQ250 and Simos 12/18 checksum support',
                                'Undo and redo',
                                'Simos 18 EEPROM editor',
                            ].map((feature) => (
                                <div key={feature} class="flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-2.5 dark:bg-zinc-800">
                                    <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                                        <svg class="h-3 w-3" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                                            <path d="m5 10 3 3 7-7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
                                        </svg>
                                    </span>
                                    <span class="text-xs font-medium leading-snug text-zinc-800 dark:text-zinc-200">{feature}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div class="border-t border-zinc-200 pt-4 dark:border-zinc-700">
                        <div class="mb-2 flex items-center gap-2">
                            <span class="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                                Legacy Editor
                            </span>
                            <span class="text-xs text-zinc-500">No longer actively maintained</span>
                        </div>
                        <p class="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                            Need to stay here? You can still use this version with your own{' '}
                            <code class="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">.xdf</code>
                            {' '}or{' '}
                            <code class="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">.ols</code>
                            {' '}files.
                        </p>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
