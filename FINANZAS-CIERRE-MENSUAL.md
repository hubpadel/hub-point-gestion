# Cierre mensual privado POINT

Se añaden cobros manuales para Alquileres de canchas y Abonos de canchas, gastos generales del predio, comisión HUB fija del 10% seleccionable por rubro y comparación de dos meses.

## Criterios

- Ingresos por fecha efectiva de cobro. Un abono de canchas también guarda el mes abonado; no cambia el mes de caja. No confundir con abonos de clases que ya entran desde Pagos. Los manuales no crean reservas ni se sincronizan con Wona.
- Categoría nueva Gastos generales del predio, separada de los demás gastos privados. Registrar gastos individuales o un total mensual, nunca ambos para los mismos gastos. Los importes son pagos realizados; los costos de actividades siguen mostrando sus estados y estimaciones previas.
- HUB 10% se calcula por rubro elegido y se redondea a centavos por rubro. El total es la suma de esas comisiones; se descuenta una sola vez del resultado. No se registra otro gasto duplicado de comisión. No confirma una transferencia o pago a HUB.
- Selección persistente por mes, con historial de autor y cambios. La regla habitual indicada por administración aplica el 10% a todos los rubros salvo Alquileres de canchas, e incluye Abonos de canchas. Se usa automáticamente si no existe excepción mensual. Guardar una selección vacía equivale a no aplicar comisión ese mes. Se puede copiar la selección del mes comparado antes de guardar. La regla habitual fue indicada explícitamente por administración durante esta implementación. La respuesta informa si se usó la regla habitual o una excepción mensual.
- Resultado mensual = cobrado − costos de actividades/profesores − gastos privados vigentes − HUB. Los márgenes por rubro excluyen gastos generales sin asignación. La liquidación de profesores sigue siendo una estimación al porcentaje actual, no certifica pago ni reemplaza una liquidación histórica.
- Comparación: dos meses elegidos, valores nominales, diferencia ARS y variación porcentual contra valor absoluto del mes comparado. Si la base es cero no se inventa porcentaje. Ambos meses necesitan regla HUB para comparar resultado después de comisión.
- CSV compatible con Excel incluye resumen de ambos meses, regla HUB de cada uno, detalle por rubro y todos los movimientos del mes principal. Impresión PDF incluye comparación. Informe vivo; exportar al cerrar el mes para conservar esa versión.

## Privacidad e integridad

Nuevas tablas en point_logros, con RLS sin acceso directo para anon/authenticated. RPC privados verifican la administradora confirmada en cada operación, con wrappers públicos SECURITY INVOKER. La función de resumen no tiene permiso de ejecución directo. Ingresos idempotentes por UUID con comprobación de coincidencia de payload. Anulación conserva registro, autor, fecha y motivo. Reglas mensuales conservan historial y se bloquean durante su actualización. No se altera ningún ingreso, gasto ni regla preexistente durante la instalación.

Aplicar finanzas-cierre-mensual.sql después de finanzas-privadas.sql y sus integraciones. Si se había aplicado antes de la aclaración de comisión, aplicar también finanzas-comision-habitual.sql. Publicar administracion.html, hub-finanzas.js y hub-logros.css. El API anterior se conserva para compatibilidad; la nueva pantalla usa hub_finanzas_panel_completo.

## Verificación

PGlite aislado: permisos anon/no-admin/tablas privadas, ingresos manuales sin duplicación, intento de reutilizar UUID con otro importe, clasificación por fecha de cobro y mes abonado, gastos generales, comisión por rubro, exactitud a centavos, independencia entre meses, anulación conservada y configuración vacía válida. QA con fixture separado para elegir rubros, cargar un abono, cargar un gasto del predio, actualizar resultado y borrar los datos al cerrar sesión. Prueba de producción de solo lectura con límite de 3 segundos, sin crear movimientos de ejemplo.
