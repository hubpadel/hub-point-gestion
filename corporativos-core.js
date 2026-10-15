(function(root){
  'use strict';
  const cents = value => {
    const s=String(value).trim();
    if(!/^\d+(\.\d{1,2})?$/.test(s))throw Error('Usá un importe positivo con hasta dos decimales.');
    const [whole,decimal='']=s.split('.');const n=Number(whole)*100+Number(decimal.padEnd(2,'0'));
    if(!Number.isSafeInteger(n))throw Error('Importe fuera de rango.');return n;
  };
  const balance=(budget,payments)=>cents(budget)-payments.reduce((sum,p)=>sum+cents(p.importe),0);
  const summary=(payments,month)=>{
    const seen=new Set();let total=0,cash=0,transfer=0;
    for(const p of payments){if(seen.has(p.id))throw Error('Pago duplicado en la respuesta.');seen.add(p.id);
      if(!p.fecha.startsWith(month+'-'))continue;
      const n=cents(p.importe);total+=n;if(p.metodo==='Efectivo')cash+=n;if(p.metodo==='Transferencia')transfer+=n;
    }return {total,cash,transfer};
  };
  const readAll=async factory=>{
    const rows=[],size=500;
    for(let offset=0;;offset+=size){const r=await factory().range(offset,offset+size-1);if(r.error)throw r.error;const batch=r.data||[];rows.push(...batch);if(batch.length<size)return rows;}
  };
  const api={cents,balance,summary,readAll};if(typeof module!=='undefined')module.exports=api;else root.PointCorporativos=api;
})(globalThis);
