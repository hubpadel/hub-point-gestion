const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('logros privados: permisos, oro/plata/bronce, duplicados, atribución, bajas y validación',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table alumnos(id uuid primary key,nombre text,telefono text);create table jugadores(id bigint,alumno_id uuid,nombre text,telefono text);
 create table clases(id uuid primary key,alumno_id uuid,fecha date,hora time,created_at timestamptz,estado text);
 create table canchas_abiertas(id uuid primary key,fecha date,hora_inicio time,tipo text,categoria text,estado text);
 create table cancha_abierta_jugadores(id uuid primary key,cancha_abierta_id uuid,nombre text,telefono text,created_at timestamptz,presente boolean,pagado boolean);
 create table planner_actividades(id uuid primary key,titulo text,fecha date);create table torneos(id uuid primary key,datos jsonb);
 create table hub_action_tareas(id uuid primary key,responsable text,contacto text,telefono text,alumno_id uuid,estado text,fecha date,actualizado timestamptz,historial jsonb,notas text);`);
 await db.exec(fs.readFileSync(__dirname+'/hub-logros.sql','utf8'));await db.exec(fs.readFileSync(__dirname+'/hub-logros-acceso.sql','utf8'));
 await db.query('insert into auth.users values($1,$2,now()),($3,$4,now()),($5,$6,null)',[id(1),'admin@example.test',id(2),'staff@example.test',id(3),'unconfirmed@example.test']);
 await db.exec("insert into point_logros.accesos values('admin@example.test'),('unconfirmed@example.test')");
 for(const [n,name]of [[10,'Nuevo'],[11,'Activo'],[12,'Recuperado'],[13,'Repite']]){
  await db.query('insert into alumnos values($1,$2,$3)',[id(n),name,'54911000000'+n]);
  await db.query("insert into hub_action_tareas values($1,'Tamy',$2,$3,$4,'Interesada','2026-11-01','2026-11-01T18:00Z',$5,'Interés en nueva actividad')",[id(n+100),name,'54911000000'+n,id(n),JSON.stringify([{fecha:'2026-11-01T09:00Z',responsable:'Clari',estado:'Enviado'}])]);
 }
 const cls=async(n,student,date,created=date+'T18:00Z',state='Presente')=>db.query('insert into clases values($1,$2,$3,$4,$5,$6)',[id(n),id(student),date,'18:00',created,state]);
 await cls(20,10,'2026-11-04','2026-11-02T18:00Z');await cls(21,11,'2026-10-15');await cls(22,12,'2026-05-01');await cls(23,12,'2026-11-04');await cls(24,13,'2026-10-20');await cls(25,13,'2026-11-04');
 await db.query("insert into canchas_abiertas values($1,'2026-11-04','19:00','Femenina','7ma','Activa')",[id(30)]);
 await db.query('insert into cancha_abierta_jugadores values($1,$2,$3,$4,$5,false,true)',[id(31),id(30),'Activo','5491100000011','2026-11-02T18:00Z']);
 await db.exec('set role anon');await assert.rejects(db.query("select public.hub_logros_panel('2026-11-01','2026-11-30')"),/permission denied/);
 await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(2)]);
 await assert.rejects(db.query("select public.hub_logros_panel('2026-11-01','2026-11-30')"),/exclusivo/);
 await assert.rejects(db.query('select * from point_logros.decisiones'),/permission denied/);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(3)]);assert.equal((await db.query('select public.hub_logros_es_admin() as ok')).rows[0].ok,false);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(1)]);
 const panel=async()=> (await db.query("select public.hub_logros_panel('2026-11-01','2026-11-30') as data")).rows[0].data;
 let result=await panel();assert.equal(result.candidatos.length,3);assert.deepEqual(result.candidatos.map(c=>c.medalla).sort(),['Bronce','Oro','Plata']);
 const gold=result.candidatos.find(c=>c.medalla==='Oro');assert.equal(gold.inicio_gestion,'Clari');assert.equal(gold.empleada,'Tamy');
 await assert.rejects(db.query('select public.hub_logros_resolver($1,$2,$3,$4,true,$5)',[gold.fuente,gold.fuente_id,id(999),'Clari','No debe guardar']),/cambió/);
 await db.query('select public.hub_logros_resolver($1,$2,$3,$4,true,$5)',[gold.fuente,gold.fuente_id,gold.tarea_id,'Clari','Verificada la gestión']);
 result=await panel();assert.equal(result.logros.length,1);assert.equal(result.logros[0].empleada,'Clari');assert.equal(result.logros[0].vigente,true);assert.equal(result.candidatos.length,2);
 await assert.rejects(db.query('select public.hub_logros_resolver($1,$2,$3,$4,true,$5)',[gold.fuente,gold.fuente_id,gold.tarea_id,'Tamy','Duplicado']),/cambió/);
 await db.exec('reset role');await db.query("update clases set estado='Canceló' where id=$1",[gold.fuente_id]);await db.exec('set role authenticated');result=await panel();assert.equal(result.logros[0].vigente,false);
 await db.query('select public.hub_logros_anular($1,$2)',[result.logros[0].id,'Inscripción cancelada']);result=await panel();assert.equal(result.logros[0].estado,'Anulado');
 await assert.rejects(db.query("select public.hub_logros_panel('2020-01-01','2026-11-30')"),/366/);
 await db.exec('reset role');await db.query('insert into alumnos values($1,$2,$3),($4,$5,$6)',[id(90),'Homónimo','5491111111111',id(91),'Homónimo','5491122222222']);assert.equal((await db.query("select point_logros.cliente(null,null,'Homónimo') as k")).rows[0].k,null);
 }finally{await db.close();}
});
