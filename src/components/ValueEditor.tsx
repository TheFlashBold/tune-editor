import { useState, useEffect, useMemo } from 'preact/hooks';
import { Parameter } from '../types';
import {
  readParameterValue,
  writeParameterValue,
  readTableData,
  writeTableCell,
  readAxisData,
  writeAxisValue,
  formatValue,
  getConsistentDecimals,
  formatValueConsistent,
} from '../lib/binUtils';

interface Props {
  parameter: Parameter;
  binData: Uint8Array;
  originalBinData?: Uint8Array | null;
  calOffset?: number;
  onModify: () => void;
}

export function ValueEditor({ parameter, binData, originalBinData, calOffset = 0, onModify }: Props) {
  if (parameter.type === 'VALUE') {
    return <ScalarEditor parameter={parameter} binData={binData} originalBinData={originalBinData} calOffset={calOffset} onModify={onModify} />;
  }
  return <TableEditor parameter={parameter} binData={binData} originalBinData={originalBinData} calOffset={calOffset} onModify={onModify} />;
}

function ScalarEditor({ parameter, binData, originalBinData, calOffset = 0, onModify }: Props) {
  const [value, setValue] = useState(() => readParameterValue(binData, parameter, calOffset));
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [showOriginal, setShowOriginal] = useState(false);

  const originalValue = useMemo(
    () => originalBinData ? readParameterValue(originalBinData, parameter, calOffset) : null,
    [originalBinData, parameter, calOffset]
  );

  const hasChanged = originalValue !== null && Math.abs(originalValue - value) > 0.0001;

  useEffect(() => {
    setValue(readParameterValue(binData, parameter, calOffset));
  }, [parameter, binData, calOffset]);

  const handleDoubleClick = () => {
    setInputValue(formatValue(value, 4));
    setEditing(true);
  };

  const handleConfirm = () => {
    const newValue = parseFloat(inputValue);
    if (!isNaN(newValue)) {
      writeParameterValue(binData, parameter, newValue, calOffset);
      setValue(newValue);
      onModify();
    }
    setEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirm();
    if (e.key === 'Escape') setEditing(false);
  };

  return (
    <div>
      <div class="flex items-start justify-between mb-4">
        <div>
          <h2 class="text-lg font-semibold">
            {parameter.customName || parameter.description || parameter.name}
          </h2>
          <code class="text-xs text-zinc-500">{parameter.name}</code>
        </div>
        {originalBinData && (
          <button
            onClick={() => setShowOriginal(!showOriginal)}
            class={`px-3 py-1.5 text-sm rounded ${
              showOriginal ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
            } ${hasChanged ? 'ring-2 ring-amber-500' : ''}`}
          >
            Original
          </button>
        )}
      </div>

      <div class="flex gap-4 mb-6 p-3 bg-zinc-800 rounded text-xs text-zinc-400">
        <span>Address: 0x{parameter.address.toString(16).toUpperCase()}</span>
        <span>Type: {parameter.dataType}</span>
        <span>Unit: {parameter.unit || '-'}</span>
        <span>Range: {parameter.min} - {parameter.max}</span>
      </div>

      <div class="flex items-center gap-4">
        <div
          class="inline-flex items-baseline gap-2 px-6 py-4 bg-zinc-800 rounded-lg cursor-pointer"
          onDblClick={handleDoubleClick}
        >
          {editing ? (
            <input
              type="text"
              value={inputValue}
              onInput={e => setInputValue((e.target as HTMLInputElement).value)}
              onBlur={handleConfirm}
              onKeyDown={handleKeyDown}
              autoFocus
              class="w-48 px-2 py-1 text-2xl font-mono bg-zinc-700 border-2 border-blue-500 rounded text-zinc-100 outline-none"
            />
          ) : (
            <span class={`text-3xl font-semibold font-mono ${hasChanged ? 'text-green-400' : ''}`}>
              {formatValue(value, 4)}
            </span>
          )}
          <span class="text-base text-zinc-500">{parameter.unit}</span>
        </div>

        {showOriginal && originalValue !== null && (
          <div class="inline-flex items-baseline gap-2 px-6 py-4 bg-zinc-700 rounded-lg border-2 border-dashed border-zinc-600">
            <span class="text-3xl font-semibold font-mono text-zinc-400">
              {formatValue(originalValue, 4)}
            </span>
            <span class="text-base text-zinc-500">{parameter.unit}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function getCellColor(value: number, min: number, max: number): string {
  if (value == null || isNaN(value) || min === max) return 'hsl(60, 50%, 75%)';
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  // Hue: 120 (green) to 0 (red)
  const hue = (1 - t) * 120;
  return `hsl(${hue}, 65%, 70%)`;
}

function TableEditor({ parameter, binData, originalBinData, calOffset = 0, onModify }: Props) {
  const [tableData, setTableData] = useState<number[][]>([]);
  const [editCell, setEditCell] = useState<{ row: number; col: number } | null>(null);
  const [editAxisCell, setEditAxisCell] = useState<{ axis: 'x' | 'y'; index: number } | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [showOriginal, setShowOriginal] = useState(false);
  const [xAxisData, setXAxisData] = useState<number[]>([]);
  const [yAxisData, setYAxisData] = useState<number[]>([]);

  const originalTableData = useMemo(
    () => originalBinData ? readTableData(originalBinData, parameter, calOffset) : null,
    [originalBinData, parameter, calOffset]
  );

  const originalXAxis = useMemo(
    () => originalBinData && parameter.xAxis ? readAxisData(originalBinData, parameter.xAxis, calOffset) : null,
    [originalBinData, parameter, calOffset]
  );

  const originalYAxis = useMemo(
    () => originalBinData && parameter.yAxis ? readAxisData(originalBinData, parameter.yAxis, calOffset) : null,
    [originalBinData, parameter, calOffset]
  );

  const hasChanged = useMemo(() => {
    if (!originalTableData || tableData.length === 0) return false;
    for (let r = 0; r < tableData.length; r++) {
      if (!originalTableData[r] || !tableData[r]) continue;
      for (let c = 0; c < tableData[r].length; c++) {
        if (originalTableData[r][c] === undefined || tableData[r][c] === undefined) continue;
        if (Math.abs(originalTableData[r][c] - tableData[r][c]) > 0.0001) {
          return true;
        }
      }
    }
    // Check axis changes
    if (originalXAxis) {
      for (let i = 0; i < xAxisData.length; i++) {
        if (originalXAxis[i] === undefined || xAxisData[i] === undefined) continue;
        if (Math.abs(originalXAxis[i] - xAxisData[i]) > 0.0001) return true;
      }
    }
    if (originalYAxis) {
      for (let i = 0; i < yAxisData.length; i++) {
        if (originalYAxis[i] === undefined || yAxisData[i] === undefined) continue;
        if (Math.abs(originalYAxis[i] - yAxisData[i]) > 0.0001) return true;
      }
    }
    return false;
  }, [originalTableData, tableData, originalXAxis, xAxisData, originalYAxis, yAxisData]);

  // These are used for initial loading only
  const xAxis = useMemo(
    () => (parameter.xAxis ? readAxisData(binData, parameter.xAxis, calOffset) : []),
    [parameter, binData, calOffset]
  );

  const yAxis = useMemo(
    () => (parameter.yAxis ? readAxisData(binData, parameter.yAxis, calOffset) : []),
    [parameter, binData, calOffset]
  );

  // Initialize axis data state
  useEffect(() => {
    setXAxisData(xAxis);
    setYAxisData(yAxis);
  }, [xAxis, yAxis]);

  const { minVal, maxVal } = useMemo(() => {
    if (tableData.length === 0) return { minVal: 0, maxVal: 1 };
    const flat = tableData.flat();
    return { minVal: Math.min(...flat), maxVal: Math.max(...flat) };
  }, [tableData]);

  const { origMinVal, origMaxVal } = useMemo(() => {
    if (!originalTableData || originalTableData.length === 0) return { origMinVal: 0, origMaxVal: 1 };
    const flat = originalTableData.flat();
    return { origMinVal: Math.min(...flat), origMaxVal: Math.max(...flat) };
  }, [originalTableData]);

  // Consistent decimal places for each group
  const xDecimals = useMemo(() => getConsistentDecimals(xAxisData, 2), [xAxisData]);
  const yDecimals = useMemo(() => getConsistentDecimals(yAxisData, 2), [yAxisData]);
  const dataDecimals = useMemo(() => getConsistentDecimals(tableData.flat(), 2), [tableData]);

  useEffect(() => {
    setTableData(readTableData(binData, parameter, calOffset));
  }, [parameter, binData, calOffset]);

  const handleCellDoubleClick = (row: number, col: number) => {
    setInputValue(formatValue(tableData[row][col], 4));
    setEditCell({ row, col });
    setEditAxisCell(null);
  };

  const handleAxisDoubleClick = (axis: 'x' | 'y', index: number) => {
    const axisData = axis === 'x' ? xAxisData : yAxisData;
    setInputValue(formatValue(axisData[index], 4));
    setEditAxisCell({ axis, index });
    setEditCell(null);
  };

  const handleConfirm = () => {
    if (editCell) {
      const newValue = parseFloat(inputValue);
      if (!isNaN(newValue)) {
        writeTableCell(binData, parameter, editCell.row, editCell.col, newValue, calOffset);
        const newData = [...tableData];
        newData[editCell.row] = [...newData[editCell.row]];
        newData[editCell.row][editCell.col] = newValue;
        setTableData(newData);
        onModify();
      }
      setEditCell(null);
    } else if (editAxisCell) {
      const newValue = parseFloat(inputValue);
      if (!isNaN(newValue)) {
        const axisDef = editAxisCell.axis === 'x' ? parameter.xAxis : parameter.yAxis;
        if (axisDef) {
          writeAxisValue(binData, axisDef, editAxisCell.index, newValue, calOffset);
          if (editAxisCell.axis === 'x') {
            const newAxisData = [...xAxisData];
            newAxisData[editAxisCell.index] = newValue;
            setXAxisData(newAxisData);
          } else {
            const newAxisData = [...yAxisData];
            newAxisData[editAxisCell.index] = newValue;
            setYAxisData(newAxisData);
          }
          onModify();
        }
      }
      setEditAxisCell(null);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm();
      if (editCell) {
        const nextCol = editCell.col + 1;
        if (nextCol < (parameter.cols || 1)) {
          setTimeout(() => handleCellDoubleClick(editCell.row, nextCol), 0);
        } else if (editCell.row + 1 < (parameter.rows || 1)) {
          setTimeout(() => handleCellDoubleClick(editCell.row + 1, 0), 0);
        }
      }
    }
    if (e.key === 'Escape') {
      setEditCell(null);
      setEditAxisCell(null);
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      handleConfirm();
    }
  };

  // Check if axis value has changed
  const xAxisChanged = (index: number): boolean => {
    if (!originalXAxis || originalXAxis[index] === undefined || xAxisData[index] === undefined) return false;
    return Math.abs(originalXAxis[index] - xAxisData[index]) > 0.0001;
  };

  const yAxisChanged = (index: number): boolean => {
    if (!originalYAxis || originalYAxis[index] === undefined || yAxisData[index] === undefined) return false;
    return Math.abs(originalYAxis[index] - yAxisData[index]) > 0.0001;
  };

  // Check if a specific cell has changed
  const cellChanged = (row: number, col: number): boolean => {
    if (!originalTableData || tableData.length === 0) return false;
    if (!originalTableData[row] || !tableData[row]) return false;
    if (originalTableData[row][col] === undefined || tableData[row][col] === undefined) return false;
    return Math.abs(originalTableData[row][col] - tableData[row][col]) > 0.0001;
  };

  return (
    <div>
      <div class="flex items-start justify-between mb-4">
        <div>
          <h2 class="text-lg font-semibold">
            {parameter.customName || parameter.description || parameter.name}
          </h2>
          <code class="text-xs text-zinc-500">{parameter.name}</code>
        </div>
        {originalBinData && (
          <button
            onClick={() => setShowOriginal(!showOriginal)}
            class={`px-3 py-1.5 text-sm rounded ${
              showOriginal ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
            } ${hasChanged ? 'ring-2 ring-amber-500' : ''}`}
          >
            Original
          </button>
        )}
      </div>

      <div class="flex flex-wrap gap-4 mb-6 p-3 bg-zinc-800 rounded text-xs text-zinc-400">
        <span>Address: 0x{parameter.address.toString(16).toUpperCase()}</span>
        <span>Size: {parameter.rows || 1} x {parameter.cols || 1}</span>
        <span>Z: {parameter.unit || '-'}</span>
        {parameter.xAxis && <span>X: {parameter.xAxis.unit || '-'}</span>}
        {parameter.yAxis && <span>Y: {parameter.yAxis.unit || '-'}</span>}
      </div>

      <div class="overflow-auto max-h-[calc(100vh-200px)]">
        <table class="border-collapse font-mono text-xs table-fixed">
          <colgroup>
            {yAxisData.length > 0 && <col class="w-12" />}
            {yAxisData.length > 0 && <col class="w-16" />}
            {Array.from({ length: parameter.cols || 1 }).map((_, i) => (
              <col key={i} class="w-16" />
            ))}
          </colgroup>
          <thead>
            <tr>
              {yAxisData.length > 0 && (
                <th class="p-1 border border-zinc-700 bg-zinc-800 text-zinc-500 font-normal text-left align-top">
                  {parameter.unit || 'Z'}
                </th>
              )}
              {yAxisData.length > 0 && <th class="border border-zinc-700 bg-zinc-800"></th>}
              <th
                colSpan={parameter.cols || 1}
                class="p-1 border border-zinc-700 bg-zinc-800 text-zinc-500 font-normal text-center"
              >
                {parameter.xAxis?.unit || 'X'} →
              </th>
            </tr>
            <tr>
              {yAxisData.length > 0 && <th class="border border-zinc-700 bg-zinc-800"></th>}
              {yAxisData.length > 0 && <th class="border border-zinc-700 bg-zinc-700"></th>}
              {xAxisData.length > 0
                ? xAxisData.map((val, i) => {
                    const isEditing = editAxisCell?.axis === 'x' && editAxisCell?.index === i;
                    const isChanged = xAxisChanged(i);
                    const displayValue = showOriginal && originalXAxis ? originalXAxis[i] : val;
                    const canEdit = parameter.xAxis?.address;
                    return (
                      <th
                        key={i}
                        class={`p-1.5 border border-zinc-700 bg-zinc-800 text-zinc-400 font-medium text-right ${
                          canEdit ? 'cursor-pointer hover:bg-zinc-700' : ''
                        }`}
                        style={{
                          outline: isChanged && !showOriginal ? '2px solid #f59e0b' : undefined,
                          outlineOffset: '-2px',
                        }}
                        onDblClick={() => canEdit && handleAxisDoubleClick('x', i)}
                      >
                        {isEditing ? (
                          <input
                            type="text"
                            value={inputValue}
                            onInput={e => setInputValue((e.target as HTMLInputElement).value)}
                            onBlur={handleConfirm}
                            onKeyDown={handleKeyDown}
                            autoFocus
                            class="w-full bg-zinc-700 text-zinc-100 font-mono text-xs text-right outline-none border border-blue-500 rounded px-1"
                          />
                        ) : (
                          formatValueConsistent(displayValue, xDecimals)
                        )}
                      </th>
                    );
                  })
                : Array.from({ length: parameter.cols || 1 }).map((_, i) => (
                    <th
                      key={i}
                      class="p-1.5 border border-zinc-700 bg-zinc-800 text-zinc-400 font-medium text-right"
                    >
                      {i}
                    </th>
                  ))}
            </tr>
          </thead>
          <tbody>
            {tableData.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {yAxisData.length > 0 && rowIdx === 0 && (
                  <td
                    rowSpan={tableData.length}
                    class="p-1 border border-zinc-700 bg-zinc-800 text-zinc-500 font-normal text-center align-middle"
                    style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                  >
                    {parameter.yAxis?.unit || 'Y'} ↓
                  </td>
                )}
                {yAxisData.length > 0 && (() => {
                  const isEditing = editAxisCell?.axis === 'y' && editAxisCell?.index === rowIdx;
                  const isChanged = yAxisChanged(rowIdx);
                  const displayValue = showOriginal && originalYAxis ? originalYAxis[rowIdx] : yAxisData[rowIdx];
                  const canEdit = parameter.yAxis?.address;
                  return (
                    <td
                      class={`p-1.5 border border-zinc-700 bg-zinc-800 text-zinc-400 font-medium text-right ${
                        canEdit ? 'cursor-pointer hover:bg-zinc-700' : ''
                      }`}
                      style={{
                        outline: isChanged && !showOriginal ? '2px solid #f59e0b' : undefined,
                        outlineOffset: '-2px',
                      }}
                      onDblClick={() => canEdit && handleAxisDoubleClick('y', rowIdx)}
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          value={inputValue}
                          onInput={e => setInputValue((e.target as HTMLInputElement).value)}
                          onBlur={handleConfirm}
                          onKeyDown={handleKeyDown}
                          autoFocus
                          class="w-full bg-zinc-700 text-zinc-100 font-mono text-xs text-right outline-none border border-blue-500 rounded px-1"
                        />
                      ) : (
                        formatValueConsistent(displayValue, yDecimals)
                      )}
                    </td>
                  );
                })()}
                {row.map((cell, colIdx) => {
                  const isEditing = editCell?.row === rowIdx && editCell?.col === colIdx;
                  const isChanged = cellChanged(rowIdx, colIdx);
                  const displayValue = showOriginal && originalTableData
                    ? originalTableData[rowIdx][colIdx]
                    : cell;
                  const colorMin = showOriginal ? origMinVal : minVal;
                  const colorMax = showOriginal ? origMaxVal : maxVal;
                  const bgColor = getCellColor(displayValue, colorMin, colorMax);
                  return (
                    <td
                      key={colIdx}
                      class="p-1.5 border border-zinc-600 text-right cursor-pointer text-zinc-900 hover:brightness-110 min-w-16"
                      style={{
                        backgroundColor: isEditing ? '#3b82f6' : bgColor,
                        outline: isChanged && !showOriginal ? '2px solid #f59e0b' : undefined,
                        outlineOffset: '-2px',
                      }}
                      onDblClick={() => handleCellDoubleClick(rowIdx, colIdx)}
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          value={inputValue}
                          onInput={e => setInputValue((e.target as HTMLInputElement).value)}
                          onBlur={handleConfirm}
                          onKeyDown={handleKeyDown}
                          autoFocus
                          class="w-full bg-transparent text-white font-mono text-xs text-right outline-none"
                        />
                      ) : (
                        formatValueConsistent(displayValue, dataDecimals)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
