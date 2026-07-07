import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function SupabaseStatus() {
  const [status, setStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [error, setError] = useState<string | null>(null);
  const [totalAmount, setTotalAmount] = useState<number | null>(null);
  const [counts, setCounts] = useState<{ supplierCount: number; transactionCount: number } | null>(null);

  useEffect(() => {
    const checkConnection = async () => {
      if (!supabase) {
        setStatus('error');
        setError('Supabase client not initialized (missing environment variables)');
        return;
      }
      
      try {
        // Simple query for connection check
        const { error: authError, data: { session } } = await supabase.auth.getSession();
        if (authError) throw authError;

        setStatus('connected');
        
        // Fetch Total Amount and Counts
        if (session) {
          const [amountRes, countsRes] = await Promise.all([
            fetch('/api/total-amount', { headers: { 'Authorization': `Bearer ${session.access_token}` } }),
            fetch('/api/debug-counts', { headers: { 'Authorization': `Bearer ${session.access_token}` } })
          ]);
          
          const amountData = await amountRes.json();
          const countsData = await countsRes.json();

          if (amountData.totalAmount !== undefined) {
            setTotalAmount(amountData.totalAmount);
          }
          if (countsData.supplierCount !== undefined) {
            setCounts(countsData);
          }
        }
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
      {counts && (
        <div className="text-[10px] text-slate-500">
          Suppliers: {counts.supplierCount} | Transactions: {counts.transactionCount}
        </div>
      )}
      {totalAmount !== null && (
        <div className="text-[10px] font-medium text-slate-600">
          Total Raqam (Backend Test): <span className="font-bold text-slate-800">Rs. {totalAmount.toLocaleString()}</span>
        </div>
      )}
      {error && <p className="text-[9px] text-red-500 mt-0.5">{error}</p>}
    </div>
  );
}
