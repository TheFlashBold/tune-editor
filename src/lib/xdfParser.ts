import type {IDefinitionParameter, DataType, AxisDefinition, Definition, RationalFormula} from '../types';

// --- Math equation parsing ---

function fixFloat(s: string): number {
    s = s.trim();
    // Handle malformed values like '2.66667.0' (double decimal point)
    const firstDot = s.indexOf('.');
    if (firstDot >= 0) {
        const secondDot = s.indexOf('.', firstDot + 1);
        if (secondDot >= 0) s = s.slice(0, secondDot);
    }
    return parseFloat(s);
}

const NUM = '[\\d.\\-+eE]+';

// Keep these in sync with tools/parse_xdf.py. Some generated XDFs use named
// array indices in their technical IDs while A2L/JSON definitions use numbers.
const ARRAY_INDEX_MAP: Record<string, string> = {
    stnd: '0', lft_1: '1',
    mt: '0', atc: '1', cvt: '2', dct: '3',
    tq_cmb_sng: '0', tq_cmb_opp_2: '1', tq_cmb_opp_2_s_1: '2',
    tq_cmb_opp_3: '3', tq_cmb_mpi: '4', tq_cmb_ch_sng: '5',
    tq_cmb_ch_mpl: '6', tq_cmb_ch_sa: '7',
    pow_0: '0', pow_1: '1', pow_2: '2', pow_3: '3', pow_4: '4',
    pow_ef_0: '0', pow_ef_1: '1', pow_ef_2: '2',
};

for (let i = 1; i <= 32; i++) {
    ARRAY_INDEX_MAP[`case_${i}`] = String(i - 1);
    ARRAY_INDEX_MAP[`case_req_opp_${i}`] = String(i - 1);
}

const PARAM_FACTOR_OVERRIDES: Record<string, number> = {
    c_prs_im_sp_max: 0.01,
    c_prs_im_sp_lim: 0.01,
    c_m_air_cyl_sp_max: 1_000_000,
};

const DSG_TERM_MAP: Array<[RegExp, string]> = [
    [/Hochschaltkennfeld/gi, 'Upshift map'],
    [/R.?ckschaltkennfeld/gi, 'Downshift map'],
    [/Schaltzeiten/gi, 'Shift times'],
    [/Stalldrehzahl/gi, 'Stall speed'],
    [/Momentenreduktion/gi, 'Torque reduction'],
    [/Hauptdruck/gi, 'Main pressure'],
    [/Kupplung/gi, 'Clutch'],
];

function normalizeArrayIndices(name: string): string {
    return name
        .replace(/^DATA_LMVLim\./i, '')
        .replace(/\[([A-Za-z][A-Za-z0-9_]*)]/g, (_match, label: string) =>
            `[${ARRAY_INDEX_MAP[label.toLowerCase()] ?? label}]`)
        .toLowerCase();
}

function isTechnicalId(line: string): boolean {
    const value = line.trim();
    return value.length > 0 && !value.includes(' ') && (value.includes('_') || value.includes('['));
}

function extractXdfIdentity(title: string, xdfDescription: string): { id: string; description: string } {
    const descriptionLines = xdfDescription
        ? xdfDescription.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
        : [];
    const technicalLine = descriptionLines.find(isTechnicalId) || '';

    if (technicalLine) {
        return {
            id: normalizeArrayIndices(technicalLine),
            description: descriptionLines.filter(line => line !== technicalLine).join('\n'),
        };
    }

    return {
        id: normalizeArrayIndices(title),
        description: xdfDescription && xdfDescription !== title ? xdfDescription : '',
    };
}

function translateDsgTerms(description: string): string {
    return DSG_TERM_MAP.reduce(
        (translated, [pattern, replacement]) => translated.replace(pattern, replacement),
        description,
    );
}

function parseInteger(value: string | null, fallback: number): number {
    if (!value) return fallback;
    const parsed = parseInt(value, /^[-+]?0x/i.test(value) ? 16 : 10);
    return Number.isNaN(parsed) ? fallback : parsed;
}

function parseMathEquation(equation: string): { factor: number; offset: number; formula?: RationalFormula } {
    equation = equation.trim();

    // Identity: X or x
    if (/^[xX]$/.test(equation)) return {factor: 1, offset: 0};

    // General rational function: ((a * X) op1 b) / (c op2 (d * X))
    // Matches forms like: ((0.0 * X) + 6622.0) / (1.0 + (1.0 * X))
    //                     ((a * X) - b) / (c - (d * X))
    const ratGen = equation.match(
        new RegExp(`^\\(\\s*\\(\\s*(${NUM})\\s*\\*\\s*X\\s*\\)\\s*([+-])\\s*(${NUM})\\s*\\)\\s*/\\s*\\(\\s*(${NUM})\\s*([+-])\\s*\\(\\s*(${NUM})\\s*\\*\\s*X\\s*\\)\\s*\\)$`, 'i')
    );
    if (ratGen) {
        const a = fixFloat(ratGen[1]);
        const b = fixFloat(ratGen[3]) * (ratGen[2] === '-' ? -1 : 1);
        const c = fixFloat(ratGen[4]);
        const d = fixFloat(ratGen[6]) * (ratGen[5] === '-' ? -1 : 1);
        // If d=0 it's linear: (a*X + b) / c
        if (d === 0 && c !== 0) return {factor: a / c, offset: b / c};
        // Non-linear: return formula
        return {factor: 1, offset: 0, formula: {a, b, c, d}};
    }

    // X / divisor
    const div = equation.match(new RegExp(`^X\\s*/\\s*(${NUM})$`, 'i'));
    if (div) return {factor: 1 / parseFloat(div[1]), offset: 0};

    // X * factor +/- offset
    const mulOff = equation.match(new RegExp(`^X\\s*\\*\\s*(${NUM})\\s*([+-])\\s*(${NUM})$`, 'i'));
    if (mulOff) {
        const f = parseFloat(mulOff[1]);
        const o = parseFloat(mulOff[3]) * (mulOff[2] === '-' ? -1 : 1);
        return {factor: f, offset: o};
    }

    // X * factor
    const mul = equation.match(new RegExp(`^X\\s*\\*\\s*(${NUM})$`, 'i'));
    if (mul) return {factor: parseFloat(mul[1]), offset: 0};

    // X +/- offset
    const addSub = equation.match(new RegExp(`^X\\s*([+-])\\s*(${NUM})$`, 'i'));
    if (addSub) return {factor: 1, offset: parseFloat(addSub[2]) * (addSub[1] === '-' ? -1 : 1)};

    return {factor: 1, offset: 0};
}

// --- Data type from XDF flags ---

function getDataType(sizeBits: number, typeFlags: number): DataType {
    const signed = (typeFlags & 0x01) !== 0;
    if ((typeFlags & 0x10000) && sizeBits === 32) return 'FLOAT32';
    switch (sizeBits) {
        case 8:
            return signed ? 'SBYTE' : 'UBYTE';
        case 16:
            return signed ? 'SWORD' : 'UWORD';
        case 32:
            return signed ? 'SLONG' : 'ULONG';
        default:
            return 'UWORD';
    }
}

// --- Address parsing ---

function parseAddress(addrStr: string | null): number | null {
    if (!addrStr) return null;
    return parseInt(addrStr, addrStr.startsWith('0x') || addrStr.startsWith('0X') ? 16 : 16);
}

// --- Axis parsing ---

interface ParsedAxis {
    address: number;
    dataType: DataType;
    cols: number;
    rows: number;
    unit: string;
    factor: number;
    offset: number;
    min: number;
    max: number;
    formula?: RationalFormula;
    embedded: boolean;
    points?: number;
    labels?: string[];
}

function parseAxisLabels(axisEl: Element): string[] | undefined {
    const labels: string[] = [];

    for (const labelEl of Array.from(axisEl.children)) {
        if (labelEl.tagName.toUpperCase() !== 'LABEL') continue;

        const indexStr = labelEl.getAttribute('index') || '';
        const index = parseInt(indexStr, indexStr.startsWith('0x') || indexStr.startsWith('0X') ? 16 : 10);
        if (!Number.isInteger(index) || index < 0) continue;

        labels[index] = labelEl.getAttribute('value') ?? '';
    }

    return labels.length > 0 ? labels : undefined;
}

function parseAxisElement(axisEl: Element): ParsedAxis | null {
    const embed = axisEl.querySelector('EMBEDDEDDATA') || axisEl.querySelector('embeddedData');
    const indexCountEl = axisEl.querySelector('indexcount');
    const points = parseInt(indexCountEl?.textContent || '1', 10);
    const labels = parseAxisLabels(axisEl);

    // No embedded data or no address/typeflags → non-embedded axis
    if (!embed || (!embed.getAttribute('mmedaddress') && !embed.getAttribute('mmedtypeflags'))) {
        return {
            address: 0,
            dataType: 'UWORD',
            cols: points,
            rows: 1,
            unit: '',
            factor: 1,
            offset: 0,
            min: 0,
            max: 0,
            embedded: false,
            points,
            labels
        };
    }

    const address = parseAddress(embed.getAttribute('mmedaddress')) ?? 0;

    // 0xFFFFFFFF is a sentinel for "no address" (e.g., DSG y-axis placeholders)
    if (address === 0xFFFFFFFF) {
        return {
            address: 0,
            dataType: 'UWORD',
            cols: points,
            rows: 1,
            unit: '',
            factor: 1,
            offset: 0,
            min: 0,
            max: 0,
            embedded: false,
            points,
            labels
        };
    }

    const sizeBits = parseInt(embed.getAttribute('mmedelementsizebits') || '16', 10);
    const typeFlags = parseInt(embed.getAttribute('mmedtypeflags') || '0', 16);
    const cols = parseInt(embed.getAttribute('mmedcolcount') || '1', 10);
    const rows = parseInt(embed.getAttribute('mmedrowcount') || '1', 10);

    const mathEl = axisEl.querySelector('MATH');
    const {factor, offset, formula} = mathEl ? parseMathEquation(mathEl.getAttribute('equation') || 'X') : {
        factor: 1,
        offset: 0
    };

    const unit = axisEl.querySelector('units')?.textContent || '';
    const min = parseFloat(axisEl.querySelector('min')?.textContent || '0');
    const max = parseFloat(axisEl.querySelector('max')?.textContent || '0');

    return {
        address,
        dataType: getDataType(sizeBits, typeFlags),
        cols, rows, unit, factor, offset, formula, min, max,
        embedded: true,
        points: cols > 1 ? cols : points,
        labels,
    };
}

// --- Main parser ---

export class XDFParser {
    private xmlDoc: Document | null = null;
    private baseOffset = 0;
    private bigEndian = false;
    private title = '';
    private categoryMap: Map<number, string> = new Map();

    parseXDFString(text: string): void {
        const parser = new DOMParser();
        this.xmlDoc = parser.parseFromString(text, 'text/xml');

        const header = this.xmlDoc.querySelector('XDFHEADER');
        if (!header) return;

        // Title (EPK/version)
        this.title = header.querySelector('deftitle')?.textContent || '';

        // BASEOFFSET
        const baseEl = header.querySelector('BASEOFFSET');
        if (baseEl) {
            const offsetStr = baseEl.getAttribute('offset') || '0';
            const parsed = parseInt(offsetStr, offsetStr.startsWith('0x') ? 16 : 10);
            if (!isNaN(parsed)) this.baseOffset = parsed;
        }

        // Endianness
        const defaults = header.querySelector('DEFAULTS');
        if (defaults) {
            this.bigEndian = defaults.getAttribute('lsbfirst') === '0';
        }

        // Categories
        this.categoryMap.clear();
        for (const cat of header.querySelectorAll('CATEGORY')) {
            const indexStr = cat.getAttribute('index') || '0';
            const index = parseInt(indexStr, indexStr.startsWith('0x') ? 16 : 10);
            const name = cat.getAttribute('name') || '';
            if (name) this.categoryMap.set(index, name);
        }
    }

    async parseXDF(file: File): Promise<void> {
        this.parseXDFString(await file.text());
    }

    generateDefinition(name?: string): Definition {
        if (!this.xmlDoc) throw new Error('No XDF file parsed');

        const parameters: IDefinitionParameter[] = [];
        const seen = new Set<string>();
        const seenIds = new Set<string>();

        // Preserve the source order and parse constants the same way as the CLI
        // parser. XDFs can freely interleave XDFTABLE and XDFCONSTANT elements.
        for (const element of Array.from(this.xmlDoc.documentElement.children)) {
            const tagName = element.tagName.toUpperCase();
            const param = tagName === 'XDFTABLE'
                ? this.parseTable(element)
                : tagName === 'XDFCONSTANT'
                    ? this.parseConstant(element)
                    : null;
            if (!param) continue;

            const key = `${param.id || param.name}\u0000${param.address}`;
            if (seen.has(key)) continue;
            seen.add(key);

            if (param.id) {
                if (seenIds.has(param.id)) param.id = `${param.id}_0x${param.address.toString(16)}`;
                seenIds.add(param.id);
            }
            parameters.push(param);
        }

        const def: Definition = {
            name: name || this.title,
            version: '1.0',
            baseAddress: this.baseOffset,
            parameters,
        };

        if (this.bigEndian) def.bigEndian = true;

        return def;
    }

    private resolveCategories(element: Element): string[] {
        const entries: [number, string][] = [];
        for (const catMem of element.querySelectorAll(':scope > CATEGORYMEM')) {
            const level = parseInt(catMem.getAttribute('index') || '0', 10);
            const catIdx = parseInt(catMem.getAttribute('category') || '0', 10);
            const catName = this.categoryMap.get(catIdx - 1);
            if (catName && catName !== 'Axis') entries.push([level, catName]);
        }
        entries.sort((a, b) => a[0] - b[0]);
        const cats = entries.map(e => e[1]);

        // Filter trailing "Misc" catch-all
        if (cats.length > 1 && cats[cats.length - 1] === 'Misc') cats.pop();

        return cats;
    }

    private parseTable(element: Element): IDefinitionParameter | null {
        // Table flags: bit 5 (0x20) = COLUMN_DIR
        const flags = parseInt(element.getAttribute('flags') || '0', 16);
        const columnDir = (flags & 0x20) !== 0;

        const title = element.querySelector('title')?.textContent || '';
        const xdfDesc = element.querySelector('description')?.textContent || '';

        // Detect A2L-generated XDFs: description first line is A2L ID
        const descLines = xdfDesc.split(/[\r\n]+/);
        const firstLine = (descLines[0] || '').trim();
        const isA2lId = firstLine && !firstLine.includes(' ') && (firstLine.includes('_') || firstLine.includes('['));

        let name: string;
        let description: string;
        if (isA2lId) {
            name = firstLine;
            description = title !== firstLine ? title : '';
        } else {
            name = title;
            description = xdfDesc && xdfDesc !== title ? `${title} — ${xdfDesc}` : title;
        }

        // Parse axes
        let xAxisData: ParsedAxis | null = null;
        let yAxisData: ParsedAxis | null = null;
        let zAxisData: ParsedAxis | null = null;

        for (const axisEl of element.querySelectorAll(':scope > XDFAXIS')) {
            const id = axisEl.getAttribute('id');
            const data = parseAxisElement(axisEl);
            if (!data) continue;
            if (id === 'x') xAxisData = data;
            else if (id === 'y') yAxisData = data;
            else if (id === 'z') zAxisData = data;
        }

        if (!zAxisData || !zAxisData.embedded) return null;

        const cols = zAxisData.cols;
        const rows = zAxisData.rows;

        let type: 'VALUE' | 'CURVE' | 'MAP' = 'VALUE';
        if (cols === 1 && rows === 1) type = 'VALUE';
        else if (rows === 1) type = 'CURVE';
        else type = 'MAP';

        const categories = this.resolveCategories(element);

        const param: IDefinitionParameter = {
            name,
            description,
            address: zAxisData.address,
            type,
            dataType: zAxisData.dataType,
            unit: zAxisData.unit,
            min: zAxisData.min,
            max: zAxisData.max,
            factor: zAxisData.factor,
            offset: zAxisData.offset,
            categories: categories.length > 0 ? categories : ['Uncategorized'],
        };

        if (type !== 'VALUE') {
            param.cols = cols;
            if (type === 'MAP') {
                param.rows = rows;
                if (columnDir) param.columnDir = true;
            }
        }

        // X axis
        if (xAxisData && xAxisData.embedded && type !== 'VALUE') {
            const axis: AxisDefinition = {
                type: 'COM_AXIS',
                points: xAxisData.points ?? xAxisData.cols,
                min: xAxisData.min,
                max: xAxisData.max,
                unit: xAxisData.unit,
                address: xAxisData.address,
                dataType: xAxisData.dataType,
            };
            if (xAxisData.factor !== 1) axis.factor = xAxisData.factor;
            if (xAxisData.offset !== 0) axis.offset = xAxisData.offset;
            if (xAxisData.labels) axis.labels = xAxisData.labels;
            param.xAxis = axis;
        } else if (xAxisData && !xAxisData.embedded && type !== 'VALUE') {
            const axis: AxisDefinition = {type: 'FIX_AXIS', points: xAxisData.points ?? cols, min: 0, max: 0, unit: ''};
            if (xAxisData.labels) axis.labels = xAxisData.labels;
            param.xAxis = axis;
        }

        // Y axis
        if (yAxisData && yAxisData.embedded && type === 'MAP') {
            const axis: AxisDefinition = {
                type: 'COM_AXIS',
                points: yAxisData.points ?? yAxisData.cols,
                min: yAxisData.min,
                max: yAxisData.max,
                unit: yAxisData.unit,
                address: yAxisData.address,
                dataType: yAxisData.dataType,
            };
            if (yAxisData.factor !== 1) axis.factor = yAxisData.factor;
            if (yAxisData.offset !== 0) axis.offset = yAxisData.offset;
            if (yAxisData.labels) axis.labels = yAxisData.labels;
            param.yAxis = axis;
        } else if (yAxisData && !yAxisData.embedded && type === 'MAP') {
            const axis: AxisDefinition = {type: 'FIX_AXIS', points: yAxisData.points ?? rows, min: 0, max: 0, unit: ''};
            if (yAxisData.labels) axis.labels = yAxisData.labels;
            param.yAxis = axis;
        }

        return param;
    }

    private parseConstant(element: Element): IDefinitionParameter | null {
        const title = element.querySelector('title')?.textContent || '';
        const xdfDesc = element.querySelector('description')?.textContent || '';
        const {id, description: extractedDescription} = extractXdfIdentity(title, xdfDesc);
        const name = title.trim() || id;
        if (!name) return null;
        const description = translateDsgTerms(extractedDescription);

        const embed = element.querySelector('EMBEDDEDDATA') || element.querySelector('embeddedData');
        if (!embed || !embed.hasAttribute('mmedaddress')) return null;
        const address = parseAddress(embed.getAttribute('mmedaddress'));
        if (address === null) return null;

        const sizeBits = parseInteger(embed.getAttribute('mmedelementsizebits'), 16);
        const typeFlags = parseInteger(embed.getAttribute('mmedtypeflags'), 0);
        const dataType = getDataType(sizeBits, typeFlags);

        const mathEl = element.querySelector('MATH');
        const {
            factor: parsedFactor,
            offset,
            formula
        } = mathEl ? parseMathEquation(mathEl.getAttribute('equation') || 'X') : {factor: 1, offset: 0};
        const factor = PARAM_FACTOR_OVERRIDES[id] ?? parsedFactor;

        const unit = element.querySelector('units')?.textContent || '';
        const minText = element.querySelector('min')?.textContent;
        const maxText = element.querySelector('max')?.textContent;
        const min = minText ? parseFloat(minText) : 0;
        const max = maxText ? parseFloat(maxText) : dataType === 'UBYTE' ? 255 : 65535;

        const categories = this.resolveCategories(element);

        return {
            id,
            name,
            description,
            address: address,
            type: 'VALUE',
            dataType,
            unit, min, max, factor, offset, formula,
            categories: categories.length > 0 ? categories : ['Uncategorized'],
        };
    }

    getStats(): { tables: number; constants: number; total: number } {
        if (!this.xmlDoc) return {tables: 0, constants: 0, total: 0};
        return {
            tables: this.xmlDoc.querySelectorAll('XDFTABLE').length,
            constants: this.xmlDoc.querySelectorAll('XDFCONSTANT').length,
            total: this.xmlDoc.querySelectorAll('XDFTABLE').length + this.xmlDoc.querySelectorAll('XDFCONSTANT').length,
        };
    }

    getBaseOffset(): number {
        return this.baseOffset;
    }

    getTitle(): string {
        return this.title;
    }
}
