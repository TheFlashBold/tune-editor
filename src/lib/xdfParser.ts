import { Parameter, DataType, AxisDefinition, Definition } from '../types';

interface CsvMapping {
  categories: string[];
  pattern: string;
  customName: string;
}

export class XDFParser {
  private xmlDoc: Document | null = null;
  private csvMappings: CsvMapping[] = [];
  private matchedCount = 0;
  private baseOffset = 0;
  private categoryMap: Map<number, string> = new Map();

  parseCsv(csvContent: string): void {
    const lines = csvContent.split('\n');
    if (lines.length < 2) return;

    const header = this.parseCsvLine(lines[0]);
    const tableNameIdx = header.findIndex(h => h.toLowerCase().includes('table name'));
    const customNameIdx = header.findIndex(h => h.toLowerCase().includes('custom name'));
    const categoryColumns = tableNameIdx > 0 ? tableNameIdx : 3;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = this.parseCsvLine(line);
      const pattern = parts[tableNameIdx] || '';
      if (!pattern) continue;

      const categories = parts.slice(0, categoryColumns).filter(c => c.trim());
      const customName = customNameIdx >= 0 ? parts[customNameIdx] || '' : '';

      this.csvMappings.push({ categories, pattern, customName });
    }
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  async parseXDF(file: File): Promise<void> {
    const text = await file.text();
    this.parseXDFString(text);
  }

  parseXDFString(text: string): void {
    const parser = new DOMParser();
    this.xmlDoc = parser.parseFromString(text, 'text/xml');

    // Parse BASEOFFSET from XDFHEADER
    const baseOffsetEl = this.xmlDoc.querySelector('XDFHEADER > BASEOFFSET');
    if (baseOffsetEl) {
      this.baseOffset = parseInt(baseOffsetEl.getAttribute('offset') || '0', 10);
    }

    // Parse CATEGORY elements from XDFHEADER
    this.categoryMap.clear();
    const categories = this.xmlDoc.querySelectorAll('XDFHEADER > CATEGORY');
    for (const cat of categories) {
      const indexStr = cat.getAttribute('index') || '0';
      const index = parseInt(indexStr, indexStr.startsWith('0x') ? 16 : 10);
      const name = cat.getAttribute('name') || '';
      if (name) {
        this.categoryMap.set(index, name);
      }
    }
  }

  getBaseOffset(): number {
    return this.baseOffset;
  }

  generateDefinition(name: string, addressTransform?: (addr: number) => number): Definition {
    if (!this.xmlDoc) {
      throw new Error('No XDF file parsed');
    }

    const parameters: Parameter[] = [];
    this.matchedCount = 0;

    // Parse XDFTABLE elements (tables and curves)
    const tables = this.xmlDoc.querySelectorAll('XDFTABLE');
    for (const table of tables) {
      const param = this.parseTable(table, addressTransform);
      if (param) {
        parameters.push(param);
      }
    }

    // Parse XDFCONSTANT elements (single values)
    const constants = this.xmlDoc.querySelectorAll('XDFCONSTANT');
    for (const constant of constants) {
      const param = this.parseConstant(constant, addressTransform);
      if (param) {
        parameters.push(param);
      }
    }

    return {
      name,
      version: '1.0',
      parameters,
    };
  }

  private resolveCategories(element: Element): string[] {
    // Use CATEGORYMEM elements to resolve category names
    const catMems = element.querySelectorAll(':scope > CATEGORYMEM');
    const categories: string[] = [];

    for (const catMem of catMems) {
      const catIndex = parseInt(catMem.getAttribute('category') || '0', 10);
      const catName = this.categoryMap.get(catIndex);
      if (catName) {
        categories.push(catName);
      }
    }

    return categories;
  }

  private parseTable(element: Element, addressTransform?: (addr: number) => number): Parameter | null {
    const title = element.querySelector('title')?.textContent || '';
    const description = element.querySelector('description')?.textContent || title;

    // In XDF format, the z-axis contains the main data (address, type, dimensions)
    const zAxis = element.querySelector(':scope > XDFAXIS[id="z"]');
    const zEmbedded = zAxis?.querySelector('embeddedData') || zAxis?.querySelector('EMBEDDEDDATA');

    // Try table-level embeddedData first, then fall back to z-axis
    let embeddedData = element.querySelector(':scope > embeddedData') || element.querySelector(':scope > EMBEDDEDDATA');
    if (!embeddedData && zEmbedded) {
      embeddedData = zEmbedded;
    }
    if (!embeddedData) return null;

    const address = this.parseAddress(embeddedData.getAttribute('mmedaddress'));
    if (address === null) return null;

    const finalAddress = addressTransform ? addressTransform(address) : address;

    const sizeBits = parseInt(embeddedData.getAttribute('mmedelementsizebits') || '8', 10);
    const typeFlags = parseInt(embeddedData.getAttribute('mmedtypeflags') || '0', 16);
    const dataType = this.getDataType(sizeBits, typeFlags);

    // Parse math equation from z-axis or table-level MATH
    const mathElement = zAxis?.querySelector('MATH') || element.querySelector(':scope > MATH');
    const { factor, offset } = this.parseMath(mathElement);

    // Get units/min/max from z-axis or table level
    const unitSource = zAxis || element;
    const unit = unitSource.querySelector('units')?.textContent || '';
    const min = parseFloat(unitSource.querySelector('min')?.textContent || '0');
    const max = parseFloat(unitSource.querySelector('max')?.textContent || '65535');

    // Parse x/y axes
    const axes = element.querySelectorAll(':scope > XDFAXIS');
    let xAxis: AxisDefinition | undefined;
    let yAxis: AxisDefinition | undefined;
    let cols = 1;
    let rows = 1;

    // Get rows from z-axis mmedrowcount if available
    const zRowCount = parseInt(embeddedData.getAttribute('mmedrowcount') || '0', 10);
    const zColCount = parseInt(embeddedData.getAttribute('mmedcolcount') || '0', 10);

    for (const axis of axes) {
      const axisId = axis.getAttribute('id');
      if (axisId === 'z') continue; // z-axis is the data, not a dimension axis

      const axisDef = this.parseAxis(axis, addressTransform);

      if (axisId === 'x' && axisDef) {
        xAxis = axisDef;
        cols = axisDef.points;
      } else if (axisId === 'y' && axisDef) {
        yAxis = axisDef;
        rows = axisDef.points;
      }
    }

    // Use z-axis dimensions if x/y didn't provide them
    if (zColCount > 0 && cols === 1) cols = zColCount;
    if (zRowCount > 0 && rows === 1) rows = zRowCount;

    // Determine type
    let type: 'VALUE' | 'CURVE' | 'MAP' = 'VALUE';
    if ((yAxis && yAxis.points > 1) || (rows > 1 && cols > 1)) {
      type = 'MAP';
    } else if ((xAxis && xAxis.points > 1) || cols > 1) {
      type = 'CURVE';
    }

    // Resolve categories from CATEGORYMEM or CSV mapping
    let categories: string[];
    let customName = '';

    if (this.csvMappings.length > 0) {
      const mapping = this.findMapping(title);
      categories = mapping.categories;
      customName = mapping.customName;

      // Skip if CSV is loaded but no match found
      if (categories.length === 0) {
        return null;
      }
      this.matchedCount++;
    } else {
      categories = this.resolveCategories(element);
      if (categories.length === 0) {
        categories = ['Uncategorized'];
      }
    }

    return {
      name: title,
      description,
      address: finalAddress,
      type,
      dataType,
      unit,
      min,
      max,
      factor,
      offset,
      xAxis,
      yAxis,
      rows: type === 'MAP' ? rows : undefined,
      cols: type !== 'VALUE' ? cols : undefined,
      categories,
      customName: customName || undefined,
    };
  }

  private parseConstant(element: Element, addressTransform?: (addr: number) => number): Parameter | null {
    const title = element.querySelector('title')?.textContent || '';
    const description = element.querySelector('description')?.textContent || title;

    const embeddedData = element.querySelector('embeddedData') || element.querySelector('EMBEDDEDDATA');
    if (!embeddedData) return null;

    const address = this.parseAddress(embeddedData.getAttribute('mmedaddress'));
    if (address === null) return null;

    const finalAddress = addressTransform ? addressTransform(address) : address;

    const sizeBits = parseInt(embeddedData.getAttribute('mmedelementsizebits') || '8', 10);
    const typeFlags = parseInt(embeddedData.getAttribute('mmedtypeflags') || '0', 16);
    const dataType = this.getDataType(sizeBits, typeFlags);

    const { factor, offset } = this.parseMath(element.querySelector('MATH'));

    let categories: string[];
    let customName = '';

    if (this.csvMappings.length > 0) {
      const mapping = this.findMapping(title);
      categories = mapping.categories;
      customName = mapping.customName;
      if (categories.length === 0) return null;
      this.matchedCount++;
    } else {
      categories = this.resolveCategories(element);
      if (categories.length === 0) categories = ['Uncategorized'];
    }

    const unit = element.querySelector('units')?.textContent || '';
    const min = parseFloat(element.querySelector('min')?.textContent || '0');
    const max = parseFloat(element.querySelector('max')?.textContent || '65535');

    return {
      name: title,
      description,
      address: finalAddress,
      type: 'VALUE',
      dataType,
      unit,
      min,
      max,
      factor,
      offset,
      categories,
      customName: customName || undefined,
    };
  }

  private parseAxis(element: Element, addressTransform?: (addr: number) => number): AxisDefinition | null {
    const embeddedData = element.querySelector('embeddedData') || element.querySelector('EMBEDDEDDATA');
    const indexCountEl = element.querySelector('indexcount');
    const indexCount = parseInt(indexCountEl?.textContent || '1', 10);

    if (indexCount <= 1) return null;

    let address: number | undefined;
    let dataType: DataType = 'UWORD';

    if (embeddedData) {
      const addr = this.parseAddress(embeddedData.getAttribute('mmedaddress'));
      if (addr !== null) {
        address = addressTransform ? addressTransform(addr) : addr;
      }

      const sizeBits = parseInt(embeddedData.getAttribute('mmedelementsizebits') || '16', 10);
      const typeFlags = parseInt(embeddedData.getAttribute('mmedtypeflags') || '0', 16);
      dataType = this.getDataType(sizeBits, typeFlags);
    }

    const { factor, offset } = this.parseMath(element.querySelector('MATH'));
    const unit = element.querySelector('units')?.textContent || '';
    const min = parseFloat(element.querySelector('min')?.textContent || '0');
    const max = parseFloat(element.querySelector('max')?.textContent || '65535');

    return {
      type: address !== undefined ? 'STD_AXIS' : 'FIX_AXIS',
      points: indexCount,
      min,
      max,
      unit,
      address,
      dataType,
      factor,
      offset,
      dataOffset: 0,
    };
  }

  private parseMath(mathElement: Element | null): { factor: number; offset: number } {
    if (!mathElement) {
      return { factor: 1, offset: 0 };
    }

    const equation = mathElement.getAttribute('equation') || 'X';

    // Try rational function format: ((a * X) - b) / (c - (d * X))
    const rationalMatch = equation.match(
      /\(\(\s*([\d.]+)\s*\*\s*X\s*\)\s*-\s*([\d.]+)\s*\)\s*\/\s*\(\s*([\d.]+)\s*-\s*\(\s*([\d.]+)\s*\*\s*X\s*\)\s*\)/i
    );
    if (rationalMatch) {
      const a = parseFloat(rationalMatch[1]);
      const b = parseFloat(rationalMatch[2]);
      const c = parseFloat(rationalMatch[3]);
      const d = parseFloat(rationalMatch[4]);

      if (d === 0 && c !== 0) {
        // Simplifies to (a*X - b) / c = (a/c)*X - (b/c)
        return { factor: a / c, offset: -(b / c) };
      }
      // Non-zero d: can't represent as simple factor+offset, approximate
      // For display purposes, use a/c as factor and -b/c as offset
      if (c !== 0) {
        return { factor: a / c, offset: -(b / c) };
      }
    }

    // Parse simpler XDF math equations like "X * 0.1" or "X * 0.01 + 10"
    let factor = 1;
    let offset = 0;

    // Match: X * number
    const mulMatch = equation.match(/X\s*\*\s*([\d.]+)/i);
    if (mulMatch) {
      factor = parseFloat(mulMatch[1]);
    }

    // Match: number * X
    const mulMatch2 = equation.match(/([\d.]+)\s*\*\s*X/i);
    if (!mulMatch && mulMatch2) {
      factor = parseFloat(mulMatch2[1]);
    }

    // Match: X / number
    const divMatch = equation.match(/X\s*\/\s*([\d.]+)/i);
    if (divMatch) {
      factor = 1 / parseFloat(divMatch[1]);
    }

    // Match: + number or - number at the end
    const addMatch = equation.match(/([+-])\s*([\d.]+)\s*$/);
    if (addMatch) {
      offset = parseFloat(addMatch[2]);
      if (addMatch[1] === '-') offset = -offset;
    }

    return { factor, offset };
  }

  private parseAddress(addrStr: string | null): number | null {
    if (!addrStr) return null;
    // XDF addresses are typically hex strings starting with 0x
    if (addrStr.startsWith('0x') || addrStr.startsWith('0X')) {
      return parseInt(addrStr, 16);
    }
    return parseInt(addrStr, 16);
  }

  private getDataType(sizeBits: number, typeFlags: number): DataType {
    const signed = (typeFlags & 0x01) !== 0;
    const isFloat = (typeFlags & 0x10000) !== 0;

    if (isFloat && sizeBits === 32) return 'FLOAT32';

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

  private findMapping(name: string): { categories: string[]; customName: string } {
    for (const mapping of this.csvMappings) {
      if (this.matchPattern(name, mapping.pattern)) {
        return { categories: mapping.categories, customName: mapping.customName };
      }
    }
    return { categories: [], customName: '' };
  }

  private matchPattern(name: string, pattern: string): boolean {
    const lowerName = name.toLowerCase();
    const lowerPattern = pattern.toLowerCase();

    if (pattern.includes('*')) {
      const regex = new RegExp('^' + lowerPattern.replace(/\*/g, '.*') + '$');
      return regex.test(lowerName);
    }

    return lowerName === lowerPattern;
  }

  getStats(): { tables: number; constants: number; matched: number } {
    if (!this.xmlDoc) return { tables: 0, constants: 0, matched: 0 };

    return {
      tables: this.xmlDoc.querySelectorAll('XDFTABLE').length,
      constants: this.xmlDoc.querySelectorAll('XDFCONSTANT').length,
      matched: this.matchedCount,
    };
  }
}
