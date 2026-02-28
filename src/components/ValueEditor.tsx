import {useState, useEffect, useMemo, useRef} from 'preact/hooks';
import {IDefinitionParameter} from '../types';
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

const DEFAULT_BASE_ADDRESS = 0xa0000000;

export interface CrossCompareInfo {
    data: Uint8Array;
    param: IDefinitionParameter;
    calOffset: number;
    baseAddress: number;
    bigEndian: boolean;
}

interface IValueEditorProps {
    parameter: IDefinitionParameter;
    binData: Uint8Array;
    originalBinData?: Uint8Array | null;
    calOffset?: number;
    baseAddress?: number;
    bigEndian?: boolean;
    onModify: () => void;
    crossCompare?: CrossCompareInfo | null;
}

export function ValueEditor(props: IValueEditorProps) {
    const {parameter} = props
    if (parameter.type === 'VALUE') {
        return <ScalarEditor {...props} />;
    }
    return <TableEditor {...props}/>;
}

function ScalarEditor(props: IValueEditorProps) {
    const {
        parameter,
        binData,
        originalBinData,
        calOffset = 0,
        baseAddress = DEFAULT_BASE_ADDRESS,
        bigEndian = false,
        onModify,
        crossCompare,
    } = props;
    const [value, setValue] = useState(() => readParameterValue(binData, parameter, calOffset, baseAddress, bigEndian));
    const [editing, setEditing] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [overlayMode, setOverlayMode] = useState<'none' | 'original' | 'compare'>('none');

    const originalValue = useMemo(
        () => originalBinData ? readParameterValue(originalBinData, parameter, calOffset, baseAddress, bigEndian) : null,
        [originalBinData, parameter, calOffset, baseAddress, bigEndian]
    );

    const compareValue = useMemo(
        () => crossCompare ? readParameterValue(crossCompare.data, crossCompare.param, crossCompare.calOffset, crossCompare.baseAddress, crossCompare.bigEndian) : null,
        [crossCompare]
    );

    const hasChanged = originalValue !== null && Math.abs(originalValue - value) > 0.0001;
    const hasCompareDiff = compareValue !== null && Math.abs(compareValue - value) > 0.0001;
    const showOriginal = overlayMode === 'original';
    const showCompare = overlayMode === 'compare';
    const isBitmask = parameter.dataType === 'UBYTE' && (/bitmask/i.test(parameter.name) || /bitmask/i.test(parameter.description));
    const isToggle = parameter.dataType === 'UBYTE' && parameter.min === 0 && parameter.max === 1 && !isBitmask
        && /\b(enable|disable|activation switch)\b/i.test(parameter.description || parameter.customName || parameter.name);

    useEffect(() => {
        setValue(readParameterValue(binData, parameter, calOffset, baseAddress, bigEndian));
    }, [parameter, binData, calOffset, baseAddress, bigEndian]);

    const handleDoubleClick = () => {
        setInputValue(formatValue(value, 4));
        setEditing(true);
    };

    const handleConfirm = () => {
        const newValue = parseFloat(inputValue);
        if (!isNaN(newValue)) {
            writeParameterValue(binData, parameter, newValue, calOffset, baseAddress, bigEndian);
            setValue(newValue);
            onModify();
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
        writeParameterValue(binData, parameter, newValue, calOffset, baseAddress, bigEndian);
        setValue(newValue);
        onModify();
    };

    return (
        <div>
            <div class="sticky top-0 z-10 bg-zinc-900 pt-4 pb-2">
                <div class="flex items-start justify-between mb-4">
                    <div>
                        <h2 class="text-lg font-semibold">
                            {parameter.customName || parameter.description || parameter.name}
                        </h2>
                        <code class="text-xs text-zinc-500">{parameter.name}</code>
                    </div>
                    {(originalBinData || crossCompare) && (
                        <div class="flex gap-x-2">
                            {hasChanged && originalBinData && (
                                <button
                                    onClick={() => {
                                        if (originalValue !== null) {
                                            writeParameterValue(binData, parameter, originalValue, calOffset, baseAddress, bigEndian);
                                            setValue(originalValue);
                                            onModify();
                                        }
                                    }}
                                    class="px-3 py-1.5 text-sm rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                                >
                                    Revert
                                </button>
                            )}
                            {originalBinData && (
                                <button
                                    onClick={() => setOverlayMode(overlayMode === 'original' ? 'none' : 'original')}
                                    class={`px-3 py-1.5 text-sm rounded ${
                                        showOriginal ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                                    } ${hasChanged ? 'ring-2 ring-amber-500' : ''}`}
                                >
                                    Original
                                </button>
                            )}
                            {crossCompare && (
                                <button
                                    onClick={() => setOverlayMode(overlayMode === 'compare' ? 'none' : 'compare')}
                                    class={`px-3 py-1.5 text-sm rounded ${
                                        showCompare ? 'bg-teal-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                                    } ${hasCompareDiff ? 'ring-2 ring-teal-500' : ''}`}
                                >
                                    Compare
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div class="flex gap-4 p-3 bg-zinc-800 rounded text-xs text-zinc-400">
                    <span>Address: 0x{parameter.address.toString(16).toUpperCase()}</span>
                    <span>Type: {parameter.dataType}</span>
                    <span>Unit: {parameter.unit || '-'}</span>
                    <span>Range: {parameter.min} - {parameter.max}</span>
                </div>
            </div>

            {isToggle ? (
                <div class="flex items-center gap-4">
                    <button
                        onClick={() => {
                            const newValue = value === 0 ? 1 : 0;
                            writeParameterValue(binData, parameter, newValue, calOffset, baseAddress, bigEndian);
                            setValue(newValue);
                            onModify();
                        }}
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
                    {showCompare && compareValue !== null && (
                        <span class="text-sm text-teal-400">
                            Compare: {compareValue === 1 ? 'Enabled' : 'Disabled'}
                        </span>
                    )}
                </div>
            ) : (
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

                    {originalValue !== null && (
                        <div
                            class="inline-flex items-baseline gap-2 px-6 py-4 bg-zinc-700 rounded-lg border-2 border-dashed border-zinc-600">
                            <span class="text-3xl font-semibold font-mono text-zinc-400">
                                {formatValue(originalValue, 4)}
                            </span>
                            <span class="text-base text-zinc-500">{parameter.unit}</span>
                        </div>
                    )}
                    {showCompare && compareValue !== null && (
                        <div
                            class="inline-flex items-baseline gap-2 px-6 py-4 bg-zinc-700 rounded-lg border-2 border-dashed border-teal-600">
                            <span
                                class={`text-3xl font-semibold font-mono ${hasCompareDiff ? 'text-teal-400' : 'text-zinc-400'}`}>
                                {formatValue(compareValue, 4)}
                            </span>
                            <span class="text-base text-zinc-500">{parameter.unit}</span>
                        </div>
                    )}
                </div>
            )}

            {isBitmask && (
                <div class="mt-4 space-y-2">
                    <div class="inline-flex gap-1">
                        {Array.from({length: 8}, (_, i) => {
                            const rawValue = Math.round(value);
                            const isSet = (rawValue & (1 << i)) !== 0;
                            const origRaw = originalValue !== null ? Math.round(originalValue) : null;
                            const origBit = origRaw !== null ? (origRaw & (1 << i)) !== 0 : null;
                            const bitChanged = origBit !== null && origBit !== isSet;
                            return (
                                <label
                                    key={i}
                                    class={`flex flex-col items-center gap-1 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                                        isSet ? 'bg-green-900/50' : 'bg-zinc-800'
                                    } ${bitChanged ? 'ring-1 ring-amber-500' : ''}`}
                                >
                                    <span class="text-xs font-mono text-zinc-500">{i}</span>
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
                        0x{Math.round(value).toString(16).toUpperCase().padStart(2, '0')} = {Math.round(value).toString(2).padStart(8, '0')}b
                    </div>
                </div>
            )}
        </div>
    );
}

// Logarithmic normalization for better color distribution
// function logNormalize(value: number, min: number, max: number): number {
//     if (min === max) return 0.5;
//     // Shift values to be positive (add offset so min becomes 1)
//     const offset = 1 - min;
//     const logMin = Math.log(min + offset);
//     const logMax = Math.log(max + offset);
//     const logVal = Math.log(value + offset);
//     return Math.max(0, Math.min(1, (logVal - logMin) / (logMax - logMin)));
// }

function linearNormalize(value: number, min: number, max: number): number {
    return (value - min) / (max - min);
}

function getCellColor(value: number, min: number, max: number): string {
    if (value == null || isNaN(value) || min === max) {
        return 'hsl(60, 50%, 75%)';
    }
    // const t = logNormalize(value, min, max);
    const t = linearNormalize(value, min, max);
    // Hue: 120 (green) to 0 (red)
    const hue = (1 - t) * 120;
    return `hsl(${hue}, 65%, 70%)`;
}

interface CurveGraphProps {
    xData: number[];
    yData: number[];
    originalYData?: number[] | null;
    showOriginal: boolean;
    compareYData?: number[] | null;
    compareXData?: number[] | null;
    showCompare: boolean;
    xUnit: string;
    yUnit: string;
}

function CurveGraph({
                        xData,
                        yData,
                        originalYData,
                        showOriginal,
                        compareYData,
                        compareXData,
                        showCompare,
                        xUnit,
                        yUnit
                    }: CurveGraphProps) {
    const width = 1200;
    const height = 500;
    const padding = {top: 20, right: 30, bottom: 50, left: 60};
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    if (xData.length === 0 || yData.length === 0) return null;

    // Calculate ranges
    const xMin = Math.min(...xData);
    const xMax = Math.max(...xData);
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

    // Scale functions
    const scaleX = (val: number) => padding.left + ((val - xMin) / (xMax - xMin || 1)) * plotWidth;
    const scaleY = (val: number) => padding.top + plotHeight - ((val - yMinPadded) / (yMaxPadded - yMinPadded)) * plotHeight;

    // Generate path
    const generatePath = (values: number[]) => {
        return values.map((y, i) => {
            const x = xData[i] ?? i;
            const px = scaleX(x);
            const py = scaleY(y);
            return `${i === 0 ? 'M' : 'L'} ${px} ${py}`;
        }).join(' ');
    };

    // Grid lines
    const xTicks = 5;
    const yTicks = 5;
    const xStep = (xMax - xMin) / xTicks;
    const yStep = (yMaxPadded - yMinPadded) / yTicks;

    return (
        <div class="mt-4 bg-zinc-800 rounded-lg p-4">
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
                            {formatValue(val, 1)}
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
                            {formatValue(val, 1)}
                        </text>
                    );
                })}
                <text x={15} y={padding.top + plotHeight / 2} fill="#71717a" text-anchor="middle"
                      transform={`rotate(-90, 15, ${padding.top + plotHeight / 2})`}>
                    {yUnit}
                </text>

                {/* Original curve (if showing) */}
                {showOriginal && originalYData && (
                    <>
                        <path d={generatePath(originalYData)} fill="none" stroke="#71717a" stroke-width="2"
                              stroke-dasharray="5,5"/>
                        {originalYData.map((y, i) => {
                            const x = xData[i] ?? i;
                            return <circle key={`oc${i}`} cx={scaleX(x)} cy={scaleY(y)} r="3" fill="#71717a"/>;
                        })}
                    </>
                )}

                {/* Compare curve (if showing) */}
                {showCompare && compareYData && (() => {
                    const cmpXData = compareXData && compareXData.length > 0 ? compareXData : xData;
                    return (
                        <>
                            <path d={compareYData.map((y, i) => {
                                const x = cmpXData[i] ?? i;
                                const px = scaleX(x);
                                const py = scaleY(y);
                                return `${i === 0 ? 'M' : 'L'} ${px} ${py}`;
                            }).join(' ')} fill="none" stroke="#14b8a6" stroke-width="2" stroke-dasharray="5,5"/>
                            {compareYData.map((y, i) => {
                                const x = cmpXData[i] ?? i;
                                return <circle key={`cc${i}`} cx={scaleX(x)} cy={scaleY(y)} r="3" fill="#14b8a6"/>;
                            })}
                        </>
                    );
                })()}

                {/* Current curve */}
                <path d={generatePath(yData)} fill="none" stroke="#3b82f6" stroke-width="2"/>
                {yData.map((y, i) => {
                    const x = xData[i] ?? i;
                    return <circle key={`c${i}`} cx={scaleX(x)} cy={scaleY(y)} r="4" fill="#3b82f6"/>;
                })}
            </svg>

            {(showOriginal && originalYData || showCompare && compareYData) && (
                <div class="flex gap-4 mt-2 text-xs text-zinc-400">
          <span class="flex items-center gap-1">
            <span class="w-4 h-0.5 bg-blue-500 inline-block"></span> Aktuell
          </span>
                    {showOriginal && originalYData && (
                        <span class="flex items-center gap-1">
            <span class="w-4 h-0.5 bg-zinc-500 inline-block"
                  style="background: repeating-linear-gradient(90deg, #71717a 0, #71717a 4px, transparent 4px, transparent 8px)"></span> Original
          </span>
                    )}
                    {showCompare && compareYData && (
                        <span class="flex items-center gap-1">
            <span class="w-4 h-0.5 inline-block"
                  style="background: repeating-linear-gradient(90deg, #14b8a6 0, #14b8a6 4px, transparent 4px, transparent 8px)"></span> Compare
          </span>
                    )}
                </div>
            )}
        </div>
    );
}

interface SurfaceGraphProps {
    xData: number[];
    yData: number[];
    zData: number[][];
    originalZData?: number[][] | null;
    showOriginal: boolean;
    compareZData?: number[][] | null;
    compareXData?: number[] | null;
    compareYData?: number[] | null;
    showCompare: boolean;
    xUnit: string;
    yUnit: string;
    zUnit: string;
}

function SurfaceGraph({
                          xData,
                          yData,
                          zData,
                          originalZData,
                          showOriginal,
                          compareZData,
                          showCompare,
                          xUnit,
                          yUnit,
                          zUnit
                      }: SurfaceGraphProps) {
    const [rotation, setRotation] = useState(45);
    const [tilt, setTilt] = useState(-20);
    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useRef<{ x: number; y: number; rotation: number; tilt: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Mouse drag handlers
    const handleMouseDown = (e: MouseEvent) => {
        setIsDragging(true);
        dragStart.current = {x: e.clientX, y: e.clientY, rotation, tilt};
        e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging || !dragStart.current) return;
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        // Horizontal drag = rotation, vertical drag = tilt (down = tilt down)
        setRotation((dragStart.current.rotation + dx * 0.5) % 360);
        setTilt(Math.max(-60, Math.min(60, dragStart.current.tilt + dy * 0.3)));
    };

    const handleMouseUp = () => {
        setIsDragging(false);
        dragStart.current = null;
    };

    // Attach global mouse events when dragging
    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isDragging]);

    if (zData.length === 0 || zData[0].length === 0) return null;

    // Determine overlay data
    const overlayZ = showCompare && compareZData ? compareZData
        : showOriginal && originalZData ? originalZData
            : null;
    const overlayLabel = showCompare ? 'Compare' : showOriginal ? 'Original' : null;

    const rows = zData.length;
    const cols = zData[0].length;

    // Aspect ratio based on data dimensions
    const baseSize = 600;
    const aspectRatio = cols / rows;
    const width = aspectRatio >= 1 ? baseSize * Math.min(aspectRatio, 2) : baseSize;
    const height = aspectRatio < 1 ? baseSize / Math.max(aspectRatio, 0.5) : baseSize;
    const centerX = width / 2;
    const centerY = height / 2 + 100;

    // Calculate Z range (include overlay for consistent scale)
    const allZ = [...zData.flat(), ...(overlayZ ? overlayZ.flat() : [])];
    const zMin = Math.min(...allZ);
    const zMax = Math.max(...allZ);

    // Normalize data to 0-1 range
    const normalize = (val: number, min: number, max: number) => (max - min) ? (val - min) / (max - min) : 0.5;

    // 3D to 2D projection with rotation (isometric, square cells)
    const project = (x: number, y: number, z: number) => {
        const scale = Math.min(width, height) * 0.4;
        const radRot = (rotation * Math.PI) / 180;
        const radTilt = (tilt * Math.PI) / 180;

        // Rotate around Z axis
        const rx = x * Math.cos(radRot) - y * Math.sin(radRot);
        const ry = x * Math.sin(radRot) + y * Math.cos(radRot);

        // Apply tilt (rotation around X axis)
        const ty = ry * Math.cos(radTilt) - z * Math.sin(radTilt);
        const tz = ry * Math.sin(radTilt) + z * Math.cos(radTilt);

        // Project to 2D - same scale for X and Y to keep cells square
        return {
            x: centerX + rx * scale,
            y: centerY - ty * scale - tz * scale * 0.8,
            depth: tz
        };
    };

    // Generate grid points
    const points: { x: number; y: number; depth: number; row: number; col: number; z: number }[][] = [];
    for (let r = 0; r < rows; r++) {
        points[r] = [];
        for (let c = 0; c < cols; c++) {
            const nx = normalize(c, 0, cols - 1) - 0.5;
            const ny = normalize(r, 0, rows - 1) - 0.5;
            const nz = normalize(zData[r][c], zMin, zMax);
            const p = project(nx, ny, nz);
            points[r][c] = {...p, row: r, col: c, z: zData[r][c]};
        }
    }

    // Generate all quads in a flat list with projected depth for sorting.
    // Each quad carries its own depth from its own projected corners.
    type Quad = { path: string; depth: number; color: string; opacity: number };
    const quads: Quad[] = [];

    // Build overlay points once if needed
    let oPoints: { x: number; y: number; depth: number }[][] | null = null;
    if (overlayZ) {
        const oRows = overlayZ.length;
        const oCols = overlayZ[0].length;
        oPoints = [];
        for (let r = 0; r < oRows; r++) {
            oPoints[r] = [];
            for (let c = 0; c < oCols; c++) {
                const nx = normalize(c, 0, oCols - 1) - 0.5;
                const ny = normalize(r, 0, oRows - 1) - 0.5;
                const nz = normalize(overlayZ[r][c], zMin, zMax);
                oPoints[r][c] = project(nx, ny, nz);
            }
        }
    }

    for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
            // Main quad
            const p1 = points[r][c];
            const p2 = points[r][c + 1];
            const p3 = points[r + 1][c + 1];
            const p4 = points[r + 1][c];
            const mainZ = (zData[r][c] + zData[r][c + 1] + zData[r + 1][c + 1] + zData[r + 1][c]) / 4;
            // const mainT = logNormalize(mainZ, zMin, zMax);
            const mainT = linearNormalize(mainZ, zMin, zMax);
            const hue = (1 - mainT) * 120;
            const mainDepth = (p1.depth + p2.depth + p3.depth + p4.depth) / 4;
            const mainPath = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y} L ${p4.x} ${p4.y} Z`;
            quads.push({path: mainPath, depth: mainDepth, color: `hsl(${hue}, 70%, 50%)`, opacity: 0.7});

            // Overlay quad at same grid cell
            if (overlayZ && oPoints && r < overlayZ.length - 1 && c < overlayZ[0].length - 1) {
                const op1 = oPoints[r][c];
                const op2 = oPoints[r][c + 1];
                const op3 = oPoints[r + 1][c + 1];
                const op4 = oPoints[r + 1][c];
                const ovZ = (overlayZ[r][c] + overlayZ[r][c + 1] + overlayZ[r + 1][c + 1] + overlayZ[r + 1][c]) / 4;
                // const ovT = logNormalize(ovZ, zMin, zMax);
                const ovT = linearNormalize(ovZ, zMin, zMax);
                const ovColor = showCompare
                    ? `hsl(174, 60%, ${75 - ovT * 45}%)`
                    : `hsl(0, 0%, ${75 - ovT * 45}%)`;
                const ovDepth = (op1.depth + op2.depth + op3.depth + op4.depth) / 4;
                const ovPath = `M ${op1.x} ${op1.y} L ${op2.x} ${op2.y} L ${op3.x} ${op3.y} L ${op4.x} ${op4.y} Z`;
                quads.push({path: ovPath, depth: ovDepth, color: ovColor, opacity: 0.55});
            }
        }
    }

    // Sort all quads back-to-front by their own projected depth
    quads.sort((a, b) => a.depth - b.depth);

    // Generate wireframe — flat list, each line uses its own projected depth
    type WireLine = { x1: number; y1: number; x2: number; y2: number; depth: number; stroke: string };
    const lines: WireLine[] = [];
    const mainStroke = 'rgba(0,0,0,0.3)';
    const overlayStroke = showCompare ? 'rgba(0,80,70,0.4)' : 'rgba(0,0,0,0.3)';

    // Main wireframe
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols - 1; c++) {
            const p1 = points[r][c], p2 = points[r][c + 1];
            lines.push({x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, depth: (p1.depth + p2.depth) / 2, stroke: mainStroke});
        }
    }
    for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols; c++) {
            const p1 = points[r][c], p2 = points[r + 1][c];
            lines.push({x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, depth: (p1.depth + p2.depth) / 2, stroke: mainStroke});
        }
    }
    // Overlay wireframe
    if (oPoints && overlayZ) {
        const oRows = overlayZ.length, oCols = overlayZ[0].length;
        for (let r = 0; r < oRows; r++) {
            for (let c = 0; c < oCols - 1; c++) {
                const p1 = oPoints[r][c], p2 = oPoints[r][c + 1];
                lines.push({
                    x1: p1.x,
                    y1: p1.y,
                    x2: p2.x,
                    y2: p2.y,
                    depth: (p1.depth + p2.depth) / 2,
                    stroke: overlayStroke
                });
            }
        }
        for (let r = 0; r < oRows - 1; r++) {
            for (let c = 0; c < oCols; c++) {
                const p1 = oPoints[r][c], p2 = oPoints[r + 1][c];
                lines.push({
                    x1: p1.x,
                    y1: p1.y,
                    x2: p2.x,
                    y2: p2.y,
                    depth: (p1.depth + p2.depth) / 2,
                    stroke: overlayStroke
                });
            }
        }
    }
    lines.sort((a, b) => a.depth - b.depth);

    // Axis lines
    const origin = project(-0.6, -0.6, 0);
    const xEnd = project(0.6, -0.6, 0);
    const yEnd = project(-0.6, 0.6, 0);
    const zEnd = project(-0.6, -0.6, 1.2);

    // Generate axis ticks from actual data values
    const xTicks = xData.map((val, i) => {
        const t = cols > 1 ? i / (cols - 1) : 0.5;
        const pos = project(-0.5 + t, -0.6, 0);
        return {val, pos};
    });
    const yTicks = yData.map((val, i) => {
        const t = rows > 1 ? i / (rows - 1) : 0.5;
        const pos = project(-0.6, -0.5 + t, 0);
        return {val, pos};
    });
    // Z axis: show 5 ticks for the value range
    const numZTicks = 5;
    const zTicks = Array.from({length: numZTicks}, (_, i) => {
        const t = i / (numZTicks - 1);
        const val = zMin + t * (zMax - zMin);
        const pos = project(-0.6, -0.6, t);
        return {val, pos};
    });


    const zDecimals = useMemo(() => getConsistentDecimals(zTicks.map(({val}) => val), 2), [zTicks]);
    const xDecimals = useMemo(() => getConsistentDecimals(xTicks.map(({val}) => val), 2), [xTicks]);
    const yDecimals = useMemo(() => getConsistentDecimals(yTicks.map(({val}) => val), 2), [yTicks]);

    return (
        <div ref={containerRef} class="mt-4 bg-zinc-800 rounded-lg p-4">
            <svg
                viewBox={`0 0 ${width} ${height}`}
                class="w-full font-mono text-xs select-none"
                style={{maxHeight: '70vh', cursor: isDragging ? 'move' : 'move'}}
                preserveAspectRatio="xMidYMid meet"
                onMouseDown={handleMouseDown}
            >
                {/* Filled quads (main + overlay depth-sorted together) */}
                {quads.map((q, i) => (
                    <path key={`q${i}`} d={q.path} fill={q.color} fill-opacity={q.opacity} stroke="none"/>
                ))}

                {/* Wireframe (main + overlay depth-sorted together) */}
                {lines.map((l, i) => (
                    <line
                        key={`l${i}`}
                        x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                        stroke={l.stroke}
                        stroke-width="0.5"
                    />
                ))}

                {/* Axes */}
                <line x1={origin.x} y1={origin.y} x2={xEnd.x} y2={xEnd.y} stroke="#ef4444" stroke-width="2"/>
                <line x1={origin.x} y1={origin.y} x2={yEnd.x} y2={yEnd.y} stroke="#22c55e" stroke-width="2"/>
                <line x1={origin.x} y1={origin.y} x2={zEnd.x} y2={zEnd.y} stroke="#3b82f6" stroke-width="2"/>

                {/* X axis ticks and values */}
                {xTicks.map((tick, i) => (
                    <g key={`xt${i}`}>
                        <line x1={tick.pos.x} y1={tick.pos.y} x2={tick.pos.x} y2={tick.pos.y + 6} stroke="#ef4444"
                              stroke-width="1"/>
                        <text x={tick.pos.x} y={tick.pos.y + 18} fill="#a1a1aa" font-size="9" text-anchor="middle">
                            {formatValueConsistent(tick.val, xDecimals)}
                        </text>
                    </g>
                ))}

                {/* Y axis ticks and values */}
                {yTicks.map((tick, i) => (
                    <g key={`yt${i}`}>
                        <line x1={tick.pos.x} y1={tick.pos.y} x2={tick.pos.x - 6} y2={tick.pos.y} stroke="#22c55e"
                              stroke-width="1"/>
                        <text x={tick.pos.x - 10} y={tick.pos.y + 3} fill="#a1a1aa" font-size="9" text-anchor="end">
                            {formatValueConsistent(tick.val, yDecimals)}
                        </text>
                    </g>
                ))}

                {/* Z axis ticks and values */}
                {zTicks.map((tick, i) => (
                    <g key={`zt${i}`}>
                        <line x1={tick.pos.x} y1={tick.pos.y} x2={tick.pos.x - 6} y2={tick.pos.y} stroke="#3b82f6"
                              stroke-width="1"/>
                        <text x={tick.pos.x - 10} y={tick.pos.y + 3} fill="#a1a1aa" font-size="9" text-anchor="end">
                            {formatValueConsistent(tick.val, zDecimals)}
                        </text>
                    </g>
                ))}

                {/* Axis labels */}
                <text x={xEnd.x + 10} y={xEnd.y} fill="#ef4444" font-size="11">{xUnit || 'X'}</text>
                <text x={yEnd.x - 10 - (11 * (yUnit || "Y").length / 2)} y={yEnd.y} fill="#22c55e"
                      font-size="11">{yUnit || 'Y'}</text>
                <text x={zEnd.x - 5} y={zEnd.y - 5} fill="#3b82f6" font-size="11">{zUnit || 'Z'}</text>
            </svg>

            {/* Color legend */}
            <div class="flex items-center gap-2 mt-2 text-xs text-zinc-400">
                <span>{formatValue(zMin, 1)}</span>
                <div class="w-32 h-3 rounded"
                     style="background: linear-gradient(90deg, hsl(120,70%,50%), hsl(60,70%,50%), hsl(0,70%,50%))"></div>
                <span>{formatValue(zMax, 1)}</span>
                <span class="ml-2 text-zinc-500">{zUnit}</span>
                {overlayLabel && (
                    <span class="ml-4 flex items-center gap-1">
                        <span class="w-8 h-3 rounded inline-block" style={{
                            background: showCompare
                                ? 'linear-gradient(90deg, hsl(174,60%,75%), hsl(174,60%,45%), hsl(174,60%,30%))'
                                : 'linear-gradient(90deg, hsl(0,0%,75%), hsl(0,0%,55%), hsl(0,0%,30%))',
                        }}></span>
                        {overlayLabel}
                    </span>
                )}
            </div>
        </div>
    );
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

function TableEditor({
                         parameter,
                         binData,
                         originalBinData,
                         calOffset = 0,
                         baseAddress = DEFAULT_BASE_ADDRESS,
                         bigEndian = false,
                         onModify,
                         crossCompare,
                     }: IValueEditorProps) {
    const [tableData, setTableData] = useState<number[][]>([]);
    const [editCell, setEditCell] = useState<{ row: number; col: number } | null>(null);
    const [editAxisCell, setEditAxisCell] = useState<{ axis: 'x' | 'y'; index: number } | null>(null);
    const [inputValue, setInputValue] = useState('');
    const [overlayMode, setOverlayMode] = useState<'none' | 'original' | 'compare'>('none');
    const [xAxisData, setXAxisData] = useState<number[]>([]);
    const [yAxisData, setYAxisData] = useState<number[]>([]);

    // Selection state
    const [selection, setSelection] = useState<Selection | null>(null);
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectionAnchor, setSelectionAnchor] = useState<{ row: number; col: number } | null>(null);
    const [modifyValue, setModifyValue] = useState('');
    const [showModifyInput, setShowModifyInput] = useState<'add' | 'multiply' | 'set' | null>(null);
    const modifyInputRef = useRef<HTMLInputElement>(null);

    // Focus modify input when it becomes visible
    useEffect(() => {
        if (showModifyInput && modifyInputRef.current) {
            modifyInputRef.current.focus();
        }
    }, [showModifyInput]);

    // Axis selection state
    const [axisSelection, setAxisSelection] = useState<{ axis: 'x' | 'y'; start: number; end: number } | null>(null);
    const [isAxisSelecting, setIsAxisSelecting] = useState(false);
    const [axisSelectionAnchor, setAxisSelectionAnchor] = useState<{ axis: 'x' | 'y'; index: number } | null>(null);

    const originalTableData = useMemo(
        () => originalBinData ? readTableData(originalBinData, parameter, calOffset, baseAddress, bigEndian) : null,
        [originalBinData, parameter, calOffset, baseAddress, bigEndian]
    );

    const originalXAxis = useMemo(
        () => originalBinData && parameter.xAxis ? readAxisData(originalBinData, parameter.xAxis, calOffset, baseAddress, bigEndian) : null,
        [originalBinData, parameter, calOffset, baseAddress, bigEndian]
    );

    const originalYAxis = useMemo(
        () => originalBinData && parameter.yAxis ? readAxisData(originalBinData, parameter.yAxis, calOffset, baseAddress, bigEndian) : null,
        [originalBinData, parameter, calOffset, baseAddress, bigEndian]
    );

    const compareTableData = useMemo(
        () => crossCompare ? readTableData(crossCompare.data, crossCompare.param, crossCompare.calOffset, crossCompare.baseAddress, crossCompare.bigEndian) : null,
        [crossCompare]
    );

    const compareXAxis = useMemo(
        () => crossCompare?.param.xAxis ? readAxisData(crossCompare.data, crossCompare.param.xAxis, crossCompare.calOffset, crossCompare.baseAddress, crossCompare.bigEndian) : null,
        [crossCompare]
    );

    const compareYAxis = useMemo(
        () => crossCompare?.param.yAxis ? readAxisData(crossCompare.data, crossCompare.param.yAxis, crossCompare.calOffset, crossCompare.baseAddress, crossCompare.bigEndian) : null,
        [crossCompare]
    );

    const showOriginal = overlayMode === 'original';
    const showCompare = overlayMode === 'compare';

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

    // These are used for initial loading only
    const xAxis = useMemo(
        () => (parameter.xAxis ? readAxisData(binData, parameter.xAxis, calOffset, baseAddress, bigEndian) : []),
        [parameter, binData, calOffset, baseAddress, bigEndian]
    );

    const yAxis = useMemo(
        () => (parameter.yAxis ? readAxisData(binData, parameter.yAxis, calOffset, baseAddress, bigEndian) : []),
        [parameter, binData, calOffset, baseAddress, bigEndian]
    );

    // Initialize axis data state
    useEffect(() => {
        setXAxisData(xAxis);
        setYAxisData(yAxis);
    }, [xAxis, yAxis]);

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

    // Consistent decimal places for each group
    const xDecimals = useMemo(() => getConsistentDecimals(xAxisData, 2), [xAxisData]);
    const yDecimals = useMemo(() => getConsistentDecimals(yAxisData, 2), [yAxisData]);
    const dataDecimals = useMemo(() => getConsistentDecimals(tableData.flat(), 2), [tableData]);

    useEffect(() => {
        setTableData(readTableData(binData, parameter, calOffset, baseAddress, bigEndian));
    }, [parameter, binData, calOffset, baseAddress, bigEndian]);

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
                writeTableCell(binData, parameter, editCell.row, editCell.col, newValue, calOffset, baseAddress, bigEndian);
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
                    writeAxisValue(binData, axisDef, editAxisCell.index, newValue, calOffset, baseAddress, bigEndian);
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

    // Check if a compare cell differs from current
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

    // Axis selection handlers
    const handleAxisMouseDown = (axis: 'x' | 'y', index: number, e: MouseEvent) => {
        // Clear table selection when selecting axis
        setSelection(null);
        setSelectionAnchor(null);

        if (e.shiftKey && axisSelectionAnchor && axisSelectionAnchor.axis === axis) {
            // Extend selection from anchor
            setAxisSelection({axis, start: axisSelectionAnchor.index, end: index});
        } else {
            // Start new selection
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

    // Copy selection to clipboard
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

    // Paste from clipboard
    const pasteSelection = async () => {
        if (axisSelection) {
            try {
                const text = await navigator.clipboard.readText();
                const values = text.trim().split(/[\t\n]/).map(v => parseFloat(v.trim()));
                const axisDef = axisSelection.axis === 'x' ? parameter.xAxis : parameter.yAxis;
                if (!axisDef?.address) return;
                const axisData = axisSelection.axis === 'x' ? xAxisData : yAxisData;
                const setAxisData = axisSelection.axis === 'x' ? setXAxisData : setYAxisData;
                const newAxisData = [...axisData];
                const start = Math.min(axisSelection.start, axisSelection.end);
                for (let i = 0; i < values.length && start + i < axisData.length; i++) {
                    if (!isNaN(values[i])) {
                        writeAxisValue(binData, axisDef, start + i, values[i], calOffset, baseAddress, bigEndian);
                        newAxisData[start + i] = values[i];
                    }
                }
                setAxisData(newAxisData);
                onModify();
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
            for (let r = 0; r < rows.length && norm.startRow + r < tableData.length; r++) {
                for (let c = 0; c < rows[r].length && norm.startCol + c < tableData[0].length; c++) {
                    const value = rows[r][c];
                    if (!isNaN(value)) {
                        const targetRow = norm.startRow + r;
                        const targetCol = norm.startCol + c;
                        writeTableCell(binData, parameter, targetRow, targetCol, value, calOffset, baseAddress, bigEndian);
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
                writeAxisValue(binData, axisDef, i, newValue, calOffset, baseAddress, bigEndian);
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
                writeTableCell(binData, parameter, r, c, newValue, calOffset, baseAddress, bigEndian);
                newData[r][c] = newValue;
            }
        }
        setTableData(newData);
        onModify();
        setShowModifyInput(null);
        setModifyValue('');
    };

    // Keyboard handler for copy/paste and selection editing
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
            // Enter key opens set input when cells are selected
            if (e.key === 'Enter' && (selection || axisSelection) && !editCell && !editAxisCell && !showModifyInput) {
                e.preventDefault();
                setShowModifyInput('set');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [selection, axisSelection, tableData, editCell, editAxisCell, showModifyInput]);

    return (
        <div>
            <div class="sticky top-0 z-10 bg-zinc-900 pt-4 pb-2">
                <div class="flex items-start justify-between mb-4">
                    <div>
                        <h2 class="text-lg font-semibold">
                            {parameter.customName || parameter.description || parameter.name}
                        </h2>
                        <code class="text-xs text-zinc-500">{parameter.name}</code>
                    </div>
                    {(originalBinData || crossCompare) && (
                        <div class="flex gap-x-2">
                            {hasChanged && originalBinData &&
                                <button class="px-3 py-1.5 text-sm rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                                        onClick={() => {
                                            if (!originalTableData) return;
                                            for (let r = 0; r < originalTableData.length; r++) {
                                                for (let c = 0; c < originalTableData[r].length; c++) {
                                                    writeTableCell(binData, parameter, r, c, originalTableData[r][c], calOffset, baseAddress, bigEndian);
                                                }
                                            }
                                            if (originalXAxis && parameter.xAxis) {
                                                for (let i = 0; i < originalXAxis.length; i++) {
                                                    writeAxisValue(binData, parameter.xAxis, i, originalXAxis[i], calOffset, baseAddress, bigEndian);
                                                }
                                            }
                                            if (originalYAxis && parameter.yAxis) {
                                                for (let i = 0; i < originalYAxis.length; i++) {
                                                    writeAxisValue(binData, parameter.yAxis, i, originalYAxis[i], calOffset, baseAddress, bigEndian);
                                                }
                                            }
                                            setTableData(originalTableData.map(row => [...row]));
                                            if (originalXAxis) setXAxisData([...originalXAxis]);
                                            if (originalYAxis) setYAxisData([...originalYAxis]);
                                            onModify();
                                        }}>
                                    Revert
                                </button>}
                            {originalBinData && (
                                <button
                                    onClick={() => setOverlayMode(overlayMode === 'original' ? 'none' : 'original')}
                                    class={`px-3 py-1.5 text-sm rounded ${
                                        showOriginal ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                                    } ${hasChanged ? 'ring-2 ring-amber-500' : ''}`}
                                >
                                    Original
                                </button>
                            )}
                            {crossCompare && (
                                <button
                                    onClick={() => setOverlayMode(overlayMode === 'compare' ? 'none' : 'compare')}
                                    class={`px-3 py-1.5 text-sm rounded ${
                                        showCompare ? 'bg-teal-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                                    } ${hasCompareDiff ? 'ring-2 ring-teal-500' : ''}`}
                                >
                                    Compare
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div class="flex flex-wrap items-center gap-4 p-3 bg-zinc-800 rounded text-xs text-zinc-400">
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
                                            onClick={() => {
                                                setShowModifyInput(null);
                                                setModifyValue('');
                                            }}
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
            </div>

            <div class="overflow-auto max-h-[calc(100vh-200px)]">
                <table class="border-collapse font-mono text-xs table-fixed">
                    <colgroup>
                        {yAxisData.length > 0 && <col class="w-12"/>}
                        {yAxisData.length > 0 && <col class="w-16"/>}
                        {Array.from({length: parameter.cols || 1}).map((_, i) => (
                            <col key={i} class="w-16"/>
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
                                const isCmpDiff = xAxisCompareDiff(i);
                                const isCellSelected = isAxisSelected('x', i);
                                const displayValue = showCompare && compareXAxis ? compareXAxis[i]
                                    : showOriginal && originalXAxis ? originalXAxis[i] : val;
                                const canEdit = parameter.xAxis?.address;
                                return (
                                    <th
                                        key={i}
                                        class={`p-1.5 border border-zinc-700 font-medium text-right select-none ${
                                            canEdit ? 'cursor-pointer hover:bg-zinc-700' : ''
                                        } ${isCellSelected ? 'bg-blue-900/50 text-zinc-200' : 'bg-zinc-800 text-zinc-400'}`}
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
                                                class="w-full bg-zinc-700 text-zinc-100 font-mono text-xs text-right outline-none border border-blue-500 rounded px-1"
                                            />
                                        ) : (
                                            formatValueConsistent(displayValue, xDecimals)
                                        )}
                                    </th>
                                );
                            })
                            : Array.from({length: parameter.cols || 1}).map((_, i) => (
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
                                    style={{writingMode: 'vertical-rl', transform: 'rotate(180deg)'}}
                                >
                                    {parameter.yAxis?.unit || 'Y'} ↓
                                </td>
                            )}
                            {yAxisData.length > 0 && (() => {
                                const isEditing = editAxisCell?.axis === 'y' && editAxisCell?.index === rowIdx;
                                const isChanged = yAxisChanged(rowIdx);
                                const isCmpDiff = yAxisCompareDiff(rowIdx);
                                const isCellSelected = isAxisSelected('y', rowIdx);
                                const displayValue = showCompare && compareYAxis ? compareYAxis[rowIdx]
                                    : showOriginal && originalYAxis ? originalYAxis[rowIdx] : yAxisData[rowIdx];
                                const canEdit = parameter.yAxis?.address;
                                return (
                                    <td
                                        class={`p-1.5 border border-zinc-700 font-medium text-right select-none ${
                                            canEdit ? 'cursor-pointer hover:bg-zinc-700' : ''
                                        } ${isCellSelected ? 'bg-blue-900/50 text-zinc-200' : 'bg-zinc-800 text-zinc-400'}`}
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
                                        class={`p-1.5 border border-zinc-600 text-right cursor-pointer hover:brightness-110 min-w-16 select-none ${
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
            {parameter.type === 'CURVE' && tableData.length > 0 && tableData[0] && (
                <CurveGraph
                    xData={xAxisData.length > 0 ? xAxisData : Array.from({length: tableData[0].length}, (_, i) => i)}
                    yData={tableData[0]}
                    originalYData={showOriginal && originalTableData ? originalTableData[0] : null}
                    showOriginal={showOriginal}
                    compareYData={compareTableData ? compareTableData[0] : null}
                    compareXData={compareXAxis}
                    showCompare={showCompare}
                    xUnit={parameter.xAxis?.unit || 'X'}
                    yUnit={parameter.unit || 'Y'}
                />
            )}

            {/* 3D Graph for MAP type */}
            {parameter.type === 'MAP' && tableData.length > 0 && tableData[0] && (
                <SurfaceGraph
                    xData={xAxisData.length > 0 ? xAxisData : Array.from({length: tableData[0].length}, (_, i) => i)}
                    yData={yAxisData.length > 0 ? yAxisData : Array.from({length: tableData.length}, (_, i) => i)}
                    zData={tableData}
                    originalZData={originalTableData}
                    showOriginal={showOriginal}
                    compareZData={compareTableData}
                    compareXData={compareXAxis}
                    compareYData={compareYAxis}
                    showCompare={showCompare}
                    xUnit={parameter.xAxis?.unit || 'X'}
                    yUnit={parameter.yAxis?.unit || 'Y'}
                    zUnit={parameter.unit || 'Z'}
                />
            )}
        </div>
    );
}
