-- Misma audiencia efectiva verificada en clases y corporativos el 19/10/2026.
-- No cambia permisos de tablas ni funciones existentes.
begin;
revoke all on public.planner_actividades,public.planner_clases,public.planner_agenda from public,anon,authenticated;
grant select,insert,update on public.planner_actividades,public.planner_clases to anon,authenticated;
grant select on public.planner_agenda to anon,authenticated;
create policy planner_actividades_lectura on public.planner_actividades for select to anon,authenticated using(true);
create policy planner_actividades_alta on public.planner_actividades for insert to anon,authenticated with check(true);
create policy planner_actividades_edicion on public.planner_actividades for update to anon,authenticated using(true) with check(true);
create policy planner_clases_lectura on public.planner_clases for select to anon,authenticated using(true);
create policy planner_clases_alta on public.planner_clases for insert to anon,authenticated with check(true);
create policy planner_clases_edicion on public.planner_clases for update to anon,authenticated using(true) with check(true);
grant execute on function public.planner_canchas(text),public.planner_guardar(text,uuid,jsonb,jsonb),public.planner_asignar_clases(date,text) to anon,authenticated;
commit;
