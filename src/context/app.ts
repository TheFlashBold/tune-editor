import {createContext} from "preact";
import {useContext} from "preact/hooks";
import type {Definition, IDefinitionParameter, ILoadedBin, BinaryMode, ParamDiff} from "../types";
import type {PatchCheckResult} from "../lib/btpParser";
import type {DefinitionIndexEntry} from "../lib/definitionLoader";

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
    baseAddress: number;
    bigEndian: boolean;

    // Patches
    patchResults: PatchCheckResult[];

    // Definition picker state
    definitionMatches: { entry: DefinitionIndexEntry; mode: BinaryMode }[];
    allDefinitions: DefinitionIndexEntry[];
    setAllDefinitions: (defs: DefinitionIndexEntry[]) => void;
    clearDefinitionMatches: () => void;

    // Computed
    changes: ParamDiff[];

    // Actions
    loadBin: (file: File) => Promise<void>;
    loadOriginalBin: (file: File) => Promise<void>;
    loadCrossCompareBin: (file: File) => Promise<void>;
    saveBin: () => void;
    exportBtp: () => void;
    markModified: () => void;
    loadDefinitionJson: (file: File) => Promise<void>;
    setDefinition: (def: Definition | null) => void;
    setExternalDefinition: (def: Definition | null) => void;
    selectDefinitionMatch: (entry: DefinitionIndexEntry, mode: BinaryMode) => Promise<void>;
    searchDefinitions: () => Promise<{
        matches: { entry: DefinitionIndexEntry; mode: BinaryMode }[];
        all: DefinitionIndexEntry[];
    }>;
    setSelectedParam: (param: IDefinitionParameter | null) => void;
    setPatchResults: (results: PatchCheckResult[]) => void;
    detectPatches: (data: Uint8Array, def: Definition | null) => Promise<void>;
}

export const AppContext = createContext<IAppContext | null>(null);

export function useAppContext(): IAppContext {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error("useAppContext must be used within AppContext.Provider");
    return ctx;
}
