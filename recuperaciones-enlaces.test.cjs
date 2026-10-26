const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{PGlite}=require('@electric-sql/pglite');
test('Enlace grupal: horarios habilitados, permisos, reserva única y finanzas',async t=>{
 const db=new PGlite();try{
 let setup=fs.readFileSync(path.join(__dirname,'recuperaciones-asistencia.test.cjs'),'utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1];for(const [key,n] of [['one',1],['two',2],['three',3]])setup=setup.replaceAll('${'+key+'}','00000000-0000-0000-0000-00000000000'+n);
 await db.exec(setup);
 for(const f of ['planner.sql','planner-guards.sql','planner-auto.sql','planner-access.sql','recuperaciones.sql','recuperaciones-asistencia.sql','recuperaciones-enlaces.sql'])await db.exec(fs.readFileSync(path.join(__dirname,f),'utf8'));
 const id='50000000-0000-0000-0000-000000000001',other='50000000-0000-0000-0000-000000000002',uid='90000000-0000-0000-0000-000000000001';
 await db.query("select recuperacion_crear($1,'00000000-0000-0000-0000-000000000001','lluvia','Grupo')",[id]);
 await db.query("select recuperacion_crear($1,'00000000-0000-0000-0000-000000000003','lluvia','Otro grupo')",[other]);
 const day=(await db.query("select (current_date+7)::text d")).rows[0].d;
 const opts=[{fecha:day,inicio:'10:00',cancha:1},{fecha:day,inicio:'12:00',cancha:2}];
 const rpc=async(name,args)=>(await db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) x`,args)).rows[0].x;
 const snap=async()=>JSON.stringify((await db.query("select jsonb_build_object('c',(select jsonb_agg(c order by id) from clases c),'p',(select jsonb_agg(p) from pagos p),'l',(select jsonb_agg(l) from liquidaciones_profesores l)) x")).rows);
 const before=await snap();let token;
 await t.test('Sólo coordinador habilitado administra; token y opciones no se leen como anon',async()=>{
   await db.exec('set role anon');await assert.rejects(rpc('recuperacion_enlace_guardar',[id,1,JSON.stringify(opts)]),/permission denied/);await assert.rejects(db.query('select * from recuperaciones_enlaces'),/permission denied/);await db.exec('reset role');
   await db.exec('set role authenticated');await assert.rejects(rpc('recuperacion_enlace_guardar',[id,1,JSON.stringify(opts)]),/coordinador/);await db.exec('reset role');
   await db.query('insert into auth.users values($1)',[uid]);await db.query('insert into recuperaciones_autorizadores values($1)',[uid]);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
 });
 await t.test('Valida opciones futuras, repetidas y versión; publica sin agendar',async()=>{
   await assert.rejects(rpc('recuperacion_enlace_guardar',[id,1,JSON.stringify([{...opts[0],fecha:'2020-01-01'}])]),/no disponible/);
   await assert.rejects(rpc('recuperacion_enlace_guardar',[id,1,JSON.stringify([opts[0],opts[0]])]),/repetidos/);
   await assert.rejects(rpc('recuperacion_enlace_guardar',[id,3,JSON.stringify(opts)]),/cambió/);
   const data=await rpc('recuperacion_enlace_guardar',[id,1,JSON.stringify(opts)]);token=data.token;
   assert.equal((await db.query('select actividad_id from recuperaciones where id=$1',[id])).rows[0].actividad_id,null);
   await db.exec('set role anon');const visible=await rpc('recuperacion_enlace_ver',[token]);assert.equal(visible.participantes,2);assert.equal(visible.grupo_completo,true);assert.equal(visible.opciones.length,2);assert.equal(JSON.stringify(visible).includes('Ana'),false);await db.exec('reset role');
 });
 await t.test('Rotar invalida el enlace anterior; revocar y vencer impiden reservar',async()=>{
   const old=token;token=(await rpc('recuperacion_enlace_guardar',[id,2,JSON.stringify(opts)])).token;
   await assert.rejects(rpc('recuperacion_enlace_ver',[old]),/inválido/);
   await rpc('recuperacion_enlace_guardar',[id,3,'[]']);await assert.rejects(rpc('recuperacion_enlace_reservar',[token,0]),/vencido/);
   token=(await rpc('recuperacion_enlace_guardar',[id,3,JSON.stringify(opts)])).token;
   await db.query("update recuperaciones_enlaces set vence_en=now()-interval '1 second' where token=$1",[token]);await assert.rejects(rpc('recuperacion_enlace_ver',[token]),/vencido/);
   token=(await rpc('recuperacion_enlace_guardar',[id,4,JSON.stringify(opts)])).token;
 });
 await t.test('Ocupa cancha y profesor después de enviar; no muestra ni reserva horarios ocupados',async()=>{
   await db.query("insert into planner_actividades values('60000000-0000-0000-0000-000000000001','alquileres','Ocupado',$1,'10:00','11:00',array[1])",[day]);
   assert.equal((await rpc('recuperacion_enlace_ver',[token])).opciones.length,1);await assert.rejects(rpc('recuperacion_enlace_reservar',[token,0]),/no está disponible/);
   await db.query("select recuperacion_programar($1,1,$2,'12:00',3)",[other,day]);
   assert.equal((await rpc('recuperacion_enlace_ver',[token])).opciones.length,0);await assert.rejects(rpc('recuperacion_enlace_reservar',[token,1]),/no está disponible/);
   await db.query("select recuperacion_programar($1,2,$2,'14:00',3)",[other,day]);
 });
 await t.test('Un alumno confirma a todo el grupo; segundo intento devuelve la misma reserva',async()=>{
   await db.exec('set role anon');await assert.rejects(rpc('recuperacion_enlace_reservar',[token,999]),/horario habilitado/);
   const a=await rpc('recuperacion_enlace_reservar',[token,1]),b=await rpc('recuperacion_enlace_reservar',[token,0]);assert.deepEqual(a,b);assert.equal(a.estado,'confirmada');assert.equal(a.inicio,'12:00:00');await db.exec('reset role');
   assert.equal((await db.query('select count(*)::int n from planner_actividades where id=$1',[id])).rows[0].n,1);
   assert.equal((await db.query('select count(*)::int n from recuperaciones_participantes where recuperacion_id=$1',[id])).rows[0].n,2);assert.equal(await snap(),before);
   await assert.rejects(rpc('recuperacion_enlace_guardar',[id,6,JSON.stringify(opts)]),/ya no está pendiente/);
 });
 }finally{await db.close();}
});
test('Instalación: validación con ROLLBACK y publicación preservan registros existentes',async()=>{
 const db=new PGlite();try{
 let setup=fs.readFileSync(path.join(__dirname,'recuperaciones-asistencia.test.cjs'),'utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1];for(const [key,n] of [['one',1],['two',2],['three',3]])setup=setup.replaceAll('${'+key+'}','00000000-0000-0000-0000-00000000000'+n);
 await db.exec(setup);for(const f of ['planner.sql','planner-guards.sql','planner-auto.sql','planner-access.sql','recuperaciones.sql','recuperaciones-asistencia.sql'])await db.exec(fs.readFileSync(path.join(__dirname,f),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'recuperaciones-enlaces-validar.sql'),'utf8'));assert.equal((await db.query("select to_regclass('public.recuperaciones_enlaces') t")).rows[0].t,null);
 await db.exec(fs.readFileSync(path.join(__dirname,'recuperaciones-enlaces-produccion.sql'),'utf8'));assert.equal((await db.query('select count(*)::int n from recuperaciones_enlaces')).rows[0].n,0);
 }finally{await db.close();}
});
