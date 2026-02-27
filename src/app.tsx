import {useState, useCallback} from 'preact/hooks';
import type {Definition} from './types';
import {FileLoader} from './components/FileLoader';
import {XdfLoader} from './components/XdfLoader';
import {LogViewer} from './components/LogViewer';
import {BLEConnector} from './components/BLEConnector';
import {Modal} from './components/Modal';
import {PatchManager} from './components/PatchManager';
import {parseEcuInfo, getCalFileOffset} from './lib/btpParser';
import {MenuBar} from './components/MenuBar';
import {Sidebar} from './components/Sidebar';
import {MainArea} from './components/MainArea';
import {SettingsModal} from './components/SettingsModal';
import {ChangesModal} from './components/ChangesModal';
import {DefinitionPickerModal} from './components/DefinitionPickerModal';
import {AppContext} from './context/app';
import {useAppState} from './hooks/useAppState';
import {loadSettings, saveSettings, calculateWheelCircumference} from './lib/vehicleSettings';
import type {VehicleSettings} from './lib/vehicleSettings';
import {loadDefinition} from './lib/definitionLoader';
import {isS19File, isHexFile} from './lib/s19Parser';
import './app.css';

const BIN_EXTENSIONS = ['.bin', '.ori', '.mod'];

function classifyFile(name: string): 'json' | 'bin' | 'csv' | null {
    const lower = name.toLowerCase();
    if (lower.endsWith('.json')) return 'json';
    if (lower.endsWith('.csv')) return 'csv';
    if (BIN_EXTENSIONS.some(ext => lower.endsWith(ext))) return 'bin';
    if (isS19File(name) || isHexFile(name)) return 'bin';
    return null;
}

export function App() {
    const appState = useAppState();

    // Vehicle settings (local to App — only used by Settings and BLE)
    const [vehicleSettings, setVehicleSettings] = useState<VehicleSettings>(loadSettings);

    // Modal visibility flags
    const [showConverter, setShowConverter] = useState(false);
    const [showXdfConverter, setShowXdfConverter] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showLogViewer, setShowLogViewer] = useState(false);
    const [showBLEConnector, setShowBLEConnector] = useState(false);
    const [showDefinitions, setShowDefinitions] = useState(false);
    const [showChanges, setShowChanges] = useState(false);
    const [showPatchManager, setShowPatchManager] = useState(false);
    const [logViewerData, setLogViewerData] = useState<string | null>(null);

    const updateVehicleSettings = useCallback((updates: Partial<VehicleSettings>) => {
        setVehicleSettings(prev => {
            const next = {...prev, ...updates};
            if (!next.useManualCircumference && ('tireWidth' in updates || 'tireAspect' in updates || 'rimDiameter' in updates)) {
                next.wheelCircumference = calculateWheelCircumference(next.tireWidth, next.tireAspect, next.rimDiameter);
            }
            saveSettings(next);
            return next;
        });
    }, []);

    const handleDefinitionLoad = useCallback((def: Definition) => {
        appState.setDefinition(def);
        appState.setSelectedParam(null);
        setShowConverter(false);
        setShowXdfConverter(false);
    }, [appState]);

    // Global drag & drop — routes by file type
    const handleGlobalDrop = useCallback(async (e: DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer?.files[0];
        if (!file) return;

        const type = classifyFile(file.name);
        if (type === 'json') {
            await appState.loadDefinitionJson(file);
        } else if (type === 'bin') {
            await appState.loadBin(file);
        } else if (type === 'csv') {
            const text = await file.text();
            setLogViewerData(text);
            setShowLogViewer(true);
        }
    }, [appState]);

    const preventDefaults = useCallback((e: DragEvent) => {
        e.preventDefault();
    }, []);

    // Show definition picker when matches > 1
    const showDefinitionPicker = appState.definitionMatches.length > 1;

    return (
        <AppContext.Provider value={appState}>
            <div
                class="flex flex-col h-screen bg-zinc-900 text-zinc-100"
                onDragOver={preventDefaults}
                onDrop={handleGlobalDrop}
            >
                <MenuBar
                    onShowConverter={() => setShowConverter(true)}
                    onShowXdfConverter={() => setShowXdfConverter(true)}
                    onShowSettings={() => setShowSettings(true)}
                    onShowLogViewer={() => setShowLogViewer(true)}
                    onShowBLEConnector={() => setShowBLEConnector(true)}
                    onShowDefinitions={(defs) => {
                        appState.setAllDefinitions(defs);
                        setShowDefinitions(true);
                    }}
                    onShowPatchManager={() => setShowPatchManager(true)}
                    onShowChanges={() => setShowChanges(true)}
                />
                <div class="flex flex-1 overflow-hidden">
                    <Sidebar/>
                    <MainArea/>
                </div>

                {/* A2L Converter Modal */}
                {showConverter && (
                    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                        <div
                            class="bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto">
                            <div class="flex justify-between items-center px-4 py-3 border-b border-zinc-700">
                                <h2 class="text-lg font-semibold">A2L to JSON Converter</h2>
                                <button
                                    onClick={() => setShowConverter(false)}
                                    class="w-8 h-8 flex items-center justify-center rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100"
                                >
                                    ✕
                                </button>
                            </div>
                            <div class="p-4">
                                <FileLoader onDefinitionLoad={handleDefinitionLoad}/>
                            </div>
                        </div>
                    </div>
                )}

                {/* XDF Converter Modal */}
                {showXdfConverter && (
                    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                        <div
                            class="bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto">
                            <div class="flex justify-between items-center px-4 py-3 border-b border-zinc-700">
                                <h2 class="text-lg font-semibold">XDF to JSON Converter</h2>
                                <button
                                    onClick={() => setShowXdfConverter(false)}
                                    class="w-8 h-8 flex items-center justify-center rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100"
                                >
                                    ✕
                                </button>
                            </div>
                            <div class="p-4">
                                <XdfLoader onDefinitionLoad={handleDefinitionLoad}/>
                            </div>
                        </div>
                    </div>
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

                {/* BLE Connector Modal */}
                {showBLEConnector && (
                    <BLEConnector
                        onClose={() => setShowBLEConnector(false)}
                        onLogData={(csv) => {
                            setShowBLEConnector(false);
                            setLogViewerData(csv);
                            setShowLogViewer(true);
                        }}
                        vehicleSettings={vehicleSettings}
                    />
                )}

                {/* Changes Modal */}
                {showChanges && (
                    <ChangesModal onClose={() => setShowChanges(false)}/>
                )}

                {/* Settings Modal */}
                {showSettings && (
                    <SettingsModal
                        settings={vehicleSettings}
                        onUpdate={updateVehicleSettings}
                        onClose={() => setShowSettings(false)}
                    />
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
                                    <div class="text-sm text-zinc-400 mb-3">
                                        {appState.allDefinitions.length} definition{appState.allDefinitions.length !== 1 ? 's' : ''} available
                                    </div>
                                    <div class="max-h-96 overflow-y-auto space-y-1">
                                        {appState.allDefinitions.map((entry) => (
                                            <button
                                                key={entry.file}
                                                onClick={async () => {
                                                    try {
                                                        const def = await loadDefinition(entry.file);
                                                        appState.setDefinition(def);
                                                        appState.setSelectedParam(null);
                                                        setShowDefinitions(false);
                                                    } catch (err) {
                                                        console.error('Failed to load definition:', err);
                                                    }
                                                }}
                                                class="w-full text-left p-3 bg-zinc-700 hover:bg-zinc-600 rounded border border-zinc-600 transition-colors"
                                            >
                                                <div class="flex items-center justify-between">
                                                    <div>
                                                        <div class="font-medium">{entry.name}</div>
                                                        <div class="text-xs text-zinc-400 mt-1">
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
                        calFileOffset={(() => {
                            const epk = appState.definition?.verification?.expected;
                            const info = epk ? parseEcuInfo(epk) : null;
                            return info ? getCalFileOffset(info.ecuFamily) : null;
                        })()}
                        onClose={() => setShowPatchManager(false)}
                        onModify={appState.markModified}
                        onPatchResultsChange={appState.setPatchResults}
                        definition={appState.definition}
                        onDefinitionUpdate={appState.setDefinition}
                    />
                )}
            </div>
        </AppContext.Provider>
    );
}
