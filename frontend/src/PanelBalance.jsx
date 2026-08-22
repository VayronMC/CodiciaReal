import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Scale, TrendingUp, TrendingDown, Calendar, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

const formatoMoneda = (valor) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor || 0);

const TZ_COLOMBIA = 'America/Bogota';
const OFFSET_COLOMBIA = '-05:00';

const MESES = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const fechaHoyColombia = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: TZ_COLOMBIA });

/** Mes actual en Colombia → { anio, mes } */
const mesActualColombia = () => {
  const hoy = fechaHoyColombia(); // YYYY-MM-DD
  const [anio, mes] = hoy.split('-').map(Number);
  return { anio, mes };
};

/** Primer y último instante del mes (hora Colombia) → ISO UTC */
const rangoMesISO = (anio, mes) => {
  const mm = String(mes).padStart(2, '0');
  const inicio = new Date(`${anio}-${mm}-01T00:00:00.000${OFFSET_COLOMBIA}`).toISOString();
  const ultimoDia = new Date(anio, mes, 0).getDate(); // mes es 1-12; Date usa mes 0-index → new Date(y, mes, 0) = último día del mes
  const dd = String(ultimoDia).padStart(2, '0');
  const fin = new Date(`${anio}-${mm}-${dd}T23:59:59.999${OFFSET_COLOMBIA}`).toISOString();
  return { inicio, fin };
};

/**
 * Supabase/PostgREST limita ~1000 filas por request.
 * Sin paginar, en producción se subcuentan movimientos → totales incompletos.
 */
async function fetchAllRows(buildQuery) {
  const pageSize = 1000;
  let from = 0;
  const all = [];

  for (;;) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

/**
 * Resultado del mes (como el cuaderno físico):
 * Ingresos = ventas de todos los métodos + ingreso_capital
 * Egresos  = gasto + nómina
 * No usa bases ni entregas de turno (son movimiento interno de caja).
 */
export async function calcularBalanceMes(anio, mes) {
  const { inicio, fin } = rangoMesISO(anio, mes);

  const ventas = await fetchAllRows(() =>
    supabase
      .from('ventas')
      .select('total, metodo_pago')
      .gte('creado_en', inicio)
      .lte('creado_en', fin)
      .order('creado_en', { ascending: true })
  );

  const movs = await fetchAllRows(() =>
    supabase
      .from('caja_movimientos')
      .select('tipo, monto')
      .gte('creado_en', inicio)
      .lte('creado_en', fin)
      .in('tipo', ['gasto', 'nomina', 'ingreso_capital'])
      .order('creado_en', { ascending: true })
  );

  const totalVentas = ventas.reduce((s, v) => s + (Number(v.total) || 0), 0);
  const ventasPorMetodo = ventas.reduce((acc, v) => {
    const m = (v.metodo_pago || 'efectivo').toLowerCase();
    acc[m] = (acc[m] || 0) + (Number(v.total) || 0);
    return acc;
  }, {});
  const totalCapital = movs
    .filter((m) => m.tipo === 'ingreso_capital')
    .reduce((s, m) => s + (Number(m.monto) || 0), 0);
  const totalGastos = movs
    .filter((m) => m.tipo === 'gasto')
    .reduce((s, m) => s + (Number(m.monto) || 0), 0);
  const totalNomina = movs
    .filter((m) => m.tipo === 'nomina')
    .reduce((s, m) => s + (Number(m.monto) || 0), 0);

  const totalIngresos = totalVentas + totalCapital;
  const totalEgresos = totalGastos + totalNomina;
  const resultado = totalIngresos - totalEgresos;

  return {
    anio,
    mes,
    totalIngresos,
    totalEgresos,
    resultado,
    totalVentas,
    totalCapital,
    totalGastos,
    totalNomina,
    ventasPorMetodo,
    cantVentas: ventas.length,
    cantMovs: movs.length,
  };
}

/** Lista de meses ya terminados (anteriores al actual) desde un mes de inicio. */
const mesesPendientesHasta = (desdeAnio, desdeMes, anioActual, mesActual) => {
  const lista = [];
  let a = desdeAnio;
  let m = desdeMes;
  while (a < anioActual || (a === anioActual && m < mesActual)) {
    lista.push({ anio: a, mes: m });
    m += 1;
    if (m > 12) {
      m = 1;
      a += 1;
    }
  }
  return lista;
};

/**
 * Cierre automático (lazy): guarda balances de meses ya terminados que aún no existan.
 * No cierra el mes en curso.
 */
export async function cerrarMesesPendientes() {
  const { anio: anioActual, mes: mesActual } = mesActualColombia();

  const { data: existentes, error: errEx } = await supabase
    .from('balances_mensuales')
    .select('anio, mes');
  if (errEx) throw errEx;

  const setKey = new Set((existentes || []).map((b) => `${b.anio}-${b.mes}`));

  const { data: primeraVenta } = await supabase
    .from('ventas')
    .select('creado_en')
    .order('creado_en', { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: primerMov } = await supabase
    .from('caja_movimientos')
    .select('creado_en')
    .in('tipo', ['gasto', 'nomina', 'ingreso_capital'])
    .order('creado_en', { ascending: true })
    .limit(1)
    .maybeSingle();

  const fechas = [primeraVenta?.creado_en, primerMov?.creado_en].filter(Boolean);
  if (fechas.length === 0) return { cerrados: 0 };

  const masAntigua = fechas.sort()[0];
  const fechaLocal = new Date(masAntigua).toLocaleDateString('en-CA', { timeZone: TZ_COLOMBIA });
  const [desdeAnio, desdeMes] = fechaLocal.split('-').map(Number);

  const pendientes = mesesPendientesHasta(desdeAnio, desdeMes, anioActual, mesActual)
    .filter((x) => !setKey.has(`${x.anio}-${x.mes}`));

  let cerrados = 0;
  for (const { anio, mes } of pendientes) {
    const calc = await calcularBalanceMes(anio, mes);
    // Solo guardar si hubo movimiento o dejar snapshot en 0 también (mejor historial completo)
    const { error } = await supabase.from('balances_mensuales').insert([{
      anio: calc.anio,
      mes: calc.mes,
      total_ingresos: calc.totalIngresos,
      total_egresos: calc.totalEgresos,
      resultado: calc.resultado,
      cerrado_en: new Date().toISOString(),
    }]);
    if (error) {
      // Si otro admin lo cerró en paralelo, ignorar unique violation
      if (error.code !== '23505') throw error;
    } else {
      cerrados += 1;
    }
  }

  return { cerrados };
}

/**
 * Recalcula TODOS los balances ya guardados:
 * (ventas + capital) − (gastos + nómina).
 */
export async function recalcularTodosLosBalances() {
  const { data: existentes, error: errEx } = await supabase
    .from('balances_mensuales')
    .select('id, anio, mes');
  if (errEx) throw errEx;

  let actualizados = 0;
  for (const b of existentes || []) {
    const calc = await calcularBalanceMes(b.anio, b.mes);
    const { error } = await supabase
      .from('balances_mensuales')
      .update({
        total_ingresos: calc.totalIngresos,
        total_egresos: calc.totalEgresos,
        resultado: calc.resultado,
        cerrado_en: new Date().toISOString(),
      })
      .eq('id', b.id);
    if (error) throw error;
    actualizados += 1;
  }

  const { cerrados } = await cerrarMesesPendientes();
  return { actualizados, cerrados };
}

const PanelBalance = ({ session }) => {
  const [cargando, setCargando] = useState(true);
  const [recalculando, setRecalculando] = useState(false);
  const [mesEnCurso, setMesEnCurso] = useState(null);
  const [historicos, setHistoricos] = useState([]);
  const [filtroAnio, setFiltroAnio] = useState(() => mesActualColombia().anio);

  useEffect(() => {
    inicializar();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!cargando) cargarHistoricos();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroAnio]);

  const inicializar = async () => {
    setCargando(true);
    try {
      const { cerrados } = await cerrarMesesPendientes();
      if (cerrados > 0) {
        toast.success(`${cerrados} mes(es) cerrado(s) automáticamente`);
      }
      await cargarMesEnCurso();
      await cargarHistoricos();
    } catch (err) {
      console.error('Error en Balance:', err);
      toast.error(err.message || 'Error al cargar balances. ¿Ejecutaste sql_balances.sql?');
    } finally {
      setCargando(false);
    }
  };

  const cargarMesEnCurso = async () => {
    const { anio, mes } = mesActualColombia();
    const calc = await calcularBalanceMes(anio, mes);
    setMesEnCurso(calc);
  };

  const cargarHistoricos = async () => {
    const { data, error } = await supabase
      .from('balances_mensuales')
      .select('*')
      .eq('anio', filtroAnio)
      .order('mes', { ascending: false });
    if (error) throw error;
    setHistoricos(data || []);
  };

  const handleRecalcularTodo = async () => {
    if (!window.confirm(
      '¿Recalcular todos los meses cerrados?\n\nFórmula: (ventas + ingreso capital) − (gastos + nómina).\nSin bases ni entregas de turno.'
    )) return;

    setRecalculando(true);
    try {
      const { actualizados, cerrados } = await recalcularTodosLosBalances();
      await cargarMesEnCurso();
      await cargarHistoricos();
      toast.success(`Recalculados: ${actualizados}. Nuevos cerrados: ${cerrados}.`);
    } catch (err) {
      console.error('Error recalculando balances:', err);
      toast.error(err.message || 'No se pudo recalcular');
    } finally {
      setRecalculando(false);
    }
  };

  const aniosDisponibles = () => {
    const actual = mesActualColombia().anio;
    const set = new Set([actual, actual - 1, actual - 2]);
    historicos.forEach((h) => set.add(h.anio));
    return [...set].sort((a, b) => b - a);
  };

  if (cargando) {
    return (
      <div className="p-10 text-center text-gray-500 font-bold animate-fadeIn">
        Calculando y cerrando balances pendientes...
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="bg-white p-4 rounded-xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Scale className="text-teal-600" />
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Balance mensual</h2>
            <p className="text-sm text-gray-500">
              Resultado del mes: (ventas de todo tipo + ingreso capital) − (gastos + nómina).
              Igual que el cuaderno físico. No incluye bases ni entregas de turno.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleRecalcularTodo}
          disabled={recalculando}
          className="inline-flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 py-2 rounded-lg text-sm disabled:opacity-50"
        >
          <RefreshCw size={16} className={recalculando ? 'animate-spin' : ''} />
          {recalculando ? 'Recalculando...' : 'Recalcular todo'}
        </button>
      </div>

      {/* Mes en curso (en vivo) */}
      {mesEnCurso && (
        <section className="bg-white p-6 rounded-xl shadow-lg space-y-4">
          <div className="flex items-center gap-2">
            <Calendar className="text-teal-600" size={20} />
            <h3 className="font-bold text-lg">
              Mes en curso: {MESES[mesEnCurso.mes]} {mesEnCurso.anio}
            </h3>
            <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded">EN VIVO</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-green-50 p-4 rounded-xl">
              <div className="text-xs font-bold text-green-600 uppercase flex items-center gap-1">
                <TrendingUp size={14} /> Ingresos (ventas + capital)
              </div>
              <div className="text-2xl font-bold text-green-800 mt-1">{formatoMoneda(mesEnCurso.totalIngresos)}</div>
              <div className="text-[11px] text-green-700/80 mt-1">
                Ventas {formatoMoneda(mesEnCurso.totalVentas)} ({mesEnCurso.cantVentas || 0} regs)
                {' · '}Capital {formatoMoneda(mesEnCurso.totalCapital)}
              </div>
              <div className="text-[11px] text-green-700/70 mt-1">
                Efectivo {formatoMoneda(mesEnCurso.ventasPorMetodo?.efectivo)}
                {' · '}Nequi {formatoMoneda(mesEnCurso.ventasPorMetodo?.nequi)}
                {' · '}Bancolombia {formatoMoneda(mesEnCurso.ventasPorMetodo?.bancolombia)}
                {' · '}Davivienda {formatoMoneda(mesEnCurso.ventasPorMetodo?.davivienda)}
              </div>
            </div>
            <div className="bg-red-50 p-4 rounded-xl">
              <div className="text-xs font-bold text-red-600 uppercase flex items-center gap-1">
                <TrendingDown size={14} /> Egresos (gastos + nómina)
              </div>
              <div className="text-2xl font-bold text-red-800 mt-1">{formatoMoneda(mesEnCurso.totalEgresos)}</div>
              <div className="text-[11px] text-red-700/80 mt-1">
                Gastos {formatoMoneda(mesEnCurso.totalGastos)}
                {' · '}Nómina {formatoMoneda(mesEnCurso.totalNomina)}
              </div>
            </div>
            <div className={`p-4 rounded-xl ${mesEnCurso.resultado >= 0 ? 'bg-teal-50' : 'bg-orange-50'}`}>
              <div className={`text-xs font-bold uppercase ${mesEnCurso.resultado >= 0 ? 'text-teal-600' : 'text-orange-600'}`}>
                {mesEnCurso.resultado >= 0 ? 'Ganancia parcial' : 'Pérdida parcial'}
              </div>
              <div className={`text-2xl font-bold mt-1 ${mesEnCurso.resultado >= 0 ? 'text-teal-800' : 'text-orange-800'}`}>
                {formatoMoneda(mesEnCurso.resultado)}
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Este mes se guardará automáticamente cuando termine (al abrir Balance en el mes siguiente).
          </p>
        </section>
      )}

      {/* Historial cerrado */}
      <section className="bg-white p-6 rounded-xl shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="font-bold text-lg">Historial de meses cerrados</h3>
          <select
            value={filtroAnio}
            onChange={(e) => setFiltroAnio(Number(e.target.value))}
            className="border p-2 rounded-lg font-bold"
          >
            {aniosDisponibles().map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3">Mes</th>
                <th className="p-3 text-right">Ingresos</th>
                <th className="p-3 text-right">Egresos</th>
                <th className="p-3 text-right">Resultado</th>
                <th className="p-3">Estado</th>
                <th className="p-3">Cerrado</th>
              </tr>
            </thead>
            <tbody>
              {historicos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-400">
                    Aún no hay meses cerrados para {filtroAnio}
                  </td>
                </tr>
              ) : (
                historicos.map((b) => (
                  <tr key={b.id} className="border-t hover:bg-gray-50">
                    <td className="p-3 font-bold">{MESES[b.mes]} {b.anio}</td>
                    <td className="p-3 text-right text-green-700 font-medium">{formatoMoneda(b.total_ingresos)}</td>
                    <td className="p-3 text-right text-red-700 font-medium">{formatoMoneda(b.total_egresos)}</td>
                    <td className={`p-3 text-right font-black ${Number(b.resultado) >= 0 ? 'text-teal-700' : 'text-orange-700'}`}>
                      {formatoMoneda(b.resultado)}
                    </td>
                    <td className="p-3">
                      {Number(b.resultado) >= 0 ? (
                        <span className="text-[10px] font-bold bg-teal-100 text-teal-700 px-2 py-1 rounded">GANANCIA</span>
                      ) : (
                        <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-1 rounded">PÉRDIDA</span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-gray-500">
                      {b.cerrado_en
                        ? new Date(b.cerrado_en).toLocaleString('es-CO', { timeZone: TZ_COLOMBIA })
                        : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default PanelBalance;
