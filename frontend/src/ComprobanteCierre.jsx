import React from 'react';
import { configNegocio } from './configNegocio';

const formatoMoneda = (valor) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor);

/**
 * Comprobante de cierre de caja para impresora térmica 80mm.
 * Muestra el resumen del turno y cuánto debe entregar el cajero.
 */
const ComprobanteCierre = ({ datos }) => {
  if (!datos) return null;

  const {
    ventas = 0,
    base = 0,
    total = 0,
    desde = '',
    efectivo = 0,
    nequi = 0,
    bancolombia = 0,
    davivienda = 0,
    cajeroNombre = '',
    fecha = new Date()
  } = datos;

  const { nombreNegocio, direccion, nombreDueno, nit } = configNegocio;

  const fechaStr = new Date(fecha).toLocaleString('es-CO', {
    dateStyle: 'short',
    timeStyle: 'medium'
  });

  return (
    <div
      className="comprobante-termico"
      style={{
        width: '72mm',
        maxWidth: '302px',
        padding: '8px',
        fontFamily: 'monospace, \"Courier New\", monospace',
        fontSize: '12px',
        lineHeight: 1.4,
        color: '#000',
        backgroundColor: '#fff'
      }}
    >
      <style>{`
        @media print {
          .comprobante-termico { width: 72mm !important; max-width: 72mm !important; }
          body * { visibility: hidden; }
          .comprobante-termico, .comprobante-termico * { visibility: visible; }
          .comprobante-termico { position: absolute; left: 0; top: 0; }
        }
      `}</style>

      <div style={{ textAlign: 'center', marginBottom: '8px', borderBottom: '1px dashed #000', paddingBottom: '6px' }}>
        <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{nombreNegocio}</div>
        {direccion && <div style={{ fontSize: '10px', marginTop: '2px' }}>{direccion}</div>}
        <div style={{ fontSize: '11px', fontWeight: 'bold', marginTop: '2px' }}>CIERRE DE CAJA</div>
      </div>

      <div style={{ marginBottom: '6px', fontSize: '10px', borderBottom: '1px dashed #ccc', paddingBottom: '6px' }}>
        <div>Fecha cierre: {fechaStr}</div>
        {cajeroNombre && <div>Cajero: {cajeroNombre}</div>}
        {desde && <div>Turno desde: {desde}</div>}
        {nombreDueno && <div>Admin: {nombreDueno}</div>}
        {nit && <div>NIT: {nit}</div>}
      </div>

      <div style={{ marginBottom: '6px', fontSize: '10px', borderBottom: '1px dashed #000', paddingBottom: '6px' }}>
        <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>Ventas del día</div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Total Ventas:</span>
          <span style={{ fontWeight: 'bold' }}>{formatoMoneda(ventas)}</span>
        </div>
        <div style={{ marginTop: '4px', fontSize: '9px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>- Efectivo:</span>
            <span>{formatoMoneda(efectivo)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>- Nequi:</span>
            <span>{formatoMoneda(nequi)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>- Bancolombia:</span>
            <span>{formatoMoneda(bancolombia)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>- Davivienda:</span>
            <span>{formatoMoneda(davivienda)}</span>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '6px', fontSize: '10px', borderBottom: '1px dashed #000', paddingBottom: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Base Inicial:</span>
          <span style={{ fontWeight: 'bold' }}>{formatoMoneda(base)}</span>
        </div>
      </div>

      <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '12px' }}>
        <span>ENTREGAR:</span>
        <span>{formatoMoneda(total)}</span>
      </div>

      <div style={{ textAlign: 'center', fontSize: '9px', borderTop: '1px dashed #000', paddingTop: '6px' }}>
        <div>Este comprobante es solo para control interno.</div>
      </div>
    </div>
  );
};

export default ComprobanteCierre;

