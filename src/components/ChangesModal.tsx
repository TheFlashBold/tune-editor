import {useAppContext} from '../context/app';
import {formatValue, writeParameterValue, writeTableCell, writeAxisValue} from '../lib/binUtils';

interface ChangesModalProps {
    onClose: () => void;
}

export function ChangesModal({onClose}: ChangesModalProps) {
    const ctx = useAppContext();
    const {changes} = ctx;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div
                className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-400 dark:border-zinc-600 rounded-lg shadow-xl max-w-[95vw] w-full mx-4 max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center px-4 py-3 border-b border-zinc-300 dark:border-zinc-700">
                    <h2 className="text-lg font-semibold">Changes ({changes.length})</h2>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                    >
                        ✕
                    </button>
                </div>
                <div className="flex-1 overflow-auto p-4">
                    {changes.length === 0 ? (
                        <p className="text-zinc-500 text-center py-8">No changes detected</p>
                    ) : (
                        <div className="space-y-6">
                            {changes.map(({
                                              param,
                                              originalValue,
                                              currentValue,
                                              cellDiffs,
                                              axisDiffs,
                                              xAxis,
                                              yAxis
                                          }) => (
                                <div
                                    key={param.name}
                                    className="p-3 bg-zinc-200 dark:bg-zinc-700 rounded"
                                >
                                    <div
                                        className="flex items-center gap-2 mb-3 cursor-pointer hover:text-blue-400"
                                        onClick={() => {
                                            ctx.setSelectedParam(param);
                                            onClose();
                                        }}
                                    >
                                        <span
                                            className="inline-flex justify-center items-center w-5 h-5 text-xs font-semibold rounded bg-zinc-300 dark:bg-zinc-600 text-zinc-700 dark:text-zinc-300">
                                            {param.type[0]}
                                        </span>
                                        <span className="font-medium">
                                            {param.customName || param.description || param.name}
                                        </span>
                                        <span className="text-xs text-zinc-500">→ click to edit</span>
                                    </div>
                                    {param.type === 'VALUE' ? (
                                        <div className="flex items-center gap-4 text-sm font-mono">
                                            <span
                                                className="text-red-400">{formatValue(originalValue as number, 4)}</span>
                                            <span className="text-zinc-500">→</span>
                                            <span
                                                className="text-green-400">{formatValue(currentValue as number, 4)}</span>
                                            <span className="text-zinc-500">{param.unit}</span>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (!ctx.bin) return;
                                                    writeParameterValue(ctx.bin.data, param, originalValue as number, ctx.calOffset, ctx.baseAddress, ctx.bigEndian);
                                                    ctx.markModified();
                                                }}
                                                className="ml-auto px-3 py-1 text-xs font-medium rounded bg-red-600/80 text-white hover:bg-red-500 cursor-pointer"
                                            >
                                                Revert to original
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {(() => {
                                                const xDiff = axisDiffs?.find(d => d.axis === 'x');
                                                const yDiff = axisDiffs?.find(d => d.axis === 'y');
                                                const origXAxis = xDiff ? xDiff.original : xAxis;
                                                const origYAxis = yDiff ? yDiff.original : yAxis;
                                                return (
                                                    <div className="flex gap-4 overflow-x-auto">
                                                        {/* Original table */}
                                                        <div className="flex-1 min-w-0">
                                                            <div
                                                                className="text-xs text-zinc-600 dark:text-zinc-400 mb-1 font-medium">Original
                                                            </div>
                                                            <div className="overflow-x-auto">
                                                                <table
                                                                    className="border-collapse font-mono text-[10px]">
                                                                    {origXAxis && origXAxis.length > 0 && (
                                                                        <thead>
                                                                        <tr>
                                                                            {origYAxis && origYAxis.length > 0 && (
                                                                                <th className="px-1.5 py-0.5 border border-zinc-300 dark:border-zinc-700 bg-zinc-200 dark:bg-zinc-800 text-zinc-500"></th>
                                                                            )}
                                                                            {origXAxis.map((val, i) => {
                                                                                const isChanged = xDiff?.changedIndices.includes(i);
                                                                                return (
                                                                                    <th key={i}
                                                                                        className={`px-1.5 py-0.5 border border-zinc-300 dark:border-zinc-700 bg-zinc-200 dark:bg-zinc-800 text-right font-normal ${isChanged ? 'text-red-400' : 'text-zinc-500'}`}>
                                                                                        {formatValue(val, 1)}
                                                                                    </th>
                                                                                );
                                                                            })}
                                                                        </tr>
                                                                        </thead>
                                                                    )}
                                                                    <tbody>
                                                                    {(originalValue as number[][]).map((row, rowIdx) => (
                                                                        <tr key={rowIdx}>
                                                                            {origYAxis && origYAxis.length > 0 && (
                                                                                <td className={`px-1.5 py-0.5 border border-zinc-300 dark:border-zinc-700 bg-zinc-200 dark:bg-zinc-800 text-right ${yDiff?.changedIndices.includes(rowIdx) ? 'text-red-400' : 'text-zinc-500'}`}>
                                                                                    {formatValue(origYAxis[rowIdx], 1)}
                                                                                </td>
                                                                            )}
                                                                            {row.map((cell, colIdx) => {
                                                                                const isChanged = cellDiffs?.some(d => d.row === rowIdx && d.col === colIdx);
                                                                                return (
                                                                                    <td
                                                                                        key={colIdx}
                                                                                        className={`px-1.5 py-0.5 border border-zinc-400 dark:border-zinc-600 text-right ${
                                                                                            isChanged ? 'bg-red-900/50 text-red-300' : 'text-zinc-600 dark:text-zinc-400'
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
                                                        <div className="flex-1 min-w-0">
                                                            <div
                                                                className="text-xs text-zinc-600 dark:text-zinc-400 mb-1 font-medium">Current
                                                            </div>
                                                            <div className="overflow-x-auto">
                                                                <table
                                                                    className="border-collapse font-mono text-[10px]">
                                                                    {xAxis && xAxis.length > 0 && (
                                                                        <thead>
                                                                        <tr>
                                                                            {yAxis && yAxis.length > 0 && (
                                                                                <th className="px-1.5 py-0.5 border border-zinc-300 dark:border-zinc-700 bg-zinc-200 dark:bg-zinc-800 text-zinc-500"></th>
                                                                            )}
                                                                            {xAxis.map((val, i) => {
                                                                                const isChanged = xDiff?.changedIndices.includes(i);
                                                                                return (
                                                                                    <th key={i}
                                                                                        className={`px-1.5 py-0.5 border border-zinc-300 dark:border-zinc-700 bg-zinc-200 dark:bg-zinc-800 text-right font-normal ${isChanged ? 'text-green-400' : 'text-zinc-500'}`}>
                                                                                        {formatValue(val, 1)}
                                                                                    </th>
                                                                                );
                                                                            })}
                                                                        </tr>
                                                                        </thead>
                                                                    )}
                                                                    <tbody>
                                                                    {(currentValue as number[][]).map((row, rowIdx) => (
                                                                        <tr key={rowIdx}>
                                                                            {yAxis && yAxis.length > 0 && (
                                                                                <td className={`px-1.5 py-0.5 border border-zinc-300 dark:border-zinc-700 bg-zinc-200 dark:bg-zinc-800 text-right ${yDiff?.changedIndices.includes(rowIdx) ? 'text-green-400' : 'text-zinc-500'}`}>
                                                                                    {formatValue(yAxis[rowIdx], 1)}
                                                                                </td>
                                                                            )}
                                                                            {row.map((cell, colIdx) => {
                                                                                const isChanged = cellDiffs?.some(d => d.row === rowIdx && d.col === colIdx);
                                                                                return (
                                                                                    <td
                                                                                        key={colIdx}
                                                                                        className={`px-1.5 py-0.5 border border-zinc-400 dark:border-zinc-600 text-right ${
                                                                                            isChanged ? 'bg-green-900/50 text-green-300' : 'text-zinc-600 dark:text-zinc-400'
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
                                                );
                                            })()}
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className="text-xs text-zinc-500">
                                                    {cellDiffs?.length || 0} cell{(cellDiffs?.length || 0) !== 1 ? 's' : ''} changed
                                                </span>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (!ctx.bin) return;
                                                        const origTable = originalValue as number[][];
                                                        for (let r = 0; r < origTable.length; r++) {
                                                            for (let c = 0; c < origTable[r].length; c++) {
                                                                writeTableCell(ctx.bin.data, param, r, c, origTable[r][c], ctx.calOffset, ctx.baseAddress, ctx.bigEndian);
                                                            }
                                                        }
                                                        const xDiff = axisDiffs?.find(d => d.axis === 'x');
                                                        const yDiff = axisDiffs?.find(d => d.axis === 'y');
                                                        if (xDiff && param.xAxis) {
                                                            for (let i = 0; i < xDiff.original.length; i++) {
                                                                writeAxisValue(ctx.bin.data, param.xAxis, i, xDiff.original[i], ctx.calOffset, ctx.baseAddress, ctx.bigEndian);
                                                            }
                                                        }
                                                        if (yDiff && param.yAxis) {
                                                            for (let i = 0; i < yDiff.original.length; i++) {
                                                                writeAxisValue(ctx.bin.data, param.yAxis, i, yDiff.original[i], ctx.calOffset, ctx.baseAddress, ctx.bigEndian);
                                                            }
                                                        }
                                                        ctx.markModified();
                                                    }}
                                                    className="px-3 py-1 text-xs font-medium rounded bg-red-600/80 text-white hover:bg-red-500 cursor-pointer"
                                                >
                                                    Revert to original
                                                </button>
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
    );
}
