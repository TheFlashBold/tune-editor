import {useState, useRef, useCallback} from 'preact/hooks';
import {Modal} from './Modal';
import type {Definition, IDefinitionParameter} from '../types';
import {parseBtp, verifyCrc32, checkPatchBlockAware, applyPatch, removePatch, parseEcuInfo, getCalFileOffset} from '../lib/btpParser';
import type {PatchCheckResult, PatchStatus} from '../lib/btpParser';

interface PatchIndexEntry {
    name: string;
    file: string;
    definition?: string;
    category?: string;
    variant?: string;
}

interface Props {
    binData: Uint8Array;
    patchResults: PatchCheckResult[];
    calFileOffset: number | null;
    onClose: () => void;
    onModify: () => void;
    onPatchResultsChange: (results: PatchCheckResult[]) => void;
    definition: Definition | null;
    onDefinitionUpdate: (def: Definition) => void;
}

const STATUS_STYLES: Record<PatchStatus, string> = {
    applied: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    ready: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    incompatible: 'bg-red-100/50 text-red-600 dark:bg-red-900/50 dark:text-red-400',
};

const STATUS_LABELS: Record<PatchStatus, string> = {
    applied: 'Applied',
    ready: 'Ready',
    incompatible: 'Incompatible',
};

function PatchRow({result, selected, onToggle}: {
    result: PatchCheckResult;
    selected: boolean;
    onToggle: () => void;
}) {
    return (
        <label
            class={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer transition-colors ${
                selected ? 'bg-zinc-300 dark:bg-zinc-600' : 'bg-zinc-200/50 dark:bg-zinc-700/50 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            } ${result.status === 'incompatible' ? 'opacity-50' : ''}`}
        >
            <input
                type="checkbox"
                checked={selected}
                onChange={onToggle}
                disabled={result.status === 'incompatible'}
                class="w-4 h-4 rounded bg-zinc-300 dark:bg-zinc-600 border-zinc-400 dark:border-zinc-500"
            />
            <span class="flex-1 text-sm truncate">{result.name}</span>
            {!result.crcValid && (
                <span class="text-xs text-amber-400" title="CRC32 mismatch">CRC!</span>
            )}
            {result.definition && (
                <span class="text-xs text-zinc-500" title="Has definition file">DEF</span>
            )}
            <span class={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[result.status]}`}>
                {STATUS_LABELS[result.status]}
            </span>
        </label>
    );
}

export function mergeDefinitions(baseDef: Definition, patchDef: Definition, _patchName?: string): Definition {
    const existingNames = new Set(baseDef.parameters.map(p => p.name));

    const patchParams: IDefinitionParameter[] = patchDef.parameters.map(p => {
        // Prefix categories with "Patch"
        const categories = ['Patch', ...p.categories];
        // Handle name collision
        const name = existingNames.has(p.name) ? `${p.name} (Patch)` : p.name;
        return {...p, name, categories};
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

export {type PatchCheckResult, type PatchIndexEntry};

export function PatchManager({
                                 binData,
                                 patchResults,
                                 calFileOffset,
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
                const {header, blocks} = parseBtp(data);

                let status: PatchStatus = 'incompatible';
                if (header.fileSize === binData.length) {
                    // Derive calFileOffset from user patch softCode if not provided
                    const patchEcuInfo = parseEcuInfo(header.softCode);
                    const patchCalOffset = calFileOffset ?? (patchEcuInfo ? getCalFileOffset(patchEcuInfo.ecuFamily) : null);
                    status = checkPatchBlockAware(blocks, binData, patchCalOffset);
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
    }, [binData, calFileOffset]);

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

            // Re-check all patch statuses (block-aware)
            const updatedBundled = patchResults.map(r => ({
                ...r,
                status: checkPatchBlockAware(r.blocks, binData, calFileOffset),
            }));
            const updatedUser = userPatches.map(r => ({
                ...r,
                status: checkPatchBlockAware(r.blocks, binData, calFileOffset),
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
    }, [selectedPatches, allResults, binData, patchResults, userPatches, definition, calFileOffset, onModify, onPatchResultsChange, onDefinitionUpdate]);

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

            // Re-check all patch statuses (block-aware)
            const updatedBundled = patchResults.map(r => ({
                ...r,
                status: checkPatchBlockAware(r.blocks, binData, calFileOffset),
            }));
            const updatedUser = userPatches.map(r => ({
                ...r,
                status: checkPatchBlockAware(r.blocks, binData, calFileOffset),
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
    }, [selectedPatches, allResults, binData, patchResults, userPatches, definition, calFileOffset, onModify, onPatchResultsChange, onDefinitionUpdate]);

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
        'DSG HSL': 'DQ250 Highspeed Logging',
        'DSG Torque Limit': 'DQ250 Torque Limit Increase',
    };

    const selectedReady = allResults.filter(r => selectedPatches.has(r.file) && r.status === 'ready').length;
    const selectedApplied = allResults.filter(r => selectedPatches.has(r.file) && r.status === 'applied').length;

    return (
        <Modal
            title="Patches"
            titleRight={
                <a href="https://github.com/Switchleg1/BinToolz" target="_blank" rel="noopener noreferrer"
                   class="text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300">
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
                        class="px-4 py-2 text-sm rounded font-medium bg-green-700 hover:bg-green-600 disabled:bg-zinc-200 dark:disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors cursor-pointer disabled:cursor-not-allowed"
                    >
                        Apply Selected ({selectedReady})
                    </button>
                    <button
                        onClick={handleRemove}
                        disabled={selectedApplied === 0 || loading}
                        class="px-4 py-2 text-sm rounded font-medium bg-red-700 hover:bg-red-600 disabled:bg-zinc-200 dark:disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors cursor-pointer disabled:cursor-not-allowed"
                    >
                        Remove Selected ({selectedApplied})
                    </button>
                    <label
                        class="ml-auto inline-flex items-center gap-2 px-3 py-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 rounded cursor-pointer text-sm transition-colors">
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
                        <h3 class="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Bundled Patches</h3>
                        <div class="space-y-3">
                            {[...groupedBundled.entries()].map(([category, patches]) => (
                                <div key={category}>
                                    <div class="text-xs text-zinc-500 dark:text-zinc-500 mb-1 font-medium">
                                        {category}
                                        {categoryDescriptions[category] && (
                                            <span
                                                class="font-normal text-zinc-500 dark:text-zinc-600"> — {categoryDescriptions[category]}</span>
                                        )}
                                    </div>
                                    <div class="space-y-1">
                                        {patches.map(r => (
                                            <PatchRow
                                                key={r.file}
                                                result={r}
                                                selected={selectedPatches.has(r.file)}
                                                onToggle={() => toggleSelection(r.file)}
                                            />
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
                        <h3 class="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">User Patches</h3>
                        <div class="space-y-1">
                            {userPatches.map(r => (
                                <PatchRow
                                    key={r.file}
                                    result={r}
                                    selected={selectedPatches.has(r.file)}
                                    onToggle={() => toggleSelection(r.file)}
                                />
                            ))}
                        </div>
                    </div>
                )}

            </div>
        </Modal>
    );
}
