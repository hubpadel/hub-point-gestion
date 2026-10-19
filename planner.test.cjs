const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
test('Planner: datos originales, conflictos, grupos, lluvia, concurrencia optimista y permisos',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;
 create table clases(id uuid primary key,grupo_id uuid,fecha date,hora time,estado text,observaciones text,alumno_id uuid,profesor_id uuid,importe_esperado numeric);
 create table canchas_abiertas(id uuid primary key,fecha date,hora_inicio time,hora_fin time,cancha text,tipo text,estado text);
 create table corporativos_eventos(id uuid primary key,fecha date,inicio time,fin time,canchas text,empresa text,estado text);
 insert into clases values ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','2026-10-19','10:00','Pendiente','Conservar',null,null,100),('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','2026-10-19','10:00','Presente','Conservar',null,null,200);`);
 await db.exec(fs.readFileSync(path.join(__dirname,'planner.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'planner-guards.sql'),'utf8'));
 const get=async(source,id)=>(await db.query('select * from planner_agenda where fuente=$1 and id=$2',[source,id])).rows[0];
 const put=(source,id,version,data)=>db.query('select planner_guardar($1,$2,$3,$4)',[source,id,version,data]);
 const data=(changes={})=>({titulo:'Torneo <prueba>',tipo:'torneos',fecha:'2026-10-20',inicio:'10:00',fin:'11:00',canchas:[1],...changes});
 const one='00000000-0000-0000-0000-000000000001',two='00000000-0000-0000-0000-000000000002',event='20000000-0000-0000-0000-000000000001';
 assert.deepEqual((await db.query("select planner_canchas('Cancha 1, 3') a, planner_canchas('a confirmar') b")).rows[0],{a:[1,3],b:null});
 await assert.rejects(put('planner_actividades',event,null,data({fecha:'2026-10-19'})),/Solapamiento/);
 const original=await get('clases',one);await put('clases',one,original.version,data({fecha:'2026-10-19',inicio:'10:00',fin:'11:00',canchas:[2]}));
 assert.deepEqual((await db.query('select cancha from planner_clases order by clase_id')).rows,[{cancha:2},{cancha:2}]);
 assert.deepEqual((await db.query('select importe_esperado::int as importe,observaciones from clases order by id')).rows,[{importe:100,observaciones:'Conservar'},{importe:200,observaciones:'Conservar'}]);
 await assert.rejects(put('clases',one,original.version,data()),/cambió/);
 await put('planner_actividades',event,null,data());
 await assert.rejects(put('planner_actividades',event,null,data()),/ya existe/);
 assert.equal((await db.query('select count(*)::int n from planner_actividades')).rows[0].n,1);
 await assert.rejects(put('planner_actividades',two,null,data({inicio:'10:30',fin:'11:30'})),/Solapamiento/);
 await put('planner_actividades',two,null,data({inicio:'11:00',fin:'12:00'}));
 const rain='30000000-0000-0000-0000-000000000001';await put('planner_actividades',rain,null,data({tipo:'lluvia',titulo:'Lluvia',inicio:'09:00',fin:'13:00'}));
 assert.equal((await db.query('select count(*)::int n from planner_actividades')).rows[0].n,3);
 await assert.rejects(put('planner_actividades','40000000-0000-0000-0000-000000000001',null,data({inicio:'12:00',fin:'13:00'})),/Solapamiento/);
 const row=await get('clases',one);await put('clases',one,row.version,data({fecha:'2026-10-21',canchas:[2]}));
 assert.equal((await db.query("select count(*)::int n from clases where fecha='2026-10-21'")).rows[0].n,2);
 assert.equal((await db.query('select count(*)::int n from clases')).rows[0].n,2);
 await assert.rejects(db.query("insert into canchas_abiertas values ('60000000-0000-0000-0000-000000000001','2026-10-20','12:00','13:00','Cancha 1','Mixta','Confirmada')"),/Solapamiento/);
 assert.equal((await db.query('select count(*)::int n from canchas_abiertas')).rows[0].n,0);
 await db.exec("insert into canchas_abiertas values ('60000000-0000-0000-0000-000000000001','2026-10-20','12:00','13:00','Cancha 3','Mixta','Confirmada')");
 await assert.rejects(db.query("update canchas_abiertas set cancha='Cancha 1'"),/Solapamiento/);
 assert.equal((await db.query('select cancha from canchas_abiertas')).rows[0].cancha,'Cancha 3');
 await db.exec("update clases set estado='Presente'");
 await db.exec('grant usage on schema public to authenticated;grant select,update on clases,canchas_abiertas,corporativos_eventos to authenticated;grant select on planner_agenda to authenticated;grant select,insert,update on planner_actividades,planner_clases to authenticated;grant execute on function planner_canchas(text),planner_guardar(text,uuid,jsonb,jsonb) to authenticated; set role authenticated;');
 assert.equal((await db.query('select * from planner_actividades')).rows.length,0);
 await assert.rejects(put('planner_actividades','50000000-0000-0000-0000-000000000001',null,data({fecha:'2026-10-22'})),/row-level security/);
 const current=await get('clases',one);await assert.rejects(put('clases',one,current.version,data({fecha:'2026-10-23',canchas:[2]})),/row-level security/);
 await db.exec('reset role');assert.equal((await db.query("select count(*)::int n from clases where fecha='2026-10-21'")).rows[0].n,2);
 await db.exec(`grant execute on function planner_canchas(text) to authenticated;create policy lectura on planner_actividades for select to authenticated using(true);create policy lectura on planner_clases for select to authenticated using(true);set role authenticated;`);
 const readable=await get('clases',one);await assert.rejects(put('clases',one,readable.version,data({fecha:'2026-10-23',canchas:[2]})),/row-level security/);
 await db.exec('reset role');
 assert.equal((await db.query("select count(*)::int n from clases where fecha='2026-10-21'")).rows[0].n,2);
 }finally{await db.close();}
});
test('El programa original sólo incorpora el cargador del Planner',()=>{
 const original=fs.readFileSync(path.join(__dirname,'planner-base-index.html'),'utf8');const result=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
 assert.equal(result.replace('<link rel="stylesheet" href="planner.css?v=20261019-visual2"><script src="planner.js?v=20261019-visual2"></script>',''),original);

});
