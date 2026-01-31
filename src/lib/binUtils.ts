import { DataType, DATA_TYPE_INFO, Parameter, AxisDefinition, DefinitionVerification, BinaryMode } from '../types';

const DEFAULT_BASE_ADDRESS = 0xa0000000; // Simos ECU flash base address (default)

// ECC pattern for TC1797/Simos flash:
// - SEC-DED (Single Error Correction, Double Error Detection)
// - 8-bit ECC per 64-bit (8 bytes) of data
// - All-zero data = all-zero ECC, all-one data = all-one ECC
//
// In raw flash dumps, ECC appears to be at positions 30-31 and 62-63 within 64-byte blocks
// This suggests: 30 bytes data + 2 bytes ECC + 30 bytes data + 2 bytes ECC = 64 bytes
const ECC_BLOCK_SIZE = 64;
const ECC_DATA_SIZE = 60; // 60 bytes of usable data per 64-byte block
const ECC_POSITIONS = [30, 31, 62, 63]; // Positions of ECC bytes within a 64-byte block

/**
 * SEC-DED Hamming code calculation for 64-bit data
 * Based on TC1797 flash ECC (8-bit ECC per 64-bit data)
 */
function calculateEcc8(data: Uint8Array, offset: number): number {
  // Read 8 bytes (64 bits) of data
  let d = 0n;
  for (let i = 0; i < 8 && offset + i < data.length; i++) {
    d |= BigInt(data[offset + i]) << BigInt(i * 8);
  }

  // SEC-DED parity calculation
  // Parity bits cover specific bit positions based on Hamming code
  let ecc = 0;

  // P0 covers bits where bit 0 of position is 1 (1,3,5,7,9,...)
  // P1 covers bits where bit 1 of position is 1 (2,3,6,7,10,11,...)
  // P2 covers bits where bit 2 of position is 1 (4,5,6,7,12,13,14,15,...)
  // etc.

  for (let bit = 0; bit < 64; bit++) {
    if ((d >> BigInt(bit)) & 1n) {
      // This data bit is 1, XOR it into the appropriate parity bits
      const pos = bit + 1; // 1-indexed position (skip parity positions in real Hamming)
      for (let p = 0; p < 7; p++) {
        if ((pos >> p) & 1) {
          ecc ^= (1 << p);
        }
      }
      // Overall parity (P7)
      ecc ^= 0x80;
    }
  }

  return ecc;
}

/**
 * Decode ECC and correct single-bit errors in 8 bytes of data
 * Returns corrected data bytes, or null if uncorrectable
 */
export function decodeEcc8(data: Uint8Array, dataOffset: number, storedEcc: number): Uint8Array | null {
  const result = data.slice(dataOffset, dataOffset + 8);
  const calculatedEcc = calculateEcc8(data, dataOffset);
  const syndrome = calculatedEcc ^ storedEcc;

  if (syndrome === 0) {
    // No error
    return result;
  }

  // Check overall parity (bit 7)
  const overallParity = (syndrome & 0x80) !== 0;
  const errorPos = syndrome & 0x7F;

  if (overallParity && errorPos > 0 && errorPos <= 64) {
    // Single-bit error in data - correct it
    const bitIndex = errorPos - 1;
    const byteIndex = Math.floor(bitIndex / 8);
    const bitInByte = bitIndex % 8;
    result[byteIndex] ^= (1 << bitInByte);
    return result;
  } else if (overallParity && errorPos === 0) {
    // Single-bit error in ECC itself - data is correct
    return result;
  } else {
    // Double-bit error or uncorrectable
    return null;
  }
}

/**
 * Check if a file offset lands on an ECC byte position
 */
export function isEccPosition(fileOffset: number): boolean {
  const posInBlock = fileOffset % ECC_BLOCK_SIZE;
  return ECC_POSITIONS.includes(posInBlock);
}

/**
 * Convert a logical offset (A2L address space, no ECC) to a physical offset (raw file with ECC)
 *
 * ECC layout: every 64 physical bytes contain 62 bytes of data + 2 ECC bytes
 * - Bytes 0-29: data (30 bytes)
 * - Byte 30: ECC (1 byte)
 * - Bytes 31-61: data (31 bytes)
 * - Byte 62: ECC (1 byte)
 * - Byte 63: data (1 byte)
 *
 * A2L addresses assume data is contiguous (no ECC). When reading from raw flash,
 * we need to skip the ECC bytes.
 */
export function logicalToPhysical(logicalOffset: number): number {
  // Every 62 logical bytes map to 64 physical bytes
  const block = Math.floor(logicalOffset / ECC_DATA_SIZE);
  const posInBlock = logicalOffset % ECC_DATA_SIZE;

  if (posInBlock < 30) {
    // Before first ECC byte, maps directly
    return block * ECC_BLOCK_SIZE + posInBlock;
  } else if (posInBlock < 61) {
    // Between first and second ECC byte, offset by 1
    return block * ECC_BLOCK_SIZE + posInBlock + 1;
  } else {
    // After second ECC byte (position 61), offset by 2
    return block * ECC_BLOCK_SIZE + posInBlock + 2;
  }
}

/**
 * Convert a physical offset (raw file with ECC) to a logical offset (A2L address space)
 * Returns -1 if the physical offset is an ECC byte position
 */
export function physicalToLogical(physicalOffset: number): number {
  const block = Math.floor(physicalOffset / ECC_BLOCK_SIZE);
  const posInBlock = physicalOffset % ECC_BLOCK_SIZE;

  if (posInBlock < 30) {
    return block * ECC_DATA_SIZE + posInBlock;
  } else if (posInBlock >= 32 && posInBlock < 62) {
    return block * ECC_DATA_SIZE + (posInBlock - 2);
  } else {
    // Position 30-31 or 62-63: ECC byte
    return -1;
  }
}

/**
 * Strip ECC bytes from raw flash data
 * Converts 64-byte blocks with ECC to 60-byte pure data blocks
 */
export function stripEccBytes(data: Uint8Array): Uint8Array {
  const numBlocks = Math.ceil(data.length / ECC_BLOCK_SIZE);
  const result = new Uint8Array(numBlocks * ECC_DATA_SIZE);

  for (let block = 0; block < numBlocks; block++) {
    const srcOffset = block * ECC_BLOCK_SIZE;
    const dstOffset = block * ECC_DATA_SIZE;

    // Copy first 30 bytes (before first ECC)
    for (let i = 0; i < 30 && srcOffset + i < data.length; i++) {
      result[dstOffset + i] = data[srcOffset + i];
    }

    // Copy next 30 bytes (after first ECC, before second ECC)
    for (let i = 0; i < 30 && srcOffset + 32 + i < data.length; i++) {
      result[dstOffset + 30 + i] = data[srcOffset + 32 + i];
    }
  }

  return result;
}

/**
 * Detect if binary data likely contains ECC bytes
 * Checks for 0xFF patterns at expected ECC positions
 */
export function detectEccPresence(data: Uint8Array, sampleCount: number = 10): { hasEcc: boolean; confidence: number } {
  let eccPatternCount = 0;
  const step = Math.floor(data.length / sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const blockStart = Math.floor((i * step) / ECC_BLOCK_SIZE) * ECC_BLOCK_SIZE;
    if (blockStart + 63 >= data.length) continue;

    // Check if ECC positions contain typical ECC values (often 0xFF or computed values)
    const ecc1 = (data[blockStart + 30] << 8) | data[blockStart + 31];
    const ecc2 = (data[blockStart + 62] << 8) | data[blockStart + 63];

    // ECC bytes are often 0xFFxx or 0x00xx patterns
    if ((ecc1 & 0xFF00) === 0xFF00 || (ecc2 & 0xFF00) === 0xFF00 ||
        (ecc1 & 0xFF00) === 0x0000 || (ecc2 & 0xFF00) === 0x0000) {
      eccPatternCount++;
    }
  }

  const confidence = eccPatternCount / sampleCount;
  return { hasEcc: confidence > 0.5, confidence };
}

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
  return /^[FV][A-Z0-9]{3}$/.test(epk);
}

/**
 * Search for DSG/TCU EPK pattern in binary data
 * Pattern: HWNumber_Version_Code EPK (e.g., "0D9300012H_4518_OTJD F45M")
 * DSG bins have version info block around 0x4ff00-0x50100
 */
function findDsgEpk(data: Uint8Array, expected: string): { offset: number; found: string } | null {
  // DSG version info is typically around offset 0x4ff00-0x50100
  // Search multiple regions where EPK might appear
  const searchRegions = [
    { start: 0, length: 4096 },           // First 4KB
    { start: 0x4ff00, length: 512 },      // DSG version block ~320KB
    { start: 0x30000, length: 4096 },     // Some DSG files have info here
  ];

  for (const region of searchRegions) {
    if (region.start >= data.length) continue;

    const end = Math.min(region.start + region.length, data.length);
    const slice = data.slice(region.start, end);
    const text = String.fromCharCode(...slice);

    // Look for the expected EPK preceded by space or underscore
    const patterns = [
      new RegExp(`[\\s_](${expected})(?:[\\s\\x00]|$)`),  // EPK after space/underscore
      new RegExp(`(${expected})[\\s\\x00]`),              // EPK followed by space/null
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return { offset: region.start + text.indexOf(match[1]), found: match[1] };
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
  const { calOffset, expected, length = expected.length } = verification;

  // Check if this is a DSG/TCU definition (EPK like F45M, F49M, etc.)
  if (isDsgEpk(expected)) {
    // DSG bins - use calOffset from definition (can be negative for bins with data offset)
    const dsgMatch = findDsgEpk(data, expected);
    if (dsgMatch) {
      return { mode: 'cal', calOffset: calOffset, valid: true, found: dsgMatch.found };
    }
    // Fallback: assume DSG bin, use definition's calOffset
    return { mode: 'cal', calOffset: calOffset, valid: false, found: '' };
  }

  // ECU (Simos) detection
  // First check at offset 8 (CAL block only - after CAS header)
  const foundAtCal = readString(data, SIMOS_EPK_OFFSET, length);
  if (foundAtCal === expected) {
    // CAL-only: need to subtract calOffset from addresses to get file offset
    return { mode: 'cal', calOffset: calOffset, valid: true, found: foundAtCal };
  }

  // Then check at calOffset + 8 (full bin)
  const foundAtFull = readString(data, calOffset + SIMOS_EPK_OFFSET, length);
  if (foundAtFull === expected) {
    // Full bin: addresses map directly (no additional subtraction needed)
    return { mode: 'full', calOffset: 0, valid: true, found: foundAtFull };
  }

  // Not found at either location - assume CAL-only as fallback
  return {
    mode: 'cal',
    calOffset: calOffset,
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
    case 'UBYTE': return view.getUint8(0);
    case 'SBYTE': return view.getInt8(0);
    case 'UWORD': return view.getUint16(0, littleEndian);
    case 'SWORD': return view.getInt16(0, littleEndian);
    case 'ULONG': return view.getUint32(0, littleEndian);
    case 'SLONG': return view.getInt32(0, littleEndian);
    case 'FLOAT32': return view.getFloat32(0, littleEndian);
    default: return 0;
  }
}

export function writeValue(data: Uint8Array, address: number, dataType: DataType, value: number, calOffset: number = 0, baseAddress: number = DEFAULT_BASE_ADDRESS, bigEndian: boolean = false): void {
  const offset = addressToOffset(address, calOffset, baseAddress);
  if (offset < 0 || offset >= data.length) return;

  const info = DATA_TYPE_INFO[dataType];
  const view = new DataView(data.buffer, data.byteOffset + offset, info.size);
  const littleEndian = !bigEndian;

  switch (dataType) {
    case 'UBYTE': view.setUint8(0, Math.max(0, Math.min(255, value))); break;
    case 'SBYTE': view.setInt8(0, Math.max(-128, Math.min(127, value))); break;
    case 'UWORD': view.setUint16(0, Math.max(0, Math.min(65535, value)), littleEndian); break;
    case 'SWORD': view.setInt16(0, Math.max(-32768, Math.min(32767, value)), littleEndian); break;
    case 'ULONG': view.setUint32(0, value >>> 0, littleEndian); break;
    case 'SLONG': view.setInt32(0, value, littleEndian); break;
    case 'FLOAT32': view.setFloat32(0, value, littleEndian); break;
  }
}

export function applyConversion(raw: number, factor: number, offset: number): number {
  return raw * factor + offset;
}

export function reverseConversion(phys: number, factor: number, offset: number): number {
  return (phys - offset) / factor;
}

export function readParameterValue(data: Uint8Array, param: Parameter, calOffset: number = 0, baseAddress: number = DEFAULT_BASE_ADDRESS, bigEndian: boolean = false): number {
  const raw = readValue(data, param.address, param.dataType, calOffset, baseAddress, bigEndian);
  return applyConversion(raw, param.factor, param.offset);
}

export function writeParameterValue(data: Uint8Array, param: Parameter, physValue: number, calOffset: number = 0, baseAddress: number = DEFAULT_BASE_ADDRESS, bigEndian: boolean = false): void {
  const raw = reverseConversion(physValue, param.factor, param.offset);
  writeValue(data, param.address, param.dataType, raw, calOffset, baseAddress, bigEndian);
}

export function readTableData(data: Uint8Array, param: Parameter, calOffset: number = 0, baseAddress: number = DEFAULT_BASE_ADDRESS, bigEndian: boolean = false, debug: boolean = false): number[][] {
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
      const phys = applyConversion(raw, param.factor, param.offset);
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
  param: Parameter,
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
  const raw = reverseConversion(physValue, param.factor, param.offset);
  writeValue(data, addr, param.dataType, raw, calOffset, baseAddress, bigEndian);
}

export function readAxisData(data: Uint8Array, axis: AxisDefinition, calOffset: number = 0, baseAddress: number = DEFAULT_BASE_ADDRESS, bigEndian: boolean = false): number[] {
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
    const raw = readValue(data, addr, axis.dataType, calOffset, baseAddress, bigEndian);
    result.push(applyConversion(raw, factor, offset));
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
  const raw = reverseConversion(physValue, factor, offset);
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

// Debug function to show all addresses and values for a table
export function debugTableAddresses(data: Uint8Array, param: Parameter, calOffset: number = 0): void {
  const rows = param.rows || 1;
  const cols = param.cols || 1;
  const typeSize = DATA_TYPE_INFO[param.dataType].size;
  const dataOffset = param.dataOffset ?? 0;

  console.log(`=== Address dump for ${param.name} ===`);
  console.log(`Base: 0x${param.address.toString(16)}, dataOffset: ${dataOffset}, calOffset: 0x${calOffset.toString(16)}`);
  console.log(`Dimensions: ${cols}x${rows}, typeSize: ${typeSize}, columnDir: ${param.columnDir}`);
  console.log('');

  // Show addresses where 0xFF00 appears
  const badAddresses: string[] = [];

  for (let r = 0; r < rows; r++) {
    let rowStr = `Row ${r.toString().padStart(2)}: `;
    for (let c = 0; c < cols; c++) {
      const idx = param.columnDir ? (c * rows + r) : (r * cols + c);
      const addr = param.address + dataOffset + idx * typeSize;
      const fileOffset = addressToOffset(addr, calOffset);
      const raw = readValue(data, addr, param.dataType, calOffset);

      if (raw === 0xFF00 || raw === 65280) {
        badAddresses.push(`[${r},${c}] addr=0x${addr.toString(16)} file=0x${fileOffset.toString(16)} idx=${idx}`);
        rowStr += `**${fileOffset.toString(16).padStart(6)}** `;
      } else {
        rowStr += `${fileOffset.toString(16).padStart(6)} `;
      }
    }
    console.log(rowStr);
  }

  console.log('');
  if (badAddresses.length > 0) {
    console.log('Addresses with 0xFF00:');
    badAddresses.forEach(a => console.log('  ' + a));

    // Check if there's a pattern in file offsets
    const fileOffsets = badAddresses.map(a => parseInt(a.match(/file=0x([0-9a-f]+)/)?.[1] || '0', 16));
    if (fileOffsets.length >= 2) {
      const diffs = fileOffsets.slice(1).map((v, i) => v - fileOffsets[i]);
      console.log('');
      console.log('File offset differences between bad values:', diffs.map(d => '0x' + d.toString(16)).join(', '));
    }
  }
}

// Debug function to search for clean data by trying different offsets
export function debugFindDataOffset(data: Uint8Array, param: Parameter, calOffset: number = 0): void {
  const cols = param.cols || 1;
  const typeSize = DATA_TYPE_INFO[param.dataType].size;
  const baseFileOffset = addressToOffset(param.address, calOffset);

  console.log(`=== Searching for clean data offset for ${param.name} ===`);
  console.log(`Base address: 0x${param.address.toString(16)}, file offset: 0x${baseFileOffset.toString(16)}`);
  console.log(`Looking for data without 0xFF00 values in first ${cols} entries...`);
  console.log('');

  // Try offsets from -16 to +16 bytes
  for (let byteOffset = -16; byteOffset <= 16; byteOffset += 2) {
    const testOffset = baseFileOffset + byteOffset;
    if (testOffset < 0) continue;

    let hasFF00 = false;
    const values: number[] = [];
    for (let i = 0; i < cols && !hasFF00; i++) {
      const idx = testOffset + i * typeSize;
      if (idx + typeSize > data.length) { hasFF00 = true; break; }
      const raw = data[idx] | (data[idx + 1] << 8); // little-endian UWORD
      if (raw === 0xFF00 || raw === 0x00FF) hasFF00 = true;
      values.push(raw);
    }

    const status = hasFF00 ? '❌' : '✓ ';
    const physValues = values.slice(0, 6).map(r =>
      (r * (param.factor || 1) + (param.offset || 0)).toFixed(2)
    );
    console.log(`  offset ${byteOffset >= 0 ? '+' : ''}${byteOffset}: ${status} [${physValues.join(', ')}...]`);
  }
}

// Debug function to compare ROW_DIR vs COLUMN_DIR layouts
export function debugLayoutComparison(data: Uint8Array, param: Parameter, calOffset: number = 0): void {
  const rows = param.rows || 1;
  const cols = param.cols || 1;
  const typeSize = DATA_TYPE_INFO[param.dataType].size;
  const dataOffset = param.dataOffset ?? 0;

  console.log(`=== Layout comparison for ${param.name} ===`);
  console.log(`Dimensions: ${cols}x${rows} (cols x rows), typeSize=${typeSize}, dataOffset=${dataOffset}`);
  console.log(`Base address: 0x${param.address.toString(16)}, calOffset: 0x${calOffset.toString(16)}`);
  console.log(`columnDir in definition: ${param.columnDir}`);
  console.log('');

  const fileOffset = addressToOffset(param.address + dataOffset, calOffset);

  // Show raw hex bytes for first 40 bytes
  console.log('Raw hex (first 40 bytes):');
  let hexLine = '';
  for (let i = 0; i < 40 && fileOffset + i < data.length; i++) {
    hexLine += data[fileOffset + i].toString(16).padStart(2, '0') + ' ';
    if ((i + 1) % 16 === 0) {
      console.log(`  ${hexLine}`);
      hexLine = '';
    }
  }
  if (hexLine) console.log(`  ${hexLine}`);
  console.log('');

  // Read first few values in memory order
  console.log('Raw memory (first 20 UWORD values):');
  const rawValues: number[] = [];
  for (let i = 0; i < 20 && i < rows * cols; i++) {
    const addr = param.address + dataOffset + i * typeSize;
    const raw = readValue(data, addr, param.dataType, calOffset);
    const phys = applyConversion(raw, param.factor, param.offset);
    rawValues.push(phys);
    const hexVal = raw.toString(16).padStart(4, '0').toUpperCase();
    console.log(`  idx ${i.toString().padStart(2)}: raw=${raw.toString().padStart(5)} (0x${hexVal}) phys=${phys.toFixed(4)}`);
  }
  console.log('');

  // Check for stride pattern - look for repeated values at regular intervals
  console.log('Checking for stride patterns (looking for 0xFF00 or similar markers):');
  const markers: number[] = [];
  for (let i = 0; i < Math.min(40, rows * cols); i++) {
    const addr = param.address + dataOffset + i * typeSize;
    const raw = readValue(data, addr, param.dataType, calOffset);
    if (raw === 65280 || raw === 0xFF00 || raw === 0x00FF) {
      markers.push(i);
    }
  }
  if (markers.length > 0) {
    console.log(`  Found 0xFF00 at indices: ${markers.join(', ')}`);
    if (markers.length >= 2) {
      const stride = markers[1] - markers[0];
      console.log(`  Stride between markers: ${stride} (cols=${cols}, rows=${rows})`);
      if (stride === cols) {
        console.log('  ⚠️ Stride matches column count! Data may have per-row headers.');
      } else if (stride === cols + 1) {
        console.log('  ⚠️ Stride is cols+1! Each row may have 1 extra value (header/padding).');
      }
    }
  } else {
    console.log('  No obvious markers found in first 40 values');
  }
  console.log('');

  // Show how these map to cells in ROW_DIR
  console.log('As ROW_DIR (row-major):');
  console.log('  Row 0:', rawValues.slice(0, Math.min(cols, rawValues.length)).map(v => v.toFixed(2)).join(', '));
  if (rows > 1 && rawValues.length > cols) {
    console.log('  Row 1:', rawValues.slice(cols, Math.min(2 * cols, rawValues.length)).map(v => v.toFixed(2)).join(', '));
  }
}

// Debug function to dump hex bytes at a given address
export function debugHexDump(data: Uint8Array, address: number, length: number, calOffset: number = 0): string {
  const fileOffset = addressToOffset(address, calOffset);
  const lines: string[] = [];
  lines.push(`Address: 0x${address.toString(16)} -> File offset: 0x${fileOffset.toString(16)} (calOffset: 0x${calOffset.toString(16)})`);

  for (let i = 0; i < length; i += 16) {
    const bytes: string[] = [];
    const ascii: string[] = [];
    for (let j = 0; j < 16 && i + j < length; j++) {
      const idx = fileOffset + i + j;
      if (idx >= 0 && idx < data.length) {
        const b = data[idx];
        bytes.push(b.toString(16).padStart(2, '0'));
        ascii.push(b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.');
      } else {
        bytes.push('??');
        ascii.push('?');
      }
    }
    lines.push(`${(fileOffset + i).toString(16).padStart(6, '0')}: ${bytes.join(' ')}  ${ascii.join('')}`);
  }
  return lines.join('\n');
}

/**
 * Debug function to analyze ECC layout in a 64-byte block
 * Shows data and suspected ECC positions
 */
export function debugEccBlock(data: Uint8Array, blockOffset: number): void {
  console.log(`=== ECC Block Analysis at offset 0x${blockOffset.toString(16)} ===`);

  // Show all 64 bytes with position markers
  for (let row = 0; row < 4; row++) {
    const rowOffset = blockOffset + row * 16;
    let hex = '';
    let positions = '';
    for (let col = 0; col < 16; col++) {
      const pos = row * 16 + col;
      const idx = rowOffset + col;
      const byte = idx < data.length ? data[idx] : 0;
      const isEcc = ECC_POSITIONS.includes(pos);
      hex += (isEcc ? '[' : ' ') + byte.toString(16).padStart(2, '0') + (isEcc ? ']' : ' ');
      positions += pos.toString().padStart(4);
    }
    console.log(`  ${hex}`);
    console.log(`  ${positions}`);
  }

  // Analyze potential 8-byte blocks with ECC
  console.log('\n8-byte block analysis (assuming 1 byte ECC per 8 bytes data):');
  for (let i = 0; i < 7; i++) {
    const dataStart = blockOffset + i * 9;
    const eccPos = dataStart + 8;
    if (eccPos < data.length) {
      const storedEcc = data[eccPos];
      const calcEcc = calculateEcc8(data, dataStart);
      const match = storedEcc === calcEcc ? '✓' : '✗';
      console.log(`  Block ${i}: data@${dataStart.toString(16)}, ECC@${eccPos.toString(16)}: stored=0x${storedEcc.toString(16).padStart(2,'0')}, calc=0x${calcEcc.toString(16).padStart(2,'0')} ${match}`);
    }
  }

  // Analyze 30-byte blocks (observed pattern)
  console.log('\n30-byte block analysis (positions 30-31, 62-63):');
  const ecc1Pos = blockOffset + 30;
  const ecc2Pos = blockOffset + 62;
  if (ecc2Pos + 1 < data.length) {
    console.log(`  ECC1 at ${ecc1Pos.toString(16)}: 0x${data[ecc1Pos].toString(16).padStart(2,'0')} 0x${data[ecc1Pos+1].toString(16).padStart(2,'0')}`);
    console.log(`  ECC2 at ${ecc2Pos.toString(16)}: 0x${data[ecc2Pos].toString(16).padStart(2,'0')} 0x${data[ecc2Pos+1].toString(16).padStart(2,'0')}`);
  }
}
