import type { Menu, Restaurant, SessionState, StaffAlert, StaffOrder, TableContext, TableOverview } from '@/types/domain'

export const demoRestaurant: Restaurant = {
  id: 'r-demo',
  slug: 'demo',
  name: 'Pizzería Don Remolo',
  tagline: 'Horno de leña desde 1987',
  logoUrl: null,
  currency: 'ARS',
  theme: { brand: '#f97316' },
  isDemo: true,
}

/** Restaurante "real" (no demo) para los tests de login/registro/guards de rol. */
export const ownerRestaurant: Restaurant = {
  id: 'r-owner',
  slug: 'bar-de-ana',
  name: 'Bar de Ana',
  tagline: null,
  logoUrl: null,
  currency: 'ARS',
  theme: {},
  isDemo: false,
}

export const tablesOverview: TableOverview[] = [
  {
    id: 'tbl-3',
    number: 3,
    label: null,
    sectorId: 'sec-1',
    sectorName: 'Salón',
    sessionId: 'sess-3',
    sessionStatus: 'bill_requested',
    openedAt: new Date(Date.now() - 40 * 60_000).toISOString(),
    guests: 2,
    total: 220000,
    canClose: true, // pidió la cuenta y ya no tiene pedidos activos: se puede cerrar
  },
  {
    id: 'tbl-5',
    number: 5,
    label: null,
    sectorId: 'sec-1',
    sectorName: 'Salón',
    sessionId: 'sess-5',
    sessionStatus: 'open',
    openedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
    guests: 4,
    total: 450000,
    canClose: false, // todavía tiene un pedido activo
  },
]

export const demoTable: TableContext = {
  restaurant: demoRestaurant,
  table: { id: 't-4', number: 4, label: null, sector: 'Salón' },
  session: null,
}

export const demoMenu: Menu = {
  categories: [
    { id: 'c-pizzas', name: 'Pizzas', emoji: '🍕', sortOrder: 0 },
    { id: 'c-bebidas', name: 'Bebidas', emoji: '🥤', sortOrder: 1 },
  ],
  items: [
    {
      id: 'i-muzza',
      categoryId: 'c-pizzas',
      name: 'Muzzarella Clásica',
      description: 'Salsa, muzzarella y orégano.',
      price: 980000,
      imageUrl: null,
      tags: ['Popular'],
      soldOut: false,
      optionGroups: [
        {
          id: 'g-size',
          name: 'Tamaño',
          selection: 'single',
          required: true,
          minSelect: 1,
          maxSelect: 1,
          options: [
            { id: 'opt-grande', name: 'Grande', priceDelta: 0, isAvailable: true },
            { id: 'opt-chica', name: 'Chica', priceDelta: -300000, isAvailable: true },
          ],
        },
      ],
    },
    {
      id: 'i-agotada',
      categoryId: 'c-pizzas',
      name: 'Fugazzeta Rellena',
      description: '',
      price: 1250000,
      imageUrl: null,
      tags: [],
      soldOut: true,
      optionGroups: [],
    },
    {
      id: 'i-agua',
      categoryId: 'c-bebidas',
      name: 'Agua Mineral',
      description: 'Con o sin gas.',
      price: 220000,
      imageUrl: null,
      tags: ['Sin alcohol'],
      soldOut: false,
      optionGroups: [],
    },
  ],
}

export const sessionAfterOrder: SessionState = {
  session: { id: 's-1', status: 'open', openedAt: new Date().toISOString(), closedAt: null },
  table: { id: 't-4', number: 4, label: null },
  orders: [
    {
      id: 'o-new',
      status: 'pending',
      total: 980000,
      createdAt: new Date().toISOString(),
      sentToKitchenAt: null,
      readyAt: null,
      deliveredAt: null,
      items: [
        {
          id: 'oi-1',
          name: 'Muzzarella Clásica',
          qty: 1,
          unitPrice: 980000,
          lineTotal: 980000,
          notes: '',
          selectedOptions: [{ groupName: 'Tamaño', optionName: 'Grande', priceDelta: 0 }],
        },
      ],
    },
  ],
  openAlerts: [],
  subtotal: 980000,
  charges: [],
  adjustments: [],
  total: 980000,
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

export const staffOrders: StaffOrder[] = [
  {
    id: 'o-kitchen',
    tableId: 't-2',
    tableNumber: 2,
    tableLabel: null,
    sectorId: 'sec-salon',
    sessionId: 's-2',
    status: 'kitchen',
    total: 1120000,
    createdAt: minutesAgo(14),
    sentToKitchenAt: minutesAgo(12),
    readyAt: null,
    deliveredAt: null,
    items: [
      {
        id: 'oi-k1',
        menuItemId: 'i-napo',
        name: 'Napolitana',
        unitPrice: 1120000,
        qty: 1,
        notes: 'Sin ajo',
        lineTotal: 1120000,
        selectedOptions: [{ groupName: 'Tamaño', optionName: 'Grande', priceDelta: 0 }],
      },
    ],
  },
  {
    id: 'o-pending',
    tableId: 't-11',
    tableNumber: 11,
    tableLabel: null,
    sectorId: 'sec-terraza',
    sessionId: 's-11',
    status: 'pending',
    total: 540000,
    createdAt: minutesAgo(2),
    sentToKitchenAt: null,
    readyAt: null,
    deliveredAt: null,
    items: [
      {
        id: 'oi-p1',
        menuItemId: 'i-emp',
        name: 'Empanadas',
        unitPrice: 540000,
        qty: 1,
        notes: 'Una sin aceitunas',
        lineTotal: 540000,
        selectedOptions: [],
      },
    ],
  },
]

export const staffAlerts: StaffAlert[] = [
  { id: 'a-1', tableId: 't-9', tableNumber: 9, tableLabel: null, sectorId: 'sec-barra', type: 'bill', createdAt: minutesAgo(3) },
]
