export type GenericObject = Record<string, any>;

export type DataType = 'UBYTE' | 'SBYTE' | 'UWORD' | 'SWORD' | 'ULONG' | 'SLONG' | 'FLOAT32';

/** Rational function coefficients: physical = (a*X + b) / (c + d*X) */
export interface RationalFormula {
    a: number;
    b: number;
    c: number;
    d: number;
}

export interface ILoadedBin {
    name: string;
    data: Uint8Array,
    modified?: boolean,
    type?: "CAL" | "FULL",
    definition?: Definition,
    calOffset?: number,
}

export interface AxisDefinition {
    type: 'STD_AXIS' | 'COM_AXIS' | 'FIX_AXIS';
    points: number;
    min: number;
    max: number;
    unit: string;
    address?: number;
    dataType?: DataType;
    factor?: number;
    offset?: number;
    formula?: RationalFormula;  // Non-linear conversion: (a*X+b)/(c+d*X)
    dataOffset?: number; // Byte offset where axis data starts
    labels?: string[];   // Fixed labels for FIX_AXIS (e.g. ["1->2", "2->3", "3->4"])
}

export interface IDefinitionParameter {
    name: string;
    description: string;
    address: number;
    type: 'VALUE' | 'CURVE' | 'MAP';
    dataType: DataType;
    unit: string;
    min: number;
    max: number;
    factor: number;
    offset: number;
    formula?: RationalFormula;  // Non-linear conversion: (a*X+b)/(c+d*X)
    xAxis?: AxisDefinition;
    yAxis?: AxisDefinition;
    rows?: number;
    cols?: number;
    columnDir?: boolean; // true if data is stored column-wise
    dataOffset?: number; // Byte offset where table data starts (for STD_AXIS)
    categories: string[];
    customName?: string;
    bitLabels?: Record<string, string>;  // bit index → label, e.g. {"0": "MIS", "3": "CAT"}
}

export interface DefinitionVerification {
    calOffset: number;     // Offset in full bin where CAL block starts (e.g. 0x340000)
    expected: string;      // Expected string at start of CAL block (e.g. "SC8LB4")
    length?: number;       // Length to check (default: expected.length)
    isDSG?: boolean;
}

export interface Definition {
    name: string;
    version: string;
    verification?: DefinitionVerification;  // Check to verify definition matches file
    offset?: number;  // CAL block offset in full bin (e.g., 0x30000 for DSG, 0x800000 for Simos18)
    baseAddress?: number;  // Memory base address to subtract from parameter addresses (0xa0000000 for Simos, 0 for DSG/direct offsets)
    bigEndian?: boolean;  // True if binary data is stored in big-endian (Motorola) byte order (e.g., DSG/TCU)
    parameters: IDefinitionParameter[];
}

export type BinaryMode = 'full' | 'cal';  // full bin or just CAL block

export interface CellDiff {
    row: number;
    col: number;
    original: number;
    current: number;
}

export interface AxisDiff {
    axis: 'x' | 'y';
    original: number[];
    current: number[];
    changedIndices: number[];
}

export interface ParamDiff {
    param: IDefinitionParameter;
    originalValue: number | number[][];
    currentValue: number | number[][];
    cellDiffs?: CellDiff[];
    axisDiffs?: AxisDiff[];
    xAxis?: number[];
    yAxis?: number[];
}

export const DATA_TYPE_INFO: Record<DataType, { size: number; signed: boolean; float: boolean }> = {
    UBYTE: {size: 1, signed: false, float: false},
    SBYTE: {size: 1, signed: true, float: false},
    UWORD: {size: 2, signed: false, float: false},
    SWORD: {size: 2, signed: true, float: false},
    ULONG: {size: 4, signed: false, float: false},
    SLONG: {size: 4, signed: true, float: false},
    FLOAT32: {size: 4, signed: true, float: true},
};
