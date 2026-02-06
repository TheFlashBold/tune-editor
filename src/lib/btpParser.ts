// BTP (BinToolz Patch) format parser
// Reference: BinToolz/source/BTP.py

const BTP_HEADER_SIZE = 100;

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

export function verifyCrc32(data: Uint8Array): boolean {
  if (data.length < BTP_HEADER_SIZE) return false;

  const storedChecksum = readU32LE(data, 32);

  // CRC32 with polynomial 0xEDB88320 over data after header
  let crc = 0xFFFFFFFF;
  for (let i = BTP_HEADER_SIZE; i < data.length; i++) {
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

  const computed = (~crc) & 0xFFFFFFFF;
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
