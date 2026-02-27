import {useRef} from 'preact/hooks';
import type {Definition} from '../types';
import {XDFParser} from '../lib/xdfParser';

interface Props {
    onDefinitionLoad: (def: Definition) => void;
}

export function XdfLoader({onDefinitionLoad}: Props) {
    const xdfRef = useRef<HTMLInputElement>(null);

    const handleConvert = async () => {
        const file = xdfRef.current?.files?.[0];
        if (!file) return;

        const parser = new XDFParser();
        await parser.parseXDF(file);
        const definition = parser.generateDefinition();
        const stats = parser.getStats();
        console.log(`XDF: ${stats.tables} tables, ${stats.constants} constants → ${definition.parameters.length} parameters`);

        onDefinitionLoad(definition);

        // Auto-download JSON
        const json = JSON.stringify(definition, null, 2);
        const blob = new Blob([json], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = definition.name + '.json';
        a.click();
        URL.revokeObjectURL(url);

        if (xdfRef.current) xdfRef.current.value = '';
    };

    return (
        <div class="space-y-4">
            <p class="text-sm text-zinc-400">
                Load an XDF file to convert it to a definition. Categories are read from the XDF directly.
            </p>
            <div class="flex flex-wrap gap-3 items-end">
                <label class="flex flex-col gap-1 text-xs text-zinc-400">
                    XDF File
                    <input
                        type="file"
                        accept=".xdf"
                        ref={xdfRef}
                        class="p-2 bg-zinc-700 border border-zinc-600 rounded text-zinc-200 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-zinc-600 file:text-zinc-200"
                    />
                </label>
            </div>
            <button
                onClick={handleConvert}
                class="px-4 py-2 bg-green-600 text-white rounded font-medium hover:bg-green-500 cursor-pointer"
            >
                Convert & Download JSON
            </button>
        </div>
    );
}
