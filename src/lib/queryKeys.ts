/**
 * Claves de React Query. Todo lo del staff cuelga de ['staff', restaurantId]
 * para poder invalidarlo en bloque cuando llega un evento realtime.
 */
export const qk = {
  restaurantBySlug: (slug: string) => ['restaurant-by-slug', slug] as const,
  tableByToken: (token: string) => ['table', token] as const,
  menu: (restaurantId: string) => ['menu', restaurantId] as const,
  session: (sessionId: string) => ['session', sessionId] as const,
  staff: (restaurantId: string) => ['staff', restaurantId] as const,
  activeOrders: (restaurantId: string) => ['staff', restaurantId, 'orders'] as const,
  openAlerts: (restaurantId: string) => ['staff', restaurantId, 'alerts'] as const,
  tablesOverview: (restaurantId: string) => ['staff', restaurantId, 'tables'] as const,
  sessionCharges: (sessionId: string) => ['staff', 'session-charges', sessionId] as const,
  myStaff: (userId: string) => ['my-staff', userId] as const,
  myAssignments: (staffId: string) => ['my-assignments', staffId] as const,

  // Todo lo del admin cuelga de ['admin', restaurantId] para invalidarlo en bloque tras cada mutación.
  admin: (restaurantId: string) => ['admin', restaurantId] as const,
  adminCategories: (restaurantId: string) => ['admin', restaurantId, 'categories'] as const,
  adminItems: (restaurantId: string) => ['admin', restaurantId, 'items'] as const,
  sectors: (restaurantId: string) => ['admin', restaurantId, 'sectors'] as const,
  adminTables: (restaurantId: string) => ['admin', restaurantId, 'tables'] as const,
  staffList: (restaurantId: string) => ['admin', restaurantId, 'staff-list'] as const,
  invites: (restaurantId: string) => ['admin', restaurantId, 'invites'] as const,
  allAssignments: (restaurantId: string) => ['admin', restaurantId, 'assignments'] as const,
  serviceCharges: (restaurantId: string) => ['admin', restaurantId, 'service-charges'] as const,
}
