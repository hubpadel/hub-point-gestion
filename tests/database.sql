-- Ejecutar tras corporativos.sql, exclusivamente en una base de pruebas como propietario.
begin;
do $$
declare e uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); count_rows integer;
begin
 insert into public.corporativos_eventos(id,empresa,contacto,fecha,inicio,fin,canchas,participantes,presupuesto,importe,estado)
 values(e,'Prueba','Contacto','2026-10-14','10:00','11:00','1',8,'Presupuesto registrado',100.10,'Confirmado');
 perform public.corporativos_confirmar_pago(p,e,25.05,'2026-10-14','Efectivo','Seña');
 perform public.corporativos_confirmar_pago(p,e,25.05,'2026-10-14','Efectivo','Seña');
 select count(*) into count_rows from public.corporativos_ingresos where evento_id=e;
 if count_rows<>1 then raise exception 'Reintento duplicado'; end if;
 begin
  perform public.corporativos_confirmar_pago(p,e,30,'2026-10-14','Efectivo','Seña');
  raise exception using errcode='ZX001',message='Aceptó reuso con otro importe';
 exception when sqlstate 'ZX001' then raise; when others then null; end;
 begin
  perform public.corporativos_confirmar_pago(gen_random_uuid(),e,76,'2026-10-14','Transferencia','');
  raise exception using errcode='ZX001',message='Aceptó exceso';
 exception when sqlstate 'ZX001' then raise; when others then null; end;
 begin
  update public.corporativos_eventos set importe=20 where id=e;
  raise exception using errcode='ZX001',message='Aceptó presupuesto menor al cobro';
 exception when sqlstate 'ZX001' then raise; when others then null; end;
 perform public.corporativos_confirmar_pago(gen_random_uuid(),e,75.05,'2026-11-01','Transferencia','Saldo');
 if (select sum(importe) from public.corporativos_ingresos where evento_id=e)<>100.10 then raise exception 'Total incorrecto'; end if;
 begin
  delete from public.corporativos_pagos where id=p;
  raise exception using errcode='ZX001',message='Aceptó borrar pago';
 exception when sqlstate 'ZX001' then raise; when others then null; end;
end $$;
rollback;
