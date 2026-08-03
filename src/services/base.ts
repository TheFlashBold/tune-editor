import type {GenericObject} from '../types';
import type {LoginState} from './auth';

export function getCurrentLocalStorage<T>(key: string, defaultValue: T): T {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch {
        return defaultValue;
    }
}

export function getLoginState(): LoginState | null {
    return getCurrentLocalStorage<LoginState | null>('login', null);
}

function buildSearchParams(queryParams: GenericObject = {}): URLSearchParams {
    const searchParams = new URLSearchParams();
    Object.entries(queryParams).forEach(([key, value]) => {
        if (value == null) return;
        if (Array.isArray(value)) value.forEach(item => searchParams.append(key, String(item)));
        else searchParams.append(key, String(value));
    });
    return searchParams;
}

export class BaseService {
    static buildRequestUrl(path: string, queryParams: GenericObject = {}): string {
        const searchParams = buildSearchParams(queryParams);
        return `https://simos.app/api/${path}?${searchParams.toString()}`;
    }

    static async request(path: string, queryParams: GenericObject = {}, init: RequestInit = {}): Promise<Response> {
        const authToken = getLoginState()?.token;
        const response = await fetch(BaseService.buildRequestUrl(path, queryParams), {
            ...init,
            headers: {
                ...(authToken && {Authorization: `Bearer ${authToken}`}),
                'Content-Type': 'application/json',
                ...init.headers,
            },
        });
        await BaseService.handleErrorResponse(response);
        return response;
    }

    static async getJSON<T>(path: string, queryParams: GenericObject = {}, init: RequestInit = {}): Promise<T> {
        const response = await BaseService.request(path, queryParams, init);
        return response.json() as Promise<T>;
    }

    static async postJSON<T>(path: string, queryParams: GenericObject = {}, body: GenericObject = {}): Promise<T> {
        return BaseService.getJSON(path, queryParams, {method: 'POST', body: JSON.stringify(body)});
    }

    private static async handleErrorResponse(response: Response): Promise<void> {
        if (response.ok) return;
        let message = response.statusText || `HTTP ${response.status}`;
        try {
            if (response.headers.get('content-type')?.includes('application/json')) {
                const payload = await response.json() as {error?: string};
                message = payload.error || message;
            } else {
                message = await response.text() || message;
            }
        } catch {
            // Keep the HTTP status text when the error response cannot be decoded.
        }
        throw new Error(message);
    }
}
