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
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        if (!username || !password) return;

        setLoading(true);
        setError(null);

        try {
            const state = await AuthService.login(username, password);
            localStorage.setItem('login', JSON.stringify(state));
            track('Login', {user: state.user.login});
            onLogin(state);
            onClose();
        } catch (err) {
            setError((err as Error).message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal title="Login" onClose={onClose} width="sm">
            <form onSubmit={handleSubmit} class="space-y-4">
                <div>
                    <label class="block text-sm font-medium mb-1">Username</label>
                    <input
                        type="text"
                        value={username}
                        onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
                        class="w-full px-3 py-2 rounded border border-zinc-400 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                    />
                </div>
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
                    disabled={loading || !username || !password}
                    class="w-full py-2 rounded font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? 'Logging in...' : 'Login'}
                </button>
            </form>
        </Modal>
    );
}
