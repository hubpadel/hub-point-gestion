# Validación en Supabase — 26/10/2026

La implementación del PR #4 se aplicó correctamente en una rama aislada de Supabase con el esquema real de POINT. No se aplicó en producción ni se fusionó el PR.

- Proyecto original: `jpzoaskdtgfvvfpdbqox` (sin cambios).
- Rama temporal: `recuperar-clase-prueba`, proyecto `ynmetzcngrohjlesxwhj`.
- La rama heredó las tablas, permisos, funciones y triggers de clases y Planner. Se aplicó únicamente `recuperaciones.sql`; el panel devolvió `Success. No rows returned.`.
- Datos de prueba: profesor y dos alumnos ficticios, tres clases, un cobro `Por clase` y una liquidación de profesor. No se usaron registros reales para ejecutar el circuito.

## Resultado observado en el panel

| Verificación | Resultado |
|---|---|
| Grupo completo, pendiente, reintento y rechazo del duplicado | OK |
| Individual anónima rechazada | OK |
| Identidad auth.uid habilitada y registrada, mediante contexto SQL | OK |
| Programación, reprogramación e idempotencia | OK |
| Solapamiento y revisión vieja rechazados | OK |
| Edición genérica bloqueada y finalización | OK |
| Clases, cobro y liquidación idénticos antes/después | OK |

Consulta reproducible: `recuperaciones-supabase-test.sql`. Es exclusivamente para una copia descartable: crea datos y una identidad ficticios. No ejecutar en producción.

La comprobación de identidad empleó una fila ficticia de Auth sin contraseña y el contexto JWT de PostgreSQL bajo rol `authenticated`. No fue un inicio de sesión real mediante correo/contraseña ni una prueba de entrega de correo. El inicio de sesión de un autorizador real sigue requiriendo configurar esa cuenta y habilitar su UUID antes de activar individuales para uso real.

El navegador con datos simulados y red interceptada, las 19 regresiones y los tres escenarios de concurrencia local documentados en el informe principal complementan estas verificaciones. Esta sesión no ejecutó una interfaz conectada a la rama mediante un usuario real de Auth.

## Cierre del recurso de pago

El usuario autorizó la rama temporal con un máximo de US$0,10 y su eliminación al terminar. El panel indicaba US$0,01344/hora más impuestos. Se creó aproximadamente a las 17:27 UTC y se confirmó eliminada antes de las 17:34 UTC, el 26/10/2026. La página volvió a mostrar únicamente la rama productiva y el mensaje inicial para crear ramas de prueba. No quedaron ramas de prueba activas de este trabajo. No se consultó una factura final.

Se conservaron capturas y transcripciones locales de los resultados y del estado posterior a la eliminación. No se copiaron credenciales en el repositorio.

## Estado de entrega

PR borrador: https://github.com/hubpadel/hub-point-gestion/pull/4

Implementación y pruebas de base de datos completadas. El botón todavía no aparece en producción: falta autorizar el despliegue y la migración productiva, y definir/habilitar al autorizador real de individuales. El recurso de pruebas se eliminó, por lo que no se entrega una URL de preview activa.
