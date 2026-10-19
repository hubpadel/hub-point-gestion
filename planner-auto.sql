-- Tercera migración: clases de UNA HORA y cancha disponible, sin cancha fija
-- por profesor. Aplicar en pruebas tras planner.sql y planner-guards.sql.
begin;
create function public.planner_asignar_clases(p_fecha date,p_grupo text default null) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare g record; b record; candidate integer; chosen integer;
 ending time; existing integer; candidates integer[]; blocked boolean;
begin
 perform pg_advisory_xact_lock(71903142);
 for g in
   select coalesce(a.grupo_id,a.id)::text grupo,min(a.hora) inicio,max(a.hora) ultimo,
          array_agg(a.id order by a.id) ids
   from public.clases a where a.fecha=p_fecha
   and a.estado not in ('Cancelada','Cancelado')
   group by coalesce(a.grupo_id,a.id) order by min(a.hora),coalesce(a.grupo_id,a.id)::text
 loop
   if g.inicio is null or g.inicio<>g.ultimo or g.inicio>=time '23:00' then
     raise exception 'La clase debe tener un horario único y durar una hora dentro del día';
   end if;
   ending:=(g.inicio+interval '1 hour')::time;
   if g.grupo is distinct from p_grupo and
      (select count(*) from public.planner_clases where clase_id=any(g.ids) and fin=ending)=cardinality(g.ids) and
      (select count(distinct cancha) from public.planner_clases where clase_id=any(g.ids))=1 then
     continue;
   end if;
   -- Conserva la cancha actual si sigue disponible; nunca mueve otra reserva.
   select min(cancha) into existing from public.planner_clases where clase_id=any(g.ids);
   candidates:=case when existing is null then array[1,2,3]
      else array[existing]||array(select n from generate_series(1,3) n where n<>existing) end;
   chosen:=null;
   foreach candidate in array candidates loop
     blocked:=false;
     for b in select fuente,grupo,canchas,fin,inicio from public.planner_agenda where fecha=p_fecha and estado not in ('Cancelada','Cancelado') loop
       if b.fuente='clases' and b.grupo=g.grupo then continue; end if;
       -- Las clases todavía sin cancha se asignan en las siguientes iteraciones.
       -- La validación diferida comprueba el conjunto completo al confirmar.
       if b.fuente='clases' and b.canchas is null then continue; end if;
       if (b.canchas is null or candidate=any(b.canchas)) and
          (b.fin is null or (g.inicio<b.fin and ending>b.inicio)) then blocked:=true;exit;end if;
     end loop;
     if not blocked then chosen:=candidate;exit;end if;
   end loop;
   if chosen is null then raise exception 'No hay cancha disponible para una clase de una hora el % a las %',p_fecha,g.inicio;end if;
   insert into public.planner_clases(clase_id,cancha,fin)
     select id,chosen,ending from unnest(g.ids) id
   on conflict(clase_id) do update set cancha=excluded.cancha,fin=excluded.fin
   where (planner_clases.cancha,planner_clases.fin) is distinct from (excluded.cancha,excluded.fin);
 end loop;
end $$;
revoke all on function public.planner_asignar_clases(date,text) from public;

create function public.planner_auto_clase() returns trigger language plpgsql
security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' then
   if (new.fecha,new.hora,coalesce(to_jsonb(new)->>'estado','') in ('Cancelada','Cancelado')) is not distinct from
      (old.fecha,old.hora,coalesce(to_jsonb(old)->>'estado','') in ('Cancelada','Cancelado')) then return null;end if;
 end if;
 -- Se ejecuta al final de la transacción: todos los alumnos de un alta grupal
 -- ya están presentes. Los permisos de escritura siguen siendo los del usuario.
 perform public.planner_asignar_clases(new.fecha,coalesce(to_jsonb(new)->>'grupo_id',new.id::text));
 return null;
end $$;
revoke all on function public.planner_auto_clase() from public;
create constraint trigger planner_auto_clase after insert or update on public.clases
deferrable initially deferred for each row execute function public.planner_auto_clase();

-- Asigna las clases previas en esta misma transacción. Si no hay capacidad o
-- hay un bloqueo existente se revierte todo, sin cambiar fechas ni profesores.
do $$ declare day date;begin
 for day in select distinct fecha from public.clases order by fecha loop
   begin
     perform public.planner_asignar_clases(day);
   exception when raise_exception then
     if day>=current_date then raise; end if;
     -- Conserva íntegra la fecha histórica con un conflicto previo. El
     -- subbloque revierte todas sus asignaciones; queda visible sin cancha.
     raise notice 'Fecha histórica % pendiente de revisión: %',day,sqlerrm;
   end;
 end loop;
end $$;
commit;
