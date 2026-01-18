/**
 * S19 (Motorola S-record) parser for browser
 *
 * S19 format:
 * S0 - Header
 * S1 - Data with 16-bit address
 * S2 - Data with 24-bit address
 * S3 - Data with 32-bit address
 * S7/S8/S9 - End records
 */

interface Chunk {
  address: number;
  data: number[];
}

/**
 * Parse S19 content into address/data chunks
 */
function parseS19(content: string): Chunk[] {
  const lines = content.split('\n');
  const chunks: Chunk[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('S')) continue;

    const type = trimmed[1];
    if (!['1', '2', '3'].includes(type)) continue; // Only data records

    const byteCount = parseInt(trimmed.substring(2, 4), 16);

    // Address size depends on record type
    let addrSize: number;
    switch (type) {
      case '1': addrSize = 2; break; // 16-bit
      case '2': addrSize = 3; break; // 24-bit
      case '3': addrSize = 4; break; // 32-bit
      default: continue;
    }

    const addrHex = trimmed.substring(4, 4 + addrSize * 2);
    const address = parseInt(addrHex, 16);

    // Data starts after address, ends before checksum (1 byte)
    const dataStart = 4 + addrSize * 2;
    const dataEnd = 2 + byteCount * 2 - 2; // -2 for checksum
    const dataHex = trimmed.substring(dataStart, dataEnd);

    const data: number[] = [];
    for (let i = 0; i < dataHex.length; i += 2) {
      data.push(parseInt(dataHex.substring(i, i + 2), 16));
    }

    if (data.length > 0) {
      chunks.push({ address, data });
    }
  }

  return chunks;
}

/**
 * TriCore TC17xx address aliasing:
 * 0x80000000 = cached view of program flash
 * 0xA0000000 = uncached view of SAME flash
 */
function normalizeAddress(addr: number): number {
  if (addr >= 0xA0000000 && addr < 0xC0000000) {
    return addr - 0x20000000; // Map 0xA0... -> 0x80...
  }
  return addr;
}

/**
 * Convert S19 content to Uint8Array binary
 */
export function s19ToBinary(content: string): Uint8Array {
  const chunks = parseS19(content);
  if (chunks.length === 0) {
    throw new Error('No data records found in S19 file');
  }

  // Normalize addresses (handle TriCore aliasing)
  const normalizedChunks = chunks.map(chunk => ({
    address: normalizeAddress(chunk.address),
    data: chunk.data
  }));

  // Sort by address
  normalizedChunks.sort((a, b) => a.address - b.address);

  // Find address range
  const minAddr = normalizedChunks[0].address;
  let maxAddr = 0;
  for (const chunk of normalizedChunks) {
    const end = chunk.address + chunk.data.length;
    if (end > maxAddr) maxAddr = end;
  }

  // Use base offset for high addresses
  const baseOffset = minAddr >= 0x80000000 ? minAddr : 0;
  const size = maxAddr - baseOffset;

  // Create buffer filled with 0xFF (erased flash)
  const buffer = new Uint8Array(size);
  buffer.fill(0xFF);

  // Write chunks
  for (const chunk of normalizedChunks) {
    const offset = chunk.address - baseOffset;
    if (offset >= 0 && offset + chunk.data.length <= size) {
      for (let i = 0; i < chunk.data.length; i++) {
        buffer[offset + i] = chunk.data[i];
      }
    }
  }

  return buffer;
}

/**
 * Check if filename is an S19 file
 */
export function isS19File(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower.endsWith('.s19') || lower.endsWith('.srec') || lower.endsWith('.mot');
}
