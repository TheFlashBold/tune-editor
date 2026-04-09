import {BaseService} from "./base";

// import {Image} from "../types";

export interface UserData {
    _id: string,
    email: string,
    login: string,
    firstName: string,
    lastName: string,
    fullName: string,
    projects: string[],
    roles: string[],
    locale: string,
    // avatar?: Image
}

export interface LoginState {
    expires: string,
    token: string,
    renewToken: string,
    user: UserData,
    permissions: {
        [key: string]: string[]
    }
}

export class AuthService extends BaseService {
    static async login(username: string, password: string): Promise<LoginState> {
        return BaseService.postJSON("auth/login", {}, {username, password});
    }

    static async register(email: string, password: string): Promise<LoginState> {
        return BaseService.postJSON("auth/register", {}, {email, password});
    }

    static async self(): Promise<UserData> {
        return BaseService.getJSON("auth/self");
    }
}
