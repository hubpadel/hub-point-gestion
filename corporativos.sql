-- BORRADOR: ejecutar sólo en una base de pruebas. No configura roles existentes.
begin;
create table public.corporativos_eventos (
 id uuid primary key default gen_random_uuid(),
 empresa text not null check(length(trim(empresa))>0),
 contacto text not null check(length(trim(contacto))>0),
 fecha date not null, inicio time not null, fin time not null check(fin>inicio),
 canchas text not null check(length(trim(canchas))>0),
 participantes integer not null check(participantes>0),
 presupuesto text not null check(length(trim(presupuesto))>0),
 importe numeric(14,2) not null check(importe>=0),
 estado text not null check(estado in ('Borrador','Presupuestado','Confirmado','Realizado','Cancelado')),
 creado_en timestamptz not null default now()
);
create table public.corporativos_pagos (
 id uuid primary key, evento_id uuid not null references public.corporativos_eventos(id),
 importe numeric(14,2) not null check(importe>0), fecha date not null,
 metodo text not null check(metodo in ('Efectivo','Transferencia','Tarjeta','Otro')),
 referencia text not null default '', confirmado_en timestamptz not null default now()
);
-- Cada fila ES un ingreso confirmado: no hay segunda escritura ni copia en pagos de clases.
create view public.corporativos_ingresos with (security_invoker=true) as
 select p.id, p.evento_id, e.empresa, p.importe, p.fecha, p.metodo,
 p.referencia, 'Corporativos'::text as categoria
 from public.corporativos_pagos p join public.corporativos_eventos e on e.id=p.evento_id;
alter table public.corporativos_eventos enable row level security;
alter table public.corporativos_pagos enable row level security;
-- Sin políticas: acceso denegado hasta revisar el esquema de roles real.
revoke all on public.corporativos_eventos, public.corporativos_pagos, public.corporativos_ingresos from anon, authenticated;
create function public.corporativos_confirmar_pago(
 p_id uuid, p_evento uuid, p_importe numeric, p_fecha date, p_metodo text, p_referencia text default ''
) returns public.corporativos_pagos language plpgsql security invoker set search_path='' as $$
declare ev public.corporativos_eventos; prior public.corporativos_pagos; result public.corporativos_pagos; cobrado numeric;
begin
 if p_id is null or p_evento is null or p_fecha is null or p_importe is null or p_importe<=0
 or p_importe<>round(p_importe,2) or p_metodo is null
 or p_metodo not in ('Efectivo','Transferencia','Tarjeta','Otro') then
 raise exception 'Pago inválido'; end if;
 -- Serializa dos cobros concurrentes del mismo evento.
 select * into ev from public.corporativos_eventos where id=p_evento for update;
 if not found then raise exception 'Evento inexistente o sin permiso'; end if;
 select * into prior from public.corporativos_pagos where id=p_id;
 if found then
   if prior.evento_id<>p_evento or prior.importe<>p_importe or prior.fecha<>p_fecha
   or prior.metodo<>p_metodo or prior.referencia<>coalesce(p_referencia,'') then
     raise exception 'La identificación del pago ya tiene otros datos';
   end if;
   return prior;
 end if;
 if ev.estado='Cancelado' then raise exception 'Evento cancelado'; end if;
 select coalesce(sum(importe),0) into cobrado from public.corporativos_pagos where evento_id=p_evento;
 if cobrado+p_importe>ev.importe then raise exception 'El pago supera el saldo pendiente'; end if;
 insert into public.corporativos_pagos(id,evento_id,importe,fecha,metodo,referencia)
 values(p_id,p_evento,p_importe,p_fecha,p_metodo,coalesce(p_referencia,'')) returning * into result;
 return result;
end $$;
revoke all on function public.corporativos_confirmar_pago(uuid,uuid,numeric,date,text,text) from public, anon, authenticated;
-- Pago inmutable y presupuesto no reducible por debajo de lo cobrado.
create function public.corporativos_proteger() returns trigger language plpgsql set search_path='' as $$
declare cobrado numeric;
begin
 if tg_table_name='corporativos_pagos' then raise exception 'Un pago confirmado es inmutable'; end if;
 select coalesce(sum(importe),0) into cobrado from public.corporativos_pagos where evento_id=old.id;
 if new.importe<cobrado then raise exception 'El presupuesto no puede ser menor a lo cobrado'; end if;
 return new;
end $$;
create trigger corporativos_presupuesto before update on public.corporativos_eventos for each row execute function public.corporativos_proteger();
create trigger corporativos_pago_inmutable before update or delete on public.corporativos_pagos for each row execute function public.corporativos_proteger();
-- La misma regla cubre inserciones directas si el mapeo futuro de RLS las permite.
create function public.corporativos_validar_insert() returns trigger language plpgsql set search_path='' as $$
declare ev public.corporativos_eventos; cobrado numeric;
begin
 select * into ev from public.corporativos_eventos where id=new.evento_id for update;
 if not found or ev.estado='Cancelado' then raise exception 'Evento inexistente, cancelado o sin permiso'; end if;
 select coalesce(sum(importe),0) into cobrado from public.corporativos_pagos where evento_id=new.evento_id;
 if cobrado+new.importe>ev.importe then raise exception 'El pago supera el saldo pendiente'; end if;
 return new;
end $$;
create trigger corporativos_insert_validado before insert on public.corporativos_pagos for each row execute function public.corporativos_validar_insert();
commit;
