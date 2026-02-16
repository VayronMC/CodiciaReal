import { useState } from 'react';
import { supabase } from './supabaseClient';
import toast, { Toaster } from 'react-hot-toast';

export default function Login({ setSession }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error('Correo o contraseña incorrectos. Verifica e intenta de nuevo.', {
          duration: 5000,
          style: { background: '#7f1d1d', color: '#fecaca', border: '1px solid #dc2626' },
          iconTheme: { primary: '#fca5a5', secondary: '#7f1d1d' },
        });
      } else {
        setSession(data.session);
      }
    } catch (err) {
      console.error("Error en handleLogin:", err);
      toast.error('No se pudo conectar. Revisa tu internet e intenta de nuevo.', {
        duration: 5000,
        style: { background: '#7f1d1d', color: '#fecaca' },
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
      <Toaster position="top-center" toastOptions={{ className: 'font-medium' }} />
      <div className="bg-gray-800 p-8 rounded-xl shadow-2xl w-full max-w-md border border-gray-700">
        <h2 className="text-3xl font-bold text-white mb-2 text-center">DULCE CODICIA</h2>
        <p className="text-gray-400 text-center mb-6">Acceso Restringido</p>
        <form onSubmit={handleLogin} className="space-y-4">
          <input type="email" placeholder="Correo Corporativo" className="w-full p-3 rounded bg-gray-700 text-white" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input type="password" placeholder="Contraseña" className="w-full p-3 rounded bg-gray-700 text-white" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded">
            {loading ? 'Verificando...' : 'INGRESAR'}
          </button>
        </form>
      </div>
    </div>
  );
}