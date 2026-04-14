import type {Definition, DefinitionVerification} from '../types';
import {TuningService} from '../services/tuning';

export interface DefinitionIndexEntry {
    name: string;
    file: string;
    verification: DefinitionVerification;
    paramCount: number;
}

let definitionIndex: DefinitionIndexEntry[] | null = null;

export async function loadDefinitionIndex(): Promise<DefinitionIndexEntry[]> {
    if (definitionIndex) return definitionIndex;

    definitionIndex = await TuningService.getDefinitionsIndex();
    return definitionIndex!;
}

/**
 * Find matching definition for a binary file by EPK string.
 */
export async function findMatchingDefinition(
    epk: string
): Promise<DefinitionIndexEntry | null> {
    const index = await loadDefinitionIndex();
    return index.find(e => e.verification.expected === epk) ?? null;
}


export async function loadDefinition(filename: string): Promise<Definition> {
    return TuningService.getDefinition(filename);
}

export async function getAllDefinitions(): Promise<DefinitionIndexEntry[]> {
    return loadDefinitionIndex();
}
