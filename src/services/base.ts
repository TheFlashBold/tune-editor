import {GenericObject} from "../types";
import {LoginState} from "./auth";

export function buildSearchParams(queryParams: GenericObject = {}) {
    const searchParams = new URLSearchParams();

    function appendParam(key: string, val: any) {
        if (val == null) {
            return;
        }
        searchParams.append(key, val);
    }

    Object.entries(queryParams).forEach(([key, val]) => {
        if (Array.isArray(val)) {
            val.forEach((item) => appendParam(key, item));
        } else {
            appendParam(key, val);
        }
    });

    return searchParams;
}

export class BaseService {
    static buildRequestUrl(path: string, queryParams: GenericObject = {}): string {
        const searchParams = buildSearchParams(queryParams);

        let base = "https://simos.app/api/";

        return `${base}${path}?${searchParams.toString()}`;
    }

    static async request(path: string, queryParams: GenericObject = {}, init: RequestInit = {}): Promise<Response> {
        const url = BaseService.buildRequestUrl(path, queryParams);
        const authToken = getCurrentLocalStorage<LoginState | null>("login", null)?.token;

        const res = await fetch(url, {
            ...init,
            headers: {
                ...(authToken && {Authorization: authToken}),
                "Content-Type": "application/json",
            }
        });

        await BaseService.handleErrorResponse(res);

        return res;
    }

    static async getJSON<T>(path: string, queryParams: GenericObject = {}, init: RequestInit = {}): Promise<T> {
        const res = await BaseService.request(path, queryParams, init);

        if (res.headers.get("content-type")?.includes("application/json")) {
            return res.json();
        }
    }

    static async postJSON<T>(path: string, queryParams: GenericObject = {}, body: GenericObject = {}): Promise<T> {
        return BaseService.getJSON(path, queryParams, {
            method: "POST",
            body: JSON.stringify(body)
        });
    }

    static async handleErrorResponse(res: Response) {
        if (res.ok) return;

        let errorMessage = "";
        if (res.headers.get("content-type")?.includes("application/json")) {
            try {
                const {error, translation} = await res.json();
                errorMessage = error;
            } catch (e) {
                errorMessage = await res.text() ?? res.status.toString();
            }
        } else {
            errorMessage = await res.text();
        }

        throw new Error(errorMessage);
    }
}
