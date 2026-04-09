import type {WizardDef, WizardApplyResult, TableCellWrite, WizardContext} from '../wizards';

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
            description: 'Increases torque limit',
            control: 'slider',
            min: 10,
            max: 35,
            step: 5,
            unit: '%',
            group: 'Torque',
            default: 25
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
    apply(values: Record<string, number>, ctx: WizardContext): WizardApplyResult {
        const v = (k: string, fallback = 0) => values[k] ?? fallback;
        const scalars: Record<string, number> = {};
        const tableCells: Record<string, TableCellWrite[]> = {};
        const tableFills: Record<string, number> = {};

        const find = (name: string) => ctx.params.find(p => p.name.toLowerCase() === name.toLowerCase());

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

        return {scalars, tableFills, tableCells};
    },
};
