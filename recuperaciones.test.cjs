const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
test('Recuperaciones: ciclo, permisos, reintentos e integridad financiera',async t=>{
 const db=new PGlite(),one='00000000-0000-0000-0000-000000000001',two='00000000-0000-0000-0000-000000000002',third='00000000-0000-0000-0000-000000000003',rid='10000000-0000-0000-0000-000000000001',individual='10000000-0000-0000-0000-000000000002',user='90000000-0000-0000-0000-000000000001';
 const call=(name,args)=>db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args);
 const get=async()=> (await db.query('select * from recuperaciones where id=$1',[rid])).rows[0];
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
 create table clases(id uuid primary key,grupo_id uuid,fecha date,hora time,estado text,alumno_id uuid,profesor_id uuid,importe_esperado numeric);
 create table canchas_abiertas(id uuid primary key,fecha date,hora_inicio time,hora_fin time,cancha text,tipo text,estado text);
 create table corporativos_eventos(id uuid primary key,fecha date,inicio time,fin time,canchas text,empresa text,estado text);
 create table pagos(id int,importe numeric);insert into pagos values(1,300);
 create table liquidaciones_profesores(id int,importe numeric);insert into liquidaciones_profesores values(1,150);
 insert into clases values('${one}','20000000-0000-0000-0000-000000000001','2026-10-01','10:00','Pendiente',null,null,100),('${two}','20000000-0000-0000-0000-000000000001','2026-10-01','10:00','Pendiente',null,null,200),('${third}',null,'2026-10-02','10:00','Ausente',null,null,100);`);
 for(const f of ['planner.sql','planner-guards.sql','planner-auto.sql','planner-access.sql','recuperaciones.sql'])await db.exec(fs.readFileSync(path.join(__dirname,f),'utf8'));
 const snapshot=async()=>JSON.stringify((await db.query("select jsonb_build_object('clases',(select jsonb_agg(c order by id) from clases c),'pagos',(select jsonb_agg(p) from pagos p),'liquidaciones',(select jsonb_agg(l) from liquidaciones_profesores l)) datos")).rows);
 const before=await snapshot();
 await t.test('Lluvia: grupo completo, pendiente y reintento sin duplicados',async()=>{
  await db.exec('set role anon');await call('recuperacion_crear',[rid,one,'lluvia','Lluvia comprobada']);await call('recuperacion_crear',[rid,one,'lluvia','Lluvia comprobada']);await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from recuperaciones_participantes')).rows[0].n,2);assert.equal((await get()).actividad_id,null);
  await assert.rejects(call('recuperacion_crear',[individual,two,'lluvia','']),/ya tiene/);
  await assert.rejects(call('recuperacion_crear',[rid,one,'lluvia','Otro motivo']),/otra solicitud/);
 });
 await t.test('Individual requiere usuario autorizado en servidor',async()=>{
  await db.exec('set role anon');await assert.rejects(call('recuperacion_crear',[individual,third,'individual','Autorización']),/usuario autorizado/);await db.exec('reset role');
  await db.exec(`insert into auth.users values('${user}');insert into recuperaciones_autorizadores values('${user}');set role authenticated;set request.jwt.claim.sub='${user}';`);
  await call('recuperacion_crear',[individual,third,'individual','Autorización']);await db.exec('reset role');
  assert.equal((await db.query('select autorizado_por from recuperaciones where id=$1',[individual])).rows[0].autorizado_por,user);
  assert.equal((await db.query('select count(*)::int n from recuperaciones_participantes where recuperacion_id=$1',[individual])).rows[0].n,1);
 });
 await t.test('Programar, rechazar conflictos y reprogramar la misma actividad',async()=>{
  await assert.rejects(call('recuperacion_programar',[rid,1,'2026-09-30','10:00',1]),/posterior/);
  await db.exec('set role anon');await call('recuperacion_programar',[rid,1,'2026-10-10','10:00',1]);await call('recuperacion_programar',[rid,1,'2026-10-10','10:00',1]);await db.exec('reset role');
  const r=await get();assert.equal(r.revision,2);assert.equal(r.actividad_id,rid);
  await assert.rejects(call('recuperacion_programar',[individual,1,'2026-10-10','10:00',1]),/Solapamiento/);
  assert.equal((await db.query('select actividad_id from recuperaciones where id=$1',[individual])).rows[0].actividad_id,null);
  await assert.rejects(call('recuperacion_programar',[rid,1,'2026-10-11','10:00',1]),/cambió/);
  await call('recuperacion_programar',[rid,2,'2099-10-11','11:00',2]);
  await assert.rejects(call('recuperacion_realizar',[rid,3]),/haber finalizado/);
  await call('recuperacion_programar',[rid,3,'2026-10-11','11:00',2]);
  assert.equal((await db.query('select count(*)::int n from planner_actividades')).rows[0].n,1);
  assert.equal((await db.query('select canchas from planner_actividades')).rows[0].canchas[0],2);
 });
 await t.test('No permite alterar vínculos, borrar original ni editar desde Planner genérico',async()=>{
  await db.exec('set role anon');
  await assert.rejects(db.query('update recuperaciones set realizada=true'),/permission denied/);
  await assert.rejects(db.query("update planner_actividades set titulo='Alterada' where id=$1",[rid]),/Recuperar clase/);
  await db.exec('reset role');await assert.rejects(db.query('delete from clases where id=$1',[one]),/foreign key/);
 });
 await t.test('Finalizar sólo programadas, terminal y reintento idempotente',async()=>{
  await assert.rejects(call('recuperacion_realizar',[individual,1]),/programada/);
  await assert.rejects(call('recuperacion_realizar',[rid,2]),/cambió/);
  await db.exec('set role anon');await call('recuperacion_realizar',[rid,4]);await call('recuperacion_realizar',[rid,4]);await db.exec('reset role');
  assert.equal((await get()).realizada,true);await assert.rejects(call('recuperacion_programar',[rid,5,'2026-10-12','11:00',2]),/ya fue realizada/);
 });
 await t.test('Clases originales, cobros y liquidaciones idénticos',async()=>assert.equal(await snapshot(),before));
 }finally{await db.close();}
});
