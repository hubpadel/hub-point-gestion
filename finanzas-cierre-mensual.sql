begin;
alter table point_logros.finanzas_gastos drop constraint finanzas_gastos_categoria_check;
alter table point_logros.finanzas_gastos add constraint finanzas_gastos_categoria_check check(categoria in ('Servicios','Mantenimiento','Insumos','Personal','Impuestos','Otros','Gastos generales del predio'));
create table point_logros.finanzas_ingresos_manuales(
 id uuid primary key,fecha date not null,rubro text not null check(rubro in ('Alquileres de canchas','Abonos de canchas')),
 cliente text not null default '',concepto text not null check(length(trim(concepto)) between 3 and 500),
 importe numeric(14,2) not null check(importe>0),medio text not null check(medio in ('Efectivo','Transferencia','Otro')),
 mes_abonado date,creado_por uuid not null references auth.users(id),creado_en timestamptz not null default now(),
 anulado_en timestamptz,anulado_por uuid references auth.users(id),motivo_anulacion text,
 check(rubro<>'Abonos de canchas' or mes_abonado is not null),check(mes_abonado is null or extract(day from mes_abonado)=1)
);
create index finanzas_manuales_fecha on point_logros.finanzas_ingresos_manuales(fecha);
create table point_logros.finanzas_comision_mes(
 mes date primary key check(extract(day from mes)=1),rubros text[] not null,
 actualizado_por uuid not null references auth.users(id),actualizado_en timestamptz not null default now(),
 check(rubros<@array['Clases','Canchas abiertas','Partidos','Torneos','Corporativos','Alquileres de canchas','Abonos de canchas'] and array_position(rubros,null) is null)
);
create table point_logros.finanzas_comision_historial(
 id uuid primary key default gen_random_uuid(),mes date not null,rubros text[] not null,
 autor uuid not null references auth.users(id),creado_en timestamptz not null default now()
);
alter table point_logros.finanzas_ingresos_manuales enable row level security;
alter table point_logros.finanzas_comision_mes enable row level security;
alter table point_logros.finanzas_comision_historial enable row level security;
create policy ingresos_manuales_privados on point_logros.finanzas_ingresos_manuales for all to anon,authenticated using(false) with check(false);
create policy comision_mes_privada on point_logros.finanzas_comision_mes for all to anon,authenticated using(false) with check(false);
create policy comision_historial_privado on point_logros.finanzas_comision_historial for all to anon,authenticated using(false) with check(false);
revoke all on point_logros.finanzas_ingresos_manuales,point_logros.finanzas_comision_mes,point_logros.finanzas_comision_historial from public,anon,authenticated;

create function point_logros.finanzas_guardar_ingreso(p_id uuid,p_fecha date,p_rubro text,p_cliente text,p_concepto text,p_importe numeric,p_medio text,p_mes_abonado date default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare anterior point_logros.finanzas_ingresos_manuales;periodo date;
begin
 if not point_logros.hub_logros_es_admin() then raise exception 'Acceso exclusivo de administración' using errcode='42501';end if;
 if p_id is null or p_fecha is null or p_importe is null or p_importe<=0 or p_importe<>round(p_importe,2) then raise exception 'Completá fecha e importe válido con hasta dos decimales';end if;
 periodo:=case when p_rubro='Abonos de canchas' then date_trunc('month',p_mes_abonado)::date end;
 insert into point_logros.finanzas_ingresos_manuales(id,fecha,rubro,cliente,concepto,importe,medio,mes_abonado,creado_por)
 values(p_id,p_fecha,p_rubro,trim(coalesce(p_cliente,'')),trim(p_concepto),p_importe,p_medio,periodo,auth.uid()) on conflict(id) do nothing;
 select * into anterior from point_logros.finanzas_ingresos_manuales where id=p_id;
 if row(anterior.fecha,anterior.rubro,anterior.cliente,anterior.concepto,anterior.importe,anterior.medio,anterior.mes_abonado)
 is distinct from row(p_fecha,p_rubro,trim(coalesce(p_cliente,'')),trim(p_concepto),p_importe,p_medio,periodo) or anterior.anulado_en is not null then raise exception 'El envío ya existe con otros datos. Cerrá y volvé a abrir el formulario';end if;
 return p_id;
end $$;
create function point_logros.finanzas_anular_ingreso(p_id uuid,p_motivo text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not point_logros.hub_logros_es_admin() then raise exception 'Acceso exclusivo de administración' using errcode='42501';end if;
 if length(trim(coalesce(p_motivo,'')))<3 then raise exception 'Indicá el motivo de anulación';end if;
 update point_logros.finanzas_ingresos_manuales set anulado_en=now(),anulado_por=auth.uid(),motivo_anulacion=trim(p_motivo) where id=p_id and anulado_en is null;
 if not found then raise exception 'El ingreso no existe o ya está anulado';end if;
end $$;
create function point_logros.finanzas_configurar_comision(p_mes date,p_rubros text[]) returns void
language plpgsql security definer set search_path='' as $$
declare mes_normal date;seleccion text[];
begin
 if not point_logros.hub_logros_es_admin() then raise exception 'Acceso exclusivo de administración' using errcode='42501';end if;
 if p_mes is null or p_rubros is null or array_position(p_rubros,null) is not null or not p_rubros<@array['Clases','Canchas abiertas','Partidos','Torneos','Corporativos','Alquileres de canchas','Abonos de canchas'] then raise exception 'Elegí un mes y rubros válidos';end if;
 mes_normal:=date_trunc('month',p_mes)::date;seleccion:=array(select distinct x from unnest(p_rubros) x order by x);
 perform pg_advisory_xact_lock(hashtext('point_comision_'||mes_normal::text));
 if exists(select 1 from point_logros.finanzas_comision_mes where mes=mes_normal and rubros=seleccion) then return;end if;
 insert into point_logros.finanzas_comision_mes(mes,rubros,actualizado_por) values(mes_normal,seleccion,auth.uid())
 on conflict(mes) do update set rubros=excluded.rubros,actualizado_por=excluded.actualizado_por,actualizado_en=now();
 insert into point_logros.finanzas_comision_historial(mes,rubros,autor) values(mes_normal,seleccion,auth.uid());
end $$;

create function point_logros.finanzas_resumen_mensual(p_mes date) returns jsonb
language plpgsql security invoker set search_path='' set jit=off as $$
declare base jsonb;manuales jsonb;cobros jsonb;regla point_logros.finanzas_comision_mes;configurada boolean;
 programas jsonb;ingresos numeric;costos numeric;gastos numeric;gastos_predio numeric;base_hub numeric;comision numeric;
 total_efectivo numeric;transferencias numeric;otros numeric;
begin
 if not point_logros.hub_logros_es_admin() then raise exception 'Acceso exclusivo de administración' using errcode='42501';end if;
 base:=point_logros.finanzas_panel(p_mes);
 select * into regla from point_logros.finanzas_comision_mes where mes=(base->>'mes')::date;configurada:=found;
 select coalesce(jsonb_agg(to_jsonb(m) order by m.fecha,m.creado_en),'[]') into manuales
 from point_logros.finanzas_ingresos_manuales m where m.fecha>=(base->>'mes')::date and m.fecha<((base->>'mes')::date+interval '1 month');
 select coalesce(jsonb_agg(jsonb_build_object('programa',m->>'rubro','referencia','Manual '||(m->>'id'),'fecha',m->>'fecha','cliente',m->>'cliente','medio',m->>'medio','importe',(m->>'importe')::numeric,
 'concepto',(m->>'concepto')||case when m->>'mes_abonado' is not null then ' · Mes abonado '||left(m->>'mes_abonado',7) else '' end,'fecha_inferida',false)),'[]') into cobros
 from jsonb_array_elements(manuales) m where m->>'anulado_en' is null;
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
 return base||jsonb_build_object('cobros',cobros,'ingresos_manuales',manuales,'programas',programas,
 'comision',jsonb_build_object('configurada',configurada,'porcentaje',10,'rubros',coalesce(to_jsonb(regla.rubros),'[]'),'actualizado_en',regla.actualizado_en,'base',base_hub,'importe',comision),
 'calculos',jsonb_build_object('ingresos',ingresos,'costos',costos,'gastos',gastos,'gastos_predio',gastos_predio,'otros_gastos',gastos-gastos_predio,
 'efectivo',total_efectivo,'transferencias',transferencias,'otros_medios',otros,'base_hub',base_hub,'comision_hub',comision,'antes_hub',ingresos-costos-gastos,'resultado',ingresos-costos-gastos-comision));
end $$;
revoke all on function point_logros.finanzas_resumen_mensual(date) from public,anon,authenticated;
create function point_logros.finanzas_panel_completo(p_mes date,p_comparar date) returns jsonb
language plpgsql security definer set search_path='' set jit=off as $$
begin
 if not point_logros.hub_logros_es_admin() then raise exception 'Acceso exclusivo de administración' using errcode='42501';end if;
 if p_mes is null or p_comparar is null then raise exception 'Elegí los meses del informe y comparación';end if;
 return jsonb_build_object('actual',point_logros.finanzas_resumen_mensual(p_mes),'comparado',point_logros.finanzas_resumen_mensual(p_comparar));
end $$;
create function public.hub_finanzas_panel_completo(p_mes date,p_comparar date) returns jsonb language sql security invoker set search_path='' as $$select point_logros.finanzas_panel_completo(p_mes,p_comparar);$$;
create function public.hub_finanzas_guardar_ingreso(p_id uuid,p_fecha date,p_rubro text,p_cliente text,p_concepto text,p_importe numeric,p_medio text,p_mes_abonado date default null) returns uuid language sql security invoker set search_path='' as $$select point_logros.finanzas_guardar_ingreso(p_id,p_fecha,p_rubro,p_cliente,p_concepto,p_importe,p_medio,p_mes_abonado);$$;
create function public.hub_finanzas_anular_ingreso(p_id uuid,p_motivo text) returns void language sql security invoker set search_path='' as $$select point_logros.finanzas_anular_ingreso(p_id,p_motivo);$$;
create function public.hub_finanzas_configurar_comision(p_mes date,p_rubros text[]) returns void language sql security invoker set search_path='' as $$select point_logros.finanzas_configurar_comision(p_mes,p_rubros);$$;
revoke all on function point_logros.finanzas_guardar_ingreso(uuid,date,text,text,text,numeric,text,date),point_logros.finanzas_anular_ingreso(uuid,text),point_logros.finanzas_configurar_comision(date,text[]),point_logros.finanzas_panel_completo(date,date),public.hub_finanzas_guardar_ingreso(uuid,date,text,text,text,numeric,text,date),public.hub_finanzas_anular_ingreso(uuid,text),public.hub_finanzas_configurar_comision(date,text[]),public.hub_finanzas_panel_completo(date,date) from public,anon;
grant execute on function point_logros.finanzas_guardar_ingreso(uuid,date,text,text,text,numeric,text,date),point_logros.finanzas_anular_ingreso(uuid,text),point_logros.finanzas_configurar_comision(date,text[]),point_logros.finanzas_panel_completo(date,date),public.hub_finanzas_guardar_ingreso(uuid,date,text,text,text,numeric,text,date),public.hub_finanzas_anular_ingreso(uuid,text),public.hub_finanzas_configurar_comision(date,text[]),public.hub_finanzas_panel_completo(date,date) to authenticated;
notify pgrst,'reload schema';
commit;
