const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
test('reintento tras respuesta perdida conserva ID y no duplica cobro',async()=>{
 const all=[];class Element{constructor(tag){this.tag=tag;this.children=[];this.value='';this.listeners={};this.dataset={};all.push(this);}append(n){this.children.push(n);}replaceChildren(){this.children=[];}setAttribute(){}addEventListener(k,f){this.listeners[k]=f;}reset(){}}
 const main=new Element('main'),nav=new Element('nav'),fin=new Element('section'),month=new Element('input'),finBtn=new Element('button');month.value='2026-10';
 const document={createElement:t=>new Element(t),querySelector:s=>({'main':main,'nav':nav,'#finanzas':fin,'#financeMonth':month,'nav button[data-view="finanzas"]':finBtn}[s])};
 const event={id:'event1',empresa:'Empresa',contacto:'Contacto',fecha:'2026-10-14',inicio:'10:00',fin:'11:00',canchas:'1',participantes:8,presupuesto:'Detalle',importe:100,estado:'Confirmado'};
 const ids=[],confirmed=new Map(),memory=new Map();let lost=true;
 const db={from(table){const query={select(){return query;},order(){return query;},range(){return Promise.resolve({data:table==='corporativos_eventos'?[event]:[...confirmed.values()]});},gte(){return query;},lt(){return query;}};return query;},async rpc(name,p){ids.push(p.p_id);confirmed.set(p.p_id,{id:p.p_id,evento_id:p.p_evento,fecha:p.p_fecha,importe:p.p_importe,metodo:p.p_metodo});if(lost){lost=false;return {error:{message:'Respuesta perdida'}};}return {data:confirmed.get(p.p_id)};}};
 const context={document,db,window:{},renderFinance(){},PointCorporativos:require('../corporativos-core.js'),Intl,Date,crypto:{randomUUID:()=> 'unique-payment'},sessionStorage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},switchView(){}};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../corporativos.js'),'utf8'),context);
 await all.find(n=>n.textContent==='Actualizar').onclick();all.find(n=>n.textContent==='Seleccionar / editar').onclick();
 const forms=all.filter(n=>n.tag==='form'),payment=forms[1],inputs=payment.children.filter(n=>n.tag==='input');inputs[0].value='25.05';inputs[1].value='2026-10-14';inputs[2].value='Seña';payment.children.find(n=>n.tag==='select').value='Efectivo';
 await payment.onsubmit({preventDefault(){}});assert.equal(memory.size,1);
 await payment.onsubmit({preventDefault(){}});assert.deepEqual(ids,['unique-payment','unique-payment']);assert.equal(confirmed.size,1);assert.equal(memory.size,0);
});

