import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useReactToPrint } from 'react-to-print';
import { supabase } from './supabaseClient';
import { Plus, Minus, Trash2, Search, HandCoins, X, Printer, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import ComprobanteVenta from './ComprobanteVenta';
import { calcularTotalConMayoreo, calcularPrecioEfectivoMayoreo } from './utilsVentas';

const formatoMoneda = (valor) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor || 0);

/**
 * Panel de Fiados (solo admin).
 * - Registrar fiado: descuenta stock, NO crea venta.
 * - Pagar fiado: crea venta normal (origen=fiado) del día del pago, elimina el pendiente.
 */
const PanelFiado = ({ session, usuarios }) => {
  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [clienteNombre, setClienteNombre] = useState('');
  const [carrito, setCarrito] = useState([]);
  const [guardando, setGuardando] = useState(false);

  const [fiados, setFiados] = useState([]);
  const [cargandoLista, setCargandoLista] = useState(false);

  const [modalPagar, setModalPagar] = useState(null);
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [pagando, setPagando] = useState(false);

  const comprobanteRef = useRef(null);
  const [datosParaImprimir, setDatosParaImprimir] = useState(null);

  const handlePrint = useReactToPrint({
    contentRef: comprobanteRef,
    documentTitle: `Comprobante_Fiado_${new Date().toISOString().slice(0, 10)}`,
    pageStyle: '@page { size: 80mm auto; margin: 4mm; }'
  });

  useEffect(() => {
    cargarProductos();
    cargarFiados();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (datosParaImprimir) {
      const t = setTimeout(() => handlePrint(), 200);
      return () => clearTimeout(t);
    }
  }, [datosParaImprimir, handlePrint]);

  const totalCarrito = useMemo(
    () => carrito.reduce((acc, item) => acc + calcularTotalConMayoreo(item), 0),
    [carrito]
  );

  const cargarProductos = async () => {
    try {
      const { data, error } = await supabase
        .from('productos')
        .select('*')
        .eq('activo', true)
        .gt('stock', 0)
        .order('nombre');
      if (error) throw error;
      setProductos(data || []);
    } catch (err) {
      console.error('Error cargando productos:', err);
      toast.error('No se pudieron cargar productos');
    }
  };

  const cargarFiados = async () => {
    setCargandoLista(true);
    try {
      const { data, error } = await supabase
        .from('fiados')
        .select(`
          *,
          perfiles:registrado_por(nombre_completo, email),
          detalle_fiados(id, producto_id, cantidad, precio_unitario, productos(nombre, stock))
        `)
        .order('creado_en', { ascending: false });
      if (error) throw error;
      setFiados(data || []);
    } catch (err) {
      console.error('Error cargando fiados:', err);
      toast.error('No se pudieron cargar los fiados. ¿Ejecutaste sql_fiados.sql?');
      setFiados([]);
    } finally {
      setCargandoLista(false);
    }
  };

  const agregarProducto = (p) => {
    setCarrito((prev) => {
      const existente = prev.find((i) => i.id === p.id);
      const cantidadActual = existente?.cantidad || 0;
      if (cantidadActual + 1 > p.stock) {
        toast.error(`Solo hay ${p.stock} unidades de ${p.nombre}`);
        return prev;
      }
      if (existente) {
        return prev.map((i) => (i.id === p.id ? { ...i, cantidad: i.cantidad + 1 } : i));
      }
      return [...prev, { ...p, cantidad: 1 }];
    });
  };

  /** Igual que en caja: si el valor es un código de barras exacto, agrega al carrito. */
  const manejarBusqueda = (valor) => {
    setBusqueda(valor);
    const codigo = valor.trim();
    if (!codigo) return;
    const productoExacto = productos.find((p) => p.codigo_barras === codigo);
    if (productoExacto) {
      agregarProducto(productoExacto);
      setBusqueda('');
      toast.success(`${productoExacto.nombre} agregado`, { duration: 1200 });
    }
  };

  const manejarEnterBusqueda = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault(); // evita enviar el formulario al escanear
    const codigo = busqueda.trim();
    if (!codigo) return;
    const productoExacto = productos.find((p) => p.codigo_barras === codigo);
    if (productoExacto) {
      agregarProducto(productoExacto);
      setBusqueda('');
      toast.success(`${productoExacto.nombre} agregado`, { duration: 1200 });
    } else {
      toast.error('Producto no encontrado');
    }
  };

  const cambiarCantidad = (id, delta) => {
    setCarrito((prev) =>
      prev
        .map((item) => {
          if (item.id !== id) return item;
          const nueva = item.cantidad + delta;
          if (nueva > item.stock) {
            toast.error(`Stock máximo: ${item.stock}`);
            return item;
          }
          return { ...item, cantidad: nueva };
        })
        .filter((item) => item.cantidad > 0)
    );
  };

  const registrarFiado = async (e) => {
    e.preventDefault();
    const nombre = clienteNombre.trim();
    if (!nombre) return toast.error('Indica a quién se le fía');
    if (carrito.length === 0) return toast.error('Agrega al menos un producto');

    setGuardando(true);
    try {
      const ids = carrito.map((i) => i.id);
      const { data: productosActuales, error: errStock } = await supabase
        .from('productos')
        .select('id, nombre, stock')
        .in('id', ids);
      if (errStock) throw errStock;

      for (const item of carrito) {
        const prod = productosActuales?.find((p) => p.id === item.id);
        if (!prod || item.cantidad > prod.stock) {
          toast.error(`Stock insuficiente de "${prod?.nombre || item.nombre}"`);
          setGuardando(false);
          return;
        }
      }

      const { data: fiado, error: errFiado } = await supabase
        .from('fiados')
        .insert([{
          cliente_nombre: nombre,
          registrado_por: session.user.id,
          total: totalCarrito,
        }])
        .select()
        .single();
      if (errFiado) throw errFiado;

      const detalles = carrito.map((item) => ({
        fiado_id: fiado.id,
        producto_id: item.id,
        cantidad: item.cantidad,
        precio_unitario: calcularPrecioEfectivoMayoreo(item),
      }));

      const { error: errDet } = await supabase.from('detalle_fiados').insert(detalles);
      if (errDet) {
        await supabase.from('fiados').delete().eq('id', fiado.id);
        throw errDet;
      }

      for (const item of carrito) {
        const prod = productosActuales.find((p) => p.id === item.id);
        const nuevoStock = (prod?.stock ?? 0) - item.cantidad;
        const { error: errUpd } = await supabase
          .from('productos')
          .update({ stock: nuevoStock })
          .eq('id', item.id);
        if (errUpd) throw errUpd;
      }

      toast.success(`Fiado registrado a ${nombre}`);
      setClienteNombre('');
      setCarrito([]);
      setBusqueda('');
      await cargarProductos();
      await cargarFiados();
    } catch (err) {
      console.error('Error registrando fiado:', err);
      toast.error(err.message || 'No se pudo registrar el fiado');
    } finally {
      setGuardando(false);
    }
  };

  const confirmarPago = async () => {
    if (!modalPagar) return;
    setPagando(true);
    try {
      const fiado = modalPagar;
      const detalles = fiado.detalle_fiados || [];
      if (detalles.length === 0) {
        toast.error('El fiado no tiene productos');
        setPagando(false);
        return;
      }

      // Crear venta normal del día del pago (sin volver a descontar stock)
      const { data: venta, error: errVenta } = await supabase
        .from('ventas')
        .insert([{
          cajero_id: session.user.id,
          total: fiado.total,
          metodo_pago: metodoPago,
          origen: 'fiado',
        }])
        .select()
        .single();
      if (errVenta) throw errVenta;

      const detallesVenta = detalles.map((d) => ({
        venta_id: venta.id,
        producto_id: d.producto_id,
        cantidad: d.cantidad,
        precio_unitario: d.precio_unitario,
      }));

      const { error: errDet } = await supabase.from('detalle_ventas').insert(detallesVenta);
      if (errDet) {
        await supabase.from('ventas').delete().eq('id', venta.id);
        throw errDet;
      }

      // Eliminar pendiente (CASCADE borra detalle_fiados)
      const { error: errDel } = await supabase.from('fiados').delete().eq('id', fiado.id);
      if (errDel) throw errDel;

      const itemsComprobante = detalles.map((d, idx) => ({
        id: d.producto_id || `prod-${idx}`,
        nombre: d.productos?.nombre || 'Producto',
        cantidad: d.cantidad,
        precio: d.precio_unitario,
        cantidadArticulos: d.cantidad,
      }));

      const numeroVenta = venta.numero_venta ?? venta.id?.slice(-8);
      setDatosParaImprimir({
        items: itemsComprobante,
        total: fiado.total,
        pagoCon: fiado.total,
        cambio: 0,
        numeroVenta,
        metodoPago,
        esReimpresion: false,
        fecha: new Date().toISOString(),
      });

      toast.success('Fiado pagado. Venta registrada en el día de hoy.');
      setModalPagar(null);
      setMetodoPago('efectivo');
      await cargarFiados();
    } catch (err) {
      console.error('Error pagando fiado:', err);
      toast.error(err.message || 'No se pudo registrar el pago');
    } finally {
      setPagando(false);
    }
  };

  const anularFiado = async (fiado) => {
    if (!window.confirm(`¿Anular el fiado de "${fiado.cliente_nombre}"?\nSe devolverá el stock.`)) return;
    try {
      const detalles = fiado.detalle_fiados || [];
      for (const d of detalles) {
        const { data: prod } = await supabase
          .from('productos')
          .select('stock')
          .eq('id', d.producto_id)
          .single();
        if (prod) {
          await supabase
            .from('productos')
            .update({ stock: (prod.stock || 0) + d.cantidad })
            .eq('id', d.producto_id);
        }
      }
      const { error } = await supabase.from('fiados').delete().eq('id', fiado.id);
      if (error) throw error;
      toast.success('Fiado anulado. Stock restaurado.');
      await cargarProductos();
      await cargarFiados();
    } catch (err) {
      console.error('Error anulando fiado:', err);
      toast.error(err.message || 'No se pudo anular');
    }
  };

  const nombreRegistrador = (fiado) =>
    fiado.perfiles?.nombre_completo
    || usuarios?.find((u) => u.id === fiado.registrado_por)?.nombre_completo
    || fiado.perfiles?.email
    || 'Admin';

  const productosFiltrados = productos.filter((p) =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase())
    || (p.codigo_barras || '').includes(busqueda)
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="bg-white p-4 rounded-xl shadow-sm flex items-center gap-3">
        <HandCoins className="text-amber-600" />
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Fiado</h2>
          <p className="text-sm text-gray-500">
            Registra productos fiados (baja stock sin venta). Al pagar, se crea la venta del día.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* ——— REGISTRAR FIADO ——— */}
        <section className="bg-white p-6 rounded-xl shadow-lg space-y-4">
          <h3 className="font-bold text-lg">Registrar fiado</h3>
          <form onSubmit={registrarFiado} className="space-y-4">
            {/* 1. Nombre */}
            <div>
              <label className="text-xs font-bold text-gray-500">Nombre a quien se fía</label>
              <input
                type="text"
                value={clienteNombre}
                onChange={(e) => setClienteNombre(e.target.value)}
                placeholder="Ej: Juan Pérez"
                className="w-full border p-3 rounded-lg mt-1"
                required
              />
            </div>

            {/* 2. Total + Registrar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50 border border-amber-100 rounded-xl p-3">
              <span className="text-lg font-bold text-gray-800">Total: {formatoMoneda(totalCarrito)}</span>
              <button
                type="submit"
                disabled={guardando}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-6 py-3 rounded-lg disabled:opacity-50"
              >
                {guardando ? 'Guardando...' : 'Registrar fiado'}
              </button>
            </div>

            {/* 3. Carrito */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-3 py-2 text-xs font-bold text-gray-500 uppercase">
                Carrito ({carrito.length})
              </div>
              {carrito.length === 0 ? (
                <p className="p-4 text-sm text-gray-400 text-center">Vacío — busca productos abajo</p>
              ) : (
                <ul className="divide-y max-h-48 overflow-y-auto">
                  {carrito.map((item) => (
                    <li key={item.id} className="p-3 flex items-center justify-between gap-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold truncate">{item.nombre}</div>
                        <div className="text-xs text-gray-500">
                          {formatoMoneda(calcularPrecioEfectivoMayoreo(item))} c/u
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => cambiarCantidad(item.id, -1)} className="p-1 rounded bg-gray-100 hover:bg-gray-200">
                          <Minus size={14} />
                        </button>
                        <span className="w-8 text-center font-bold">{item.cantidad}</span>
                        <button type="button" onClick={() => cambiarCantidad(item.id, 1)} className="p-1 rounded bg-gray-100 hover:bg-gray-200">
                          <Plus size={14} />
                        </button>
                        <button type="button" onClick={() => setCarrito((c) => c.filter((i) => i.id !== item.id))} className="p-1 text-red-500 hover:bg-red-50 rounded ml-1">
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="font-bold text-green-700 w-24 text-right">
                        {formatoMoneda(calcularTotalConMayoreo(item))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* 4. Buscador + lista con scroll (~8 visibles) */}
            <div>
              <label className="text-xs font-bold text-gray-500">Buscar producto</label>
              <div className="relative mt-1">
                <Search size={16} className="absolute left-3 top-3 text-gray-400" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => manejarBusqueda(e.target.value)}
                  onKeyDown={manejarEnterBusqueda}
                  placeholder="Escanear código o escribir nombre..."
                  className="w-full border p-3 pl-9 rounded-lg"
                  autoComplete="off"
                />
              </div>
              <div className="mt-2 max-h-64 overflow-y-auto border rounded-lg divide-y">
                {!busqueda.trim() ? (
                  <p className="p-4 text-sm text-gray-400 text-center">
                    Escribe para filtrar. No se listan todos los productos de golpe.
                  </p>
                ) : productosFiltrados.length === 0 ? (
                  <p className="p-3 text-sm text-gray-400 text-center">Sin coincidencias</p>
                ) : (
                  productosFiltrados.slice(0, 50).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => agregarProducto(p)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 flex justify-between gap-2"
                    >
                      <span className="font-medium truncate">{p.nombre}</span>
                      <span className="text-xs text-gray-500 whitespace-nowrap">
                        {formatoMoneda(p.precio)} · Stock {p.stock}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </form>
        </section>

        {/* ——— PENDIENTES ——— */}
        <section className="bg-white p-6 rounded-xl shadow-lg space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-lg">Fiados pendientes</h3>
            <button type="button" onClick={cargarFiados} className="text-xs font-bold text-blue-600 hover:underline">
              Actualizar
            </button>
          </div>

          {cargandoLista && <p className="text-sm text-gray-400">Cargando...</p>}
          {!cargandoLista && fiados.length === 0 && (
            <p className="text-center text-gray-400 py-8">No hay fiados pendientes</p>
          )}

          <div className="space-y-3 max-h-[70vh] overflow-y-auto">
            {fiados.map((f) => (
              <div key={f.id} className="border rounded-xl p-4 space-y-2 hover:border-amber-300 transition-colors">
                <div className="flex justify-between gap-2">
                  <div>
                    <div className="font-bold text-gray-800">{f.cliente_nombre}</div>
                    <div className="text-xs text-gray-500">
                      Fió: {nombreRegistrador(f)} · {new Date(f.creado_en).toLocaleString('es-CO')}
                    </div>
                  </div>
                  <div className="font-black text-amber-700">{formatoMoneda(f.total)}</div>
                </div>
                <ul className="text-xs text-gray-600 space-y-0.5 bg-gray-50 rounded p-2">
                  {(f.detalle_fiados || []).map((d) => (
                    <li key={d.id}>
                      {d.productos?.nombre || 'Producto'} ×{d.cantidad} — {formatoMoneda(d.precio_unitario * d.cantidad)}
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => { setModalPagar(f); setMetodoPago('efectivo'); }}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded-lg text-sm flex items-center justify-center gap-1"
                  >
                    <CheckCircle size={16} /> Pagar
                  </button>
                  <button
                    type="button"
                    onClick={() => anularFiado(f)}
                    className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-bold"
                    title="Anular y devolver stock"
                  >
                    Anular
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Modal pagar */}
      {modalPagar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold">Confirmar pago de fiado</h3>
                <p className="text-sm text-gray-500">Cliente: {modalPagar.cliente_nombre}</p>
                <p className="text-xl font-black text-green-700 mt-1">{formatoMoneda(modalPagar.total)}</p>
              </div>
              <button type="button" onClick={() => setModalPagar(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500">Método de pago</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {['efectivo', 'nequi', 'bancolombia', 'davivienda'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMetodoPago(m)}
                    className={`p-2 text-xs font-bold rounded uppercase ${
                      metodoPago === m ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs text-gray-500">
              Se registrará como venta de hoy con descripción &quot;Venta productos / Fiado&quot; y se podrá reimprimir desde Ventas del Día.
            </p>

            <div className="flex gap-2">
              <button type="button" onClick={() => setModalPagar(null)} className="flex-1 bg-gray-100 py-3 rounded-lg font-bold">
                Cancelar
              </button>
              <button
                type="button"
                disabled={pagando}
                onClick={confirmarPago}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-bold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Printer size={16} />
                {pagando ? 'Procesando...' : 'Confirmar y imprimir'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'none' }}>
        {datosParaImprimir && (
          <div ref={comprobanteRef}>
            <ComprobanteVenta datos={datosParaImprimir} />
          </div>
        )}
      </div>
    </div>
  );
};

export default PanelFiado;
