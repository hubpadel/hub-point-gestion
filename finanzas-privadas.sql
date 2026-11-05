begin;
create table point_logros.finanzas_gastos (
 id uuid primary key default gen_random_uuid(), fecha date not null,
 categoria text not null check(categoria in ('Servicios','Mantenimiento','Insumos','Personal','Impuestos','Otros')),
 concepto text not null check(length(trim(concepto)) between 3 and 500),
 importe numeric(14,2) not null check(importe>0), medio text not null check(medio in ('Efectivo','Transferencia','Otro')),
 creado_por uuid not null references auth.users(id), creado_en timestamptz not null default now(),
 anulado_en timestamptz, anulado_por uuid references auth.users(id), motivo_anulacion text
);
alter table point_logros.finanzas_gastos enable row level security;
create policy finanzas_sin_acceso_directo on point_logros.finanzas_gastos for all to anon,authenticated using(false) with check(false);
revoke all on point_logros.finanzas_gastos from public,anon,authenticated;
create index finanzas_gastos_fecha on point_logros.finanzas_gastos(fecha);

-- Una fuente por cobro: corporativos_ingresos es una vista de corporativos_pagos.
create view point_logros.finanzas_cobros as
select 'Clases'::text programa,p.id::text referencia,p.fecha_cobro fecha,
 coalesce(a.nombre,'Alumno sin nombre') cliente,coalesce(p.medio_pago,'Sin indicar') medio,p.importe::numeric importe,
 ('Pago '||p.tipo_pago)::text concepto,false fecha_inferida
from public.pagos p left join public.alumnos a on a.id=p.alumno_id
union all
select 'Canchas abiertas',j.id::text,coalesce(j.fecha_pago,e.fecha),j.nombre,coalesce(j.medio_pago,'Sin indicar'),
 coalesce(nullif(j.importe_pagado,0),j.importe_esperado,0),
 concat(e.tipo,' ',e.categoria,' · ',e.fecha),j.fecha_pago is null
from public.cancha_abierta_jugadores j join public.canchas_abiertas e on e.id=j.cancha_abierta_id where j.pagado is true
union all
select 'Corporativos',p.id::text,p.fecha,e.empresa,coalesce(p.metodo,'Sin indicar'),p.importe,e.empresa,false
from public.corporativos_pagos p join public.corporativos_eventos e on e.id=p.evento_id
union all
select 'Torneos',t.id::text||':'||(j->>'id'),coalesce(nullif(j->>'fecha','')::date,a.fecha),j->>'nombre',coalesce(nullif(j->>'medio',''),'Sin indicar'),
 coalesce((j->>'cobrado')::numeric,0),a.titulo,nullif(j->>'fecha','') is null
from public.torneos t join public.planner_actividades a on a.id=t.id
cross join lateral jsonb_array_elements(coalesce(t.datos->'parejas','[]')) p
cross join lateral jsonb_array_elements(coalesce(p->'jugadores','[]')) j
where coalesce((j->>'cobrado')::numeric,0)>0;
revoke all on point_logros.finanzas_cobros from public,anon,authenticated;

create view point_logros.finanzas_costos as
select 'Clases'::text programa,p.fecha_cobro fecha,'Liquidación estimada'::text tipo,
 coalesce(t.nombre,'Profesor sin asignar') concepto,
 round(p.importe*coalesce(t.porcentaje_liquidacion,50)/100,2) importe,
 'Estimado; no confirma pago al profesor'::text estado
from public.pagos p left join public.profesores t on t.id=p.profesor_id
union all
select 'Canchas abiertas',e.fecha,'Coordinación',coalesce(e.coordinador_nombre,'Sin coordinador'),coalesce(e.coordinador_importe,0),
 case when e.coordinador_pagado then 'Pago registrado' else 'Pendiente de pago' end
from public.canchas_abiertas e where e.estado<>'Cancelada'
union all
select 'Canchas abiertas',e.fecha,'Cancha',concat(e.tipo,' ',e.categoria),coalesce(e.costo_cancha,0),'Costo registrado; sin comprobante de pago'
from public.canchas_abiertas e where e.estado<>'Cancelada'
union all
select 'Torneos',a.fecha,'Coordinación',coalesce(t.datos->>'coordinador','Sin coordinador'),coalesce((t.datos->>'coordinador_importe')::numeric,0),'Costo registrado; sin comprobante de pago'
from public.torneos t join public.planner_actividades a on a.id=t.id
union all
select 'Torneos',a.fecha,'Cancha',a.titulo,coalesce((t.datos->>'costo_cancha')::numeric,0),'Costo registrado; sin comprobante de pago'
from public.torneos t join public.planner_actividades a on a.id=t.id;
revoke all on point_logros.finanzas_costos from public,anon,authenticated;

create or replace function point_logros.finanzas_panel(p_mes date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare inicio date; fin date; cobros jsonb; costos jsonb; gastos jsonb; pendientes jsonb;
begin
 if not point_logros.hub_logros_es_admin() then raise exception 'Acceso exclusivo de administración' using errcode='42501'; end if;
 if p_mes is null then raise exception 'Elegí un mes'; end if;
 inicio=date_trunc('month',p_mes)::date;fin=(inicio+interval '1 month')::date;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.fecha,x.programa,x.referencia),'[]') into cobros from point_logros.finanzas_cobros x where x.fecha>=inicio and x.fecha<fin;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.fecha,x.programa,x.concepto),'[]') into costos from point_logros.finanzas_costos x where x.fecha>=inicio and x.fecha<fin and x.importe<>0;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.fecha,x.creado_en),'[]') into gastos from point_logros.finanzas_gastos x where x.fecha>=inicio and x.fecha<fin;
 with saldos as (
 select 'Canchas abiertas'::text programa,e.fecha,j.nombre cliente,
 greatest(coalesce(j.importe_esperado,0)-case when j.pagado then coalesce(nullif(j.importe_pagado,0),j.importe_esperado,0) else 0 end,0) importe
 from public.canchas_abiertas e join public.cancha_abierta_jugadores j on j.cancha_abierta_id=e.id where e.estado<>'Cancelada'
 union all
 select 'Corporativos',e.fecha,e.empresa,greatest(coalesce(e.importe,0)-coalesce((select sum(p.importe) from public.corporativos_pagos p where p.evento_id=e.id),0),0)
 from public.corporativos_eventos e where e.estado<>'Cancelado' and e.estado<>'Cancelada'
 union all
 select 'Torneos',a.fecha,j->>'nombre',greatest(coalesce((j->>'importe')::numeric,0)-coalesce((j->>'cobrado')::numeric,0),0)
 from public.torneos t join public.planner_actividades a on a.id=t.id
 cross join lateral jsonb_array_elements(coalesce(t.datos->'parejas','[]')) p
 cross join lateral jsonb_array_elements(coalesce(p->'jugadores','[]')) j where coalesce(p->>'estado','Inscripta')<>'Cancelada'
 ) select coalesce(jsonb_agg(to_jsonb(s) order by s.fecha,s.cliente),'[]') into pendientes from saldos s where s.fecha>=inicio and s.fecha<fin and s.importe>0;
 return jsonb_build_object('mes',inicio,'generado_en',now(),'cobros',cobros,'costos',costos,'gastos',gastos,'pendientes',pendientes);
end $$;

create function point_logros.finanzas_guardar_gasto(p_id uuid,p_fecha date,p_categoria text,p_concepto text,p_importe numeric,p_medio text) returns uuid
language plpgsql security definer set search_path='' as $$
begin
 if not point_logros.hub_logros_es_admin() then raise exception 'Acceso exclusivo de administración' using errcode='42501'; end if;
 if p_id is null or p_importe<>round(p_importe,2) then raise exception 'Importe inválido'; end if;
 -- Un identificador por envío evita duplicar un gasto al reintentar la conexión.
 insert into point_logros.finanzas_gastos(id,fecha,categoria,concepto,importe,medio,creado_por)
 values(p_id,p_fecha,p_categoria,trim(p_concepto),p_importe,p_medio,auth.uid()) on conflict(id) do nothing;
 return p_id;
end $$;
create function point_logros.finanzas_anular_gasto(p_id uuid,p_motivo text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not point_logros.hub_logros_es_admin() then raise exception 'Acceso exclusivo de administración' using errcode='42501'; end if;
 if length(trim(coalesce(p_motivo,'')))<3 then raise exception 'Indicá el motivo'; end if;
 update point_logros.finanzas_gastos set anulado_en=now(),anulado_por=auth.uid(),motivo_anulacion=trim(p_motivo) where id=p_id and anulado_en is null;
 if not found then raise exception 'El gasto ya fue anulado o no existe'; end if;
end $$;
create function public.hub_finanzas_panel(p_mes date) returns jsonb language sql security invoker set search_path='' as $$ select point_logros.finanzas_panel(p_mes); $$;
create function public.hub_finanzas_guardar_gasto(p_id uuid,p_fecha date,p_categoria text,p_concepto text,p_importe numeric,p_medio text) returns uuid language sql security invoker set search_path='' as $$ select point_logros.finanzas_guardar_gasto(p_id,p_fecha,p_categoria,p_concepto,p_importe,p_medio); $$;
create function public.hub_finanzas_anular_gasto(p_id uuid,p_motivo text) returns void language sql security invoker set search_path='' as $$ select point_logros.finanzas_anular_gasto(p_id,p_motivo); $$;
revoke all on function point_logros.finanzas_panel(date),point_logros.finanzas_guardar_gasto(uuid,date,text,text,numeric,text),point_logros.finanzas_anular_gasto(uuid,text),public.hub_finanzas_panel(date),public.hub_finanzas_guardar_gasto(uuid,date,text,text,numeric,text),public.hub_finanzas_anular_gasto(uuid,text) from public,anon;
grant execute on function point_logros.finanzas_panel(date),point_logros.finanzas_guardar_gasto(uuid,date,text,text,numeric,text),point_logros.finanzas_anular_gasto(uuid,text),public.hub_finanzas_panel(date),public.hub_finanzas_guardar_gasto(uuid,date,text,text,numeric,text),public.hub_finanzas_anular_gasto(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
