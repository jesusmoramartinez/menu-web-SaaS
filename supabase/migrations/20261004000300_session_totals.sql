-- ============================================================================
-- Bloque 3 · Cargos fijos (cubierto / servicio), ajustes del mozo y UN total
--
--   Hasta ahora el total de una mesa se calculaba en tres lugares distintos:
--   get_session_state, fetchTablesOverview (en TypeScript) y el carrito del
--   comensal. Sumar cargos y ajustes a cada uno por separado garantiza que
--   alguna vista muestre un número diferente — y cuando se cobre con Mercado
--   Pago, un número distinto al que se cobró.
--
--   Acá queda `session_totals(session_id)` como única fuente de verdad, y la
--   usan get_session_state y get_tables_overview.
--
--   Decidido con el usuario (2026-09-27): los cargos NO se aplican solos. El
--   catálogo dice qué PUEDE cobrar el restaurante; el mozo decide mesa por mesa
--   qué se cobra, porque el cubierto se perdona seguido.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Catálogo de cargos del restaurante
-- ----------------------------------------------------------------------------
create type public.charge_mode as enum ('per_person', 'per_table', 'percent');

create table public.service_charges (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name          text not null check (char_length(trim(name)) between 2 and 40),
  mode          public.charge_mode not null,
  -- per_person / per_table: centavos.
  -- percent: puntos básicos sobre el consumo (1000 = 10,00 %), para admitir 10,5 %.
  amount        integer not null check (amount >= 0),
  is_active     boolean not null default true,
  -- true = el mozo lo encuentra ya marcado al abrir la mesa (igual puede sacarlo)
  suggested     boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  unique (id, restaurant_id)
);
create index service_charges_restaurant_idx on public.service_charges (restaurant_id, sort_order);

comment on column public.service_charges.amount is
  'centavos en per_person/per_table; puntos básicos en percent (1000 = 10,00%)';

-- ----------------------------------------------------------------------------
-- Cuántos comensales hay en la mesa (lo carga el mozo; el cubierto suele ser por persona)
-- ----------------------------------------------------------------------------
alter table public.table_sessions
  add column guests integer check (guests between 1 and 99);

-- ----------------------------------------------------------------------------
-- Cargos efectivamente aplicados a UNA mesa
--   Con snapshot de nombre/modo/importe, igual que order_items congela nombre y
--   precio: cambiar el cubierto mañana no puede reescribir la cuenta de ayer.
-- ----------------------------------------------------------------------------
create table public.session_charges (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  session_id    uuid not null,
  -- queda en null si el cargo se borra del catálogo: la cuenta vieja no se toca
  charge_id     uuid references public.service_charges(id) on delete set null,
  name_snapshot text not null,
  mode          public.charge_mode not null,
  amount        integer not null,
  applied_by    uuid references auth.users(id) on delete set null,
  applied_at    timestamptz not null default now(),
  unique (session_id, charge_id),
  foreign key (session_id, restaurant_id) references public.table_sessions(id, restaurant_id) on delete cascade
);
create index session_charges_session_idx on public.session_charges (session_id);

-- ----------------------------------------------------------------------------
-- Ajustes del mozo al cerrar (se rompió un vaso, un descuento, etc.)
--   Negativos = descuento, y sólo los puede cargar owner/admin (ver políticas).
-- ----------------------------------------------------------------------------
create table public.session_adjustments (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  session_id    uuid not null,
  amount        integer not null check (amount <> 0),
  reason        text not null check (char_length(trim(reason)) between 3 and 200),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  foreign key (session_id, restaurant_id) references public.table_sessions(id, restaurant_id) on delete cascade
);
create index session_adjustments_session_idx on public.session_adjustments (session_id);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.service_charges     enable row level security;
alter table public.session_charges     enable row level security;
alter table public.session_adjustments enable row level security;

-- Catálogo: lo ve el personal, lo edita owner/admin
create policy service_charges_read on public.service_charges
  for select using (public.can_operate(restaurant_id));
create policy service_charges_write on public.service_charges
  for all using (public.can_manage(restaurant_id)) with check (public.can_manage(restaurant_id));

-- Aplicados: los opera el personal (la RPC es la que arma el snapshot)
create policy session_charges_read on public.session_charges
  for select using (public.can_operate(restaurant_id));
create policy session_charges_write on public.session_charges
  for all using (public.can_operate(restaurant_id)) with check (public.can_operate(restaurant_id));

-- Ajustes: cualquier mozo puede sumar; restar es de owner/admin.
--   La regla va en la política, no en un CHECK, porque depende del rol de quien escribe.
--   can_manage() es verdadera para cualquiera en el tenant demo, así que la demo
--   también puede mostrar descuentos.
create policy session_adjustments_read on public.session_adjustments
  for select using (public.can_operate(restaurant_id));
create policy session_adjustments_insert on public.session_adjustments
  for insert with check (
    public.can_operate(restaurant_id) and (amount > 0 or public.can_manage(restaurant_id))
  );
create policy session_adjustments_delete on public.session_adjustments
  for delete using (public.can_manage(restaurant_id));

-- ----------------------------------------------------------------------------
-- session_totals(session_id) -> jsonb   ← LA fuente de verdad del total
--
--   { subtotal, charges: [{id, name, amount}], adjustments: [...], total }
--
--   Orden de cálculo (importa, y es el habitual en un restaurante):
--     1. subtotal = pedidos no cancelados
--     2. cargos: por mesa / por persona / porcentaje SOBRE EL SUBTOTAL
--     3. ajustes (pueden ser negativos)
--     4. total = max(0, subtotal + cargos + ajustes)
--
--   Sin `security definer`: hereda el contexto de quien la llama, así que sirve
--   tanto dentro de get_session_state (definer, para el comensal anónimo) como
--   dentro de get_tables_overview (invoker, donde manda RLS).
-- ----------------------------------------------------------------------------
create or replace function public.session_totals(p_session_id uuid)
returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  v_guests      int;
  v_subtotal    bigint;
  v_charges     jsonb;
  v_charges_sum bigint;
  v_adjustments jsonb;
  v_adjust_sum  bigint;
begin
  select coalesce(s.guests, 1) into v_guests
  from public.table_sessions s where s.id = p_session_id;
  if v_guests is null then
    return null;   -- la sesión no existe (o no es visible)
  end if;

  select coalesce(sum(o.total), 0) into v_subtotal
  from public.orders o
  where o.session_id = p_session_id and o.status <> 'cancelled';

  select
    coalesce(jsonb_agg(
      jsonb_build_object('id', c.id, 'name', c.name_snapshot, 'amount', c.calculated)
      order by c.applied_at
    ), '[]'::jsonb),
    coalesce(sum(c.calculated), 0)
  into v_charges, v_charges_sum
  from (
    select
      sc.id, sc.name_snapshot, sc.applied_at,
      case sc.mode
        when 'per_table'  then sc.amount
        when 'per_person' then sc.amount * v_guests
        when 'percent'    then round(v_subtotal * sc.amount / 10000.0)::bigint
      end as calculated
    from public.session_charges sc
    where sc.session_id = p_session_id
  ) c;

  select
    coalesce(jsonb_agg(
      jsonb_build_object('id', a.id, 'amount', a.amount, 'reason', a.reason, 'created_at', a.created_at)
      order by a.created_at
    ), '[]'::jsonb),
    coalesce(sum(a.amount), 0)
  into v_adjustments, v_adjust_sum
  from public.session_adjustments a
  where a.session_id = p_session_id;

  return jsonb_build_object(
    'subtotal',    v_subtotal,
    'guests',      v_guests,
    'charges',     v_charges,
    'adjustments', v_adjustments,
    'total',       greatest(0, v_subtotal + v_charges_sum + v_adjust_sum)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC · set_session_charge(session, charge, aplicar?)
--   El snapshot lo arma el SERVIDOR leyendo el catálogo: el cliente nunca manda
--   importes, igual que con los precios en place_order.
-- ----------------------------------------------------------------------------
create or replace function public.set_session_charge(p_session_id uuid, p_charge_id uuid, p_applied boolean)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_rid    uuid;
  v_charge public.service_charges%rowtype;
begin
  select restaurant_id into v_rid from public.table_sessions where id = p_session_id;
  if v_rid is null then
    raise exception 'SESSION_NOT_FOUND';
  end if;
  if not public.can_operate(v_rid) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if p_applied then
    select * into v_charge
    from public.service_charges
    where id = p_charge_id and restaurant_id = v_rid and is_active;
    if not found then
      raise exception 'CHARGE_NOT_FOUND';
    end if;

    insert into public.session_charges
      (restaurant_id, session_id, charge_id, name_snapshot, mode, amount, applied_by)
    values
      (v_rid, p_session_id, v_charge.id, v_charge.name, v_charge.mode, v_charge.amount, auth.uid())
    on conflict (session_id, charge_id) do nothing;
  else
    delete from public.session_charges
    where session_id = p_session_id and charge_id = p_charge_id;
  end if;
end;
$$;

grant execute on function public.session_totals(uuid) to anon, authenticated;
grant execute on function public.set_session_charge(uuid, uuid, boolean) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- get_session_state: ahora devuelve el desglose, no sólo un número
--   `total` sigue existiendo con el mismo nombre (el frontend viejo no se rompe)
--   pero ahora incluye cargos y ajustes.
-- ----------------------------------------------------------------------------
create or replace function public.get_session_state(p_session_id uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'session', jsonb_build_object('id', s.id, 'status', s.status, 'opened_at', s.opened_at, 'closed_at', s.closed_at),
    'table', jsonb_build_object('id', t.id, 'number', t.number, 'label', t.label),
    'orders', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', o.id, 'status', o.status, 'total', o.total, 'created_at', o.created_at,
          'sent_to_kitchen_at', o.sent_to_kitchen_at, 'ready_at', o.ready_at, 'delivered_at', o.delivered_at,
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', oi.id, 'name', oi.name_snapshot, 'qty', oi.qty, 'unit_price', oi.unit_price_snapshot,
                'line_total', oi.line_total, 'notes', oi.notes, 'selected_options', oi.selected_options
              ) order by oi.sort_order
            )
            from public.order_items oi where oi.order_id = o.id
          ), '[]'::jsonb)
        ) order by o.created_at desc
      )
      from public.orders o where o.session_id = s.id
    ), '[]'::jsonb),
    'open_alerts', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'type', a.type, 'created_at', a.created_at))
      from public.alerts a where a.session_id = s.id and a.resolved_at is null
    ), '[]'::jsonb),
    'subtotal',    (public.session_totals(s.id) ->> 'subtotal')::bigint,
    'charges',     public.session_totals(s.id) -> 'charges',
    'adjustments', public.session_totals(s.id) -> 'adjustments',
    'total',       (public.session_totals(s.id) ->> 'total')::bigint
  )
  from public.table_sessions s
  join public.tables t on t.id = s.table_id
  where s.id = p_session_id;
$$;

-- ----------------------------------------------------------------------------
-- get_tables_overview: el total de cada mesa sale de la misma función
-- ----------------------------------------------------------------------------
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
        'guests',         sess.guests,
        'total',          coalesce((public.session_totals(sess.id) ->> 'total')::bigint, 0),
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
    select count(*) filter (where o.status in ('pending', 'kitchen', 'ready')) as active_count
    from public.orders o
    where o.session_id = sess.id
  ) agg on true
  where t.restaurant_id = p_restaurant_id and t.is_active;
$$;
