-- ============================================================
-- Fiados — script COMPLETO para Supabase
-- Ejecutar en el SQL Editor (base original / producción)
-- ============================================================

-- Si falló un intento anterior, limpia y vuelve a crear detalle_fiados:
-- DROP TABLE IF EXISTS detalle_fiados;
-- (fiados se puede dejar si ya se creó bien)

-- 1) Marca en ventas cuando el cobro viene de un fiado pagado
ALTER TABLE ventas
ADD COLUMN IF NOT EXISTS origen TEXT DEFAULT NULL;

COMMENT ON COLUMN ventas.origen IS 'Null = venta normal; fiado = cobro de fiado pendiente';

-- 2) Cabecera de fiados pendientes
CREATE TABLE IF NOT EXISTS fiados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_nombre TEXT NOT NULL,
  registrado_por UUID NOT NULL REFERENCES perfiles(id),
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fiados_creado_en ON fiados (creado_en DESC);

COMMENT ON TABLE fiados IS 'Productos fiados pendientes de pago (solo admin)';

-- 3) Detalle de productos del fiado
-- producto_id es BIGINT porque productos.id es bigint (no uuid)
CREATE TABLE IF NOT EXISTS detalle_fiados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiado_id UUID NOT NULL REFERENCES fiados(id) ON DELETE CASCADE,
  producto_id BIGINT NOT NULL REFERENCES productos(id),
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(12, 2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_detalle_fiados_fiado ON detalle_fiados (fiado_id);

-- 4) RLS: solo administradores
ALTER TABLE fiados ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_fiados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_manage_fiados" ON fiados;
DROP POLICY IF EXISTS "admins_manage_detalle_fiados" ON detalle_fiados;

CREATE POLICY "admins_manage_fiados"
ON fiados
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM perfiles
    WHERE perfiles.id = auth.uid() AND perfiles.rol = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM perfiles
    WHERE perfiles.id = auth.uid() AND perfiles.rol = 'admin'
  )
);

CREATE POLICY "admins_manage_detalle_fiados"
ON detalle_fiados
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM perfiles
    WHERE perfiles.id = auth.uid() AND perfiles.rol = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM perfiles
    WHERE perfiles.id = auth.uid() AND perfiles.rol = 'admin'
  )
);
