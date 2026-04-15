import {loadDefinitionIndex} from "../lib/definitionLoader.ts";
import {parseEcuInfo} from "../lib/btpParser.ts";
import {useAppContext} from "../context/app.ts";
import {useState, useRef, useCallback, useEffect} from "preact/hooks";
import {getLoginState} from "../services/base.ts";
import {AuthService} from "../services/auth.ts";
import type {LoginState} from "../services/auth.ts";
import {LoginModal} from "./LoginModal.tsx";
import {Modal} from "./Modal.tsx";
import {WizardModal} from "./WizardModal.tsx";

const APP_VERSION = __APP_VERSION__;

interface MenuBarProps {
    onShowConverter: () => void;
    onShowXdfConverter: () => void;
    onShowLogViewer: () => void;
    onOpenOLS: (file: File) => void;
    onShowDefinitions: (defs: any[]) => void;
    onShowPatchManager: () => void;
    onShowChanges: () => void;
    onShowCrossCompare: () => void;
}

export function MenuBar({
                            onShowConverter,
                            onShowXdfConverter,
                            onShowLogViewer,
                            onOpenOLS,
                            onShowDefinitions,
                            onShowPatchManager,
                            onShowChanges,
                            onShowCrossCompare,
                        }: MenuBarProps) {
    const ctx = useAppContext();
    const [showFileMenu, setShowFileMenu] = useState(false);
    const [showMobileMenu, setShowMobileMenu] = useState(false);
    const [showLogin, setShowLogin] = useState(false);
    const [showAbout, setShowAbout] = useState(false);
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [saveFileName, setSaveFileName] = useState('');
    const [showWizards, setShowWizards] = useState(false);
    const [loginState, setLoginState] = useState<LoginState | null>(() => getLoginState());

    // Validate stored token on mount
    useEffect(() => {
        const stored = getLoginState();
        if (!stored) return;
        AuthService.self().then(user => {
            const next = {...stored, user};
            localStorage.setItem('login', JSON.stringify(next));
            setLoginState(next);
        }).catch(() => {
            localStorage.removeItem('login');
            localStorage.removeItem('login_renewed');
            setLoginState(null);
        });
    }, []);

    const handleLogout = useCallback(() => {
        localStorage.removeItem('login');
        localStorage.removeItem('login_renewed');
        setLoginState(null);
    }, []);

    // Renew token on window focus (at most once per hour)
    useEffect(() => {
        const checkAuth = async () => {
            const stored = getLoginState();
            if (!stored) {
                setLoginState(null);
                return;
            }

            const lastRenew = parseInt(localStorage.getItem('login_renewed') || '0', 10);
            const hourAgo = Date.now() - 60 * 60 * 1000;

            if (lastRenew > hourAgo) return;

            try {
                const renewed = await AuthService.renew();
                localStorage.setItem('login', JSON.stringify(renewed));
                localStorage.setItem('login_renewed', String(Date.now()));
                setLoginState(renewed);
            } catch {
                localStorage.removeItem('login');
                localStorage.removeItem('login_renewed');
                setLoginState(null);
            }
        };
        window.addEventListener('focus', checkAuth);
        return () => window.removeEventListener('focus', checkAuth);
    }, []);

    const ecuInfo = ctx.definition?.verification?.expected ? parseEcuInfo(ctx.definition.verification.expected) : null;
    const appliedPatchCount = ctx.patchResults.filter(r => r.status === 'applied').length;

    const jsonInputRef = useRef<HTMLInputElement>(null);
    const binInputRef = useRef<HTMLInputElement>(null);
    const originalBinInputRef = useRef<HTMLInputElement>(null);
    const crossCompareBinInputRef = useRef<HTMLInputElement>(null);
    const olsInputRef = useRef<HTMLInputElement>(null);

    const handleOpenOLS = useCallback(() => {
        const file = olsInputRef.current?.files?.[0];
        if (!file) return;
        onOpenOLS(file);
        setShowFileMenu(false);
        setShowMobileMenu(false);
        if (olsInputRef.current) olsInputRef.current.value = '';
    }, [onOpenOLS]);

    const handleOpenJson = useCallback(async () => {
        const file = jsonInputRef.current?.files?.[0];
        if (!file) return;
        await ctx.loadDefinitionJson(file);
        setShowFileMenu(false);
        setShowMobileMenu(false);
        if (jsonInputRef.current) jsonInputRef.current.value = '';
    }, [ctx]);

    const handleOpenBin = useCallback(async () => {
        const file = binInputRef.current?.files?.[0];
        if (!file) return;
        await ctx.loadBin(file);
        setShowFileMenu(false);
        setShowMobileMenu(false);
        if (binInputRef.current) binInputRef.current.value = '';
    }, [ctx]);

    const handleOpenOriginalBin = useCallback(async () => {
        const file = originalBinInputRef.current?.files?.[0];
        if (!file) return;
        await ctx.loadOriginalBin(file);
        setShowFileMenu(false);
        setShowMobileMenu(false);
        if (originalBinInputRef.current) originalBinInputRef.current.value = '';
    }, [ctx]);

    const handleOpenCrossCompareBin = useCallback(async () => {
        const file = crossCompareBinInputRef.current?.files?.[0];
        if (!file) return;
        await ctx.loadCrossCompareBin(file);
        setShowFileMenu(false);
        setShowMobileMenu(false);
        if (crossCompareBinInputRef.current) crossCompareBinInputRef.current.value = '';
    }, [ctx]);

    const handleSaveBin = useCallback(() => {
        const defaultName = ctx.binFileName?.replace(/\.[^.]+$/, '_mod.bin') ?? 'output.bin';
        setSaveFileName(defaultName);
        setShowSaveDialog(true);
        setShowFileMenu(false);
        setShowMobileMenu(false);
    }, [ctx]);

    const handleSaveConfirm = useCallback(() => {
        ctx.saveBin(saveFileName);
        setShowSaveDialog(false);
    }, [ctx, saveFileName]);

    const handleExportBtp = useCallback(() => {
        ctx.exportBtp();
        setShowFileMenu(false);
        setShowMobileMenu(false);
    }, [ctx]);

    const mobileAction = (fn: () => void) => () => {
        fn();
        setShowMobileMenu(false);
    };

    const handleShowDefinitions = useCallback(async () => {
        try {
            const defs = await loadDefinitionIndex();
            onShowDefinitions(defs);
        } catch (err) {
            console.error('Failed to load definitions:', err);
        }
    }, [onShowDefinitions]);

    // Status badges (shared between desktop and mobile)
    const statusBadges = (
        <>
            {ctx.bin && (
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                        className="text-wrap break-all font-mono text-xs text-zinc-600 dark:text-zinc-400 truncate max-w-60 sm:max-w-none sm:text-sm">{ctx.bin.name}</span>
                    {ctx.detectedMode && (
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                            ctx.detectedMode === 'cal' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                        }`}>
                            {ctx.detectedMode === 'cal' ? 'CAL' : 'Full'}
                        </span>
                    )}
                    {ctx.detectedMode && ecuInfo && (
                        <span
                            className="hidden sm:inline px-2 py-0.5 rounded text-xs font-medium bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400">
                            {ecuInfo.ecuFamily}
                        </span>
                    )}
                    {ctx.detectedMode && ecuInfo && (
                        <span
                            className="hidden sm:inline px-2 py-0.5 rounded text-xs font-medium bg-zinc-300 text-zinc-800 dark:bg-zinc-600 dark:text-zinc-200">
                            {ecuInfo.variant}
                        </span>
                    )}
                    {ctx.detectedMode && !ecuInfo && ctx.definition?.verification?.expected && (
                        <span
                            className="px-1.5 py-0.5 rounded text-xs font-medium bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
                            {ctx.definition.verification.expected}
                        </span>
                    )}
                    {appliedPatchCount > 0 && (
                        <span
                            className="hidden sm:inline px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                            {appliedPatchCount} Patches
                        </span>
                    )}
                    {ctx.bin.modified && (
                        <span className="px-1.5 py-0.5 bg-amber-500 text-black rounded text-xs font-semibold">
                            Modified
                        </span>
                    )}
                </div>
            )}
        </>
    );

    return (
        <header
            className="flex items-center gap-1 px-1 py-1 bg-zinc-100 dark:bg-zinc-800 border-b border-zinc-300 dark:border-zinc-700">
            {/* Hamburger button (mobile only) */}
            <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="sm:hidden px-2 py-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
                aria-label="Menu"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
                </svg>
            </button>

            {/* Desktop menu items */}
            <div className="hidden sm:flex items-center flex-wrap gap-1">
                {/* File Menu */}
                <div className="relative">
                    <button
                        onClick={() => setShowFileMenu(!showFileMenu)}
                        className={`px-3 py-1 text-sm rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer ${showFileMenu ? 'bg-zinc-200 dark:bg-zinc-700' : ''}`}
                    >
                        File
                    </button>
                    {showFileMenu && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setShowFileMenu(false)}/>
                            <div
                                className="absolute left-0 top-full mt-1 w-48 bg-zinc-100 dark:bg-zinc-800 border border-zinc-400 dark:border-zinc-600 rounded shadow-lg z-20">
                                <label
                                    className="block px-3 py-2 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">
                                    Open Definition...
                                    <input type="file" accept=".json" ref={jsonInputRef} onChange={handleOpenJson}
                                           className="hidden"/>
                                </label>
                                <label
                                    className="block px-3 py-2 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">
                                    Open BIN/S19/HEX...
                                    <input type="file" accept=".bin,.ori,.mod,.s19,.srec,.mot,.hex,.ihex"
                                           ref={binInputRef} onChange={handleOpenBin} className="hidden"/>
                                </label>
                                <label
                                    className="block px-3 py-2 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">
                                    Open Original BIN...
                                    <input type="file" accept=".bin,.ori,.mod" ref={originalBinInputRef}
                                           onChange={handleOpenOriginalBin} className="hidden"/>
                                </label>
                                <label
                                    className="block px-3 py-2 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">
                                    Open Crosscompare BIN...
                                    <input type="file" accept=".bin,.ori,.mod,.s19,.srec,.mot,.hex,.ihex"
                                           ref={crossCompareBinInputRef} onChange={handleOpenCrossCompareBin}
                                           className="hidden"/>
                                </label>
                                <label
                                    className="block px-3 py-2 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">
                                    Open OLS Project...
                                    <input type="file" accept=".ols" ref={olsInputRef} onChange={handleOpenOLS}
                                           className="hidden"/>
                                </label>
                                <div className="border-t border-zinc-400 dark:border-zinc-600 my-1"/>
                                <button onClick={handleSaveBin} disabled={!ctx.bin}
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer disabled:text-zinc-500 disabled:hover:bg-transparent">
                                    Save BIN
                                </button>
                                <button onClick={handleExportBtp} disabled={!ctx.bin || !ctx.originalBin}
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer disabled:text-zinc-500 disabled:hover:bg-transparent">
                                    Export Changes as BTP Patch
                                </button>
                            </div>
                        </>
                    )}
                </div>

                <button onClick={() => setShowWizards(true)}
                        className="text-nowrap px-3 py-1 text-sm rounded text-blue-500 dark:text-blue-400 hover:bg-blue-500/10 cursor-pointer disabled:text-zinc-500 disabled:hover:bg-transparent"
                        disabled={!ctx.bin || !ctx.definition}>
                    Wizards
                </button>
                <button onClick={onShowLogViewer}
                        className="text-nowrap px-3 py-1 text-sm rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">
                    Log Viewer
                </button>
                <button onClick={handleShowDefinitions}
                        className="px-3 py-1 text-sm rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">Definitions
                </button>
                <button onClick={onShowPatchManager} disabled={!ctx.bin}
                        className="px-3 py-1 text-sm rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer disabled:text-zinc-500">
                    Patches{appliedPatchCount > 0 && <span className="ml-1 text-green-400">({appliedPatchCount})</span>}
                </button>
                {ctx.originalBin && ctx.bin && (
                    <button onClick={onShowChanges}
                            className="px-3 py-1 text-sm rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">
                        Changes ({ctx.changes.length})
                    </button>
                )}
                {ctx.crossCompareBin && ctx.bin && (
                    <button onClick={onShowCrossCompare}
                            className="text-nowrap px-3 py-1 text-sm rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">
                        Cross-Compare ({ctx.crossCompareDiffs.length})
                    </button>
                )}
                <a href="https://simos.app/" target="_blank" rel="noopener noreferrer"
                   className="text-nowrap px-3 py-1 text-sm rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">
                    Get the iOS Logging App
                </a>
                <button onClick={() => setShowAbout(true)}
                        className="px-3 py-1 text-sm rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">
                    About
                </button>
            </div>

            {/* Spacer */}
            <div className="flex-1"/>

            {/* Login / User */}
            <div className="hidden sm:flex items-center">
                {loginState ? (
                    <button
                        onClick={handleLogout}
                        className="px-3 py-1 text-sm rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 cursor-pointer"
                        title="Logout"
                    >
                        {loginState.user.login}
                    </button>
                ) : (
                    <button
                        onClick={() => setShowLogin(true)}
                        className="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-500 cursor-pointer"
                    >
                        Login
                    </button>
                )}
            </div>
            {ctx.originalBin && (
                <div className="hidden sm:flex items-center gap-2 mr-2">
                    <span className="text-xs text-zinc-500">Original:</span>
                    <span className="font-mono text-sm text-zinc-600 dark:text-zinc-400 break-all">{ctx.originalBin.name}</span>
                </div>
            )}
            {statusBadges}

            {/* Mobile dropdown menu */}
            {showMobileMenu && (
                <>
                    <div className="fixed inset-0 z-30 sm:hidden" onClick={() => setShowMobileMenu(false)}/>
                    <div
                        className="fixed left-0 top-[41px] right-0 z-40 sm:hidden bg-zinc-100 dark:bg-zinc-800 border-b border-zinc-400 dark:border-zinc-600 shadow-lg max-h-[80vh] overflow-y-auto"
                        style={{paddingBottom: 'env(safe-area-inset-bottom, 0px)'}}>
                        <div
                            className="text-xs font-semibold text-zinc-500 uppercase tracking-wide px-4 pt-3 pb-1">File
                        </div>
                        <label
                            className="block px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer active:bg-zinc-300 dark:active:bg-zinc-600">
                            Open Definition...
                            <input type="file" accept=".json" ref={jsonInputRef} onChange={handleOpenJson}
                                   className="hidden"/>
                        </label>
                        <label
                            className="block px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer active:bg-zinc-300 dark:active:bg-zinc-600">
                            Open BIN/S19/HEX...
                            <input type="file" accept=".bin,.ori,.mod,.s19,.srec,.mot,.hex,.ihex" ref={binInputRef}
                                   onChange={handleOpenBin} className="hidden"/>
                        </label>
                        <label
                            className="block px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer active:bg-zinc-300 dark:active:bg-zinc-600">
                            Open Original BIN...
                            <input type="file" accept=".bin,.ori,.mod" ref={originalBinInputRef}
                                   onChange={handleOpenOriginalBin} className="hidden"/>
                        </label>
                        <label
                            className="block px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer active:bg-zinc-300 dark:active:bg-zinc-600">
                            Open Crosscompare BIN...
                            <input type="file" accept=".bin,.ori,.mod,.s19,.srec,.mot,.hex,.ihex"
                                   ref={crossCompareBinInputRef} onChange={handleOpenCrossCompareBin}
                                   className="hidden"/>
                        </label>
                        <label
                            className="block px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer active:bg-zinc-300 dark:active:bg-zinc-600">
                            Open OLS Project...
                            <input type="file" accept=".ols" ref={olsInputRef} onChange={handleOpenOLS}
                                   className="hidden"/>
                        </label>
                        <button onClick={handleSaveBin} disabled={!ctx.bin}
                                className="w-full text-left px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer disabled:text-zinc-500 active:bg-zinc-300 dark:active:bg-zinc-600">
                            Save BIN
                        </button>
                        <button onClick={handleExportBtp} disabled={!ctx.bin || !ctx.originalBin}
                                className="w-full text-left px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer disabled:text-zinc-500 active:bg-zinc-300 dark:active:bg-zinc-600">
                            Export Changes as BTP Patch
                        </button>

                        <div className="border-t border-zinc-300 dark:border-zinc-700 my-1"/>
                        <button onClick={mobileAction(() => setShowWizards(true))} disabled={!ctx.bin || !ctx.definition}
                                className="w-full text-left px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer disabled:text-zinc-500 active:bg-zinc-300 dark:active:bg-zinc-600">
                            Wizards
                        </button>

                        <div className="border-t border-zinc-300 dark:border-zinc-700 my-1"/>
                        <button onClick={mobileAction(onShowLogViewer)}
                                className="w-full text-left px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer active:bg-zinc-300 dark:active:bg-zinc-600">Log
                            Viewer
                        </button>
                        <button onClick={mobileAction(handleShowDefinitions)}
                                className="w-full text-left px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer active:bg-zinc-300 dark:active:bg-zinc-600">Definitions
                        </button>
                        <button onClick={mobileAction(onShowPatchManager)} disabled={!ctx.bin}
                                className="w-full text-left px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer disabled:text-zinc-500 active:bg-zinc-300 dark:active:bg-zinc-600">
                            Patches{appliedPatchCount > 0 &&
                            <span className="ml-1 text-green-400">({appliedPatchCount})</span>}
                        </button>
                        {ctx.originalBin && ctx.bin && (
                            <button onClick={mobileAction(onShowChanges)}
                                    className="w-full text-left px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer active:bg-zinc-300 dark:active:bg-zinc-600">
                                Changes ({ctx.changes.length})
                            </button>
                        )}
                        {ctx.crossCompareBin && ctx.bin && (
                            <button onClick={mobileAction(onShowCrossCompare)}
                                    className="w-full text-left px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer active:bg-zinc-300 dark:active:bg-zinc-600">
                                Cross-Compare ({ctx.crossCompareDiffs.length})
                            </button>
                        )}
                        <div className="border-t border-zinc-300 dark:border-zinc-700 my-1"/>
                        <a href="https://simos.app/" target="_blank" rel="noopener noreferrer"
                           className="block px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer active:bg-zinc-300 dark:active:bg-zinc-600">
                            Get the iOS Logging App
                        </a>
                        <button onClick={mobileAction(() => setShowAbout(true))}
                                className="w-full text-left px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer active:bg-zinc-300 dark:active:bg-zinc-600">
                            About
                        </button>
                        <div className="border-t border-zinc-300 dark:border-zinc-700 my-1"/>
                        {loginState ? (
                            <div className="flex items-center justify-between px-4 py-3">
                                <span
                                    className="text-sm text-zinc-600 dark:text-zinc-400">{loginState.user.fullName || loginState.user.login}</span>
                                <button onClick={mobileAction(handleLogout)}
                                        className="px-3 py-1 text-sm rounded bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 cursor-pointer">
                                    Logout
                                </button>
                            </div>
                        ) : (
                            <button onClick={mobileAction(() => setShowLogin(true))}
                                    className="w-full text-left px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer active:bg-zinc-300 dark:active:bg-zinc-600">
                                Login / Register
                            </button>
                        )}
                    </div>
                </>
            )}

            {/* Wizards Modal */}
            {showWizards && (
                <WizardModal onClose={() => setShowWizards(false)}/>
            )}

            {/* Login Modal */}
            {showLogin && (
                <LoginModal
                    onClose={() => setShowLogin(false)}
                    onLogin={(state) => setLoginState(state)}
                />
            )}

            {/* Save BIN Dialog */}
            {showSaveDialog && (
                <Modal title="Save BIN" onClose={() => setShowSaveDialog(false)} width="sm"
                    footer={
                        <div class="flex justify-end gap-2">
                            <button
                                onClick={() => setShowSaveDialog(false)}
                                class="px-4 py-2 text-sm rounded bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveConfirm}
                                class="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
                            >
                                Save
                            </button>
                        </div>
                    }
                >
                    <div class="space-y-2">
                        <label class="block text-sm font-medium">Filename</label>
                        <input
                            type="text"
                            value={saveFileName}
                            onInput={(e) => setSaveFileName((e.target as HTMLInputElement).value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveConfirm(); }}
                            class="w-full px-3 py-2 text-sm rounded border border-zinc-400 dark:border-zinc-600 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                            autoFocus
                        />
                    </div>
                </Modal>
            )}

            {/* About Modal */}
            {showAbout && (
                <Modal title="About" onClose={() => setShowAbout(false)} width="sm">
                    <div class="flex flex-col items-center gap-4 py-4">
                        <img src="logo.svg" alt="Tune Editor" class="w-16 h-16"/>
                        <div class="text-center">
                            <div class="text-lg font-semibold">Tune Editor</div>
                            <div class="text-sm text-zinc-500">v{APP_VERSION}</div>
                        </div>
                        <div class="flex gap-2">
                            <a
                                href="https://github.com/theFlashBold/tune-editor"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="flex items-center gap-2 px-4 py-2 text-sm rounded bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
                            >
                                <svg class="w-5 h-5" viewBox="0 0 16 16" fill="currentColor">
                                    <path
                                        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                                </svg>
                                GitHub
                            </a>
                            <a
                                href="https://github.com/TheFlashBold/tune-editor/issues/new"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="flex items-center gap-2 px-4 py-2 text-sm rounded bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
                            >
                                Create Issue
                            </a>
                            <a
                                href="https://ko-fi.com/theflashbold"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="flex items-center gap-2 px-4 py-2 text-sm rounded bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
                            >
                                Support me
                            </a>
                        </div>
                        <div class="text-xs text-zinc-400 dark:text-zinc-500 text-center pt-2">
                            Built with Preact, TypeScript, Tailwind CSS, Vite & WebGL
                        </div>
                    </div>
                </Modal>
            )}
        </header>
    );
}
