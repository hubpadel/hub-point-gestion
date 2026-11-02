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
 const roster=make('div',undefined,form);
 button('+ Agregar pareja',form,()=>addPair());
 const note=make('p','',form);note.setAttribute('role','status');
 const save=make('button','Guardar torneo',form);save.type='submit';
 const close=button('Cerrar',form,()=>dialog.close());
 let events=[],selected=null,pendingId=null,busy=false,generation=0;
 function newPlayer(){return {id:crypto.randomUUID(),nombre:'',importe:Number(f.precio.value||0),cobrado:0,medio:'',fecha:'',presencia:'Pendiente'};}
 function addPair(pair){const p=pair||{id:crypto.randomUUID(),estado:'Inscripta',jugadores:[newPlayer(),newPlayer()]};
  const box=make('fieldset',undefined,roster);box.dataset.id=p.id;box._fresh=!pair;const legend=make('legend','Pareja',box);
  const state=field(box,'Inscripción','select',p.estado,['Inscripta','Cancelada']);box._state=state;box._players=[];
  for(const j of p.jugadores){const row=make('div',undefined,box);row.className='torneo-player';const refs={id:j.id};
   for(const [k,l,t,opts] of [['nombre','Jugador/a','text'],['importe','Importe individual','number'],['cobrado','Cobrado','number'],['medio','Medio','select',['','Efectivo','Transferencia']],['fecha','Fecha de cobro','date'],['presencia','Asistencia','select',['Pendiente','Presente','Ausente']]]){refs[k]=field(row,l,t,j[k]??'',opts);if(k==='nombre')refs[k].required=true;}
   refs.importe.addEventListener('input',()=>{refs.importe.dataset.manual='true';});
   const label=make('strong','',row);refs.label=label;box._players.push(refs);
  }
  const read=()=>({estado:state.value,jugadores:box._players.map(r=>({importe:r.importe.value,cobrado:r.cobrado.value}))});
  const update=()=>{try{const d=read();box._players.forEach((r,i)=>r.label.textContent=core.state(d.jugadores[i]));legend.textContent='Pareja · '+core.pairState(d);}catch(e){legend.textContent=e.message;}};
  box.addEventListener('input',update);update();
  button('Quitar pareja sin cobros',box,()=>{if(p.jugadores.some(j=>Number(j.cobrado)>0)||box._players.some(r=>Number(r.cobrado.value)>0)){note.textContent='Cancelá esta pareja para conservar sus cobros e historial.';return;}box.remove();});
 }
 f.precio.addEventListener('input',()=>{for(const box of roster.children)if(box._fresh)for(const r of box._players)if(!r.importe.dataset.manual&&Number(r.cobrado.value)===0){r.importe.value=f.precio.value;box.dispatchEvent(new Event('input'));}});
 async function fetchEvents(){const data=await PointCorporativos.readAll(()=>db.from('torneos').select('*,actividad:planner_actividades(*)').order('id'));return data;}
 async function load(){const token=++generation;status.textContent='Consultando torneos…';try{const data=await fetchEvents();if(token!==generation)return;events=data;list.replaceChildren();for(const e of events.sort((a,b)=>b.actividad.fecha.localeCompare(a.actividad.fecha))){const card=make('div',undefined,list);card.className='card';make('h3',e.actividad.titulo,card);make('p',`${e.actividad.fecha} · ${e.actividad.inicio.slice(0,5)}–${e.actividad.fin.slice(0,5)} · Canchas ${e.actividad.canchas.join(', ')} · ${e.datos.tipo} ${e.datos.categoria}`,card);make('p',`${e.datos.parejas.filter(p=>p.estado!=='Cancelada').length} parejas · ${money(core.cents(e.datos.precio))} por jugador`,card);
    for(const p of e.datos.parejas)make('p',`${p.jugadores.map(j=>j.nombre+' ('+core.state(j)+' · '+j.presencia+')').join(' + ')} · Pareja ${core.pairState(p)}`,card);
    button('Ver / editar y registrar pagos',card,()=>edit(e.id));button('Ver en Agenda',card,()=>{$('#agendaDate').value=e.actividad.fecha;switchView('agenda');$('#agendaDate').dispatchEvent(new Event('change'));});}
   status.textContent=events.length?`${events.length} torneo(s).`:'Todavía no hay torneos.';
  }catch(e){status.textContent='No se pudieron consultar los torneos: '+e.message;}}
 async function edit(id){if(busy)return;note.textContent='';selected=null;pendingId=id||crypto.randomUUID();
  if(id){status.textContent='Actualizando torneo…';try{const r=await db.from('torneos').select('*,actividad:planner_actividades(*)').eq('id',id).maybeSingle();if(r.error)throw r.error;selected=r.data;if(!selected){const a=await db.from('planner_actividades').select('*').eq('id',id).eq('tipo','torneos').single();if(a.error)throw a.error;selected={actividad:a.data,revision:null};}}catch(e){status.textContent=e.message;return;}}
  const a=selected?.actividad,d=selected?.datos;heading.textContent=id?'Editar torneo y cobros':'Nuevo torneo';
  const defaults={titulo:'Torneo',fecha:$('#agendaDate').value||localISO(),inicio:'15:00',fin:'18:00',tipo:'Femenina',categoria:'8va',precio:0,costo_cancha:0,coordinador:'',coordinador_importe:0,notas:''};
  for(const k in f)f[k].value=(['titulo','fecha','inicio','fin'].includes(k)?a?.[k]:d?.[k])??defaults[k];courts.forEach(n=>n.checked=(a?.canchas||[1]).includes(Number(n.value)));roster.replaceChildren();(d?.parejas||[]).forEach(addPair);if(!d)addPair();dialog.showModal();
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
 async function financeLoad(){const token=++financeGeneration,month=$('#financeMonth').value;window.PointTorneosFinance={month,status:'loading'};renderFinance();try{const rows=await fetchEvents();if(token!==financeGeneration)return;const s=core.summary(rows,month);window.PointTorneosFinance={month,status:'ready',...s};fs.textContent=`Cobrado: ${money(s.total)} · Efectivo: ${money(s.cash)} · Transferencia: ${money(s.transfer)} · Pendiente: ${money(s.pending)} · Costos: ${money(s.cost)} · Cobrado menos costos: ${money(s.total-s.cost)}`;fl.replaceChildren();for(const j of s.rows)make('p',`${j.fecha} · ${j.torneo} · ${j.nombre} · ${j.medio} · ${money(core.cents(j.cobrado))}`,fl);}catch(e){if(token!==financeGeneration)return;window.PointTorneosFinance={month,status:'error'};fs.textContent='Torneos: no se pudieron consultar los cobros. '+e.message;}renderFinance();}
 $('#financeMonth').addEventListener('change',financeLoad);$('nav button[data-view="finanzas"]').addEventListener('click',financeLoad);
 window.addEventListener('focus',()=>{if(!dialog.open){if(section.classList.contains('active'))load();if($('#finanzas').classList.contains('active'))financeLoad();}});
 window.PointTorneosUI={open:edit};financeLoad();
})();
