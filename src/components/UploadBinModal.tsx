import {useState, useRef} from 'preact/hooks';
import {Modal} from './Modal';
import {TuningService, TuningRateLimitedException} from '../services/tuning';
import {track} from '../lib/track';
import type {UnknownBinInfo} from '../context/app';

interface UploadBinModalProps {
    info: UnknownBinInfo;
    onClose: () => void;
}

export function UploadBinModal({info, onClose}: UploadBinModalProps) {
    const [progress, setProgress] = useState(0);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    const handleUpload = async () => {
        setUploading(true);
        setError(null);
        setProgress(0);
        abortRef.current = new AbortController();

        const name = info.name.endsWith('.bin') ? info.name : info.name + '.bin';

        try {
            const blob = new Blob([info.data.buffer as ArrayBuffer]);
            await TuningService.uploadBin(blob, {
                name,
                onProgress: (pct) => setProgress(Math.round(pct)),
                signal: abortRef.current.signal,
            });
            setDone(true);
            track('Upload Unknown BIN', {name, epk: info.epk, size: info.data.length});
        } catch (err) {
            if (err instanceof TuningRateLimitedException) {
                setError(`Rate limited. Try again in ${err.retryAfterSeconds} seconds.`);
            } else if ((err as Error).message !== 'Network error') {
                setError((err as Error).message);
            } else {
                setError('Upload failed. Check your connection.');
            }
        } finally {
            setUploading(false);
            abortRef.current = null;
        }
    };

    const handleCancel = () => {
        if (abortRef.current) {
            abortRef.current.abort();
        }
        onClose();
    };

    const sizeKB = Math.round(info.data.length / 1024);

    return (
        <Modal title="Submit Unknown BIN" onClose={handleCancel} width="sm">
            <div class="space-y-4">
                <p class="text-sm text-zinc-600 dark:text-zinc-400">
                    No definition found for this binary. Submit it so we can add support.
                </p>

                <div class="text-sm space-y-1">
                    <div class="flex justify-between">
                        <span class="text-zinc-500">File</span>
                        <span class="font-mono">{info.name}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-zinc-500">Size</span>
                        <span class="font-mono">{sizeKB} KB</span>
                    </div>
                    {info.epk && (
                        <div class="flex justify-between">
                            <span class="text-zinc-500">EPK</span>
                            <span class="font-mono">{info.epk}</span>
                        </div>
                    )}
                </div>

                {uploading && (
                    <div class="space-y-1">
                        <div class="w-full h-2 bg-zinc-300 dark:bg-zinc-600 rounded overflow-hidden">
                            <div
                                class="h-full bg-blue-500 transition-all duration-150"
                                style={{width: `${progress}%`}}
                            />
                        </div>
                        <div class="text-xs text-zinc-500 text-right">{progress}%</div>
                    </div>
                )}

                {error && (
                    <div class="text-sm text-red-500 bg-red-500/10 rounded px-3 py-2">
                        {error}
                    </div>
                )}

                {done ? (
                    <div class="space-y-3">
                        <div class="text-sm text-green-500 bg-green-500/10 rounded px-3 py-2">
                            Uploaded successfully. Thanks!
                        </div>
                        <button
                            onClick={onClose}
                            class="w-full py-2 rounded font-medium bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600"
                        >
                            Close
                        </button>
                    </div>
                ) : (
                    <div class="flex gap-2">
                        <button
                            onClick={handleCancel}
                            class="flex-1 py-2 rounded font-medium bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600"
                        >
                            Skip
                        </button>
                        <button
                            onClick={handleUpload}
                            disabled={uploading}
                            class="flex-1 py-2 rounded font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {uploading ? 'Uploading...' : 'Upload'}
                        </button>
                    </div>
                )}
            </div>
        </Modal>
    );
}
