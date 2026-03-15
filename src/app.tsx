import {useState, useCallback, useMemo, useEffect} from 'preact/hooks';
import type {Definition} from './types';
import {track} from './lib/track';
import {FileLoader} from './components/FileLoader';
import {XdfLoader} from './components/XdfLoader';
import {LogViewer} from './components/LogViewer';
import {Modal} from './components/Modal';
import {PatchManager} from './components/PatchManager';
import {parseEcuInfo, getCalFileOffset} from './lib/btpParser';
import {MenuBar} from './components/MenuBar';
import {Sidebar} from './components/Sidebar';
import {MainArea} from './components/MainArea';
import {ChangesModal} from './components/ChangesModal';
import {CrossCompareModal} from './components/CrossCompareModal';
import {DefinitionPickerModal} from './components/DefinitionPickerModal';
import {AppContext} from './context/app';
import {useAppState} from './hooks/useAppState';
import {loadDefinition} from './lib/definitionLoader';
import {isS19File, isHexFile} from './lib/s19Parser';
import {XDFParser} from './lib/xdfParser';
import {parseOLS, extractBinary, olsToDefinition} from './lib/olsParser';
import type {OLSFile, OLSBinaryVersion} from './lib/olsParser';
import {OLSPickerModal} from './components/OLSPickerModal';
import {InfoDialog} from './components/InfoDialog.tsx';
import './app.css';

const BIN_EXTENSIONS = ['.bin', '.ori', '.mod'];

function classifyFile(name: string): 'json' | 'bin' | 'csv' | 'xdf' | 'ols' | null {
    const lower = name.toLowerCase();
    if (lower.endsWith('.json')) return 'json';
    if (lower.endsWith('.xdf')) return 'xdf';
    if (lower.endsWith('.csv')) return 'csv';
    if (lower.endsWith('.ols')) return 'ols';
    if (BIN_EXTENSIONS.some(ext => lower.endsWith(ext))) return 'bin';
    if (isS19File(name) || isHexFile(name)) return 'bin';
    return null;
}

export function App() {
    const appState = useAppState();

    // Warn before closing with unsaved changes
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (appState.modified) {
                e.preventDefault();
            }
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [appState.modified]);

    // Modal visibility flags
    const [showConverter, setShowConverter] = useState(false);
    const [showXdfConverter, setShowXdfConverter] = useState(false);
    const [showLogViewer, setShowLogViewer] = useState(false);
    const [showDefinitions, setShowDefinitions] = useState(false);
    const [showChanges, setShowChanges] = useState(false);
    const [showCrossCompare, setShowCrossCompare] = useState(false);
    const [showPatchManager, setShowPatchManager] = useState(false);
    const [logViewerData, setLogViewerData] = useState<string | null>(null);
    const [olsData, setOlsData] = useState<{ols: OLSFile, buffer: ArrayBuffer} | null>(null);

    const handleDefinitionLoad = useCallback((def: Definition) => {
        appState.setExternalDefinition(def);
        appState.setSelectedParam(null);
        setShowConverter(false);
        setShowXdfConverter(false);
        track('Load Definition', {name: 'Custom'});
    }, [appState]);

    // Global drag & drop — routes by file type
    const handleGlobalDrop = useCallback(async (e: DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer?.files[0];
        if (!file) return;

        const type = classifyFile(file.name);
        if (type === 'json') {
            await appState.loadDefinitionJson(file);
        } else if (type === 'xdf') {
            const parser = new XDFParser();
            await parser.parseXDF(file);
            const def = parser.generateDefinition();
            console.log(`XDF: ${def.parameters.length} parameters from ${file.name}`);
            appState.setExternalDefinition(def);
            appState.setSelectedParam(null);
        } else if (type === 'bin') {
            await appState.loadBin(file);
        } else if (type === 'ols') {
            const buffer = await file.arrayBuffer();
            try {
                const ols = parseOLS(buffer, file.name);
                console.log(`OLS: ${ols.parameters.length} parameters, ${ols.binaryVersions.length} binaries from ${file.name}`);
                setOlsData({ols, buffer});
                track('Load OLS', {params: ols.parameters.length, bins: ols.binaryVersions.length});
            } catch (err) {
                console.error('Failed to parse OLS:', err);
            }
        } else if (type === 'csv') {
            const text = await file.text();
            const firstHeader = text.split('\n')[0] ?? '';
            const pids = firstHeader.split(',').filter(s => s.trim()).length;
            track('Load Log File', {count: text.length, pids});

            setLogViewerData(text);
            setShowLogViewer(true);
        }
    }, [appState]);

    const preventDefaults = useCallback((e: DragEvent) => {
        e.preventDefault();
    }, []);

    const handleOLSSelect = useCallback((version: OLSBinaryVersion | null) => {
        if (!olsData) return;
        const def = olsToDefinition(olsData.ols);
        appState.setExternalDefinition(def);
        appState.setSelectedParam(null);

        if (version) {
            // Extract and load the selected binary
            const binData = extractBinary(olsData.buffer, version);
            appState.loadBinData(binData, version.name || 'ols_binary.bin');
        }

        setOlsData(null);
        track('Load OLS Definition', {name: def.name, withBin: !!version});
    }, [olsData, appState]);

    // Show definition picker when matches > 1
    const showDefinitionPicker = appState.definitionMatches.length > 1;

    // CAL file offset for block-aware patch checking
    const calFileOffset = useMemo(() => {
        const epk = appState.definition?.verification?.expected;
        const info = epk ? parseEcuInfo(epk) : null;
        return info ? getCalFileOffset(info.ecuFamily) : null;
    }, [appState.definition]);

    return (
        <AppContext.Provider value={appState}>
            <div
                class="flex flex-col h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                onDragOver={preventDefaults}
                onDrop={handleGlobalDrop}
            >
                <MenuBar
                    onShowConverter={() => setShowConverter(true)}
                    onShowXdfConverter={() => setShowXdfConverter(true)}
                    onShowLogViewer={() => { setShowLogViewer(true); track('Open Log Viewer'); }}
                    onOpenOLS={async (file) => {
                        const buffer = await file.arrayBuffer();
                        try {
                            const ols = parseOLS(buffer, file.name);
                            console.log(`OLS: ${ols.parameters.length} parameters, ${ols.binaryVersions.length} binaries from ${file.name}`);
                            setOlsData({ols, buffer});
                            track('Load OLS', {params: ols.parameters.length, bins: ols.binaryVersions.length});
                        } catch (err) {
                            console.error('Failed to parse OLS:', err);
                        }
                    }}
                    onShowDefinitions={(defs) => {
                        appState.setAllDefinitions(defs);
                        setShowDefinitions(true);
                    }}
                    onShowPatchManager={() => setShowPatchManager(true)}
                    onShowChanges={() => setShowChanges(true)}
                    onShowCrossCompare={() => setShowCrossCompare(true)}
                />
                <div class="flex flex-1 overflow-hidden">
                    <Sidebar/>
                    <MainArea/>
                </div>

                {/* A2L Converter Modal */}
                {showConverter && (
                    <Modal title="A2L to JSON Converter" onClose={() => setShowConverter(false)} width="lg">
                        <FileLoader onDefinitionLoad={handleDefinitionLoad}/>
                    </Modal>
                )}

                {/* XDF Converter Modal */}
                {showXdfConverter && (
                    <Modal title="XDF to JSON Converter" onClose={() => setShowXdfConverter(false)} width="lg">
                        <XdfLoader onDefinitionLoad={handleDefinitionLoad}/>
                    </Modal>
                )}

                {/* Log Viewer Modal */}
                {showLogViewer && (
                    <LogViewer
                        onClose={() => {
                            setShowLogViewer(false);
                            setLogViewerData(null);
                        }}
                        initialData={logViewerData}
                    />
                )}

                {/* Changes Modal */}
                {showChanges && (
                    <ChangesModal onClose={() => setShowChanges(false)}/>
                )}

                {/* Cross-Compare Modal */}
                {showCrossCompare && (
                    <CrossCompareModal onClose={() => setShowCrossCompare(false)}/>
                )}

                {/* Definition Picker Modal (auto-shown when multiple matches) */}
                {showDefinitionPicker && (
                    <DefinitionPickerModal
                        matches={appState.definitionMatches}
                        allDefinitions={appState.allDefinitions}
                        onSelect={(entry, mode) => {
                            appState.selectDefinitionMatch(entry, mode);
                        }}
                        onClose={() => appState.clearDefinitionMatches()}
                    />
                )}

                {/* Definitions Browser Modal */}
                {showDefinitions && (
                    <Modal title="Definitions" onClose={() => setShowDefinitions(false)} width="lg">
                        <div class="space-y-4">
                            {appState.allDefinitions.length === 0 ? (
                                <div class="text-center py-4 text-zinc-500">
                                    No definitions available.
                                </div>
                            ) : (
                                <div>
                                    <div class="text-sm text-zinc-600 dark:text-zinc-400 mb-3">
                                        {appState.allDefinitions.length} definition{appState.allDefinitions.length !== 1 ? 's' : ''} available
                                    </div>
                                    <div class="max-h-96 overflow-y-auto space-y-1">
                                        {appState.allDefinitions.map((entry) => (
                                            <button
                                                key={entry.file}
                                                onClick={async () => {
                                                    try {
                                                        const def = await loadDefinition(entry.file);
                                                        appState.setExternalDefinition(def);
                                                        appState.setSelectedParam(null);
                                                        setShowDefinitions(false);
                                                        track('Load Definition', {name: def.name});
                                                    } catch (err) {
                                                        console.error('Failed to load definition:', err);
                                                    }
                                                }}
                                                class="w-full text-left p-3 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 rounded border border-zinc-400 dark:border-zinc-600 transition-colors"
                                            >
                                                <div class="flex items-center justify-between">
                                                    <div>
                                                        <div class="font-medium">{entry.name}</div>
                                                        <div class="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                                                            {entry.paramCount} parameters
                                                            {entry.verification?.expected && ` · ${entry.verification.expected}`}
                                                        </div>
                                                    </div>
                                                    {entry.verification?.calOffset !== undefined && (
                                                        <div class="text-xs text-zinc-500">
                                                            CAL @
                                                            0x{entry.verification.calOffset.toString(16).toUpperCase()}
                                                        </div>
                                                    )}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </Modal>
                )}

                {/* Patch Manager Modal */}
                {showPatchManager && appState.bin && (
                    <PatchManager
                        binData={appState.bin.data}
                        patchResults={appState.patchResults}
                        calFileOffset={calFileOffset}
                        onClose={() => setShowPatchManager(false)}
                        onModify={appState.markModified}
                        onPatchResultsChange={appState.setPatchResults}
                        definition={appState.definition}
                        onDefinitionUpdate={appState.setDefinition}
                    />
                )}
                {/* OLS Picker Modal */}
                {olsData && (
                    <OLSPickerModal
                        ols={olsData.ols}
                        onSelect={handleOLSSelect}
                        onClose={() => setOlsData(null)}
                    />
                )}
                {/* What's New Dialog */}
                <InfoDialog />
            </div>
        </AppContext.Provider>
    );
}
