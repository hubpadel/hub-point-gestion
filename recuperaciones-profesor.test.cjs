const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{PGlite}=require('@electric-sql/pglite');
test('Calendario compartido por profesor sin identificación del alumno',async t=>{
 const db=new PGlite();try{
 let setup=fs.readFileSync(path.join(__dirname,'recuperaciones-asistencia.test.cjs'),'utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1];for(const [key,n] of [['one',1],['two',2],['three',3]])setup=setup.replaceAll('${'+key+'}','00000000-0000-0000-0000-00000000000'+n);
 await db.exec(setup);for(const f of ['planner.sql','planner-guards.sql','planner-auto.sql','planner-access.sql','recuperaciones.sql','recuperaciones-asistencia.sql','recuperaciones-enlaces.sql','recuperaciones-profesor.sql'])await db.exec(fs.readFileSync(path.join(__dirname,f),'utf8'));
 const id='50000000-0000-0000-0000-000000000001',other='50000000-0000-0000-0000-000000000002',prof='40000000-0000-0000-0000-000000000001',prof2='40000000-0000-0000-0000-000000000002',uid='90000000-0000-0000-0000-000000000001';
 await db.query("select recuperacion_crear($1,'00000000-0000-0000-0000-000000000001','lluvia','Grupo')",[id]);await db.query("select recuperacion_crear($1,'00000000-0000-0000-0000-000000000003','lluvia','Otro grupo')",[other]);
 await db.query('insert into profesores values($1,$2)',[prof2,'Otro']);await db.query('insert into auth.users values($1)',[uid]);await db.query('insert into recuperaciones_autorizadores values($1)',[uid]);
 const day=(await db.query('select (current_date+7)::text d')).rows[0].d,opts=[{fecha:day,inicio:'10:00',cancha:1},{fecha:day,inicio:'12:00',cancha:2}];
 const rpc=async(name,args)=>(await db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) x`,args)).rows[0].x;
 const snapshot=async()=>JSON.stringify((await db.query("select jsonb_build_object('c',(select jsonb_agg(c order by id) from clases c),'p',(select jsonb_agg(p) from pagos p),'l',(select jsonb_agg(l) from liquidaciones_profesores l)) x")).rows);
 const before=await snapshot();let agenda,link1,link2,slot;
 await t.test('Administración requiere coordinador; tablas y funciones internas no se exponen',async()=>{
 await db.exec('set role anon');await assert.rejects(rpc('recuperacion_profesor_administrar',[prof]),/permission denied/);await assert.rejects(db.query('select * from recuperaciones_horarios_profesor'),/permission denied/);await assert.rejects(rpc('recuperacion_profesor_libre',[prof,day,'10:00',1]),/permission denied/);await db.exec('reset role');
 await db.exec('set role authenticated');await assert.rejects(rpc('recuperacion_profesor_administrar',[prof]),/coordinador/);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);agenda=await rpc('recuperacion_profesor_administrar',[prof]);
 });
 await t.test('Una carga central; enlace estable y control de versión/horarios',async()=>{
 await assert.rejects(rpc('recuperacion_profesor_guardar',[prof,1,JSON.stringify([opts[0],opts[0]])]),/repetidos/);
 await assert.rejects(rpc('recuperacion_profesor_guardar',[prof,1,JSON.stringify([{...opts[0],fecha:'2020-01-01'}])]),/no disponible/);
 agenda=await rpc('recuperacion_profesor_guardar',[prof,1,JSON.stringify(opts)]);const again=await rpc('recuperacion_profesor_administrar',[prof]);assert.equal(again.enlace,agenda.enlace);assert.equal(again.opciones.length,2);
 await assert.rejects(rpc('recuperacion_profesor_guardar',[prof,1,'[]']),/cambiaron/);const a2=await rpc('recuperacion_profesor_administrar',[prof2]);assert.equal(a2.opciones.length,0);assert.notEqual(a2.enlace,agenda.enlace);
 });
 await t.test('Dos recuperaciones usan disponibilidad común; enlace reconoce clase sin pedir datos',async()=>{
 link1=await rpc('recuperacion_profesor_enlace',[id]);link2=await rpc('recuperacion_profesor_enlace',[other]);assert.equal(link1.enlace,link2.enlace);assert.notEqual(link1.token,link2.token);
 await db.exec('reset role;set role anon');const base=await rpc('recuperacion_profesor_ver',[agenda.enlace,null]);assert.equal(base.solo_consulta,true);assert.equal(base.opciones.length,2);assert.equal(base.suspension,undefined);assert.equal(JSON.stringify(base).includes('Ana'),false);
 const a=await rpc('recuperacion_profesor_ver',[agenda.enlace,link1.token]),b=await rpc('recuperacion_profesor_ver',[agenda.enlace,link2.token]);assert.deepEqual(a.opciones,b.opciones);assert.equal(a.participantes,2);slot=a.opciones[0].opcion;
 await assert.rejects(rpc('recuperacion_profesor_reservar',[agenda.enlace,null,slot]),/inválido/);
 await db.exec('reset role');const wrong=(await db.query('select enlace from recuperaciones_agendas_profesor where profesor_id=$1',[prof2])).rows[0].enlace;await db.exec('set role anon');await assert.rejects(rpc('recuperacion_profesor_ver',[wrong,link1.token]),/inválido/);await db.exec('reset role');
 });
 await t.test('Reserva grupal consume turno compartido; reintento no cambia la reserva',async()=>{
 await db.exec('set role anon');const result=await rpc('recuperacion_profesor_reservar',[agenda.enlace,link1.token,slot]);assert.equal(result.estado,'confirmada');assert.equal(result.inicio,'10:00:00');assert.deepEqual(await rpc('recuperacion_profesor_reservar',[agenda.enlace,link1.token,slot]),result);
 const rest=await rpc('recuperacion_profesor_ver',[agenda.enlace,link2.token]);assert.equal(rest.opciones.length,1);await assert.rejects(rpc('recuperacion_profesor_reservar',[agenda.enlace,link2.token,slot]),/ya no está disponible/);await db.exec('reset role');
 assert.equal((await db.query('select actividad_id from recuperaciones where id=$1',[id])).rows[0].actividad_id,id);assert.equal((await db.query('select count(*)::int n from recuperaciones_participantes where recuperacion_id=$1',[id])).rows[0].n,2);
 await db.exec('set role authenticated');const current=await rpc('recuperacion_profesor_administrar',[prof]);assert.equal(current.opciones.length,1);await assert.rejects(rpc('recuperacion_profesor_guardar',[prof,agenda.revision,JSON.stringify(opts)]),/cambiaron/);await db.exec('reset role');assert.equal(await snapshot(),before);
 });
 await t.test('Cambio central se ve en enlaces ya enviados; siguen vigentes enlaces anteriores',async()=>{
 await db.exec('set role authenticated');let current=await rpc('recuperacion_profesor_administrar',[prof]);current=await rpc('recuperacion_profesor_guardar',[prof,current.revision,JSON.stringify([{fecha:day,inicio:'15:00',cancha:1}])]);await db.exec('reset role;set role anon');assert.equal((await rpc('recuperacion_profesor_ver',[agenda.enlace,link2.token])).opciones[0].inicio,'15:00:00');await db.exec('reset role');
 await rpc('recuperacion_enlace_guardar',[other,1,JSON.stringify([{fecha:day,inicio:'16:00',cancha:2}])]);const legacy=(await db.query('select token from recuperaciones_enlaces where recuperacion_id=$1',[other])).rows[0].token;await db.exec('set role anon');assert.equal((await rpc('recuperacion_enlace_ver',[legacy])).opciones.length,1);await db.exec('reset role');assert.equal(await snapshot(),before);
 });
 }finally{await db.close();}
});
