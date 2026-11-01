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
 const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 function contacts(students,players){
  const rows=students.filter(s=>s.activo!==false).map(s=>({...s,alumno_id:s.id}));
  for(const p of players){
   if(students.some(s=>s.activo===false&&s.id===p.alumno_id))continue;
   const found=rows.find(s=>(p.alumno_id&&s.alumno_id===p.alumno_id)||(phone(p.telefono)&&phone(s.telefono)===phone(p.telefono))||norm(s.nombre)===norm(p.nombre));
   if(found){found.categoria=p.categoria||found.categoria;found.sexo=p.sexo||found.sexo;found.telefono=found.telefono||p.telefono;}
   else rows.push({...p,alumno_id:p.alumno_id||null});
  }
  return rows;
 }
 function coach(date,students,classes,players=[],tasks=[],events=[],participants=[]){
  const people=contacts(students,players),ideas=[],used=new Set();
  const eligible=p=>!tasks.some(t=>((p.alumno_id&&t.alumno_id===p.alumno_id)||(phone(p.telefono)&&phone(t.telefono)===phone(p.telefono))||norm(t.contacto)===norm(p.nombre))&&(!closed(t)||String(t.actualizado||t.fecha).slice(0,10)>=shift(date,-7)));
  function add(p,key,titulo,motivo,mensaje,steps,priority=4,extra={}){
   const identity=p.alumno_id||phone(p.telefono)||norm(p.nombre);
   if(!eligible(p)||used.has(identity)||!phone(p.telefono))return;
   used.add(identity);ideas.push({key,alumno_id:p.alumno_id||null,nombre:p.nombre,contacto:p.nombre,telefono:p.telefono,titulo,motivo,mensaje,steps,prioridad:priority,tipo:'Propuesta',...extra});
  }
  for(const s of suggest(date,students,classes)){
   const p=people.find(p=>p.alumno_id===s.alumno_id);if(!p)continue;
   add(p,s.key,s.titulo+' · '+p.nombre,s.motivo,s.mensaje,[
    'Leé el historial del contacto y enviá el mensaje preparado. No prometas una recuperación.',
    'Si responde que sí, pedile dos opciones de día y horario. Anotalas en Resultado / notas.',
    'Consultá cancha en Wona y profesor disponible. Usá el precio vigente; si falta, pedilo a Administración.',
    'Ofrecé la opción verificada. Si acepta, registrá la reserva en Agenda y copiá su referencia para marcar Confirmada.'
   ],s.prioridad);
  }
  for(const e of events.filter(e=>e.estado==='Activa'&&e.fecha>=date&&e.fecha<=shift(date,7)).sort((a,b)=>(a.fecha+a.hora_inicio).localeCompare(b.fecha+b.hora_inicio))){
   const enrolled=participants.filter(p=>p.cancha_abierta_id===e.id),seats=Number(e.cupo_maximo)-enrolled.length;
   if(!(seats>0))continue;
   const category=norm(e.categoria),gender=norm(e.tipo),verified=!!e.wona_reserva_id&&/confirm|sincronizada/.test(norm(e.wona_estado));
   // Only single, unambiguous categories are matched. Suma/combined formats need sporting judgment.
   if(!/^\d+(ta|ma|va|na|ra)?$/.test(category))continue;
   const digits=category.match(/^\d+/)[0];
   const candidates=people.filter(p=>/^\d+(ta|ma|va|na|ra)?$/.test(norm(p.categoria))&&norm(p.categoria).match(/^\d+/)[0]===digits&&((gender==='femenina'&&norm(p.sexo)==='femenino')||(gender==='masculina'&&norm(p.sexo)==='masculino'))&&!enrolled.some(x=>norm(x.nombre)===norm(p.nombre)));
   for(const p of candidates.slice(0,5)){
    const offer=`cancha abierta ${e.tipo.toLowerCase()} ${e.categoria}, ${e.fecha} a las ${String(e.hora_inicio).slice(0,5)}`;
    const price=Number(e.valor_por_jugador)>0?` Valor por jugador: $${Number(e.valor_por_jugador).toLocaleString('es-AR')}.`:'';
    add(p,'abierta:'+e.id+':'+(p.alumno_id||p.id),'Consultar interés · '+p.nombre,`${seats} lugares según el registro de ${offer}. Categoría y modalidad coinciden con su ficha; disponibilidad del jugador por consultar.`,
     `¡Hola, ${p.nombre}! Soy {responsable}, de Point 🎾 ¿Te interesaría participar en una ${offer}?${price} Estoy consultando interés; te confirmo el lugar después de verificar disponibilidad.`,[
      'Revisá los inscriptos de esta cancha abierta antes de contactar: los lugares pueden cambiar.',
      verified?'Comprobá que el bloqueo de Wona siga vigente.':'Pedí a recepción verificar y bloquear esa franja en Wona; el programa todavía no lo confirma.',
      'Usá el mensaje para consultar interés. No garantices un lugar ni cobres antes de verificar cupo, precio y coordinador.',
      'Si acepta, agregalo a Cancha abierta en Agenda, registrá la confirmación y luego marcá Confirmada con su referencia.'
     ],e.fecha===date?1:3,{oferta:offer});
   }
  }
  // Rotating small batches make new audiences manageable without contacting everyone at once.
  const ordered=people.slice().sort((a,b)=>norm(a.nombre).localeCompare(norm(b.nombre)));
  const offset=ordered.length?Math.floor(Date.parse(date+'T12:00:00Z')/86400000)*5%ordered.length:0;
  const rotated=ordered.slice(offset).concat(ordered.slice(0,offset));
  for(const p of rotated){
   if(ideas.filter(i=>i.key.startsWith('preferencias:')).length>=5)break;
   add(p,'preferencias:'+(p.alumno_id||phone(p.telefono)||norm(p.nombre))+':'+date,'Reunir interesados · '+p.nombre,
    p.categoria?`Tiene categoría ${p.categoria}; falta relevar disponibilidad e interés para crear una actividad nueva.`:'No tiene categoría registrada. Primero reunimos información para organizar una propuesta adecuada.',
    `¡Hola, ${p.nombre}! Soy {responsable}, de Point 🎾 Estamos reuniendo interesados para nuevas propuestas. ¿Qué días y horarios te sirven? ¿Preferís partidos, canchas abiertas o clases? ${p.categoria?'¿Seguís jugando en categoría '+p.categoria+'?':'¿Qué categoría estás jugando? Si no la conocés, contanos tu experiencia y lo consultamos con un profe.'}`,
    ['Enviá esta consulta, sin ofrecer horarios ni precios todavía.',
     'Copiá días, horarios, actividad y nivel que responda en Resultado / notas. Actualizá su categoría en Jugadores si la informa; si no sabe, consultá al profesor.',
     'Marcá Le interesa y fijá el próximo seguimiento. Así la otra recepcionista ve la misma respuesta.',
     'Con interesados para el mismo horario, pedí a Lore o al profesor definir el formato y precio. Después verificá cancha y profesor/coordinador antes de convocar.']);
  }
  return ideas.sort((a,b)=>a.prioridad-b.prioridad||a.titulo.localeCompare(b.titulo,'es'));
 }
 return {priorities,shift,closed,compare,phone,whatsapp,suggest,validate,dailyPlan,contacts,coach};
});
