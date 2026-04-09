import {useState, useEffect, useMemo, useCallback, useRef} from 'preact/hooks';
import {Modal} from './Modal';
import {LoginModal} from './LoginModal';
import {useAppContext} from '../context/app';
import {
    readParameterValue,
    writeParameterValue,
    readTableData,
    writeTableCell,
    readAxisData,
    writeAxisValue,
    readBoxCode,
    readEPK,
    readVersion,
    formatValue
} from '../lib/binUtils';
import {track} from '../lib/track';
import {getLoginState} from '../services/base';
import {TuningService} from '../services/tuning';
import type {TuningUnlock} from '../services/tuning';
import {WIZARDS} from '../lib/wizards/index';
import type {WizardDef, WizardControl, WizardContext} from '../lib/wizards';
import type {IDefinitionParameter} from '../types';

interface Props {
    onClose: () => void;
}

function findParam(params: IDefinitionParameter[], name: string): IDefinitionParameter | undefined {
    const lower = name.toLowerCase();
    return params.find(p => p.name.toLowerCase() === lower);
}

function buildRef(binData: Uint8Array): string {
    const boxCode = readBoxCode(binData);
    const version = readVersion(binData);
    const [epk] = readEPK(binData) || [''];
    return [boxCode, version, epk].filter(Boolean).join('_');
}

export function WizardModal({onClose}: Props) {
    const ctx = useAppContext();
    const [activeWizard, setActiveWizard] = useState<WizardDef | null>(null);
    const [values, setValues] = useState<Record<string, number>>({});
    const [unlocks, setUnlocks] = useState<TuningUnlock[] | null>(null);
    const [loadingUnlocks, setLoadingUnlocks] = useState(false);
    const [showLogin, setShowLogin] = useState(false);
    const [loginState, setLoginState] = useState(() => getLoginState());
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const isLoggedIn = !!loginState?.token;

    // Fetch unlocks on mount and when returning from checkout
    const fetchUnlocks = useCallback(async () => {
        if (!isLoggedIn) return;
        try {
            setLoadingUnlocks(true);
            const result = await TuningService.getUnlocks();
            setUnlocks(result);
        } catch {
            setUnlocks([]);
        } finally {
            setLoadingUnlocks(false);
        }
    }, [isLoggedIn]);

    useEffect(() => {
        fetchUnlocks();
    }, [fetchUnlocks]);

    // Poll unlocks while wizard modal is open (to detect checkout completion)
    useEffect(() => {
        if (!isLoggedIn) return;
        pollRef.current = setInterval(fetchUnlocks, 5000);
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [isLoggedIn, fetchUnlocks]);

    const ref = useMemo(() => ctx.bin ? buildRef(ctx.bin.data) : '', [ctx.bin]);

    const isUnlocked = useCallback((wizard: WizardDef): boolean => {
        if (!wizard.productId) return true;
        if (!unlocks) return false;
        return unlocks.some(u => u.product === wizard.product && u.ref === ref);
    }, [unlocks, ref]);

    const handleCheckout = useCallback((wizard: WizardDef) => {
        if (!wizard.productId || !loginState?.token) return;
        const url = TuningService.getCheckoutUrl(wizard.productId, ref, loginState.token);
        window.open(url, '_blank');
    }, [ref, loginState]);

    const readInitialValues = useCallback((wizard: WizardDef) => {
        if (!ctx.bin || !ctx.definition) return {};
        const initial: Record<string, number> = {};

        for (const ctrl of wizard.controls) {
            if (ctrl.default !== undefined) {
                initial[ctrl.key] = ctrl.default;
            }
        }

        for (const ctrl of wizard.controls) {
            if (ctrl.readFrom) {
                const param = findParam(ctx.definition.parameters, ctrl.readFrom);
                if (param && param.type === 'VALUE') {
                    initial[ctrl.key] = readParameterValue(ctx.bin.data, param, ctx.calOffset, ctx.bigEndian);
                }
            }
        }

        if (wizard.readState) {
            const wizCtx: WizardContext = {
                params: ctx.definition.parameters,
                findParam: (name) => findParam(ctx.definition!.parameters, name),
                readTable: (param) => readTableData(ctx.bin!.data, param, ctx.calOffset, ctx.bigEndian),
                readAxis: (axis) => readAxisData(ctx.bin!.data, axis, ctx.calOffset, ctx.bigEndian),
                readScalar: (param) => readParameterValue(ctx.bin!.data, param, ctx.calOffset, ctx.bigEndian),
            };
            Object.assign(initial, wizard.readState(wizCtx));
        }

        return initial;
    }, [ctx.bin, ctx.definition, ctx.calOffset, ctx.bigEndian]);

    const openWizard = useCallback((wizard: WizardDef) => {
        setActiveWizard(wizard);
        setValues(readInitialValues(wizard));
    }, [readInitialValues]);

    const availableControls = useMemo(() => {
        if (!activeWizard || !ctx.definition) return new Set<string>();
        const available = new Set<string>();
        for (const ctrl of activeWizard.controls) {
            if (ctrl.readFrom) {
                if (findParam(ctx.definition.parameters, ctrl.readFrom)) {
                    available.add(ctrl.key);
                }
            } else {
                available.add(ctrl.key);
            }
        }
        return available;
    }, [activeWizard, ctx.definition]);

    const handleValueChange = useCallback((key: string, newValue: number) => {
        setValues(prev => ({...prev, [key]: newValue}));
    }, []);

    const applyPreset = useCallback((presetValues: Record<string, number>) => {
        setValues(prev => ({...prev, ...presetValues}));
    }, []);

    const applyChanges = useCallback(() => {
        if (!ctx.bin || !ctx.definition || !activeWizard) return;
        const wizCtx: WizardContext = {
            params: ctx.definition.parameters,
            findParam: (name) => findParam(ctx.definition!.parameters, name),
            readTable: (param) => readTableData(ctx.bin!.data, param, ctx.calOffset, ctx.bigEndian),
            readAxis: (axis) => readAxisData(ctx.bin!.data, axis, ctx.calOffset, ctx.bigEndian),
            readScalar: (param) => readParameterValue(ctx.bin!.data, param, ctx.calOffset, ctx.bigEndian),
        };
        const result = activeWizard.apply(values, wizCtx);
        let changed = false;

        for (const [name, value] of Object.entries(result.scalars)) {
            const param = findParam(ctx.definition.parameters, name);
            if (param && param.type === 'VALUE') {
                writeParameterValue(ctx.bin.data, param, value, ctx.calOffset, ctx.bigEndian);
                changed = true;
            }
        }

        for (const [name, fillValue] of Object.entries(result.tableFills)) {
            const param = findParam(ctx.definition.parameters, name);
            if (param && (param.type === 'MAP' || param.type === 'CURVE')) {
                const rows = param.rows || 1;
                const cols = param.cols || 1;
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        writeTableCell(ctx.bin.data, param, r, c, fillValue, ctx.calOffset, ctx.bigEndian);
                    }
                }
                changed = true;
            }
        }

        if (result.tableCells) {
            for (const [name, cells] of Object.entries(result.tableCells)) {
                const param = findParam(ctx.definition.parameters, name);
                if (param && (param.type === 'MAP' || param.type === 'CURVE')) {
                    for (const cell of cells) {
                        writeTableCell(ctx.bin.data, param, cell.row, cell.col, cell.value, ctx.calOffset, ctx.bigEndian);
                    }
                    changed = true;
                }
            }
        }

        if (result.axisWrites) {
            for (const aw of result.axisWrites) {
                const param = findParam(ctx.definition.parameters, aw.param);
                const axisDef = param && (aw.axis === 'x' ? param.xAxis : param.yAxis);
                if (axisDef) {
                    for (let i = 0; i < aw.values.length; i++) {
                        writeAxisValue(ctx.bin.data, axisDef, i, aw.values[i], ctx.calOffset, ctx.bigEndian);
                    }
                    changed = true;
                }
            }
        }

        if (changed) {
            ctx.markModified();
            track('Apply Wizard', {wizard: activeWizard.id, definition: ctx.definition.name});
            for (const [key, val] of Object.entries(values)) {
                track('Wizard Value', {wizard: activeWizard.id, key, value: val});
            }
        }
        onClose();
    }, [ctx.bin, ctx.definition, ctx.calOffset, ctx.bigEndian, values, activeWizard, onClose]);

    // ── Wizard list ──
    if (!activeWizard) {
        return (
            <Modal title="Wizards" onClose={onClose} width="md">
                {!ctx.bin || !ctx.definition ? (
                    <p class="text-zinc-500 text-sm">Load a BIN file with a definition first.</p>
                ) : !isLoggedIn ? (
                    <div class="text-center py-4">
                        <p class="text-zinc-500 text-sm mb-3">Please log in to use wizards.</p>
                        <button
                            onClick={() => setShowLogin(true)}
                            class="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-500 cursor-pointer"
                        >
                            Log in
                        </button>
                        {showLogin && (
                            <LoginModal
                                onClose={() => setShowLogin(false)}
                                onLogin={(state) => {
                                    setLoginState(state);
                                    setShowLogin(false);
                                }}
                            />
                        )}
                    </div>
                ) : loadingUnlocks && !unlocks ? (
                    <p class="text-zinc-500 text-sm">Loading...</p>
                ) : (
                    <div class="space-y-3">
                        {WIZARDS.map(w => {
                            const compatible = !w.requiredParams || w.requiredParams.every(
                                name => findParam(ctx.definition!.parameters, name)
                            );
                            const unlocked = isUnlocked(w);
                            const canOpen = compatible && unlocked;
                            const needsPurchase = compatible && !unlocked && !!w.productId;
                            return (
                                <div
                                    key={w.id}
                                    class={`rounded-xl border overflow-hidden transition-all ${
                                        !compatible
                                            ? 'border-zinc-300 dark:border-zinc-700 opacity-40'
                                            : needsPurchase
                                                ? 'border-blue-500/30 dark:border-blue-500/20'
                                                : 'border-zinc-300 dark:border-zinc-700 hover:border-blue-500/50'
                                    }`}
                                >
                                    <div class={`px-4 py-4 ${
                                        !compatible
                                            ? 'bg-zinc-200/50 dark:bg-zinc-800/50'
                                            : 'bg-zinc-100 dark:bg-zinc-800'
                                    }`}>
                                        <div class="flex items-start justify-between gap-3">
                                            <div class="flex-1 min-w-0">
                                                <div class="flex items-center gap-2">
                                                    <span class="font-semibold text-base">{w.name}</span>
                                                    {!compatible && (
                                                        <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                                                            incompatible
                                                        </span>
                                                    )}
                                                    {canOpen && !w.productId && (
                                                        <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                                                            free
                                                        </span>
                                                    )}
                                                </div>
                                                <p class="text-xs text-zinc-500 mt-1 leading-relaxed">{w.description}</p>
                                            </div>
                                            <div class="shrink-0">
                                                {needsPurchase && (
                                                    <button
                                                        onClick={() => handleCheckout(w)}
                                                        class="px-4 py-2 text-sm font-medium rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 shadow-sm shadow-blue-500/25 cursor-pointer transition-all active:scale-95"
                                                    >
                                                        Unlock
                                                    </button>
                                                )}
                                                {canOpen && (
                                                    <button
                                                        onClick={() => openWizard(w)}
                                                        class="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-500 cursor-pointer transition-all active:scale-95"
                                                    >
                                                        Open
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Modal>
        );
    }

    // ── Active wizard ──
    const groups = useMemo(() => {
        const map = new Map<string, WizardControl[]>();
        for (const ctrl of activeWizard.controls) {
            const group = ctrl.group || 'General';
            if (!map.has(group)) map.set(group, []);
            map.get(group)!.push(ctrl);
        }
        return map;
    }, [activeWizard]);

    return (
        <Modal
            title={activeWizard.name}
            titleRight={
                <button onClick={() => setActiveWizard(null)}
                        class="text-sm text-blue-500 hover:text-blue-400 cursor-pointer">
                    Back
                </button>
            }
            onClose={onClose}
            width="lg"
            footer={
                <div class="flex justify-between items-center">
                    <div class="flex gap-2">
                        <button onClick={onClose}
                                class="px-4 py-2 text-sm rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600 cursor-pointer">
                            Cancel
                        </button>
                        <button onClick={applyChanges}
                                class="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-500 cursor-pointer">
                            Apply
                        </button>
                    </div>
                </div>
            }
        >
            <div class="space-y-6">
                <p class="text-sm text-zinc-500">{activeWizard.description}</p>

                {activeWizard.presets.length > 0 && (
                    <div>
                        <div class="text-xs font-medium text-zinc-500 uppercase mb-2">Presets</div>
                        <div class="flex flex-wrap gap-2">
                            {activeWizard.presets.map(preset => (
                                <button
                                    key={preset.name}
                                    onClick={() => applyPreset(preset.values)}
                                    class="px-3 py-1.5 text-sm rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600 cursor-pointer"
                                    title={preset.description}
                                >
                                    {preset.name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {Array.from(groups.entries()).map(([groupName, controls]) => (
                    <div key={groupName}>
                        <div class="text-xs font-medium text-zinc-500 uppercase mb-2">{groupName}</div>
                        <div class="space-y-3">
                            {controls.map(ctrl => (
                                <ControlRow
                                    key={ctrl.key}
                                    ctrl={ctrl}
                                    value={values[ctrl.key]}
                                    available={availableControls.has(ctrl.key)}
                                    onChange={handleValueChange}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </Modal>
    );
}

function ControlRow({ctrl, value, available, onChange}: {
    ctrl: WizardControl;
    value: number | undefined;
    available: boolean;
    onChange: (key: string, value: number) => void;
}) {
    if (!available) {
        return (
            <div class="flex items-center justify-between py-2 opacity-40">
                <div>
                    <div class="text-sm">{ctrl.label}</div>
                    {ctrl.description && <div class="text-xs text-zinc-500">{ctrl.description}</div>}
                </div>
                <span class="text-xs text-zinc-500">not found</span>
            </div>
        );
    }

    const currentValue = value ?? ctrl.default ?? 0;

    if (ctrl.control === 'toggle') {
        const isOn = currentValue >= 0.5;
        return (
            <div class="flex items-center justify-between py-2">
                <div>
                    <div class="text-sm">{ctrl.label}</div>
                    {ctrl.description && <div class="text-xs text-zinc-500">{ctrl.description}</div>}
                </div>
                <button
                    onClick={() => onChange(ctrl.key, isOn ? 0 : 1)}
                    class={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${isOn ? 'bg-blue-600' : 'bg-zinc-600'}`}
                >
                    <span
                        class={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${isOn ? 'translate-x-6' : 'translate-x-1'}`}/>
                </button>
            </div>
        );
    }

    if (ctrl.control === 'slider') {
        const min = ctrl.min ?? 0;
        const max = ctrl.max ?? 100;
        const step = ctrl.step ?? 1;
        return (
            <div class="py-2">
                <div class="flex items-center justify-between mb-1">
                    <div>
                        <div class="text-sm">{ctrl.label}</div>
                        {ctrl.description && <div class="text-xs text-zinc-500">{ctrl.description}</div>}
                    </div>
                    <div class="text-sm font-mono text-right">
                        {formatValue(currentValue, 2)} {ctrl.unit || ''}
                    </div>
                </div>
                <input
                    type="range" min={min} max={max} step={step} value={currentValue}
                    onInput={(e) => onChange(ctrl.key, parseFloat((e.target as HTMLInputElement).value))}
                    class="w-full h-2 rounded-lg appearance-none cursor-pointer bg-zinc-300 dark:bg-zinc-600 accent-blue-600"
                />
                <div class="flex justify-between text-xs text-zinc-500 mt-0.5">
                    <span>{min} {ctrl.unit || ''}</span>
                    <span>{max} {ctrl.unit || ''}</span>
                </div>
            </div>
        );
    }

    if (ctrl.control === 'select' && ctrl.options) {
        return (
            <div class="flex items-center justify-between py-2">
                <div>
                    <div class="text-sm">{ctrl.label}</div>
                    {ctrl.description && <div class="text-xs text-zinc-500">{ctrl.description}</div>}
                </div>
                <div class="flex gap-1">
                    {ctrl.options.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => onChange(ctrl.key, opt.value)}
                            class={`px-2 py-1 text-xs rounded cursor-pointer ${
                                Math.abs(currentValue - opt.value) < 0.001
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-300 dark:hover:bg-zinc-600'
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    // number
    return (
        <div class="flex items-center justify-between py-2">
            <div>
                <div class="text-sm">{ctrl.label}</div>
                {ctrl.description && <div class="text-xs text-zinc-500">{ctrl.description}</div>}
            </div>
            <input
                type="number" value={currentValue}
                onInput={(e) => {
                    const v = parseFloat((e.target as HTMLInputElement).value);
                    if (!isNaN(v)) onChange(ctrl.key, v);
                }}
                class="w-24 px-2 py-1 text-sm font-mono text-right bg-zinc-200 dark:bg-zinc-700 border border-zinc-400 dark:border-zinc-600 rounded"
            />
        </div>
    );
}
