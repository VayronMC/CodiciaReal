import React from 'react';
import { configNegocio } from './configNegocio';

const formatoMoneda = (valor) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor);

/**
 * Comprobante de venta optimizado para impresora térmica 80mm (DIG-E200I).
 * Usar con react-to-print. Ancho ~72mm (302px aprox).
 */
const ComprobanteVenta = ({ datos }) => {
  if (!datos) return null;

  const { items = [], total = 0, pagoCon = 0, cambio = 0, numeroVenta = '', metodoPago = 'efectivo', esReimpresion = false, fecha = new Date() } = datos;
  const { nombreNegocio, direccion, nombreDueno, nit, redesSociales } = configNegocio;
  const fechaStr = new Date(fecha).toLocaleString('es-CO', {
    dateStyle: 'short',
    timeStyle: 'medium'
  });
  const redesTexto = Array.isArray(redesSociales) && redesSociales.length > 0
    ? redesSociales.join(' · ')
    : '';

  return (
    <div
      className="comprobante-termico"
      style={{
        width: '72mm',
        maxWidth: '302px',
        padding: '8px',
        fontFamily: 'monospace, "Courier New", monospace',
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
          .comprobante-termico * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .comprobante-termico .texto-impresion { font-weight: 600; color: #000 !important; }
        }
      `}</style>

      <div style={{ textAlign: 'center', marginBottom: '8px', borderBottom: '1px dashed #000', paddingBottom: '6px' }}>
        <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{nombreNegocio}</div>
        {direccion && <div style={{ fontSize: '10px', marginTop: '2px' }}>{direccion}</div>}
        <div style={{ fontSize: '11px', fontWeight: 'bold', marginTop: '2px' }}>COMPROBANTE DE COMPRA</div>
      </div>

      {(nombreDueno || nit) && (
        <div style={{ marginBottom: '6px', fontSize: '10px', borderBottom: '1px dashed #ccc', paddingBottom: '6px' }}>
          {nombreDueno && <div>{nombreDueno}</div>}
          {nit && <div>NIT: {nit}</div>}
        </div>
      )}

      <div style={{ marginBottom: '6px', fontSize: '10px' }}>
        <div>Fecha: {fechaStr}</div>
        {numeroVenta != null && numeroVenta !== '' && <div>Venta #{numeroVenta}</div>}
      </div>

      <div style={{ borderBottom: '1px dashed #000', paddingBottom: '6px', marginBottom: '6px' }}>
        <div className="texto-impresion" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', fontSize: '10px', marginBottom: '4px', fontWeight: 'bold', color: '#000' }}>
          <span>Artículo</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span style={{ width: '24px', textAlign: 'center' }}>Cant</span>
            <span style={{ width: '48px', textAlign: 'right' }}>P.Unit</span>
            <span style={{ width: '52px', textAlign: 'right' }}>Subtotal</span>
          </div>
        </div>
        {items.map((item) => {
          const esComboHeader = item.esComboHeader;
          const esComboDetalle = item.esComboDetalle;
          const subtotalMostrar = item.subtotal != null ? item.subtotal : (item.precio * item.cantidad);
          const cantMostrar = item.cantidad === '-' || item.cantidad === '' ? '-' : item.cantidad;
          const precioMostrar = item.precio === '-' || item.precio === '' ? '-' : (esComboDetalle ? 0 : item.precio);
          return (
            <div key={item.id} style={{ marginBottom: esComboDetalle ? '2px' : '6px' }}>
              <div className="texto-impresion" style={{ fontSize: esComboDetalle ? '10px' : '11px', wordBreak: 'break-word', lineHeight: 1.3, marginBottom: '1px', fontWeight: esComboDetalle ? 'bold' : undefined, paddingLeft: esComboDetalle ? '8px' : 0 }}>
                {item.nombre}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', fontSize: '11px', alignItems: 'baseline' }}>
                <span style={{ width: '24px', textAlign: 'center' }}>{cantMostrar}</span>
                <span style={{ width: '48px', textAlign: 'right' }}>{typeof precioMostrar === 'number' ? formatoMoneda(precioMostrar) : precioMostrar}</span>
                <span style={{ width: '52px', textAlign: 'right', fontWeight: 'bold' }}>
                  {formatoMoneda(subtotalMostrar)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {(() => {
        const totalArticulos = items.reduce((s, i) => s + (i.cantidadArticulos ?? i.cantidad ?? 0), 0);
        return (
          <div className="texto-impresion" style={{ marginBottom: '4px', display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 'bold' }}>
            <span>Artículos totales:</span>
            <span>{totalArticulos}</span>
          </div>
        );
      })()}
      <div style={{ marginBottom: '4px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
        <span>TOTAL:</span>
        <span>{formatoMoneda(total)}</span>
      </div>
      <div style={{ marginBottom: '2px', display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
        <span>Método de pago:</span>
        <span style={{ fontWeight: 'bold', textTransform: 'capitalize' }}>{metodoPago}</span>
      </div>
      {!esReimpresion && (
        <>
          <div style={{ marginBottom: '2px', display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
            <span>Recibido:</span>
            <span>{formatoMoneda(pagoCon)}</span>
          </div>
          <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
            <span>Cambio:</span>
            <span>{formatoMoneda(cambio)}</span>
          </div>
        </>
      )}
      {esReimpresion && (
        <div style={{ marginBottom: '8px', fontSize: '10px', textAlign: 'center', fontStyle: 'italic' }}>--- REIMPRESIÓN ---</div>
      )}

      <div style={{ textAlign: 'center', fontSize: '10px', borderTop: '1px dashed #000', paddingTop: '8px' }}>
        <div style={{ marginBottom: '4px', fontWeight: 'bold' }}>No responsable de IVA</div>
        <div style={{ marginBottom: '4px' }}>¡Gracias por su compra!</div>
        {redesTexto && (
          <div style={{ marginTop: '6px', fontSize: '9px' }}>
            Síguenos en redes como: {redesTexto}
          </div>
        )}
      </div>
    </div>
  );
};

export default ComprobanteVenta;
