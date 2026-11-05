begin;
-- Una gestión puede probarse por el resultado operativo y validación de administración,
-- sin inventar una tarea comercial histórica.
alter table point_logros.decisiones alter column tarea_id drop not null;
create view point_logros.resultados with(security_invoker=true) as
select 'Partido armado'::text fuente,t.id::text fuente_id,'partido:'||t.id::text cliente_clave,
 string_agg(j->>'nombre',' + ' order by p->>'id',j->>'id') cliente,
 'Partidos armados'::text programa,(t.creado_en at time zone 'America/Argentina/Buenos_Aires')::date fecha,
 t.creado_en inscripcion,concat(a.titulo,' · ',a.fecha,' ',a.inicio,' · ',t.datos->>'tipo',' ',t.datos->>'categoria') actividad,
 true elegible,true vigente,'Dos parejas activas y cuatro jugadores registrados'::text respaldo,false identidad_por_nombre,
 null::uuid tarea_id,case when t.datos->>'armado_por' in ('Clari','Tamy') then t.datos->>'armado_por' end empleada,
 ''::text contacto_tarea,coalesce(t.datos->>'notas','') notas,'Partido completo'::text estado_tarea,
 coalesce(nullif(t.datos->>'armado_por',''),'Sin asignar') inicio_gestion,
 'Bronce'::text medalla,'Partido armado · cuatro jugadores'::text tipo_logro,
 true tipo_extra,true es_partido_armado
from public.partidos t join public.planner_actividades a on a.id=t.id
cross join lateral jsonb_array_elements(t.datos->'parejas') p
cross join lateral jsonb_array_elements(p->'jugadores') j
where p->>'estado'='Inscripta' and length(trim(coalesce(j->>'nombre','')))>0
-- Contar el partido una vez, nunca una medalla por cada uno de sus jugadores.
group by t.id,a.id,a.titulo,a.fecha,a.inicio
having count(*)=4 and count(distinct p->>'id')=2
union all
select e.*,null::uuid,null::text,''::text,''::text,'Incorporación con asistencia registrada',
 'Sin tarea vinculada · atribución por administración',
 case when h.ultima is null then 'Oro' when h.ultima<e.fecha-90 then 'Plata' else 'Bronce' end,
 case when h.ultima is null then 'Nuevo cliente según historial disponible' when h.ultima<e.fecha-90 then 'Cliente recuperado · más de 90 días' else 'Nueva actividad para cliente activo' end,
 true,false
from point_logros.eventos e
cross join lateral (select max(p.fecha) ultima from point_logros.eventos p
 where p.cliente_clave=e.cliente_clave and p.vigente
 and (p.fecha<e.fecha or(p.fecha=e.fecha and(coalesce(p.inscripcion,p.fecha::timestamptz),p.fuente,p.fuente_id)<(coalesce(e.inscripcion,e.fecha::timestamptz),e.fuente,e.fuente_id)))) h
where e.fuente='Clase' and e.elegible and e.vigente and e.cliente_clave is not null
and not exists(select 1 from point_logros.eventos p where p.cliente_clave=e.cliente_clave and p.programa=e.programa and p.vigente
 and p.fecha>=e.fecha-90 and(p.fecha<e.fecha or(p.fecha=e.fecha and(coalesce(p.inscripcion,p.fecha::timestamptz),p.fuente,p.fuente_id)<(coalesce(e.inscripcion,e.fecha::timestamptz),e.fuente,e.fuente_id))))
and not exists(select 1 from point_logros.candidatos c where c.fuente=e.fuente and c.fuente_id=e.fuente_id);
revoke all on point_logros.resultados from public,anon,authenticated;
create view point_logros.resultados_pendientes with(security_invoker=true) as
select r.* from point_logros.resultados r where not exists(select 1 from point_logros.decisiones d
 where (d.fuente=r.fuente and d.fuente_id=r.fuente_id) or(d.cliente_clave=r.cliente_clave and d.programa=r.programa and d.estado='Aprobado'));
revoke all on point_logros.resultados_pendientes from public,anon,authenticated;
create function point_logros.resolver_resultado(p_fuente text,p_fuente_id text,p_empleada text,p_aprobar boolean,p_observacion text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare r record; resultado uuid;
begin
 if not point_logros.hub_logros_es_admin() then raise exception 'Acceso exclusivo de administración' using errcode='42501'; end if;
 if p_empleada is null or p_empleada not in ('Clari','Tamy') then raise exception 'Elegí Clari o Tamy'; end if;
 if p_aprobar is null then raise exception 'Indicá la decisión'; end if;
 perform pg_advisory_xact_lock(hashtext('hub_logros_resolver'));
 select * into r from point_logros.resultados_pendientes where fuente=p_fuente and fuente_id=p_fuente_id;
 if not found then raise exception 'El resultado cambió o ya fue revisado. Actualizá el panel'; end if;
 if (r.empleada is null or not p_aprobar) and length(trim(coalesce(p_observacion,'')))<3 then raise exception 'Dejá una observación que respalde la atribución'; end if;
 insert into point_logros.decisiones(fuente,fuente_id,cliente_clave,programa,tarea_id,empleada,medalla,estado,detalle,observacion,verificado_por)
 values(r.fuente,r.fuente_id,r.cliente_clave,r.programa,null,p_empleada,r.medalla,case when p_aprobar then 'Aprobado' else 'Descartado' end,to_jsonb(r),coalesce(p_observacion,''),auth.uid()) returning id into resultado;
 return resultado;
end $$;
create function public.hub_logros_resolver_resultado(p_fuente text,p_fuente_id text,p_empleada text,p_aprobar boolean,p_observacion text default '') returns uuid
language sql security invoker set search_path='' as $$select point_logros.resolver_resultado(p_fuente,p_fuente_id,p_empleada,p_aprobar,p_observacion);$$;
revoke all on function point_logros.resolver_resultado(text,text,text,boolean,text),public.hub_logros_resolver_resultado(text,text,text,boolean,text) from public,anon;
grant execute on function point_logros.resolver_resultado(text,text,text,boolean,text),public.hub_logros_resolver_resultado(text,text,text,boolean,text) to authenticated;
create or replace function point_logros.hub_logros_panel(p_desde date,p_hasta date) returns jsonb language plpgsql security definer set search_path='' as $$
declare candidatos jsonb; extra jsonb; logros jsonb;
begin
 if not point_logros.hub_logros_es_admin() then raise exception 'Acceso exclusivo de administración' using errcode='42501'; end if;
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>366 then raise exception 'Elegí un período de hasta 366 días'; end if;
 select coalesce(jsonb_agg(to_jsonb(c) order by c.fecha desc,c.cliente),'[]') into candidatos from point_logros.candidatos c where c.fecha between p_desde and p_hasta;
 select coalesce(jsonb_agg(to_jsonb(c) order by c.fecha desc,c.cliente),'[]') into extra from point_logros.resultados_pendientes c where c.fecha between p_desde and p_hasta;
 select coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('vigente',
 exists(select 1 from point_logros.eventos e where e.fuente=d.fuente and e.fuente_id=d.fuente_id and e.vigente and e.elegible)
 or exists(select 1 from point_logros.resultados r where r.fuente=d.fuente and r.fuente_id=d.fuente_id and r.vigente and r.elegible)
 or (d.fuente='Cancha abierta'
 and not exists(select 1 from point_logros.eventos e where e.fuente=d.fuente and e.fuente_id=d.fuente_id)
 and (select count(*) from point_logros.eventos e where e.fuente=d.fuente and e.cliente_clave=d.cliente_clave and e.programa=d.programa and e.fecha=(d.detalle->>'fecha')::date and e.actividad=d.detalle->>'actividad')=1
 and exists(select 1 from point_logros.eventos e where e.fuente=d.fuente and e.cliente_clave=d.cliente_clave and e.programa=d.programa and e.fecha=(d.detalle->>'fecha')::date and e.actividad=d.detalle->>'actividad' and e.vigente and e.elegible)
 )) order by d.creado_en desc),'[]') into logros from point_logros.decisiones d where (d.detalle->>'fecha')::date between p_desde and p_hasta;
 return jsonb_build_object('candidatos',candidatos||extra,'logros',logros);
end $$;
notify pgrst,'reload schema';
commit;
