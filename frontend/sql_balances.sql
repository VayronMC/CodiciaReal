-- ============================================================
-- Balances mensuales — ejecutar en SQL Editor de Supabase
-- ============================================================

CREATE TABLE IF NOT EXISTS balances_mensuales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anio INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes >= 1 AND mes <= 12),
  total_ingresos NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_egresos NUMERIC(14, 2) NOT NULL DEFAULT 0,
  resultado NUMERIC(14, 2) NOT NULL DEFAULT 0,
  cerrado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (anio, mes)
);

COMMENT ON TABLE balances_mensuales IS 'Resultado del mes: (ventas + ingreso_capital) - (gasto + nomina)';
COMMENT ON COLUMN balances_mensuales.total_ingresos IS 'ventas de todos los métodos + ingreso_capital del mes';
COMMENT ON COLUMN balances_mensuales.total_egresos IS 'gasto + nomina del mes';
COMMENT ON COLUMN balances_mensuales.resultado IS 'ingresos - egresos (positivo = ganancia)';

CREATE INDEX IF NOT EXISTS idx_balances_anio_mes
  ON balances_mensuales (anio DESC, mes DESC);

ALTER TABLE balances_mensuales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_manage_balances" ON balances_mensuales;

CREATE POLICY "admins_manage_balances"
ON balances_mensuales
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
