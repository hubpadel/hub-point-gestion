(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.HubActionCore=api;})(globalThis,()=>{
 'use strict';
 const priorities={1:['Resolver hoy','#b42318'],2:['Cerrar oportunidades','#b54708'],3:['Completar próximos días','#926000'],4:['Generar reservas','#1d4ed8']};
 const shift=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
 const closed=t=>['Confirmada','Cerrada'].includes(t.estado);
 const compare=(a,b)=>Number(closed(a))-Number(closed(b))||a.prioridad-b.prioridad||String(a.seguimiento||a.fecha+'T'+a.hora).localeCompare(String(b.seguimiento||b.fecha+'T'+b.hora))||a.id.localeCompare(b.id);
 function phone(value){let d=String(value||'').replace(/\D/g,'');if(d.startsWith('00'))d=d.slice(2);return d.length>=10&&d.length<=15?d:null;}
 const whatsapp=(p,m)=>{const n=phone(p);return n?'https://wa.me/'+n+'?text='+encodeURIComponent(m):null;};
 function suggest(date,students,classes){
  const result=[];
  for(const s of students.filter(s=>s.activo!==false)){
   const past=classes.filter(c=>c.alumno_id===s.id&&c.fecha<date).sort((a,b)=>b.fecha.localeCompare(a.fecha));
   const latest=past[0];if(!latest||classes.some(c=>c.alumno_id===s.id&&c.fecha>=date&&!['Canceló','Ausente'].includes(c.estado)))continue;
   let type='',reason='',priority=4;
   if(latest.estado==='Canceló'&&latest.fecha>=shift(date,-14)){type='Retomar continuidad';reason='Última clase cancelada el '+latest.fecha+'. Verificar si ya fue contactado; no implica recuperación autorizada.';priority=2;}
   else if(latest.fecha<shift(date,-21)&&latest.fecha>=shift(date,-90)){type='Reactivar jugador';reason='Última clase registrada el '+latest.fecha+'. Consultar interés y disponibilidad antes de ofrecer horario.';}
   if(type)result.push({key:type+':'+s.id+':'+latest.id,alumno_id:s.id,nombre:s.nombre,telefono:s.telefono||'',titulo:type,prioridad:priority,motivo:reason,mensaje:`¡Hola, ${s.nombre}! ¿Cómo estás? Soy {responsable}, de Point. ¿Te gustaría organizar tu próxima clase o partido? Contame qué días y horarios te sirven y buscamos una opción para vos 🎾`});
  }
  return result.sort((a,b)=>a.prioridad-b.prioridad||a.nombre.localeCompare(b.nombre,'es'));
 }
 function validate(t){if(!t.titulo?.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(t.fecha)||!['Clari','Tamy'].includes(t.responsable))throw Error('Completá título, fecha y responsable.');const h=t.hora||'';if(!/^\d{2}:\d{2}$/.test(h)||(t.responsable==='Clari'?(h<'08:00'||h>='16:00'):(h<'16:00'||h>='22:00')))throw Error('La tarea debe quedar dentro del turno de '+t.responsable+'.');if(t.seguimiento&&!Number.isFinite(Date.parse(t.seguimiento)))throw Error('Fecha de seguimiento inválida.');return t;}
 function dailyPlan(date){return [
 ['Clari','08:00',1,'Revisar ocupación de las 3 canchas','Verificar Wona y Planner. Registrar espacios reales de hoy y próximos días con horario, cancha y condiciones. No inferir disponibilidad de las clases solamente.'],
 ['Clari','08:30',1,'Resolver partidos y espacios de hoy','Priorizar partidos incompletos y cancelaciones. Crear una tarea por contacto con propuesta verificada. Registrar nivel y disponibilidad antes de invitar.'],
 ['Clari','09:30',2,'Retomar oportunidades detectadas','Revisar cancelaciones y alumnos sin próxima clase en Oportunidades detectadas. Preparar tareas personalizadas, comprobando contactos recientes.'],
 ['Clari','11:00',2,'Cerrar respuestas de la mañana','Revisar mensajes efectivamente enviados, registrar respuestas y concretar reservas en la agenda. Agendar seguimiento de interesados.'],
 ['Clari','12:00',4,'Crear una propuesta nueva','Elegir una franja disponible y usar Crear cosas nuevas. Reunir interesados por nivel y disponibilidad; verificar profesor o coordinador y condiciones aprobadas.'],
 ['Clari','14:00',3,'Trabajar reservas de próximos días','Revisar cupos reales de actividades y contactar candidatos compatibles. No repetir contactos con acciones abiertas.'],
 ['Clari','15:30',2,'Preparar pase a Tamy','Actualizar resultado, notas y próximo seguimiento en cada tarea. Reasignar a Tamy lo que deba continuar desde las 16.'],
 ['Tamy','16:00',1,'Retomar pase de Clari y resolver hoy','Leer pendientes y última acción antes de contactar. Priorizar los lugares de esta tarde y noche.'],
 ['Tamy','17:00',4,'Proponer la próxima visita','Conversar con quienes están en el club. Ofrecer su próxima reserva; registrar preferencias si todavía no confirman.'],
 ['Tamy','18:00',2,'Seguir interesados con respuesta pendiente','Revisar seguimientos acordados y actualizar resultados. No volver a contactar sin revisar el historial.'],
 ['Tamy','19:00',3,'Completar mañana y próximos días','Invitar a cupos y horarios verificados. Usar mensajes preparados con nivel y condiciones reales.'],
 ['Tamy','20:00',4,'Desarrollar la propuesta nueva','Continuar la convocatoria iniciada por Clari o preparar una propuesta con las herramientas. Registrar interesados y qué falta para realizarla.'],
 ['Tamy','21:30',2,'Cerrar turno y dejar próximos pasos','Registrar reservas conseguidas y referencias. Dejar notas y seguimiento para Clari, cambiando fecha y hora al turno correspondiente.']
 ].map(([responsable,hora,prioridad,titulo,motivo])=>({fecha:date,hora,responsable,prioridad,titulo,motivo,tipo:'Tarea',estado:'Pendiente',contacto:'',telefono:'',oferta:'',mensaje:'',notas:'',reserva:'',seguimiento:null,origen:'jornada:'+date+':'+responsable+':'+hora,alumno_id:null}));}
 return {priorities,shift,closed,compare,phone,whatsapp,suggest,validate,dailyPlan};
});
