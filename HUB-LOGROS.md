# Logros comerciales privados

Panel separado: `administracion.html`. Nunca reutiliza el acceso de recepción: sesión en sessionStorage con clave propia, cierre local y bloqueo tras 15 minutos sin interacción. El acceso no concede ni modifica roles en `app_profiles`.

## Acceso

Aplicar `hub-logros.sql` y después `hub-logros-acceso.sql` con el conector del proyecto Point. La lista `point_logros.accesos` comienza vacía: nadie puede leer los resultados hasta vincular un correo de administración de Point. Debe verificarse la identidad del correo con la propietaria. El acceso exige un usuario Supabase con ese correo verificado; no usa metadatos editables de usuario. No incluir correos privados ni contraseñas en el repositorio.

La recepción anónima y usuarios autenticados fuera de la lista no pueden consultar resultados, aprobar medallas ni acceder al esquema privado. Se mantienen las políticas operativas actuales.

## Criterios

- Cruza gestiones con inscripciones de Clases, Canchas abiertas y Torneos.
- Exige asistencia en clases; asistencia o pago en canchas y torneos. Las consultas sin inscripción nunca generan medallas.
- Gestión registrada en los 30 días anteriores. En clases y canchas, se descartan inscripciones creadas antes de la primera acción registrada.
- Propone la tarea confirmada o más reciente. La atribución se verifica en administración porque los responsables pueden cambiar y recepción no utiliza identidades individuales autenticadas.
- Oro: sin actividad anterior registrada. Plata: más de 90 días sin actividad. Bronce: otro programa con actividad reciente. El umbral de 90 días es explícito en pantalla.
- Evita atribuciones automáticas por homónimos ambiguos. Torneos se vinculan por nombre único y se advierte al revisar.
- Una medalla aprobada por cliente y programa. Aprobación transaccional con control de duplicados; registro permanente del respaldo, responsable validado, observación y usuario verificador.
- Una fuente cancelada o sin respaldo vigente deja de sumar aunque exista el registro de revisión. Se puede anular con motivo; nunca borra el historial.
- Las propuestas se recalculan al entrar, cambiar mes y cada minuto mientras el panel está visible. No son métricas de desempeño sin validación de la propietaria.
- Partidos, horarios fijos y empresas todavía no tienen un vínculo individual verificable equivalente en las fuentes; no se inventan logros para esas actividades.

## Validación

`node --test hub-logros.test.cjs`: autorización, correo verificado, rechazo de recepción, identidad ambigua, oro/plata/bronce, reserva preexistente, duplicados, atribución validada, cancelación y anulación. Los tests usan una base aislada; no crean clientes ni logros de ejemplo en producción.
