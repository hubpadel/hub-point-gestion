create schema if not exists point_inscripciones;
grant usage on schema point_inscripciones to anon, authenticated;

create or replace function point_inscripciones.point_sync_jugador(p_nombre text, p_telefono text, p_alumno uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  nombre text := btrim(p_nombre);
  clave text := lower(regexp_replace(btrim(p_nombre), '\s+', ' ', 'g'));
  v_telefono text := regexp_replace(coalesce(p_telefono,''), '[^0-9]', '', 'g');
  candidatos bigint[];
begin
  if coalesce(nombre,'') = '' then return; end if;

  -- Serialize automatic registrations, including saves with multiple players.
  perform pg_advisory_xact_lock(hashtextextended('point:alta-automatica-jugadores', 0));
  if p_alumno is not null and exists (select 1 from public.jugadores where alumno_id=p_alumno) then return; end if;

  select array_agg(j.id order by j.id) into candidatos
  from public.jugadores j
  where lower(regexp_replace(btrim(j.nombre), '\s+', ' ', 'g')) = clave
    and (v_telefono = '' or regexp_replace(coalesce(j.telefono,''), '[^0-9]', '', 'g') in ('',v_telefono));

  if cardinality(candidatos) = 1 then
    if p_alumno is not null and v_telefono <> '' then
      update public.jugadores j set alumno_id=p_alumno
      where j.id=candidatos[1] and j.alumno_id is null
        and regexp_replace(coalesce(j.telefono,''), '[^0-9]', '', 'g')=v_telefono;
    end if;
    return;
  end if;
  if cardinality(candidatos) > 1 then return; end if;

  insert into public.jugadores(nombre,telefono,alumno_id)
  values(nombre,nullif(btrim(p_telefono),''),p_alumno)
  on conflict (alumno_id) do nothing;
end;
$$;

create or replace function point_inscripciones.point_jugador_desde_inscripcion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inscrito record;
begin
  if tg_table_name = 'clases' then
    select a.nombre,a.telefono into inscrito from public.alumnos a where a.id=new.alumno_id;
    perform point_inscripciones.point_sync_jugador(inscrito.nombre,inscrito.telefono,new.alumno_id);
  elsif tg_table_name = 'cancha_abierta_jugadores' then
    perform point_inscripciones.point_sync_jugador(new.nombre,new.telefono,null);
  else
    for inscrito in
      select j->>'nombre' as nombre,j->>'telefono' as telefono
      from jsonb_array_elements(new.datos->'parejas') p
      cross join lateral jsonb_array_elements(p->'jugadores') j
      where p->>'estado'='Inscripta'
      order by lower(regexp_replace(btrim(j->>'nombre'), '\s+', ' ', 'g'))
    loop
      perform point_inscripciones.point_sync_jugador(inscrito.nombre,inscrito.telefono,null);
    end loop;
  end if;
  return new;
end;
$$;

create trigger point_jugador_desde_clase after insert or update of alumno_id on public.clases
for each row execute function point_inscripciones.point_jugador_desde_inscripcion();
create trigger point_jugador_desde_abierta after insert or update of nombre,telefono on public.cancha_abierta_jugadores
for each row execute function point_inscripciones.point_jugador_desde_inscripcion();
create trigger point_jugador_desde_partido after insert or update of datos on public.partidos
for each row execute function point_inscripciones.point_jugador_desde_inscripcion();
create trigger point_jugador_desde_torneo after insert or update of datos on public.torneos
for each row execute function point_inscripciones.point_jugador_desde_inscripcion();
