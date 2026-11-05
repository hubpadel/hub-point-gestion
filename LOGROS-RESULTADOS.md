# Resultados comerciales adicionales

- Partido armado: una propuesta Bronce por partido con dos parejas activas, cuatro nombres y reserva en agenda. No exige pago ni asistencia; es un logro distinto de incorporar un cliente a Partidos. Fecha del logro: creación del partido (Buenos Aires). Conserva participantes, actividad y respaldo en el detalle privado.
- Se añade Armado por (Clari/Tamy) a recepción. No asigna medallas; solo propone responsable para revisión privada. Los registros anteriores sin responsable permiten atribución manual por administración con observación obligatoria.
- Clases: primera incorporación con asistencia registrada puede revisarse aunque no exista una tarea previa de HUB Action. Conserva las reglas de Oro/Plata/Bronce y exclusión de repetición del mismo programa dentro de 90 días. Una clase futura pendiente no acredita incorporación; una clase repetida no crea otra medalla por el mismo programa.
- Un mismo partido suma una medalla por armado, no cuatro. Los participantes siguen pudiendo generar incorporaciones nuevas según las reglas originales; el resumen diferencia clientes incorporados y partidos armados.
- Aprobar requiere acceso personal de administración. No se atribuyen casos sin responsable por inferencias de turnos. Las propuestas sin atribuir permanecen visibles al filtrar una empleada.
- Se conserva la tabla privada de decisiones, la validación del estado actual, el bloqueo compartido para no duplicar y las anulaciones con historial. tarea_id puede ser null para estos resultados. Un partido que deja de tener cuatro jugadores activos deja de sumar, pero su decisión permanece guardada.

Aplicar logros-resultados.sql después de Logros privados, Partidos y Finanzas. La migración no otorga ni reasigna medallas existentes, ni modifica clientes, reservas, pagos o tareas.

Pruebas PGlite aisladas: privacidad anon/no-admin, clase sin tarea, cuatro jugadores en un único logro, atribución explícita, observación obligatoria sin responsable, duplicados rechazados, aprobación vigente, partido incompleto sin suma. QA del formulario y contador con datos ficticios separados de producción.
