import React, { useEffect, useState } from 'react';
import SupplierLedger from './components/SupplierLedger';
import { initializeStorage, getSuppliers, addSupplier, setCurrentSupplierId, getSystemUsers, getFormulas, getTransactions, saveSuppliers, saveFormulas, saveTransactions } from './utils/storage';
import { Lock, User, Chrome } from 'lucide-react';
import { supabase } from './lib/supabase';
import { User as AuthUser } from '@supabase/supabase-js';
import { SupabaseStatus } from './components/SupabaseStatus';

export default function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [supabaseUser, setSupabaseUser] = useState<AuthUser | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'supplier' | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [useSupabaseLogin, setUseSupabaseLogin] = useState(false);
  const [supabaseAuthMode, setSupabaseAuthMode] = useState<'login' | 'signup'>('login');
  const [error, setError] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const isSupabaseConfigured = Boolean(supabase);

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;

    const initApp = async () => {
      try {
        await initializeStorage();
        
        // Check for existing local session
        const savedSession = localStorage.getItem('chicken_session');
        if (savedSession) {
          try {
            const { role, supplierId } = JSON.parse(savedSession);
            setIsAuthenticated(true);
            setUserRole(role);
            if (supplierId) {
              setCurrentSupplierId(supplierId);
            }
          } catch (e) {
            localStorage.removeItem('chicken_session');
          }
        }
        
        // Supabase Auth Listener and restore session
        if (supabase) {
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData.session?.user) {
            setSupabaseUser(sessionData.session.user);
            setIsAuthenticated(true);
            setUserRole('admin');
            syncDataWithCloud(sessionData.session.user);
          }

          const { data } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
              setSupabaseUser(session.user);
              setIsAuthenticated(true);
              setUserRole('admin'); // Default for Google Sign-In
              syncDataWithCloud(session.user);
            } else {
              setSupabaseUser(null);
            }
          });
          subscription = data.subscription;
        }
      } catch (err) {
        console.error('Initialization error:', err);
      } finally {
        setIsInitialized(true);
      }
    };

    initApp();

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, []);

  const syncDataWithCloud = async (user: AuthUser) => {
    setIsSyncing(true);
    try {
      if (!supabase) {
        console.warn('Sync skipped: Supabase not configured');
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      // 1. Sync Auth (Implicit with Supabase)

      // 2. Push local data to cloud (Initial migration/Sync)
      const localSuppliers = await getSuppliers();
      const localFormulas = getFormulas();

      await saveSuppliers(localSuppliers);
      await saveFormulas(localFormulas);

      // Sync transactions for each supplier
      for (const s of localSuppliers) {
        const txs = getTransactions(s.id);
        await saveTransactions(txs, s.id);
      }

      console.log('Cloud sync complete');
    } catch (err) {
      console.error('Cloud sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      if (!isSupabaseConfigured) {
        setError('Google Sign-In is unavailable because Supabase is not configured for this deployment.');
        return;
      }
      await supabase.auth.signInWithOAuth({
        provider: 'google',
      });
    } catch (err: any) {
      setError(err.message || 'Google Sign-In failed');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const uname = username.trim();
    
    if (useSupabaseLogin) {
      if (!isSupabaseConfigured) {
        setError('Supabase is not configured for this deployment. Please use local login instead.');
        return;
      }

      try {
        if (supabaseAuthMode === 'signup') {
          const { data, error } = await supabase.auth.signUp({
            email: uname,
            password
          });

          if (error) {
            setError(error.message || 'Sign-up failed');
            return;
          }

          if (data.session?.user) {
            const user = data.session.user;
            setSupabaseUser(user);
            setIsAuthenticated(true);
            setUserRole('admin');
            localStorage.removeItem('chicken_session');
            setError('');
            await syncDataWithCloud(user);
          } else {
            setError('Account created. Please check your email to confirm your account.');
          }
          return;
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email: uname,
          password
        });

        if (error || !data.session?.user) {
          setError(error?.message || 'Invalid email or password');
          return;
        }

        const user = data.session.user;
        setSupabaseUser(user);
        setIsAuthenticated(true);
        setUserRole('admin');
        localStorage.removeItem('chicken_session');
        setError('');
        await syncDataWithCloud(user);
      } catch (err: any) {
        setError(err.message || 'Authentication failed');
      }

      return;
    }

    const normalized = uname.toLowerCase();

    // Check system users (Admins/Static Suppliers)
    const systemUsers = getSystemUsers();
    const matchedSystemUser = systemUsers.find(u => 
      u.username.toLowerCase() === normalized && u.password === password
    );

    if (matchedSystemUser) {
      setIsAuthenticated(true);
      setUserRole(matchedSystemUser.role as 'admin' | 'supplier');
      
      let supId = '';
      if (matchedSystemUser.role === 'supplier') {
        let suppliers = await getSuppliers();
        let userSupplier = suppliers.find(s => s.name.toLowerCase() === normalized);
        if (!userSupplier) {
          userSupplier = (await addSupplier(matchedSystemUser.username, matchedSystemUser.password)) || undefined;
        }
        if (userSupplier) {
          supId = userSupplier.id;
          setCurrentSupplierId(supId);
        }
      }
      
      localStorage.setItem('chicken_session', JSON.stringify({ 
        role: matchedSystemUser.role,
        supplierId: supId
      }));

      setError('');
      return;
    }

    // Check dynamic suppliers
    const suppliers = await getSuppliers();
    const matchedSupplier = suppliers.find(s => 
      s.name.toLowerCase() === normalized && 
      (s.password === password || (!s.password && password === ''))
    );

    if (matchedSupplier) {
      setIsAuthenticated(true);
      setUserRole('supplier');
      setCurrentSupplierId(matchedSupplier.id);
      
      localStorage.setItem('chicken_session', JSON.stringify({ 
        role: 'supplier',
        supplierId: matchedSupplier.id
      }));

      setError('');
    } else {
      setError('Invalid ID or password');
    }
  };

  const handleLogout = async () => {
    if (supabaseUser && supabase) {
      await supabase.auth.signOut();
    }
    localStorage.removeItem('chicken_session');
    setIsAuthenticated(false);
    setUserRole(null);
    setUsername('');
    setPassword('');
    setError('');
  };

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-slate-500 font-mono tracking-widest uppercase">Initializing System...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center mb-6 mx-auto">
            <Lock size={24} />
          </div>
          <h1 className="text-2xl font-black text-center text-slate-800 mb-2">Connect to Portal</h1>
          <p className="text-center text-slate-500 text-sm mb-8">Enter your credentials to manage purchases</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="userId" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">User ID</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  id="userId"
                  type="text" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 outline-none transition-all font-medium text-sm"
                  placeholder={useSupabaseLogin ? 'Enter your email' : 'Enter your ID'}
                  required
                />
              </div>
            </div>
            <div>
              <label htmlFor="password" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  id="password"
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 outline-none transition-all font-medium text-sm"
                  placeholder="Enter password"
                  required
                />
              </div>
            </div>
            
            {error && (
              <p className="text-red-500 text-xs font-bold text-center">{error}</p>
            )}
            
            <button 
              type="submit" 
              className="w-full py-3 mt-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors"
            >
              {useSupabaseLogin ? (supabaseAuthMode === 'signup' ? 'Create Supabase account' : 'Sign in with Supabase') : 'Connect'}
            </button>
          </form>

          <div className="mt-4 text-center space-y-2">
            <button
              type="button"
              onClick={() => {
                if (!isSupabaseConfigured) {
                  setError('Supabase is not configured for this deployment. Please use local login instead.');
                  return;
                }
                setUseSupabaseLogin(prev => !prev);
              }}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold transition-colors"
            >
              {useSupabaseLogin ? 'Use local login instead' : isSupabaseConfigured ? 'Use Supabase email login' : 'Supabase login unavailable'}
            </button>
            {!isSupabaseConfigured && (
              <p className="text-[10px] text-amber-600 font-medium">
                Supabase is not configured on this deployment. Local login will still work.
              </p>
            )}
            {useSupabaseLogin && (
              <button
                type="button"
                onClick={() => setSupabaseAuthMode(prev => prev === 'login' ? 'signup' : 'login')}
                className="block w-full text-xs text-slate-500 hover:text-slate-700 font-medium transition-colors"
              >
                {supabaseAuthMode === 'login' ? 'Create a new Supabase account' : 'Already have an account? Sign in'}
              </button>
            )}
          </div>

          <div className="mt-8">
            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-100"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-widest font-bold">
                <span className="bg-white px-4 text-slate-400">Or use Cloud</span>
              </div>
            </div>

            <button 
              onClick={handleGoogleLogin}
              className="w-full py-3 bg-white border-2 border-slate-100 hover:border-indigo-100 hover:bg-slate-50 text-slate-700 rounded-xl font-bold transition-all flex items-center justify-center gap-2 group"
            >
              <Chrome size={20} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
              Sign in with Google
            </button>
            <p className="mt-4 text-[10px] text-center text-slate-400 font-medium">
              By signing in with Google, your data will be synced to Cloud SQL for permanent storage.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="antialiased font-sans text-slate-900 selection:bg-emerald-500 selection:text-white relative">
      {isSyncing && (
        <div className="fixed top-4 right-4 z-50 bg-white/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-emerald-100 shadow-sm flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Cloud Syncing...</span>
        </div>
      )}
      <div className="fixed bottom-4 left-4 z-50">
        <SupabaseStatus />
      </div>
      <SupplierLedger viewMode={userRole || 'admin'} onLogout={handleLogout} />
    </div>
  );
}
