# Partidos armados

En recepción: botón PARTIDOS y acceso + PARTIDOS en la barra de Agenda. Dos parejas activas por partido y una cancha. Femenina, Masculina o Mixta, categoría libre con sugerencias habituales. Se puede reservar el horario sin jugadores y completar las parejas después.

Horario: selección cada 15 minutos desde 08:00; fin hasta 00:00 del cierre del mismo día (PostgreSQL 24:00). Se muestra 00:00 para medianoche. El servidor valida horario, cancha y solapamientos con la agenda existente.

Datos en public.partidos, vinculados por ID único a planner_actividades con tipo partidos. Escrituras transaccionales mediante partidos_guardar, revisión optimista e idempotencia. No duplica registros en pagos. Los jugadores conservan identificadores en las ediciones. Una pareja con cobros no se elimina; se conserva como cancelada y no ocupa uno de los dos cupos activos. La reserva de cancha del partido permanece: cancelar una pareja no cancela el partido completo.

Asistencia y cobro individual; teléfono y sugerencias de jugadores/alumnos existentes. Los importes individuales se conservan; el precio general se aplica a las parejas nuevas. Descargar parejas inscritas en Excel. El Planner usa color turquesa, edición desde el módulo y evita arrastrar un partido fuera de su formulario.

Integración privada: fuente Partidos en Finanzas (cobros por fecha de pago; costos y saldos por fecha de actividad); asistencia o pago puede proponer incorporación para validar en Logros, con identidad y gestión previa suficientes. No se otorgan medallas automáticamente.

Aplicar partidos.sql y después partidos-finanzas.sql una sola vez, tras Planner, Logros y Finanzas privadas. Nuevos permisos operativos iguales a Torneos/Planner; no se cambian las protecciones de administración. No se modifican reservas ni cobros existentes.

Pruebas aisladas con PGlite, usando migraciones base del repositorio. Cubren medianoche, horarios rechazados, dos parejas, una cancha, atomicidad ante conflicto, revisión obsoleta, reintento sin duplicados, conservación de jugadores cobrados y consultas privadas. QA visual con fixture separado que no se publica.
