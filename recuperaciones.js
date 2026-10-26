/* Recuperaciones vinculadas. No crea clases ni movimientos económicos. */
(() => {
 'use strict';
 const el=(tag,text,parent)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;parent?.append(n);return n;};
 const host=el('section',undefined,document.querySelector('#agenda'));host.id='recuperaciones';
 el('h3','Recuperar clase',host);
 el('p','La recuperación conserva la clase original y su cobro. La modalidad individual requiere una sesión autorizada.',host);
 const access=el('details',undefined,host);el('summary','Acceso para autorizar recuperaciones individuales',access);
 el('p','Ingresá con una cuenta habilitada por administración. Iniciar sesión por sí solo no concede autorización.',access);
 const accessForm=el('form',undefined,access),emailLabel=el('label','Correo',accessForm),email=el('input',undefined,emailLabel);email.type='email';email.autocomplete='username';email.required=true;
 const passwordLabel=el('label','Contraseña',accessForm),password=el('input',undefined,passwordLabel);password.type='password';password.autocomplete='current-password';password.required=true;
 const login=el('button','Iniciar sesión',accessForm);login.type='submit';const logout=el('button','Cerrar sesión',access);logout.type='button';const accessStatus=el('p','',access);accessStatus.setAttribute('role','status');
 accessForm.onsubmit=async e=>{e.preventDefault();login.disabled=true;try{if(!db.auth)throw Error('Acceso no disponible');const r=await db.auth.signInWithPassword({email:email.value.trim(),password:password.value});if(r.error)throw r.error;password.value='';accessStatus.textContent='Sesión iniciada. La autorización se verifica al registrar la recuperación.';await load();}catch(err){password.value='';accessStatus.textContent=err.message;}finally{login.disabled=false;}};
 logout.onclick=async()=>{if(!db.auth)return;const r=await db.auth.signOut();accessStatus.textContent=r.error?r.error.message:'Sesión cerrada';await load();};
 const toolbar=el('div',undefined,host);toolbar.className='toolbar';
 const filter=el('select',undefined,toolbar);filter.setAttribute('aria-label','Estado de recuperación');
 for(const s of ['Todas','Pendiente','Programada','Realizada']){const o=el('option',s,filter);o.value=s;}
 const refresh=el('button','Actualizar recuperaciones',toolbar),status=el('p','',host),list=el('div',undefined,host);status.setAttribute('role','status');
 const dialog=el('dialog',undefined,host),form=el('form',undefined,dialog);
 el('h3','Recuperar clase',form);const detail=el('p','',form),fields={};
 function field(key,label,type){const l=el('label',label,form),n=el('input',undefined,l);n.type=type;fields[key]=n;return n;}
 const reasonLabel=el('label','Modalidad',form),reason=el('select',undefined,reasonLabel);
 for(const [value,label] of [['lluvia','Grupal por lluvia'],['individual','Individual autorizada']]){const o=el('option',label,reason);o.value=value;}
 field('notes','Motivo / observaciones','text');
 const schedule=el('fieldset',undefined,form);el('legend','Nueva fecha (duración: una hora)',schedule);
 for(const [key,label,type] of [['date','Fecha','date'],['time','Hora','time'],['court','Cancha (1 a 3)','number']]){const n=field(key,label,type);schedule.append(n.parentElement);n.required=true;}
 fields.court.min=1;fields.court.max=3;fields.court.step=1;
 const message=el('p','',form);message.setAttribute('role','status');
 const save=el('button','Registrar pendiente',form);save.type='submit';
 const close=el('button','Cerrar',form);close.type='button';close.onclick=()=>dialog.close();
 let rows=[],participants=[],selected=null,original=null,pendingId=null,busy=false,ready=false,generation=0;
 const state=r=>r.realizada?'Realizada':r.actividad_id?'Programada':'Pendiente';
 const summary=r=>participants.filter(p=>p.recuperacion_id===r.id).map(p=>`${sName(p.original.alumno_id)} · ${p.original.fecha} ${(p.original.hora||'').slice(0,5)} · Prof. ${tName(p.original.profesor_id)}`).join(' / ');
 async function rpc(name,args){const r=await db.rpc(name,args);if(r.error)throw r.error;return r.data;}
 function render(){list.replaceChildren();for(const r of rows.filter(r=>filter.value==='Todas'||state(r)===filter.value)){
   const card=el('article',undefined,list);card.className='recuperacion-card';
   el('strong',`${state(r)} · ${r.motivo==='lluvia'?'Grupal por lluvia':'Individual autorizada'}`,card);el('p',summary(r),card);
   el('p',r.observaciones,card);
   if(r.actividad)el('p',`${r.actividad.fecha} · ${r.actividad.inicio.slice(0,5)}–${r.actividad.fin.slice(0,5)} · Cancha ${r.actividad.canchas.join(', ')}`,card);
   if(!r.realizada){const edit=el('button',r.actividad_id?'Reprogramar':'Programar',card);edit.disabled=busy;edit.onclick=()=>openExisting(r);
     if(r.actividad_id){const done=el('button','Marcar realizada',card);done.disabled=busy;done.onclick=async()=>{if(busy)return;busy=true;render();try{await rpc('recuperacion_realizar',{p_id:r.id,p_revision:r.revision});await load();}catch(e){status.textContent=e.message;}finally{busy=false;render();}};}
   }
 }if(!list.children.length)el('p','Sin recuperaciones en este estado.',list);}
 async function load(){const token=++generation;ready=false;status.textContent='Consultando recuperaciones…';try{
   const [a,b,c]=await Promise.all([
     PointCorporativos.readAll(()=>db.from('recuperaciones').select('*').order('creada_en').order('id')),
     PointCorporativos.readAll(()=>db.from('recuperaciones_participantes').select('*').order('clase_id')),
     PointCorporativos.readAll(()=>db.from('planner_actividades').select('*').eq('tipo','recuperaciones').order('id'))
   ]);if(token!==generation)return;participants=b;rows=a.map(r=>({...r,actividad:c.find(x=>x.id===r.actividad_id)}));ready=true;status.textContent=`${rows.filter(r=>state(r)==='Pendiente').length} pendientes · ${rows.filter(r=>state(r)==='Programada').length} programadas · ${rows.filter(r=>state(r)==='Realizada').length} realizadas`;render();
 }catch(e){if(token!==generation)return;rows=[];participants=[];list.replaceChildren();status.textContent='Recuperaciones no disponible: '+e.message;}}
 function openExisting(r){if(busy)return;selected=r;original=null;detail.textContent=summary(r);reason.value=r.motivo;reason.disabled=true;fields.notes.value=r.observaciones;fields.notes.readOnly=true;schedule.hidden=false;
   for(const n of [fields.date,fields.time,fields.court])n.required=true;
   const p=participants.find(p=>p.recuperacion_id===r.id)?.original;
   fields.date.value=r.actividad?.fecha||localISO();fields.time.value=(r.actividad?.inicio||p?.hora||'09:00').slice(0,5);fields.court.value=r.actividad?.canchas?.[0]||1;
   save.textContent=r.actividad_id?'Guardar reprogramación':'Programar recuperación';message.textContent='';switchView('agenda');dialog.showModal();}
 window.openRecovery=async(id,kind='lluvia')=>{if(busy)return;await load();if(!ready)return;const existing=participants.find(p=>p.clase_id===id);if(existing){const r=rows.find(r=>r.id===existing.recuperacion_id);if(r.realizada){status.textContent='Esta clase ya tiene una recuperación realizada.';return;}openExisting(r);return;}
   original=classes.find(c=>c.id===id);if(!original)return;selected=null;pendingId=crypto.randomUUID();reason.value=kind;reason.disabled=false;fields.notes.value='';fields.notes.readOnly=false;schedule.hidden=true;for(const n of [fields.date,fields.time,fields.court])n.required=false;
   updateDetail();save.textContent='Registrar pendiente';message.textContent='';switchView('agenda');dialog.showModal();};
 function updateDetail(){if(!original)return;const group=reason.value==='lluvia'?classes.filter(c=>(c.grupo_id||c.id)===(original.grupo_id||original.id)&&c.fecha===original.fecha&&c.hora===original.hora):[original];detail.textContent=`Original: ${original.fecha} · ${(original.hora||'').slice(0,5)} · Prof. ${tName(original.profesor_id)} · ${group.map(c=>sName(c.alumno_id)).join(', ')}`;}
 window.openRecoveryActivity=async(id,fallback)=>{await load();if(!ready)return;const r=rows.find(r=>r.actividad_id===id);if(r){if(r.realizada){status.textContent='La recuperación ya fue realizada.';document.querySelector('nav button[data-view="agenda"]').click();return;}openExisting(r);}else fallback();};
 reason.onchange=updateDetail;
 form.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;save.disabled=close.disabled=true;message.textContent='Guardando…';try{
   if(selected)await rpc('recuperacion_programar',{p_id:selected.id,p_revision:selected.revision,p_fecha:fields.date.value,p_inicio:fields.time.value,p_cancha:Number(fields.court.value)});
   else await rpc('recuperacion_crear',{p_id:pendingId,p_clase:original.id,p_motivo:reason.value,p_observaciones:fields.notes.value.trim()});
   dialog.close();await load();if(document.querySelector('#planner')?.classList.contains('active'))document.querySelector('nav button[data-view="planner"]').click();document.querySelector('#agendaDate').dispatchEvent(new Event('change'));
 }catch(err){message.textContent='No se confirmó el cambio: '+err.message+' Ante un corte de conexión, actualizá para verificar el resultado.';}finally{busy=false;save.disabled=close.disabled=false;render();}};
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 filter.onchange=render;refresh.onclick=load;document.querySelector('nav button[data-view="agenda"]').addEventListener('click',load);
 window.addEventListener('focus',()=>{if(host.closest('.active')&&!dialog.open&&!busy)load();});load();
})();
