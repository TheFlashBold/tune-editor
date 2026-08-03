import {useCallback, useEffect, useRef, useState} from 'preact/hooks';
import {parseEcuInfo} from '../lib/btpParser';
import {useAppContext} from '../context/app';
import {Modal} from './Modal';
import {LoginModal} from './LoginModal';
import {AuthService} from '../services/auth';
import type {LoginState} from '../services/auth';
import {getLoginState} from '../services/base';
import {TuningService} from '../services/tuning';
import type {TuningFileEntry} from '../services/tuning';
import {track} from '../lib/track';

const APP_VERSION = __APP_VERSION__;
const MANAGED_EDITOR_URL = 'https://simos.app/editor?utm_source=legacy-editor&utm_medium=in-app&utm_campaign=legacyeditor-august-2026';

interface MenuBarProps {
    onShowA2lLoader: () => void;
    onShowXdfLoader: () => void;
    onShowLogViewer: () => void;
    onOpenOLS: (file: File) => void;
    onShowPatchManager: () => void;
    onShowChanges: () => void;
    onShowCrossCompare: () => void;
}

export function MenuBar({
    onShowA2lLoader,
    onShowXdfLoader,
    onShowLogViewer,
    onOpenOLS,
    onShowPatchManager,
    onShowChanges,
    onShowCrossCompare,
}: MenuBarProps) {
    const ctx = useAppContext();
    const [showFileMenu, setShowFileMenu] = useState(false);
    const [showMobileMenu, setShowMobileMenu] = useState(false);
    const [showAbout, setShowAbout] = useState(false);
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [saveFileName, setSaveFileName] = useState('');
    const [showLogin, setShowLogin] = useState(false);
    const [showCloudBins, setShowCloudBins] = useState(false);
    const [loginState, setLoginState] = useState<LoginState | null>(() => getLoginState());
    const [cloudBins, setCloudBins] = useState<TuningFileEntry[]>([]);
    const [cloudBinsLoading, setCloudBinsLoading] = useState(false);
    const [cloudBinError, setCloudBinError] = useState<string | null>(null);
    const [downloadingBin, setDownloadingBin] = useState<{name: string; loaded: number; total: number} | null>(null);

    const jsonInputRef = useRef<HTMLInputElement>(null);
    const binInputRef = useRef<HTMLInputElement>(null);
    const originalBinInputRef = useRef<HTMLInputElement>(null);
    const crossCompareBinInputRef = useRef<HTMLInputElement>(null);
    const olsInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const stored = getLoginState();
        if (!stored) return;
        AuthService.self().then(user => {
            const refreshed = {...stored, user};
            localStorage.setItem('login', JSON.stringify(refreshed));
            setLoginState(refreshed);
        }).catch(() => {
            localStorage.removeItem('login');
            localStorage.removeItem('login_renewed');
            setLoginState(null);
        });
    }, []);

    useEffect(() => {
        if (!loginState) {
            setCloudBins([]);
            setCloudBinError(null);
            return;
        }

        let cancelled = false;
        setCloudBinsLoading(true);
        setCloudBinError(null);
        TuningService.listBins().then(entries => {
            if (!cancelled) setCloudBins(entries);
        }).catch(error => {
            if (!cancelled) setCloudBinError((error as Error).message || 'Failed to load Cloud Bins');
        }).finally(() => {
            if (!cancelled) setCloudBinsLoading(false);
        });
        return () => { cancelled = true; };
    }, [loginState]);

    const closeMenus = useCallback(() => {
        setShowFileMenu(false);
        setShowMobileMenu(false);
    }, []);

    const handleOpenJson = useCallback(async () => {
        const file = jsonInputRef.current?.files?.[0];
        if (!file) return;
        await ctx.loadDefinitionJson(file);
        closeMenus();
        if (jsonInputRef.current) jsonInputRef.current.value = '';
    }, [closeMenus, ctx]);

    const handleOpenBin = useCallback(async () => {
        const file = binInputRef.current?.files?.[0];
        if (!file) return;
        await ctx.loadBin(file);
        closeMenus();
        if (binInputRef.current) binInputRef.current.value = '';
    }, [closeMenus, ctx]);

    const handleOpenOriginalBin = useCallback(async () => {
        const file = originalBinInputRef.current?.files?.[0];
        if (!file) return;
        await ctx.loadOriginalBin(file);
        closeMenus();
        if (originalBinInputRef.current) originalBinInputRef.current.value = '';
    }, [closeMenus, ctx]);

    const handleOpenCrossCompareBin = useCallback(async () => {
        const file = crossCompareBinInputRef.current?.files?.[0];
        if (!file) return;
        await ctx.loadCrossCompareBin(file);
        closeMenus();
        if (crossCompareBinInputRef.current) crossCompareBinInputRef.current.value = '';
    }, [closeMenus, ctx]);

    const handleOpenOLS = useCallback(() => {
        const file = olsInputRef.current?.files?.[0];
        if (!file) return;
        onOpenOLS(file);
        closeMenus();
        if (olsInputRef.current) olsInputRef.current.value = '';
    }, [closeMenus, onOpenOLS]);

    const handleSaveBin = useCallback(() => {
        setSaveFileName(ctx.binFileName?.replace(/\.[^.]+$/, '_mod.bin') ?? 'output.bin');
        setShowSaveDialog(true);
        closeMenus();
    }, [closeMenus, ctx.binFileName]);

    const handleSaveConfirm = useCallback(() => {
        ctx.saveBin(saveFileName);
        setShowSaveDialog(false);
    }, [ctx, saveFileName]);

    const handleExportBtp = useCallback(() => {
        ctx.exportBtp();
        closeMenus();
    }, [closeMenus, ctx]);

    const handleCloudBins = useCallback(() => {
        closeMenus();
        if (loginState) setShowCloudBins(true);
        else setShowLogin(true);
    }, [closeMenus, loginState]);

    const handleLogout = useCallback(() => {
        localStorage.removeItem('login');
        localStorage.removeItem('login_renewed');
        setLoginState(null);
        setCloudBins([]);
        setShowCloudBins(false);
        closeMenus();
    }, [closeMenus]);

    const handleOpenCloudBin = useCallback(async (entry: TuningFileEntry) => {
        setDownloadingBin({name: entry.name, loaded: 0, total: 0});
        setCloudBinError(null);
        try {
            const data = await TuningService.getBin(entry.id, (loaded, total) => {
                setDownloadingBin({name: entry.name, loaded, total});
            });
            await ctx.loadBin(new File([data], entry.name, {type: 'application/octet-stream'}));
            setShowCloudBins(false);
            track('Download Cloud Bin in Legacy Editor', {id: entry.id, name: entry.name});
        } catch (error) {
            setCloudBinError((error as Error).message || 'Failed to download Cloud Bin');
        } finally {
            setDownloadingBin(null);
        }
    }, [ctx]);

    const mobileAction = (action: () => void) => () => {
        action();
        setShowMobileMenu(false);
    };

    const ecuInfo = ctx.definition?.verification?.expected
        ? parseEcuInfo(ctx.definition.verification.expected)
        : null;
    const appliedPatchCount = ctx.patchResults.filter(result => result.status === 'applied').length;

    const fileActions = (
        <>
            <label class="block px-3 py-2 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">
                Open local definition…
                <input type="file" accept=".json" ref={jsonInputRef} onChange={handleOpenJson} class="hidden"/>
            </label>
            <label class="block px-3 py-2 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">
                Open BIN/S19/HEX…
                <input
                    type="file"
                    accept=".bin,.ori,.mod,.s19,.srec,.mot,.hex,.ihex"
                    ref={binInputRef}
                    onChange={handleOpenBin}
                    class="hidden"
                />
            </label>
            <label class="block px-3 py-2 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">
                Open OLS…
                <input type="file" accept=".ols" ref={olsInputRef} onChange={handleOpenOLS} class="hidden"/>
            </label>
            <div class="border-t border-zinc-300 dark:border-zinc-700 my-1"/>
            <label class="block px-3 py-2 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">
                Open original BIN…
                <input type="file" accept=".bin,.ori,.mod" ref={originalBinInputRef} onChange={handleOpenOriginalBin} class="hidden"/>
            </label>
            <label class="block px-3 py-2 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">
                Open comparison BIN…
                <input type="file" accept=".bin,.ori,.mod" ref={crossCompareBinInputRef} onChange={handleOpenCrossCompareBin} class="hidden"/>
            </label>
            <div class="border-t border-zinc-300 dark:border-zinc-700 my-1"/>
            <button
                onClick={handleSaveBin}
                disabled={!ctx.bin}
                class="w-full text-left px-3 py-2 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer disabled:text-zinc-500"
            >
                Save BIN…
            </button>
            <button
                onClick={handleExportBtp}
                disabled={!ctx.bin || !ctx.originalBin || !ctx.definition}
                class="w-full text-left px-3 py-2 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer disabled:text-zinc-500"
            >
                Export changes as BTP…
            </button>
        </>
    );

    const statusBadges = ctx.bin && (
        <div class="flex items-center gap-1.5 flex-wrap min-w-0">
            <span class="font-mono text-xs text-zinc-600 dark:text-zinc-400 truncate max-w-60 sm:text-sm">{ctx.bin.name}</span>
            {ctx.detectedMode && (
                <span class={`px-1.5 py-0.5 rounded text-xs font-medium ${
                    ctx.detectedMode === 'cal'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                        : 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                }`}>
                    {ctx.detectedMode === 'cal' ? 'CAL' : 'Full'}
                </span>
            )}
            {ctx.detectedMode && ecuInfo && (
                <span class="hidden sm:inline px-2 py-0.5 rounded text-xs bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                    {ecuInfo.ecuFamily} · {ecuInfo.variant}
                </span>
            )}
            {appliedPatchCount > 0 && (
                <span class="hidden sm:inline px-2 py-0.5 rounded text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                    {appliedPatchCount} manual BTP
                </span>
            )}
            {ctx.bin.modified && (
                <span class="px-1.5 py-0.5 bg-amber-500 text-black rounded text-xs font-semibold">Modified</span>
            )}
        </div>
    );

    return (
        <header class="flex items-center gap-1 px-1 py-1 bg-zinc-100 dark:bg-zinc-800 border-b border-zinc-300 dark:border-zinc-700">
            <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                class="sm:hidden px-2 py-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
                aria-label="Menu"
            >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
                </svg>
            </button>

            <div class="hidden sm:flex items-center flex-wrap gap-1">
                <div class="relative">
                    <button
                        onClick={() => setShowFileMenu(!showFileMenu)}
                        class={`px-3 py-1 text-sm rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer ${showFileMenu ? 'bg-zinc-200 dark:bg-zinc-700' : ''}`}
                    >
                        File
                    </button>
                    {showFileMenu && (
                        <>
                            <div class="fixed inset-0 z-10" onClick={() => setShowFileMenu(false)}/>
                            <div class="absolute left-0 top-full mt-1 w-56 bg-zinc-100 dark:bg-zinc-800 border border-zinc-400 dark:border-zinc-600 rounded shadow-lg z-20">
                                {fileActions}
                            </div>
                        </>
                    )}
                </div>
                <button onClick={onShowA2lLoader} class="px-3 py-1 text-sm rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">Load A2L</button>
                <button onClick={onShowXdfLoader} class="px-3 py-1 text-sm rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">Load XDF</button>
                <button onClick={onShowLogViewer} class="px-3 py-1 text-sm rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">Log Viewer</button>
                <button
                    onClick={onShowPatchManager}
                    disabled={!ctx.bin}
                    class="px-3 py-1 text-sm rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer disabled:text-zinc-500"
                >
                    Manual BTP{appliedPatchCount > 0 ? ` (${appliedPatchCount})` : ''}
                </button>
                {ctx.originalBin && ctx.bin && (
                    <button onClick={onShowChanges} class="px-3 py-1 text-sm rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">
                        Changes ({ctx.changes.length})
                    </button>
                )}
                {ctx.crossCompareBin && ctx.bin && (
                    <button onClick={onShowCrossCompare} class="px-3 py-1 text-sm rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">
                        Compare ({ctx.crossCompareDiffs.length})
                    </button>
                )}
                <button onClick={() => setShowAbout(true)} class="px-3 py-1 text-sm rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">About</button>
                <button
                    onClick={handleCloudBins}
                    class="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-500 cursor-pointer"
                >
                    Cloud Bins
                </button>
                {loginState && (
                    <button
                        onClick={handleLogout}
                        class="px-2 py-1 text-xs rounded text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-700 dark:hover:text-zinc-100 cursor-pointer"
                        title={`Logged in as ${loginState.user.fullName || loginState.user.login}`}
                    >
                        Logout
                    </button>
                )}
            </div>

            <div class="flex-1 min-w-0 flex justify-end">{statusBadges}</div>

            {showMobileMenu && (
                <>
                    <div class="fixed inset-0 z-20 bg-black/30 sm:hidden" onClick={() => setShowMobileMenu(false)}/>
                    <div class="fixed left-0 top-0 bottom-0 z-30 w-72 max-w-[85vw] overflow-y-auto bg-zinc-100 dark:bg-zinc-800 border-r border-zinc-300 dark:border-zinc-700 shadow-xl sm:hidden">
                        <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-300 dark:border-zinc-700">
                            <span class="font-semibold">Tune Editor</span>
                            <button onClick={() => setShowMobileMenu(false)} class="p-1 text-xl">×</button>
                        </div>
                        <div class="py-1">{fileActions}</div>
                        <div class="border-t border-zinc-300 dark:border-zinc-700 my-1"/>
                        <button onClick={mobileAction(onShowA2lLoader)} class="w-full text-left px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700">Load A2L definition</button>
                        <button onClick={mobileAction(onShowXdfLoader)} class="w-full text-left px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700">Load XDF definition</button>
                        <button onClick={mobileAction(onShowLogViewer)} class="w-full text-left px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700">Log Viewer</button>
                        <button
                            onClick={mobileAction(onShowPatchManager)}
                            disabled={!ctx.bin}
                            class="w-full text-left px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:text-zinc-500"
                        >
                            Manual BTP patches{appliedPatchCount > 0 ? ` (${appliedPatchCount})` : ''}
                        </button>
                        {ctx.originalBin && ctx.bin && (
                            <button onClick={mobileAction(onShowChanges)} class="w-full text-left px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700">
                                Changes ({ctx.changes.length})
                            </button>
                        )}
                        {ctx.crossCompareBin && ctx.bin && (
                            <button onClick={mobileAction(onShowCrossCompare)} class="w-full text-left px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700">
                                Compare ({ctx.crossCompareDiffs.length})
                            </button>
                        )}
                        <div class="border-t border-zinc-300 dark:border-zinc-700 my-1"/>
                        <button onClick={mobileAction(handleCloudBins)} class="w-full text-left px-4 py-3 text-sm font-medium text-blue-600 hover:bg-zinc-200 dark:text-blue-400 dark:hover:bg-zinc-700">
                            {loginState ? 'Open existing Cloud Bins' : 'Login for Cloud Bins'}
                        </button>
                        {loginState && (
                            <button onClick={mobileAction(handleLogout)} class="w-full text-left px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700">
                                Logout {loginState.user.fullName || loginState.user.login}
                            </button>
                        )}
                        <div class="border-t border-zinc-300 dark:border-zinc-700 my-1"/>
                        <button onClick={mobileAction(() => setShowAbout(true))} class="w-full text-left px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700">About</button>
                    </div>
                </>
            )}

            {showLogin && (
                <LoginModal
                    onClose={() => setShowLogin(false)}
                    onLogin={state => {
                        setLoginState(state);
                        setShowCloudBins(true);
                    }}
                />
            )}

            {showCloudBins && loginState && (
                <Modal title="Existing Cloud Bins" onClose={() => !downloadingBin && setShowCloudBins(false)} width="lg">
                    <div class="space-y-3">
                        <div class="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
                            Cloud access is read-only in the Legacy Editor. Load an existing BIN, edit it locally, then download the result.
                        </div>
                        {cloudBinsLoading && <div class="py-6 text-center text-sm text-zinc-500">Loading Cloud Bins…</div>}
                        {cloudBinError && <div class="rounded bg-red-500/10 px-3 py-2 text-sm text-red-500">{cloudBinError}</div>}
                        {!cloudBinsLoading && !cloudBinError && cloudBins.length === 0 && (
                            <div class="py-6 text-center text-sm text-zinc-500">No existing Cloud Bins found.</div>
                        )}
                        {cloudBins.length > 0 && (
                            <div class="max-h-96 space-y-1 overflow-y-auto">
                                {cloudBins.map(entry => {
                                    const isDownloading = downloadingBin?.name === entry.name;
                                    const percent = isDownloading && downloadingBin.total > 0
                                        ? Math.round((downloadingBin.loaded / downloadingBin.total) * 100)
                                        : null;
                                    return (
                                        <button
                                            key={entry.id}
                                            onClick={() => void handleOpenCloudBin(entry)}
                                            disabled={!!downloadingBin}
                                            class="flex w-full items-center justify-between gap-3 rounded border border-zinc-300 bg-zinc-100 px-3 py-2.5 text-left hover:bg-zinc-200 disabled:cursor-wait disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                                        >
                                            <span class="truncate font-mono text-sm" title={entry.name}>{entry.name}</span>
                                            <span class="shrink-0 text-xs font-medium text-blue-600 dark:text-blue-400">
                                                {isDownloading ? (percent == null ? 'Loading…' : `${percent}%`) : 'Load'}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </Modal>
            )}

            {showSaveDialog && (
                <Modal
                    title="Save BIN"
                    onClose={() => setShowSaveDialog(false)}
                    width="sm"
                    footer={
                        <div class="flex justify-end gap-2">
                            <button onClick={() => setShowSaveDialog(false)} class="px-4 py-2 text-sm rounded bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600">Cancel</button>
                            <button onClick={handleSaveConfirm} class="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">Save</button>
                        </div>
                    }
                >
                    <div class="space-y-2">
                        <label class="block text-sm font-medium">Filename</label>
                        <input
                            type="text"
                            value={saveFileName}
                            onInput={event => setSaveFileName((event.target as HTMLInputElement).value)}
                            onKeyDown={event => { if (event.key === 'Enter') handleSaveConfirm(); }}
                            class="w-full px-3 py-2 text-sm rounded border border-zinc-400 dark:border-zinc-600 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                            autoFocus
                        />
                    </div>
                </Modal>
            )}

            {showAbout && (
                <Modal title="About" onClose={() => setShowAbout(false)} width="sm">
                    <div class="flex flex-col items-center gap-4 py-4 text-center">
                        <img src="logo.svg" alt="Tune Editor" class="w-16 h-16"/>
                        <div>
                            <div class="text-lg font-semibold">Tune Editor</div>
                            <div class="text-sm text-zinc-500">v{APP_VERSION} · deprecated legacy editor</div>
                        </div>
                        <a
                            href={MANAGED_EDITOR_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
                        >
                            Go to new Editor — 33% off
                        </a>
                        <div class="text-xs text-zinc-500">
                            August offer: use code <code class="font-semibold text-zinc-700 dark:text-zinc-300">LEGACYEDITOR</code>
                        </div>
                    </div>
                </Modal>
            )}
        </header>
    );
}
