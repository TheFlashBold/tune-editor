import {createContext} from 'preact';
import {useContext} from 'preact/hooks';
import type {ParsedLog} from '../lib/csvLog';

export interface ILogContext {
    log: ParsedLog | null;
    logName: string | null;
    setLog: (log: ParsedLog | null, name?: string | null) => void;

    index: number;
    setIndex: (i: number) => void;

    playing: boolean;
    setPlaying: (p: boolean) => void;

    speed: number;
    setSpeed: (s: number) => void;
}

export const LogContext = createContext<ILogContext | null>(null);

export function useLogContext(): ILogContext {
    const c = useContext(LogContext);
    if (!c) throw new Error('useLogContext must be used within LogContext.Provider');
    return c;
}
