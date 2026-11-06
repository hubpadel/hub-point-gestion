# Corrección de tiempo de espera de Logros

El panel recorría las vistas de eventos/candidatos/resultados reiteradamente por cada registro. La consulta privada nueva materializa eventos, identidades de tareas y decisiones una sola vez, y comparte ese análisis al cargar el panel y al validar una atribución. Conserva reglas de medallas, estados vigentes, historial, exclusión de duplicados y permisos. Desactiva JIT solo dentro de estas funciones para evitar su coste de compilación en el informe interactivo; no aumenta límites de tiempo globales.

Migración: aplicar logros-analisis-rapido.sql después de logros-resultados.sql. No escribe ni elimina decisiones. analisis_rapido no tiene acceso directo desde anon o authenticated; los RPC originales mantienen validación de administradora.

La pantalla mantiene el último resultado exitoso del mismo mes si falla un refresco. Al fallar la primera carga, muestra Resumen no disponible, nunca contadores cero. Una respuesta de otro mes no reemplaza el resultado actual. Serializa solicitudes y conserva la limpieza de datos al cerrar sesión.

Verificación: pruebas PGlite de Oro/Plata/Bronce, atribución y duplicados originales; partido armado y clase sin tarea; privacidad de la función auxiliar. QA con fixture para refresco fallido después de éxito y primer intento fallido. Consulta real con rol authenticated y límite de 3 segundos: 1241 ms en la verificación del 06/11/2026; devuelve 3 aprobados vigentes y 13 propuestas. La medición describe esa ejecución, no garantiza latencia fija.
