import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Clock, LogIn, LogOut, Save, Calculator, User, DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';

// ==========================================
// UTILIDADES
// ==========================================

const formatoMoneda = (valor) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor || 0);

/** Colombia no usa horario de verano; anclamos filtros/vistas a esta zona (no a UTC ni al navegador). */
const TZ_COLOMBIA = 'America/Bogota';
const OFFSET_COLOMBIA = '-05:00';

/** Fecha de hoy en Colombia → YYYY-MM-DD */
const fechaHoyLocal = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: TZ_COLOMBIA });

/**
 * Inicio/fin del día civil en Colombia → ISO UTC para filtrar TIMESTAMPTZ en Supabase.
 * Así "27 jul" = 27 jul 00:00–23:59:59.999 hora Colombia, no UTC.
 */
const inicioDelDiaISO = (fechaYYYYMMDD) =>
  new Date(`${fechaYYYYMMDD}T00:00:00.000${OFFSET_COLOMBIA}`).toISOString();

const finDelDiaISO = (fechaYYYYMMDD) =>
  new Date(`${fechaYYYYMMDD}T23:59:59.999${OFFSET_COLOMBIA}`).toISOString();

/** Fecha civil en Colombia a partir de un timestamptz (evita .slice UTC). */
const fechaLocalDesdeISO = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ_COLOMBIA });
};

const formatearHora = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ_COLOMBIA,
  });
};

const horasEntre = (horaEntrada, horaSalida) => {
  if (!horaEntrada || !horaSalida) return 0;
  const ms = new Date(horaSalida).getTime() - new Date(horaEntrada).getTime();
  if (ms <= 0) return 0;
  return Math.round((ms / (1000 * 60 * 60)) * 100) / 100; // 2 decimales (ej: 8.5)
};

// ==========================================
// LÓGICA / "BACKEND" (Supabase)
// ==========================================

/**
 * Busca el registro abierto de hoy (entrada sin salida) de un empleado.
 */
export async function obtenerRegistroAbiertoHoy(empleadoId) {
  const hoy = fechaHoyLocal();
  const { data, error } = await supabase
    .from('registros_asistencia')
    .select('*')
    .eq('empleado_id', empleadoId)
    .is('hora_salida', null)
    .gte('hora_entrada', inicioDelDiaISO(hoy))
    .lte('hora_entrada', finDelDiaISO(hoy))
    .order('hora_entrada', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Registra entrada o salida según el estado actual del empleado.
 * - Sin registro abierto hoy → crea entrada
 * - Con entrada sin salida → actualiza salida
 */
export async function registrarEntradaOSalida(empleadoId, adminId) {
  const abierto = await obtenerRegistroAbiertoHoy(empleadoId);
  const ahora = new Date().toISOString();

  if (!abierto) {
    const { data, error } = await supabase
      .from('registros_asistencia')
      .insert([{
        empleado_id: empleadoId,
        hora_entrada: ahora,
        hora_salida: null,
        registrado_por: adminId,
      }])
      .select()
      .single();
    if (error) throw error;
    return { accion: 'entrada', registro: data };
  }

  const { data, error } = await supabase
    .from('registros_asistencia')
    .update({ hora_salida: ahora })
    .eq('id', abierto.id)
    .select()
    .single();
  if (error) throw error;
  return { accion: 'salida', registro: data };
}

/**
 * Calcula la nómina quincenal de un empleado.
 * @returns {{ totalHoras, tarifaPorHora, totalPagar, detalle }}
 */
export async function calcularNominaQuincenal(empleadoId, fechaInicio, fechaFin) {
  const { data: perfil, error: errPerfil } = await supabase
    .from('perfiles')
    .select('id, nombre_completo, tarifa_por_hora')
    .eq('id', empleadoId)
    .single();
  if (errPerfil) throw errPerfil;

  const tarifaPorHora = Number(perfil?.tarifa_por_hora) || 0;

  const { data: registros, error } = await supabase
    .from('registros_asistencia')
    .select('*')
    .eq('empleado_id', empleadoId)
    .gte('hora_entrada', inicioDelDiaISO(fechaInicio))
    .lte('hora_entrada', finDelDiaISO(fechaFin))
    .order('hora_entrada', { ascending: true });
  if (error) throw error;

  const detalle = (registros || []).map((r) => {
    const horas = horasEntre(r.hora_entrada, r.hora_salida);
    return {
      id: r.id,
      fecha: fechaLocalDesdeISO(r.hora_entrada),
      hora_entrada: r.hora_entrada,
      hora_salida: r.hora_salida,
      horas,
      cerrado: Boolean(r.hora_salida),
    };
  });

  const totalHoras = detalle
    .filter((d) => d.cerrado)
    .reduce((acc, d) => acc + d.horas, 0);

  const totalHorasRedondeado = Math.round(totalHoras * 100) / 100;
  const totalPagar = Math.round(totalHorasRedondeado * tarifaPorHora);

  return {
    empleado: perfil,
    totalHoras: totalHorasRedondeado,
    tarifaPorHora,
    totalPagar,
    detalle,
  };
}

export async function guardarTarifaEmpleado(empleadoId, tarifaPorHora) {
  const valor = Number(tarifaPorHora);
  if (Number.isNaN(valor) || valor < 0) throw new Error('Tarifa inválida');

  const { error } = await supabase
    .from('perfiles')
    .update({ tarifa_por_hora: valor })
    .eq('id', empleadoId);
  if (error) throw error;
}

// ==========================================
// UI — PANEL ADMIN
// ==========================================

const PanelAsistenciaNomina = ({ session, usuarios }) => {
  const [empleados, setEmpleados] = useState([]);
  const [empleadoAsistencia, setEmpleadoAsistencia] = useState('');
  const [registroAbierto, setRegistroAbierto] = useState(null);
  const [cargandoBoton, setCargandoBoton] = useState(false);
  const [historialHoy, setHistorialHoy] = useState([]);

  const [tarifasEdit, setTarifasEdit] = useState({});
  const [guardandoTarifa, setGuardandoTarifa] = useState(null);

  const [empleadoNomina, setEmpleadoNomina] = useState('');
  const [fechaInicio, setFechaInicio] = useState(() => {
    const d = new Date();
    const dia = d.getDate();
    if (dia <= 15) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-16`;
  });
  const [fechaFin, setFechaFin] = useState(fechaHoyLocal());
  const [resultadoNomina, setResultadoNomina] = useState(null);
  const [calculando, setCalculando] = useState(false);

  useEffect(() => {
    cargarEmpleados();
  }, [usuarios]);

  useEffect(() => {
    if (empleadoAsistencia) {
      refrescarEstadoAsistencia(empleadoAsistencia);
    } else {
      setRegistroAbierto(null);
      setHistorialHoy([]);
    }
  }, [empleadoAsistencia]);

  const cargarEmpleados = async () => {
    try {
      const { data, error } = await supabase
        .from('perfiles')
        .select('id, nombre_completo, email, rol, tarifa_por_hora')
        .order('nombre_completo');
      if (error) throw error;
      const lista = data || usuarios || [];
      setEmpleados(lista);
      const mapa = {};
      lista.forEach((e) => {
        mapa[e.id] = e.tarifa_por_hora != null ? String(e.tarifa_por_hora) : '';
      });
      setTarifasEdit(mapa);
    } catch (err) {
      console.error('Error cargando empleados:', err);
      toast.error('No se pudieron cargar los empleados. ¿Ejecutaste el SQL de tarifa_por_hora?');
      setEmpleados(usuarios || []);
    }
  };

  const refrescarEstadoAsistencia = async (empleadoId) => {
    try {
      const abierto = await obtenerRegistroAbiertoHoy(empleadoId);
      setRegistroAbierto(abierto);

      const hoy = fechaHoyLocal();
      const { data, error } = await supabase
        .from('registros_asistencia')
        .select('*')
        .eq('empleado_id', empleadoId)
        .gte('hora_entrada', inicioDelDiaISO(hoy))
        .lte('hora_entrada', finDelDiaISO(hoy))
        .order('hora_entrada', { ascending: true });
      if (error) throw error;
      setHistorialHoy(data || []);
    } catch (err) {
      console.error('Error estado asistencia:', err);
      toast.error('Error al consultar asistencia. Verifica que exista la tabla registros_asistencia.');
    }
  };

  const handleRegistrar = async () => {
    if (!empleadoAsistencia) return toast.error('Selecciona un empleado');
    setCargandoBoton(true);
    try {
      const { accion } = await registrarEntradaOSalida(empleadoAsistencia, session.user.id);
      toast.success(accion === 'entrada' ? 'Entrada registrada' : 'Salida registrada');
      await refrescarEstadoAsistencia(empleadoAsistencia);
    } catch (err) {
      console.error('Error registrando asistencia:', err);
      toast.error(err.message || 'No se pudo registrar');
    } finally {
      setCargandoBoton(false);
    }
  };

  const handleGuardarTarifa = async (empleadoId) => {
    const raw = tarifasEdit[empleadoId];
    const valor = parseInt(String(raw).replace(/\D/g, ''), 10) || 0;
    setGuardandoTarifa(empleadoId);
    try {
      await guardarTarifaEmpleado(empleadoId, valor);
      toast.success('Tarifa guardada');
      await cargarEmpleados();
    } catch (err) {
      console.error('Error guardando tarifa:', err);
      toast.error(err.message || 'No se pudo guardar la tarifa');
    } finally {
      setGuardandoTarifa(null);
    }
  };

  const handleCalcularNomina = async (e) => {
    e.preventDefault();
    if (!empleadoNomina) return toast.error('Selecciona un empleado');
    if (!fechaInicio || !fechaFin) return toast.error('Indica el rango de fechas');
    if (fechaInicio > fechaFin) return toast.error('La fecha inicio no puede ser mayor a la fin');

    setCalculando(true);
    setResultadoNomina(null);
    try {
      const resultado = await calcularNominaQuincenal(empleadoNomina, fechaInicio, fechaFin);
      setResultadoNomina(resultado);
      if (resultado.tarifaPorHora <= 0) {
        toast('El empleado no tiene tarifa por hora configurada', { icon: '⚠️' });
      }
    } catch (err) {
      console.error('Error calculando nómina:', err);
      toast.error(err.message || 'No se pudo calcular la nómina');
    } finally {
      setCalculando(false);
    }
  };

  const tieneEntradaAbierta = Boolean(registroAbierto);

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="bg-white p-4 rounded-xl shadow-sm flex items-center gap-3">
        <Clock className="text-indigo-600" />
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Asistencia y Nómina</h2>
          <p className="text-sm text-gray-500">El administrador registra entradas/salidas y calcula el pago quincenal.</p>
        </div>
      </div>

      {/* ——— ASISTENCIA ——— */}
      <section className="bg-white p-6 rounded-xl shadow-lg space-y-4">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <User size={18} className="text-indigo-500" /> Registrar asistencia
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="text-xs font-bold text-gray-500">Empleado</label>
            <select
              className="w-full border p-3 rounded-lg mt-1"
              value={empleadoAsistencia}
              onChange={(e) => setEmpleadoAsistencia(e.target.value)}
            >
              <option value="">-- Seleccionar empleado --</option>
              {empleados.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre_completo || u.email} {u.rol ? `(${u.rol})` : ''}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            disabled={!empleadoAsistencia || cargandoBoton}
            onClick={handleRegistrar}
            className={`w-full py-3 rounded-lg font-bold text-white flex items-center justify-center gap-2 shadow disabled:opacity-50 ${
              tieneEntradaAbierta ? 'bg-orange-600 hover:bg-orange-700' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {tieneEntradaAbierta ? <LogOut size={18} /> : <LogIn size={18} />}
            {cargandoBoton
              ? 'Guardando...'
              : tieneEntradaAbierta
                ? 'Registrar Salida'
                : 'Registrar Entrada'}
          </button>
        </div>

        {empleadoAsistencia && (
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 text-xs font-bold text-gray-500 uppercase">
              Registros de hoy ({fechaHoyLocal()})
            </div>
            {historialHoy.length === 0 ? (
              <p className="p-4 text-sm text-gray-400 text-center">Sin registros hoy</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="p-3">Entrada</th>
                    <th className="p-3">Salida</th>
                    <th className="p-3">Horas</th>
                    <th className="p-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {historialHoy.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-3 font-medium">{formatearHora(r.hora_entrada)}</td>
                      <td className="p-3">{formatearHora(r.hora_salida)}</td>
                      <td className="p-3">{r.hora_salida ? `${horasEntre(r.hora_entrada, r.hora_salida)} h` : '—'}</td>
                      <td className="p-3">
                        {r.hora_salida ? (
                          <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-1 rounded">CERRADO</span>
                        ) : (
                          <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-1 rounded">ABIERTO</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>

      {/* ——— TARIFAS ——— */}
      <section className="bg-white p-6 rounded-xl shadow-lg space-y-4">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <DollarSign size={18} className="text-green-600" /> Tarifa por hora
        </h3>
        <p className="text-sm text-gray-500">Define cuánto se paga por hora a cada empleado.</p>

        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-3">Empleado</th>
                <th className="p-3">Rol</th>
                <th className="p-3">Tarifa / hora (COP)</th>
                <th className="p-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {empleados.map((emp) => (
                <tr key={emp.id} className="border-t">
                  <td className="p-3 font-bold">{emp.nombre_completo || emp.email}</td>
                  <td className="p-3 uppercase text-xs text-gray-500">{emp.rol || '—'}</td>
                  <td className="p-3">
                    <div className="relative max-w-[180px]">
                      <span className="absolute left-3 top-2.5 text-gray-400 font-bold">$</span>
                      <input
                        type="text"
                        className="w-full border p-2 pl-7 rounded-lg font-bold"
                        value={
                          tarifasEdit[emp.id]
                            ? Number(String(tarifasEdit[emp.id]).replace(/\D/g, '') || 0).toLocaleString('es-CO')
                            : ''
                        }
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, '');
                          setTarifasEdit((prev) => ({ ...prev, [emp.id]: raw }));
                        }}
                        placeholder="0"
                      />
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleGuardarTarifa(emp.id)}
                      disabled={guardandoTarifa === emp.id}
                      className="inline-flex items-center gap-1 bg-blue-600 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Save size={14} />
                      {guardandoTarifa === emp.id ? '...' : 'Guardar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ——— NÓMINA QUINCENAL ——— */}
      <section className="bg-white p-6 rounded-xl shadow-lg space-y-4">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Calculator size={18} className="text-purple-600" /> Nómina quincenal
        </h3>

        <form onSubmit={handleCalcularNomina} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="text-xs font-bold text-gray-500">Empleado</label>
            <select
              className="w-full border p-3 rounded-lg mt-1"
              value={empleadoNomina}
              onChange={(e) => setEmpleadoNomina(e.target.value)}
            >
              <option value="">-- Seleccionar --</option>
              {empleados.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre_completo || u.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500">Fecha inicio</label>
            <input
              type="date"
              className="w-full border p-3 rounded-lg mt-1"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500">Fecha fin</label>
            <input
              type="date"
              className="w-full border p-3 rounded-lg mt-1"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={calculando}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-lg font-bold shadow disabled:opacity-50"
          >
            {calculando ? 'Calculando...' : 'Calcular'}
          </button>
        </form>

        {resultadoNomina && (
          <div className="space-y-4 border-t pt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-indigo-50 p-4 rounded-xl">
                <div className="text-xs font-bold text-indigo-500 uppercase">Total horas</div>
                <div className="text-2xl font-bold text-indigo-800">{resultadoNomina.totalHoras} h</div>
              </div>
              <div className="bg-green-50 p-4 rounded-xl">
                <div className="text-xs font-bold text-green-600 uppercase">Tarifa / hora</div>
                <div className="text-2xl font-bold text-green-800">{formatoMoneda(resultadoNomina.tarifaPorHora)}</div>
              </div>
              <div className="bg-purple-50 p-4 rounded-xl">
                <div className="text-xs font-bold text-purple-600 uppercase">Total a pagar</div>
                <div className="text-2xl font-bold text-purple-800">{formatoMoneda(resultadoNomina.totalPagar)}</div>
              </div>
            </div>

            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="p-3">Fecha</th>
                    <th className="p-3">Entrada</th>
                    <th className="p-3">Salida</th>
                    <th className="p-3">Horas</th>
                    <th className="p-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {resultadoNomina.detalle.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-gray-400">
                        No hay registros en ese rango
                      </td>
                    </tr>
                  ) : (
                    resultadoNomina.detalle.map((d) => (
                      <tr key={d.id} className="border-t">
                        <td className="p-3 font-medium">{d.fecha}</td>
                        <td className="p-3">{formatearHora(d.hora_entrada)}</td>
                        <td className="p-3">{formatearHora(d.hora_salida)}</td>
                        <td className="p-3 font-bold">{d.cerrado ? `${d.horas} h` : '—'}</td>
                        <td className="p-3">
                          {d.cerrado ? (
                            <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-1 rounded">OK</span>
                          ) : (
                            <span className="text-[10px] font-bold bg-yellow-100 text-yellow-700 px-2 py-1 rounded">SIN SALIDA</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default PanelAsistenciaNomina;
