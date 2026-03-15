import {Modal} from './Modal';
import type {OLSFile, OLSBinaryVersion} from '../lib/olsParser';

interface Props {
    ols: OLSFile;
    onSelect: (version: OLSBinaryVersion | null) => void;
    onClose: () => void;
}

export function OLSPickerModal({ols, onSelect, onClose}: Props) {
    const typeCounts = {VALUE: 0, CURVE: 0, MAP: 0};
    for (const p of ols.parameters) {
        typeCounts[p.paramType] = (typeCounts[p.paramType] || 0) + 1;
    }

    const vehicle = [ols.make, ols.model, ols.engine].filter(Boolean).join(' ');

    return (
        <Modal title={`OLS Project: ${ols.filename}`} onClose={onClose} width="lg">
            <div class="space-y-4">
                {/* Vehicle info */}
                {vehicle && (
                    <div class="text-sm text-zinc-600 dark:text-zinc-400">
                        {vehicle}{ols.year ? ` (${ols.year})` : ''}
                        {ols.ecuType && <span class="ml-2 text-zinc-500">· {ols.ecuType}</span>}
                    </div>
                )}

                {/* Parameters summary */}
                <div class="text-sm">
                    <span class="font-medium">{ols.parameters.length}</span> parameters
                    <span class="text-zinc-500 ml-2">
                        ({typeCounts.VALUE} values, {typeCounts.CURVE} curves, {typeCounts.MAP} maps)
                    </span>
                </div>

                {/* Binary versions */}
                {ols.binaryVersions.length > 0 ? (
                    <div>
                        <div class="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                            Binary Versions ({ols.binaryVersions.length})
                        </div>
                        <div class="space-y-1">
                            {ols.binaryVersions.map((v, i) => (
                                <button
                                    key={i}
                                    onClick={() => onSelect(v)}
                                    class="w-full text-left p-3 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 rounded border border-zinc-400 dark:border-zinc-600 transition-colors"
                                >
                                    <div class="flex items-center justify-between">
                                        <div>
                                            <div class="font-medium">{v.name}</div>
                                            <div class="text-xs text-zinc-500 mt-0.5">
                                                {(v.blobSize / 1024 / 1024).toFixed(1)} MB
                                                {v.epk && <span class="ml-2 font-mono">{v.epk}</span>}
                                                {v.description && <span class="ml-2 text-zinc-400">{v.description}</span>}
                                            </div>
                                        </div>
                                        <div class="text-xs text-zinc-500">
                                            @0x{v.blobOffset.toString(16).toUpperCase()}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div class="text-sm text-zinc-500">
                        No embedded binary data found in this OLS file.
                    </div>
                )}

                {/* Load definition only button */}
                <div class="flex justify-end gap-2 pt-2 border-t border-zinc-300 dark:border-zinc-700">
                    <button
                        onClick={() => onSelect(null)}
                        class="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-800 dark:text-zinc-200 rounded text-sm font-medium transition-colors"
                    >
                        Load Definition Only
                    </button>
                </div>
            </div>
        </Modal>
    );
}
