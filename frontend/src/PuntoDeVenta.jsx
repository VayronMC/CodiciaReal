import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useReactToPrint } from 'react-to-print';
import { supabase } from './supabaseClient';
import { ShoppingCart, Trash2, Search, Clock, DollarSign, CheckCircle, Package, Calculator, X, Plus, Minus, Tag } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import ComprobanteVenta from './ComprobanteVenta';
import ComprobanteCierre from './ComprobanteCierre';
import { generarLineasVenta } from './utilsVentas';

// --- UTILIDADES ---
const formatoMoneda = (valor) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor);

const InputMoneda = ({ value, onChange, placeholder, autoFocus }) => {
  const handleChange = (e) => {
    const rawValue = e.target.value.replace(/\D/g, '');
    onChange(rawValue ? parseInt(rawValue, 10).toLocaleString('es-CO') : '');
  };
  return (
    <div className="relative w-full">
      <span className="absolute left-3 top-3 text-gray-400 font-bold">$</span>
      <input type="text" value={value} onChange={handleChange} placeholder={placeholder || "0"} autoFocus={autoFocus} className="w-full border p-3 pl-8 rounded-lg font-bold text-lg outline-none focus:ring-2 focus:ring-blue-500"/>
    </div>
  );
};

const PuntoDeVenta = ({ session }) => {
  const [productos, setProductos] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  
  const inputRef = useRef(null);
  const comprobanteRef = useRef(null);
  const comprobanteCierreRef = useRef(null);
  const [modalCierre, setModalCierre] = useState(false);
  const [modalPago, setModalPago] = useState(false);
  const [datosParaImprimir, setDatosParaImprimir] = useState(null);

  const [resumenCierre, setResumenCierre] = useState({ ventas: 0, base: 0, total: 0, desde: '', efectivo: 0, nequi: 0, bancolombia: 0, davivienda: 0 });
  const [pagoCon, setPagoCon] = useState('');
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [ultimoCambio, setUltimoCambio] = useState(null);
  const [datosCierreImprimir, setDatosCierreImprimir] = useState(null);
  const [nombreCajero, setNombreCajero] = useState(session.user.email);

  const handlePrint = useReactToPrint({
    contentRef: comprobanteRef,
    documentTitle: `Comprobante_${new Date().toISOString().slice(0, 10)}`,
    pageStyle: '@page { size: 80mm auto; margin: 4mm; }'
  });

  const handlePrintCierre = useReactToPrint({
    contentRef: comprobanteCierreRef,
    documentTitle: `Cierre_${new Date().toISOString().slice(0, 10)}`,
    pageStyle: '@page { size: 80mm auto; margin: 4mm; }'
  });
  const [combos, setCombos] = useState([]);

  useEffect(() => { 
    cargarProductos();
    cargarCombos();
    if(inputRef.current) inputRef.current.focus();
    // Obtener nombre del cajero desde perfiles
    const cargarNombreCajero = async () => {
      try {
        const { data, error } = await supabase
          .from('perfiles')
          .select('nombre_completo')
          .eq('id', session.user.id)
          .single();
        if (!error && data?.nombre_completo) {
          setNombreCajero(data.nombre_completo);
        }
      } catch (err) {
        console.error('Error obteniendo nombre del cajero:', err);
      }
    };
    cargarNombreCajero();
  }, []);

  const cargarCombos = async () => {
    try {
      const { data, error } = await supabase
        .from('combos')
        .select('*, combo_productos(producto_id, cantidad, productos(nombre))')
        .eq('activo', true);
      if (error) throw error;
      setCombos(data || []);
    } catch (err) {
      console.error("Error en cargarCombos:", err);
    }
  };

  const cargarProductos = async () => {
    try {
      const { data, error } = await supabase.from('productos').select('*').eq('activo', true).gt('stock', 0);
      if (error) throw error;
      if (data) setProductos(data);
    } catch (err) {
      console.error("Error en cargarProductos:", err);
      toast.error("No se pudieron cargar los productos");
    }
  };

  // --- LÓGICA DEL CARRITO (CON VALIDACIÓN DE STOCK 🔒) ---
  const agregarAlCarrito = (p) => {
    const existe = carrito.find(item => item.id === p.id);
    
    // VALIDACIÓN DE STOCK
    const cantidadActualEnCarrito = existe ? existe.cantidad : 0;
    if (cantidadActualEnCarrito + 1 > p.stock) {
        toast.error(`🚫 Solo hay ${p.stock} unidades de ${p.nombre}`, {
            style: { border: '1px solid #EF4444', color: '#B91C1C' },
            iconTheme: { primary: '#EF4444', secondary: '#FFFAEE' },
        });
        return; // Detenemos la función aquí
    }

    if (existe) {
      modificarCantidad(p.id, 1);
    } else {
      setCarrito([...carrito, { ...p, cantidad: 1 }]);
    }
  };

  const modificarCantidad = (id, delta) => {
    setCarrito(curr => curr.map(item => {
        if (item.id === id) {
            const nuevaCant = item.cantidad + delta;
            
            // VALIDACIÓN AL SUBIR CANTIDAD CON EL BOTÓN +
            if (delta > 0 && nuevaCant > item.stock) {
                toast.error(`Stock máximo alcanzado (${item.stock})`);
                return item; // No cambiamos nada
            }

            return nuevaCant > 0 ? { ...item, cantidad: nuevaCant } : item;
        }
        return item;
    }));
  };

  const eliminarDelCarrito = (id) => {
    setCarrito(carrito.filter(item => item.id !== id));
  };

  const manejarInput = (e) => {
    const valor = e.target.value;
    setBusqueda(valor);
    const productoExacto = productos.find(p => p.codigo_barras === valor);
    if (productoExacto) {
      agregarAlCarrito(productoExacto);
      setBusqueda('');
      // Toast solo si se agregó (la validación está dentro de agregarAlCarrito)
    }
  };

  const confirmarVenta = async (e) => {
    e.preventDefault();
    const dineroEntregado = metodoPago === 'efectivo' ? (parseInt(pagoCon.replace(/\./g, '')) || 0) : totalCarrito;

    if (metodoPago === 'efectivo' && dineroEntregado < totalCarrito) {
      return toast.error("Dinero insuficiente");
    }

    try {
      const consumoPorProducto = new Map();
      lineasVenta.forEach((l) => {
        if (l.esCombo) {
          l.combo.combo_productos?.forEach((cp) => {
            const qty = (cp.cantidad || 1) * l.cantidad;
            consumoPorProducto.set(cp.producto_id, (consumoPorProducto.get(cp.producto_id) || 0) + qty);
          });
        } else {
          consumoPorProducto.set(l.id, (consumoPorProducto.get(l.id) || 0) + l.cantidad);
        }
      });

      const idsProductos = [...consumoPorProducto.keys()];
      const { data: productosActuales, error: errorStock } = await supabase
        .from('productos')
        .select('id, nombre, stock')
        .in('id', idsProductos);
      if (errorStock) throw errorStock;

      for (const [pid, qtyNecesaria] of consumoPorProducto) {
        const prod = productosActuales?.find((p) => p.id === pid);
        if (!prod || qtyNecesaria > prod.stock) {
          const disponible = prod?.stock ?? 0;
          return toast.error(`No hay stock suficiente de "${prod?.nombre || 'Producto'}". Disponible: ${disponible}`);
        }
      }

      const { data: venta, error: errorVenta } = await supabase.from('ventas').insert([{ cajero_id: session.user.id, total: totalCarrito, metodo_pago: metodoPago }]).select().single();
      if (errorVenta) throw errorVenta;

      const detallesProductos = lineasVenta.filter((l) => !l.esCombo).map((l) => ({
        venta_id: venta.id,
        producto_id: l.id,
        cantidad: l.cantidad,
        precio_unitario: l.precio
      }));
      if (detallesProductos.length > 0) {
        const { error: errDet } = await supabase.from('detalle_ventas').insert(detallesProductos);
        if (errDet) throw errDet;
      }

      const detallesCombos = lineasVenta.filter((l) => l.esCombo).map((l) => ({
        venta_id: venta.id,
        combo_id: l.combo.id,
        cantidad: l.cantidad,
        precio_unitario: l.combo.precio
      }));
      if (detallesCombos.length > 0) {
        const { error: errCombo } = await supabase.from('detalle_venta_combos').insert(detallesCombos);
        if (errCombo) throw errCombo;
      }

      for (const [pid, qty] of consumoPorProducto) {
        const prod = productosActuales.find((p) => p.id === pid);
        const nuevoStock = (prod?.stock ?? 0) - qty;
        await supabase.from('productos').update({ stock: nuevoStock }).eq('id', pid);
      }

      const cambio = dineroEntregado - totalCarrito;
      toast.success(`¡Venta Exitosa!${metodoPago === 'efectivo' ? ` Cambio: ${formatoMoneda(cambio)}` : ''}`, { duration: 4000 });
      setUltimoCambio({ total: totalCarrito, pagoCon: dineroEntregado, cambio, metodoPago });
      const numeroVenta = venta.numero_venta ?? venta.id?.slice(-8);
      const itemsComprobante = [];
      lineasVenta.forEach((l) => {
        if (l.esCombo && l.combo?.combo_productos?.length) {
          const comboSubtotal = l.cantidad * l.precio;
          itemsComprobante.push({
            id: `combo-header-${l.id}`,
            nombre: l.nombre,
            cantidad: '-',
            precio: '-',
            subtotal: comboSubtotal,
            esComboHeader: true,
            cantidadArticulos: 0
          });
          l.combo.combo_productos.forEach((cp, idx) => {
            const nom = cp.productos?.nombre || productos.find((p) => p.id === cp.producto_id)?.nombre || 'Producto';
            const qty = (cp.cantidad || 1) * l.cantidad;
            itemsComprobante.push({
              id: `combo-prod-${cp.producto_id}-${idx}`,
              nombre: `*${nom}`,
              cantidad: qty,
              precio: 0,
              subtotal: 0,
              esComboDetalle: true,
              cantidadArticulos: qty
            });
          });
        } else {
          itemsComprobante.push({
            id: l.id,
            nombre: l.nombre,
            cantidad: l.cantidad,
            precio: l.precio,
            cantidadArticulos: l.cantidad
          });
        }
      });
      setDatosParaImprimir({
        items: itemsComprobante,
        total: totalCarrito,
        pagoCon: dineroEntregado,
        cambio,
        numeroVenta,
        metodoPago,
        esReimpresion: false,
        fecha: new Date().toISOString()
      });
      setCarrito([]);
      setModalPago(false);
      cargarProductos();
      cargarCombos();
      if (inputRef.current) inputRef.current.focus();
      setTimeout(() => handlePrint(), 150);

    } catch (err) {
      console.error("Error en confirmarVenta:", err);
      toast.error(`Error: ${err.message || 'Fallo al guardar'}`);
    }
  };

  // --- LÓGICA DE CIERRE ---
  const calcularCierre = async () => {
    try {
      // Delimitar el día usando la hora LOCAL del equipo y convertir a UTC para la BD
      const ahora = new Date();
      const inicioLocal = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0, 0, 0);
      const finLocal = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59, 999);
      const inicioDia = inicioLocal.toISOString();
      const finDia = finLocal.toISOString();

      const { data: ultimoCierre } = await supabase.from('caja_movimientos')
          .select('creado_en').eq('tipo', 'entrega_turno').eq('usuario_id', session.user.id)
          .gte('creado_en', inicioDia).order('creado_en', { ascending: false }).limit(1).single();

      const fechaInicio = ultimoCierre ? ultimoCierre.creado_en : inicioDia;

      // Sumar VENTAS
      const { data: ventas } = await supabase.from('ventas')
          .select('total, metodo_pago').eq('cajero_id', session.user.id).gt('creado_en', fechaInicio).lte('creado_en', finDia);
      const totalesPorMetodo = (ventas || []).reduce((acc, v) => {
        const m = (v.metodo_pago || 'efectivo').toLowerCase();
        acc[m] = (acc[m] || 0) + v.total;
        return acc;
      }, {});
      const totalVentas = ventas?.reduce((s, v) => s + v.total, 0) || 0;

      // Sumar BASES
      const { data: bases } = await supabase.from('caja_movimientos')
          .select('monto').eq('tipo', 'base').eq('beneficiario', session.user.id).gt('creado_en', fechaInicio).lte('creado_en', finDia);
      const totalBases = bases?.reduce((s, b) => s + b.monto, 0) || 0;

      setResumenCierre({
        ventas: totalVentas,
        base: totalBases,
        total: totalVentas + totalBases,
        desde: new Date(fechaInicio).toLocaleTimeString('es-CO'),
        efectivo: totalesPorMetodo.efectivo || 0,
        nequi: totalesPorMetodo.nequi || 0,
        bancolombia: totalesPorMetodo.bancolombia || 0,
        davivienda: totalesPorMetodo.davivienda || 0
      });
      setModalCierre(true);
    } catch (err) {
      console.error("Error en calcularCierre:", err);
      toast.error("No se pudo calcular el cierre");
    }
  };

  const confirmarEntrega = async () => {
    try {
      const { error } = await supabase.from('caja_movimientos').insert([{
        tipo: 'entrega_turno', descripcion: 'Cierre de Turno', monto: resumenCierre.total, usuario_id: session.user.id, estado_cierre: 'pendiente'
      }]);
      if (error) throw error;
      toast.success("Turno Cerrado");
      // Preparar datos para comprobante de cierre
      setDatosCierreImprimir({
        ...resumenCierre,
        cajeroNombre: nombreCajero,
        fecha: new Date().toISOString()
      });
      setModalCierre(false);
      setTimeout(() => {
        handlePrintCierre();
      }, 150);
      setTimeout(async () => { await supabase.auth.signOut(); }, 1500);
    } catch (err) {
      console.error("Error en confirmarEntrega:", err);
      toast.error("No se pudo cerrar el turno");
    }
  };

  const abrirModalPago = () => {
    if (carrito.length === 0) return toast.error("Carrito vacío");
    setPagoCon(''); setMetodoPago('efectivo'); setModalPago(true);
  };

  const lineasVenta = useMemo(() => generarLineasVenta(carrito, combos), [carrito, combos]);
  const totalCarrito = lineasVenta.reduce((sum, l) => sum + l.subtotal, 0);

  const quitarComboDelCarrito = (combo, cantQuitar) => {
    if (!combo.combo_productos?.length) return;
    setCarrito((curr) => {
      const nuevo = [...curr];
      combo.combo_productos.forEach((cp) => {
        const idx = nuevo.findIndex((i) => i.id === cp.producto_id);
        if (idx >= 0) {
          const restar = (cp.cantidad || 1) * cantQuitar;
          const nuevaCant = nuevo[idx].cantidad - restar;
          if (nuevaCant <= 0) nuevo.splice(idx, 1);
          else nuevo[idx] = { ...nuevo[idx], cantidad: nuevaCant };
        }
      });
      return nuevo;
    });
  };

  const agregarComboAlCarrito = (combo, cant) => {
    if (!combo.combo_productos?.length) return;
    for (const cp of combo.combo_productos) {
      const prod = productos.find((p) => p.id === cp.producto_id);
      if (!prod) continue;
      const idx = carrito.findIndex((i) => i.id === prod.id);
      const actual = idx >= 0 ? carrito[idx].cantidad : 0;
      const sumar = (cp.cantidad || 1) * cant;
      if (actual + sumar > prod.stock) {
        toast.error(`No hay stock para el combo "${combo.nombre}". Falta ${prod.nombre}`);
        return;
      }
    }
    setCarrito((curr) => {
      const nuevo = [...curr];
      combo.combo_productos.forEach((cp) => {
        const prod = productos.find((p) => p.id === cp.producto_id);
        if (!prod) return;
        const idx = nuevo.findIndex((i) => i.id === prod.id);
        const sumar = (cp.cantidad || 1) * cant;
        if (idx >= 0) nuevo[idx] = { ...nuevo[idx], cantidad: nuevo[idx].cantidad + sumar };
        else nuevo.push({ ...prod, cantidad: sumar });
      });
      return nuevo;
    });
  };

  const modificarCantidadLinea = (linea, delta) => {
    if (linea.esCombo) {
      const nuevaCant = linea.cantidad + delta;
      if (nuevaCant <= 0) quitarComboDelCarrito(linea.combo, linea.cantidad);
      else if (delta > 0) agregarComboAlCarrito(linea.combo, 1);
      else quitarComboDelCarrito(linea.combo, 1);
    } else modificarCantidad(linea.id, delta);
  };

  const eliminarLinea = (linea) => {
    if (linea.esCombo) quitarComboDelCarrito(linea.combo, linea.cantidad);
    else eliminarDelCarrito(linea.id);
  };
  const productosFiltrados = productos.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()));

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-gray-100 font-sans overflow-hidden">
      <Toaster position="top-center" />
      
      {/* IZQUIERDA: PRODUCTOS */}
      <div className="flex-1 flex flex-col p-4">
        <div className="bg-white p-4 rounded-xl shadow-sm mb-4 flex justify-between items-center">
            <div><h1 className="text-xl font-bold text-gray-800">Punto de Venta</h1><p className="text-xs text-gray-500">{session.user.email}</p></div>
            <div className="flex-1 mx-8 relative">
                <Search className="absolute left-3 top-3 text-gray-400" size={20}/>
                <input ref={inputRef} value={busqueda} onChange={manejarInput} className="w-full pl-10 p-3 rounded-lg border-2 border-blue-100 focus:border-blue-500 outline-none text-lg font-bold" placeholder="Escanear o buscar..." autoFocus />
            </div>
            <button onClick={calcularCierre} className="bg-gray-800 text-white px-5 py-3 rounded-lg font-bold hover:bg-black flex items-center gap-2 shadow-lg"><Clock size={18}/> Cerrar</button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 overflow-y-auto pb-4">
          {productosFiltrados.map(p => (
            <div key={p.id} onClick={() => agregarAlCarrito(p)} className="bg-white p-4 rounded-lg shadow-sm border hover:border-blue-500 cursor-pointer transition-all flex flex-col justify-between h-32 hover:bg-blue-50 group">
                <div className="flex justify-between items-start"><span className="bg-gray-100 text-gray-600 text-[10px] px-2 py-1 rounded font-bold">{p.codigo_barras || 'S/C'}</span><Package size={20} className="text-gray-300 group-hover:text-blue-500"/></div>
                <div className="font-bold text-gray-800 leading-tight line-clamp-2">{p.nombre}</div>
                <div className="flex justify-between items-end"><span className="text-blue-600 font-black text-lg">{formatoMoneda(p.precio)}</span><span className="text-xs text-gray-400">Stock: {p.stock}</span></div>
            </div>
          ))}
        </div>
      </div>

      {/* DERECHA: CARRITO */}
      <div className="w-full lg:w-96 bg-white shadow-2xl flex flex-col border-l z-10">
        <div className="p-5 border-b bg-gray-50 flex justify-between items-center">
          <h2 className="font-bold text-xl flex items-center gap-2"><ShoppingCart className="text-blue-600"/> Carrito</h2>
          <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded-full">{carrito.length} items</span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {lineasVenta.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 opacity-50"><ShoppingCart size={48} className="mb-2"/><p>Escanea un producto</p></div>
          ) : (
            lineasVenta.map((linea) => (
              <div key={linea.id} className={`flex justify-between items-center border p-3 rounded-lg shadow-sm group hover:border-blue-300 transition-all ${linea.esCombo ? 'bg-purple-50 border-purple-200' : 'bg-white'}`}>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {linea.esCombo && <Tag size={14} className="text-purple-500 shrink-0"/>}
                    <div className="font-bold text-sm text-gray-800">{linea.nombre}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => modificarCantidadLinea(linea, -1)} className="w-6 h-6 flex items-center justify-center bg-gray-200 rounded hover:bg-gray-300 text-gray-700 font-bold">-</button>
                    <span className="text-sm font-bold w-4 text-center">{linea.cantidad}</span>
                    <button onClick={() => modificarCantidadLinea(linea, 1)} className="w-6 h-6 flex items-center justify-center bg-blue-100 rounded hover:bg-blue-200 text-blue-700 font-bold">+</button>
                    {!linea.esCombo && linea.producto?.cantidad >= linea.producto?.stock && <span className="text-[10px] text-red-500 font-bold ml-1">MAX</span>}
                    <span className="text-xs text-gray-400 ml-auto">x {formatoMoneda(linea.precio)}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-bold text-gray-700">{formatoMoneda(linea.subtotal)}</span>
                  <button onClick={() => eliminarLinea(linea)} className="text-red-300 hover:text-red-600 p-1"><Trash2 size={16}/></button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-6 bg-gray-900 text-white space-y-4">
          {ultimoCambio && (
            <div className="bg-black/30 rounded-lg p-3 text-sm flex flex-col gap-1">
              <div className="flex justify-between"><span className="text-gray-300">Última venta:</span><span className="font-bold">{formatoMoneda(ultimoCambio.total)}</span></div>
              <div className="flex justify-between"><span className="text-gray-300">Pagó con:</span><span className="font-bold">{formatoMoneda(ultimoCambio.pagoCon)}</span></div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-gray-300">Cambio a devolver:</span>
                <span className="text-2xl font-black text-green-400">{formatoMoneda(ultimoCambio.cambio)}</span>
              </div>
              <button onClick={() => setUltimoCambio(null)} className="mt-2 w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-bold text-xs">CONFIRMAR CAMBIO</button>
            </div>
          )}
          <div className="flex justify-between items-center"><span className="text-gray-400">Total a Pagar</span><span className="text-3xl font-bold">{formatoMoneda(totalCarrito)}</span></div>
          <button onClick={abrirModalPago} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-xl font-bold text-lg shadow-lg transition-transform active:scale-95 flex justify-center items-center gap-2"><DollarSign size={24}/> COBRAR</button>
        </div>
      </div>

      {/* MODAL PAGO */}
      {modalPago && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-2xl shadow-2xl w-96">
                <div className="flex justify-between items-center mb-6"><h2 className="text-2xl font-black text-gray-800 flex items-center gap-2"><Calculator/> Cobrar</h2><button onClick={() => setModalPago(false)}><X className="text-gray-400 hover:text-gray-600"/></button></div>
                <div className="text-center mb-4"><p className="text-gray-500 text-sm">Total a Pagar</p><div className="text-4xl font-black text-blue-600">{formatoMoneda(totalCarrito)}</div></div>
                <form onSubmit={confirmarVenta} className="space-y-4">
                    <div><label className="block text-sm font-bold text-gray-700 mb-2">Método de pago</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setMetodoPago('efectivo')} className={`py-2 rounded-lg font-bold text-xs ${metodoPago === 'efectivo' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Efectivo</button>
                        <button type="button" onClick={() => setMetodoPago('nequi')} className={`py-2 rounded-lg font-bold text-xs ${metodoPago === 'nequi' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Nequi</button>
                        <button type="button" onClick={() => setMetodoPago('bancolombia')} className={`py-2 rounded-lg font-bold text-xs ${metodoPago === 'bancolombia' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Bancolombia</button>
                        <button type="button" onClick={() => setMetodoPago('davivienda')} className={`py-2 rounded-lg font-bold text-xs ${metodoPago === 'davivienda' ? 'bg-yellow-500 text-white' : 'bg-gray-100 text-gray-600'}`}>Davivienda</button>
                      </div>
                    </div>
                    {metodoPago === 'efectivo' && (
                      <>
                        <div><label className="block text-sm font-bold text-gray-700 mb-2">¿Con cuánto paga el cliente?</label><InputMoneda value={pagoCon} onChange={setPagoCon} placeholder="Ej: 50.000" autoFocus /></div>
                        <div className="bg-gray-100 p-4 rounded-xl flex justify-between items-center"><span className="font-bold text-gray-600">Cambio:</span><span className={`text-xl font-bold ${(parseInt(pagoCon.replace(/\./g, '')) || 0) < totalCarrito ? 'text-red-500' : 'text-green-600'}`}>{formatoMoneda((parseInt(pagoCon.replace(/\./g, '')) || 0) - totalCarrito)}</span></div>
                      </>
                    )}
                    <button className="w-full bg-green-600 hover:bg-green-700 text-white py-4 rounded-xl font-bold text-lg shadow-lg transition-transform active:scale-95">CONFIRMAR VENTA</button>
                </form>
            </div>
        </div>
      )}

      {/* COMPROBANTE OCULTO PARA IMPRESIÓN */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        <div ref={comprobanteRef}>
          <ComprobanteVenta datos={datosParaImprimir} />
        </div>
      </div>

      {/* COMPROBANTE OCULTO PARA CIERRE */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        <div ref={comprobanteCierreRef}>
          <ComprobanteCierre datos={datosCierreImprimir} />
        </div>
      </div>

      {/* MODAL CIERRE */}
      {modalCierre && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-96 text-center border-t-8 border-green-500">
            <div className="bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircle size={40} className="text-green-600"/></div>
            <h2 className="text-2xl font-black text-gray-800 mb-1">¡Turno Finalizado!</h2>
            <p className="text-gray-500 text-sm mb-6">Desde las: <strong>{resumenCierre.desde}</strong></p>
            <div className="bg-gray-50 p-4 rounded-xl mb-6 border border-gray-200 space-y-2 text-sm">
                <div className="flex justify-between items-center text-gray-600"><span>Ventas (Total):</span><span className="font-bold text-gray-800">{formatoMoneda(resumenCierre.ventas)}</span></div>
                <div className="flex justify-between items-center text-gray-600"><span> - Efectivo:</span><span className="font-bold">{formatoMoneda(resumenCierre.efectivo || 0)}</span></div>
                <div className="flex justify-between items-center text-gray-600"><span> - Nequi:</span><span className="font-bold">{formatoMoneda(resumenCierre.nequi || 0)}</span></div>
                <div className="flex justify-between items-center text-gray-600"><span> - Bancolombia:</span><span className="font-bold">{formatoMoneda(resumenCierre.bancolombia || 0)}</span></div>
                <div className="flex justify-between items-center text-gray-600"><span> - Davivienda:</span><span className="font-bold">{formatoMoneda(resumenCierre.davivienda || 0)}</span></div>
                <div className="flex justify-between items-center text-gray-600 mt-2 border-t border-gray-200 pt-2"><span>Base Inicial:</span><span className="font-bold text-orange-600">+ {formatoMoneda(resumenCierre.base)}</span></div>
                <div className="border-t border-gray-300 pt-2 mt-2 flex justify-between items-center text-xl font-black text-blue-600"><span>ENTREGAR:</span><span>{formatoMoneda(resumenCierre.total)}</span></div>
            </div>
            <button onClick={confirmarEntrega} className="w-full bg-green-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-green-700 transition-all mb-3">Confirmar y Salir</button>
            <button onClick={()=>setModalCierre(false)} className="text-gray-400 text-sm hover:text-gray-600 underline">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PuntoDeVenta;