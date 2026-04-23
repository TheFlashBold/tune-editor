import {useState, useCallback, useEffect, useRef} from 'preact/hooks';
import type {ParsedLog} from '../lib/csvLog';
import type {ILogContext} from '../context/log';

// Cap React state updates to ~30 Hz during playback so consumers that rerender
// on every index change (tables, overlays, timelines) don't saturate the main
// thread. The internal ref still advances at full rAF rate for accuracy.
const MIN_UPDATE_INTERVAL_MS = 33;

export function useLogState(): ILogContext {
    const [log, setLogState] = useState<ParsedLog | null>(null);
    const [logName, setLogName] = useState<string | null>(null);
    const [index, setIndexState] = useState(0);
    const [playing, setPlayingState] = useState(false);
    const [speed, setSpeed] = useState(1);

    const setLog = useCallback((next: ParsedLog | null, name?: string | null) => {
        setLogState(next);
        setLogName(name ?? null);
        setIndexState(0);
        setPlayingState(false);
    }, []);

    const setIndex = useCallback((i: number) => {
        setIndexState(i);
    }, []);

    const setPlaying = useCallback((p: boolean) => {
        setPlayingState(p);
    }, []);

    // rAF playback loop
    const rafRef = useRef<number | null>(null);
    const lastTsRef = useRef<number>(0);
    const lastStateUpdateTsRef = useRef<number>(0);
    const currentIndexRef = useRef<number>(0);

    useEffect(() => {
        if (!playing || !log || log.rows.length === 0) {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            return;
        }

        const now = performance.now();
        lastTsRef.current = now;
        lastStateUpdateTsRef.current = 0;
        currentIndexRef.current = index;
        const rowsPerSec = log.rowRate * speed;
        const lastRow = log.rows.length - 1;

        const tick = (ts: number) => {
            const dt = (ts - lastTsRef.current) / 1000;
            lastTsRef.current = ts;
            let next = currentIndexRef.current + dt * rowsPerSec;
            let reachedEnd = false;
            if (next >= lastRow) {
                next = lastRow;
                reachedEnd = true;
            }
            currentIndexRef.current = next;

            if (reachedEnd) {
                setIndexState(next);
                setPlayingState(false);
                return;
            }
            if (ts - lastStateUpdateTsRef.current >= MIN_UPDATE_INTERVAL_MS) {
                lastStateUpdateTsRef.current = ts;
                setIndexState(next);
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);

        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playing, log, speed]);

    return {
        log,
        logName,
        setLog,
        index,
        setIndex,
        playing,
        setPlaying,
        speed,
        setSpeed,
    };
}
