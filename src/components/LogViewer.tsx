import { useState, useMemo, useRef, useEffect } from 'preact/hooks';
import { createPortal } from 'preact/compat';

// Left axis: warm colors (distinct)
const COLORS_LEFT = [
    "#ff6b6b", // red
    "#ffb86b", // orange
    "#ff6bb3", // pink
    "#e85d04", // dark orange
    "#c9184a", // magenta-red
];

// Right axis: cool colors (blues, greens, purples)
const COLORS_RIGHT = [
    "#6bd1ff", // light blue
    "#6b8cff", // blue
    "#6bffe0", // turquoise
    "#6bff8e", // green
    "#b26bff", // purple
];

// Simple moving average smoothing
function smoothData(values: number[], windowSize: number): number[] {
    if (windowSize <= 1) return values;
    const half = Math.floor(windowSize / 2);
    return values.map((_, i) => {
        let sum = 0;
        let count = 0;
        for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
            sum += values[j];
            count++;
        }
        return sum / count;
    });
}

interface CSVViewerProps {
    text: string;
}

function CSVViewer({ text }: CSVViewerProps) {
    const [index, setIndex] = useState<number>(0);
    const [showFields, setShowFields] = useState<string[]>([]);
    const [zoom, setZoom] = useState<number>(1);
    const [scrollOffset, setScrollOffset] = useState<number>(0);
    const [isHovering, setIsHovering] = useState<boolean>(false);
    const [smoothing, setSmoothing] = useState<number>(5); // Window size for smoothing (1 = off)
    const popupRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [initialized, setInitialized] = useState(false);

    const { fields, data } = useMemo(() => {
        const lines = text.split("\n").filter(line => line.trim());
        if (lines.length === 0) return { fields: [], data: [] };

        const [header, ...dataLines] = lines;
        const fields = header.split(",").map((field) => field.trim());

        const data = dataLines.map((line) =>
            line.split(",").map((col) => {
                const value = Number(col.trim());
                return isNaN(value) ? 0 : value;
            })
        );

        return { fields, data };
    }, [text]);

    // Auto-select some fields on first load
    useMemo(() => {
        if (!initialized && fields.length > 0) {
            const defaultFields = fields.filter(f =>
                f.toLowerCase().includes('speed') ||
                f.toLowerCase().includes('rpm') ||
                f.toLowerCase().includes('torque') ||
                f.toLowerCase().includes('hp') ||
                f.toLowerCase().includes('boost') ||
                f.toLowerCase().includes('throttle')
            ).slice(0, 5);

            if (defaultFields.length > 0) {
                setShowFields(defaultFields);
            } else {
                setShowFields(fields.slice(0, Math.min(5, fields.length)));
            }
            setInitialized(true);
        }
    }, [fields, initialized]);

    // Find time column index
    const timeColumnIndex = useMemo(() => {
        const timeNames = ['time', 'zeit', 'timestamp', 't'];
        for (let i = 0; i < fields.length; i++) {
            if (timeNames.includes(fields[i].toLowerCase())) {
                return i;
            }
        }
        return -1;
    }, [fields]);

    // Calculate min/max for each field and determine axis grouping
    const { leftAxis, rightAxis, fieldToAxis } = useMemo(() => {
        const fieldRanges: { field: string; min: number; max: number }[] = [];

        showFields.forEach((field) => {
            const fieldIndex = fields.indexOf(field);
            if (fieldIndex !== -1) {
                let min = Infinity;
                let max = -Infinity;
                data.forEach((row) => {
                    const value = row[fieldIndex];
                    if (!isNaN(value)) {
                        if (value > max) max = value;
                        if (value < min) min = value;
                    }
                });
                if (min !== Infinity && max !== -Infinity) {
                    fieldRanges.push({ field, min, max });
                }
            }
        });

        if (fieldRanges.length === 0) {
            return {
                leftAxis: { min: 0, max: 100, fields: [] as string[] },
                rightAxis: { min: 0, max: 100, fields: [] as string[] },
                fieldToAxis: {} as Record<string, 'left' | 'right'>
            };
        }

        // Sort by max value
        fieldRanges.sort((a, b) => a.max - b.max);

        const smallestMax = fieldRanges[0].max;
        const largestMax = fieldRanges[fieldRanges.length - 1].max;

        // If ratio > 3x, split into two groups
        const needsDualAxis = largestMax / Math.max(smallestMax, 0.001) > 3;

        const fieldToAxis: Record<string, 'left' | 'right'> = {};
        let leftFields: typeof fieldRanges = [];
        let rightFields: typeof fieldRanges = [];

        if (needsDualAxis) {
            // Find split point - fields with max > median go to right
            const medianMax = fieldRanges[Math.floor(fieldRanges.length / 2)].max;
            const threshold = medianMax * 2;

            fieldRanges.forEach((fr) => {
                if (fr.max > threshold) {
                    rightFields.push(fr);
                    fieldToAxis[fr.field] = 'right';
                } else {
                    leftFields.push(fr);
                    fieldToAxis[fr.field] = 'left';
                }
            });

            // If all ended up on one side, rebalance
            if (leftFields.length === 0) {
                leftFields = rightFields.splice(0, Math.ceil(rightFields.length / 2));
                leftFields.forEach(fr => fieldToAxis[fr.field] = 'left');
            } else if (rightFields.length === 0) {
                rightFields = leftFields.splice(Math.floor(leftFields.length / 2));
                rightFields.forEach(fr => fieldToAxis[fr.field] = 'right');
            }
        } else {
            leftFields = fieldRanges;
            fieldRanges.forEach(fr => fieldToAxis[fr.field] = 'left');
        }

        const calcAxis = (ranges: typeof fieldRanges) => {
            if (ranges.length === 0) return { min: 0, max: 100, fields: [] as string[] };
            let min = Math.min(...ranges.map(r => r.min));
            let max = Math.max(...ranges.map(r => r.max));
            if (min === max) { min -= 1; max += 1; }
            const range = max - min;
            const padding = range * 0.05;
            return {
                min: min - padding,
                max: max + padding,
                fields: ranges.map(r => r.field)
            };
        };

        return {
            leftAxis: calcAxis(leftFields),
            rightAxis: calcAxis(rightFields),
            fieldToAxis
        };
    }, [data, fields, showFields]);

    // Combined min/max for preview
    const { min, max } = useMemo(() => {
        const allMin = Math.min(leftAxis.min, rightAxis.fields.length > 0 ? rightAxis.min : leftAxis.min);
        const allMax = Math.max(leftAxis.max, rightAxis.fields.length > 0 ? rightAxis.max : leftAxis.max);
        return { min: allMin, max: allMax };
    }, [leftAxis, rightAxis]);

    // Get color for a field based on its axis
    const getFieldColor = (field: string): string => {
        const axis = fieldToAxis[field];
        if (axis === 'right') {
            const idxInAxis = rightAxis.fields.indexOf(field);
            return COLORS_RIGHT[idxInAxis % COLORS_RIGHT.length];
        } else {
            const idxInAxis = leftAxis.fields.indexOf(field);
            return COLORS_LEFT[idxInAxis % COLORS_LEFT.length];
        }
    };

    // Precompute smoothed data for each shown field
    const smoothedData = useMemo(() => {
        const result: Record<string, number[]> = {};
        showFields.forEach((field) => {
            const fieldIndex = fields.indexOf(field);
            if (fieldIndex !== -1) {
                const rawValues = data.map(row => row[fieldIndex] ?? 0);
                result[field] = smoothData(rawValues, smoothing);
            }
        });
        return result;
    }, [data, fields, showFields, smoothing]);

    function toggleField(field: string) {
        const index = showFields.indexOf(field);
        const nextFields = [...showFields];

        if (index === -1) {
            if (nextFields.length < COLORS_LEFT.length + COLORS_RIGHT.length) {
                nextFields.push(field);
            }
        } else {
            nextFields.splice(index, 1);
        }

        setShowFields(nextFields);
    }

    function dataToPoints(field: string): string {
        const axis = fieldToAxis[field] === 'right' ? rightAxis : leftAxis;
        const range = axis.max - axis.min;
        if (range === 0) return "";

        const values = smoothedData[field];
        if (!values) return "";

        // Normalize to 0-1 range, then map to viewBox coordinates (using left axis for viewBox)
        return values.map((value, idx) => {
            const normalized = (value - axis.min) / range; // 0 to 1
            // Map to left axis viewBox space
            const y = leftAxis.max - normalized * (leftAxis.max - leftAxis.min);
            return `${idx},${y}`;
        }).join(" ");
    }

    function onMouseMove(e: MouseEvent) {
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;

        if (popupRef.current) {
            popupRef.current.style.left = e.pageX + "px";
            popupRef.current.style.top = e.pageY + "px";
        }

        // Calculate which data point is under the mouse
        const visibleDataPoints = data.length / zoom;
        const startDataIndex = (scrollOffset / data.length) * data.length;
        const mouseDataIndex = startDataIndex + (x / rect.width) * visibleDataPoints;
        const clampedIndex = Math.max(0, Math.min(mouseDataIndex, data.length - 1));

        setIndex(clampedIndex);
    }

    function onWheel(e: WheelEvent) {
        e.preventDefault();

        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseXRatio = mouseX / rect.width;

        // Horizontal scroll (shift+wheel or trackpad horizontal)
        if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
            const scrollDelta = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY);
            const scrollAmount = scrollDelta * (data.length / zoom) * 0.002;
            const maxScroll = data.length - (data.length / zoom);
            setScrollOffset(prev => Math.max(0, Math.min(prev + scrollAmount, maxScroll)));
        } else {
            // Vertical wheel = zoom at mouse position
            const oldZoom = zoom;
            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
            const newZoom = Math.max(1, Math.min(oldZoom * zoomFactor, 50));

            if (newZoom !== oldZoom) {
                // Calculate which data point is under the mouse
                const oldVisibleWidth = data.length / oldZoom;
                const mouseDataPos = scrollOffset + mouseXRatio * oldVisibleWidth;

                // After zoom, keep the same data point under the mouse
                const newVisibleWidth = data.length / newZoom;
                const newScrollOffset = mouseDataPos - mouseXRatio * newVisibleWidth;

                const maxScroll = data.length - newVisibleWidth;
                setZoom(newZoom);
                setScrollOffset(Math.max(0, Math.min(newScrollOffset, maxScroll)));
            }
        }
    }

    // Calculate viewBox based on zoom and scroll
    const visibleDataPoints = data.length / zoom;
    const viewBoxX = scrollOffset;
    const viewBoxWidth = visibleDataPoints;

    // Downsampled data for preview (max 500 points)
    const previewData = useMemo(() => {
        const targetPoints = 500;
        if (data.length <= targetPoints) return data;

        const step = data.length / targetPoints;
        const sampled: number[][] = [];
        for (let i = 0; i < targetPoints; i++) {
            const idx = Math.floor(i * step);
            sampled.push(data[idx]);
        }
        return sampled;
    }, [data]);

    function previewToPoints(field: string) {
        const fieldIndex = fields.indexOf(field);
        const range = max - min;
        if (range === 0) return "";

        return previewData.map((row, idx) => {
            const value = row[fieldIndex] ?? 0;
            const normalizedValue = ((value - min) / range) * (max - min);
            return `${idx},${max - normalizedValue}`;
        }).join(" ");
    }

    // Preview click/drag handler
    const previewRef = useRef<SVGSVGElement>(null);
    const [isDraggingPreview, setIsDraggingPreview] = useState(false);

    function handlePreviewMouseDown(e: MouseEvent) {
        setIsDraggingPreview(true);
        handlePreviewMove(e);
    }

    function handlePreviewMove(e: MouseEvent) {
        if (!previewRef.current) return;
        const rect = previewRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const ratio = x / rect.width;

        // Center the viewport on click position
        const newCenter = ratio * data.length;
        const halfVisible = visibleDataPoints / 2;
        const newOffset = newCenter - halfVisible;
        const maxScroll = data.length - visibleDataPoints;
        setScrollOffset(Math.max(0, Math.min(newOffset, maxScroll)));
    }

    // Global mouse up listener for preview dragging
    useEffect(() => {
        if (!isDraggingPreview) return;

        const handleUp = () => setIsDraggingPreview(false);
        const handleMove = (e: MouseEvent) => {
            if (!previewRef.current) return;
            const rect = previewRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const ratio = Math.max(0, Math.min(1, x / rect.width));

            const newCenter = ratio * data.length;
            const halfVisible = visibleDataPoints / 2;
            const newOffset = newCenter - halfVisible;
            const maxScroll = data.length - visibleDataPoints;
            setScrollOffset(Math.max(0, Math.min(newOffset, maxScroll)));
        };

        window.addEventListener('mouseup', handleUp);
        window.addEventListener('mousemove', handleMove);
        return () => {
            window.removeEventListener('mouseup', handleUp);
            window.removeEventListener('mousemove', handleMove);
        };
    }, [isDraggingPreview, visibleDataPoints, data.length]);

    const yAxisLabelsLeft = useMemo(() => {
        const range = leftAxis.max - leftAxis.min;
        const step = range / 8;
        const labels = [];
        for (let i = 0; i <= 8; i++) {
            labels.push(leftAxis.min + (step * i));
        }
        return labels.reverse();
    }, [leftAxis]);

    const yAxisLabelsRight = useMemo(() => {
        if (rightAxis.fields.length === 0) return [];
        const range = rightAxis.max - rightAxis.min;
        const step = range / 8;
        const labels = [];
        for (let i = 0; i <= 8; i++) {
            labels.push(rightAxis.min + (step * i));
        }
        return labels.reverse();
    }, [rightAxis]);

    if (data.length === 0) {
        return <div class="text-zinc-500 text-center py-8">No data to display</div>;
    }

    return (
        <>
            <div class="flex flex-col h-full">
                <div class="text-xs text-zinc-400 mb-2 flex items-center gap-4">
                    <span>{data.length} samples | Zoom: {zoom.toFixed(1)}x</span>
                    <span class="flex items-center gap-2">
                        Smoothing:
                        <input
                            type="range"
                            min="1"
                            max="15"
                            step="2"
                            value={smoothing}
                            onChange={(e) => setSmoothing(Number((e.target as HTMLInputElement).value))}
                            class="w-20 h-1 bg-zinc-600 rounded appearance-none cursor-pointer"
                        />
                        <span class="w-4">{smoothing === 1 ? 'off' : smoothing}</span>
                    </span>
                </div>
                <div class="flex gap-x-2 flex-1 min-h-0">
                    {/* Y-axis scale left */}
                    <div class="flex flex-col h-full py-2 text-xs text-zinc-500 w-14 text-right">
                        {/* Color indicators for left axis fields */}
                        <div class="flex gap-0.5 justify-end mb-1">
                            {leftAxis.fields.map((field) => (
                                <div
                                    key={field}
                                    class="w-3 h-1 rounded-sm"
                                    style={{ backgroundColor: getFieldColor(field) }}
                                    title={field}
                                />
                            ))}
                        </div>
                        <div class="flex flex-col justify-between flex-1">
                            {yAxisLabelsLeft.map((label, i) => (
                                <div key={i}>{label.toFixed(0)}</div>
                            ))}
                        </div>
                    </div>

                    {/* Graph container */}
                    <div
                        ref={containerRef}
                        class="flex-1 overflow-x-auto overflow-y-hidden border border-zinc-600 bg-zinc-900 rounded"
                        onWheel={onWheel}
                    >
                        <svg
                            viewBox={`${viewBoxX} ${leftAxis.min} ${viewBoxWidth} ${leftAxis.max - leftAxis.min}`}
                            onMouseMove={onMouseMove}
                            onMouseEnter={() => setIsHovering(true)}
                            onMouseLeave={() => setIsHovering(false)}
                            class="h-full w-full"
                            preserveAspectRatio="none"
                        >
                            {showFields.map((field) => (
                                <polyline
                                    key={field}
                                    fill="none"
                                    stroke={getFieldColor(field)}
                                    strokeWidth={1.5}
                                    points={dataToPoints(field)}
                                    vectorEffect="non-scaling-stroke"
                                />
                            ))}
                            {/* Vertical line at mouse position */}
                            {isHovering && (
                                <line
                                    x1={index}
                                    y1={leftAxis.min}
                                    x2={index}
                                    y2={leftAxis.max}
                                    stroke="white"
                                    strokeWidth={1}
                                    strokeOpacity={0.5}
                                    vectorEffect="non-scaling-stroke"
                                />
                            )}
                        </svg>
                    </div>

                    {/* Y-axis scale right (only if dual axis) */}
                    {rightAxis.fields.length > 0 && (
                        <div class="flex flex-col h-full py-2 text-xs text-zinc-400 w-14 text-left">
                            {/* Color indicators for right axis fields */}
                            <div class="flex gap-0.5 mb-1">
                                {rightAxis.fields.map((field) => (
                                    <div
                                        key={field}
                                        class="w-3 h-1 rounded-sm"
                                        style={{ backgroundColor: getFieldColor(field) }}
                                        title={field}
                                    />
                                ))}
                            </div>
                            <div class="flex flex-col justify-between flex-1">
                                {yAxisLabelsRight.map((label, i) => (
                                    <div key={i}>{label.toFixed(0)}</div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* X-axis time labels */}
                {timeColumnIndex !== -1 && (
                    <div class={`flex mt-1 ${rightAxis.fields.length > 0 ? 'ml-14 mr-14' : 'ml-14'}`}>
                        <div class="flex-1 flex justify-between text-xs text-zinc-500 font-mono">
                            {(() => {
                                const numLabels = 7;
                                const startIdx = Math.floor(scrollOffset);
                                const endIdx = Math.min(Math.floor(scrollOffset + visibleDataPoints), data.length - 1);

                                const labels = [];
                                for (let i = 0; i < numLabels; i++) {
                                    const idx = Math.floor(startIdx + (i / (numLabels - 1)) * (endIdx - startIdx));
                                    const time = data[idx]?.[timeColumnIndex] ?? 0;
                                    labels.push(<span key={i}>{time.toFixed(2)}</span>);
                                }
                                return labels;
                            })()}
                        </div>
                    </div>
                )}

                {/* Preview / Minimap */}
                <div class="mt-2 relative">
                    <svg
                        ref={previewRef}
                        viewBox={`0 ${min} ${previewData.length} ${max - min}`}
                        class="w-full h-12 bg-zinc-900 border border-zinc-700 rounded cursor-pointer"
                        preserveAspectRatio="none"
                        onMouseDown={handlePreviewMouseDown}
                    >
                        {/* Downsampled lines */}
                        {showFields.map((field) => (
                            <polyline
                                key={field}
                                fill="none"
                                stroke={getFieldColor(field)}
                                strokeWidth={1}
                                strokeOpacity={0.5}
                                points={previewToPoints(field)}
                                vectorEffect="non-scaling-stroke"
                            />
                        ))}
                        {/* Viewport indicator */}
                        <rect
                            x={(scrollOffset / data.length) * previewData.length}
                            y={min}
                            width={(visibleDataPoints / data.length) * previewData.length}
                            height={max - min}
                            fill="white"
                            fillOpacity={0.15}
                            stroke="white"
                            strokeWidth={1}
                            strokeOpacity={0.5}
                            vectorEffect="non-scaling-stroke"
                        />
                    </svg>
                </div>

                {/* Field selector */}
                <div class="flex gap-1.5 flex-wrap mt-3 max-h-32 overflow-y-auto">
                    {fields.map((field) => {
                        const isSelected = showFields.includes(field);
                        const axisIndicator = isSelected && rightAxis.fields.length > 0
                            ? (fieldToAxis[field] === 'right' ? ' [R]' : ' [L]')
                            : '';
                        return (
                            <button
                                key={field}
                                onClick={() => toggleField(field)}
                                class={`px-2 py-1 text-xs rounded border transition-colors ${
                                    isSelected
                                        ? 'border-zinc-500 bg-zinc-700'
                                        : 'border-zinc-700 bg-zinc-800 hover:bg-zinc-700'
                                }`}
                                style={{
                                    color: isSelected ? getFieldColor(field) : 'inherit'
                                }}
                            >
                                {field}{axisIndicator}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Hover popup */}
            {isHovering && createPortal(
                <div
                    ref={popupRef}
                    class="fixed ml-4 mt-4 p-2 bg-zinc-800 border border-zinc-600 shadow-xl rounded pointer-events-none text-xs font-mono z-[100]"
                >
                    <div class="text-zinc-400 mb-1">
                        {timeColumnIndex !== -1 ? (
                            (data[Math.floor(index)]?.[timeColumnIndex] ?? 0).toFixed(3)
                        ) : (
                            `Sample ${Math.floor(index)} / ${data.length}`
                        )}
                    </div>
                    {showFields.map((field) => {
                        const fieldIndex = fields.indexOf(field);
                        const value = data[Math.floor(index)]?.[fieldIndex];
                        return (
                            <div key={field} style={{ color: getFieldColor(field) }}>
                                {field}: {value?.toFixed(2) ?? "N/A"}
                            </div>
                        );
                    })}
                </div>,
                document.body
            )}
        </>
    );
}

interface LogViewerProps {
    onClose: () => void;
    initialData?: string | null;
}

export function LogViewer({ onClose, initialData }: LogViewerProps) {
    const [files, setFiles] = useState<{ name: string; content: string }[]>(() => {
        if (initialData) {
            return [{ name: 'BLE Log', content: initialData }];
        }
        return [];
    });
    const [activeIndex, setActiveIndex] = useState<number>(0);

    async function onFiles(e: Event) {
        const input = e.target as HTMLInputElement;
        if (!input.files) return;

        const loaded = await Promise.all(
            [...input.files].map(async (file) => ({
                name: file.name,
                content: await file.text()
            }))
        );
        setFiles(loaded);
        setActiveIndex(0);
        input.value = '';
    }

    return (
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div class="bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl w-[95vw] h-[90vh] flex flex-col">
                {/* Header */}
                <div class="flex justify-between items-center px-4 py-3 border-b border-zinc-700">
                    <div class="flex items-center gap-4">
                        <h2 class="text-lg font-semibold">Log Viewer</h2>
                        <label class="px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 rounded cursor-pointer transition-colors">
                            Open CSV...
                            <input
                                type="file"
                                multiple
                                accept=".csv,.log,.txt"
                                onChange={onFiles}
                                class="hidden"
                            />
                        </label>
                    </div>
                    <button
                        onClick={onClose}
                        class="w-8 h-8 flex items-center justify-center rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100"
                    >
                        ✕
                    </button>
                </div>

                {/* Tabs for multiple files */}
                {files.length > 1 && (
                    <div class="flex gap-1 px-4 pt-2 border-b border-zinc-700">
                        {files.map((file, i) => (
                            <button
                                key={i}
                                onClick={() => setActiveIndex(i)}
                                class={`px-3 py-1.5 text-sm rounded-t border-b-2 transition-colors ${
                                    i === activeIndex
                                        ? 'border-blue-500 bg-zinc-700 text-zinc-100'
                                        : 'border-transparent text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700'
                                }`}
                            >
                                {file.name}
                            </button>
                        ))}
                    </div>
                )}

                {/* Content */}
                <div class="flex-1 p-4 min-h-0">
                    {files.length === 0 ? (
                        <div class="flex flex-col items-center justify-center h-full text-zinc-500">
                            <svg class="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p class="text-lg">No log files loaded</p>
                            <p class="text-sm mt-1">Click "Open CSV..." to load datalog files</p>
                        </div>
                    ) : (
                        <CSVViewer text={files[activeIndex].content} />
                    )}
                </div>
            </div>
        </div>
    );
}
