import { supabase } from '@/lib/supabase'
import type { AdminCategory, AdminMenuItem, OptionSelection } from '@/types/domain'
import { bySort, toGroup, type GroupRow } from './menu'

// ── Categorías ───────────────────────────────────────────────────────────
interface CategoryRow {
  id: string
  name: string
  emoji: string | null
  sort_order: number
  is_active: boolean
}

/** Todas las categorías (activas e inactivas) del restaurante, para el admin. */
export async function fetchAdminCategories(restaurantId: string): Promise<AdminCategory[]> {
  const { data, error } = await supabase.from('categories').select('id, name, emoji, sort_order, is_active').eq('restaurant_id', restaurantId).order('sort_order')
  if (error) throw error
  return (data as CategoryRow[]).map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, sortOrder: c.sort_order, isActive: c.is_active }))
}

export interface CategoryInput {
  id?: string
  name: string
  emoji: string | null
  sortOrder: number
}

export async function saveCategory(restaurantId: string, input: CategoryInput): Promise<void> {
  const row = { restaurant_id: restaurantId, name: input.name, emoji: input.emoji, sort_order: input.sortOrder }
  const { error } = input.id
    ? await supabase.from('categories').update(row).eq('id', input.id)
    : await supabase.from('categories').insert(row)
  if (error) throw error
}

export async function setCategoryActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('categories').update({ is_active: isActive }).eq('id', id)
  if (error) throw error
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) throw error
}

// ── Platos ───────────────────────────────────────────────────────────────
interface ItemRow {
  id: string
  category_id: string
  name: string
  description: string
  price: number
  image_url: string | null
  tags: string[]
  is_available: boolean
  sold_out_until: string | null
  sort_order: number
  option_groups: GroupRow[]
}

const toAdminItem = (i: ItemRow): AdminMenuItem => ({
  id: i.id,
  categoryId: i.category_id,
  name: i.name,
  description: i.description,
  price: i.price,
  imageUrl: i.image_url,
  tags: i.tags ?? [],
  isAvailable: i.is_available,
  soldOutUntil: i.sold_out_until,
  sortOrder: i.sort_order,
  optionGroups: [...i.option_groups].sort(bySort).map(toGroup),
})

/** Todos los platos (visibles y ocultos) del restaurante, con sus variantes. */
export async function fetchAdminMenuItems(restaurantId: string): Promise<AdminMenuItem[]> {
  const { data, error } = await supabase
    .from('menu_items')
    .select(
      'id, category_id, name, description, price, image_url, tags, is_available, sold_out_until, sort_order, ' +
        'option_groups(id, name, selection, required, min_select, max_select, sort_order, ' +
        'options(id, name, price_delta, is_available, sort_order))',
    )
    .eq('restaurant_id', restaurantId)
    .order('sort_order')
  if (error) throw error
  return (data as unknown as ItemRow[]).map(toAdminItem)
}

export interface MenuItemInput {
  id?: string
  categoryId: string
  name: string
  description: string
  /** centavos */
  price: number
  imageUrl: string | null
  tags: string[]
  sortOrder: number
}

/** Crea o actualiza los campos base del plato (sin tocar sus variantes). Devuelve el id. */
export async function saveMenuItem(restaurantId: string, input: MenuItemInput): Promise<string> {
  const row = {
    restaurant_id: restaurantId,
    category_id: input.categoryId,
    name: input.name,
    description: input.description,
    price: input.price,
    image_url: input.imageUrl,
    tags: input.tags,
    sort_order: input.sortOrder,
  }
  if (input.id) {
    const { error } = await supabase.from('menu_items').update(row).eq('id', input.id)
    if (error) throw error
    return input.id
  }
  const { data, error } = await supabase.from('menu_items').insert(row).select('id').single()
  if (error) throw error
  return data.id
}

export async function deleteMenuItem(id: string): Promise<void> {
  const { error } = await supabase.from('menu_items').delete().eq('id', id)
  if (error) throw error
}

export async function setItemAvailable(id: string, isAvailable: boolean): Promise<void> {
  const { error } = await supabase.from('menu_items').update({ is_available: isAvailable }).eq('id', id)
  if (error) throw error
}

/**
 * "Agotado hoy": el **servidor** calcula hasta cuándo, usando la zona horaria del
 * restaurante (el próximo 06:00 local), para que el corte caiga de madrugada y nunca en
 * medio del servicio. Es la única operación del admin que no es CRUD directo: necesita
 * una cuenta con zona horaria que no corresponde hacer en el navegador.
 */
export async function setSoldOutToday(id: string, soldOut: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_item_sold_out', { p_menu_item_id: id, p_sold_out: soldOut })
  if (error) throw error
}

export async function updateItemPrice(id: string, price: number): Promise<void> {
  const { error } = await supabase.from('menu_items').update({ price }).eq('id', id)
  if (error) throw error
}

// ── Grupos de opciones y opciones (variantes) ─────────────────────────────
export interface OptionGroupInput {
  id?: string
  menuItemId: string
  name: string
  selection: OptionSelection
  required: boolean
  minSelect: number
  maxSelect: number | null
  sortOrder: number
}

export async function saveOptionGroup(restaurantId: string, input: OptionGroupInput): Promise<string> {
  const row = {
    restaurant_id: restaurantId,
    menu_item_id: input.menuItemId,
    name: input.name,
    selection: input.selection,
    required: input.required,
    min_select: input.minSelect,
    max_select: input.maxSelect,
    sort_order: input.sortOrder,
  }
  if (input.id) {
    const { error } = await supabase.from('option_groups').update(row).eq('id', input.id)
    if (error) throw error
    return input.id
  }
  const { data, error } = await supabase.from('option_groups').insert(row).select('id').single()
  if (error) throw error
  return data.id
}

export async function deleteOptionGroup(id: string): Promise<void> {
  const { error } = await supabase.from('option_groups').delete().eq('id', id)
  if (error) throw error
}

export interface OptionInput {
  id?: string
  groupId: string
  name: string
  /** centavos, puede ser negativo */
  priceDelta: number
  isAvailable: boolean
  sortOrder: number
}

export async function saveOption(restaurantId: string, input: OptionInput): Promise<void> {
  const row = {
    restaurant_id: restaurantId,
    group_id: input.groupId,
    name: input.name,
    price_delta: input.priceDelta,
    is_available: input.isAvailable,
    sort_order: input.sortOrder,
  }
  const { error } = input.id
    ? await supabase.from('options').update(row).eq('id', input.id)
    : await supabase.from('options').insert(row)
  if (error) throw error
}

export async function deleteOption(id: string): Promise<void> {
  const { error } = await supabase.from('options').delete().eq('id', id)
  if (error) throw error
}
