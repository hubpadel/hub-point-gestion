const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite'),C=require('./hub-action-core');
test('agenda compartida: migración, versiones, historial, duplicados y permisos',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create table public.alumnos(id uuid primary key);grant select on public.alumnos to anon;');
 await db.exec(fs.readFileSync(__dirname+'/hub-action.sql','utf8'));
 await db.exec('set role anon');
 const task={...C.dailyPlan('2026-10-30')[0],contacto:'Prueba',telefono:'5491112345678'};
 const id='11111111-1111-4111-8111-111111111111';
 await db.query('select public.hub_action_guardar($1,0,$2::jsonb)',[id,JSON.stringify(task)]);
 assert.equal((await db.query('select version from hub_action_tareas')).rows[0].version,1);
 await db.query('select public.hub_action_guardar($1,1,$2::jsonb)',[id,JSON.stringify({...task,estado:'Enviado',mensaje:'Hola'})]);
 await assert.rejects(db.query('select public.hub_action_guardar($1,1,$2::jsonb)',[id,JSON.stringify(task)]),/Otra persona/);
 await assert.rejects(db.query('select public.hub_action_guardar($1,0,$2::jsonb)',['22222222-2222-4222-8222-222222222222',JSON.stringify({...task,origen:'otro'})]),/contacto ya tiene/);
 await assert.rejects(db.query('select public.hub_action_guardar($1,2,$2::jsonb)',[id,JSON.stringify({...task,estado:'Confirmada'})]));
 const saved=(await db.query('select historial,version from hub_action_tareas')).rows[0];assert.equal(saved.version,2);assert.equal(saved.historial.length,2);
 await db.exec('reset role;set role authenticated');assert.equal((await db.query('select * from hub_action_tareas')).rows.length,0);
 await assert.rejects(db.query('select public.hub_action_guardar($1,0,$2::jsonb)',['33333333-3333-4333-8333-333333333333',JSON.stringify({...task,origen:'denied'})]));
 }finally{await db.close();}
});
test('jornada completa respeta turnos y tiene identidades estables',()=>{const tasks=C.dailyPlan('2026-10-30');assert.equal(tasks.length,13);tasks.forEach(t=>C.validate(t));assert.equal(new Set(tasks.map(t=>t.origen)).size,13);assert.deepEqual(tasks,C.dailyPlan('2026-10-30'));});
