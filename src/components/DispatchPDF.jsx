import React from 'react';
import { Page, Text, View, Document, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica' },
  header: { marginBottom: 20, borderBottom: 1, paddingBottom: 10, borderColor: '#ccc' },
  title: { fontSize: 16, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 4 },
  row: { flexDirection: 'row', marginBottom: 4 },
  label: { width: 100, fontWeight: 'bold', color: '#555' },
  value: { flex: 1 },
  
  // Estilos de Tabla Ajustados para 5 Columnas
  tableHeader: { flexDirection: 'row', backgroundColor: '#f0f0f0', padding: 4, marginTop: 10, fontWeight: 'bold', fontSize: 8 },
  tableRow: { flexDirection: 'row', padding: 4, borderBottom: 1, borderColor: '#eee', fontSize: 9 },
  
  // Anchos de columna
  colProd: { width: '35%' },
  colLoc: { width: '25%' },
  colQty: { width: '10%', textAlign: 'center' },
  colUnit: { width: '15%', textAlign: 'right' }, // Nueva columna
  colTotal: { width: '15%', textAlign: 'right' },

  footer: { position: 'absolute', bottom: 40, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between' },
  signBox: { borderTop: 1, width: '40%', paddingTop: 5, textAlign: 'center', fontSize: 8 }
});

const currency = (amt) => `$ ${Number(amt).toLocaleString('es-CL')}`;

const DispatchPDF = ({ data }) => (
  <Document>
    <Page size="LETTER" style={styles.page}>
      
      {/* ENCABEZADO */}
      <View style={styles.header}>
        <Text style={styles.title}>Vale de Entrega #{data.document_number}</Text>
        <Text style={{fontSize: 9, color: '#888'}}>Fecha: {data.dispatch_date}</Text>
      </View>

      {/* DATOS GENERALES */}
      <View>
        <View style={styles.row}><Text style={styles.label}>Solicitante:</Text><Text style={styles.value}>{data.receiver_name} (RUT: {data.receiver_rut})</Text></View>
        <View style={styles.row}><Text style={styles.label}>Proyecto:</Text><Text style={styles.value}>{data.project_name}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Zona Destino:</Text><Text style={styles.value}>{data.destination_zone}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Bodega Origen:</Text><Text style={styles.value}>{data.warehouse_name}</Text></View>
      </View>

      {/* TABLA DE ÍTEMS */}
      <View style={styles.tableHeader}>
        <Text style={styles.colProd}>Producto</Text>
        <Text style={styles.colLoc}>Ubicación Origen</Text>
        <Text style={styles.colQty}>Cant.</Text>
        <Text style={styles.colUnit}>P. Unitario</Text> {/* Título Nuevo */}
        <Text style={styles.colTotal}>Total</Text>
      </View>

      {data.items.map((item, i) => (
        <View key={i} style={styles.tableRow}>
            <Text style={styles.colProd}>{item.product_name}</Text>
            <Text style={styles.colLoc}>{item.location_name}</Text>
            <Text style={styles.colQty}>{item.quantity}</Text>
            <Text style={styles.colUnit}>{currency(item.unit_cost)}</Text> {/* Dato Nuevo */}
            <Text style={styles.colTotal}>{currency(item.total)}</Text>
        </View>
      ))}

      {/* TOTAL FINAL */}
      <View style={{ marginTop: 10, flexDirection: 'row', justifyContent: 'flex-end', borderTop: 1, borderColor: '#000', paddingTop: 5 }}>
          <Text style={{ fontWeight: 'bold', fontSize: 11 }}>Costo Total Operación: {currency(data.total_cost)}</Text>
      </View>

      {/* FIRMAS */}
      <View style={styles.footer}>
          <View style={styles.signBox}><Text>Entregado Por (Bodega)</Text></View>
          <View style={styles.signBox}><Text>Recibido Conforme ({data.receiver_name})</Text></View>
      </View>
    </Page>
  </Document>
);

export default DispatchPDF;