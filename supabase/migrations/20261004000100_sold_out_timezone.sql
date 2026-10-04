-- ============================================================================
-- Bloque 0.1 · "Agotado hoy" dejaba de valer a las 21:00, en plena cena
--
--   El día se calculaba en UTC en los tres lugares que deciden si un plato está
--   agotado: la escritura (services/menuAdmin.ts, `new Date().toISOString()`), la
--   lectura (services/menu.ts) y la validación (`place_order`, `current_date`).
--   Supabase no fija zona horaria, así que `current_date` es UTC y en Argentina
--   (UTC-3) la fecha cambia a las 21:00 hora local. Consecuencia real: un plato
--   marcado agotado a las 19:00 volvía a aparecer disponible a las 21:00 y el
--   comensal lo pedía; marcado a las 22:00 quedaba bloqueado casi un día de más.
--
--   Arreglo: dejar de razonar con fechas y pasar a un INSTANTE.
--   `sold_out_until` pasa de `date` a `timestamptz` y significa "agotado hasta
--   este momento". La comparación es `sold_out_until > now()` en todos lados, sin
--   zonas horarias ni fechas en el cliente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Zona horaria del restaurante
--   Hace falta para que "hoy" signifique algo. También la van a necesitar los
--   reportes por día (cierre del día). Todavía no se edita desde /admin: eso va
--   con Configuración (bloque 4); mientras tanto, el default cubre Argentina.
-- ----------------------------------------------------------------------------
alter table public.restaurants
  add column if not exists timezone text not null default 'America/Argentina/Buenos_Aires';

-- ----------------------------------------------------------------------------
-- menu_items.sold_out_until: date -> timestamptz
--   El backfill traduce la semántica vieja ("agotado durante el día X") a la
--   nueva ("agotado hasta el instante Y"): el final de ese día en la zona del
--   restaurante, o sea el día siguiente a las 06:00 locales.
--   Se hace en cuatro pasos porque el USING de ALTER COLUMN no puede consultar
--   otra tabla (la zona horaria vive en `restaurants`).
-- ----------------------------------------------------------------------------
alter table public.menu_items add column if not exists sold_out_until_ts timestamptz;

update public.menu_items mi
set sold_out_until_ts = ((mi.sold_out_until + 1)::timestamp + interval '6 hours') at time zone r.timezone
from public.restaurants r
where r.id = mi.restaurant_id and mi.sold_out_until is not null;

alter table public.menu_items drop column sold_out_until;
alter table public.menu_items rename column sold_out_until_ts to sold_out_until;

comment on column public.menu_items.sold_out_until is
  'Agotado hasta este instante (NULL = disponible). Lo setea set_item_sold_out() al próximo 06:00 del restaurante.';

-- ----------------------------------------------------------------------------
-- RPC · set_item_sold_out(menu_item_id, sold_out) -> timestamptz | null
--   Marca/desmarca "agotado hoy" calculando el instante EN EL SERVIDOR, con la
--   zona horaria del restaurante. El cliente no hace cuentas de fechas.
--
--   El corte es el PRÓXIMO 06:00 local, no la medianoche: así nunca cae en medio
--   del servicio (un bar que cierra a las 3 AM sigue mostrando el plato agotado
--   hasta que termina la noche).
--
--   security invoker a propósito: las políticas `can_manage` de menu_items ya
--   deciden quién puede escribir, igual que el resto del CRUD de /admin.
-- ----------------------------------------------------------------------------
create or replace function public.set_item_sold_out(p_menu_item_id uuid, p_sold_out boolean)
returns timestamptz
language plpgsql
set search_path = public
as $$
declare
  v_tz    text;
  v_until timestamptz;
begin
  select r.timezone into v_tz
  from public.menu_items mi
  join public.restaurants r on r.id = mi.restaurant_id
  where mi.id = p_menu_item_id;

  if v_tz is null then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  if p_sold_out then
    v_until := (date_trunc('day', now() at time zone v_tz) + interval '6 hours') at time zone v_tz;
    if v_until <= now() then
      v_until := v_until + interval '1 day';
    end if;
  else
    v_until := null;
  end if;

  update public.menu_items set sold_out_until = v_until where id = p_menu_item_id;
  if not found then
    -- la fila existe (ya la leímos) pero RLS no dejó actualizarla
    raise exception 'NOT_AUTHORIZED';
  end if;

  return v_until;
end;
$$;

grant execute on function public.set_item_sold_out(uuid, boolean) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- place_order: la única línea que cambia es la validación de "agotado"
--   (`sold_out_until >= current_date` -> `sold_out_until > now()`). Se recrea
--   entera porque nunca se edita una migración ya aplicada.
-- ----------------------------------------------------------------------------
create or replace function public.place_order(p_token text, p_items jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_table      public.tables%rowtype;
  v_menu       public.menu_items%rowtype;
  v_group      public.option_groups%rowtype;
  v_session    uuid;
  v_order      uuid;
  v_item       jsonb;
  v_qty        int;
  v_notes      text;
  v_opt_ids    uuid[];
  v_sel_count  int;
  v_unit       integer;
  v_delta      integer;
  v_selected   jsonb;
  v_pos        int := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_ORDER';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'TOO_MANY_ITEMS';
  end if;

  select * into v_table from public.tables where token = p_token and is_active;
  if not found then
    raise exception 'TABLE_NOT_FOUND';
  end if;

  v_session := public.ensure_open_session(v_table.restaurant_id, v_table.id);

  insert into public.orders (restaurant_id, table_id, session_id)
  values (v_table.restaurant_id, v_table.id, v_session)
  returning id into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pos   := v_pos + 1;
    v_qty   := coalesce((v_item->>'qty')::int, 1);
    v_notes := left(coalesce(v_item->>'notes', ''), 200);
    if v_qty < 1 or v_qty > 99 then
      raise exception 'INVALID_QTY';
    end if;

    select * into v_menu
    from public.menu_items
    where id = (v_item->>'menu_item_id')::uuid and restaurant_id = v_table.restaurant_id;
    if not found then
      raise exception 'ITEM_NOT_FOUND';
    end if;
    -- ↓ única diferencia con la versión anterior: instante, no fecha UTC
    if not v_menu.is_available or (v_menu.sold_out_until is not null and v_menu.sold_out_until > now()) then
      raise exception 'ITEM_UNAVAILABLE: %', v_menu.name;
    end if;

    v_opt_ids := coalesce(
      array(select value::uuid from jsonb_array_elements_text(coalesce(v_item->'option_ids', '[]'::jsonb))),
      '{}'::uuid[]
    );

    -- Reglas de cada grupo del plato
    for v_group in select * from public.option_groups g where g.menu_item_id = v_menu.id order by g.sort_order loop
      select count(*) into v_sel_count
      from public.options o
      where o.group_id = v_group.id and o.id = any(v_opt_ids);

      if v_group.required and v_sel_count < greatest(v_group.min_select, 1) then
        raise exception 'OPTION_REQUIRED: %', v_group.name;
      end if;
      if v_sel_count < v_group.min_select then
        raise exception 'OPTION_MIN: %', v_group.name;
      end if;
      if v_group.selection = 'single' and v_sel_count > 1 then
        raise exception 'OPTION_SINGLE: %', v_group.name;
      end if;
      if v_group.max_select is not null and v_sel_count > v_group.max_select then
        raise exception 'OPTION_MAX: %', v_group.name;
      end if;
    end loop;

    -- Toda opción enviada debe ser de este plato y estar disponible
    if exists (
      select 1
      from unnest(v_opt_ids) as u(option_id)
      left join public.options o on o.id = u.option_id
      left join public.option_groups g on g.id = o.group_id and g.menu_item_id = v_menu.id
      where g.id is null or not o.is_available
    ) then
      raise exception 'OPTION_INVALID';
    end if;

    select coalesce(sum(o.price_delta), 0),
           coalesce(jsonb_agg(
             jsonb_build_object('group_name', g.name, 'option_name', o.name, 'price_delta', o.price_delta)
             order by g.sort_order, o.sort_order
           ), '[]'::jsonb)
    into v_delta, v_selected
    from public.options o
    join public.option_groups g on g.id = o.group_id
    where o.id = any(v_opt_ids);

    v_unit := greatest(v_menu.price + v_delta, 0);

    insert into public.order_items
      (restaurant_id, order_id, menu_item_id, name_snapshot, unit_price_snapshot, qty, notes, selected_options, sort_order)
    values
      (v_table.restaurant_id, v_order, v_menu.id, v_menu.name, v_unit, v_qty, v_notes, v_selected, v_pos);
  end loop;

  return jsonb_build_object(
    'order_id', v_order,
    'session_id', v_session,
    'total', (select total from public.orders where id = v_order)
  );
end;
$$;
