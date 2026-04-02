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
        case 8:  return signed ? 'SBYTE' : 'UBYTE';
        case 16: return signed ? 'SWORD' : 'UWORD';
        case 32: return signed ? 'SLONG' : 'ULONG';
        default: return 'UWORD';
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

function parseAxisElement(axisEl: Element): ParsedAxis | null {
    const embed = axisEl.querySelector('EMBEDDEDDATA') || axisEl.querySelector('embeddedData');
    const indexCountEl = axisEl.querySelector('indexcount');
    const points = parseInt(indexCountEl?.textContent || '1', 10);

    // No embedded data or no address/typeflags → non-embedded axis
    if (!embed || (!embed.getAttribute('mmedaddress') && !embed.getAttribute('mmedtypeflags'))) {
        return {address: 0, dataType: 'UWORD', cols: points, rows: 1, unit: '', factor: 1, offset: 0, min: 0, max: 0, embedded: false, points};
    }

    const address = parseAddress(embed.getAttribute('mmedaddress')) ?? 0;

    // 0xFFFFFFFF is a sentinel for "no address" (e.g., DSG y-axis placeholders)
    if (address === 0xFFFFFFFF) {
        const labels = Array.from(axisEl.querySelectorAll('LABEL'))
            .sort((a, b) => parseInt(a.getAttribute('index') || '0') - parseInt(b.getAttribute('index') || '0'))
            .map(l => l.getAttribute('value') || '');
        return {address: 0, dataType: 'UWORD', cols: points, rows: 1, unit: '', factor: 1, offset: 0, min: 0, max: 0, embedded: false, points, labels: labels.length > 0 ? labels : undefined};
    }

    const sizeBits = parseInt(embed.getAttribute('mmedelementsizebits') || '16', 10);
    const typeFlags = parseInt(embed.getAttribute('mmedtypeflags') || '0', 16);
    const cols = parseInt(embed.getAttribute('mmedcolcount') || '1', 10);
    const rows = parseInt(embed.getAttribute('mmedrowcount') || '1', 10);

    const mathEl = axisEl.querySelector('MATH');
    const {factor, offset, formula} = mathEl ? parseMathEquation(mathEl.getAttribute('equation') || 'X') : {factor: 1, offset: 0};

    const unit = axisEl.querySelector('units')?.textContent || '';
    const min = parseFloat(axisEl.querySelector('min')?.textContent || '0');
    const max = parseFloat(axisEl.querySelector('max')?.textContent || '0');

    return {
        address,
        dataType: getDataType(sizeBits, typeFlags),
        cols, rows, unit, factor, offset, formula, min, max,
        embedded: true,
        points: cols > 1 ? cols : points,
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
            const parsed = parseInt(offsetStr, 10);
            if (!isNaN(parsed)) this.baseOffset = parsed;
        }

        // Endianness
        const defaults = header.querySelector('DEFAULTS');
        if (defaults) this.bigEndian = defaults.getAttribute('lsbfirst') === '0';

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

        for (const table of this.xmlDoc.querySelectorAll('XDFTABLE')) {
            const param = this.parseTable(table);
            if (param) parameters.push(param);
        }

        // XDFCONSTANT → VALUE parameters
        for (const constant of this.xmlDoc.querySelectorAll('XDFCONSTANT')) {
            const param = this.parseConstant(constant);
            if (param) parameters.push(param);
        }

        const def: Definition = {
            name: name || this.title,
            version: '1.0',
            baseAddress: 0,
            parameters,
        };

        if (this.baseOffset) (def as any).offset = this.baseOffset;

        // Extract EPK from title for verification
        const epkMatch = this.title.match(/^(SC[18G]\w+|SA\w+|SC4\w+|S8\w+|F\w{3})/i);
        const isSimos = epkMatch && /^S/i.test(epkMatch[1]);

        // Only trust lsbfirst=0 (big endian) for Simos ECUs — DSG/TCU XDFs
        // report lsbfirst=0 but actual binary data is always little-endian
        if (this.bigEndian && isSimos) def.bigEndian = true;
        if (epkMatch) {
            def.verification = {
                position: this.baseOffset,
                expected: epkMatch[1].replace(/\.a2l$/i, ''),
            };
        }

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
            address: zAxisData.address + this.baseOffset,
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
                address: xAxisData.address + this.baseOffset,
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
                address: yAxisData.address + this.baseOffset,
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

        const descLines = xdfDesc.split(/[\r\n]+/);
        const firstLine = (descLines[0] || '').trim();
        const isA2lId = firstLine && !firstLine.includes(' ') && (firstLine.includes('_') || firstLine.includes('['));

        const name = isA2lId ? firstLine : title;
        const description = isA2lId ? (title !== firstLine ? title : '') : (xdfDesc && xdfDesc !== title ? `${title} — ${xdfDesc}` : title);

        const embed = element.querySelector('EMBEDDEDDATA') || element.querySelector('embeddedData');
        if (!embed) return null;
        const address = parseAddress(embed.getAttribute('mmedaddress'));
        if (address === null) return null;

        const sizeBits = parseInt(embed.getAttribute('mmedelementsizebits') || '8', 10);
        const typeFlags = parseInt(embed.getAttribute('mmedtypeflags') || '0', 16);

        const mathEl = element.querySelector('MATH');
        const {factor, offset, formula} = mathEl ? parseMathEquation(mathEl.getAttribute('equation') || 'X') : {factor: 1, offset: 0};

        const unit = element.querySelector('units')?.textContent || '';
        const min = parseFloat(element.querySelector('min')?.textContent || '0');
        const max = parseFloat(element.querySelector('max')?.textContent || '65535');

        const categories = this.resolveCategories(element);

        return {
            name,
            description,
            address: address + this.baseOffset,
            type: 'VALUE',
            dataType: getDataType(sizeBits, typeFlags),
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
