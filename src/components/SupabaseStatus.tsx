import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function SupabaseStatus() {
  const [status, setStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkConnection = async () => {
      if (!supabase) {
        setStatus('error');
        setError('Supabase client not initialized (missing environment variables)');
        return;
      }
      
      try {
        const { error: authError } = await supabase.auth.getSession();
        if (authError) throw authError;
        setStatus('connected');
      } catch (err: any) {
        setStatus('error');
        setError(err.message || 'Failed to connect to Supabase');
      }
    };
    checkConnection();
  }, []);

  if (status === 'checking') return null;

  return (
    <div className="flex flex-col gap-2 mt-4 p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
      <div className="flex items-center gap-2">
        <div className={`w-2.5 h-2.5 rounded-full ${status === 'connected' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-800">
          {status === 'connected' ? 'Supabase Connected' : 'Supabase Error'}
        </span>
      </div>
      {error && <p className="text-[9px] text-red-500 mt-0.5">{error}</p>}
    </div>
  );
}
