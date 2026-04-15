interface LoadingIndicatorProps {
    label?: string;
    compact?: boolean;
}

export function LoadingIndicator({label = 'Loading...', compact = false}: LoadingIndicatorProps) {
    return (
        <div class={`flex items-center ${compact ? 'gap-2' : 'gap-3 justify-center py-8'}`}>
            <div
                class={`rounded-full border-2 border-zinc-300 border-t-blue-500 dark:border-zinc-600 dark:border-t-blue-400 animate-spin ${compact ? 'w-4 h-4' : 'w-6 h-6'}`}
                aria-hidden="true"
            />
            <span class={`${compact ? 'text-sm' : 'text-sm text-zinc-500 dark:text-zinc-400'}`}>{label}</span>
        </div>
    );
}
