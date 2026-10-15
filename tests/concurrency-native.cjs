const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const assert=require('node:assert/strict');const {execFileSync}=require('node:child_process');const {pathToFileURL}=require('node:url');const {Client}=require('pg');
const base=path.resolve(__dirname,'..');
fs.mkdirSync(path.join(base,'test-runtime'),{recursive:true});
(async()=>{
 const binaries=await import(pathToFileURL(path.join(base,'node_modules/@embedded-postgres/windows-x64/dist/index.js')).href);
 for(const entry of fs.readdirSync(path.join(base,'test-runtime'))){if(entry.startsWith('cluster-')){const previous=path.join(base,'test-runtime',entry);if(fs.existsSync(path.join(previous,'postmaster.pid'))){let running=false;try{execFileSync(binaries.pg_ctl,['-D',previous,'status'],{windowsHide:true,stdio:'ignore'});running=true;}catch{}if(running)execFileSync(binaries.pg_ctl,['-D',previous,'-w','stop'],{windowsHide:true,stdio:'ignore'});}}}
 const data=path.join(base,'test-runtime','cluster-'+Date.now()),pwfile=path.join(base,'test-runtime','test-password-'+Date.now());const password=crypto.randomBytes(24).toString('hex');const port=55439;
 fs.writeFileSync(pwfile,password);let started=false;const clients=[];const results=[];
 try{
  execFileSync(binaries.initdb,['-D',data,'-U','point_test','-A','scram-sha-256','--pwfile='+pwfile,'--encoding=UTF8','--locale=C'],{windowsHide:true,stdio:'pipe'});fs.unlinkSync(pwfile);
  execFileSync(binaries.pg_ctl,['-D',data,'-l',path.join(data,'server.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start'],{windowsHide:true,stdio:'ignore'});started=true;console.log('PostgreSQL local iniciado.');
  for(const name of ['point_test_a','point_test_b','point_test_observer']){const c=new Client({host:'127.0.0.1',port,user:'point_test',password,database:'postgres',application_name:name});await c.connect();clients.push(c);}
  const [a,b,c]=clients;await a.query('create role anon;create role authenticated;');await a.query(fs.readFileSync(path.join(base,'candidate/corporativos.sql'),'utf8'));await a.query(fs.readFileSync(path.join(base,'candidate/corporativos-access.sql'),'utf8'));
  await a.query(fs.readFileSync(path.join(base,'tests/database.sql'),'utf8'));
  const version=(await c.query('select version() as version')).rows[0].version;
  const event=async()=> (await c.query("insert into public.corporativos_eventos(empresa,contacto,fecha,inicio,fin,canchas,participantes,presupuesto,importe,estado) values('Prueba','Contacto',current_date,'10:00','12:00','1',16,'Prueba',100,'Confirmado') returning id")).rows[0].id;
  const payment=(client,id,ev,amount)=>client.query("select public.corporativos_confirmar_pago($1,$2,$3,current_date,'Transferencia','PRUEBA')",[id,ev,amount]);
  const blocked=async()=>{for(let i=0;i<100;i++){const row=(await c.query("select wait_event_type from pg_stat_activity where application_name='point_test_b'")).rows[0];if(row?.wait_event_type==='Lock')return;await new Promise(r=>setTimeout(r,20));}throw Error('La segunda conexión no esperó el bloqueo');};
  // A cobra 60; B intenta otros 60 al mismo tiempo.
  let ev=await event();await a.query('begin');await payment(a,crypto.randomUUID(),ev,60);let pending=payment(b,crypto.randomUUID(),ev,60).then(data=>({data}),error=>({error}));await blocked();await a.query('commit');let outcome=await pending;assert.match(outcome.error?.message||'',/supera el saldo/);assert.equal((await c.query('select sum(importe)::text as total from public.corporativos_pagos where evento_id=$1',[ev])).rows[0].total,'60.00');results.push('Dos cobros simultáneos: uno rechazado por sobrepago');
  // Ambas conexiones reintentan el mismo pago.
  ev=await event();const id=crypto.randomUUID();await a.query('begin');await payment(a,id,ev,60);pending=payment(b,id,ev,60).then(data=>({data}),error=>({error}));await blocked();await a.query('commit');outcome=await pending;assert.ok(!outcome.error);assert.equal((await c.query('select count(*)::int as n from public.corporativos_pagos where evento_id=$1',[ev])).rows[0].n,1);results.push('Mismo pago simultáneo: una única fila');
  // Reducción de presupuesto que espera un cobro.
  ev=await event();await a.query('begin');await payment(a,crypto.randomUUID(),ev,60);pending=b.query('update public.corporativos_eventos set importe=50 where id=$1',[ev]).then(data=>({data}),error=>({error}));await blocked();await a.query('commit');outcome=await pending;assert.match(outcome.error?.message||'',/menor a lo cobrado/);results.push('Reducción de presupuesto concurrente rechazada');
  // Cobro que espera una reducción de presupuesto.
  ev=await event();await a.query('begin');await a.query('update public.corporativos_eventos set importe=50 where id=$1',[ev]);pending=payment(b,crypto.randomUUID(),ev,60).then(data=>({data}),error=>({error}));await blocked();await a.query('commit');outcome=await pending;assert.match(outcome.error?.message||'',/supera el saldo/);results.push('Cobro concurrente respeta presupuesto reducido');
  fs.mkdirSync(path.join(base,'reports'),{recursive:true});fs.writeFileSync(path.join(base,'reports/concurrency-result.json'),JSON.stringify({ok:true,version,results,environment:'PostgreSQL local con tres conexiones independientes; sin conexión a producción'},null,2));console.log(JSON.stringify({ok:true,results}));
 }finally{for(const c of clients){await c.query('rollback').catch(()=>{});await c.end().catch(()=>{});}if(started)execFileSync(binaries.pg_ctl,['-D',data,'-w','stop'],{windowsHide:true,stdio:'ignore'});if(fs.existsSync(pwfile))fs.unlinkSync(pwfile);}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
