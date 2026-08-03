import {BaseService} from './base';

export interface TuningFileEntry {
    id: string;
    name: string;
    meta: Record<string, unknown>;
}

export class TuningService extends BaseService {
    static listBins(): Promise<TuningFileEntry[]> {
        return BaseService.getJSON('tuning/bins');
    }

    static async getBin(id: string, onProgress?: (loaded: number, total: number) => void): Promise<ArrayBuffer> {
        const response = await BaseService.request('tuning/bin', {id}, {headers: {}});
        const total = Number.parseInt(response.headers.get('content-length') ?? '0', 10);

        if (!onProgress || !response.body) return response.arrayBuffer();

        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let loaded = 0;
        onProgress(0, total);

        while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            if (!value) continue;
            chunks.push(value);
            loaded += value.length;
            onProgress(loaded, total);
        }

        const result = new Uint8Array(loaded);
        let offset = 0;
        chunks.forEach(chunk => {
            result.set(chunk, offset);
            offset += chunk.length;
        });
        return result.buffer;
    }
}
