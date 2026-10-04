# Plan de implementación — v1.1 (operación, admin, mozo y cocina)

Plan derivado de [`docs/nuevas-funcionalidades.md`](nuevas-funcionalidades.md) (backlog: *qué* se quiere) →
este doc define *cómo* y *en qué orden*. Escrito el 2026-09-27, sin escribir código todavía.

Mercado Pago (sección E del backlog) tiene su propio plan en
[`docs/plan-mercadopago.md`](plan-mercadopago.md). El pulido visual transversal está en
[`docs/plan-ui-ux.md`](plan-ui-ux.md). Las mejoras de UI puntuales que pide el backlog (B3, B4) se coordinan con
ese plan para no rehacer las mismas pantallas dos veces.

> **Cómo usar este doc:** cada bloque es una tanda de trabajo cerrable con un commit y sus tests. Antes de
> arrancar un bloque, leer sus "decisiones pendientes": si alguna sigue abierta, resolverla primero. Al cerrar un
> bloque, marcarlo acá y en el backlog.

## Orden de trabajo recomendado

| # | Bloque | Contenido | Por qué en ese lugar |
|---|---|---|---|
| **0** | Bugs encontrados al planificar | Zona horaria de "agotado hoy", `locale` muerto, consulta de Mesas sin límite | No estaban en el backlog. El de zona horaria afecta el servicio **hoy**; los otros dos son baratos y tocan archivos que los bloques siguientes van a modificar igual |
| **1** | Cuentas y acceso (A1 + A2) | SMTP propio con dominio, "olvidé mi contraseña" | Bloquea el alta de clientes reales sin asistencia. A2 depende del mismo correo que A1 |
| **2** | Plataforma (A4 + A5) | Estado del restaurante + panel superadmin | A4 se opera desde A5: hacerlos juntos evita tocar RLS dos veces |
| **3** | Totales de la mesa (B6 + C1) | Cargos fijos (cubierto/servicio) y ajustes del mozo | **Prerrequisito de Mercado Pago**: define el importe único que después se cobra |
| **4** | Admin — config y menú (B1, B2, B3, B5, B7) | Tema ampliado, compresión de imágenes, selector de emoji, catálogo de etiquetas, sonidos | Todo cae en `/admin`; se hace de una para no repetir migraciones de `theme` |
| **5** | Formulario de plato (B4) | Rediseño de `ItemEditModal` | Se apoya en B2/B3/B5 ya hechos y en el plan de UI/UX |
| **6** | Cocina propone agotado (D1) | Flujo cocina → aprobación admin | Independiente; el menos urgente |

Los bloques 1 y 2 son los que hay que tener **antes de cobrarle a un cliente**. El 3 antes de Mercado Pago.

---

## Bloque 0 — Bugs encontrados al planificar ✅ 0.1 y 0.3 IMPLEMENTADOS (2026-10-04) · 0.2 pendiente de decisión

> **Estado:**
> - **0.1 (zona horaria) hecho.** `restaurants.timezone` + `menu_items.sold_out_until` pasó de `date` a
>   `timestamptz` con backfill, RPC `set_item_sold_out` (calcula el próximo 06:00 local en el servidor),
>   `place_order` compara contra `now()`, helper puro `lib/soldOut.ts` con tests (incluido el caso 20:59/21:01
>   ART que antes fallaba) y dos checks nuevos en `db:verify`. Apareció un **cuarto** lugar con el mismo bug que
>   no estaba en el diagnóstico: el badge "Agotado hoy" de `AdminMenuPage`.
> - **0.3 (consulta de Mesas) hecho.** RPC `get_tables_overview`: una fila por mesa calculada en la base, en
>   lugar de bajar todos los pedidos no cancelados del restaurante cada 15 s.
> - **0.2 (`locale`) pendiente:** necesita decidir si se usa o se saca (decisión 2 del resumen).
>
> **Hallazgo lateral:** `supabase/seed.sql` **no se aplica** con `db:push` contra un proyecto remoto — el CLI sólo
> registra el hash. El tenant "Bar de Prueba" de dev quedó congelado desde el 2026-09-17, así que al cambiar el
> seed hay que replicar el cambio a mano en el SQL Editor de dev. Documentado en `CLAUDE.md` §2.

Los tres salieron de leer el código para armar este plan, no del backlog. Ninguno tiene test que los cubra hoy.

### 0.1 "Agotado hoy" usa la fecha UTC: el plato reaparece a las 21:00, en plena cena 🔴

**Qué pasa.** El día se calcula en UTC en los tres lugares donde se decide si un plato está agotado:

| Lugar | Código | Resultado |
|---|---|---|
| Escritura (admin) | `services/menuAdmin.ts:136` — `new Date().toISOString().slice(0, 10)` | fecha **UTC** |
| Lectura (menú del comensal) | `services/menu.ts:5` — `todayISO()`, igual | fecha **UTC** |
| Validación (servidor) | `place_order`, `20260917000200_functions.sql:168` — `sold_out_until >= current_date` | `current_date` es **UTC** (Supabase no fija zona horaria; no hay nada en `supabase/config.toml` ni en las migraciones que la cambie) |

Argentina es UTC−3, así que la fecha UTC cambia a las **21:00 hora local**. Consecuencias reales:

- El encargado marca un plato "agotado hoy" a las 19:00 del martes → se guarda `martes`. A las **21:00 del
  martes**, `current_date` (UTC) pasa a miércoles, `sold_out_until >= current_date` da falso y **el plato vuelve
  a aparecer disponible en el pico del servicio**. El comensal lo pide y la cocina no lo tiene.
- Al revés: si lo marca a las 22:00 del martes, se guarda `miércoles` (UTC) y queda bloqueado hasta las 21:00 del
  miércoles — casi un día entero de más.

**Recomendación (la de fondo):** dejar de razonar con fechas y pasar a un instante.

1. Migración nueva: `restaurants.timezone text not null default 'America/Argentina/Buenos_Aires'`
   (hace falta igual para cualquier reporte por día, ver "Ideas nuevas" → cierre del día).
2. Reemplazar `menu_items.sold_out_until date` por **`sold_out_until timestamptz`** con el significado "agotado
   hasta este instante", y backfillear los valores existentes al inicio del día siguiente en la zona del
   restaurante.
3. "Agotado hoy" pasa a escribir *mañana a las 06:00 hora del restaurante* —
   `(date_trunc('day', now() at time zone tz) + interval '1 day 6 hours') at time zone tz` — para que el corte
   caiga de madrugada y nunca durante el servicio.
4. Lectura: `soldOut = sold_out_until !== null && new Date(sold_out_until) > new Date()`. Sin `Intl`, sin fechas,
   sin zona horaria en el cliente. `place_order`: `sold_out_until > now()`.

*Variante mínima si se quiere tocar menos:* dejar la columna `date` y calcular el día con la zona del
restaurante en los tres lugares (`(now() at time zone r.timezone)::date` en SQL, `Intl.DateTimeFormat('en-CA',
{ timeZone })` en el cliente). Resuelve el bug pero deja el corte a medianoche local, que en un bar que cierra a
las 3 AM sigue siendo en horario de servicio.

**Archivos:** migración nueva · `services/menuAdmin.ts` (`setSoldOutToday`) · `services/menu.ts`
(`todayISO`/`toItem`) · `services/restaurants.ts` + `types/domain.ts` (campo `timezone`) ·
`20260917000200_functions.sql` → nueva migración con `place_order` corregido · `AdminMenuPage` (texto del
tooltip si cambia el significado).
**Tests:** unitario de la nueva función pura de comparación; caso 20:59/21:01 ART que hoy falla.
**Verificación:** agregar un check a `scripts/verify-rls.mjs` (patrón `check(nombre, fn)` + `assert`): marcar
agotado un plato de `bar-prueba` y confirmar que `place_order` lo rechaza con `ITEM_UNAVAILABLE` sin importar la
hora.

### 0.2 `restaurants.locale` es configuración muerta

`formatPrice(cents, currency = 'ARS', locale = 'es-AR')` acepta locale (`lib/format.ts`), la columna existe en la
base y viaja hasta `Restaurant.locale` (`services/restaurants.ts:26`), pero **ninguno de los ~17 call sites lo
pasa** — todos llaman `formatPrice(x, currency)`. Un restaurante con otro `locale` se formatea igual.

**Recomendación:** decidir una de las dos y no dejarlo a medias.
- **Usarlo** (recomendado si se piensa vender fuera de Argentina): pasar `restaurant.locale` en todos los call
  sites. Como son muchos y siempre junto a `currency`, conviene un helper de contexto
  (`useMoney()` → `(cents) => formatPrice(cents, currency, locale)`) en vez de propagar dos props más por cada
  componente.
- **Sacarlo** del tipo y del select si el alcance sigue siendo es-AR, y dejar la columna en la base sin usar.

**Nota:** esto se cruza con el plan de UI/UX (el helper `useMoney()` simplifica varios componentes) y con el
bloque 3 (los cargos fijos se muestran formateados en más lugares).

### 0.3 La pestaña Mesas descarga **todos** los pedidos históricos, cada 15 s

`fetchTablesOverview` (`services/tables.ts`) hace:

```ts
supabase.from('orders').select('session_id, status, total').eq('restaurant_id', rid).neq('status', 'cancelled')
```

Sin filtro de fecha ni de sesión: trae el historial completo del restaurante, y el hook lo repite cada 15 s
(`useQueries.ts`, `refetchInterval`). Con 80 pedidos/día son ~2.400 filas al mes, ~29.000 al año, bajando al
teléfono del mozo cada 15 segundos. Hoy no se nota porque los restaurantes son nuevos.

**Recomendación:** mover el cálculo a SQL. Encaja con el bloque 3, que va a necesitar un total por sesión
server-side de todas formas: una sola RPC `get_tables_overview(p_restaurant_id)` que devuelva mesa + sesión
abierta + total + `can_close`, calculado en la base sobre las sesiones **no cerradas** únicamente. Baja una fila
por mesa en vez de todo el historial, y deja de duplicar en TypeScript una lógica de totales que el bloque 3
vuelve a tocar.

**Archivos:** migración nueva (RPC) · `services/tables.ts` · `hooks/useQueries.ts` (sin cambios de firma).
**Tests:** los de `TablesOverview` siguen mockeando el service, no cambian.

---

## Bloque 1 — Cuentas y acceso (A1 + A2)

### 1.1 SMTP propio con dominio autenticado (A1)

**Fuera de código, primero:** comprar el dominio y configurarlo. Bloquea todo lo demás y define la URL que va en
los QR impresos (ver `docs/deploy.md` §2: conviene fijar el dominio **antes** de imprimir QR de clientes nuevos).

Pasos, en orden:

1. Comprar el dominio.
2. Crear cuenta en **Resend** (o similar), agregar el dominio y cargar en el DNS los registros que indique:
   **SPF** (TXT), **DKIM** (CNAME/TXT) y **DMARC** (TXT, arrancar con `p=none`). Son la firma que le prueba a
   Gmail que el correo es legítimo; sin ellos el mail sigue yendo a spam.
3. Esperar la verificación del dominio en Resend (minutos u horas según el DNS).
4. En **Vercel**: agregar el dominio al proyecto y apuntar el DNS. Definir si la app vive en el apex
   (`midominio.com`) o en un subdominio (`app.midominio.com`) — **esa decisión entra en los QR**.
5. En **Supabase → Authentication → Emails → SMTP Settings** (en **los dos** proyectos, dev y prod): host, puerto,
   usuario y contraseña de Resend, `sender email` con el dominio propio y `sender name` con el nombre del
   producto.
6. **Authentication → URL Configuration**: actualizar *Site URL* y *Redirect URLs* al dominio nuevo
   (`https://<dominio>/**`), sin quitar el de Vercel hasta confirmar que el nuevo anda.
7. **Authentication → Email Templates**: traducir al español las plantillas de *Confirm signup*, *Reset
   password* e *Invite*, con el nombre del producto.
8. Probar de punta a punta con una cuenta de Gmail nueva y confirmar que **no** cae en spam.

**Código:** nada, salvo actualizar `docs/deploy.md` §1 y el plan B de "email que no llega", y revisar que
`emailRedirectTo` (`RegisterPage`) siga usando `origin` (funciona con cualquier dominio, no hay nada hardcodeado).

### 1.2 "Olvidé mi contraseña" (A2)

Hoy no existe: en `services/auth.ts` no hay `resetPasswordForEmail` ni `updateUser`.

**Flujo:** `/login` → link "¿Olvidaste tu contraseña?" → `/recuperar` (pide email) → Supabase manda el correo →
el link vuelve a `/nueva-contrasena` con la sesión de recuperación en la URL
(`detectSessionInUrl: true` ya está activo en `lib/supabase.ts`) → el usuario elige contraseña nueva → redirige a
`roleHome(role)`.

**Archivos:**
- `services/auth.ts`: `requestPasswordReset(email, redirectTo)` → `supabase.auth.resetPasswordForEmail`;
  `updatePassword(newPassword)` → `supabase.auth.updateUser`. Nada de `supabase.auth.*` en componentes
  (`CLAUDE.md` §6).
- `features/auth/ForgotPasswordPage.tsx` y `features/auth/NewPasswordPage.tsx` (lazy en `RootLayout`, rutas en
  `app/router.tsx`).
- `features/auth/LoginPage.tsx`: el link.
- `lib/errors.ts`: agregar a `AUTH_MESSAGES` los mensajes de GoTrue de este flujo (token expirado/usado:
  `/token has expired|invalid or has expired/i`, y `same password` si Supabase lo rechaza).
- `docs/manual-mozo-cocina.md`: actualizar "Problemas comunes" (hoy dice que depende de soporte manual).

**Dependencia:** con el correo por defecto de Supabase el mail de recuperación también cae en spam → hacerlo
**después** de 1.1, o avisar al usuario que revise spam mientras tanto.
**Tests:** smoke de las dos rutas nuevas con `createMemoryRouter(routes)` y `@/services/auth` mockeado, como
`router.test.tsx` hace con login/registro.

---

## Bloque 2 — Plataforma: estado del restaurante + superadmin (A4 + A5)

El hallazgo que define este bloque: **hay 36 políticas RLS y todas pasan por `can_operate()` / `can_manage()`**
(`20260917000300_policies.sql`). Entonces *no hay que tocar las 36*: suspensión y superadmin se resuelven dentro
de esas dos funciones. Una migración chica en vez de una reescritura de las políticas.

### 2.1 Estado del restaurante (A4)

**Decidido (2026-09-27): el corte es en dos etapas.** Cuando un restaurante deja de pagar, primero el menú queda
**sólo visible** (el comensal ve la carta y los precios pero no puede pedir ni llamar al mozo) y, **si no renueva
en 7 días**, el menú se oculta con "Este menú no está disponible por el momento".

**Migración:**

```sql
create type public.restaurant_status as enum ('active', 'read_only', 'suspended');
alter table public.restaurants
  add column status public.restaurant_status not null default 'active',
  add column status_since timestamptz not null default now();   -- cuándo entró al estado actual
-- el tenant demo nunca se suspende
alter table public.restaurants add constraint restaurants_demo_always_active
  check (not is_demo or status = 'active');
```

| Estado | Comensal | Staff (mozo/cocina/admin) |
|---|---|---|
| `active` | Todo normal | Todo normal |
| `read_only` | Ve el menú; **no** puede pedir ni llamar al mozo. Aviso discreto tipo "Los pedidos están momentáneamente deshabilitados" | Sigue entrando (necesita cerrar las mesas abiertas) + banner de aviso de pago en `/admin` |
| `suspended` | "Este menú no está disponible por el momento" | Bloqueado, con "contactá a soporte" |

**El salto de `read_only` a `suspended` a los 7 días se automatiza**, no se hace a mano: este proyecto ya tiene
`pg_cron` configurado y en uso (el job `reset-demo`, ver `docs/deploy.md` §1), así que va un job diario que hace
`update restaurants set status = 'suspended' where status = 'read_only' and status_since < now() - interval '7 days' and not is_demo`.
El superadmin (2.2) puede adelantar o revertir el cambio a mano.

> Si más adelante hace falta una etapa previa de "aviso sin cortar nada" (`past_due`), va en **otra** migración:
> `alter type ... add value` no permite usar el valor nuevo en la misma transacción en que se agrega.

> **Ojo con los enums:** crear un tipo nuevo dentro de una migración es seguro. Lo que **no** se puede es
> `alter type ... add value` y usar ese valor en la misma transacción — si más adelante hace falta un cuarto
> estado, va en su propia migración. (Mismo motivo por el que el plan de Mercado Pago **no** agrega `'paid'` a
> `session_status`.)

**Helpers** (nueva migración, reemplazando las versiones de `20260917000700_fix_can_operate_null.sql`; mantener
el `coalesce(..., false)`, que es requisito de `CLAUDE.md` §5b):

```sql
create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select true from public.platform_admins where user_id = auth.uid()), false);
$$;
```

Y el orden de evaluación importa — el superadmin tiene que poder entrar **justamente** a un restaurante
suspendido para reactivarlo:

```
can_operate(rid) = coalesce(
     is_platform_admin()                                  -- pasa siempre, incluso suspendido
  or (rid in (select id from restaurants where is_demo))   -- demo, como hoy
  or (rid = current_restaurant_id()
      and (select status from restaurants where id = rid) <> 'suspended'),
  false)
```

`can_manage(rid)` igual, sumando `is_manager()`. En `read_only` el staff **sí** entra: necesita cerrar las mesas
que quedaron abiertas y es el período de gracia.

**Bloqueo en el servidor** (ocultar pantallas en React no alcanza: la anon key es pública). El bloqueo es distinto
por estado y por RPC, en una migración nueva:

| RPC | `read_only` | `suspended` |
|---|---|---|
| `get_table_by_token` | **pasa** (el comensal tiene que poder ver el menú), devolviendo el estado para que la UI deshabilite los botones | `RESTAURANT_SUSPENDED` |
| `place_order` | `ORDERS_DISABLED` | `RESTAURANT_SUSPENDED` |
| `create_alert` | `ORDERS_DISABLED` | `RESTAURANT_SUSPENDED` |

```sql
-- al inicio de place_order / create_alert
v_status := (select status from public.restaurants where id = v_rid);
if v_status = 'suspended' then raise exception 'RESTAURANT_SUSPENDED'; end if;
if v_status = 'read_only' then raise exception 'ORDERS_DISABLED'; end if;
```

Que `get_table_by_token` devuelva el estado es lo que permite que la UI **deshabilite** los botones en vez de
dejar que el comensal arme un carrito entero y recién ahí falle. Pero la validación del servidor es la que manda:
el frontend sólo evita la frustración.

`lib/errors.ts`:
- `RESTAURANT_SUSPENDED: () => 'Este menú no está disponible por el momento.'`
- `ORDERS_DISABLED: () => 'Los pedidos están momentáneamente deshabilitados. Avisale al personal.'`

**Qué ve cada uno:**
- Comensal `suspended`: `ClientLayout` ya tiene la rama de error; agregar el caso con mensaje propio (sin botón de
  reintentar, no es un problema de red).
- Comensal `read_only`: el menú completo, con el carrito y los botones de mozo/cuenta deshabilitados y una banda
  explicativa. `types/domain.ts` → `Restaurant.status`.
- Staff: `StaffLayout`, un estado más junto al de `staff.is_active = false` (sólo bloquea en `suspended`).
- Dueño en `read_only`: banner de aviso de pago en `AdminLayout`, con los días que faltan para el corte
  (`status_since + 7 días`, mostrado con `timeUntil`, **no** `timeAgo` — es fecha futura, ver `CLAUDE.md` §5d).

**Tests:** `assert` nuevos en `scripts/verify-staff-ops.mjs` (hoy 7 checks), con `bar-prueba` en cada estado:
`read_only` → `get_table_by_token` responde pero `place_order` y `create_alert` fallan con `ORDERS_DISABLED`;
`suspended` → las tres fallan con `RESTAURANT_SUSPENDED` y `can_operate` da falso; el demo sigue funcionando en
los dos casos. Volver a `active` al final del script. Sumar un test unitario de la función pura que calcula los
días restantes del período de gracia.

### 2.2 Panel superadmin (A5)

**Identidad separada.** Hoy `staff.id = auth.users.id` y un usuario pertenece a un solo restaurante, así que el
superadmin **no** puede ser un rol de `staff`:

```sql
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
-- sin políticas: nadie lee esta tabla con la anon key; sólo la usa is_platform_admin() (security definer)
```

La primera fila se inserta **a mano** desde el SQL Editor de prod, con una cuenta de email distinta de cualquier
cuenta de restaurante. Activar **MFA (TOTP)** en esa cuenta: es la que ve todos los clientes.

**Rutas** (`app/router.tsx`, chunk lazy propio, no enlazado desde ningún lado):

```
/superadmin                      SuperadminLayout → lista de restaurantes
/superadmin/r/:slug/admin/*      el scope de ese restaurante + las 4 páginas de admin ya existentes
```

`SuperadminLayout` valida sesión + fila en `platform_admins` (si no, 404 — no "no tenés permiso", para no
revelar que la ruta existe).

**Reuso clave:** `AdminLayout` y sus cuatro páginas sólo leen `useRestaurantScope()` y no saben si están en la
demo o en un restaurante real (así funciona `/demo/admin`). El layout de superadmin publica el scope de
cualquier restaurante y **las páginas se reusan sin tocarlas**. Hace falta una barra fija muy visible
("Estás editando **X** como superadmin") para no confundirse de restaurante.

**Dashboard** — una fila por restaurante (excluyendo el demo): nombre, slug, alta, estado, mesas, staff, pedidos
de los últimos 7 días, fecha del último pedido, y los datos de cobro manual (plan, próximo pago, notas).

Los contadores **no** se calculan en el cliente (sería traer todos los pedidos de todos los tenants): una RPC
`platform_restaurants_overview()` `security definer` que valide `is_platform_admin()` con
`if not public.is_platform_admin() then raise exception 'NOT_AUTHORIZED'; end if;` — con `coalesce` ya resuelto
dentro del helper, que es exactamente la trampa documentada en `CLAUDE.md` §5b.

Los datos de cobro manual van en una tabla aparte (`restaurant_billing`: plan, precio, `next_payment_on`, notas)
para no mezclar facturación con la configuración del restaurante, y porque `restaurants` es de lectura pública.

**Seguridad:** nunca la `service_role` key en el frontend; todo por RLS + `is_platform_admin()`. Opcional pero
recomendado: tabla de auditoría `platform_audit(user_id, restaurant_id, action, detail, created_at)` escrita por
las RPCs de suspensión/reactivación.

**Decisiones pendientes**
- ~~¿El menú sigue visible con el restaurante suspendido?~~ **Resuelto (2026-09-27):** dos etapas — `read_only`
  (menú visible, sin pedir) y, a los 7 días sin renovar, `suspended` (oculto). Ver 2.1.
- ¿El panel superadmin muestra métricas de negocio (ingresos estimados) o sólo estado operativo? Recomendación:
  sólo operativo en v1.1.
- ¿Quién marca un restaurante como `read_only`: vos a mano desde el superadmin, o se deriva de
  `restaurant_billing.next_payment_on` vencido? Recomendación: **a mano** al principio (un cliente puede avisar
  que paga mañana), y automatizarlo recién cuando haya suficientes clientes como para que revisar a mano moleste.

---

## Bloque 3 — Totales de la mesa: cargos fijos y ajustes (B6 + C1)

Este bloque **es el prerrequisito de Mercado Pago**: define cuál es el importe a cobrar y de dónde sale.

**Problema de fondo hoy:** el total de una mesa se calcula en **tres lugares distintos**:
`get_session_state` (`sum(orders.total) where status <> 'cancelled'`), `fetchTablesOverview` (la misma suma, en
TypeScript) y el carrito del comensal (sólo para mostrar). Agregar cargos y ajustes a los tres por separado es
garantía de que alguna vista muestre un número distinto — y si además se cobra con Mercado Pago, un número
distinto al que se cobró.

**Recomendación: una sola fuente de verdad en SQL.**

```sql
-- devuelve el desglose completo de una sesión
create function public.session_totals(p_session_id uuid) returns jsonb ...
-- { subtotal, charges: [{name, amount}], adjustments: [{amount, reason, by}],
--   total, paid, balance }
```

y que la usen `get_session_state`, la RPC nueva de Mesas (0.3) y, más adelante, el endpoint de pago de Mercado
Pago. `paid`/`balance` (suma de pagos aprobados y lo que falta) se agregan cuando llegue v2: dejar la función
preparada para que el cobro no tenga que recalcular nada por su cuenta.

**Migraciones:**

```sql
-- B6: catálogo por restaurante
create type public.charge_mode as enum ('per_person', 'per_table', 'percent');
create table public.service_charges (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null, mode public.charge_mode not null,
  amount integer not null check (amount >= 0),   -- centavos, o puntos porcentuales si mode='percent'
  is_active boolean not null default true, sort_order int not null default 0,
  unique (id, restaurant_id)
);

-- B6: el cubierto necesita saber cuántos son
alter table public.table_sessions add column guests integer check (guests between 1 and 99);

-- B6: qué cargos se aplican EN ESTA MESA (decisión del mozo, ver abajo) + snapshot del importe
create table public.session_charges (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  session_id uuid not null, charge_id uuid,        -- null si el cargo del catálogo se borró después
  name_snapshot text not null, amount integer not null,   -- congelado al aplicarlo
  applied_by uuid references auth.users(id) on delete set null,
  applied_at timestamptz not null default now(),
  unique (session_id, charge_id),
  foreign key (session_id, restaurant_id) references public.table_sessions(id, restaurant_id) on delete cascade
);

-- C1: ajustes del mozo al cerrar
create table public.session_adjustments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  session_id uuid not null, amount integer not null,          -- puede ser negativo (descuento)
  reason text not null check (char_length(trim(reason)) between 3 and 200),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (session_id, restaurant_id) references public.table_sessions(id, restaurant_id) on delete cascade
);
```

Las FK compuestas `(session_id, restaurant_id)` no son decorativas: es el patrón del esquema
(`20260917000100_schema.sql`) que garantiza que una fila no pueda apuntar a una sesión de otro tenant.

**Decidido (2026-09-27): los cargos no se aplican solos — los activa el mozo, mesa por mesa.** El catálogo
(`service_charges`) es lo que el restaurante *puede* cobrar; `session_charges` es lo que **efectivamente** se cobra
en esa mesa, porque el mozo lo activó. Motivos:

- El cubierto se perdona seguido (un cliente habitual, un reclamo, una mesa que sólo tomó un café).
- El importe queda **congelado** al aplicarlo (`name_snapshot`, `amount`), igual que `order_items` congela nombre y
  precio: cambiar el cubierto mañana no reescribe las cuentas de ayer.
- Es el dato que después necesita el cobro con Mercado Pago para saber **qué** cobró
  (`payments.charges_amount`, ver `docs/plan-mercadopago.md` §0 y §8.2).

Opcionalmente, un cargo del catálogo puede marcarse como "sugerido por defecto" para que el mozo no tenga que
activarlo en cada mesa — pero sigue pudiendo desactivarlo.

**Políticas:** `service_charges` → `can_manage`; `session_charges` y `session_adjustments` → select/insert/delete
`can_operate` (el mozo opera), con `applied_by`/`created_by` siempre registrado.

**Frontend:**
- `/admin/configuracion` (o pestaña nueva): CRUD del catálogo de cargos con vista previa de cómo queda la cuenta.
- Comensal, "La cuenta" (`MyOrders`): subtotal, cada cargo aplicado como línea aparte, ajustes, total.
- Mozo, Mesas (`TablesOverview`): cantidad de comensales, **switches para activar/desactivar cada cargo en esa
  mesa**, y botón "Agregar ajuste" con motivo obligatorio; mostrar quién aplicó qué.

**Decisiones pendientes**
- **¿Quién carga la cantidad de comensales?** (pregunta abierta del backlog). Recomendación: **el mozo desde
  Mesas**, con opción de preguntárselo al comensal en el primer pedido si el restaurante lo activa. El comensal
  tiene incentivo a declarar menos gente si el cubierto es por persona.
- **¿Descuentos (importe negativo)?** Recomendación: sí, misma tabla, pero permitir negativos sólo a
  owner/admin y registrar siempre `created_by`.
- **¿Quién puede cargar un ajuste?** Recomendación: cualquier mozo para importes positivos; negativos sólo
  owner/admin. Configurable después si molesta.
- ¿Los cargos se pueden modificar después de que el comensal ya pagó (modo cuenta de MP)? Recomendación: **no** —
  si ya hay un pago aprobado sobre esa sesión, los cargos quedan bloqueados y sólo se puede sumar un ajuste nuevo,
  que genera saldo. Si no, el importe cobrado y el total dejarían de coincidir.

---

## Bloque 4 — Admin: configuración y menú (B1, B2, B3, B5, B7)

### 4.1 `theme` sin pisar claves (prerrequisito de B1 y B7)

`updateRestaurantSettings` hace hoy `theme: input.brand ? { brand: input.brand } : {}` — **reemplaza todo el
objeto**. Antes de agregar cualquier clave nueva hay que pasar a mezclar (leer el `theme` actual y hacer
`{ ...actual, ...nuevo }`, o hacer el merge en SQL con `theme || jsonb_build_object(...)`). Si no, el primer
guardado de "color" borra la tipografía y viceversa. Es el mismo tipo de bug que ya está anotado en
`CLAUDE.md` §5d.

### 4.2 Personalización visual ampliada (B1)

Guardar en `theme`: `{ brand, accent, font, scale }`. Recomendaciones del backlog que conviene respetar:
paleta **acotada** (primario + acento), tipografía de una **lista curada** de 5–6 fuentes cargadas sólo cuando se
eligen (no `<link>` a todas), tamaño como **escala** (`sm` / `md` / `lg` → multiplicador de `--font-scale`), y
**validación de contraste** al elegir color (una función pura `contrastRatio(hex, hex)` en `lib/`, con tests, que
avise si baja de 4.5:1 sobre el fondo donde se usa).

`lib/brandStyle.ts` ya deriva los tonos con `color-mix` — se extiende igual para el acento. La escala y la
tipografía salen como variables CSS en el mismo `style` del layout.

**Decisión pendiente:** **¿la personalización aplica sólo a la vista del comensal o a las cuatro?** (pregunta
abierta del backlog). Recomendación: **color y logo en las cuatro** (ya es así desde el pulido del 2026-09-23) y
**tipografía + escala sólo en el comensal**; en cocina el tamaño de letra es una decisión operativa del KDS, no
de marca, y va en el plan de UI/UX como "densidad por dispositivo".

### 4.3 Compresión de imágenes al subir (B2)

En `services/media.ts` hoy el archivo va tal cual (con límite de 5 MB). Comprimir **en el navegador antes de
subir**: redimensionar con `canvas` (logo 512 px, platos 1200 px de ancho máximo), convertir a **WebP** con
calidad ~0.8, y recién entonces subir. Una foto de celular de 6 MB queda en 100–200 KB.

Sin librería nueva: `createImageBitmap` + `OffscreenCanvas`/`canvas` + `toBlob('image/webp', 0.8)` alcanza y
evita sumar una dependencia. Mantener el `MediaUploadError` con mensajes en español y un fallback: si el
navegador no soporta WebP, subir JPEG. La función de redimensionado (cálculo de ancho/alto) es pura y testeable
aparte del `canvas`.

### 4.4 Selector de emoji para categorías (B3)

Recomendación: **lista curada** de ~60 emojis de comida/bebida en un `Sheet`, sin dependencia nueva. Cubre el
99% de los casos de un restaurante, pesa nada y no choca con la regla "sin librerías de UI" de `CLAUDE.md` §6.
Dejar el input de texto disponible para quien quiera pegar otro.

### 4.5 Catálogo de etiquetas con color (B5)

Hoy `menu_items.tags` es `text[]` libre y los colores están fijos por nombre en español
(`MenuItemCard.tsx:6`, ya anotado en `docs/pulido-2026-09-23.md`). Pasar a catálogo por restaurante:

```sql
create table public.menu_tags (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null, color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order int not null default 0, unique (restaurant_id, name)
);
create table public.menu_item_tags (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  menu_item_id uuid not null, tag_id uuid not null,
  primary key (menu_item_id, tag_id)
  -- + FKs compuestas con restaurant_id, como el resto del esquema
);
```

**Migración de datos:** por cada restaurante, crear una fila en `menu_tags` por cada valor distinto que hoy
aparezca en `menu_items.tags`, con el color actual del mapa hardcodeado (o gris), y poblar la tabla puente. Dejar
la columna `tags` un tiempo (sin leerla) por si hay que volver atrás; borrarla en una migración posterior.

**Elegir el color de una paleta** con contraste ya validado, no un color picker libre.

### 4.6 Sonidos configurables (B7)

`lib/sound.ts` sintetiza el beep con Web Audio (sin archivos), así que 3–4 variantes son sólo distintas
secuencias de `beep(freq, startAt)`: p. ej. *dos notas* (el actual), *tres notas cortas*, *campana* (una nota
larga con decay), *doble bip grave*. Guardar en la base la elección por restaurante **y por rol**
(`theme.sounds = { waiter: 'chime', kitchen: 'triple', volume: 0.8 }` o columnas propias). El **mute sigue siendo
por dispositivo** (`localStorage: menu:sound-enabled`) — es preferencia del aparato, no del restaurante. Botón
"Probar" al lado de cada opción (aprovecha que el click ya es el gesto que desbloquea el audio).

---

## Bloque 5 — Formulario de plato (B4)

Rediseño de `ItemEditModal` + `OptionGroupEditor`. La fricción conocida: en un plato **nuevo** hay que "Guardar"
los datos base antes de poder agregar variantes, porque el editor de grupos necesita un `menu_item_id` real
(`CLAUDE.md` §5d) — y eso no es evidente para el dueño.

**Recomendación:** pasos explícitos en vez de un formulario largo — **Datos → Foto → Variantes → Vista previa** —
con el paso 1 guardando automáticamente al avanzar (crea la fila y devuelve el id), así la restricción técnica
desaparece de la vista del usuario en lugar de explicarse. La vista previa reusa `MenuItemCard` con los datos del
formulario: el dueño ve exactamente lo que va a ver el comensal.

**Campos nuevos a definir** (el backlog los deja abiertos): ingredientes, alérgenos/aptos (vegano, vegetariano,
sin TACC), destacado, precio promocional, tiempo estimado de preparación. Recomendación de alcance mínimo con más
valor: **aptos/alérgenos** (los pregunta el comensal y evita una interacción con el mozo) y **destacado** (ordena
el menú comercialmente). "Precio promocional" implica decidir si se muestra el precio tachado y si afecta
`place_order` — es un mini-proyecto propio, no un campo; dejarlo para después.

**Ojo:** `OptionGroupEditor` no recibe los grupos por props, los lee de `useAdminMenuItems` buscando el item por
id. Si el rediseño separa esa consulta, hay que replicar esa reactividad a mano (advertencia ya escrita en
`CLAUDE.md` §5d).

---

## Bloque 6 — Cocina propone "agotado", admin aprueba (D1)

**Recomendación (la del backlog, y coincido):** **bloqueo provisorio inmediato**. Cuando la cocina marca un
plato, se deja de poder pedir en el momento y queda una solicitud pendiente que el dueño/admin **confirma o
revierte**. Esperar la aprobación en pleno servicio genera pedidos de algo que no hay — el costo de un falso
positivo (un plato bloqueado 10 minutos de más) es mucho menor que el de un pedido imposible de cumplir.

```sql
create type public.soldout_request_status as enum ('pending', 'approved', 'reverted');
create table public.soldout_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  menu_item_id uuid not null, status public.soldout_request_status not null default 'pending',
  requested_by uuid references auth.users(id) on delete set null, requested_at timestamptz not null default now(),
  resolved_by uuid references auth.users(id) on delete set null, resolved_at timestamptz
  -- + FK compuesta (menu_item_id, restaurant_id)
);
```

El bloqueo efectivo lo sigue dando `sold_out_until` (ya corregido en el bloque 0.1): la RPC de cocina lo setea y
registra la solicitud; "revertir" lo limpia. Así `place_order` no necesita conocer esta tabla.

Aviso al admin con el mismo mecanismo que ya existe: `useRealtimeInvalidation` + `useNewItemsAlert` +
`lib/hasNewIds.ts` (comparan ids vistos vs. actuales para no sonar en el montaje inicial). La tabla nueva hay que
agregarla a la publicación de realtime.

---

## Ideas nuevas (no están en el backlog)

Salieron de leer el código y los docs de operación. Ordenadas por relación valor/esfuerzo.

| Idea | Por qué | Esfuerzo |
|---|---|---|
| **Horario de atención + interruptor "aceptar pedidos"** | El QR queda en la mesa para siempre: hoy alguien puede pedir a las 4 AM o un lunes cerrado, y le suena a nadie. Config de horarios por día + corte manual, validado en `place_order` (`RESTAURANT_CLOSED`) igual que la suspensión del bloque 2 | Bajo (reusa el patrón de A4) |
| **Carga masiva del menú (CSV o "pegar lista")** | El costo real de vender no es el software, es cargar 80 platos a mano. `docs/alta-restaurante.md` promete 30 minutos y eso sólo se cumple con un menú chico. Importar desde CSV/Excel del cliente baja el alta a minutos y es argumento de venta | Medio |
| **Duplicar plato / duplicar grupo de opciones** | Media docena de pizzas comparten los mismos 3 tamaños y 10 extras. Hoy se cargan una por una | Bajo |
| **Cierre del día (ventas del día, más vendidos, ticket promedio)** | Es lo primero que pide un dueño y hoy la app no le devuelve **ninguna** información de su negocio. `plan-producto.md` lo dejó fuera del MVP, pero el dashboard del superadmin (A5) ya calcula casi lo mismo. Necesita `restaurants.timezone` (bloque 0.1) para que "el día" signifique algo | Medio |
| **Mostrar quién hizo qué** | `orders.handled_by` y `table_sessions.closed_by` ya se guardan y no se muestran en ninguna parte. Con los ajustes del bloque 3 (plata) pasa a importar | Bajo |
| **Revocar / reenviar invitación** | `AdminStaffPage` lista invitaciones pero no permite revocar una que se filtró | Bajo |
| **Hoja de QR con marca e instrucciones** | La hoja imprimible existe; agregarle logo y un "Escaneá para ver el menú y pedir" mejora la adopción en la mesa, que es donde el producto se gana o se pierde | Bajo |
| **Reintento de mutaciones sin conexión** | `OfflineBanner` avisa, pero si al mozo se le corta el wifi la mutación falla con un toast y se pierde la acción. Una cola mínima de reintento evita "marqué entregado y no quedó" | Medio |
| **Menú en varios idiomas** | Zona turística. Grande; sólo si un cliente lo pide | Alto |

---

## Verificación (aplica a todos los bloques)

Lo que ya manda `CLAUDE.md`, sin excepciones: `lint`, `typecheck`, `test` y `build` en verde; si se tocó SQL,
además `db:push`, `db:types`, `db:verify` y `db:verify:staff` — **contra dev**, nunca contra prod
(`docs/deploy.md` §1 y §3).

Específico de este plan:

1. **Cada bloque que toque autorización suma checks a los scripts**, no sólo tests de React. La trampa de los
   tres valores en SQL (`CLAUDE.md` §5b) se detectó con `db:verify:staff` contra un tenant real, no leyendo el
   código: toda función booleana nueva usada en `if not fn(...) then raise` va con `coalesce(..., false)` y con su
   check.
2. **Aislamiento entre tenants** en cada tabla nueva (`service_charges`, `session_adjustments`, `menu_tags`,
   `soldout_requests`, `platform_admins`): un check que confirme que con la anon key, y como staff de otro
   restaurante, no se lee ni se escribe.
3. **Migraciones a prod, una por una y después de probarlas en dev**, con el ritual de `supabase link` de
   `docs/deploy.md` (y volver a dev enseguida).
4. **Recorrido manual en prod** después de cada bloque: las cuatro vistas del tenant demo + el flujo de
   `docs/alta-restaurante.md` §6 si el bloque tocó pedidos o totales.

## Decisiones pendientes (resumen)

| # | Decisión | Bloque | Recomendación |
|---|---|---|---|
| 1 | Zona horaria: `timestamptz` con corte a las 06:00 vs. fecha local | 0.1 | `timestamptz` |
| 2 | `locale`: usarlo o sacarlo | 0.2 | Usarlo si se piensa vender fuera de AR; si no, sacarlo del tipo |
| 3 | Dominio propio: apex o subdominio | 1.1 | Decidir **antes** de imprimir QR nuevos |
| 4 | ~~¿El menú sigue visible con el restaurante suspendido?~~ | 2.1 | **Resuelto:** `read_only` (visible, sin pedir) → a los 7 días `suspended` (oculto), con cron diario |
| 5 | ¿Quién carga la cantidad de comensales? | 3 | El mozo |
| 6 | ¿Descuentos negativos, y quién puede? | 3 | Sí, sólo owner/admin |
| 7 | ¿La tipografía/escala aplica a las 4 vistas o sólo al comensal? | 4.2 | Sólo comensal; cocina lo maneja como densidad |
| 8 | Campos nuevos del plato | 5 | Aptos/alérgenos + destacado; el precio promocional aparte |
