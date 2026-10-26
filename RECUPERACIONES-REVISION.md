# Recuperar clase — revisión local del 26/10/2026

**Actualización posterior:** la validación de la migración y siete controles con el esquema real se completaron en una rama aislada de Supabase, posteriormente eliminada. Ver `RECUPERACIONES-SUPABASE.md`, que actualiza los pendientes de este informe inicial. Producción continúa sin cambios; falta habilitar un autorizador real y autorizar la activación.

Implementado y probado localmente. Rama remota de prueba: `codex/recuperar-clase-prueba`. Se entrega como propuesta de revisión, sin fusionar ni desplegar. No se aplicaron migraciones ni se escribieron datos en Supabase de producción.

## Base y acceso

Repositorio: https://github.com/hubpadel/hub-point-gestion

Base remota consultada: `main`, commit `0cefd25d35d4d99d3c249f760faf73d254f43a57`.

Se conservaron las carpetas anteriores y `sources/`. Esta carpeta es una reconstrucción local de los archivos de revisión existentes, no un clon completo con la historia remota. Antes de cambiar código se comprobaron los identificadores Git de index.html, planner.js, package.json, planner.test.cjs, tests/core.test.cjs y .gitignore: coinciden exactamente con los de esa base remota. Se creó la rama LOCAL `codex/recuperar-clase-prueba`. El parche adjunto contiene únicamente los cambios sobre esos archivos y archivos nuevos; no reemplaza la historia del repositorio.

Cuenta conectada: hubpadel. Los intentos iniciales devolvieron HTTP 403, `Resource not accessible by integration`. GitHub mostraba el conector autorizado para identificar la cuenta pero sin instalación en repositorios. Tras instalar ChatGPT Codex Connector limitado a `hubpadel/hub-point-gestion`, la creación de la rama remota funcionó. No se usó la cuenta de Finanzas. El commit remoto se construye sobre el árbol y el padre reales de main; no se sube la historia local reconstruida.

El Git incluido no pudo clonar por HTTPS porque falta el helper `remote-https`. La entrega usa la conexión GitHub autorizada, sin credenciales alternativas.

## Comportamiento

- Botón grupal por lluvia en cada clase de Agenda y botón individual en cada participante.
- Formulario precargado con fecha, hora, profesor y alumnos originales. El alta registra una recuperación pendiente; luego se programa desde el panel, con hora original precargada, fecha editable y cancha.
- Lluvia incluye todos los participantes de ese grupo en esa fecha/hora. Individual incluye sólo el participante elegido y exige un usuario habilitado en servidor.
- La relación conserva cada ID de clase y una instantánea original. Cada clase admite una sola recuperación, incluso si dos solicitudes llegan simultáneamente.
- Programar crea una sola reserva de una hora en `planner_actividades`. Reprogramar mueve esa misma reserva; conserva vínculo e ID. Debe ser posterior a la clase original.
- El panel muestra y filtra pendientes, programadas y realizadas. Una recuperación sólo puede finalizar después de su horario y queda cerrada para reprogramación. Los reintentos no duplican la operación.
- Planner usa violeta `#A78BFA` para recuperaciones. Abrir una reserva vinculada lleva al formulario de recuperación. No se arrastra una recuperación: se reprograma desde su formulario. Las reservas antiguas independientes no se convierten automáticamente en créditos y conservan su editor.
- La opción de crear una recuperación independiente se oculta en las nuevas actividades de Planner; se inicia desde Agenda para mantener el vínculo.
- No se crean filas nuevas en clases, pagos ni liquidaciones; los cálculos financieros existentes se conservan. La clase original no se mueve, cancela ni modifica automáticamente por lluvia.
- Los vínculos impiden borrar una clase original ya relacionada: cualquier borrado o baja que intente eliminarla falla, preservando el historial. No se implementó anulación de créditos ni división posterior de un grupo.

## Autorización individual y permisos

El programa anterior no tiene usuarios diferenciados. El panel incorpora acceso por correo/contraseña mediante Supabase Auth. El usuario debe existir y su UUID debe figurar en `recuperaciones_autorizadores`; iniciar sesión por sí solo no autoriza. Esa tabla sólo la administra el propietario de la base. La comprobación del usuario se realiza con `auth.uid()` en la operación de servidor, no mediante un nombre escrito ni una casilla.

Las recuperaciones grupales, programación y finalización mantienen la audiencia operativa actual de Agenda (`anon` y `authenticated`). Las lecturas conservan esa audiencia. No se presenta esto como una restricción general de usuarios de la aplicación. Las tablas nuevas sólo permiten escrituras mediante tres funciones acotadas. Estas funciones usan un propietario administrativo y un search_path fijo; no escriben datos financieros. La lista de autorizadores no tiene acceso público. La protección de reservas vinculadas impide editarlas directamente desde el Planner genérico.

Pendiente real: configurar una cuenta de pruebas y habilitarla en la lista de autorizadores en un Supabase de pruebas. La autorización se verificó con identidades ficticias en PostgreSQL, no con una cuenta real. No se crearon usuarios ni enviaron correos. No se verificó la configuración real de acceso por contraseña de Supabase.

## Pruebas realizadas

- 7 verificaciones de recuperación en PostgreSQL embebido (incluyen el caso contenedor): grupo completo, reintentos, individual sin/con permiso, fechas posteriores, conflictos con rollback, versión vieja, protección de vínculos y finalización. Comparación exacta antes/después de clases, pagos y liquidaciones: sin cambios.
- 19 pruebas de regresión de Planner, asignación automática, cobros corporativos, finanzas e interfaz: aprobadas. Los dos controles de conservación del HTML reconocen exclusivamente los nuevos botones y cargadores; el resto del programa original sigue comparándose con su referencia.
- Navegador Edge aislado: botones, datos precargados, respuesta perdida, reprogramación del mismo ID, color violeta, apertura desde Planner, realización, filtros, rechazo de individual y pantalla móvil. Todas las solicitudes interceptadas; ningún acceso a producción. Sin errores de consola. Resultado en `recuperaciones-browser-results.json`; capturas locales desktop y mobile.
- PostgreSQL 17 local, tres conexiones independientes: dos altas de la misma clase crean un solo crédito; dos reservas simultáneas para la misma cancha confirman una; dos reprogramaciones con la misma versión rechazan la segunda. Servidor detenido al finalizar. Resultado en `recuperaciones-concurrency-results.json`.

Para repetir: instalar las dependencias existentes del proyecto y ejecutar `npm run test:recuperaciones`. Para la prueba de navegador hace falta Playwright 1.62.1 y Edge; ejecutar `npm run test:recuperaciones:browser`. Para concurrencia en Windows se requieren las dependencias opcionales PostgreSQL del proyecto: `npm run test:recuperaciones:concurrency`. Se usaron dependencias ya disponibles en esta computadora; no se actualizó el lockfile.

Las simulaciones no sustituyen la validación en una copia de Supabase con su esquema, triggers y usuarios reales. El HTML heredado conserva la conexión de producción: no abrirlo directamente como entorno de pruebas. La prueba de navegador suministrada intercepta todas las solicitudes y usa datos ficticios.

## Entrega y pasos pendientes

1. Revisar los cambios en la rama remota de prueba. La base main se volvió a consultar antes de crearla y coincide con la base indicada. No fusionar ni desplegar todavía.
2. Restaurar Supabase en un proyecto separado de pruebas. Sobre su esquema Planner vigente aplicar **sólo** `recuperaciones.sql`; no volver a aplicar las migraciones Planner ya instaladas. El archivo `deploy.sql` anterior no incluye este módulo.
3. Configurar el sitio de pruebas para ese Supabase, crear/habilitar un autorizador de pruebas y validar tanto sesiones anónimas como autorizadas y permisos reales. No apuntar la vista de pruebas al proyecto productivo.
4. Mantener la propuesta como PR borrador hasta completar la validación en Supabase de pruebas. El 403 quedó resuelto; no fusionar ni desplegar automáticamente.

Título de PR preparado: `Recuperar clases: vínculo original, programación y control sin duplicar cobros`.

Descripción preparada: Agrega recuperación grupal por lluvia e individual con autorización de Supabase Auth, desde Agenda. Conserva las clases y movimientos financieros originales; programa una única reserva vinculada y permite reprogramarla, finalizarla y consultar pendientes/programadas/realizadas. Planner usa #A78BFA. Incluye migración separada para pruebas y verificaciones de integridad, permisos, navegador y concurrencia. Falta validar en Supabase de pruebas con la configuración real de Auth. No aplicar migraciones ni desplegar a producción desde este PR.
