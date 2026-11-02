const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {PGlite}=require('@electric-sql/pglite');const core=require('./torneos-core');
const player=(id,nombre,cobrado=0)=>({id,nombre,importe:100,cobrado,fecha:cobrado?'2026-11-01':'',medio:cobrado?'Efectivo':'',presencia:'Pendiente'});
const data=()=>({precio:100,costo_cancha:20,coordinador_importe:10,tipo:'Mixta',categoria:'Suma 12',parejas:[{id:'pair-1',estado:'Inscripta',jugadores:[player('one','Ana',100),player('two','Luis',0)]}]});
test('Estados individuales, pareja y finanzas por fecha de cobro, sin duplicar pareja',()=>{
 const d=data();core.validate(d);assert.equal(core.state(d.parejas[0].jugadores[0]),'Pagado');assert.equal(core.pairState(d.parejas[0]),'Parcial');
 const e={datos:d,actividad:{titulo:'Prueba',fecha:'2026-12-01'}};assert.deepEqual({...core.summary([e],'2026-11'),rows:[]},{total:10000,cash:10000,transfer:0,pending:0,cost:0,rows:[]});
 const s=core.summary([e],'2026-12');assert.equal(s.pending,10000);assert.equal(s.cost,3000);d.parejas[0].estado='Cancelada';assert.equal(core.summary([e],'2026-11').total,10000);assert.equal(core.summary([e],'2026-12').pending,0);
});
test('Validación de pareja incompleta, repetidos e importes inválidos',()=>{
 let d=data();d.parejas[0].jugadores.pop();assert.throws(()=>core.validate(d),/dos jugadores/);d=data();d.parejas[0].jugadores[1].nombre=' ANA ';assert.throws(()=>core.validate(d),/repitas/);d=data();d.parejas[0].jugadores[1].cobrado=101;assert.throws(()=>core.validate(d),/supera/);assert.throws(()=>core.cents(-1));assert.throws(()=>core.cents(1.001));
});
test('SQL real: guardado atómico, reintentos, dos ediciones, permisos, conflictos e historial',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create table clases(id uuid primary key,grupo_id uuid,fecha date,hora time,estado text);create table canchas_abiertas(id uuid primary key,fecha date,hora_inicio time,hora_fin time,cancha text,tipo text,estado text);create table corporativos_eventos(id uuid primary key,fecha date,inicio time,fin time,canchas text,empresa text,estado text);`);
 for(const file of ['planner.sql','planner-guards.sql'])await db.exec(fs.readFileSync(__dirname+'/'+file,'utf8'));
 await db.exec(`grant usage on schema public to anon,authenticated;grant select on clases,canchas_abiertas,corporativos_eventos to anon,authenticated;create function planner_asignar_clases(date,text) returns void language sql as $$ select $$;`);
 for(const file of ['planner-access.sql','torneos.sql'])await db.exec(fs.readFileSync(__dirname+'/'+file,'utf8'));
 const id='20000000-0000-0000-0000-000000000001',other='20000000-0000-0000-0000-000000000002';const a={tipo:'torneos',titulo:'Torneo',fecha:'2026-11-01',inicio:'10:00',fin:'11:00',canchas:[1]};const d=data();
 const put=(i,r,v,a,d)=>db.query('select torneos_guardar($1,$2,$3,$4,$5) revision',[i,r,v,a,d]);const get=async()=> (await db.query('select to_jsonb(a) data from planner_actividades a where id=$1',[id])).rows[0].data;
 await db.exec('set role anon');await put(id,null,null,a,d);assert.equal((await put(id,null,null,a,d)).rows[0].revision,1);
 assert.equal((await db.query('select * from planner_agenda')).rows.length,1);
 const initial=await get(),changed=structuredClone(d);changed.parejas[0].jugadores[1]={...changed.parejas[0].jugadores[1],cobrado:100,medio:'Transferencia',fecha:'2026-11-01'};
 await put(id,1,initial,a,changed);await assert.rejects(put(id,1,initial,a,d),/cambió/);assert.equal((await db.query('select revision from torneos')).rows[0].revision,2);
 const invalid=data();invalid.parejas[0].jugadores.pop();await assert.rejects(put(other,null,null,{...a,inicio:'11:00',fin:'12:00'},invalid),/dos jugadores/);assert.equal((await db.query('select * from planner_actividades where id=$1',[other])).rows.length,0);
 await assert.rejects(put(other,null,null,a,d),/Solapamiento/);
 const removed={...changed,parejas:[]};await assert.rejects(put(id,2,await get(),a,removed),/Conservá/);
 await assert.rejects(db.query('delete from torneos where id=$1',[id]),/permission denied/);
 // Move in Planner while tournament form is open: stale schedule cannot overwrite it.
 const beforeMove=await get();await db.query('select planner_guardar($1,$2,$3,$4)',['planner_actividades',id,beforeMove,{...a,inicio:'12:00',fin:'13:00'}]);
 await assert.rejects(put(id,2,beforeMove,a,d),/cambió/);
 assert.equal((await get()).inicio,'12:00:00');
 await db.exec('reset role;set role authenticated');assert.equal((await db.query('select * from torneos')).rows.length,1);
 // Primero se crea el torneo vacío; las parejas se agregan en otra edición.
 const emptyId='20000000-0000-0000-0000-000000000003',emptyActivity={...a,fecha:'2026-11-03'},emptyData={...data(),parejas:[]};
 await put(emptyId,null,null,emptyActivity,emptyData);
 assert.equal((await db.query('select jsonb_array_length(datos->\'parejas\') n from torneos where id=$1',[emptyId])).rows[0].n,0);
 const emptyVersion=(await db.query('select to_jsonb(a) version from planner_actividades a where id=$1',[emptyId])).rows[0].version;
 await put(emptyId,1,emptyVersion,emptyActivity,data());
 assert.equal((await db.query('select jsonb_array_length(datos->\'parejas\') n from torneos where id=$1',[emptyId])).rows[0].n,1);
 }finally{await db.close();}
});
