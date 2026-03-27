import {useState} from 'preact/hooks';
import {Modal} from "./Modal.tsx";
import {track} from "../lib/track.ts";

interface IExportModalProps {
    onClose: () => void;
    onExport: () => void;
}

type SupportType = 'per-export' | 'once' | 'subscription' | 'i-am-broke';

const presets: Record<SupportType, number[]> = {
    'per-export': [2, 5, 10],
    'once': [20, 50, 100],
    'subscription': [5, 10, 20],
    'i-am-broke': [0]
};

const labels: Record<SupportType, string> = {
    'per-export': 'Pay per export',
    'once': 'Pay once',
    'subscription': 'Monthly subscription',
    'i-am-broke': "I am broke"
};

export function ExportModal({onClose, onExport}: IExportModalProps) {
    const [supportType, setSupportType] = useState<SupportType | null>(null);
    const [amount, setAmount] = useState<number | null>(null);
    const [customAmount, setCustomAmount] = useState(null);

    const handleExport = () => {
        const finalAmount = amount ?? (customAmount ? parseFloat(customAmount) : 0);
        if (supportType && finalAmount > 0) {
            track(labels[supportType], {amount: finalAmount});
        }

        localStorage.setItem('support-answered', '1');

        onExport();
        onClose();
    };

    return (
        <Modal title="Exporting bin" onClose={onClose} footer={
            <div class="flex justify-end">
                <button
                    onClick={handleExport}
                    disabled={!supportType || (amount == null && customAmount == null)}
                    class="cursor-pointer px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    Export
                </button>
            </div>
        }>
            <div class="space-y-4">
                <p class="text-sm text-zinc-600 dark:text-zinc-400">
                    <b>If</b> you had to,<br/>
                    how would you like to support this project?
                </p>

                {/* Support type selection */}
                <div class="grid grid-cols-3 gap-2">
                    {(Object.keys(labels) as SupportType[]).map(type => (
                        <button
                            key={type}
                            onClick={() => {
                                setSupportType(type);
                                setAmount(null);
                                setCustomAmount('');
                            }}
                            class={`px-3 py-2 text-xs rounded border transition-colors cursor-pointer ${
                                supportType === type
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                    : 'border-zinc-300 dark:border-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-500'
                            }`}
                        >
                            {labels[type]}
                        </button>
                    ))}
                </div>

                {/* Amount selection */}
                {supportType && (
                    <div class="flex gap-2">
                        {presets[supportType].map(value => (
                            <button
                                key={value}
                                onClick={() => {
                                    setAmount(value);
                                    setCustomAmount('');
                                }}
                                class={`flex-1 px-3 py-2 text-sm rounded border transition-colors cursor-pointer ${
                                    amount === value
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                        : 'border-zinc-300 dark:border-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-500'
                                }`}
                            >
                                {value}€{supportType === 'subscription' ? '/mo' : ''}
                            </button>
                        ))}
                        {supportType !== "i-am-broke" && <div class="flex-1 relative">
                            <input
                                type="number"
                                placeholder="Custom"
                                value={customAmount}
                                onInput={(e) => {
                                    setCustomAmount((e.target as HTMLInputElement).value);
                                    setAmount(null);
                                }}
                                class={`w-full px-3 py-2 text-sm rounded border bg-transparent transition-colors ${
                                    customAmount
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                                        : 'border-zinc-300 dark:border-zinc-600'
                                }`}
                            />
                            <span class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400">€</span>
                        </div>}
                    </div>
                )}
            </div>
        </Modal>
    );
}
