-- Aplicar sólo en una copia de pruebas, después de las migraciones Planner.
begin;
create table public.recuperaciones_autorizadores (
 usuario_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.recuperaciones_autorizadores enable row level security;
create table public.recuperaciones (
 id uuid primary key,
 motivo text not null check(motivo in ('lluvia','individual')),
 observaciones text not null default '',
 autorizado_por uuid,
 creada_en timestamptz not null default now(),
 actividad_id uuid unique references public.planner_actividades(id) on delete restrict,
 realizada boolean not null default false,
 revision integer not null default 1,
 check(not realizada or actividad_id is not null)
);
create table public.recuperaciones_participantes (
 recuperacion_id uuid not null references public.recuperaciones(id) on delete restrict,
 clase_id uuid primary key references public.clases(id) on delete restrict,
 original jsonb not null
);
alter table public.recuperaciones enable row level security;
alter table public.recuperaciones_participantes enable row level security;
create policy recuperaciones_lectura on public.recuperaciones for select to anon,authenticated using(true);
create policy recuperaciones_participantes_lectura on public.recuperaciones_participantes for select to anon,authenticated using(true);
grant select on public.recuperaciones,public.recuperaciones_participantes to anon,authenticated;
revoke all on public.recuperaciones_autorizadores from public,anon,authenticated;
revoke insert,update,delete on public.recuperaciones,public.recuperaciones_participantes from public,anon,authenticated;

-- Funciones acotadas: no escriben clases, pagos ni liquidaciones. El propietario
-- debe ser el propietario administrativo confiable de las tablas nuevas.
create function public.recuperacion_crear(p_id uuid,p_clase uuid,p_motivo text,p_observaciones text default '')
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.clases; ids uuid[]; existing public.recuperaciones;
begin
 perform pg_advisory_xact_lock(71903142);
 if p_id is null or p_clase is null or p_motivo is null or p_motivo not in ('lluvia','individual') then raise exception 'Solicitud inválida'; end if;
 if p_motivo='individual' and not exists(select 1 from public.recuperaciones_autorizadores where usuario_id=auth.uid()) then
   raise exception 'La recuperación individual requiere un usuario autorizado';
 end if;
 select * into c from public.clases where id=p_clase for share;
 if not found then raise exception 'La clase original no existe'; end if;
 if p_motivo='lluvia' then
   select array_agg(id order by id) into ids from public.clases where coalesce(grupo_id,id)=coalesce(c.grupo_id,c.id) and fecha=c.fecha and hora=c.hora;
 else ids:=array[p_clase]; end if;
 select * into existing from public.recuperaciones where id=p_id;
 if found then
   if existing.motivo=p_motivo and existing.observaciones=coalesce(p_observaciones,'') and
      ids=(select array_agg(clase_id order by clase_id) from public.recuperaciones_participantes where recuperacion_id=p_id) then return p_id; end if;
   raise exception 'Identificador usado para otra solicitud';
 end if;
 if exists(select 1 from public.recuperaciones_participantes where clase_id=any(ids)) then raise exception 'Una clase ya tiene recuperación registrada'; end if;
 if exists(select 1 from public.clases where id=any(ids) and estado in ('Presente','Cancelada','Cancelado')) then raise exception 'La clase realizada o cancelada no admite recuperación'; end if;
 insert into public.recuperaciones(id,motivo,observaciones,autorizado_por) values(p_id,p_motivo,coalesce(p_observaciones,''),case when p_motivo='individual' then auth.uid() end);
 insert into public.recuperaciones_participantes select p_id,id,to_jsonb(x) from public.clases x where id=any(ids);
 return p_id;
end $$;

create function public.recuperacion_programar(p_id uuid,p_revision integer,p_fecha date,p_inicio time,p_cancha integer)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.recuperaciones; aid uuid; finish time; datos jsonb; old_version jsonb;
begin
 perform pg_advisory_xact_lock(71903142);
 select * into r from public.recuperaciones where id=p_id for update;
 if not found then raise exception 'Recuperación inexistente'; end if;
 if r.realizada then raise exception 'La recuperación ya fue realizada'; end if;
 if p_fecha is null or p_inicio is null or p_inicio>=time '23:00' or p_cancha is null or p_cancha not between 1 and 3 then raise exception 'Fecha, hora o cancha inválida'; end if;
 if exists(select 1 from public.recuperaciones_participantes where recuperacion_id=p_id and
   p_fecha+p_inicio <= (original->>'fecha')::date+(original->>'hora')::time) then raise exception 'La recuperación debe ser posterior a la clase original'; end if;
 finish:=(p_inicio+interval '1 hour')::time;
 datos:=jsonb_build_object('tipo','recuperaciones','titulo','Recuperación · '||r.motivo,'fecha',p_fecha,'inicio',p_inicio,'fin',finish,'canchas',array[p_cancha]);
 if r.revision<>p_revision then
   if exists(select 1 from public.planner_actividades where id=r.actividad_id and fecha=p_fecha and inicio=p_inicio and canchas=array[p_cancha]) then return; end if;
   raise exception 'La recuperación cambió. Actualizá';
 end if;
 aid:=coalesce(r.actividad_id,r.id);
 select to_jsonb(a) into old_version from public.planner_actividades a where id=r.actividad_id;
 perform public.planner_guardar('planner_actividades',aid,old_version,datos);
 update public.recuperaciones set actividad_id=aid,revision=revision+1 where id=p_id;
end $$;

create function public.recuperacion_realizar(p_id uuid,p_revision integer)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.recuperaciones;
begin
 perform pg_advisory_xact_lock(71903142);
 select * into r from public.recuperaciones where id=p_id for update;
 if not found then raise exception 'Recuperación inexistente'; end if;
 if r.realizada then return; end if;
 if r.revision<>p_revision then raise exception 'La recuperación cambió. Actualizá'; end if;
 if not exists(select 1 from public.planner_actividades where id=r.actividad_id and
   (fecha+fin) <= (current_timestamp at time zone 'America/Argentina/Buenos_Aires')) then raise exception 'La recuperación debe estar programada y haber finalizado'; end if;
 update public.recuperaciones set realizada=true,revision=revision+1 where id=p_id;
end $$;

-- Evita mover o convertir una recuperación vinculada desde el editor genérico.
create function public.recuperacion_proteger_actividad() returns trigger language plpgsql
set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.recuperaciones where actividad_id=old.id) and
    current_user <> pg_get_userbyid((select relowner from pg_class where oid='public.recuperaciones'::regclass)) then
   raise exception 'Editá la reserva desde Recuperar clase';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger recuperacion_proteger before update or delete on public.planner_actividades
for each row execute function public.recuperacion_proteger_actividad();
revoke all on function public.recuperacion_crear(uuid,uuid,text,text),public.recuperacion_programar(uuid,integer,date,time,integer),public.recuperacion_realizar(uuid,integer),public.recuperacion_proteger_actividad() from public;
grant execute on function public.recuperacion_crear(uuid,uuid,text,text),public.recuperacion_programar(uuid,integer,date,time,integer),public.recuperacion_realizar(uuid,integer) to anon,authenticated;
commit;
