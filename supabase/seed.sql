-- ============================================================================
-- Seed de DESARROLLO (no va a producción).
--   · Local: se aplica con `supabase db reset`.
--   · Proyecto cloud de desarrollo: `npx supabase db push --include-seed`.
-- Crea un tenant PRIVADO (is_demo = false) para verificar que RLS aísla
-- restaurantes entre sí. Idempotente.
-- ============================================================================

do $$
declare
  r_id  uuid := '00000000-0000-4000-8000-00000000f001';
  s_id  uuid := '00000000-0000-4000-8000-00000000f011';
  c_id  uuid := '00000000-0000-4000-8000-00000000f021';
begin
  delete from public.restaurants where id = r_id;

  insert into public.restaurants (id, slug, name, tagline, currency, is_demo)
  values (r_id, 'bar-prueba', 'Bar de Prueba', 'Tenant privado para tests de RLS', 'ARS', false);

  insert into public.sectors (id, restaurant_id, name) values (s_id, r_id, 'Salón');

  insert into public.tables (id, restaurant_id, sector_id, number, token) values
    ('00000000-0000-4000-8000-00000000f031', r_id, s_id, 1, 'prueba-mesa-01'),
    ('00000000-0000-4000-8000-00000000f032', r_id, s_id, 2, 'prueba-mesa-02');

  insert into public.categories (id, restaurant_id, name, emoji) values (c_id, r_id, 'Tapas', '🍢');

  insert into public.menu_items (id, restaurant_id, category_id, name, description, price, sold_out_until) values
    ('00000000-0000-4000-8000-00000000f041', r_id, c_id, 'Tortilla de papas', 'Porción', 350000, null),
    ('00000000-0000-4000-8000-00000000f042', r_id, c_id, 'Croquetas de jamón', 'x6',     420000, null),
    -- `sold_out_until` es un INSTANTE ("agotado hasta"), no una fecha: ver la migración
    -- 20261004000100_sold_out_timezone.sql. Una semana por delante lo deja agotado sin
    -- importar cuándo corra el seed ni cuánto tiempo pase hasta el próximo `db:verify`
    -- (con `current_date` quedaba en el pasado y el check que espera ITEM_UNAVAILABLE fallaba).
    ('00000000-0000-4000-8000-00000000f043', r_id, c_id, 'Pulpo a la gallega', 'Agotado hoy', 990000, now() + interval '7 days');

  -- Un grupo obligatorio para probar validación de opciones
  insert into public.option_groups (id, restaurant_id, menu_item_id, name, selection, required, min_select, max_select) values
    ('00000000-0000-4000-8000-00000000f051', r_id, '00000000-0000-4000-8000-00000000f041', 'Tamaño', 'single', true, 1, 1);
  insert into public.options (id, restaurant_id, group_id, name, price_delta) values
    ('00000000-0000-4000-8000-00000000f061', r_id, '00000000-0000-4000-8000-00000000f051', 'Media',  -100000),
    ('00000000-0000-4000-8000-00000000f062', r_id, '00000000-0000-4000-8000-00000000f051', 'Entera',  0);
end;
$$;
