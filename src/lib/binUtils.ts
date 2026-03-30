import {
    DataType,
    DATA_TYPE_INFO,
    IDefinitionParameter,
    AxisDefinition,
    DefinitionVerification,
    BinaryMode
} from '../types';

const DEFAULT_BASE_ADDRESS = 0xa0000000; // Simos ECU flash base address (default)

/**
 * Read ASCII string from binary at given offset
 */
export function readString(data: Uint8Array, offset: number, length: number): string {
    if (offset < 0 || offset + length > data.length) return '';
    return String.fromCharCode(...data.slice(offset, offset + length));
}

// Simos CAL block header: "CAS" + 5-char ID, then EPK string starts at offset 8
const SIMOS_EPK_OFFSET = 8;

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

/**
 * Detect binary mode (full bin or CAL block only) and verify definition matches
 * Returns the detected mode and calOffset to use for address calculations
 *
 * Address calculation: fileOffset = address - baseAddress - calOffset
 * - Full bin: calOffset = 0 (addresses map directly after baseAddress subtraction)
 * - CAL-only: calOffset = verification.calOffset (need additional subtraction)
 * - DSG/TCU: calOffset = 0, baseAddress = 0 (direct file offsets)
 */
export function detectBinaryMode(
    data: Uint8Array,
    verification: DefinitionVerification
): { mode: BinaryMode; calOffset: number; valid: boolean; found: string } {
    const {calOffset, isDSG, expected, length = expected.length} = verification;

    // Check if this is a DSG/TCU definition (EPK like F45M, F49M, etc.)
    if (isDSG || isDsgEpk(expected)) {
        // DSG bins - use calOffset from definition (can be negative for bins with data offset)
        const dsgMatch = findDsgEpk(data, expected);
        if (dsgMatch) {
            return {mode: 'full', calOffset: calOffset, valid: true, found: dsgMatch.found};
        }
        // Fallback: assume DSG bin, use definition's calOffset
        return {mode: 'full', calOffset: calOffset, valid: false, found: ''};
    }

    // ECU (Simos) detection
    // First check at offset 8 (CAL block only - after CAS header)
    const foundAtCal = readString(data, SIMOS_EPK_OFFSET, length);
    if (foundAtCal === expected) {
        // CAL-only: need to subtract calOffset from addresses to get file offset
        return {mode: 'cal', calOffset: calOffset, valid: true, found: foundAtCal};
    }

    // Then check at calOffset + 8 (full bin)
    const foundAtFull = readString(data, calOffset + SIMOS_EPK_OFFSET, length);
    if (foundAtFull === expected) {
        // Full bin: addresses map directly (no additional subtraction needed)
        return {mode: 'full', calOffset: 0, valid: true, found: foundAtFull};
    }

    // Not found at either location - assume CAL-only as fallback
    return {
        mode: 'cal',
        calOffset: calOffset,
        valid: false,
        found: foundAtCal || foundAtFull || ''
    };
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
    for (const offset of CAL_OFFSETS) {
        if (data.length > (offset + 0x60 + 9)) {
            const boxCode = readStringSafe(data, offset + 0x60, 12, 9);
            if (boxCode) {
                return boxCode;
            }
        }
    }

    // cal simos 18.1/18.4/18.10
    if (CAL_SIZES.includes(data.length)) {
        const boxCode = readStringSafe(data, 0x60, 12, 9);
        if (boxCode) {
            return boxCode;
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

    // DQ250 MQB
    if (data.length > (0x3FFBA + 10)) {
        const boxCode = readStringSafe(data, 0x3FFB0, 10, 10);
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

export function readEPK(data: Uint8Array) {
    for (const offset of CAL_OFFSETS) {
        if (data.length > (offset + 0x2000)) {
            const epk = readStringSafe(data, offset + 0x02, 6, 6);
            if (epk) {
                return epk;
            }
        }
    }

    // cal simos 12.1/18.1/18.4/18.10
    if (CAL_SIZES.includes(data.length)) {
        const epk = readStringSafe(data, 0x02, 6, 6);
        if (epk) {
            return epk;
        }
    }

    // DQ381
    if (data.length > (0x16C00E + 2)) {
        const epk = readStringSafe(data, 0x16C00E, 2, 2);
        if (epk) {
            return epk;
        }
    }

    // DQ250 MQB
    if (data.length > (0x3FFE0 + 4)) {
        const epk = readStringSafe(data, 0x3FFE0, 4, 4);
        if (epk) {
            return epk;
        }
    }

    // Bosch MED/EDC: "CB " EPK in CBOOT header, or ECU type string
    for (const region of [{start: 0x4090, len: 40}, {start: 0x14090, len: 40}]) {
        if (data.length > (region.start + region.len)) {
            const s = readStringSafe(data, region.start, region.len, 6);
            if (s?.startsWith('CB ')) {
                return s;
            }
        }
    }

    // Bosch: EDC17/MED17 type string
    for (const offset of [0x38721, 0x1C94B7]) {
        if (data.length > (offset + 6)) {
            const s = readStringSafe(data, offset, 16, 6);
            if (s && /^(EDC|MED)\d/.test(s)) {
                return s;
            }
        }
    }
}

/**
 * Calculate file offset from memory address
 * @param address - Memory address (e.g. 0xa0340000) or direct file offset (e.g. 0x69416 for KP files)
 * @param calOffset - Offset to subtract (positive) or add (negative) for address adjustment
 * @param baseAddress - Memory base address to subtract (0xa0000000 for Simos, 0 for DSG/direct offsets)
 */
export function addressToOffset(address: number, calOffset: number = 0, baseAddress: number = DEFAULT_BASE_ADDRESS): number {
    // Formula: fileOffset = address - baseAddress - calOffset
    // - For Simos full bin: (0xa0800100 - 0xa0000000) - 0 = 0x800100
    // - For Simos CAL-only: (0xa0800100 - 0xa0000000) - 0x800000 = 0x100
    // - For DSG (baseAddress=0): 0x69416 - 0 - 0 = 0x69416
    // - For DSG with negative calOffset: 0x328ec - 0 - (-0x10000) = 0x428ec
    return (address - baseAddress) - calOffset;
}

export function readValue(data: Uint8Array, address: number, dataType: DataType, calOffset: number = 0, baseAddress: number = DEFAULT_BASE_ADDRESS, bigEndian: boolean = false): number {
    const offset = addressToOffset(address, calOffset, baseAddress);
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

export function writeValue(data: Uint8Array, address: number, dataType: DataType, value: number, calOffset: number = 0, baseAddress: number = DEFAULT_BASE_ADDRESS, bigEndian: boolean = false): void {
    const offset = addressToOffset(address, calOffset, baseAddress);
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

export function readParameterValue(data: Uint8Array, param: IDefinitionParameter, calOffset: number = 0, baseAddress: number = DEFAULT_BASE_ADDRESS, bigEndian: boolean = false): number {
    const raw = readValue(data, param.address, param.dataType, calOffset, baseAddress, bigEndian);
    return applyConversion(raw, param.factor, param.offset, param.formula);
}

export function writeParameterValue(data: Uint8Array, param: IDefinitionParameter, physValue: number, calOffset: number = 0, baseAddress: number = DEFAULT_BASE_ADDRESS, bigEndian: boolean = false): void {
    const raw = reverseConversion(physValue, param.factor, param.offset, param.formula);
    writeValue(data, param.address, param.dataType, raw, calOffset, baseAddress, bigEndian);
}

export function readTableData(data: Uint8Array, param: IDefinitionParameter, calOffset: number = 0, baseAddress: number = DEFAULT_BASE_ADDRESS, bigEndian: boolean = false, debug: boolean = false): number[][] {
    const rows = param.rows || 1;
    const cols = param.cols || 1;
    const typeSize = DATA_TYPE_INFO[param.dataType].size;
    const dataOffset = param.dataOffset ?? 0; // Byte offset where table data starts (for STD_AXIS)
    const result: number[][] = [];

    if (debug) {
        console.log('readTableData debug:', {
            name: param.name,
            address: '0x' + param.address.toString(16),
            calOffset: '0x' + calOffset.toString(16),
            baseAddress: '0x' + baseAddress.toString(16),
            dataOffset,
            rows, cols,
            columnDir: param.columnDir,
            factor: param.factor,
            offset: param.offset,
            typeSize,
            bigEndian,
        });
    }

    for (let r = 0; r < rows; r++) {
        const row: number[] = [];
        for (let c = 0; c < cols; c++) {
            // COLUMN_DIR: data stored column-wise (c * rows + r) - all of col 0, then col 1, etc.
            // ROW_DIR: data stored row-wise (r * cols + c) - all of row 0, then row 1, etc.
            const idx = param.columnDir ? (c * rows + r) : (r * cols + c);
            const addr = param.address + dataOffset + idx * typeSize;
            const raw = readValue(data, addr, param.dataType, calOffset, baseAddress, bigEndian);
            const phys = applyConversion(raw, param.factor, param.offset, param.formula);
            if (debug && r < 3 && c < 4) {
                const fileOffset = addressToOffset(addr, calOffset, baseAddress);
                console.log(`  [${r},${c}] idx=${idx} addr=0x${addr.toString(16)} fileOffset=0x${fileOffset.toString(16)} raw=${raw} phys=${phys.toFixed(4)}`);
            }
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
    baseAddress: number = DEFAULT_BASE_ADDRESS,
    bigEndian: boolean = false
): void {
    const rows = param.rows || 1;
    const cols = param.cols || 1;
    const typeSize = DATA_TYPE_INFO[param.dataType].size;
    const dataOffset = param.dataOffset ?? 0; // Byte offset where table data starts (for STD_AXIS)
    const idx = param.columnDir ? (col * rows + row) : (row * cols + col);
    const addr = param.address + dataOffset + idx * typeSize;
    const raw = reverseConversion(physValue, param.factor, param.offset, param.formula);
    writeValue(data, addr, param.dataType, raw, calOffset, baseAddress, bigEndian);
}

export function readAxisData(data: Uint8Array, axis: AxisDefinition, calOffset: number = 0, baseAddress: number = DEFAULT_BASE_ADDRESS, bigEndian: boolean = false): number[] {
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
        const raw = readValue(data, addr, axis.dataType, calOffset, baseAddress, bigEndian);
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
    baseAddress: number = DEFAULT_BASE_ADDRESS,
    bigEndian: boolean = false
): void {
    if (!axis.address || !axis.dataType) return;

    const typeSize = DATA_TYPE_INFO[axis.dataType].size;
    const factor = axis.factor ?? 1;
    const offset = axis.offset ?? 0;
    const dataOffset = axis.dataOffset ?? 0;

    const addr = axis.address + dataOffset + index * typeSize;
    const raw = reverseConversion(physValue, factor, offset, axis.formula);
    writeValue(data, addr, axis.dataType, raw, calOffset, baseAddress, bigEndian);
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
