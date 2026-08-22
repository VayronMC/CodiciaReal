-- ============================================================
-- Asistencia y Nómina — script COMPLETO para la base ORIGINAL
-- Ejecutar TODO en el SQL Editor de Supabase (proyecto producción)
-- ============================================================

-- 1) Columna de tarifa por hora en perfiles
ALTER TABLE perfiles
ADD COLUMN IF NOT EXISTS tarifa_por_hora NUMERIC(12, 2) DEFAULT 0;

COMMENT ON COLUMN perfiles.tarifa_por_hora IS 'Pago por hora del empleado en COP';

-- 2) Tabla de registros de entrada / salida
CREATE TABLE IF NOT EXISTS registros_asistencia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id UUID NOT NULL REFERENCES perfiles(id),
  hora_entrada TIMESTAMPTZ NOT NULL DEFAULT now(),
  hora_salida TIMESTAMPTZ,
  registrado_por UUID REFERENCES perfiles(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asistencia_empleado
  ON registros_asistencia (empleado_id);

CREATE INDEX IF NOT EXISTS idx_asistencia_entrada
  ON registros_asistencia (hora_entrada);

COMMENT ON TABLE registros_asistencia IS 'Entradas y salidas marcadas por el administrador';

-- 3) RLS: solo admins pueden gestionar asistencia
ALTER TABLE registros_asistencia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_asistencia" ON registros_asistencia;
DROP POLICY IF EXISTS "admins_select_asistencia" ON registros_asistencia;
DROP POLICY IF EXISTS "admins_insert_asistencia" ON registros_asistencia;
DROP POLICY IF EXISTS "admins_update_asistencia" ON registros_asistencia;
DROP POLICY IF EXISTS "admins_delete_asistencia" ON registros_asistencia;
DROP POLICY IF EXISTS "admins_manage_asistencia" ON registros_asistencia;

CREATE POLICY "admins_manage_asistencia"
ON registros_asistencia
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM perfiles
    WHERE perfiles.id = auth.uid()
      AND perfiles.rol = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM perfiles
    WHERE perfiles.id = auth.uid()
      AND perfiles.rol = 'admin'
  )
);

-- 4) Opcional: si al guardar tarifa falla RLS en perfiles, descomenta:
-- DROP POLICY IF EXISTS "admins_update_tarifa" ON perfiles;
-- CREATE POLICY "admins_update_tarifa"
-- ON perfiles
-- FOR UPDATE
-- TO authenticated
-- USING (
--   EXISTS (
--     SELECT 1 FROM perfiles p
--     WHERE p.id = auth.uid() AND p.rol = 'admin'
--   )
-- )
-- WITH CHECK (
--   EXISTS (
--     SELECT 1 FROM perfiles p
--     WHERE p.id = auth.uid() AND p.rol = 'admin'
--   )
-- );
