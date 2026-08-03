import {useCallback, useRef, useState} from 'preact/hooks';
import {Modal} from './Modal';
import {track} from '../lib/track';
import {
    applyPatch,
    checkPatchBlockAware,
    getCalFileOffset,
    parseBtp,
    parseEcuInfo,
    removePatch,
    verifyCrc32,
} from '../lib/btpParser';
import type {PatchCheckResult, PatchStatus} from '../lib/btpParser';

interface Props {
    binData: Uint8Array;
    patchResults: PatchCheckResult[];
    calFileOffset: number | null;
    onClose: () => void;
    onModify: () => void;
    onPatchResultsChange: (results: PatchCheckResult[]) => void;
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
        <label class={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer transition-colors ${
            selected
                ? 'bg-zinc-300 dark:bg-zinc-600'
                : 'bg-zinc-200/50 dark:bg-zinc-700/50 hover:bg-zinc-200 dark:hover:bg-zinc-700'
        } ${result.status === 'incompatible' ? 'opacity-50' : ''}`}>
            <input
                type="checkbox"
                checked={selected}
                onChange={onToggle}
                disabled={result.status === 'incompatible'}
                class="w-4 h-4 rounded bg-zinc-300 dark:bg-zinc-600 border-zinc-400 dark:border-zinc-500"
            />
            <span class="flex-1 text-sm truncate">{result.name}</span>
            {!result.crcValid && <span class="text-xs text-amber-500" title="CRC32 mismatch">CRC!</span>}
            <span class={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[result.status]}`}>
                {STATUS_LABELS[result.status]}
            </span>
        </label>
    );
}

export function PatchManager({
    binData,
    patchResults,
    calFileOffset,
    onClose,
    onModify,
    onPatchResultsChange,
}: Props) {
    const [selectedPatches, setSelectedPatches] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const toggleSelection = useCallback((file: string) => {
        setSelectedPatches(previous => {
            const next = new Set(previous);
            if (next.has(file)) next.delete(file);
            else next.add(file);
            return next;
        });
    }, []);

    const handleLoadBtp = useCallback(async () => {
        const files = fileInputRef.current?.files;
        if (!files) return;

        const loaded: PatchCheckResult[] = [];
        for (const file of files) {
            try {
                const data = new Uint8Array(await file.arrayBuffer());
                const crcValid = verifyCrc32(data);
                const {header, blocks} = parseBtp(data);

                let status: PatchStatus = 'incompatible';
                if (header.fileSize === binData.length) {
                    const patchEcuInfo = parseEcuInfo(header.softCode);
                    const patchCalOffset = calFileOffset
                        ?? (patchEcuInfo ? getCalFileOffset(patchEcuInfo.ecuFamily) : null);
                    status = checkPatchBlockAware(blocks, binData, patchCalOffset);
                }

                loaded.push({
                    name: file.name.replace(/\.btp$/i, '').replace(/_/g, ' '),
                    file: file.name,
                    status,
                    blocks,
                    header,
                    crcValid,
                });
            } catch (error) {
                console.error(`Failed to parse ${file.name}:`, error);
            }
        }

        const loadedNames = new Set(loaded.map(result => result.file));
        onPatchResultsChange([
            ...patchResults.filter(result => !loadedNames.has(result.file)),
            ...loaded,
        ]);
        setSelectedPatches(new Set(loaded.filter(result => result.status !== 'incompatible').map(result => result.file)));
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, [binData, calFileOffset, onPatchResultsChange, patchResults]);

    const refreshStatuses = useCallback(() => {
        return patchResults.map(result => ({
            ...result,
            status: checkPatchBlockAware(result.blocks, binData, calFileOffset),
        }));
    }, [binData, calFileOffset, patchResults]);

    const handleApply = useCallback(() => {
        const selected = patchResults.filter(result => selectedPatches.has(result.file) && result.status === 'ready');
        if (selected.length === 0) return;
        setLoading(true);
        try {
            selected.forEach(result => applyPatch(result.blocks, binData));
            onModify();
            selected.forEach(result => track('Apply Manual BTP', {name: result.name, file: result.file}));
            onPatchResultsChange(refreshStatuses());
            setSelectedPatches(new Set());
        } finally {
            setLoading(false);
        }
    }, [binData, onModify, onPatchResultsChange, patchResults, refreshStatuses, selectedPatches]);

    const handleRemove = useCallback(() => {
        const selected = patchResults.filter(result => selectedPatches.has(result.file) && result.status === 'applied');
        if (selected.length === 0) return;
        setLoading(true);
        try {
            selected.forEach(result => removePatch(result.blocks, binData));
            onModify();
            selected.forEach(result => track('Remove Manual BTP', {name: result.name, file: result.file}));
            onPatchResultsChange(refreshStatuses());
            setSelectedPatches(new Set());
        } finally {
            setLoading(false);
        }
    }, [binData, onModify, onPatchResultsChange, patchResults, refreshStatuses, selectedPatches]);

    const selectedReady = patchResults.filter(result => selectedPatches.has(result.file) && result.status === 'ready').length;
    const selectedApplied = patchResults.filter(result => selectedPatches.has(result.file) && result.status === 'applied').length;

    return (
        <Modal
            title="Manual BTP patches"
            onClose={onClose}
            width="xl"
            footer={
                <div class="flex items-center gap-2">
                    <button
                        onClick={handleApply}
                        disabled={selectedReady === 0 || loading}
                        class="px-4 py-2 text-sm rounded font-medium bg-green-700 hover:bg-green-600 disabled:bg-zinc-200 dark:disabled:bg-zinc-700 disabled:text-zinc-500 cursor-pointer disabled:cursor-not-allowed"
                    >
                        Apply selected ({selectedReady})
                    </button>
                    <button
                        onClick={handleRemove}
                        disabled={selectedApplied === 0 || loading}
                        class="px-4 py-2 text-sm rounded font-medium bg-red-700 hover:bg-red-600 disabled:bg-zinc-200 dark:disabled:bg-zinc-700 disabled:text-zinc-500 cursor-pointer disabled:cursor-not-allowed"
                    >
                        Remove selected ({selectedApplied})
                    </button>
                    <label class="ml-auto inline-flex items-center gap-2 px-3 py-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 rounded cursor-pointer text-sm">
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
            {patchResults.length === 0 ? (
                <div class="text-center py-8 text-zinc-500 text-sm">
                    Load one or more local .btp files to check and apply them to this binary.
                </div>
            ) : (
                <div class="space-y-1">
                    {patchResults.map(result => (
                        <PatchRow
                            key={result.file}
                            result={result}
                            selected={selectedPatches.has(result.file)}
                            onToggle={() => toggleSelection(result.file)}
                        />
                    ))}
                </div>
            )}
        </Modal>
    );
}
