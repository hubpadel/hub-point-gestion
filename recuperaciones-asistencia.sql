-- Corrección del circuito Asistencia -> Clases a recuperar -> Agenda.
begin;
-- Amplía exclusivamente el CHECK conocido de estado; rechaza variantes inesperadas.
do $$ declare x record; expected text:=$def$CHECK ((estado = ANY (ARRAY['Pendiente'::text, 'Presente'::text, 'Ausente'::text, 'Canceló'::text, 'Recupera'::text])))$def$;
begin
 for x in select conname,pg_get_constraintdef(oid) def from pg_constraint where conrelid='public.clases'::regclass and contype='c'
 and conkey=array[(select attnum from pg_attribute where attrelid='public.clases'::regclass and attname='estado')] loop
   if x.def<>expected then raise exception 'La restricción de asistencia cambió: revisar antes de migrar'; end if;
   execute format('alter table public.clases drop constraint %I',x.conname);
 end loop;
end $$;
alter table public.clases add constraint clases_estado_recuperacion_check check(estado in ('Pendiente','Presente','Ausente','Canceló','Recupera','Clase a recuperar'));
alter table public.recuperaciones add column origen text not null default 'manual' check(origen in ('manual','asistencia','historico'));
-- Importa sólo alumnos efectivamente marcados, sin inventar motivos ni grupos.
do $$ declare c public.clases; rid uuid;
begin
 for c in select x.* from public.clases x where x.estado in ('Recupera','Clase a recuperar')
 and not exists(select 1 from public.recuperaciones_participantes p where p.clase_id=x.id) order by x.id loop
   rid:=gen_random_uuid();
   insert into public.recuperaciones(id,motivo,observaciones,origen) values(rid,'individual','Pendiente histórico marcado en Asistencia. Revisar antes de reagendar.','historico');
   insert into public.recuperaciones_participantes(recuperacion_id,clase_id,original) values(rid,c.id,to_jsonb(c));
 end loop;
end $$;
create function public.recuperacion_desde_asistencia(p_clase uuid,p_modalidad text,p_original jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.clases; ids uuid[]; r public.recuperaciones; rid uuid;
begin
 perform pg_advisory_xact_lock(71903142);
 if p_modalidad is null or p_modalidad not in ('lluvia','individual') then raise exception 'Elegí la modalidad de suspensión'; end if;
 if p_modalidad='individual' and not exists(select 1 from public.recuperaciones_autorizadores where usuario_id=auth.uid()) then raise exception 'La recuperación individual requiere un usuario autorizado'; end if;
 select * into c from public.clases where id=p_clase for update;
 if not found then raise exception 'La clase original no existe'; end if;
 if p_original is null or not p_original ?& array['fecha','hora','alumno_id','profesor_id','estado','grupo_id'] then raise exception 'Falta la versión de la clase'; end if;
 if c.fecha is distinct from (p_original->>'fecha')::date or c.hora is distinct from (p_original->>'hora')::time
 or c.alumno_id is distinct from (p_original->>'alumno_id')::uuid or c.profesor_id is distinct from (p_original->>'profesor_id')::uuid
 or c.grupo_id is distinct from (p_original->>'grupo_id')::uuid then raise exception 'La clase cambió. Actualizá antes de suspender'; end if;
 if p_modalidad='lluvia' then
   select array_agg(id order by id) into ids from public.clases where coalesce(grupo_id,id)=coalesce(c.grupo_id,c.id) and fecha=c.fecha and hora=c.hora;
 else ids:=array[p_clase]; end if;
 perform 1 from public.clases where id=any(ids) order by id for update;
 select x.* into r from public.recuperaciones x join public.recuperaciones_participantes p on p.recuperacion_id=x.id where p.clase_id=p_clase;
 if found then
   if r.motivo<>p_modalidad or ids is distinct from (select array_agg(clase_id order by clase_id) from public.recuperaciones_participantes where recuperacion_id=r.id) then raise exception 'Hay otra recuperación registrada. Revisá Clases a recuperar'; end if;
   if not exists(select 1 from public.clases where id=any(ids) and estado<>'Clase a recuperar') then return r.id; end if;
   if r.realizada then raise exception 'La recuperación ya fue realizada'; end if;
 end if;
 if c.estado is distinct from p_original->>'estado' then raise exception 'La asistencia cambió. Actualizá'; end if;
 update public.clases set estado='Clase a recuperar' where id=any(ids);
 if r.id is not null then return r.id; end if;
 rid:=gen_random_uuid();
 perform public.recuperacion_crear(rid,p_clase,p_modalidad,'Suspensión registrada desde Asistencia');
 update public.recuperaciones set origen='asistencia' where id=rid;
 return rid;
end $$;
revoke all on function public.recuperacion_desde_asistencia(uuid,text,jsonb) from public;
grant execute on function public.recuperacion_desde_asistencia(uuid,text,jsonb) to anon,authenticated;

-- Nunca permite guardar el estado nuevo sin su pendiente, aun con otro cliente.
create function public.recuperacion_validar_asistencia() returns trigger language plpgsql
security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.clases where id=new.id and estado='Clase a recuperar')
 and not exists(select 1 from public.recuperaciones_participantes where clase_id=new.id) then
   raise exception 'Registrá la suspensión desde Clases a recuperar para conservar el vínculo';
 end if;
 return null;
end $$;
revoke all on function public.recuperacion_validar_asistencia() from public;
create constraint trigger recuperacion_asistencia_integridad after insert or update on public.clases
deferrable initially deferred for each row execute function public.recuperacion_validar_asistencia();

create or replace function public.recuperacion_programar(p_id uuid,p_revision integer,p_fecha date,p_inicio time,p_cancha integer)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.recuperaciones; aid uuid; finish time; datos jsonb; old_version jsonb; title text;
begin
 perform pg_advisory_xact_lock(71903142);
 select * into r from public.recuperaciones where id=p_id for update;
 if not found then raise exception 'Recuperación inexistente'; end if;
 if r.realizada then raise exception 'La recuperación ya fue realizada'; end if;
 if p_fecha is null or p_inicio is null or p_inicio>=time '23:00' or p_cancha is null or p_cancha not between 1 and 3 then raise exception 'Fecha, hora o cancha inválida'; end if;
 if exists(select 1 from public.recuperaciones_participantes where recuperacion_id=p_id and p_fecha+p_inicio <= (original->>'fecha')::date+(original->>'hora')::time) then raise exception 'La recuperación debe ser posterior a la clase original'; end if;
 finish:=(p_inicio+interval '1 hour')::time;
 select 'Clase recuperada · '||string_agg(distinct coalesce(a.nombre,'Alumno'),', ')||' · Prof. '||string_agg(distinct coalesce(t.nombre,'Profesor'),', ')
 into title from public.recuperaciones_participantes p
 left join public.alumnos a on a.id=(p.original->>'alumno_id')::uuid
 left join public.profesores t on t.id=(p.original->>'profesor_id')::uuid where p.recuperacion_id=p_id;
 datos:=jsonb_build_object('tipo','recuperaciones','titulo',coalesce(title,'Clase recuperada'),'fecha',p_fecha,'inicio',p_inicio,'fin',finish,'canchas',array[p_cancha]);
 if r.revision<>p_revision then
   if exists(select 1 from public.planner_actividades where id=r.actividad_id and fecha=p_fecha and inicio=p_inicio and canchas=array[p_cancha]) then return; end if;
   raise exception 'La recuperación cambió. Actualizá';
 end if;
 aid:=coalesce(r.actividad_id,r.id);
 select to_jsonb(a) into old_version from public.planner_actividades a where id=r.actividad_id;
 perform public.planner_guardar('planner_actividades',aid,old_version,datos);
 update public.recuperaciones set actividad_id=aid,revision=revision+1 where id=p_id;
end $$;
-- No modifica registros históricos ni pagos/liquidaciones al instalar.
commit;
