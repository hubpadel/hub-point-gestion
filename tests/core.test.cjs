const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const base=path.resolve(__dirname,'..');const c=require('../corporativos-core.js');
test('saldo parcial y pago total sin error decimal',()=>{assert.equal(c.balance('100.10',[{importe:'25.05'}]),7505);assert.equal(c.balance('100.10',[{importe:'25.05'},{importe:'75.05'}]),0);});
test('cobros se atribuyen al mes de cobro y método',()=>{assert.deepEqual(c.summary([{id:'a',fecha:'2026-10-01',importe:'0.10',metodo:'Efectivo'},{id:'b',fecha:'2026-10-14',importe:'0.20',metodo:'Transferencia'},{id:'c',fecha:'2026-11-01',importe:'99',metodo:'Efectivo'}],'2026-10'),{total:30,cash:10,transfer:20});});
test('rechaza importes inválidos y filas duplicadas',()=>{for(const v of ['-1','1.001','NaN','1e5','',Infinity])assert.throws(()=>c.cents(v));assert.throws(()=>c.summary([{id:'a',fecha:'2026-10-01',importe:1},{id:'a',fecha:'2026-10-01',importe:1}],'2026-10'));});
test('archivo existente intacto excepto nombre, módulo, horarios y suma autorizada en Ingresos',()=>{
 const old=fs.readFileSync(path.join(base,'tests/fixtures/original-index.html'),'utf8');const proposed=fs.readFileSync(path.join(base,'index.html'),'utf8');
 const authorizedLine="  const corp=window.PointCorporativosFinance;\n  $('#fIncome').textContent=corp?.month===m&&corp.status==='ready'?new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',minimumFractionDigits:2,maximumFractionDigits:2}).format(inc+corp.total/100):corp?.month===m&&corp.status==='error'?'Total no disponible':'Pendiente de consulta';";
 assert.equal(proposed.replace('const TIMES=Array.from({length:12}', 'const TIMES=Array.from({length:10}').replace('corporativos.js?v=20261015-agenda','corporativos.js').replaceAll('HUB GESTION INTEGRAL POINT','HUB POINT · Gestión de Clases').replace('<script src="corporativos-core.js"></script>\n<script src="corporativos.js"></script>\n','').replace('<span>Ingresos · Clases + Corporativos</span><b id="fIncome">Pendiente de consulta</b>','<span>Ingresos</span><b id="fIncome">$0</b>').replace(authorizedLine,"  $('#fIncome').textContent=money(inc);").trimEnd(),old.trimEnd());
});
test('sintaxis de scripts existente y nuevos válida',()=>{const html=fs.readFileSync(path.join(base,'index.html'),'utf8');for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);new vm.Script(fs.readFileSync(path.join(base,'corporativos.js'),'utf8'));});
test('módulo no escribe en tablas de los flujos existentes',()=>{const js=fs.readFileSync(path.join(base,'corporativos.js'),'utf8');for(const m of js.matchAll(/db\.from\('([^']+)'\)/g))assert.ok(m[1].startsWith('corporativos_'));assert.ok(!js.includes('fIncome'));});
test('consulta paginada incluye más de 1000 registros y detecta errores',async()=>{
 const data=Array.from({length:1201},(_,id)=>({id}));let calls=0;
 assert.equal((await c.readAll(()=>({async range(a,b){calls++;return {data:data.slice(a,b+1)}}}))).length,1201);assert.equal(calls,3);
 await assert.rejects(c.readAll(()=>({async range(){return {error:Error('Consulta fallida')}}})),/Consulta fallida/);
});
