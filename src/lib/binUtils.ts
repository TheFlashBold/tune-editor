import { DataType, DATA_TYPE_INFO, Parameter, AxisDefinition } from '../types';

const BASE_OFFSET = 0xa0000000; // Simos ECU flash base address

export function readValue(data: Uint8Array, address: number, dataType: DataType): number {
  const offset = address - BASE_OFFSET;
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

export function writeValue(data: Uint8Array, address: number, dataType: DataType, value: number): void {
  const offset = address - BASE_OFFSET;
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

export function readParameterValue(data: Uint8Array, param: Parameter): number {
  const raw = readValue(data, param.address, param.dataType);
  return applyConversion(raw, param.factor, param.offset);
}

export function writeParameterValue(data: Uint8Array, param: Parameter, physValue: number): void {
  const raw = reverseConversion(physValue, param.factor, param.offset);
  writeValue(data, param.address, param.dataType, raw);
}

export function readTableData(data: Uint8Array, param: Parameter): number[][] {
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
      const raw = readValue(data, addr, param.dataType);
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
  physValue: number
): void {
  const rows = param.rows || 1;
  const cols = param.cols || 1;
  const typeSize = DATA_TYPE_INFO[param.dataType].size;
  const idx = param.columnDir ? (col * rows + row) : (row * cols + col);
  const addr = param.address + idx * typeSize;
  const raw = reverseConversion(physValue, param.factor, param.offset);
  writeValue(data, addr, param.dataType, raw);
}

export function readAxisData(data: Uint8Array, axis: AxisDefinition): number[] {
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
    const raw = readValue(data, addr, axis.dataType);
    result.push(applyConversion(raw, factor, offset));
  }
  return result;
}

export function writeAxisValue(
  data: Uint8Array,
  axis: AxisDefinition,
  index: number,
  physValue: number
): void {
  if (!axis.address || !axis.dataType) return;

  const typeSize = DATA_TYPE_INFO[axis.dataType].size;
  const factor = axis.factor ?? 1;
  const offset = axis.offset ?? 0;
  const dataOffset = axis.dataOffset ?? 0;

  const addr = axis.address + dataOffset + index * typeSize;
  const raw = reverseConversion(physValue, factor, offset);
  writeValue(data, addr, axis.dataType, raw);
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
