import { useState, useCallback, useRef, useMemo, useEffect } from 'preact/hooks';
import type { Definition, Parameter } from './types';
import { FileLoader } from './components/FileLoader';
import { XdfLoader } from './components/XdfLoader';
import { CategoryTree } from './components/CategoryTree';
import { ValueEditor } from './components/ValueEditor';
import { LogViewer } from './components/LogViewer';
import { BLEConnector } from './components/BLEConnector';
import { readParameterValue, readTableData, readAxisData, formatValue } from './lib/binUtils';
import './app.css';

// Vehicle settings interface
export interface VehicleSettings {
  weight: number; // kg
  tireWidth: number; // mm (e.g., 225)
  tireAspect: number; // % (e.g., 45)
  rimDiameter: number; // inches (e.g., 17)
  wheelCircumference: number; // mm (calculated or manual)
  useManualCircumference: boolean;
}

const DEFAULT_VEHICLE_SETTINGS: VehicleSettings = {
  weight: 1500,
  tireWidth: 225,
  tireAspect: 45,
  rimDiameter: 17,
  wheelCircumference: 1987,
  useManualCircumference: false,
};

const STORAGE_KEY = 'vehicleSettings';

function loadSettings(): VehicleSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_VEHICLE_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  return DEFAULT_VEHICLE_SETTINGS;
}

function saveSettings(settings: VehicleSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

function calculateWheelCircumference(width: number, aspect: number, rimDiameter: number): number {
  // Tire sidewall height = width * (aspect / 100)
  const sidewallHeight = width * (aspect / 100);
  // Total diameter = rim diameter (in mm) + 2 * sidewall height
  const rimDiameterMm = rimDiameter * 25.4;
  const totalDiameter = rimDiameterMm + 2 * sidewallHeight;
  // Circumference = π * diameter
  return Math.round(Math.PI * totalDiameter);
}

interface CellDiff {
  row: number;
  col: number;
  original: number;
  current: number;
}

interface AxisDiff {
  axis: 'x' | 'y';
  original: number[];
  current: number[];
  changedIndices: number[];
}

interface ParamDiff {
  param: Parameter;
  originalValue: number | number[][];
  currentValue: number | number[][];
  cellDiffs?: CellDiff[];
  axisDiffs?: AxisDiff[];
  xAxis?: number[];
  yAxis?: number[];
}

export function App() {
  const [showConverter, setShowConverter] = useState(false);
  const [showXdfConverter, setShowXdfConverter] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [showBLEConnector, setShowBLEConnector] = useState(false);
  const [logViewerData, setLogViewerData] = useState<string | null>(null);
  const [showChanges, setShowChanges] = useState(false);
  const [definition, setDefinition] = useState<Definition | null>(null);
  const [binData, setBinData] = useState<Uint8Array | null>(null);
  const [binFileName, setBinFileName] = useState<string | null>(null);
  const [originalBinData, setOriginalBinData] = useState<Uint8Array | null>(null);
  const [originalBinFileName, setOriginalBinFileName] = useState<string | null>(null);
  const [selectedParam, setSelectedParam] = useState<Parameter | null>(null);
  const [modified, setModified] = useState(false);
  const [vehicleSettings, setVehicleSettings] = useState<VehicleSettings>(loadSettings);

  const jsonInputRef = useRef<HTMLInputElement>(null);
  const binInputRef = useRef<HTMLInputElement>(null);
  const originalBinInputRef = useRef<HTMLInputElement>(null);

  // Update circumference when tire dimensions change
  const updateVehicleSettings = useCallback((updates: Partial<VehicleSettings>) => {
    setVehicleSettings(prev => {
      const next = { ...prev, ...updates };
      // Auto-calculate circumference if not using manual
      if (!next.useManualCircumference && ('tireWidth' in updates || 'tireAspect' in updates || 'rimDiameter' in updates)) {
        next.wheelCircumference = calculateWheelCircumference(next.tireWidth, next.tireAspect, next.rimDiameter);
      }
      saveSettings(next);
      return next;
    });
  }, []);

  const handleDefinitionLoad = useCallback((def: Definition) => {
    setDefinition(def);
    setSelectedParam(null);
    setShowConverter(false);
    setShowXdfConverter(false);
  }, []);

  const handleModify = useCallback(() => {
    setModified(true);
  }, []);

  const handleSaveBin = useCallback(() => {
    if (!binData || !binFileName) return;

    const blob = new Blob([binData.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = binFileName.replace(/\.[^.]+$/, '_mod.bin');
    a.click();
    URL.revokeObjectURL(url);
    setModified(false);
    setShowFileMenu(false);
  }, [binData, binFileName]);

  const handleOpenJson = useCallback(async () => {
    const file = jsonInputRef.current?.files?.[0];
    if (!file) return;
    const text = await file.text();
    const def = JSON.parse(text) as Definition;
    setDefinition(def);
    setSelectedParam(null);
    setShowFileMenu(false);
    if (jsonInputRef.current) jsonInputRef.current.value = '';
  }, []);

  const handleOpenBin = useCallback(async () => {
    const file = binInputRef.current?.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    setBinData(new Uint8Array(buffer));
    setBinFileName(file.name);
    setModified(false);
    setShowFileMenu(false);
    if (binInputRef.current) binInputRef.current.value = '';
  }, []);

  const handleOpenOriginalBin = useCallback(async () => {
    const file = originalBinInputRef.current?.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    setOriginalBinData(new Uint8Array(buffer));
    setOriginalBinFileName(file.name);
    setShowFileMenu(false);
    if (originalBinInputRef.current) originalBinInputRef.current.value = '';
  }, []);

  // Calculate differences between original and current BIN
  const changes = useMemo((): ParamDiff[] => {
    if (!definition || !binData || !originalBinData) return [];

    const diffs: ParamDiff[] = [];

    for (const param of definition.parameters) {
      if (param.type === 'VALUE') {
        const originalValue = readParameterValue(originalBinData, param);
        const currentValue = readParameterValue(binData, param);
        if (Math.abs(originalValue - currentValue) > 0.0001) {
          diffs.push({ param, originalValue, currentValue });
        }
      } else {
        const originalTable = readTableData(originalBinData, param);
        const currentTable = readTableData(binData, param);
        const cellDiffs: CellDiff[] = [];

        for (let r = 0; r < originalTable.length; r++) {
          for (let c = 0; c < originalTable[r].length; c++) {
            if (Math.abs(originalTable[r][c] - currentTable[r][c]) > 0.0001) {
              cellDiffs.push({
                row: r,
                col: c,
                original: originalTable[r][c],
                current: currentTable[r][c],
              });
            }
          }
        }

        // Check axis changes
        const axisDiffs: AxisDiff[] = [];

        if (param.xAxis?.address) {
          const originalXAxis = readAxisData(originalBinData, param.xAxis);
          const currentXAxis = readAxisData(binData, param.xAxis);
          const changedIndices: number[] = [];
          for (let i = 0; i < originalXAxis.length; i++) {
            if (Math.abs(originalXAxis[i] - currentXAxis[i]) > 0.0001) {
              changedIndices.push(i);
            }
          }
          if (changedIndices.length > 0) {
            axisDiffs.push({ axis: 'x', original: originalXAxis, current: currentXAxis, changedIndices });
          }
        }

        if (param.yAxis?.address) {
          const originalYAxis = readAxisData(originalBinData, param.yAxis);
          const currentYAxis = readAxisData(binData, param.yAxis);
          const changedIndices: number[] = [];
          for (let i = 0; i < originalYAxis.length; i++) {
            if (Math.abs(originalYAxis[i] - currentYAxis[i]) > 0.0001) {
              changedIndices.push(i);
            }
          }
          if (changedIndices.length > 0) {
            axisDiffs.push({ axis: 'y', original: originalYAxis, current: currentYAxis, changedIndices });
          }
        }

        if (cellDiffs.length > 0 || axisDiffs.length > 0) {
          // Read current axis data for display
          const xAxis = param.xAxis ? readAxisData(binData, param.xAxis) : undefined;
          const yAxis = param.yAxis ? readAxisData(binData, param.yAxis) : undefined;

          diffs.push({
            param,
            originalValue: originalTable,
            currentValue: currentTable,
            cellDiffs,
            axisDiffs,
            xAxis,
            yAxis,
          });
        }
      }
    }

    return diffs;
  }, [definition, binData, originalBinData]);

  return (
    <div class="flex flex-col h-screen bg-zinc-900 text-zinc-100">
      {/* Menu Bar */}
      <header class="flex items-center gap-1 px-1 py-1 bg-zinc-800 border-b border-zinc-700">
        {/* File Menu */}
        <div class="relative">
          <button
            onClick={() => setShowFileMenu(!showFileMenu)}
            class={`px-3 py-1 text-sm rounded hover:bg-zinc-700 ${showFileMenu ? 'bg-zinc-700' : ''}`}
          >
            File
          </button>
          {showFileMenu && (
            <>
              <div class="fixed inset-0 z-10" onClick={() => setShowFileMenu(false)} />
              <div class="absolute left-0 top-full mt-1 w-48 bg-zinc-800 border border-zinc-600 rounded shadow-lg z-20">
                <label class="block px-3 py-2 text-sm hover:bg-zinc-700 cursor-pointer">
                  Open Definition...
                  <input
                    type="file"
                    accept=".json"
                    ref={jsonInputRef}
                    onChange={handleOpenJson}
                    class="hidden"
                  />
                </label>
                <label class="block px-3 py-2 text-sm hover:bg-zinc-700 cursor-pointer">
                  Open BIN...
                  <input
                    type="file"
                    accept=".bin,.ori,.mod"
                    ref={binInputRef}
                    onChange={handleOpenBin}
                    class="hidden"
                  />
                </label>
                <label class="block px-3 py-2 text-sm hover:bg-zinc-700 cursor-pointer">
                  Open Original BIN...
                  <input
                    type="file"
                    accept=".bin,.ori,.mod"
                    ref={originalBinInputRef}
                    onChange={handleOpenOriginalBin}
                    class="hidden"
                  />
                </label>
                <div class="border-t border-zinc-600 my-1" />
                <button
                  onClick={handleSaveBin}
                  disabled={!modified}
                  class="w-full text-left px-3 py-2 text-sm hover:bg-zinc-700 disabled:text-zinc-500 disabled:hover:bg-transparent"
                >
                  Save BIN
                </button>
              </div>
            </>
          )}
        </div>

        {/* Tools Menu */}
        <div class="relative">
          <button
            onClick={() => setShowToolsMenu(!showToolsMenu)}
            class={`px-3 py-1 text-sm rounded hover:bg-zinc-700 ${showToolsMenu ? 'bg-zinc-700' : ''}`}
          >
            Tools
          </button>
          {showToolsMenu && (
            <>
              <div class="fixed inset-0 z-10" onClick={() => setShowToolsMenu(false)} />
              <div class="absolute left-0 top-full mt-1 w-48 bg-zinc-800 border border-zinc-600 rounded shadow-lg z-20">
                <button
                  onClick={() => { setShowConverter(true); setShowToolsMenu(false); }}
                  class="w-full text-left px-3 py-2 text-sm hover:bg-zinc-700"
                >
                  A2L Converter
                </button>
                <button
                  onClick={() => { setShowXdfConverter(true); setShowToolsMenu(false); }}
                  class="w-full text-left px-3 py-2 text-sm hover:bg-zinc-700"
                >
                  XDF Converter
                </button>
                <div class="border-t border-zinc-600 my-1" />
                <button
                  onClick={() => { setShowLogViewer(true); setShowToolsMenu(false); }}
                  class="w-full text-left px-3 py-2 text-sm hover:bg-zinc-700"
                >
                  Log Viewer
                </button>
                <button
                  onClick={() => { setShowBLEConnector(true); setShowToolsMenu(false); }}
                  class="w-full text-left px-3 py-2 text-sm hover:bg-zinc-700"
                >
                  BLE Datalogger
                </button>
              </div>
            </>
          )}
        </div>

        {/* Settings Button */}
        <button
          onClick={() => setShowSettings(true)}
          class="px-3 py-1 text-sm rounded hover:bg-zinc-700"
        >
          Settings
        </button>

        {originalBinData && binData && (
          <button
            onClick={() => setShowChanges(true)}
            class="px-3 py-1 text-sm rounded hover:bg-zinc-700"
          >
            Changes ({changes.length})
          </button>
        )}

        <div class="flex-1" />

        {originalBinFileName && (
          <div class="flex items-center gap-2 mr-2">
            <span class="text-xs text-zinc-500">Original:</span>
            <span class="font-mono text-sm text-zinc-400">{originalBinFileName}</span>
          </div>
        )}
        {binFileName && (
          <div class="flex items-center gap-2 mr-2">
            <span class="font-mono text-sm text-zinc-400">{binFileName}</span>
            {modified && (
              <span class="px-2 py-0.5 bg-amber-500 text-black rounded text-xs font-semibold">
                Modified
              </span>
            )}
          </div>
        )}
      </header>

      {/* Main Content */}
      <div class="flex flex-1 overflow-hidden">
        <aside class="w-80 flex flex-col bg-zinc-800 border-r border-zinc-700">
          {definition ? (
            <>
              <div class="flex justify-between px-4 py-3 border-b border-zinc-700 font-semibold">
                <span class="truncate">{definition.name}</span>
                <span class="text-zinc-400 font-normal shrink-0 ml-2">{definition.parameters.length}</span>
              </div>
              <CategoryTree
                parameters={definition.parameters}
                onSelect={setSelectedParam}
                selectedParam={selectedParam}
              />
            </>
          ) : (
            <label class="flex-1 flex flex-col justify-center items-center p-4 text-zinc-500 text-sm text-center cursor-pointer hover:bg-zinc-700/50 transition-colors">
              <p>No definition loaded</p>
              <p class="mt-2">Click to open Definition</p>
              <p class="mt-1 text-xs">or use A2L Converter</p>
              <input
                type="file"
                accept=".json"
                onChange={async (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (!file) return;
                  const text = await file.text();
                  const def = JSON.parse(text) as Definition;
                  setDefinition(def);
                  setSelectedParam(null);
                  (e.target as HTMLInputElement).value = '';
                }}
                class="hidden"
              />
            </label>
          )}
        </aside>

        <main class="flex-1 overflow-auto p-4 relative">
          <div
            class="absolute inset-0 pointer-events-none opacity-[0.10]"
            style={{
              backgroundImage: 'url(/tune-editor/logo.svg)',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              backgroundSize: '40%',
            }}
          />
          {!binData && (
            <label class="flex justify-center items-center h-full text-zinc-500 cursor-pointer hover:bg-zinc-700/30 transition-colors">
              <div class="text-center">
                <p>Click to open BIN file</p>
                <p class="text-xs mt-1">or use File → Open BIN</p>
              </div>
              <input
                type="file"
                accept=".bin,.ori,.mod"
                onChange={async (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (!file) return;
                  const buffer = await file.arrayBuffer();
                  setBinData(new Uint8Array(buffer));
                  setBinFileName(file.name);
                  setModified(false);
                  (e.target as HTMLInputElement).value = '';
                }}
                class="hidden"
              />
            </label>
          )}

          {binData && !selectedParam && (
            <div class="flex justify-center items-center h-full text-zinc-500">
              Select a parameter from the tree
            </div>
          )}

          {binData && selectedParam && (
            <ValueEditor
              parameter={selectedParam}
              binData={binData}
              originalBinData={originalBinData}
              onModify={handleModify}
            />
          )}
        </main>
      </div>

      {/* A2L Converter Modal */}
      {showConverter && (
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div class="bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto">
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
              <FileLoader onDefinitionLoad={handleDefinitionLoad} />
            </div>
          </div>
        </div>
      )}

      {/* XDF Converter Modal */}
      {showXdfConverter && (
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div class="bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto">
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
              <XdfLoader onDefinitionLoad={handleDefinitionLoad} />
            </div>
          </div>
        </div>
      )}

      {/* Log Viewer Modal */}
      {showLogViewer && (
        <LogViewer
          onClose={() => { setShowLogViewer(false); setLogViewerData(null); }}
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
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div class="bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl max-w-[95vw] w-full mx-4 max-h-[90vh] flex flex-col">
            <div class="flex justify-between items-center px-4 py-3 border-b border-zinc-700">
              <h2 class="text-lg font-semibold">Changes ({changes.length})</h2>
              <button
                onClick={() => setShowChanges(false)}
                class="w-8 h-8 flex items-center justify-center rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100"
              >
                ✕
              </button>
            </div>
            <div class="flex-1 overflow-auto p-4">
              {changes.length === 0 ? (
                <p class="text-zinc-500 text-center py-8">No changes detected</p>
              ) : (
                <div class="space-y-6">
                  {changes.map(({ param, originalValue, currentValue, cellDiffs, axisDiffs, xAxis, yAxis }) => (
                    <div
                      key={param.name}
                      class="p-3 bg-zinc-700 rounded"
                    >
                      <div
                        class="flex items-center gap-2 mb-3 cursor-pointer hover:text-blue-400"
                        onClick={() => {
                          setSelectedParam(param);
                          setShowChanges(false);
                        }}
                      >
                        <span class="inline-flex justify-center items-center w-5 h-5 text-xs font-semibold rounded bg-zinc-600 text-zinc-300">
                          {param.type[0]}
                        </span>
                        <span class="font-medium">
                          {param.customName || param.description || param.name}
                        </span>
                        <span class="text-xs text-zinc-500">→ click to edit</span>
                      </div>
                      {param.type === 'VALUE' ? (
                        <div class="flex items-center gap-4 text-sm font-mono">
                          <span class="text-red-400">{formatValue(originalValue as number, 4)}</span>
                          <span class="text-zinc-500">→</span>
                          <span class="text-green-400">{formatValue(currentValue as number, 4)}</span>
                          <span class="text-zinc-500">{param.unit}</span>
                        </div>
                      ) : (
                        <div class="space-y-2">
                          {/* Axis changes */}
                          {axisDiffs && axisDiffs.length > 0 && (
                            <div class="text-xs mb-2">
                              {axisDiffs.map(({ axis, changedIndices }) => (
                                <div key={axis} class="text-amber-400">
                                  {axis.toUpperCase()}-Axis: {changedIndices.length} value{changedIndices.length !== 1 ? 's' : ''} changed
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Side-by-side table comparison */}
                          <div class="flex gap-4 overflow-x-auto">
                            {/* Original table */}
                            <div class="flex-1 min-w-0">
                              <div class="text-xs text-zinc-400 mb-1 font-medium">Original</div>
                              <div class="overflow-x-auto">
                                <table class="border-collapse font-mono text-[10px]">
                                  {xAxis && xAxis.length > 0 && (
                                    <thead>
                                      <tr>
                                        {yAxis && yAxis.length > 0 && (
                                          <th class="px-1.5 py-0.5 border border-zinc-700 bg-zinc-800 text-zinc-500"></th>
                                        )}
                                        {xAxis.map((val, i) => (
                                          <th key={i} class="px-1.5 py-0.5 border border-zinc-700 bg-zinc-800 text-zinc-500 text-right font-normal">
                                            {formatValue(val, 1)}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                  )}
                                  <tbody>
                                    {(originalValue as number[][]).map((row, rowIdx) => (
                                      <tr key={rowIdx}>
                                        {yAxis && yAxis.length > 0 && (
                                          <td class="px-1.5 py-0.5 border border-zinc-700 bg-zinc-800 text-zinc-500 text-right">
                                            {formatValue(yAxis[rowIdx], 1)}
                                          </td>
                                        )}
                                        {row.map((cell, colIdx) => {
                                          const isChanged = cellDiffs?.some(d => d.row === rowIdx && d.col === colIdx);
                                          return (
                                            <td
                                              key={colIdx}
                                              class={`px-1.5 py-0.5 border border-zinc-600 text-right ${
                                                isChanged ? 'bg-red-900/50 text-red-300' : 'text-zinc-400'
                                              }`}
                                            >
                                              {formatValue(cell, 2)}
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                            {/* Current table */}
                            <div class="flex-1 min-w-0">
                              <div class="text-xs text-zinc-400 mb-1 font-medium">Current</div>
                              <div class="overflow-x-auto">
                                <table class="border-collapse font-mono text-[10px]">
                                  {xAxis && xAxis.length > 0 && (
                                    <thead>
                                      <tr>
                                        {yAxis && yAxis.length > 0 && (
                                          <th class="px-1.5 py-0.5 border border-zinc-700 bg-zinc-800 text-zinc-500"></th>
                                        )}
                                        {xAxis.map((val, i) => (
                                          <th key={i} class="px-1.5 py-0.5 border border-zinc-700 bg-zinc-800 text-zinc-500 text-right font-normal">
                                            {formatValue(val, 1)}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                  )}
                                  <tbody>
                                    {(currentValue as number[][]).map((row, rowIdx) => (
                                      <tr key={rowIdx}>
                                        {yAxis && yAxis.length > 0 && (
                                          <td class="px-1.5 py-0.5 border border-zinc-700 bg-zinc-800 text-zinc-500 text-right">
                                            {formatValue(yAxis[rowIdx], 1)}
                                          </td>
                                        )}
                                        {row.map((cell, colIdx) => {
                                          const isChanged = cellDiffs?.some(d => d.row === rowIdx && d.col === colIdx);
                                          return (
                                            <td
                                              key={colIdx}
                                              class={`px-1.5 py-0.5 border border-zinc-600 text-right ${
                                                isChanged ? 'bg-green-900/50 text-green-300' : 'text-zinc-400'
                                              }`}
                                            >
                                              {formatValue(cell, 2)}
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                          <div class="text-xs text-zinc-500 mt-1">
                            {cellDiffs?.length || 0} cell{(cellDiffs?.length || 0) !== 1 ? 's' : ''} changed
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div class="bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl w-[500px] max-h-[80vh] flex flex-col">
            <div class="flex justify-between items-center px-4 py-3 border-b border-zinc-700">
              <h2 class="text-lg font-semibold">Vehicle Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                class="w-8 h-8 flex items-center justify-center rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100"
              >
                ✕
              </button>
            </div>
            <div class="flex-1 p-4 overflow-y-auto space-y-6">
              {/* Vehicle Weight */}
              <div>
                <label class="block text-sm font-medium text-zinc-300 mb-2">
                  Vehicle Weight
                </label>
                <div class="flex items-center gap-2">
                  <input
                    type="number"
                    value={vehicleSettings.weight}
                    onChange={(e) => updateVehicleSettings({ weight: Number((e.target as HTMLInputElement).value) })}
                    class="flex-1 px-3 py-2 bg-zinc-700 border border-zinc-600 rounded text-sm"
                    min={500}
                    max={5000}
                    step={10}
                  />
                  <span class="text-sm text-zinc-400 w-8">kg</span>
                </div>
                <p class="text-xs text-zinc-500 mt-1">
                  Including driver, fuel, and typical load
                </p>
              </div>

              {/* Tire Size */}
              <div>
                <label class="block text-sm font-medium text-zinc-300 mb-2">
                  Tire Size
                </label>
                <div class="flex items-center gap-2">
                  <input
                    type="number"
                    value={vehicleSettings.tireWidth}
                    onChange={(e) => updateVehicleSettings({ tireWidth: Number((e.target as HTMLInputElement).value) })}
                    class="w-20 px-2 py-2 bg-zinc-700 border border-zinc-600 rounded text-sm text-center"
                    min={135}
                    max={355}
                    step={5}
                  />
                  <span class="text-zinc-500">/</span>
                  <input
                    type="number"
                    value={vehicleSettings.tireAspect}
                    onChange={(e) => updateVehicleSettings({ tireAspect: Number((e.target as HTMLInputElement).value) })}
                    class="w-16 px-2 py-2 bg-zinc-700 border border-zinc-600 rounded text-sm text-center"
                    min={20}
                    max={80}
                    step={5}
                  />
                  <span class="text-zinc-400 text-sm">R</span>
                  <input
                    type="number"
                    value={vehicleSettings.rimDiameter}
                    onChange={(e) => updateVehicleSettings({ rimDiameter: Number((e.target as HTMLInputElement).value) })}
                    class="w-16 px-2 py-2 bg-zinc-700 border border-zinc-600 rounded text-sm text-center"
                    min={13}
                    max={24}
                    step={1}
                  />
                </div>
                <p class="text-xs text-zinc-500 mt-1">
                  Example: 225/45 R17
                </p>
              </div>

              {/* Wheel Circumference */}
              <div>
                <div class="flex items-center justify-between mb-2">
                  <label class="text-sm font-medium text-zinc-300">
                    Wheel Circumference
                  </label>
                  <label class="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={vehicleSettings.useManualCircumference}
                      onChange={(e) => {
                        const useManual = (e.target as HTMLInputElement).checked;
                        if (!useManual) {
                          // Recalculate when switching back to auto
                          updateVehicleSettings({
                            useManualCircumference: false,
                            wheelCircumference: calculateWheelCircumference(
                              vehicleSettings.tireWidth,
                              vehicleSettings.tireAspect,
                              vehicleSettings.rimDiameter
                            )
                          });
                        } else {
                          updateVehicleSettings({ useManualCircumference: true });
                        }
                      }}
                      class="w-3.5 h-3.5 rounded bg-zinc-700 border-zinc-600"
                    />
                    <span class="text-zinc-400">Manual override</span>
                  </label>
                </div>
                <div class="flex items-center gap-2">
                  <input
                    type="number"
                    value={vehicleSettings.wheelCircumference}
                    onChange={(e) => updateVehicleSettings({ wheelCircumference: Number((e.target as HTMLInputElement).value) })}
                    disabled={!vehicleSettings.useManualCircumference}
                    class={`flex-1 px-3 py-2 bg-zinc-700 border border-zinc-600 rounded text-sm ${
                      !vehicleSettings.useManualCircumference ? 'opacity-60' : ''
                    }`}
                    min={1000}
                    max={3000}
                    step={1}
                  />
                  <span class="text-sm text-zinc-400 w-8">mm</span>
                </div>
                {!vehicleSettings.useManualCircumference && (
                  <p class="text-xs text-zinc-500 mt-1">
                    Calculated from tire size
                  </p>
                )}
              </div>

              {/* Info Box */}
              <div class="p-3 bg-zinc-900 rounded border border-zinc-700 text-xs text-zinc-400">
                <p class="font-medium text-zinc-300 mb-1">Torque Calculation</p>
                <p>These values are used to calculate actual wheel torque from GPS data:</p>
                <ul class="mt-2 space-y-1 ml-3">
                  <li>• Force = Mass × Acceleration</li>
                  <li>• Torque = Force × Wheel Radius</li>
                  <li>• Power = Force × Velocity</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
