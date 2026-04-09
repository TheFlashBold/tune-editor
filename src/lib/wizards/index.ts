import type {WizardDef} from '../wizards';
import {popsBangs} from './popsBangs';
import {stage1} from './stage1';
import {fineKnockRetard} from './fineKnockRetard';

export const WIZARDS: WizardDef[] = [
    popsBangs,
    stage1,
    fineKnockRetard,
];
