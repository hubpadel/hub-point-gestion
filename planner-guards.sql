-- Aplicar DESPUÉS de planner.sql en pruebas. Validar los triggers y roles reales
-- antes de desplegar ambas migraciones. No elimina ni reemplaza triggers existentes.
begin;
create function public.planner_serializar() returns trigger language plpgsql
set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(71903142);
 return null;
end $$;
-- Sólo la comprobación usa la visibilidad del propietario: impide que una política
-- de lectura parcial oculte una reserva al validar. Nunca escribe con esos permisos.
create function public.planner_validar_ocupacion() returns trigger language plpgsql security definer
set search_path=public,pg_temp as $$
declare a public.planner_agenda; b record; source text; rid uuid; jn jsonb:=to_jsonb(new); jo jsonb:=to_jsonb(old);
begin
 source:=case when tg_table_name='planner_clases' then 'clases' else tg_table_name end;
 rid:=case when tg_table_name='planner_clases' then (to_jsonb(new)->>'clase_id')::uuid else (to_jsonb(new)->>'id')::uuid end;
 -- Cambios en asistencia, importes o presupuesto no alteran la ocupación.
 if tg_op='UPDATE' and tg_table_name='clases' and
   jsonb_build_array(jn->'fecha',jn->'hora',coalesce(jn->>'estado','') in ('Cancelada','Cancelado'))=jsonb_build_array(jo->'fecha',jo->'hora',coalesce(jo->>'estado','') in ('Cancelada','Cancelado')) then return null; end if;
 if tg_op='UPDATE' and tg_table_name='canchas_abiertas' and
   jsonb_build_array(jn->'fecha',jn->'hora_inicio',jn->'hora_fin',jn->'cancha',jn->'estado')=jsonb_build_array(jo->'fecha',jo->'hora_inicio',jo->'hora_fin',jo->'cancha',jo->'estado') then return null; end if;
 if tg_op='UPDATE' and tg_table_name='corporativos_eventos' and
   jsonb_build_array(jn->'fecha',jn->'inicio',jn->'fin',jn->'canchas',jn->'estado')=jsonb_build_array(jo->'fecha',jo->'inicio',jo->'fin',jo->'canchas',jo->'estado') then return null; end if;
 if tg_op='UPDATE' and tg_table_name='planner_actividades' and (jn-'titulo')=(jo-'titulo') then return null; end if;
 select * into a from public.planner_agenda where fuente=source and id=rid;
 if not found or a.estado in ('Cancelada','Cancelado') then return null; end if;
 if a.inicio is null or (a.fin is not null and a.fin<=a.inicio) then raise exception 'Horario inválido'; end if;
 for b in select fuente,id,grupo,tipo,canchas,fin,inicio from public.planner_agenda where fecha=a.fecha and estado not in ('Cancelada','Cancelado') loop
   if b.fuente=a.fuente and (b.id=a.id or (a.fuente='clases' and a.grupo=b.grupo)) then continue; end if;
   if a.tipo='lluvia' and b.tipo<>'lluvia' then continue; end if;
   if (a.canchas is null or b.canchas is null or a.canchas&&b.canchas)
     and (a.fin is null or b.fin is null or (a.inicio<b.fin and a.fin>b.inicio))
   then raise exception 'Solapamiento: horario ocupado o datos de cancha/duración pendientes'; end if;
 end loop;
 return null;
end $$;
revoke all on function public.planner_serializar(),public.planner_validar_ocupacion() from public;
-- El bloqueo se toma ANTES de modificar filas. La validación diferida observa el
-- estado final de grupos y metadatos y revierte íntegra la transacción si falla.
create trigger planner_serializar before insert or update or delete on public.clases for each statement execute function public.planner_serializar();
create trigger planner_serializar before insert or update or delete on public.canchas_abiertas for each statement execute function public.planner_serializar();
create trigger planner_serializar before insert or update or delete on public.corporativos_eventos for each statement execute function public.planner_serializar();
create trigger planner_serializar before insert or update or delete on public.planner_clases for each statement execute function public.planner_serializar();
create trigger planner_serializar before insert or update or delete on public.planner_actividades for each statement execute function public.planner_serializar();
create constraint trigger planner_validar after insert or update on public.clases deferrable initially deferred for each row execute function public.planner_validar_ocupacion();
create constraint trigger planner_validar after insert or update on public.canchas_abiertas deferrable initially deferred for each row execute function public.planner_validar_ocupacion();
create constraint trigger planner_validar after insert or update on public.corporativos_eventos deferrable initially deferred for each row execute function public.planner_validar_ocupacion();
create constraint trigger planner_validar after insert or update on public.planner_clases deferrable initially deferred for each row execute function public.planner_validar_ocupacion();
create constraint trigger planner_validar after insert or update on public.planner_actividades deferrable initially deferred for each row execute function public.planner_validar_ocupacion();
commit;
