import {BaseService} from './base';

export interface UserData {
    _id: string;
    email: string;
    login: string;
    firstName: string;
    lastName: string;
    fullName: string;
    projects: string[];
    roles: string[];
    locale: string;
}

export interface LoginState {
    expires: string;
    token: string;
    renewToken: string;
    user: UserData;
    permissions: Record<string, string[]>;
}

export class AuthService extends BaseService {
    static login(username: string, password: string): Promise<LoginState> {
        return BaseService.postJSON('auth/login', {}, {username, password});
    }

    static renew(): Promise<LoginState> {
        return BaseService.getJSON('auth/renew');
    }

    static self(): Promise<UserData> {
        return BaseService.getJSON('auth/self');
    }
}
