begin isolation level repeatable read;
create temporary table enlaces_control_previo on commit drop as select jsonb_build_object('clases',(select md5(coalesce(jsonb_agg(to_jsonb(c) order by id)::text,'null')) from public.clases c),'pagos',(select md5(coalesce(jsonb_agg(to_jsonb(p) order by id)::text,'null')) from public.pagos p),'liquidaciones',(select md5(coalesce(jsonb_agg(to_jsonb(l) order by id)::text,'null')) from public.liquidaciones_profesores l),'recuperaciones',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by id)::text,'null')) from public.recuperaciones r)) huella;
-- Disponibilidad central por profesor; después de recuperaciones-enlaces.sql.

create table public.recuperaciones_agendas_profesor(
 profesor_id uuid primary key references public.profesores(id),
 enlace uuid not null unique default gen_random_uuid(), revision integer not null default 1
);
create table public.recuperaciones_horarios_profesor(
 id uuid primary key default gen_random_uuid(),
 profesor_id uuid not null references public.recuperaciones_agendas_profesor(profesor_id),
 fecha date not null,inicio time not null,cancha integer not null check(cancha between 1 and 3),
 activo boolean not null default true,
 recuperacion_id uuid unique references public.recuperaciones(id),
 unique(profesor_id,fecha,inicio,cancha),check(inicio<time '23:00')
);
alter table public.recuperaciones_enlaces add column agenda_profesor uuid references public.recuperaciones_agendas_profesor(enlace);
alter table public.recuperaciones_agendas_profesor enable row level security;
alter table public.recuperaciones_horarios_profesor enable row level security;
revoke all on public.recuperaciones_agendas_profesor,public.recuperaciones_horarios_profesor from public,anon,authenticated;

create function public.recuperacion_profesor_libre(p_profesor uuid,p_fecha date,p_inicio time,p_cancha integer)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select p_fecha is not null and p_inicio is not null and p_inicio<time '23:00' and p_cancha between 1 and 3
 and p_fecha+p_inicio>timezone('America/Argentina/Buenos_Aires',now())
 and not exists(select 1 from public.planner_agenda a where a.fecha=p_fecha and a.estado not in ('Cancelada','Cancelado')
 and (a.canchas is null or p_cancha=any(a.canchas)) and (a.fin is null or (a.inicio<(p_inicio+interval '1 hour')::time and a.fin>p_inicio)))
 and not exists(select 1 from public.clases c where c.profesor_id=p_profesor and c.fecha=p_fecha and c.estado not in ('Cancelada','Cancelado','Canceló')
 and c.hora<(p_inicio+interval '1 hour')::time and (c.hora+interval '1 hour')::time>p_inicio)
 and not exists(select 1 from public.recuperaciones r join public.planner_actividades a on a.id=r.actividad_id
 join public.recuperaciones_participantes p on p.recuperacion_id=r.id where a.fecha=p_fecha
 and (p.original->>'profesor_id')::uuid=p_profesor and a.inicio<(p_inicio+interval '1 hour')::time and a.fin>p_inicio)
$$;
revoke all on function public.recuperacion_profesor_libre(uuid,date,time,integer) from public,anon,authenticated;

create function public.recuperacion_profesor_administrar(p_profesor uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.recuperaciones_agendas_profesor; opciones jsonb;
begin
 if not exists(select 1 from public.recuperaciones_autorizadores where usuario_id=auth.uid()) then raise exception 'Ingresá con la cuenta del coordinador habilitado'; end if;
 perform pg_advisory_xact_lock(71903142);
 insert into public.recuperaciones_agendas_profesor(profesor_id) values(p_profesor) on conflict do nothing;
 select * into a from public.recuperaciones_agendas_profesor where profesor_id=p_profesor;
 select coalesce(jsonb_agg(jsonb_build_object('fecha',h.fecha,'inicio',h.inicio,'cancha',h.cancha) order by h.fecha,h.inicio,h.cancha),'[]') into opciones
 from public.recuperaciones_horarios_profesor h where h.profesor_id=p_profesor and h.activo and h.recuperacion_id is null
 and public.recuperacion_profesor_libre(p_profesor,h.fecha,h.inicio,h.cancha);
 return jsonb_build_object('enlace',a.enlace,'revision',a.revision,'opciones',opciones);
end $$;

create function public.recuperacion_profesor_guardar(p_profesor uuid,p_revision integer,p_opciones jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.recuperaciones_agendas_profesor; o jsonb; d date; h time; c integer; vistos jsonb:='[]';
begin
 if not exists(select 1 from public.recuperaciones_autorizadores where usuario_id=auth.uid()) then raise exception 'Ingresá con la cuenta del coordinador habilitado'; end if;
 perform pg_advisory_xact_lock(71903142);
 select * into a from public.recuperaciones_agendas_profesor where profesor_id=p_profesor for update;
 if not found or a.revision<>p_revision then raise exception 'Los horarios cambiaron. Volvé a cargar'; end if;
 if p_opciones is null or jsonb_typeof(p_opciones)<>'array' or jsonb_array_length(p_opciones)>100 then raise exception 'Habilitá hasta 100 horarios'; end if;
 update public.recuperaciones_horarios_profesor set activo=false where profesor_id=p_profesor and recuperacion_id is null;
 for o in select value from jsonb_array_elements(p_opciones) loop
 d:=(o->>'fecha')::date;h:=(o->>'inicio')::time;c:=(o->>'cancha')::integer;
 if not coalesce(public.recuperacion_profesor_libre(p_profesor,d,h,c),false) then raise exception 'Horario no disponible: % % · cancha %',d,h,c; end if;
 o:=jsonb_build_object('fecha',d,'inicio',h,'cancha',c);
 if vistos @> jsonb_build_array(o) then raise exception 'Hay horarios repetidos'; end if;
 if exists(select 1 from jsonb_array_elements(vistos) v where (v->>'fecha')::date=d and (v->>'inicio')::time<(h+interval '1 hour')::time and ((v->>'inicio')::time+interval '1 hour')::time>h) then raise exception 'Horarios del profesor superpuestos';end if;
 vistos:=vistos||jsonb_build_array(o);
 if exists(select 1 from public.recuperaciones_horarios_profesor where profesor_id=p_profesor and fecha=d and inicio=h and cancha=c and recuperacion_id is not null) then raise exception 'Ese turno ya fue utilizado'; end if;
 insert into public.recuperaciones_horarios_profesor(profesor_id,fecha,inicio,cancha) values(p_profesor,d,h,c)
 on conflict(profesor_id,fecha,inicio,cancha) do update set activo=true;
 end loop;
 update public.recuperaciones_agendas_profesor set revision=revision+1 where profesor_id=p_profesor;
 return public.recuperacion_profesor_administrar(p_profesor);
end $$;

create function public.recuperacion_profesor_enlace(p_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.recuperaciones; prof uuid; a public.recuperaciones_agendas_profesor; e public.recuperaciones_enlaces;
begin
 if not exists(select 1 from public.recuperaciones_autorizadores where usuario_id=auth.uid()) then raise exception 'Ingresá con la cuenta del coordinador habilitado'; end if;
 perform pg_advisory_xact_lock(71903142);
 select * into r from public.recuperaciones where id=p_id for update;
 if not found or r.actividad_id is not null or r.realizada then raise exception 'La recuperación ya no está pendiente'; end if;
 if (select count(distinct original->>'profesor_id') from public.recuperaciones_participantes where recuperacion_id=p_id)<>1
 or exists(select 1 from public.recuperaciones_participantes where recuperacion_id=p_id and original->>'profesor_id' is null) then raise exception 'Revisá el profesor de la recuperación'; end if;
 select (original->>'profesor_id')::uuid into prof from public.recuperaciones_participantes where recuperacion_id=p_id limit 1;
 insert into public.recuperaciones_agendas_profesor(profesor_id) values(prof) on conflict do nothing;
 select * into a from public.recuperaciones_agendas_profesor where profesor_id=prof;
 select * into e from public.recuperaciones_enlaces where recuperacion_id=p_id;
 if not found then
 insert into public.recuperaciones_enlaces(recuperacion_id,vence_en,opciones,agenda_profesor) values(p_id,now()+interval '14 days','[]',a.enlace) returning * into e;
 else
 update public.recuperaciones_enlaces set agenda_profesor=a.enlace,
 token=case when vence_en<=now() then gen_random_uuid() else token end,
 vence_en=case when vence_en<=now() then now()+interval '14 days' else vence_en end
 where recuperacion_id=p_id returning * into e;
 end if;
 return jsonb_build_object('enlace',a.enlace,'token',e.token,'vence_en',e.vence_en);
end $$;

create function public.recuperacion_profesor_ver(p_agenda uuid,p_token uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.recuperaciones_agendas_profesor; e public.recuperaciones_enlaces; r public.recuperaciones; opciones jsonb; result jsonb;
begin
 select * into a from public.recuperaciones_agendas_profesor where enlace=p_agenda;
 if not found then raise exception 'Enlace del profesor inválido'; end if;
 if p_token is not null then
 select * into e from public.recuperaciones_enlaces where token=p_token and agenda_profesor=p_agenda;
 if not found or e.vence_en<=now() then raise exception 'Enlace de recuperación vencido o inválido. Pedí uno nuevo al coordinador'; end if;
 select * into r from public.recuperaciones where id=e.recuperacion_id;
 if r.actividad_id is not null then return public.recuperacion_enlace_ver(p_token); end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('opcion',h.id,'fecha',h.fecha,'inicio',h.inicio,'cancha',h.cancha) order by h.fecha,h.inicio,h.cancha),'[]') into opciones
 from public.recuperaciones_horarios_profesor h where h.profesor_id=a.profesor_id and h.activo and h.recuperacion_id is null
 and public.recuperacion_profesor_libre(a.profesor_id,h.fecha,h.inicio,h.cancha)
 and (p_token is null or public.recuperacion_opcion_libre(r.id,h.fecha,h.inicio,h.cancha));
 result:=jsonb_build_object('estado','pendiente','solo_consulta',p_token is null,'profesor',(select nombre from public.profesores where id=a.profesor_id),'opciones',opciones);
 if p_token is not null then result:=result||jsonb_build_object('grupo_completo',r.motivo='lluvia',
 'participantes',(select count(*) from public.recuperaciones_participantes where recuperacion_id=r.id),
 'suspension',(select min((original->>'fecha')::date) from public.recuperaciones_participantes where recuperacion_id=r.id));end if;
 return result;
end $$;

create function public.recuperacion_profesor_reservar(p_agenda uuid,p_token uuid,p_horario uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.recuperaciones_agendas_profesor; e public.recuperaciones_enlaces; r public.recuperaciones; h public.recuperaciones_horarios_profesor;
begin
 perform pg_advisory_xact_lock(71903142);
 select * into a from public.recuperaciones_agendas_profesor where enlace=p_agenda for update;
 if not found then raise exception 'Enlace del profesor inválido'; end if;
 select * into e from public.recuperaciones_enlaces where token=p_token and agenda_profesor=p_agenda for update;
 if not found or e.vence_en<=now() then raise exception 'Enlace de recuperación vencido o inválido'; end if;
 select * into r from public.recuperaciones where id=e.recuperacion_id for update;
 if r.actividad_id is not null then return public.recuperacion_enlace_ver(p_token);end if;
 select * into h from public.recuperaciones_horarios_profesor where id=p_horario and profesor_id=a.profesor_id for update;
 if not found or not h.activo or h.recuperacion_id is not null then raise exception 'Ese horario ya no está disponible. Actualizá las opciones';end if;
 if not coalesce(public.recuperacion_profesor_libre(a.profesor_id,h.fecha,h.inicio,h.cancha),false)
 or not coalesce(public.recuperacion_opcion_libre(r.id,h.fecha,h.inicio,h.cancha),false) then raise exception 'Ese horario ya no está disponible. Actualizá las opciones';end if;
 perform public.recuperacion_programar(r.id,r.revision,h.fecha,h.inicio,h.cancha);
 update public.recuperaciones_horarios_profesor set recuperacion_id=r.id,activo=false where id=h.id;
 update public.recuperaciones_agendas_profesor set revision=revision+1 where profesor_id=a.profesor_id;
 return public.recuperacion_enlace_ver(p_token);
end $$;
revoke all on function public.recuperacion_profesor_administrar(uuid),public.recuperacion_profesor_guardar(uuid,integer,jsonb),public.recuperacion_profesor_enlace(uuid),public.recuperacion_profesor_ver(uuid,uuid),public.recuperacion_profesor_reservar(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.recuperacion_profesor_administrar(uuid),public.recuperacion_profesor_guardar(uuid,integer,jsonb),public.recuperacion_profesor_enlace(uuid) to authenticated;
grant execute on function public.recuperacion_profesor_ver(uuid,uuid),public.recuperacion_profesor_reservar(uuid,uuid,uuid) to anon,authenticated;


do $$ declare actual jsonb; previo jsonb; begin select jsonb_build_object('clases',(select md5(coalesce(jsonb_agg(to_jsonb(c) order by id)::text,'null')) from public.clases c),'pagos',(select md5(coalesce(jsonb_agg(to_jsonb(p) order by id)::text,'null')) from public.pagos p),'liquidaciones',(select md5(coalesce(jsonb_agg(to_jsonb(l) order by id)::text,'null')) from public.liquidaciones_profesores l),'recuperaciones',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by id)::text,'null')) from public.recuperaciones r)) into actual; select huella into previo from enlaces_control_previo; if actual is distinct from previo then raise exception 'Cambió un registro existente; se revierte'; end if; end $$;
commit;
select 'Disponibilidad por profesor instalada. Registros existentes conservados.' resultado;
