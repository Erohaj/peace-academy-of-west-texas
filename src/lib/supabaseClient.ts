/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

// Read Supabase environment variables if available
const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://placeholder-pawtx.supabase.co';
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const isSupabaseConfigured = () => {
  return Boolean((import.meta as any).env?.VITE_SUPABASE_URL && (import.meta as any).env?.VITE_SUPABASE_ANON_KEY);
};

