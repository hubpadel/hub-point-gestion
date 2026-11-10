/* Un único registro de agenda; cobros individuales en partidos, nunca en pagos. */
(() => {
 'use strict';
 const core=PointPartidos,$=s=>document.querySelector(s);
 const make=(tag,text,parent)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;parent?.append(n);return n;};
 const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(n/100);
 const button=(text,parent,click)=>{const b=make('button',text,parent);b.type='button';b.onclick=click;return b;};
 const field=(parent,label,type,value='',options=[])=>{const wrap=make('label',label,parent),n=make(type==='select'?'select':'input',undefined,wrap);if(type==='select')for(const v of options)make('option',v,n);else n.type=type;n.value=value;if(type==='number'){n.min='0';n.max='999999999';n.step='0.01';}return n;};
 const section=make('section',undefined,$('main'));section.id='partidos';section.className='view';make('h2','PARTIDOS',section);
 make('p','Partidos de dos parejas · femenina, masculina o mixta · todas las categorías.',section);
 const toolbar=make('div',undefined,section);toolbar.className='toolbar';
 button('+ Nuevo partido',toolbar,()=>edit());button('Actualizar',toolbar,()=>load());
 const status=make('p','',section);status.setAttribute('role','status');
 make('h3','Partidos pendientes',section);
 const list=make('div',undefined,section);
 const history=make('details',undefined,section);
 const historyTitle=make('summary','Partidos jugados',history);
 const played=make('div',undefined,history);
 const archive=make('details',undefined,section);
 const archiveTitle=make('summary','Partidos archivados',archive);
 const archivedList=make('div',undefined,archive);
 const nav=button('PARTIDOS',$('nav'),()=>{switchView('partidos');load();});nav.dataset.view='partidos';nav.style.background='#d1f2ee';nav.style.color='#075e55';
 button('+ PARTIDOS',$('#newOpenCourtBtn').parentElement,()=>{switchView('partidos');edit();});
 const dialog=make('dialog',undefined,section);dialog.className='torneo-dialog';
 const form=make('form',undefined,dialog);form.id='partidoForm';const heading=make('h3','Nuevo partido',form);
 const fields=make('div',undefined,form);fields.className='torneo-fields';const f={};
 for(const [k,l,t] of [['titulo','Nombre del partido','text'],['fecha','Fecha','date'],['inicio','Desde','select'],['fin','Hasta','select'],['tipo','Tipo','select'],['categoria','Categoría','text'],['precio','Precio por jugador','number'],['costo_cancha','Costo de canchas','number'],['coordinador','Coordinador/a','text'],['coordinador_importe','Costo de coordinación','number'],['notas','Observaciones','text'],['armado_por','Armado por','select']]){f[k]=field(fields,l,t,'',k==='tipo'?['Femenina','Masculina','Mixta']:k==='armado_por'?['','Clari','Tamy']:[]);f[k].required=!['coordinador','notas','armado_por'].includes(k);}
 for(const key of ['inicio','fin']){f[key].replaceChildren();for(const t of core.times(key==='fin')){const o=make('option',t.label,f[key]);o.value=t.value;}}
 f.categoria.setAttribute('list','partidoCategorias');const categories=make('datalist',undefined,form);categories.id='partidoCategorias';for(const c of ['9na','8va','7ma','6ta','5ta','4ta','3ra','2da','1ra','Suma 10','Suma 11','Suma 12','Suma 13','Suma 14','Suma 15','Libre']){make('option',c,categories).value=c;}
 const namesList=make('datalist',undefined,form);namesList.id='partidoJugadores';let known=[];async function loadNames(){try{const [players,students]=await Promise.all([PointCorporativos.readAll(()=>db.from('jugadores').select('id,nombre,telefono').order('id')),PointCorporativos.readAll(()=>db.from('alumnos').select('id,nombre,telefono').order('id'))]);known=[...players,...students];namesList.replaceChildren();for(const name of new Set(known.map(x=>x.nombre).filter(Boolean)))make('option',name,namesList).value=name;}catch(e){/* El nombre también puede cargarse manualmente. */}}
 const courtset=make('fieldset',undefined,form);make('legend','Canchas',courtset);const courts=[1,2,3].map(c=>{const n=field(courtset,'Cancha '+c,'radio');n.name='partidoCancha';n.value=c;return n;});
 make('p','Cobrado: ingresá cero o el importe completo individual. El precio se aplica a nuevos jugadores. Los importes ya cargados se conservan y pueden editarse individualmente. Cancelar una pareja conserva sus cobros.',form);
 const emptyRoster=make('p','Podés reservar el horario sin jugadores y completar hasta dos parejas. Elegí cualquier categoría o suma mixta. Los horarios van de 08:00 a 00:00.',form);emptyRoster.className='status';
 const roster=make('div',undefined,form);
 button('+ Agregar pareja',form,()=>{if([...roster.children].filter(b=>b._state.value==='Inscripta').length>=2){note.textContent='El partido ya tiene dos parejas activas. Podés cancelar una para reemplazarla.';return;}addPair();});
 const note=make('p','',form);note.setAttribute('role','status');
 const save=make('button','Guardar partido',form);save.type='submit';
 const finalize=make('button','Finalizar partido',form);
 finalize.type='submit';
 finalize.className='primary';
 finalize.hidden=true;
 const close=button('Cerrar',form,()=>dialog.close());
 const downloadHint=make('p','La descarga incluye las parejas inscritas guardadas, sin las canceladas. Guardá los cambios antes de descargar.',form);
 const download=button('Descargar las parejas inscritas',form,()=>downloadPairs(selected?.actividad?.id,note,download));download.className='primary';download.disabled=true;
 let events=[],selected=null,pendingId=null,busy=false,generation=0;
 async function downloadPairs(id,message,control){if(!id)return;control.disabled=true;try{const r=await db.from('partidos').select('*,actividad:planner_actividades(*)').eq('id',id).single();if(r.error)throw r.error;const e=r.data,rows=core.rosterRows(e);if(rows.length===1)throw Error('Todavía no hay parejas inscritas para descargar.');if(!window.XLSX)throw Error('No se pudo cargar Excel. Recargá la página e intentá otra vez.');const sheet=XLSX.utils.aoa_to_sheet([[e.actividad.titulo],['Fecha',e.actividad.fecha],['Tipo',e.datos.tipo,'Categoría',e.datos.categoria],[],...rows]);sheet['!cols']=[{wch:12},{wch:32},{wch:32}];const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'Parejas inscritas');XLSX.writeFile(book,'Parejas_'+e.actividad.fecha+'_'+e.actividad.titulo.replace(/[^a-z0-9áéíóúñ_-]+/gi,'_').slice(0,70)+'.xlsx');message.textContent='Descarga preparada: '+(rows.length-1)+' pareja(s) inscrita(s).';}catch(e){message.textContent='No se pudo descargar: '+e.message;}finally{control.disabled=false;}}
 function refreshPairNumbers(){emptyRoster.hidden=roster.children.length>0;[...roster.children].forEach((box,i)=>{box._legend.textContent='PAREJA '+(i+1);});}
 function newPlayer(){return {id:core.uuid(),nombre:'',telefono:'',importe:Number(f.precio.value||0),cobrado:0,medio:'',fecha:'',presencia:'Pendiente'};}
 function addPair(pair){const p=pair||{id:core.uuid(),estado:'Inscripta',jugadores:[newPlayer(),newPlayer()]};
  const box=make('fieldset',undefined,roster);box.className='torneo-pair';box.dataset.id=p.id;box._fresh=!pair;const legend=make('legend','PAREJA',box);box._legend=legend;
  const pairHeader=make('div',undefined,box);pairHeader.className='torneo-pair-header';const members=make('strong','',pairHeader),pairStatus=make('span','',pairHeader);pairStatus.className='badge';
  const state=field(box,'Inscripción','select',p.estado,['Inscripta','Cancelada']);box._state=state;box._players=[];
  const duo=make('div',undefined,box);duo.className='torneo-duo';
  for(const [index,j] of p.jugadores.entries()){const row=make('div',undefined,duo);row.className='torneo-player';make('h4','Jugador/a '+(index+1),row);const refs={id:j.id};
   for(const [k,l,t,opts] of [['nombre','Jugador/a','text'],['telefono','Teléfono','tel'],['importe','Importe individual','number'],['cobrado','Cobrado','number'],['medio','Medio','select',['','Efectivo','Transferencia']],['fecha','Fecha de cobro','date'],['presencia','Asistencia','select',['Pendiente','Presente','Ausente']]]){refs[k]=field(row,l,t,j[k]??'',opts);if(k==='nombre'){refs[k].required=true;refs[k].setAttribute('list','partidoJugadores');}}
   refs.nombre.addEventListener('change',()=>{const matches=known.filter(x=>x.nombre?.trim().toLocaleLowerCase('es')===refs.nombre.value.trim().toLocaleLowerCase('es'));const phones=[...new Set(matches.map(x=>x.telefono).filter(Boolean))];if(phones.length===1&&!refs.telefono.value)refs.telefono.value=phones[0];});
   refs.importe.addEventListener('input',()=>{refs.importe.dataset.manual='true';});
   const label=make('strong','',row);refs.label=label;box._players.push(refs);
  }
  const read=()=>({estado:state.value,jugadores:box._players.map(r=>({importe:r.importe.value,cobrado:r.cobrado.value}))});
  const update=()=>{members.textContent=box._players.map((r,i)=>r.nombre.value.trim()||'Jugador/a '+(i+1)).join(' + ');try{const d=read();box._players.forEach((r,i)=>r.label.textContent='Pago individual: '+core.state(d.jugadores[i]));pairStatus.textContent='Pareja: '+core.pairState(d);}catch(e){pairStatus.textContent=e.message;}refreshPairNumbers();};
  box.addEventListener('input',update);update();
  button('Quitar pareja sin cobros',box,()=>{if(p.jugadores.some(j=>Number(j.cobrado)>0)||box._players.some(r=>Number(r.cobrado.value)>0)){note.textContent='Cancelá esta pareja para conservar sus cobros e historial.';return;}box.remove();refreshPairNumbers();});
 }
 f.precio.addEventListener('input',()=>{for(const box of roster.children)if(box._fresh)for(const r of box._players)if(!r.importe.dataset.manual&&Number(r.cobrado.value)===0){r.importe.value=f.precio.value;box.dispatchEvent(new Event('input'));}});
 async function fetchEvents(){const data=await PointCorporativos.readAll(()=>db.from('partidos').select('*,actividad:planner_actividades(*)').order('id'));return data;}
 async function load(){const token=++generation;status.textContent='Consultando partidos…';try{const data=await fetchEvents();if(token!==generation)return;events=data.filter(e=>e.actividad);list.replaceChildren();played.replaceChildren();archivedList.replaceChildren();
   const archived=events.filter(e=>e.archivado_en).length;
   archiveTitle.textContent='Partidos archivados ('+archived+')';
   if(!archived)make('p','No hay partidos archivados.',archivedList);
   const finalized=events.filter(e=>e.finalizado_en).length;
   historyTitle.textContent='Partidos jugados ('+finalized+')';
   if(events.length===finalized+archived)make('p','No hay partidos pendientes.',list);
   if(!finalized)make('p','Todavía no hay partidos finalizados.',played);
   for(const e of events.sort((a,b)=>b.actividad.fecha.localeCompare(a.actividad.fecha))){
    const card=make('div',undefined,e.archivado_en?archivedList:e.finalizado_en?played:list);card.className='card';make('h3',e.actividad.titulo,card);if(e.finalizado_en)make('span','Finalizado',card).className='badge good';else if(e.archivado_en)make('span','Archivado',card).className='badge';make('p',`${e.actividad.fecha} · ${e.actividad.inicio.slice(0,5)}–${e.actividad.fin.slice(0,5)==='24:00'?'00:00':e.actividad.fin.slice(0,5)} · Canchas ${e.actividad.canchas.join(', ')} · ${e.datos.tipo} ${e.datos.categoria}`,card);make('p',`${e.datos.parejas.filter(p=>p.estado!=='Cancelada').length} parejas · ${money(core.cents(e.datos.precio))} por jugador`,card);
    for(const [index,p] of e.datos.parejas.entries()){const pairCard=make('div',undefined,card);pairCard.className='torneo-pair-card';make('h4','PAREJA '+(index+1),pairCard);make('strong',p.jugadores.map(j=>j.nombre).join(' + '),pairCard).className='torneo-pair-names';make('p','Estado de la pareja: '+core.pairState(p),pairCard);for(const j of p.jugadores)make('p',`${j.nombre} · Pago individual: ${core.state(j)} · Asistencia: ${j.presencia}`,pairCard);}
    button(e.finalizado_en||e.archivado_en?'Ver partido':'Ver / editar y registrar pagos',card,()=>edit(e.id));
    if(!e.archivado_en)button(e.finalizado_en?'Reabrir partido':'Finalizar partido',card,()=>closeMatch(e));
    if(!e.finalizado_en)button(e.archivado_en?'Recuperar partido':'Quitar de pendientes',card,()=>archiveMatch(e));button('Ver en Agenda',card,()=>{$('#agendaDate').value=e.actividad.fecha;switchView('agenda');$('#agendaDate').dispatchEvent(new Event('change'));});const footer=make('div',undefined,card);footer.className='torneo-download';const dl=button('Descargar las parejas inscritas',footer,()=>downloadPairs(e.id,status,dl));}
   status.textContent=`${events.length-finalized-archived} pendiente(s) · ${finalized} finalizado(s) · ${archived} archivado(s).`;
  }catch(e){status.textContent='No se pudieron consultar los partidos: '+e.message;}}
 async function archiveMatch(event){
  if(busy)return;
  busy=true;
  try{
   const r=await db.rpc('actividades_archivar',{p_tipo:'partidos',p_id:event.id,p_archivar:!event.archivado_en});
   if(r.error)throw r.error;
   await load();
  }catch(e){status.textContent=e.message;}
  finally{busy=false;}
 }
 async function closeMatch(event){
  if(busy)return;
  busy=true;
  try{
   const r=await db.rpc('partidos_cerrar',{p_id:event.id,p_revision:event.revision,p_finalizar:!event.finalizado_en});
   if(r.error)throw r.error;
   if(!event.finalizado_en)history.open=true;
   await load();
   window.dispatchEvent(new Event('point:partidos'));
  }catch(e){status.textContent=e.message;}
  finally{busy=false;}
 }
 async function edit(id,preset={}){if(busy)return;note.textContent='';selected=null;pendingId=id||core.uuid();
  if(id){status.textContent='Actualizando partido…';try{const r=await db.from('partidos').select('*,actividad:planner_actividades(*)').eq('id',id).maybeSingle();if(r.error)throw r.error;selected=r.data;if(!selected){const a=await db.from('planner_actividades').select('*').eq('id',id).eq('tipo','partidos').single();if(a.error)throw a.error;selected={actividad:a.data,revision:null};}}catch(e){status.textContent=e.message;return;}}
  const a=selected?.actividad,d=selected?.datos;heading.textContent=selected?.archivado_en?'Partido archivado':selected?.finalizado_en?'Partido finalizado':id?'Editar partido y cobros':'Nuevo partido';
  const defaults={titulo:'Partido armado',fecha:$('#agendaDate').value||localISO(),inicio:'08:00',fin:'09:30',tipo:'Femenina',categoria:'8va',precio:0,costo_cancha:0,coordinador:'',coordinador_importe:0,notas:'',armado_por:'',...preset};
  for(const k in f)f[k].value=(['titulo','fecha','inicio','fin'].includes(k)?(['inicio','fin'].includes(k)?a?.[k]?.slice(0,5):a?.[k]):d?.[k])??defaults[k];courts.forEach(n=>n.checked=(a?.canchas||preset.canchas||[1]).includes(Number(n.value)));roster.replaceChildren();(d?.parejas||[]).forEach(addPair);refreshPairNumbers();for(const control of form.elements){if(control!==close&&control!==download)control.disabled=!!(selected?.finalizado_en||selected?.archivado_en);}save.hidden=!!(selected?.finalizado_en||selected?.archivado_en);finalize.hidden=!d||save.hidden;download.disabled=!d;loadNames();dialog.showModal();
 }
 form.onsubmit=async e=>{e.preventDefault();if(busy||selected?.finalizado_en||selected?.archivado_en)return;const finish=e.submitter===finalize;note.textContent='';try{
  const a={tipo:'partidos',titulo:f.titulo.value.trim(),fecha:f.fecha.value,inicio:f.inicio.value,fin:f.fin.value,canchas:courts.filter(n=>n.checked).map(n=>Number(n.value))};
  core.schedule(a);
  const d={};for(const k of ['tipo','categoria','precio','costo_cancha','coordinador','coordinador_importe','notas','armado_por'])d[k]=f[k].type==='number'?Number(f[k].value):f[k].value.trim();
  d.parejas=[...roster.children].map(box=>({id:box.dataset.id,estado:box._state.value,jugadores:box._players.map(r=>({id:r.id,nombre:r.nombre.value.trim(),telefono:r.telefono.value.trim(),importe:Number(r.importe.value),cobrado:Number(r.cobrado.value),medio:r.medio.value,fecha:r.fecha.value,presencia:r.presencia.value}))}));core.validate(d);
  busy=true;save.disabled=true;finalize.disabled=true;close.disabled=true;
  note.textContent=finish?'Guardando cobros y finalizando partido…':'Guardando partido y agenda…';
  const r=await db.rpc(finish?'partidos_guardar_y_finalizar':'partidos_guardar',{p_id:pendingId,p_revision:selected?.revision??null,p_version:selected?.actividad??null,p_actividad:a,p_datos:d});if(r.error)throw r.error;
  dialog.close();if(finish){history.open=true;switchView('partidos');}$('#agendaDate').value=a.fecha;$('#agendaDate').dispatchEvent(new Event('change'));window.dispatchEvent(new Event('point:partidos'));await load();
 }catch(err){note.textContent=(finish?'No se pudo finalizar: ':'No se confirmó el guardado: ')+err.message;}finally{busy=false;save.disabled=false;finalize.disabled=false;close.disabled=false;}};
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 window.PointPartidosUI={open:edit};
})();

