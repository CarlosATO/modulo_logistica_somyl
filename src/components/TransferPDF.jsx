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
  colCode: { width: '20%' },
  colDesc: { width: '55%' },
  colQty: { width: '25%', textAlign: 'center' },
  signSection: { marginTop: 60, flexDirection: 'row', justifyContent: 'space-between' },
  signBox: { borderTop: 1, width: '30%', paddingTop: 5, textAlign: 'center', fontSize: 8 }
});

const TransferPDF = ({ data }) => (
  <Document>
    <Page size="LETTER" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>Comprobante de Traspaso #{data.transfer_number}</Text>
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
      </View>

      {data.items.map((item, i) => (
        <View key={i} style={styles.tableRow}>
            <Text style={styles.colCode}>{item.code}</Text>
            <Text style={styles.colDesc}>{item.name}</Text>
            <Text style={styles.colQty}>{item.transferQty} UN</Text>
        </View>
      ))}

      <View style={styles.signSection}>
          <View style={styles.signBox}><Text>Entregado Por</Text></View>
          <View style={styles.signBox}><Text>Autorizado Por (Firma)</Text></View>
          <View style={styles.signBox}><Text>Recibido Conforme</Text></View>
      </View>
    </Page>
  </Document>
);

export default TransferPDF;