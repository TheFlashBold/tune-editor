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

interface Selection {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

function normalizeSelection(sel: Selection): Selection {
  return {
    startRow: Math.min(sel.startRow, sel.endRow),
    startCol: Math.min(sel.startCol, sel.endCol),
    endRow: Math.max(sel.startRow, sel.endRow),
    endCol: Math.max(sel.startCol, sel.endCol),
  };
}

function TableEditor({ parameter, binData, originalBinData, calOffset = 0, onModify }: Props) {
  const [tableData, setTableData] = useState<number[][]>([]);
  const [editCell, setEditCell] = useState<{ row: number; col: number } | null>(null);
  const [editAxisCell, setEditAxisCell] = useState<{ axis: 'x' | 'y'; index: number } | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [showOriginal, setShowOriginal] = useState(false);
  const [xAxisData, setXAxisData] = useState<number[]>([]);
  const [yAxisData, setYAxisData] = useState<number[]>([]);

  // Selection state
  const [selection, setSelection] = useState<Selection | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionAnchor, setSelectionAnchor] = useState<{ row: number; col: number } | null>(null);
  const [modifyValue, setModifyValue] = useState('');
  const [showModifyInput, setShowModifyInput] = useState<'add' | 'multiply' | 'set' | null>(null);

  // Axis selection state
  const [axisSelection, setAxisSelection] = useState<{ axis: 'x' | 'y'; start: number; end: number } | null>(null);
  const [isAxisSelecting, setIsAxisSelecting] = useState(false);
  const [axisSelectionAnchor, setAxisSelectionAnchor] = useState<{ axis: 'x' | 'y'; index: number } | null>(null);

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

  // Check if a cell is in the current selection
  const isSelected = (row: number, col: number): boolean => {
    if (!selection) return false;
    const norm = normalizeSelection(selection);
    return row >= norm.startRow && row <= norm.endRow && col >= norm.startCol && col <= norm.endCol;
  };

  // Get count of selected cells
  const selectionCount = useMemo(() => {
    if (axisSelection) {
      return Math.abs(axisSelection.end - axisSelection.start) + 1;
    }
    if (!selection) return 0;
    const norm = normalizeSelection(selection);
    return (norm.endRow - norm.startRow + 1) * (norm.endCol - norm.startCol + 1);
  }, [selection, axisSelection]);

  // Check if an axis cell is selected
  const isAxisSelected = (axis: 'x' | 'y', index: number): boolean => {
    if (!axisSelection || axisSelection.axis !== axis) return false;
    const start = Math.min(axisSelection.start, axisSelection.end);
    const end = Math.max(axisSelection.start, axisSelection.end);
    return index >= start && index <= end;
  };

  // Selection handlers
  const handleCellMouseDown = (row: number, col: number, e: MouseEvent) => {
    // Clear axis selection when selecting table cells
    setAxisSelection(null);
    setAxisSelectionAnchor(null);

    if (e.shiftKey && selectionAnchor) {
      // Extend selection from anchor
      setSelection({
        startRow: selectionAnchor.row,
        startCol: selectionAnchor.col,
        endRow: row,
        endCol: col,
      });
    } else {
      // Start new selection
      setSelectionAnchor({ row, col });
      setSelection({ startRow: row, startCol: col, endRow: row, endCol: col });
      setIsSelecting(true);
    }
  };

  const handleCellMouseEnter = (row: number, col: number) => {
    if (isSelecting && selectionAnchor) {
      setSelection({
        startRow: selectionAnchor.row,
        startCol: selectionAnchor.col,
        endRow: row,
        endCol: col,
      });
    }
  };

  const handleMouseUp = () => {
    setIsSelecting(false);
    setIsAxisSelecting(false);
  };

  // Axis selection handlers
  const handleAxisMouseDown = (axis: 'x' | 'y', index: number, e: MouseEvent) => {
    // Clear table selection when selecting axis
    setSelection(null);
    setSelectionAnchor(null);

    if (e.shiftKey && axisSelectionAnchor && axisSelectionAnchor.axis === axis) {
      // Extend selection from anchor
      setAxisSelection({ axis, start: axisSelectionAnchor.index, end: index });
    } else {
      // Start new selection
      setAxisSelectionAnchor({ axis, index });
      setAxisSelection({ axis, start: index, end: index });
      setIsAxisSelecting(true);
    }
  };

  const handleAxisMouseEnter = (axis: 'x' | 'y', index: number) => {
    if (isAxisSelecting && axisSelectionAnchor && axisSelectionAnchor.axis === axis) {
      setAxisSelection({ axis, start: axisSelectionAnchor.index, end: index });
    }
  };

  // Copy selection to clipboard
  const copySelection = () => {
    if (!selection || tableData.length === 0) return;
    const norm = normalizeSelection(selection);
    const rows: string[] = [];
    for (let r = norm.startRow; r <= norm.endRow; r++) {
      const cols: string[] = [];
      for (let c = norm.startCol; c <= norm.endCol; c++) {
        cols.push(formatValue(tableData[r][c], 4));
      }
      rows.push(cols.join('\t'));
    }
    navigator.clipboard.writeText(rows.join('\n'));
  };

  // Paste from clipboard
  const pasteSelection = async () => {
    if (!selection) return;
    try {
      const text = await navigator.clipboard.readText();
      const norm = normalizeSelection(selection);
      const rows = text.trim().split('\n').map(r => r.split('\t').map(c => parseFloat(c.trim())));

      const newData = tableData.map(r => [...r]);
      for (let r = 0; r < rows.length && norm.startRow + r < tableData.length; r++) {
        for (let c = 0; c < rows[r].length && norm.startCol + c < tableData[0].length; c++) {
          const value = rows[r][c];
          if (!isNaN(value)) {
            const targetRow = norm.startRow + r;
            const targetCol = norm.startCol + c;
            writeTableCell(binData, parameter, targetRow, targetCol, value, calOffset);
            newData[targetRow][targetCol] = value;
          }
        }
      }
      setTableData(newData);
      onModify();
    } catch (e) {
      console.error('Paste failed:', e);
    }
  };

  // Modify selected cells (table or axis)
  const modifySelection = (operation: 'add' | 'multiply' | 'set', value: number) => {
    if (isNaN(value)) return;

    // Handle axis selection
    if (axisSelection) {
      const axisDef = axisSelection.axis === 'x' ? parameter.xAxis : parameter.yAxis;
      if (!axisDef?.address) return;

      const axisData = axisSelection.axis === 'x' ? xAxisData : yAxisData;
      const setAxisData = axisSelection.axis === 'x' ? setXAxisData : setYAxisData;
      const newAxisData = [...axisData];

      const start = Math.min(axisSelection.start, axisSelection.end);
      const end = Math.max(axisSelection.start, axisSelection.end);

      for (let i = start; i <= end; i++) {
        let newValue: number;
        if (operation === 'add') {
          newValue = axisData[i] + value;
        } else if (operation === 'multiply') {
          newValue = axisData[i] * (value / 100);
        } else {
          newValue = value;
        }
        writeAxisValue(binData, axisDef, i, newValue, calOffset);
        newAxisData[i] = newValue;
      }
      setAxisData(newAxisData);
      onModify();
      setShowModifyInput(null);
      setModifyValue('');
      return;
    }

    // Handle table selection
    if (!selection) return;
    const norm = normalizeSelection(selection);
    const newData = tableData.map(r => [...r]);

    for (let r = norm.startRow; r <= norm.endRow; r++) {
      for (let c = norm.startCol; c <= norm.endCol; c++) {
        let newValue: number;
        if (operation === 'add') {
          newValue = tableData[r][c] + value;
        } else if (operation === 'multiply') {
          // 50 means 50% of current value
          newValue = tableData[r][c] * (value / 100);
        } else {
          // set to exact value
          newValue = value;
        }
        writeTableCell(binData, parameter, r, c, newValue, calOffset);
        newData[r][c] = newValue;
      }
    }
    setTableData(newData);
    onModify();
    setShowModifyInput(null);
    setModifyValue('');
  };

  // Keyboard handler for copy/paste
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selection) {
        e.preventDefault();
        copySelection();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && selection) {
        e.preventDefault();
        pasteSelection();
      }
      if (e.key === 'Escape') {
        setSelection(null);
        setAxisSelection(null);
        setShowModifyInput(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [selection, axisSelection, tableData]);

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

      <div class="flex flex-wrap items-center gap-4 mb-6 p-3 bg-zinc-800 rounded text-xs text-zinc-400">
        <span>Address: 0x{parameter.address.toString(16).toUpperCase()}</span>
        <span>Size: {parameter.rows || 1} x {parameter.cols || 1}</span>
        <span>Z: {parameter.unit || '-'}</span>
        {parameter.xAxis && <span>X: {parameter.xAxis.unit || '-'}</span>}
        {parameter.yAxis && <span>Y: {parameter.yAxis.unit || '-'}</span>}

        {/* Selection info and modify buttons */}
        {(selection || axisSelection) && selectionCount > 0 && (
          <>
            <span class="border-l border-zinc-600 pl-4 text-zinc-300">
              {selectionCount} cell{selectionCount > 1 ? 's' : ''}
            </span>
            <div class="flex items-center gap-1">
              {showModifyInput ? (
                <div class="flex items-center gap-1">
                  <input
                    type="text"
                    value={modifyValue}
                    onInput={e => setModifyValue((e.target as HTMLInputElement).value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        modifySelection(showModifyInput, parseFloat(modifyValue));
                      }
                      if (e.key === 'Escape') {
                        setShowModifyInput(null);
                        setModifyValue('');
                      }
                    }}
                    placeholder={showModifyInput === 'add' ? '+/-' : showModifyInput === 'multiply' ? '100' : 'value'}
                    autoFocus
                    class="w-16 px-1.5 py-0.5 bg-zinc-700 border border-zinc-600 rounded text-zinc-100 text-xs"
                  />
                  <span class="text-zinc-500 text-xs">
                    {showModifyInput === 'multiply' && '%'}
                  </span>
                  <button
                    onClick={() => modifySelection(showModifyInput, parseFloat(modifyValue))}
                    class="px-2 py-0.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-500"
                  >
                    OK
                  </button>
                  <button
                    onClick={() => { setShowModifyInput(null); setModifyValue(''); }}
                    class="px-1.5 py-0.5 bg-zinc-700 text-zinc-400 rounded text-xs hover:bg-zinc-600"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setShowModifyInput('add')}
                    class="px-2 py-0.5 bg-zinc-700 text-zinc-300 rounded text-xs hover:bg-zinc-600"
                    title="Add/subtract value from selection"
                  >
                    +/-
                  </button>
                  <button
                    onClick={() => setShowModifyInput('multiply')}
                    class="px-2 py-0.5 bg-zinc-700 text-zinc-300 rounded text-xs hover:bg-zinc-600"
                    title="Scale selection by percentage (50 = half, 200 = double)"
                  >
                    %
                  </button>
                  <button
                    onClick={() => setShowModifyInput('set')}
                    class="px-2 py-0.5 bg-zinc-700 text-zinc-300 rounded text-xs hover:bg-zinc-600"
                    title="Set selection to value"
                  >
                    =
                  </button>
                </>
              )}
            </div>
          </>
        )}
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
                    const isCellSelected = isAxisSelected('x', i);
                    const displayValue = showOriginal && originalXAxis ? originalXAxis[i] : val;
                    const canEdit = parameter.xAxis?.address;
                    return (
                      <th
                        key={i}
                        class={`p-1.5 border font-medium text-right select-none ${
                          canEdit ? 'cursor-pointer hover:bg-zinc-700' : ''
                        } ${isCellSelected ? 'border-blue-500 border-2 bg-blue-900/50 text-zinc-200' : 'border-zinc-700 bg-zinc-800 text-zinc-400'}`}
                        style={{
                          outline: isChanged && !showOriginal ? '2px solid #f59e0b' : undefined,
                          outlineOffset: '-2px',
                        }}
                        onMouseDown={(e) => canEdit && handleAxisMouseDown('x', i, e)}
                        onMouseEnter={() => canEdit && handleAxisMouseEnter('x', i)}
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
                  const isCellSelected = isAxisSelected('y', rowIdx);
                  const displayValue = showOriginal && originalYAxis ? originalYAxis[rowIdx] : yAxisData[rowIdx];
                  const canEdit = parameter.yAxis?.address;
                  return (
                    <td
                      class={`p-1.5 border font-medium text-right select-none ${
                        canEdit ? 'cursor-pointer hover:bg-zinc-700' : ''
                      } ${isCellSelected ? 'border-blue-500 border-2 bg-blue-900/50 text-zinc-200' : 'border-zinc-700 bg-zinc-800 text-zinc-400'}`}
                      style={{
                        outline: isChanged && !showOriginal ? '2px solid #f59e0b' : undefined,
                        outlineOffset: '-2px',
                      }}
                      onMouseDown={(e) => canEdit && handleAxisMouseDown('y', rowIdx, e)}
                      onMouseEnter={() => canEdit && handleAxisMouseEnter('y', rowIdx)}
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
                  const isCellSelected = isSelected(rowIdx, colIdx);
                  const displayValue = showOriginal && originalTableData
                    ? originalTableData[rowIdx][colIdx]
                    : cell;
                  const colorMin = showOriginal ? origMinVal : minVal;
                  const colorMax = showOriginal ? origMaxVal : maxVal;
                  const bgColor = getCellColor(displayValue, colorMin, colorMax);
                  return (
                    <td
                      key={colIdx}
                      class={`p-1.5 border text-right cursor-pointer text-zinc-900 hover:brightness-110 min-w-16 select-none ${
                        isCellSelected ? 'border-blue-500 border-2' : 'border-zinc-600'
                      }`}
                      style={{
                        backgroundColor: isEditing ? '#3b82f6' : isCellSelected ? `color-mix(in srgb, ${bgColor} 70%, #3b82f6 30%)` : bgColor,
                        outline: isChanged && !showOriginal ? '2px solid #f59e0b' : undefined,
                        outlineOffset: '-2px',
                      }}
                      onMouseDown={(e) => handleCellMouseDown(rowIdx, colIdx, e)}
                      onMouseEnter={() => handleCellMouseEnter(rowIdx, colIdx)}
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
