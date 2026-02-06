import { useState, useRef, useCallback } from 'preact/hooks';
import { Modal } from './Modal';
import type { Definition, Parameter } from '../types';
import { parseBtp, verifyCrc32, checkPatch, applyPatch, removePatch } from '../lib/btpParser';
import type { PatchCheckResult, PatchStatus } from '../lib/btpParser';

interface PatchIndexEntry {
  name: string;
  file: string;
  definition?: string;
  category?: string;
}

interface Props {
  binData: Uint8Array;
  patchResults: PatchCheckResult[];
  onClose: () => void;
  onModify: () => void;
  onPatchResultsChange: (results: PatchCheckResult[]) => void;
  definition: Definition | null;
  onDefinitionUpdate: (def: Definition) => void;
}

function StatusBadge({ status }: { status: PatchStatus }) {
  const styles: Record<PatchStatus, string> = {
    applied: 'bg-green-900 text-green-300',
    ready: 'bg-blue-900 text-blue-300',
    incompatible: 'bg-red-900/50 text-red-400',
  };
  const labels: Record<PatchStatus, string> = {
    applied: 'Applied',
    ready: 'Ready',
    incompatible: 'Incompatible',
  };

  return (
    <span class={`px-2 py-0.5 rounded text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

export function mergeDefinitions(baseDef: Definition, patchDef: Definition, _patchName?: string): Definition {
  const existingNames = new Set(baseDef.parameters.map(p => p.name));

  const patchParams: Parameter[] = patchDef.parameters.map(p => {
    // Prefix categories with "Patch"
    const categories = ['Patch', ...p.categories];
    // Handle name collision
    const name = existingNames.has(p.name) ? `${p.name} (Patch)` : p.name;
    return { ...p, name, categories };
  });

  return {
    ...baseDef,
    parameters: [...baseDef.parameters, ...patchParams],
  };
}

export function unmergeDefinitions(def: Definition): Definition {
  return {
    ...def,
    parameters: def.parameters.filter(p => !p.categories.includes('Patch')),
  };
}

export { type PatchCheckResult, type PatchIndexEntry };

export function PatchManager({
  binData,
  patchResults,
  onClose,
  onModify,
  onPatchResultsChange,
  definition,
  onDefinitionUpdate,
}: Props) {
  const [selectedPatches, setSelectedPatches] = useState<Set<string>>(new Set());
  const [userPatches, setUserPatches] = useState<PatchCheckResult[]>([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allResults = [...patchResults, ...userPatches];

  const toggleSelection = useCallback((file: string) => {
    setSelectedPatches(prev => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  }, []);

  const handleLoadBtp = useCallback(async () => {
    const files = fileInputRef.current?.files;
    if (!files) return;

    const newResults: PatchCheckResult[] = [];
    for (const file of files) {
      try {
        const data = new Uint8Array(await file.arrayBuffer());
        const crcValid = verifyCrc32(data);
        const { header, blocks } = parseBtp(data);

        let status: PatchStatus = 'incompatible';
        if (header.fileSize === binData.length) {
          status = checkPatch(blocks, binData);
        }

        newResults.push({
          name: file.name.replace('.btp', '').replace(/_/g, ' '),
          file: file.name,
          status,
          blocks,
          header,
          crcValid,
        });
      } catch (err) {
        console.error(`Failed to parse ${file.name}:`, err);
      }
    }

    setUserPatches(prev => [...prev, ...newResults]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [binData]);

  const handleApply = useCallback(async () => {
    if (selectedPatches.size === 0) return;
    setLoading(true);

    try {
      const toApply = allResults.filter(r => selectedPatches.has(r.file) && r.status === 'ready');

      for (const result of toApply) {
        applyPatch(result.blocks, binData);
      }

      if (toApply.length > 0) {
        onModify();
      }

      // Re-check all patch statuses
      const updatedBundled = patchResults.map(r => ({
        ...r,
        status: checkPatch(r.blocks, binData),
      }));
      const updatedUser = userPatches.map(r => ({
        ...r,
        status: checkPatch(r.blocks, binData),
      }));

      onPatchResultsChange(updatedBundled);
      setUserPatches(updatedUser);

      // Auto-load definitions for newly applied patches
      if (definition) {
        const newlyApplied = [...updatedBundled, ...updatedUser].filter(
          r => r.status === 'applied' && r.definition && selectedPatches.has(r.file)
        );

        if (newlyApplied.length > 0) {
          let mergedDef = definition;
          for (const applied of newlyApplied) {
            try {
              const patchDef = await fetch(`./patches/definitions/${applied.definition}`).then(r => r.json()) as Definition;
              mergedDef = mergeDefinitions(mergedDef, patchDef, applied.name);
            } catch (err) {
              console.error(`Failed to load patch definition ${applied.definition}:`, err);
            }
          }
          onDefinitionUpdate(mergedDef);
        }
      }

      setSelectedPatches(new Set());
    } finally {
      setLoading(false);
    }
  }, [selectedPatches, allResults, binData, patchResults, userPatches, definition, onModify, onPatchResultsChange, onDefinitionUpdate]);

  const handleRemove = useCallback(async () => {
    if (selectedPatches.size === 0) return;
    setLoading(true);

    try {
      const toRemove = allResults.filter(r => selectedPatches.has(r.file) && r.status === 'applied');

      for (const result of toRemove) {
        removePatch(result.blocks, binData);
      }

      if (toRemove.length > 0) {
        onModify();
      }

      // Re-check all patch statuses
      const updatedBundled = patchResults.map(r => ({
        ...r,
        status: checkPatch(r.blocks, binData),
      }));
      const updatedUser = userPatches.map(r => ({
        ...r,
        status: checkPatch(r.blocks, binData),
      }));

      onPatchResultsChange(updatedBundled);
      setUserPatches(updatedUser);

      // Remove patch parameters from definition
      if (definition) {
        const removedWithDef = toRemove.filter(r => r.definition);
        if (removedWithDef.length > 0) {
          onDefinitionUpdate(unmergeDefinitions(definition));
        }
      }

      setSelectedPatches(new Set());
    } finally {
      setLoading(false);
    }
  }, [selectedPatches, allResults, binData, patchResults, userPatches, definition, onModify, onPatchResultsChange, onDefinitionUpdate]);

  // Group bundled patches by category
  const groupedBundled = new Map<string, PatchCheckResult[]>();
  for (const r of patchResults) {
    const cat = r.category || 'Other';
    if (!groupedBundled.has(cat)) groupedBundled.set(cat, []);
    groupedBundled.get(cat)!.push(r);
  }

  const categoryDescriptions: Record<string, string> = {
    'Main Patch': 'Multimaps, Rolling Anti-Lag, Launch Control, Traction Control',
    'HSL': 'Highspeed Logging',
    'Immo': 'Immobilizer',
    'SWG': 'Simple Wastegate Control',
    'CBRICK': 'CBOOT Brick Protection',
    'FREE SAP': 'Secondary Air Pump Delete',
    'CAT': 'Catalyst Monitoring Delete',
  };

  const selectedReady = allResults.filter(r => selectedPatches.has(r.file) && r.status === 'ready').length;
  const selectedApplied = allResults.filter(r => selectedPatches.has(r.file) && r.status === 'applied').length;

  return (
    <Modal
      title="Patches"
      titleRight={
        <a href="https://github.com/Switchleg1/BinToolz" target="_blank" rel="noopener noreferrer" class="text-xs text-zinc-400 hover:text-zinc-300">
          Switchleg1/BinToolz
        </a>
      }
      onClose={onClose}
      width="xl"
      footer={
        <div class="flex items-center gap-2">
          <button
            onClick={handleApply}
            disabled={selectedReady === 0 || loading}
            class="px-4 py-2 text-sm rounded font-medium bg-green-700 hover:bg-green-600 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            Apply Selected ({selectedReady})
          </button>
          <button
            onClick={handleRemove}
            disabled={selectedApplied === 0 || loading}
            class="px-4 py-2 text-sm rounded font-medium bg-red-700 hover:bg-red-600 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            Remove Selected ({selectedApplied})
          </button>
          <label class="ml-auto inline-flex items-center gap-2 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded cursor-pointer text-sm transition-colors">
            Load .btp
            <input
              type="file"
              accept=".btp"
              multiple
              ref={fileInputRef}
              onChange={handleLoadBtp}
              class="hidden"
            />
          </label>
        </div>
      }
    >
      <div class="space-y-4">
        {/* Bundled patches */}
        {patchResults.length > 0 && (
          <div>
            <h3 class="text-sm font-semibold text-zinc-300 mb-2">Bundled Patches</h3>
            <div class="space-y-3">
              {[...groupedBundled.entries()].map(([category, patches]) => (
                <div key={category}>
                  <div class="text-xs text-zinc-500 mb-1 font-medium">
                    {category}
                    {categoryDescriptions[category] && (
                      <span class="font-normal text-zinc-600"> — {categoryDescriptions[category]}</span>
                    )}
                  </div>
                  <div class="space-y-1">
                    {patches.map(r => (
                      <label
                        key={r.file}
                        class={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer transition-colors ${
                          selectedPatches.has(r.file) ? 'bg-zinc-600' : 'bg-zinc-700/50 hover:bg-zinc-700'
                        } ${r.status === 'incompatible' ? 'opacity-50' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedPatches.has(r.file)}
                          onChange={() => toggleSelection(r.file)}
                          disabled={r.status === 'incompatible'}
                          class="w-4 h-4 rounded bg-zinc-600 border-zinc-500"
                        />
                        <span class="flex-1 text-sm truncate">{r.name}</span>
                        {!r.crcValid && (
                          <span class="text-xs text-amber-400" title="CRC32 mismatch">CRC!</span>
                        )}
                        {r.definition && (
                          <span class="text-xs text-zinc-500" title="Has definition file">DEF</span>
                        )}
                        <StatusBadge status={r.status} />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {patchResults.length === 0 && (
          <div class="text-center py-4 text-zinc-500 text-sm">
            No compatible bundled patches found for this binary.
          </div>
        )}

        {/* User-loaded patches */}
        {userPatches.length > 0 && (
          <div>
            <h3 class="text-sm font-semibold text-zinc-300 mb-2">User Patches</h3>
            <div class="space-y-1">
              {userPatches.map(r => (
                <label
                  key={r.file}
                  class={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer transition-colors ${
                    selectedPatches.has(r.file) ? 'bg-zinc-600' : 'bg-zinc-700/50 hover:bg-zinc-700'
                  } ${r.status === 'incompatible' ? 'opacity-50' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedPatches.has(r.file)}
                    onChange={() => toggleSelection(r.file)}
                    disabled={r.status === 'incompatible'}
                    class="w-4 h-4 rounded bg-zinc-600 border-zinc-500"
                  />
                  <span class="flex-1 text-sm truncate">{r.name}</span>
                  {!r.crcValid && (
                    <span class="text-xs text-amber-400" title="CRC32 mismatch">CRC!</span>
                  )}
                  <StatusBadge status={r.status} />
                </label>
              ))}
            </div>
          </div>
        )}

      </div>
    </Modal>
  );
}
