import type { Definition, DefinitionVerification } from '../types';
import { detectBinaryMode } from './binUtils';

export interface DefinitionIndexEntry {
  name: string;
  file: string;
  verification: DefinitionVerification;
  paramCount: number;
}

let definitionIndex: DefinitionIndexEntry[] | null = null;

/**
 * Load the definition index from the server
 */
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
 * Find matching definitions for a binary file
 * Returns all matches sorted by confidence
 */
export async function findMatchingDefinitions(
  binData: Uint8Array
): Promise<{ entry: DefinitionIndexEntry; mode: 'full' | 'cal'; confidence: 'exact' | 'partial' }[]> {
  const index = await loadDefinitionIndex();
  const matches: { entry: DefinitionIndexEntry; mode: 'full' | 'cal'; confidence: 'exact' | 'partial' }[] = [];

  for (const entry of index) {
    const result = detectBinaryMode(binData, entry.verification);

    if (result.valid) {
      matches.push({
        entry,
        mode: result.mode,
        confidence: 'exact'
      });
    }
  }

  // Sort by name for consistent ordering
  matches.sort((a, b) => a.entry.name.localeCompare(b.entry.name));

  return matches;
}

/**
 * Load a specific definition by filename
 */
export async function loadDefinition(filename: string): Promise<Definition> {
  const response = await fetch(`./definitions/${filename}`);
  if (!response.ok) {
    throw new Error(`Failed to load definition: ${filename}`);
  }

  return response.json();
}

/**
 * Get all available definitions (for manual selection)
 */
export async function getAllDefinitions(): Promise<DefinitionIndexEntry[]> {
  return loadDefinitionIndex();
}
