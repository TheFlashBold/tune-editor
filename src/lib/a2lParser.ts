import { Parameter, DataType, AxisDefinition, Definition, DATA_TYPE_INFO } from '../types';

interface CompuMethod {
  name: string;
  unit: string;
  coeffs: number[]; // [a, b, c, d, e, f] for RAT_FUNC
}

interface RecordLayout {
  name: string;
  dataType: DataType;
  axisOffset: number; // Byte offset where axis data starts (from AXIS_PTS_X position)
  columnDir: boolean; // true if data is stored column-wise (COLUMN_DIR)
}

interface AxisPts {
  name: string;
  address: number;
  dataType: DataType;
  dataOffset: number;
  points: number;
  compuMethod: string;
  min: number;
  max: number;
}

interface RawCharacteristic {
  name: string;
  description: string;
  type: 'VALUE' | 'CURVE' | 'MAP' | 'VAL_BLK';
  address: number;
  deposit: string;
  compuMethod: string;
  min: number;
  max: number;
  axes: RawAxisDescr[];
}

interface RawAxisDescr {
  type: string;
  compuMethod: string;
  points: number;
  min: number;
  max: number;
  axisPtsRef?: string;
}

interface CsvMapping {
  categories: string[];
  pattern: string;
  customName: string;
}

const DATATYPE_MAP: Record<string, DataType> = {
  UBYTE: 'UBYTE',
  SBYTE: 'SBYTE',
  UWORD: 'UWORD',
  SWORD: 'SWORD',
  ULONG: 'ULONG',
  SLONG: 'SLONG',
  FLOAT32_IEEE: 'FLOAT32',
  FLOAT64_IEEE: 'FLOAT32', // Approximate
};

export class A2LParser {
  private content: string = '';
  private compuMethods: Map<string, CompuMethod> = new Map();
  private recordLayouts: Map<string, RecordLayout> = new Map();
  private axisPts: Map<string, AxisPts> = new Map();
  private characteristics: RawCharacteristic[] = [];
  private csvMappings: CsvMapping[] = [];

  async parseA2L(file: File): Promise<void> {
    // A2L files are often encoded in ISO-8859-1 (Latin-1)
    const buffer = await file.arrayBuffer();
    this.content = new TextDecoder('iso-8859-1').decode(buffer);
    this.parseCompuMethods();
    this.parseRecordLayouts();
    this.parseAxisPts();
    this.parseCharacteristics();
  }

  parseCsv(csvContent: string): void {
    const lines = csvContent.split('\n');
    if (lines.length < 2) return;

    // Parse header to find column indices
    const header = this.parseCsvLine(lines[0]);
    const tableNameIdx = header.findIndex(h => h.toLowerCase().includes('table name'));
    const customNameIdx = header.findIndex(h => h.toLowerCase().includes('custom name'));

    // All columns before "Table Name" are category columns
    const categoryColumns = tableNameIdx > 0 ? tableNameIdx : 3;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = this.parseCsvLine(line);
      const pattern = parts[tableNameIdx] || '';
      if (!pattern) continue;

      // Collect non-empty category values
      const categories: string[] = [];
      for (let c = 0; c < categoryColumns; c++) {
        if (parts[c]?.trim()) {
          categories.push(parts[c].trim());
        }
      }

      this.csvMappings.push({
        categories,
        pattern,
        customName: customNameIdx >= 0 ? parts[customNameIdx] || '' : '',
      });
    }
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
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

  private parseCompuMethods(): void {
    const regex = /\/begin COMPU_METHOD\s+(\S+)\s+"[^"]*"\s+\S+\s+"[^"]*"\s+"([^"]*)"/g;
    let match;

    while ((match = regex.exec(this.content)) !== null) {
      const name = match[1];
      const unit = match[2];

      // Find COEFFS
      const blockEnd = this.content.indexOf('/end COMPU_METHOD', match.index);
      const block = this.content.substring(match.index, blockEnd);
      const coeffsMatch = block.match(/COEFFS\s+([\d.\-+eE]+)\s+([\d.\-+eE]+)\s+([\d.\-+eE]+)\s+([\d.\-+eE]+)\s+([\d.\-+eE]+)\s+([\d.\-+eE]+)/);

      this.compuMethods.set(name, {
        name,
        unit,
        coeffs: coeffsMatch ? coeffsMatch.slice(1, 7).map(Number) : [],
      });
    }
  }

  private parseRecordLayouts(): void {
    const regex = /\/begin RECORD_LAYOUT\s+(\S+)([\s\S]*?)\/end RECORD_LAYOUT/g;
    let match;

    while ((match = regex.exec(this.content)) !== null) {
      const name = match[1];
      const block = match[2];

      // Match FNC_VALUES for characteristics or AXIS_PTS_X for axis points
      // Use negative lookbehind to avoid matching NO_AXIS_PTS_X
      const fncMatch = block.match(/FNC_VALUES\s+(\d+)\s+(\S+)\s+(\S+)/);
      const axisMatch = block.match(/(?<!NO_)AXIS_PTS_X\s+(\d+)\s+(\S+)/);
      const typeStr = fncMatch?.[2] || axisMatch?.[2];
      const dataType = typeStr ? (DATATYPE_MAP[typeStr] || 'UWORD') : 'UWORD';

      // Check if data is stored column-wise
      const columnDir = fncMatch?.[3] === 'COLUMN_DIR';

      // For axis data, calculate byte offset based on NO_AXIS_PTS_X size
      let axisOffset = 0;
      const noAxisMatch = block.match(/NO_AXIS_PTS_X\s+\d+\s+(\S+)/);
      if (noAxisMatch && axisMatch) {
        const noAxisType = DATATYPE_MAP[noAxisMatch[1]] || 'UBYTE';
        axisOffset = DATA_TYPE_INFO[noAxisType].size;
      }

      this.recordLayouts.set(name, { name, dataType, axisOffset, columnDir });
    }
  }

  private parseAxisPts(): void {
    const regex = /\/begin AXIS_PTS\s+(\S+)\s+"[^"]*"\s+(0x[0-9a-fA-F]+|\d+)\s+\S+\s+(\S+)\s+[\d.\-+eE]+\s+(\S+)\s+(\d+)\s+([\d.\-+eE]+)\s+([\d.\-+eE]+)/g;
    let match;

    while ((match = regex.exec(this.content)) !== null) {
      const layout = this.recordLayouts.get(match[3]);
      this.axisPts.set(match[1], {
        name: match[1],
        address: parseInt(match[2], 0),
        dataType: layout?.dataType || 'UWORD',
        dataOffset: layout?.axisOffset || 0,
        points: parseInt(match[5]),
        compuMethod: match[4],
        min: parseFloat(match[6]),
        max: parseFloat(match[7]),
      });
    }
  }

  private parseCharacteristics(): void {
    const regex = /\/begin CHARACTERISTIC\s+(\S+)\s+"([^"]*)"\s+(VALUE|CURVE|MAP|VAL_BLK)\s+(0x[0-9a-fA-F]+|\d+)\s+(\S+)\s+[\d.\-+eE]+\s+(\S+)\s+([\d.\-+eE]+)\s+([\d.\-+eE]+)/g;
    let match;

    while ((match = regex.exec(this.content)) !== null) {
      const name = match[1];
      const blockStart = match.index + match[0].length;
      const blockEnd = this.content.indexOf('/end CHARACTERISTIC', blockStart);
      const block = this.content.substring(blockStart, blockEnd);

      const char: RawCharacteristic = {
        name,
        description: match[2],
        type: match[3] as 'VALUE' | 'CURVE' | 'MAP' | 'VAL_BLK',
        address: parseInt(match[4], 0),
        deposit: match[5],
        compuMethod: match[6],
        min: parseFloat(match[7]),
        max: parseFloat(match[8]),
        axes: this.parseAxisDescrs(block),
      };

      this.characteristics.push(char);
    }
  }

  private parseAxisDescrs(block: string): RawAxisDescr[] {
    const axes: RawAxisDescr[] = [];
    const regex = /\/begin AXIS_DESCR\s+(STD_AXIS|COM_AXIS|FIX_AXIS|CURVE_AXIS|RES_AXIS)\s+\S+\s+(\S+)\s+(\d+)\s+([\d.\-+eE]+)\s+([\d.\-+eE]+)/g;
    let match;

    while ((match = regex.exec(block)) !== null) {
      const axisEnd = block.indexOf('/end AXIS_DESCR', match.index);
      const axisBlock = block.substring(match.index, axisEnd);
      const refMatch = axisBlock.match(/AXIS_PTS_REF\s+(\S+)/);

      axes.push({
        type: match[1],
        compuMethod: match[2],
        points: parseInt(match[3]),
        min: parseFloat(match[4]),
        max: parseFloat(match[5]),
        axisPtsRef: refMatch?.[1],
      });
    }

    return axes;
  }

  private getConversion(compuMethodName: string): { factor: number; offset: number; unit: string } {
    const cm = this.compuMethods.get(compuMethodName);
    if (!cm || cm.coeffs.length !== 6) {
      return { factor: 1, offset: 0, unit: '' };
    }

    const [, b, c, , , f] = cm.coeffs;
    // RAT_FUNC in A2L: INT = (a*PHYS² + b*PHYS + c) / (d*PHYS² + e*PHYS + f)
    // For linear (a=d=e=0): INT = (b*PHYS + c) / f
    // Inverted: PHYS = (INT*f - c) / b = INT * (f/b) - (c/b)
    // factor = f/b, offset = -c/b
    const factor = Math.abs(b) > 0.000001 ? f / b : 1;
    const offset = Math.abs(b) > 0.000001 ? -c / b : 0;

    return { factor, offset, unit: cm.unit };
  }

  private matchCategory(name: string): CsvMapping | null {
    for (const mapping of this.csvMappings) {
      if (name.toLowerCase().includes(mapping.pattern.toLowerCase())) {
        return mapping;
      }
    }
    return null;
  }

  generateDefinition(name: string): Definition {
    const parameters: Parameter[] = [];

    for (const char of this.characteristics) {
      const mapping = this.matchCategory(char.name);
      if (!mapping) continue; // Skip if not in CSV

      const layout = this.recordLayouts.get(char.deposit);
      const dataType = layout?.dataType || 'UWORD';
      const { factor, offset, unit } = this.getConversion(char.compuMethod);

      const param: Parameter = {
        name: char.name,
        description: char.description,
        address: char.address,
        type: char.type === 'VAL_BLK' ? 'CURVE' : char.type,
        dataType,
        unit,
        min: char.min,
        max: char.max,
        factor,
        offset,
        columnDir: layout?.columnDir,
        categories: mapping.categories,
      };

      // Handle axes for tables
      if (char.type === 'CURVE' || char.type === 'VAL_BLK') {
        param.cols = char.axes[0]?.points || 1;
        param.rows = 1;
        if (char.axes[0]) {
          param.xAxis = this.buildAxisDef(char.axes[0]);
        }
      } else if (char.type === 'MAP') {
        param.cols = char.axes[0]?.points || 1;
        param.rows = char.axes[1]?.points || 1;
        if (char.axes[0]) {
          param.xAxis = this.buildAxisDef(char.axes[0]);
        }
        if (char.axes[1]) {
          param.yAxis = this.buildAxisDef(char.axes[1]);
        }
      }

      parameters.push(param);
    }

    return {
      name,
      version: '1.0',
      parameters,
    };
  }

  private buildAxisDef(rawAxis: RawAxisDescr): AxisDefinition {
    const axisDef: AxisDefinition = {
      type: rawAxis.type as 'STD_AXIS' | 'COM_AXIS' | 'FIX_AXIS',
      points: rawAxis.points,
      min: rawAxis.min,
      max: rawAxis.max,
      unit: '',
    };

    const { unit } = this.getConversion(rawAxis.compuMethod);
    axisDef.unit = unit;

    // If COM_AXIS with reference
    if (rawAxis.axisPtsRef) {
      const pts = this.axisPts.get(rawAxis.axisPtsRef);
      if (pts) {
        axisDef.address = pts.address;
        axisDef.dataType = pts.dataType;
        axisDef.dataOffset = pts.dataOffset;
        const conv = this.getConversion(pts.compuMethod);
        axisDef.factor = conv.factor;
        axisDef.offset = conv.offset;
        axisDef.unit = conv.unit || axisDef.unit;
      }
    }

    return axisDef;
  }

  getStats(): { characteristics: number; matched: number } {
    let matched = 0;
    for (const char of this.characteristics) {
      if (this.matchCategory(char.name)) matched++;
    }
    return {
      characteristics: this.characteristics.length,
      matched,
    };
  }
}
