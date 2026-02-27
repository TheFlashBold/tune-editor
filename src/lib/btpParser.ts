// BTP (BinToolz Patch) format parser
// Reference: BinToolz/source/BTP.py

const BTP_HEADER_SIZE = 100;

// --- ECU info parsing and block boundary mapping ---

export interface EcuInfo {
    ecuFamily: string;  // 'SC8', 'SCG', 'DSG'
    variant: string;    // 'A05', 'S50', 'V30', 'F43M', etc.
}

// BinToolz 4MB binary: file offset where CAL block starts, per ECU family
const ECU_CAL_FILE_OFFSET: Record<string, number> = {
    'SC1': 0x040000,  // Simos 12.1
    'SC8': 0x200000,  // Simos 18.1
    'SCG': 0x220000,  // Simos 18.10
};

/**
 * Parse ECU family and variant from an EPK string, definition name, or BTP softCode.
 * Handles formats: "SC8O30", "SC800S50", "SCGA05", "SCG00A05", "SC8S500", "F43M", etc.
 */
export function parseEcuInfo(nameOrEpk: string): EcuInfo | null {
    let m = nameOrEpk.match(/^SC1(?:00)?([A-Z0-9]{2,3})/);
    if (m) return { ecuFamily: 'SC1', variant: m[1] };

    m = nameOrEpk.match(/^SC8(?:00)?([A-Z0-9]{2,3})/);
    if (m) return { ecuFamily: 'SC8', variant: m[1] };

    m = nameOrEpk.match(/^SCG(?:00)?([A-Z0-9]{2,3})/);
    if (m) return { ecuFamily: 'SCG', variant: m[1] };

    m = nameOrEpk.match(/^[F][A-Z0-9]{3}/);
    if (m) return { ecuFamily: 'DSG', variant: m[0] };

    return null;
}

/**
 * Get the CAL block file offset boundary for block classification in BinToolz binaries.
 * Blocks at offset < boundary are ASW/CBOOT, blocks at offset >= boundary are CAL.
 */
export function getCalFileOffset(ecuFamily: string): number | null {
    return ECU_CAL_FILE_OFFSET[ecuFamily] ?? null;
}

/**
 * Extract variant code from a patch name like "SL PATCH v29.33 - A05" → "A05"
 */
export function extractVariantFromName(name: string): string | null {
    const parts = name.split(' - ');
    if (parts.length >= 2) return parts[parts.length - 1].trim();
    return null;
}

export interface BtpHeader {
  version: string;       // 20 bytes, "BinToolz Patch v1.1"
  softCode: string;      // 8 bytes
  blockCount: number;    // u32 LE
  blockChecksum: number; // u32 LE (CRC32)
  fileSize: number;      // u32 LE
}

export interface BtpBlock {
  offset: number;        // u32 LE - file offset in binary
  length: number;        // u32 LE
  originalData: Uint8Array;
  modifiedData: Uint8Array;
}

export type PatchStatus = 'applied' | 'ready' | 'incompatible';

export interface PatchCheckResult {
  name: string;
  file: string;
  status: PatchStatus;
  definition?: string;
  category?: string;
  blocks: BtpBlock[];
  header: BtpHeader;
  crcValid: boolean;
}

function readU32LE(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | ((data[offset + 3] << 24) >>> 0);
}

function readString(data: Uint8Array, offset: number, length: number): string {
  let str = '';
  for (let i = 0; i < length; i++) {
    const ch = data[offset + i];
    if (ch === 0) break;
    str += String.fromCharCode(ch);
  }
  return str;
}

export function parseBtp(data: Uint8Array): { header: BtpHeader; blocks: BtpBlock[] } {
  if (data.length < BTP_HEADER_SIZE) {
    throw new Error('BTP file too small');
  }

  const version = readString(data, 0, 20);
  if (!version.startsWith('BinToolz Patch')) {
    throw new Error(`Invalid BTP version: "${version}"`);
  }

  const softCode = readString(data, 20, 8);
  const blockCount = readU32LE(data, 28);
  const blockChecksum = readU32LE(data, 32);
  const fileSize = readU32LE(data, 36);

  const header: BtpHeader = { version, softCode, blockCount, blockChecksum, fileSize };

  const blocks: BtpBlock[] = [];
  let pos = BTP_HEADER_SIZE;

  for (let i = 0; i < blockCount; i++) {
    if (pos + 8 > data.length) {
      throw new Error(`BTP truncated at block ${i}`);
    }

    const offset = readU32LE(data, pos);
    const length = readU32LE(data, pos + 4);
    pos += 8;

    if (pos + length * 2 > data.length) {
      throw new Error(`BTP block ${i} data exceeds file size`);
    }

    const originalData = data.slice(pos, pos + length);
    pos += length;
    const modifiedData = data.slice(pos, pos + length);
    pos += length;

    blocks.push({ offset, length, originalData, modifiedData });
  }

  return { header, blocks };
}

export function computeCrc32(data: Uint8Array, start: number = 0, end?: number): number {
  const stop = end ?? data.length;
  let crc = 0xFFFFFFFF;
  for (let i = start; i < stop; i++) {
    let ch = data[i];
    for (let j = 0; j < 8; j++) {
      const b = (ch ^ crc) & 1;
      crc = (crc >>> 1) & 0xFFFFFFFF;
      if (b === 1) {
        crc = crc ^ 0xEDB88320;
      }
      ch = ch >>> 1;
    }
  }
  return (~crc) & 0xFFFFFFFF;
}

export function verifyCrc32(data: Uint8Array): boolean {
  if (data.length < BTP_HEADER_SIZE) return false;

  const storedChecksum = readU32LE(data, 32);
  const computed = computeCrc32(data, BTP_HEADER_SIZE);
  // Convert to signed 32-bit for comparison (Python stores as signed)
  const storedSigned = storedChecksum | 0;
  const computedSigned = computed | 0;
  return storedSigned === computedSigned;
}

export function checkPatch(blocks: BtpBlock[], binData: Uint8Array): PatchStatus {
  let allOriginal = true;
  let allModified = true;

  for (const block of blocks) {
    for (let d = 0; d < block.length; d++) {
      const binOffset = block.offset + d;
      if (binOffset >= binData.length) {
        return 'incompatible';
      }

      if (binData[binOffset] !== block.originalData[d]) {
        allOriginal = false;
      }
      if (binData[binOffset] !== block.modifiedData[d]) {
        allModified = false;
      }

      // Early exit if neither matches
      if (!allOriginal && !allModified) {
        return 'incompatible';
      }
    }
  }

  if (allModified) return 'applied';
  if (allOriginal) return 'ready';
  return 'incompatible';
}

/**
 * Block-aware patch status check.
 * Classifies blocks as CAL (offset >= calFileOffset) or ASW/CBOOT (offset < calFileOffset).
 * - If patch has ASW/CBOOT blocks: only check those for status (CAL may differ due to tuning).
 * - If patch has only CAL blocks: only check CAL blocks.
 * - If no calFileOffset known: falls back to checking all blocks.
 */
export function checkPatchBlockAware(blocks: BtpBlock[], binData: Uint8Array, calFileOffset: number | null): PatchStatus {
  if (calFileOffset === null) {
    return checkPatch(blocks, binData);
  }

  const aswBlocks = blocks.filter(b => b.offset < calFileOffset);
  const blocksToCheck = aswBlocks.length > 0 ? aswBlocks : blocks.filter(b => b.offset >= calFileOffset);

  if (blocksToCheck.length === 0) {
    return checkPatch(blocks, binData);
  }

  return checkPatch(blocksToCheck, binData);
}

export function applyPatch(blocks: BtpBlock[], binData: Uint8Array): void {
  for (const block of blocks) {
    for (let d = 0; d < block.length; d++) {
      binData[block.offset + d] = block.modifiedData[d];
    }
  }
}

export function removePatch(blocks: BtpBlock[], binData: Uint8Array): void {
  for (const block of blocks) {
    for (let d = 0; d < block.length; d++) {
      binData[block.offset + d] = block.originalData[d];
    }
  }
}

function writeU32LE(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xFF;
  data[offset + 1] = (value >>> 8) & 0xFF;
  data[offset + 2] = (value >>> 16) & 0xFF;
  data[offset + 3] = (value >>> 24) & 0xFF;
}

export function buildBtp(
  originalData: Uint8Array,
  modifiedData: Uint8Array,
  softCode: string,
  paramRanges: { offset: number; length: number }[]
): Uint8Array {
  // Find contiguous runs of differing bytes within parameter ranges
  const blocks: { offset: number; original: number[]; modified: number[] }[] = [];

  for (const range of paramRanges) {
    let runStart = -1;
    let runOrig: number[] = [];
    let runMod: number[] = [];

    for (let i = 0; i < range.length; i++) {
      const pos = range.offset + i;
      if (pos >= originalData.length || pos >= modifiedData.length) break;

      if (originalData[pos] !== modifiedData[pos]) {
        if (runStart === -1) {
          runStart = pos;
          runOrig = [];
          runMod = [];
        }
        runOrig.push(originalData[pos]);
        runMod.push(modifiedData[pos]);
      } else {
        if (runStart !== -1) {
          blocks.push({ offset: runStart, original: runOrig, modified: runMod });
          runStart = -1;
        }
      }
    }
    // Flush trailing run
    if (runStart !== -1) {
      blocks.push({ offset: runStart, original: runOrig, modified: runMod });
    }
  }

  // Build block data: offset(u32) + length(u32) + originalBytes + modifiedBytes
  let blockDataSize = 0;
  for (const b of blocks) {
    blockDataSize += 8 + b.original.length + b.modified.length;
  }

  const blockData = new Uint8Array(blockDataSize);
  let pos = 0;
  for (const b of blocks) {
    writeU32LE(blockData, pos, b.offset);
    writeU32LE(blockData, pos + 4, b.original.length);
    pos += 8;
    for (let i = 0; i < b.original.length; i++) blockData[pos++] = b.original[i];
    for (let i = 0; i < b.modified.length; i++) blockData[pos++] = b.modified[i];
  }

  // Compute CRC32 over block data
  const checksum = computeCrc32(blockData);

  // Build 100-byte header
  const version = 'BinToolz Patch v1.1';
  const result = new Uint8Array(BTP_HEADER_SIZE + blockDataSize);

  // Version string (20 bytes, null-padded)
  for (let i = 0; i < 20; i++) {
    result[i] = i < version.length ? version.charCodeAt(i) : 0;
  }
  // SoftCode (8 bytes, null-padded)
  for (let i = 0; i < 8; i++) {
    result[20 + i] = i < softCode.length ? softCode.charCodeAt(i) : 0;
  }
  // Block count (u32)
  writeU32LE(result, 28, blocks.length);
  // Block checksum (u32)
  writeU32LE(result, 32, checksum);
  // File size (u32) — size of the original binary
  writeU32LE(result, 36, originalData.length);
  // Bytes 40-99: zero padding (already zeroed)

  // Append block data
  result.set(blockData, BTP_HEADER_SIZE);

  return result;
}
