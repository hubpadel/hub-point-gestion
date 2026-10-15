const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
let db;
test('PostgreSQL: migración completa y escenarios SQL de cobros',async()=>{
 db=new PGlite();await db.exec('create role anon; create role authenticated;');
 await db.exec(fs.readFileSync(path.join(__dirname,'../corporativos.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'database.sql'),'utf8'));
 assert.equal((await db.query('select count(*)::integer as n from public.corporativos_eventos')).rows[0].n,0);
});
test('PostgreSQL: anon y authenticated no pueden leer ni confirmar pagos por defecto',async()=>{
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  await assert.rejects(db.query('select * from public.corporativos_eventos'),e=>e.code==='42501');
  await assert.rejects(db.query("select public.corporativos_confirmar_pago(gen_random_uuid(),gen_random_uuid(),1,current_date,'Efectivo','')"),e=>e.code==='42501');
  await db.exec('reset role');
 }
});
test('PostgreSQL: inserción directa respeta saldo y rollback preserva registros',async()=>{
 const ev=(await db.query("insert into public.corporativos_eventos(empresa,contacto,fecha,inicio,fin,canchas,participantes,presupuesto,importe,estado) values ('Empresa','Contacto',current_date,'10:00','11:00','1',8,'Detalle',100,'Confirmado') returning id")).rows[0].id;
 const p=(await db.query("select (public.corporativos_confirmar_pago(gen_random_uuid(),$1,60,current_date,'Efectivo','')).id",[ev])).rows[0].id;
 await assert.rejects(db.query("insert into public.corporativos_pagos(id,evento_id,importe,fecha,metodo) values(gen_random_uuid(),$1,41,current_date,'Transferencia')",[ev]),/supera el saldo/);
 assert.equal((await db.query('select sum(importe)::text as total from public.corporativos_ingresos where evento_id=$1',[ev])).rows[0].total,'60.00');
 await db.exec('begin');await db.query("select public.corporativos_confirmar_pago(gen_random_uuid(),$1,40,current_date,'Transferencia','')",[ev]);await db.exec('rollback');
 assert.equal((await db.query('select count(*)::integer as n from public.corporativos_pagos where evento_id=$1',[ev])).rows[0].n,1);
 await db.query("update public.corporativos_eventos set estado='Cancelado' where id=$1",[ev]);
 await assert.rejects(db.query("select public.corporativos_confirmar_pago(gen_random_uuid(),$1,1,current_date,'Efectivo','')",[ev]),/cancelado/);
 await db.query("select public.corporativos_confirmar_pago($1,$2,60,current_date,'Efectivo','')",[p,ev]);
});
test('PostgreSQL: conceder SELECT sin políticas RLS sigue ocultando los datos',async()=>{
 await db.exec('grant select on public.corporativos_eventos,public.corporativos_pagos,public.corporativos_ingresos to authenticated; set role authenticated;');
 assert.equal((await db.query('select * from public.corporativos_ingresos')).rows.length,0);
 await db.exec('reset role');
});
test('PostgreSQL: permisos corporativos conservan acceso de los roles actuales',async()=>{
 await db.exec(fs.readFileSync(path.join(__dirname,'../corporativos-access.sql'),'utf8'));
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  const ev=(await db.query("insert into public.corporativos_eventos(empresa,contacto,fecha,inicio,fin,canchas,participantes,presupuesto,importe,estado) values($1,'Contacto',current_date,'10:00','12:00','1',16,'Detalle',100,'Confirmado') returning id",[role])).rows[0].id;
  const p=(await db.query('select gen_random_uuid() as id')).rows[0].id;
  for(let i=0;i<2;i++)await db.query("select public.corporativos_confirmar_pago($1,$2,25,current_date,'Transferencia','SEÑA')",[p,ev]);
  assert.equal((await db.query('select count(*)::integer as n from public.corporativos_ingresos where evento_id=$1',[ev])).rows[0].n,1);
  await db.query('update public.corporativos_eventos set participantes=20 where id=$1',[ev]);
  await assert.rejects(db.query('delete from public.corporativos_pagos where id=$1',[p]),e=>e.code==='42501');
  await assert.rejects(db.query('update public.corporativos_pagos set importe=1 where id=$1',[p]),e=>e.code==='42501');
  await assert.rejects(db.query('truncate public.corporativos_pagos'),e=>e.code==='42501');
  await assert.rejects(db.query("select public.corporativos_confirmar_pago(gen_random_uuid(),$1,76,current_date,'Efectivo','')",[ev]),/supera el saldo/);
  await db.exec('reset role');
 }
 await db.close();
});
