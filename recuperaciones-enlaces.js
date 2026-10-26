/* El coordinador habilita opciones; una elección confirma la recuperación completa. */
(() => {
 'use strict';
 const el=(tag,text,parent)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;parent?.append(n);return n;};
 const dialog=el('dialog',undefined,document.querySelector('#recuperaciones'));dialog.id='recoveryLinkDialog';
 el('h3','Enlace para que el alumno reagende',dialog);
 el('p','Habilitá fechas, horarios y canchas. Si es grupal, una sola elección agenda a todos. Los horarios se vuelven a comprobar al reservar.',dialog);
 const context=el('p','',dialog),form=el('form',undefined,dialog),options=el('div',undefined,form);
 const add=el('button','Agregar horario',form);add.type='button';const save=el('button','Guardar horarios y generar enlace',form);save.type='submit';
 const message=el('p','',dialog);message.setAttribute('role','status');const output=el('div',undefined,dialog),label=el('label','Enlace para compartir',output),link=el('input',undefined,label);link.readOnly=true;
 const copy=el('button','Copiar enlace',output),whatsapp=el('a','Abrir WhatsApp con el enlace',output);whatsapp.target='_blank';whatsapp.rel='noopener noreferrer';
 const expires=el('p','',output),revoke=el('button','Desactivar enlace',dialog),close=el('button','Cerrar',dialog);output.hidden=true;revoke.hidden=true;
 let selected=null,busy=false;
 async function rpc(name,args){const r=await db.rpc(name,args);if(r.error)throw r.error;return r.data;}
 function row(value={}){const wrap=el('div',undefined,options);wrap.className='recovery-slot';
   for(const [key,text,type] of [['fecha','Fecha','date'],['inicio','Hora','time'],['cancha','Cancha (1 a 3)','number']]){const l=el('label',text,wrap),n=el('input',undefined,l);n.type=type;n.dataset.field=key;n.required=true;n.value=value[key]??(key==='cancha'?1:'');if(key==='cancha'){n.min=1;n.max=3;n.step=1;}}
   const remove=el('button','Quitar horario',wrap);remove.type='button';remove.onclick=()=>wrap.remove();
 }
 function sharing(data){if(!data?.token||data.activo===false){output.hidden=true;revoke.hidden=true;return;}const url=new URL('recuperar.html',location.href);url.hash=data.token;link.value=url.href;
   whatsapp.href='https://wa.me/?text='+encodeURIComponent('HUB POINT · Tu clase está pendiente de recuperación. Elegí uno de los horarios habilitados: '+url.href+' Si es una clase grupal, la elección agenda a todo el grupo.');
   expires.textContent='Vence: '+new Date(data.vence_en).toLocaleString('es-AR');output.hidden=false;revoke.hidden=false;
 }
 function controls(value){busy=value;for(const n of dialog.querySelectorAll('button,input'))n.disabled=value;}
 window.openRecoveryLink=async r=>{if(busy)return;selected=r;options.replaceChildren();output.hidden=true;revoke.hidden=true;context.textContent='Recuperación pendiente de nueva fecha';message.textContent='Consultando enlace…';dialog.showModal();controls(true);
   try{const data=await rpc('recuperacion_enlace_administrar',{p_id:r.id});for(const o of data?.opciones||[])row(o);if(!options.children.length)row();sharing(data);message.textContent='Podés copiar el enlace y mandarlo al alumno. Guardar nuevos horarios reemplaza el enlace anterior.';}catch(e){message.textContent=e.message;row();}finally{controls(false);}};
 add.onclick=()=>{if(options.children.length>=20){message.textContent='Podés habilitar hasta 20 horarios.';return;}row();};
 form.onsubmit=async e=>{e.preventDefault();if(busy)return;const values=[...options.children].map(w=>Object.fromEntries([...w.querySelectorAll('input')].map(n=>[n.dataset.field,n.dataset.field==='cancha'?Number(n.value):n.value])));if(!values.length){message.textContent='Agregá al menos un horario.';return;}controls(true);message.textContent='Comprobando horarios…';
   try{const data=await rpc('recuperacion_enlace_guardar',{p_id:selected.id,p_revision:selected.revision,p_opciones:values});selected={...selected,revision:selected.revision+1};sharing(data);message.textContent='Enlace listo. La primera elección confirma la fecha para toda la recuperación.';window.dispatchEvent(new Event('point:agenda'));}catch(e){output.hidden=true;message.textContent=e.message+' Cerrá y volvé a abrir para actualizar.';}finally{controls(false);}};
 revoke.onclick=async()=>{if(busy)return;controls(true);try{await rpc('recuperacion_enlace_guardar',{p_id:selected.id,p_revision:selected.revision,p_opciones:[]});output.hidden=true;revoke.hidden=true;message.textContent='Enlace desactivado.';}catch(e){message.textContent=e.message;}finally{controls(false);}};
 copy.onclick=async()=>{try{await navigator.clipboard.writeText(link.value);message.textContent='Enlace copiado.';}catch{link.focus();link.select();message.textContent='Seleccioná y copiá el enlace.';}};
 close.onclick=()=>dialog.close();dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
})();
