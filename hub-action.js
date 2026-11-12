/* HUB Action: no envía mensajes ni modifica reservas, cobros o liquidaciones. */
(()=>{'use strict';
 const C=HubActionCore,make=(tag,text,parent)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;parent?.append(e);return e;};
 const root=make('section',undefined,document.querySelector('main'));root.id='hubAction';root.className='view';
 const nav=make('button','HUB Action',document.querySelector('nav'));nav.dataset.view=root.id;nav.onclick=()=>{switchView(root.id);load();};
 make('h2','Agenda comercial · Clari y Tamy',root);make('p','Clari recupera clientes inactivos y genera ventas de 8 a 16 hs. Tamy retoma las oportunidades abiertas por Clari para intentar cerrarlas de 16 a 22 hs.',root);
 const bar=make('div',undefined,root);bar.className='toolbar';
 const date=make('input',undefined,bar);date.type='date';date.value=localISO();date.setAttribute('aria-label','Día de trabajo');
 const owner=make('select',undefined,bar);owner.setAttribute('aria-label','Turno');for(const v of ['Todos','Clari','Tamy'])owner.add(new Option(v,v));
 const refresh=make('button','Actualizar',bar),generate=make('button','Armar jornada del día',bar),add=make('button','+ Tarea / propuesta',bar);generate.disabled=true;
 const status=make('p','Consultando base compartida…',root);status.setAttribute('role','status');
 const legend=make('div',undefined,root);legend.className='ha-legend';for(const [n,[label,color]]of Object.entries(C.priorities)){const l=make('b','P'+n+' · '+label,legend);l.style.color=color;}
 make('p','Verde: confirmada · Gris: cerrada · Violeta: recuperación (tipo de actividad). El color de prioridad se mantiene separado del estado.',root).className='ha-meta';
 const kpis=make('div',undefined,root);kpis.className='ha-kpis';
 const grid=make('div',undefined,root);grid.className='ha-grid';const left=make('div',undefined,grid),right=make('aside',undefined,grid);
 const capacityPanel=make('section',undefined,left);
 make('h3','Prioridad 1 · Completar la agenda',capacityPanel);
 const capacityList=make('div',undefined,capacityPanel);
 const proposalButtons=[];
 const clariHandoff=make('section',undefined,left);
 make('h3','Para retomar de Clari · Tamy',clariHandoff);
 make('p','Priorizá las propuestas que Clari dejó abiertas. Revisá qué ofreció y registrá el resultado en la misma tarea.',clariHandoff);
 const clariHandoffList=make('div',undefined,clariHandoff);
 make('h3','Tu próximo paso para generar reservas',left);make('p','Las recomendaciones se recalculan con los datos del programa. Elegí una y tocá Guardar acción y abrir su WhatsApp. No hace falta inventar una actividad.',left);const suggestions=make('div',undefined,left);
 make('h3','Tareas pendientes · por trabajar',left);make('p','La rutina aparece automáticamente para cada fecha. Primero resolvé urgencias y seguimientos; después trabajá los contactos recomendados. Guardá el resultado para compartirlo con el otro turno.',left);const list=make('div',undefined,left);make('h3','En seguimiento · ya trabajadas',left);make('p','Mensajes enviados e interesados que todavía necesitan un próximo paso. No vuelven a contarse como tareas sin trabajar.',left);const handoff=make('div',undefined,left);const archive=make('details',undefined,left);make('summary','Historial de tareas finalizadas',archive);const completed=make('div',undefined,archive);
 make('h3','Cómo convertir respuestas en reservas',right);make('p','1. Consultá interés con el texto preparado. 2. Registrá respuesta, nivel y horarios en la tarea. 3. Pedí a Lore o al profesor el formato si hace falta. 4. Verificá Wona, precio y coordinador/profesor. 5. Confirmá en Agenda y anotá la referencia.',right);make('p','Si no responde: retomá una vez al próximo día hábil. Si no le interesa: cerrá la tarea. No envíes mensajes repetidos por tu cuenta.',right);make('h3','Crear actividades nuevas · paso a paso',right);make('p','Elegí una herramienta, seleccioná un contacto y completá la propuesta. Guardá una acción por invitado para seguir interesados y confirmados entre turnos.',right);
 const templates=[
 ['Armar un partido','Verificar cancha y horario. Seleccionar 4 jugadores con nivel y disponibilidad compatibles. Registrar invitados y confirmados.','¡Hola, {nombre}! Soy {responsable}, de Point. Estamos armando un partido para {oferta}. ¿Te gustaría sumarte? 🎾'],
 ['Crear una cancha abierta','Verificar cancha, nivel, coordinador, precio aprobado y cupos antes de convocar.','¡Hola, {nombre}! Soy {responsable}, de Point. Estamos organizando una cancha abierta: {oferta}. ¿Te interesa participar? 🎾'],
 ['Formar un grupo de clases','Reunir interesados por nivel y disponibilidad. Confirmar profesor y condiciones antes de ofrecer un horario.','¡Hola, {nombre}! Soy {responsable}, de Point. Estamos reuniendo interesados para clases: {oferta}. ¿Qué días y horarios te sirven? 🎾'],
 ['Proponer un horario fijo','Verificar disponibilidad semanal y condiciones aprobadas. Ofrecer continuidad al grupo.','¡Hola, {nombre}! Soy {responsable}, de Point. ¿Les gustaría tener un horario fijo para jugar? La propuesta es {oferta}. ¿Cómo lo ven? 🎾'],
 ['Conocer disponibilidad','Completar nivel, días, horarios e intereses en la ficha del jugador.','¡Hola, {nombre}! Soy {responsable}, de Point. Estamos organizando nuevas propuestas 🎾 ¿Qué días y horarios te sirven? ¿Preferís partidos, canchas abiertas o clases? ¿Qué nivel estás jugando?'],
 ['Propuesta para empresas','Usar un paquete y precio aprobados por Administración. Registrar interés y dejar el cierre a Administración.','¡Hola, {nombre}! Soy {responsable}, de Point. Tenemos propuestas de pádel para equipos de trabajo: {oferta}. ¿Te gustaría que te compartamos la información?']
 ];
 for(const tpl of templates){const d=make('details',undefined,right);make('summary',tpl[0],d);make('p',tpl[1],d);const prepare=make('button','Preparar propuesta',d);proposalButtons.push(prepare);prepare.onclick=()=>open({titulo:tpl[0],tipo:'Propuesta',motivo:tpl[1]+'\n\n1. Seleccioná un contacto de la lista.\n2. Consultá nivel, días y horarios; anotá la respuesta.\n3. Reuní interesados compatibles y verificá cancha, profesor/coordinador, cupos y precio.\n4. Completá la oferta y enviá la invitación.\n5. Registrá cada respuesta y su próximo seguimiento.\n6. Al completar el grupo, agendá y registrá la referencia de reserva.',mensaje:tpl[2]});}
 make('p','Las propuestas no bloquean canchas. Confirmá disponibilidad en Wona y registrá la reserva en la agenda correspondiente. Las excepciones comerciales requieren aprobación de Administración.',right).className='ha-meta';

 const interestPanel=make('section',undefined,root);make('h3','Listas de interesados · compartidas',interestPanel);make('p','Se arman al registrar la respuesta del cliente. Una persona puede estar en varias listas. Son intereses relevados, no reservas ni grupos confirmados. Las listas incluyen todos los días y ambos turnos.',interestPanel);
 const interestBar=make('div',undefined,interestPanel);interestBar.className='toolbar';const interestFilters={};
 for(const [key,label,values]of [['actividad','Actividad',C.interestOptions.actividades],['categoria','Categoría',C.interestOptions.categorias],['modalidad','Modalidad',C.interestOptions.modalidad],['dia','Día disponible',C.interestOptions.dias]]){const l=make('label',label,interestBar),e=make('select',undefined,l);e.add(new Option('Todas / todos',''));values.forEach(v=>e.add(new Option(v,v)));interestFilters[key]=e;e.onchange=renderInterests;}
 make('button','Ver listas de interesados',bar).onclick=()=>interestPanel.scrollIntoView({block:'start',behavior:'smooth'});make('button','Registrar respuesta del cliente',bar).onclick=()=>openInterest();
 const interestNew=make('button','+ Registrar respuesta de un cliente',interestBar);interestNew.onclick=()=>openInterest();const interestCount=make('p','',interestPanel),interestList=make('div',undefined,interestPanel);
 function openInterest(t={}){let next=C.shift(localISO(),1);open({...t,titulo:t.titulo||'Registrar interés de cliente',tipo:t.tipo||'Propuesta',estado:(!t.estado||['Pendiente','Enviado'].includes(t.estado))?'Interesada':t.estado,seguimiento:t.seguimiento||next+'T09:30'});interestEditor.scrollIntoView({block:'center'});}
 function renderInterests(){interestList.replaceChildren();if(!ready){interestCount.textContent='No se pudieron cargar las listas compartidas.';return;}const groups=C.interestLists(tasks,Object.fromEntries(Object.entries(interestFilters).map(([k,e])=>[k,e.value])));interestCount.textContent=groups.length+' listas · '+new Set(groups.flatMap(g=>g.personas.map(t=>t.id))).size+' personas en el filtro actual';
  if(!groups.length)make('p','Todavía no hay respuestas registradas para estos filtros. Usá Registrar respuesta o el menú en la tarea del cliente.',interestList);
  for(const g of groups){const box=make('details',undefined,interestList);make('summary',g.titulo+' · '+g.personas.length+' interesados',box);for(const t of g.personas){const row=make('article',undefined,box);row.className='ha-card';const p=t.intereses;make('b',t.contacto||'Sin nombre',row);make('p',(p.dias.join(', ')||'Días a confirmar')+' · '+(p.desde||'Hora a confirmar')+(p.hasta?' a '+p.hasta:''),row);make('p','Última respuesta: '+String(t.actualizado||t.fecha).slice(0,10)+' · '+t.responsable,row);const a=make('div',undefined,row);a.className='ha-actions';const link=C.whatsapp(t.telefono,`¡Hola, ${t.contacto}! Soy ${owner.value==='Tamy'?'Tamy':'Clari'}, de Point 🎾 Registramos tu interés en ${p.actividades.join(', ')}. ¿Seguís con la misma disponibilidad para que te tengamos en cuenta en las próximas propuestas?`);if(link){const w=make('a','Abrir WhatsApp',a);w.href=link;w.target='_blank';w.rel='noopener noreferrer';}make('button','Actualizar respuesta / intereses',a).onclick=()=>openInterest(t);}}
 }

 const responsesPanel=make('section',undefined,root);make('h3','Respuestas registradas · ambos turnos',responsesPanel);make('p','Acá quedan las respuestas e intereses guardados, aunque la tarea ya esté finalizada. Escribir solo una nota no selecciona actividades: completá el menú de intereses para sumarlo a sus listas.',responsesPanel);const responsesList=make('div',undefined,responsesPanel);
 make('button','Ver respuestas registradas',bar).onclick=()=>responsesPanel.scrollIntoView({block:'start',behavior:'smooth'});
 function renderResponses(){responsesList.replaceChildren();if(!ready){make('p','No se pudieron cargar las respuestas compartidas.',responsesList);return;}const rows=tasks.filter(t=>t.contacto&&(t.intereses||['Interesada','Confirmada','Cerrada'].includes(t.estado))).sort((a,b)=>String(b.actualizado||b.fecha).localeCompare(String(a.actualizado||a.fecha)));if(!rows.length)make('p','Todavía no hay respuestas registradas. Abrí la tarea del cliente y registrá qué respondió.',responsesList);
  for(const t of rows){const box=make('details',undefined,responsesList);make('summary',t.contacto+' · '+(t.estado==='Cerrada'?'Finalizada':t.estado==='Confirmada'?'Reserva confirmada':t.estado)+' · '+String(t.actualizado||t.fecha).slice(0,10),box);const p=C.cleanInterests(t.intereses);if(p){make('p','Intereses: '+(p.actividades.join(', ')||'Sin actividades seleccionadas')+' · Categorías: '+(p.categorias.join(', ')||'A confirmar')+' · '+p.modalidad,box);make('p','Disponibilidad: '+(p.dias.join(', ')||'Días a confirmar')+' · '+(p.desde||'Horario a confirmar')+(p.hasta?' a '+p.hasta:'')+(p.activo?'':' · Interés pausado'),box);}else make('p','Falta completar el menú de intereses para incluirlo en las listas por actividad y categoría.',box);make('p','Respuesta / notas: '+(t.notas||'Sin detalle adicional registrado.'),box);if(t.seguimiento&&!C.closed(t))make('p','Próximo seguimiento: '+t.seguimiento.replace('T',' '),box);make('button','Ver / actualizar respuesta',box).onclick=()=>openInterest(t);}
 }
 const dialog=make('dialog',undefined,root),form=make('form',undefined,dialog);make('h3','Preparar acción comercial',form);const fields={};
 for(const [key,label,type]of [['titulo','Acción','text'],['fecha','Fecha de trabajo','date'],['hora','Hora de ejecución','time'],['contacto','Contacto','text'],['telefono','WhatsApp con código de país (ej. 54911…)','tel'],['oferta','Horario, nivel, precio y cupos verificados / propuesta','text'],['seguimiento','Próximo seguimiento','datetime-local'],['reserva','Referencia de reserva confirmada','text']]){const l=make('label',label,form);fields[key]=make('input',undefined,l);fields[key].type=type;fields[key].required=['titulo','fecha','hora'].includes(key);}
 for(const [key,label,options]of [['responsable','Responsable',['Clari','Tamy']],['prioridad','Prioridad',['1','2','3','4']],['tipo','Tipo',['Tarea','Propuesta','Recuperación']],['estado','Resultado',['Pendiente','Enviado','Interesada','Confirmada','Cerrada']]]){const l=make('label',label,form);fields[key]=make('select',undefined,l);for(const v of options)fields[key].add(new Option(key==='prioridad'?'P'+v+' · '+C.priorities[v][0]:v,v));}
 for(const [key,label]of [['motivo','Motivo y pasos'],['mensaje','Mensaje editable · usá {nombre}, {responsable} y {oferta}'],['notas','Resultado / notas para el próximo turno']]){const l=make('label',label,form);fields[key]=make('textarea',undefined,l);fields[key].rows=3;}

 const interestEditor=make('fieldset',undefined,form);make('legend','¿Qué eligió el cliente?',interestEditor);make('p','Marcá todas las opciones que respondió. No asignes una categoría si no la informó. Al guardar, se actualizan las listas automáticamente.',interestEditor);const interestChecks={};
 for(const [key,label]of [['actividades','Actividades de interés'],['categorias','Categorías informadas'],['dias','Días disponibles']]){const group=make('fieldset',undefined,interestEditor);make('legend',label,group);interestChecks[key]=C.interestOptions[key].map(v=>{const l=make('label',undefined,group);l.style.display='inline-flex';l.style.marginRight='14px';l.style.gap='6px';const e=make('input',undefined,l);e.type='checkbox';e.value=v;e.style.width='auto';make('span',v,l);return e;});}
 const interestMode=make('select',undefined,make('label','Modalidad solicitada',interestEditor));C.interestOptions.modalidad.forEach(v=>interestMode.add(new Option(v,v)));
 const interestActive=make('select',undefined,make('label','Disponibilidad para recibir propuestas',interestEditor));interestActive.add(new Option('Activo en las listas','si'));interestActive.add(new Option('Pausado / no desea propuestas','no'));
 const interestTimes={};for(const [key,label]of [['desde','Disponible desde'],['hasta','Disponible hasta']]){const e=make('input',undefined,make('label',label,interestEditor));e.type='time';interestTimes[key]=e;}
 let interestTouched=false;interestEditor.addEventListener('change',()=>interestTouched=true);
 function fillInterests(v){const p=C.cleanInterests(v)||{};for(const[k,checks]of Object.entries(interestChecks))checks.forEach(e=>e.checked=(p[k]||[]).includes(e.value));interestMode.value=p.modalidad||'A confirmar';interestActive.value=p.activo===false?'no':'si';for(const[k,e]of Object.entries(interestTimes))e.value=p[k]||'';interestTouched=false;}
 function readInterests(){return C.validateInterests({...Object.fromEntries(Object.entries(interestChecks).map(([k,checks])=>[k,checks.filter(e=>e.checked).map(e=>e.value)])),modalidad:interestMode.value,activo:interestActive.value==='si',desde:interestTimes.desde.value,hasta:interestTimes.hasta.value});}
 const contacts=make('select',undefined,make('label','Elegir de alumnos y jugadores',form));contacts.add(new Option('Sin seleccionar',''));contacts.onchange=()=>{if(contacts.value==='')return;const p=contactRows[Number(contacts.value)];if(p){fields.contacto.value=p.nombre;fields.telefono.value=p.telefono||'';const existing=tasks.filter(t=>(p.alumno_id&&t.alumno_id===p.alumno_id)||(C.phone(p.telefono)&&C.phone(t.telefono)===C.phone(p.telefono))).sort((a,b)=>String(b.actualizado||b.fecha).localeCompare(String(a.actualizado||a.fecha)));const pending=existing.find(t=>!C.closed(t));if(!editing?.id&&pending){openInterest(pending);return;}const previous=existing.find(t=>t.intereses)?.intereses;fillInterests(previous);if(previous)interestTouched=true;editing={...(editing||{}),alumno_id:p.alumno_id||null};}};
 form.insertBefore(interestEditor,fields.titulo.parentElement);form.insertBefore(contacts.parentElement,interestEditor);
 const note=make('p','',form);note.setAttribute('role','status');const save=make('button','Guardar y mantener estado / seguimiento',form);save.type='submit';const finish=make('button','Guardar respuesta y finalizar tarea',form);finish.type='submit';make('p','Finalizar la tarea la retira de pendientes y seguimiento. La respuesta y las listas de interesados se conservan. Usá mantener seguimiento si todavía tenés que concretar la propuesta.',form);const preview=make('a','Abrir WhatsApp de este contacto',form);preview.target='_blank';preview.rel='noopener noreferrer';preview.hidden=true;const updatePreview=()=>{const data=Object.fromEntries(Object.entries(fields).map(([k,e])=>[k,e.value]));const text=msg(data);const link=C.whatsapp(data.telefono,text);preview.hidden=!link||!text||/\{[^}]+\}/.test(text)||(/\{oferta\}/.test(data.mensaje)&&!data.oferta);if(!preview.hidden)preview.href=link;};form.addEventListener('input',updatePreview);form.addEventListener('change',updatePreview);const cancel=make('button','Cerrar',form);cancel.type='button';cancel.onclick=()=>dialog.close();
 let tasks=[],ready=false,busy=false,editing=null,contactRows=[],generation=0,loadedClasses=[],loadedStudents=[],loadedPlayers=[],loadedEvents=[],loadedParticipants=[],loading=false;
 let loadedMatches=[],loadedTournaments=[],capacityTargets=new Map();
 function open(seed={}){fillInterests(seed.intereses);editing=seed.id?seed:null;const person=seed.responsable||(owner.value==='Tamy'?'Tamy':'Clari');const defaults={titulo:'',fecha:date.value,hora:person==='Clari'?'09:00':'16:00',responsable:person,prioridad:4,tipo:'Tarea',estado:'Pendiente'};for(const [k,e]of Object.entries(fields))e.value=seed[k]??defaults[k]??'';contactRows=C.contacts(loadedStudents,loadedPlayers);contacts.replaceChildren(new Option('Sin seleccionar',''));contactRows.forEach((p,i)=>contacts.add(new Option(p.nombre,String(i))));fields.hora.value=fields.hora.value.slice(0,5);note.textContent=ready?'':'La base compartida necesita activación. Podés preparar el texto, pero aún no guardar.';save.disabled=!ready;finish.disabled=!ready;updatePreview();dialog.showModal();}
 const msg=t=>String(t.mensaje||'').replaceAll('{responsable}',t.responsable).replaceAll('{nombre}',t.contacto||'').replaceAll('{oferta}',t.oferta||'');
 function card(t,parent){const a=make('article',undefined,parent);a.className='ha-card';a.style.setProperty('--ha-color',t.estado==='Confirmada'?'#15803d':t.estado==='Cerrada'?'#667085':C.priorities[t.prioridad][1]);make('b',`P${t.prioridad} · ${t.hora} · ${t.responsable} · ${t.estado==='Cerrada'?'Finalizada':t.estado==='Confirmada'?'Reserva confirmada':t.estado}`,a);make('h4',t.titulo,a);if(t.contacto)make('p',t.contacto,a);make('p',t.motivo||'',a).className='ha-meta';if(t.oferta)make('p',t.oferta,a);if(t.tipo==='Recuperación')make('b','Recuperación · sin duplicar ingresos ni liquidación',a).style.color='#7e22ce';if(t.seguimiento)make('p','Seguimiento: '+t.seguimiento.replace('T',' '),a);if(t.notas)make('p','Pase: '+t.notas,a);if(t.reserva)make('p','Reserva: '+t.reserva,a);const text=msg(t);if(text)make('p',text,a).className='ha-message';const actions=make('div',undefined,a);actions.className='ha-actions';const unresolved=/\{[^}]+\}/.test(text)||(/\{oferta\}/.test(t.mensaje||'')&&!t.oferta);const link=!C.closed(t)&&text&&!unresolved&&C.whatsapp(t.telefono,text);if(link){const w=make('a','Abrir WhatsApp con mensaje',actions);w.href=link;w.target='_blank';w.rel='noopener noreferrer';}else if(!C.closed(t)&&(t.contacto||t.mensaje))make('span',unresolved?'Completá la propuesta antes de abrir WhatsApp.':'Completá teléfono internacional y mensaje para contactar.',actions);make('button','Registrar resultado / editar',actions).onclick=()=>open(t);if(t.contacto)make('button','Registrar qué le interesa',actions).onclick=()=>openInterest(t);if(!C.closed(t)&&!t.contacto&&!t.mensaje)make('button','Marcar realizada',actions).onclick=()=>open({...t,estado:'Cerrada'});if(!C.closed(t)&&(t.contacto||t.mensaje)){for(const [label,state]of [['Ya envié','Enviado'],['Le interesa','Interesada'],['No le interesa / cerrar','Cerrada']])make('button',label,actions).onclick=()=>{open({...t,estado:state});if(state==='Interesada'){let next=C.shift(localISO(),1);while([0,6].includes(new Date(next+'T12:00:00Z').getUTCDay()))next=C.shift(next,1);fields.seguimiento.value=next+'T09:30';}note.textContent='Anotá la respuesta y guardá. Si no le interesa, dejá el motivo para el próximo turno.';};}const history=make('details',undefined,a);make('summary','Historial de acciones',history);for(const h of t.historial||[])make('p',`${h.fecha} · ${h.responsable} · ${h.estado} · ${h.notas||''}`,history);}
 function renderCapacity() {
  capacityList.replaceChildren();
  const activities=ready ? C.scheduledCapacity(date.value,loadedClasses,loadedEvents,loadedParticipants,loadedMatches,loadedTournaments,capacityTargets) : [];
  const pending=activities.filter(a=>a.missing!==0);
  for(const button of proposalButtons)button.disabled=!ready||loading||pending.length>0;
  if(!ready)return activities;
  const complete=activities.length-pending.length;
  const today=pending.filter(a=>a.day===date.value).length;
  const unknown=pending.filter(a=>a.target===null).length;
  make('p',`${complete} de ${activities.length} actividades completas · ${today} por resolver hoy · ${unknown} sin meta · Próximos 7 días incluidos`,capacityList);
  make('p',pending.length?'Primero completá la agenda. Las sugerencias para abrir actividades nuevas se habilitan al cubrir los cupos.':'La agenda revisada está completa. Ya podés preparar propuestas nuevas.',capacityList);
  for(const a of pending){
   const row=make('article',undefined,capacityList);row.className='ha-card';
   make('b',`${a.day===date.value?'P1 · Hoy':'P3 · '+a.day} · ${a.time} · ${a.title}`,row);
   make('p',a.target===null?`${a.enrolled} ${a.unit} inscriptos · Falta definir meta`:`${a.enrolled} de ${a.target} ${a.unit} · Faltan ${a.missing}`,row);
   make('button','Ver en Agenda',row).onclick=()=>{
    const agendaDate=document.querySelector('#agendaDate');
    agendaDate.value=a.day;switchView('agenda');agendaDate.dispatchEvent(new Event('change'));
   };
   const names=a.studentIds?.map(id=>loadedStudents.find(student=>student.id===id)?.nombre).filter(Boolean);
   if(names?.length)make('p',names.join(', '),row);
   if(a.missing>0)make('button','Preparar seguimiento de cupo',row).onclick=()=>open({
    titulo:'Completar cupo · '+a.title,prioridad:a.day===date.value?1:3,tipo:'Propuesta',
    oferta:a.title+' · '+a.day+' '+a.time,
    motivo:'Faltan '+a.missing+' '+a.unit+'. Ofrecé este lugar a un contacto compatible y registrá la inscripción en Agenda al confirmar.'
   });
   if(a.fixed)continue;
   const label=make('label',' Meta de '+a.unit+' ',row);
   const input=make('input',undefined,label);input.type='number';input.min='1';input.step='1';input.value=a.target??'';
   const saveGoal=make('button','Guardar meta',row);
   saveGoal.onclick=()=>saveCapacityTarget(a,input.valueAsNumber,saveGoal);
  }
  return activities;
 }
 async function saveCapacityTarget(activity,target,button) {
  if(!ready||busy||loading)return;
  if(!Number.isSafeInteger(target)||target<1){status.textContent='Ingresá una meta entera mayor que cero.';return;}
  busy=true;button.disabled=true;
  const old=capacityTargets.get(activity.key);
  const responsable=owner.value==='Tamy'?'Tamy':'Clari';
  try {
   const result=await db.rpc('hub_action_guardar',{p_id:old?.id||crypto.randomUUID(),p_version:old?.version||0,p_datos:{
    origen:activity.key,titulo:'Meta de cupo · '+activity.title,fecha:activity.day,hora:responsable==='Tamy'?'16:00':'08:00',
    responsable,prioridad:1,tipo:'Tarea',estado:'Cerrada',notas:String(target)
   }});
   if(result.error)throw result.error;
   busy=false;await load();
  } catch(error) {
   status.textContent='No se guardó la meta. '+error.message;
  } finally {
   busy=false;button.disabled=false;
  }
 }
 function render(){const capacity=renderCapacity();renderInterests();renderResponses();clariHandoffList.replaceChildren();clariHandoff.hidden=owner.value==='Clari'||!ready;list.replaceChildren();handoff.replaceChildren();completed.replaceChildren();suggestions.replaceChildren();kpis.replaceChildren();if(!ready){make('p','Agenda compartida no disponible: no es posible calcular pendientes ni oportunidades.',list);return;}const carryover=clariHandoff.hidden?[]:C.clariOpenSales(tasks,date.value);
  const carryoverIds=new Set(carryover.map(t=>t.id));
  const visible=tasks.filter(t=>owner.value==='Todos'||t.responsable===owner.value||carryoverIds.has(t.id));
  for(const t of carryover){
   const item=make('article',undefined,clariHandoffList);
   item.className='ha-card';
   make('b',t.fecha+' · '+t.estado,item);
   make('h4',t.titulo,item);
   if(t.contacto)make('p',t.contacto,item);
   if(t.oferta)make('p',t.oferta,item);
   if(t.notas)make('p',t.notas,item);
   if(t.seguimiento)make('p','Seguimiento acordado: '+t.seguimiento.replace('T',' '),item);
   make('button','Continuar con Tamy',item).onclick=()=>open({...t,responsable:'Tamy'});
  }
  if(!carryover.length&&!clariHandoff.hidden)make('p','No hay oportunidades de Clari para retomar en esta fecha.',clariHandoffList);const routine=C.dailyPlan(date.value).filter(t=>(owner.value==='Todos'||t.responsable===owner.value)&&!tasks.some(x=>x.origen===t.origen));const active=[...visible.filter(t=>t.fecha<=date.value),...routine];const pending=active.filter(t=>t.estado==='Pendiente').sort((a,b)=>a.prioridad-b.prioridad||String(a.fecha+a.hora).localeCompare(String(b.fecha+b.hora)));const following=active.filter(t=>['Enviado','Interesada'].includes(t.estado)).sort(C.compare);const finished=visible.filter(t=>C.closed(t)&&t.fecha<=date.value).sort((a,b)=>String(b.actualizado||b.fecha).localeCompare(String(a.actualizado||a.fecha)));
  for(const [label,n]of [['Por trabajar',pending.length],['En seguimiento',following.length],['Finalizadas',finished.length],['Reservas confirmadas',finished.filter(t=>t.estado==='Confirmada').length]])make('span',label+': '+n,kpis);pending.filter(t=>!carryoverIds.has(t.id)).forEach(t=>card(t,list));following.filter(t=>!carryoverIds.has(t.id)).forEach(t=>card(t,handoff));finished.forEach(t=>card(t,completed));if(!pending.some(t=>!carryoverIds.has(t.id)))make('p','No hay otras tareas pendientes para este turno y fecha.',list);if(!following.some(t=>!carryoverIds.has(t.id)))make('p','No hay otros mensajes o propuestas en seguimiento.',handoff);if(!finished.length)make('p','Todavía no hay tareas finalizadas hasta esta fecha.',completed);

  const ideas=C.coach(date.value,loadedStudents,loadedClasses,loadedPlayers,tasks,loadedEvents,loadedParticipants,capacity);
  nav.textContent='HUB Action'+(ideas.length?' · '+ideas.length:'');
  const shown=[...ideas.filter(s=>s.key.startsWith('abierta:')).slice(0,3),...ideas.filter(s=>s.key.startsWith('preferencias:')).slice(0,5),...ideas.filter(s=>!s.key.startsWith('abierta:')&&!s.key.startsWith('preferencias:')).slice(0,4)].sort((a,b)=>a.prioridad-b.prioridad);
  for(const s of shown){const d=make('article',undefined,suggestions);d.className='ha-card';d.style.setProperty('--ha-color',C.priorities[s.prioridad][1]);make('b','P'+s.prioridad+' · '+s.titulo,d);make('p',s.motivo,d);const steps=make('ol',undefined,d);s.steps.forEach(step=>make('li',step,steps));make('p',s.mensaje.replaceAll('{responsable}',owner.value==='Tamy'?'Tamy':'Clari'),d).className='ha-message';const direct=make('button','Guardar acción y abrir su WhatsApp',d);direct.onclick=()=>startContact(s,direct);make('button','Ver / ajustar antes de contactar',d).onclick=()=>open({...s,origen:s.key,motivo:s.motivo+'\n\n'+s.steps.map((step,i)=>(i+1)+'. '+step).join('\n')});}
  if(!ideas.length)make('p','No hay nuevos contactos elegibles con estas reglas. Continuá los seguimientos guardados. Action volverá a revisar al cambiar los datos.',suggestions);

 }
 async function startContact(s,button){
  if(!ready||busy||loading)return;
  const responsable=owner.value==='Tamy'?'Tamy':owner.value==='Clari'?'Clari':(Number(new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hour:'2-digit',hourCycle:'h23'}).format(new Date()))>=16?'Tamy':'Clari');
  const task={titulo:s.titulo,fecha:date.value,hora:responsable==='Clari'?'09:00':'16:00',responsable,prioridad:s.prioridad,tipo:s.tipo||'Propuesta',estado:'Pendiente',contacto:s.nombre,telefono:s.telefono,oferta:s.oferta||'',motivo:s.motivo+'\n\n'+s.steps.map((v,i)=>(i+1)+'. '+v).join('\n'),mensaje:s.mensaje,notas:'',reserva:'',seguimiento:null,origen:s.key,alumno_id:s.alumno_id||null};
  const url=C.whatsapp(task.telefono,msg(task));if(!url)return;
  const popup=window.open('about:blank','_blank');if(popup)popup.opener=null;
  busy=true;button.disabled=true;status.textContent='Guardando acción antes de abrir WhatsApp…';
  try{const r=await db.rpc('hub_action_guardar',{p_id:crypto.randomUUID(),p_version:0,p_datos:task});if(r.error)throw r.error;
   if(popup)popup.location.replace(url);
   else{const a=make('a','Acción guardada · tocá para abrir WhatsApp',button.parentElement);a.href=url;a.target='_blank';a.rel='noopener noreferrer';}
   busy=false;await load();status.textContent='Acción guardada. En WhatsApp revisá el texto y tocá Enviar. Después registrá Ya envié y la respuesta; abrir el chat no confirma el envío.';
  }catch(e){popup?.close();status.textContent='No se abrió WhatsApp porque no se pudo guardar la acción: '+e.message+'. Actualizá antes de reintentar.';}finally{busy=false;button.disabled=false;}
 }
 async function ensureWeeklySocialTask(rows){
  const today=new Intl.DateTimeFormat('sv-SE',{
   timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'
  }).format(new Date());
  const task=C.weeklySocialTask(C.mondayOf(today));
  if(!task||rows.some(row=>row.origen===task.origen))return;
  const result=await db.rpc('hub_action_guardar',{p_id:crypto.randomUUID(),p_version:0,p_datos:task});
  if(result.error&&result.error.code!=='23505')throw result.error;
  const saved=await db.from('hub_action_tareas').select('*').eq('origen',task.origen).single();
  if(saved.error)throw saved.error;
  rows.push(saved.data);
 }
 async function load(){if(busy||dialog.open)return;const token=++generation;loading=true;for(const button of proposalButtons)button.disabled=true;status.textContent='Revisando nuevos datos y próximos pasos…';try{const [t,s,c,p,e,a,m,u]=await Promise.all([PointCorporativos.readAll(()=>db.from('hub_action_tareas').select('*').order('id')),PointCorporativos.readAll(()=>db.from('alumnos').select('*').order('id')),PointCorporativos.readAll(()=>db.from('clases').select('*').gte('fecha',C.shift(date.value,-90)).order('id')),PointCorporativos.readAll(()=>db.from('jugadores').select('*').order('id')),PointCorporativos.readAll(()=>db.from('canchas_abiertas').select('*').gte('fecha',date.value).lte('fecha',C.shift(date.value,7)).order('id')),PointCorporativos.readAll(()=>db.from('cancha_abierta_jugadores').select('id,cancha_abierta_id,nombre').order('id')),...['partidos','torneos'].map(table=>PointCorporativos.readAll(()=>db.from(table).select('*,actividad:planner_actividades!inner(*)').gte('actividad.fecha',date.value).lte('actividad.fecha',C.shift(date.value,7)).order('id')))]);if(token!==generation)return;let weeklyWarning='';try{await ensureWeeklySocialTask(t);}catch(err){weeklyWarning=' · No se pudo cargar la tarea semanal: '+err.message;}if(token!==generation)return;capacityTargets=new Map(t.filter(row=>row.origen?.startsWith('meta-cupo:')).map(row=>[row.origen,row]));tasks=t.filter(row=>!capacityTargets.has(row.origen));loadedMatches=m;loadedTournaments=u;loadedStudents=s;loadedClasses=c;loadedPlayers=p;loadedEvents=e;loadedParticipants=a;ready=true;status.textContent='Actualizado '+new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})+' · Revisión automática cada minuto y al abrir Action. Las respuestas deben registrarse aquí; WhatsApp y Wona no se sincronizan automáticamente.'+weeklyWarning;}catch(e){if(token!==generation)return;ready=false;tasks=[];loadedStudents=[];loadedClasses=[];loadedPlayers=[];loadedEvents=[];loadedParticipants=[];nav.textContent='HUB Action · revisar conexión';status.textContent='No se pudieron actualizar los datos: '+e.message+'. Reintentá con Actualizar; no contactes basándote en información desactualizada.';}finally{if(token===generation){loading=false;render();save.disabled=!ready;finish.disabled=!ready;generate.disabled=!ready;}}}

 form.onsubmit=async e=>{e.preventDefault();if(!ready||busy)return;const data={};for(const[k,v]of Object.entries(fields))data[k]=v.value.trim();data.prioridad=Number(data.prioridad);data.seguimiento=data.seguimiento||null;const finalize=e.submitter===finish;if(finalize){data.estado=data.estado==='Confirmada'?'Confirmada':'Cerrada';data.seguimiento=null;}try{if(interestTouched||editing?.intereses){data.intereses=readInterests();if(data.intereses.actividades.length&&!data.contacto)throw Error('Seleccioná el cliente para guardar sus intereses.');}C.validate(data);if(data.estado==='Enviado'&&(!C.phone(data.telefono)||!data.mensaje))throw Error('Completá teléfono y mensaje antes de registrar el envío.');if(data.estado==='Confirmada'&&!data.reserva)throw Error('Registrá primero la reserva y escribí su referencia.');if(data.estado==='Interesada'&&!data.seguimiento)throw Error('Programá el próximo seguimiento.');busy=true;save.disabled=true;finish.disabled=true;cancel.disabled=true;const r=await db.rpc('hub_action_guardar',{p_id:editing?.id||crypto.randomUUID(),p_version:editing?.version||0,p_datos:{...data,origen:editing?.origen||null,alumno_id:editing?.alumno_id||null}});if(r.error)throw r.error;dialog.close();busy=false;await load();if(finalize)status.textContent='Tarea finalizada. La respuesta quedó en Respuestas registradas y sus intereses se conservan en Ver listas de interesados.';}catch(err){note.textContent='No se guardó: '+err.message+' Actualizá ante un conflicto de edición.';}finally{busy=false;save.disabled=!ready;finish.disabled=!ready;cancel.disabled=false;}};
 // Keep suggestion identity when a newly prepared action is saved.
 const baseOpen=open;open=function(seed={}){baseOpen(seed);if(!seed.id&&(seed.origen||seed.alumno_id))editing={id:null,version:0,origen:seed.origen,alumno_id:seed.alumno_id};};
 generate.onclick=async()=>{if(!ready||busy)return;busy=true;generate.disabled=true;try{const planned=C.dailyPlan(date.value);for(const task of planned){if(tasks.some(t=>t.origen===task.origen))continue;const r=await db.rpc('hub_action_guardar',{p_id:crypto.randomUUID(),p_version:0,p_datos:task});if(r.error)throw r.error;}busy=false;await load();}catch(e){status.textContent='Jornada incompleta: '+e.message+'. Actualizá para ver las tareas guardadas antes de reintentar.';}finally{busy=false;generate.disabled=false;}};
 refresh.onclick=load;date.onchange=load;owner.onchange=render;add.onclick=()=>open();
 window.addEventListener('focus',()=>{if(!dialog.open&&!busy)load();});
 let lastToday=localISO();setInterval(()=>{const today=localISO();if(today!==lastToday){if(date.value===lastToday)date.value=today;lastToday=today;}if(!document.hidden&&!dialog.open&&!busy&&!loading)load();},60000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!dialog.open&&!busy)load();});load();
})();
