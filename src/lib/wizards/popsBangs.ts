import type {WizardDef, WizardApplyResult, TableCellWrite, WizardContext} from '../wizards';
import type {IDefinitionParameter} from '../../types';

/** Generate cell writes for cells where xAxis >= minRpm and yAxis >= minLoad */
function fillRegion(
    param: IDefinitionParameter,
    minRpm: number,
    minLoad: number,
    value: number,
): TableCellWrite[] {
    const rows = param.rows || 1;
    const cols = param.cols || 1;
    const cells: TableCellWrite[] = [];

    // Compute axis breakpoints from definition
    const xFactor = param.xAxis?.factor ?? 1;
    const xOffset = param.xAxis?.offset ?? 0;
    const yFactor = param.yAxis?.factor ?? 1;
    const yOffset = param.yAxis?.offset ?? 0;

    for (let r = 0; r < rows; r++) {
        // Estimate y-axis value from uniform distribution (min..max)
        const yVal = param.yAxis
            ? param.yAxis.min + (r / Math.max(1, rows - 1)) * (param.yAxis.max - param.yAxis.min)
            : r * yFactor + yOffset;
        if (yVal < minLoad) continue;

        for (let c = 0; c < cols; c++) {
            const xVal = param.xAxis
                ? param.xAxis.min + (c / Math.max(1, cols - 1)) * (param.xAxis.max - param.xAxis.min)
                : c * xFactor + xOffset;
            if (xVal < minRpm) continue;

            cells.push({row: r, col: c, value});
        }
    }
    return cells;
}

export const popsBangs: WizardDef = {
    id: 'pops-bangs',
    name: 'Pops & Bangs',
    description: 'Configure impulse combustion (exhaust crackle/pops on overrun and gear shifts)',
    requiredParams: ['lc_imp_comb', 'ip_iga_imp_comb_sof_act[0]', 'ip_t_act_imp_comb_eng[0]'],
    controls: [
        // ── Enable ──
        {
            key: 'master',
            label: 'Master Enable',
            description: 'Enables/Disabled Pops & Bangs completely',
            readFrom: 'lc_imp_comb',
            control: 'toggle',
            group: 'Enable'
        },
        {
            key: 'standstill',
            label: 'Allow at Standstill',
            description: 'Enable pops in neutral/park at standstill',
            control: 'toggle',
            group: 'Enable',
            default: 0
        },
        {
            key: 'gearshift',
            label: 'Gear Shift Pops',
            description: 'Enable during gear shifts',
            readFrom: 'lc_imp_comb_ct_gs_ena',
            control: 'toggle',
            group: 'Enable'
        },
        {
            key: 'powerup',
            label: 'Pops on throttle lift',
            description: 'Allows pops to happen when throttle is lifted after hard acceleration',
            readFrom: 'lc_imp_comb_puc_ena',
            control: 'toggle',
            group: 'Enable'
        },

        // ── Intensity ──
        {
            key: 'aggressiveness',
            label: 'Aggressiveness',
            description: 'Controls ignition retard, torque sensitivity, and catalyst delay',
            control: 'select',
            group: 'Intensity',
            options: [
                {label: 'Mild', value: 0},
                {label: 'Medium', value: 1},
                {label: 'Hard', value: 2},
                {label: 'Extreme (Catless)', value: 3},
            ],
            default: 1,
        },
        {
            key: 'duration',
            label: 'Duration',
            description: 'How long pops last',
            control: 'slider',
            min: 0.5,
            max: 10,
            step: 0.5,
            unit: 's',
            group: 'Intensity',
            default: 2
        },
        {
            key: 'duration_spt',
            label: 'Duration (Sport)',
            description: 'How long pops last (Sport)',
            control: 'slider',
            min: 0.5,
            max: 10,
            step: 0.5,
            unit: 's',
            group: 'Intensity',
            default: 2
        },
        {
            key: 'duration_gs',
            label: 'Gear Shift Duration',
            description: 'Pop duration during gear shifts',
            control: 'slider',
            min: 0.2,
            max: 5,
            step: 0.2,
            unit: 's',
            group: 'Intensity',
            default: 1
        },
        {
            key: 'duration_gs_spt',
            label: 'Gear Shift Duration (Sport)',
            description: 'Pop duration during gear shifts (Sport)',
            control: 'slider',
            min: 0.2,
            max: 10,
            step: 0.2,
            unit: 's',
            group: 'Intensity',
            default: 3
        },

        // ── Thresholds ──
        {
            key: 'rpm_min',
            label: 'Min RPM',
            readFrom: 'c_n_min_imp_comb',
            control: 'slider',
            min: 0,
            max: 8000,
            step: 100,
            unit: 'rpm',
            group: 'Thresholds'
        },
        {
            key: 'rpm_max',
            label: 'Max RPM',
            readFrom: 'c_n_max_imp_comb',
            control: 'slider',
            min: 0,
            max: 8000,
            step: 100,
            unit: 'rpm',
            group: 'Thresholds'
        },
        // ── Protection ──
        {
            key: 'cat_temp_max',
            label: 'Max Catalyst Temp',
            readFrom: 'c_temp_cat_imp_comb_max',
            control: 'slider',
            min: 0,
            max: 1200,
            step: 10,
            unit: '°C',
            group: 'Protection'
        },
        {
            key: 'cat_temp_min',
            label: 'Min Catalyst Temp',
            readFrom: 'c_temp_cat_imp_comb_min',
            control: 'slider',
            min: 0,
            max: 1200,
            step: 10,
            unit: '°C',
            group: 'Protection'
        },
        {
            key: 'muffler_temp_min',
            label: 'Min Muffler Temp',
            readFrom: 'c_temp_imp_comb_min',
            control: 'slider',
            min: 0,
            max: 1200,
            step: 10,
            unit: '°C',
            group: 'Protection'
        },
        {
            key: 'coolant_min',
            label: 'Min Coolant Temp',
            readFrom: 'c_tco_min_imp_comb',
            control: 'slider',
            min: 0,
            max: 142,
            step: 1,
            unit: '°C',
            group: 'Protection'
        },
    ],
    presets: [],
    apply(values: Record<string, number>, ctx: WizardContext): WizardApplyResult {
        const v = (k: string, fallback = 0) => values[k] ?? fallback;
        const scalars: Record<string, number> = {};
        const tableFills: Record<string, number> = {};
        const tableCells: Record<string, TableCellWrite[]> = {};
        const find = (name: string) => ctx.params.find(p => p.name.toLowerCase() === name.toLowerCase());

        // ── Master enables ──
        scalars['lc_imp_comb'] = v('master');
        tableFills['id_imp_comb_act_state_cc'] = v('master');
        scalars['lc_iga_bol_imp_comb_ena'] = v('master');
        scalars['c_conf_imp_comb_gs'] = v('master') ? 2 : 0;
        scalars['clf_conf_imp_comb_aux'] = v('master') ? 63 : 0;
        scalars['lc_imp_comb_ct_gs_ena'] = v('gearshift');
        scalars['lc_gs_tq_inc_imp_comb_ena'] = v('gearshift');
        scalars['lc_imp_comb_puc_ena'] = v('powerup');
        scalars['lc_conf_imp_comb_cru'] = v('master');

        // ── Standstill ──
        const standstill = v('standstill');
        scalars['lc_conf_imp_comb_tip_in_inh'] = standstill ? 0 : 1; // 0 = not inhibited
        scalars['lc_imp_comb_sel_psn_n_act'] = standstill;
        scalars['lc_imp_comb_sel_psn_p_act'] = standstill;
        scalars['c_vs_min_imp_comb'] = standstill ? 0 : 5;

        // ── Thresholds ──
        scalars['c_n_min_imp_comb'] = v('rpm_min', 2000);
        scalars['c_n_max_imp_comb'] = v('rpm_max', 7500);

        // ── Protection ──
        if (values['cat_temp_max'] !== undefined) scalars['c_temp_cat_imp_comb_max'] = v('cat_temp_max');
        if (values['cat_temp_min'] !== undefined) scalars['c_temp_cat_imp_comb_min'] = v('cat_temp_min');
        if (values['muffler_temp_min'] !== undefined) scalars['c_temp_imp_comb_min'] = v('muffler_temp_min');
        if (values['coolant_min'] !== undefined) scalars['c_tco_min_imp_comb'] = v('coolant_min');

        // ── Aggressiveness ──
        //                          mild  medium  hard  extreme
        const igaRetard = [-8, -16, -22, -30];
        const tqiGsFastMax = [100, 180, 250, 250];
        const tqReqDifMin = [70, 25, 5, 5];
        const catDelay = [2, 1, 0, 0];

        const level = Math.min(3, Math.max(0, Math.round(v('aggressiveness', 1))));
        const iga = igaRetard[level];
        tableFills['ip_iga_imp_comb_sof_act[0]'] = iga;
        tableFills['ip_iga_imp_comb_sof_act[1]'] = iga;
        tableFills['ip_iga_imp_comb_sof_deac[0]'] = iga;
        tableFills['ip_iga_imp_comb_sof_deac[1]'] = iga;
        tableFills['ip_tqi_gs_fast_inc_max_imp_comb'] = tqiGsFastMax[level];
        scalars['c_tq_req_dif_tra_min_imp_comb'] = tqReqDifMin[level];
        tableFills['ip_t_dly_temp_cat_imp_comb'] = catDelay[level];

        // ── Min ignition angle during gear shift — only high RPM + high load cells ──
        for (const name of ['ip_iga_add_min_gs_req', 'ip_iga_add_min_gs_req_spt']) {
            const param = find(name);
            if (param) {
                tableCells[name] = fillRegion(param, 2000, 300, iga);
            }
        }

        // ── Duration — fill duration maps with the duration value ──
        const dur = v('duration', 2);
        tableFills['ip_t_act_imp_comb_eng[0]'] = dur;
        tableFills['ip_t_act_imp_comb_eng[1]'] = dur;
        tableFills['ip_t_act_imp_comb_eng[2]'] = dur;
        tableFills['ip_t_act_imp_comb_eng[3]'] = dur;

        const durSpt = v('duration_spt', 3);
        tableFills['ip_t_act_imp_comb_eng_spt[0]'] = durSpt;
        tableFills['ip_t_act_imp_comb_eng_spt[1]'] = durSpt;
        tableFills['ip_t_act_imp_comb_eng_spt[2]'] = durSpt;
        tableFills['ip_t_act_imp_comb_eng_spt[3]'] = durSpt;

        tableFills['ip_t_max_pu_end_imp_comb'] = Math.max(dur, durSpt);

        tableFills['ip_t_act_imp_comb_gs'] = v('duration_gs', 1);
        tableFills['ip_t_act_imp_comb_gs_spt'] = v('duration_gs_spt', 3);
        scalars['c_t_dly_imp_comb_act_gs'] = 0;

        return {scalars, tableFills, tableCells};
    },
};
