# Circuito solicitado: Asistencia → Clases a recuperar → Agenda

Corrige la primera entrega: una sección al pie de Agenda no cubría el pedido de un botón principal y el alta automática desde Asistencia.

## Uso

1. En Agenda, abrir **Editar** en una clase y seleccionar **Clase a recuperar** en Estado de Asistencia.
2. Elegir **Grupo completo por lluvia** o **Sólo este alumno (requiere autorización)** y guardar. Se guarda la suspensión y su pendiente en una sola transacción. Fecha, horario, alumno, profesor e importes originales se conservan.
3. Abrir **Clases a recuperar**, junto a Pagos, Finanzas y Planner. La ficha muestra alumnos, profesor, fecha/hora de suspensión, estado y nueva fecha cuando exista.
4. Pulsar **Reagendar**, elegir fecha, hora y cancha, y guardar. Se abre automáticamente la Agenda de la nueva fecha con una ficha violeta **Clase recuperada**, alumnos, profesor y referencia a la suspensión. Planner muestra la misma reserva con esos nombres. La clase no se duplica y no genera otro cobro ni liquidación.
5. Una segunda reprogramación conserva el mismo ID de reserva. El panel mantiene pendientes, programadas y realizadas.

El registro original conserva la fecha de suspensión y el estado Clase a recuperar. Los cambios de fecha/alumno/profesor/importe se guardan por separado para no perder el origen al suspender. La suspensión grupal incluye a todos los participantes de ese grupo, fecha y horario. La individual requiere la cuenta autorizada configurada anteriormente.

## Datos anteriores

La inspección de sólo lectura encontró 38 clases con el estado antiguo **Recupera**, sin pendientes vinculados. La migración importa únicamente cada alumno marcado, como **Marcada en Asistencia (anterior)**, para revisión; no presume lluvia, grupos completos ni una autorización individual nueva. Conserva íntegros los registros originales y no agenda automáticamente esas clases. El texto antiguo queda oculto para altas nuevas de Asistencia.

## Migración

Aplicar `recuperaciones-asistencia.sql` después del módulo de recuperaciones existente. Amplía únicamente el CHECK conocido de Estado; ante una definición inesperada falla sin alterarla. Agrega origen a las recuperaciones e importa los registros ya marcados. Instala `recuperacion_desde_asistencia` y un control diferido que rechaza Clase a recuperar sin un pendiente vinculado. La programación usa el título Clase recuperada con nombres de alumnos y profesor. No realiza escrituras en pagos ni liquidaciones, ni modifica clases históricas al instalar.

Los scripts `recuperaciones-asistencia-validar.sql` y `recuperaciones-asistencia-produccion.sql` envuelven la misma migración con comparación de huellas de todas las filas originales de clases, pagos y liquidaciones antes/después. El primero termina con ROLLBACK; el segundo confirma exclusivamente si esas huellas coinciden.

## Verificación

- 34 verificaciones de PostgreSQL embebido y regresiones: aprobadas. Incluyen restricción de Estado idéntica a producción, importación histórica sin inferir grupos, alta desde Asistencia, reintentos, individual autorizada/no autorizada, rollback de todo el grupo, versión vieja, rechazo de estado sin vínculo y preservación financiera.
- Navegador con datos ficticios y toda la red interceptada: botón principal, guardado desde Asistencia, persistencia al recargar, listado precargado, reagendado, Agenda automática violeta con nombres, ausencia de duplicado en los extras del Planner, reprogramación del mismo ID, vistas móvil y escritorio.
- PostgreSQL nativo con tres conexiones: cuatro escenarios aprobados, incluidos dos coordinadores suspendiendo simultáneamente participantes del mismo grupo, con un único pendiente compartido.

La prueba de navegador vigente es `recuperaciones-asistencia-browser.cjs` (usa el fixture anterior como base), invocada por `npm run test:recuperaciones:browser`. Evidencias JSON en `recuperaciones-asistencia-browser-results.json` y `recuperaciones-concurrency-results.json`.
