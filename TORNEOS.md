# Torneos por parejas

Botones TORNEOS en navegación, Agenda y Planner. Una actividad existente del Planner por torneo, con ficha `torneos` enlazada por su mismo identificador. Los torneos anteriores del Planner se pueden abrir para agregar inscripción sin crear otra actividad.

Cada pareja exige dos nombres distintos. Cada jugador tiene importe, asistencia y un pago individual completo con fecha y medio (Efectivo o Transferencia). La pareja queda pendiente, parcial (pagó uno), pagada o cancelada. Precio por jugador configurable; los nuevos jugadores toman ese precio y los importes existentes se conservan. No se registran cuotas ni pagos parciales de un mismo jugador.

Finanzas suma los pagos individuales al ingreso general por mes de cobro, una sola vez. Costos de cancha/coordinación y saldos se informan por mes del torneo. Los cobros de parejas canceladas se conservan. No se escriben registros en `pagos`, Canchas Abiertas, clases, alumnos ni liquidaciones.

Guardado mediante `torneos_guardar`, atómico con la actividad del Planner, sus bloqueos de cancha y validaciones de solapamiento. Revisión optimista para evitar sobrescribir otra edición y reintento idéntico sin duplicar actividad ni cobros. No se permite eliminar jugadores con cobros: se conserva la pareja cancelada.

## Activación

Aplicar `torneos.sql` en el proyecto Supabase de HUB, `jpzoaskdtgfvvfpdbqox`, antes de publicar el frontend. Añade una tabla con RLS y funciones SECURITY INVOKER; no modifica registros existentes. Mantiene la audiencia vigente de Planner y Canchas Abiertas: roles anon y authenticated con lectura, alta y edición. Esto implica acceso a nombres e importes sin inicio de sesión. El usuario autorizó expresamente continuar tras comunicarse ese alcance y el bloqueo inicial de revisión automática.

Publicación por el flujo existente de GitHub Pages al actualizar main. No requiere cambiar hosting ni URL.

## Verificación

`npm run test:torneos`: estados, validación de parejas/importes, finanzas, SQL PostgreSQL local con RLS, rollback, reintentos, rechazo de edición desactualizada y conflictos de cancha. Verificación visual del formulario responsive con datos de ejemplo sin guardar en producción.

La prueba antigua `archivo existente intacto excepto nombre, módulo, horarios y suma autorizada en Ingresos` ya falla en HEAD anterior a esta implementación: su fixture no contempla Historial alumnos ni HUB Action. No se modifica para ocultar ese fallo.
