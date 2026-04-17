import type {WizardDef} from '../wizards';
import {popsBangs} from './popsBangs';
import {stage1} from './stage1';
import {fineKnockRetard} from './fineKnockRetard';
import {is38Upgrade} from './is38Upgrade';
import {gearRatio} from './gearRatio';
import {oilPressure} from './oilPressure';

export const WIZARDS: WizardDef[] = [
    popsBangs,
    stage1,
    fineKnockRetard,
    is38Upgrade,
    gearRatio,
    oilPressure,
];
