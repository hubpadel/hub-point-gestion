-- PostgreSQL 15+. Preparación local: revisar esquema y bloqueos de producción antes de aplicar.
begin;
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
commit;
