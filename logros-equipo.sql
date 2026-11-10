begin;
-- Las decisiones previas conservan la atribución registrada.
alter table point_logros.decisiones drop constraint decisiones_empleada_check;
alter table point_logros.decisiones add constraint decisiones_empleada_check
 check (empleada in ('Clari', 'Tamy', 'Clari y Tamy'));

CREATE OR REPLACE FUNCTION point_logros.hub_logros_resolver(p_fuente text, p_fuente_id text, p_tarea uuid, p_empleada text, p_aprobar boolean, p_observacion text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET jit TO 'off'
AS $function$
declare r jsonb; resultado uuid; dia date;
begin
 if not point_logros.hub_logros_es_admin() then raise exception 'Acceso exclusivo de administración' using errcode='42501'; end if;
 if p_empleada is null or p_empleada not in ('Clari','Tamy','Clari y Tamy') or p_aprobar is null then raise exception 'Elegí responsable y decisión'; end if;
 perform pg_advisory_xact_lock(hashtext('hub_logros_resolver'));
 select e.fecha into dia from point_logros.eventos e where e.fuente=p_fuente and e.fuente_id=p_fuente_id;
 if dia is null then raise exception 'La inscripción cambió o ya fue revisada. Actualizá el panel'; end if;
 select x into r from jsonb_array_elements(point_logros.analisis_rapido(dia,dia)->'candidatos') x
 where x->>'fuente'=p_fuente and x->>'fuente_id'=p_fuente_id and(x->>'tarea_id')::uuid=p_tarea;
 if r is null then raise exception 'La inscripción cambió o ya fue revisada. Actualizá el panel'; end if;
 insert into point_logros.decisiones(fuente,fuente_id,cliente_clave,programa,tarea_id,empleada,medalla,estado,detalle,observacion,verificado_por)
 values(p_fuente,p_fuente_id,r->>'cliente_clave',r->>'programa',p_tarea,p_empleada,r->>'medalla',case when p_aprobar then 'Aprobado' else 'Descartado' end,r,coalesce(p_observacion,''),auth.uid()) returning id into resultado;
 return resultado;
end $function$;

CREATE OR REPLACE FUNCTION point_logros.resolver_resultado(p_fuente text, p_fuente_id text, p_empleada text, p_aprobar boolean, p_observacion text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET jit TO 'off'
AS $function$
declare r jsonb; resultado uuid; dia date;
begin
 if not point_logros.hub_logros_es_admin() then raise exception 'Acceso exclusivo de administración' using errcode='42501'; end if;
 if p_empleada is null or p_empleada not in ('Clari','Tamy','Clari y Tamy') or p_aprobar is null then raise exception 'Elegí responsable y decisión'; end if;
 perform pg_advisory_xact_lock(hashtext('hub_logros_resolver'));
 if p_fuente='Partido armado' then select(t.creado_en at time zone 'America/Argentina/Buenos_Aires')::date into dia from public.partidos t where t.id=p_fuente_id::uuid;
 elsif p_fuente='Clase' then select c.fecha into dia from public.clases c where c.id=p_fuente_id::uuid;
 end if;
 if dia is null then raise exception 'El resultado cambió o ya fue revisado. Actualizá el panel'; end if;
 select x into r from jsonb_array_elements(point_logros.analisis_rapido(dia,dia)->'candidatos') x
 where x->>'fuente'=p_fuente and x->>'fuente_id'=p_fuente_id and(x->>'tipo_extra')::boolean;
 if r is null then raise exception 'El resultado cambió o ya fue revisado. Actualizá el panel'; end if;
 if (r->>'empleada' is null or not p_aprobar) and length(trim(coalesce(p_observacion,'')))<3 then raise exception 'Dejá una observación que respalde la atribución'; end if;
 insert into point_logros.decisiones(fuente,fuente_id,cliente_clave,programa,tarea_id,empleada,medalla,estado,detalle,observacion,verificado_por)
 values(p_fuente,p_fuente_id,r->>'cliente_clave',r->>'programa',null,p_empleada,r->>'medalla',case when p_aprobar then 'Aprobado' else 'Descartado' end,r,coalesce(p_observacion,''),auth.uid()) returning id into resultado;
 return resultado;
end $function$;

notify pgrst, 'reload schema';
commit;
