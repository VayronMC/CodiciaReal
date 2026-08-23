-- ============================================================
-- FIX RLS asistencia: empleados pueden iniciar/cerrar SU turno
-- Ejecutar en SQL Editor de Supabase (base que uses la app)
-- ============================================================

ALTER TABLE registros_asistencia ENABLE ROW LEVEL SECURITY;

-- Quitar políticas viejas (admin-only y posibles duplicadas)
DROP POLICY IF EXISTS "admin_all_asistencia" ON registros_asistencia;
DROP POLICY IF EXISTS "admins_select_asistencia" ON registros_asistencia;
DROP POLICY IF EXISTS "admins_insert_asistencia" ON registros_asistencia;
DROP POLICY IF EXISTS "admins_update_asistencia" ON registros_asistencia;
DROP POLICY IF EXISTS "admins_delete_asistencia" ON registros_asistencia;
DROP POLICY IF EXISTS "admins_manage_asistencia" ON registros_asistencia;
DROP POLICY IF EXISTS "empleados_select_propia_asistencia" ON registros_asistencia;
DROP POLICY IF EXISTS "empleados_insert_propia_asistencia" ON registros_asistencia;
DROP POLICY IF EXISTS "empleados_update_propia_asistencia" ON registros_asistencia;

-- Admin: todo
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

-- Empleado: ver solo sus registros
CREATE POLICY "empleados_select_propia_asistencia"
ON registros_asistencia
FOR SELECT
TO authenticated
USING (empleado_id = auth.uid());

-- Empleado: iniciar turno (solo su fila)
CREATE POLICY "empleados_insert_propia_asistencia"
ON registros_asistencia
FOR INSERT
TO authenticated
WITH CHECK (
  empleado_id = auth.uid()
  AND registrado_por = auth.uid()
);

-- Empleado: cerrar su propio turno (Confirmar y salir)
CREATE POLICY "empleados_update_propia_asistencia"
ON registros_asistencia
FOR UPDATE
TO authenticated
USING (empleado_id = auth.uid())
WITH CHECK (empleado_id = auth.uid());
