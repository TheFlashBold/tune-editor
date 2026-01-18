import { DataType, DATA_TYPE_INFO, Parameter, AxisDefinition, DefinitionVerification, BinaryMode } from '../types';

const BASE_OFFSET = 0xa0000000; // Simos ECU flash base address

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
 * Detect binary mode (full bin or CAL block only) and verify definition matches
 * Returns the detected mode and base offset to use for address calculations
 */
export function detectBinaryMode(
  data: Uint8Array,
  verification: DefinitionVerification
): { mode: BinaryMode; baseOffset: number; valid: boolean; found: string } {
  const { calOffset, expected, length = expected.length } = verification;

  // First check at offset 8 (CAL block only - after CAS header)
  const foundAtCal = readString(data, SIMOS_EPK_OFFSET, length);
  if (foundAtCal === expected) {
    return { mode: 'cal', baseOffset: 0, valid: true, found: foundAtCal };
  }

  // Then check at calOffset + 8 (full bin)
  const foundAtFull = readString(data, calOffset + SIMOS_EPK_OFFSET, length);
  if (foundAtFull === expected) {
    return { mode: 'full', baseOffset: calOffset, valid: true, found: foundAtFull };
  }

  // Not found at either location
  return {
    mode: 'full',
    baseOffset: calOffset,
    valid: false,
    found: foundAtCal || foundAtFull || ''
  };
}

/**
 * Read CAL version string from binary (typically at start of CAL block for Simos 12/18)
 */
export function readCalVersion(data: Uint8Array, offset: number, maxLength: number = 20): string {
  const bytes: number[] = [];
  for (let i = 0; i < maxLength && offset + i < data.length; i++) {
    const b = data[offset + i];
    // Stop at null or non-printable character
    if (b === 0 || b < 0x20 || b > 0x7e) break;
    bytes.push(b);
  }
  return String.fromCharCode(...bytes);
}

/**
 * Calculate file offset from memory address
 * @param address - Memory address (e.g. 0xa0340000)
 * @param calOffset - Where CAL block starts in full bin (e.g. 0x340000), 0 for CAL-only files
 */
export function addressToOffset(address: number, calOffset: number = 0): number {
  // Memory address → flash offset → file offset
  // e.g. 0xa0340100 → 0x340100 → 0x100 (if calOffset = 0x340000)
  return (address - BASE_OFFSET) - calOffset;
}

export function readValue(data: Uint8Array, address: number, dataType: DataType, calOffset: number = 0): number {
  const offset = addressToOffset(address, calOffset);
  if (offset < 0 || offset >= data.length) return 0;

  const info = DATA_TYPE_INFO[dataType];
  const view = new DataView(data.buffer, data.byteOffset + offset, info.size);

  switch (dataType) {
    case 'UBYTE': return view.getUint8(0);
    case 'SBYTE': return view.getInt8(0);
    case 'UWORD': return view.getUint16(0, true); // little-endian
    case 'SWORD': return view.getInt16(0, true);
    case 'ULONG': return view.getUint32(0, true);
    case 'SLONG': return view.getInt32(0, true);
    case 'FLOAT32': return view.getFloat32(0, true);
    default: return 0;
  }
}

export function writeValue(data: Uint8Array, address: number, dataType: DataType, value: number, calOffset: number = 0): void {
  const offset = addressToOffset(address, calOffset);
  if (offset < 0 || offset >= data.length) return;

  const info = DATA_TYPE_INFO[dataType];
  const view = new DataView(data.buffer, data.byteOffset + offset, info.size);

  switch (dataType) {
    case 'UBYTE': view.setUint8(0, Math.max(0, Math.min(255, value))); break;
    case 'SBYTE': view.setInt8(0, Math.max(-128, Math.min(127, value))); break;
    case 'UWORD': view.setUint16(0, Math.max(0, Math.min(65535, value)), true); break;
    case 'SWORD': view.setInt16(0, Math.max(-32768, Math.min(32767, value)), true); break;
    case 'ULONG': view.setUint32(0, value >>> 0, true); break;
    case 'SLONG': view.setInt32(0, value, true); break;
    case 'FLOAT32': view.setFloat32(0, value, true); break;
  }
}

export function applyConversion(raw: number, factor: number, offset: number): number {
  return raw * factor + offset;
}

export function reverseConversion(phys: number, factor: number, offset: number): number {
  return (phys - offset) / factor;
}

export function readParameterValue(data: Uint8Array, param: Parameter, calOffset: number = 0): number {
  const raw = readValue(data, param.address, param.dataType, calOffset);
  return applyConversion(raw, param.factor, param.offset);
}

export function writeParameterValue(data: Uint8Array, param: Parameter, physValue: number, calOffset: number = 0): void {
  const raw = reverseConversion(physValue, param.factor, param.offset);
  writeValue(data, param.address, param.dataType, raw, calOffset);
}

export function readTableData(data: Uint8Array, param: Parameter, calOffset: number = 0): number[][] {
  const rows = param.rows || 1;
  const cols = param.cols || 1;
  const typeSize = DATA_TYPE_INFO[param.dataType].size;
  const result: number[][] = [];

  for (let r = 0; r < rows; r++) {
    const row: number[] = [];
    for (let c = 0; c < cols; c++) {
      // COLUMN_DIR: data stored column-wise (c * rows + r)
      // ROW_DIR: data stored row-wise (r * cols + c)
      const idx = param.columnDir ? (c * rows + r) : (r * cols + c);
      const addr = param.address + idx * typeSize;
      const raw = readValue(data, addr, param.dataType, calOffset);
      row.push(applyConversion(raw, param.factor, param.offset));
    }
    result.push(row);
  }
  return result;
}

export function writeTableCell(
  data: Uint8Array,
  param: Parameter,
  row: number,
  col: number,
  physValue: number,
  calOffset: number = 0
): void {
  const rows = param.rows || 1;
  const cols = param.cols || 1;
  const typeSize = DATA_TYPE_INFO[param.dataType].size;
  const idx = param.columnDir ? (col * rows + row) : (row * cols + col);
  const addr = param.address + idx * typeSize;
  const raw = reverseConversion(physValue, param.factor, param.offset);
  writeValue(data, addr, param.dataType, raw, calOffset);
}

export function readAxisData(data: Uint8Array, axis: AxisDefinition, calOffset: number = 0): number[] {
  if (!axis.address || !axis.dataType) {
    // Generate index-based axis
    return Array.from({ length: axis.points }, (_, i) => i);
  }

  const typeSize = DATA_TYPE_INFO[axis.dataType].size;
  const result: number[] = [];
  const factor = axis.factor ?? 1;
  const offset = axis.offset ?? 0;
  const dataOffset = axis.dataOffset ?? 0; // Byte offset where data starts

  for (let i = 0; i < axis.points; i++) {
    const addr = axis.address + dataOffset + i * typeSize;
    const raw = readValue(data, addr, axis.dataType, calOffset);
    result.push(applyConversion(raw, factor, offset));
  }
  return result;
}

export function writeAxisValue(
  data: Uint8Array,
  axis: AxisDefinition,
  index: number,
  physValue: number,
  calOffset: number = 0
): void {
  if (!axis.address || !axis.dataType) return;

  const typeSize = DATA_TYPE_INFO[axis.dataType].size;
  const factor = axis.factor ?? 1;
  const offset = axis.offset ?? 0;
  const dataOffset = axis.dataOffset ?? 0;

  const addr = axis.address + dataOffset + index * typeSize;
  const raw = reverseConversion(physValue, factor, offset);
  writeValue(data, addr, axis.dataType, raw, calOffset);
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
