import type {IDefinitionParameter} from '../types';

export function paramId(param: Pick<IDefinitionParameter, 'id' | 'name'>): string {
    return param.id || param.name;
}

export function paramDisplayName(param: Pick<IDefinitionParameter, 'id' | 'name' | 'description' | 'customName'>): string {
    return param.customName || param.name || param.description || param.id || '';
}

export function paramSortLabel(param: Pick<IDefinitionParameter, 'id' | 'name' | 'description' | 'customName'>): string {
    return paramDisplayName(param) || param.id || '';
}

export function paramMatchesId(param: Pick<IDefinitionParameter, 'id' | 'name'>, id: string): boolean {
    const needle = id.toLowerCase();
    return paramId(param).toLowerCase() === needle || param.name.toLowerCase() === needle;
}

