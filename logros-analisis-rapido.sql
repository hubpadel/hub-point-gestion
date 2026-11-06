begin;
-- Se materializan los eventos y las identidades de tareas una vez por consulta.
-- No se cambia la definición de un logro ni se modifica ninguna decisión.
create function point_logros.analisis_rapido(p_desde date,p_hasta date) returns jsonb
language plpgsql security invoker set search_path='' set jit=off as $$
declare resultado jsonb;
begin
 if not point_logros.hub_logros_es_admin() then raise exception 'Acceso exclusivo de administración' using errcode='42501'; end if;
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>366 then raise exception 'Elegí un período de hasta 366 días'; end if;
 with eventos as materialized(select * from point_logros.eventos),
 tareas as materialized(
  select x.*,point_logros.cliente(x.alumno_id,x.telefono,x.contacto) cliente_clave
  from public.hub_action_tareas x
  where x.estado in ('Interesada','Confirmada','Cerrada') and x.fecha between p_desde-30 and p_hasta
 ),
 decisiones as materialized(select * from point_logros.decisiones),
 inscripciones as materialized(
  select e.*,h.ultima,h.repite
  from eventos e
  cross join lateral(select max(p.fecha) ultima,
    coalesce(bool_or(p.programa=e.programa and p.fecha>=e.fecha-90),false) repite
   from eventos p where p.cliente_clave=e.cliente_clave and p.vigente
   and (p.fecha<e.fecha or(p.fecha=e.fecha and(coalesce(p.inscripcion,p.fecha::timestamptz),p.fuente,p.fuente_id)<(coalesce(e.inscripcion,e.fecha::timestamptz),e.fuente,e.fuente_id)))
  ) h
  where e.fecha between p_desde and p_hasta and e.cliente_clave is not null and e.elegible and e.vigente
 ),
 incorporaciones as materialized(
  select (to_jsonb(e)-'ultima'-'repite')||jsonb_build_object(
   'tarea_id',t.id,'empleada',t.responsable,'contacto_tarea',coalesce(t.contacto,''),'notas',coalesce(t.notas,''),
   'estado_tarea',case when t.id is null then 'Incorporación con asistencia registrada' else t.estado end,
   'inicio_gestion',case when t.id is null then 'Sin tarea vinculada · atribución por administración' else coalesce(t.historial->0->>'responsable',t.responsable) end,
   'medalla',case when e.ultima is null then 'Oro' when e.ultima<e.fecha-90 then 'Plata' else 'Bronce' end,
   'tipo_logro',case when e.ultima is null then 'Nuevo cliente según historial disponible' when e.ultima<e.fecha-90 then 'Cliente recuperado · más de 90 días' else 'Nueva actividad para cliente activo' end,
   'tipo_extra',t.id is null,'es_partido_armado',false) dato
  from inscripciones e
  left join lateral(select x.* from tareas x where x.cliente_clave=e.cliente_clave
    and x.fecha between e.fecha-30 and e.fecha
    and (e.inscripcion is null or e.inscripcion>=coalesce(point_logros.fecha_segura(x.historial->0->>'fecha'),x.fecha::timestamptz))
    order by (x.estado='Confirmada') desc,x.fecha desc,x.actualizado desc,x.id limit 1
  ) t on true
  where not e.repite and(t.id is not null or e.fuente='Clase')
 ),
 partidos as materialized(
  select jsonb_build_object('fuente','Partido armado','fuente_id',t.id::text,'cliente_clave','partido:'||t.id::text,
   'cliente',string_agg(j->>'nombre',' + ' order by p->>'id',j->>'id'),'programa','Partidos armados',
   'fecha',(t.creado_en at time zone 'America/Argentina/Buenos_Aires')::date,'inscripcion',t.creado_en,
   'actividad',concat(a.titulo,' · ',a.fecha,' ',a.inicio,' · ',t.datos->>'tipo',' ',t.datos->>'categoria'),
   'elegible',true,'vigente',true,'respaldo','Dos parejas activas y cuatro jugadores registrados','identidad_por_nombre',false,
   'tarea_id',null,'empleada',case when t.datos->>'armado_por' in ('Clari','Tamy') then t.datos->>'armado_por' end,
   'contacto_tarea','','notas',coalesce(t.datos->>'notas',''),'estado_tarea','Partido completo',
   'inicio_gestion',coalesce(nullif(t.datos->>'armado_por',''),'Sin asignar'),
   'medalla','Bronce','tipo_logro','Partido armado · cuatro jugadores','tipo_extra',true,'es_partido_armado',true) dato
  from public.partidos t join public.planner_actividades a on a.id=t.id
  cross join lateral jsonb_array_elements(t.datos->'parejas') p
  cross join lateral jsonb_array_elements(p->'jugadores') j
  where p->>'estado'='Inscripta' and length(trim(coalesce(j->>'nombre','')))>0
  group by t.id,a.id,a.titulo,a.fecha,a.inicio having count(*)=4 and count(distinct p->>'id')=2
 ),
 propuestas as(select dato from incorporaciones union all select dato from partidos where(dato->>'fecha')::date between p_desde and p_hasta),
 pendientes as(
  select p.dato from propuestas p where not exists(select 1 from decisiones d
   where(d.fuente=p.dato->>'fuente' and d.fuente_id=p.dato->>'fuente_id')
   or(d.cliente_clave=p.dato->>'cliente_clave' and d.programa=p.dato->>'programa' and d.estado='Aprobado'))
 ),
 aprobaciones as(
  select to_jsonb(d)||jsonb_build_object('vigente',
   exists(select 1 from eventos e where e.fuente=d.fuente and e.fuente_id=d.fuente_id and e.vigente and e.elegible)
   or exists(select 1 from partidos p where p.dato->>'fuente'=d.fuente and p.dato->>'fuente_id'=d.fuente_id)
   or(d.fuente='Cancha abierta'
    and not exists(select 1 from eventos e where e.fuente=d.fuente and e.fuente_id=d.fuente_id)
    and(select count(*) from eventos e where e.fuente=d.fuente and e.cliente_clave=d.cliente_clave and e.programa=d.programa and e.fecha=(d.detalle->>'fecha')::date and e.actividad=d.detalle->>'actividad')=1
    and exists(select 1 from eventos e where e.fuente=d.fuente and e.cliente_clave=d.cliente_clave and e.programa=d.programa and e.fecha=(d.detalle->>'fecha')::date and e.actividad=d.detalle->>'actividad' and e.vigente and e.elegible)
   )) dato
  from decisiones d where(d.detalle->>'fecha')::date between p_desde and p_hasta
 )
 select jsonb_build_object(
 'candidatos',coalesce((select jsonb_agg(dato order by dato->>'fecha' desc,dato->>'cliente') from pendientes),'[]'::jsonb),
 'logros',coalesce((select jsonb_agg(dato order by dato->>'creado_en' desc) from aprobaciones),'[]'::jsonb)) into resultado;
 return resultado;
end $$;
revoke all on function point_logros.analisis_rapido(date,date) from public,anon,authenticated;
create or replace function point_logros.hub_logros_panel(p_desde date,p_hasta date) returns jsonb
language plpgsql security definer set search_path='' set jit=off as $$
begin
 if not point_logros.hub_logros_es_admin() then raise exception 'Acceso exclusivo de administración' using errcode='42501'; end if;
 return point_logros.analisis_rapido(p_desde,p_hasta);
end $$;
-- Revalidar un resultado al aprobarlo usa el mismo análisis, sin las vistas anidadas.
create or replace function point_logros.resolver_resultado(p_fuente text,p_fuente_id text,p_empleada text,p_aprobar boolean,p_observacion text default '') returns uuid
language plpgsql security definer set search_path='' set jit=off as $$
declare r jsonb; resultado uuid; dia date;
begin
 if not point_logros.hub_logros_es_admin() then raise exception 'Acceso exclusivo de administración' using errcode='42501'; end if;
 if p_empleada is null or p_empleada not in ('Clari','Tamy') or p_aprobar is null then raise exception 'Elegí responsable y decisión'; end if;
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
end $$;
create or replace function point_logros.hub_logros_resolver(p_fuente text,p_fuente_id text,p_tarea uuid,p_empleada text,p_aprobar boolean,p_observacion text default '') returns uuid
language plpgsql security definer set search_path='' set jit=off as $$
declare r jsonb; resultado uuid; dia date;
begin
 if not point_logros.hub_logros_es_admin() then raise exception 'Acceso exclusivo de administración' using errcode='42501'; end if;
 if p_empleada is null or p_empleada not in ('Clari','Tamy') or p_aprobar is null then raise exception 'Elegí responsable y decisión'; end if;
 perform pg_advisory_xact_lock(hashtext('hub_logros_resolver'));
 select e.fecha into dia from point_logros.eventos e where e.fuente=p_fuente and e.fuente_id=p_fuente_id;
 if dia is null then raise exception 'La inscripción cambió o ya fue revisada. Actualizá el panel'; end if;
 select x into r from jsonb_array_elements(point_logros.analisis_rapido(dia,dia)->'candidatos') x
 where x->>'fuente'=p_fuente and x->>'fuente_id'=p_fuente_id and(x->>'tarea_id')::uuid=p_tarea;
 if r is null then raise exception 'La inscripción cambió o ya fue revisada. Actualizá el panel'; end if;
 insert into point_logros.decisiones(fuente,fuente_id,cliente_clave,programa,tarea_id,empleada,medalla,estado,detalle,observacion,verificado_por)
 values(p_fuente,p_fuente_id,r->>'cliente_clave',r->>'programa',p_tarea,p_empleada,r->>'medalla',case when p_aprobar then 'Aprobado' else 'Descartado' end,r,coalesce(p_observacion,''),auth.uid()) returning id into resultado;
 return resultado;
end $$;
revoke all on function point_logros.hub_logros_panel(date,date),point_logros.resolver_resultado(text,text,text,boolean,text),point_logros.hub_logros_resolver(text,text,uuid,text,boolean,text) from public,anon;
grant execute on function point_logros.hub_logros_panel(date,date),point_logros.resolver_resultado(text,text,text,boolean,text),point_logros.hub_logros_resolver(text,text,uuid,text,boolean,text) to authenticated;
notify pgrst,'reload schema';
commit;
