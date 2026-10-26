const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const {PGlite}=require('@electric-sql/pglite');
test('Asistencia -> Clases a recuperar -> Clase recuperada: transacción y finanzas',async t=>{
 const db=new PGlite(),one='00000000-0000-0000-0000-000000000001',two='00000000-0000-0000-0000-000000000002',three='00000000-0000-0000-0000-000000000003';
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table alumnos(id uuid primary key,nombre text);create table profesores(id uuid primary key,nombre text);
 insert into alumnos values('30000000-0000-0000-0000-000000000001','Ana'),('30000000-0000-0000-0000-000000000002','Bea');insert into profesores values('40000000-0000-0000-0000-000000000001','Leo');
 create table clases(id uuid primary key,grupo_id uuid,fecha date,hora time,estado text check(estado in ('Pendiente','Presente','Ausente','Canceló','Recupera')),alumno_id uuid,profesor_id uuid,importe_esperado numeric);
 create table canchas_abiertas(id uuid primary key,fecha date,hora_inicio time,hora_fin time,cancha text,tipo text,estado text);create table corporativos_eventos(id uuid primary key,fecha date,inicio time,fin time,canchas text,empresa text,estado text);
 create table pagos(id int,importe numeric);insert into pagos values(1,300);create table liquidaciones_profesores(id int,importe numeric);insert into liquidaciones_profesores values(1,150);
 insert into clases values('${one}','20000000-0000-0000-0000-000000000001','2026-10-01','10:00','Pendiente','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',100),('${two}','20000000-0000-0000-0000-000000000001','2026-10-01','10:00','Pendiente','30000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001',200),('${three}',null,'2026-10-02','12:00','Ausente','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',100);`);
 for(const f of ['planner.sql','planner-guards.sql','planner-auto.sql','planner-access.sql','recuperaciones.sql','recuperaciones-asistencia.sql'])await db.exec(fs.readFileSync(path.join(__dirname,f),'utf8'));
 const base=async id=>(await db.query('select fecha::text,hora::text,alumno_id,profesor_id,estado,grupo_id from clases where id=$1',[id])).rows[0];
 const mark=(id,kind,original)=>db.query('select recuperacion_desde_asistencia($1,$2,$3) id',[id,kind,original]);
 const economic=async()=>JSON.stringify((await db.query("select jsonb_build_object('clases',(select jsonb_agg(to_jsonb(c)-'estado' order by id) from clases c),'pagos',(select jsonb_agg(p) from pagos p),'liquidaciones',(select jsonb_agg(l) from liquidaciones_profesores l)) x")).rows);
 const before=await economic(),original=await base(one);let id;
 await t.test('La suspensión grupal crea un pendiente y actualiza asistencia para todos',async()=>{
  await db.exec('set role anon');id=(await mark(one,'lluvia',original)).rows[0].id;await db.exec('reset role');
  assert.deepEqual((await db.query('select estado from clases where id=any($1) order by id',[[one,two]])).rows,[{estado:'Clase a recuperar'},{estado:'Clase a recuperar'}]);
  const p=(await db.query('select original from recuperaciones_participantes where recuperacion_id=$1',[id])).rows;assert.equal(p.length,2);assert.equal(p[0].original.fecha,'2026-10-01');assert.equal((await db.query('select actividad_id from recuperaciones where id=$1',[id])).rows[0].actividad_id,null);
 });
 await t.test('Reintentar o marcar otro alumno del mismo grupo no duplica pendientes',async()=>{
  assert.equal((await mark(one,'lluvia',original)).rows[0].id,id);assert.equal((await mark(two,'lluvia',await base(two))).rows[0].id,id);assert.equal((await db.query('select count(*)::int n from recuperaciones')).rows[0].n,1);
 });
 await t.test('Individual sin permiso y versión vieja no dejan asistencia cambiada',async()=>{
  const c=await base(three);await db.exec('set role anon');await assert.rejects(mark(three,'individual',c),/usuario autorizado/);await db.exec('reset role');assert.equal((await base(three)).estado,'Ausente');
  await assert.rejects(mark(three,'lluvia',{...c,hora:'09:00'}),/cambió/);await assert.rejects(mark(three,'lluvia',{}),/versión/);assert.equal((await base(three)).estado,'Ausente');
  await assert.rejects(db.query("update clases set estado='Clase a recuperar' where id=$1",[three]),/conservar el vínculo/);assert.equal((await base(three)).estado,'Ausente');
 });
 await t.test('Una recuperación existente en otro participante revierte toda la suspensión',async()=>{
  await db.exec(`insert into clases select '00000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000003',fecha,hora,'Pendiente',alumno_id,profesor_id,importe_esperado from clases where id='${three}';update clases set grupo_id='20000000-0000-0000-0000-000000000003' where id='${three}';`);
  await db.exec("insert into auth.users values('90000000-0000-0000-0000-000000000001');insert into recuperaciones_autorizadores values('90000000-0000-0000-0000-000000000001');set request.jwt.claim.sub='90000000-0000-0000-0000-000000000001';");
  await db.query("select recuperacion_crear('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','individual','existente')");
  await assert.rejects(mark(three,'lluvia',await base(three)),/ya tiene/);assert.equal((await base(three)).estado,'Ausente');assert.equal((await base('00000000-0000-0000-0000-000000000004')).estado,'Pendiente');
  await db.exec("delete from recuperaciones_participantes where recuperacion_id='50000000-0000-0000-0000-000000000001';delete from recuperaciones where id='50000000-0000-0000-0000-000000000001';delete from clases where id='00000000-0000-0000-0000-000000000004';update clases set grupo_id=null where id='00000000-0000-0000-0000-000000000003';");
 });
 await t.test('Individual habilitada registra únicamente al alumno seleccionado',async()=>{
  const result=(await mark(three,'individual',await base(three))).rows[0].id;
  assert.equal((await db.query('select count(*)::int n from recuperaciones_participantes where recuperacion_id=$1',[result])).rows[0].n,1);
  assert.equal((await base(three)).estado,'Clase a recuperar');assert.equal((await db.query('select motivo from recuperaciones where id=$1',[result])).rows[0].motivo,'individual');
 });
 await t.test('Reagendar crea Clase recuperada con nombres y mantiene el mismo ID',async()=>{
  await db.query("select recuperacion_programar($1,1,'2026-10-10','10:00',1)",[id]);let a=(await db.query('select * from planner_actividades where id=$1',[id])).rows[0];assert.match(a.titulo,/Clase recuperada.*Ana.*Bea.*Leo/);
  await db.query("select recuperacion_programar($1,2,'2026-10-11','11:00',2)",[id]);assert.equal((await db.query('select count(*)::int n from planner_actividades where id=$1',[id])).rows[0].n,1);
  assert.equal((await base(one)).fecha,'2026-10-01');assert.equal((await db.query('select count(*)::int n from clases')).rows[0].n,3);assert.equal(await economic(),before);
 });
 }finally{await db.close();}
});
test('Importa Recupera anterior sin alterar la clase ni inferir un grupo por lluvia',async()=>{
 const db=new PGlite();try{
 let setup=fs.readFileSync(__filename,'utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1];for(const [key,n] of [['one',1],['two',2],['three',3]])setup=setup.replaceAll('${'+key+'}','00000000-0000-0000-0000-00000000000'+n);
 await db.exec(setup);await db.exec("insert into clases select '00000000-0000-0000-0000-000000000004',grupo_id,fecha,hora,'Recupera',alumno_id,profesor_id,importe_esperado from clases where id='00000000-0000-0000-0000-000000000001'");
 const snapshot=JSON.stringify((await db.query('select * from clases order by id')).rows);
 for(const f of ['planner.sql','planner-guards.sql','planner-auto.sql','planner-access.sql','recuperaciones.sql','recuperaciones-asistencia.sql'])await db.exec(fs.readFileSync(path.join(__dirname,f),'utf8'));
 assert.equal(JSON.stringify((await db.query('select * from clases order by id')).rows),snapshot);
 assert.equal((await db.query('select count(*)::int n from recuperaciones')).rows[0].n,1);
 assert.equal((await db.query('select origen from recuperaciones')).rows[0].origen,'historico');
 assert.equal((await db.query('select count(*)::int n from recuperaciones_participantes')).rows[0].n,1);
 }finally{await db.close();}
});
