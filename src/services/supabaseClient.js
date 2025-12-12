import { createClient } from '@supabase/supabase-js'

// 1. Leemos las variables EXACTAS de tu archivo .env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY // <--- AQUÍ ESTABA EL ERROR

// 2. Verificación de seguridad en consola
if (!supabaseUrl || !supabaseKey) {
  console.error('🚨 ERROR: No se encuentran las variables en el .env');
  console.error('Verifica que el archivo .env esté en la raíz de "modulo_logistica"');
} else {
  console.log('✅ Supabase conectado correctamente');
}

export const supabase = createClient(supabaseUrl, supabaseKey)