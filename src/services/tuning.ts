import {BaseService} from "./base";
import {DefinitionIndexEntry} from "../lib/definitionLoader.ts";
import type {Definition} from "../types";
import {PatchIndexEntry} from "../components/PatchManager.tsx";

export interface TuningUploadOptions {
    name: string;
    notes?: string;
    version?: string;
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

export interface TuningUnlock {
    ref: string;
    product: string;
}

export interface TuningFileEntry {
    id: string;
    name: string;
    meta: Record<string, any>;
}

export interface OriginalMapAxisData {
    unit: string;
    values: number[];
}

export type OriginalMapData = {
    type: "scalar";
    name: string;
    description: string;
    unit: string;
    value: number;
} | {
    type: "curve" | "table";
    name: string;
    description: string;
    unit: string;
    data: number[][];
    xAxis?: OriginalMapAxisData;
    yAxis?: OriginalMapAxisData;
};

export class TuningService extends BaseService {

    private static isLocalhost(): boolean {
        return typeof window !== 'undefined' && (
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1'
        );
    }

    static async getDefinitionsIndex(): Promise<DefinitionIndexEntry[]> {
        if (this.isLocalhost()) {
            const response = await fetch('./definitions/index.json');
            if (!response.ok) throw new Error('Failed to load definition index');
            return response.json();
        }
        return BaseService.getJSON('tuning/definitions');
    }

    static async getDefinition(file: string): Promise<Definition> {
        const normalizedFile = file.endsWith('.json') ? file : `${file}.json`;
        if (this.isLocalhost()) {
            const response = await fetch(`./definitions/${normalizedFile}`);
            if (!response.ok) throw new Error(`Failed to load definition: ${normalizedFile}`);
            return response.json();
        }
        return BaseService.getJSON(`tuning/definitions/${encodeURIComponent(normalizedFile.slice(0, -5))}`);
    }

    static async getPatchIndex(): Promise<PatchIndexEntry[]> {
        if (this.isLocalhost()) {
            const response = await fetch('./patches/index.json');
            if (!response.ok) throw new Error('Failed to load patch index');
            return response.json();
        }
        return BaseService.getJSON('tuning/patches');
    }

    static async getPatch(file: string): Promise<ArrayBuffer> {
        const normalizedFile = file.endsWith('.btp') ? file : `${file}.btp`;
        if (this.isLocalhost()) {
            const response = await fetch(`./patches/${normalizedFile}`);
            if (!response.ok) throw new Error(`Failed to load patch: ${normalizedFile}`);
            return response.arrayBuffer();
        }
        const res = await BaseService.request(`tuning/patches/${encodeURIComponent(normalizedFile.slice(0, -4))}`, {}, {
            headers: {}
        });
        return res.arrayBuffer();
    }

    static async getPatchDefinition(file: string): Promise<Definition> {
        const normalizedFile = file.endsWith('.json') ? file : `${file}.json`;
        if (this.isLocalhost()) {
            const response = await fetch(`./patches/definitions/${normalizedFile}`);
            if (!response.ok) throw new Error(`Failed to load patch definition: ${normalizedFile}`);
            return response.json();
        }
        return BaseService.getJSON(`tuning/patchDefinitions/${encodeURIComponent(normalizedFile.slice(0, -5))}`);
    }

    static async getOriginalMapData(map: string, boxCode: string, version: string): Promise<OriginalMapData> {
        return BaseService.getJSON("tuning/originalMap", {map, boxCode, version});
    }

    static async getUnlocks(): Promise<TuningUnlock[]> {
        return BaseService.getJSON("tuning/unlocks");
    }

    static getCheckoutUrl(product: string, ref: string, token: string): string {
        return BaseService.buildRequestUrl("payment/checkout", {token, product, ref});
    }

    static async listBins(): Promise<TuningFileEntry[]> {
        return BaseService.getJSON("tuning/bins");
    }

    static async listLogs(): Promise<TuningFileEntry[]> {
        return BaseService.getJSON("tuning/logs");
    }

    static async uploadBin(data: Blob, options: TuningUploadOptions): Promise<TuningUploadResult> {
        const {name, onProgress, signal} = options;

        if (!name.endsWith(".bin")) {
            throw new Error("Only .bin files are allowed");
        }

        return new Promise<TuningUploadResult>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const totalBytes = data.size;

            xhr.open("POST", BaseService.buildRequestUrl("tuning/uploadBin", {name}));
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
                } else {
                    reject(new Error(xhr.responseText || `Upload failed (${xhr.status})`));
                }
            };

            xhr.onerror = () => reject(new Error("Network error"));
            signal?.addEventListener("abort", () => xhr.abort());
            xhr.send(data);
        });
    }

    static async submitBin(data: Blob, options: TuningUploadOptions): Promise<TuningUploadResult> {
        const {name, onProgress, signal} = options;

        if (!name.endsWith(".bin")) {
            throw new Error("Only .bin files are allowed");
        }

        return new Promise<TuningUploadResult>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const totalBytes = data.size;

            xhr.open("POST", BaseService.buildRequestUrl("tuning/submitBin", {name}));
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
