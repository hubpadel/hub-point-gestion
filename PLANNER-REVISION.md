# Planner Visual — implementación local del 19/10/2026

Estado: desarrollado y probado localmente; NO publicado y SIN migraciones en producción.

## Base verificada

La copia `revision-point/repository` contiene trabajo previo sin confirmar y se conservó íntegra. `sources/` no se modificó. La implementación está aislada en esta carpeta.

Se descargaron mediante consultas públicas el HTML y corporativos.js vigentes. Coinciden exactamente con la base usada:

- index.html: SHA256 B0DDBB6F8F8F9A83D0490B17536B12F9ADDA15C5D6360262EF5EF3A6E4619177.
- corporativos.js: SHA256 A07445AA581DE7DE74C82951D8416D48976E99748FF342395FF661752C10DD3C.

El HTML entregado sólo agrega el cargador y la hoja de estilos. Los dos módulos corporativos están intactos. Ninguna función original se reemplaza. No se agregaron integraciones con Wona.

## Comportamiento

Vistas diaria, semanal y mensual, navegación por fecha y tres canchas. Siete colores: clases azul, abiertas verde, torneos naranja, corporativos violeta, alquileres gris, recuperaciones celeste y lluvia rojo. Hay texto identificador además del color.

Clases, canchas abiertas y corporativos se leen de sus tablas existentes mediante una vista con permisos del usuario. Las fechas y horarios se actualizan en esas mismas filas. Las clases grupales se muestran una vez por grupo/cancha y el movimiento es transaccional para todos sus participantes, sólo en esa fecha; no modifica la recurrencia, alumnos, importes ni pagos. El formulario permite editar el horario y cancha; los demás datos siguen en sus formularios originales.

La creación de clases, abiertas y corporativos abre los formularios existentes. Torneos, alquileres, recuperaciones y lluvia usan la nueva tabla y aparecen también en Agenda. Cada alta mantiene el mismo UUID durante los reintentos del formulario: una respuesta perdida no crea otra fila. Un reintento de edición con versión antigua se rechaza y pide actualizar. Luego de recargar, consultar la agenda antes de volver a dar de alta una operación de resultado incierto.

Arrastrar propone otra fecha/cancha y abre la confirmación editable del horario. En celular se puede usar el mismo formulario sin arrastrar. Las consultas descartan respuestas antiguas, reemplazan las tarjetas y se actualizan al entrar, cambiar fecha, recuperar foco y cada 15 segundos en Planner. Agenda actualiza los extras al entrar, cambiar fecha y recuperar foco.

Lluvia se puede superponer a actividades ya agendadas: las conserva y bloquea nuevas reservas. No cancela clases, genera recuperaciones automáticamente ni modifica cobros. Recuperaciones son reservas independientes; esta versión no administra créditos de alumnos.

## Integridad y permisos

`planner.sql` agrega dos tablas, la vista de lectura y una operación transaccional con control de versión. Las escrituras usan los permisos del usuario y RLS; no concede roles ni políticas de acceso. Un grupo sin permiso completo revierte entero.

`planner-guards.sql` agrega bloqueos y validaciones de ocupación para los módulos originales y el Planner. Serializa antes de las escrituras y valida al finalizar la transacción para contemplar grupos y metadatos. Se probó entre conexiones independientes. Conserva los triggers existentes. La comprobación de ocupación usa una función con visibilidad administrativa exclusivamente para rechazar conflictos ocultos por permisos de lectura; no realiza escrituras y devuelve un error genérico. Debe ser propiedad de un rol administrativo confiable y no tener EXECUTE público.

Los horarios se interpretan como fecha/hora local del club; no se permiten intervalos nocturnos que crucen medianoche. Canchas múltiples de corporativos se aceptan como `1, 2` o `Cancha 1, Cancha 2`; otros textos quedan pendientes de revisión.

**Regla confirmada por POINT:** todas las clases duran una hora y la cancha es indistinta. `planner-auto.sql` asigna cualquier cancha disponible, conserva la actual si sigue libre y mantiene juntos los participantes de un grupo. Al crear o cambiar una clase desde el formulario existente, la asignación se realiza en la misma transacción. También asigna las clases previas al aplicar la migración. Si falta capacidad o hay lluvia u otro bloqueo, revierte la operación sin mover horarios, profesores ni otras reservas. Las clases no pueden cruzar medianoche. Las clases previamente programadas se conservan al registrar lluvia.

El programa original no guarda cancha ni fin: esos son los únicos metadatos agregados, sin copiar fechas a otra agenda. Las reservas de otras fuentes con datos incompletos mantienen el bloqueo conservador hasta revisarlas. La asignación automática se aplica dentro de la base con los permisos del usuario; al activar también se necesita autorizar `planner_asignar_clases(date,text)` a los roles permitidos y escritura controlada en `planner_clases`.

## Validación realizada

- `node --test --test-isolation=none planner-point/planner.test.cjs planner-point/planner-auto.test.cjs`: pruebas de esquema, grupos, importes conservados, datos faltantes, horarios contiguos, conflictos, lluvia, versiones, permisos RLS y rollback. Asignación automática de las clases existentes y nuevas, tres canchas simultáneas, rechazo de la cuarta, cambio de horario, duración fija y conservación de asistencia durante lluvia. Conflictos desde escrituras directas de canchas abiertas también rechazados. Comparación exacta de conservación del programa original aprobada.
- `node planner-point/planner-browser.cjs`: navegador con TODAS las solicitudes interceptadas. Alta, edición sin duplicar, arrastre, siete colores, tres vistas, sincronización con Agenda, rechazo de permisos, modal existente y móvil. `browser-results.json` y tres capturas.
- `node planner-point/planner-concurrency.cjs`: PostgreSQL local, tres conexiones independientes. Planner contra alta nativa, alta nativa contra Planner y dos altas Planner simultáneas. Un único ocupante en cada caso. `concurrency-results.json`. Servidor apagado al terminar.

Los datos de todas estas pruebas son ficticios y locales. Las pruebas no equivalen a una validación con la base real y sus triggers.

## Para completar la activación

1. Ejecutar `inspect-production.sql` en modo de sólo lectura y contrastar esquema, políticas y funciones de bloqueo reales. La documentación de permisos de octubre no sustituye esta verificación. El programa público no muestra inicio de sesión ni roles diferenciados; no se inventó un sistema de usuarios.
2. Restaurar una copia de pruebas y aplicar, en este orden, `planner.sql`, `planner-guards.sql` y `planner-auto.sql`. La tercera migración asigna las clases de una hora a las canchas libres. Resolver los conflictos históricos detectados sin alterar automáticamente las reservas existentes. Probar los formularios originales junto con las reglas de bloqueo reales.
3. Definir las políticas y GRANT de las dos tablas nuevas, vista y RPC exclusivamente para la audiencia autorizada. Por defecto no tienen acceso público: sin este paso el módulo queda cerrado. No copiar permisos amplios de otras tablas sin revisar.
4. Con resultado revisado y autorización de publicación, aplicar las migraciones y permisos verificados en una transacción sobre la base respaldada y publicar index.html, planner.js y planner.css junto con los módulos corporativos ya existentes.

No publicar solamente el HTML: el Planner necesita las tres migraciones y los permisos. Eliminar únicamente el cargador de index.html desactiva la vista, pero no los nuevos triggers; su reversión necesita una migración específica y no debe borrar tablas ni actividades guardadas.
