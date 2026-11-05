# Finanzas privadas POINT

Acceso: `administracion.html#finanzas`, con el mismo acceso personal verificado del panel de logros. Los RPC verifican `point_logros.hub_logros_es_admin()` en cada lectura y escritura. Los gastos se almacenan en el esquema privado, con RLS y sin acceso directo de anon/authenticated. No se modifican permisos ni cobros operativos de recepción.

## Informe mensual

- Cobros por fecha de pago: pagos de clases, jugadores de canchas abiertas, pagos corporativos y jugadores de torneos. El origen corporativo se suma una sola vez; corporativos_ingresos es una vista de corporativos_pagos.
- Si un cobro de cancha o torneo no tiene fecha, se usa la fecha de actividad y se advierte en pantalla.
- Se conservan cobros de actividades canceladas; una cancelación no equivale a devolución.
- Costos de eventos por fecha de actividad. Coordinación pagada y pendiente se distingue. Costos de cancha y torneo no se presentan como pagos confirmados.
- Liquidación estimada de profesores sobre cobros del mes con el porcentaje actual de la ficha (0% se respeta). No se agregan asistencias ni recuperaciones: no duplican liquidación. No reemplaza una liquidación histórica acordada.
- Gastos privados adicionales: pagos efectivamente realizados, con categoría, fecha y medio. Alta idempotente por UUID. Anulación conserva autor, fecha y motivo.
- Resultado estimado: cobros menos costos y liquidaciones estimadas menos gastos privados vigentes. No es saldo bancario ni resultado contable definitivo. No incluye Wona o comisión HUB ni datos no registrados. Evitar registrar de nuevo como gasto un costo ya incluido en eventos/profesores.
- Pendientes: saldo actual por actividades del mes en abiertas, torneos y corporativos. No incluye deudas de clases/abonos ni pretende reconstruir saldo a una fecha histórica.
- CSV compatible con Excel con resumen, movimientos y referencias. Neutraliza fórmulas en campos de texto. Impresión A4 apaisada. El informe es vivo; descargar una versión para conservar el cierre del mes.

## Recepción

Se retira la pestaña de resumen financiero y la exportación general de pagos del menú operativo; no se ejecutan sus consultas agregadas. La captura y consulta de cobros individuales continúa disponible, igual que la agenda. Esto no convierte el sistema operativo sin autenticación en un sistema de permisos por empleada: las tablas operativas siguen con sus permisos existentes. Los nuevos gastos privados y el informe agregado solo se sirven a administración.

## Instalación y validación

Aplicar `finanzas-privadas.sql` después de los scripts de logros privados (incluido acceso). No cambia registros existentes. Las pruebas se ejecutan con PGlite en una base aislada, nunca anulando actividades de producción:

`NODE_PATH=<dependencias> node --test finanzas-privadas.test.cjs`

Casos: anon sin permiso, usuario no administrador rechazado, vistas y tablas privadas sin acceso directo, cobros de otro mes de actividad sumados por fecha de pago, preservación de cobros cancelados, fuente corporativa única, pendientes, porcentaje 0%, gastos idempotentes y anulaciones auditadas.
