const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('finanzas: acceso privado, fechas de cobro, fuentes únicas, gastos auditados y estimaciones',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create schema point_logros;grant usage on schema point_logros to authenticated;
 create function point_logros.hub_logros_es_admin() returns boolean language sql stable as $$select coalesce(auth.uid()='00000000-0000-4000-8000-000000000001',false)$$;
 create table alumnos(id uuid primary key,nombre text);create table profesores(id uuid primary key,nombre text,porcentaje_liquidacion numeric);
 create table pagos(id uuid primary key,alumno_id uuid,profesor_id uuid,tipo_pago text,fecha_cobro date,medio_pago text,importe numeric);
 create table canchas_abiertas(id uuid primary key,fecha date,tipo text,categoria text,estado text,coordinador_nombre text,coordinador_importe numeric,coordinador_pagado boolean,costo_cancha numeric);
 create table cancha_abierta_jugadores(id uuid primary key,cancha_abierta_id uuid,nombre text,fecha_pago date,medio_pago text,importe_pagado numeric,importe_esperado numeric,pagado boolean);
 create table corporativos_eventos(id uuid primary key,fecha date,empresa text,importe numeric,estado text);create table corporativos_pagos(id uuid primary key,evento_id uuid,fecha date,metodo text,importe numeric);
 create table planner_actividades(id uuid primary key,fecha date,titulo text);create table torneos(id uuid primary key,datos jsonb);`);
 await db.exec(fs.readFileSync(__dirname+'/finanzas-privadas.sql','utf8'));
 await db.query('insert into auth.users values($1),($2)',[id(1),id(2)]);
 await db.query("insert into alumnos values($1,'Cliente')",[id(3)]);await db.query("insert into profesores values($1,'Profesor',0)",[id(4)]);
 await db.query("insert into pagos values($1,$2,$3,'Mensual','2026-11-02','Efectivo',1000)",[id(10),id(3),id(4)]);
 await db.query("insert into canchas_abiertas values($1,'2026-10-30','Mixta','8va','Cancelada','Coord',50,false,100)",[id(20)]);
 await db.query("insert into cancha_abierta_jugadores values($1,$2,'Jugador','2026-11-01','Transferencia',300,300,true)",[id(21),id(20)]);
 await db.query("insert into canchas_abiertas values($1,'2026-11-04','Mixta','7ma','Activa','Coord',50,false,100)",[id(22)]);
 await db.query("insert into cancha_abierta_jugadores values($1,$2,'Pendiente',null,null,null,200,false)",[id(23),id(22)]);
 await db.query("insert into corporativos_eventos values($1,'2026-11-06','Empresa',900,'Abierto')",[id(30)]);await db.query("insert into corporativos_pagos values($1,$2,'2026-11-01','Efectivo',500)",[id(31),id(30)]);
 await db.query("insert into planner_actividades values($1,'2026-11-08','Torneo')",[id(40)]);
 await db.query('insert into torneos values($1,$2)',[id(40),JSON.stringify({costo_cancha:100,coordinador_importe:20,parejas:[{estado:'Cancelada',jugadores:[{id:'j1',nombre:'Torneo cobrado',fecha:'2026-11-02',cobrado:100,importe:100,medio:'Efectivo'}]}]})]);
 await db.exec('set role anon');await assert.rejects(db.query("select public.hub_finanzas_panel('2026-11-01')"),/permission denied/);
 await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(2)]);
 await assert.rejects(db.query("select public.hub_finanzas_panel('2026-11-01')"),/exclusivo/);
 await assert.rejects(db.query('select * from point_logros.finanzas_gastos'),/permission denied/);
 await assert.rejects(db.query('select * from point_logros.finanzas_cobros'),/permission denied/);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(1)]);
 const panel=async()=> (await db.query("select public.hub_finanzas_panel('2026-11-01') data")).rows[0].data;
 let p=await panel();assert.equal(p.cobros.length,4);assert.equal(p.cobros.reduce((s,x)=>s+Number(x.importe),0),1900);assert.equal(p.pendientes.reduce((s,x)=>s+Number(x.importe),0),600);assert.equal(p.costos.reduce((s,x)=>s+Number(x.importe),0),270);assert.equal(p.costos.find(x=>x.programa==='Clases'),undefined,'El 0% no debe convertirse en 50%');
 const save=()=>db.query("select public.hub_finanzas_guardar_gasto($1,'2026-11-03','Servicios','Electricidad',150.25,'Transferencia')",[id(50)]);
 await save();await save();p=await panel();assert.equal(p.gastos.length,1);assert.equal(Number(p.gastos[0].importe),150.25);
 await db.query('select public.hub_finanzas_anular_gasto($1,$2)',[id(50),'Comprobante duplicado']);p=await panel();assert.ok(p.gastos[0].anulado_en);assert.equal(p.gastos[0].motivo_anulacion,'Comprobante duplicado');
 await assert.rejects(db.query("select public.hub_finanzas_guardar_gasto($1,'2026-11-03','Servicios','Importe inválido',1.234,'Efectivo')",[id(51)]),/inválido/);
 }finally{await db.close();}
});
