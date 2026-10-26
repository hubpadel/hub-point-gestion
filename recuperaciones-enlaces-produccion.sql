begin isolation level repeatable read;
create temporary table enlaces_control_previo on commit drop as select jsonb_build_object('clases',(select md5(coalesce(jsonb_agg(to_jsonb(c) order by id)::text,'null')) from public.clases c),'pagos',(select md5(coalesce(jsonb_agg(to_jsonb(p) order by id)::text,'null')) from public.pagos p),'liquidaciones',(select md5(coalesce(jsonb_agg(to_jsonb(l) order by id)::text,'null')) from public.liquidaciones_profesores l),'recuperaciones',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by id)::text,'null')) from public.recuperaciones r)) huella;
-- Después de recuperaciones-asistencia.sql. No modifica clases, cobros ni liquidaciones.

create table public.recuperaciones_enlaces (
 recuperacion_id uuid primary key references public.recuperaciones(id) on delete restrict,
 token uuid not null unique default gen_random_uuid(),
 vence_en timestamptz not null,
 opciones jsonb not null check(jsonb_typeof(opciones)='array'),
 elegida integer,
 check(elegida is null or elegida between 0 and 19)
);
alter table public.recuperaciones_enlaces enable row level security;
revoke all on public.recuperaciones_enlaces from public,anon,authenticated;

-- Sólo informa disponibilidad; no devuelve datos de otras clases o alumnos.
create function public.recuperacion_opcion_libre(p_id uuid,p_fecha date,p_inicio time,p_cancha integer)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select p_fecha is not null and p_inicio is not null and p_inicio<time '23:00'
 and p_cancha between 1 and 3
 and p_fecha+p_inicio>timezone('America/Argentina/Buenos_Aires',now())
 and not exists(select 1 from public.recuperaciones_participantes p where p.recuperacion_id=p_id
   and p_fecha+p_inicio <= (p.original->>'fecha')::date+(p.original->>'hora')::time)
 and not exists(select 1 from public.planner_agenda a where a.fecha=p_fecha
   and a.estado not in ('Cancelada','Cancelado')
   and not (a.fuente='planner_actividades' and a.id=p_id)
   and (a.canchas is null or p_cancha=any(a.canchas))
   and (a.fin is null or (a.inicio<(p_inicio+interval '1 hour')::time and a.fin>p_inicio)))
 and not exists(select 1 from public.clases c where c.fecha=p_fecha
   and c.estado not in ('Cancelada','Cancelado','Canceló')
   and c.profesor_id in (select (p.original->>'profesor_id')::uuid from public.recuperaciones_participantes p where p.recuperacion_id=p_id)
   and c.hora<(p_inicio+interval '1 hour')::time and (c.hora+interval '1 hour')::time>p_inicio)
 and not exists(select 1 from public.recuperaciones r join public.planner_actividades a on a.id=r.actividad_id
   join public.recuperaciones_participantes p on p.recuperacion_id=r.id where r.id<>p_id and a.fecha=p_fecha
   and a.inicio<(p_inicio+interval '1 hour')::time and a.fin>p_inicio
   and (p.original->>'profesor_id')::uuid in
     (select (q.original->>'profesor_id')::uuid from public.recuperaciones_participantes q where q.recuperacion_id=p_id))
$$;
revoke all on function public.recuperacion_opcion_libre(uuid,date,time,integer) from public,anon,authenticated;

create function public.recuperacion_enlace_administrar(p_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.recuperaciones_enlaces;
begin
 if not exists(select 1 from public.recuperaciones_autorizadores where usuario_id=auth.uid()) then raise exception 'Ingresá con la cuenta del coordinador habilitado'; end if;
 select * into e from public.recuperaciones_enlaces where recuperacion_id=p_id;
 if not found then return null; end if;
 return jsonb_build_object('token',e.token,'opciones',e.opciones,'vence_en',e.vence_en,'activo',e.vence_en>now());
end $$;

create function public.recuperacion_enlace_guardar(p_id uuid,p_revision integer,p_opciones jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.recuperaciones; e public.recuperaciones_enlaces; o jsonb; normalizadas jsonb:='[]'; d date; h time; c integer;
begin
 if not exists(select 1 from public.recuperaciones_autorizadores where usuario_id=auth.uid()) then raise exception 'Ingresá con la cuenta del coordinador habilitado'; end if;
 perform pg_advisory_xact_lock(71903142);
 select * into r from public.recuperaciones where id=p_id for update;
 if not found or r.actividad_id is not null or r.realizada then raise exception 'La recuperación ya no está pendiente'; end if;
 if r.revision<>p_revision then raise exception 'La recuperación cambió. Actualizá'; end if;
 if p_opciones is null or jsonb_typeof(p_opciones)<>'array' then raise exception 'Indicá las opciones de horario'; end if;
 if jsonb_array_length(p_opciones)=0 then
   update public.recuperaciones_enlaces set vence_en=now() where recuperacion_id=p_id;
   return jsonb_build_object('revocado',true);
 end if;
 if jsonb_array_length(p_opciones)>20 then raise exception 'Habilitá entre 1 y 20 horarios'; end if;
 for o in select value from jsonb_array_elements(p_opciones) loop
   d:=(o->>'fecha')::date; h:=(o->>'inicio')::time; c:=(o->>'cancha')::integer;
   if not coalesce(public.recuperacion_opcion_libre(p_id,d,h,c),false) then raise exception 'Horario no disponible: % % · cancha %',d,h,c; end if;
   o:=jsonb_build_object('fecha',d,'inicio',h,'cancha',c);
   if normalizadas @> jsonb_build_array(o) then raise exception 'Hay horarios repetidos'; end if;
   normalizadas:=normalizadas||jsonb_build_array(o);
 end loop;
 insert into public.recuperaciones_enlaces(recuperacion_id,vence_en,opciones) values(p_id,now()+interval '14 days',normalizadas)
 on conflict(recuperacion_id) do update set token=gen_random_uuid(),vence_en=excluded.vence_en,opciones=excluded.opciones,elegida=null returning * into e;
 update public.recuperaciones set revision=revision+1 where id=p_id;
 return jsonb_build_object('token',e.token,'vence_en',e.vence_en,'opciones',e.opciones);
end $$;

create function public.recuperacion_enlace_ver(p_token uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.recuperaciones_enlaces; r public.recuperaciones; opciones jsonb; a public.planner_actividades;
begin
 select * into e from public.recuperaciones_enlaces where token=p_token;
 if not found or e.vence_en<=now() then raise exception 'Enlace vencido o inválido. Pedí uno nuevo al coordinador'; end if;
 select * into r from public.recuperaciones where id=e.recuperacion_id;
 if r.actividad_id is not null then
   select * into a from public.planner_actividades where id=r.actividad_id;
   return jsonb_build_object('estado','confirmada','fecha',a.fecha,'inicio',a.inicio,'cancha',a.canchas[1]);
 end if;
 select coalesce(jsonb_agg(o.value||jsonb_build_object('opcion',o.ordinality-1) order by o.ordinality),'[]') into opciones
 from jsonb_array_elements(e.opciones) with ordinality o(value,ordinality)
 where public.recuperacion_opcion_libre(r.id,(o.value->>'fecha')::date,(o.value->>'inicio')::time,(o.value->>'cancha')::integer);
 return jsonb_build_object('estado','pendiente','grupo_completo',r.motivo='lluvia',
 'participantes',(select count(*) from public.recuperaciones_participantes where recuperacion_id=r.id),
 'suspension',(select min((original->>'fecha')::date) from public.recuperaciones_participantes where recuperacion_id=r.id),
 'profesor',(select string_agg(distinct t.nombre,', ') from public.recuperaciones_participantes p join public.profesores t on t.id=(p.original->>'profesor_id')::uuid where p.recuperacion_id=r.id),
 'vence_en',e.vence_en,'opciones',opciones);
end $$;

create function public.recuperacion_enlace_reservar(p_token uuid,p_opcion integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.recuperaciones_enlaces; r public.recuperaciones; o jsonb;
begin
 perform pg_advisory_xact_lock(71903142);
 select * into e from public.recuperaciones_enlaces where token=p_token for update;
 if not found or e.vence_en<=now() then raise exception 'Enlace vencido o inválido. Pedí uno nuevo al coordinador'; end if;
 select * into r from public.recuperaciones where id=e.recuperacion_id for update;
 -- Una segunda elección nunca cambia la primera reserva; devuelve su fecha real.
 if r.actividad_id is not null then return public.recuperacion_enlace_ver(p_token); end if;
 if p_opcion is null or p_opcion<0 or p_opcion>=jsonb_array_length(e.opciones) then raise exception 'Elegí un horario habilitado'; end if;
 o:=e.opciones->p_opcion;
 if not coalesce(public.recuperacion_opcion_libre(r.id,(o->>'fecha')::date,(o->>'inicio')::time,(o->>'cancha')::integer),false) then raise exception 'Ese horario ya no está disponible. Actualizá las opciones'; end if;
 perform public.recuperacion_programar(r.id,r.revision,(o->>'fecha')::date,(o->>'inicio')::time,(o->>'cancha')::integer);
 update public.recuperaciones_enlaces set elegida=p_opcion where recuperacion_id=r.id;
 return public.recuperacion_enlace_ver(p_token);
end $$;
revoke all on function public.recuperacion_enlace_administrar(uuid),public.recuperacion_enlace_guardar(uuid,integer,jsonb),public.recuperacion_enlace_ver(uuid),public.recuperacion_enlace_reservar(uuid,integer) from public,anon,authenticated;
grant execute on function public.recuperacion_enlace_administrar(uuid),public.recuperacion_enlace_guardar(uuid,integer,jsonb) to authenticated;
grant execute on function public.recuperacion_enlace_ver(uuid),public.recuperacion_enlace_reservar(uuid,integer) to anon,authenticated;


do $$ declare actual jsonb; previo jsonb; begin select jsonb_build_object('clases',(select md5(coalesce(jsonb_agg(to_jsonb(c) order by id)::text,'null')) from public.clases c),'pagos',(select md5(coalesce(jsonb_agg(to_jsonb(p) order by id)::text,'null')) from public.pagos p),'liquidaciones',(select md5(coalesce(jsonb_agg(to_jsonb(l) order by id)::text,'null')) from public.liquidaciones_profesores l),'recuperaciones',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by id)::text,'null')) from public.recuperaciones r)) into actual; select huella into previo from enlaces_control_previo; if actual is distinct from previo then raise exception 'Cambió un registro existente; se revierte'; end if; end $$;
commit;
select 'Enlaces instalados. Registros existentes conservados.' resultado;
