import type {WizardDef, WizardApplyResult, TableCellWrite, AxisWrite, WizardContext} from '../wizards';

const AXIS_MIN = -5;
const AXIS_MAX = 30;
const TEMP_IDX = 6;          // index that the user's temperature input maps to
const AXIS_POINTS = 8;
const DRY_PEAK = 1.8;          // dry curves: idx >= TEMP_IDX → 1.8
const DRY_RAMP_TARGET = 1.0;   // dry "normal ramp" tops out here (no boost, no cut)
const RAIN_PEAK = 1.5;         // rain curves: idx >= TEMP_IDX → 1.5
const RAIN_RAMP_TARGET = 1.0;  // rain "normal ramp" tops out here (no boost, no cut)

/** Build an 8-point axis [-5 ... temp ... 30] with temp pinned at TEMP_IDX. */
function buildAxis(temp: number): number[] {
    const axis = new Array<number>(AXIS_POINTS);
    axis[0] = AXIS_MIN;
    axis[TEMP_IDX] = temp;
    axis[AXIS_POINTS - 1] = AXIS_MAX;
    // lerp low side: indices 1..TEMP_IDX-1 between AXIS_MIN and temp
    for (let i = 1; i < TEMP_IDX; i++) {
        axis[i] = AXIS_MIN + ((temp - AXIS_MIN) * i) / TEMP_IDX;
    }
    // lerp high side: indices TEMP_IDX+1..end-1 between temp and AXIS_MAX
    const highSteps = AXIS_POINTS - 1 - TEMP_IDX;
    for (let i = 1; i < highSteps; i++) {
        axis[TEMP_IDX + i] = temp + ((AXIS_MAX - temp) * i) / highSteps;
    }
    return axis;
}

/**
 * Rain-curve cells:
 *   idx 0 .. TEMP_IDX - 2   → linear ramp from `startValue` to RAIN_RAMP_TARGET (1.0)
 *   idx TEMP_IDX - 1        → midpoint between RAIN_RAMP_TARGET and RAIN_PEAK
 *   idx TEMP_IDX .. end     → RAIN_PEAK
 */
function rainCurveCells(startValue: number): TableCellWrite[] {
    const cells: TableCellWrite[] = [];
    const rampEnd = TEMP_IDX - 2;

    for (let i = 0; i < AXIS_POINTS; i++) {
        let value: number;
        if (i >= TEMP_IDX) {
            value = RAIN_PEAK;
        } else if (i === TEMP_IDX - 1) {
            value = (RAIN_RAMP_TARGET + RAIN_PEAK) / 2;
        } else {
            const t = rampEnd <= 0 ? 1 : Math.min(1, i / rampEnd);
            value = startValue + (RAIN_RAMP_TARGET - startValue) * t;
        }
        cells.push({row: 0, col: i, value});
    }
    return cells;
}

/**
 * Dry cells (same shape as rain, different levels):
 *   idx 0 .. TEMP_IDX - 2   → flat at DRY_RAMP_TARGET (1.0)
 *   idx TEMP_IDX - 1        → midpoint between DRY_RAMP_TARGET and DRY_PEAK
 *   idx TEMP_IDX .. end     → DRY_PEAK
 *
 * We overwrite the whole curve so prior wizard runs or stock values that
 * already reach DRY_PEAK too early don't leak through.
 */
function dryCurveCells(): TableCellWrite[] {
    const cells: TableCellWrite[] = [];
    for (let i = 0; i < AXIS_POINTS; i++) {
        let value: number;
        if (i >= TEMP_IDX) {
            value = DRY_PEAK;
        } else if (i === TEMP_IDX - 1) {
            value = (DRY_RAMP_TARGET + DRY_PEAK) / 2;
        } else {
            value = DRY_RAMP_TARGET;
        }
        cells.push({row: 0, col: i, value});
    }
    return cells;
}

export const antiTramp: WizardDef = {
    id: 'anti-tramp',
    name: 'Anti Tramp',
    description:
        'Disable the anti-tramp torque cuts in 1st and 2nd gear (rain, ' +
        'steering angle, cold weather).',
    categories: ['simos 18'],
    requiredParams: [
        'data_antitrmp.antitrmp_faccorstggear1_m_vw',
        'data_antitrmp.antitrmp_faccorstggear2_m_vw',
        'data_antitrmp.antitrmp_faccorthmgear1_t_vw',
        'data_antitrmp.antitrmp_faccorthmgear2_t_vw',
    ],
    controls: [
        // ── Ambient temperature ──
        {
            key: 'over_temp',
            label: 'Ambient threshold',
            description: 'Above this ambient temperature, full power is applied in 1st and 2nd gear.',
            control: 'slider',
            min: -5,
            max: 30,
            step: 1,
            unit: '°C',
            group: 'Ambient temperature',
            default: 10,
        },
        // ── Rain ──
        {
            key: 'rain_1st',
            label: 'Rain, 1st gear',
            description: 'Keep full power in the rain in 1st.',
            control: 'toggle',
            group: 'Rain',
            default: 0,
        },
        {
            key: 'rain_2nd',
            label: 'Rain, 2nd gear',
            description: 'Keep full power in the rain in 2nd.',
            control: 'toggle',
            group: 'Rain',
            default: 1,
        },
        // ── Steering ──
        {
            key: 'disable_steering',
            label: 'Hard corners',
            description: 'Keep full power at high steering angles.',
            control: 'toggle',
            group: 'Steering angle',
            default: 1,
        },
    ],
    presets: [],
    apply(values: Record<string, number>, _ctx: WizardContext): WizardApplyResult {
        const tableFills: Record<string, number> = {};
        const tableCells: Record<string, TableCellWrite[]> = {};
        const axisWrites: AxisWrite[] = [];

        if (values['disable_steering']) {
            tableFills['data_antitrmp.antitrmp_faccorstggear1_m_vw'] = 1;
            tableFills['data_antitrmp.antitrmp_faccorstggear2_m_vw'] = 1;
        }

        // Ambient-temperature threshold — always applied.
        const temp = Math.max(AXIS_MIN, Math.min(AXIS_MAX, values['over_temp'] ?? 10));
        const axis = buildAxis(temp);

        // All four temperature curves share the same x-axis bytes (COM_AXIS) —
        // one write updates all of them.
        axisWrites.push({
            param: 'data_antitrmp.antitrmp_faccorthmgear1_t_vw',
            axis: 'x',
            values: axis,
        });

        tableCells['data_antitrmp.antitrmp_faccorthmgear1_t_vw'] = dryCurveCells();
        tableCells['data_antitrmp.antitrmp_faccorthmgear2_t_vw'] = dryCurveCells();

        if (values['rain_1st']) {
            tableCells['data_antitrmp.antitrmp_faccorthmgear1wpr_t_vw'] = rainCurveCells(0.85);
        }
        if (values['rain_2nd']) {
            tableCells['data_antitrmp.antitrmp_faccorthmgear2wpr_t_vw'] = rainCurveCells(0.95);
        }

        return {scalars: {}, tableFills, tableCells, axisWrites};
    },
};
