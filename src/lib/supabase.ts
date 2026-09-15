import { createClient } from '@supabase/supabase-js';
// Cloud access is intentionally disabled in the public portfolio edition.
export const isSupabaseConfigured = false;
export const supabase = createClient('https://demo.invalid', 'demo-placeholder-not-a-credential');
