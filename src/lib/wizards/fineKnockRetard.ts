import type {WizardDef, WizardApplyResult, TableCellWrite, WizardContext} from '../wizards';

export const fineKnockRetard: WizardDef = {
    id: 'fineKnockRetard',
    name: 'Fine Knock Retard',
    description: 'Modifies knock retard to be more fine grained',
    categories: ['simos 12/18'],
    requiredParams: ['ip_iga_dec_knk', 'ip_fac_iga_dec_knk'],
    controls: [],
    presets: [],
    apply(values: Record<string, number>, ctx: WizardContext): WizardApplyResult {
        const knockEnergyMultiplier = [0, 0.7500, 1.5000, 3, 4.5000];
        const knockCorrection = -0.7500;

        const tableFills: Record<string, number> = {
            'ip_iga_dec_knk': knockCorrection,
        };

        // ip_fac_iga_dec_knk: fill every row with the multiplier pattern
        const cells: TableCellWrite[] = [];
        const param = ctx.findParam('ip_fac_iga_dec_knk');
        if (param) {
            const rows = param.rows || 1;
            const cols = param.cols || knockEnergyMultiplier.length;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    cells.push({row: r, col: c, value: knockEnergyMultiplier[c] ?? 0});
                }
            }
        }

        return {
            scalars: {},
            tableFills,
            tableCells: cells.length > 0 ? {'ip_fac_iga_dec_knk': cells} : {},
        };
    },
};
