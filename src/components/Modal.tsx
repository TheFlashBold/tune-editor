import type { ComponentChildren } from 'preact';

interface ModalProps {
    title: string;
    onClose: () => void;
    children: ComponentChildren;
    width?: 'sm' | 'md' | 'lg' | 'xl';
}

const widthClasses = {
    sm: 'sm:w-[400px]',
    md: 'sm:w-[500px]',
    lg: 'sm:w-[600px]',
    xl: 'sm:w-[800px]',
};

export function Modal({ title, onClose, children, width = 'md' }: ModalProps) {
    return (
        <div
            class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                class={`bg-zinc-800 border border-zinc-600 rounded-t-2xl sm:rounded-lg shadow-xl w-full ${widthClasses[width]} max-h-[92vh] sm:max-h-[80vh] flex flex-col`}
                style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
                {/* Header */}
                <div class="flex justify-between items-center px-4 py-3 border-b border-zinc-700 shrink-0">
                    <h2 class="text-base sm:text-lg font-semibold">{title}</h2>
                    <button
                        onClick={onClose}
                        class="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center rounded-full sm:rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 active:bg-zinc-600"
                    >
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div class="flex-1 p-3 sm:p-4 overflow-y-auto">
                    {children}
                </div>
            </div>
        </div>
    );
}
