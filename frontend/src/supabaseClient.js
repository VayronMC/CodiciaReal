import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const faltanVars = !supabaseUrl || !supabaseKey;

export const configError = faltanVars
  ? 'Faltan las variables de entorno. Asegúrate de tener un archivo .env en la carpeta frontend/ con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. Luego reinicia el servidor (npm run dev).'
  : null;

export const supabase = faltanVars
  ? null
  : createClient(supabaseUrl, supabaseKey, {
      auth: {
        storage: window.sessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });