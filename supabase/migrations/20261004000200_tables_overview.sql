-- ============================================================================
-- Bloque 0.3 · La pestaña "Mesas" del mozo descargaba TODO el historial
--
--   `fetchTablesOverview` (services/tables.ts) traía todos los pedidos no
--   cancelados del restaurante —sin filtro de fecha ni de sesión— y los sumaba
--   en TypeScript, cada 15 segundos. Con 80 pedidos por día son ~2.400 filas al
--   mes y ~29.000 al año bajando al teléfono del mozo en cada refresco.
--
--   Acá se calcula en la base y vuelve una fila por mesa. De paso deja de haber
--   una lógica de totales duplicada en el cliente, que el bloque 3 (cargos fijos
--   y ajustes) va a tener que tocar igual.
--
--   security invoker (sin `security definer`): las políticas RLS de tables,
--   table_sessions y orders ya restringen por `can_operate`, así que la función
--   ve exactamente lo que vería el que la llama. El tenant demo sigue andando
--   sin login por la misma razón.
-- ============================================================================

create or replace function public.get_tables_overview(p_restaurant_id uuid)
returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',             t.id,
        'number',         t.number,
        'label',          t.label,
        'sector_id',      t.sector_id,
        'sector_name',    s.name,
        'session_id',     sess.id,
        'session_status', sess.status,
        'opened_at',      sess.opened_at,
        'total',          coalesce(agg.total, 0),
        -- sólo se puede cerrar una mesa abierta y sin pedidos por entregar
        'can_close',      sess.id is not null and coalesce(agg.active_count, 0) = 0
      )
      order by t.number
    ),
    '[]'::jsonb
  )
  from public.tables t
  left join public.sectors s
    on s.id = t.sector_id
  left join public.table_sessions sess
    on sess.table_id = t.id and sess.status <> 'closed'
  left join lateral (
    select
      sum(o.total) filter (where o.status <> 'cancelled')                         as total,
      count(*)     filter (where o.status in ('pending', 'kitchen', 'ready'))     as active_count
    from public.orders o
    where o.session_id = sess.id
  ) agg on true
  where t.restaurant_id = p_restaurant_id and t.is_active;
$$;

grant execute on function public.get_tables_overview(uuid) to anon, authenticated;
