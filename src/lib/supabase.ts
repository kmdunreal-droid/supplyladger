import { createClient } from '@supabase/supabase-js';

const rawUrl = (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) 
  ? process.env.VITE_SUPABASE_URL 
  : (import.meta.env?.VITE_SUPABASE_URL || '');

// Sanitize URL by removing `/rest/v1/` or `/rest/v1` if present
const sanitizeUrl = (url: string) => {
  let cleaned = url.trim();
  if (cleaned.endsWith('/rest/v1/')) {
    cleaned = cleaned.slice(0, -9);
  } else if (cleaned.endsWith('/rest/v1')) {
    cleaned = cleaned.slice(0, -8);
  }
  if (cleaned.endsWith('/')) {
    cleaned = cleaned.slice(0, -1);
  }
  return cleaned;
};

const supabaseUrl = sanitizeUrl(rawUrl);

const supabaseAnonKey = (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_ANON_KEY) 
  ? process.env.VITE_SUPABASE_ANON_KEY 
  : (import.meta.env?.VITE_SUPABASE_ANON_KEY || '').trim();

const isValidUrl = (url: string) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export const supabase = (supabaseUrl && isValidUrl(supabaseUrl) && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;
