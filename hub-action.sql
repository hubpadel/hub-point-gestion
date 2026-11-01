-- Activación aditiva. No modifica tablas de alumnos, clases, planner ni pagos.
-- Conserva la audiencia que actualmente puede leer alumnos. Revisar esa audiencia antes de activar.
begin;
create table if not exists public.hub_action_tareas (
 id uuid primary key,
 version integer not null default 1,
 titulo text not null check(length(trim(titulo))>0),
 fecha date not null, hora time not null,
 responsable text not null check(responsable in ('Clari','Tamy')),
 prioridad integer not null check(prioridad between 1 and 4),
 tipo text not null check(tipo in ('Tarea','Propuesta','Recuperación')),
 estado text not null check(estado in ('Pendiente','Enviado','Interesada','Confirmada','Cerrada')),
 contacto text not null default '', telefono text not null default '',
 oferta text not null default '', motivo text not null default '', mensaje text not null default '',
 notas text not null default '', reserva text not null default '', seguimiento timestamp,
 origen text unique, alumno_id uuid,
 historial jsonb not null default '[]'::jsonb,
 actualizado timestamptz not null default now(),
 check((responsable='Clari' and hora>='08:00' and hora<'16:00') or (responsable='Tamy' and hora>='16:00' and hora<'22:00')),
 check(estado<>'Confirmada' or length(trim(reserva))>0),
 check(estado<>'Interesada' or seguimiento is not null)
);
alter table public.hub_action_tareas enable row level security;
revoke all on public.hub_action_tareas from public,anon,authenticated;
drop policy if exists hub_action_operacion on public.hub_action_tareas;
create policy hub_action_operacion on public.hub_action_tareas for all to anon,authenticated
 using (has_table_privilege(current_user,'public.alumnos','SELECT'))
 with check (has_table_privilege(current_user,'public.alumnos','SELECT'));
grant select,insert,update on public.hub_action_tareas to anon,authenticated;
create or replace function public.hub_action_guardar(p_id uuid,p_version integer,p_datos jsonb)
returns uuid language plpgsql security invoker set search_path=public as $$
declare old public.hub_action_tareas; item public.hub_action_tareas; tel text;
begin
 -- Serialize edits and contact assignment, so two turns cannot overwrite or duplicate an open contact.
 perform pg_advisory_xact_lock(hashtext('hub_action_guardar'));
 select * into old from public.hub_action_tareas where id=p_id for update;
 if (old.id is null and p_version<>0) or (old.id is not null and old.version<>p_version) then
  raise exception 'Otra persona actualizó esta tarea. Actualizá antes de guardar.';
 end if;
 item:=jsonb_populate_record(null::public.hub_action_tareas,p_datos);
 tel:=regexp_replace(coalesce(item.telefono,''),'[^0-9]','','g');
 if item.estado='Enviado' and (length(tel) not between 10 and 15 or length(trim(coalesce(item.mensaje,'')))=0) then raise exception 'Falta teléfono internacional o mensaje.'; end if;
 if item.estado not in ('Confirmada','Cerrada') and exists (
  select 1 from public.hub_action_tareas t where t.id<>p_id and t.estado not in ('Confirmada','Cerrada')
  and ((item.alumno_id is not null and t.alumno_id=item.alumno_id) or (length(tel)>=10 and regexp_replace(t.telefono,'[^0-9]','','g')=tel))
 ) then raise exception 'Este contacto ya tiene una acción abierta. Continuá el seguimiento existente.'; end if;
 insert into public.hub_action_tareas(id,version,titulo,fecha,hora,responsable,prioridad,tipo,estado,contacto,telefono,oferta,motivo,mensaje,notas,reserva,seguimiento,origen,alumno_id,historial)
 values(p_id,coalesce(old.version,0)+1,item.titulo,item.fecha,item.hora,item.responsable,item.prioridad,item.tipo,item.estado,coalesce(item.contacto,''),coalesce(item.telefono,''),coalesce(item.oferta,''),coalesce(item.motivo,''),coalesce(item.mensaje,''),coalesce(item.notas,''),coalesce(item.reserva,''),item.seguimiento,item.origen,item.alumno_id,
 coalesce(old.historial,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('fecha',now(),'responsable',item.responsable,'estado',item.estado,'notas',item.notas)))
 on conflict(id) do update set version=excluded.version,titulo=excluded.titulo,fecha=excluded.fecha,hora=excluded.hora,responsable=excluded.responsable,prioridad=excluded.prioridad,tipo=excluded.tipo,estado=excluded.estado,contacto=excluded.contacto,telefono=excluded.telefono,oferta=excluded.oferta,motivo=excluded.motivo,mensaje=excluded.mensaje,notas=excluded.notas,reserva=excluded.reserva,seguimiento=excluded.seguimiento,origen=excluded.origen,alumno_id=excluded.alumno_id,historial=excluded.historial,actualizado=now();
 return p_id;
end $$;
revoke all on function public.hub_action_guardar(uuid,integer,jsonb) from public;
grant execute on function public.hub_action_guardar(uuid,integer,jsonb) to anon,authenticated;
commit;
