import {loadDefinitionIndex} from "../lib/definitionLoader.ts";
import {parseEcuInfo} from "../lib/btpParser.ts";
import {useAppContext} from "../context/app.ts";
import {useState, useRef, useCallback} from "preact/hooks";

interface MenuBarProps {
    onShowConverter: () => void;
    onShowXdfConverter: () => void;
    onShowSettings: () => void;
    onShowLogViewer: () => void;
    onShowBLEConnector: () => void;
    onShowDefinitions: (defs: any[]) => void;
    onShowPatchManager: () => void;
    onShowChanges: () => void;
}

export function MenuBar({
    onShowConverter,
    onShowXdfConverter,
    onShowSettings,
    onShowLogViewer,
    onShowBLEConnector,
    onShowDefinitions,
    onShowPatchManager,
    onShowChanges,
}: MenuBarProps) {
    const ctx = useAppContext();
    const [showFileMenu, setShowFileMenu] = useState(false);
    const [showToolsMenu, setShowToolsMenu] = useState(false);

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
        if (jsonInputRef.current) jsonInputRef.current.value = '';
    }, [ctx]);

    const handleOpenBin = useCallback(async () => {
        const file = binInputRef.current?.files?.[0];
        if (!file) return;
        await ctx.loadBin(file);
        setShowFileMenu(false);
        if (binInputRef.current) binInputRef.current.value = '';
    }, [ctx]);

    const handleOpenOriginalBin = useCallback(async () => {
        const file = originalBinInputRef.current?.files?.[0];
        if (!file) return;
        await ctx.loadOriginalBin(file);
        setShowFileMenu(false);
        if (originalBinInputRef.current) originalBinInputRef.current.value = '';
    }, [ctx]);

    const handleOpenCrossCompareBin = useCallback(async () => {
        const file = crossCompareBinInputRef.current?.files?.[0];
        if (!file) return;
        await ctx.loadCrossCompareBin(file);
        setShowFileMenu(false);
        if (crossCompareBinInputRef.current) crossCompareBinInputRef.current.value = '';
    }, [ctx]);

    const handleSaveBin = useCallback(() => {
        ctx.saveBin();
        setShowFileMenu(false);
    }, [ctx]);

    const handleExportBtp = useCallback(() => {
        ctx.exportBtp();
        setShowFileMenu(false);
    }, [ctx]);

    return (
        <header className="flex items-center gap-1 px-1 py-1 bg-zinc-800 border-b border-zinc-700">
            {/* File Menu */}
            <div className="relative">
                <button
                    onClick={() => setShowFileMenu(!showFileMenu)}
                    className={`px-3 py-1 text-sm rounded hover:bg-zinc-700 cursor-pointer ${showFileMenu ? 'bg-zinc-700' : ''}`}
                >
                    File
                </button>
                {showFileMenu && (
                    <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowFileMenu(false)}/>
                        <div
                            className="absolute left-0 top-full mt-1 w-48 bg-zinc-800 border border-zinc-600 rounded shadow-lg z-20">
                            <label className="block px-3 py-2 text-sm hover:bg-zinc-700 cursor-pointer">
                                Open Definition...
                                <input
                                    type="file"
                                    accept=".json"
                                    ref={jsonInputRef}
                                    onChange={handleOpenJson}
                                    className="hidden"
                                />
                            </label>
                            <label className="block px-3 py-2 text-sm hover:bg-zinc-700 cursor-pointer">
                                Open BIN/S19/HEX...
                                <input
                                    type="file"
                                    accept=".bin,.ori,.mod,.s19,.srec,.mot,.hex,.ihex"
                                    ref={binInputRef}
                                    onChange={handleOpenBin}
                                    className="hidden"
                                />
                            </label>
                            <label className="block px-3 py-2 text-sm hover:bg-zinc-700 cursor-pointer">
                                Open Original BIN...
                                <input
                                    type="file"
                                    accept=".bin,.ori,.mod"
                                    ref={originalBinInputRef}
                                    onChange={handleOpenOriginalBin}
                                    className="hidden"
                                />
                            </label>
                            <label className="block px-3 py-2 text-sm hover:bg-zinc-700 cursor-pointer">
                                Open Crosscompare BIN...
                                <input
                                    type="file"
                                    accept=".bin,.ori,.mod,.s19,.srec,.mot,.hex,.ihex"
                                    ref={crossCompareBinInputRef}
                                    onChange={handleOpenCrossCompareBin}
                                    className="hidden"
                                />
                            </label>
                            <div className="border-t border-zinc-600 my-1"/>
                            <button
                                onClick={handleSaveBin}
                                disabled={!ctx.bin}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-700 cursor-pointer disabled:text-zinc-500 disabled:hover:bg-transparent"
                            >
                                Save BIN
                            </button>
                            <button
                                onClick={handleExportBtp}
                                disabled={!ctx.bin || !ctx.originalBin}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-700 cursor-pointer disabled:text-zinc-500 disabled:hover:bg-transparent"
                            >
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
                    className={`px-3 py-1 text-sm rounded hover:bg-zinc-700 cursor-pointer ${showToolsMenu ? 'bg-zinc-700' : ''}`}
                >
                    Tools
                </button>
                {showToolsMenu && (
                    <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowToolsMenu(false)}/>
                        <div
                            className="absolute left-0 top-full mt-1 w-48 bg-zinc-800 border border-zinc-600 rounded shadow-lg z-20">
                            <button
                                onClick={() => {
                                    onShowConverter();
                                    setShowToolsMenu(false);
                                }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-700 cursor-pointer"
                            >
                                A2L Converter
                            </button>
                            <button
                                onClick={() => {
                                    onShowXdfConverter();
                                    setShowToolsMenu(false);
                                }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-700 cursor-pointer"
                            >
                                XDF Converter
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* Settings Button */}
            <button
                onClick={onShowSettings}
                className="px-3 py-1 text-sm rounded hover:bg-zinc-700 cursor-pointer"
            >
                Settings
            </button>

            <button
                onClick={onShowLogViewer}
                className="px-3 py-1 text-sm rounded hover:bg-zinc-700 cursor-pointer"
            >
                Log Viewer
            </button>

            <button
                onClick={onShowBLEConnector}
                className="px-3 py-1 text-sm rounded hover:bg-zinc-700 cursor-pointer"
            >
                Connect to ISO-TP Bridge
            </button>

            <button
                onClick={async () => {
                    try {
                        const defs = await loadDefinitionIndex();
                        onShowDefinitions(defs);
                    } catch (err) {
                        console.error('Failed to load definitions:', err);
                    }
                }}
                className="px-3 py-1 text-sm rounded hover:bg-zinc-700 cursor-pointer"
            >
                Definitions
            </button>

            <button
                onClick={onShowPatchManager}
                disabled={!ctx.bin}
                className="px-3 py-1 text-sm rounded hover:bg-zinc-700 cursor-pointer disabled:text-zinc-500"
            >
                Patches
                {appliedPatchCount > 0 && (
                    <span className="ml-1 text-green-400">
                        ({appliedPatchCount})
                    </span>
                )}
            </button>

            {ctx.originalBin && ctx.bin && (
                <button
                    onClick={onShowChanges}
                    className="px-3 py-1 text-sm rounded hover:bg-zinc-700 cursor-pointer"
                >
                    Changes ({ctx.changes.length})
                </button>
            )}

            <div className="flex-1"/>

            {ctx.originalBin && (
                <div className="flex items-center gap-2 mr-2">
                    <span className="text-xs text-zinc-500">Original:</span>
                    <span className="font-mono text-sm text-zinc-400">{ctx.originalBin.name}</span>
                </div>
            )}
            {ctx.bin && (
                <div className="flex items-center gap-2 mr-2">
                    <span className="font-mono text-sm text-zinc-400">{ctx.bin.name}</span>
                    {ctx.detectedMode && (
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            ctx.detectedMode === 'cal' ? 'bg-blue-900 text-blue-300' : 'bg-purple-900 text-purple-300'
                        }`}>
                            {ctx.detectedMode === 'cal' ? 'CAL' : 'Full'}
                        </span>
                    )}
                    {ctx.detectedMode && ecuInfo && (<>
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-zinc-700 text-zinc-400">
                            {ecuInfo.ecuFamily}
                        </span>
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-zinc-600 text-zinc-200">
                            {ecuInfo.variant}
                        </span>
                    </>)}
                    {ctx.detectedMode && !ecuInfo && ctx.definition?.verification?.expected && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-zinc-700 text-zinc-300">
                            {ctx.definition.verification.expected}
                        </span>
                    )}
                    {appliedPatchCount > 0 && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-900 text-green-300">
                            {appliedPatchCount} Patches
                        </span>
                    )}
                    {ctx.bin.modified && (
                        <span className="px-2 py-0.5 bg-amber-500 text-black rounded text-xs font-semibold">
                            Modified
                        </span>
                    )}
                </div>
            )}
        </header>
    );
}
