import {useState, useCallback, useMemo} from 'preact/hooks';
import {track} from '../lib/track';
import {DATA_TYPE_INFO, ILoadedBin} from '../types';
import type {Definition, IDefinitionParameter, BinaryMode, CellDiff, AxisDiff, ParamDiff} from '../types';
import type {PatchCheckResult} from '../lib/btpParser';
import {parseBtp, verifyCrc32, checkPatchBlockAware, buildBtp, parseEcuInfo, getCalFileOffset} from '../lib/btpParser';
import {
    readParameterValue,
    readTableData,
    readAxisData,
    addressToOffset,
    detectBinaryMode,
} from '../lib/binUtils';
import {
    loadDefinitionIndex,
    loadDefinition,
    findMatchingDefinitions,
    type DefinitionIndexEntry,
} from '../lib/definitionLoader';
import {mergeDefinitions} from '../components/PatchManager';
import {s19ToBinary, isS19File, hexToBinary, isHexFile} from '../lib/s19Parser';
import type {IAppContext} from '../context/app';

async function parseFileData(file: File): Promise<{ data: Uint8Array; displayName: string }> {
    let data: Uint8Array;
    let displayName = file.name;

    if (isS19File(file.name)) {
        const text = await file.text();
        data = s19ToBinary(text);
        displayName = file.name.replace(/\.(s19|srec|mot)$/i, '.bin');
    } else if (isHexFile(file.name)) {
        const text = await file.text();
        data = hexToBinary(text);
        displayName = file.name.replace(/\.(hex|ihex)$/i, '.bin');
    } else {
        const buffer = await file.arrayBuffer();
        data = new Uint8Array(buffer);
    }

    return {data, displayName};
}

export function useAppState(): IAppContext {
    const [definition, setDefinition] = useState<Definition | null>(null);
    const [binData, setBinData] = useState<Uint8Array | null>(null);
    const [binFileName, setBinFileName] = useState<string | null>(null);
    const [originalBinData, setOriginalBinData] = useState<Uint8Array | null>(null);
    const [originalBinFileName, setOriginalBinFileName] = useState<string | null>(null);
    const [crossCompareBin, setCrossCompareBin] = useState<ILoadedBin | null>(null);
    const [selectedParam, setSelectedParam] = useState<IDefinitionParameter | null>(null);
    const [modified, setModified] = useState(false);
    const [detectedMode, setDetectedMode] = useState<BinaryMode | null>(null);
    const [calOffset, setCalOffset] = useState<number>(0);
    const [patchResults, setPatchResults] = useState<PatchCheckResult[]>([]);
    const [definitionMatches, setDefinitionMatches] = useState<{ entry: DefinitionIndexEntry; mode: BinaryMode }[]>([]);
    const [allDefinitions, setAllDefinitions] = useState<DefinitionIndexEntry[]>([]);

    // Derived
    const baseAddress = definition?.baseAddress ?? 0xa0000000;
    const bigEndian = definition?.bigEndian ?? false;

    // ILoadedBin wrappers
    const bin: ILoadedBin | null = binData ? {
        name: binFileName ?? '',
        data: binData,
        modified,
        type: detectedMode === 'cal' ? 'CAL' : detectedMode === 'full' ? 'FULL' : undefined,
    } : null;

    const originalBin: ILoadedBin | null = originalBinData ? {
        name: originalBinFileName ?? '',
        data: originalBinData,
    } : null;

    const markModified = useCallback(() => {
        setModified(true);
    }, []);

    const clearDefinitionMatches = useCallback(() => {
        setDefinitionMatches([]);
    }, []);

    const detectPatches = useCallback(async (data: Uint8Array, currentDef: Definition | null) => {
        try {
            const response = await fetch('./patches/index.json');
            if (!response.ok) return;
            const patchIndex: {
                name: string;
                file: string;
                definition?: string;
                category?: string;
                variant?: string;
            }[] = await response.json();

            // Extract ECU info from loaded definition for variant filtering
            const epk = currentDef?.verification?.expected ?? currentDef?.name;
            const binEcuInfo = epk ? parseEcuInfo(epk) : null;
            const calFileOffset = binEcuInfo ? getCalFileOffset(binEcuInfo.ecuFamily) : null;

            // Pre-filter by variant from index — only load matching BTPs
            const filtered = binEcuInfo
                ? patchIndex.filter(e => !e.variant || e.variant === binEcuInfo.variant)
                : patchIndex;

            const results: PatchCheckResult[] = [];
            for (const entry of filtered) {
                try {
                    const btpResponse = await fetch(`./patches/${entry.file}`);
                    if (!btpResponse.ok) continue;
                    const btpData = new Uint8Array(await btpResponse.arrayBuffer());
                    const crcValid = verifyCrc32(btpData);
                    const {header, blocks} = parseBtp(btpData);

                    if (header.fileSize !== data.length) continue;

                    const status = checkPatchBlockAware(blocks, data, calFileOffset);
                    results.push({
                        name: entry.name,
                        file: entry.file,
                        status,
                        definition: entry.definition,
                        category: entry.category,
                        blocks,
                        header,
                        crcValid,
                    });
                } catch {
                    // Skip individual patch load failures
                }
            }

            setPatchResults(results);

            // Auto-load definitions for applied patches
            const appliedWithDef = results.filter(r => r.status === 'applied' && r.definition);
            if (appliedWithDef.length > 0 && currentDef) {
                let mergedDef = currentDef;
                for (const applied of appliedWithDef) {
                    try {
                        const patchDef = await fetch(`./patches/definitions/${applied.definition}`).then(r => r.json()) as Definition;
                        mergedDef = mergeDefinitions(mergedDef, patchDef, applied.name);
                    } catch {
                        // Skip individual definition load failures
                    }
                }
                setDefinition(mergedDef);
            }
        } catch {
            // Patch index not available, silently skip
        }
    }, []);

    const loadBin = useCallback(async (file: File) => {
        const {data, displayName} = await parseFileData(file);

        setBinData(data);
        setBinFileName(displayName);
        setModified(false);
        track('Load BIN', {size: data.length});

        // Auto-detect definition
        let loadedDef: Definition | null = null;
        try {
            const matches = await findMatchingDefinitions(data);
            if (matches.length === 1) {
                const match = matches[0];
                const def = await loadDefinition(match.entry.file);
                setDefinition(def);
                setDetectedMode(match.mode);
                setCalOffset(match.calOffset);
                setSelectedParam(null);
                loadedDef = def;
                track('Definition Matched', {name: def.name, mode: match.mode});
            } else if (matches.length > 1) {
                setDefinitionMatches(matches);
            } else {
                track('No Definition Match', {size: data.length});
            }
        } catch (err) {
            console.error('Definition auto-detect failed:', err);
        }

        // Auto-detect patches
        detectPatches(data, loadedDef);
    }, [detectPatches]);

    const loadOriginalBin = useCallback(async (file: File) => {
        const buffer = await file.arrayBuffer();
        setOriginalBinData(new Uint8Array(buffer));
        setOriginalBinFileName(file.name);
        track('Load Original');
    }, []);

    const loadCrossCompareBin = useCallback(async (file: File) => {
        const {data, displayName} = await parseFileData(file);
        const newBin: ILoadedBin = {
            name: displayName,
            data,
        };

        const matches = await findMatchingDefinitions(data);
        if (matches.length === 1) {
            const match = matches[0];
            const def = await loadDefinition(match.entry.file);
            newBin.definition = def;
            newBin.type = match.mode === 'cal' ? 'CAL' : 'FULL';
            newBin.calOffset = match.calOffset;
        }

        setCrossCompareBin(newBin);
        track('Load Cross-Compare');
    }, []);

    // Set definition from external source (XDF drop, JSON drop, converter, browser)
    // Recalculates calOffset based on loaded bin
    const setExternalDefinition = useCallback((def: Definition | null) => {
        setDefinition(def);
        if (!def || !binData) {
            setCalOffset(0);
            setDetectedMode(null);
            return;
        }
        if (def.verification) {
            const result = detectBinaryMode(binData, def.verification);
            setDetectedMode(result.mode);
            setCalOffset(result.calOffset);
        } else {
            setCalOffset(def.offset ?? 0);
            setDetectedMode(null);
        }
    }, [binData]);

    const loadDefinitionJson = useCallback(async (file: File) => {
        const text = await file.text();
        const def = JSON.parse(text) as Definition;
        setExternalDefinition(def);
        setSelectedParam(null);
    }, [setExternalDefinition]);

    const getParamByteRanges = useCallback((): { offset: number; length: number }[] => {
        if (!definition || !binData) return [];
        const defBaseAddress = definition.baseAddress ?? 0xa0000000;
        const ranges: { offset: number; length: number }[] = [];
        const seen = new Set<string>();

        const addRange = (offset: number, length: number) => {
            if (offset < 0 || offset + length > binData.length) return;
            const key = `${offset}:${length}`;
            if (seen.has(key)) return;
            seen.add(key);
            ranges.push({offset, length});
        };

        for (const param of definition.parameters) {
            const rows = param.rows || 1;
            const cols = param.cols || 1;
            const typeSize = DATA_TYPE_INFO[param.dataType].size;
            const dataOffset = param.dataOffset ?? 0;
            const fileOffset = addressToOffset(param.address, calOffset, defBaseAddress) + dataOffset;
            addRange(fileOffset, rows * cols * typeSize);

            if (param.xAxis?.address) {
                const axType = DATA_TYPE_INFO[param.xAxis.dataType ?? param.dataType].size;
                const axDataOffset = param.xAxis.dataOffset ?? 0;
                const axFileOffset = addressToOffset(param.xAxis.address, calOffset, defBaseAddress) + axDataOffset;
                addRange(axFileOffset, param.xAxis.points * axType);
            }
            if (param.yAxis?.address) {
                const axType = DATA_TYPE_INFO[param.yAxis.dataType ?? param.dataType].size;
                const axDataOffset = param.yAxis.dataOffset ?? 0;
                const axFileOffset = addressToOffset(param.yAxis.address, calOffset, defBaseAddress) + axDataOffset;
                addRange(axFileOffset, param.yAxis.points * axType);
            }
        }

        ranges.sort((a, b) => a.offset - b.offset);
        const merged: { offset: number; length: number }[] = [];
        for (const r of ranges) {
            const last = merged[merged.length - 1];
            if (last && r.offset <= last.offset + last.length) {
                const end = Math.max(last.offset + last.length, r.offset + r.length);
                last.length = end - last.offset;
            } else {
                merged.push({...r});
            }
        }
        return merged;
    }, [definition, binData, calOffset]);

    const saveBin = useCallback(() => {
        if (!binData || !binFileName) return;

        const blob = new Blob([binData.buffer as ArrayBuffer], {type: 'application/octet-stream'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = binFileName.replace(/\.[^.]+$/, '_mod.bin');
        a.click();
        URL.revokeObjectURL(url);
        setModified(false);
        track('Save BIN');
    }, [binData, binFileName]);

    const exportBtp = useCallback(() => {
        if (!binData || !originalBinData || !definition) return;

        const ranges = getParamByteRanges();
        const softCode = (definition.verification?.expected ?? definition.name).slice(0, 8);
        const btpData = buildBtp(originalBinData, binData, softCode, ranges);

        const blockCount = btpData[28] | (btpData[29] << 8) | (btpData[30] << 16) | ((btpData[31] << 24) >>> 0);
        if (blockCount === 0) {
            alert('No changes to export');
            return;
        }

        const blob = new Blob([btpData.buffer as ArrayBuffer], {type: 'application/octet-stream'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (binFileName ?? 'patch').replace(/\.[^.]+$/, '_patch.btp');
        a.click();
        URL.revokeObjectURL(url);
        track('Export BTP', {blocks: blockCount});
    }, [binData, originalBinData, definition, binFileName, getParamByteRanges]);

    const selectDefinitionMatch = useCallback(async (entry: DefinitionIndexEntry, mode: BinaryMode) => {
        try {
            const def = await loadDefinition(entry.file);
            setDefinition(def);
            setDetectedMode(mode);
            if (binData && def.verification) {
                const result = detectBinaryMode(binData, def.verification);
                setCalOffset(result.calOffset);
            } else {
                setCalOffset(def.offset ?? entry.verification?.calOffset ?? 0);
            }
            setSelectedParam(null);
            setDefinitionMatches([]);
        } catch (err) {
            console.error('Failed to load definition:', err);
        }
    }, [binData]);

    const searchDefinitions = useCallback(async () => {
        if (!binData) return {matches: [] as { entry: DefinitionIndexEntry; mode: BinaryMode }[], all: [] as DefinitionIndexEntry[]};
        const matches = await findMatchingDefinitions(binData);
        const all = await loadDefinitionIndex();
        return {matches, all};
    }, [binData]);

    // Calculate differences between original and current BIN
    const changes = useMemo((): ParamDiff[] => {
        if (!definition || !binData || !originalBinData) return [];

        const diffs: ParamDiff[] = [];
        const defBaseAddress = definition.baseAddress ?? 0xa0000000;
        const defBigEndian = definition.bigEndian ?? false;

        for (const param of definition.parameters) {
            if (param.type === 'VALUE') {
                const originalValue = readParameterValue(originalBinData, param, calOffset, defBaseAddress, defBigEndian);
                const currentValue = readParameterValue(binData, param, calOffset, defBaseAddress, defBigEndian);
                if (Math.abs(originalValue - currentValue) > 0.0001) {
                    diffs.push({param, originalValue, currentValue});
                }
            } else {
                const originalTable = readTableData(originalBinData, param, calOffset, defBaseAddress, defBigEndian);
                const currentTable = readTableData(binData, param, calOffset, defBaseAddress, defBigEndian);
                const cellDiffs: CellDiff[] = [];

                for (let r = 0; r < originalTable.length; r++) {
                    for (let c = 0; c < originalTable[r].length; c++) {
                        if (Math.abs(originalTable[r][c] - currentTable[r][c]) > 0.0001) {
                            cellDiffs.push({
                                row: r,
                                col: c,
                                original: originalTable[r][c],
                                current: currentTable[r][c],
                            });
                        }
                    }
                }

                const axisDiffs: AxisDiff[] = [];

                if (param.xAxis?.address) {
                    const originalXAxis = readAxisData(originalBinData, param.xAxis, calOffset, defBaseAddress, defBigEndian);
                    const currentXAxis = readAxisData(binData, param.xAxis, calOffset, defBaseAddress, defBigEndian);
                    const changedIndices: number[] = [];
                    for (let i = 0; i < originalXAxis.length; i++) {
                        if (Math.abs(originalXAxis[i] - currentXAxis[i]) > 0.0001) {
                            changedIndices.push(i);
                        }
                    }
                    if (changedIndices.length > 0) {
                        axisDiffs.push({axis: 'x', original: originalXAxis, current: currentXAxis, changedIndices});
                    }
                }

                if (param.yAxis?.address) {
                    const originalYAxis = readAxisData(originalBinData, param.yAxis, calOffset, defBaseAddress, defBigEndian);
                    const currentYAxis = readAxisData(binData, param.yAxis, calOffset, defBaseAddress, defBigEndian);
                    const changedIndices: number[] = [];
                    for (let i = 0; i < originalYAxis.length; i++) {
                        if (Math.abs(originalYAxis[i] - currentYAxis[i]) > 0.0001) {
                            changedIndices.push(i);
                        }
                    }
                    if (changedIndices.length > 0) {
                        axisDiffs.push({axis: 'y', original: originalYAxis, current: currentYAxis, changedIndices});
                    }
                }

                if (cellDiffs.length > 0 || axisDiffs.length > 0) {
                    const xAxis = param.xAxis ? readAxisData(binData, param.xAxis, calOffset, defBaseAddress, defBigEndian) : undefined;
                    const yAxis = param.yAxis ? readAxisData(binData, param.yAxis, calOffset, defBaseAddress, defBigEndian) : undefined;

                    diffs.push({
                        param,
                        originalValue: originalTable,
                        currentValue: currentTable,
                        cellDiffs,
                        axisDiffs,
                        xAxis,
                        yAxis,
                    });
                }
            }
        }

        return diffs;
    }, [definition, binData, originalBinData, calOffset]);

    return {
        bin,
        originalBin,
        crossCompareBin,
        definition,
        selectedParam,
        calOffset,
        detectedMode,
        baseAddress,
        bigEndian,
        patchResults,
        definitionMatches,
        allDefinitions,
        setAllDefinitions,
        clearDefinitionMatches,
        changes,
        loadBin,
        loadOriginalBin,
        loadCrossCompareBin,
        saveBin,
        exportBtp,
        markModified,
        loadDefinitionJson,
        setDefinition,
        setExternalDefinition,
        selectDefinitionMatch,
        searchDefinitions,
        setSelectedParam,
        setPatchResults,
        detectPatches,
    };
}
