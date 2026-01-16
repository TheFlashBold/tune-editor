import { useState, useCallback, useRef, useMemo } from 'preact/hooks';
import type { Definition, Parameter } from './types';
import { FileLoader } from './components/FileLoader';
import { CategoryTree } from './components/CategoryTree';
import { ValueEditor } from './components/ValueEditor';
import { readParameterValue, readTableData, readAxisData, formatValue } from './lib/binUtils';
import './app.css';

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
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [definition, setDefinition] = useState<Definition | null>(null);
  const [binData, setBinData] = useState<Uint8Array | null>(null);
  const [binFileName, setBinFileName] = useState<string | null>(null);
  const [originalBinData, setOriginalBinData] = useState<Uint8Array | null>(null);
  const [originalBinFileName, setOriginalBinFileName] = useState<string | null>(null);
  const [selectedParam, setSelectedParam] = useState<Parameter | null>(null);
  const [modified, setModified] = useState(false);

  const jsonInputRef = useRef<HTMLInputElement>(null);
  const binInputRef = useRef<HTMLInputElement>(null);
  const originalBinInputRef = useRef<HTMLInputElement>(null);

  const handleDefinitionLoad = useCallback((def: Definition) => {
    setDefinition(def);
    setSelectedParam(null);
    setShowConverter(false);
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

        <button
          onClick={() => setShowConverter(true)}
          class="px-3 py-1 text-sm rounded hover:bg-zinc-700"
        >
          A2L Converter
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

        <main class="flex-1 overflow-auto p-4">
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

      {/* Converter Modal */}
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
    </div>
  );
}
