const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite'),C=require('./hub-action-core');
test('intereses compartidos: RPC guarda, conserva con cliente viejo, pausa e historiza sin cambiar permisos',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create table public.alumnos(id uuid primary key);grant select on public.alumnos to anon;');await db.exec(fs.readFileSync('hub-action.sql','utf8'));await db.exec(fs.readFileSync('hub-action-intereses.sql','utf8'));await db.exec('set role anon');
 const task={...C.dailyPlan('2026-11-02')[0],contacto:'Prueba',intereses:{actividades:['Clases','Torneos'],categorias:['7ma'],activo:true}},id='11111111-1111-4111-8111-111111111111';
 await db.query('select hub_action_guardar($1,0,$2::jsonb)',[id,JSON.stringify(task)]);
 let row=(await db.query('select * from hub_action_tareas')).rows[0];assert.deepEqual(row.intereses,task.intereses);assert.deepEqual(row.historial[0].intereses,task.intereses);
 const {intereses,...oldClient}=task;await db.query('select hub_action_guardar($1,1,$2::jsonb)',[id,JSON.stringify({...oldClient,notas:'Sin perder preferencias'})]);row=(await db.query('select * from hub_action_tareas')).rows[0];assert.deepEqual(row.intereses,intereses);
 await db.query('select hub_action_guardar($1,2,$2::jsonb)',[id,JSON.stringify({...task,intereses:{...intereses,activo:false}})]);row=(await db.query('select * from hub_action_tareas')).rows[0];assert.equal(C.interestLists([row]).length,0);
 await assert.rejects(db.query('select hub_action_guardar($1,2,$2::jsonb)',[id,JSON.stringify(task)]),/Otra persona/);
 await db.exec('reset role;set role authenticated');assert.equal((await db.query('select * from hub_action_tareas')).rows.length,0);
 }finally{await db.close();}
});
