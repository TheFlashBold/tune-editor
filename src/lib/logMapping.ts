import type {IDefinitionParameter} from '../types';

/**
 * A log row keyed by CSV header. `transform` receives this so it can reference
 * other columns (e.g. compute air density from ambient pressure + temperature).
 */
export type LogRow = Record<string, number>;

export interface LogMapping {
    match: { unit?: string; paramName?: string; axisName?: 'x' | 'y' };
    source: string;
    transform?: (v: number, row: LogRow) => number;
}

// ─── Helpers for transforms ──────────────────────────────────────────────────

const R_SPECIFIC_AIR = 287.05; // J/(kg·K), specific gas constant for dry air
const RHO_STD = 1.204;         // kg/m³ at 20 °C, 1 atm

/**
 * Compressor pressure ratio PQ_CMPR = p_downstream / p_upstream. `Boost` is
 * logged as gauge pressure (bar above ambient); `Ambient Press` is kPa.
 * Falls back to standard-day ambient if the column is absent.
 */
function compressorPressureRatio(boostBarGauge: number, row: LogRow): number {
    const ambKpa = row['Ambient Press'] ?? row['Ambient Pressure'];
    const ambBar = typeof ambKpa === 'number' && isFinite(ambKpa) && ambKpa > 0
        ? ambKpa / 100
        : 1.01325;
    return (boostBarGauge + ambBar) / ambBar;
}

/**
 * Air density in kg/m³, computed from ambient pressure (kPa) and temperature
 * (°C) when available in the log; falls back to standard-day density.
 */
function airDensity(row: LogRow): number {
    const pKpa = row['Ambient Press'] ?? row['Ambient Pressure'];
    const tC = row['Ambient Temp'] ?? row['Ambient Temperature'];
    if (typeof pKpa !== 'number' || typeof tC !== 'number' || !isFinite(pKpa) || !isFinite(tC)) {
        return RHO_STD;
    }
    const pPa = pKpa * 1000;
    const tK = tC + 273.15;
    const rho = pPa / (R_SPECIFIC_AIR * tK);
    return isFinite(rho) && rho > 0.1 ? rho : RHO_STD;
}

// Hardcoded mappings. Order does not matter — best match wins by score.
export const LOG_MAPPINGS: LogMapping[] = [
    {match: {unit: 'rpm', paramName: "ip_tqi_ref_n_m_air_vvl_cam_*"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_maf_stk_sp_vvl_cam_*"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_iga_*_ivvt_vvl_port_*"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_iga_min_bas_cbk_sel_port_*"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_iga_bas_cmb_mod_cor*"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_lamb_iga_afl"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_iga_*_temp_*"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_tq_lgrd_pow_max_req_clu_*"}, source: 'Engine Speed'},
    {match: {unit: '°C', paramName: "ip_iga_*_temp_*"}, source: 'IAT'},
    {match: {unit: '°C', paramName: "ip_fac_tia_n_cor*"}, source: 'IAT'},
    {match: {unit: 'rpm', paramName: "ip_fac_tia_n_cor*"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_fac_tqi_pow_lim_pi"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_fac_tq_req_driv_*_*_mt"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_put_sp"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_t_act_imp_comb*"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_t_max_pu_end_imp_comb"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_iga_imp_comb_*"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_tqi_gs_fast_inc_max_imp_comb"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_tqi_ref_max_mon"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_tqi_ref_n_m_air"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_tqi_pow_max_bas"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_m_air_cyl_max_stnd_vvl*"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_tqi_teg_max_tur_min"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_teg_tur_up_sp"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_cam_sp*"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_iga_add_min_gs_req*"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_tps_sp_mdl_max"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "id_port_sp*"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_lamb_bas_*"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_lamb_fl_sp*"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_lamb_ohp_ext"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_lamb_cop_min"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_lamb_tur_ohp_min"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "id_pv_av_fl"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_tq_pow_max_*"}, source: 'Engine Speed'},
    // rpm per km/h: gear ratio indicator. Source is rpm; divide by vehicle speed in row.
    {
        match: {unit: 'rpm/(km/h)', paramName: "ip_tq_pow_max_drof_mt*"},
        source: 'Engine Speed',
        transform: (rpm, row) => {
            const vkmh = row['Vehicle Speed'];
            if (typeof vkmh !== 'number' || !isFinite(vkmh) || vkmh < 1) return NaN;
            return rpm / vkmh;
        },
    },
    {match: {unit: 'rpm', paramName: "ip_tq_lim_gb_prot_max_mt*"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_fac_pow_max_toil"}, source: 'Engine Speed'},
    {match: {unit: '°C', paramName: "ip_fac_pow_max_toil"}, source: 'Oil Temp'},
    {match: {unit: 'U/min', paramName: "data_thmmng.cote_thdctlsp_m_vw"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_fac_tq_req_driv_*"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_soi_max_cus"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_soi_1_opp_1_cus"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_vlft_sp"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "id_state_sp_ef_aux*"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_dly_inc_*_knk"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_iga_dec_knk"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_iga_inc_knk"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_knks_gain*"}, source: 'Engine Speed'},
    {match: {unit: 'rpm', paramName: "ip_knks_thd_fac*"}, source: 'Engine Speed'},
    // Compressor pressure ratio (PQ_CMPR) — shared axis for several turbo maps.
    {match: {axisName: 'x', paramName: "ip_fac_eff_cmpr*"}, source: 'Boost', transform: compressorPressureRatio},
    {match: {axisName: 'y', paramName: "ip_n_tcha_stnd*"}, source: 'Boost', transform: compressorPressureRatio},
    {match: {axisName: 'y', paramName: "ip_t_act_imp_comb*"}, source: 'Gear'},
    {match: {axisName: 'x', paramName: "id_n_max_stat_vvl_*"}, source: 'Gear'},
    {match: {axisName: 'x', paramName: "id_fac_iga_imp_comb_gear"}, source: 'Gear'},
    {match: {axisName: 'x', paramName: "id_tq_sp_max"}, source: 'Gear'},
    {match: {unit: '%', paramName: "ip_fac_tq_req_driv_*"}, source: 'Pedal Pos'},
    {match: {unit: 'rpm', paramName: "ip_pq_cha_max"}, source: 'Engine Speed'},
    {match: {unit: '°C', paramName: "ip_pq_cha_max"}, source: 'IAT'},
    {match: {unit: 'rpm', paramName: "ip_fac_pow_tur_ref"}, source: 'Turbo Speed', transform: (speed) => speed * 1000},
    {match: {unit: 'rpm', paramName: "ip_pq_tur_ref"}, source: 'Turbo Speed', transform: (speed) => speed * 1000},
    {
        match: {unit: 'rpm', paramName: "ip_flow_tur_cor_pq_tur[*]"},
        source: 'Turbo Speed',
        transform: (speed) => speed * 1000
    },
    {match: {unit: 'rpm', paramName: "ip_pq_tur_dif[*]"}, source: 'Turbo Speed', transform: (speed) => speed * 1000},
    // Airflow: kg/h → m³/s. kg/s = kg/h / 3600; m³/s = kg/s / ρ, where ρ is derived from ambient p & T if logged.
    {match: {unit: 'm^3/s'}, source: 'Airflow', transform: (airflow, row) => airflow / 3600 / airDensity(row)},
    {match: {unit: 'mg/stk'}, source: 'Airmass'},
    {match: {unit: 'km/h'}, source: 'Vehicle Speed'},
    {match: {unit: 'kg/h'}, source: 'Airflow'},
    {match: {unit: '°C', paramName: "data_antitrmp.antitrmp_faccorthmgear*_t_vw*"}, source: 'Ambient Temp'},
    {match: {unit: '°C', paramName: "ip_fac_mff_temp_cor"}, source: 'Ambient Temp'},
];

interface AxisLookupTarget {
    unit?: string;
    name?: 'x' | 'y';
    paramName: string;
}

function paramNameMatches(pattern: string, name: string): boolean {
    const p = pattern.toLowerCase();
    const n = name.toLowerCase();
    if (!p.includes('*')) return p === n;
    const re = new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    return re.test(n);
}

function score(target: AxisLookupTarget, m: LogMapping): number {
    let s = 0;
    if (m.match.paramName) {
        if (!paramNameMatches(m.match.paramName, target.paramName)) return 0;
        // Literal (no wildcard) matches beat wildcard matches
        s += m.match.paramName.includes('*') ? 8 : 10;
    }
    if (m.match.axisName) {
        if (m.match.axisName !== target.name) return 0;
        s += 3;
    }
    if (m.match.unit) {
        if (!target.unit) return 0;
        if (m.match.unit.trim().toLowerCase() !== target.unit.trim().toLowerCase()) return 0;
        s += 1;
    }
    if (!m.match.paramName && !m.match.axisName && !m.match.unit) return 0;
    return s;
}

function resolveMapping(target: AxisLookupTarget): LogMapping | null {
    let best: LogMapping | null = null;
    let bestScore = 0;
    for (const m of LOG_MAPPINGS) {
        const s = score(target, m);
        if (s > bestScore) {
            best = m;
            bestScore = s;
        }
    }
    return best;
}

function lookupValue(
    target: AxisLookupTarget,
    headers: string[],
    row: number[] | undefined,
    rowRecord: LogRow,
): number | null {
    if (!row) return null;
    const m = resolveMapping(target);
    if (!m) return null;
    const colIdx = headers.indexOf(m.source);
    if (colIdx === -1) return null;
    const raw = row[colIdx];
    if (typeof raw !== 'number' || !isFinite(raw)) return null;
    if (!m.transform) return raw;
    try {
        const out = m.transform(raw, rowRecord);
        return typeof out === 'number' && isFinite(out) ? out : null;
    } catch {
        return null;
    }
}

export interface LogValues {
    x: number | null;
    y: number | null;
    value: number | null;
}

function buildRowRecord(headers: string[], row: number[] | undefined): LogRow {
    const rec: LogRow = {};
    if (!row) return rec;
    for (let i = 0; i < headers.length; i++) {
        rec[headers[i]] = row[i];
    }
    return rec;
}

export function resolveParamValues(
    param: IDefinitionParameter,
    headers: string[],
    row: number[] | undefined,
): LogValues {
    const out: LogValues = {x: null, y: null, value: null};
    const rowRecord = buildRowRecord(headers, row);
    if (param.xAxis) {
        out.x = lookupValue({unit: param.xAxis.unit, name: 'x', paramName: param.name}, headers, row, rowRecord);
    }
    if (param.yAxis) {
        out.y = lookupValue({unit: param.yAxis.unit, name: 'y', paramName: param.name}, headers, row, rowRecord);
    }
    if (param.type === 'VALUE') {
        out.value = lookupValue({unit: param.unit, paramName: param.name}, headers, row, rowRecord);
    }
    return out;
}

/**
 * Linearly interpolate `value` into a (possibly non-monotonic, but typically monotonic) axis.
 * Returns a fractional index in [0, axis.length - 1], clamped. Null if axis empty or no bracket found.
 */
export function fractionalIndex(axis: number[], value: number): number | null {
    if (axis.length === 0) return null;
    if (axis.length === 1) return 0;
    const ascending = axis[axis.length - 1] >= axis[0];
    if (ascending) {
        if (value <= axis[0]) return 0;
        if (value >= axis[axis.length - 1]) return axis.length - 1;
    } else {
        if (value >= axis[0]) return 0;
        if (value <= axis[axis.length - 1]) return axis.length - 1;
    }
    for (let i = 0; i < axis.length - 1; i++) {
        const a = axis[i];
        const b = axis[i + 1];
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        if (value >= lo && value <= hi) {
            if (a === b) return i;
            return i + (value - a) / (b - a);
        }
    }
    return null;
}
