export interface ParsedLog {
    headers: string[];
    rows: number[][];
    timeColumn: number;
    rowRate: number;
}

const TIME_NAMES = ['time', 'zeit', 'timestamp', 't'];

/**
 * Return a row at a fractional index, linearly interpolating between the two
 * bracketing rows when `index` falls between samples. Clamps to the valid range.
 */
export function interpolateRow(rows: number[][], index: number): number[] | undefined {
    if (rows.length === 0) return undefined;
    if (!isFinite(index)) return rows[0];
    const last = rows.length - 1;
    if (index <= 0) return rows[0];
    if (index >= last) return rows[last];
    const i0 = Math.floor(index);
    const i1 = Math.min(last, i0 + 1);
    const t = index - i0;
    const a = rows[i0];
    const b = rows[i1];
    const out = new Array<number>(a.length);
    for (let c = 0; c < a.length; c++) {
        const av = a[c];
        const bv = b[c];
        out[c] = (1 - t) * av + t * bv;
    }
    return out;
}

export function parseCSV(text: string): ParsedLog {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length === 0) {
        return {headers: [], rows: [], timeColumn: -1, rowRate: 10};
    }

    const headers = lines[0].split(',').map(s => s.trim());
    const rows = lines.slice(1).map(line =>
        line.split(',').map(col => {
            const n = Number(col.trim());
            return isNaN(n) ? 0 : n;
        })
    );

    const timeColumn = headers.findIndex(h => TIME_NAMES.includes(h.toLowerCase()));

    let rowRate = 10;
    if (timeColumn !== -1 && rows.length > 1) {
        const first = rows[0]?.[timeColumn];
        const last = rows[rows.length - 1]?.[timeColumn];
        if (typeof first === 'number' && typeof last === 'number' && last > first) {
            rowRate = (rows.length - 1) / (last - first);
        }
    }

    return {headers, rows, timeColumn, rowRate};
}
