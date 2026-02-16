import React, { useState, useEffect, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { supabase } from './supabaseClient';
import { LayoutDashboard, Package, DollarSign, Calendar, TrendingUp, TrendingDown, Save, Search, Truck, User, Clock, FileText, Plus, X, Edit, Trash2, CheckCircle, AlertTriangle, ShieldCheck, Barcode, Eye, EyeOff, Menu, Printer, Tag } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import ComprobanteVenta from './ComprobanteVenta';

// ==========================================
// 1. UTILIDADES Y FECHAS
// ==========================================

const formatoMoneda = (valor) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor);

const fechaHoy = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const esMismaFecha = (fechaISO, fechaFiltro) => {
  if (!fechaISO) return false;
  return new Date(fechaISO).toLocaleDateString('fr-CA') === fechaFiltro;
};

const InputMoneda = ({ value, onChange, placeholder, autoFocus }) => {
  const handleChange = (e) => {
    const rawValue = e.target.value.replace(/\D/g, '');
    if (!rawValue) { onChange(''); return; }
    onChange(parseInt(rawValue, 10).toLocaleString('es-CO'));
  };
  return (
    <div className="relative">
      <span className="absolute left-3 top-3 text-gray-400 font-bold">$</span>
      <input type="text" value={value} onChange={handleChange} placeholder={placeholder || "0"} autoFocus={autoFocus} className="w-full border p-3 pl-8 rounded-lg font-bold text-lg outline-none focus:ring-2 focus:ring-blue-500"/>
    </div>
  );
};

const BotonMenu = ({ icon, label, active, onClick }) => (
  <button onClick={onClick} className={`flex items-center gap-3 w-full p-3 rounded-lg transition-all ${active ? 'bg-blue-600 text-white shadow-lg translate-x-1' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
    {icon} <span className="font-bold text-sm">{label}</span>
  </button>
);

const CardResumen = ({ titulo, monto, color, icon }) => (
  <div className={`${color} text-white p-6 rounded-2xl shadow-lg flex flex-col justify-between transform hover:scale-105 transition-transform`}>
    <div className="flex justify-between items-start"><span className="opacity-80 font-bold text-xs uppercase tracking-wider">{titulo}</span><div className="opacity-50 bg-white/20 p-2 rounded-full">{icon}</div></div>
    <div className="text-2xl font-bold mt-4">{formatoMoneda(monto)}</div>
  </div>
);

// ==========================================
// 2. VISTAS DEL SISTEMA
// ==========================================

const VistaDashboard = () => {
  const [resumen, setResumen] = useState({ ventas: 0, gastos: 0, bases: 0, entregas: 0, cajaFuerte: 0 });
  const [fecha, setFecha] = useState(fechaHoy()); 
  
  useEffect(() => { cargar(); }, [fecha]);
  
  const cargar = async () => {
    try {
      const { data: ventas } = await supabase.from('ventas').select('total, creado_en').limit(500);
      const { data: movs } = await supabase.from('caja_movimientos').select('*').limit(500);

      const ventasHoy = ventas?.filter(v => esMismaFecha(v.creado_en, fecha)) || [];
      const movsHoy = movs?.filter(m => esMismaFecha(m.creado_en, fecha)) || [];

      const totalVentas = ventasHoy.reduce((s, v) => s + v.total, 0);
      const gastos = movsHoy.filter(m => ['gasto', 'nomina'].includes(m.tipo)).reduce((s, m) => s + m.monto, 0);
      const entregas = movsHoy.filter(m => m.tipo === 'entrega_turno').reduce((s, m) => s + m.monto, 0);

      const histVentas = ventas?.reduce((s,v)=>s+v.total,0)||0;
      const histCapital = movs?.filter(m=>m.tipo==='ingreso_capital').reduce((s,m)=>s+m.monto,0)||0;
      const histGastos = movs?.filter(m=>['gasto','nomina'].includes(m.tipo)).reduce((s,m)=>s+m.monto,0)||0;
      const histBases = movs?.filter(m=>m.tipo==='base').reduce((s,m)=>s+m.monto,0)||0;
      const histEntregas = movs?.filter(m=>m.tipo==='entrega_turno').reduce((s,m)=>s+m.monto,0)||0;

      const cajaFuerte = (histCapital + histVentas + histEntregas) - (histGastos + histBases);

      setResumen({ ventas: totalVentas, gastos, bases: 0, entregas, cajaFuerte });
    } catch (err) {
      console.error("Error en VistaDashboard.cargar:", err);
      toast.error("No se pudo cargar el resumen");
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm gap-4">
         <h2 className="text-3xl font-bold text-gray-800">📊 Resumen Diario</h2>
         <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="border p-2 rounded-lg font-bold text-gray-700 w-full md:w-auto" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <CardResumen titulo="Ventas (Día)" monto={resumen.ventas} color="bg-green-600" icon={<TrendingUp />} />
        <CardResumen titulo="Gastos (Día)" monto={resumen.gastos} color="bg-red-600" icon={<TrendingDown />} />
        <CardResumen titulo="Entregas (Día)" monto={resumen.entregas} color="bg-blue-600" icon={<Save />} />
        <div className="bg-gray-800 text-white p-6 rounded-2xl shadow-xl ring-4 ring-gray-200">
          <span className="opacity-80 font-bold text-xs uppercase">CAJA FUERTE REAL</span>
          <div className="text-3xl font-bold mt-4">{formatoMoneda(resumen.cajaFuerte)}</div>
        </div>
      </div>
    </div>
  );
};

const VistaCierres = ({ session, usuarios }) => {
  const [cierres, setCierres] = useState([]);
  const [modalValidar, setModalValidar] = useState(null);
  const [dineroRealInput, setDineroRealInput] = useState('');
  const [fecha, setFecha] = useState(fechaHoy());

  useEffect(() => { cargar(); }, [fecha, usuarios]);

  const cargar = async () => {
    try {
      const { data: todos } = await supabase.from('caja_movimientos')
        .select('*')
        .eq('tipo', 'entrega_turno')
        .order('creado_en', { ascending: false })
        .limit(50);

      if (!todos) return;

      const listaFinal = todos.filter(c => {
          if (c.estado_cierre === 'pendiente') return true;
          return esMismaFecha(c.creado_en, fecha);
      }).map(c => {
          const empleado = usuarios.find(u => u.id === c.usuario_id);
          const validador = usuarios.find(u => u.id === c.validado_por);
          return {
              ...c,
              nombreEmpleado: empleado ? empleado.nombre_completo : 'Desconocido',
              nombreValidador: validador ? validador.nombre_completo : 'Admin'
          };
      });

      setCierres(listaFinal);
    } catch (err) {
      console.error("Error en VistaCierres.cargar:", err);
      toast.error("No se pudieron cargar los cierres");
    }
  };

  const guardarValidacion = async (e) => {
    e.preventDefault();
    try {
      const real = parseInt(dineroRealInput.replace(/\./g, '')) || 0;
      const diferencia = real - modalValidar.monto;

      const { error } = await supabase.from('caja_movimientos').update({
        dinero_fisico_real: real,
        diferencia: diferencia,
        estado_cierre: 'verificado',
        validado_por: session.user.id
      }).eq('id', modalValidar.id);
      if (error) throw error;

      toast.success("Cierre Validado");
      setModalValidar(null);
      cargar();
    } catch (err) {
      console.error("Error en guardarValidacion:", err);
      toast.error("No se pudo validar el cierre");
    }
  };

  return (
    <div className="h-full flex flex-col space-y-4 animate-fadeIn">
        <div className="bg-white p-4 rounded-xl shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
            <h2 className="text-2xl font-bold text-gray-800">🔐 Validación de Cierres</h2>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="border p-2 rounded-lg font-bold w-full md:w-auto" />
        </div>

        <div className="bg-white rounded-xl shadow overflow-hidden flex-1 overflow-y-auto">
            <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b">
                    <tr><th className="p-4">Hora</th><th className="p-4">Empleado</th><th className="p-4 text-right">Reportado</th><th className="p-4 text-right hidden md:table-cell">Real</th><th className="p-4 text-right">Diferencia</th><th className="p-4 text-center">Estado</th></tr>
                </thead>
                <tbody className="divide-y">
                    {cierres.length === 0 ? <tr><td colSpan="6" className="p-8 text-center text-gray-400">No hay cierres para mostrar.</td></tr> : 
                    cierres.map(c => (
                        <tr key={c.id} className={`hover:bg-gray-50 ${c.estado_cierre === 'pendiente' ? 'bg-orange-50' : ''}`}>
                            <td className="p-4 text-gray-500">{new Date(c.creado_en).toLocaleDateString('es-CO')}<br/><span className="text-xs">{new Date(c.creado_en).toLocaleTimeString('es-CO')}</span></td>
                            <td className="p-4 font-bold text-gray-700">{c.nombreEmpleado}</td>
                            <td className="p-4 text-right font-bold text-blue-600">{formatoMoneda(c.monto)}</td>
                            <td className="p-4 text-right text-gray-700 hidden md:table-cell">{c.estado_cierre === 'pendiente' ? '---' : formatoMoneda(c.dinero_fisico_real)}</td>
                            <td className={`p-4 text-right font-bold ${c.diferencia < 0 ? 'text-red-500' : (c.diferencia > 0 ? 'text-green-500' : 'text-gray-400')}`}>{c.estado_cierre === 'pendiente' ? '---' : formatoMoneda(c.diferencia)}</td>
                            <td className="p-4 text-center">
                                {c.estado_cierre === 'pendiente' ? (
                                    <button onClick={() => {setModalValidar(c); setDineroRealInput('');}} className="bg-orange-600 text-white px-4 py-2 rounded shadow text-xs font-bold hover:bg-orange-700 animate-pulse">⚠️ VALIDAR</button>
                                ) : (
                                    <div className="flex flex-col items-center">
                                        <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1"><ShieldCheck size={12}/> OK</span>
                                        <span className="text-[10px] text-gray-400 mt-1 hidden md:block">Por: {c.nombreValidador}</span>
                                    </div>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>

        {modalValidar && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-md text-center">
                    <h3 className="font-bold text-xl mb-2">Auditar Cierre</h3>
                    <p className="text-sm text-gray-500 mb-6">Monto Reportado: <strong className="text-blue-600">{formatoMoneda(modalValidar.monto)}</strong></p>
                    <form onSubmit={guardarValidacion} className="space-y-4 text-left">
                        <div><label className="text-xs font-bold text-gray-500">¿Cuánto contaste físicamente?</label><InputMoneda value={dineroRealInput} onChange={setDineroRealInput} placeholder="$ 0" autoFocus /></div>
                        <button className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold shadow-lg">CONFIRMAR CONTEO</button>
                    </form>
                    <button onClick={() => setModalValidar(null)} className="mt-4 text-gray-400 text-sm hover:text-gray-600">Cancelar</button>
                </div>
            </div>
        )}
    </div>
  );
};

const VistaBodega = ({ session, usuarios }) => {
  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [modalRestock, setModalRestock] = useState(null);
  const [modalEditar, setModalEditar] = useState(null);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [fecha, setFecha] = useState(fechaHoy());
  const [prodForm, setProdForm] = useState({ codigo:'', nombre:'', precio:'', stock:'', precio_mayoreo:'', umbral_mayoreo:'' });
  const [formCant, setFormCant] = useState(''); const [formCosto, setFormCosto] = useState('');

  useEffect(() => { cargar(); cargarHistorial(); }, [fecha, usuarios]);
  
  const cargar = async () => {
    try {
      const { data, error } = await supabase.from('productos').select('*').order('nombre');
      if (error) throw error;
      if (data) setProductos(data);
    } catch (err) {
      console.error("Error en VistaBodega.cargar:", err);
      toast.error("No se pudieron cargar los productos");
    }
  };
  const cargarHistorial = async () => {
    try {
      const { data, error } = await supabase.from('caja_movimientos').select('*').eq('tipo', 'gasto').ilike('descripcion', 'Compra mercancía%').order('creado_en', { ascending: false }).limit(100);
      if (error) throw error;
      if (data) {
        const procesado = data.filter(h => esMismaFecha(h.creado_en, fecha)).map(item => ({
          ...item,
          nombreAutor: usuarios.find(u => u.id === item.usuario_id)?.nombre_completo || 'Admin'
        }));
        setHistorial(procesado);
      }
    } catch (err) {
      console.error("Error en VistaBodega.cargarHistorial:", err);
    }
  };

  const toggleEstado = async (p) => {
    try {
      const nuevoEstado = !p.activo;
      const { error } = await supabase.from('productos').update({ activo: nuevoEstado }).eq('id', p.id);
      if (error) throw error;
      toast.success(nuevoEstado ? "Producto Activado 🟢" : "Producto Archivado 🔴");
      cargar();
    } catch (err) {
      console.error("Error en toggleEstado:", err);
      toast.error("No se pudo actualizar el producto");
    }
  };

  const abrirModalEdicion = (p) => {
      setProdForm({
        codigo: p.codigo_barras || '',
        nombre: p.nombre,
        precio: p.precio.toLocaleString('es-CO'),
        stock: p.stock,
        precio_mayoreo: p.precio_mayoreo ? p.precio_mayoreo.toLocaleString('es-CO') : '',
        umbral_mayoreo: p.umbral_mayoreo ?? ''
      });
      setModalEditar(p);
  };

  const guardarProducto = async (e) => {
    e.preventDefault();
    try {
      const precio = parseInt(prodForm.precio.toString().replace(/\./g, '')) || 0;
      const stock = parseInt(prodForm.stock) || 0;
      const precioMayoreo = prodForm.precio_mayoreo ? parseInt(prodForm.precio_mayoreo.toString().replace(/\./g, '')) : null;
      const umbralMayoreo = prodForm.umbral_mayoreo ? parseInt(prodForm.umbral_mayoreo) : null;
      const codigo = prodForm.codigo.trim() || null;

      if (precio < 0) return toast.error("El precio no puede ser negativo");
      if (stock < 0) return toast.error("El stock no puede ser negativo");

      const datos = { nombre: prodForm.nombre, codigo_barras: codigo, precio, stock };
      if (precioMayoreo != null) datos.precio_mayoreo = precioMayoreo;
      if (umbralMayoreo != null) datos.umbral_mayoreo = umbralMayoreo;

      if (modalEditar) {
        const { error } = await supabase.from('productos').update(datos).eq('id', modalEditar.id);
        if (error) throw error;
        toast.success("Actualizado"); setModalEditar(null);
      } else {
        datos.activo = true;
        const { error } = await supabase.from('productos').insert([datos]);
        if (error) throw error;
        toast.success("Creado"); setModalNuevo(false);
      }
      setProdForm({ codigo:'', nombre:'', precio:'', stock:'', precio_mayoreo:'', umbral_mayoreo:'' }); cargar();
    } catch (err) {
      console.error("Error en guardarProducto:", err);
      toast.error("No se pudo guardar el producto");
    }
  };

  const handleRestock = async (e) => {
    e.preventDefault();
    try {
      const cant = parseInt(String(formCant).replace(/\D/g, ''), 10) || 0;
      const costoTotal = parseInt(formCosto.replace(/\./g, '')) || 0;
      if (cant <= 0) return toast.error("Cantidad inválida");

      const costoUnitario = Math.round(costoTotal / cant);
      const nuevoStock = modalRestock.stock + cant;
      const costoPromedio = modalRestock.costo
        ? Math.round(((modalRestock.costo * modalRestock.stock) + costoTotal) / nuevoStock)
        : costoUnitario;

      const { error: errMov } = await supabase.from('caja_movimientos').insert([{ tipo: 'gasto', descripcion: `Compra mercancía: ${modalRestock.nombre} (x${cant})`, monto: costoTotal, usuario_id: session.user.id }]);
      if (errMov) throw errMov;

      const { error: errProd } = await supabase.from('productos').update({ stock: nuevoStock, costo: costoPromedio }).eq('id', modalRestock.id);
      if (errProd) throw errProd;

      toast.success("Stock Agregado"); setModalRestock(null); cargar(); cargarHistorial();
    } catch (err) {
      console.error("Error en handleRestock:", err);
      toast.error("No se pudo reabastecer");
    }
  };

  const filtrados = productos.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full animate-fadeIn">
       <div className="lg:col-span-2 flex flex-col h-full bg-white rounded-xl shadow overflow-hidden">
         <div className="p-4 border-b flex justify-between">
           <input placeholder="Buscar producto..." className="border p-2 rounded w-1/2" onChange={e=>setBusqueda(e.target.value)}/>
           <button onClick={()=>{setModalNuevo(true); setProdForm({codigo:'', nombre:'', precio:'', stock:'', precio_mayoreo:'', umbral_mayoreo:''})}} className="bg-purple-600 text-white px-4 py-2 rounded font-bold flex items-center gap-2"><Plus size={16}/> Nuevo</button>
         </div>
         <div className="overflow-y-auto flex-1">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 sticky top-0"><tr><th className="p-3">Producto</th><th className="p-3">Precio</th><th className="p-3">Stock</th><th className="p-3 text-right">Acciones</th></tr></thead>
              <tbody>
                {filtrados.map(p=>(
                  <tr key={p.id} className={`border-b hover:bg-gray-50 transition-colors ${!p.activo ? 'opacity-50 bg-gray-100' : ''}`}>
                    <td className="p-3 font-medium">
                        {p.nombre}
                        {p.codigo_barras && <div className="text-[10px] text-gray-400 font-mono flex items-center gap-1"><Barcode size={10}/> {p.codigo_barras}</div>}
                        {!p.activo && <span className="text-[10px] bg-red-100 text-red-600 px-2 rounded ml-2 font-bold">INACTIVO</span>}
                    </td>
                    <td className="p-3 text-green-600 font-bold">{formatoMoneda(p.precio)}</td>
                    <td className="p-3 font-bold">{p.stock}</td>
                    <td className="p-3 text-right flex justify-end gap-2">
                      <button onClick={()=>toggleEstado(p)} className={`p-2 rounded ${p.activo ? 'text-green-500 hover:bg-green-100' : 'text-gray-400 hover:bg-gray-200'}`} title={p.activo ? "Archivar" : "Activar"}>
                          {p.activo ? <Eye size={16}/> : <EyeOff size={16}/>}
                      </button>
                      <button onClick={()=>abrirModalEdicion(p)} className="text-blue-500 hover:bg-blue-100 p-2 rounded"><Edit size={16}/></button>
                      {p.activo && (<button onClick={()=>{setModalRestock(p); setFormCant(''); setFormCosto('');}} className="bg-blue-100 text-blue-700 px-3 py-1 rounded text-xs font-bold"><Truck size={14} className="inline mr-1"/> STOCK</button>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
         </div>
       </div>

       <div className="bg-white rounded-xl shadow p-4 h-full overflow-y-auto hidden lg:block">
         <div className="flex justify-between items-center border-b pb-2 mb-2">
            <h3 className="font-bold uppercase text-xs">📝 Historial (Día)</h3>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="text-xs border rounded p-1" />
         </div>
         {historial.length===0 && <p className="text-gray-400 text-xs text-center py-4">No hay registros.</p>}
         {historial.map(h=>(
           <div key={h.id} className="border-b py-2">
             <div className="font-bold text-xs">{h.descripcion}</div>
             <div className="flex justify-between mt-1 text-xs">
               <span className="text-gray-500">{h.nombreAutor}</span>
               <span className="text-red-500 font-bold">-{formatoMoneda(h.monto)}</span>
             </div>
             <div className="text-[10px] text-gray-400">{new Date(h.creado_en).toLocaleString('es-CO')}</div>
           </div>
         ))}
       </div>

       {(modalNuevo || modalEditar) && (
         <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
           <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-sm">
             <h3 className="font-bold mb-4">{modalEditar ? 'Editar Producto' : 'Nuevo Producto'}</h3>
             <form onSubmit={guardarProducto} className="space-y-3">
               <div><label className="text-xs font-bold text-gray-500">Código de Barras</label><input placeholder="Escanear o escribir..." value={prodForm.codigo} onChange={e=>setProdForm({...prodForm, codigo:e.target.value})} className="w-full border p-2 rounded bg-gray-50 font-mono" autoFocus/></div>
               <div><label className="text-xs font-bold text-gray-500">Nombre del Producto</label><input placeholder="Ej: Hamburguesa Especial" value={prodForm.nombre} onChange={e=>setProdForm({...prodForm, nombre:e.target.value})} className="w-full border p-2 rounded" required/></div>
               <div><label className="text-xs font-bold text-gray-500">Precio de Venta</label><InputMoneda placeholder="Precio" value={prodForm.precio} onChange={v=>setProdForm({...prodForm, precio:v})} /></div>
               <div><label className="text-xs font-bold text-gray-500">Stock Inicial</label><input type="number" min="0" placeholder="Cantidad" value={prodForm.stock} onChange={e=>setProdForm({...prodForm, stock:e.target.value})} className="w-full border p-2 rounded"/></div>
               <div><label className="text-xs font-bold text-gray-500">Precio Mayoreo (opcional)</label><InputMoneda placeholder="Ej: 1.500" value={prodForm.precio_mayoreo} onChange={v=>setProdForm({...prodForm, precio_mayoreo:v})} /></div>
               <div><label className="text-xs font-bold text-gray-500">Umbral Mayoreo (ej: 3)</label><input type="number" min="2" placeholder="A partir de X unidades" value={prodForm.umbral_mayoreo} onChange={e=>setProdForm({...prodForm, umbral_mayoreo:e.target.value})} className="w-full border p-2 rounded"/></div>
               <div className="flex gap-2 mt-4"><button type="button" onClick={()=>{setModalNuevo(false); setModalEditar(null);}} className="flex-1 bg-gray-100 py-2 rounded">Cancelar</button><button className="flex-1 bg-blue-600 text-white py-2 rounded font-bold">Guardar</button></div>
             </form>
           </div>
         </div>
       )}
       {modalRestock && (
         <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
           <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-xs">
             <h3 className="font-bold mb-4">Reabastecer: {modalRestock.nombre}</h3>
             <form onSubmit={handleRestock} className="space-y-3">
               <div>
                 <label className="text-xs font-bold text-gray-500 block mb-1">Cantidad</label>
                 <input type="number" min="1" placeholder="Cantidad" value={formCant} onChange={e=>setFormCant(e.target.value)} className="w-full border p-3 rounded-lg font-bold text-lg outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
               </div>
               <div>
                 <label className="text-xs font-bold text-gray-500 block mb-1">Costo Total</label>
                 <InputMoneda placeholder="Costo total" value={formCosto} onChange={setFormCosto} />
               </div>
               <div className="flex gap-2 mt-4"><button type="button" onClick={()=>setModalRestock(null)} className="flex-1 bg-gray-100 py-2 rounded">Cancelar</button><button className="flex-1 bg-blue-600 text-white py-2 rounded font-bold">Guardar</button></div>
             </form>
           </div>
         </div>
       )}
    </div>
  );
};

const VistaGastos = ({ session, usuarios }) => {
  const [tipo, setTipo] = useState('gasto');
  const [desc, setDesc] = useState('');
  const [monto, setMonto] = useState('');
  const [beneficiario, setBeneficiario] = useState('');
  const [historial, setHistorial] = useState([]);
  const [fecha, setFecha] = useState(fechaHoy());

  useEffect(() => { cargar(); }, [fecha, usuarios]); 
  
  const cargar = async () => {
    try {
      const { data, error } = await supabase.from('caja_movimientos').select('*').order('creado_en', { ascending: false }).limit(100);
      if (error) throw error;
      if (data) {
        const procesado = data.filter(h => esMismaFecha(h.creado_en, fecha)).map(item => ({
          ...item,
          nombreAutor: usuarios.find(u => u.id === item.usuario_id)?.nombre_completo || 'Usuario',
          nombreBeneficiario: usuarios.find(u => u.id === item.beneficiario)?.nombre_completo || null
        }));
        setHistorial(procesado);
      }
    } catch (err) {
      console.error("Error en VistaGastos.cargar:", err);
      toast.error("No se pudieron cargar los movimientos");
    }
  };

  const guardar = async (e) => {
    e.preventDefault();
    try {
      const val = parseInt(monto.replace(/\./g, '')) || 0;
      if (!val) return toast.error("Falta monto");
      let descFinal = desc; let benNombre = usuarios.find(u=>u.id===beneficiario)?.nombre_completo || 'Alguien';
      if(tipo==='base') descFinal = `Base entregada a: ${benNombre}`;
      if(tipo==='nomina') descFinal = `Pago Nómina a: ${benNombre} - ${desc}`;

      const { error } = await supabase.from('caja_movimientos').insert([{ tipo, descripcion: descFinal, monto: val, usuario_id: session.user.id, beneficiario: beneficiario || null }]);
      if (error) throw error;
      toast.success("Registrado"); setDesc(''); setMonto(''); setBeneficiario(''); cargar();
    } catch (err) {
      console.error("Error en VistaGastos.guardar:", err);
      toast.error("No se pudo registrar el movimiento");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full animate-fadeIn">
      <div className="bg-white p-8 rounded-xl shadow-lg h-fit">
        <h2 className="font-bold text-xl mb-4">Registro Financiero</h2>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {['gasto','nomina','base','ingreso_capital'].map(t => (
            <button key={t} type="button" onClick={()=>setTipo(t)} className={`p-2 text-xs font-bold rounded uppercase ${tipo===t ? 'bg-gray-800 text-white':'bg-gray-100 text-gray-500'}`}>{t.replace('_',' ')}</button>
          ))}
        </div>
        <form onSubmit={guardar} className="space-y-4">
          {(tipo==='base'||tipo==='nomina') && (
            <select className="w-full border p-2 rounded" value={beneficiario} onChange={e=>setBeneficiario(e.target.value)}>
              <option value="">-- Seleccionar Persona --</option>
              {usuarios.map(u=><option key={u.id} value={u.id}>{u.nombre_completo}</option>)}
            </select>
          )}
          <InputMoneda placeholder="Monto ($)" value={monto} onChange={setMonto} />
          {tipo!=='base' && <input className="w-full border p-3 rounded" placeholder="Descripción" value={desc} onChange={e=>setDesc(e.target.value)} />}
          <button className="w-full bg-blue-600 text-white py-3 rounded font-bold shadow">GUARDAR</button>
        </form>
      </div>

      <div className="bg-white p-6 rounded-xl shadow h-full overflow-y-auto hidden md:block">
        <div className="flex justify-between items-center border-b pb-2 mb-2">
            <h3 className="font-bold">📝 Movimientos del Día</h3>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="text-xs border rounded p-1" />
        </div>
        {historial.length === 0 && <p className="text-gray-400 text-center py-4">No hay movimientos.</p>}
        {historial.map(m=>(
           <div key={m.id} className="border-b py-2 flex justify-between items-center">
             <div>
                <span className={`text-[10px] px-2 rounded font-bold uppercase ${m.tipo.includes('ingreso')||m.tipo==='entrega_turno'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{m.tipo.replace('_',' ')}</span>
                <div className="text-xs font-bold mt-1">{m.descripcion}</div>
                <div className="text-[10px] text-gray-400">{new Date(m.creado_en).toLocaleTimeString('es-CO')} - Por: {m.nombreAutor}</div>
             </div>
             <div className="font-bold text-sm">{formatoMoneda(m.monto)}</div>
           </div>
        ))}
      </div>
    </div>
  );
};

const VistaCombos = () => {
  const [combos, setCombos] = useState([]);
  const [productos, setProductos] = useState([]);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalEditar, setModalEditar] = useState(null);
  const [form, setForm] = useState({ nombre: '', precio: '', items: [] });
  const [prodAgregar, setProdAgregar] = useState('');
  const [cantAgregar, setCantAgregar] = useState(1);
  const [buscarCombo, setBuscarCombo] = useState('');

  useEffect(() => { cargar(); cargarProductos(); }, []);
  const cargarProductos = async () => {
    try {
      const { data, error } = await supabase.from('productos').select('*').eq('activo', true).order('nombre');
      if (error) throw error;
      setProductos(data || []);
    } catch (err) { console.error("Error cargar productos:", err); }
  };
  const cargar = async () => {
    try {
      const { data, error } = await supabase.from('combos').select('*, combo_productos(producto_id, cantidad, productos(nombre))').order('nombre');
      if (error) throw error;
      setCombos(data || []);
    } catch (err) {
      console.error("Error en VistaCombos.cargar:", err);
      toast.error("No se pudieron cargar los combos");
    }
  };

  const agregarItemAlForm = () => {
    const idSeleccionado = prodAgregar?.trim?.() || prodAgregar;
    const cant = typeof cantAgregar === 'number' ? cantAgregar : parseInt(cantAgregar, 10) || 1;
    const prod = productos.find(p => String(p.id) === String(idSeleccionado));
    if (!prod) return toast.error("Selecciona un producto");
    if (cant < 1) return toast.error("La cantidad debe ser al menos 1");
    const yaExiste = form.items.find(i => String(i.producto_id) === String(prod.id));
    if (yaExiste) return toast.error("Ya agregaste este producto");
    setForm(f => ({ ...f, items: [...f.items, { producto_id: prod.id, nombre: prod.nombre, cantidad: cant }] }));
    setProdAgregar('');
    setCantAgregar(1);
  };

  const quitarItemDelForm = (productoId) => {
    setForm(f => ({ ...f, items: f.items.filter(i => i.producto_id !== productoId) }));
  };

  const guardarCombo = async (e) => {
    e.preventDefault();
    try {
      const precio = parseInt(form.precio.toString().replace(/\./g, '')) || 0;
      if (precio <= 0) return toast.error("Precio inválido");
      if (form.items.length < 2) return toast.error("Un combo debe tener al menos 2 productos");

      if (modalEditar) {
        const { error: errCombo } = await supabase.from('combos').update({ nombre: form.nombre, precio }).eq('id', modalEditar.id);
        if (errCombo) throw errCombo;
        await supabase.from('combo_productos').delete().eq('combo_id', modalEditar.id);
        const comboProductos = form.items.map(i => ({ combo_id: modalEditar.id, producto_id: i.producto_id, cantidad: i.cantidad }));
        const { error: errCP } = await supabase.from('combo_productos').insert(comboProductos);
        if (errCP) throw errCP;
        toast.success("Combo actualizado");
        setModalEditar(null);
      } else {
        const { data: combo, error: errCombo } = await supabase.from('combos').insert([{ nombre: form.nombre, precio, activo: true }]).select().single();
        if (errCombo) throw errCombo;
        const comboProductos = form.items.map(i => ({ combo_id: combo.id, producto_id: i.producto_id, cantidad: i.cantidad }));
        const { error: errCP } = await supabase.from('combo_productos').insert(comboProductos);
        if (errCP) throw errCP;
        toast.success("Combo creado");
        setModalNuevo(false);
      }
      setForm({ nombre: '', precio: '', items: [] });
      cargar();
    } catch (err) {
      console.error("Error en guardarCombo:", err);
      toast.error("No se pudo guardar el combo");
    }
  };

  const toggleCombo = async (c) => {
    try {
      const nuevoEstado = !c.activo;
      const { error } = await supabase.from('combos').update({ activo: nuevoEstado }).eq('id', c.id);
      if (error) throw error;
      toast.success(nuevoEstado ? "Combo activado" : "Combo desactivado");
      cargar();
    } catch (err) {
      console.error("Error en toggleCombo:", err);
      toast.error("No se pudo actualizar");
    }
  };

  const abrirEditar = (c) => {
    const items = (c.combo_productos || []).map(cp => ({
      producto_id: cp.producto_id,
      nombre: cp.productos?.nombre || 'Producto',
      cantidad: cp.cantidad || 1
    }));
    setForm({ nombre: c.nombre, precio: c.precio.toLocaleString('es-CO'), items });
    setModalEditar(c);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm">
        <h2 className="text-2xl font-bold text-gray-800">🍔 Combos</h2>
        <button onClick={() => { setModalNuevo(true); setForm({ nombre: '', precio: '', items: [] }); }} className="bg-purple-600 text-white px-4 py-2 rounded font-bold flex items-center gap-2"><Plus size={16}/> Nuevo Combo</button>
      </div>
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="p-3 border-b bg-gray-50 flex items-center gap-2">
          <Search size={18} className="text-gray-400"/>
          <input
            type="text"
            placeholder="Buscar combos por nombre o producto..."
            value={buscarCombo}
            onChange={e => setBuscarCombo(e.target.value)}
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
          />
          {buscarCombo && (
            <button onClick={() => setBuscarCombo('')} className="text-gray-400 hover:text-gray-600 p-1" title="Limpiar búsqueda">✕</button>
          )}
        </div>
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50"><tr><th className="p-3">Combo</th><th className="p-3">Productos</th><th className="p-3">Precio</th><th className="p-3 text-right">Acciones</th></tr></thead>
          <tbody>
            {combos
              .filter(c => {
                const q = buscarCombo.toLowerCase().trim();
                if (!q) return true;
                const nombreMatch = (c.nombre || '').toLowerCase().includes(q);
                const productosMatch = (c.combo_productos || []).some(cp => (cp.productos?.nombre || '').toLowerCase().includes(q));
                return nombreMatch || productosMatch;
              })
              .map(c => (
              <tr key={c.id} className={`border-b hover:bg-gray-50 ${!c.activo ? 'opacity-50 bg-gray-100' : ''}`}>
                <td className="p-3 font-bold flex items-center gap-2">
                  <Tag size={16} className="text-purple-500"/>
                  {c.nombre}
                  {!c.activo && <span className="text-[10px] bg-red-100 text-red-600 px-2 rounded font-bold">INACTIVO</span>}
                </td>
                <td className="p-3 text-gray-600 text-xs">{(c.combo_productos || []).map(cp => `${cp.productos?.nombre || '-'} x${cp.cantidad}`).join(' + ')}</td>
                <td className="p-3 font-bold text-green-600">{formatoMoneda(c.precio)}</td>
                <td className="p-3 text-right">
                  <button onClick={() => toggleCombo(c)} className={`p-2 rounded ${c.activo ? 'text-green-500 hover:bg-green-100' : 'text-gray-400 hover:bg-gray-200'}`} title={c.activo ? "Desactivar" : "Activar"}>{c.activo ? <Eye size={16}/> : <EyeOff size={16}/>}</button>
                  <button onClick={() => abrirEditar(c)} className="text-blue-500 hover:bg-blue-100 p-2 rounded ml-1"><Edit size={16}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(modalNuevo || modalEditar) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-md">
            <h3 className="font-bold text-lg mb-4">{modalEditar ? 'Editar Combo' : 'Nuevo Combo'}</h3>
            <form onSubmit={guardarCombo} className="space-y-4">
              <div><label className="text-xs font-bold text-gray-500">Nombre del Combo</label><input value={form.nombre} onChange={e=>setForm({...form, nombre:e.target.value})} placeholder="Ej: Combo Merienda" className="w-full border p-2 rounded" required/></div>
              <div><label className="text-xs font-bold text-gray-500">Precio del Combo</label><InputMoneda value={form.precio} onChange={v=>setForm({...form, precio:v})} placeholder="0" /></div>
              <div><label className="text-xs font-bold text-gray-500">Productos del Combo (mín. 2)</label>
                <div className="flex gap-2 mt-1">
                  <select
                    key={`combo-select-${form.items.length}`}
                    value={prodAgregar}
                    onChange={e => setProdAgregar(e.target.value)}
                    className="flex-1 border p-2 rounded text-sm"
                  >
                    <option value="">-- Selecciona otro producto --</option>
                    {productos
                      .filter(p => !form.items.some(i => String(i.producto_id) === String(p.id)))
                      .map(p => (
                        <option key={p.id} value={p.id}>{p.nombre}</option>
                      ))}
                  </select>
                  <input type="number" min="1" value={cantAgregar} onChange={e=>setCantAgregar(parseInt(e.target.value)||1)} className="w-16 border p-2 rounded text-sm" />
                  <button type="button" onClick={agregarItemAlForm} className="bg-purple-200 text-purple-800 px-4 py-2 rounded font-bold text-sm hover:bg-purple-300">+ Agregar</button>
                </div>
                <div className="mt-2 space-y-1">
                  {form.items.map(i=>(
                    <div key={i.producto_id} className="flex justify-between items-center bg-gray-50 p-2 rounded text-sm">
                      <span>{i.nombre} x{i.cantidad}</span>
                      <button type="button" onClick={()=>quitarItemDelForm(i.producto_id)} className="text-red-500 hover:bg-red-100 p-1 rounded"><Trash2 size={14}/></button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button type="button" onClick={()=>{setModalNuevo(false); setModalEditar(null);}} className="flex-1 bg-gray-100 py-2 rounded">Cancelar</button>
                <button type="submit" className="flex-1 bg-purple-600 text-white py-2 rounded font-bold">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const VistaHistorial = ({ usuarios }) => {
  const [fecha, setFecha] = useState(fechaHoy());
  const [lista, setLista] = useState([]);
  const [modalDetalle, setModalDetalle] = useState(null);
  const comprobanteRef = useRef(null);
  const [datosReimpresion, setDatosReimpresion] = useState(null);

  const handlePrint = useReactToPrint({
    contentRef: comprobanteRef,
    documentTitle: `Comprobante_Reimpresion_${new Date().toISOString().slice(0, 10)}`,
    pageStyle: '@page { size: 80mm auto; margin: 4mm; }'
  }); 

  useEffect(() => { cargar(); }, [fecha, usuarios]);
  
  const cargar = async () => {
    try {
      const inicioLocal = new Date(`${fecha}T00:00:00`);
      const finLocal = new Date(`${fecha}T23:59:59.999`);
      const inicio = inicioLocal.toISOString();
      const fin = finLocal.toISOString();
      const { data, error } = await supabase
        .from('ventas')
        .select(`
          *,
          perfiles(nombre_completo),
          detalle_ventas(cantidad, precio_unitario, productos(nombre)),
          detalle_venta_combos(cantidad, precio_unitario, combos(nombre, combo_productos(producto_id, cantidad, productos(nombre))))
        `)
        .gte('creado_en', inicio)
        .lte('creado_en', fin)
        .order('creado_en', { ascending: false });
      if (error) throw error;
      const ventasMapeadas = (data || []).map(x => ({
        ...x,
        tipo: 'VENTA',
        esIngreso: true,
        desc: 'Venta productos',
        autor: x.perfiles?.nombre_completo || usuarios.find(u => u.id === x.cajero_id)?.nombre_completo || 'Cajero',
        detalleProductos: x.detalle_ventas || [],
        detalleCombos: x.detalle_venta_combos || []
      }));
      setLista(ventasMapeadas);
    } catch (e) {
      console.error("Error cargando ventas del día:", e);
      toast.error("No se pudieron cargar las ventas");
      setLista([]);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow overflow-hidden animate-fadeIn">
      <div className="p-4 border-b flex justify-between items-center bg-gray-50">
        <h2 className="font-bold text-lg">Ventas del Día</h2>
        <input type="date" value={fecha} onChange={e=>setFecha(e.target.value)} className="border p-1 rounded font-bold"/>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <table className="w-full text-sm text-left">
          <thead className="text-gray-500"><tr><th>Hora</th><th>Tipo</th><th>Descripción</th><th>Responsable</th><th className="text-right">Monto</th><th className="text-center">Ver</th><th className="text-center">Imprimir</th></tr></thead>
          <tbody className="divide-y">
            {lista.length === 0 ? <tr><td colSpan="7" className="p-8 text-center text-gray-400">Sin datos para esta fecha.</td></tr> :
            lista.map((x,i)=>(
              <tr key={i} className="hover:bg-gray-50">
                <td className="p-3 text-gray-400 text-xs">{new Date(x.creado_en).toLocaleTimeString('es-CO')}</td>
                <td className="p-3"><span className="bg-gray-100 px-2 py-1 rounded text-[10px] font-bold">{x.tipo}</span></td>
                <td className="p-3 font-medium">{x.desc}</td>
                <td className="p-3 text-xs">{x.autor}</td>
                <td className={`p-3 text-right font-bold ${x.esIngreso?'text-green-600':'text-red-600'}`}>{x.esIngreso?'+':'-'}{formatoMoneda(x.esIngreso ? x.total||x.monto : x.monto)}</td>
                <td className="p-3 text-center">
                    {x.tipo === 'VENTA' && (x.detalleProductos?.length > 0 || x.detalleCombos?.length > 0) && (
                        <button onClick={() => setModalDetalle(x)} className="text-blue-500 hover:bg-blue-100 p-2 rounded-full" title="Ver detalle"><Eye size={16}/></button>
                    )}
                </td>
                <td className="p-3 text-center">
                    {x.tipo === 'VENTA' && (x.detalleProductos?.length > 0 || x.detalleCombos?.length > 0) && (
                        <button
                          onClick={() => {
                            const items = [];
                            (x.detalleProductos || []).forEach((d, idx) => {
                              items.push({
                                id: d.producto_id || `prod-${idx}`,
                                nombre: d.productos?.nombre || 'Producto',
                                cantidad: d.cantidad,
                                precio: d.precio_unitario,
                                cantidadArticulos: d.cantidad
                              });
                            });
                            (x.detalleCombos || []).forEach((d, idx) => {
                              const comboData = d.combos || d.combo;
                              const comboProductos = comboData?.combo_productos || [];
                              const comboSubtotal = d.cantidad * d.precio_unitario;
                              items.push({
                                id: `combo-header-${d.combo_id}-${idx}`,
                                nombre: comboData?.nombre || 'Combo',
                                cantidad: '-',
                                precio: '-',
                                subtotal: comboSubtotal,
                                esComboHeader: true,
                                cantidadArticulos: 0
                              });
                              comboProductos.forEach((cp, cpIdx) => {
                                const nom = cp.productos?.nombre || 'Producto';
                                const qty = (cp.cantidad || 1) * d.cantidad;
                                items.push({
                                  id: `combo-prod-${cp.producto_id}-${cpIdx}`,
                                  nombre: `*${nom}`,
                                  cantidad: qty,
                                  precio: 0,
                                  subtotal: 0,
                                  esComboDetalle: true,
                                  cantidadArticulos: qty
                                });
                              });
                            });
                            setDatosReimpresion({
                              items,
                              total: x.total,
                              pagoCon: 0,
                              cambio: 0,
                              numeroVenta: x.numero_venta ?? x.id?.slice(-8),
                              metodoPago: x.metodo_pago || 'efectivo',
                              esReimpresion: true,
                              fecha: x.creado_en
                            });
                            toast.success('Abriendo impresión...');
                            setTimeout(() => handlePrint(), 150);
                          }}
                          className="text-purple-500 hover:bg-purple-100 p-2 rounded-full"
                          title="Reimprimir comprobante"
                        >
                          <Printer size={16}/>
                        </button>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        <div ref={comprobanteRef}>
          <ComprobanteVenta datos={datosReimpresion} />
        </div>
      </div>

      {modalDetalle && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-sm">
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h3 className="font-bold text-lg">Detalle de Venta</h3>
                    <button onClick={()=>setModalDetalle(null)}><X className="text-gray-400"/></button>
                </div>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                    {(modalDetalle.detalleProductos || []).map((d, idx) => (
                        <div key={`p-${idx}`} className="flex justify-between items-center text-sm border-b border-dashed pb-2">
                            <div>
                                <div className="font-bold">{d.productos?.nombre || 'Producto'}</div>
                                <div className="text-xs text-gray-500">{d.cantidad} x {formatoMoneda(d.precio_unitario)}</div>
                            </div>
                            <div className="font-bold">{formatoMoneda(d.cantidad * d.precio_unitario)}</div>
                        </div>
                    ))}
                    {(modalDetalle.detalleCombos || []).map((d, idx) => (
                        <div key={`c-${idx}`} className="flex justify-between items-center text-sm border-b border-dashed pb-2">
                            <div>
                                <div className="font-bold text-purple-700">{(d.combos || d.combo)?.nombre || 'Combo'}</div>
                                {((d.combos || d.combo)?.combo_productos || []).length > 0 && (
                                    <div className="text-xs text-gray-500">{((d.combos || d.combo)?.combo_productos || []).map(cp => cp.productos?.nombre).filter(Boolean).join(' + ')}</div>
                                )}
                                <div className="text-xs text-gray-500">{d.cantidad} x {formatoMoneda(d.precio_unitario)}</div>
                            </div>
                            <div className="font-bold">{formatoMoneda(d.cantidad * d.precio_unitario)}</div>
                        </div>
                    ))}
                </div>
                <div className="mt-4 pt-2 border-t flex justify-between items-center text-xl font-bold">
                    <span>Total</span>
                    <span className="text-blue-600">{formatoMoneda(modalDetalle.total)}</span>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// 3. COMPONENTE PRINCIPAL (MAIN LAYOUT RESPONSIVE)
// ==========================================

const PanelAdmin = ({ session }) => {
  const [tabActual, setTabActual] = useState('dashboard');
  const [usuarios, setUsuarios] = useState([]);
  const [menuAbierto, setMenuAbierto] = useState(false); // Estado para menú móvil

  useEffect(() => { cargarUsuarios(); }, []);
  const cargarUsuarios = async () => {
    try {
      const { data, error } = await supabase.from('perfiles').select('id, nombre_completo, email');
      if (error) throw error;
      if (data) setUsuarios(data);
    } catch (err) {
      console.error("Error en cargarUsuarios:", err);
    }
  };

  const cambiarTab = (tab) => {
      setTabActual(tab);
      setMenuAbierto(false); // Cerrar menú al seleccionar en móvil
  };

  return (
    <div className="flex h-screen bg-gray-100 font-sans text-gray-800 overflow-hidden">
      <Toaster position="bottom-right" />
      
      {/* BOTÓN HAMBURGUESA (SOLO MÓVIL) */}
      <div className="lg:hidden fixed top-0 left-0 w-full bg-gray-900 text-white p-4 flex justify-between items-center z-40 shadow-md">
          <span className="font-bold text-orange-500">ADMINISTRACIÓN</span>
          <button onClick={() => setMenuAbierto(!menuAbierto)}><Menu /></button>
      </div>

      {/* OVERLAY OSCURO (CUANDO EL MENÚ ESTÁ ABIERTO EN MÓVIL) */}
      {menuAbierto && (
          <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMenuAbierto(false)}></div>
      )}

      {/* SIDEBAR (MENÚ LATERAL) */}
      <div className={`
          fixed lg:static inset-y-0 left-0 w-64 bg-gray-900 text-white flex flex-col p-4 shadow-xl z-50 transform transition-transform duration-300 ease-in-out
          ${menuAbierto ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex justify-between items-center mb-8 border-b border-gray-700 pb-4">
            <h2 className="text-xl font-bold text-orange-500 text-center w-full">ADMINISTRACIÓN</h2>
            <button className="lg:hidden text-gray-400" onClick={() => setMenuAbierto(false)}><X /></button>
        </div>
        
        <nav className="space-y-2 flex-1">
          <BotonMenu icon={<LayoutDashboard />} label="Resumen General" active={tabActual === 'dashboard'} onClick={() => cambiarTab('dashboard')} />
          <BotonMenu icon={<CheckCircle />} label="Cierres de Caja" active={tabActual === 'cierres'} onClick={() => cambiarTab('cierres')} />
          <BotonMenu icon={<Package />} label="Bodega Y Productos" active={tabActual === 'bodega'} onClick={() => cambiarTab('bodega')} />
          <BotonMenu icon={<Tag />} label="Combos" active={tabActual === 'combos'} onClick={() => cambiarTab('combos')} />
          <BotonMenu icon={<DollarSign />} label="Caja Y Nómina" active={tabActual === 'gastos'} onClick={() => cambiarTab('gastos')} />
          <BotonMenu icon={<Calendar />} label="Ventas del Día" active={tabActual === 'historial'} onClick={() => cambiarTab('historial')} />
        </nav>

        {/* Botón de Salir */}
        <button onClick={() => supabase.auth.signOut()} className="mt-auto flex items-center gap-2 text-red-400 hover:text-red-300 p-2 text-sm font-bold">
            <X size={16}/> Cerrar Sesión
        </button>
      </div>

      {/* CONTENIDO PRINCIPAL */}
      <div className="flex-1 flex flex-col h-full overflow-hidden w-full relative pt-16 lg:pt-0">
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50">
            {tabActual === 'dashboard' && <VistaDashboard />}
            {tabActual === 'cierres' && <VistaCierres session={session} usuarios={usuarios} />}
            {tabActual === 'bodega' && <VistaBodega session={session} usuarios={usuarios} />}
            {tabActual === 'combos' && <VistaCombos />}
            {tabActual === 'gastos' && <VistaGastos session={session} usuarios={usuarios} />}
            {tabActual === 'historial' && <VistaHistorial usuarios={usuarios} />}
        </div>
      </div>
    </div>
  );
};

export default PanelAdmin;