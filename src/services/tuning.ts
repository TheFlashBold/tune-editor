import {BaseService} from "./base";

export interface TuningUploadOptions {
    name: string;
    onProgress?: (progress: number, bytes: number) => void;
    signal?: AbortSignal;
}

export interface TuningUploadResult {
    id: string;
    name: string;
}

export interface TuningRateLimitError {
    error: string;
    retryAfterSeconds: number;
}

export class TuningService extends BaseService {

    static async uploadBin(data: Blob, options: TuningUploadOptions): Promise<TuningUploadResult> {
        const {name, onProgress, signal} = options;

        if (!name.endsWith(".bin")) {
            throw new Error("Only .bin files are allowed");
        }

        return new Promise<TuningUploadResult>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const totalBytes = data.size;

            xhr.open("POST", BaseService.buildRequestUrl("tuning/upload", {name}));
            xhr.setRequestHeader("Content-Type", "application/octet-stream");

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percent = (event.loaded / totalBytes) * 100;
                    onProgress?.(percent, event.loaded);
                }
            };

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(JSON.parse(xhr.responseText));
                } else if (xhr.status === 429) {
                    const body = JSON.parse(xhr.responseText) as TuningRateLimitError;
                    reject(new TuningRateLimitedException(body.retryAfterSeconds));
                } else {
                    reject(new Error(xhr.responseText || `Upload failed (${xhr.status})`));
                }
            };

            xhr.onerror = () => reject(new Error("Network error"));

            signal?.addEventListener("abort", () => xhr.abort());

            xhr.send(data);
        });
    }
}

export class TuningRateLimitedException extends Error {
    retryAfterSeconds: number;

    constructor(retryAfterSeconds: number) {
        super(`Rate limited. Try again in ${retryAfterSeconds} seconds.`);
        this.retryAfterSeconds = retryAfterSeconds;
    }
}
