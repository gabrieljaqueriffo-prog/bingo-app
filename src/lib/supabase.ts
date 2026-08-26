// Cliente de Supabase para partidas online entre dispositivos.
// Las credenciales se toman de las variables de entorno VITE_SUPABASE_URL
// y VITE_SUPABASE_ANON_KEY (.env). Si no están configuradas, la app sigue
// funcionando en modo local (hot-seat) y el modo online muestra un aviso.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient => {
  if (!isSupabaseConfigured) throw new Error("Supabase no está configurado");
  client ??= createClient(url!, anonKey!);
  return client;
};
