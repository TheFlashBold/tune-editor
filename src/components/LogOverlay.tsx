import {useEffect, useRef, useState, useMemo} from 'preact/hooks';
import {useLogContext} from '../context/log';
import {resolveParamValues, fractionalIndex} from '../lib/logMapping';
import {interpolateRow} from '../lib/csvLog';
import type {IDefinitionParameter} from '../types';
import {paramId} from '../lib/paramIdentity';

interface LogOverlayProps {
    param: IDefinitionParameter;
    xAxisData: number[];
    yAxisData: number[];
}

interface CellRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

/**
 * Renders a heat-map circle over a calibration table at the position dictated
 * by the current log row. Must be placed inside a `position: relative` wrapper
 * that also contains the table; data cells must carry a `data-log-cell="r,c"` attr.
 */
export function LogOverlay({param, xAxisData, yAxisData}: LogOverlayProps) {
    const {log, index} = useLogContext();
    const rootRef = useRef<HTMLDivElement>(null);
    const technicalId = paramId(param);
    const gradientId = `log-fade-${technicalId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

    // Keyed by "r,c"
    const [cellRects, setCellRects] = useState<Map<string, CellRect>>(new Map());
    const [overlaySize, setOverlaySize] = useState({width: 0, height: 0});

    // Drop stale geometry immediately whenever the parameter or axis dimensions change.
    useEffect(() => {
        setCellRects(new Map());
    }, [technicalId, xAxisData.length, yAxisData.length, param.rows, param.cols]);

    // Measure cell positions relative to the overlay root.
    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        const parent = root.parentElement;
        if (!parent) return;

        const measure = () => {
            try {
                const rootRect = root.getBoundingClientRect();
                if (rootRect.width === 0 || rootRect.height === 0) return;
                const cells = parent.querySelectorAll<HTMLElement>('[data-log-cell]');
                const next = new Map<string, CellRect>();
                cells.forEach(cell => {
                    const key = cell.getAttribute('data-log-cell');
                    if (!key) return;
                    const r = cell.getBoundingClientRect();
                    next.set(key, {
                        left: r.left - rootRect.left,
                        top: r.top - rootRect.top,
                        width: r.width,
                        height: r.height,
                    });
                });
                setCellRects(next);
                setOverlaySize({width: rootRect.width, height: rootRect.height});
            } catch {
                // DOM torn down between frames; next render will re-measure.
            }
        };

        measure();

        const ro = new ResizeObserver(measure);
        ro.observe(parent);
        parent.querySelectorAll<HTMLElement>('[data-log-cell]').forEach(el => ro.observe(el));

        // Also re-measure on scroll of ancestors and window resize
        const onScroll = () => measure();
        window.addEventListener('resize', onScroll);
        let scrollEl: HTMLElement | null = parent.parentElement;
        const scrollListeners: HTMLElement[] = [];
        while (scrollEl) {
            scrollEl.addEventListener('scroll', onScroll, {passive: true});
            scrollListeners.push(scrollEl);
            scrollEl = scrollEl.parentElement;
        }

        return () => {
            ro.disconnect();
            window.removeEventListener('resize', onScroll);
            scrollListeners.forEach(el => el.removeEventListener('scroll', onScroll));
        };
    }, [technicalId, xAxisData.length, yAxisData.length]);

    // Precompute the full trail once per geometry/log change: the entire SVG `d`
    // string plus a cumulative arc-length per row. Cursor scrubbing then only
    // updates `stroke-dashoffset`, which is cheap (no path re-emit, no diff).
    const trail = useMemo<{d: string; cumLen: Float64Array; totalLen: number} | null>(() => {
        if (!log || log.rows.length === 0 || cellRects.size === 0) return null;
        if (xAxisData.length === 0 || yAxisData.length === 0) return null;
        const cols = Math.max(1, xAxisData.length);
        const rows = Math.max(1, yAxisData.length);

        const parts: string[] = [];
        const cumLen = new Float64Array(log.rows.length);
        let pen = false;
        let prevX = 0, prevY = 0;
        let runningLen = 0;

        for (let i = 0; i < log.rows.length; i++) {
            const row = log.rows[i];
            const {x, y} = resolveParamValues(param, log.headers, row);
            if (x === null || y === null) { pen = false; cumLen[i] = runningLen; continue; }
            const fc = fractionalIndex(xAxisData, x);
            const fr = fractionalIndex(yAxisData, y);
            if (fc === null || fr === null) { pen = false; cumLen[i] = runningLen; continue; }
            const fcC = Math.max(0, Math.min(fc, cols - 1));
            const frC = Math.max(0, Math.min(fr, rows - 1));
            const cFloor = Math.floor(fcC);
            const cCeil = Math.min(cols - 1, cFloor + 1);
            const cT = fcC - cFloor;
            const rFloor = Math.floor(frC);
            const rCeil = Math.min(rows - 1, rFloor + 1);
            const rT = frC - rFloor;
            const tl = cellRects.get(`${rFloor},${cFloor}`);
            const tr = cellRects.get(`${rFloor},${cCeil}`);
            const bl = cellRects.get(`${rCeil},${cFloor}`);
            const br = cellRects.get(`${rCeil},${cCeil}`);
            if (!tl || !tr || !bl || !br) { pen = false; cumLen[i] = runningLen; continue; }
            const cx = (1 - cT) * (1 - rT) * (tl.left + tl.width / 2)
                + cT * (1 - rT) * (tr.left + tr.width / 2)
                + (1 - cT) * rT * (bl.left + bl.width / 2)
                + cT * rT * (br.left + br.width / 2);
            const cy = (1 - cT) * (1 - rT) * (tl.top + tl.height / 2)
                + cT * (1 - rT) * (tr.top + tr.height / 2)
                + (1 - cT) * rT * (bl.top + bl.height / 2)
                + cT * rT * (br.top + br.height / 2);

            if (pen) {
                runningLen += Math.hypot(cx - prevX, cy - prevY);
                parts.push('L' + cx.toFixed(1) + ' ' + cy.toFixed(1));
            } else {
                parts.push('M' + cx.toFixed(1) + ' ' + cy.toFixed(1));
                pen = true;
            }
            prevX = cx;
            prevY = cy;
            cumLen[i] = runningLen;
        }

        if (parts.length === 0 || runningLen === 0) return null;
        return {d: parts.join(' '), cumLen, totalLen: runningLen};
    }, [log, cellRects, param, xAxisData, yAxisData]);

    // Cheap per-frame: how much of the precomputed trail to reveal.
    const trailDashOffset = useMemo<number | null>(() => {
        if (!trail) return null;
        const i = Math.min(trail.cumLen.length - 1, Math.max(0, Math.floor(index)));
        const len = trail.cumLen[i] ?? 0;
        return Math.max(0, trail.totalLen - len);
    }, [trail, index]);

    const circle = useMemo(() => {
        if (!log || log.rows.length === 0 || cellRects.size === 0) return null;
        const row = interpolateRow(log.rows, index);
        if (!row) return null;

        const {x, y} = resolveParamValues(param, log.headers, row);

        const rows = Math.max(1, yAxisData.length || (param.rows ?? 1));
        const cols = Math.max(1, xAxisData.length || (param.cols ?? 1));

        // Compute fractional column position
        let fc: number | null = null;
        if (xAxisData.length > 0 && x !== null) {
            fc = fractionalIndex(xAxisData, x);
        }
        // Compute fractional row position
        let fr: number | null = null;
        if (yAxisData.length > 0 && y !== null) {
            fr = fractionalIndex(yAxisData, y);
        } else if (yAxisData.length === 0 && param.type === 'CURVE') {
            fr = 0;
        }

        if (fc === null && fr === null) return null;
        // For tables without a real Y axis (CURVE / 1D), require an X mapping — a
        // horizontal band would be meaningless when there's only a single row.
        if (yAxisData.length === 0 && fc === null) return null;

        // Clamp/floor for whichever axis resolved; pin the other to 0 for geometry lookup.
        const fcClamped = fc === null ? 0 : Math.max(0, Math.min(fc, cols - 1));
        const frClamped = fr === null ? 0 : Math.max(0, Math.min(fr, rows - 1));

        const cFloor = Math.floor(fcClamped);
        const cCeil = Math.min(cols - 1, cFloor + 1);
        const cT = fcClamped - cFloor;

        const rFloor = Math.floor(frClamped);
        const rCeil = Math.min(rows - 1, rFloor + 1);
        const rT = frClamped - rFloor;

        const tl = cellRects.get(`${rFloor},${cFloor}`);
        const tr = cellRects.get(`${rFloor},${cCeil}`);
        const bl = cellRects.get(`${rCeil},${cFloor}`);
        const br = cellRects.get(`${rCeil},${cCeil}`);
        if (!tl || !tr || !bl || !br) return null;

        const cx = (1 - cT) * (1 - rT) * (tl.left + tl.width / 2)
            + cT * (1 - rT) * (tr.left + tr.width / 2)
            + (1 - cT) * rT * (bl.left + bl.width / 2)
            + cT * rT * (br.left + br.width / 2);
        const cy = (1 - cT) * (1 - rT) * (tl.top + tl.height / 2)
            + cT * (1 - rT) * (tr.top + tr.height / 2)
            + (1 - cT) * rT * (bl.top + bl.height / 2)
            + cT * rT * (br.top + br.height / 2);

        const radius = Math.min(tl.width, tl.height) * 0.75;

        // Only y resolved → horizontal band at this row
        if (fc === null && cols > 1) {
            return {cx: overlaySize.width / 2, cy, radius, band: 'h' as const};
        }
        // Only x resolved → vertical band at this column
        if (fr === null && rows > 1) {
            return {cx, cy: overlaySize.height / 2, radius, band: 'v' as const};
        }

        return {cx, cy, radius, band: false as const};
    }, [log, index, cellRects, param, xAxisData, yAxisData, overlaySize.width, overlaySize.height]);

    return (
        <div
            ref={rootRef}
            class="absolute inset-0 pointer-events-none"
            style={{zIndex: 5}}
        >
            {(circle || trail) && (
                <svg
                    class="absolute inset-0"
                    width={overlaySize.width}
                    height={overlaySize.height}
                    style={{overflow: 'visible'}}
                >
                    <defs>
                        <radialGradient id={gradientId} cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="#b91c1c" stopOpacity="0.95"/>
                            <stop offset="40%" stopColor="#b91c1c" stopOpacity="0.55"/>
                            <stop offset="100%" stopColor="#b91c1c" stopOpacity="0"/>
                        </radialGradient>
                    </defs>
                    {trail && trailDashOffset !== null && (
                        <path
                            d={trail.d}
                            fill="none"
                            stroke="#b91c1c"
                            strokeOpacity={0.55}
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeDasharray={trail.totalLen}
                            strokeDashoffset={trailDashOffset}
                        />
                    )}
                    {circle.band === 'v' ? (
                        <rect
                            x={circle.cx - circle.radius}
                            y={0}
                            width={circle.radius * 2}
                            height={overlaySize.height}
                            fill={`url(#${gradientId})`}
                            opacity={0.7}
                        />
                    ) : circle.band === 'h' ? (
                        <rect
                            x={0}
                            y={circle.cy - circle.radius}
                            width={overlaySize.width}
                            height={circle.radius * 2}
                            fill={`url(#${gradientId})`}
                            opacity={0.7}
                        />
                    ) : (
                        <g>
                            <circle
                                cx={circle.cx}
                                cy={circle.cy}
                                r={circle.radius * 1.3}
                                fill={`url(#${gradientId})`}
                            >
                                <animate attributeName="r"
                                         values={`${circle.radius};${circle.radius * 1.45};${circle.radius}`}
                                         dur="1.6s" repeatCount="indefinite"/>
                                <animate attributeName="opacity" values="0.85;0.35;0.85" dur="1.6s"
                                         repeatCount="indefinite"/>
                            </circle>
                            <circle
                                cx={circle.cx}
                                cy={circle.cy}
                                r={Math.max(4, circle.radius * 0.35)}
                                fill="#b91c1c"
                                stroke="#fff"
                                strokeWidth="2"
                            />
                        </g>
                    )}
                </svg>
            )}
        </div>
    );
}
