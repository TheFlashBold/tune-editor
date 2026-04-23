import type {WizardDef} from '../wizards';
import {popsBangs} from './popsBangs';
import {stage1} from './stage1';
import {fineKnockRetard} from './fineKnockRetard';
import {is38Upgrade} from './is38Upgrade';
import {gearRatio} from './gearRatio';
import {oilPressure} from './oilPressure';
import {antiTramp} from './antiTramp';

export const WIZARDS: WizardDef[] = [
    fineKnockRetard,
    oilPressure,
    popsBangs,
    stage1,
    is38Upgrade,
    gearRatio,
    antiTramp,
];
