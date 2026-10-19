begin;
set local statement_timeout='120s';
-- PostgreSQL 15+. Preparación local: revisar esquema y bloqueos de producción antes de aplicar.

create table public.planner_actividades (
 id uuid primary key, tipo text not null check(tipo in ('torneos','alquileres','recuperaciones','lluvia')),
 titulo text not null check(length(trim(titulo))>0), fecha date not null,
 inicio time not null, fin time not null, canchas integer[] not null,
 check(fin>inicio), check(cardinality(canchas)>0 and canchas <@ array[1,2,3])
);
-- Sólo datos ausentes en clases; fecha/hora siempre se leen de la tabla original.
create table public.planner_clases (
 clase_id uuid primary key references public.clases(id) on delete cascade,
 cancha integer not null check(cancha between 1 and 3), fin time not null
);
create index planner_grupo_clase_idx on public.clases ((coalesce(grupo_id,id)));
create index planner_fecha_clase_idx on public.clases(fecha,hora);
alter table public.planner_actividades enable row level security;
alter table public.planner_clases enable row level security;
-- Sin políticas nuevas por defecto. El despliegue debe otorgar acceso explícito
-- según los roles efectivos verificados; nunca se elude RLS en las escrituras.
create function public.planner_canchas(text) returns integer[] language sql immutable as $$
 select case when $1 ~* '^\s*(cancha\s*)?[123](\s*,\s*(cancha\s*)?[123])*\s*$'
 then array(select distinct x::integer from regexp_split_to_table(regexp_replace(lower($1),'cancha|\s','','g'),',') x order by 1)
 else null end
$$;
create view public.planner_agenda with (security_invoker=true) as
 select 'clases'::text fuente, c.id, 'clases'::text tipo,
 'Clase'::text titulo,c.fecha,c.hora::time inicio,case when c.hora<time '23:00' then (c.hora+interval '1 hour')::time else null end fin,
 case when m.cancha is null then null else array[m.cancha] end canchas,
 coalesce(c.grupo_id,c.id)::text grupo,
 coalesce(to_jsonb(c)->>'estado','') estado,
 jsonb_build_object('registro',to_jsonb(c),'plan',to_jsonb(m),'grupo',(
   select jsonb_agg(jsonb_build_object('registro',to_jsonb(g),'plan',to_jsonb(gm)) order by g.id)
   from public.clases g left join public.planner_clases gm on gm.clase_id=g.id
   where coalesce(g.grupo_id,g.id)=coalesce(c.grupo_id,c.id)
 )) version
 from public.clases c left join public.planner_clases m on m.clase_id=c.id
 union all
 select 'canchas_abiertas',o.id,'abiertas',o.tipo,o.fecha,o.hora_inicio::time,o.hora_fin::time,
 public.planner_canchas(o.cancha),o.id::text,coalesce(o.estado,''),to_jsonb(o)
 from public.canchas_abiertas o
 union all
 select 'corporativos_eventos',e.id,'corporativos',e.empresa,e.fecha,e.inicio::time,e.fin::time,
 public.planner_canchas(e.canchas),e.id::text,coalesce(e.estado,''),to_jsonb(e)
 from public.corporativos_eventos e
 union all
 select 'planner_actividades',a.id,a.tipo,a.titulo,a.fecha,a.inicio,a.fin,a.canchas,a.id::text,'',to_jsonb(a)
 from public.planner_actividades a;

create function public.planner_guardar(p_fuente text,p_id uuid,p_version jsonb,p_datos jsonb)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare anterior public.planner_agenda; other public.planner_agenda;
 d date:=(p_datos->>'fecha')::date; i time:=(p_datos->>'inicio')::time;
 f time:=(p_datos->>'fin')::time; cs integer[];
 ids uuid[]; n integer; expected integer; kind text; rec record;
begin
 -- Serializa operaciones Planner. No reemplaza los bloqueos originales.
 -- Validar concurrencia con escritores externos antes de activar en producción.
 perform pg_advisory_xact_lock(71903142);
 cs:=array(select distinct value::integer from jsonb_array_elements_text(p_datos->'canchas'));
 if d is null or i is null or f is null or f<=i or cardinality(cs)=0 or not cs<@array[1,2,3]
 then raise exception 'Completá fecha, horario y canchas válidas'; end if;
 if p_fuente not in ('clases','canchas_abiertas','corporativos_eventos','planner_actividades') then raise exception 'Origen inválido'; end if;
 if p_fuente='clases' and (i>=time '23:00' or f<>(i+interval '1 hour')::time) then
   raise exception 'Las clases duran una hora y deben finalizar dentro del día';
 end if;
 if p_version is not null then
   if p_fuente='clases' then
     perform 1 from public.clases c where coalesce(to_jsonb(c)->>'grupo_id',c.id::text)=(select grupo from public.planner_agenda where fuente='clases' and id=p_id) order by c.id for update;
   else
     execute format('select 1 from public.%I where id=$1 for update',p_fuente) using p_id;
   end if;
 end if;
 select * into anterior from public.planner_agenda where fuente=p_fuente and id=p_id;
 if p_version is not null and (anterior.id is null or anterior.version is distinct from p_version)
 then raise exception 'La actividad cambió o no tenés permiso. Actualizá el Planner'; end if;
 if p_version is null and anterior.id is not null then
   if anterior.version @> p_datos then return; end if;
   raise exception 'La operación ya existe. Actualizá el Planner';
 end if;
 if p_version is null and p_fuente<>'planner_actividades' then raise exception 'Creá esta actividad desde su módulo original'; end if;
 if anterior.estado in ('Cancelada','Cancelado') then raise exception 'La actividad está cancelada'; end if;
 kind:=case when p_fuente='planner_actividades' then p_datos->>'tipo' else anterior.tipo end;
 for other in select * from public.planner_agenda where fecha=d and estado not in ('Cancelada','Cancelado') loop
   if other.fuente=p_fuente and (other.id=p_id or (p_fuente='clases' and other.grupo=anterior.grupo)) then continue; end if;
   -- Lluvia cubre las actividades existentes sin borrarlas ni moverlas.
   if kind='lluvia' and other.tipo<>'lluvia' then continue; end if;
   if (other.canchas is null or other.canchas&&cs)
      and (other.fin is null or (i<other.fin and f>other.inicio)) then
     raise exception 'Solapamiento con % (%). Completá los datos faltantes si corresponde',other.titulo,other.fuente;
   end if;
 end loop;
 if p_fuente='clases' then
   if cardinality(cs)<>1 then raise exception 'Elegí una cancha para la clase'; end if;
   select array_agg(id) into ids from public.planner_agenda where fuente='clases' and grupo=anterior.grupo;
   expected:=cardinality(ids);
   update public.clases set fecha=d,hora=i where id=any(ids);
   get diagnostics n=row_count;
   if n<>expected then raise exception 'No tenés permiso para toda la clase'; end if;
   foreach p_id in array ids loop
     insert into public.planner_clases(clase_id,cancha,fin) values(p_id,cs[1],f)
     on conflict(clase_id) do update set cancha=excluded.cancha,fin=excluded.fin;
   end loop;
 elsif p_fuente='canchas_abiertas' then
   if cardinality(cs)<>1 then raise exception 'Elegí una cancha'; end if;
   update public.canchas_abiertas set fecha=d,hora_inicio=i,hora_fin=f,cancha='Cancha '||cs[1] where id=p_id;
   get diagnostics n=row_count;
   if n<>1 then raise exception 'No tenés permiso para editar'; end if;
 elsif p_fuente='corporativos_eventos' then
   update public.corporativos_eventos set fecha=d,inicio=i,fin=f,canchas=array_to_string(cs,', ') where id=p_id;
   get diagnostics n=row_count;
   if n<>1 then raise exception 'No tenés permiso para editar'; end if;
 else
   if p_version is null then
     insert into public.planner_actividades values(p_id,kind,trim(p_datos->>'titulo'),d,i,f,cs);
   else
     update public.planner_actividades set tipo=kind,titulo=trim(p_datos->>'titulo'),fecha=d,inicio=i,fin=f,canchas=cs where id=p_id;
     get diagnostics n=row_count;
     if n<>1 then raise exception 'No tenés permiso para editar'; end if;
   end if;
 end if;
end $$;
revoke all on function public.planner_guardar(text,uuid,jsonb,jsonb) from public;
revoke all on function public.planner_canchas(text) from public;


-- Aplicar DESPUÉS de planner.sql en pruebas. Validar los triggers y roles reales
-- antes de desplegar ambas migraciones. No elimina ni reemplaza triggers existentes.

create function public.planner_serializar() returns trigger language plpgsql
set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(71903142);
 return null;
end $$;
-- Sólo la comprobación usa la visibilidad del propietario: impide que una política
-- de lectura parcial oculte una reserva al validar. Nunca escribe con esos permisos.
create function public.planner_validar_ocupacion() returns trigger language plpgsql security definer
set search_path=public,pg_temp as $$
declare a public.planner_agenda; b record; source text; rid uuid; jn jsonb:=to_jsonb(new); jo jsonb:=to_jsonb(old);
begin
 source:=case when tg_table_name='planner_clases' then 'clases' else tg_table_name end;
 rid:=case when tg_table_name='planner_clases' then (to_jsonb(new)->>'clase_id')::uuid else (to_jsonb(new)->>'id')::uuid end;
 -- Cambios en asistencia, importes o presupuesto no alteran la ocupación.
 if tg_op='UPDATE' and tg_table_name='clases' and
   jsonb_build_array(jn->'fecha',jn->'hora',coalesce(jn->>'estado','') in ('Cancelada','Cancelado'))=jsonb_build_array(jo->'fecha',jo->'hora',coalesce(jo->>'estado','') in ('Cancelada','Cancelado')) then return null; end if;
 if tg_op='UPDATE' and tg_table_name='canchas_abiertas' and
   jsonb_build_array(jn->'fecha',jn->'hora_inicio',jn->'hora_fin',jn->'cancha',jn->'estado')=jsonb_build_array(jo->'fecha',jo->'hora_inicio',jo->'hora_fin',jo->'cancha',jo->'estado') then return null; end if;
 if tg_op='UPDATE' and tg_table_name='corporativos_eventos' and
   jsonb_build_array(jn->'fecha',jn->'inicio',jn->'fin',jn->'canchas',jn->'estado')=jsonb_build_array(jo->'fecha',jo->'inicio',jo->'fin',jo->'canchas',jo->'estado') then return null; end if;
 if tg_op='UPDATE' and tg_table_name='planner_actividades' and (jn-'titulo')=(jo-'titulo') then return null; end if;
 select * into a from public.planner_agenda where fuente=source and id=rid;
 if not found or a.estado in ('Cancelada','Cancelado') then return null; end if;
 if a.inicio is null or (a.fin is not null and a.fin<=a.inicio) then raise exception 'Horario inválido'; end if;
 for b in select fuente,id,grupo,tipo,canchas,fin,inicio from public.planner_agenda where fecha=a.fecha and estado not in ('Cancelada','Cancelado') loop
   if b.fuente=a.fuente and (b.id=a.id or (a.fuente='clases' and a.grupo=b.grupo)) then continue; end if;
   if a.tipo='lluvia' and b.tipo<>'lluvia' then continue; end if;
   if (a.canchas is null or b.canchas is null or a.canchas&&b.canchas)
     and (a.fin is null or b.fin is null or (a.inicio<b.fin and a.fin>b.inicio))
   then raise exception 'Solapamiento: horario ocupado o datos de cancha/duración pendientes'; end if;
 end loop;
 return null;
end $$;
revoke all on function public.planner_serializar(),public.planner_validar_ocupacion() from public;
-- El bloqueo se toma ANTES de modificar filas. La validación diferida observa el
-- estado final de grupos y metadatos y revierte íntegra la transacción si falla.
create trigger planner_serializar before insert or update or delete on public.clases for each statement execute function public.planner_serializar();
create trigger planner_serializar before insert or update or delete on public.canchas_abiertas for each statement execute function public.planner_serializar();
create trigger planner_serializar before insert or update or delete on public.corporativos_eventos for each statement execute function public.planner_serializar();
create trigger planner_serializar before insert or update or delete on public.planner_clases for each statement execute function public.planner_serializar();
create trigger planner_serializar before insert or update or delete on public.planner_actividades for each statement execute function public.planner_serializar();
create constraint trigger planner_validar after insert or update on public.clases deferrable initially deferred for each row execute function public.planner_validar_ocupacion();
create constraint trigger planner_validar after insert or update on public.canchas_abiertas deferrable initially deferred for each row execute function public.planner_validar_ocupacion();
create constraint trigger planner_validar after insert or update on public.corporativos_eventos deferrable initially deferred for each row execute function public.planner_validar_ocupacion();
create constraint trigger planner_validar after insert or update on public.planner_clases deferrable initially deferred for each row execute function public.planner_validar_ocupacion();
create constraint trigger planner_validar after insert or update on public.planner_actividades deferrable initially deferred for each row execute function public.planner_validar_ocupacion();


-- Tercera migración: clases de UNA HORA y cancha disponible, sin cancha fija
-- por profesor. Aplicar en pruebas tras planner.sql y planner-guards.sql.

create function public.planner_asignar_clases(p_fecha date,p_grupo text default null) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare g record; b record; candidate integer; chosen integer;
 ending time; existing integer; candidates integer[]; blocked boolean;
begin
 perform pg_advisory_xact_lock(71903142);
 for g in
   select coalesce(a.grupo_id,a.id)::text grupo,min(a.hora) inicio,max(a.hora) ultimo,
          array_agg(a.id order by a.id) ids
   from public.clases a where a.fecha=p_fecha
   and a.estado not in ('Cancelada','Cancelado')
   group by coalesce(a.grupo_id,a.id) order by min(a.hora),coalesce(a.grupo_id,a.id)::text
 loop
   if g.inicio is null or g.inicio<>g.ultimo or g.inicio>=time '23:00' then
     raise exception 'La clase debe tener un horario único y durar una hora dentro del día';
   end if;
   ending:=(g.inicio+interval '1 hour')::time;
   if g.grupo is distinct from p_grupo and
      (select count(*) from public.planner_clases where clase_id=any(g.ids) and fin=ending)=cardinality(g.ids) and
      (select count(distinct cancha) from public.planner_clases where clase_id=any(g.ids))=1 then
     continue;
   end if;
   -- Conserva la cancha actual si sigue disponible; nunca mueve otra reserva.
   select min(cancha) into existing from public.planner_clases where clase_id=any(g.ids);
   candidates:=case when existing is null then array[1,2,3]
      else array[existing]||array(select n from generate_series(1,3) n where n<>existing) end;
   chosen:=null;
   foreach candidate in array candidates loop
     blocked:=false;
     for b in select fuente,grupo,canchas,fin,inicio from public.planner_agenda where fecha=p_fecha and estado not in ('Cancelada','Cancelado') loop
       if b.fuente='clases' and b.grupo=g.grupo then continue; end if;
       -- Las clases todavía sin cancha se asignan en las siguientes iteraciones.
       -- La validación diferida comprueba el conjunto completo al confirmar.
       if b.fuente='clases' and b.canchas is null then continue; end if;
       if (b.canchas is null or candidate=any(b.canchas)) and
          (b.fin is null or (g.inicio<b.fin and ending>b.inicio)) then blocked:=true;exit;end if;
     end loop;
     if not blocked then chosen:=candidate;exit;end if;
   end loop;
   if chosen is null then raise exception 'No hay cancha disponible para una clase de una hora el % a las %',p_fecha,g.inicio;end if;
   insert into public.planner_clases(clase_id,cancha,fin)
     select id,chosen,ending from unnest(g.ids) id
   on conflict(clase_id) do update set cancha=excluded.cancha,fin=excluded.fin
   where (planner_clases.cancha,planner_clases.fin) is distinct from (excluded.cancha,excluded.fin);
 end loop;
end $$;
revoke all on function public.planner_asignar_clases(date,text) from public;

create function public.planner_auto_clase() returns trigger language plpgsql
security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' then
   if (new.fecha,new.hora,coalesce(to_jsonb(new)->>'estado','') in ('Cancelada','Cancelado')) is not distinct from
      (old.fecha,old.hora,coalesce(to_jsonb(old)->>'estado','') in ('Cancelada','Cancelado')) then return null;end if;
 end if;
 -- Se ejecuta al final de la transacción: todos los alumnos de un alta grupal
 -- ya están presentes. Los permisos de escritura siguen siendo los del usuario.
 perform public.planner_asignar_clases(new.fecha,coalesce(to_jsonb(new)->>'grupo_id',new.id::text));
 return null;
end $$;
revoke all on function public.planner_auto_clase() from public;
create constraint trigger planner_auto_clase after insert or update on public.clases
deferrable initially deferred for each row execute function public.planner_auto_clase();

-- Asigna las clases previas en esta misma transacción. Si no hay capacidad o
-- hay un bloqueo existente se revierte todo, sin cambiar fechas ni profesores.
do $$ declare day date;begin
 for day in select distinct fecha from public.clases order by fecha loop
   begin
     perform public.planner_asignar_clases(day);
   exception when raise_exception then
     if day>=current_date then raise; end if;
     -- Conserva íntegra la fecha histórica con un conflicto previo. El
     -- subbloque revierte todas sus asignaciones; queda visible sin cancha.
     raise notice 'Fecha histórica % pendiente de revisión: %',day,sqlerrm;
   end;
 end loop;
end $$;


-- Misma audiencia efectiva verificada en clases y corporativos el 19/10/2026.
-- No cambia permisos de tablas ni funciones existentes.

revoke all on public.planner_actividades,public.planner_clases,public.planner_agenda from public,anon,authenticated;
grant select,insert,update on public.planner_actividades,public.planner_clases to anon,authenticated;
grant select on public.planner_agenda to anon,authenticated;
create policy planner_actividades_lectura on public.planner_actividades for select to anon,authenticated using(true);
create policy planner_actividades_alta on public.planner_actividades for insert to anon,authenticated with check(true);
create policy planner_actividades_edicion on public.planner_actividades for update to anon,authenticated using(true) with check(true);
create policy planner_clases_lectura on public.planner_clases for select to anon,authenticated using(true);
create policy planner_clases_alta on public.planner_clases for insert to anon,authenticated with check(true);
create policy planner_clases_edicion on public.planner_clases for update to anon,authenticated using(true) with check(true);
grant execute on function public.planner_canchas(text),public.planner_guardar(text,uuid,jsonb,jsonb),public.planner_asignar_clases(date,text) to anon,authenticated;


set constraints all immediate;
select jsonb_build_object('asignadas',(select count(*) from planner_clases),'sin_cancha',(select count(*) from planner_agenda where fuente='clases' and canchas is null),'funcion',has_function_privilege('anon','public.planner_guardar(text,uuid,jsonb,jsonb)','execute')) as resultado;
commit;