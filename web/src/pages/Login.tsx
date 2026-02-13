import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import { api } from '../api/client';
import { User, Lock, LogIn, UserPlus, Loader2, Eye, EyeOff } from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REMEMBER_KEY = 'clawdagent_remember_user';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const setToken = useAuthStore((s) => s.setToken);
  const navigate = useNavigate();

  // Load remembered username on mount
  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_KEY);
    if (saved) {
      setUsername(saved);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Read directly from DOM to handle browser autofill (React may not see it)
    const form = e.target as HTMLFormElement;
    const usernameVal = (form.querySelector('#login-username') as HTMLInputElement)?.value?.trim() || username.trim();
    const passwordVal = (form.querySelector('#login-password') as HTMLInputElement)?.value || password;

    if (!usernameVal || !passwordVal) {
      setError('Please enter both username and password.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const { token } = isRegister
        ? await api.register(usernameVal, passwordVal)
        : await api.login(usernameVal, passwordVal);

      // Handle "remember me"
      if (rememberMe) {
        localStorage.setItem(REMEMBER_KEY, username.trim());
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }

      setToken(token);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-950 px-4">
      <div className="w-full max-w-md">

        {/* ---- Branding -------------------------------------------------- */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-primary-600 to-primary-700 rounded-2xl
                          flex items-center justify-center mx-auto mb-5 shadow-lg shadow-primary-600/20">
            <span className="text-4xl" role="img" aria-label="ClawdAgent logo">
              🐙
            </span>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">ClawdAgent</h1>
          <p className="text-gray-500 mt-2 text-sm">v6.0 — Autonomous AI Agent</p>
        </div>

        {/* ---- Card ------------------------------------------------------ */}
        <div className="bg-dark-800 p-8 rounded-2xl border border-gray-800 shadow-xl shadow-black/20">
          <h2 className="text-lg font-semibold mb-6 text-white">
            {isRegister ? 'Create Account' : 'Welcome Back'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Username */}
            <div>
              <label htmlFor="login-username" className="text-sm text-gray-400 mb-1.5 block font-medium">
                Username
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  placeholder="Enter username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-lg bg-dark-900 border border-gray-700
                             text-white placeholder-gray-600 text-sm
                             focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/30
                             transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="login-password" className="text-sm text-gray-400 mb-1.5 block font-medium">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-11 py-3 rounded-lg bg-dark-900 border border-gray-700
                             text-white placeholder-gray-600 text-sm
                             focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/30
                             transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500
                             hover:text-gray-300 transition-colors focus:outline-none"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword
                    ? <EyeOff className="w-4 h-4" />
                    : <Eye className="w-4 h-4" />
                  }
                </button>
              </div>
            </div>

            {/* Remember me */}
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-dark-900 accent-primary-600
                           focus:ring-primary-500"
              />
              <span className="text-sm text-gray-400">Remember me</span>
            </label>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <span className="text-red-400 text-sm leading-relaxed">{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-primary-600 rounded-lg font-semibold text-white
                         hover:bg-primary-700 transition-all
                         disabled:opacity-60 disabled:cursor-not-allowed
                         flex items-center justify-center gap-2 text-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {isRegister ? 'Creating account...' : 'Signing in...'}
                </>
              ) : (
                <>
                  {isRegister
                    ? <UserPlus className="w-4 h-4" />
                    : <LogIn className="w-4 h-4" />
                  }
                  {isRegister ? 'Create Account' : 'Sign In'}
                </>
              )}
            </button>

            {/* Toggle mode */}
            <p
              className="text-center text-gray-500 text-sm cursor-pointer
                         hover:text-gray-300 transition-colors pt-1"
              onClick={() => {
                setIsRegister(!isRegister);
                setError('');
              }}
            >
              {isRegister
                ? 'Already have an account? Sign in'
                : "Don't have an account? Create one"
              }
            </p>
          </form>
        </div>

        {/* ---- Footer ---------------------------------------------------- */}
        <p className="text-center text-gray-600 text-xs mt-6">
          Powered by Claude
        </p>
      </div>
    </div>
  );
}
