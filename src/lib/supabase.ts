// Cliente de Supabase para partidas online entre dispositivos.
// Las credenciales se toman de las variables de entorno VITE_SUPABASE_URL
// y VITE_SUPABASE_ANON_KEY (.env). Si no están configuradas, la app sigue
// funcionando en modo local (hot-seat) y el modo online muestra un aviso.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

// La clave pública (anon/publishable) es la única segura para embeber en la
// app. Si alguien pega por error una clave secreta, la rechazamos y avisamos.
const isSecretKey = /^(sb_secret_|eyJ.+service_role)/i.test(rawKey ?? "");

export const supabaseKeyError = isSecretKey
  ? "VITE_SUPABASE_ANON_KEY tiene una clave SECRETA (sb_secret_/service_role). Usá la clave publishable/anon y rotá la secreta en Supabase."
  : null;

export const isSupabaseConfigured = Boolean(url && rawKey && !isSecretKey);

let client: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient => {
  if (!isSupabaseConfigured || !url || !rawKey) throw new Error("Supabase no está configurado");
  client ??= createClient(url, rawKey);
  return client;
};
