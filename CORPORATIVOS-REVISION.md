# Eventos Corporativos — revisión antes de producción

La interfaz conserva las funciones existentes salvo el cambio autorizado del indicador Ingresos (Clases + Corporativos). Eventos Corporativos mantiene una agenda independiente, presupuestos registrados o enlazados y cobros parciales/totales con saldo. Canchas Abiertas conserva su bloque financiero aparte.

## Preparación de pruebas

1. Usar Node 24 y ejecutar `npm install --ignore-scripts`, después `npm test`.
2. Para una base de pruebas Supabase/PostgreSQL 15 o posterior, aplicar corporativos.sql y corporativos-access.sql en ese orden. Jamás aplicar tests/database.sql a producción.
3. Las pruebas locales ejecutan migración, reintentos, sobrepagos, rollback, inmutabilidad de cobros y permisos en PostgreSQL embebido. Las comprobaciones de interfaz usan un backend simulado.

corporativos-access.sql replica la audiencia efectiva de Pagos (anon/authenticated, sin filtro por usuario) observada en el panel el 14/10/2026. No cambia políticas ni permisos de otras tablas. Para cobros no concede UPDATE, DELETE ni TRUNCATE. Quien puede usar la app existente también puede gestionar los corporativos; incorporar diferencias por usuario necesita una autorización y un cambio de autenticación adicional.

## Validación de concurrencia completada

En una base separada con dos conexiones, registrar concurrentemente dos pagos que juntos superen el saldo. Sólo uno debe confirmarse y el total nunca debe superar el presupuesto. Repetir el mismo UUID desde ambas conexiones: debe quedar una sola fila. También probar concurrentemente la reducción del presupuesto contra un cobro. Estos cuatro escenarios se ejecutaron y aprobaron en PostgreSQL 17.10 local con tres conexiones independientes. Evidencia en concurrency-result.json. El servidor temporal fue apagado al terminar. Para repetir en Windows: npm run test:concurrency.

En producción aún no se aplicó ningún archivo ni permiso. Antes de publicar: validar lo pendiente en pruebas, confirmar PostgreSQL 15+, respaldo recuperable, comparación del commit base y confirmación explícita del propietario.

## Límites

- No bloquea ni altera la agenda de Clases ni la ocupación de canchas.
- No sube archivos: acepta el presupuesto registrado y/o enlace a un adjunto alojado.
- No elimina/revierte cobros confirmados.
- Identificación estable para reintentos en la misma pestaña. Si un mismo comprobante se registra como dos operaciones nuevas con UUID diferentes, no se detecta como duplicado; consultar el historial antes de repetir una operación en otra pestaña.
- Cobros consultados por páginas para evitar truncamiento del historial. El total de Clases conserva su lectura existente.
