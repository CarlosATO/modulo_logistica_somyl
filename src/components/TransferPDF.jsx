import React from 'react';
import { Page, Text, View, Document, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica' },
  header: { marginBottom: 20, borderBottom: 1, paddingBottom: 10, borderColor: '#ccc' },
  title: { fontSize: 16, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 4 },
  row: { flexDirection: 'row', marginBottom: 4 },
  label: { width: 120, fontWeight: 'bold', color: '#555' },
  value: { flex: 1 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f0f0f0', padding: 5, marginTop: 15, fontWeight: 'bold', fontSize: 8 },
  tableRow: { flexDirection: 'row', padding: 5, borderBottom: 1, borderColor: '#eee', fontSize: 9 },
  colCode: { width: '15%' },
  colDesc: { width: '45%' },
  colQty: { width: '12%', textAlign: 'center' },
  colUnit: { width: '14%', textAlign: 'right' },
  colSubtotal: { width: '14%', textAlign: 'right' },
  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  totalLabel: { fontWeight: 'bold', marginRight: 10 },
  signSection: { marginTop: 60, flexDirection: 'row', justifyContent: 'space-between' },
  signBox: { borderTop: 1, width: '30%', paddingTop: 5, textAlign: 'center', fontSize: 8 }
});

const formatCurrency = (value, currency) => {
  try {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: currency || 'CLP', maximumFractionDigits: 0 }).format(value);
  } catch (e) {
    return `${value}`;
  }
}

const TransferPDF = ({ data }) => {
  const items = data.items || [];
  const currency = data.currency || 'CLP';
  const total = items.reduce((s, it) => {
    const unit = Number(it.unit_price || it.unitPrice || it.price || 0);
    const qty = Number(it.transferQty || it.qty || 0);
    return s + (unit * qty);
  }, 0);

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Comprobante de Traspaso #{data.transfer_number || 'BORRADOR'}</Text>
          <Text style={{fontSize: 9, color: '#888'}}>Emitido: {new Date().toLocaleString()}</Text>
        </View>

        <View>
          <View style={styles.row}><Text style={styles.label}>Bodega Origen:</Text><Text style={styles.value}>{data.origin_wh_name}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Bodega Destino:</Text><Text style={styles.value}>{data.dest_wh_name}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Proyecto Origen:</Text><Text style={styles.value}>{data.origin_project}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Proyecto Destino:</Text><Text style={styles.value}>{data.dest_project}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Autorizado por:</Text><Text style={styles.value}>{data.authorized_by}</Text></View>
        </View>

        <View style={styles.tableHeader}>
          <Text style={styles.colCode}>Código</Text>
          <Text style={styles.colDesc}>Producto</Text>
          <Text style={styles.colQty}>Cantidad</Text>
          <Text style={styles.colUnit}>Precio Unit.</Text>
          <Text style={styles.colSubtotal}>Subtotal</Text>
        </View>

        {items.map((item, i) => {
          const unit = Number(item.unit_price || item.unitPrice || item.price || 0);
          const qty = Number(item.transferQty || item.qty || 0);
          const subtotal = unit * qty;
          return (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.colCode}>{item.code}</Text>
              <Text style={styles.colDesc}>{item.name}</Text>
              <Text style={styles.colQty}>{qty} UN</Text>
              <Text style={styles.colUnit}>{formatCurrency(unit, currency)}</Text>
              <Text style={styles.colSubtotal}>{formatCurrency(subtotal, currency)}</Text>
            </View>
          )
        })}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total:</Text>
          <Text>{formatCurrency(total, currency)}</Text>
        </View>

        <View style={styles.signSection}>
            <View style={styles.signBox}><Text>Entregado Por</Text></View>
            <View style={styles.signBox}><Text>Autorizado Por (Firma)</Text></View>
            <View style={styles.signBox}><Text>Recibido Conforme</Text></View>
        </View>
      </Page>
    </Document>
  );
}

export default TransferPDF;