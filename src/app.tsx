import { useState, useCallback, useRef, useMemo } from 'preact/hooks';
import type { Definition, Parameter } from './types';
import { FileLoader } from './components/FileLoader';
import { XdfLoader } from './components/XdfLoader';
import { CategoryTree } from './components/CategoryTree';
import { ValueEditor } from './components/ValueEditor';
import { LogViewer } from './components/LogViewer';
import { BLEConnector } from './components/BLEConnector';
import { Modal } from './components/Modal';
import { readParameterValue, readTableData, readAxisData, formatValue, debugHexDump, debugLayoutComparison, debugFindDataOffset, debugTableAddresses, detectEccPresence, debugEccBlock, addressToOffset } from './lib/binUtils';
import { loadDefinitionIndex, loadDefinition, findMatchingDefinitions, type DefinitionIndexEntry } from './lib/definitionLoader';
import { s19ToBinary, isS19File, hexToBinary, isHexFile } from './lib/s19Parser';
import './app.css';

// Vehicle settings interface
export interface VehicleSettings {
  weight: number; // kg
  tireWidth: number; // mm (e.g., 225)
  tireAspect: number; // % (e.g., 45)
  rimDiameter: number; // inches (e.g., 17)
  wheelCircumference: number; // mm (calculated or manual)
  useManualCircumference: boolean;
  gearRatios: number[]; // gear ratio for each gear (index 0 = neutral, 1-7 = gears)
  finalDrive: number; // final drive ratio (Achsübersetzung)
  loggingRate: number; // Hz
}

const DEFAULT_VEHICLE_SETTINGS: VehicleSettings = {
  weight: 1500,
  tireWidth: 225,
  tireAspect: 45,
  rimDiameter: 17,
  wheelCircumference: 1987,
  useManualCircumference: false,
  // Total ratios (gear × final drive) - set finalDrive to 1 when using total ratios
  gearRatios: [0, 13.24, 8.23, 5.79, 4.33, 3.40, 2.87, 0],
  finalDrive: 1,
  loggingRate: 20,
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
  const [showDefinitions, setShowDefinitions] = useState(false);
  const [logViewerData, setLogViewerData] = useState<string | null>(null);
  const [showChanges, setShowChanges] = useState(false);
  const [showDefinitionPicker, setShowDefinitionPicker] = useState(false);
  const [definitionMatches, setDefinitionMatches] = useState<{ entry: DefinitionIndexEntry; mode: 'full' | 'cal' }[]>([]);
  const [allDefinitions, setAllDefinitions] = useState<DefinitionIndexEntry[]>([]);
  const [detectedMode, setDetectedMode] = useState<'full' | 'cal' | null>(null);
  const [calOffset, setCalOffset] = useState<number>(0);
  const [definition, setDefinition] = useState<Definition | null>(null);
  const [binData, setBinData] = useState<Uint8Array | null>(null);
  const [binFileName, setBinFileName] = useState<string | null>(null);
  const [originalBinData, setOriginalBinData] = useState<Uint8Array | null>(null);
  const [originalBinFileName, setOriginalBinFileName] = useState<string | null>(null);
  const [selectedParam, setSelectedParam] = useState<Parameter | null>(null);
  const [modified, setModified] = useState(false);
  const [vehicleSettings, setVehicleSettings] = useState<VehicleSettings>(loadSettings);
  const [dragOverDef, setDragOverDef] = useState(false);
  const [dragOverBin, setDragOverBin] = useState(false);
  const [hasEcc, setHasEcc] = useState(false); // Whether ECC was detected in the bin file

  const jsonInputRef = useRef<HTMLInputElement>(null);
  const binInputRef = useRef<HTMLInputElement>(null);

  // Expose debug functions to window for console debugging
  (window as any).debug = {
    getBinData: () => binData,
    getDefinition: () => definition,
    getSelectedParam: () => selectedParam,
    getCalOffset: () => calOffset,
    hexDump: (addr: number, len: number = 64) => binData && console.log(debugHexDump(binData, addr, len, calOffset)),
    readTable: (paramName?: string) => {
      const p = paramName ? definition?.parameters.find(x => x.name === paramName) : selectedParam;
      if (!p || !binData) return null;
      return readTableData(binData, p, calOffset, true); // debug=true
    },
    readAxis: (paramName?: string, axis: 'x' | 'y' = 'x') => {
      const p = paramName ? definition?.parameters.find(x => x.name === paramName) : selectedParam;
      if (!p || !binData) return null;
      const axisDef = axis === 'x' ? p.xAxis : p.yAxis;
      if (!axisDef) return null;
      return readAxisData(binData, axisDef, calOffset);
    },
    // Compare ROW_DIR vs COLUMN_DIR layouts to identify actual storage format
    compareLayouts: (paramName?: string) => {
      const p = paramName ? definition?.parameters.find(x => x.name === paramName) : selectedParam;
      if (!p || !binData) { console.log('No param or binData'); return; }
      debugLayoutComparison(binData, p, calOffset);
    },
    // Search for correct data offset by trying different byte offsets
    findOffset: (paramName?: string) => {
      const p = paramName ? definition?.parameters.find(x => x.name === paramName) : selectedParam;
      if (!p || !binData) { console.log('No param or binData'); return; }
      debugFindDataOffset(binData, p, calOffset);
    },
    // Show all addresses for a table and highlight 0xFF00 values
    tableAddresses: (paramName?: string) => {
      const p = paramName ? definition?.parameters.find(x => x.name === paramName) : selectedParam;
      if (!p || !binData) { console.log('No param or binData'); return; }
      debugTableAddresses(binData, p, calOffset);
    },
    // Analyze ECC block at a specific offset or at the selected param's address
    eccBlock: (offset?: number) => {
      if (!binData) { console.log('No binData'); return; }
      let blockOffset: number;
      if (offset !== undefined) {
        blockOffset = Math.floor(offset / 64) * 64; // Align to 64-byte block
      } else if (selectedParam) {
        const fileOffset = addressToOffset(selectedParam.address, calOffset);
        blockOffset = Math.floor(fileOffset / 64) * 64;
      } else {
        console.log('No offset provided and no param selected');
        return;
      }
      debugEccBlock(binData, blockOffset);
    },
    getHasEcc: () => hasEcc,
  };
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

    let data: Uint8Array;
    let displayName = file.name;

    // Parse S19/HEX files, otherwise load as binary
    if (isS19File(file.name)) {
      const text = await file.text();
      data = s19ToBinary(text);
      displayName = file.name.replace(/\.(s19|srec|mot)$/i, '.bin');
    } else if (isHexFile(file.name)) {
      const text = await file.text();
      data = hexToBinary(text);
      displayName = file.name.replace(/\.(hex|ihex)$/i, '.bin');
    } else {
      const buffer = await file.arrayBuffer();
      data = new Uint8Array(buffer);
    }

    setBinData(data);
    setBinFileName(displayName);
    setModified(false);
    setShowFileMenu(false);
    if (binInputRef.current) binInputRef.current.value = '';

    // Detect ECC presence
    const eccResult = detectEccPresence(data, 20);
    setHasEcc(eccResult.hasEcc);

    // Auto-detect and load matching definition
    try {
      const matches = await findMatchingDefinitions(data);
      if (matches.length === 1) {
        const match = matches[0];
        const def = await loadDefinition(match.entry.file);
        setDefinition(def);
        setDetectedMode(match.mode);
        setCalOffset(match.mode === 'cal' ? (match.entry.verification?.calOffset || 0) : 0);
        setSelectedParam(null);
      } else if (matches.length > 1) {
        setDefinitionMatches(matches);
        setShowDefinitionPicker(true);
      }
    } catch (err) {
      console.error('Definition auto-detect failed:', err);
    }
  }, []);

  const handleSelectDefinition = useCallback(async (entry: DefinitionIndexEntry, mode: 'full' | 'cal') => {
    try {
      const def = await loadDefinition(entry.file);
      setDefinition(def);
      setDetectedMode(mode);
      // For CAL-only files, subtract calOffset to get file offset; for full BIN, addresses map directly
      setCalOffset(mode === 'cal' ? (entry.verification?.calOffset || 0) : 0);
      setSelectedParam(null);
      setShowDefinitionPicker(false);
      setDefinitionMatches([]); // Clear notification after loading
    } catch (err) {
      console.error('Failed to load definition:', err);
    }
  }, []);

  const handleSearchDefinitions = useCallback(async () => {
    if (!binData) return;
    try {
      const matches = await findMatchingDefinitions(binData);
      const all = await loadDefinitionIndex();
      setDefinitionMatches(matches);
      setAllDefinitions(all);
      setShowDefinitionPicker(true);
      setShowFileMenu(false);
    } catch (err) {
      console.error('Definition search failed:', err);
    }
  }, [binData]);

  // Drag and drop handlers
  const handleDefDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    setDragOverDef(false);
    const file = e.dataTransfer?.files[0];
    if (!file || !file.name.endsWith('.json')) return;
    try {
      const text = await file.text();
      const def = JSON.parse(text) as Definition;
      setDefinition(def);
      setSelectedParam(null);
    } catch (err) {
      console.error('Failed to load definition:', err);
    }
  }, []);

  const handleBinDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    setDragOverBin(false);
    const file = e.dataTransfer?.files[0];
    if (!file) return;

    const ext = file.name.toLowerCase();
    const isBinFile = ext.endsWith('.bin') || ext.endsWith('.ori') || ext.endsWith('.mod');
    const isS19 = isS19File(file.name);
    const isHex = isHexFile(file.name);
    if (!isBinFile && !isS19 && !isHex) return;

    let data: Uint8Array;
    let displayName = file.name;

    // Parse S19/HEX files, otherwise load as binary
    if (isS19) {
      const text = await file.text();
      data = s19ToBinary(text);
      displayName = file.name.replace(/\.(s19|srec|mot)$/i, '.bin');
    } else if (isHex) {
      const text = await file.text();
      data = hexToBinary(text);
      displayName = file.name.replace(/\.(hex|ihex)$/i, '.bin');
    } else {
      const buffer = await file.arrayBuffer();
      data = new Uint8Array(buffer);
    }

    setBinData(data);
    setBinFileName(displayName);
    setModified(false);

    // Detect ECC presence
    const eccResult = detectEccPresence(data, 20);
    setHasEcc(eccResult.hasEcc);

    // Auto-detect and load matching definition
    try {
      const matches = await findMatchingDefinitions(data);
      if (matches.length === 1) {
        const match = matches[0];
        const def = await loadDefinition(match.entry.file);
        setDefinition(def);
        setDetectedMode(match.mode);
        setCalOffset(match.mode === 'cal' ? (match.entry.verification?.calOffset || 0) : 0);
        setSelectedParam(null);
      } else if (matches.length > 1) {
        setDefinitionMatches(matches);
        setShowDefinitionPicker(true);
      }
    } catch (err) {
      console.error('Definition auto-detect failed:', err);
    }
  }, []);

  const preventDefaults = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
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
        const originalValue = readParameterValue(originalBinData, param, calOffset);
        const currentValue = readParameterValue(binData, param, calOffset);
        if (Math.abs(originalValue - currentValue) > 0.0001) {
          diffs.push({ param, originalValue, currentValue });
        }
      } else {
        const originalTable = readTableData(originalBinData, param, calOffset);
        const currentTable = readTableData(binData, param, calOffset);
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
          const originalXAxis = readAxisData(originalBinData, param.xAxis, calOffset);
          const currentXAxis = readAxisData(binData, param.xAxis, calOffset);
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
          const originalYAxis = readAxisData(originalBinData, param.yAxis, calOffset);
          const currentYAxis = readAxisData(binData, param.yAxis, calOffset);
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
          const xAxis = param.xAxis ? readAxisData(binData, param.xAxis, calOffset) : undefined;
          const yAxis = param.yAxis ? readAxisData(binData, param.yAxis, calOffset) : undefined;

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
  }, [definition, binData, originalBinData, calOffset]);

  return (
    <div class="flex flex-col h-screen bg-zinc-900 text-zinc-100">
      {/* Menu Bar */}
      <header class="flex items-center gap-1 px-1 py-1 bg-zinc-800 border-b border-zinc-700">
        {/* File Menu */}
        <div class="relative">
          <button
              onClick={() => setShowFileMenu(!showFileMenu)}
              className={`px-3 py-1 text-sm rounded hover:bg-zinc-700 ${showFileMenu ? 'bg-zinc-700' : ''}`}
          >
            File
          </button>
          {showFileMenu && (
              <>
                <div class="fixed inset-0 z-10" onClick={() => setShowFileMenu(false)}/>
                <div
                    class="absolute left-0 top-full mt-1 w-48 bg-zinc-800 border border-zinc-600 rounded shadow-lg z-20">
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
                    Open BIN/S19/HEX...
                    <input
                        type="file"
                        accept=".bin,.ori,.mod,.s19,.srec,.mot,.hex,.ihex"
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
                  <div class="border-t border-zinc-600 my-1"/>
                  <button
                      onClick={handleSearchDefinitions}
                      disabled={!binData}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-700 disabled:text-zinc-500 disabled:hover:bg-transparent"
                  >
                    Find Definition...
                  </button>
                  <div class="border-t border-zinc-600 my-1"/>
                  <button
                      onClick={handleSaveBin}
                      disabled={!modified}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-700 disabled:text-zinc-500 disabled:hover:bg-transparent"
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
              className={`px-3 py-1 text-sm rounded hover:bg-zinc-700 ${showToolsMenu ? 'bg-zinc-700' : ''}`}
          >
            Tools
          </button>
          {showToolsMenu && (
              <>
                <div class="fixed inset-0 z-10" onClick={() => setShowToolsMenu(false)}/>
                <div
                    class="absolute left-0 top-full mt-1 w-48 bg-zinc-800 border border-zinc-600 rounded shadow-lg z-20">
                  <button
                      onClick={() => {
                        setShowConverter(true);
                        setShowToolsMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-700"
                  >
                    A2L Converter
                  </button>
                  <button
                      onClick={() => {
                        setShowXdfConverter(true);
                        setShowToolsMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-700"
                  >
                    XDF Converter
                  </button>
                </div>
              </>
          )}
        </div>

        {/* Settings Button */}
        <button
            onClick={() => setShowSettings(true)}
            className="px-3 py-1 text-sm rounded hover:bg-zinc-700"
        >
          Settings
        </button>

        <button
            onClick={() => {
              setShowLogViewer(true);
              setShowToolsMenu(false);
            }}
            className="px-3 py-1 text-sm rounded hover:bg-zinc-700"
        >
          Log Viewer
        </button>

        <button
            onClick={() => {
              setShowBLEConnector(true);
              setShowToolsMenu(false);
            }}
            className="px-3 py-1 text-sm rounded hover:bg-zinc-700"
        >
          Connect (BLE)
        </button>

        <button
            onClick={async () => {
              try {
                const defs = await loadDefinitionIndex();
                setAllDefinitions(defs);
                setShowDefinitions(true);
              } catch (err) {
                console.error('Failed to load definitions:', err);
              }
            }}
            className="px-3 py-1 text-sm rounded hover:bg-zinc-700"
        >
          Definitions
        </button>

        {originalBinData && binData && (
            <button
                onClick={() => setShowChanges(true)}
                className="px-3 py-1 text-sm rounded hover:bg-zinc-700"
            >
              Changes ({changes.length})
            </button>
        )}

        <div class="flex-1"/>

        {originalBinFileName && (
            <div class="flex items-center gap-2 mr-2">
              <span class="text-xs text-zinc-500">Original:</span>
              <span class="font-mono text-sm text-zinc-400">{originalBinFileName}</span>
            </div>
        )}
        {binFileName && (
            <div class="flex items-center gap-2 mr-2">
              <span class="font-mono text-sm text-zinc-400">{binFileName}</span>
              {detectedMode && (
                  <span class={`px-2 py-0.5 rounded text-xs font-medium ${
                      detectedMode === 'cal' ? 'bg-blue-900 text-blue-300' : 'bg-purple-900 text-purple-300'
                  }`}>
                {detectedMode === 'cal' ? 'CAL' : 'Full'}
              </span>
              )}
              {detectedMode && definition?.verification?.expected && (
                  <span class="px-2 py-0.5 rounded text-xs font-medium bg-zinc-700 text-zinc-300">
                    {definition.verification.expected}
                  </span>
              )}
              {hasEcc && (
                  <span class="px-2 py-0.5 rounded text-xs font-medium bg-orange-900 text-orange-300">
                    ECC
                  </span>
              )}
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
        <aside
            class={`w-80 flex flex-col bg-zinc-800 border-r border-zinc-700 transition-colors ${
                dragOverDef ? 'bg-blue-900/30 border-blue-500' : ''
            }`}
            onDragOver={(e) => { preventDefaults(e); setDragOverDef(true); }}
          onDragEnter={(e) => { preventDefaults(e); setDragOverDef(true); }}
          onDragLeave={() => setDragOverDef(false)}
          onDrop={handleDefDrop}
        >
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
              {dragOverDef ? (
                <p class="text-blue-400">Drop .json file here</p>
              ) : (
                <>
                  <p>No definition loaded</p>
                  <p class="mt-2">Click or drop Definition</p>
                  <p class="mt-1 text-xs">or use A2L Converter</p>
                </>
              )}
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

        <main
          class={`flex-1 overflow-auto p-4 relative transition-colors ${
            dragOverBin ? 'bg-green-900/20' : ''
          }`}
          onDragOver={(e) => { preventDefaults(e); setDragOverBin(true); }}
          onDragEnter={(e) => { preventDefaults(e); setDragOverBin(true); }}
          onDragLeave={() => setDragOverBin(false)}
          onDrop={handleBinDrop}
        >
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
                {dragOverBin ? (
                  <p class="text-green-400">Drop .bin, .s19, or .hex file here</p>
                ) : (
                  <>
                    <p>Click or drop BIN/S19/HEX file</p>
                    <p class="text-xs mt-1">or use File → Open BIN/S19/HEX</p>
                  </>
                )}
              </div>
              <input
                type="file"
                accept=".bin,.ori,.mod,.s19,.srec,.mot,.hex,.ihex"
                onChange={async (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (!file) return;

                  let data: Uint8Array;
                  let displayName = file.name;

                  if (isS19File(file.name)) {
                    const text = await file.text();
                    data = s19ToBinary(text);
                    displayName = file.name.replace(/\.(s19|srec|mot)$/i, '.bin');
                  } else if (isHexFile(file.name)) {
                    const text = await file.text();
                    data = hexToBinary(text);
                    displayName = file.name.replace(/\.(hex|ihex)$/i, '.bin');
                  } else {
                    const buffer = await file.arrayBuffer();
                    data = new Uint8Array(buffer);
                  }

                  setBinData(data);
                  setBinFileName(displayName);
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
              calOffset={calOffset}
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
        <Modal title="Settings" onClose={() => setShowSettings(false)} width="lg">
          <div class="space-y-5 sm:space-y-6">
            {/* Logging Section */}
            <div class="border-b border-zinc-700 pb-1">
              <h3 class="text-sm font-semibold text-zinc-200">Logging</h3>
            </div>

            {/* Logging Rate */}
            <div>
              <label class="block text-sm font-medium text-zinc-300 mb-2">
                Logging Rate
              </label>
              <div class="flex items-center gap-2">
                <input
                  type="number"
                  value={vehicleSettings.loggingRate}
                  onChange={(e) => updateVehicleSettings({ loggingRate: Number((e.target as HTMLInputElement).value) })}
                  class="w-20 px-3 py-2.5 sm:py-2 bg-zinc-700 border border-zinc-600 rounded text-sm"
                  min={1}
                  max={100}
                  step={1}
                />
                <span class="text-sm text-zinc-400">Hz</span>
                <span class="text-xs text-zinc-500 ml-2">
                  ({(1000 / vehicleSettings.loggingRate).toFixed(0)}ms per frame)
                </span>
              </div>
              <p class="text-xs text-zinc-500 mt-1">
                Higher rates need faster ECU response. Check query time in datalogger.
              </p>
            </div>

            {/* Vehicle Section */}
            <div class="border-b border-zinc-700 pb-1 mt-2">
              <h3 class="text-sm font-semibold text-zinc-200">Vehicle</h3>
            </div>

            {/* Vehicle Weight */}
            <div>
              <label class="block text-sm font-medium text-zinc-300 mb-2">
                Weight
              </label>
              <div class="flex items-center gap-2">
                <input
                  type="number"
                  value={vehicleSettings.weight}
                  onChange={(e) => updateVehicleSettings({ weight: Number((e.target as HTMLInputElement).value) })}
                  class="flex-1 px-3 py-2.5 sm:py-2 bg-zinc-700 border border-zinc-600 rounded text-sm"
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
              <div class="flex items-center gap-1.5 sm:gap-2">
                <input
                  type="number"
                  value={vehicleSettings.tireWidth}
                  onChange={(e) => updateVehicleSettings({ tireWidth: Number((e.target as HTMLInputElement).value) })}
                  class="w-16 sm:w-20 px-2 py-2.5 sm:py-2 bg-zinc-700 border border-zinc-600 rounded text-sm text-center"
                  min={135}
                  max={355}
                  step={5}
                />
                <span class="text-zinc-500">/</span>
                <input
                  type="number"
                  value={vehicleSettings.tireAspect}
                  onChange={(e) => updateVehicleSettings({ tireAspect: Number((e.target as HTMLInputElement).value) })}
                  class="w-14 sm:w-16 px-2 py-2.5 sm:py-2 bg-zinc-700 border border-zinc-600 rounded text-sm text-center"
                  min={20}
                  max={80}
                  step={5}
                />
                <span class="text-zinc-400 text-sm">R</span>
                <input
                  type="number"
                  value={vehicleSettings.rimDiameter}
                  onChange={(e) => updateVehicleSettings({ rimDiameter: Number((e.target as HTMLInputElement).value) })}
                  class="w-14 sm:w-16 px-2 py-2.5 sm:py-2 bg-zinc-700 border border-zinc-600 rounded text-sm text-center"
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
              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                <label class="text-sm font-medium text-zinc-300">
                  Wheel Circumference
                </label>
                <label class="flex items-center gap-2 text-xs cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={vehicleSettings.useManualCircumference}
                    onChange={(e) => {
                      const useManual = (e.target as HTMLInputElement).checked;
                      if (!useManual) {
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
                    class="w-4 h-4 sm:w-3.5 sm:h-3.5 rounded bg-zinc-700 border-zinc-600"
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
                  class={`flex-1 px-3 py-2.5 sm:py-2 bg-zinc-700 border border-zinc-600 rounded text-sm ${
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

            {/* Drivetrain Section */}
            <div class="border-b border-zinc-700 pb-1 mt-2">
              <h3 class="text-sm font-semibold text-zinc-200">Drivetrain</h3>
            </div>

            {/* Gear Ratios */}
            <div>
              <label class="block text-sm font-medium text-zinc-300 mb-2">
                Gear Ratios (Total)
              </label>
              <div class="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {[1, 2, 3, 4, 5, 6, 7].map((gear) => (
                  <div key={gear} class="flex flex-col items-center">
                    <span class="text-xs text-zinc-500 mb-1">Gear {gear}</span>
                    <input
                      type="number"
                      value={vehicleSettings.gearRatios[gear] || 0}
                      onChange={(e) => {
                        const newRatios = [...vehicleSettings.gearRatios];
                        newRatios[gear] = Number((e.target as HTMLInputElement).value);
                        updateVehicleSettings({ gearRatios: newRatios });
                      }}
                      class="w-full px-2 py-2 sm:py-1.5 bg-zinc-700 border border-zinc-600 rounded text-sm text-center"
                      min={0}
                      max={10}
                      step={0.01}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Final Drive */}
            <div>
              <label class="block text-sm font-medium text-zinc-300 mb-2">
                Final Drive Ratio
              </label>
              <div class="flex items-center gap-2">
                <input
                  type="number"
                  value={vehicleSettings.finalDrive}
                  onChange={(e) => updateVehicleSettings({ finalDrive: Number((e.target as HTMLInputElement).value) })}
                  class="w-24 px-3 py-2.5 sm:py-2 bg-zinc-700 border border-zinc-600 rounded text-sm"
                  min={1}
                  max={6}
                  step={0.01}
                />
                <span class="text-sm text-zinc-400">:1</span>
              </div>
            </div>

            {/* Info Box */}
            <div class="p-3 bg-zinc-900 rounded border border-zinc-700 text-xs text-zinc-400">
              <p class="font-medium text-zinc-300 mb-1">Dyno Light Calculation</p>
              <p>These values are used for torque comparison:</p>
              <ul class="mt-2 space-y-1 ml-3">
                <li>• Total Ratio = Gear Ratio × Final Drive</li>
                <li>• Calculated Engine Torque = Wheel Torque / Total Ratio</li>
                <li>• Difference shows drivetrain losses</li>
              </ul>
              <p class="mt-2 text-zinc-500">
                Tip: Enter total ratios directly and set Final Drive to 1
              </p>
            </div>
          </div>
        </Modal>
      )}

      {/* Definition Picker Modal */}
      {showDefinitionPicker && (
        <Modal title="Select Definition" onClose={() => setShowDefinitionPicker(false)} width="lg">
          <div class="space-y-4">
            {definitionMatches.length > 0 && (
              <div>
                <h3 class="text-sm font-semibold text-green-400 mb-2">
                  Matching Definitions ({definitionMatches.length})
                </h3>
                <div class="space-y-2">
                  {definitionMatches.map(({ entry, mode }) => (
                    <button
                      key={entry.file}
                      onClick={() => handleSelectDefinition(entry, mode)}
                      class="w-full text-left p-3 bg-zinc-700 hover:bg-zinc-600 rounded border border-zinc-600 transition-colors"
                    >
                      <div class="flex items-center justify-between">
                        <div>
                          <div class="font-medium">{entry.name}</div>
                          <div class="text-xs text-zinc-400 mt-1">
                            {entry.paramCount} parameters · {entry.verification.expected}
                          </div>
                        </div>
                        <div class="text-xs px-2 py-1 rounded bg-green-900 text-green-300">
                          {mode === 'cal' ? 'CAL Block' : 'Full BIN'}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {definitionMatches.length === 0 && (
              <div class="text-center py-4 text-zinc-500">
                No matching definitions found for this binary.
              </div>
            )}

            {allDefinitions.length > 0 && (
              <div>
                <h3 class="text-sm font-semibold text-zinc-400 mb-2 mt-4">
                  All Definitions ({allDefinitions.length})
                </h3>
                <div class="max-h-60 overflow-y-auto space-y-1">
                  {allDefinitions.map((entry) => (
                    <button
                      key={entry.file}
                      onClick={() => handleSelectDefinition(entry, 'cal')}
                      class="w-full text-left px-3 py-2 text-sm hover:bg-zinc-700 rounded transition-colors"
                    >
                      <span class="font-medium">{entry.name}</span>
                      <span class="text-zinc-500 ml-2">({entry.paramCount})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Definitions Modal */}
      {showDefinitions && (
        <Modal title="Definitions" onClose={() => setShowDefinitions(false)} width="lg">
          <div class="space-y-4">
            {allDefinitions.length === 0 ? (
              <div class="text-center py-4 text-zinc-500">
                No definitions available.
              </div>
            ) : (
              <div>
                <div class="text-sm text-zinc-400 mb-3">
                  {allDefinitions.length} definition{allDefinitions.length !== 1 ? 's' : ''} available
                </div>
                <div class="max-h-96 overflow-y-auto space-y-1">
                  {allDefinitions.map((entry) => (
                    <button
                      key={entry.file}
                      onClick={async () => {
                        try {
                          const def = await loadDefinition(entry.file);
                          setDefinition(def);
                          setCalOffset(entry.verification?.calOffset || 0);
                          setSelectedParam(null);
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
                            CAL @ 0x{entry.verification.calOffset.toString(16).toUpperCase()}
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
    </div>
  );
}
