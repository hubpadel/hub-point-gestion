/* Un único registro de agenda; cobros individuales en torneos, nunca en pagos. */
(() => {
 'use strict';
 const core=PointTorneos,$=s=>document.querySelector(s);
 const make=(tag,text,parent)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;parent?.append(n);return n;};
 const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(n/100);
 const button=(text,parent,click)=>{const b=make('button',text,parent);b.type='button';b.onclick=click;return b;};
 const field=(parent,label,type,value='',options=[])=>{const wrap=make('label',label,parent),n=make(type==='select'?'select':'input',undefined,wrap);if(type==='select')for(const v of options)make('option',v,n);else n.type=type;n.value=value;if(type==='number'){n.min='0';n.max='999999999';n.step='0.01';}return n;};
 const section=make('section',undefined,$('main'));section.id='torneos';section.className='view';make('h2','TORNEOS',section);
 make('p','Inscripción por parejas · cobro y asistencia por jugador.',section);
 const toolbar=make('div',undefined,section);toolbar.className='toolbar';
 button('+ Nuevo torneo',toolbar,()=>edit());button('Actualizar',toolbar,()=>load());
 const status=make('p','',section);status.setAttribute('role','status');const list=make('div',undefined,section);
 const nav=button('TORNEOS',$('nav'),()=>{switchView('torneos');load();});nav.dataset.view='torneos';
 button('+ TORNEOS',$('#newOpenCourtBtn').parentElement,()=>{switchView('torneos');edit();});
 const dialog=make('dialog',undefined,section);dialog.className='torneo-dialog';
 const form=make('form',undefined,dialog);const heading=make('h3','Nuevo torneo',form);
 const fields=make('div',undefined,form);fields.className='torneo-fields';const f={};
 for(const [k,l,t] of [['titulo','Nombre del torneo','text'],['fecha','Fecha','date'],['inicio','Desde','time'],['fin','Hasta','time'],['tipo','Tipo','select'],['categoria','Categoría','text'],['precio','Precio por jugador','number'],['costo_cancha','Costo de canchas','number'],['coordinador','Coordinador/a','text'],['coordinador_importe','Costo de coordinación','number'],['notas','Observaciones','text']]){f[k]=field(fields,l,t,'',k==='tipo'?['Femenina','Masculina','Mixta']:[]);f[k].required=!['coordinador','notas'].includes(k);}
 const courtset=make('fieldset',undefined,form);make('legend','Canchas',courtset);const courts=[1,2,3].map(c=>{const n=field(courtset,'Cancha '+c,'checkbox');n.value=c;return n;});
 make('p','Cobrado: ingresá cero o el importe completo individual. El precio se aplica a nuevos jugadores. Los importes ya cargados se conservan y pueden editarse individualmente. Cancelar una pareja conserva sus cobros.',form);
 const emptyRoster=make('p','Podés guardar el torneo sin jugadores e ir agregando las parejas a medida que se inscriban.',form);emptyRoster.className='status';
 const roster=make('div',undefined,form);
 button('+ Agregar pareja',form,()=>addPair());
 const note=make('p','',form);note.setAttribute('role','status');
 const save=make('button','Guardar torneo',form);save.type='submit';
 const close=button('Cerrar',form,()=>dialog.close());
 const downloadHint=make('p','La descarga incluye las parejas inscritas guardadas, sin las canceladas. Guardá los cambios antes de descargar.',form);
 const download=button('Descargar las parejas inscritas',form,()=>downloadPairs(selected?.actividad?.id,note,download));download.className='primary';download.disabled=true;
 let events=[],selected=null,pendingId=null,busy=false,generation=0;
 async function downloadPairs(id,message,control){if(!id)return;control.disabled=true;try{const r=await db.from('torneos').select('*,actividad:planner_actividades(*)').eq('id',id).single();if(r.error)throw r.error;const e=r.data,rows=core.rosterRows(e);if(rows.length===1)throw Error('Todavía no hay parejas inscritas para descargar.');if(!window.XLSX)throw Error('No se pudo cargar Excel. Recargá la página e intentá otra vez.');const sheet=XLSX.utils.aoa_to_sheet([[e.actividad.titulo],['Fecha',e.actividad.fecha],['Tipo',e.datos.tipo,'Categoría',e.datos.categoria],[],...rows]);sheet['!cols']=[{wch:12},{wch:32},{wch:32}];const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'Parejas inscritas');XLSX.writeFile(book,'Parejas_'+e.actividad.fecha+'_'+e.actividad.titulo.replace(/[^a-z0-9áéíóúñ_-]+/gi,'_').slice(0,70)+'.xlsx');message.textContent='Descarga preparada: '+(rows.length-1)+' pareja(s) inscrita(s).';}catch(e){message.textContent='No se pudo descargar: '+e.message;}finally{control.disabled=false;}}
 function refreshPairNumbers(){emptyRoster.hidden=roster.children.length>0;[...roster.children].forEach((box,i)=>{box._legend.textContent='PAREJA '+(i+1);});}
 function newPlayer(){return {id:crypto.randomUUID(),nombre:'',importe:Number(f.precio.value||0),cobrado:0,medio:'',fecha:'',presencia:'Pendiente'};}
 function addPair(pair){const p=pair||{id:crypto.randomUUID(),estado:'Inscripta',jugadores:[newPlayer(),newPlayer()]};
  const box=make('fieldset',undefined,roster);box.className='torneo-pair';box.dataset.id=p.id;box._fresh=!pair;const legend=make('legend','PAREJA',box);box._legend=legend;
  const pairHeader=make('div',undefined,box);pairHeader.className='torneo-pair-header';const members=make('strong','',pairHeader),pairStatus=make('span','',pairHeader);pairStatus.className='badge';
  const state=field(box,'Inscripción','select',p.estado,['Inscripta','Cancelada']);box._state=state;box._players=[];
  const duo=make('div',undefined,box);duo.className='torneo-duo';
  for(const [index,j] of p.jugadores.entries()){const row=make('div',undefined,duo);row.className='torneo-player';make('h4','Jugador/a '+(index+1),row);const refs={id:j.id};
   for(const [k,l,t,opts] of [['nombre','Jugador/a','text'],['importe','Importe individual','number'],['cobrado','Cobrado','number'],['medio','Medio','select',['','Efectivo','Transferencia']],['fecha','Fecha de cobro','date'],['presencia','Asistencia','select',['Pendiente','Presente','Ausente']]]){refs[k]=field(row,l,t,j[k]??'',opts);if(k==='nombre')refs[k].required=true;}
   refs.importe.addEventListener('input',()=>{refs.importe.dataset.manual='true';});
   const label=make('strong','',row);refs.label=label;box._players.push(refs);
  }
  const read=()=>({estado:state.value,jugadores:box._players.map(r=>({importe:r.importe.value,cobrado:r.cobrado.value}))});
  const update=()=>{members.textContent=box._players.map((r,i)=>r.nombre.value.trim()||'Jugador/a '+(i+1)).join(' + ');try{const d=read();box._players.forEach((r,i)=>r.label.textContent='Pago individual: '+core.state(d.jugadores[i]));pairStatus.textContent='Pareja: '+core.pairState(d);}catch(e){pairStatus.textContent=e.message;}refreshPairNumbers();};
  box.addEventListener('input',update);update();
  button('Quitar pareja sin cobros',box,()=>{if(p.jugadores.some(j=>Number(j.cobrado)>0)||box._players.some(r=>Number(r.cobrado.value)>0)){note.textContent='Cancelá esta pareja para conservar sus cobros e historial.';return;}box.remove();refreshPairNumbers();});
 }
 f.precio.addEventListener('input',()=>{for(const box of roster.children)if(box._fresh)for(const r of box._players)if(!r.importe.dataset.manual&&Number(r.cobrado.value)===0){r.importe.value=f.precio.value;box.dispatchEvent(new Event('input'));}});
 async function fetchEvents(){const data=await PointCorporativos.readAll(()=>db.from('torneos').select('*,actividad:planner_actividades(*)').order('id'));return data;}
 async function load(){const token=++generation;status.textContent='Consultando torneos…';try{const data=await fetchEvents();if(token!==generation)return;events=data;list.replaceChildren();for(const e of events.sort((a,b)=>b.actividad.fecha.localeCompare(a.actividad.fecha))){const card=make('div',undefined,list);card.className='card';make('h3',e.actividad.titulo,card);make('p',`${e.actividad.fecha} · ${e.actividad.inicio.slice(0,5)}–${e.actividad.fin.slice(0,5)} · Canchas ${e.actividad.canchas.join(', ')} · ${e.datos.tipo} ${e.datos.categoria}`,card);make('p',`${e.datos.parejas.filter(p=>p.estado!=='Cancelada').length} parejas · ${money(core.cents(e.datos.precio))} por jugador`,card);
    for(const [index,p] of e.datos.parejas.entries()){const pairCard=make('div',undefined,card);pairCard.className='torneo-pair-card';make('h4','PAREJA '+(index+1),pairCard);make('strong',p.jugadores.map(j=>j.nombre).join(' + '),pairCard).className='torneo-pair-names';make('p','Estado de la pareja: '+core.pairState(p),pairCard);for(const j of p.jugadores)make('p',`${j.nombre} · Pago individual: ${core.state(j)} · Asistencia: ${j.presencia}`,pairCard);}
    button('Ver / editar y registrar pagos',card,()=>edit(e.id));button('Ver en Agenda',card,()=>{$('#agendaDate').value=e.actividad.fecha;switchView('agenda');$('#agendaDate').dispatchEvent(new Event('change'));});const footer=make('div',undefined,card);footer.className='torneo-download';const dl=button('Descargar las parejas inscritas',footer,()=>downloadPairs(e.id,status,dl));}
   status.textContent=events.length?`${events.length} torneo(s).`:'Todavía no hay torneos.';
  }catch(e){status.textContent='No se pudieron consultar los torneos: '+e.message;}}
 async function edit(id){if(busy)return;note.textContent='';selected=null;pendingId=id||crypto.randomUUID();
  if(id){status.textContent='Actualizando torneo…';try{const r=await db.from('torneos').select('*,actividad:planner_actividades(*)').eq('id',id).maybeSingle();if(r.error)throw r.error;selected=r.data;if(!selected){const a=await db.from('planner_actividades').select('*').eq('id',id).eq('tipo','torneos').single();if(a.error)throw a.error;selected={actividad:a.data,revision:null};}}catch(e){status.textContent=e.message;return;}}
  const a=selected?.actividad,d=selected?.datos;heading.textContent=id?'Editar torneo y cobros':'Nuevo torneo';
  const defaults={titulo:'Torneo',fecha:$('#agendaDate').value||localISO(),inicio:'15:00',fin:'18:00',tipo:'Femenina',categoria:'8va',precio:0,costo_cancha:0,coordinador:'',coordinador_importe:0,notas:''};
  for(const k in f)f[k].value=(['titulo','fecha','inicio','fin'].includes(k)?a?.[k]:d?.[k])??defaults[k];courts.forEach(n=>n.checked=(a?.canchas||[1]).includes(Number(n.value)));roster.replaceChildren();(d?.parejas||[]).forEach(addPair);refreshPairNumbers();download.disabled=!d;dialog.showModal();
 }
 form.onsubmit=async e=>{e.preventDefault();if(busy)return;note.textContent='';try{
  const a={tipo:'torneos',titulo:f.titulo.value.trim(),fecha:f.fecha.value,inicio:f.inicio.value,fin:f.fin.value,canchas:courts.filter(n=>n.checked).map(n=>Number(n.value))};
  if(!a.canchas.length||a.fin<=a.inicio)throw Error('Elegí canchas y una hora final posterior al inicio.');
  const d={};for(const k of ['tipo','categoria','precio','costo_cancha','coordinador','coordinador_importe','notas'])d[k]=f[k].type==='number'?Number(f[k].value):f[k].value.trim();
  d.parejas=[...roster.children].map(box=>({id:box.dataset.id,estado:box._state.value,jugadores:box._players.map(r=>({id:r.id,nombre:r.nombre.value.trim(),importe:Number(r.importe.value),cobrado:Number(r.cobrado.value),medio:r.medio.value,fecha:r.fecha.value,presencia:r.presencia.value}))}));core.validate(d);
  busy=true;save.disabled=true;close.disabled=true;note.textContent='Guardando torneo y agenda…';
  const r=await db.rpc('torneos_guardar',{p_id:pendingId,p_revision:selected?.revision??null,p_version:selected?.actividad??null,p_actividad:a,p_datos:d});if(r.error)throw r.error;
  dialog.close();$('#agendaDate').value=a.fecha;$('#agendaDate').dispatchEvent(new Event('change'));window.dispatchEvent(new Event('point:torneos'));await load();await financeLoad();
 }catch(err){note.textContent='No se confirmó el guardado: '+err.message+' Si el torneo cambió, cerrá y volvé a abrirlo.';}finally{busy=false;save.disabled=false;close.disabled=false;}};
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 const finance=make('div',undefined,$('#finanzas'));make('h3','Finanzas · Torneos',finance);make('p','Cobros por fecha individual de pago. Costos y saldos por fecha del torneo. Los cobros se suman una sola vez al ingreso general.',finance);
 const fs=make('p','',finance),fl=make('div',undefined,finance);let financeGeneration=0;
 async function financeLoad(){return; /* Resumen exclusivo del panel privado. */const token=++financeGeneration,month=$('#financeMonth').value;window.PointTorneosFinance={month,status:'loading'};renderFinance();try{const rows=await fetchEvents();if(token!==financeGeneration)return;const s=core.summary(rows,month);window.PointTorneosFinance={month,status:'ready',...s};fs.textContent=`Cobrado: ${money(s.total)} · Efectivo: ${money(s.cash)} · Transferencia: ${money(s.transfer)} · Pendiente: ${money(s.pending)} · Costos: ${money(s.cost)} · Cobrado menos costos: ${money(s.total-s.cost)}`;fl.replaceChildren();for(const j of s.rows)make('p',`${j.fecha} · ${j.torneo} · ${j.nombre} · ${j.medio} · ${money(core.cents(j.cobrado))}`,fl);}catch(e){if(token!==financeGeneration)return;window.PointTorneosFinance={month,status:'error'};fs.textContent='Torneos: no se pudieron consultar los cobros. '+e.message;}renderFinance();}
 $('#financeMonth').addEventListener('change',financeLoad);$('nav button[data-view="finanzas"]').addEventListener('click',financeLoad);
 window.addEventListener('focus',()=>{if(!dialog.open){if(section.classList.contains('active'))load();if($('#finanzas').classList.contains('active'))financeLoad();}});
 window.PointTorneosUI={open:edit};financeLoad();
})();

