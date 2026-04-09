import type {WizardDef, WizardApplyResult, TableCellWrite, WizardContext, AxisWrite} from '../wizards';

/** Set cells to a value where xAxis >= minX (for CURVEs/MAPs with rpm axis) */
function fillAboveX(ctx: WizardContext, paramName: string, minX: number, value: number): TableCellWrite[] | null {
    const param = ctx.params.find(p => p.name.toLowerCase() === paramName.toLowerCase());
    if (!param || (param.type !== 'MAP' && param.type !== 'CURVE')) return null;
    const rows = param.rows || 1;
    const cols = param.cols || 1;
    const xAxis = param.xAxis;
    if (!xAxis) return null;
    const cells: TableCellWrite[] = [];
    for (let c = 0; c < cols; c++) {
        const xVal = xAxis.min + (c / Math.max(1, cols - 1)) * (xAxis.max - xAxis.min);
        if (xVal < minX) continue;
        for (let r = 0; r < rows; r++) {
            cells.push({row: r, col: c, value});
        }
    }
    return cells;
}

/** Add a fixed offset to all cells, reading current values */
function offsetTable(ctx: WizardContext, paramName: string, offset: number): TableCellWrite[] | null {
    const param = ctx.params.find(p => p.name.toLowerCase() === paramName.toLowerCase());
    if (!param || (param.type !== 'MAP' && param.type !== 'CURVE')) return null;
    const data = ctx.readTable(param);
    const cells: TableCellWrite[] = [];
    for (let r = 0; r < data.length; r++) {
        for (let c = 0; c < data[r].length; c++) {
            cells.push({row: r, col: c, value: data[r][c] + offset});
        }
    }
    return cells;
}

/** Scale all cells of a table by a percentage factor, reading current values */
function scaleTable(ctx: WizardContext, paramName: string, factor: number): TableCellWrite[] | null {
    const param = ctx.params.find(p => p.name.toLowerCase() === paramName.toLowerCase());
    if (!param || (param.type !== 'MAP' && param.type !== 'CURVE')) return null;
    const data = ctx.readTable(param);
    const cells: TableCellWrite[] = [];
    for (let r = 0; r < data.length; r++) {
        for (let c = 0; c < data[r].length; c++) {
            cells.push({row: r, col: c, value: data[r][c] * factor});
        }
    }
    return cells;
}

export const stage1: WizardDef = {
    id: 'stage1',
    name: 'Stage 1',
    description: '**Use on stock files only** \nBasic Stage 1 modifications — rev limiter, speed limiter, torque increase',
    product: 'tune_editor_stage_1',
    productId: 'price_1TKHZ5QBLhZeM8j4u0ZHH6LY',
    requiredParams: ['ip_tq_pow_max_mt[0][0]', 'ip_tq_pow_max_at[0][0]', 'c_tia_thr_tcha_max', 'c_tq_pow_max_bas_fil_rst', 'c_tqi_pow_max_req_clu_dft', 'c_prs_im_sp_lim', 'c_prs_im_sp_max'],
    controls: [
        {
            key: 'rev_limit',
            label: 'Rev Limit',
            control: 'slider',
            min: 3000,
            max: 9000,
            step: 50,
            unit: 'rpm',
            default: 6816,
            group: 'Limiters'
        },
        {
            key: 'rev_limit_standing',
            label: 'Rev Limit while standing',
            control: 'slider',
            min: 3000,
            max: 9000,
            step: 50,
            unit: 'rpm',
            default: 5000,
            group: 'Limiters'
        },
        {
            key: 'speed_limit',
            label: 'Speed Limiter',
            control: 'slider',
            min: 100,
            max: 310,
            step: 1,
            default: 250,
            unit: 'km/h',
            group: 'Limiters'
        },
        {
            key: 'torque_pct',
            label: 'Torque Limit Increase',
            description: '25% matches the typical OEM safety margin. Going higher only helps if the engine can actually produce more — it won\'t add power beyond what the turbo and fueling can deliver.',
            control: 'slider',
            min: 0,
            max: 35,
            step: 5,
            unit: '%',
            group: 'Torque',
            default: 20
        },
        {
            key: 'timing_add',
            label: 'Additional Timing',
            description: 'Added to all ignition base maps',
            control: 'slider',
            min: 0,
            max: 7,
            step: 0.25,
            unit: '°',
            group: 'Ignition',
            default: 0
        },
    ],
    presets: [],
    readState(ctx: WizardContext): Record<string, number> {
        const find = ctx.findParam;
        const scalar = (name: string) => {
            const p = find(name);
            return p ? ctx.readScalar(p) : undefined;
        };
        const state: Record<string, number> = {};

        // Rev limit from id_n_max_stat_vvl_h (table, use average)
        const revParam = find('id_n_max_stat_vvl_h');
        if (revParam) {
            const data = ctx.readTable(revParam);
            const flat = data.flat();
            if (flat.length > 0) state['rev_limit'] = flat.reduce((a, b) => a + b, 0) / flat.length;
        }

        // Rev limit standing: average of all gearbox type limits
        const nMaxNames = ['c_n_max_at', 'c_n_max_cvt', 'c_n_max_dct', 'c_n_max_mt'];
        const nMaxVals = nMaxNames.map(scalar).filter((v): v is number => v !== undefined);
        if (nMaxVals.length > 0) state['rev_limit_standing'] = nMaxVals.reduce((a, b) => a + b, 0) / nMaxVals.length;

        // Speed limit: average of all speed limit variants
        const speedNames = [
            'lmvlim_vmax_vlim_c_vw.vehspdl2lvl1',
            'lmvlim_vmax_vlim_c_vw.vehspdl2lvl2',
            'lmvlim_vmax_vlim_c_vw.vehspdl2lvl3',
            'lmvlim_vmax_vlim_c_vw.vehspdl2notacv',
        ];
        const speedVals = speedNames.map(scalar).filter((v): v is number => v !== undefined);
        if (speedVals.length > 0) state['speed_limit'] = speedVals.reduce((a, b) => a + b, 0) / speedVals.length;

        return state;
    },
    apply(values: Record<string, number>, ctx: WizardContext): WizardApplyResult {
        const v = (k: string, fallback = 0) => values[k] ?? fallback;
        const scalars: Record<string, number> = {};
        const tableCells: Record<string, TableCellWrite[]> = {};
        const tableFills: Record<string, number> = {};

        const find = ctx.findParam;

        // Scale torque limit maps
        const factor = 1 + v('torque_pct', 25) / 100;
        for (const name of [
            'ip_tq_pow_max_mt[0][0]',
            'ip_tq_pow_max_mt[0][1]',
            'ip_tq_pow_max_mt[1][0]',
            'ip_tq_pow_max_mt[1][1]',
            'ip_tq_pow_max_mt[2][0]',
            'ip_tq_pow_max_mt[2][1]',
            'ip_tq_pow_max_mt[3][0]',
            'ip_tq_pow_max_mt[3][1]',
            'ip_tq_pow_max_mt[4][0]',
            'ip_tq_pow_max_mt[4][1]',
            'ip_tq_pow_max_at[0][0]',
            'ip_tq_pow_max_at[0][1]',
            'ip_tq_pow_max_at[1][0]',
            'ip_tq_pow_max_at[1][1]',
            'ip_tq_pow_max_at[2][0]',
            'ip_tq_pow_max_at[2][1]',
            'ip_tq_pow_max_at[3][0]',
            'ip_tq_pow_max_at[3][1]',
            'ip_tq_pow_max_at[4][0]',
            'ip_tq_pow_max_at[4][1]'
        ]) {
            const cells = scaleTable(ctx, name, factor);
            if (cells) {
                tableCells[name] = cells;
            }
        }

        // Scale turbo speed limit +15%
        const tcha = scaleTable(ctx, 'c_n_tcha_max', 1.15);
        if (tcha) {
            tableCells['c_n_tcha_max'] = tcha;
        }

        // Charge air temp threshold
        scalars['c_tia_thr_tcha_max'] = 220;

        // Max reference torque monitor
        if (find('ip_tqi_ref_max_mon')) scalars['ip_tqi_ref_max_mon'] = 1024;

        // Torque limits
        scalars['c_tq_pow_max_bas_fil_rst'] = 500;
        scalars['c_tqi_pow_max_req_clu_dft'] = 550;
        if (find('ip_tqi_pow_max_bas')) {
            scalars['ip_tqi_pow_max_bas'] = 1000;
        }

        // Air mass
        scalars['c_m_air_cyl_sp_max'] = 1390;

        for (const name of ['ip_m_air_cyl_max_stnd_vvl[0]', 'ip_m_air_cyl_max_stnd_vvl[1]']) {
            if (find(name)) {
                const cells = fillAboveX(ctx, name, 1500, 1390);
                if (cells) tableCells[name] = cells;
            }
        }

        // N-max per gearbox type
        for (const name of ['c_n_max_at', 'c_n_max_cvt', 'c_n_max_dct', 'c_n_max_mt']) {
            scalars[name] = v('rev_limit_standing');
        }

        tableFills['id_n_max_stat_vvl_h_sel_psn_h'] = v('rev_limit');
        tableFills['id_n_max_stat_vvl_h'] = v('rev_limit');
        tableFills['id_n_max_stat_vvl_l'] = v('rev_limit');

        // Boost limits
        scalars['c_prs_im_sp_lim'] = 3000;
        scalars['c_prs_im_sp_max'] = 2800;
        scalars['c_bop_max_disp'] = 2800;

        // Speed limits
        const speedScalars = [
            'lmvlim_vmax_vlim_c_vw.vehspdl2lvl1',
            'lmvlim_vmax_vlim_c_vw.vehspdl2lvl2',
            'lmvlim_vmax_vlim_c_vw.vehspdl2lvl3',
            'lmvlim_vmax_vlim_c_vw.vehspdl2notacv'
        ]
        for (const scalar of speedScalars) {
            if (find(scalar)) {
                scalars[scalar] = v('speed_limit');
            }
        }

        // Additional timing on ignition base maps
        const timingAdd = v('timing_add', 0);
        if (timingAdd > 0) {
            for (let p = 0; p <= 1; p++) {
                for (let i = 0; i <= 2; i++) {
                    for (let j = 0; j <= 2; j++) {
                        for (const prefix of ['ip_iga_bas_ivvt_vvl_port_h', 'ip_iga_bas_ivvt_vvl_port_l']) {
                            const name = `${prefix}[${p}][${i}][${j}]`;
                            if (find(name)) {
                                const cells = offsetTable(ctx, name, timingAdd);
                                if (cells) tableCells[name] = cells;
                            }
                        }
                    }
                }
            }
        }

        // ── Extend torque/airflow model if capped ──
        const axisWrites: AxisWrite[] = [];

        for (const baseName of ['ip_tqi_ref_n_m_air_vvl_cam_h', 'ip_maf_stk_sp_vvl_cam_h', 'ip_tqi_ref_n_m_air_vvl_cam_l', 'ip_maf_stk_sp_vvl_cam_l']) {
            const paramName = `${baseName}[0][0][0]`;
            const param = find(paramName);
            if (!param?.yAxis) continue;

            const yAxis = ctx.readAxis(param.yAxis);
            const data = ctx.readTable(param);
            const rows = data.length;
            if (rows < 3) continue;

            // Find first duplicated y-axis index from the end
            let lastUniqueIdx = rows - 1;
            while (lastUniqueIdx > 0 && Math.abs(yAxis[lastUniqueIdx] - yAxis[lastUniqueIdx - 1]) < 0.001) {
                lastUniqueIdx--;
            }
            // lastUniqueIdx is now the first row that shares its value with the one above
            // We want the row before that = the last truly unique row
            const baseIdx = lastUniqueIdx - 1;
            if (baseIdx < 0 || lastUniqueIdx >= rows) continue;

            // Also check for duplicated table rows (from bottom up)
            const rowsEqual = (a: number[], b: number[]) =>
                a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 0.001);

            let lastUniqueRow = rows - 1;
            while (lastUniqueRow > 0 && rowsEqual(data[lastUniqueRow], data[lastUniqueRow - 1])) {
                lastUniqueRow--;
            }
            const rowBaseIdx = lastUniqueRow - 1;

            // Nothing to extend
            if (lastUniqueIdx >= rows - 1 && lastUniqueRow >= rows - 1) continue;

            // Extrapolate y-axis breakpoints (damped — combustion doesn't scale perfectly)
            const DAMP = 0.9;
            // Use the last axis step as base, but check actual spacing
            const lastAxisStep = yAxis[lastUniqueIdx] - yAxis[baseIdx];
            const newYAxis = [...yAxis];

            if (lastUniqueIdx < rows - 1 && baseIdx >= 0 && Math.abs(lastAxisStep) > 0.001) {
                for (let i = lastUniqueIdx + 1; i < rows; i++) {
                    const n = i - lastUniqueIdx;
                    newYAxis[i] = newYAxis[i - 1] + lastAxisStep * Math.pow(DAMP, n - 1);
                }
                // Apply to all variants of this param
                for (let p = 0; p <= 1; p++) {
                    for (let i = 0; i <= 2; i++) {
                        for (let j = 0; j <= 2; j++) {
                            const name = `${baseName}[${p}][${i}][${j}]`;
                            if (find(name)) {
                                axisWrites.push({param: name, axis: 'y', values: newYAxis});
                            }
                        }
                    }
                }
            }

            // Extrapolate duplicated table rows using gradient per axis unit
            if (rowBaseIdx >= 0 && lastUniqueRow < rows - 1) {
                const cols = data[0].length;
                const axisSpan = yAxis[lastUniqueRow] - yAxis[rowBaseIdx];

                for (let p = 0; p <= 1; p++) {
                    for (let i = 0; i <= 2; i++) {
                        for (let j = 0; j <= 2; j++) {
                            const name = `${baseName}[${p}][${i}][${j}]`;
                            const varParam = find(name);
                            if (!varParam) continue;
                            const varData = ctx.readTable(varParam);
                            const cells: TableCellWrite[] = [];
                            for (let ri = lastUniqueRow + 1; ri < rows; ri++) {
                                // Use the new (extended) y-axis spacing for this row
                                const newSpan = newYAxis[ri] - newYAxis[lastUniqueRow];
                                const ratio = Math.abs(axisSpan) > 0.001 ? newSpan / axisSpan : (ri - lastUniqueRow);
                                for (let c = 0; c < cols; c++) {
                                    const gradient = varData[lastUniqueRow][c] - varData[rowBaseIdx][c];
                                    cells.push({
                                        row: ri,
                                        col: c,
                                        value: varData[lastUniqueRow][c] + gradient * ratio,
                                    });
                                }
                            }
                            if (cells.length > 0) {
                                tableCells[name] = [...(tableCells[name] || []), ...cells];
                            }
                        }
                    }
                }
            }
        }

        return {scalars, tableFills, tableCells, axisWrites};
    },
};
