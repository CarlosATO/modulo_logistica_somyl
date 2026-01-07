import { createClient } from '@supabase/supabase-js';

// Cliente específico para la Base de Datos de Órdenes de Compra
const procurementUrl = import.meta.env.VITE_PROCUREMENT_URL;
const procurementKey = import.meta.env.VITE_PROCUREMENT_KEY;

if (!procurementUrl || !procurementKey) {
  console.error('🚨 Faltan credenciales de Órdenes de Compra en .env');
}

export const supabaseProcurement = createClient(procurementUrl, procurementKey);

// --- AGREGADO: Obtener proveedores desde la DB de Procurement ---
// --- FUNCIÓN ACTUALIZADA ---
export const getProveedores = async (soloSubcontratos = false) => {
  // Usamos 'supabaseProcurement' porque los proveedores están en la OTRA base de datos
  let query = supabaseProcurement
    .from('proveedores')
    .select('id, nombre, rut');

  // CORRECCIÓN: Filtramos usando la columna "subcontrato" con valor 1
  if (soloSubcontratos) {
    query = query.eq('subcontrato', 1);
  }

  const { data, error } = await query.order('nombre');
  
  if (error) {
    console.error("Error obteniendo proveedores:", error);
    return [];
  }
  return data;
};