# HUB Action

Primera versión integrada al menú del programa. Turnos: Clari 08:00–16:00, Tamy 16:00–22:00.

## Activación

Ejecutar `hub-action.sql` en el SQL Editor del proyecto Supabase que usa este programa. La migración es aditiva y transaccional. No modifica clases, alumnos, pagos ni planner. La política de acceso utiliza la audiencia que puede leer `alumnos`; revisar que esa audiencia sea la deseada antes de activar. No agrega autenticación ni un rol administrativo nuevo.

Hasta activar, el módulo muestra un aviso y bloquea el guardado y la generación. No usa almacenamiento local para simular un pase compartido.

## Uso

- Elegir fecha y pulsar **Armar jornada del día** para crear 13 bloques de trabajo entre ambos turnos. Las identidades por día y turno evitan recrear los mismos bloques.
- Convertir oportunidades detectadas en tareas personalizadas. Reglas iniciales: última clase cancelada en los últimos 14 días, o última actividad de hace 22 a 90 días, sin próxima clase registrada. Requiere revisión del empleado antes del contacto; no determina nivel ni disponibilidad.
- Preparar propuestas de partidos, canchas abiertas, clases, horarios fijos, relevamiento de preferencias y empresas con instrucciones y mensajes editables.
- Cada tarea admite responsable, prioridad, fecha/hora, contacto, mensaje, propuesta, notas y seguimiento. Al cambiar de turno, actualizar responsable, fecha y hora dentro del turno correspondiente.
- Abrir WhatsApp deja el texto listo y requiere pulsar Enviar en WhatsApp. No registra envío automático. El resultado se carga manualmente.
- Confirmada exige referencia de una reserva ya registrada. No bloquea canchas ni verifica Wona automáticamente.
- El guardado verifica versión para evitar sobrescribir cambios de otra persona. Rechaza otro contacto abierto con el mismo alumno o teléfono. El historial conserva resultados y notas con fecha de servidor.

## Límites de esta etapa

Las prioridades de los bloques son reglas explícitas y las específicas son editables. No hay todavía selección automática por nivel/disponibilidad, integración Wona, evaluación de rentabilidad, aprobación administrativa técnica, envío Business API, seguimiento de respuestas WhatsApp ni creación automática de reservas. Los paquetes/precios se verifican por el empleado dentro de las condiciones aprobadas por Administración.

## Verificación

`node --test hub-action.test.cjs hub-action-db.test.cjs`

Incluye orden de prioridades, límites de turnos, codificación WhatsApp, oportunidades, generación estable, PostgreSQL, historial, edición con versiones, duplicados y permisos. La migración debe aplicarse y verificarse en producción antes de considerar operativo el módulo.
