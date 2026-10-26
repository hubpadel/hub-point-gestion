# Recuperación por enlace

El coordinador habilita hasta 20 opciones de fecha, hora y cancha por suspensión, desde **Clases a recuperar → Habilitar horarios / enviar enlace**. Requiere iniciar sesión en **Acceso del coordinador: individuales y enlaces** con una cuenta de `recuperaciones_autorizadores` (la cuenta existente hubpadelsp@gmail.com ya está habilitada).

Guardar crea un enlace compartible, válido durante 14 días. Se puede copiar o abrir WhatsApp con un mensaje preparado; la aplicación no envía mensajes sola. Guardar opciones nuevas cambia el enlace y deja inválido el anterior. Desactivar enlace impide seguir utilizándolo.

El alumno abre `recuperar.html#token`, sin ingresar a gestión ni iniciar sesión. Sólo ve la fecha suspendida, profesor, cantidad de participantes y opciones habilitadas que siguen libres. No recibe nombres de compañeros, importes ni otras clases. En recuperación grupal, se avisa explícitamente que su elección agenda al grupo completo.

La confirmación usa la recuperación original y su misma reserva, por lo que desaparece del listado pendiente y aparece en Agenda y Planner como **Clase recuperada**, violeta. Dos elecciones simultáneas no crean ni cambian dos reservas: la primera confirma y la segunda recibe la fecha efectivamente confirmada. Un reintento después de perder conexión también devuelve esa reserva. Cambios posteriores se solicitan al coordinador.

## Disponibilidad e integridad

Las opciones se verifican al habilitar, al consultar y al confirmar: deben ser futuras, posteriores a la suspensión, durar una hora y tener cancha libre. Se incluyen reservas del Planner, lluvia, alquileres, eventos y clases. También se comprueba que el profesor no tenga otra clase o recuperación al mismo tiempo. Se conserva el bloqueo transaccional común del Planner y sus controles de ocupación.

La tabla de enlaces tiene RLS sin lectura o escritura directa para `anon`/`authenticated`. Sólo la cuenta coordinadora habilitada puede administrar opciones; las dos funciones públicas requieren el token aleatorio y no permiten elegir una fecha arbitraria. El token queda en el fragmento de URL y la página no envía Referer. No se cambian los permisos de tablas existentes.

Instalar **recuperaciones-enlaces.sql** después de las migraciones anteriores. Los envoltorios **recuperaciones-enlaces-validar.sql** y **recuperaciones-enlaces-produccion.sql** comparan huellas de clases, pagos, liquidaciones y recuperaciones antes/después; el primero revierte, el segundo confirma. La instalación no crea enlaces ni reservas para datos reales.

## Pruebas

- PostgreSQL embebido: permisos, privacidad, opciones inválidas, enlaces rotados/revocados/vencidos, conflicto posterior de cancha/profesor, confirmación grupal, reintentos e integridad financiera. Incluye ambos envoltorios de instalación.
- Navegador móvil con PostgreSQL embebido y red interceptada: coordinador habilita opciones, enlace compartible, alumno elige, reserva grupal, persistencia e inválidos.
- PostgreSQL nativo con tres conexiones: dos alumnos eligen diferentes opciones simultáneamente; ambos reciben una única fecha confirmada. El runtime Windows de prueba sin tzdata usa el desplazamiento UTC−3 equivalente; el SQL entregado conserva America/Argentina/Buenos_Aires.
- Regresiones de Asistencia, Agenda, Planner, cobros y funciones anteriores.

Los resultados de navegador y concurrencia se guardan en `recuperaciones-enlaces-browser-results.json` y `recuperaciones-enlaces-concurrency-results.json`. Las pruebas usan datos ficticios y no escriben producción.
