import {loadDefinitionIndex} from "../lib/definitionLoader.ts";
import {parseEcuInfo} from "../lib/btpParser.ts";
import {useAppContext} from "../context/app.ts";
import {useState, useRef, useCallback} from "preact/hooks";

interface MenuBarProps {
    onShowConverter: () => void;
    onShowXdfConverter: () => void;
    onShowLogViewer: () => void;
    onShowDefinitions: (defs: any[]) => void;
    onShowPatchManager: () => void;
    onShowChanges: () => void;
    onShowCrossCompare: () => void;
}

export function MenuBar({
    onShowConverter,
    onShowXdfConverter,
    onShowLogViewer,
    onShowDefinitions,
    onShowPatchManager,
    onShowChanges,
    onShowCrossCompare,
}: MenuBarProps) {
    const ctx = useAppContext();
    const [showFileMenu, setShowFileMenu] = useState(false);
    const [showToolsMenu, setShowToolsMenu] = useState(false);
    const [showMobileMenu, setShowMobileMenu] = useState(false);

    const ecuInfo = ctx.definition?.verification?.expected ? parseEcuInfo(ctx.definition.verification.expected) : null;
    const appliedPatchCount = ctx.patchResults.filter(r => r.status === 'applied').length;

    const jsonInputRef = useRef<HTMLInputElement>(null);
    const binInputRef = useRef<HTMLInputElement>(null);
    const originalBinInputRef = useRef<HTMLInputElement>(null);
    const crossCompareBinInputRef = useRef<HTMLInputElement>(null);

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
        ctx.saveBin();
        setShowFileMenu(false);
        setShowMobileMenu(false);
    }, [ctx]);

    const handleExportBtp = useCallback(() => {
        ctx.exportBtp();
        setShowFileMenu(false);
        setShowMobileMenu(false);
    }, [ctx]);

    const mobileAction = (fn: () => void) => () => {
        fn();
        setShowMobileMenu(false);
    };

    // Status badges (shared between desktop and mobile)
    const statusBadges = (
        <>
            {ctx.bin && (
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400 truncate max-w-32 sm:max-w-none sm:text-sm">{ctx.bin.name}</span>
                    {ctx.detectedMode && (
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                            ctx.detectedMode === 'cal' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                        }`}>
                            {ctx.detectedMode === 'cal' ? 'CAL' : 'Full'}
                        </span>
                    )}
                    {ctx.detectedMode && ecuInfo && (
                        <span className="hidden sm:inline px-2 py-0.5 rounded text-xs font-medium bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400">
                            {ecuInfo.ecuFamily}
                        </span>
                    )}
                    {ctx.detectedMode && ecuInfo && (
                        <span className="hidden sm:inline px-2 py-0.5 rounded text-xs font-medium bg-zinc-300 text-zinc-800 dark:bg-zinc-600 dark:text-zinc-200">
                            {ecuInfo.variant}
                        </span>
                    )}
                    {ctx.detectedMode && !ecuInfo && ctx.definition?.verification?.expected && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
                            {ctx.definition.verification.expected}
                        </span>
                    )}
                    {appliedPatchCount > 0 && (
                        <span className="hidden sm:inline px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
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
        <header className="flex items-center gap-1 px-1 py-1 bg-zinc-100 dark:bg-zinc-800 border-b border-zinc-300 dark:border-zinc-700">
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
            <div className="hidden sm:flex items-center gap-1">
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
                                <label className="block px-3 py-2 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">
                                    Open Definition...
                                    <input type="file" accept=".json" ref={jsonInputRef} onChange={handleOpenJson} className="hidden"/>
                                </label>
                                <label className="block px-3 py-2 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">
                                    Open BIN/S19/HEX...
                                    <input type="file" accept=".bin,.ori,.mod,.s19,.srec,.mot,.hex,.ihex" ref={binInputRef} onChange={handleOpenBin} className="hidden"/>
                                </label>
                                <label className="block px-3 py-2 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">
                                    Open Original BIN...
                                    <input type="file" accept=".bin,.ori,.mod" ref={originalBinInputRef} onChange={handleOpenOriginalBin} className="hidden"/>
                                </label>
                                <label className="block px-3 py-2 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">
                                    Open Crosscompare BIN...
                                    <input type="file" accept=".bin,.ori,.mod,.s19,.srec,.mot,.hex,.ihex" ref={crossCompareBinInputRef} onChange={handleOpenCrossCompareBin} className="hidden"/>
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

                {/* Tools Menu */}
                <div className="relative">
                    <button
                        onClick={() => setShowToolsMenu(!showToolsMenu)}
                        className={`px-3 py-1 text-sm rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer ${showToolsMenu ? 'bg-zinc-200 dark:bg-zinc-700' : ''}`}
                    >
                        Tools
                    </button>
                    {showToolsMenu && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setShowToolsMenu(false)}/>
                            <div className="absolute left-0 top-full mt-1 w-48 bg-zinc-100 dark:bg-zinc-800 border border-zinc-400 dark:border-zinc-600 rounded shadow-lg z-20">
                                <button onClick={() => { onShowConverter(); setShowToolsMenu(false); }}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">
                                    A2L Converter
                                </button>
                                <button onClick={() => { onShowXdfConverter(); setShowToolsMenu(false); }}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">
                                    XDF Converter
                                </button>
                            </div>
                        </>
                    )}
                </div>

                <button onClick={onShowLogViewer} className="px-3 py-1 text-sm rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">Log Viewer</button>
                <button onClick={async () => { try { const defs = await loadDefinitionIndex(); onShowDefinitions(defs); } catch (err) { console.error('Failed to load definitions:', err); } }}
                    className="px-3 py-1 text-sm rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">Definitions</button>
                <button onClick={onShowPatchManager} disabled={!ctx.bin}
                    className="px-3 py-1 text-sm rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer disabled:text-zinc-500">
                    Patches{appliedPatchCount > 0 && <span className="ml-1 text-green-400">({appliedPatchCount})</span>}
                </button>
                {ctx.originalBin && ctx.bin && (
                    <button onClick={onShowChanges} className="px-3 py-1 text-sm rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">
                        Changes ({ctx.changes.length})
                    </button>
                )}
                {ctx.crossCompareBin && ctx.bin && (
                    <button onClick={onShowCrossCompare} className="px-3 py-1 text-sm rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">
                        Cross-Compare ({ctx.crossCompareDiffs.length})
                    </button>
                )}
                <a href="https://simos.app/" target="_blank" rel="noopener noreferrer"
                   className="px-3 py-1 text-sm rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">Get the iOS Logging App</a>
            </div>

            {/* Status badges + spacer */}
            <div className="flex-1"/>
            {ctx.originalBin && (
                <div className="hidden sm:flex items-center gap-2 mr-2">
                    <span className="text-xs text-zinc-500">Original:</span>
                    <span className="font-mono text-sm text-zinc-600 dark:text-zinc-400">{ctx.originalBin.name}</span>
                </div>
            )}
            {statusBadges}

            {/* Mobile dropdown menu */}
            {showMobileMenu && (
                <>
                    <div className="fixed inset-0 z-30 sm:hidden" onClick={() => setShowMobileMenu(false)}/>
                    <div className="fixed left-0 top-[41px] right-0 z-40 sm:hidden bg-zinc-100 dark:bg-zinc-800 border-b border-zinc-400 dark:border-zinc-600 shadow-lg max-h-[80vh] overflow-y-auto"
                         style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
                        <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide px-4 pt-3 pb-1">File</div>
                        <label className="block px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer active:bg-zinc-300 dark:active:bg-zinc-600">
                            Open Definition...
                            <input type="file" accept=".json" ref={jsonInputRef} onChange={handleOpenJson} className="hidden"/>
                        </label>
                        <label className="block px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer active:bg-zinc-300 dark:active:bg-zinc-600">
                            Open BIN/S19/HEX...
                            <input type="file" accept=".bin,.ori,.mod,.s19,.srec,.mot,.hex,.ihex" ref={binInputRef} onChange={handleOpenBin} className="hidden"/>
                        </label>
                        <label className="block px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer active:bg-zinc-300 dark:active:bg-zinc-600">
                            Open Original BIN...
                            <input type="file" accept=".bin,.ori,.mod" ref={originalBinInputRef} onChange={handleOpenOriginalBin} className="hidden"/>
                        </label>
                        <label className="block px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer active:bg-zinc-300 dark:active:bg-zinc-600">
                            Open Crosscompare BIN...
                            <input type="file" accept=".bin,.ori,.mod,.s19,.srec,.mot,.hex,.ihex" ref={crossCompareBinInputRef} onChange={handleOpenCrossCompareBin} className="hidden"/>
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
                        <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide px-4 pt-2 pb-1">Tools</div>
                        <button onClick={mobileAction(onShowConverter)} className="w-full text-left px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer active:bg-zinc-300 dark:active:bg-zinc-600">A2L Converter</button>
                        <button onClick={mobileAction(onShowXdfConverter)} className="w-full text-left px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer active:bg-zinc-300 dark:active:bg-zinc-600">XDF Converter</button>

                        <div className="border-t border-zinc-300 dark:border-zinc-700 my-1"/>
                        <button onClick={mobileAction(onShowLogViewer)} className="w-full text-left px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer active:bg-zinc-300 dark:active:bg-zinc-600">Log Viewer</button>
                        <button onClick={mobileAction(async () => { try { const defs = await loadDefinitionIndex(); onShowDefinitions(defs); } catch {} })}
                            className="w-full text-left px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer active:bg-zinc-300 dark:active:bg-zinc-600">Definitions</button>
                        <button onClick={mobileAction(onShowPatchManager)} disabled={!ctx.bin}
                            className="w-full text-left px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer disabled:text-zinc-500 active:bg-zinc-300 dark:active:bg-zinc-600">
                            Patches{appliedPatchCount > 0 && <span className="ml-1 text-green-400">({appliedPatchCount})</span>}
                        </button>
                        {ctx.originalBin && ctx.bin && (
                            <button onClick={mobileAction(onShowChanges)} className="w-full text-left px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer active:bg-zinc-300 dark:active:bg-zinc-600">
                                Changes ({ctx.changes.length})
                            </button>
                        )}
                        {ctx.crossCompareBin && ctx.bin && (
                            <button onClick={mobileAction(onShowCrossCompare)} className="w-full text-left px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer active:bg-zinc-300 dark:active:bg-zinc-600">
                                Cross-Compare ({ctx.crossCompareDiffs.length})
                            </button>
                        )}
                        <div className="border-t border-zinc-300 dark:border-zinc-700 my-1"/>
                        <a href="https://simos.app/" target="_blank" rel="noopener noreferrer"
                            className="block px-4 py-3 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer active:bg-zinc-300 dark:active:bg-zinc-600">
                            Get the iOS Logging App
                        </a>
                    </div>
                </>
            )}
        </header>
    );
}
