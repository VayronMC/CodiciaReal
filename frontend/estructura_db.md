# ESTRUCTURA DE BASE DE DATOS SUPABASE

## Relaciones principales
- **combo_productos**: combo_id → combos, producto_id → productos
- **detalle_ventas**: venta_id → ventas, producto_id → productos
- **detalle_venta_combos**: venta_id → ventas, combo_id → combos
- **ventas**: cajero_id → perfiles (auth.users.id)
- **perfiles**: id = auth.users.id
- **caja_movimientos**: usuario_id, beneficiario, validado_por → perfiles

---

Tabla: productos
-id
-codigo_barras
-nombre
-precio
-precio_mayoreo (opcional, precio por volumen)
-umbral_mayoreo (ej: 3 = a partir de 3 unidades aplica mayoreo)
-stock
-activo
-creado_en
-costo

Tabla: combos
-id
-nombre
-precio
-activo
-creado_en

Tabla: combo_productos
-id
-combo_id
-producto_id
-cantidad (unidades del producto por combo)

Tabla: detalle_venta_combos
-id
-venta_id
-combo_id
-cantidad
-precio_unitario

Tabla: detalle_ventas
-id
-venta_id
-producto_id
-cantidad
-precio_unitario

Tabla: ventas
-id
-numero_venta (SERIAL, consecutivo: 1, 2, 3... se muestra sin ceros a la izquierda)
-metodo_pago (efectivo, nequi, etc.)
-creado_en
-cajero_id
-total

Tabla: perfiles
-id
-email
-rol
-nombre_completo

Tabla: caja_movimientos
-id
-creado_en
-tipo (gasto, base, entrega_turno, ingreso_capital, nomina)
-descripcion
-monto
-usuario_id
-beneficiario
-dinero_fisico_real
-diferencia
-estado_cierre
-validado_por

Tabla: turnos_caja (no usada actualmente en la app)
-id
-usuario_id
-fecha_inicio
-fecha_fin
-monto_inicial
-monto_final_esperado
-monto_final_real
-estado

---

**Nota**: perfiles.id corresponde a auth.users.id. turnos_caja está definida pero no se utiliza en el frontend actual.