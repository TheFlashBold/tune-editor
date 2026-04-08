import {useState, useEffect, useMemo, useRef, useCallback} from 'preact/hooks';
import {track} from '../lib/track';
import {
    formatValue,
    getConsistentDecimals,
    formatValueConsistent,
} from '../lib/binUtils';

/** Display-only parameter metadata (no address/binary info) */
export interface ParamInfo {
    name: string;
    customName?: string;
    description: string;
    type: 'VALUE' | 'CURVE' | 'MAP';
    dataType: string;
    unit: string;
    min: number;
    max: number;
    rows?: number;
    cols?: number;
    bitLabels?: Record<string, string>;
    enumLabels?: Record<string, string>;
    xAxis?: { unit: string; labels?: string[]; editable: boolean };
    yAxis?: { unit: string; labels?: string[]; editable: boolean };
}

export interface ScalarData {
    value: number;
    original?: number | null;
    compare?: number | null;
}

export interface TableData {
    cells: number[][];
    xAxis: number[];
    yAxis: number[];
    original?: { cells: number[][]; xAxis?: number[] | null; yAxis?: number[] | null } | null;
    compare?: { cells: number[][]; xAxis?: number[] | null; yAxis?: number[] | null } | null;
}

export type CellChange = { row: number; col: number; value: number };
export type AxisChange = { axis: 'x' | 'y'; index: number; value: number };
export type BulkChange = {
    cells?: CellChange[];
    axes?: AxisChange[];
};

interface IValueEditorProps {
    param: ParamInfo;
    scalar?: ScalarData;
    table?: TableData;
    onScalarChange?: (value: number) => void;
    onCellChange?: (row: number, col: number, value: number) => void;
    onAxisChange?: (axis: 'x' | 'y', index: number, value: number) => void;
    onBulkChange?: (changes: BulkChange) => void;
    onRevert?: () => void;
}

export function ValueEditor(props: IValueEditorProps) {
    const {param} = props;
    const tracked = useRef(false);

    useEffect(() => {
        tracked.current = false;
    }, [param.name]);

    const trackEdit = useCallback(() => {
        if (!tracked.current) {
            tracked.current = true;
            const type = param.type === 'VALUE' ? 'Scalar' : param.type === 'CURVE' ? '1D' : '2D';
            track('Edit Parameter', {type, name: param.name});
        }
    }, [param.type, param.name]);

    if (param.type === 'VALUE' && props.scalar) {
        return <ScalarEditor {...props} scalar={props.scalar} trackEdit={trackEdit}/>;
    }
    if (props.table) {
        return <TableEditor {...props} table={props.table} trackEdit={trackEdit}/>;
    }
    return null;
}

// ─── Scalar Editor ───────────────────────────────────────────────────────────

interface ScalarEditorInternalProps extends IValueEditorProps {
    scalar: ScalarData;
    trackEdit: () => void;
}

function ScalarEditor({
                          param,
                          scalar,
                          onScalarChange,
                          onRevert,
                          trackEdit,
                      }: ScalarEditorInternalProps) {
    const [value, setValue] = useState(scalar.value);
    const [editing, setEditing] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [showOriginalVal, setShowOriginalVal] = useState(false);
    const [showCompareVal, setShowCompareVal] = useState(false);

    const originalValue = scalar.original ?? null;
    const compareValue = scalar.compare ?? null;

    const hasChanged = originalValue !== null && Math.abs(originalValue - value) > 0.0001;
    const hasCompareDiff = compareValue !== null && Math.abs(compareValue - value) > 0.0001;
    const showOriginal = showOriginalVal;
    const showCompare = showCompareVal;
    const isBitmask = !!param.bitLabels || (param.dataType === 'UBYTE' && (/bitmask/i.test(param.name) || /bitmask/i.test(param.description)));
    const isEnum = !!param.enumLabels;
    const isToggle = !isEnum && param.dataType === 'UBYTE' && param.min === 0 && param.max === 1 && !isBitmask
        && /\b(enable|disable|activation switch)\b/i.test(param.description || param.customName || param.name);

    useEffect(() => {
        setValue(scalar.value);
    }, [scalar.value]);

    const emitChange = useCallback((newValue: number) => {
        setValue(newValue);
        onScalarChange?.(newValue);
        trackEdit();
    }, [onScalarChange, trackEdit]);

    const handleDoubleClick = () => {
        setInputValue(formatValue(value, 4));
        setEditing(true);
    };

    const handleConfirm = () => {
        const newValue = parseFloat(inputValue);
        if (!isNaN(newValue)) {
            emitChange(newValue);
        }
        setEditing(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter') handleConfirm();
        if (e.key === 'Escape') setEditing(false);
    };

    const handleBitToggle = (bit: number) => {
        const rawValue = Math.round(value);
        const newValue = rawValue ^ (1 << bit);
        emitChange(newValue);
    };

    return (
        <div>
            <div class="sticky top-0 z-10 bg-white dark:bg-zinc-900 pt-4 pb-2">
                <div class="flex items-start justify-between mb-4">
                    <div>
                        <h2 class="text-lg font-semibold">
                            {param.customName || param.description || param.name}
                        </h2>
                        <code class="text-xs text-zinc-500">{param.name}</code>
                    </div>
                    {(originalValue !== null || compareValue !== null) && (
                        <div class="flex gap-x-2">
                            {hasChanged && onRevert && (
                                <button
                                    onClick={() => {
                                        onRevert();
                                        setValue(originalValue!);
                                        track('Revert Parameter', {type: 'Scalar', name: param.name});
                                    }}
                                    class="px-3 py-1.5 text-sm rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600"
                                >
                                    Revert
                                </button>
                            )}
                            {originalValue !== null && (
                                <button
                                    onClick={() => setShowOriginalVal(!showOriginalVal)}
                                    class={`px-3 py-1.5 text-sm rounded ${
                                        showOriginal ? 'bg-blue-600 text-white' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600'
                                    } ${hasChanged ? 'ring-2 ring-amber-500' : ''}`}
                                >
                                    Original
                                </button>
                            )}
                            {compareValue !== null && (
                                <button
                                    onClick={() => setShowCompareVal(!showCompareVal)}
                                    class={`px-3 py-1.5 text-sm rounded ${
                                        showCompare ? 'bg-teal-600 text-white' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600'
                                    } ${hasCompareDiff ? 'ring-2 ring-teal-500' : ''}`}
                                >
                                    Compare
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div
                    class="flex gap-4 p-3 bg-zinc-200 dark:bg-zinc-800 rounded text-xs text-zinc-600 dark:text-zinc-400">
                    <span>Type: {param.dataType}</span>
                    <span>Unit: {param.unit || '-'}</span>
                    <span>Range: {param.min} - {param.max}</span>
                </div>
            </div>

            {isEnum ? (() => {
                const enumLabels = param.enumLabels!;
                const entries = Object.entries(enumLabels).sort((a, b) => Number(a[0]) - Number(b[0]));
                const origLabel = originalValue !== null ? enumLabels[String(Math.round(originalValue))] : null;
                return (
                    <div class="space-y-3">
                        <div class="flex flex-wrap gap-2">
                            {entries.map(([val, label]) => {
                                const numVal = Number(val);
                                const isActive = Math.round(value) === numVal;
                                const wasOriginal = originalValue !== null && Math.round(originalValue) === numVal;
                                return (
                                    <button
                                        key={val}
                                        onClick={() => emitChange(numVal)}
                                        class={`px-3 py-2 text-sm rounded transition-colors cursor-pointer ${
                                            isActive
                                                ? hasChanged ? 'bg-green-700 text-white ring-2 ring-green-500' : 'bg-blue-600 text-white'
                                                : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-300 dark:hover:bg-zinc-700'
                                        } ${wasOriginal && hasChanged ? 'ring-2 ring-amber-500' : ''}`}
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                        {originalValue !== null && hasChanged && (
                            <span class="text-xs text-zinc-500">was: {origLabel ?? '?'}</span>
                        )}
                    </div>
                );
            })() : isToggle ? (
                <div class="flex items-center gap-4">
                    <button
                        onClick={() => emitChange(value === 0 ? 1 : 0)}
                        class={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors cursor-pointer ${
                            value === 1 ? 'bg-green-600' : 'bg-zinc-600'
                        } ${hasChanged ? 'ring-2 ring-amber-500' : ''}`}
                    >
                        <span
                            class={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${
                                value === 1 ? 'translate-x-6' : 'translate-x-1'
                            }`}
                        />
                    </button>
                    <span class={`text-lg font-semibold font-mono ${hasChanged ? 'text-green-400' : ''}`}>
                        {value === 1 ? 'Enabled' : 'Disabled'}
                    </span>
                    {originalValue !== null && hasChanged && (
                        <span class="text-xs text-zinc-500">
                            was {originalValue === 1 ? 'Enabled' : 'Disabled'}
                        </span>
                    )}
                    {compareValue !== null && (
                        <span class="text-sm text-teal-400">
                            Compare: {compareValue === 1 ? 'Enabled' : 'Disabled'}
                        </span>
                    )}
                </div>
            ) : (
                <div class="flex items-center gap-4">
                    <div
                        class="inline-flex items-baseline gap-2 px-6 py-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg cursor-pointer"
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
                                class="w-48 px-2 py-1 text-2xl font-mono bg-zinc-200 dark:bg-zinc-700 border-2 border-blue-500 rounded text-zinc-900 dark:text-zinc-100 outline-none"
                            />
                        ) : (
                            <span class={`text-3xl font-semibold font-mono ${hasChanged ? 'text-green-400' : ''}`}>
                                {formatValue(value, 4)}
                            </span>
                        )}
                        <span class="text-base text-zinc-500">{param.unit}</span>
                    </div>

                    {originalValue !== null && (
                        <div
                            class="inline-flex items-baseline gap-2 px-6 py-4 bg-zinc-200 dark:bg-zinc-700 rounded-lg border-2 border-dashed border-zinc-400 dark:border-zinc-600">
                            <span class="text-3xl font-semibold font-mono text-zinc-600 dark:text-zinc-400">
                                {formatValue(originalValue, 4)}
                            </span>
                            <span class="text-base text-zinc-500">{param.unit}</span>
                        </div>
                    )}
                    {compareValue !== null && (
                        <div
                            class="inline-flex items-baseline gap-2 px-6 py-4 bg-zinc-200 dark:bg-zinc-700 rounded-lg border-2 border-dashed border-teal-600">
                            <span
                                class={`text-3xl font-semibold font-mono ${hasCompareDiff ? 'text-teal-400' : 'text-zinc-600 dark:text-zinc-400'}`}>
                                {formatValue(compareValue, 4)}
                            </span>
                            <span class="text-base text-zinc-500">{param.unit}</span>
                        </div>
                    )}
                </div>
            )}

            {isBitmask && (() => {
                const bitCount = ({
                    'UWORD': 16,
                    'SWORD': 16,
                    'ULONG': 32,
                    'SLONG': 32
                } as Record<string, number>)[param.dataType] || 8;
                const hexPad = bitCount / 4;
                const rawValue = Math.round(value);
                const origRaw = originalValue !== null ? Math.round(originalValue) : null;
                const labels = param.bitLabels;
                const bits = labels
                    ? Object.keys(labels).map(Number).sort((a, b) => a - b)
                    : Array.from({length: bitCount}, (_, i) => i);
                return (
                    <div class="mt-4 space-y-2">
                        <div class={`inline-flex gap-1 ${labels ? 'flex-wrap' : ''}`}>
                            {bits.map(i => {
                                const isSet = (rawValue & (1 << i)) !== 0;
                                const origBit = origRaw !== null ? (origRaw & (1 << i)) !== 0 : null;
                                const bitChanged = origBit !== null && origBit !== isSet;
                                return (
                                    <label
                                        key={i}
                                        class={`flex flex-col items-center gap-1 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                                            isSet ? 'bg-green-900/50' : 'bg-zinc-100 dark:bg-zinc-800'
                                        } ${bitChanged ? 'ring-1 ring-amber-500' : ''}`}
                                    >
                                        <span
                                            class="text-xs font-mono text-zinc-500">{labels ? labels[String(i)] : i}</span>
                                        <input
                                            type="checkbox"
                                            checked={isSet}
                                            onChange={() => handleBitToggle(i)}
                                            class="w-4 h-4 rounded cursor-pointer"
                                        />
                                    </label>
                                );
                            })}
                        </div>
                        <div class="text-xs text-zinc-500 font-mono">
                            0x{rawValue.toString(16).toUpperCase().padStart(hexPad, '0')} = {rawValue.toString(2).padStart(bitCount, '0')}b
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}

// ─── Graph helpers ───────────────────────────────────────────────────────────

function linearNormalize(value: number, min: number, max: number): number {
    return (value - min) / (max - min);
}

function getCellColor(value: number, min: number, max: number): string {
    if (value == null || isNaN(value) || min === max) {
        return 'hsl(60, 50%, 75%)';
    }
    const t = linearNormalize(value, min, max);
    const hue = (1 - t) * 120;
    return `hsl(${hue}, 65%, 70%)`;
}

interface CurveGraphProps {
    xData: number[];
    yData: number[];
    originalYData?: number[] | null;
    originalXData?: number[] | null;
    compareYData?: number[] | null;
    compareXData?: number[] | null;
    xUnit: string;
    yUnit: string;
}

function CurveGraph({
                        xData,
                        yData,
                        originalYData,
                        originalXData,
                        compareYData,
                        compareXData,
                        xUnit,
                        yUnit
                    }: CurveGraphProps) {
    const [showOriginal, setShowOriginal] = useState(true);
    const [showCompare, setShowCompare] = useState(true);
    const width = 1200;
    const height = 500;
    const padding = {top: 20, right: 30, bottom: 50, left: 60};
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    if (xData.length === 0 || yData.length === 0) return null;

    const origXData = originalXData && originalXData.length > 0 ? originalXData : xData;
    const cmpXData = compareXData && compareXData.length > 0 ? compareXData : xData;

    const allXValues = [
        ...xData,
        ...(showOriginal && originalYData ? origXData : []),
        ...(showCompare && compareYData ? cmpXData : []),
    ];
    const xMin = Math.min(...allXValues);
    const xMax = Math.max(...allXValues);
    const allYValues = [
        ...yData,
        ...(showOriginal && originalYData ? originalYData : []),
        ...(showCompare && compareYData ? compareYData : []),
    ];
    const yMin = Math.min(...allYValues);
    const yMax = Math.max(...allYValues);
    const yRange = yMax - yMin || 1;
    const yPadding = yRange * 0.1;
    const yMinPadded = yMin - yPadding;
    const yMaxPadded = yMax + yPadding;

    const xDecimals = getConsistentDecimals(allXValues, 2);
    const yDecimals = getConsistentDecimals(allYValues, 2);

    const scaleX = (val: number) => padding.left + ((val - xMin) / (xMax - xMin || 1)) * plotWidth;
    const scaleY = (val: number) => padding.top + plotHeight - ((val - yMinPadded) / (yMaxPadded - yMinPadded)) * plotHeight;

    const generatePath = (values: number[], xVals: number[]) => {
        return values.map((y, i) => {
            const x = xVals[i] ?? i;
            const px = scaleX(x);
            const py = scaleY(y);
            return `${i === 0 ? 'M' : 'L'} ${px} ${py}`;
        }).join(' ');
    };

    const xTicks = 5;
    const yTicks = 5;
    const xStep = (xMax - xMin) / xTicks;
    const yStep = (yMaxPadded - yMinPadded) / yTicks;

    return (
        <div class="mt-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-4">
            <svg viewBox={`0 0 ${width} ${height}`} class="w-full font-mono text-xs"
                 preserveAspectRatio="xMidYMid meet">
                {/* Grid */}
                <g class="text-zinc-600">
                    {Array.from({length: yTicks + 1}).map((_, i) => {
                        const y = scaleY(yMinPadded + i * yStep);
                        return (
                            <line key={`yg${i}`} x1={padding.left} x2={width - padding.right} y1={y} y2={y}
                                  stroke="currentColor" stroke-opacity="0.3"/>
                        );
                    })}
                    {Array.from({length: xTicks + 1}).map((_, i) => {
                        const x = scaleX(xMin + i * xStep);
                        return (
                            <line key={`xg${i}`} x1={x} x2={x} y1={padding.top} y2={height - padding.bottom}
                                  stroke="currentColor" stroke-opacity="0.3"/>
                        );
                    })}
                </g>

                {/* Axes */}
                <line x1={padding.left} x2={width - padding.right} y1={height - padding.bottom}
                      y2={height - padding.bottom} stroke="#71717a" stroke-width="1"/>
                <line x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} stroke="#71717a"
                      stroke-width="1"/>

                {/* X axis labels */}
                {Array.from({length: xTicks + 1}).map((_, i) => {
                    const val = xMin + i * xStep;
                    const x = scaleX(val);
                    return (
                        <text key={`xl${i}`} x={x} y={height - padding.bottom + 20} fill="#a1a1aa" text-anchor="middle">
                            {formatValueConsistent(val, xDecimals)}
                        </text>
                    );
                })}
                <text x={padding.left + plotWidth / 2} y={height - 8} fill="#71717a" text-anchor="middle">
                    {xUnit}
                </text>

                {/* Y axis labels */}
                {Array.from({length: yTicks + 1}).map((_, i) => {
                    const val = yMinPadded + i * yStep;
                    const y = scaleY(val);
                    return (
                        <text key={`yl${i}`} x={padding.left - 10} y={y + 4} fill="#a1a1aa" text-anchor="end">
                            {formatValueConsistent(val, yDecimals)}
                        </text>
                    );
                })}
                <text x={15} y={padding.top + plotHeight / 2} fill="#71717a" text-anchor="middle"
                      transform={`rotate(-90, 15, ${padding.top + plotHeight / 2})`}>
                    {yUnit}
                </text>

                {/* Original curve */}
                {showOriginal && originalYData && (
                    <>
                        <path d={generatePath(originalYData, origXData)} fill="none" stroke="#71717a" stroke-width="2"
                              stroke-dasharray="5,5"/>
                        {originalYData.map((y, i) => {
                            const x = origXData[i] ?? i;
                            return <circle key={`oc${i}`} cx={scaleX(x)} cy={scaleY(y)} r="3" fill="#71717a"/>;
                        })}
                    </>
                )}

                {/* Compare curve */}
                {showCompare && compareYData && (() => {
                    return (
                        <>
                            <path d={generatePath(compareYData, cmpXData)} fill="none" stroke="#14b8a6" stroke-width="2"
                                  stroke-dasharray="5,5"/>
                            {compareYData.map((y, i) => {
                                const x = cmpXData[i] ?? i;
                                return <circle key={`cc${i}`} cx={scaleX(x)} cy={scaleY(y)} r="3" fill="#14b8a6"/>;
                            })}
                        </>
                    );
                })()}

                {/* Current curve */}
                <path d={generatePath(yData, xData)} fill="none" stroke="#3b82f6" stroke-width="2"/>
                {yData.map((y, i) => {
                    const x = xData[i] ?? i;
                    return <circle key={`c${i}`} cx={scaleX(x)} cy={scaleY(y)} r="4" fill="#3b82f6"/>;
                })}
            </svg>

            {(originalYData || compareYData) && (
                <div class="flex gap-4 mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                    <span class="flex items-center gap-1">
                        <span class="w-4 h-0.5 bg-blue-500 inline-block"></span> Aktuell
                    </span>
                    {originalYData && (
                        <label class="flex items-center gap-1 cursor-pointer select-none">
                            <input type="checkbox" checked={showOriginal}
                                   onChange={() => setShowOriginal(!showOriginal)} class="cursor-pointer"/>
                            <span class="w-4 h-0.5 inline-block"
                                  style="background: repeating-linear-gradient(90deg, #71717a 0, #71717a 4px, transparent 4px, transparent 8px)"></span> Original
                        </label>
                    )}
                    {compareYData && (
                        <label class="flex items-center gap-1 cursor-pointer select-none">
                            <input type="checkbox" checked={showCompare} onChange={() => setShowCompare(!showCompare)}
                                   class="cursor-pointer"/>
                            <span class="w-4 h-0.5 inline-block"
                                  style="background: repeating-linear-gradient(90deg, #14b8a6 0, #14b8a6 4px, transparent 4px, transparent 8px)"></span> Compare
                        </label>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Surface Graph (WebGL) ───────────────────────────────────────────────────

interface SurfaceGraphProps {
    xData: number[];
    yData: number[];
    zData: number[][];
    originalZData?: number[][] | null;
    originalXData?: number[] | null;
    originalYData?: number[] | null;
    compareZData?: number[][] | null;
    compareXData?: number[] | null;
    compareYData?: number[] | null;
    xUnit: string;
    yUnit: string;
    zUnit: string;
}

const VERT_SRC = `
attribute vec3 a_pos;
attribute vec4 a_color;
varying vec4 v_color;
void main() {
    gl_Position = vec4(a_pos.xy, a_pos.z, 1.0);
    v_color = a_color;
}`;

const FRAG_SRC = `
precision mediump float;
varying vec4 v_color;
void main() {
    gl_FragColor = v_color;
}`;

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
    const p = gl.createProgram()!;
    gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, VERT_SRC));
    gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC));
    gl.linkProgram(p);
    return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    s /= 100;
    l /= 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return [f(0), f(8), f(4)];
}

function SurfaceGraph({
                          xData,
                          yData,
                          zData,
                          originalZData,
                          originalXData,
                          originalYData,
                          compareZData,
                          compareXData,
                          compareYData,
                          xUnit,
                          yUnit,
                          zUnit
                      }: SurfaceGraphProps) {
    const [showOriginal, setShowOriginal] = useState(true);
    const [showCompare, setShowCompare] = useState(true);
    const [rotation, setRotation] = useState(45);
    const [tilt, setTilt] = useState(-20);
    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useRef<{ x: number; y: number; rotation: number; tilt: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const glRef = useRef<WebGL2RenderingContext | null>(null);
    const programRef = useRef<WebGLProgram | null>(null);
    const bufRef = useRef<WebGLBuffer | null>(null);

    const handleMouseDown = (e: MouseEvent) => {
        setIsDragging(true);
        dragStart.current = {x: e.clientX, y: e.clientY, rotation, tilt};
        e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging || !dragStart.current) return;
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        setRotation((dragStart.current.rotation + dx * 0.5) % 360);
        setTilt(Math.max(-60, Math.min(60, dragStart.current.tilt + dy * 0.3)));
    };

    const handleMouseUp = () => {
        setIsDragging(false);
        dragStart.current = null;
    };

    const handleTouchStart = (e: TouchEvent) => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        setIsDragging(true);
        dragStart.current = {x: t.clientX, y: t.clientY, rotation, tilt};
        e.preventDefault();
    };

    const handleTouchMove = (e: TouchEvent) => {
        if (!isDragging || !dragStart.current || e.touches.length !== 1) return;
        const t = e.touches[0];
        const dx = t.clientX - dragStart.current.x;
        const dy = t.clientY - dragStart.current.y;
        setRotation((dragStart.current.rotation + dx * 0.5) % 360);
        setTilt(Math.max(-60, Math.min(60, dragStart.current.tilt + dy * 0.3)));
        e.preventDefault();
    };

    const handleTouchEnd = () => {
        setIsDragging(false);
        dragStart.current = null;
    };

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            window.addEventListener('touchmove', handleTouchMove, {passive: false});
            window.addEventListener('touchend', handleTouchEnd);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
                window.removeEventListener('touchmove', handleTouchMove);
                window.removeEventListener('touchend', handleTouchEnd);
            };
        }
    }, [isDragging]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const gl = canvas.getContext('webgl2', {antialias: true, alpha: true});
        if (!gl) return;
        glRef.current = gl;
        programRef.current = createProgram(gl);
        bufRef.current = gl.createBuffer();
        return () => {
            if (bufRef.current) gl.deleteBuffer(bufRef.current);
            if (programRef.current) gl.deleteProgram(programRef.current);
        };
    }, []);

    useEffect(() => {
        const gl = glRef.current;
        const program = programRef.current;
        const buf = bufRef.current;
        const canvas = canvasRef.current;
        if (!gl || !program || !buf || !canvas) return;
        if (zData.length === 0 || zData[0].length === 0) return;

        const origXD = originalXData && originalXData.length > 0 ? originalXData : xData;
        const origYD = originalYData && originalYData.length > 0 ? originalYData : yData;
        const cmpXD = compareXData && compareXData.length > 0 ? compareXData : xData;
        const cmpYD = compareYData && compareYData.length > 0 ? compareYData : yData;

        type Overlay = { z: number[][]; xAx: number[]; yAx: number[]; isCompare: boolean };
        const overlays: Overlay[] = [];
        if (showOriginal && originalZData) overlays.push({
            z: originalZData,
            xAx: origXD,
            yAx: origYD,
            isCompare: false
        });
        if (showCompare && compareZData) overlays.push({z: compareZData, xAx: cmpXD, yAx: cmpYD, isCompare: true});

        const allXVals = [...xData, ...overlays.flatMap(o => o.xAx)];
        const allYVals = [...yData, ...overlays.flatMap(o => o.yAx)];
        const axXMin = Math.min(...allXVals);
        const axXMax = Math.max(...allXVals);
        const axYMin = Math.min(...allYVals);
        const axYMax = Math.max(...allYVals);

        const allZ = [...zData.flat(), ...overlays.flatMap(o => o.z.flat())];
        const zMin = Math.min(...allZ);
        const zMax = Math.max(...allZ);

        const norm = (v: number, mn: number, mx: number) => (mx - mn) ? (v - mn) / (mx - mn) : 0.5;

        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        const cw = Math.round(rect.width * dpr);
        const ch = Math.round(rect.height * dpr);
        if (canvas.width !== cw || canvas.height !== ch) {
            canvas.width = cw;
            canvas.height = ch;
        }
        gl.viewport(0, 0, cw, ch);

        const w = rect.width;
        const h = rect.height;

        const scale = Math.min(w, h) * 0.4;
        const cx = w / 2;
        const cy = h / 2 + h * 0.12;
        const radRot = (rotation * Math.PI) / 180;
        const radTilt = (tilt * Math.PI) / 180;
        const cosR = Math.cos(radRot), sinR = Math.sin(radRot);
        const cosT = Math.cos(radTilt), sinT = Math.sin(radTilt);

        const proj = (x: number, y: number, z: number) => {
            const rx = x * cosR - y * sinR;
            const ry = x * sinR + y * cosR;
            const ty = ry * cosT - z * sinT;
            const tz = ry * sinT + z * cosT;
            const px = cx + rx * scale;
            const py = cy - ty * scale - tz * scale * 0.8;
            const clipX = (px / w) * 2 - 1;
            const clipY = 1 - (py / h) * 2;
            const depth = 0.5 - tz * 0.4;
            return {clipX, clipY, depth};
        };

        const triVerts: number[] = [];
        const lineVerts: number[] = [];

        const gridPoint = (xAx: number[], yAx: number[], zGrid: number[][], r: number, c: number) => {
            const nx = norm(xAx[c] ?? c, axXMin, axXMax) - 0.5;
            const ny = norm(yAx[r] ?? r, axYMin, axYMax) - 0.5;
            const nz = norm(zGrid[r][c], zMin, zMax);
            return proj(nx, ny, nz);
        };

        const pushTri = (verts: number[],
                         p1: { clipX: number; clipY: number; depth: number },
                         p2: { clipX: number; clipY: number; depth: number },
                         p3: { clipX: number; clipY: number; depth: number },
                         r: number, g: number, b: number, a: number) => {
            verts.push(p1.clipX, p1.clipY, p1.depth, r, g, b, a);
            verts.push(p2.clipX, p2.clipY, p2.depth, r, g, b, a);
            verts.push(p3.clipX, p3.clipY, p3.depth, r, g, b, a);
        };

        const pushLine = (p1: { clipX: number; clipY: number; depth: number },
                          p2: { clipX: number; clipY: number; depth: number },
                          r: number, g: number, b: number, a: number) => {
            lineVerts.push(p1.clipX, p1.clipY, p1.depth, r, g, b, a);
            lineVerts.push(p2.clipX, p2.clipY, p2.depth, r, g, b, a);
        };

        const buildSurface = (xAx: number[], yAx: number[], zGrid: number[][],
                              colorFn: (t: number) => [number, number, number, number]) => {
            const gRows = zGrid.length;
            const gCols = zGrid[0].length;
            for (let r = 0; r < gRows - 1; r++) {
                for (let c = 0; c < gCols - 1; c++) {
                    const p1 = gridPoint(xAx, yAx, zGrid, r, c);
                    const p2 = gridPoint(xAx, yAx, zGrid, r, c + 1);
                    const p3 = gridPoint(xAx, yAx, zGrid, r + 1, c + 1);
                    const p4 = gridPoint(xAx, yAx, zGrid, r + 1, c);
                    const avgZ = (zGrid[r][c] + zGrid[r][c + 1] + zGrid[r + 1][c + 1] + zGrid[r + 1][c]) / 4;
                    const t = (zMax - zMin) ? (avgZ - zMin) / (zMax - zMin) : 0.5;
                    const [cr, cg, cb, ca] = colorFn(t);
                    pushTri(triVerts, p1, p2, p3, cr, cg, cb, ca);
                    pushTri(triVerts, p1, p3, p4, cr, cg, cb, ca);
                }
            }
        };

        const buildWireframe = (xAx: number[], yAx: number[], zGrid: number[][],
                                r: number, g: number, b: number, a: number) => {
            const gRows = zGrid.length;
            const gCols = zGrid[0].length;
            for (let row = 0; row < gRows; row++) {
                for (let c = 0; c < gCols - 1; c++) {
                    pushLine(gridPoint(xAx, yAx, zGrid, row, c), gridPoint(xAx, yAx, zGrid, row, c + 1), r, g, b, a);
                }
            }
            for (let row = 0; row < gRows - 1; row++) {
                for (let c = 0; c < gCols; c++) {
                    pushLine(gridPoint(xAx, yAx, zGrid, row, c), gridPoint(xAx, yAx, zGrid, row + 1, c), r, g, b, a);
                }
            }
        };

        buildSurface(xData, yData, zData, (t) => {
            const [r, g, b] = hslToRgb((1 - t) * 120, 70, 50);
            return [r, g, b, 0.7];
        });
        buildWireframe(xData, yData, zData, 0, 0, 0, 0.3);

        for (const ov of overlays) {
            if (ov.isCompare) {
                buildSurface(ov.xAx, ov.yAx, ov.z, (t) => {
                    const [r, g, b] = hslToRgb(174, 60, 75 - t * 45);
                    return [r, g, b, 0.55];
                });
                buildWireframe(ov.xAx, ov.yAx, ov.z, 0, 0.31, 0.27, 0.4);
            } else {
                buildSurface(ov.xAx, ov.yAx, ov.z, (t) => {
                    const l = (75 - t * 45) / 100;
                    return [l, l, l, 0.55];
                });
                buildWireframe(ov.xAx, ov.yAx, ov.z, 0, 0, 0, 0.3);
            }
        }

        const origin = proj(-0.6, -0.6, 0);
        const xE = proj(0.6, -0.6, 0);
        const yE = proj(-0.6, 0.6, 0);
        const zE = proj(-0.6, -0.6, 1.2);
        const axisVerts: number[] = [];
        axisVerts.push(origin.clipX, origin.clipY, 0, 0.94, 0.27, 0.27, 1);
        axisVerts.push(xE.clipX, xE.clipY, 0, 0.94, 0.27, 0.27, 1);
        axisVerts.push(origin.clipX, origin.clipY, 0, 0.13, 0.77, 0.37, 1);
        axisVerts.push(yE.clipX, yE.clipY, 0, 0.13, 0.77, 0.37, 1);
        axisVerts.push(origin.clipX, origin.clipY, 0, 0.23, 0.51, 0.96, 1);
        axisVerts.push(zE.clipX, zE.clipY, 0, 0.23, 0.51, 0.96, 1);

        for (let i = 0; i < xData.length; i++) {
            const t = norm(xData[i], axXMin, axXMax);
            const p = proj(-0.5 + t, -0.6, 0);
            const p2 = proj(-0.5 + t, -0.63, 0);
            axisVerts.push(p.clipX, p.clipY, 0, 0.94, 0.27, 0.27, 1);
            axisVerts.push(p2.clipX, p2.clipY, 0, 0.94, 0.27, 0.27, 1);
        }
        for (let i = 0; i < yData.length; i++) {
            const t = norm(yData[i], axYMin, axYMax);
            const p = proj(-0.6, -0.5 + t, 0);
            const p2 = proj(-0.63, -0.5 + t, 0);
            axisVerts.push(p.clipX, p.clipY, 0, 0.13, 0.77, 0.37, 1);
            axisVerts.push(p2.clipX, p2.clipY, 0, 0.13, 0.77, 0.37, 1);
        }
        for (let i = 0; i < 5; i++) {
            const t = i / 4;
            const p = proj(-0.6, -0.6, t);
            const p2 = proj(-0.63, -0.6, t);
            axisVerts.push(p.clipX, p.clipY, 0, 0.23, 0.51, 0.96, 1);
            axisVerts.push(p2.clipX, p2.clipY, 0, 0.23, 0.51, 0.96, 1);
        }

        gl.useProgram(program);
        const aPos = gl.getAttribLocation(program, 'a_pos');
        const aColor = gl.getAttribLocation(program, 'a_color');
        const stride = 7 * 4;

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        gl.bindBuffer(gl.ARRAY_BUFFER, buf);

        const drawBatch = (data: Float32Array, mode: number) => {
            gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(aPos);
            gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, stride, 0);
            gl.enableVertexAttribArray(aColor);
            gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, stride, 3 * 4);
            gl.drawArrays(mode, 0, data.length / 7);
        };

        if (triVerts.length > 0) {
            gl.depthMask(true);
            drawBatch(new Float32Array(triVerts), gl.TRIANGLES);
        }

        if (lineVerts.length > 0) {
            gl.depthMask(false);
            drawBatch(new Float32Array(lineVerts), gl.LINES);
        }

        if (axisVerts.length > 0) {
            gl.disable(gl.DEPTH_TEST);
            gl.depthMask(true);
            drawBatch(new Float32Array(axisVerts), gl.LINES);
        }

    }, [zData, xData, yData, rotation, tilt, showOriginal, showCompare,
        originalZData, originalXData, originalYData, compareZData, compareXData, compareYData]);

    if (zData.length === 0 || zData[0].length === 0) return null;

    const rows = zData.length;
    const cols = zData[0].length;

    const origXD = originalXData && originalXData.length > 0 ? originalXData : xData;
    const origYD = originalYData && originalYData.length > 0 ? originalYData : yData;
    const cmpXD = compareXData && compareXData.length > 0 ? compareXData : xData;
    const cmpYD = compareYData && compareYData.length > 0 ? compareYData : yData;

    const ovAxes: number[][] = [];
    if (showOriginal && originalZData) {
        ovAxes.push(origXD);
        ovAxes.push(origYD);
    }
    if (showCompare && compareZData) {
        ovAxes.push(cmpXD);
        ovAxes.push(cmpYD);
    }
    const allXVals = [...xData, ...ovAxes.filter((_, i) => i % 2 === 0).flat()];
    const allYVals = [...yData, ...ovAxes.filter((_, i) => i % 2 === 1).flat()];
    const axXMin = Math.min(...allXVals);
    const axXMax = Math.max(...allXVals);
    const axYMin = Math.min(...allYVals);
    const axYMax = Math.max(...allYVals);

    const allZ = [...zData.flat(),
        ...(showOriginal && originalZData ? originalZData.flat() : []),
        ...(showCompare && compareZData ? compareZData.flat() : [])];
    const zMin = Math.min(...allZ);
    const zMax = Math.max(...allZ);

    const norm = (v: number, mn: number, mx: number) => (mx - mn) ? (v - mn) / (mx - mn) : 0.5;

    const projScreen = (x: number, y: number, z: number) => {
        const baseSize = 600;
        const aspectRatio = cols / rows;
        const w = aspectRatio >= 1 ? baseSize * Math.min(aspectRatio, 2) : baseSize;
        const h = aspectRatio < 1 ? baseSize / Math.max(aspectRatio, 0.5) : baseSize;
        const sc = Math.min(w, h) * 0.4;
        const cxp = w / 2;
        const cyp = h / 2 + h * 0.12;
        const radRot = (rotation * Math.PI) / 180;
        const radTilt = (tilt * Math.PI) / 180;
        const rx = x * Math.cos(radRot) - y * Math.sin(radRot);
        const ry = x * Math.sin(radRot) + y * Math.cos(radRot);
        const ty = ry * Math.cos(radTilt) - z * Math.sin(radTilt);
        const px = cxp + rx * sc;
        const py = cyp - ty * sc - (ry * Math.sin(radTilt) + z * Math.cos(radTilt)) * sc * 0.8;
        return {xPct: (px / w) * 100, yPct: (py / h) * 100};
    };

    const xTicks = xData.map((val) => {
        const t = norm(val, axXMin, axXMax);
        return {val, pos: projScreen(-0.5 + t, -0.63, 0)};
    });
    const yTicks = yData.map((val) => {
        const t = norm(val, axYMin, axYMax);
        return {val, pos: projScreen(-0.63, -0.5 + t, 0)};
    });
    const zTicks = Array.from({length: 5}, (_, i) => {
        const t = i / 4;
        const val = zMin + t * (zMax - zMin);
        return {val, pos: projScreen(-0.63, -0.6, t)};
    });

    const xEndPos = projScreen(0.65, -0.6, 0);
    const yEndPos = projScreen(-0.6, 0.65, 0);
    const zEndPos = projScreen(-0.6, -0.6, 1.25);

    const xDecimals = getConsistentDecimals(xData, 2);
    const yDecimals = getConsistentDecimals(yData, 2);
    const zDecimals = getConsistentDecimals(zTicks.map(t => t.val), 2);

    return (
        <div ref={containerRef} class="mt-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-4">
            <div class="relative" style={{
                aspectRatio: `${cols / rows >= 1 ? Math.min(cols / rows, 2) : 1} / ${cols / rows < 1 ? 1 / Math.max(cols / rows, 0.5) : 1}`,
                maxHeight: '70vh'
            }}>
                <canvas
                    ref={canvasRef}
                    class="w-full h-full rounded select-none"
                    style={{cursor: 'move', touchAction: 'none'}}
                    onMouseDown={handleMouseDown}
                    onTouchStart={handleTouchStart}
                />
                <div class="absolute inset-0 pointer-events-none font-mono" style={{fontSize: '9px'}}>
                    {xTicks.map((tick, i) => (
                        <span key={`xt${i}`} class="absolute text-zinc-400"
                              style={{
                                  left: `${tick.pos.xPct}%`,
                                  top: `${tick.pos.yPct}%`,
                                  transform: 'translate(-50%, 2px)'
                              }}>
                            {formatValueConsistent(tick.val, xDecimals)}
                        </span>
                    ))}
                    {yTicks.map((tick, i) => (
                        <span key={`yt${i}`} class="absolute text-zinc-400"
                              style={{
                                  left: `${tick.pos.xPct}%`,
                                  top: `${tick.pos.yPct}%`,
                                  transform: 'translate(-100%, -50%)',
                                  paddingRight: '4px'
                              }}>
                            {formatValueConsistent(tick.val, yDecimals)}
                        </span>
                    ))}
                    {zTicks.map((tick, i) => (
                        <span key={`zt${i}`} class="absolute text-zinc-400"
                              style={{
                                  left: `${tick.pos.xPct}%`,
                                  top: `${tick.pos.yPct}%`,
                                  transform: 'translate(-100%, -50%)',
                                  paddingRight: '4px'
                              }}>
                            {formatValueConsistent(tick.val, zDecimals)}
                        </span>
                    ))}
                    <span class="absolute text-red-400 font-sans" style={{
                        left: `${xEndPos.xPct}%`,
                        top: `${xEndPos.yPct}%`,
                        fontSize: '11px',
                        transform: 'translate(4px, -50%)'
                    }}>
                        {xUnit || 'X'}
                    </span>
                    <span class="absolute text-green-400 font-sans" style={{
                        left: `${yEndPos.xPct}%`,
                        top: `${yEndPos.yPct}%`,
                        fontSize: '11px',
                        transform: 'translate(-100%, -50%)'
                    }}>
                        {yUnit || 'Y'}
                    </span>
                    <span class="absolute text-blue-400 font-sans" style={{
                        left: `${zEndPos.xPct}%`,
                        top: `${zEndPos.yPct}%`,
                        fontSize: '11px',
                        transform: 'translate(-50%, -100%)'
                    }}>
                        {zUnit || 'Z'}
                    </span>
                </div>
            </div>

            <div class="flex items-center gap-2 mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                <span>{formatValue(zMin, 1)}</span>
                <div class="w-32 h-3 rounded"
                     style="background: linear-gradient(90deg, hsl(120,70%,50%), hsl(60,70%,50%), hsl(0,70%,50%))"></div>
                <span>{formatValue(zMax, 1)}</span>
                <span class="ml-2 text-zinc-500">{zUnit}</span>
                {originalZData && (
                    <label class="ml-4 flex items-center gap-1 cursor-pointer select-none">
                        <input type="checkbox" checked={showOriginal} onChange={() => setShowOriginal(!showOriginal)}
                               class="cursor-pointer"/>
                        <span class="w-8 h-3 rounded inline-block"
                              style="background: linear-gradient(90deg, hsl(0,0%,75%), hsl(0,0%,55%), hsl(0,0%,30%))"></span>
                        Original
                    </label>
                )}
                {compareZData && (
                    <label class="ml-4 flex items-center gap-1 cursor-pointer select-none">
                        <input type="checkbox" checked={showCompare} onChange={() => setShowCompare(!showCompare)}
                               class="cursor-pointer"/>
                        <span class="w-8 h-3 rounded inline-block"
                              style="background: linear-gradient(90deg, hsl(174,60%,75%), hsl(174,60%,45%), hsl(174,60%,30%))"></span>
                        Compare
                    </label>
                )}
            </div>
        </div>
    );
}

// ─── Selection helpers ───────────────────────────────────────────────────────

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

// ─── Table Editor ────────────────────────────────────────────────────────────

interface TableEditorInternalProps extends IValueEditorProps {
    table: TableData;
    trackEdit: () => void;
}

function TableEditor({
                         param,
                         table,
                         onCellChange,
                         onAxisChange,
                         onBulkChange,
                         onRevert,
                         trackEdit,
                     }: TableEditorInternalProps) {
    const [tableData, setTableData] = useState<number[][]>(table.cells);
    const [editCell, setEditCell] = useState<{ row: number; col: number } | null>(null);
    const [editAxisCell, setEditAxisCell] = useState<{ axis: 'x' | 'y'; index: number } | null>(null);
    const [inputValue, setInputValue] = useState('');
    const [showOriginalTable, setShowOriginalTable] = useState(false);
    const [showCompareTable, setShowCompareTable] = useState(false);
    const [xAxisData, setXAxisData] = useState<number[]>(table.xAxis);
    const [yAxisData, setYAxisData] = useState<number[]>(table.yAxis);

    // Selection state
    const [selection, setSelection] = useState<Selection | null>(null);
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectionAnchor, setSelectionAnchor] = useState<{ row: number; col: number } | null>(null);
    const [modifyValue, setModifyValue] = useState('');
    const [showModifyInput, setShowModifyInput] = useState<'add' | 'multiply' | 'set' | null>(null);
    const modifyInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (showModifyInput && modifyInputRef.current) {
            modifyInputRef.current.focus();
        }
    }, [showModifyInput]);

    // Axis selection state
    const [axisSelection, setAxisSelection] = useState<{ axis: 'x' | 'y'; start: number; end: number } | null>(null);
    const [isAxisSelecting, setIsAxisSelecting] = useState(false);
    const [axisSelectionAnchor, setAxisSelectionAnchor] = useState<{ axis: 'x' | 'y'; index: number } | null>(null);
    const tableContainerRef = useRef<HTMLDivElement>(null);

    const originalTableData = table.original?.cells ?? null;
    const originalXAxis = table.original?.xAxis ?? null;
    const originalYAxis = table.original?.yAxis ?? null;
    const compareTableData = table.compare?.cells ?? null;
    const compareXAxis = table.compare?.xAxis ?? null;
    const compareYAxis = table.compare?.yAxis ?? null;

    const showOriginal = showOriginalTable;
    const showCompare = showCompareTable;

    // Sync from props when param changes
    useEffect(() => {
        setTableData(table.cells);
        setXAxisData(table.xAxis);
        setYAxisData(table.yAxis);
    }, [table.cells, table.xAxis, table.yAxis]);

    const hasChanged = useMemo(() => {
        if (!originalTableData || tableData.length === 0) return false;
        for (let r = 0; r < tableData.length; r++) {
            if (!originalTableData[r] || !tableData[r]) continue;
            for (let c = 0; c < tableData[r].length; c++) {
                if (originalTableData[r][c] === undefined || tableData[r][c] === undefined) continue;
                if (Math.abs(originalTableData[r][c] - tableData[r][c]) > 0.0001) return true;
            }
        }
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

    const hasCompareDiff = useMemo(() => {
        if (!compareTableData || tableData.length === 0) return false;
        for (let r = 0; r < tableData.length; r++) {
            if (!compareTableData[r] || !tableData[r]) continue;
            for (let c = 0; c < tableData[r].length; c++) {
                if (compareTableData[r][c] === undefined || tableData[r][c] === undefined) continue;
                if (Math.abs(compareTableData[r][c] - tableData[r][c]) > 0.0001) return true;
            }
        }
        return false;
    }, [compareTableData, tableData]);

    const {minVal, maxVal} = useMemo(() => {
        if (tableData.length === 0) return {minVal: 0, maxVal: 1};
        const flat = tableData.flat();
        return {minVal: Math.min(...flat), maxVal: Math.max(...flat)};
    }, [tableData]);

    const {origMinVal, origMaxVal} = useMemo(() => {
        if (!originalTableData || originalTableData.length === 0) return {origMinVal: 0, origMaxVal: 1};
        const flat = originalTableData.flat();
        return {origMinVal: Math.min(...flat), origMaxVal: Math.max(...flat)};
    }, [originalTableData]);

    const {cmpMinVal, cmpMaxVal} = useMemo(() => {
        if (!compareTableData || compareTableData.length === 0) return {cmpMinVal: 0, cmpMaxVal: 1};
        const flat = compareTableData.flat();
        return {cmpMinVal: Math.min(...flat), cmpMaxVal: Math.max(...flat)};
    }, [compareTableData]);

    const xDecimals = useMemo(() => getConsistentDecimals(xAxisData, 2), [xAxisData]);
    const yDecimals = useMemo(() => getConsistentDecimals(yAxisData, 2), [yAxisData]);
    const dataDecimals = useMemo(() => getConsistentDecimals(tableData.flat(), 2), [tableData]);

    const handleCellDoubleClick = (row: number, col: number) => {
        setInputValue(formatValue(tableData[row][col], 4));
        setEditCell({row, col});
        setEditAxisCell(null);
    };

    const handleAxisDoubleClick = (axis: 'x' | 'y', index: number) => {
        const axisData = axis === 'x' ? xAxisData : yAxisData;
        setInputValue(formatValue(axisData[index], 4));
        setEditAxisCell({axis, index});
        setEditCell(null);
    };

    const handleConfirm = () => {
        if (editCell) {
            const newValue = parseFloat(inputValue);
            if (!isNaN(newValue)) {
                const newData = [...tableData];
                newData[editCell.row] = [...newData[editCell.row]];
                newData[editCell.row][editCell.col] = newValue;
                setTableData(newData);
                onCellChange?.(editCell.row, editCell.col, newValue);
                trackEdit();
            }
            setEditCell(null);
        } else if (editAxisCell) {
            const newValue = parseFloat(inputValue);
            if (!isNaN(newValue)) {
                if (editAxisCell.axis === 'x') {
                    const newAxisData = [...xAxisData];
                    newAxisData[editAxisCell.index] = newValue;
                    setXAxisData(newAxisData);
                } else {
                    const newAxisData = [...yAxisData];
                    newAxisData[editAxisCell.index] = newValue;
                    setYAxisData(newAxisData);
                }
                onAxisChange?.(editAxisCell.axis, editAxisCell.index, newValue);
                trackEdit();
            }
            setEditAxisCell(null);
        }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleConfirm();
            if (editCell) {
                const nextCol = editCell.col + 1;
                if (nextCol < (param.cols || 1)) {
                    setTimeout(() => handleCellDoubleClick(editCell.row, nextCol), 0);
                } else if (editCell.row + 1 < (param.rows || 1)) {
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

    const xAxisChanged = (index: number): boolean => {
        if (!originalXAxis || originalXAxis[index] === undefined || xAxisData[index] === undefined) return false;
        return Math.abs(originalXAxis[index] - xAxisData[index]) > 0.0001;
    };

    const yAxisChanged = (index: number): boolean => {
        if (!originalYAxis || originalYAxis[index] === undefined || yAxisData[index] === undefined) return false;
        return Math.abs(originalYAxis[index] - yAxisData[index]) > 0.0001;
    };

    const cellChanged = (row: number, col: number): boolean => {
        if (!originalTableData || tableData.length === 0) return false;
        if (!originalTableData[row] || !tableData[row]) return false;
        if (originalTableData[row][col] === undefined || tableData[row][col] === undefined) return false;
        return Math.abs(originalTableData[row][col] - tableData[row][col]) > 0.0001;
    };

    const cellCompareDiff = (row: number, col: number): boolean => {
        if (!compareTableData || tableData.length === 0) return false;
        if (!compareTableData[row] || !tableData[row]) return false;
        if (compareTableData[row][col] === undefined || tableData[row][col] === undefined) return false;
        return Math.abs(compareTableData[row][col] - tableData[row][col]) > 0.0001;
    };

    const xAxisCompareDiff = (index: number): boolean => {
        if (!compareXAxis || !xAxisData[index]) return false;
        if (compareXAxis[index] === undefined) return false;
        return Math.abs(compareXAxis[index] - xAxisData[index]) > 0.0001;
    };

    const yAxisCompareDiff = (index: number): boolean => {
        if (!compareYAxis || !yAxisData[index]) return false;
        if (compareYAxis[index] === undefined) return false;
        return Math.abs(compareYAxis[index] - yAxisData[index]) > 0.0001;
    };

    const isSelected = (row: number, col: number): boolean => {
        if (!selection) return false;
        const norm = normalizeSelection(selection);
        return row >= norm.startRow && row <= norm.endRow && col >= norm.startCol && col <= norm.endCol;
    };

    const selectionCount = useMemo(() => {
        if (axisSelection) {
            return Math.abs(axisSelection.end - axisSelection.start) + 1;
        }
        if (!selection) return 0;
        const norm = normalizeSelection(selection);
        return (norm.endRow - norm.startRow + 1) * (norm.endCol - norm.startCol + 1);
    }, [selection, axisSelection]);

    const isAxisSelected = (axis: 'x' | 'y', index: number): boolean => {
        if (!axisSelection || axisSelection.axis !== axis) return false;
        const start = Math.min(axisSelection.start, axisSelection.end);
        const end = Math.max(axisSelection.start, axisSelection.end);
        return index >= start && index <= end;
    };

    const handleCellMouseDown = (row: number, col: number, e: MouseEvent) => {
        setAxisSelection(null);
        setAxisSelectionAnchor(null);

        if (e.shiftKey && selectionAnchor) {
            setSelection({
                startRow: selectionAnchor.row,
                startCol: selectionAnchor.col,
                endRow: row,
                endCol: col,
            });
        } else {
            setSelectionAnchor({row, col});
            setSelection({startRow: row, startCol: col, endRow: row, endCol: col});
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

    const handleAxisMouseDown = (axis: 'x' | 'y', index: number, e: MouseEvent) => {
        setSelection(null);
        setSelectionAnchor(null);

        if (e.shiftKey && axisSelectionAnchor && axisSelectionAnchor.axis === axis) {
            setAxisSelection({axis, start: axisSelectionAnchor.index, end: index});
        } else {
            setAxisSelectionAnchor({axis, index});
            setAxisSelection({axis, start: index, end: index});
            setIsAxisSelecting(true);
        }
    };

    const handleAxisMouseEnter = (axis: 'x' | 'y', index: number) => {
        if (isAxisSelecting && axisSelectionAnchor && axisSelectionAnchor.axis === axis) {
            setAxisSelection({axis, start: axisSelectionAnchor.index, end: index});
        }
    };

    const copySelection = () => {
        if (axisSelection) {
            const axisData = axisSelection.axis === 'x' ? xAxisData : yAxisData;
            const start = Math.min(axisSelection.start, axisSelection.end);
            const end = Math.max(axisSelection.start, axisSelection.end);
            const values = axisData.slice(start, end + 1).map(v => formatValue(v, 4));
            navigator.clipboard.writeText(values.join('\t'));
            return;
        }
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

    const pasteSelection = async () => {
        if (axisSelection) {
            try {
                const text = await navigator.clipboard.readText();
                const values = text.trim().split(/[\t\n]/).map(v => parseFloat(v.trim()));
                if (!param.xAxis?.editable && axisSelection.axis === 'x') return;
                if (!param.yAxis?.editable && axisSelection.axis === 'y') return;
                const axisData = axisSelection.axis === 'x' ? xAxisData : yAxisData;
                const setAxisData = axisSelection.axis === 'x' ? setXAxisData : setYAxisData;
                const newAxisData = [...axisData];
                const start = Math.min(axisSelection.start, axisSelection.end);
                const axisChanges: AxisChange[] = [];
                for (let i = 0; i < values.length && start + i < axisData.length; i++) {
                    if (!isNaN(values[i])) {
                        newAxisData[start + i] = values[i];
                        axisChanges.push({axis: axisSelection.axis, index: start + i, value: values[i]});
                    }
                }
                setAxisData(newAxisData);
                if (axisChanges.length > 0) {
                    onBulkChange?.({axes: axisChanges});
                    trackEdit();
                }
            } catch (e) {
                console.error('Paste failed:', e);
            }
            return;
        }
        if (!selection) return;
        try {
            const text = await navigator.clipboard.readText();
            const norm = normalizeSelection(selection);
            const rows = text.trim().split('\n').map(r => r.split('\t').map(c => parseFloat(c.trim())));

            const newData = tableData.map(r => [...r]);
            const cellChanges: CellChange[] = [];
            for (let r = 0; r < rows.length && norm.startRow + r < tableData.length; r++) {
                for (let c = 0; c < rows[r].length && norm.startCol + c < tableData[0].length; c++) {
                    const value = rows[r][c];
                    if (!isNaN(value)) {
                        const targetRow = norm.startRow + r;
                        const targetCol = norm.startCol + c;
                        newData[targetRow][targetCol] = value;
                        cellChanges.push({row: targetRow, col: targetCol, value});
                    }
                }
            }
            setTableData(newData);
            if (cellChanges.length > 0) {
                onBulkChange?.({cells: cellChanges});
                trackEdit();
            }
        } catch (e) {
            console.error('Paste failed:', e);
        }
    };

    const modifySelection = (operation: 'add' | 'multiply' | 'set', value: number) => {
        if (isNaN(value)) return;

        if (axisSelection) {
            if (!param.xAxis?.editable && axisSelection.axis === 'x') return;
            if (!param.yAxis?.editable && axisSelection.axis === 'y') return;

            const axisData = axisSelection.axis === 'x' ? xAxisData : yAxisData;
            const setAxisData = axisSelection.axis === 'x' ? setXAxisData : setYAxisData;
            const newAxisData = [...axisData];

            const start = Math.min(axisSelection.start, axisSelection.end);
            const end = Math.max(axisSelection.start, axisSelection.end);

            const axisChanges: AxisChange[] = [];
            for (let i = start; i <= end; i++) {
                let newValue: number;
                if (operation === 'add') {
                    newValue = axisData[i] + value;
                } else if (operation === 'multiply') {
                    newValue = axisData[i] * (value / 100);
                } else {
                    newValue = value;
                }
                newAxisData[i] = newValue;
                axisChanges.push({axis: axisSelection.axis, index: i, value: newValue});
            }
            setAxisData(newAxisData);
            onBulkChange?.({axes: axisChanges});
            trackEdit();
            setShowModifyInput(null);
            setModifyValue('');
            return;
        }

        if (!selection) return;
        const norm = normalizeSelection(selection);
        const newData = tableData.map(r => [...r]);
        const cellChanges: CellChange[] = [];

        for (let r = norm.startRow; r <= norm.endRow; r++) {
            for (let c = norm.startCol; c <= norm.endCol; c++) {
                let newValue: number;
                if (operation === 'add') {
                    newValue = tableData[r][c] + value;
                } else if (operation === 'multiply') {
                    newValue = tableData[r][c] * (value / 100);
                } else {
                    newValue = value;
                }
                newData[r][c] = newValue;
                cellChanges.push({row: r, col: c, value: newValue});
            }
        }
        setTableData(newData);
        onBulkChange?.({cells: cellChanges});
        trackEdit();
        setShowModifyInput(null);
        setModifyValue('');
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'c' && (selection || axisSelection)) {
                e.preventDefault();
                copySelection();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'v' && (selection || axisSelection)) {
                e.preventDefault();
                pasteSelection();
            }
            if (e.key === 'Escape') {
                setSelection(null);
                setAxisSelection(null);
                setShowModifyInput(null);
            }
            if (e.key === 'Enter' && (selection || axisSelection) && !editCell && !editAxisCell && !showModifyInput) {
                e.preventDefault();
                setShowModifyInput('set');
            }
            if (e.key === '+' && (selection || axisSelection) && !editCell && !editAxisCell && !showModifyInput) {
                e.preventDefault();
                modifySelection('add', 1);
            }
            if (e.key === '-' && (selection || axisSelection) && !editCell && !editAxisCell && !showModifyInput) {
                e.preventDefault();
                modifySelection('add', -1);
            }
        };
        const handleClickOutside = (e: MouseEvent) => {
            if (tableContainerRef.current && !tableContainerRef.current.contains(e.target as Node)) {
                setSelection(null);
                setAxisSelection(null);
                setShowModifyInput(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('mousedown', handleClickOutside);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('mousedown', handleClickOutside);
        };
    }, [selection, axisSelection, tableData, editCell, editAxisCell, showModifyInput]);

    return (
        <div>
            <div class="sticky top-0 z-10 bg-white dark:bg-zinc-900 pt-4 pb-2">
                <div class="flex items-start justify-between mb-4">
                    <div>
                        <h2 class="text-lg font-semibold">
                            {param.customName || param.description || param.name}
                        </h2>
                        <code class="text-xs text-zinc-500">{param.name}</code>
                    </div>
                    <div class="flex gap-x-2">
                        {hasChanged && onRevert &&
                            <button
                                class="px-3 py-1.5 text-sm rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600"
                                onClick={() => {
                                    onRevert();
                                    if (originalTableData) setTableData(originalTableData.map(row => [...row]));
                                    if (originalXAxis) setXAxisData([...originalXAxis]);
                                    if (originalYAxis) setYAxisData([...originalYAxis]);
                                    const type = param.type === 'CURVE' ? '1D' : '2D';
                                    track('Revert Parameter', {type, name: param.name});
                                }}>
                                Revert
                            </button>}
                        {originalTableData && (
                            <button
                                onClick={() => setShowOriginalTable(!showOriginalTable)}
                                class={`px-3 py-1.5 text-sm rounded ${
                                    showOriginal ? 'bg-blue-600 text-white' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600'
                                } ${hasChanged ? 'ring-2 ring-amber-500' : ''}`}
                            >
                                Original
                            </button>
                        )}
                        {compareTableData && (
                            <button
                                onClick={() => setShowCompareTable(!showCompareTable)}
                                class={`px-3 py-1.5 text-sm rounded ${
                                    showCompare ? 'bg-teal-600 text-white' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600'
                                } ${hasCompareDiff ? 'ring-2 ring-teal-500' : ''}`}
                            >
                                Compare
                            </button>
                        )}
                    </div>
                </div>

                <div
                    class="flex flex-wrap items-center gap-4 p-3 bg-zinc-200 dark:bg-zinc-800 rounded text-xs text-zinc-600 dark:text-zinc-400">
                    <span>Size: {param.rows || 1} x {param.cols || 1}</span>
                    <span>Z: {param.unit || '-'}</span>
                    {param.xAxis && <span>X: {param.xAxis.unit || '-'}</span>}
                    {param.yAxis && <span>Y: {param.yAxis.unit || '-'}</span>}

                    {(selection || axisSelection) && selectionCount > 0 && (
                        <>
            <span class="border-l border-zinc-400 dark:border-zinc-600 pl-4 text-zinc-700 dark:text-zinc-300">
              {selectionCount} cell{selectionCount > 1 ? 's' : ''}
            </span>
                            <div class="flex items-center gap-1">
                                {showModifyInput ? (
                                    <div class="flex items-center gap-1">
                                        <input
                                            ref={modifyInputRef}
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
                                            class="w-16 px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-700 border border-zinc-400 dark:border-zinc-600 rounded text-zinc-900 dark:text-zinc-100 text-xs"
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
                                            onClick={() => {
                                                setShowModifyInput(null);
                                                setModifyValue('');
                                            }}
                                            class="px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 rounded text-xs hover:bg-zinc-300 dark:hover:bg-zinc-600"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => setShowModifyInput('add')}
                                            class="px-2 py-0.5 bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded text-xs hover:bg-zinc-300 dark:hover:bg-zinc-600"
                                            title="Add/subtract value from selection"
                                        >
                                            +/-
                                        </button>
                                        <button
                                            onClick={() => setShowModifyInput('multiply')}
                                            class="px-2 py-0.5 bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded text-xs hover:bg-zinc-300 dark:hover:bg-zinc-600"
                                            title="Scale selection by percentage (50 = half, 200 = double)"
                                        >
                                            %
                                        </button>
                                        <button
                                            onClick={() => setShowModifyInput('set')}
                                            class="px-2 py-0.5 bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded text-xs hover:bg-zinc-300 dark:hover:bg-zinc-600"
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
            </div>

            <div ref={tableContainerRef} class="overflow-auto max-h-[calc(100vh-200px)]">
                <table class="border-collapse font-mono text-xs table-fixed">
                    <colgroup>
                        {yAxisData.length > 0 && <col class="w-12"/>}
                        {yAxisData.length > 0 && <col class="w-16"/>}
                        {Array.from({length: param.cols || 1}).map((_, i) => (
                            <col key={i} class="w-16"/>
                        ))}
                    </colgroup>
                    <thead>
                    <tr>
                        {yAxisData.length > 0 && (
                            <th class="p-1 border border-zinc-300 dark:border-zinc-700 bg-zinc-200 dark:bg-zinc-800 text-zinc-500 font-normal text-left align-top">
                                {param.unit || 'Z'}
                            </th>
                        )}
                        {yAxisData.length > 0 &&
                            <th class="border border-zinc-300 dark:border-zinc-700 bg-zinc-200 dark:bg-zinc-800"></th>}
                        <th
                            colSpan={param.cols || 1}
                            class="p-1 border border-zinc-300 dark:border-zinc-700 bg-zinc-200 dark:bg-zinc-800 text-zinc-500 font-normal text-center"
                        >
                            {param.xAxis?.unit || 'X'} →
                        </th>
                    </tr>
                    <tr>
                        {yAxisData.length > 0 &&
                            <th class="border border-zinc-300 dark:border-zinc-700 bg-zinc-200 dark:bg-zinc-800"></th>}
                        {yAxisData.length > 0 &&
                            <th class="border border-zinc-300 dark:border-zinc-700 bg-zinc-200 dark:bg-zinc-700"></th>}
                        {xAxisData.length > 0
                            ? xAxisData.map((val, i) => {
                                const isEditing = editAxisCell?.axis === 'x' && editAxisCell?.index === i;
                                const isChanged = xAxisChanged(i);
                                const isCmpDiff = xAxisCompareDiff(i);
                                const isCellSelected = isAxisSelected('x', i);
                                const displayValue = showCompare && compareXAxis ? compareXAxis[i]
                                    : showOriginal && originalXAxis ? originalXAxis[i] : val;
                                const canEdit = param.xAxis?.editable;
                                return (
                                    <th
                                        key={i}
                                        class={`p-1.5 border border-zinc-300 dark:border-zinc-700 font-medium text-right select-none ${
                                            canEdit ? 'cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-700' : ''
                                        } ${isCellSelected ? 'bg-blue-900/50 text-zinc-200' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'}`}
                                        style={{
                                            outline: isCellSelected ? '2px solid #3b82f6'
                                                : showCompare && isCmpDiff ? '2px solid #14b8a6'
                                                    : isChanged && !showOriginal ? '2px solid #f59e0b' : undefined,
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
                                                class="w-full bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 font-mono text-xs text-right outline-none border border-blue-500 rounded px-1"
                                            />
                                        ) : (
                                            param.xAxis?.labels?.[i] ?? formatValueConsistent(displayValue, xDecimals)
                                        )}
                                    </th>
                                );
                            })
                            : Array.from({length: param.cols || 1}).map((_, i) => (
                                <th
                                    key={i}
                                    class="p-1.5 border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-medium text-right"
                                >
                                    {param.xAxis?.labels?.[i] ?? i}
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
                                    class="p-1 border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-normal text-center align-middle"
                                    style={{writingMode: 'vertical-rl', transform: 'rotate(180deg)'}}
                                >
                                    {param.yAxis?.unit || 'Y'} ↓
                                </td>
                            )}
                            {yAxisData.length > 0 && (() => {
                                const isEditing = editAxisCell?.axis === 'y' && editAxisCell?.index === rowIdx;
                                const isChanged = yAxisChanged(rowIdx);
                                const isCmpDiff = yAxisCompareDiff(rowIdx);
                                const isCellSelected = isAxisSelected('y', rowIdx);
                                const displayValue = showCompare && compareYAxis ? compareYAxis[rowIdx]
                                    : showOriginal && originalYAxis ? originalYAxis[rowIdx] : yAxisData[rowIdx];
                                const canEdit = param.yAxis?.editable;
                                return (
                                    <td
                                        class={`p-1.5 border border-zinc-300 dark:border-zinc-700 font-medium text-right select-none ${
                                            canEdit ? 'cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-700' : ''
                                        } ${isCellSelected ? 'bg-blue-900/50 text-zinc-200' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'}`}
                                        style={{
                                            outline: isCellSelected ? '2px solid #3b82f6'
                                                : showCompare && isCmpDiff ? '2px solid #14b8a6'
                                                    : isChanged && !showOriginal ? '2px solid #f59e0b' : undefined,
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
                                                class="w-full bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 font-mono text-xs text-right outline-none border border-blue-500 rounded px-1"
                                            />
                                        ) : (
                                            param.yAxis?.labels?.[rowIdx] ?? formatValueConsistent(displayValue, yDecimals)
                                        )}
                                    </td>
                                );
                            })()}
                            {row.map((cell, colIdx) => {
                                const isEditing = editCell?.row === rowIdx && editCell?.col === colIdx;
                                const isChanged = cellChanged(rowIdx, colIdx);
                                const isCmpDiff = cellCompareDiff(rowIdx, colIdx);
                                const isCellSelected = isSelected(rowIdx, colIdx);
                                const displayValue = showCompare && compareTableData?.[rowIdx]?.[colIdx] !== undefined
                                    ? compareTableData[rowIdx][colIdx]
                                    : showOriginal && originalTableData?.[rowIdx]?.[colIdx] !== undefined
                                        ? originalTableData[rowIdx][colIdx]
                                        : cell;
                                const colorMin = showCompare ? cmpMinVal : showOriginal ? origMinVal : minVal;
                                const colorMax = showCompare ? cmpMaxVal : showOriginal ? origMaxVal : maxVal;
                                const bgColor = getCellColor(displayValue, colorMin, colorMax);
                                const highlightCompare = showCompare && isCmpDiff;
                                return (
                                    <td
                                        key={colIdx}
                                        class={`p-1.5 border border-zinc-400 dark:border-zinc-600 text-right cursor-pointer hover:brightness-110 min-w-16 select-none ${
                                            highlightCompare ? 'text-white font-bold'
                                                : isChanged && !showOriginal && !showCompare ? 'text-white font-bold' : 'text-zinc-900'
                                        }`}
                                        style={{
                                            backgroundColor: isEditing ? '#3b82f6'
                                                : highlightCompare
                                                    ? `color-mix(in srgb, ${bgColor} 50%, #0d9488 50%)`
                                                    : isChanged && !showOriginal && !showCompare
                                                        ? `color-mix(in srgb, ${bgColor} 50%, #b45309 50%)`
                                                        : isCellSelected ? `color-mix(in srgb, ${bgColor} 70%, #3b82f6 30%)` : bgColor,
                                            outline: isCellSelected ? '2px solid #3b82f6' : undefined,
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

            {/* 2D Graph for CURVE type */}
            {param.type === 'CURVE' && tableData.length > 0 && tableData[0] && (
                <CurveGraph
                    xData={xAxisData.length > 0 ? xAxisData : Array.from({length: tableData[0].length}, (_, i) => i)}
                    yData={tableData[0]}
                    originalYData={originalTableData ? originalTableData[0] : null}
                    originalXData={originalXAxis}
                    compareYData={compareTableData ? compareTableData[0] : null}
                    compareXData={compareXAxis}
                    xUnit={param.xAxis?.unit || 'X'}
                    yUnit={param.unit || 'Y'}
                />
            )}

            {/* 3D Graph for MAP type */}
            {param.type === 'MAP' && tableData.length > 0 && tableData[0] && (
                <SurfaceGraph
                    xData={xAxisData.length > 0 ? xAxisData : Array.from({length: tableData[0].length}, (_, i) => i)}
                    yData={yAxisData.length > 0 ? yAxisData : Array.from({length: tableData.length}, (_, i) => i)}
                    zData={tableData}
                    originalZData={originalTableData}
                    originalXData={originalXAxis}
                    originalYData={originalYAxis}
                    compareZData={compareTableData}
                    compareXData={compareXAxis}
                    compareYData={compareYAxis}
                    xUnit={param.xAxis?.unit || 'X'}
                    yUnit={param.yAxis?.unit || 'Y'}
                    zUnit={param.unit || 'Z'}
                />
            )}
        </div>
    );
}