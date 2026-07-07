import { createClient } from '@supabase/supabase-js';

const getEnvValue = (...keys: string[]) => {
  const sources = [
    typeof process !== 'undefined' ? process.env : undefined,
    typeof import.meta !== 'undefined' ? import.meta.env : undefined,
  ];

  for (const source of sources) {
    for (const key of keys) {
      const value = source?.[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
  }

  return '';
};

const rawUrl = getEnvValue('VITE_SUPABASE_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');

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

const supabaseAnonKey = getEnvValue('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');

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
