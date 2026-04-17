import type {WizardDef, WizardApplyResult} from '../wizards';

const PARAM_NAME = 'c_n_32_poil_h_pump_oil_el';

export const oilPressure: WizardDef = {
    id: 'oil-pressure',
    name: 'Oil Pressure',
    description: 'Adjust the engine speed threshold for switching in the high-pressure step of the oil pump.',
    categories: ['simos 12/18'],
    requiredParams: [PARAM_NAME],
    controls: [
        {
            key: 'oil_pressure',
            label: 'Oil Pressure',
            description: 'Writes the high-pressure oil pump switch threshold.',
            control: 'slider',
            min: 2000,
            max: 3500,
            step: 1,
            unit: 'rpm',
            readFrom: PARAM_NAME,
            group: 'Oil Pressure',
        },
    ],
    presets: [],
    apply(values: Record<string, number>): WizardApplyResult {
        return {
            scalars: {
                [PARAM_NAME]: values['oil_pressure'] ?? 2000,
            },
            tableFills: {},
        };
    },
};
