/* Recuperaciones vinculadas. No crea clases ni movimientos económicos. */
(() => {
 'use strict';
 const el=(tag,text,parent)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;parent?.append(n);return n;};
 const host=el('section',undefined,document.querySelector('main'));host.id='recuperaciones';host.className='view';
 el('h2','Clases a recuperar',host);
 el('p','Marcá «Clase a recuperar» en Asistencia. Acá se conserva la fecha de suspensión y se elige la nueva fecha. No se genera otro cobro ni liquidación.',host);
 const nav=el('button','Clases a recuperar',document.querySelector('nav'));nav.dataset.view='recuperaciones';nav.onclick=()=>{switchView('recuperaciones');load();};
 const agendaHost=el('section',undefined,document.querySelector('#agenda'));agendaHost.id='recuperacionesAgenda';document.querySelector('#agenda').insertBefore(agendaHost,document.querySelector('#agendaList'));
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
 const members=r=>participants.filter(p=>p.recuperacion_id===r.id);
 const summary=r=>members(r).map(p=>`${sName(p.original.alumno_id)} · Suspensión: ${p.original.fecha} ${(p.original.hora||'').slice(0,5)} · Prof. ${tName(p.original.profesor_id)}`).join(' / ');
 function agendaRender(){agendaHost.replaceChildren();const day=document.querySelector('#agendaDate').value,teacher=document.querySelector('#agendaTeacherFilter').value;
   for(const r of rows.filter(r=>r.actividad?.fecha===day&&(!teacher||members(r).some(p=>p.original.profesor_id===teacher)))){
     const card=el('article',undefined,agendaHost);card.className='recuperacion-card recuperacion-agenda';
     el('h3','Clase recuperada',card);el('strong',`${r.actividad.inicio.slice(0,5)}–${r.actividad.fin.slice(0,5)} · Cancha ${r.actividad.canchas.join(', ')}`,card);
     el('p','Alumnos: '+members(r).map(p=>sName(p.original.alumno_id)).join(', '),card);
     el('p',summary(r),card);el('p',state(r)+' · Sin nuevo cobro ni liquidación',card);
     if(!r.realizada)el('button','Ver / reagendar',card).onclick=()=>openExisting(r);
   }
 }
 async function rpc(name,args){const r=await db.rpc(name,args);if(r.error)throw r.error;return r.data;}
 function render(){list.replaceChildren();for(const r of rows.filter(r=>filter.value==='Todas'||state(r)===filter.value)){
   const card=el('article',undefined,list);card.className='recuperacion-card';
   el('strong',`${state(r)} · ${r.origen==='historico'?'Marcada en Asistencia (anterior)':r.motivo==='lluvia'?'Grupal por lluvia':'Individual autorizada'}`,card);el('p',summary(r),card);
   el('p',r.observaciones,card);
   el('p',r.actividad?`Nueva fecha: ${r.actividad.fecha} · ${r.actividad.inicio.slice(0,5)}–${r.actividad.fin.slice(0,5)} · Cancha ${r.actividad.canchas.join(', ')}`:'Nueva fecha: pendiente de reagendar',card);
   if(!r.realizada){const edit=el('button',r.actividad_id?'Reagendar otra vez':'Reagendar',card);edit.disabled=busy;edit.onclick=()=>openExisting(r);
     if(r.actividad_id){const done=el('button','Marcar realizada',card);done.disabled=busy;done.onclick=async()=>{if(busy)return;busy=true;render();try{await rpc('recuperacion_realizar',{p_id:r.id,p_revision:r.revision});await load();}catch(e){status.textContent=e.message;}finally{busy=false;render();}};}
   }
 }if(!list.children.length)el('p','Sin recuperaciones en este estado.',list);agendaRender();}
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
   save.textContent='Guardar nueva fecha';message.textContent='';switchView('recuperaciones');dialog.showModal();}
 window.openRecovery=async(id,kind='lluvia')=>{if(busy)return;await load();if(!ready)return;const existing=participants.find(p=>p.clase_id===id);if(existing){const r=rows.find(r=>r.id===existing.recuperacion_id);if(r.realizada){status.textContent='Esta clase ya tiene una recuperación realizada.';return;}openExisting(r);return;}
   original=classes.find(c=>c.id===id);if(!original)return;selected=null;pendingId=crypto.randomUUID();reason.value=kind;reason.disabled=false;fields.notes.value='';fields.notes.readOnly=false;schedule.hidden=true;for(const n of [fields.date,fields.time,fields.court])n.required=false;
   updateDetail();save.textContent='Registrar pendiente';message.textContent='';switchView('recuperaciones');dialog.showModal();};
 function updateDetail(){if(!original)return;const group=reason.value==='lluvia'?classes.filter(c=>(c.grupo_id||c.id)===(original.grupo_id||original.id)&&c.fecha===original.fecha&&c.hora===original.hora):[original];detail.textContent=`Original: ${original.fecha} · ${(original.hora||'').slice(0,5)} · Prof. ${tName(original.profesor_id)} · ${group.map(c=>sName(c.alumno_id)).join(', ')}`;}
 window.openRecoveryActivity=async(id,fallback)=>{await load();if(!ready)return;const r=rows.find(r=>r.actividad_id===id);if(r){if(r.realizada){status.textContent='La recuperación ya fue realizada.';document.querySelector('nav button[data-view="agenda"]').click();return;}openExisting(r);}else fallback();};
 reason.onchange=updateDetail;
 form.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;save.disabled=close.disabled=true;message.textContent='Guardando…';try{
   if(selected)await rpc('recuperacion_programar',{p_id:selected.id,p_revision:selected.revision,p_fecha:fields.date.value,p_inicio:fields.time.value,p_cancha:Number(fields.court.value)});
   else await rpc('recuperacion_crear',{p_id:pendingId,p_clase:original.id,p_motivo:reason.value,p_observaciones:fields.notes.value.trim()});
   dialog.close();await refreshAll();await load();if(selected){document.querySelector('#agendaDate').value=fields.date.value;switchView('agenda');renderAgenda();agendaRender();}document.querySelector('#agendaDate').dispatchEvent(new Event('change'));
 }catch(err){message.textContent='No se confirmó el cambio: '+err.message+' Ante un corte de conexión, actualizá para verificar el resultado.';}finally{busy=false;save.disabled=close.disabled=false;render();}};
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 const attendanceStatus=document.querySelector('#attendanceStatus'),wrap=el('div',undefined,document.querySelector('#attendanceModal .grid2'));wrap.id='recuperacionAttendanceWrap';wrap.hidden=true;
 const modeLabel=el('label','Recuperación de la clase suspendida',wrap),mode=el('select',undefined,modeLabel);mode.id='recoveryAttendanceMode';
 for(const [value,text] of [['lluvia','Grupo completo por lluvia'],['individual','Sólo este alumno (requiere autorización)']]){const o=el('option',text,mode);o.value=value;}
 el('p','Se conserva el horario original como fecha de suspensión. Reagendá después desde Clases a recuperar.',wrap);
 function attendanceMode(){wrap.hidden=attendanceStatus.value!=='Clase a recuperar';}
 attendanceStatus.addEventListener('change',attendanceMode);document.querySelector('#attendanceModal').addEventListener('click',attendanceMode);
 new MutationObserver(attendanceMode).observe(document.querySelector('#attendanceModal'),{attributes:true,attributeFilter:['class','style']});
 window.PointRecuperaciones={guardarAsistencia:async()=>{if(attendanceStatus.value!=='Clase a recuperar')return false;
   const c=classes.find(x=>x.id===document.querySelector('#attendanceClassId').value);if(!c)return true;
   if(document.querySelector('#attendanceDate').value!==c.fecha||document.querySelector('#attendanceTime').value!==c.hora.slice(0,5)||document.querySelector('#attendanceStudent').value!==c.alumno_id||document.querySelector('#attendanceTeacher').value!==c.profesor_id||Number(document.querySelector('#attendanceAmount').value)!==Number(c.importe_esperado)){
     alert('Para suspender conservamos los datos originales. Guardá por separado cualquier cambio de fecha, alumno, profesor o importe.');return true;
   }
   const button=document.querySelector('#saveAttendance');if(button.disabled)return true;button.disabled=true;try{
     await rpc('recuperacion_desde_asistencia',{p_clase:c.id,p_modalidad:mode.value,p_original:{fecha:c.fecha,hora:c.hora,alumno_id:c.alumno_id,profesor_id:c.profesor_id,estado:c.estado,grupo_id:c.grupo_id||null}});
     closeM('attendanceModal');await refreshAll();await load();switchView('recuperaciones');
   }catch(e){alert('No se guardó la suspensión: '+e.message);}finally{button.disabled=false;}return true;
 }};
 filter.onchange=render;refresh.onclick=load;document.querySelector('nav button[data-view="agenda"]').addEventListener('click',load);
 document.querySelector('#agendaDate').addEventListener('change',()=>{agendaRender();load();});document.querySelector('#agendaTeacherFilter').addEventListener('change',agendaRender);
 for(const id of ['prevDay','nextDay','todayBtn'])document.querySelector('#'+id).addEventListener('click',()=>{agendaRender();load();});
 window.addEventListener('point:agenda',()=>{agendaRender();load();});
 window.addEventListener('focus',()=>{if(host.closest('.active')&&!dialog.open&&!busy)load();});load();
})();
