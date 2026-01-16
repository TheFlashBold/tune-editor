import { useRef } from 'preact/hooks';
import type { Definition } from '../types';
import { A2LParser } from '../lib/a2lParser';

interface Props {
  onDefinitionLoad: (def: Definition) => void;
}

export function FileLoader({ onDefinitionLoad }: Props) {
  const a2lRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);

  const handleA2LConvert = async () => {
    const a2lFile = a2lRef.current?.files?.[0];
    const csvFile = csvRef.current?.files?.[0];

    if (!a2lFile) {
      alert('Select an A2L file');
      return;
    }

    const parser = new A2LParser();

    if (csvFile) {
      const csvContent = await csvFile.text();
      parser.parseCsv(csvContent);
    }

    await parser.parseA2L(a2lFile);
    const stats = parser.getStats();

    const definition = parser.generateDefinition(a2lFile.name.replace('.a2l', ''));
    console.log(`Converted: ${stats.matched}/${stats.characteristics} parameters`);

    onDefinitionLoad(definition);

    const json = JSON.stringify(definition, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = definition.name + '.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div class="space-y-4">
      <div class="flex flex-wrap gap-3 items-end">
        <label class="flex flex-col gap-1 text-xs text-zinc-400">
          A2L File
          <input
            type="file"
            accept=".a2l"
            ref={a2lRef}
            class="p-2 bg-zinc-700 border border-zinc-600 rounded text-zinc-200 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-zinc-600 file:text-zinc-200"
          />
        </label>
        <label class="flex flex-col gap-1 text-xs text-zinc-400">
          Categories CSV (optional)
          <input
            type="file"
            accept=".csv"
            ref={csvRef}
            class="p-2 bg-zinc-700 border border-zinc-600 rounded text-zinc-200 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-zinc-600 file:text-zinc-200"
          />
        </label>
      </div>
      <button
        onClick={handleA2LConvert}
        class="px-4 py-2 bg-blue-500 text-white rounded font-medium hover:bg-blue-400"
      >
        Convert & Download JSON
      </button>
    </div>
  );
}
