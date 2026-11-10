begin;
create function public.partidos_guardar_y_finalizar(
 p_id uuid, p_revision integer, p_version jsonb, p_actividad jsonb, p_datos jsonb
) returns void language plpgsql security invoker set search_path='' as $$
declare revision_guardada integer;
begin
 revision_guardada:=public.partidos_guardar(p_id,p_revision,p_version,p_actividad,p_datos);
 if exists(select 1 from public.partidos where id=p_id and finalizado_en is null) then
  perform public.partidos_cerrar(p_id,revision_guardada,true);
 end if;
end $$;
revoke all on function public.partidos_guardar_y_finalizar(uuid,integer,jsonb,jsonb,jsonb) from public;
grant execute on function public.partidos_guardar_y_finalizar(uuid,integer,jsonb,jsonb,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
commit;
