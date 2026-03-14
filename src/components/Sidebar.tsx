import {useAppContext} from '../context/app';
import {CategoryTree} from './CategoryTree';

export function Sidebar() {
    const ctx = useAppContext();

    return (
        <aside className={`w-full sm:w-80 flex flex-col bg-zinc-100 dark:bg-zinc-800 border-r border-zinc-300 dark:border-zinc-700 ${ctx.selectedParam ? 'hidden sm:flex' : 'flex'}`}>
            {ctx.definition ? (
                <>
                    <div className="flex justify-between px-4 py-3 border-b border-zinc-300 dark:border-zinc-700 font-semibold">
                        <span className="truncate">{ctx.definition.name}</span>
                        <span className="text-zinc-600 dark:text-zinc-400 font-normal shrink-0 ml-2">{ctx.definition.parameters.length}</span>
                    </div>
                    <CategoryTree
                        parameters={ctx.definition.parameters}
                        onSelect={ctx.setSelectedParam}
                        selectedParam={ctx.selectedParam}
                    />
                </>
            ) : (
                <label
                    className="flex-1 flex flex-col justify-center items-center p-4 text-zinc-500 text-sm text-center cursor-pointer hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50 transition-colors">
                    <p>No definition loaded</p>
                    <p className="mt-2">Click or drop Definition</p>
                    <p className="mt-1 text-xs">or use A2L Converter</p>
                    <input
                        type="file"
                        accept=".json"
                        onChange={async (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (!file) return;
                            await ctx.loadDefinitionJson(file);
                            (e.target as HTMLInputElement).value = '';
                        }}
                        className="hidden"
                    />
                </label>
            )}
        </aside>
    );
}
