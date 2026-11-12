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
 function mondayOf(date){
  const day=new Date(date+'T12:00:00Z').getUTCDay();
  return shift(date,-((day+6)%7));
 }
 function weeklySocialTask(date){
  if(date<'2026-11-16'||mondayOf(date)!==date)return null;
  return {
   fecha:date,hora:'09:00',responsable:'Clari',prioridad:2,tipo:'Tarea',estado:'Pendiente',
   titulo:'Armar la agenda de la semana para redes',
   motivo:'Revisar clases, partidos, canchas abiertas y torneos confirmados. Preparar la agenda de lunes a domingo con horarios, categorías y cupos verificados, y dejarla lista para compartir en redes.',
   contacto:'',telefono:'',oferta:'',mensaje:'',notas:'',reserva:'',seguimiento:null,
   origen:'semanal:agenda-redes:'+date,alumno_id:null
  };
 }
 function clariOpenSales(tasks,date){
  return tasks.filter(t=>{
   const openedBy=t.historial?.[0]?.responsable||t.responsable;
   const hasOpportunity=t.contacto||t.alumno_id||t.telefono||t.oferta||t.tipo==='Propuesta';
   return openedBy==='Clari'&&t.fecha<=date&&!closed(t)&&hasOpportunity;
  }).sort(compare);
 }
 function scheduledCapacity(date, events, participants, matches, tournaments, targets) {
  const inWindow = day => day >= date && day <= shift(date, 7);
  const activities = [];
  const add = (kind, id, title, day, time, enrolled, unit, fallback) => {
   const key = 'meta-cupo:' + kind + ':' + id;
   const target = Number(targets.get(key)?.notas || fallback) || null;
   activities.push({key, title, day, time: String(time || '').slice(0, 5), enrolled, unit, target,
    missing: target === null ? null : Math.max(0, target - enrolled), fixed: kind === 'partido'});
  };
  for (const e of events) {
   if (!inWindow(e.fecha) || e.estado !== 'Activa' || e.finalizado_en || e.archivado_en) continue;
   const enrolled = participants.filter(p => p.cancha_abierta_id === e.id && String(p.nombre || '').trim()).length;
   add('abierta', e.id, ['Cancha abierta', e.tipo, e.categoria].filter(Boolean).join(' · '), e.fecha, e.hora_inicio, enrolled, 'jugadores', e.cupo_maximo);
  }
  for (const [kind, rows] of [['partido', matches], ['torneo', tournaments]]) {
   for (const row of rows) {
    const a = row.actividad;
    if (!a || !inWindow(a.fecha) || row.finalizado_en || row.archivado_en || /cancel|suspend|finaliz/.test(norm(a.estado))) continue;
    const enrolled = (row.datos?.parejas || []).filter(p => p.estado === 'Inscripta').length;
    add(kind, row.id, a.titulo || (kind === 'partido' ? 'Partido' : 'Torneo'), a.fecha, a.inicio, enrolled, 'parejas', kind === 'partido' ? 2 : null);
   }
  }
  return activities.sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time));
 }
 function teacherGaps(date, classes) {
  const groups = new Map();
  for (const c of classes) {
   if (!c.profesor_id || c.fecha < date || c.fecha > shift(date, 7) || /cancel|suspend|ausente/.test(norm(c.estado))) continue;
   const [hour, minute] = String(c.hora || '').split(':').map(Number);
   if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) continue;
   const key = c.fecha + ':' + c.profesor_id;
   if (!groups.has(key)) groups.set(key, {day:c.fecha, teacherId:c.profesor_id, starts:new Set()});
   groups.get(key).starts.add(hour * 60 + minute);
  }
  const gaps = [];
  const time = n => String(Math.floor(n / 60)).padStart(2,'0') + ':' + String(n % 60).padStart(2,'0');
  for (const {day, teacherId, starts} of groups.values()) {
   const sorted = [...starts].sort((a,b)=>a-b);
   for (let i=1; i<sorted.length; i++) {
    const start = sorted[i-1] + 60, end = sorted[i];
    if (end - start >= 60) gaps.push({day, teacherId, start:time(start), end:time(end)});
   }
  }
  return gaps.sort((a,b)=>(a.day+a.start).localeCompare(b.day+b.start));
 }
 function dailyPlan(date){return [
 ['Clari','08:00',1,'Completar cupos de hoy','Empezá por las actividades con lugares pendientes más próximas. Contactá jugadores compatibles, registrá las confirmaciones en Agenda y actualizá Action para ver cuánto falta.'],
 ['Clari','08:30',1,'Resolver bajas y reemplazos','Buscá reemplazos para las actividades próximas que perdieron inscriptos. Priorizá según horario y lugares pendientes.'],
 ['Clari','09:30',1,'Recuperar clientes inactivos','Revisar alumnos y jugadores sin actividad reciente. Consultar qué les gustaría retomar y ofrecer una clase, partido o cancha abierta con horario y cupo verificados. Registrar respuesta y próximo paso.'],
 ['Clari','11:00',2,'Cerrar respuestas de la mañana','Revisar mensajes efectivamente enviados, registrar respuestas y concretar reservas en la agenda. Agendar seguimiento de interesados.'],
 ['Clari','12:00',2,'Generar ventas y reservas','Revisar cupos y horarios disponibles. Ofrecer opciones concretas a clientes inactivos e interesados, y confirmar las reservas aceptadas en Agenda. Dejar las oportunidades abiertas con el próximo paso para Tamy.'],
 ['Clari','14:00',3,'Trabajar reservas de próximos días','Revisar cupos reales de actividades y contactar candidatos compatibles. No repetir contactos con acciones abiertas.'],
 ['Clari','15:30',2,'Preparar pase a Tamy','Actualizar resultado, notas y próximo seguimiento en cada tarea. Reasignar a Tamy lo que deba continuar desde las 16.'],
 ['Tamy','16:00',1,'Completar cupos y cerrar propuestas de Clari','Empezá por los cupos de hoy. Retomá las propuestas de Clari que ayudan a completarlos y registrá los inscriptos confirmados en Agenda.'],
 ['Tamy','17:00',4,'Proponer la próxima visita','Conversar con quienes están en el club. Ofrecer su próxima reserva; registrar preferencias si todavía no confirman.'],
 ['Tamy','18:00',2,'Seguir interesados con respuesta pendiente','Revisar seguimientos acordados y actualizar resultados. No volver a contactar sin revisar el historial.'],
 ['Tamy','19:00',3,'Completar mañana y próximos días','Invitar a cupos y horarios verificados. Usar mensajes preparados con nivel y condiciones reales.'],
 ['Tamy','20:00',4,'Revisar si ya se puede abrir una actividad','Usá el panel de cupos. Si todavía quedan lugares o metas por definir, seguí con la agenda existente. Si está completa, elegí una actividad nueva con interesados compatibles.'],
 ['Tamy','21:30',2,'Cerrar turno y dejar próximos pasos','Registrar reservas conseguidas y referencias. Dejar notas y seguimiento para Clari, cambiando fecha y hora al turno correspondiente.']
 ].map(([responsable,hora,prioridad,titulo,motivo])=>({fecha:date,hora,responsable,prioridad,titulo,motivo,tipo:'Tarea',estado:'Pendiente',contacto:'',telefono:'',oferta:'',mensaje:'',notas:'',reserva:'',seguimiento:null,origen:'jornada:'+date+':'+responsable+':'+hora,alumno_id:null})).concat(weeklySocialTask(date)||[]);}
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
 function coach(date,students,classes,players=[],tasks=[],events=[],participants=[],capacity=null){
  const people=contacts(students,players),ideas=[],used=new Set();
  const eligible=p=>!tasks.some(t=>((p.alumno_id&&t.alumno_id===p.alumno_id)||(phone(p.telefono)&&phone(t.telefono)===phone(p.telefono))||norm(t.contacto)===norm(p.nombre))&&(!closed(t)||String(t.actualizado||t.fecha).slice(0,10)>=shift(date,-7)));
  function add(p,key,titulo,motivo,mensaje,steps,priority=4,extra={}){
   const identity=p.alumno_id||phone(p.telefono)||norm(p.nombre);
   if(!eligible(p)||used.has(identity)||!phone(p.telefono))return;
   used.add(identity);ideas.push({key,alumno_id:p.alumno_id||null,nombre:p.nombre,contacto:p.nombre,telefono:p.telefono,titulo,motivo,mensaje,steps,prioridad:priority,tipo:'Propuesta',...extra});
  }
  for(const e of events.filter(e=>e.estado==='Activa'&&e.fecha>=date&&e.fecha<=shift(date,7)).sort((a,b)=>(a.fecha+a.hora_inicio).localeCompare(b.fecha+b.hora_inicio))){
   const enrolled=participants.filter(p=>p.cancha_abierta_id===e.id);
   const seats=capacity ? capacity.find(a=>a.key==='meta-cupo:abierta:'+e.id)?.missing : Number(e.cupo_maximo)-enrolled.length;
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
  for(const s of suggest(date,students,classes)){
   const p=people.find(p=>p.alumno_id===s.alumno_id);if(!p)continue;
   add(p,s.key,s.titulo+' · '+p.nombre,s.motivo,s.mensaje,[
    'Leé el historial del contacto y enviá el mensaje preparado. No prometas una recuperación.',
    'Si responde que sí, pedile dos opciones de día y horario. Anotalas en Resultado / notas.',
    'Consultá cancha en Wona y profesor disponible. Usá el precio vigente; si falta, pedilo a Administración.',
    'Ofrecé la opción verificada. Si acepta, registrá la reserva en Agenda y copiá su referencia para marcar Confirmada.'
   ],s.prioridad);
  }
  // Rotating small batches make new audiences manageable without contacting everyone at once.
  const ordered=people.slice().sort((a,b)=>norm(a.nombre).localeCompare(norm(b.nombre)));
  const offset=ordered.length?Math.floor(Date.parse(date+'T12:00:00Z')/86400000)*5%ordered.length:0;
  const rotated=ordered.slice(offset).concat(ordered.slice(0,offset));
  for(const p of capacity?.some(a=>a.missing!==0) ? [] : rotated){
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

 const interestOptions={actividades:['Clases','Partidos','Canchas abiertas','Torneos','Horario fijo','Empresas'],categorias:['Principiante','9na','8va','7ma','6ta','5ta','4ta','3ra','2da','1ra','A confirmar'],dias:['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'],modalidad:['A confirmar','Femenino','Masculino','Mixto']};
 function cleanInterests(v){
  if(!v||typeof v!=='object'||Array.isArray(v))return null;
  const out={};for(const k of ['actividades','categorias','dias'])out[k]=interestOptions[k].filter(x=>Array.isArray(v[k])&&v[k].includes(x));
  out.modalidad=interestOptions.modalidad.includes(v.modalidad)?v.modalidad:'A confirmar';out.activo=v.activo!==false;
  for(const k of ['desde','hasta'])out[k]=/^([01]\d|2[0-3]):[0-5]\d$/.test(v[k]||'')?v[k]:'';
  return out;
 }
 function validateInterests(v){const p=cleanInterests(v);if(p?.desde&&p.hasta&&p.desde>=p.hasta)throw Error('El horario hasta debe ser posterior al horario desde.');return p;}
 function interestedContacts(tasks){
  // Link snapshots by student ID or phone; names alone never merge distinct clients.
  const groups=[];
  const ordered=tasks.slice().sort((a,b)=>String(b.actualizado||b.fecha||'').localeCompare(String(a.actualizado||a.fecha||''))||String(b.id||'').localeCompare(String(a.id||'')));
  for(const t of ordered){const aliases=[t.alumno_id&&'a:'+t.alumno_id,phone(t.telefono)&&'p:'+phone(t.telefono)].filter(Boolean);if(!aliases.length)aliases.push('t:'+t.id);
   const matches=groups.filter(g=>aliases.some(x=>g.aliases.has(x)));
   const g=matches[0]||{aliases:new Set(),rows:[]};if(!matches.length)groups.push(g);
   for(const other of matches.slice(1)){other.aliases.forEach(x=>g.aliases.add(x));g.rows.push(...other.rows);groups.splice(groups.indexOf(other),1);}
   aliases.forEach(x=>g.aliases.add(x));g.rows.push(t);
  }
  return groups.map(g=>g.rows.sort((a,b)=>ordered.indexOf(a)-ordered.indexOf(b)).find(t=>t.intereses!==null&&t.intereses!==undefined)).filter(Boolean).map(t=>({...t,intereses:cleanInterests(t.intereses)})).filter(t=>t.intereses?.activo&&t.intereses.actividades.length).sort((a,b)=>String(a.contacto).localeCompare(String(b.contacto),'es'));
 }
 function interestLists(tasks,filters={}){
  const groups=new Map();for(const t of interestedContacts(tasks)){const p=t.intereses;if(filters.modalidad&&p.modalidad!==filters.modalidad||filters.dia&&!p.dias.includes(filters.dia))continue;
   for(const activity of p.actividades){if(filters.actividad&&activity!==filters.actividad)continue;for(const category of p.categorias.length?p.categorias:['A confirmar']){if(filters.categoria&&category!==filters.categoria)continue;
    const key=activity+' · '+category+' · '+p.modalidad;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);
   }}
  }return Array.from(groups,([titulo,personas])=>({titulo,personas})).sort((a,b)=>a.titulo.localeCompare(b.titulo,'es'));
 }
 return {interestOptions,cleanInterests,validateInterests,interestedContacts,interestLists,priorities,shift,closed,compare,phone,whatsapp,suggest,validate,dailyPlan,scheduledCapacity,teacherGaps,mondayOf,weeklySocialTask,clariOpenSales,contacts,coach};
});
