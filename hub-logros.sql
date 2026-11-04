-- Panel privado de resultados comerciales. No modifica recepción ni los datos operativos.
begin;
create schema if not exists point_logros;
revoke all on schema point_logros from public,anon,authenticated;
create table point_logros.accesos(email text primary key check(email=lower(email)));
alter table point_logros.accesos enable row level security;
create table point_logros.decisiones(
 id uuid primary key default gen_random_uuid(), fuente text not null, fuente_id text not null,
 cliente_clave text not null, programa text not null, tarea_id uuid not null,
 empleada text not null check(empleada in ('Clari','Tamy')),
 medalla text not null check(medalla in ('Oro','Plata','Bronce')),
 estado text not null check(estado in ('Aprobado','Descartado','Anulado')),
 detalle jsonb not null, observacion text not null default '',
 verificado_por uuid not null, creado_en timestamptz not null default now(),
 actualizado_en timestamptz not null default now(), unique(fuente,fuente_id)
);
create unique index logros_uno_por_programa on point_logros.decisiones(cliente_clave,programa) where estado='Aprobado';
alter table point_logros.decisiones enable row level security;
revoke all on all tables in schema point_logros from public,anon,authenticated;
create function public.hub_logros_es_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u join point_logros.accesos a on a.email=lower(u.email)
 where u.id=auth.uid() and u.email_confirmed_at is not null);
$$;
revoke all on function public.hub_logros_es_admin() from public,anon;
grant execute on function public.hub_logros_es_admin() to authenticated;
create function point_logros.telefono(v text) returns text language sql immutable set search_path='' as $$
 select case when length(d)=10 then '549'||d when length(d)=12 and left(d,2)='54' then '549'||substr(d,3)
 when length(d) between 11 and 15 then d else null end from (select regexp_replace(coalesce(v,''),'[^0-9]','','g') d) s;
$$;
create function point_logros.nombre(v text) returns text language sql immutable set search_path='' as $$
 select regexp_replace(translate(lower(trim(coalesce(v,''))),'áéíóúüñ','aeiouun'),'[^a-z0-9]','','g');
$$;
create view point_logros.personas with(security_invoker=true) as
 select 'a:'||id::text clave, point_logros.nombre(nombre) nombre,point_logros.telefono(telefono) telefono from public.alumnos
 union select case when alumno_id is not null then 'a:'||alumno_id::text else 'p:'||point_logros.telefono(telefono) end,
 point_logros.nombre(nombre),point_logros.telefono(telefono) from public.jugadores;
create function point_logros.cliente(p_id uuid,p_tel text,p_nombre text) returns text language plpgsql stable set search_path='' as $$
declare n integer; k text; tel text:=point_logros.telefono(p_tel);
begin
 if p_id is not null then return 'a:'||p_id::text; end if;
 if tel is not null then
  select count(distinct clave),min(clave) into n,k from point_logros.personas where telefono=tel and clave is not null;
  if n>1 then return null; end if;
  return coalesce(k,'p:'||tel);
 end if;
 select count(distinct clave),min(clave) into n,k from point_logros.personas where nombre=point_logros.nombre(p_nombre) and clave is not null;
 if n=1 then return k; end if; return null;
end $$;
create function point_logros.fecha_segura(v text) returns timestamptz language plpgsql immutable set search_path='' as $$
begin return v::timestamptz; exception when others then return null; end $$;
create view point_logros.eventos with(security_invoker=true) as
 select 'Clase'::text fuente,c.id::text fuente_id,'a:'||s.id::text cliente_clave,s.nombre cliente,'Clases'::text programa,
 c.fecha,c.created_at inscripcion,('Clase '||c.fecha::text||' '||c.hora::text) actividad,
 c.estado='Presente' elegible,coalesce(c.estado,'') not in ('Canceló','Ausente','Cancelada') vigente,
 'Asistencia registrada'::text respaldo,false identidad_por_nombre
 from public.clases c join public.alumnos s on s.id=c.alumno_id
 union all
 select 'Cancha abierta',j.id::text,point_logros.cliente(null,j.telefono,j.nombre),j.nombre,'Canchas abiertas',e.fecha,j.created_at,
 ('Cancha abierta '||e.tipo||' '||e.categoria||' · '||e.fecha::text||' '||e.hora_inicio::text),
 (j.presente or j.pagado),e.estado='Activa',case when j.pagado then 'Pago registrado' else 'Asistencia registrada' end,
 point_logros.telefono(j.telefono) is null
 from public.cancha_abierta_jugadores j join public.canchas_abiertas e on e.id=j.cancha_abierta_id
 union all
 select 'Torneo',t.id::text||':'||(j->>'id'),point_logros.cliente(null,null,j->>'nombre'),j->>'nombre','Torneos',a.fecha,null::timestamptz,
 a.titulo||' · '||coalesce(t.datos->>'categoria','')||' · '||a.fecha::text,
 (coalesce(j->>'presencia','')='Presente' or coalesce((j->>'cobrado')::numeric,0)>0),p->>'estado'='Inscripta',
 case when coalesce((j->>'cobrado')::numeric,0)>0 then 'Pago individual registrado' else 'Asistencia registrada' end,true
 from public.torneos t join public.planner_actividades a on a.id=t.id
 cross join lateral jsonb_array_elements(t.datos->'parejas') p cross join lateral jsonb_array_elements(p->'jugadores') j;
create view point_logros.candidatos with(security_invoker=true) as
 select e.*,t.id tarea_id,t.responsable empleada,t.contacto contacto_tarea,t.notas,t.estado estado_tarea,
 coalesce(t.historial->0->>'responsable',t.responsable) inicio_gestion,
 case when h.ultima is null then 'Oro' when h.ultima<e.fecha-90 then 'Plata' else 'Bronce' end medalla,
 case when h.ultima is null then 'Nuevo cliente según historial disponible' when h.ultima<e.fecha-90 then 'Cliente recuperado · más de 90 días' else 'Nueva actividad para cliente activo' end tipo_logro
 from point_logros.eventos e
 cross join lateral (
  select x.* from public.hub_action_tareas x
  where point_logros.cliente(x.alumno_id,x.telefono,x.contacto)=e.cliente_clave
  and x.estado in ('Interesada','Confirmada','Cerrada')
  and x.fecha between e.fecha-30 and e.fecha
  and (e.inscripcion is null or e.inscripcion>=coalesce(point_logros.fecha_segura(x.historial->0->>'fecha'),x.fecha::timestamptz))
  order by (x.estado='Confirmada') desc,x.fecha desc,x.actualizado desc,x.id limit 1
 ) t
 cross join lateral (select max(p.fecha) ultima from point_logros.eventos p where p.cliente_clave=e.cliente_clave and p.vigente
  and (p.fecha<e.fecha or(p.fecha=e.fecha and(coalesce(p.inscripcion,p.fecha::timestamptz),p.fuente,p.fuente_id)<(coalesce(e.inscripcion,e.fecha::timestamptz),e.fuente,e.fuente_id)))) h
 where e.cliente_clave is not null and e.elegible and e.vigente
 and not exists(select 1 from point_logros.eventos p where p.cliente_clave=e.cliente_clave and p.programa=e.programa and p.vigente
  and p.fecha>=e.fecha-90 and(p.fecha<e.fecha or(p.fecha=e.fecha and(coalesce(p.inscripcion,p.fecha::timestamptz),p.fuente,p.fuente_id)<(coalesce(e.inscripcion,e.fecha::timestamptz),e.fuente,e.fuente_id))))
 and not exists(select 1 from point_logros.decisiones d where (d.fuente=e.fuente and d.fuente_id=e.fuente_id) or(d.cliente_clave=e.cliente_clave and d.programa=e.programa and d.estado='Aprobado'));
create function public.hub_logros_panel(p_desde date,p_hasta date) returns jsonb language plpgsql security definer set search_path='' as $$
declare candidatos jsonb; logros jsonb;
begin
 if not public.hub_logros_es_admin() then raise exception 'Acceso exclusivo de administración' using errcode='42501'; end if;
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>366 then raise exception 'Elegí un período de hasta 366 días'; end if;
 select coalesce(jsonb_agg(to_jsonb(c) order by c.fecha desc,c.cliente),'[]') into candidatos from point_logros.candidatos c where c.fecha between p_desde and p_hasta;
 select coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('vigente',exists(select 1 from point_logros.eventos e where e.fuente=d.fuente and e.fuente_id=d.fuente_id and e.vigente and e.elegible)) order by d.creado_en desc),'[]') into logros from point_logros.decisiones d where (d.detalle->>'fecha')::date between p_desde and p_hasta;
 return jsonb_build_object('candidatos',candidatos,'logros',logros);
end $$;
create function public.hub_logros_resolver(p_fuente text,p_fuente_id text,p_tarea uuid,p_empleada text,p_aprobar boolean,p_observacion text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare c record; resultado uuid;
begin
 if not public.hub_logros_es_admin() then raise exception 'Acceso exclusivo de administración' using errcode='42501'; end if;
 if p_empleada not in ('Clari','Tamy') then raise exception 'Elegí Clari o Tamy'; end if;
 perform pg_advisory_xact_lock(hashtext('hub_logros_resolver'));
 select * into c from point_logros.candidatos where fuente=p_fuente and fuente_id=p_fuente_id and tarea_id=p_tarea;
 if not found then raise exception 'La inscripción cambió, no es elegible o ya fue revisada. Actualizá el panel'; end if;
 insert into point_logros.decisiones(fuente,fuente_id,cliente_clave,programa,tarea_id,empleada,medalla,estado,detalle,observacion,verificado_por)
 values(c.fuente,c.fuente_id,c.cliente_clave,c.programa,c.tarea_id,p_empleada,c.medalla,case when p_aprobar then 'Aprobado' else 'Descartado' end,to_jsonb(c),coalesce(p_observacion,''),auth.uid()) returning id into resultado;
 return resultado;
end $$;
create function public.hub_logros_anular(p_id uuid,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.hub_logros_es_admin() then raise exception 'Acceso exclusivo de administración' using errcode='42501'; end if;
 if length(trim(coalesce(p_motivo,'')))=0 then raise exception 'Indicá el motivo'; end if;
 update point_logros.decisiones set estado='Anulado',observacion=p_motivo,actualizado_en=now() where id=p_id and estado='Aprobado';
 if not found then raise exception 'El logro ya no está aprobado'; end if;
end $$;
revoke all on all functions in schema point_logros from public,anon,authenticated;
revoke all on function public.hub_logros_panel(date,date),public.hub_logros_resolver(text,text,uuid,text,boolean,text),public.hub_logros_anular(uuid,text) from public,anon;
grant execute on function public.hub_logros_panel(date,date),public.hub_logros_resolver(text,text,uuid,text,boolean,text),public.hub_logros_anular(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
