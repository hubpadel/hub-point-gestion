/* Página pública aislada: sólo consulta y confirma una recuperación mediante su enlace. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id),token=location.hash.slice(1),form=$('reserva'),status=$('resultado'),select=$('horario');
 let busy=false;
 const fecha=(d,h,c)=>`${d.split('-').reverse().join('/')} · ${h.slice(0,5)} · Cancha ${c}`;
 async function rpc(name,args){const res=await fetch('https://jpzoaskdtgfvvfpdbqox.supabase.co/rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json',apikey:'sb_publishable_yj3PONOs9YIlwYFiqiuV-A_ogIDN-Pr'},body:JSON.stringify(args)});const data=await res.json();if(!res.ok)throw Error(data.message||'No pudimos conectar. Intentá nuevamente.');return data;}
 function show(data){form.hidden=true;select.replaceChildren();
   if(data.estado==='confirmada'){$('contexto').textContent='La recuperación ya quedó agendada.';status.textContent='Clase recuperada: '+fecha(data.fecha,data.inicio,data.cancha)+'. La reserva incluye a todos los participantes de esta recuperación.';return;}
   $('contexto').textContent=`Clase suspendida el ${data.suspension.split('-').reverse().join('/')} · Prof. ${data.profesor||'a confirmar'}`;
   $('alcance').textContent=data.grupo_completo?`Tu elección agenda al grupo completo (${data.participantes} alumnos). Coordiná con tus compañeros antes de confirmar.`:'Tu elección agenda esta recuperación individual.';
   if(!data.opciones.length){status.textContent='No hay horarios disponibles por ahora. Pedile nuevas opciones al coordinador.';return;}
   const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Seleccioná fecha y hora';select.append(placeholder);
   for(const o of data.opciones){const n=document.createElement('option');n.value=o.opcion;n.textContent=fecha(o.fecha,o.inicio,o.cancha);select.append(n);}
   status.textContent='Estos son los horarios habilitados por el coordinador.';form.hidden=false;
 }
 function controls(disabled){$('confirmar').disabled=$('actualizar').disabled=select.disabled=disabled;}
 async function load(){if(busy)return;form.hidden=true;
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)){$('contexto').textContent='Necesitás el enlace que te envió el coordinador.';status.textContent='Enlace inválido.';return;}
   busy=true;controls(true);status.textContent='Consultando horarios…';try{show(await rpc('recuperacion_enlace_ver',{p_token:token}));}catch(e){$('contexto').textContent='No pudimos consultar la recuperación.';status.textContent=e.message;}finally{busy=false;controls(false);}}
 form.onsubmit=async e=>{e.preventDefault();if(busy||select.value==='')return;busy=true;controls(true);status.textContent='Confirmando recuperación…';try{show(await rpc('recuperacion_enlace_reservar',{p_token:token,p_opcion:Number(select.value)}));}catch(e){form.hidden=true;status.textContent=e.message+' Actualizá las opciones para verificar si quedó confirmada antes de volver a elegir.';}finally{busy=false;controls(false);}};
 window.addEventListener('hashchange',()=>location.reload());
 $('actualizar').onclick=load;load();
})();
