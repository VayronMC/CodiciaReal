/**
 * Utilidades para reglas de negocio dinámicas en ventas:
 * - Mayoreo (descuento por volumen)
 * - Combos (detección automática por escaneo)
 */

/**
 * Calcula el total de un producto aplicando precio mayoreo si corresponde.
 *
 * Nueva lógica solicitada:
 * - Si la cantidad es menor al umbral → todo al precio normal.
 * - Si la cantidad es mayor o igual al umbral → TODAS las unidades al precio mayoreo.
 *
 * Ejemplo:
 * - precio = 3.000, precio_mayoreo = 2.800, umbral = 3
 *   - cantidad = 2  → 2 * 3.000
 *   - cantidad = 3  → 3 * 2.800
 *   - cantidad = 4  → 4 * 2.800
 */
export const calcularTotalConMayoreo = (item) => {
  const { cantidad = 0, precio = 0, precio_mayoreo, umbral_mayoreo } = item;
  if (!umbral_mayoreo || !precio_mayoreo || cantidad < umbral_mayoreo) {
    return cantidad * precio;
  }
  return cantidad * precio_mayoreo;
};

/**
 * Calcula el precio unitario efectivo para mostrar (promedio ponderado).
 */
export const calcularPrecioEfectivoMayoreo = (item) => {
  const total = calcularTotalConMayoreo(item);
  return item.cantidad > 0 ? Math.round(total / item.cantidad) : item.precio;
};

/**
 * Detecta combos formables desde el carrito. Los combos se procesan en orden;
 * el primero que puede formarse "consume" los productos.
 * @param {Array} carrito - [{ id, cantidad, ... }]
 * @param {Array} combos - [{ id, nombre, precio, combo_productos: [{ producto_id, cantidad }] }]
 * @returns {Object} { combosFormados: [{ combo, cantidad }], consumido: Map<producto_id, qty>, itemsRestantes: [...] }
 */
export const detectarCombos = (carrito, combos) => {
  if (!combos?.length) return { combosFormados: [], consumido: new Map(), itemsRestantes: carrito };

  const qtyPorProducto = new Map();
  carrito.forEach((item) => qtyPorProducto.set(item.id, (qtyPorProducto.get(item.id) || 0) + item.cantidad));

  const consumido = new Map();
  const combosFormados = [];

  combos.forEach((combo) => {
    if (!combo.activo || !combo.combo_productos?.length) return;

    let maxN = Infinity;
    combo.combo_productos.forEach((cp) => {
      const disponible = (qtyPorProducto.get(cp.producto_id) || 0) - (consumido.get(cp.producto_id) || 0);
      maxN = Math.min(maxN, Math.floor(disponible / (cp.cantidad || 1)));
    });

    if (maxN > 0) {
      combosFormados.push({ combo, cantidad: maxN });
      combo.combo_productos.forEach((cp) => {
        const pid = cp.producto_id;
        const qty = (cp.cantidad || 1) * maxN;
        consumido.set(pid, (consumido.get(pid) || 0) + qty);
      });
    }
  });

  const itemsRestantes = carrito
    .map((item) => {
      const usado = consumido.get(item.id) || 0;
      const resto = item.cantidad - usado;
      return resto > 0 ? { ...item, cantidad: resto } : null;
    })
    .filter(Boolean);

  return { combosFormados, consumido, itemsRestantes };
};

/**
 * Genera las líneas para mostrar en carrito/comprobante: combos + productos con mayoreo.
 * @param {Array} carrito
 * @param {Array} combos
 * @returns {Array} [{ tipo, id, nombre, cantidad, precio, subtotal, ... }]
 */
export const generarLineasVenta = (carrito, combos) => {
  const { combosFormados, itemsRestantes } = detectarCombos(carrito, combos);
  const lineas = [];

  combosFormados.forEach(({ combo, cantidad }) => {
    lineas.push({
      tipo: 'combo',
      id: `combo-${combo.id}`,
      nombre: combo.nombre,
      cantidad,
      precio: combo.precio,
      subtotal: cantidad * combo.precio,
      combo,
      esCombo: true
    });
  });

  itemsRestantes.forEach((item) => {
    const total = calcularTotalConMayoreo(item);
    const precioEfectivo = item.cantidad > 0 ? Math.round(total / item.cantidad) : item.precio;
    lineas.push({
      tipo: 'producto',
      id: item.id,
      nombre: item.nombre,
      cantidad: item.cantidad,
      precio: precioEfectivo,
      subtotal: total,
      producto: item,
      esCombo: false
    });
  });

  return lineas;
};
