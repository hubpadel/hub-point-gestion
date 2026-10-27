# Disponibilidad central por profesor

## Coordinador

En **Clases a recuperar → Horarios de recuperación por profesor**, elegir profesor, cargar sus horarios y guardar la disponibilidad. La carga se realiza una sola vez por profesor y es compartida por todas sus recuperaciones. Se pueden habilitar hasta 100 opciones, siempre de una hora y con una cancha asignada. El enlace fijo del profesor permite consultar esos horarios sin ingreso de datos ni cuenta.

Para que el alumno reserve y se retire la suspensión correcta del listado pendiente, pulsar **Enviar enlace de recuperación** en la ficha suspendida. El enlace conserva la misma dirección del profesor y agrega automáticamente una referencia secreta de la recuperación en el fragmento de URL. El alumno no ingresa nombre, teléfono, contraseña ni códigos: sólo elige y confirma. Los enlaces de recuperación vencen a los 14 días; al volver a compartir uno vencido, se renueva su referencia. El enlace base del profesor es estable.

Una elección confirma al grupo completo, conserva los participantes y crea la misma actividad violeta **Clase recuperada** de Agenda/Planner, sin otra clase ni movimiento económico. Sale de Clases a recuperar y el turno deja de ofrecerse en los enlaces y en el panel central. Si otro alumno abre el enlace del mismo grupo, recibe la fecha ya confirmada. Si otra recuperación intenta tomar el mismo turno, conserva su pendiente y debe elegir otra opción.

El enlace fijo general por sí solo muestra disponibilidad; no puede determinar qué suspensión retirar. La referencia automática que se incorpora al compartir desde la ficha resuelve ese vínculo sin identificar al alumno ni exponer nombres de compañeros.

## Integridad y compatibilidad

Las tablas nuevas de agendas y horarios tienen RLS y no admiten lectura/escritura directa de anon/authenticated. Sólo los coordinadores de la lista existente administran horarios y crean enlaces asociados. La consulta pública muestra profesor y turnos; la confirmación requiere referencia válida y correspondiente a ese profesor. Hay control de versión para ediciones del coordinador y el mismo bloqueo transaccional que usa Planner.

Se revalidan futuro, fecha posterior a la suspensión, ocupación de cancha, clases/recuperaciones del profesor y turno disponible en el servidor. La carga central rechaza horarios superpuestos del mismo profesor. Una reserva consume el turno y actualiza la versión del calendario para rechazar ediciones viejas.

Los enlaces anteriores por suspensión se mantienen hasta su vencimiento y conservan sus opciones anteriores; no se convierten opciones particulares en disponibilidad compartida sin decisión del coordinador. Sus reservas también bloquean la disponibilidad central mediante los controles de ocupación.

Migración: **recuperaciones-profesor.sql**, después de recuperaciones-enlaces.sql. Los envoltorios validar/produccion comparan huellas de clases, pagos, liquidaciones y recuperaciones existentes; el primero termina en ROLLBACK y el segundo en COMMIT. No se crean reservas ni se envían mensajes al instalar.

## Verificación

- 47 pruebas de datos/regresión aprobadas: permisos, calendario y enlace estables, disponibilidad compartida, referencia automática, grupo completo, consumo del turno, reintentos, edición vieja, compatibilidad e integridad financiera.
- Prueba móvil con PostgreSQL embebido y red interceptada: panel central, enlace fijo, referencia automática sin campos de identificación, reserva grupal, Agenda y desaparición del turno compartido.
- Prueba PostgreSQL nativo: dos recuperaciones intentan tomar el mismo turno; una reserva y la otra queda pendiente. Otro alumno del grupo recibe la reserva ya confirmada.

Los escenarios de navegador y concurrencia usan datos ficticios y no escriben producción. Sus evidencias se guardan en recuperaciones-profesor-browser-results.json y recuperaciones-profesor-concurrency-results.json.
