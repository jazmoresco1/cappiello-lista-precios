import { createClient } from "@supabase/supabase-js";

// Estas dos claves son SEGURAS para estar en el codigo del navegador:
// la Publishable key esta pensada para usarse en el frontend.
// La Secret key de Supabase NUNCA va aca ni en ningun archivo del repo:
// esa solo se usa del lado de n8n.
const SUPABASE_URL = "https://bglzhyijwggrxnxgorgq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_27-tIlezwk1DzWe3DRXVLQ_pu2tIs5Z";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
