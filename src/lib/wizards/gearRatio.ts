import type {WizardDef, WizardApplyResult, TableCellWrite, WizardContext} from '../wizards';

/**
 * Compute id_gear_gr_mt breakpoints from gear ratios.
 *
 * The x-axis represents RPM/speed ratio ≈ gear_ratio × final_drive × (revs_per_km / 60).
 * For a standard 225/40R18 tire, revs_per_km ≈ 500, so the factor is ~8.33.
 *
 * Boundaries between gears are at the geometric mean of adjacent overall ratios.
 * Pattern per gear: [gear_start, gear_end, 10(transition)]
 */
function computeGearMap(totalRatios: number[]): { x: number[], data: number[] } {
    const FACTOR = 8.33;
    const numGears = totalRatios.length;

    // x-values proportional to total ratio, index 0 = 1st gear (highest)
    const overall = totalRatios.map(r => r * FACTOR);

    // Boundaries between adjacent gears (geometric mean), sorted ascending
    // boundary[0] = between gear 6 and 5, boundary[4] = between gear 1 and 2
    const boundaries: number[] = [];
    for (let i = numGears - 1; i > 0; i--) {
        boundaries.push(Math.sqrt(overall[i - 1] * overall[i]));
    }

    const round = (v: number) => Math.round(v * 10000) / 10000;

    const x: number[] = [];
    const data: number[] = [];

    // Gear 6 (lowest ratio)
    x.push(0);
    data.push(numGears);
    x.push(round(boundaries[0] - 1));
    data.push(numGears);
    x.push(round(boundaries[0]));
    data.push(10);

    // Gears 5 through 2
    for (let b = 0; b < boundaries.length - 1; b++) {
        const gearNum = numGears - 1 - b;
        const lower = boundaries[b];
        const upper = boundaries[b + 1];
        const margin = (upper - lower) * 0.15;
        x.push(round(lower + 1));
        data.push(gearNum);
        x.push(round(upper - margin));
        data.push(gearNum);
        x.push(round(upper));
        data.push(10);
    }

    // Gear 1 (highest ratio)
    const lastBoundary = boundaries[boundaries.length - 1];
    x.push(round(lastBoundary + 1));
    data.push(1);
    x.push(round(overall[0]));
    data.push(1);
    x.push(round(overall[0] * 1.15));
    data.push(10);

    // Neutral
    x.push(round(overall[0] * 1.4));
    data.push(0);

    return {x, data};
}

// Known presets with their gear ratios
interface GearPreset {
    name: string;
    description: string;
    totalRatios: number[]; // 1st through 6th (gear ratio × final drive)
}

const PRESETS: GearPreset[] = [
    {
        name: 'Audi A3 1.8 MQB',
        description: '6-speed',
        totalRatios: [12.4824, 6.7734, 4.3662, 3.2041, 2.6787, 2.2871],
    },
    {
        name: 'Golf 5 Edition 35',
        description: '6-speed',
        totalRatios: [13.63, 8.47, 5.71, 4.35, 3.57, 2.94],
    },
    {
        name: 'Golf Alltrack',
        description: '6-speed',
        totalRatios: [14.85, 8.23, 5.20, 3.59, 2.78, 2.35],
    },
    {
        name: 'Golf GTI',
        description: '6-speed',
        totalRatios: [12.48, 6.77, 4.37, 3.20, 2.68, 2.29],
    },
    {
        name: 'Golf R',
        description: '6-speed',
        totalRatios: [14.25, 8.86, 6.28, 4.62, 3.60, 2.98],
    },
    {
        name: 'PQ35 GLI',
        description: '6-speed',
        totalRatios: [13.24, 8.23, 5.79, 4.33, 3.40, 2.87],
    }
];

export const gearRatio: WizardDef = {
    id: 'gear-ratio',
    name: 'Gear Ratios (Manual)',
    product: 'tune_editor_gear_ratios',
    productId: 'prod_UJy6KwYEQcWE9G',
    price: '9€',
    categories: ['simos 12/18'],
    description: 'Modify manual transmission gear ratio detection map',
    requiredParams: ['id_gear_gr_mt', 'id_ratio_n_gb_nctl_mt[0]'],
    controls: [
        {key: 'gear1', label: '1st Gear (total ratio)', control: 'number', group: 'Ratios', default: 13.63},
        {key: 'gear2', label: '2nd Gear (total ratio)', control: 'number', group: 'Ratios', default: 8.47},
        {key: 'gear3', label: '3rd Gear (total ratio)', control: 'number', group: 'Ratios', default: 5.71},
        {key: 'gear4', label: '4th Gear (total ratio)', control: 'number', group: 'Ratios', default: 4.35},
        {key: 'gear5', label: '5th Gear (total ratio)', control: 'number', group: 'Ratios', default: 3.57},
        {key: 'gear6', label: '6th Gear (total ratio)', control: 'number', group: 'Ratios', default: 2.94},
    ],
    presets: PRESETS.map(p => ({
        name: p.name,
        description: p.description,
        values: {
            gear1: p.totalRatios[0], gear2: p.totalRatios[1], gear3: p.totalRatios[2],
            gear4: p.totalRatios[3], gear5: p.totalRatios[4], gear6: p.totalRatios[5],
        },
    })),
    readState(ctx: WizardContext): Record<string, number> {
        const state: Record<string, number> = {};
        const param = ctx.findParam('id_ratio_n_gb_nctl_mt[0]');
        if (param) {
            const data = ctx.readTable(param);
            const row = data[0] ?? [];
            if (row.length >= 7) {
                state['gear1'] = row[1];
                state['gear2'] = row[2];
                state['gear3'] = row[3];
                state['gear4'] = row[4];
                state['gear5'] = row[5];
                state['gear6'] = row[6];
            }
        }
        return state;
    },
    apply(values: Record<string, number>, ctx: WizardContext): WizardApplyResult {
        const find = ctx.findParam;
        const tableCells: Record<string, TableCellWrite[]> = {};
        const axisWrites: { param: string; axis: 'x' | 'y'; values: number[] }[] = [];

        const totalRatios = [
            values['gear1'] ?? 13.63,
            values['gear2'] ?? 8.47,
            values['gear3'] ?? 5.71,
            values['gear4'] ?? 4.35,
            values['gear5'] ?? 3.57,
            values['gear6'] ?? 2.94,
        ];

        const {x, data} = computeGearMap(totalRatios);

        const param = find('id_gear_gr_mt');
        if (param) {
            const cells: TableCellWrite[] = [];
            for (let c = 0; c < data.length; c++) {
                cells.push({row: 0, col: c, value: data[c]});
            }
            tableCells['id_gear_gr_mt'] = cells;
            axisWrites.push({param: 'id_gear_gr_mt', axis: 'x', values: x});
        }

        // Write the ratio tables so they stay in sync
        for (const name of ['id_ratio_n_gb_nctl_mt[0]', 'id_ratio_n_gb_nctl_mt[1]']) {
            if (find(name)) {
                tableCells[name] = totalRatios.map((v, i) => ({row: 0, col: i + 1, value: v}));
            }
        }

        return {scalars: {}, tableFills: {}, tableCells, axisWrites};
    },
};
