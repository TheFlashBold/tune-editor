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
    const parser = new DOMParser();
    this.xmlDoc = parser.parseFromString(text, 'text/xml');
  }

  generateDefinition(name: string): Definition {
    if (!this.xmlDoc) {
      throw new Error('No XDF file parsed');
    }

    const parameters: Parameter[] = [];
    this.matchedCount = 0;

    // Parse XDFTABLE elements (tables and curves)
    const tables = this.xmlDoc.querySelectorAll('XDFTABLE');
    for (const table of tables) {
      const param = this.parseTable(table);
      if (param) {
        parameters.push(param);
      }
    }

    // Parse XDFCONSTANT elements (single values)
    const constants = this.xmlDoc.querySelectorAll('XDFCONSTANT');
    for (const constant of constants) {
      const param = this.parseConstant(constant);
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

  private parseTable(element: Element): Parameter | null {
    const title = element.querySelector('title')?.textContent || '';
    const description = element.querySelector('description')?.textContent || title;

    // Get main data info
    const embeddedData = element.querySelector('embeddedData');
    if (!embeddedData) return null;

    const address = this.parseAddress(embeddedData.getAttribute('mmedaddress'));
    if (address === null) return null;

    const sizeBits = parseInt(embeddedData.getAttribute('mmedelementsizebits') || '8', 10);
    const typeFlags = parseInt(embeddedData.getAttribute('mmedtypeflags') || '0', 16);
    const dataType = this.getDataType(sizeBits, typeFlags);

    // Parse math equation for factor/offset
    const { factor, offset } = this.parseMath(element.querySelector(':scope > MATH'));

    // Parse axes
    const axes = element.querySelectorAll(':scope > XDFAXIS');
    let xAxis: AxisDefinition | undefined;
    let yAxis: AxisDefinition | undefined;
    let cols = 1;
    let rows = 1;

    for (const axis of axes) {
      const axisId = axis.getAttribute('id');
      const axisDef = this.parseAxis(axis);

      if (axisId === 'x' && axisDef) {
        xAxis = axisDef;
        cols = axisDef.points;
      } else if (axisId === 'y' && axisDef) {
        yAxis = axisDef;
        rows = axisDef.points;
      }
    }

    // Determine type
    let type: 'VALUE' | 'CURVE' | 'MAP' = 'VALUE';
    if (yAxis && yAxis.points > 1) {
      type = 'MAP';
    } else if (xAxis && xAxis.points > 1) {
      type = 'CURVE';
    }

    // Apply CSV mapping
    const { categories, customName } = this.findMapping(title);

    // Skip if CSV is loaded but no match found
    if (this.csvMappings.length > 0 && categories.length === 0) {
      return null;
    }

    if (categories.length > 0) {
      this.matchedCount++;
    }

    const unit = element.querySelector('units')?.textContent || '';
    const min = parseFloat(element.querySelector('min')?.textContent || '0');
    const max = parseFloat(element.querySelector('max')?.textContent || '65535');

    return {
      name: title,
      description,
      address,
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
      categories: categories.length > 0 ? categories : ['Uncategorized'],
      customName: customName || undefined,
    };
  }

  private parseConstant(element: Element): Parameter | null {
    const title = element.querySelector('title')?.textContent || '';
    const description = element.querySelector('description')?.textContent || title;

    const embeddedData = element.querySelector('embeddedData');
    if (!embeddedData) return null;

    const address = this.parseAddress(embeddedData.getAttribute('mmedaddress'));
    if (address === null) return null;

    const sizeBits = parseInt(embeddedData.getAttribute('mmedelementsizebits') || '8', 10);
    const typeFlags = parseInt(embeddedData.getAttribute('mmedtypeflags') || '0', 16);
    const dataType = this.getDataType(sizeBits, typeFlags);

    const { factor, offset } = this.parseMath(element.querySelector('MATH'));

    const { categories, customName } = this.findMapping(title);

    if (this.csvMappings.length > 0 && categories.length === 0) {
      return null;
    }

    if (categories.length > 0) {
      this.matchedCount++;
    }

    const unit = element.querySelector('units')?.textContent || '';
    const min = parseFloat(element.querySelector('min')?.textContent || '0');
    const max = parseFloat(element.querySelector('max')?.textContent || '65535');

    return {
      name: title,
      description,
      address,
      type: 'VALUE',
      dataType,
      unit,
      min,
      max,
      factor,
      offset,
      categories: categories.length > 0 ? categories : ['Uncategorized'],
      customName: customName || undefined,
    };
  }

  private parseAxis(element: Element): AxisDefinition | null {
    const embeddedData = element.querySelector('embeddedData');
    const indexCount = parseInt(element.getAttribute('indexcount') || '1', 10);

    if (indexCount <= 1) return null;

    let address: number | undefined;
    let dataType: DataType = 'UWORD';
    let dataOffset = 0;

    if (embeddedData) {
      const addr = this.parseAddress(embeddedData.getAttribute('mmedaddress'));
      if (addr !== null) address = addr;

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
      dataOffset,
    };
  }

  private parseMath(mathElement: Element | null): { factor: number; offset: number } {
    if (!mathElement) {
      return { factor: 1, offset: 0 };
    }

    const equation = mathElement.getAttribute('equation') || 'X';

    // Parse common XDF math equations like "X * 0.1" or "X * 0.01 + 10"
    // Format: X * factor + offset or X / divisor + offset
    let factor = 1;
    let offset = 0;

    // Match: X * number
    const mulMatch = equation.match(/X\s*\*\s*([\d.]+)/i);
    if (mulMatch) {
      factor = parseFloat(mulMatch[1]);
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
