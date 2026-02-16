import { useState, useEffect } from 'react'
import { supabase, configError } from './supabaseClient';
import Login from './Login';
import PuntoDeVenta from './PuntoDeVenta';
import PanelAdmin from './PanelAdmin';

function App() {
  const [session, setSession] = useState(null);
  const [rolUsuario, setRolUsuario] = useState(null);
  const [vistaActual, setVistaActual] = useState('pos'); // 'pos' o 'admin'

  useEffect(() => {
    if (configError || !supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) obtenerRol(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) obtenerRol(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (configError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
        <div className="bg-red-900/50 border border-red-500 p-8 rounded-xl max-w-lg text-center text-white">
          <h2 className="text-xl font-bold mb-4">⚠️ Error de configuración</h2>
          <p className="text-red-200 text-sm mb-4">{configError}</p>
          <p className="text-xs text-gray-400">Ruta esperada del .env: frontend/.env (junto a package.json)</p>
        </div>
      </div>
    );
  }

  const obtenerRol = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('perfiles')
        .select('rol')
        .eq('id', userId)
        .single();
      if (error) throw error;
      if (data) setRolUsuario(data.rol);
    } catch (err) {
      console.error("Error en obtenerRol:", err);
      setRolUsuario(null);
    }
  };

  const cerrarSesion = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Error en cerrarSesion:", err);
    } finally {
      setSession(null);
      setRolUsuario(null);
    }
  };

  if (!session) return <Login setSession={setSession} />;

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      
      {/* BARRA DE NAVEGACIÓN */}
      <nav className="bg-gray-900 text-white p-3 flex justify-between items-center shadow-lg z-50">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 to-orange-500 px-4">
            DULCE CODICIA
          </h1>
          
          <div className="flex bg-gray-800 rounded-lg p-1">
            <button 
              onClick={() => setVistaActual('pos')}
              className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${vistaActual === 'pos' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
            >
              🛒 CAJA
            </button>

            {/* SOLO EL ADMIN VE ESTE BOTÓN */}
            {rolUsuario === 'admin' && (
              <button 
                onClick={() => setVistaActual('admin')}
                className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${vistaActual === 'admin' ? 'bg-orange-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
              >
                ⚙️ ADMINISTRACIÓN
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <div className="text-right leading-tight">
            <span className="block font-bold text-green-400">{session.user.email}</span>
            <span className="text-xs opacity-50 uppercase">{rolUsuario || 'Cargando...'}</span>
          </div>
          <button onClick={cerrarSesion} className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-xs font-bold">
            SALIR
          </button>
        </div>
      </nav>

      {/* ÁREA PRINCIPAL */}
      <main className="flex-1 overflow-auto bg-gray-100 relative">
        {vistaActual === 'pos' ? (
          <PuntoDeVenta session={session} />
        ) : (
          /* SI ES ADMIN, MOSTRAMOS EL PANEL NUEVO */
          rolUsuario === 'admin' ? <PanelAdmin session={session} /> : <div className="p-10 text-center text-red-500 font-bold">⛔ Acceso Denegado</div>
        )}
      </main>

    </div>
  )
}

export default App