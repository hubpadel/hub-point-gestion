-- Aditivo: una actividad del Planner, una ficha de partido. No escribe en pagos.
begin;
alter table public.planner_actividades drop constraint planner_actividades_tipo_check;
alter table public.planner_actividades add constraint planner_actividades_tipo_check check(tipo in ('torneos','alquileres','recuperaciones','lluvia','partidos'));
alter table public.planner_actividades add constraint partidos_horario check(tipo<>'partidos' or (inicio>=time '08:00' and inicio<time '24:00' and fin<=time '24:00' and cardinality(canchas)=1 and extract(epoch from inicio)::integer%900=0 and extract(epoch from fin)::integer%900=0));

create table public.partidos (
 id uuid primary key references public.planner_actividades(id),
 revision integer not null default 1,
 creado_en timestamptz not null default now(),
 datos jsonb not null
);
alter table public.partidos enable row level security;
revoke all on public.partidos from public,anon,authenticated;
-- Audiencia verificada: la misma que planner_actividades y Canchas Abiertas.
grant select,insert,update on public.partidos to anon,authenticated;
create policy partidos_lectura on public.partidos for select to anon,authenticated using(true);
create policy partidos_alta on public.partidos for insert to anon,authenticated with check(true);
create policy partidos_edicion on public.partidos for update to anon,authenticated using(true) with check(true);

create function public.partidos_validar() returns trigger language plpgsql security invoker
set search_path=public,pg_temp as $$
declare pareja jsonb; jugador jsonb; previo jsonb; ids text[]:='{}'; nombres text[]:='{}'; clave text; importe numeric; cobrado numeric;
begin
 if not exists(select 1 from public.planner_actividades where id=new.id and tipo='partidos') then raise exception 'La actividad debe ser un partido'; end if;
 if jsonb_typeof(new.datos->'parejas') is distinct from 'array' then raise exception 'Inscribí parejas de dos jugadores'; end if;
 if (select count(*) from jsonb_array_elements(new.datos->'parejas') p where p->>'estado'='Inscripta')>2 then raise exception 'El partido admite dos parejas activas (cuatro jugadores)'; end if;
 if coalesce(new.datos->>'tipo','') not in ('Femenina','Masculina','Mixta') or length(trim(coalesce(new.datos->>'categoria','')))=0 then raise exception 'Completá tipo y categoría'; end if;
 foreach clave in array array['precio','costo_cancha','coordinador_importe'] loop
  if jsonb_typeof(new.datos->clave) is distinct from 'number' or (new.datos->>clave)::numeric<0 or (new.datos->>clave)::numeric>999999999 or round((new.datos->>clave)::numeric,2)<>(new.datos->>clave)::numeric then raise exception 'Importe inválido'; end if;
 end loop;
 for pareja in select value from jsonb_array_elements(new.datos->'parejas') loop
  if coalesce(pareja->>'id','')='' or pareja->>'id'=any(ids) then raise exception 'Identificador repetido'; end if;
  ids:=array_append(ids,pareja->>'id');
  if coalesce(pareja->>'estado','') not in ('Inscripta','Cancelada') or jsonb_typeof(pareja->'jugadores') is distinct from 'array' or jsonb_array_length(pareja->'jugadores')<>2 then raise exception 'Cada pareja debe tener dos jugadores'; end if;
  for jugador in select value from jsonb_array_elements(pareja->'jugadores') loop
   clave:=lower(regexp_replace(trim(coalesce(jugador->>'nombre','')),'\s+',' ','g'));
   if clave='' or coalesce(jugador->>'id','')='' or jugador->>'id'=any(ids) then raise exception 'Completá los dos jugadores con identificadores únicos'; end if;
   if pareja->>'estado'='Inscripta' and clave=any(nombres) then raise exception 'No repitas jugadores en el partido'; end if;
   if pareja->>'estado'='Inscripta' then nombres:=array_append(nombres,clave); end if;
   ids:=array_append(ids,jugador->>'id');
   if coalesce(jugador->>'presencia','') not in ('Pendiente','Presente','Ausente') then raise exception 'Asistencia inválida'; end if;
   if jsonb_typeof(jugador->'importe') is distinct from 'number' or jsonb_typeof(jugador->'cobrado') is distinct from 'number' then raise exception 'Importe inválido'; end if;
   importe:=(jugador->>'importe')::numeric; cobrado:=(jugador->>'cobrado')::numeric;
   if importe<0 or importe>999999999 or cobrado<0 or cobrado>importe or round(importe,2)<>importe or round(cobrado,2)<>cobrado then raise exception 'El cobro debe estar entre cero y el importe individual'; end if;
   if cobrado>0 and cobrado<>importe then raise exception 'Registrá cero o el pago completo del jugador'; end if;
   if cobrado>0 and (coalesce(jugador->>'medio','') not in ('Efectivo','Transferencia') or coalesce(jugador->>'fecha','')='' ) then raise exception 'Completá medio y fecha de cobro'; end if;
   if cobrado>0 then perform (jugador->>'fecha')::date; end if;
  end loop;
 end loop;
 if tg_op='UPDATE' then
  if new.id<>old.id then raise exception 'No se puede cambiar el partido'; end if;
  for previo in select j.value from jsonb_array_elements(old.datos->'parejas') p cross join lateral jsonb_array_elements(p.value->'jugadores') j where (j.value->>'cobrado')::numeric>0 loop
   if not exists(select 1 from jsonb_array_elements(new.datos->'parejas') p cross join lateral jsonb_array_elements(p.value->'jugadores') j where j.value->>'id'=previo->>'id') then raise exception 'Conservá los jugadores con cobros. Cancelá su pareja para mantener el historial'; end if;
  end loop;
  new.revision:=old.revision+1;
 end if;
 return new;
end $$;
create trigger partidos_validar before insert or update on public.partidos for each row execute function public.partidos_validar();

create function public.partidos_guardar(p_id uuid,p_revision integer,p_version jsonb,p_actividad jsonb,p_datos jsonb)
returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare actual public.partidos; actividad jsonb; resultado integer;
begin
 perform pg_advisory_xact_lock(71903142);
 select * into actual from public.partidos where id=p_id for update;
 select to_jsonb(a) into actividad from public.planner_actividades a where id=p_id;
 if actual.id is not null and actual.datos=p_datos and actividad @> (p_actividad || jsonb_build_object('inicio',(p_actividad->>'inicio')::time,'fin',(p_actividad->>'fin')::time)) then return actual.revision; end if;
 if (actual.id is null and p_revision is not null) or (actual.id is not null and actual.revision is distinct from p_revision) then raise exception 'El partido cambió. Volvé a abrirlo antes de guardar'; end if;
 if jsonb_array_length(p_actividad->'canchas')<>1 or (p_actividad->>'inicio')::time<time '08:00' or (p_actividad->>'fin')::time>(time '24:00') then raise exception 'Elegí una cancha y horario entre las 08:00 y las 00:00'; end if;
 if p_actividad->>'tipo' is distinct from 'partidos' then raise exception 'Tipo de actividad inválido'; end if;
 perform public.planner_guardar('planner_actividades',p_id,p_version,p_actividad);
 if actual.id is null then
  insert into public.partidos(id,datos) values(p_id,p_datos) returning revision into resultado;
 else
  update public.partidos set datos=p_datos where id=p_id returning revision into resultado;
 end if;
 return resultado;
end $$;
revoke all on function public.partidos_validar(),public.partidos_guardar(uuid,integer,jsonb,jsonb,jsonb) from public;
grant execute on function public.partidos_validar(),public.partidos_guardar(uuid,integer,jsonb,jsonb,jsonb) to anon,authenticated;
commit;

