export type DataType = 'UBYTE' | 'SBYTE' | 'UWORD' | 'SWORD' | 'ULONG' | 'SLONG' | 'FLOAT32';

export interface AxisDefinition {
  type: 'STD_AXIS' | 'COM_AXIS' | 'FIX_AXIS';
  points: number;
  min: number;
  max: number;
  unit: string;
  address?: number;
  dataType?: DataType;
  factor?: number;
  offset?: number;
  dataOffset?: number; // Byte offset where axis data starts
}

export interface Parameter {
  name: string;
  description: string;
  address: number;
  type: 'VALUE' | 'CURVE' | 'MAP';
  dataType: DataType;
  unit: string;
  min: number;
  max: number;
  factor: number;
  offset: number;
  xAxis?: AxisDefinition;
  yAxis?: AxisDefinition;
  rows?: number;
  cols?: number;
  columnDir?: boolean; // true if data is stored column-wise
  categories: string[];
  customName?: string;
}

export interface Definition {
  name: string;
  version: string;
  parameters: Parameter[];
}

export const DATA_TYPE_INFO: Record<DataType, { size: number; signed: boolean; float: boolean }> = {
  UBYTE: { size: 1, signed: false, float: false },
  SBYTE: { size: 1, signed: true, float: false },
  UWORD: { size: 2, signed: false, float: false },
  SWORD: { size: 2, signed: true, float: false },
  ULONG: { size: 4, signed: false, float: false },
  SLONG: { size: 4, signed: true, float: false },
  FLOAT32: { size: 4, signed: true, float: true },
};
