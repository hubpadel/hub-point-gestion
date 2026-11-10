begin;
alter table public.partidos add column finalizado_en timestamptz, add column archivado_en timestamptz;
alter table public.canchas_abiertas add column finalizado_en timestamptz, add column archivado_en timestamptz;

-- El cierre operativo conserva los estados que usa el historial de medallas.
create function public.partidos_cerrar(p_id uuid, p_revision integer, p_finalizar boolean)
returns void language plpgsql security invoker set search_path='' as $$
declare
 partido public.partidos;
 fin timestamp;
begin
 select * into partido from public.partidos where id=p_id for update;
 if not found or partido.revision is distinct from p_revision then
  raise exception 'El partido cambió. Actualizá la lista e intentá otra vez';
 end if;
 if partido.archivado_en is not null then raise exception 'Recuperá el partido antes de finalizarlo'; end if;
 if p_finalizar then
  select fecha+planner_actividades.fin into fin from public.planner_actividades where id=p_id;
  if fin is null or fin > (now() at time zone 'America/Argentina/Buenos_Aires') then
   raise exception 'Podés finalizar cuando termine el horario del partido';
  end if;
  if (select count(*) from jsonb_array_elements(partido.datos->'parejas') p where p->>'estado'='Inscripta')<>2
     or exists (
      select 1 from jsonb_array_elements(partido.datos->'parejas') p
      cross join lateral jsonb_array_elements(p->'jugadores') j
      where p->>'estado'='Inscripta'
      and (j->>'presencia' is distinct from 'Presente' or (j->>'cobrado')::numeric < (j->>'importe')::numeric)
     ) then
   raise exception 'Registrá dos parejas completas, sus asistencias y todos los cobros antes de finalizar';
  end if;
 end if;
 update public.partidos set finalizado_en=case when p_finalizar then now() else null end where id=p_id;
end $$;

create function public.canchas_abiertas_cerrar(p_id uuid, p_finalizar boolean)
returns void language plpgsql security invoker set search_path='' as $$
declare
 evento public.canchas_abiertas;
begin
 select * into evento from public.canchas_abiertas where id=p_id for update;
 if not found or evento.estado='Cancelada' then
  raise exception 'La cancha abierta ya no está disponible';
 end if;
 if evento.archivado_en is not null then raise exception 'Recuperá la cancha abierta antes de finalizarla'; end if;
 if p_finalizar then
  if evento.fecha+coalesce(evento.hora_fin,evento.hora_inicio) > (now() at time zone 'America/Argentina/Buenos_Aires') then
   raise exception 'Podés finalizar cuando termine el horario de la cancha abierta';
  end if;
  if not exists(select 1 from public.cancha_abierta_jugadores where cancha_abierta_id=p_id and presente is true) then
   raise exception 'Registrá al menos una asistencia antes de finalizar';
  end if;
  if exists (
   select 1 from public.cancha_abierta_jugadores where cancha_abierta_id=p_id
   and (presente is null or (presente and coalesce(importe_esperado,0)>0 and
    (pagado is not true or coalesce(nullif(importe_pagado,0),importe_esperado)<importe_esperado)))
  ) then
   raise exception 'Completá la asistencia y el pago de quienes jugaron antes de finalizar';
  end if;
 end if;
 update public.canchas_abiertas
 set finalizado_en=case when p_finalizar then now() else null end,
     estado=case when not p_finalizar and estado='Finalizada' then 'Activa' else estado end
 where id=p_id;
end $$;

-- Se comprueba la versión abierta en el formulario y se guarda todo en una transacción.
create function public.canchas_abiertas_guardar(
 p_id uuid, p_anterior jsonb, p_jugadores_anteriores jsonb, p_evento jsonb, p_jugadores jsonb
) returns void language plpgsql security invoker set search_path='' as $$
declare
 actual public.canchas_abiertas;
 nuevo public.canchas_abiertas;
 jugador public.cancha_abierta_jugadores;
 jugadores_actuales jsonb;
 hoy date:=(now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
 select * into actual from public.canchas_abiertas where id=p_id for update;
 if (actual.id is null and p_anterior is not null) or
    (actual.id is not null and to_jsonb(actual) is distinct from p_anterior) then
  raise exception 'La cancha abierta cambió. Volvé a abrirla antes de guardar';
 end if;
 if actual.archivado_en is not null or actual.finalizado_en is not null or actual.estado in ('Finalizada','Cancelada') then
  raise exception 'Reabrí la cancha abierta para editarla';
 end if;
 select coalesce(jsonb_agg(to_jsonb(j) order by j.id),'[]'::jsonb) into jugadores_actuales
 from public.cancha_abierta_jugadores j where j.cancha_abierta_id=p_id;
 if jugadores_actuales is distinct from p_jugadores_anteriores then
  raise exception 'Las inscripciones cambiaron. Volvé a abrir la cancha antes de guardar';
 end if;
 nuevo:=jsonb_populate_record(null::public.canchas_abiertas,p_evento);
 if nuevo.fecha is null or nuevo.hora_inicio is null or coalesce(trim(nuevo.categoria),'')='' then
  raise exception 'Completá fecha, horario y categoría';
 end if;
 if actual.id is null then
  insert into public.canchas_abiertas(id,fecha,hora_inicio,hora_fin,cancha,tipo,categoria,cupo_maximo,
   valor_por_jugador,costo_cancha,coordinador_nombre,coordinador_importe,coordinador_pagado,
   coordinador_medio_pago,coordinador_fecha_pago,observaciones,estado)
  values(p_id,nuevo.fecha,nuevo.hora_inicio,nuevo.hora_fin,nuevo.cancha,nuevo.tipo,nuevo.categoria,null,
   nuevo.valor_por_jugador,nuevo.costo_cancha,nuevo.coordinador_nombre,nuevo.coordinador_importe,
   nuevo.coordinador_pagado,nuevo.coordinador_medio_pago,case when nuevo.coordinador_pagado then hoy end,
   nuevo.observaciones,'Activa');
 else
  update public.canchas_abiertas set fecha=nuevo.fecha,hora_inicio=nuevo.hora_inicio,hora_fin=nuevo.hora_fin,
   cancha=nuevo.cancha,tipo=nuevo.tipo,categoria=nuevo.categoria,cupo_maximo=null,
   valor_por_jugador=nuevo.valor_por_jugador,costo_cancha=nuevo.costo_cancha,
   coordinador_nombre=nuevo.coordinador_nombre,coordinador_importe=nuevo.coordinador_importe,
   coordinador_pagado=nuevo.coordinador_pagado,coordinador_medio_pago=nuevo.coordinador_medio_pago,
   coordinador_fecha_pago=case when nuevo.coordinador_pagado then
    case when actual.coordinador_pagado then actual.coordinador_fecha_pago else hoy end end,
   observaciones=nuevo.observaciones where id=p_id;
 end if;
 if exists (
  select 1 from public.cancha_abierta_jugadores j where j.cancha_abierta_id=p_id
  and (j.pagado or j.presente) and not exists(select 1 from jsonb_array_elements(p_jugadores) x where x->>'id'=j.id::text)
 ) then
  raise exception 'No se puede quitar una inscripción con asistencia o pago registrado';
 end if;
 for jugador in select * from jsonb_populate_recordset(null::public.cancha_abierta_jugadores,p_jugadores) loop
  if jugador.id is null or coalesce(trim(jugador.nombre),'')='' or coalesce(jugador.importe_esperado,-1)<0 then
   raise exception 'Revisá el nombre y el importe de cada jugador';
  end if;
  insert into public.cancha_abierta_jugadores as anterior
   (id,cancha_abierta_id,nombre,presente,importe_esperado,pagado,medio_pago,fecha_pago,importe_pagado)
  values (jugador.id,p_id,jugador.nombre,jugador.presente,jugador.importe_esperado,jugador.pagado,
   case when jugador.pagado then jugador.medio_pago end,case when jugador.pagado then hoy end,
   case when jugador.pagado then jugador.importe_esperado else 0 end)
  on conflict(id) do update set nombre=excluded.nombre,presente=excluded.presente,
   importe_esperado=excluded.importe_esperado,pagado=excluded.pagado,medio_pago=excluded.medio_pago,
   fecha_pago=case when excluded.pagado and anterior.pagado then anterior.fecha_pago else excluded.fecha_pago end,
   importe_pagado=case when excluded.pagado and anterior.pagado then anterior.importe_pagado else excluded.importe_pagado end
  where anterior.cancha_abierta_id=p_id;
  if not found then raise exception 'La inscripción pertenece a otra actividad'; end if;
 end loop;
end $$;

create function public.actividades_archivar(p_tipo text, p_id uuid, p_archivar boolean)
returns void language plpgsql security invoker set search_path='' as $function$
begin
 if p_tipo='partidos' then
  update public.partidos set archivado_en=case when p_archivar then now() else null end
  where id=p_id and finalizado_en is null;
 elsif p_tipo='canchas_abiertas' then
  update public.canchas_abiertas set archivado_en=case when p_archivar then now() else null end
  where id=p_id and finalizado_en is null and coalesce(estado,'Activa') not in ('Finalizada','Cancelada');
 else
  raise exception 'Tipo de actividad inválido';
 end if;
 if not found then raise exception 'La actividad ya no está disponible para archivar'; end if;
end $function$;

revoke all on function public.actividades_archivar(text,uuid,boolean) from public;
grant execute on function public.actividades_archivar(text,uuid,boolean) to anon,authenticated;
revoke all on function public.partidos_cerrar(uuid,integer,boolean),
 public.canchas_abiertas_cerrar(uuid,boolean),
 public.canchas_abiertas_guardar(uuid,jsonb,jsonb,jsonb,jsonb) from public;
grant execute on function public.partidos_cerrar(uuid,integer,boolean),
 public.canchas_abiertas_cerrar(uuid,boolean),
 public.canchas_abiertas_guardar(uuid,jsonb,jsonb,jsonb,jsonb) to anon, authenticated;
notify pgrst,'reload schema';
commit;
