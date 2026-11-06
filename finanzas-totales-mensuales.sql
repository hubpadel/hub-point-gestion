begin;
create table point_logros.finanzas_totales_mes (
 mes date primary key check(mes=date_trunc('month',mes)::date),
 alquileres numeric(14,2) not null check(alquileres>=0),abonos numeric(14,2) not null check(abonos>=0),costo_predio numeric(14,2) not null check(costo_predio>=0),
 actualizado_por uuid not null references auth.users(id),actualizado_en timestamptz not null default now());
create table point_logros.finanzas_totales_historial(id uuid primary key default gen_random_uuid(),mes date not null,datos jsonb not null,autor uuid not null references auth.users(id),creado_en timestamptz not null default now());
alter table point_logros.finanzas_totales_mes enable row level security;
alter table point_logros.finanzas_totales_historial enable row level security;
create policy sin_acceso_directo on point_logros.finanzas_totales_mes for all using(false) with check(false);
create policy sin_acceso_directo on point_logros.finanzas_totales_historial for all using(false) with check(false);
revoke all on point_logros.finanzas_totales_mes,point_logros.finanzas_totales_historial from public,anon,authenticated;
create function point_logros.finanzas_guardar_totales_mes(p_mes date,p_alquileres numeric,p_abonos numeric,p_costo_predio numeric) returns void
language plpgsql security definer set search_path='' as $$
declare m date:=date_trunc('month',p_mes)::date;prev point_logros.finanzas_totales_mes;
begin
 if not point_logros.hub_logros_es_admin() then raise exception 'Acceso exclusivo de administración' using errcode='42501';end if;
 if m is null or p_alquileres is null or p_abonos is null or p_costo_predio is null or
 exists(select 1 from unnest(array[p_alquileres,p_abonos,p_costo_predio]) v where v<0 or v>999999999999.99 or v::text in ('NaN','Infinity','-Infinity') or v<>round(v,2)) then raise exception 'Ingresá importes no negativos con hasta dos decimales';end if;
 perform pg_advisory_xact_lock(hashtext('finanzas_totales:'||m));
 select * into prev from point_logros.finanzas_totales_mes where mes=m;
 if found and prev.alquileres=p_alquileres and prev.abonos=p_abonos and prev.costo_predio=p_costo_predio then return;end if;
 insert into point_logros.finanzas_totales_mes values(m,p_alquileres,p_abonos,p_costo_predio,auth.uid(),now())
 on conflict(mes) do update set alquileres=excluded.alquileres,abonos=excluded.abonos,costo_predio=excluded.costo_predio,actualizado_por=excluded.actualizado_por,actualizado_en=excluded.actualizado_en;
 insert into point_logros.finanzas_totales_historial(mes,datos,autor) values(m,jsonb_build_object('anterior',to_jsonb(prev),'alquileres',p_alquileres,'abonos',p_abonos,'costo_predio',p_costo_predio),auth.uid());
end $$;
revoke all on function point_logros.finanzas_guardar_totales_mes(date,numeric,numeric,numeric) from public,anon;
grant execute on function point_logros.finanzas_guardar_totales_mes(date,numeric,numeric,numeric) to authenticated;
create function public.hub_finanzas_guardar_totales_mes(p_mes date,p_alquileres numeric,p_abonos numeric,p_costo_predio numeric) returns void language sql security invoker set search_path='' as $$select point_logros.finanzas_guardar_totales_mes(p_mes,p_alquileres,p_abonos,p_costo_predio)$$;
revoke all on function public.hub_finanzas_guardar_totales_mes(date,numeric,numeric,numeric) from public,anon;
grant execute on function public.hub_finanzas_guardar_totales_mes(date,numeric,numeric,numeric) to authenticated;
create or replace function point_logros.finanzas_resumen_mensual(p_mes date) returns jsonb
language plpgsql security invoker set search_path='' set jit=off as $$
declare base jsonb;manuales jsonb;cobros jsonb;regla point_logros.finanzas_comision_mes;configurada boolean;regla_mensual boolean;
 programas jsonb;ingresos numeric;costos numeric;gastos numeric;gastos_predio numeric;base_hub numeric;comision numeric;
 mensual point_logros.finanzas_totales_mes;usa_totales boolean;total_efectivo numeric;transferencias numeric;otros numeric;
begin
 if not point_logros.hub_logros_es_admin() then raise exception 'Acceso exclusivo de administración' using errcode='42501';end if;
 base:=point_logros.finanzas_panel(p_mes);
 select * into regla from point_logros.finanzas_comision_mes where mes=(base->>'mes')::date;regla_mensual:=found;configurada:=true;
 if not regla_mensual then regla.rubros:=array['Clases','Canchas abiertas','Partidos','Torneos','Corporativos','Abonos de canchas'];end if;
 select coalesce(jsonb_agg(to_jsonb(m) order by m.fecha,m.creado_en),'[]') into manuales
 from point_logros.finanzas_ingresos_manuales m where m.fecha>=(base->>'mes')::date and m.fecha<((base->>'mes')::date+interval '1 month');
 select coalesce(jsonb_agg(jsonb_build_object('programa',m->>'rubro','referencia','Manual '||(m->>'id'),'fecha',m->>'fecha','cliente',m->>'cliente','medio',m->>'medio','importe',(m->>'importe')::numeric,
 'concepto',(m->>'concepto')||case when m->>'mes_abonado' is not null then ' · Mes abonado '||left(m->>'mes_abonado',7) else '' end,'fecha_inferida',false)),'[]') into cobros
 from jsonb_array_elements(manuales) m where m->>'anulado_en' is null;
 select * into mensual from point_logros.finanzas_totales_mes where mes=(base->>'mes')::date;usa_totales:=found;
 if usa_totales then
 cobros:=jsonb_build_array(
 jsonb_build_object('programa','Alquileres de canchas','referencia','Total mensual alquileres','fecha',mensual.mes,'cliente','','medio','Total mensual sin desglose','importe',mensual.alquileres,'concepto','Facturación mensual de alquileres','fecha_inferida',false),
 jsonb_build_object('programa','Abonos de canchas','referencia','Total mensual abonos','fecha',mensual.mes,'cliente','','medio','Total mensual sin desglose','importe',mensual.abonos,'concepto','Facturación mensual de abonos','fecha_inferida',false));
 base:=jsonb_set(base,'{gastos}',coalesce((select jsonb_agg(g) from jsonb_array_elements(base->'gastos') g where g->>'categoria'<>'Gastos generales del predio'),'[]')||jsonb_build_array(jsonb_build_object('id','mensual:'||mensual.mes,'fecha',mensual.mes,'categoria','Gastos generales del predio','concepto','Costo total mensual del predio','medio','Total mensual sin desglose','importe',mensual.costo_predio,'es_total_mensual',true)));
 end if;
 cobros:=(base->'cobros')||cobros;
 with rubros as(select unnest(array['Clases','Canchas abiertas','Partidos','Torneos','Corporativos','Alquileres de canchas','Abonos de canchas']) rubro),
 totales as(select r.rubro,coalesce((select sum((c->>'importe')::numeric) from jsonb_array_elements(cobros) c where c->>'programa'=r.rubro),0) cobrado,
 coalesce((select sum((c->>'importe')::numeric) from jsonb_array_elements(base->'costos') c where c->>'programa'=r.rubro),0) costo,
 coalesce((select sum((c->>'importe')::numeric) from jsonb_array_elements(cobros) c where c->>'programa'=r.rubro and c->>'medio'='Efectivo'),0) efectivo,
 coalesce((select sum((c->>'importe')::numeric) from jsonb_array_elements(cobros) c where c->>'programa'=r.rubro and c->>'medio'='Transferencia'),0) transferencia
 from rubros r),
 calculados as(select *,case when not configurada then null when rubro=any(regla.rubros) then round(cobrado*0.10,2) else 0 end hub from totales)
 select jsonb_agg(jsonb_build_object('programa',rubro,'cobrado',cobrado,'costo',costo,'efectivo',efectivo,'transferencia',transferencia,'otros',cobrado-efectivo-transferencia,
 'lleva_comision',case when configurada then rubro=any(regla.rubros) else null end,'comision_hub',hub,'margen',cobrado-costo-hub)),
 sum(cobrado),sum(costo),case when configurada then coalesce(sum(cobrado) filter(where rubro=any(regla.rubros)),0) end,
 case when configurada then sum(hub) end,sum(efectivo),sum(transferencia),sum(cobrado-efectivo-transferencia)
 into programas,ingresos,costos,base_hub,comision,total_efectivo,transferencias,otros from calculados;
 select coalesce(sum((g->>'importe')::numeric),0),coalesce(sum((g->>'importe')::numeric) filter(where g->>'categoria'='Gastos generales del predio'),0)
 into gastos,gastos_predio from jsonb_array_elements(base->'gastos') g where g->>'anulado_en' is null;
 return base||jsonb_build_object('cobros',cobros,'totales_mensuales',case when usa_totales then to_jsonb(mensual) else null end,'ingresos_manuales',manuales,'programas',programas,
 'comision',jsonb_build_object('configurada',configurada,'origen',case when regla_mensual then 'mensual' else 'habitual' end,'porcentaje',10,'rubros',coalesce(to_jsonb(regla.rubros),'[]'),'actualizado_en',regla.actualizado_en,'base',base_hub,'importe',comision),
 'calculos',jsonb_build_object('ingresos',ingresos,'costos',costos,'gastos',gastos,'gastos_predio',gastos_predio,'otros_gastos',gastos-gastos_predio,
 'efectivo',total_efectivo,'transferencias',transferencias,'otros_medios',otros,'base_hub',base_hub,'comision_hub',comision,'antes_hub',ingresos-costos-gastos,'resultado',ingresos-costos-gastos-comision));
end $$;
revoke all on function point_logros.finanzas_resumen_mensual(date) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
