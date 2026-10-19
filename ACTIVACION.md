# Activación — 19/10/2026

Estado: auditoría y simulación transaccional autorizada completadas. La simulación finalizó con ROLLBACK. No se aplicaron migraciones permanentes ni se publicó la nueva interfaz.

Repositorio: hubpadel/hub-point-gestion, rama principal main. Acceso administrativo confirmado. El HTML principal coincide con la base utilizada, normalizando los finales de línea.

Base: Supabase jpzoaskdtgfvvfpdbqox. Esquema UUID/fecha/time confirmado para las tres fuentes. Las políticas de clases y corporativos siguen permitiendo el acceso de anon y authenticated. No existen objetos Planner. Se observaron y conservaron las funciones de protección de cobros corporativos y sincronización de alumnos/jugadores; no hay triggers de ocupación sobre clases/canchas abiertas.

Respaldo físico disponible: 19/10/2026 10:36:46 UTC (07:36:46 Buenos Aires). No se pulsó Restaurar ni se modificó ese respaldo.

Preflight de sólo lectura: 3.149 clases, 362 fechas, máximo tres grupos simultáneos; ningún grupo ocupa más de una fecha/hora. Sin clases que crucen medianoche, ni abiertas con cancha/fin vacíos. Un evento corporativo.

Conflictos de capacidad previos: 16/10/2026 a las 15:00 y 16:00: una clase y tres canchas ocupadas por otras fuentes. La tercera migración conserva íntegro un día histórico cuando no puede asignarlo, mediante rollback del subbloque de asignación. Sus clases quedan visibles sin cancha para revisión. La duración sigue siendo de una hora. No borra ni mueve registros originales. Un conflicto de hoy o futuro aborta toda la activación.

`planner-access.sql` mantiene la audiencia ya verificada (anon/authenticated), habilita sólo lectura/alta/edición en las dos tablas nuevas, lectura de la vista y ejecución de las operaciones necesarias. No concede DELETE, TRUNCATE, roles nuevos, ni altera permisos sobre las tablas originales. No crea usuarios ni una autenticación nueva.

La simulación reúne las cuatro migraciones en una transacción, valida las restricciones y finaliza con ROLLBACK. La revisión automática bloqueó el primer intento porque esta prueba sobre producción podía tomar bloqueos durante el procesamiento de las 3.149 clases y requería autorización específica. Se solicitó y recibió esa autorización del usuario antes de volver a pulsar Run. La simulación pasó: 3.141 registros asignados, ocho registros del día histórico conflictivo conservados sin cancha para revisión, permiso de ejecución de la operación Planner verificado. Las restricciones diferidas se comprobaron antes del ROLLBACK.

Pendiente de aprobación específica: aplicar la transacción definitiva en producción y publicar la interfaz. La autorización recibida en el diálogo cubrió la prueba con reversión completa. No mezclar el despliegue de interfaz con una base aún sin migrar. Validación local final: 19 pruebas aprobadas y cuatro escenarios concurrentes en PostgreSQL local aprobados.
