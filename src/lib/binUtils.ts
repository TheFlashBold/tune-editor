import {
    DataType,
    DATA_TYPE_INFO,
    IDefinitionParameter,
    AxisDefinition,
    DefinitionVerification,
    BinaryMode
} from '../types';


/**
 * Read ASCII string from binary at given offset
 */
export function readString(data: Uint8Array, offset: number, length: number): string {
    if (offset < 0 || offset + length > data.length) return '';
    return String.fromCharCode(...data.slice(offset, offset + length));
}

// CAS header is 8 bytes, EPK string follows immediately
const CAS_HEADER_SIZE = 8;

/**
 * Check if a string looks like a DSG/TCU EPK (F45M, F49M, VPB9, etc.)
 */
function isDsgEpk(epk: string): boolean {
    // DQ250 FXXM
    if (/^[FV][A-Z0-9]{3}$/.test(epk)) {
        return true;
    }

    // DQ381 23XX ...
    if (/\d\dXX/.test(epk)) {
        return true;
    }

    return false
}

/**
 * Search for DSG/TCU EPK pattern in binary data
 * Pattern: HWNumber_Version_Code EPK (e.g., "0D9300012H_4518_OTJD F45M") FL_0GC300012L_2303_cTCA.par
 * DSG bins have version info block around 0x4ff00-0x50100
 */
function findDsgEpk(data: Uint8Array, expected: string): { offset: number; found: string } | null {
    const searchRegions = [
        {start: 0x3ff00, length: 256}, // DQ250
        {start: 0x4ff00, length: 256}, // DQ250
        {start: 0x16C00D, length: 3} // DQ381
    ];

    for (const region of searchRegions) {
        if (region.start >= data.length) continue;

        const end = Math.min(region.start + region.length, data.length);
        const slice = data.slice(region.start, end);
        const text = String.fromCharCode(...slice);

        // Look for the expected EPK preceded by space or underscore
        const patterns = [
            new RegExp(`[\\s_](${expected})`),
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                return {offset: region.start + text.indexOf(match[1]), found: match[1]};
            }
        }
    }

    return null;
}

function readStringSafe(data: Uint8Array, index: number, maxLength: number, minLength: number = 1): string {
    const bytes: number[] = []

    for (let i = 0; i < maxLength; i++) {
        const byte = data[index + i];
        if (byte === 0 || byte < 0x20 || byte > 0x7e) {
            break;
        }
        bytes.push(byte);
    }

    const string = String.fromCharCode(...bytes).trim();
    if (!minLength || string.length >= minLength) {
        return string;
    }
}

// simos 12.1/18.1/18.4/18.10
const CAL_SIZES = [0x6FC00, 0x7FC00, 0x9FC00];
// simos DQ500 MQB/12.1/18.1/18.4/18.10
const CAL_OFFSETS = [0x20000, 0x40000, 0x200000, 0x220000];

export function readBoxCode(data: Uint8Array): string {
    if (readStringSafe(data, 0, 3, 3) === "CAS") {
        const boxCode = readStringSafe(data, 0x60, 12, 9);
        if (boxCode) {
            return boxCode;
        }
    }

    for (const offset of CAL_OFFSETS) {
        if (data.length > (offset + 0x60 + 9)) {
            const boxCode = readStringSafe(data, offset + 0x60, 12, 9);
            if (boxCode) {
                return boxCode;
            }
        }
    }

    // DQ500 MQB
    if (data.length > (0x20218 + 0x0A)) {
        const boxCode = readStringSafe(data, 0x20218, 0x0A, 0x0A);
        if (boxCode) {
            return boxCode;
        }
    }

    // DQ381
    if (data.length > (0x16C00C + 10)) {
        const boxCode = readStringSafe(data, 0x16C003, 10, 10);
        if (boxCode) {
            return boxCode;
        }
    }

    // VL381
    if (data.length > (0x60004 + 10)) {
        const boxCode = readStringSafe(data, 0x16C004, 10, 9);
        if (boxCode) {
            return boxCode;
        }
    }

    // DQ250 MQB
    if (data.length > (0x3FFBA + 10)) {
        const boxCode = readStringSafe(data, 0x3FFB0, 10, 10);
        if (boxCode) {
            return boxCode;
        }
    }

    // DQ250 MQB
    if (data.length > (0x4FFBA + 10)) {
        const boxCode = readStringSafe(data, 0x4FFB0, 10, 10);
        if (boxCode) {
            return boxCode;
        }
    }

    // Bosch MED/EDC: HW part number (10-digit) near CBOOT header
    for (const offset of [0x401a, 0x1401a, 0x1C948E]) {
        if (data.length > (offset + 12)) {
            const boxCode = readStringSafe(data, offset, 12, 10);
            if (boxCode) {
                return boxCode;
            }
        }
    }
}

export function readEPK(data: Uint8Array): [string, number] | [] {
    if (readStringSafe(data, 0, 3, 3) === "CAS") {
        const epk = readStringSafe(data, 0x02, 6, 6);
        if (epk) {
            return [epk, 0x02];
        }
    }

    for (const offset of CAL_OFFSETS) {
        if (data.length > (offset + 0x2000) && readStringSafe(data, offset, 3, 3) === "CAS") {
            const epk = readStringSafe(data, offset + 0x02, 6, 6);
            if (epk) {
                return [epk, offset + 0x02];
            }
        }
    }
    // DQ381
    if (data.length > (0x16C00E + 2)) {
        const epk = readStringSafe(data, 0x16C00E, 2, 2);
        if (epk) {
            return [epk, 0x16C00E];
        }
    }

    // DQ250 MQB
    if (data.length > (0x3FFDF + 5)) {
        const epk = readStringSafe(data, 0x3FFDF, 5, 4);
        if (epk) {
            return [epk, 0x3FFE0];
        }
    }

    // DQ250 MQB
    if (data.length > (0x4FFDF + 5)) {
        const epk = readStringSafe(data, 0x4FFDF, 5, 4);
        if (epk) {
            return [epk, 0x4FFE0];
        }
    }

    // Bosch MED/EDC: "CB " EPK in CBOOT header, or ECU type string
    for (const region of [{start: 0x4090, len: 40}, {start: 0x14090, len: 40}]) {
        if (data.length > (region.start + region.len)) {
            const s = readStringSafe(data, region.start, region.len, 6);
            if (s?.startsWith('CB ')) {
                return [s, region.start];
            }
        }
    }

    // Bosch: EDC17/MED17 type string
    // 31/1/EDC17_C41/11/P_746//CK5/// 0x300A64 0x4683C
    // 33/1/EDC17_CP09/11/P_574//V8KB/// 0x20C78 0x9D844
    for (const offset of [0x38721, 0x1C94B7]) {
        if (data.length > (offset + 6)) {
            const s = readStringSafe(data, offset, 16, 6);
            if (s && /^(EDC|MED)\d/.test(s)) {
                return [s, offset];
            }
        }
    }

    return [];
}

export function readVersion(data: Uint8Array): string {
    for (const offset of CAL_OFFSETS) {
        if (data.length > (offset + 0x2000)) {
            const epk = readStringSafe(data, offset + 0x80, 4, 4);
            if (epk) {
                return epk;
            }
        }
    }

    if (CAL_SIZES.includes(data.length)) {
        const epk = readStringSafe(data, 0x80, 4, 4);
        if (epk) {
            return epk;
        }
    }
}

/**
 * Calculate file offset from CAL-relative address.
 * @param address - CAL-relative address (offset from CAL start)
 * @param calOffset - 0 for CAL-only, baseAddress for full bin
 */
export function addressToOffset(address: number, calOffset: number = 0): number {
    return address + calOffset;
}

export function readValue(data: Uint8Array, address: number, dataType: DataType, calOffset: number = 0, bigEndian: boolean = false): number {
    const offset = addressToOffset(address, calOffset);
    if (offset < 0 || offset >= data.length) return 0;

    const info = DATA_TYPE_INFO[dataType];
    const view = new DataView(data.buffer, data.byteOffset + offset, info.size);
    const littleEndian = !bigEndian;

    switch (dataType) {
        case 'UBYTE':
            return view.getUint8(0);
        case 'SBYTE':
            return view.getInt8(0);
        case 'UWORD':
            return view.getUint16(0, littleEndian);
        case 'SWORD':
            return view.getInt16(0, littleEndian);
        case 'ULONG':
            return view.getUint32(0, littleEndian);
        case 'SLONG':
            return view.getInt32(0, littleEndian);
        case 'FLOAT32':
            return view.getFloat32(0, littleEndian);
        default:
            return 0;
    }
}

export function writeValue(data: Uint8Array, address: number, dataType: DataType, value: number, calOffset: number = 0, bigEndian: boolean = false): void {
    const offset = addressToOffset(address, calOffset);
    if (offset < 0 || offset >= data.length) return;

    const info = DATA_TYPE_INFO[dataType];
    const view = new DataView(data.buffer, data.byteOffset + offset, info.size);
    const littleEndian = !bigEndian;

    switch (dataType) {
        case 'UBYTE':
            view.setUint8(0, Math.max(0, Math.min(255, value)));
            break;
        case 'SBYTE':
            view.setInt8(0, Math.max(-128, Math.min(127, value)));
            break;
        case 'UWORD':
            view.setUint16(0, Math.max(0, Math.min(65535, value)), littleEndian);
            break;
        case 'SWORD':
            view.setInt16(0, Math.max(-32768, Math.min(32767, value)), littleEndian);
            break;
        case 'ULONG':
            view.setUint32(0, value >>> 0, littleEndian);
            break;
        case 'SLONG':
            view.setInt32(0, value, littleEndian);
            break;
        case 'FLOAT32':
            view.setFloat32(0, value, littleEndian);
            break;
    }
}

export function applyConversion(raw: number, factor: number, offset: number, formula?: import('../types').RationalFormula): number {
    if (formula) {
        const denom = formula.c + formula.d * raw;
        if (denom === 0) return 0;
        return (formula.a * raw + formula.b) / denom;
    }
    return raw * factor + offset;
}

export function reverseConversion(phys: number, factor: number, offset: number, formula?: import('../types').RationalFormula): number {
    if (formula) {
        // Solve: phys = (a*X + b) / (c + d*X) for X
        // => phys*(c + d*X) = a*X + b => X*(phys*d - a) = b - phys*c
        const denom = phys * formula.d - formula.a;
        if (denom === 0) return 0;
        return (formula.b - phys * formula.c) / denom;
    }
    return (phys - offset) / factor;
}

export function readParameterValue(data: Uint8Array, param: IDefinitionParameter, calOffset: number = 0, bigEndian: boolean = false): number {
    const raw = readValue(data, param.address, param.dataType, calOffset, bigEndian);
    return applyConversion(raw, param.factor, param.offset, param.formula);
}

export function writeParameterValue(data: Uint8Array, param: IDefinitionParameter, physValue: number, calOffset: number = 0, bigEndian: boolean = false): void {
    const raw = reverseConversion(physValue, param.factor, param.offset, param.formula);
    writeValue(data, param.address, param.dataType, raw, calOffset, bigEndian);
}

export function readTableData(data: Uint8Array, param: IDefinitionParameter, calOffset: number = 0, bigEndian: boolean = false): number[][] {
    const rows = param.rows || 1;
    const cols = param.cols || 1;
    const typeSize = DATA_TYPE_INFO[param.dataType].size;
    const dataOffset = param.dataOffset ?? 0; // Byte offset where table data starts (for STD_AXIS)
    const result: number[][] = [];

    for (let r = 0; r < rows; r++) {
        const row: number[] = [];
        for (let c = 0; c < cols; c++) {
            // COLUMN_DIR: data stored column-wise (c * rows + r) - all of col 0, then col 1, etc.
            // ROW_DIR: data stored row-wise (r * cols + c) - all of row 0, then row 1, etc.
            const idx = param.columnDir ? (c * rows + r) : (r * cols + c);
            const addr = param.address + dataOffset + idx * typeSize;
            const raw = readValue(data, addr, param.dataType, calOffset, bigEndian);
            const phys = applyConversion(raw, param.factor, param.offset, param.formula);
            row.push(phys);
        }
        result.push(row);
    }
    return result;
}

export function writeTableCell(
    data: Uint8Array,
    param: IDefinitionParameter,
    row: number,
    col: number,
    physValue: number,
    calOffset: number = 0,
    bigEndian: boolean = false
): void {
    const rows = param.rows || 1;
    const cols = param.cols || 1;
    const typeSize = DATA_TYPE_INFO[param.dataType].size;
    const dataOffset = param.dataOffset ?? 0; // Byte offset where table data starts (for STD_AXIS)
    const idx = param.columnDir ? (col * rows + row) : (row * cols + col);
    const addr = param.address + dataOffset + idx * typeSize;
    const raw = reverseConversion(physValue, param.factor, param.offset, param.formula);
    writeValue(data, addr, param.dataType, raw, calOffset, bigEndian);
}

export function readAxisData(data: Uint8Array, axis: AxisDefinition, calOffset: number = 0, bigEndian: boolean = false): number[] {
    if (!axis.address || !axis.dataType) {
        // Generate index-based axis
        return Array.from({length: axis.points}, (_, i) => i);
    }

    const typeSize = DATA_TYPE_INFO[axis.dataType].size;
    const result: number[] = [];
    const factor = axis.factor ?? 1;
    const offset = axis.offset ?? 0;
    const dataOffset = axis.dataOffset ?? 0; // Byte offset where data starts

    for (let i = 0; i < axis.points; i++) {
        const addr = axis.address + dataOffset + i * typeSize;
        const raw = readValue(data, addr, axis.dataType, calOffset, bigEndian);
        result.push(applyConversion(raw, factor, offset, axis.formula));
    }
    return result;
}

export function writeAxisValue(
    data: Uint8Array,
    axis: AxisDefinition,
    index: number,
    physValue: number,
    calOffset: number = 0,
    bigEndian: boolean = false
): void {
    if (!axis.address || !axis.dataType) return;

    const typeSize = DATA_TYPE_INFO[axis.dataType].size;
    const factor = axis.factor ?? 1;
    const offset = axis.offset ?? 0;
    const dataOffset = axis.dataOffset ?? 0;

    const addr = axis.address + dataOffset + index * typeSize;
    const raw = reverseConversion(physValue, factor, offset, axis.formula);
    writeValue(data, addr, axis.dataType, raw, calOffset, bigEndian);
}

export function formatValue(value: number, decimals: number = 2): string {
    if (value == null || isNaN(value)) return '-';
    if (Number.isInteger(value) && Math.abs(value) < 10000) {
        return value.toString();
    }
    return value.toFixed(decimals);
}

// Determine consistent decimal places for a group of values
export function getConsistentDecimals(values: number[], maxDecimals: number = 2): number {
    let needsDecimals = false;
    for (const v of values) {
        if (v != null && !isNaN(v) && !Number.isInteger(v)) {
            needsDecimals = true;
            break;
        }
    }
    return needsDecimals ? maxDecimals : 0;
}

export function formatValueConsistent(value: number, decimals: number): string {
    if (value == null || isNaN(value)) return '-';
    return decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString();
}
