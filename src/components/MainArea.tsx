import {useMemo, useCallback} from 'preact/hooks';
import {useAppContext} from '../context/app';
import {ValueEditor} from './ValueEditor';
import type {ParamInfo, ScalarData, TableData, BulkChange} from './ValueEditor';
import type {IDefinitionParameter} from '../types';
import {
    readParameterValue,
    writeParameterValue,
    readTableData,
    writeTableCell,
    readAxisData,
    writeAxisValue,
} from '../lib/binUtils';

/** Convert IDefinitionParameter to display-only ParamInfo */
function toParamInfo(p: IDefinitionParameter): ParamInfo {
    return {
        name: p.name,
        customName: p.customName,
        description: p.description,
        type: p.type,
        dataType: p.dataType,
        unit: p.unit,
        min: p.min,
        max: p.max,
        rows: p.rows,
        cols: p.cols,
        bitLabels: p.bitLabels,
        enumLabels: p.enumLabels,
        xAxis: p.xAxis ? {unit: p.xAxis.unit, labels: p.xAxis.labels, editable: !!p.xAxis.address} : undefined,
        yAxis: p.yAxis ? {unit: p.yAxis.unit, labels: p.yAxis.labels, editable: !!p.yAxis.address} : undefined,
    };
}

function readScalar(
    binData: Uint8Array,
    param: IDefinitionParameter,
    calOffset: number,
    bigEndian: boolean,
    originalBinData: Uint8Array | null | undefined,
    ccData: Uint8Array | null,
    ccParam: IDefinitionParameter | null,
    ccCalOffset: number,
    ccBigEndian: boolean,
): ScalarData {
    return {
        value: readParameterValue(binData, param, calOffset, bigEndian),
        original: originalBinData ? readParameterValue(originalBinData, param, calOffset, bigEndian) : null,
        compare: ccData && ccParam ? readParameterValue(ccData, ccParam, ccCalOffset, ccBigEndian) : null,
    };
}

function readTable(
    binData: Uint8Array,
    param: IDefinitionParameter,
    calOffset: number,
    bigEndian: boolean,
    originalBinData: Uint8Array | null | undefined,
    ccData: Uint8Array | null,
    ccParam: IDefinitionParameter | null,
    ccCalOffset: number,
    ccBigEndian: boolean,
): TableData {
    const cells = readTableData(binData, param, calOffset, bigEndian);
    const xAxis = param.xAxis ? readAxisData(binData, param.xAxis, calOffset, bigEndian) : [];
    const yAxis = param.yAxis ? readAxisData(binData, param.yAxis, calOffset, bigEndian) : [];

    let original: TableData['original'] = null;
    if (originalBinData) {
        original = {
            cells: readTableData(originalBinData, param, calOffset, bigEndian),
            xAxis: param.xAxis ? readAxisData(originalBinData, param.xAxis, calOffset, bigEndian) : null,
            yAxis: param.yAxis ? readAxisData(originalBinData, param.yAxis, calOffset, bigEndian) : null,
        };
    }

    let compare: TableData['compare'] = null;
    if (ccData && ccParam) {
        compare = {
            cells: readTableData(ccData, ccParam, ccCalOffset, ccBigEndian),
            xAxis: ccParam.xAxis ? readAxisData(ccData, ccParam.xAxis, ccCalOffset, ccBigEndian) : null,
            yAxis: ccParam.yAxis ? readAxisData(ccData, ccParam.yAxis, ccCalOffset, ccBigEndian) : null,
        };
    }

    return {cells, xAxis, yAxis, original, compare};
}

export function MainArea() {
    const ctx = useAppContext();

    // Find matching cross-compare param
    const ccInfo = useMemo(() => {
        if (!ctx.crossCompareBin?.definition || !ctx.selectedParam) return null;
        const ccDef = ctx.crossCompareBin.definition;
        const selectedName = ctx.selectedParam.name.toLowerCase();
        const ccParam = ccDef.parameters.find(p => p.name.toLowerCase() === selectedName);
        if (!ccParam) return null;
        if (ctx.selectedParam.type !== 'VALUE') {
            if ((ccParam.rows || 1) !== (ctx.selectedParam.rows || 1) ||
                (ccParam.cols || 1) !== (ctx.selectedParam.cols || 1)) return null;
        }
        return {
            data: ctx.crossCompareBin.data,
            param: ccParam,
            calOffset: ctx.crossCompareBin.calOffset ?? 0,
            bigEndian: ccDef.bigEndian ?? false,
        };
    }, [ctx.crossCompareBin, ctx.selectedParam]);

    const paramInfo = useMemo(
        () => ctx.selectedParam ? toParamInfo(ctx.selectedParam) : null,
        [ctx.selectedParam]
    );

    const scalarData = useMemo(() => {
        if (!ctx.bin || !ctx.selectedParam || ctx.selectedParam.type !== 'VALUE') return undefined;
        return readScalar(
            ctx.bin.data, ctx.selectedParam, ctx.calOffset, ctx.bigEndian,
            ctx.originalBin?.data,
            ccInfo?.data ?? null, ccInfo?.param ?? null, ccInfo?.calOffset ?? 0, ccInfo?.bigEndian ?? false,
        );
    }, [ctx.bin, ctx.selectedParam, ctx.calOffset, ctx.bigEndian, ctx.originalBin, ccInfo]);

    const tableData = useMemo(() => {
        if (!ctx.bin || !ctx.selectedParam || ctx.selectedParam.type === 'VALUE') return undefined;
        return readTable(
            ctx.bin.data, ctx.selectedParam, ctx.calOffset, ctx.bigEndian,
            ctx.originalBin?.data,
            ccInfo?.data ?? null, ccInfo?.param ?? null, ccInfo?.calOffset ?? 0, ccInfo?.bigEndian ?? false,
        );
    }, [ctx.bin, ctx.selectedParam, ctx.calOffset, ctx.bigEndian, ctx.originalBin, ccInfo]);

    const handleScalarChange = useCallback((value: number) => {
        if (!ctx.bin || !ctx.selectedParam) return;
        writeParameterValue(ctx.bin.data, ctx.selectedParam, value, ctx.calOffset, ctx.bigEndian);
        ctx.markModified();
    }, [ctx.bin, ctx.selectedParam, ctx.calOffset, ctx.bigEndian]);

    const handleCellChange = useCallback((row: number, col: number, value: number) => {
        if (!ctx.bin || !ctx.selectedParam) return;
        writeTableCell(ctx.bin.data, ctx.selectedParam, row, col, value, ctx.calOffset, ctx.bigEndian);
        ctx.markModified();
    }, [ctx.bin, ctx.selectedParam, ctx.calOffset, ctx.bigEndian]);

    const handleAxisChange = useCallback((axis: 'x' | 'y', index: number, value: number) => {
        if (!ctx.bin || !ctx.selectedParam) return;
        const axisDef = axis === 'x' ? ctx.selectedParam.xAxis : ctx.selectedParam.yAxis;
        if (!axisDef) return;
        writeAxisValue(ctx.bin.data, axisDef, index, value, ctx.calOffset, ctx.bigEndian);
        ctx.markModified();
    }, [ctx.bin, ctx.selectedParam, ctx.calOffset, ctx.bigEndian]);

    const handleBulkChange = useCallback((changes: BulkChange) => {
        if (!ctx.bin || !ctx.selectedParam) return;
        if (changes.cells) {
            for (const c of changes.cells) {
                writeTableCell(ctx.bin.data, ctx.selectedParam, c.row, c.col, c.value, ctx.calOffset, ctx.bigEndian);
            }
        }
        if (changes.axes) {
            for (const a of changes.axes) {
                const axisDef = a.axis === 'x' ? ctx.selectedParam.xAxis : ctx.selectedParam.yAxis;
                if (axisDef) {
                    writeAxisValue(ctx.bin.data, axisDef, a.index, a.value, ctx.calOffset, ctx.bigEndian);
                }
            }
        }
        ctx.markModified();
    }, [ctx.bin, ctx.selectedParam, ctx.calOffset, ctx.bigEndian]);

    const handleRevert = useCallback(() => {
        if (!ctx.bin || !ctx.selectedParam || !ctx.originalBin) return;
        const param = ctx.selectedParam;
        if (param.type === 'VALUE') {
            const origValue = readParameterValue(ctx.originalBin.data, param, ctx.calOffset, ctx.bigEndian);
            writeParameterValue(ctx.bin.data, param, origValue, ctx.calOffset, ctx.bigEndian);
        } else {
            const origTable = readTableData(ctx.originalBin.data, param, ctx.calOffset, ctx.bigEndian);
            for (let r = 0; r < origTable.length; r++) {
                for (let c = 0; c < origTable[r].length; c++) {
                    writeTableCell(ctx.bin.data, param, r, c, origTable[r][c], ctx.calOffset, ctx.bigEndian);
                }
            }
            if (param.xAxis) {
                const origXAxis = readAxisData(ctx.originalBin.data, param.xAxis, ctx.calOffset, ctx.bigEndian);
                for (let i = 0; i < origXAxis.length; i++) {
                    writeAxisValue(ctx.bin.data, param.xAxis, i, origXAxis[i], ctx.calOffset, ctx.bigEndian);
                }
            }
            if (param.yAxis) {
                const origYAxis = readAxisData(ctx.originalBin.data, param.yAxis, ctx.calOffset, ctx.bigEndian);
                for (let i = 0; i < origYAxis.length; i++) {
                    writeAxisValue(ctx.bin.data, param.yAxis, i, origYAxis[i], ctx.calOffset, ctx.bigEndian);
                }
            }
        }
        ctx.markModified();
    }, [ctx.bin, ctx.originalBin, ctx.selectedParam, ctx.calOffset, ctx.bigEndian]);

    return (
        <main className={`flex-1 overflow-auto px-4 pb-4 relative ${ctx.selectedParam ? 'flex flex-col' : 'hidden sm:flex sm:flex-col'}`}>
            <div
                className="absolute inset-0 pointer-events-none opacity-[0.10]"
                style={{
                    backgroundImage: 'url(/tune-editor/logo.svg)',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
                    backgroundSize: '40%',
                }}
            />
            {!ctx.bin && (
                <label
                    className="flex justify-center items-center h-full text-zinc-500 cursor-pointer hover:bg-zinc-200/30 dark:hover:bg-zinc-700/30 transition-colors">
                    <div className="text-center">
                        <p>Click or drop BIN/S19/HEX file</p>
                        <p className="text-xs mt-1">or use File → Open BIN/S19/HEX</p>
                    </div>
                    <input
                        type="file"
                        accept=".bin,.ori,.mod,.s19,.srec,.mot,.hex,.ihex"
                        onChange={async (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (!file) return;
                            await ctx.loadBin(file);
                            (e.target as HTMLInputElement).value = '';
                        }}
                        className="hidden"
                    />
                </label>
            )}

            {ctx.bin && !ctx.selectedParam && (
                <div className="flex justify-center items-center h-full text-zinc-500">
                    Select a parameter from the tree
                </div>
            )}

            {ctx.bin && ctx.selectedParam && paramInfo && (
                <>
                    {/* Mobile back button */}
                    <button
                        onClick={() => ctx.setSelectedParam(null)}
                        className="sm:hidden flex items-center gap-1 py-2 text-sm text-blue-500 hover:text-blue-400 cursor-pointer shrink-0"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                        </svg>
                        Parameters
                    </button>
                    <ValueEditor
                        param={paramInfo}
                        scalar={scalarData}
                        table={tableData}
                        onScalarChange={handleScalarChange}
                        onCellChange={handleCellChange}
                        onAxisChange={handleAxisChange}
                        onBulkChange={handleBulkChange}
                        onRevert={ctx.originalBin ? handleRevert : undefined}
                    />
                </>
            )}
        </main>
    );
}
