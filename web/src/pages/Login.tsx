import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import { api } from '../api/client';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const setToken = useAuthStore((s) => s.setToken);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const { token } = isRegister ? await api.register(username, password) : await api.login(username, password);
      setToken(token);
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-950">
      <div className="w-96">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">&#9889;</span>
          </div>
          <h1 className="text-3xl font-bold">ClawdAgent</h1>
          <p className="text-gray-400 mt-2">Autonomous AI Agent</p>
        </div>
        <div className="bg-dark-800 p-8 rounded-xl border border-gray-800">
          <h2 className="text-lg font-semibold mb-4">{isRegister ? 'Create Account' : 'Welcome Back'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Username</label>
              <input type="text" placeholder="Enter username" value={username} onChange={e => setUsername(e.target.value)} className="w-full p-3 rounded-lg bg-dark-900 border border-gray-700 text-white focus:border-primary-500 focus:outline-none transition-colors" />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Password</label>
              <input type="password" placeholder="Enter password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 rounded-lg bg-dark-900 border border-gray-700 text-white focus:border-primary-500 focus:outline-none transition-colors" />
            </div>
            {error && <p className="text-red-400 text-sm bg-red-400/10 p-2 rounded">{error}</p>}
            <button type="submit" className="w-full p-3 bg-primary-600 rounded-lg font-bold hover:bg-primary-700 transition-colors">{isRegister ? 'Create Account' : 'Sign In'}</button>
            <p className="text-center text-gray-400 text-sm cursor-pointer hover:text-white transition-colors" onClick={() => setIsRegister(!isRegister)}>{isRegister ? 'Already have an account? Sign in' : 'Need an account? Create one'}</p>
          </form>
        </div>
      </div>
    </div>
  );
}
