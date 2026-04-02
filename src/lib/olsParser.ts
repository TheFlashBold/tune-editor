/**
 * OLS File Parser - Parse WinOLS .ols project files in the browser.
 *
 * Extracts parameter definitions, binary versions, and embedded binary data
 * from WinOLS .ols files. Supports format versions 250 through 804+.
 *
 * Port of py-ols/ols_reader.py to TypeScript for browser use.
 */

import type {Definition, IDefinitionParameter, AxisDefinition, DataType} from '../types';

// ---- Data structures ----

export interface OLSAxisInfo {
    points: number;
    address: number;
    offset: number;
    unit: string;
    factor: number;
    id: string;
    description: string;
    dataSource: number;
    dataType: DataType;
}

export interface OLSParameter {
    name: string;
    description: string;
    paramType: 'VALUE' | 'CURVE' | 'MAP';
    dataType: DataType;
    cols: number;
    rows: number;
    dataOffset: number;
    xAxis?: OLSAxisInfo;
    yAxis?: OLSAxisInfo;
    unit: string;
    factor: number;
    offset: number;
    folderId: number;
    typeCode: number;
}

export interface OLSBinaryVersion {
    name: string;
    description: string;
    blobOffset: number;
    blobSize: number;
    versionIndex: number;
    versionCount: number;
    epk: string;
    epkOffset: number;
}

export interface OLSFolderEntry {
    idx: number;
    name: string;
    description: string;
}

export interface OLSFile {
    filename: string;
    version: number;
    make: string;
    model: string;
    engine: string;
    year: string;
    fuelType: string;
    displacement: string;
    power: string;
    gearbox: string;
    memoryType: string;
    ecuManufacturer: string;
    ecuType: string;
    swNumber: string;
    hwNumber: string;
    hwCode: string;
    parameters: OLSParameter[];
    binaryVersions: OLSBinaryVersion[];
    folders: OLSFolderEntry[];
}

// ---- Format constants ----

const OLS_MAGIC = 0x0b;
const OLS_SIGNATURE = 'WinOLS File';

// ---- Low-level readers (offset-based, for header/binary version/folder parsing) ----

function readU16(data: DataView, offset: number): number {
    return data.getUint16(offset, true);
}

function readU32(data: DataView, offset: number): number {
    return data.getUint32(offset, true);
}

function readString(data: DataView, buf: Uint8Array, offset: number): [string, number] {
    if (offset + 4 > buf.length) return ['', 0];
    const length = readU32(data, offset);
    if (length === 0 || length > 500) return ['', 4];
    if (offset + 4 + length > buf.length) return ['', 4];
    const bytes = buf.subarray(offset + 4, offset + 4 + length);
    const s = decodeCP1252(bytes).replace(/\0+$/, '').trim();
    return [s, 4 + length];
}

/** Decode Windows-1252 bytes to string */
function decodeCP1252(bytes: Uint8Array): string {
    // CP1252 is mostly identical to Latin-1 except for 0x80-0x9F
    const cp1252Extra: Record<number, number> = {
        0x80: 0x20AC, 0x82: 0x201A, 0x83: 0x0192, 0x84: 0x201E, 0x85: 0x2026,
        0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02C6, 0x89: 0x2030, 0x8A: 0x0160,
        0x8B: 0x2039, 0x8C: 0x0152, 0x8E: 0x017D, 0x91: 0x2018, 0x92: 0x2019,
        0x93: 0x201C, 0x94: 0x201D, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
        0x98: 0x02DC, 0x99: 0x2122, 0x9A: 0x0161, 0x9B: 0x203A, 0x9C: 0x0153,
        0x9E: 0x017E, 0x9F: 0x0178,
    };
    let result = '';
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b >= 0x80 && b <= 0x9F && cp1252Extra[b]) {
            result += String.fromCharCode(cp1252Extra[b]);
        } else {
            result += String.fromCharCode(b);
        }
    }
    return result;
}

function isPrintable(s: string): boolean {
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c < 0x20 || (c >= 0x7F && c <= 0x9F)) return false;
    }
    return true;
}

/** Find a 4-byte pattern in buffer starting from `from` up to `to` */
function findBytes(buf: Uint8Array, pattern: Uint8Array, from: number, to: number): number {
    const end = Math.min(to, buf.length - pattern.length);
    outer:
    for (let i = from; i <= end; i++) {
        for (let j = 0; j < pattern.length; j++) {
            if (buf[i + j] !== pattern[j]) continue outer;
        }
        return i;
    }
    return -1;
}

// ---- Main parser ----

export function parseOLS(buffer: ArrayBuffer, filename: string): OLSFile {
    const buf = new Uint8Array(buffer);
    const data = new DataView(buffer);

    const ols: OLSFile = {
        filename,
        version: 0,
        make: '', model: '', engine: '', year: '',
        fuelType: '', displacement: '', power: '', gearbox: '',
        memoryType: '', ecuManufacturer: '', ecuType: '',
        swNumber: '', hwNumber: '', hwCode: '',
        parameters: [],
        binaryVersions: [],
        folders: [],
    };

    // Validate header
    if (buf.length < 24) throw new Error('File too small');
    if (readU32(data, 0) !== OLS_MAGIC) throw new Error('Invalid OLS magic');

    const sig = String.fromCharCode(...buf.subarray(4, 15)).replace(/\0+$/, '');
    if (!sig.startsWith(OLS_SIGNATURE)) throw new Error('Invalid OLS signature');

    ols.version = readU16(data, 16);

    // Parse header strings
    let pos = 0x18;
    const readStr = (): string => {
        const [s, consumed] = readString(data, buf, pos);
        pos += consumed;
        return s;
    };

    ols.make = readStr();
    ols.model = readStr();
    ols.engine = readStr();
    ols.year = readStr();

    // Extended metadata
    const extFields: (keyof OLSFile)[] = [
        'fuelType', 'displacement', 'power', 'gearbox',
        'memoryType', 'ecuManufacturer', 'ecuType',
        'swNumber', 'hwNumber', 'hwCode',
    ];
    for (const field of extFields) {
        if (pos + 4 >= buf.length) break;
        const rawLen = readU32(data, pos);
        if (rawLen > 200) break;
        const [val, consumed] = readString(data, buf, pos);
        if (consumed <= 0) break;
        (ols as any)[field] = val;
        pos += consumed;
    }

    // Extract binary versions
    ols.binaryVersions = extractBinaryVersions(data, buf, ols.version);

    // Find EPK for each version
    for (const v of ols.binaryVersions) {
        if (v.blobOffset > 0 && v.blobSize > 0) {
            const [epk, epkOffset] = findBinaryVerification(data, buf, v.blobOffset, v.blobSize);
            v.epk = epk;
            v.epkOffset = epkOffset;
        }
    }

    // Extract parameters
    ols.parameters = extractParameters(data, buf, ols.version);

    // Extract folders
    ols.folders = extractFolderEntries(data, buf);

    return ols;
}

// ---- Binary version extraction ----

function extractBinaryVersions(data: DataView, buf: Uint8Array, _version: number): OLSBinaryVersion[] {
    const versions: OLSBinaryVersion[] = [];

    // Try v597+ format: scan for 0x42007899 marker
    const markerBytes = new Uint8Array([0x99, 0x78, 0x00, 0x42]); // LE
    const scanStart = 0x100;
    const scanEnd = Math.min(0x2000, buf.length - 28);

    let baseFound = false;
    let markerPos = findBytes(buf, markerBytes, scanStart, scanEnd);

    while (markerPos >= 0 && !baseFound) {
        const recStart = markerPos - 12;
        if (recStart < 0) {
            markerPos = findBytes(buf, markerBytes, markerPos + 4, scanEnd);
            continue;
        }

        const versionIndex = readU32(data, recStart);
        const blobOffset = readU32(data, recStart + 4);
        const blobSize = readU32(data, recStart + 8);
        const versionCount = readU32(data, recStart + 16);
        const nameLen = readU32(data, recStart + 20);

        if (versionIndex < 20 &&
            versionCount > 0 && versionCount <= 20 &&
            versionIndex < versionCount &&
            blobSize >= 0x100000 && blobSize <= 0x1000000 &&
            blobOffset + versionCount * blobSize <= buf.length + 4 &&
            nameLen > 0 && nameLen < 50 &&
            recStart + 24 + nameLen <= buf.length) {

            const name = decodeCP1252(buf.subarray(recStart + 24, recStart + 24 + nameLen)).trim();
            if (isPrintable(name) && name.length > 0) {
                // Read description
                let desc = '';
                const descPos = recStart + 24 + nameLen;
                if (descPos + 4 <= buf.length) {
                    const descLen = readU32(data, descPos);
                    if (descLen > 0 && descLen < 500 && descPos + 4 + descLen <= buf.length) {
                        desc = decodeCP1252(buf.subarray(descPos + 4, descPos + 4 + descLen)).trim();
                    }
                }

                const actualBlobOffset = blobOffset + versionIndex * blobSize;
                versions.push({
                    name, description: desc,
                    blobOffset: actualBlobOffset, blobSize,
                    versionIndex, versionCount,
                    epk: '', epkOffset: 0,
                });

                baseFound = true;

                // Scan for derived records (0xFFFFFFFF sentinel)
                const derivedSearchEnd = Math.min(markerPos + 4 + 0x500, buf.length - 8);
                let derivedIndex = 0;
                let dPos = markerPos + 4;

                while (dPos < derivedSearchEnd) {
                    if (readU32(data, dPos) === 0xFFFFFFFF && dPos + 8 <= buf.length) {
                        const dNameLen = readU32(data, dPos + 4);
                        if (dNameLen > 0 && dNameLen < 50 && dPos + 8 + dNameLen <= buf.length) {
                            const dName = decodeCP1252(buf.subarray(dPos + 8, dPos + 8 + dNameLen)).trim();
                            if (isPrintable(dName) && dName.length > 0) {
                                while (derivedIndex === versionIndex) derivedIndex++;
                                if (derivedIndex >= versionCount) break;

                                let dDesc = '';
                                const dDescPos = dPos + 8 + dNameLen;
                                if (dDescPos + 4 <= buf.length) {
                                    const dDescLen = readU32(data, dDescPos);
                                    if (dDescLen > 0 && dDescLen < 500 && dDescPos + 4 + dDescLen <= buf.length) {
                                        dDesc = decodeCP1252(buf.subarray(dDescPos + 4, dDescPos + 4 + dDescLen)).trim();
                                    }
                                }

                                versions.push({
                                    name: dName, description: dDesc,
                                    blobOffset: blobOffset + derivedIndex * blobSize, blobSize,
                                    versionIndex: derivedIndex, versionCount,
                                    epk: '', epkOffset: 0,
                                });

                                derivedIndex++;
                                dPos = dDescPos + (dDesc ? 4 + readU32(data, dDescPos) : 4);
                                continue;
                            }
                        }
                    }
                    dPos++;
                }
            }
        }

        if (!baseFound) {
            markerPos = findBytes(buf, markerBytes, markerPos + 4, scanEnd);
        }
    }

    // Fallback: old format (pre-v597)
    if (!baseFound) {
        let oPos = 0x400;
        const oldScanEnd = Math.min(0x2000, buf.length - 28);

        while (oPos < oldScanEnd) {
            const val = readU32(data, oPos);

            // Root folder marker (0x003fffff)
            if (val === 0x003fffff) {
                const nl = readU32(data, oPos + 4);
                if (nl > 0 && nl < 50 && oPos + 8 + nl <= buf.length) {
                    const n = decodeCP1252(buf.subarray(oPos + 8, oPos + 8 + nl)).trim();
                    if (isPrintable(n) && n.length > 0) {
                        // Root folder, no blob data
                        oPos += 8 + nl;
                        continue;
                    }
                }
            }

            // Version with parent ID (small integer 1-10)
            if (val > 0 && val <= 10) {
                const nl = readU32(data, oPos + 4);
                if (nl > 0 && nl < 50 && oPos + 8 + nl <= buf.length) {
                    const n = decodeCP1252(buf.subarray(oPos + 8, oPos + 8 + nl)).trim();
                    if (isPrintable(n) && n.length > 0 && oPos >= 16) {
                        const bo = readU32(data, oPos - 12);
                        const bs = readU32(data, oPos - 8);
                        if (bo > 0 && bo < buf.length && bs > 0 && bs < 0x10000000) {
                            let desc = '';
                            const dp = oPos + 8 + nl;
                            if (dp + 4 <= buf.length) {
                                const dl = readU32(data, dp);
                                if (dl > 0 && dl < 500 && dp + 4 + dl <= buf.length) {
                                    desc = decodeCP1252(buf.subarray(dp + 4, dp + 4 + dl)).trim();
                                }
                            }

                            versions.push({
                                name: n, description: desc,
                                blobOffset: bo, blobSize: bs,
                                versionIndex: 0, versionCount: 0,
                                epk: '', epkOffset: 0,
                            });
                            oPos += 8 + nl;
                            continue;
                        }
                    }
                }
            }
            oPos++;
        }
    }

    return versions;
}

// ---- EPK/verification ----

function findBinaryVerification(_data: DataView, buf: Uint8Array, blobOffset: number, blobSize: number): [string, number] {
    const calOffsets = [0x40000, 0x100000, 0x800000, 0x820000, 0x0];

    // Method 1: check known CAL offsets
    for (const calOff of calOffsets) {
        if (calOff + 20 > blobSize) continue;
        const pos = blobOffset + calOff;
        if (pos + 20 > buf.length) continue;

        const [epk, relOff] = extractEpkFromHeader(buf, pos);
        if (epk) return [epk, calOff + relOff];
    }

    // Method 2: scan for CAS pattern
    const casPattern = /CAS[A-Z][A-Z0-9]{4}/;
    // Search in a reasonable range
    const searchEnd = Math.min(blobOffset + blobSize, buf.length);
    for (let i = blobOffset; i < searchEnd - 20; i++) {
        if (buf[i] === 0x43 && buf[i + 1] === 0x41 && buf[i + 2] === 0x53) { // "CAS"
            const chunk = String.fromCharCode(...buf.subarray(i, i + 8));
            if (casPattern.test(chunk)) {
                const epkPos = i + 8;
                if (epkPos + 7 <= buf.length) {
                    let epkStr = '';
                    for (let j = 0; j < 7; j++) {
                        const c = buf[epkPos + j];
                        if (c === 0) break;
                        epkStr += String.fromCharCode(c);
                    }
                    if (epkStr.length >= 6 && epkStr[0] === 'S') {
                        return [epkStr, i - blobOffset + 8];
                    }
                }
            }
        }
    }

    return ['', 0];
}

function extractEpkFromHeader(buf: Uint8Array, pos: number): [string, number] {
    const header = buf.subarray(pos, pos + 20);
    const headerStr = String.fromCharCode(...header);

    // CAS header
    const casMatch = headerStr.match(/CAS[A-Z][A-Z0-9]{4}/);
    if (casMatch && casMatch.index !== undefined) {
        const epkPos = casMatch.index + 8;
        if (epkPos + 7 <= header.length) {
            let epk = '';
            for (let j = 0; j < 7; j++) {
                const c = header[epkPos + j];
                if (c === 0) break;
                epk += String.fromCharCode(c);
            }
            if (epk.length >= 6) return [epk, epkPos];
        }
    }

    // Direct EPK search
    const epkMatch = headerStr.match(/S[A-Z][0-9A-Z]{5}/);
    if (epkMatch && epkMatch.index !== undefined) {
        return [epkMatch[0], epkMatch.index];
    }

    return ['', 0];
}

// ---- Sequential reader (reads fields in WinOLS order) ----

class SeqReader {
    private pos: number;
    private readonly dv: DataView;
    private readonly buf: Uint8Array;
    readonly version: number;

    constructor(buf: Uint8Array, dv: DataView, version: number, startPos: number) {
        this.buf = buf;
        this.dv = dv;
        this.version = version;
        this.pos = startPos;
    }

    private has(id: number): boolean { return id <= this.version; }

    readU8(): number {
        if (this.pos + 1 > this.buf.length) throw new RangeError('EOF');
        return this.buf[this.pos++];
    }
    readBool(): boolean { return this.readU8() !== 0; }
    readU32(): number {
        if (this.pos + 4 > this.buf.length) throw new RangeError('EOF');
        const v = this.dv.getUint32(this.pos, true); this.pos += 4; return v;
    }
    readI32(): number {
        if (this.pos + 4 > this.buf.length) throw new RangeError('EOF');
        const v = this.dv.getInt32(this.pos, true); this.pos += 4; return v;
    }
    readF64(): number {
        if (this.pos + 8 > this.buf.length) throw new RangeError('EOF');
        const v = this.dv.getFloat64(this.pos, true); this.pos += 8; return v;
    }
    readBytes(n: number): void {
        if (this.pos + n > this.buf.length) throw new RangeError('EOF');
        this.pos += n;
    }
    readArray(): void {
        const count = this.readU32();
        if (count === 0 || count >= 0xFFFFFFF0) return;
        if (count > 0x1000000) throw new RangeError(`array count ${count}`);
        if (this.pos + count > this.buf.length) throw new RangeError('EOF');
        this.pos += count;
    }
    readU32Array(): void {
        const count = this.readU32();
        if (count === 0) return;
        if (count > 0x100000) throw new RangeError(`u32 array count ${count}`);
        this.readBytes(count * 4);
    }
    readString(): string {
        const length = this.readU32();
        if (length === 0 || length >= 0xFFFFFFF0) return '';
        if (length > 0x100000) throw new RangeError(`string length ${length}`);
        if (this.pos + length > this.buf.length) throw new RangeError('EOF');
        const raw = this.buf.subarray(this.pos, this.pos + length);
        this.pos += this.has(439) ? length : length + 1;
        return decodeCP1252(raw).replace(/\0+$/, '');
    }
    readStringArray(): void {
        const count = this.readU32();
        for (let i = 0; i < count; i++) this.readString();
    }
    readLangString(): string {
        const s = this.readString();
        if (this.has(345)) this.readU32();
        return s;
    }
    readMLS(): string {
        if (!this.has(330)) return this.readString();
        const primary = this.readLangString();
        if (this.has(345)) this.readU32();
        const sub = this.readU32();
        for (let i = 0; i < sub; i++) this.readLangString();
        return primary;
    }

    // --- Axis unit descriptor ---
    readAxisUnitDesc(): { unit: string; factor: number; offset: number; dataOffset: number; endOffset: number } {
        const unit = this.readString();
        this.readString(); // alt_unit
        const factor = this.readF64();
        const offset = this.readF64();
        const dataOffset = this.readU32();
        const endOffset = this.readU32();
        this.readU32(); // field_4c
        if (this.has(264)) this.readF64();
        if (this.has(61)) this.readU32();
        if (this.has(105)) { this.readU32(); this.readU32(); this.readU32(); this.readI32(); }
        return {unit, factor, offset, dataOffset, endOffset};
    }

    // --- Axis data ---
    readAxisData(): OLSAxisInfo {
        const description = this.readMLS();
        const id = this.readString();
        const factor = this.readF64();
        const offset = this.readF64();
        this.readU32(); // type_code
        this.readU32(); this.readU32(); this.readU32();
        let dataFormat = this.readU32();
        if (dataFormat !== 2 && dataFormat !== 10 && dataFormat !== 16) dataFormat = 10;
        const dataType: DataType = dataFormat === 2 ? 'UBYTE' : dataFormat === 16 ? 'ULONG' : 'UWORD';
        this.readBool(); this.readBool();
        if (this.has(264)) this.readF64();
        if (this.has(241)) this.readU32();
        let dataSource = 0;
        if (this.has(8)) dataSource = this.readU32();
        if (this.has(805)) this.readU32();
        if (this.has(12)) this.readBool();
        if (this.has(73)) this.readArray();
        if (this.has(77)) this.readU32();
        if (this.has(91)) this.readI32();
        if (this.has(354)) this.readString();
        if (this.has(372)) { const n = this.readU32(); for (let i = 0; i < n; i++) this.readMLS(); }
        if (this.has(440)) this.readI32();
        if (this.has(805)) { this.readU32(); this.readU32(); this.readU32(); this.readU32(); }
        return {points: 0, address: 0, offset, unit: '', factor, id, description, dataSource, dataType};
    }

    // --- Full map record ---
    readMap(): OLSParameter {
        if (this.has(268)) this.readU8();
        if (this.has(282)) this.readU32();
        if (this.has(287)) this.readMLS(); // alt_description
        if (this.has(93)) this.readU8();

        const description = this.readMLS();
        const typeCode = this.readU32();
        this.readU32(); this.readU32(); this.readU32();
        let rawDs = this.readU32();
        if (rawDs !== 2 && rawDs !== 10 && rawDs !== 16) rawDs = 10;
        const dataType: DataType = rawDs === 2 ? 'UBYTE' : rawDs === 16 ? 'ULONG' : 'UWORD';

        let name = '';
        let folderId = 0;
        if (this.has(80)) { folderId = this.readU32(); name = this.readString(); }
        if (this.has(298)) this.readU32();
        if (this.has(299)) this.readU32();
        if (this.has(94)) this.readU32();
        if (this.has(74)) this.readBool();

        // File mode check (OLS files always use mode 1)
        if (this.has(123)) this.readU32();

        if (this.has(300)) for (let i = 0; i < 6; i++) this.readF64();
        if (this.has(67)) {
            for (let i = 0; i < 6; i++) this.readF64();
        } else if (this.has(66)) {
            this.readF64(); this.readF64();
        } else if (!this.has(59)) {
            this.readU32(); this.readU32();
        }

        this.readBool(); this.readBool(); this.readBool(); this.readBool();

        let dim1 = this.readU32();
        const dim2 = this.readU32();
        this.readU32(); this.readU32(); this.readU32();

        const unitDesc = this.readAxisUnitDesc();
        const axis1 = this.readAxisData();
        const axis2 = this.readAxisData();

        if (dim1 > 0x4000) dim1 = 0x4000;

        if (this.has(58)) this.readBool();
        if (this.has(68)) this.readBool();
        if (this.has(90)) this.readU32();
        if (this.has(9)) { this.readU32(); this.readU32(); }
        if (this.has(49)) { this.readU32(); this.readBool(); this.readBool(); this.readF64(); this.readF64(); }
        if (this.has(51)) this.readU32();
        if (this.has(53)) { this.readBool(); this.readF64(); this.readF64(); this.readF64(); this.readU32(); }
        if (this.has(54)) this.readF64();
        if (this.has(55)) { this.readBool(); this.readBool(); this.readBool(); }
        if (this.has(315)) this.readU32();
        if (this.has(383)) { this.readI32(); this.readBytes(16); }
        if (this.has(329)) this.readU32();
        if (this.has(346)) { this.readU32(); this.readU32(); }
        if (this.has(395)) this.readU32();
        if (this.has(476)) { this.readU32(); this.readU32Array(); this.readStringArray(); }
        if (this.has(503)) { this.readU32(); this.readF64(); }
        if (this.has(596)) this.readU32();
        if (this.has(822)) this.readU32();

        // Derive type and dimensions
        let paramType: 'VALUE' | 'CURVE' | 'MAP';
        let cols: number, rows: number;

        if (typeCode <= 2) {
            paramType = 'VALUE'; cols = Math.max(1, dim1); rows = 1;
        } else if (typeCode === 3) {
            paramType = 'CURVE'; cols = Math.max(1, dim1); rows = 1;
        } else {
            paramType = 'MAP'; cols = Math.max(1, dim1); rows = Math.max(1, dim2);
        }
        if (cols > 0x4000) cols = 1;
        if (rows > 0x4000) rows = 1;

        // Assign axes
        let xAxis: OLSAxisInfo | undefined;
        let yAxis: OLSAxisInfo | undefined;
        if (paramType === 'CURVE') {
            xAxis = axis1; xAxis.points = cols; xAxis.address = unitDesc.endOffset;
        } else if (paramType === 'MAP') {
            yAxis = axis1; yAxis.points = rows; yAxis.address = unitDesc.endOffset;
            xAxis = axis2; xAxis.points = cols;
        }

        // OLS data_offset points 2 entries before actual cell data
        const typeSize = rawDs === 2 ? 1 : rawDs === 16 ? 4 : 2;
        const adjustedOffset = unitDesc.dataOffset > 0 ? unitDesc.dataOffset + 2 * typeSize : 0;

        return {
            name, description, paramType, dataType,
            cols, rows, dataOffset: adjustedOffset,
            xAxis, yAxis,
            unit: unitDesc.unit, factor: unitDesc.factor, offset: unitDesc.offset,
            folderId, typeCode,
        };
    }
}

// ---- Parameter extraction (sequential) ----

function extractParameters(data: DataView, buf: Uint8Array, version: number): OLSParameter[] {
    // Find map list via 0x11883377 checksum marker
    const needle = new Uint8Array([0x77, 0x33, 0x88, 0x11]); // LE
    const idx = findBytes(buf, needle, 0x100, Math.min(0x20000, buf.length));
    if (idx < 0) return [];

    const pos = idx + 4;
    if (pos + 5 > buf.length) return [];
    const compressed = buf[pos];
    const count = data.getUint32(pos + 1, true);
    if (compressed || count === 0 || count > 0x100000) return [];

    const firstMap = pos + 5;
    const reader = new SeqReader(buf, data, version, firstMap);
    const parameters: OLSParameter[] = [];

    for (let i = 0; i < count; i++) {
        try {
            const p = reader.readMap();
            // Skip Hexdump entries — not real parameters
            if (p.description === 'Hexdump' && !p.name) continue;
            parameters.push(p);
        } catch {
            break;
        }
    }

    return parameters;
}

// ---- Folder extraction ----

function extractFolderEntries(data: DataView, buf: Uint8Array): OLSFolderEntry[] {
    const entries: OLSFolderEntry[] = [];
    const foundNames = new Set<string>();
    const searchStart = Math.floor(buf.length / 3);
    const marker = new Uint8Array([0xff, 0xff, 0xff, 0xff]);

    let pos = searchStart;
    while (true) {
        pos = findBytes(buf, marker, pos, buf.length);
        if (pos < 0 || pos + 20 > buf.length) break;

        const pad1 = readU32(data, pos + 4);
        const idx = readU32(data, pos + 8);
        const pad2 = readU32(data, pos + 12);
        const strlen = readU32(data, pos + 16);

        if (pad1 === 0 && pad2 === 0 && strlen > 5 && strlen < 300 && idx < 2000 &&
            pos + 20 + strlen <= buf.length) {
            const s = decodeCP1252(buf.subarray(pos + 20, pos + 20 + strlen));
            const colonIdx = s.indexOf(': "');
            if (colonIdx > 0) {
                const folderName = s.substring(0, colonIdx);
                const desc = s.substring(colonIdx + 3).replace(/"$/, '');
                const clean = folderName.replace(/[_.]/g, '');
                if (/^[a-zA-Z0-9]+$/.test(clean) && !foundNames.has(folderName)) {
                    foundNames.add(folderName);
                    entries.push({idx, name: folderName, description: desc});
                    pos = pos + 20 + strlen;
                    continue;
                }
            }
        }
        pos++;
    }

    return entries;
}

// ---- Binary extraction ----

export function extractBinary(buffer: ArrayBuffer, version: OLSBinaryVersion): Uint8Array {
    const buf = new Uint8Array(buffer);
    if (version.blobOffset === 0 || version.blobSize === 0) return new Uint8Array(0);
    const end = Math.min(version.blobOffset + version.blobSize, buf.length);
    return buf.slice(version.blobOffset, end);
}

// ---- Address mapping ----

/** Memory-mapped CAL offset for each ECU family (where CAL starts in address space relative to 0xA0000000) */
function getMemCalOffset(epk: string): number {
    const upper = epk.toUpperCase();
    if (upper.startsWith('SCG')) return 0x820000;  // Simos 18.10
    if (upper.startsWith('SC8')) return 0x800000;  // Simos 18.1
    if (upper.startsWith('SC4')) return 0x100000;  // Simos 16
    if (upper.startsWith('SC1') || upper.startsWith('SA3')) return 0x40000; // Simos 12
    if (upper.startsWith('S82') || upper.startsWith('S85')) return 0x40000; // MED17
    return 0; // Unknown — keep offsets as-is
}

const SIMOS_BASE = 0xA0000000;

// ---- Convert to editor Definition ----

export function olsToDefinition(ols: OLSFile): Definition {
    const folderLookup = new Map<number, OLSFolderEntry>();
    for (const f of ols.folders) folderLookup.set(f.idx, f);

    // Find EPK from first binary version
    let name = ols.filename.replace(/\.ols$/i, '');
    let epk = '';
    let verification: Definition['verification'] | undefined;
    for (const v of ols.binaryVersions) {
        if (v.epk) {
            name = v.epk;
            epk = v.epk;
            verification = {
                position: 0,
                expected: v.epk,
            };
            if (v.epkOffset > 0) {
                (verification as any).epkOffset = v.epkOffset;
            }
            break;
        }
    }

    // Determine address base from EPK
    // OLS offsets are full-bin-relative → convert to absolute: 0xA0000000 + olsOffset
    const memCalOffset = getMemCalOffset(epk);
    const addressBase = memCalOffset > 0 ? SIMOS_BASE : 0;

    const parameters: IDefinitionParameter[] = ols.parameters.map(p => {
        const categories: string[] = [];
        if (p.folderId && folderLookup.has(p.folderId)) {
            categories.push(folderLookup.get(p.folderId)!.name);
        }

        const param: IDefinitionParameter = {
            name: p.name,
            description: p.description,
            address: p.dataOffset > 0 ? addressBase + p.dataOffset : 0,
            type: p.paramType,
            dataType: p.dataType,
            unit: p.unit,
            min: 0,
            max: 0,
            factor: p.factor !== 0 ? p.factor : 1,
            offset: p.offset,
            categories,
        };

        if (p.cols > 1) param.cols = p.cols;
        if (p.rows > 1) param.rows = p.rows;

        if (p.xAxis && p.xAxis.points > 0) {
            param.xAxis = {
                type: 'STD_AXIS',
                points: p.xAxis.points,
                min: 0, max: 0,
                unit: p.xAxis.unit,
            } as AxisDefinition;
            if (p.xAxis.address) (param.xAxis as any).address = addressBase + p.xAxis.address;
            if (p.xAxis.factor !== 1.0) (param.xAxis as any).factor = p.xAxis.factor;
            if (p.xAxis.dataType !== 'UWORD') (param.xAxis as any).dataType = p.xAxis.dataType;
            if (!param.cols) param.cols = p.xAxis.points;
        }

        if (p.yAxis && p.yAxis.points > 0) {
            param.yAxis = {
                type: 'STD_AXIS',
                points: p.yAxis.points,
                min: 0, max: 0,
                unit: p.yAxis.unit,
            } as AxisDefinition;
            if (p.yAxis.address) (param.yAxis as any).address = addressBase + p.yAxis.address;
            if (p.yAxis.factor !== 1.0) (param.yAxis as any).factor = p.yAxis.factor;
            if (p.yAxis.dataType !== 'UWORD') (param.yAxis as any).dataType = p.yAxis.dataType;
            if (!param.rows) param.rows = p.yAxis.points;
        }

        return param;
    });

    // Set verification position for binary mode detection
    if (verification && memCalOffset > 0) {
        verification.position = memCalOffset;
    }

    return {
        name,
        version: '1.0',
        baseAddress: memCalOffset > 0 ? SIMOS_BASE : 0,
        verification,
        parameters,
    };
}
