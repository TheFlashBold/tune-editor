/** Thin wrapper around Plausible's custom event API. */
export function track(event: string, props?: Record<string, string | number | boolean>) {
    try {
        (window as any).plausible?.(event, props ? {props} : undefined);
    } catch { /* noop */ }
}
