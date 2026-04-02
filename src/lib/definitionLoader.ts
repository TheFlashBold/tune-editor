import type {Definition, DefinitionVerification} from '../types';

export interface DefinitionIndexEntry {
    name: string;
    file: string;
    verification: DefinitionVerification;
    paramCount: number;
}

let definitionIndex: DefinitionIndexEntry[] | null = null;

export async function loadDefinitionIndex(): Promise<DefinitionIndexEntry[]> {
    if (definitionIndex) return definitionIndex;

    const response = await fetch('./definitions/index.json');
    if (!response.ok) {
        throw new Error('Failed to load definition index');
    }

    definitionIndex = await response.json();
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
    const response = await fetch(`./definitions/${filename}`);
    if (!response.ok) {
        throw new Error(`Failed to load definition: ${filename}`);
    }

    return response.json();
}

export async function getAllDefinitions(): Promise<DefinitionIndexEntry[]> {
    return loadDefinitionIndex();
}
