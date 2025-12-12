import { createClient } from '@supabase/supabase-js';

// Cliente específico para la Base de Datos de Órdenes de Compra
const procurementUrl = import.meta.env.VITE_PROCUREMENT_URL;
const procurementKey = import.meta.env.VITE_PROCUREMENT_KEY;

if (!procurementUrl || !procurementKey) {
  console.error('🚨 Faltan credenciales de Órdenes de Compra en .env');
}

export const supabaseProcurement = createClient(procurementUrl, procurementKey);