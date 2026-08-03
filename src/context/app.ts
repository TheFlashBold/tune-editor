import {createContext} from "preact";
import {useContext} from "preact/hooks";
import type {Definition, IDefinitionParameter, ILoadedBin, BinaryMode, ParamDiff} from "../types";
import type {PatchCheckResult} from "../lib/btpParser";

export interface IAppContext {
    // Binary
    bin: ILoadedBin | null;
    originalBin: ILoadedBin | null;
    crossCompareBin: ILoadedBin | null;

    // Definition
    definition: Definition | null;
    selectedParam: IDefinitionParameter | null;
    calOffset: number;
    detectedMode: BinaryMode | null;

    // Derived
    bigEndian: boolean;
    modified: boolean;

    // Patches
    patchResults: PatchCheckResult[];

    // Computed
    changes: ParamDiff[];
    crossCompareDiffs: ParamDiff[];

    // Actions
    loadBin: (file: File) => Promise<void>;
    loadBinData: (data: Uint8Array, name: string) => void;
    loadOriginalBin: (file: File) => Promise<void>;
    loadCrossCompareBin: (file: File) => Promise<void>;
    saveBin: (filename?: string) => void;
    binFileName: string | null;
    exportBtp: () => void;
    markModified: () => void;
    markSaved: () => void;
    loadDefinitionJson: (file: File) => Promise<void>;
    setDefinition: (def: Definition | null) => void;
    setExternalDefinition: (def: Definition | null) => void;
    setSelectedParam: (param: IDefinitionParameter | null) => void;
    setPatchResults: (results: PatchCheckResult[]) => void;
}

export const AppContext = createContext<IAppContext | null>(null);

export function useAppContext(): IAppContext {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error("useAppContext must be used within AppContext.Provider");
    return ctx;
}
