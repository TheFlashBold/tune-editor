import {Modal} from './Modal';
import type {BinaryMode} from '../types';
import type {DefinitionIndexEntry} from '../lib/definitionLoader';

interface DefinitionPickerModalProps {
    matches: { entry: DefinitionIndexEntry; mode: BinaryMode }[];
    allDefinitions: DefinitionIndexEntry[];
    onSelect: (entry: DefinitionIndexEntry, mode: BinaryMode) => void;
    onClose: () => void;
}

export function DefinitionPickerModal({matches, allDefinitions, onSelect, onClose}: DefinitionPickerModalProps) {
    return (
        <Modal title="Select Definition" onClose={onClose} width="lg">
            <div className="space-y-4">
                {matches.length > 0 && (
                    <div>
                        <h3 className="text-sm font-semibold text-green-400 mb-2">
                            Matching Definitions ({matches.length})
                        </h3>
                        <div className="space-y-2">
                            {matches.map(({entry, mode}) => (
                                <button
                                    key={entry.file}
                                    onClick={() => onSelect(entry, mode)}
                                    className="w-full text-left p-3 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 rounded border border-zinc-400 dark:border-zinc-600 transition-colors"
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="font-medium">{entry.name}</div>
                                            <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                                                {entry.paramCount} parameters · {entry.verification.expected}
                                            </div>
                                        </div>
                                        <div className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                                            {mode === 'cal' ? 'CAL Block' : 'Full BIN'}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {matches.length === 0 && (
                    <div className="text-center py-4 text-zinc-500">
                        No matching definitions found for this binary.
                    </div>
                )}

                {allDefinitions.length > 0 && (
                    <div>
                        <h3 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 mb-2 mt-4">
                            All Definitions ({allDefinitions.length})
                        </h3>
                        <div className="max-h-60 overflow-y-auto space-y-1">
                            {allDefinitions.map((entry) => (
                                <button
                                    key={entry.file}
                                    onClick={() => onSelect(entry, 'cal')}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                                >
                                    <span className="font-medium">{entry.name}</span>
                                    <span className="text-zinc-500 dark:text-zinc-500 ml-2">({entry.paramCount})</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}
