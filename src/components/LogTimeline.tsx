import {useMemo, useRef, useState, useEffect} from 'preact/hooks';
import {useLogContext} from '../context/log';
import {LOG_MAPPINGS} from '../lib/logMapping';

const SPEEDS = [0.25, 0.5, 1, 2, 4];

export function LogTimeline() {
    const ctx = useLogContext();
    const {log, logName, index, setIndex, playing, setPlaying, speed, setSpeed} = ctx;

    const trackRef = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState(false);

    // Sparkline of first hardcoded mapping source (e.g. Engine Speed)
    const preview = useMemo(() => {
        if (!log || log.rows.length === 0) return null;
        const col = log.headers.indexOf(LOG_MAPPINGS[0]?.source ?? '');
        if (col === -1) return null;
        const points = 400;
        const step = Math.max(1, Math.floor(log.rows.length / points));
        const vals: number[] = [];
        let min = Infinity, max = -Infinity;
        for (let i = 0; i < log.rows.length; i += step) {
            const v = log.rows[i][col] ?? 0;
            vals.push(v);
            if (v < min) min = v;
            if (v > max) max = v;
        }
        if (!isFinite(min) || !isFinite(max) || max === min) return null;
        const poly = vals.map((v, i) => `${i},${1 - (v - min) / (max - min)}`).join(' ');
        return {poly, width: vals.length, label: LOG_MAPPINGS[0].source};
    }, [log]);

    const seekFromEvent = (e: MouseEvent | TouchEvent) => {
        if (!trackRef.current || !log) return;
        const rect = trackRef.current.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        setIndex(ratio * (log.rows.length - 1));
    };

    useEffect(() => {
        if (!dragging) return;
        const onMove = (e: MouseEvent) => seekFromEvent(e);
        const onUp = () => setDragging(false);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [dragging, log]);

    if (!log || log.rows.length === 0) return null;

    const timeValue = log.timeColumn !== -1
        ? log.rows[Math.floor(index)]?.[log.timeColumn] ?? 0
        : null;

    const totalTime = log.timeColumn !== -1
        ? log.rows[log.rows.length - 1]?.[log.timeColumn] ?? 0
        : null;

    const progressPct = (index / Math.max(1, log.rows.length - 1)) * 100;

    return (
        <div class="border-t border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 px-3 py-2 flex items-center gap-3 text-xs">
            <button
                onClick={() => setPlaying(!playing)}
                class="w-8 h-8 flex items-center justify-center rounded bg-blue-600 hover:bg-blue-500 text-white shrink-0"
                title={playing ? 'Pause' : 'Play'}
            >
                {playing ? (
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="5" width="4" height="14" rx="1"/>
                        <rect x="14" y="5" width="4" height="14" rx="1"/>
                    </svg>
                ) : (
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z"/>
                    </svg>
                )}
            </button>

            <select
                value={speed}
                onChange={(e) => setSpeed(Number((e.target as HTMLSelectElement).value))}
                class="bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-1 py-0.5 shrink-0"
                title="Playback speed"
            >
                {SPEEDS.map(s => <option key={s} value={s}>{s}x</option>)}
            </select>

            <div class="text-zinc-500 dark:text-zinc-400 font-mono shrink-0 min-w-24 text-right">
                {timeValue !== null
                    ? `${timeValue.toFixed(2)}s / ${(totalTime ?? 0).toFixed(2)}s`
                    : `${Math.floor(index)} / ${log.rows.length - 1}`}
            </div>

            <div
                ref={trackRef}
                class="relative flex-1 h-8 bg-zinc-200 dark:bg-zinc-800 rounded cursor-pointer select-none"
                onMouseDown={(e) => {
                    setDragging(true);
                    seekFromEvent(e);
                }}
            >
                {preview && (
                    <svg
                        class="absolute inset-0 w-full h-full pointer-events-none"
                        viewBox={`0 0 ${preview.width} 1`}
                        preserveAspectRatio="none"
                    >
                        <polyline
                            fill="none"
                            stroke="#3b82f6"
                            strokeOpacity={0.7}
                            strokeWidth={1}
                            points={preview.poly}
                            vectorEffect="non-scaling-stroke"
                        />
                    </svg>
                )}
                <div
                    class="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none"
                    style={{left: `${progressPct}%`}}
                />
            </div>

            <div class="text-zinc-500 dark:text-zinc-400 shrink-0 truncate max-w-48" title={logName ?? ''}>
                {logName ?? 'log'}
            </div>

            <button
                onClick={() => ctx.setLog(null)}
                class="w-7 h-7 flex items-center justify-center rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500"
                title="Close log"
            >
                ✕
            </button>
        </div>
    );
}
