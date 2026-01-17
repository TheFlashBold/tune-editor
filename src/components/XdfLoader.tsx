import { useRef } from 'preact/hooks';
import type { Definition } from '../types';
import { XDFParser } from '../lib/xdfParser';

interface Props {
  onDefinitionLoad: (def: Definition) => void;
}

export function XdfLoader({ onDefinitionLoad }: Props) {
  const xdfRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);

  const handleXDFConvert = async () => {
    const xdfFile = xdfRef.current?.files?.[0];
    const csvFile = csvRef.current?.files?.[0];

    if (!xdfFile) {
      alert('Select an XDF file');
      return;
    }

    const parser = new XDFParser();

    if (csvFile) {
      const csvContent = await csvFile.text();
      parser.parseCsv(csvContent);
    }

    await parser.parseXDF(xdfFile);
    const stats = parser.getStats();

    const definition = parser.generateDefinition(xdfFile.name.replace('.xdf', ''));
    console.log(`Converted: ${stats.matched} matched, ${stats.tables} tables, ${stats.constants} constants`);

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
          XDF File
          <input
            type="file"
            accept=".xdf"
            ref={xdfRef}
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
        onClick={handleXDFConvert}
        class="px-4 py-2 bg-green-600 text-white rounded font-medium hover:bg-green-500"
      >
        Convert & Download JSON
      </button>
    </div>
  );
}
