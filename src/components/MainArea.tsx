import {useAppContext} from '../context/app';
import {ValueEditor} from './ValueEditor';

export function MainArea() {
    const ctx = useAppContext();

    return (
        <main className="flex-1 overflow-auto p-4 relative">
            <div
                className="absolute inset-0 pointer-events-none opacity-[0.10]"
                style={{
                    backgroundImage: 'url(/tune-editor/logo.svg)',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
                    backgroundSize: '40%',
                }}
            />
            {!ctx.bin && (
                <label
                    className="flex justify-center items-center h-full text-zinc-500 cursor-pointer hover:bg-zinc-700/30 transition-colors">
                    <div className="text-center">
                        <p>Click or drop BIN/S19/HEX file</p>
                        <p className="text-xs mt-1">or use File → Open BIN/S19/HEX</p>
                    </div>
                    <input
                        type="file"
                        accept=".bin,.ori,.mod,.s19,.srec,.mot,.hex,.ihex"
                        onChange={async (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (!file) return;
                            await ctx.loadBin(file);
                            (e.target as HTMLInputElement).value = '';
                        }}
                        className="hidden"
                    />
                </label>
            )}

            {ctx.bin && !ctx.selectedParam && (
                <div className="flex justify-center items-center h-full text-zinc-500">
                    Select a parameter from the tree
                </div>
            )}

            {ctx.bin && ctx.selectedParam && (
                <ValueEditor
                    parameter={ctx.selectedParam}
                    binData={ctx.bin.data}
                    originalBinData={ctx.originalBin?.data}
                    calOffset={ctx.calOffset}
                    baseAddress={ctx.baseAddress}
                    bigEndian={ctx.bigEndian}
                    onModify={ctx.markModified}
                />
            )}
        </main>
    );
}
