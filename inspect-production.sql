-- Sólo lectura. Ejecutar con acceso administrativo en el proyecto existente.
select c.relname,c.relrowsecurity,c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' order by c.relname;
select table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema='public'
and table_name in ('clases','canchas_abiertas','corporativos_eventos')
order by table_name,ordinal_position;
select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies where schemaname='public' order by tablename,policyname;
select table_name,grantee,privilege_type from information_schema.role_table_grants
where table_schema='public' order by table_name,grantee,privilege_type;
select c.relname,t.tgname,pg_get_triggerdef(t.oid) definicion,
pg_get_functiondef(t.tgfoid) funcion
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and not t.tgisinternal order by c.relname,t.tgname;
