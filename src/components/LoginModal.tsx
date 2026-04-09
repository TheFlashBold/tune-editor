import {useState} from 'preact/hooks';
import {Modal} from './Modal';
import {AuthService} from '../services/auth';
import type {LoginState} from '../services/auth';
import {track} from '../lib/track';

interface LoginModalProps {
    onClose: () => void;
    onLogin: (state: LoginState) => void;
}

export function LoginModal({onClose, onLogin}: LoginModalProps) {
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            let state: LoginState;
            if (mode === 'register') {
                if (!email || !password) return;
                state = await AuthService.register(email, password);
                track('Register', {user: state.user.login});
            } else {
                if (!username || !password) return;
                state = await AuthService.login(username, password);
                track('Login', {user: state.user.login});
            }
            localStorage.setItem('login', JSON.stringify(state));
            onLogin(state);
            onClose();
        } catch (err) {
            setError((err as Error).message || (mode === 'register' ? 'Registration failed' : 'Login failed'));
        } finally {
            setLoading(false);
        }
    };

    const canSubmit = mode === 'register' ? !!email && !!password : !!username && !!password;

    return (
        <Modal title={mode === 'register' ? 'Create Account' : 'Login'} onClose={onClose} width="sm">
            <form onSubmit={handleSubmit} class="space-y-4">
                {mode === 'register' ? (
                    <div>
                        <label class="block text-sm font-medium mb-1">Email</label>
                        <input
                            type="email"
                            value={email}
                            onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
                            class="w-full px-3 py-2 rounded border border-zinc-400 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                        />
                    </div>
                ) : (
                    <div>
                        <label class="block text-sm font-medium mb-1">Email</label>
                        <input
                            type="text"
                            value={username}
                            onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
                            class="w-full px-3 py-2 rounded border border-zinc-400 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                        />
                    </div>
                )}
                <div>
                    <label class="block text-sm font-medium mb-1">Password</label>
                    <input
                        type="password"
                        value={password}
                        onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
                        class="w-full px-3 py-2 rounded border border-zinc-400 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                {error && (
                    <div class="text-sm text-red-500 bg-red-500/10 rounded px-3 py-2">
                        {error}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={loading || !canSubmit}
                    class="w-full py-2 rounded font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading
                        ? (mode === 'register' ? 'Creating account...' : 'Logging in...')
                        : (mode === 'register' ? 'Create Account' : 'Login')
                    }
                </button>

                <div class="text-center text-sm text-zinc-500">
                    {mode === 'login' ? (
                        <>
                            Don't have an account?{' '}
                            <button
                                type="button"
                                onClick={() => { setMode('register'); setError(null); }}
                                class="text-blue-500 hover:text-blue-400 cursor-pointer"
                            >
                                Register
                            </button>
                        </>
                    ) : (
                        <>
                            Already have an account?{' '}
                            <button
                                type="button"
                                onClick={() => { setMode('login'); setError(null); }}
                                class="text-blue-500 hover:text-blue-400 cursor-pointer"
                            >
                                Login
                            </button>
                        </>
                    )}
                </div>
            </form>
        </Modal>
    );
}
