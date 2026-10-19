const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
test('Clases de una hora: migración, asignación libre, capacidad, movimientos y lluvia',async()=>{
 const db=new PGlite();try{
 const fixture=fs.readFileSync(path.join(__dirname,'planner.test.cjs'),'utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1];await db.exec(fixture);
 const group=(id,date='2026-10-19',time='10:00')=>db.query("insert into clases(id,fecha,hora,estado,importe_esperado) values($1,$2,$3,'Pendiente',300)",[id,date,time]);
 const one='00000000-0000-0000-0000-000000000001',three='00000000-0000-0000-0000-000000000003',four='00000000-0000-0000-0000-000000000004',five='00000000-0000-0000-0000-000000000005';
 await group(three);await group(four);
 await group('90000000-0000-0000-0000-000000000001','2020-01-01');
 await db.exec("insert into corporativos_eventos values('90000000-0000-0000-0000-000000000002','2020-01-01','09:00','12:00','1,2,3','Histórico','Confirmado')");
 for(const f of ['planner.sql','planner-guards.sql','planner-auto.sql'])await db.exec(fs.readFileSync(path.join(__dirname,f),'utf8'));
 assert.equal((await db.query("select canchas from planner_agenda where fuente='clases' and fecha='2020-01-01'")).rows[0].canchas,null);
 assert.deepEqual((await db.query('select cancha,fin::text from planner_clases order by cancha,clase_id')).rows,[{cancha:1,fin:'11:00:00'},{cancha:2,fin:'11:00:00'},{cancha:3,fin:'11:00:00'},{cancha:3,fin:'11:00:00'}]);
 // Dos participantes de un mismo grupo ocupan una sola cancha.
 assert.equal((await db.query("select count(distinct cancha)::int n from planner_clases where clase_id in (select id from clases where grupo_id is not null)")).rows[0].n,1);
 await assert.rejects(group(five),/No hay cancha disponible/);
 assert.equal((await db.query('select count(*)::int n from clases')).rows[0].n,5);
 await db.exec("insert into canchas_abiertas values('70000000-0000-0000-0000-000000000001','2026-10-20','10:30','11:30','Cancha 1','Mixta','Confirmada')");
 await group(five,'2026-10-20');assert.equal((await db.query('select cancha from planner_clases where clase_id=$1',[five])).rows[0].cancha,2);
 await db.query("update clases set hora='12:00' where id=$1",[five]);assert.equal((await db.query('select fin::text from planner_clases where clase_id=$1',[five])).rows[0].fin,'13:00:00');
 await db.exec("insert into planner_actividades values('80000000-0000-0000-0000-000000000001','lluvia','Lluvia','2026-10-19','09:00','12:00',array[1,2,3])");
 await db.exec("update clases set estado='Presente' where fecha='2026-10-19'");
 await group('00000000-0000-0000-0000-000000000006','2026-10-19','13:00');
 await assert.rejects(group('00000000-0000-0000-0000-000000000007','2026-10-19','09:00'),/No hay cancha disponible/);
 await assert.rejects(group('00000000-0000-0000-0000-000000000008','2026-10-22','23:30'),/una hora/);
 const row=(await db.query("select * from planner_agenda where fuente='clases' and id=$1",[one])).rows[0];
 await assert.rejects(db.query('select planner_guardar($1,$2,$3,$4)',['clases',one,row.version,{fecha:'2026-10-22',inicio:'10:00',fin:'12:00',canchas:[1]}]),/una hora/);
 assert.equal((await db.query('select sum(importe_esperado)::int n from clases where fecha=$1',['2026-10-19'])).rows[0].n,1200);
 }finally{await db.close();}
});
