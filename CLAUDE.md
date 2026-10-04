# CLAUDE.md — Contexto del proyecto "Menú Digital" (SaaS para restaurantes)

> **Regla para Claude:** leer este archivo completo antes de cualquier cambio y
> mantenerlo actualizado cuando cambie la arquitectura, el modelo de datos, las
> convenciones o el roadmap. Si algo de aquí contradice el código, el código manda
> y este archivo debe corregirse. El plan completo de producto está en
> [`docs/plan-producto.md`](docs/plan-producto.md); avanzar fase por fase y marcar el avance en §7.

## 1. Qué es

Menú digital interactivo para restaurantes (QR en mesa). Una sola SPA con tres roles:

| Vista | Para quién | Qué hace |
|---|---|---|
| **Cliente** | comensal en la mesa (móvil) | ve el menú, filtra/busca, arma carrito con notas por plato, confirma pedido, llama al mozo, pide la cuenta |
| **Mozo** | personal de salón | ve alertas (llamado / cuenta) y las resuelve; revisa comandas entrantes, edita cantidades/notas, las envía a cocina |
| **Cocina (KDS)** | cocineros | tarjetas de comandas aprobadas con tiempo transcurrido, color por urgencia y notas resaltadas; marca como listo |

Modelo de negocio decidido: **SaaS multi-restaurante** (una app, una base Supabase, cada restaurante con su `slug`).
Estado actual: **Fases 0–6 completadas, desplegado en Vercel y con entornos separados**: Supabase de
**desarrollo** (`oopowxlxpwsjpmpyuckm`, usado por `.env.local` y los Preview de Vercel) y Supabase de
**producción** (proyecto propio, usado por el deploy Production de Vercel; migraciones aplicadas **sin seed**).
Ya se puede dar de alta un restaurante real (`docs/alta-restaurante.md`). Reglas de operación de los dos
entornos en `docs/deploy.md` — en particular, **nunca `npm run db:push` contra prod** (incluye el seed) y los
`db:verify*` sólo corren contra dev. Frontend conectado de punta a punta: comensal, mozo, cocina y **administración** (menú con
variantes, mesas/QR, personal e invitaciones, configuración) operan sobre datos reales; el tenant demo
(`/demo/*`, incluido `/demo/admin`) funciona sin login para mostrar las cuatro vistas a un prospecto. La app es
instalable como **PWA**, mozo/cocina tienen aviso sonoro + vibración y la cocina tiene Wake Lock + pantalla
completa para tablets. Hay CI (`.github/workflows/ci.yml`) y docs de operación en `docs/`: `deploy.md`,
`alta-restaurante.md`, `manual-mozo-cocina.md` y `continuidad-proyecto.md` (guía paso a paso para el usuario, sin
asumir conocimientos previos, sobre cómo pedir cambios y cómo dar de alta/vender a un cliente nuevo). Cualquier
acción sobre el proyecto de **producción** (migrar, borrar un restaurante, cambiar Auth/SMTP) requiere decisión y
credenciales del usuario: no se hace desde acá sin que lo pida explícitamente.
Las próximas funcionalidades están listadas en [`docs/nuevas-funcionalidades.md`](docs/nuevas-funcionalidades.md)
(el *qué*) y planificadas en [`docs/plan-v1.1-funcionalidades.md`](docs/plan-v1.1-funcionalidades.md),
[`docs/plan-mercadopago.md`](docs/plan-mercadopago.md) y [`docs/plan-ui-ux.md`](docs/plan-ui-ux.md) (el *cómo*);
ninguno implementado todavía.

## 2. Stack

- **React 19** + **Vite 8** + **TypeScript** (strict, `verbatimModuleSyntax`, alias `@/` → `src/`)
- **Tailwind CSS 4** vía `@tailwindcss/vite` (tokens en `src/index.css` con `@theme`; no hay `tailwind.config.js`)
- **react-router 8** (`createBrowserRouter`, rutas en `src/app/router.tsx`)
- **lucide-react** para iconos
- **Supabase** (Postgres + Auth + Realtime) con `@supabase/supabase-js`; la CLI (`supabase`, devDependency) está
  **vinculada al proyecto de desarrollo** `oopowxlxpwsjpmpyuckm`. No hay Docker en esta máquina: se trabaja
  directo contra ese proyecto (es de desarrollo, no productivo).
- Tests: **Vitest** + Testing Library + jsdom (`src/test/setup.ts`)
- Lint: `oxlint` (no ESLint). Node 24 / npm 11.

### Comandos

```bash
npm run dev         # http://localhost:5173
npm run typecheck   # tsc -b
npm test            # vitest run
npm run lint        # oxlint
npm run build       # tsc -b && vite build (falla si hay errores de tipos)

npm run db:push         # supabase db push --linked --include-seed  (migraciones; ver nota del seed)
npm run db:types        # regenera src/types/database.ts desde el proyecto (correr tras cada migración)
npm run db:verify       # node scripts/verify-rls.mjs — 21 checks de RLS/RPC con la anon key
npm run db:verify:staff # node scripts/verify-staff-ops.mjs — 7 checks de close_table_session y aislamiento por tenant

npm run check:overflow  # node scripts/check-overflow.mjs — scroll horizontal en 7 rutas × 5 anchos
                        # (necesita `npm run dev` levantado y un Chromium instalado)
```

> **`supabase/seed.sql` NO se aplica con `db:push` contra un proyecto remoto** (comprobado el 2026-10-04:
> el CLI imprime "Updating seed hash" y lista el seed, pero sólo registra el hash; los datos quedan como estaban).
> El seed corre de verdad con `supabase db reset` en local. El tenant **"Bar de Prueba"** de dev se sembró una vez
> a mano y queda congelado: si se cambia `seed.sql`, hay que replicar el cambio con un `update` en el **SQL Editor
> del proyecto de dev**, o el fixture y el archivo se desincronizan y `db:verify` falla por una razón que no es un bug.

> **Storage** (Fase 5): bucket público `restaurant-media` (`supabase/migrations/20260918000100_storage_media.sql`),
> ruta `<restaurantId>/<logo|menu>/<archivo>`. RLS de `storage.objects` autoriza escritura con
> `can_manage((storage.foldername(name))[1]::uuid)` — el primer segmento de la ruta ES el tenant; nunca subir a una
> ruta que no empiece con el `restaurant_id` del usuario. Verificado en vivo (demo permite subir, `bar-prueba` no).

Antes de cerrar cualquier cambio: `lint`, `typecheck`, `test` y `build` en verde; si tocaste SQL, además `db:push`, `db:types` y ambos `db:verify*`.

> **Trampa de lógica de tres valores en SQL** (real, mordió en la Fase 3): una función `boolean` que termina en
> `a = b or c in (...)` puede devolver `NULL` en vez de `false` cuando `a = b` compara contra un `NULL` (p. ej.
> `current_restaurant_id()` sin sesión). En una política RLS `using (...)` eso es inofensivo (Postgres trata NULL
> como "no pasa"), pero en `if not mi_funcion(...) then raise ...` es un bug de seguridad: `not NULL` es NULL, y
> un `IF` con NULL no dispara. Siempre envolver funciones de autorización en `coalesce(..., false)`
> (`can_operate`/`can_manage` en `20260917000700_fix_can_operate_null.sql`). Se detectó con `db:verify:staff`
> contra un tenant privado real, no por inspección de código — correr los scripts de verificación, no alcanza con leer el SQL.
Hay `.claude/launch.json` (config `menu-web`) para levantar el dev server desde el Browser pane.

> Nunca editar archivos con `String.prototype.replace` en scripts Node cuando el texto de reemplazo contiene `$`
> (`$'`, `$&`… son patrones especiales): corrompió un regex SQL en la Fase 1. Usar el tool Edit o `split/join`.

> Nota Windows: editar archivos con `sed -i` no dispara el watcher de Vite (reemplaza por rename). Si el dev server sirve código viejo, tocar el archivo o reiniciar `npm run dev`.

### Variables de entorno

`.env.local` (ignorado por git, patrón `*.local`):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Nunca commitear valores. Nunca poner secretos en código.

## 3. Rutas

```
/                          landing (features/landing) con acceso a la demo
/r/:slug/m/:tableToken     COMENSAL: resuelve la mesa por token (get_table_by_token), valida el slug, monta ClientView
/demo                      → redirige a /demo/m/demo-mesa-04
/demo/m/:tableToken        comensal sobre el tenant demo (con DemoBar)
/demo/mozo · /demo/cocina  mozo y cocina del tenant demo SIN login (RLS is_demo)
/login                     email + contraseña (Supabase Auth)
/registro                  "Tengo un código" (join_restaurant) o "Crear mi restaurante" (create_restaurant)
/mozo                      STAFF real: StaffLayout(allowedRoles=['waiter']) → WaiterView
/cocina                    STAFF real: StaffLayout(allowedRoles=['kitchen']) → KitchenView
/admin/menu·mesas·personal·configuracion   STAFF real: StaffLayout(allowedRoles=[]) → AdminLayout (sólo owner/admin pasan)
/demo/admin/…              las mismas 4 páginas de admin sobre el tenant demo, sin login
*                          404 (app/RouteError)
```

Las vistas se cargan con `React.lazy` (un chunk por rol). `RootLayout` provee `QueryClientProvider` + `AuthProvider` + `ToastProvider` + `Suspense` + `OfflineBanner`.
`DemoLayout` carga el restaurante `demo` por slug (sin auth), lo publica en `RestaurantScopeContext` con `staffId: null, role: null`, suscribe realtime, aplica el tema de marca (`lib/brandStyle.ts`) y el título de pestaña (`useDocumentTitle`), y renderiza `DemoBar` (4 tabs: Cliente/Mozo/Cocina/Admin).
`StaffLayout` exige sesión real (si no, `<Navigate to="/login" state={{from}}>`), resuelve `staff` del usuario (`useMyStaff`), valida rol (owner/admin siempre pasan; si no, `allowedRoles`) y publica el scope con `staffId`/`role` reales; aplica el tema de marca y el título de pestaña igual que `DemoLayout`; renderiza `StaffTopBar` (logo/nombre del restaurante en ≥sm, rol, cerrar sesión, y para owner/admin un switch Mozo↔Cocina↔Admin) en vez de `DemoBar`. Pasar `allowedRoles={[]}` (como en `/admin`) restringe la ruta a owner/admin exclusivamente.
`WaiterView`/`KitchenView`/`AdminLayout` (y sus páginas) son agnósticos de demo-vs-real: sólo leen `useRestaurantScope()`, nunca `useAuth()` directo. `--topbar-h` sólo lo usa `ClientView` (comensal bajo `DemoBar`); las vistas de staff no lo necesitan.
`AdminLayout` usa **tabs horizontales**, no una sidebar clásica: es una desviación deliberada del plan original para cumplir la regla mobile-first (funciona a 360px); ver §6.

## 4. Estructura

```
src/
├── main.tsx                     # RouterProvider
├── index.css                    # @import tailwindcss, @theme (brand-*), animaciones, .no-scrollbar
├── app/
│   ├── router.tsx               # `routes` (para tests con createMemoryRouter) y `router`
│   ├── RootLayout.tsx           # providers + Suspense + lazy imports de las vistas
│   ├── queryClient.ts           # createAppQueryClient (staleTime 10 s, retry 1)
│   ├── RouteError.tsx           # 404 / error de render
│   └── router.test.tsx          # rutas + flujo comensal (variantes → pedido → Mis pedidos) + mozo + cocina, con services mockeados
├── types/
│   ├── database.ts              # GENERADO por `npm run db:types` — no editar a mano
│   └── domain.ts                # tipos de UI (camelCase): Restaurant, TableContext, Menu/MenuItem/OptionGroup, CartLine, SessionState, StaffOrder, StaffAlert…
├── lib/
│   ├── supabase.ts              # cliente único (anon key); lanza si faltan las env vars
│   ├── queryKeys.ts             # qk.*: todo lo del staff cuelga de ['staff', restaurantId]
│   ├── errors.ts                # toAppError: códigos de las RPCs → mensajes en español
│   ├── format.ts                # formatPrice(cents, currency, locale), timeAgo, minutesSince, sumLines, countUnits, plural
│   ├── brandStyle.ts            # variables --color-brand-* (color-mix) desde restaurant.theme.brand; la usan ClientLayout, StaffLayout y DemoLayout
│   ├── uid.ts, useNow.ts
├── services/                    # funciones puras sobre supabase-js; mapean filas → dominio. SE MOCKEAN en tests.
│   ├── restaurants.ts           # fetchRestaurantBySlug, toRestaurant
│   ├── tables.ts                # fetchTableByToken (RPC) · fetchTablesOverview, closeTableSession (RPC, staff)
│   ├── menu.ts                  # fetchMenu (categorías + platos con option_groups/options embebidos; soldOut calculado)
│   ├── orders.ts                # placeOrder, fetchSessionState (RPCs) · fetchActiveOrders, updateOrderStatus, updateOrderItems (staff)
│   ├── alerts.ts                # createAlert (RPC) · fetchOpenAlerts, resolveAlert
│   ├── staff.ts                 # fetchMyStaff(userId) (+ restaurante embebido), fetchMyAssignments(staffId)
│   ├── auth.ts                  # getSession, onAuthStateChange, signIn/signUp/signOut, resendSignupEmail, joinRestaurant, createRestaurant (RPCs)
│   ├── realtime.ts              # subscribeToRestaurant(rid, onChange) — postgres_changes filtrados por restaurant_id
│   ├── demo.ts                  # DEMO_SLUG, DEMO_TABLE_TOKEN, DEMO_CLIENT_PATH, resetDemo
│   ├── menuAdmin.ts             # CRUD categorías/platos/grupos/opciones + setItemAvailable, setSoldOutToday, updateItemPrice
│   ├── tablesAdmin.ts           # CRUD sectores/mesas (fetchAdminTables trae el token); setTableActive (soft delete)
│   ├── staffAdmin.ts            # fetchStaffList, updateStaffRole, setStaffActive; invitaciones; fetchAllAssignments/replaceAssignments
│   ├── settingsAdmin.ts         # updateRestaurantSettings, currentBrand(restaurant)
│   └── media.ts                 # uploadRestaurantMedia(restaurantId, 'logo'|'menu', file) → URL pública (Storage)
├── hooks/
│   ├── useQueries.ts            # useRestaurantBySlug, useTableByToken, useMenu, useSessionState (polling 8 s), useActiveOrders, useOpenAlerts, useTablesOverview, useMyAssignments, useMyStaff, useRealtimeInvalidation
│   ├── useStaffMutations.ts     # setStatus / editItems / resolve / closeSession con invalidación de ['staff', rid] y toast de error
│   ├── useAdminQueries.ts, useAdminMutations.ts  # todo lo de /admin; las mutaciones invalidan qk.admin(rid) en bloque
│   ├── useAuth.ts               # consume AuthContext (session, userId, loading, signOut)
│   ├── useQrDataUrl.ts          # data URL de un QR (librería `qrcode`), memoizado por texto
│   ├── useDocumentTitle.ts      # pone `document.title` mientras el componente está montado y restaura el anterior al desmontar
│   ├── useToast.ts, useFocusTrap.ts
├── components/ui/               # primitivos sin dependencia de datos
│   ├── Modal.tsx (Modal + Sheet), ConfirmDialog.tsx, Button.tsx, QtyControl.tsx, EmptyState.tsx, PageSpinner.tsx
│   ├── Skeleton.tsx (MenuSkeleton, CardsSkeleton), ErrorState.tsx, OfflineBanner.tsx, ToastProvider.tsx + toast-context.ts
└── features/
    ├── client/
    │   ├── ClientLayout.tsx     # ruta: resuelve token → skeleton / error / "Mesa no encontrada" / ClientProvider + tema de marca (lib/brandStyle.ts) + título de pestaña
    │   ├── ClientProvider.tsx   # sesión efectiva (mesa abierta en servidor ?? última local) + carrito, persistidos por token
    │   ├── client-context.ts, useClient.ts, cartReducer.ts (puro, testeado), optionRules.ts (puro, testeado)
    │   ├── ClientView.tsx       # tabs Menú / Mis pedidos, filtros, carrito flotante, alertas, ThanksScreen si la sesión se cerró
    │   ├── ClientHeader, MenuFilters, MenuItemCard, ItemOptionsSheet, CartDrawer, MyOrders, OrderStatusSteps, ThanksScreen
    ├── auth/
    │   ├── auth-context.ts, AuthProvider.tsx  # sesión de Supabase Auth, global (RootLayout)
    │   ├── LoginPage.tsx, RegisterPage.tsx, ConfirmEmailNotice.tsx
    │   └── pendingSetup.ts      # guarda en localStorage qué hacer (canjear código / crear restaurante) para completarlo cuando vuelve del link de confirmación de email
    ├── staff/
    │   ├── restaurant-scope-context.ts, useRestaurantScope  # { restaurant, staffId, role } — null/null en la demo
    │   ├── StaffLayout.tsx, StaffTopBar.tsx, roleHome.ts     # guard real de /mozo, /cocina y /admin; aplica tema de marca y título de pestaña; StaffTopBar muestra logo/nombre del restaurante (oculto <sm)
    ├── waiter/    WaiterView (tabs Pedidos/Mesas; alertas · entrantes · listos para entregar · en cocina; SoundToggle + useNewItemsAlert), AlertsPanel, OrderCard,
    │              OrderEditModal, TablesOverview (grilla de mesas + "Cerrar mesa"), assignmentFilter.ts (puro, testeado)
    ├── kitchen/   KitchenView (SoundToggle + useNewItemsAlert, useWakeLock siempre activo, useFullscreen para modo kiosco), KitchenTicket, urgency.ts
    ├── admin/     AdminLayout (tabs Menú/Mesas/Personal/Configuración) + adminNav.ts
    │              AdminMenuPage (categorías + platos, precio/visible/agotado inline) · ItemEditModal + OptionGroupEditor (variantes)
    │              AdminTablesPage (sectores + mesas + QR, hoja para imprimir con print:) · QrCode.tsx
    │              AdminStaffPage (equipo, invitaciones, asignación de mozos por sector/mesa)
    │              AdminSettingsPage (nombre, logo, color de marca, moneda) · ImageUploadField.tsx (URL o subida a Storage)
    ├── demo/      DemoLayout (+ useAutoResetDemo: red de seguridad client-side, resetea sola si `restaurants.created_at` tiene más de 65 min — por si pg_cron no llegó a activarse), DemoBar (NavLinks + badges + reset_demo; 4 tabs incl. Admin)
    └── landing/   LandingPage
```

**PWA y avisos (Fase 6):** `vite-plugin-pwa` (`vite.config.ts`) genera manifest + service worker (`registerType: 'autoUpdate'`, `navigateFallback: '/index.html'` sin denylist — el comensal necesita el fallback offline tanto como el staff); íconos en `public/icon-*.png` generados una sola vez con `scripts/generate-icons.mjs` (sharp, a partir de `scripts/assets/*.svg`) — no hace falta re-correrlo salvo que cambie el ícono. `lib/sound.ts` sintetiza el beep con Web Audio (sin archivos de audio) y expone `vibrate`/`notifyNewItem`; `hooks/useSoundPreference.ts` persiste el mute por dispositivo (`localStorage: menu:sound-enabled`) y desbloquea el audio en el primer `pointerdown` (los navegadores bloquean audio/vibración sin gesto previo — un error de consola "Blocked call to navigator.vibrate" sin gesto de usuario es **esperado**, no un bug). `hooks/useNewItemsAlert.ts` + `lib/hasNewIds.ts` (puro, testeado) comparan ids vistos vs. actuales para no sonar en el montaje inicial, sólo ante ids nuevos.

## 5. Modelo de datos en el frontend

**Estado de servidor = React Query** (`hooks/useQueries.ts`), nunca en contextos propios. Claves en `lib/queryKeys.ts`.
- Staff: `useActiveOrders` / `useOpenAlerts` con `refetchInterval` 15 s de respaldo; `useRealtimeInvalidation(rid)` invalida `['staff', rid]` (y `['menu', rid]` para `menu_items`) al llegar un evento.
- Comensal: `useSessionState(sessionId)` hace polling cada 8 s (también con la pestaña oculta) y se detiene cuando la sesión no existe o está cerrada. Anónimo no usa realtime (RLS).
- Mutaciones con `useMutation`; el éxito invalida las claves afectadas; el error va a un toast con `toAppError`.

**Estado local del comensal** (`ClientProvider`): `sessionId = table.session?.id ?? localSessionId` y `cart` (reducer puro), persistidos en `localStorage` bajo `menu:session:<token>` y `menu:cart:<token>`.
- `CartLine.key = itemId|opcionesOrdenadas`: misma variante se fusiona; `unitPrice` es sólo para mostrar (el servidor recalcula en `place_order`).
- Platos con `optionGroups` abren `ItemOptionsSheet` (reglas en `optionRules.ts`: required/min/max/single, preselección del primer single obligatorio); sin opciones se agregan directo.
- Sesión cerrada (`status = 'closed'`): `ThanksScreen`; "Ver el menú de nuevo" refetchea la mesa y limpia sesión + carrito. Cierres de hace > 2 h se limpian solos.
- Botones "Llamar al Mozo" / "Pedir la Cuenta" se deshabilitan mientras haya una alerta abierta de ese tipo (`create_alert` es idempotente igual).

**Importes en centavos** siempre; mostrar con `formatPrice(cents, restaurant.currency)`. Ciclo de pedido: `pending → kitchen → ready → delivered | cancelled`
(mozo: A cocina / Entregado / Cancelar; cocina: Listo). Los timestamps los sella la base.

## 5b. Base de datos (Supabase) — `supabase/migrations/`

Migraciones aplicadas (orden): `000100_schema` → `000200_functions` → `000300_policies` → `000400_demo_seed_fn` → `000500_demo_data_and_cron` → `000600_close_session` → `000700_fix_can_operate_null` → `20260918000100_storage_media` → `20260918000200_confirm_cron` (idempotente: confirma/programa el job `reset-demo` de pg_cron si no existía) → `20261004000100_sold_out_timezone` → `20261004000200_tables_overview`.
`supabase/seed.sql` sólo crea el tenant privado **"Bar de Prueba"** (`bar-prueba`, tokens `prueba-mesa-01/02`) para tests de aislamiento; no va a producción.

**Tablas** (todas con `restaurant_id` y RLS): `restaurants`, `sectors`, `tables` (token del QR), `staff` (id = auth.users.id, rol owner/admin/waiter/kitchen),
`staff_invites` (código canjeable, single-use), `waiter_assignments` (sector **o** mesa), `categories`, `menu_items` (`price` centavos, `is_available`, `sold_out_until` **timestamptz**: instante hasta el que está agotado),
`option_groups` (single/multiple, required, min/max), `options` (`price_delta`), `table_sessions` (una abierta por mesa: open → bill_requested → closed),
`orders` (pending → kitchen → ready → delivered | cancelled; `total` lo mantiene un trigger), `order_items` (snapshots de nombre/precio, `selected_options` jsonb, `line_total` generado), `alerts` (una abierta por mesa y tipo).

**RPCs** (`security definer`, el cliente anónimo sólo escribe a través de ellas):
- `get_table_by_token(p_token)` → restaurante + mesa + sesión abierta (o `null`).
- `place_order(p_token, p_items)` con `p_items = [{menu_item_id, qty, notes, option_ids[]}]` → `{order_id, session_id, total}`. **Recalcula precios y valida variantes en servidor**; errores: `EMPTY_ORDER`, `TABLE_NOT_FOUND`, `ITEM_NOT_FOUND`, `ITEM_UNAVAILABLE: <nombre>`, `OPTION_REQUIRED/MIN/MAX/SINGLE: <grupo>`, `OPTION_INVALID`, `INVALID_QTY`.
- `create_alert(p_token, p_type)` → `{alert_id, session_id, created}` (idempotente; `bill` pasa la sesión a `bill_requested`).
- `get_session_state(p_session_id)` → sesión, mesa, pedidos con ítems, alertas abiertas y total (el uuid de sesión es la capacidad del comensal).
- `join_restaurant(p_code, p_display_name?)`, `create_restaurant(p_name, p_slug)` (autenticado; errores `NOT_AUTHENTICATED`, `ALREADY_STAFF`, `INVITE_INVALID`, `INVITE_EMAIL_MISMATCH`, `SLUG_INVALID`, `SLUG_TAKEN`).
- `set_item_sold_out(p_menu_item_id, p_sold_out)` → timestamptz | null. Marca "agotado hoy" calculando el instante en el servidor con `restaurants.timezone`: el **próximo 06:00 local**, para que el corte caiga de madrugada y nunca en pleno servicio. `security invoker`: las políticas `can_manage` de `menu_items` deciden; si RLS no deja, lanza `NOT_AUTHORIZED`.
- `get_tables_overview(p_restaurant_id)` → una fila por mesa con sector, sesión abierta, total y `can_close`, calculado en la base (`security invoker`, RLS manda). Reemplaza la versión que bajaba todos los pedidos del restaurante al cliente.
- `close_table_session(p_session_id)` (Fase 3, staff): cierra la mesa, resuelve sus alertas abiertas. Idempotente si ya estaba cerrada. Errores: `SESSION_NOT_FOUND`, `NOT_AUTHORIZED`, `SESSION_HAS_ACTIVE_ORDERS`.
- `reset_demo()` (público) recrea el tenant demo; `seed_demo()` es interna. pg_cron intenta correr `reset_demo()` cada hora (`reset-demo`); confirmar en el dashboard → Integrations → Cron.

**RLS**: helpers `current_restaurant_id()`, `current_staff_role()`, `is_manager()` (security definer) y `can_operate(rid)` / `can_manage(rid)`, ambas envueltas en `coalesce(..., false)` —
**nunca les quites el coalesce**: sin él devuelven `NULL` para anon en un tenant no-demo (`p_restaurant_id = NULL` de `current_restaurant_id()`), que una política RLS trata como "no pasa" pero que un `if not can_operate(...) then raise` de PL/pgSQL **no dispara** (bug real, ver nota de la Fase 3 más arriba).
Menú y restaurantes: lectura pública. Mesas/sesiones/pedidos/ítems/alertas: sólo `can_operate`. Configuración (menú, mesas, sectores, staff, invitaciones): `can_manage`.
**Tenant demo** (`is_demo = true`, id `00000000-0000-4000-8000-000000000001`, slug `demo`, tokens `demo-mesa-01..12`): `can_operate`/`can_manage` son verdaderas para cualquiera, sin login.
Realtime publica `orders, order_items, alerts, table_sessions, menu_items` (respeta las políticas de select).

**Convenciones SQL**: ids deterministas del demo con `demo_uuid(bloque, n)`; funciones con `set search_path = public`; funciones internas con `revoke execute ... from public, anon, authenticated`;
nueva migración = nuevo archivo `YYYYMMDDHHmmss_nombre.sql` (nunca editar una ya aplicada), luego `db:push` + `db:types` + `db:verify` + `db:verify:staff`.
Cualquier función de autorización nueva (booleana, usada en `if not ... then raise`) va envuelta en `coalesce(..., false)` — no asumir que un `boolean` de SQL nunca es `NULL`.

## 5c. Auth y roles (Fase 3)

**Sesión**: `AuthProvider` (en `RootLayout`, envuelve toda la app) llama `getSession()` + se suscribe con `onAuthStateChange`; expone `{session, userId, loading, signOut}` vía `useAuth()`. Nunca leer `supabase.auth` directo desde un componente — todo pasa por `services/auth.ts`.

**Alta** (`RegisterPage`, dos modos): "Tengo un código" → `joinRestaurant(code, displayName)`; "Crear mi restaurante" → `createRestaurant(name, slug)` (slug autogenerado con `lib/slugify.ts`, editable). Antes de `signUpWithPassword` se guarda la acción en `localStorage` (`features/auth/pendingSetup.ts`) porque **el proyecto exige confirmar el email** (comprobado en vivo: `signUp` no devuelve sesión hasta confirmar) — si `signUp` sí trae sesión inmediata, se consume la acción ahí mismo; si no, se muestra `ConfirmEmailNotice` y, cuando el usuario vuelve del link (`emailRedirectTo: origin + '/registro'`, `detectSessionInUrl: true`), el `useEffect` de `RegisterPage` detecta la sesión nueva y termina el alta sola. Un `useRef` (`consumingRef`) evita que la acción se ejecute dos veces si el submit y el efecto llegan a solaparse.

**Guard** (`StaffLayout`, parametrizado con `allowedRoles`): sin sesión → `/login` (con `state.from`); sin fila `staff` → mensaje + link a `/registro`; `staff.is_active = false` → mensaje de cuenta desactivada; rol fuera de `allowedRoles` (owner/admin siempre entran) → mensaje + link a `roleHome(role)`. Sólo entonces publica `RestaurantScopeContext` y monta la vista — **la misma `WaiterView`/`KitchenView` que usa la demo**, sin ninguna rama de código demo-vs-real dentro de esas vistas.

**Asignación de mozos** (`waiter_assignments`, filtrado en el cliente): `useMyAssignments(staffId)` trae las filas del mozo logueado (`staffId` es `null` en la demo → hook desactivado → sin filtrar, comportamiento actual). `features/waiter/assignmentFilter.ts` (puro, testeado) filtra pedidos/alertas/mesas por sector ∪ mesa asignada; sin asignaciones = ve todo; toggle "Ver todas" en `WaiterView` la pasa por alto. **Todavía no hay UI para crear asignaciones** (eso es Fase 5 → Personal); por ahora se cargan a mano en la base.

**Mesas** (`TablesOverview`, pestaña del mozo): `fetchTablesOverview(restaurantId)` junta `tables` + `table_sessions` abiertas + suma de `orders.total` (no cancelados) por sesión, agrupadas por sector. "Cerrar mesa" llama `close_table_session`; se deshabilita preventivamente con `TableOverview.canClose` (mismo dato que ya trae `useActiveOrders`) y la RPC vuelve a validarlo server-side.

## 5d. Administración (Fase 5)

**Patrón general:** cada página de `/admin` es CRUD directo contra Postgres vía `supabase-js` (no hay RPCs nuevas: las políticas `*_write_manager` de `can_manage` ya alcanzan). Las mutaciones (`hooks/useAdminMutations.ts`) invalidan `qk.admin(restaurantId)` **en bloque** al terminar — no hay invalidación selectiva por sub-sección, así que cualquier cambio (menú, mesas, personal) refresca las cuatro páginas del admin. Todas las ediciones simples (precio, nombre de una opción, etc.) persisten solas al perder el foco (`onBlur`) o al tocar un switch — no hay un botón "Guardar" general salvo en el formulario base del plato y en Configuración.

**Menú** (`AdminMenuPage` + `ItemEditModal` + `OptionGroupEditor`):
- Categorías: alta/orden (flechas ▲▼ intercambian `sort_order` con la vecina)/ocultar/eliminar. **Eliminar una categoría con platos está bloqueado en la UI** (el botón se deshabilita) porque `menu_items.category_id` tiene `on delete cascade` — borrarla se llevaría los platos. Ocultarla (`is_active=false`) es la vía segura.
- Platos: precio editable inline en la lista (input en la moneda del restaurante, no en centavos; se redondea con `Math.round(valor*100)` al guardar). "Visible"/"Oculto" = `is_available`. El ícono de prohibido = "agotado hoy" (`sold_out_until = hoy`, se limpia solo al otro día). Eliminar un plato SÍ es seguro (`order_items.menu_item_id on delete set null`: el historial conserva el `name_snapshot`).
- `ItemEditModal`: para un plato **nuevo**, primero hay que "Guardar" los datos base (crea la fila y devuelve el id) antes de poder agregarle variantes — el editor de grupos/opciones necesita un `menu_item_id` real. Una vez guardado, el botón pasa de "Cancelar" a "Listo".
- `OptionGroupEditor` no recibe los grupos por props: los lee de `useAdminMenuItems(restaurantId)` (el mismo query de la lista) buscando el item por id, así que se actualiza solo después de cada mutación sin lógica de refetch propia. **Si alguna vez se separa esta consulta, hay que replicar esa reactividad a mano.**

**Mesas y sectores** (`AdminTablesPage`): sectores con alta/baja simple (`tables.sector_id on delete set null`: borrar un sector no rompe nada). Mesas con alta y reasignación de sector; **"desactivar" en vez de eliminar** (`tables` no tiene delete en la UI) porque `orders.table_id on delete cascade` se llevaría puesto todo el historial de esa mesa. El QR se genera client-side con `qrcode` a partir de `${origin}/r/${slug}/m/${token}`; "Descargar" baja un PNG de 512px, la hoja para imprimir es una segunda copia del contenido con clases `hidden print:block` (oculta en pantalla, visible sólo en `window.print()` — por eso en jsdom/tests el texto de cada mesa aparece dos veces, ver `admin.test.tsx`).

**Personal** (`AdminStaffPage`): el equipo no incluye email (no está en `staff`, sólo en `auth.users`, que el frontend no puede leer con la anon key). El rol `owner` nunca se asigna desde acá (se define una sola vez en `create_restaurant`); el selector de rol lo excluye y las filas `owner` no tienen selector. Un mozo no puede editar su propio rol ni desactivarse (comparación `s.id === staffId` del scope). Invitaciones: `createInvite` inserta en `staff_invites` (la base genera el código); se muestra una sola vez destacado con botón de copiar, y queda listado con `timeUntil(expiresAt)` (**no `timeAgo`**: es una fecha futura — confundir los dos fue un bug real de esta fase, ver abajo). La asignación de sectores/mesas de un mozo (`AssignmentEditor`, expandible por fila) llama `replaceAssignments`: borra todas sus filas de `waiter_assignments` y reinserta la selección actual.

**Configuración** (`AdminSettingsPage`): nombre/tagline/logo/moneda/color, todo en un único "Guardar" (`updateRestaurantSettings`). El color se guarda como `theme.brand` (jsonb) — pisa cualquier otra clave de `theme` que hubiera (no hay más claves usadas todavía). Al guardar, además de `qk.admin`, se invalidan `['my-staff']` y `['restaurant-by-slug']` para que el cambio se vea también en el `StaffTopBar`/`DemoBar` y en la vista del comensal sin recargar.

**Storage**: `ImageUploadField` (reusado en el plato y en Configuración) sube a `restaurant-media/<restaurantId>/<logo|menu>/<uid>.<ext>` y llena la URL sola; el campo URL sigue editable a mano para quien prefiera pegar un link externo.

> **Bug real de esta fase:** mostré el vencimiento de una invitación (fecha futura) con `timeAgo` (diseñado para el pasado: clampea a `recién`) y decía "vence recién" para algo que vencía en 7 días. Se detectó probando en vivo, no por inspección — se agregó `timeUntil` a `lib/format.ts` (con tests) para fechas futuras. **Regla:** `timeAgo` es sólo para el pasado; cualquier fecha futura (vencimientos, próximos turnos, etc.) usa `timeUntil`.

## 6. Convenciones

- **Idioma:** UI, comentarios, commits y docs en **español** (voseo en UI: "Agregá", "Probá").
- **TypeScript estricto**: sin `any`; tipos de dominio en `types/domain.ts`; `import type` para tipos.
- **Un archivo = componentes o helpers, no ambos** (regla fast-refresh de oxlint). Hooks en `hooks/`, contextos en `*-context.ts`, helpers puros en `.ts`.
- **Datos:** componentes → hooks (`useQueries`, `useStaffMutations`) → `services/` → supabase. Nunca llamar a `supabase` desde un componente. Los tests mockean `@/services/*` (fixtures en `src/test/fixtures.ts`).
- **Sin `setState` dentro de efectos** para sincronizar props (regla `react/set-state-in-effect`): derivar en render.
- **Mobile-first, no mobile-only.** Todo debe funcionar a 360px. Botones con `whitespace-nowrap`; footers con `flex-wrap`. Todo componente nuevo declara qué hace de `md` en adelante; si la respuesta es "nada", que sea decisión escrita y no un olvido.
- **Objetivos de toque:** mínimo 44×44 px en controles primarios (`Button` size `md`/`lg`, botones de ícono con `min-h-11 min-w-11`), 36 px en secundarios densos (`sm`). Nunca menos de 24.
- **Contraste:** `text-stone-400` **no se usa para texto sobre fondo claro** (≈2.8:1, no llega a 4.5:1) — sólo decorativo, o sobre fondo oscuro (`stone-800/900`, donde da ~7:1). Texto secundario: `stone-500` sobre blanco, `stone-600` sobre `stone-50/100`. En cocina (se lee a 1–2 m) el secundario sobre oscuro es `stone-300`.
- **Áreas seguras:** cualquier cosa fija abajo usa `env(safe-area-inset-bottom)`. `Modal`/`Sheet` ya lo resuelven en el pie (y en el cuerpo si no hay pie): no repetirlo en cada hoja.
- **Animaciones:** toda animación nueva se neutraliza bajo `prefers-reduced-motion` (el bloque está al final de `index.css`); el `animate-spin` de carga se conserva porque comunica estado.
- **Tamaños de letra y anchos:** de los tokens de `index.css` (`--text-*` multiplicados por `--font-scale`; `max-w-client/admin/staff/kds`). Nada de `text-[Npx]` ni `max-w-*` suelto salvo caso justificado por escrito. Hay un breakpoint `xs` (420px) para decidir ícono-solo vs. ícono+texto en barras de navegación; `sm` (640px) llega demasiado tarde para eso.
- **Nunca scroll horizontal.** Es el bug que más rompe la vista en celulares (barra blanca al costado / web cortada) y **no se detecta leyendo el código**: depende del ancho intrínseco del texto y de los inputs. Correr `npm run check:overflow` (con `npm run dev` levantado) ante cualquier cambio de layout. Las dos causas que ya mordieron: un `flex-1` reparte ancho **igual** entre hermanos y corta el más largo (usar `flex-auto`, que reparte desde el contenido), y un hijo flex sin `min-w-0` no se encoge por debajo de su contenido. Los inputs ya tienen `min-width: 0` global en `index.css`. **No** se arregla con `overflow-x: hidden` en `body`: eso rompería los `sticky` de las barras.
- **Sin librerías de UI.** Diálogos siempre sobre `Modal`/`Sheet` (accesibilidad resuelta ahí). Confirmaciones con `ConfirmDialog`, nunca `window.confirm`.
- **Botones:** usar `<Button>` salvo controles muy específicos (chips, barra flotante, tabs). Nunca sobreescribir el color de una variante con `className`: crear variante.
- **Colores:** `brand-*` (naranja) para marca. Semánticos: emerald = OK/enviar, amber = pendiente, red = urgente/alerta, sky = cuenta/en cocina, yellow = notas de cocina.
- **z-index:** barra demo 40, filtros sticky 30, botón carrito 40, modales 50 (portal a `body`), toast 60.
- **Tiempo:** nunca `Date.now()` en render; `useNow(intervalo)` y pasar `now` por props. `timeAgo` = pasado, `timeUntil` = futuro — no mezclar (ver §5d).
- **Navegación admin/staff:** tabs horizontales, no sidebar — decisión deliberada por la regla mobile-first (`AdminLayout` es la referencia si hace falta otra pantalla con navegación por secciones).
- **Accesibilidad mínima:** `aria-label` en botones de ícono, `aria-hidden` en íconos decorativos, `role="dialog"` + `aria-modal` + `aria-labelledby` en diálogos, `role="status"` para toasts.
- **Tests:** utilidades y reducers con tests unitarios; vistas con smoke vía `createMemoryRouter(routes)`. Ejecutar `npm test` antes de commitear.
- **Auth:** nunca `supabase.auth.*` directo en un componente — pasa por `services/auth.ts` y `useAuth()`. Guards de ruta (`StaffLayout`) devuelven UI (`<Navigate>` o mensaje), nunca lanzan.
- **SQL de autorización:** toda función `boolean` para `if not fn(...) then raise` va con `coalesce(..., false)` (ver §5b) — verificarlo con `db:verify:staff`, no alcanza con leerlo.
- **Nada de fechas para decidir "hoy".** Postgres en Supabase corre en **UTC**, así que `current_date` cambia a las **21:00 hora argentina**, en pleno servicio; y `new Date().toISOString().slice(0,10)` en el navegador tiene el mismo problema. Un `date` que significa "hasta hoy" se desmarca solo a las 21:00. Guardar **instantes** (`timestamptz`) y comparar con `now()` / `Date.now()`; si hace falta un límite de día, calcularlo en el servidor con `restaurants.timezone` (ver `set_item_sold_out`, migración `20261004000100`). El corte se pone a las **06:00 locales**, no a medianoche: un bar que cierra a las 3 AM sigue en servicio a las 00:00.

## 7. Roadmap (ver `docs/plan-producto.md`)

- [x] **Fase 0** — TS, react-router, `components/ui`, precios en centavos, Vitest, hooks separados
- [x] **Fase 1** — Supabase: esquema, RLS, RPCs, seed del tenant demo, tipos generados, `db:verify` (21 checks)
- [x] **Fase 2** — Cliente conectado: `/r/:slug/m/:token`, menú desde DB, variantes (ItemOptionsSheet), `place_order`, Mis pedidos / La cuenta, mozo y cocina sobre Supabase con realtime
- [x] **Fase 3** — Auth (login/registro, confirmación de email), `StaffLayout` con guard por rol, `/mozo` y `/cocina` reales, filtro por asignación de mozo, pestaña Mesas + `close_table_session`, `db:verify:staff` (7 checks)
- [x] **Fase 4** — fusionada: el editor de variantes vive en `ItemEditModal`/`OptionGroupEditor` (Fase 5)
- [x] **Fase 5** — Panel admin (`/admin`, y `/demo/admin` sin login): menú con precio/visible/agotado hoy inline + variantes, mesas/sectores con QR descargable y hoja para imprimir, personal (roles, invitaciones, asignación de mozos), configuración (nombre/logo/color/moneda) con subida de imágenes a Storage. 59 tests, todo verificado en vivo contra el tenant demo (crear plato con variantes → aparece en el menú real del comensal; cerrar mesa; cambiar el color y verlo propagarse a `StaffTopBar`/`DemoBar`/comensal). **Pendiente de esta fase:** verificación end-to-end del login real de un mozo/admin de carne y hueso (bloqueada por confirmación de email, igual que en la Fase 3 — ver §5c)
- [x] **Fase 6** — Sonido + vibración en mozo/cocina (`lib/sound.ts`, mute persistido por dispositivo), PWA instalable (`vite-plugin-pwa`, íconos propios), Wake Lock + pantalla completa en cocina, landing con tarjeta de Admin y CTA a `/registro`, red de seguridad client-side para el reset horario de la demo (`useAutoResetDemo`, por si `pg_cron` no llegó a activarse), CI (`.github/workflows/ci.yml`: lint/typecheck/test/build), `vercel.json` (rewrite SPA) y docs de operación (`docs/deploy.md`, `docs/alta-restaurante.md`, `docs/manual-mozo-cocina.md`).
- [x] **Puesta en producción** — proyecto Supabase de producción separado del de desarrollo, Vercel Production → prod y Preview → dev (`docs/deploy.md`). Alta de restaurante probada con un usuario real (el email de confirmación cae en spam hasta tener SMTP propio).
- [ ] **Siguiente** — ver [`docs/nuevas-funcionalidades.md`](docs/nuevas-funcionalidades.md) (v1.1: pulido de admin/mozo/cocina, suspensión de restaurantes y panel superadmin; v2: Mercado Pago). Pedir un plan de implementación antes de empezar.

Fuera de alcance del MVP: pagos online (planificado como v2 con Mercado Pago, ver `docs/nuevas-funcionalidades.md`), impresión térmica, facturación de suscripciones, reportes, app nativa.
