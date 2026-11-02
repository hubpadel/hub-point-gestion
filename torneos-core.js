(function(root){
 'use strict';
 const cents=n=>{const v=Number(n);if(!Number.isFinite(v)||v<0||v>999999999||Math.abs(v*100-Math.round(v*100))>0.00001)throw Error('Ingresá importes válidos con hasta dos decimales.');return Math.round(v*100);};
 const state=j=>cents(j.importe)===0?'Sin cargo':cents(j.cobrado)>=cents(j.importe)?'Pagado':cents(j.cobrado)>0?'Parcial':'Pendiente';
 const pairState=p=>p.estado==='Cancelada'?'Cancelada':p.jugadores.every(j=>cents(j.importe)===0)?'Sin cargo':p.jugadores.every(j=>cents(j.cobrado)>=cents(j.importe))?'Pagada':p.jugadores.some(j=>cents(j.cobrado)>0)?'Parcial':'Pendiente';
 function validate(d){
  for(const key of ['precio','costo_cancha','coordinador_importe'])cents(d[key]);
  const names=new Set(),ids=new Set();
  for(const p of d.parejas){
   if(p.jugadores.length!==2)throw Error('Cada pareja debe tener dos jugadores.');
   for(const x of [p,...p.jugadores]){if(!x.id||ids.has(x.id))throw Error('Identificador repetido.');ids.add(x.id);}
   for(const j of p.jugadores){const name=j.nombre.trim().replace(/\s+/g,' ').toLocaleLowerCase('es');if(!name)throw Error('Completá los dos jugadores de cada pareja.');if(p.estado!=='Cancelada'){if(names.has(name))throw Error('No repitas jugadores en el torneo.');names.add(name);}if(cents(j.cobrado)>cents(j.importe))throw Error('El cobro supera el importe individual.');if(cents(j.cobrado)>0&&cents(j.cobrado)!==cents(j.importe))throw Error('Registrá cero o el pago completo del jugador.');if(cents(j.cobrado)>0&&(!j.fecha||!['Efectivo','Transferencia'].includes(j.medio)))throw Error('Completá fecha y medio de cada cobro.');}
  }return d;
 }
 function summary(events,month){let total=0,cash=0,transfer=0,pending=0,cost=0;const rows=[];
  for(const e of events){const d=e.datos;for(const p of d.parejas)for(const j of p.jugadores){const amount=cents(j.cobrado);if(j.fecha?.slice(0,7)===month&&amount){total+=amount;if(j.medio==='Efectivo')cash+=amount;else transfer+=amount;rows.push({torneo:e.actividad.titulo,pareja:p.id,...j});}if(e.actividad.fecha.slice(0,7)===month&&p.estado!=='Cancelada')pending+=cents(j.importe)-amount;}if(e.actividad.fecha.slice(0,7)===month)cost+=cents(d.costo_cancha)+cents(d.coordinador_importe);}
  return {total,cash,transfer,pending,cost,rows};
 }
 const api={cents,state,pairState,validate,summary};if(typeof module==='object')module.exports=api;else root.PointTorneos=api;
})(globalThis);
