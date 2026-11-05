-- Integrar el programa en el informe privado, sin escribir cobros duplicados en pagos.
begin;
do $migration$
declare definicion text;
begin
 definicion:=pg_get_viewdef('point_logros.finanzas_cobros'::regclass,true);
 definicion:=regexp_replace(definicion,';\s*$','');
 execute 'create or replace view point_logros.finanzas_cobros as '||definicion||$union$
 union all
 select 'Partidos',t.id::text||':'||(j->>'id'),coalesce(nullif(j->>'fecha','')::date,a.fecha),j->>'nombre',coalesce(nullif(j->>'medio',''),'Sin indicar'),coalesce((j->>'cobrado')::numeric,0),a.titulo,nullif(j->>'fecha','') is null
 from public.partidos t join public.planner_actividades a on a.id=t.id
 cross join lateral jsonb_array_elements(t.datos->'parejas') p
 cross join lateral jsonb_array_elements(p->'jugadores') j where coalesce((j->>'cobrado')::numeric,0)>0
 $union$;
 definicion:=regexp_replace(pg_get_viewdef('point_logros.finanzas_costos'::regclass,true),';\s*$','');
 execute 'create or replace view point_logros.finanzas_costos as '||definicion||$union$
 union all select 'Partidos',a.fecha,'Coordinación',coalesce(t.datos->>'coordinador','Sin coordinador'),coalesce((t.datos->>'coordinador_importe')::numeric,0),'Costo registrado; sin comprobante de pago'
 from public.partidos t join public.planner_actividades a on a.id=t.id
 union all select 'Partidos',a.fecha,'Cancha',a.titulo,coalesce((t.datos->>'costo_cancha')::numeric,0),'Costo registrado; sin comprobante de pago'
 from public.partidos t join public.planner_actividades a on a.id=t.id
 $union$;
 -- Se incorpora el saldo del programa a la consulta existente; se conservan las demás fuentes.
 definicion:=pg_get_functiondef('point_logros.finanzas_panel(date)'::regprocedure);
 if strpos(definicion,') select coalesce(jsonb_agg(to_jsonb(s)')=0 then raise exception 'Revisá la versión de finanzas_panel antes de integrar Partidos'; end if;
 definicion:=replace(definicion,') select coalesce(jsonb_agg(to_jsonb(s)', $union$
 union all
 select 'Partidos',a.fecha,j->>'nombre',greatest(coalesce((j->>'importe')::numeric,0)-coalesce((j->>'cobrado')::numeric,0),0)
 from public.partidos t join public.planner_actividades a on a.id=t.id
 cross join lateral jsonb_array_elements(t.datos->'parejas') p
 cross join lateral jsonb_array_elements(p->'jugadores') j where p->>'estado'='Inscripta'
 ) select coalesce(jsonb_agg(to_jsonb(s)$union$);
 execute definicion;
end $migration$;
notify pgrst,'reload schema';
commit;
-- La asistencia/cobro puede proponer una incorporación de Partidos para revisar en Logros.
begin;
do $migration$
declare definicion text;
begin
 definicion:=regexp_replace(pg_get_viewdef('point_logros.eventos'::regclass,true),';\s*$','');
 execute 'create or replace view point_logros.eventos as '||definicion||$union$
 union all
 select 'Partido',t.id::text||':'||(j->>'id'),point_logros.cliente(null,j->>'telefono',j->>'nombre'),j->>'nombre','Partidos',a.fecha,t.creado_en,
 concat(a.titulo,' · ',a.fecha,' ',a.inicio),
 (j->>'presencia'='Presente' or coalesce((j->>'cobrado')::numeric,0)>0),p->>'estado'='Inscripta',
 case when coalesce((j->>'cobrado')::numeric,0)>0 then 'Pago registrado' else 'Asistencia registrada' end,
 point_logros.telefono(j->>'telefono') is null
 from public.partidos t join public.planner_actividades a on a.id=t.id
 cross join lateral jsonb_array_elements(t.datos->'parejas') p
 cross join lateral jsonb_array_elements(p->'jugadores') j
 $union$;
end $migration$;
commit;
