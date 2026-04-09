/**
 * Wizard system — version-independent tuning presets as code.
 * Each wizard references parameters by normalized name.
 * Logic lives in TypeScript, not JSON.
 */

import type {IDefinitionParameter} from '../types';

export type ControlType = 'toggle' | 'slider' | 'select' | 'number';

export interface WizardControl {
    key: string;
    label: string;
    description?: string;
    control: ControlType;
    options?: { label: string; value: number }[];
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    group?: string;
    default?: number;
    /** If set, read initial value from this param */
    readFrom?: string;
}

export interface WizardPreset {
    name: string;
    description?: string;
    values: Record<string, number>;
}

export interface TableCellWrite {
    row: number;
    col: number;
    value: number;
}

export interface WizardApplyResult {
    /** param name -> scalar value */
    scalars: Record<string, number>;
    /** param name -> fill all cells with this value */
    tableFills: Record<string, number>;
    /** param name -> write specific cells only */
    tableCells?: Record<string, TableCellWrite[]>;
}

/** Context passed to apply() for reading current bin state */
export interface WizardContext {
    params: IDefinitionParameter[];
    /** Read current scaled table data for a parameter */
    readTable: (param: IDefinitionParameter) => number[][];
    /** Read current scaled scalar value */
    readScalar: (param: IDefinitionParameter) => number;
}

export interface WizardDef {
    id: string;
    name: string;
    description: string;
    /** Parameter names that must exist in the definition for this wizard to work */
    requiredParams?: string[];
    controls: WizardControl[];
    presets: WizardPreset[];
    /** Given control values and bin context, compute what to write */
    apply: (values: Record<string, number>, ctx: WizardContext) => WizardApplyResult;
}
