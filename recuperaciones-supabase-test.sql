-- Exclusivamente rama temporal ynmetzcngrohjlesxwhj. Datos ficticios.
begin;
create table public.recuperaciones_prueba_resultados (prueba text,resultado text);
do $$
declare
 t uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
 c uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid(); c3 uuid:=gen_random_uuid();
 g uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); ri uuid:=gen_random_uuid();
 u uuid:=gen_random_uuid(); before_data jsonb; after_data jsonb; old_count integer;
begin
 insert into public.profesores(id,nombre) values(t,'PRUEBA RECUPERACION - profesor ficticio');
 insert into public.alumnos(id,nombre) values(a,'PRUEBA RECUPERACION A'),(b,'PRUEBA RECUPERACION B');
 insert into public.clases(id,alumno_id,profesor_id,grupo_id,fecha,hora,estado,importe_esperado)
 values(c,a,t,g,'2026-10-01','10:00','Pendiente',100),
 (c2,b,t,g,'2026-10-01','10:00','Pendiente',200),
 (c3,a,t,null,'2026-10-02','12:00','Ausente',100);
 set constraints all immediate;
 insert into public.pagos(alumno_id,profesor_id,clase_id,tipo_pago,fecha_cobro,importe,medio_pago)
 values(a,t,c,'Por clase','2026-10-01',100,'Efectivo');
 insert into public.liquidaciones_profesores(profesor_id,mes,total_ingresos,porcentaje,total_a_liquidar)
 values(t,'2026-10-01',100,50,50);
 select jsonb_build_object('clases',(select jsonb_agg(x order by id) from public.clases x),
 'pagos',(select jsonb_agg(x order by id) from public.pagos x),
 'liquidaciones',(select jsonb_agg(x order by id) from public.liquidaciones_profesores x)) into before_data;
 execute 'set local role anon';
 perform public.recuperacion_crear(r,c,'lluvia','Lluvia ficticia de prueba');
 perform public.recuperacion_crear(r,c,'lluvia','Lluvia ficticia de prueba');
 if (select count(*) from public.recuperaciones_participantes where recuperacion_id=r)<>2 then raise exception 'No incluyó grupo completo'; end if;
 if (select actividad_id from public.recuperaciones where id=r) is not null then raise exception 'No quedó pendiente'; end if;
 begin
   perform public.recuperacion_crear(gen_random_uuid(),c2,'lluvia','Duplicada');
   raise exception using errcode='ZX001',message='Aceptó crédito duplicado';
 exception when sqlstate 'ZX001' then raise; when others then
   if sqlerrm not like '%ya tiene%' then raise; end if;
 end;
 begin
   perform public.recuperacion_crear(ri,c3,'individual','Sin permiso');
   raise exception using errcode='ZX001',message='Aceptó individual sin permiso';
 exception when sqlstate 'ZX001' then raise; when others then
   if sqlerrm not like '%usuario autorizado%' then raise; end if;
 end;
 execute 'reset role';
 insert into public.recuperaciones_prueba_resultados values('Grupo completo, pendiente, reintento y duplicado','OK'),('Individual anónima rechazada','OK');
 insert into auth.users(id,email,aud,role) values(u,'recuperacion-prueba@example.invalid','authenticated','authenticated');
 insert into public.recuperaciones_autorizadores values(u);
 perform set_config('request.jwt.claim.sub',u::text,true);
 execute 'set local role authenticated';
 if auth.uid() is distinct from u then raise exception 'Identidad Auth no coincide'; end if;
 perform public.recuperacion_crear(ri,c3,'individual','Usuario ficticio habilitado');
 execute 'reset role';
 if (select autorizado_por from public.recuperaciones where id=ri) is distinct from u then raise exception 'No registró autorizador'; end if;
 insert into public.recuperaciones_prueba_resultados values('Identidad auth.uid habilitada y registrada (contexto SQL)','OK');
 execute 'set local role anon';
 perform public.recuperacion_programar(r,1,'2026-10-10','10:00',1);
 perform public.recuperacion_programar(r,1,'2026-10-10','10:00',1);
 begin
   perform public.recuperacion_programar(ri,1,'2026-10-10','10:00',1);
   raise exception using errcode='ZX001',message='Aceptó cancha ocupada';
 exception when sqlstate 'ZX001' then raise; when others then
   if sqlerrm not like '%Solapamiento%' then raise; end if;
 end;
 begin
   perform public.recuperacion_programar(r,1,'2026-10-11','11:00',2);
   raise exception using errcode='ZX001',message='Aceptó revisión vieja';
 exception when sqlstate 'ZX001' then raise; when others then
   if sqlerrm not like '%cambió%' then raise; end if;
 end;
 perform public.recuperacion_programar(r,2,'2026-10-11','11:00',2);
 if (select actividad_id from public.recuperaciones where id=r)<>r or
    (select count(*) from public.planner_actividades where id=r)<>1 then raise exception 'Duplicó reserva'; end if;
 begin
   update public.planner_actividades set titulo='Cambio directo' where id=r;
   raise exception using errcode='ZX001',message='Aceptó edición directa';
 exception when sqlstate 'ZX001' then raise; when others then
   if sqlerrm not like '%Recuperar clase%' then raise; end if;
 end;
 perform public.recuperacion_realizar(r,3);
 perform public.recuperacion_realizar(r,3);
 if not (select realizada from public.recuperaciones where id=r) then raise exception 'No finalizó'; end if;
 execute 'reset role';
 insert into public.recuperaciones_prueba_resultados values('Programación, reprogramación e idempotencia','OK'),('Solapamiento y revisión vieja rechazados','OK'),('Edición genérica bloqueada y finalización','OK');
 select jsonb_build_object('clases',(select jsonb_agg(x order by id) from public.clases x),
 'pagos',(select jsonb_agg(x order by id) from public.pagos x),
 'liquidaciones',(select jsonb_agg(x order by id) from public.liquidaciones_profesores x)) into after_data;
 if before_data is distinct from after_data then raise exception 'Se modificaron clases o datos financieros'; end if;
 insert into public.recuperaciones_prueba_resultados values('Clases, cobro y liquidación idénticos antes/después','OK');
end $$;
commit;
select * from public.recuperaciones_prueba_resultados;
