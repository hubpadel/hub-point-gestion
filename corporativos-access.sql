-- Configuración aditiva para pruebas, basada en los permisos consultados el 14/10/2026.
-- La app existente usa anon/authenticated con políticas true. No hay restricciones
-- por usuario en esas políticas. No cambia ninguna tabla ni política existente.
begin;
grant select,insert,update on public.corporativos_eventos to anon,authenticated;
grant select,insert on public.corporativos_pagos to anon,authenticated;
grant select on public.corporativos_ingresos to anon,authenticated;
grant execute on function public.corporativos_confirmar_pago(uuid,uuid,numeric,date,text,text) to anon,authenticated;
create policy corporativos_eventos_lectura on public.corporativos_eventos for select to anon,authenticated using(true);
create policy corporativos_eventos_alta on public.corporativos_eventos for insert to anon,authenticated with check(true);
create policy corporativos_eventos_edicion on public.corporativos_eventos for update to anon,authenticated using(true) with check(true);
create policy corporativos_pagos_lectura on public.corporativos_pagos for select to anon,authenticated using(true);
create policy corporativos_pagos_confirmacion on public.corporativos_pagos for insert to anon,authenticated with check(true);
-- No DELETE, UPDATE de cobros, TRUNCATE ni cambios de permisos para estos roles.
commit;
