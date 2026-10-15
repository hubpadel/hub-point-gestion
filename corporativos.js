/* Módulo aditivo; no reemplaza funciones ni manejadores existentes. */
(() => {
 'use strict';
 const core=PointCorporativos;
 const el=(tag,text,parent)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(parent)parent.append(n);return n;};
 const currency=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(n/100);
 const localDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
 const section=el('section');section.id='corporativos';section.className='view';document.querySelector('main').append(section);
 el('h2','Eventos Corporativos',section);
 el('p','Los eventos se muestran también en Agenda. Las canchas registradas aquí no bloquean automáticamente la agenda de clases.',section);
 const status=el('p','Seleccioná Actualizar para consultar los eventos.',section);status.setAttribute('role','status');
 const refresh=el('button','Actualizar',section);
 const form=el('form',undefined,section);form.className='grid2';const fields={};
 const specs=[['empresa','Empresa / cliente','text'],['contacto','Contacto','text'],['fecha','Fecha','date'],['inicio','Horario desde','time'],['fin','Horario hasta','time'],['canchas','Canchas','text'],['participantes','Participantes','number'],['presupuesto','Presupuesto registrado o enlace al adjunto','text'],['importe','Importe presupuestado','number']];
 for(const [key,label,type] of specs){const wrap=el('div',undefined,form);const l=el('label',label,wrap);const input=el('input',undefined,wrap);input.type=type;input.required=true;input.id='corp-'+key;l.htmlFor=input.id;fields[key]=input;if(type==='number'){input.min=key==='importe'?'0':'1';input.step=key==='importe'?'0.01':'1';}}
 const sw=el('div',undefined,form);el('label','Estado',sw);fields.estado=el('select',undefined,sw);
 for(const name of ['Borrador','Presupuestado','Confirmado','Realizado','Cancelado'])el('option',name,fields.estado);
 const save=el('button','Guardar evento',form);save.type='submit';const reset=el('button','Nuevo evento',section);reset.type='button';
 const list=el('div',undefined,section);let selected=null,events=[],eventPayments=[],loading=false;
 const payForm=el('form',undefined,section);el('h3','Confirmar cobro del evento seleccionado',payForm);const pay={};
 for(const [key,label,type] of [['importe','Importe cobrado','number'],['fecha','Fecha de cobro','date'],['referencia','Referencia / comprobante','text']]){el('label',label,payForm);pay[key]=el('input',undefined,payForm);pay[key].type=type;pay[key].required=key!=='referencia';if(key==='importe'){pay[key].min='0.01';pay[key].step='0.01';}}
 el('label','Método',payForm);pay.metodo=el('select',undefined,payForm);for(const m of ['Efectivo','Transferencia','Tarjeta','Otro'])el('option',m,pay.metodo);
 pay.fecha.value=localDate();const confirmPay=el('button','Confirmar pago',payForm);confirmPay.type='submit';confirmPay.disabled=true;
 const finance=el('div',undefined,document.querySelector('#finanzas'));el('h3','Ingresos · Corporativos',finance);const fStatus=el('p','Abrí Finanzas para consultar cobros corporativos.',finance);const fList=el('div',undefined,finance);let financeGeneration=0;
 async function financeLoad(){const generation=++financeGeneration;const month=document.querySelector('#financeMonth').value;if(!month)return;window.PointCorporativosFinance={month,status:'loading'};renderFinance();fStatus.textContent='Consultando ingresos corporativos…';fList.replaceChildren();try{
  const [y,m]=month.split('-').map(Number);const next=m===12?`${y+1}-01`:`${y}-${String(m+1).padStart(2,'0')}`;
  const rows=await core.readAll(()=>db.from('corporativos_ingresos').select('*').gte('fecha',month+'-01').lt('fecha',next+'-01').order('fecha').order('id'));if(generation!==financeGeneration)return;
  const s=core.summary(rows,month);window.PointCorporativosFinance={month,status:'ready',total:s.total};renderFinance();fStatus.textContent=`Corporativos: ${currency(s.total)} · Efectivo: ${currency(s.cash)} · Transferencia: ${currency(s.transfer)}`;
  for(const p of rows)el('p',`${p.fecha} · ${p.empresa} · Evento ${p.evento_id} · ${p.metodo} · ${currency(core.cents(p.importe))} · Pago ${p.id}`,fList);
 }catch(e){if(generation===financeGeneration){window.PointCorporativosFinance={month,status:'error'};renderFinance();fStatus.textContent='No se pudieron consultar ingresos corporativos: '+e.message;}}}
 function render(){list.replaceChildren();for(const ev of events){const card=el('div',undefined,list);card.className='card';const rows=eventPayments.filter(p=>p.evento_id===ev.id);
  el('h3',ev.empresa,card);el('p',`${ev.contacto} · ${ev.fecha} ${ev.inicio}–${ev.fin} · Canchas: ${ev.canchas} · ${ev.participantes} participantes · ${ev.estado}`,card);
  el('p','Presupuesto: '+ev.presupuesto,card);el('p',`Presupuestado: ${currency(core.cents(ev.importe))} · Saldo pendiente: ${currency(core.balance(ev.importe,rows))}`,card);
  for(const p of rows)el('p',`Cobro ${p.fecha} · ${p.metodo} · ${currency(core.cents(p.importe))} · ${p.referencia} · ${p.id}`,card);
  el('button','Seleccionar / editar',card).onclick=()=>{selected=ev.id;for(const k in fields)fields[k].value=ev[k];confirmPay.disabled=ev.estado==='Cancelado';status.textContent='Evento seleccionado: '+ev.empresa;};
  el('button','Ver en Agenda',card).onclick=()=>{const date=document.querySelector('#agendaDate');if(!date)return;date.value=ev.fecha;switchView('agenda');date.dispatchEvent(new Event('change',{bubbles:true}));};
 }}
 async function load(){if(loading)return;loading=true;refresh.disabled=true;status.textContent='Consultando…';try{
  const newEvents=await core.readAll(()=>db.from('corporativos_eventos').select('*').order('fecha').order('id'));
  const newPayments=await core.readAll(()=>db.from('corporativos_pagos').select('*').order('fecha').order('id'));
  events=newEvents;eventPayments=newPayments;render();status.textContent=`${events.length} evento${events.length===1?'':'s'} consultado${events.length===1?'':'s'}.`;
 }catch(e){status.textContent='No se pudo consultar el módulo: '+e.message;}finally{loading=false;refresh.disabled=false;}}
 refresh.onclick=load;reset.onclick=()=>{form.reset();selected=null;confirmPay.disabled=true;status.textContent='Nuevo evento.';};
 form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{const data={};for(const k in fields)data[k]=fields[k].value.trim();core.cents(data.importe);data.participantes=Number(data.participantes);if(data.fin<=data.inicio)throw Error('La hora final debe ser posterior al inicio.');
  const r=selected?await db.from('corporativos_eventos').update(data).eq('id',selected).select('id').single():await db.from('corporativos_eventos').insert(data).select('id').single();if(r.error)throw r.error;selected=r.data.id;confirmPay.disabled=data.estado==='Cancelado';await load();await refreshAgenda();
 }catch(err){status.textContent='No se pudo guardar: '+err.message;}finally{save.disabled=false;}};
 payForm.onsubmit=async e=>{e.preventDefault();if(!selected)return;confirmPay.disabled=true;try{
  if(core.cents(pay.importe.value)<=0)throw Error('El importe debe ser positivo.');
  const payload={p_evento:selected,p_importe:pay.importe.value,p_fecha:pay.fecha.value,p_metodo:pay.metodo.value,p_referencia:pay.referencia.value.trim()};
  const key='point-corporativos-pago-pendiente';const pending=JSON.parse(sessionStorage.getItem(key)||'null');
  if(pending&&JSON.stringify(pending.payload)!==JSON.stringify(payload))throw Error('Hay un cobro con respuesta pendiente. Reintentá con los mismos datos antes de registrar otro.');
  const id=pending?.id||crypto.randomUUID();sessionStorage.setItem(key,JSON.stringify({id,payload}));
  const r=await db.rpc('corporativos_confirmar_pago',{p_id:id,...payload});if(r.error){if(['P0001','23514','23503','23505','42501','22003','22P02'].includes(r.error.code))sessionStorage.removeItem(key);throw r.error;}
  sessionStorage.removeItem(key);pay.importe.value='';pay.referencia.value='';await load();await financeLoad();status.textContent='Pago confirmado. Ingreso registrado en Corporativos.';
 }catch(err){status.textContent='Cobro sin confirmación: '+err.message+' Si se perdió la conexión, reintentá con los mismos datos.';}finally{confirmPay.disabled=!selected;}};
 const nav=el('button','Eventos Corporativos',document.querySelector('nav'));nav.dataset.view='corporativos';nav.onclick=()=>{switchView('corporativos');load();};
 document.querySelector('nav button[data-view="finanzas"]').addEventListener('click',financeLoad);
 document.querySelector('#financeMonth').addEventListener('change',financeLoad);
 function initAgenda(){
  const agenda=document.querySelector('#agenda'),date=document.querySelector('#agendaDate');if(!agenda||!date)return async()=>{};
  const host=el('section');host.id='corporativosAgenda';host.style.cssText='margin:16px 0;padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--card)';
  agenda.insertBefore(host,document.querySelector('#openCourtsAgenda'));
  el('h3','Eventos Corporativos',host);const reload=el('button','Actualizar eventos',host),message=el('p','Consultando eventos…',host),rowsHost=el('div',undefined,host);message.setAttribute('role','status');let generation=0;
  async function update(){const request=++generation,day=date.value;rowsHost.replaceChildren();if(!day){message.textContent='Seleccioná una fecha para consultar los eventos.';return;}message.textContent='Consultando eventos…';
   try{const rows=await core.readAll(()=>db.from('corporativos_eventos').select('id,empresa,fecha,inicio,fin,canchas,participantes,estado').eq('fecha',day).order('inicio').order('id'));if(request!==generation||day!==date.value)return;
    message.textContent=rows.length?`${rows.length} evento${rows.length===1?'':'s'} corporativo${rows.length===1?'':'s'} para esta fecha.`:'No hay eventos corporativos para esta fecha.';
    for(const ev of rows){const card=el('article',undefined,rowsHost);card.style.cssText='padding:10px 0;border-top:1px solid var(--line)';el('strong',`${String(ev.inicio).slice(0,5)}–${String(ev.fin).slice(0,5)} · ${ev.empresa}`,card);el('p',`Canchas: ${ev.canchas} · ${ev.participantes} participantes · Estado: ${ev.estado}`,card);}
   }catch(e){if(request===generation)message.textContent='No se pudieron consultar los eventos corporativos: '+e.message;}
  }
  reload.onclick=update;date.addEventListener('change',update);
  for(const id of ['prevDay','nextDay','todayBtn'])document.querySelector('#'+id)?.addEventListener('click',update);
  document.querySelector('nav button[data-view="agenda"]')?.addEventListener('click',update);
  window.addEventListener('focus',()=>{if(agenda.classList.contains('active'))update();});update();return update;
 }
 const refreshAgenda=initAgenda();
})();
