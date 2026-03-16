import {useAppContext} from '../context/app';
import {formatValue} from '../lib/binUtils';

interface CrossCompareModalProps {
    onClose: () => void;
}

export function CrossCompareModal({onClose}: CrossCompareModalProps) {
    const ctx = useAppContext();
    const diffs = ctx.crossCompareDiffs;
    const ccName = ctx.crossCompareBin?.name ?? 'Compare';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div
                className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-400 dark:border-zinc-600 rounded-lg shadow-xl max-w-[95vw] w-full mx-4 max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center px-4 py-3 border-b border-zinc-300 dark:border-zinc-700">
                    <h2 className="text-lg font-semibold">
                        Cross-Compare ({diffs.length})
                        <span className="ml-2 text-sm font-normal text-zinc-500">{ccName}</span>
                    </h2>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                    >
                        ✕
                    </button>
                </div>
                <div className="flex-1 overflow-auto p-4">
                    {diffs.length === 0 ? (
                        <p className="text-zinc-500 text-center py-8">No differences detected</p>
                    ) : (
                        <div className="space-y-6">
                            {diffs.map(({
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
                                        <div className="flex flex-col">
                                            <span className="font-medium">
                                                {param.customName || param.name}
                                            </span>
                                            {param.description && (
                                                <span className="text-xs text-zinc-500">{param.description}</span>
                                            )}
                                        </div>
                                    </div>
                                    {param.type === 'VALUE' ? (
                                        <div className="flex items-center gap-4 text-sm font-mono">
                                            <span
                                                className="text-teal-400">{formatValue(originalValue as number, 4)}</span>
                                            <span className="text-zinc-500">→</span>
                                            <span
                                                className="text-blue-400">{formatValue(currentValue as number, 4)}</span>
                                            <span className="text-zinc-500">{param.unit}</span>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {(() => {
                                                const xDiff = axisDiffs?.find(d => d.axis === 'x');
                                                const yDiff = axisDiffs?.find(d => d.axis === 'y');
                                                const ccXAxis = xDiff ? xDiff.original : xAxis;
                                                const ccYAxis = yDiff ? yDiff.original : yAxis;
                                                return (
                                                    <div className="flex gap-4 overflow-x-auto">
                                                        {/* Compare table */}
                                                        <div className="flex-1 min-w-0">
                                                            <div
                                                                className="text-xs text-zinc-600 dark:text-zinc-400 mb-1 font-medium">Compare
                                                            </div>
                                                            <div className="overflow-x-auto">
                                                                <table
                                                                    className="border-collapse font-mono text-[10px]">
                                                                    {ccXAxis && ccXAxis.length > 0 && (
                                                                        <thead>
                                                                        <tr>
                                                                            {ccYAxis && ccYAxis.length > 0 && (
                                                                                <th className="px-1.5 py-0.5 border border-zinc-300 dark:border-zinc-700 bg-zinc-200 dark:bg-zinc-800 text-zinc-500"></th>
                                                                            )}
                                                                            {ccXAxis.map((val, i) => {
                                                                                const isChanged = xDiff?.changedIndices.includes(i);
                                                                                return (
                                                                                    <th key={i}
                                                                                        className={`px-1.5 py-0.5 border border-zinc-300 dark:border-zinc-700 bg-zinc-200 dark:bg-zinc-800 text-right font-normal ${isChanged ? 'text-teal-400' : 'text-zinc-500'}`}>
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
                                                                            {ccYAxis && ccYAxis.length > 0 && (
                                                                                <td className={`px-1.5 py-0.5 border border-zinc-300 dark:border-zinc-700 bg-zinc-200 dark:bg-zinc-800 text-right ${yDiff?.changedIndices.includes(rowIdx) ? 'text-teal-400' : 'text-zinc-500'}`}>
                                                                                    {formatValue(ccYAxis[rowIdx], 1)}
                                                                                </td>
                                                                            )}
                                                                            {row.map((cell, colIdx) => {
                                                                                const isChanged = cellDiffs?.some(d => d.row === rowIdx && d.col === colIdx);
                                                                                return (
                                                                                    <td
                                                                                        key={colIdx}
                                                                                        className={`px-1.5 py-0.5 border border-zinc-400 dark:border-zinc-600 text-right ${
                                                                                            isChanged ? 'bg-teal-900/50 text-teal-300' : 'text-zinc-600 dark:text-zinc-400'
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
                                                                                        className={`px-1.5 py-0.5 border border-zinc-300 dark:border-zinc-700 bg-zinc-200 dark:bg-zinc-800 text-right font-normal ${isChanged ? 'text-blue-400' : 'text-zinc-500'}`}>
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
                                                                                <td className={`px-1.5 py-0.5 border border-zinc-300 dark:border-zinc-700 bg-zinc-200 dark:bg-zinc-800 text-right ${yDiff?.changedIndices.includes(rowIdx) ? 'text-blue-400' : 'text-zinc-500'}`}>
                                                                                    {formatValue(yAxis[rowIdx], 1)}
                                                                                </td>
                                                                            )}
                                                                            {row.map((cell, colIdx) => {
                                                                                const isChanged = cellDiffs?.some(d => d.row === rowIdx && d.col === colIdx);
                                                                                return (
                                                                                    <td
                                                                                        key={colIdx}
                                                                                        className={`px-1.5 py-0.5 border border-zinc-400 dark:border-zinc-600 text-right ${
                                                                                            isChanged ? 'bg-blue-900/50 text-blue-300' : 'text-zinc-600 dark:text-zinc-400'
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
                                            <span className="text-xs text-zinc-500">
                                                {cellDiffs?.length || 0} cell{(cellDiffs?.length || 0) !== 1 ? 's' : ''} differ
                                            </span>
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
