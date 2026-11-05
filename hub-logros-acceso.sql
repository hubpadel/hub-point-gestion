-- La API pública delega en funciones privadas con validación explícita de administradora.
begin;
alter function public.hub_logros_es_admin() set schema point_logros;
alter function public.hub_logros_panel(date,date) set schema point_logros;
alter function public.hub_logros_resolver(text,text,uuid,text,boolean,text) set schema point_logros;
alter function public.hub_logros_anular(uuid,text) set schema point_logros;
create function public.hub_logros_es_admin() returns boolean language sql stable security invoker set search_path='' as $$ select point_logros.hub_logros_es_admin(); $$;
create function public.hub_logros_panel(p_desde date,p_hasta date) returns jsonb language sql security invoker set search_path='' as $$ select point_logros.hub_logros_panel(p_desde,p_hasta); $$;
create function public.hub_logros_resolver(p_fuente text,p_fuente_id text,p_tarea uuid,p_empleada text,p_aprobar boolean,p_observacion text default '') returns uuid language sql security invoker set search_path='' as $$ select point_logros.hub_logros_resolver(p_fuente,p_fuente_id,p_tarea,p_empleada,p_aprobar,p_observacion); $$;
create function public.hub_logros_anular(p_id uuid,p_motivo text) returns void language sql security invoker set search_path='' as $$ select point_logros.hub_logros_anular(p_id,p_motivo); $$;
revoke all on function public.hub_logros_es_admin(),public.hub_logros_panel(date,date),public.hub_logros_resolver(text,text,uuid,text,boolean,text),public.hub_logros_anular(uuid,text) from public,anon;
grant execute on function public.hub_logros_es_admin(),public.hub_logros_panel(date,date),public.hub_logros_resolver(text,text,uuid,text,boolean,text),public.hub_logros_anular(uuid,text) to authenticated;
grant usage on schema point_logros to authenticated;
revoke all on function point_logros.hub_logros_es_admin(),point_logros.hub_logros_panel(date,date),point_logros.hub_logros_resolver(text,text,uuid,text,boolean,text),point_logros.hub_logros_anular(uuid,text) from public,anon;
grant execute on function point_logros.hub_logros_es_admin(),point_logros.hub_logros_panel(date,date),point_logros.hub_logros_resolver(text,text,uuid,text,boolean,text),point_logros.hub_logros_anular(uuid,text) to authenticated;
create policy logros_accesos_sin_acceso_directo on point_logros.accesos for all to anon,authenticated using(false) with check(false);
create policy logros_decisiones_sin_acceso_directo on point_logros.decisiones for all to anon,authenticated using(false) with check(false);
notify pgrst,'reload schema';
commit;

-- Mantener el respaldo de medallas cuando recepción reemplaza la nómina.
create or replace function point_logros.hub_logros_panel(p_desde date,p_hasta date)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare candidatos jsonb; logros jsonb;
begin
 if not public.hub_logros_es_admin() then raise exception 'Acceso exclusivo de administración' using errcode='42501'; end if;
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>366 then raise exception 'Elegí un período de hasta 366 días'; end if;
 select coalesce(jsonb_agg(to_jsonb(c) order by c.fecha desc,c.cliente),'[]') into candidatos from point_logros.candidatos c where c.fecha between p_desde and p_hasta;
 select coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('vigente',
 exists(select 1 from point_logros.eventos e where e.fuente=d.fuente and e.fuente_id=d.fuente_id and e.vigente and e.elegible)
 or (
 d.fuente='Cancha abierta'
 and not exists(select 1 from point_logros.eventos e where e.fuente=d.fuente and e.fuente_id=d.fuente_id)
 and (select count(*) from point_logros.eventos e where e.fuente=d.fuente and e.cliente_clave=d.cliente_clave and e.programa=d.programa and e.fecha=(d.detalle->>'fecha')::date and e.actividad=d.detalle->>'actividad')=1
 and exists(select 1 from point_logros.eventos e where e.fuente=d.fuente and e.cliente_clave=d.cliente_clave and e.programa=d.programa and e.fecha=(d.detalle->>'fecha')::date and e.actividad=d.detalle->>'actividad' and e.vigente and e.elegible)
 )) order by d.creado_en desc),'[]') into logros from point_logros.decisiones d where (d.detalle->>'fecha')::date between p_desde and p_hasta;
 return jsonb_build_object('candidatos',candidatos,'logros',logros);
end $function$;
