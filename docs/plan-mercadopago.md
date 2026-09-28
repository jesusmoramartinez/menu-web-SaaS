# Plan de implementación — Pago con Mercado Pago (v2)

Plan para la sección E de [`docs/nuevas-funcionalidades.md`](nuevas-funcionalidades.md): que el comensal pague
desde la web y que **el dinero vaya a la cuenta de Mercado Pago del restaurante**, no a la nuestra. El restaurante
elige si se cobra **al final (la cuenta)** o **al hacer cada pedido (prepago)** — ver §0.
Escrito el 2026-09-27 sobre datos verificados en la documentación oficial de Mercado Pago (links al final).

El doc tiene dos mitades, como se pidió:

- **§0** — la decisión de producto que ordena todo lo demás: los dos momentos de pago.
- **Parte 1 — Guía de configuración** (§1 a §6): todo lo que hay que hacer con el mouse, fuera del código, paso a
  paso y sin dar por sabido nada.
- **Parte 2 — Plan a nivel código** (§7 a §13): arquitectura, base de datos, endpoints, frontend, pruebas.
- **§14 — Qué explicarle al cliente**: lo que hay que contarle al dueño, al mozo y a la cocina, listo para copiar a
  los manuales cuando esto se implemente.

> **Prerrequisito técnico:** el **bloque 3 de [`docs/plan-v1.1-funcionalidades.md`](plan-v1.1-funcionalidades.md)**
> (cargos fijos + ajustes → `session_totals()`). Hoy el total de una mesa se calcula en tres lugares distintos; no
> se puede cobrar un importe que no tiene una única fuente de verdad en el servidor.
>
> **Prerrequisito de producto:** dominio propio funcionando (bloque 1 de ese mismo plan). Mercado Pago exige una
> URL de redirección **fija y exacta**, y las URLs de Preview de Vercel cambian en cada deploy (ver §2.4).

---

## Conceptos, en criollo, antes de empezar

| Término | Qué es |
|---|---|
| **Aplicación** (en MP) | La "ficha" que creás en el panel de desarrolladores de Mercado Pago. Tiene un `Client ID` y un `Client Secret` y representa a *tu plataforma* (el SaaS), no a un restaurante |
| **Checkout Pro** | La pantalla de pago que arma y muestra **Mercado Pago**. Vos lo mandás ahí y MP resuelve todo (cuenta de MP, tarjeta como invitado, cuotas). Es la opción con menos responsabilidad para nosotros: no tocamos datos de tarjetas |
| **Preferencia** (*preference*) | El "pedido de cobro" que creás en la API de MP antes de mandar al comensal. Contiene el importe y las URLs de retorno. MP te devuelve un `init_point`, que es el link al que redirigís |
| **OAuth / modelo marketplace** | El mecanismo por el que el dueño del restaurante **autoriza** a nuestra aplicación a cobrar en su nombre. Nos entrega un `access_token` suyo; con ese token creamos las preferencias y **la plata cae en su cuenta** |
| **`marketplace_fee`** | Comisión que *nuestra plataforma* podría quedarse de cada pago. **Decidido (2026-09-27): no se usa.** El ingreso del SaaS es la mensualidad más un pago único inicial; de los pagos de los comensales no se toma nada |
| **Webhook** | Un aviso automático que MP le manda a **nuestro servidor** cuando un pago cambia de estado. Es la única confirmación confiable: que el comensal vuelva a la app no prueba que pagó |
| **`access_token` / `refresh_token`** | Credenciales **secretas** del restaurante. El access token dura **180 días**; el refresh sirve para renovarlo. Nunca pueden llegar al navegador |

**Por qué hace falta un servidor por primera vez.** Hoy la app es 100% navegador + Supabase. Crear una
preferencia requiere el `access_token` secreto del restaurante, y recibir el webhook requiere una URL que MP pueda
llamar. Ninguna de las dos cosas se puede hacer desde el navegador sin filtrar el secreto.

---

## §0. Los dos momentos de pago (decidido el 2026-09-27)

Cada restaurante elige **cuándo** cobra por Mercado Pago. Los dos modos coexisten en el producto y comparten todo
el backend; lo que cambia es el disparador del pago.

| | **Modo cuenta** (`bill`) | **Modo prepago** (`prepaid`) |
|---|---|---|
| Cuándo paga | Al final, cuando quiere irse | Al confirmar **cada** pedido, antes de que salga a cocina |
| El pedido llega a cocina | Al confirmarlo, como hoy | **Sólo cuando MP confirma el pago** |
| ¿Puede seguir pidiendo? | Sí | Sí, y **paga de nuevo** cada ronda |
| Comisión de MP | Una por mesa (o por pago) | Una por ronda |
| Para quién | Servicio de mesa clásico | Locales que no quieren riesgo de impago, mostrador, takeaway |

**Reglas comunes a los dos modos, definidas por el usuario:**

1. **Pagar NO cierra la mesa.** La sesión queda abierta hasta que **el mozo** la cierra, en los dos modos, así el
   comensal puede seguir pidiendo. Esto ya está resuelto por el modelo de saldo de §8.2: si pide más, el saldo
   vuelve a ser positivo (modo cuenta) o simplemente paga la ronda nueva (modo prepago).
   El criterio real del salón, que es el que manda: **la mesa se cierra cuando los comensales se fueron y el mozo
   la levanta/limpia**, porque cerrarla es lo que la libera para los próximos. El pago es un evento
   independiente de eso.
2. **El cubierto y los gastos extra los decide el mozo, mesa por mesa.** Los cargos configurados por el
   restaurante (cubierto, servicio de mesa — B6 del plan v1.1) y los ajustes (C1) **no se aplican automáticamente
   al cobro**: el mozo elige si entran o no en cada mesa. Por eso `payments.charges_amount` guarda qué parte del
   importe cobrado eran cargos, y por eso los cargos de una sesión son *activables* y no fijos (ver el ajuste al
   bloque 3 en `docs/plan-v1.1-funcionalidades.md`).
3. **"Llamar al mozo" sigue existiendo siempre**, en los dos modos.

**Recomendación de implementación:** hacer **primero el modo cuenta** (es el que encaja con el resto del producto
ya construido: sesiones, cubierto por persona, cerrar mesa) y **después el prepago**, que necesita la maquinaria
extra de §8.4. Los dos entran en el mismo plan, pero no hace falta que salgan en el mismo deploy: la configuración
por restaurante (§8.3) permite habilitarlos por separado.

---

# Parte 1 — Guía de configuración

## §1. Cuenta de Mercado Pago (tuya, la de la plataforma)

1. Tener (o crear) una cuenta de Mercado Pago **de la plataforma**, distinta de cualquier cuenta de restaurante.
   Conviene que sea una cuenta a nombre del negocio, no personal.
2. Entrar a **[mercadopago.com.ar/developers](https://www.mercadopago.com.ar/developers)** → *Tus integraciones*.
3. Verificar que la cuenta tenga los datos completos (identidad, datos fiscales). Sin eso, MP limita las
   integraciones productivas.

## §2. Crear la aplicación

1. En *Tus integraciones* → **Crear aplicación**.
2. Nombre: algo reconocible (p. ej. "Menú Digital").
3. **Producto a integrar: Checkout Pro.**
4. **Modelo de integración: marketplace / plataforma de pagos** (la opción que indica que vas a cobrar **en nombre
   de otros vendedores**). Esto es lo que habilita OAuth y `marketplace_fee`. Si eligieras "cobros propios", el
   dinero caería en *tu* cuenta y habría que rendirlo a cada restaurante: **no es lo que queremos**.
5. Guardar. Al entrar a la aplicación vas a ver:
   - **Credenciales de producción**: `Client ID`, `Client Secret`, `Access Token`, `Public Key`.
   - **Credenciales de prueba**: las mismas, para sandbox.

   > Estas credenciales son de *la plataforma*. Las de cada restaurante se obtienen por OAuth (§4) y no se copian
   > a mano nunca.

### §2.1 Anotar las credenciales (sin ponerlas en el repo)

De la aplicación necesitás, para más adelante:

| Dato | Dónde se usa |
|---|---|
| `Client ID` | Variable de entorno `MP_CLIENT_ID` |
| `Client Secret` | Variable de entorno `MP_CLIENT_SECRET` |

**Nunca** van al repo ni a una variable `VITE_*`: todo lo que empieza con `VITE_` se **incrusta en el bundle que
descarga cualquier visitante** (ver `docs/deploy.md` §0). Van como variables de servidor en Vercel (§5).

### §2.2 Habilitar PKCE (recomendado)

En **Detalles de la aplicación**, activar *flujo de código de autorización con PKCE*. PKCE es opcional en MP pero
recomendado: agrega una prueba extra de que quien canjea el código es quien lo pidió. El plan de código lo
contempla (§8.1).

### §2.3 Configurar el webhook

1. En la aplicación → **Webhooks → Configurar notificaciones**.
2. Cargar **dos** URLs, una de prueba y una de producción:
   - producción: `https://<tu-dominio>/api/mp/webhook`
   - prueba: la URL del entorno de dev (ver §2.4)
3. **Eventos:** marcar **`payment`** (*Pagos*). Es el único que necesitamos con Checkout Pro. (Existen otros
   —`merchant_order`, chargebacks, reclamos— que se pueden sumar después.)
4. Guardar. MP genera una **clave secreta de webhook** y la muestra en el panel: copiala, va a la variable
   `MP_WEBHOOK_SECRET`. Sirve para verificar que la notificación la mandó MP y no un tercero. Se puede
   regenerar con *Restablecer* (y hay que actualizar la variable).

> La configuración del panel **tiene precedencia** sobre el `notification_url` que se mande en cada preferencia.
> Igual conviene mandarlo en la preferencia (§9.3): así el entorno queda explícito en cada pago.

### §2.4 El problema de las URLs de Preview (leer antes de seguir)

MP exige que la **URL de redirección de OAuth sea fija y coincida exactamente**. Las URLs de Preview de Vercel
cambian en cada deploy (`menu-web-abc123.vercel.app`), así que **no se pueden registrar**.

Opciones, de mejor a peor:

1. **Dos aplicaciones de MP** (recomendado): una "Producción" con `https://<tu-dominio>/api/mp/oauth/callback`, y
   otra "Desarrollo" apuntando a un **alias fijo** de Vercel (Settings → Domains → agregar
   `menu-web-dev.vercel.app` y asignarlo a la rama de desarrollo). Cada entorno usa su par de credenciales.
2. Una sola aplicación con la URL de producción, y probar OAuth únicamente en producción con un restaurante de
   prueba.
3. Túnel con dominio reservado (ngrok u similar) para desarrollo local.

## §3. Registrar las URLs de redirección

En la aplicación → **URLs de redireccionamiento** (*Redirect URLs*), agregar exactamente:

```
https://<tu-dominio>/api/mp/oauth/callback
```

Sin barra final de más, sin `www` si el dominio no lo usa: si no coincide carácter por carácter, el canje del
código falla.

## §4. Cómo conecta su cuenta cada restaurante (lo que va a ver el dueño)

Esto ya es la app funcionando; lo describo acá para que se entienda qué se está configurando:

1. El dueño entra a `/admin/configuracion` → pestaña **Pagos**.
2. Toca **"Conectar Mercado Pago"**.
3. La app lo lleva a Mercado Pago, donde inicia sesión **con la cuenta de MP de su restaurante** y ve una
   pantalla de autorización ("Menú Digital quiere operar en tu nombre").
4. Acepta y MP lo devuelve a la app. Desde ese momento figura **"Mercado Pago conectado"** con el nombre de su
   cuenta.
5. Elige el **modo de cobro**: *el mozo cobra en la mesa* (actual), *pago con Mercado Pago*, o *los dos*.

Requisitos del lado del restaurante: cuenta de Mercado Pago **del mismo país** que la moneda configurada (para
Argentina, cuenta argentina y `currency = 'ARS'`), con datos verificados.

## §5. Variables de entorno en Vercel

Vercel → el proyecto → **Settings → Environment Variables**. Ojo con el *scope* (Production vs. Preview), igual
que ya se hace con `VITE_SUPABASE_*` (`docs/deploy.md` §0).

| Variable | Scope | Qué es | ¿Va al navegador? |
|---|---|---|---|
| `MP_CLIENT_ID` | Production / Preview (distintos valores) | Client ID de la aplicación MP | **No** |
| `MP_CLIENT_SECRET` | Production / Preview | Client Secret | **No** |
| `MP_WEBHOOK_SECRET` | Production / Preview | Clave secreta del webhook (§2.3) | **No** |
| `MP_TOKEN_ENC_KEY` | Production / Preview | Clave propia (32 bytes aleatorios, base64) para cifrar los tokens de los restaurantes antes de guardarlos | **No** |
| `SUPABASE_URL` | Production / Preview | Misma URL que `VITE_SUPABASE_URL` del entorno | **No** |
| `SUPABASE_SERVICE_ROLE_KEY` | Production / Preview | Service role key del proyecto Supabase correspondiente | **No, jamás** |
| `APP_BASE_URL` | Production / Preview | `https://<dominio>` del entorno, para armar `back_urls` | **No** |
| `CRON_SECRET` | Production | Secreto para que sólo el cron pueda llamar al endpoint de renovación | **No** |

Reglas que no se pueden relajar:

- **Ninguna** de estas lleva prefijo `VITE_`. Si alguna lo lleva, termina publicada en el bundle.
- `SUPABASE_SERVICE_ROLE_KEY` saltea RLS por completo: es la llave maestra de la base. Sólo existe en variables de
  servidor y sólo la usan las funciones de `api/`.
- Los valores de *Preview* apuntan al Supabase **de desarrollo** y a la aplicación MP de prueba; los de
  *Production*, a prod. Mezclarlos significa cobrar de verdad en pruebas.
- Después de cambiar variables hay que **Redeploy**.

## §6. Cron para renovar tokens

El `access_token` de cada restaurante dura **180 días**. Si vence, los pagos de ese restaurante dejan de
funcionar sin que nadie se entere hasta que un comensal no pueda pagar.

En `vercel.json`, agregar un **Vercel Cron** diario que llame a `/api/mp/refresh-tokens` (el endpoint renueva los
que vencen en menos de 30 días). Además, mostrar la fecha de vencimiento en la pestaña Pagos del admin, y avisar
por email/panel superadmin si falta poco.

---

# Parte 2 — Plan a nivel código

## §7. Arquitectura: dónde vive el backend

Hacen falta cuatro cosas que el navegador no puede hacer: canjear el código de OAuth, guardar tokens cifrados,
crear preferencias y recibir el webhook.

**Recomendación: Vercel Functions, en una carpeta `api/` del mismo repo.**

El backlog propone Supabase Edge Functions y es una opción válida, pero para este proyecto Vercel gana por
razones concretas:

| Criterio | Vercel Functions (`api/`) | Supabase Edge Functions |
|---|---|---|
| Deploy | **Automático con `git push` a `main`**, que ya está andando | `supabase functions deploy` a mano, apuntando al proyecto correcto |
| Riesgo operativo | Ninguno nuevo | El mismo footgun ya documentado en `docs/deploy.md` §1: `supabase link` apuntando al proyecto equivocado. Desplegar una función a prod creyendo que es dev es la misma clase de error |
| Lenguaje y tooling | TypeScript + Node, igual que la app: mismo `tsc`, mismo `oxlint`, mismo `vitest` | Deno: imports distintos, config de lint aparte, CI no lo cubre |
| CI | `.github/workflows/ci.yml` ya typechequea el repo: cubre `api/` gratis | Queda fuera de CI |
| Entornos | Production y Preview ya separados con sus variables | Dev y prod son dos proyectos Supabase: hay que desplegar en los dos |
| Secretos | Variables de entorno de Vercel (donde ya viven las demás) | `supabase secrets set`, otro lugar más |

**El costo de elegir Vercel:** acopla el backend a Vercel. Si algún día se migra de hosting, estas funciones hay
que reescribirlas (son ~5 archivos chicos, no es un drama). Si esa portabilidad pesa más que lo de arriba, o si
más adelante hace falta lógica pesada pegada a la base, Edge Functions es la alternativa y el plan de datos de
§8 no cambia en nada.

### §7.1 Trampa a verificar el primer día

`vercel.json` hoy tiene un rewrite que manda **todo** a la SPA:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

Los rewrites de Vercel se evalúan *después* del filesystem, así que `/api/mp/webhook` debería resolver a la
función. **Confirmarlo apenas exista el primer endpoint** (`curl -i https://<dominio>/api/mp/webhook` tiene que
devolver la respuesta de la función, no HTML). Si devuelve HTML, excluir `/api` del rewrite. Síntoma típico
cuando está mal: MP reporta entregas "exitosas" (200) que nunca procesaron nada, porque recibió el `index.html`.

## §8. Modelo de datos

Tres piezas, en una migración nueva (`supabase/migrations/`, nunca editando una ya aplicada).

### §8.1 Credenciales del restaurante (secretas)

```sql
create table public.restaurant_payment_accounts (
  restaurant_id    uuid primary key references public.restaurants(id) on delete cascade,
  provider         text not null default 'mercadopago',
  mp_user_id       text not null,          -- id de la cuenta MP del restaurante
  mp_nickname      text,                   -- para mostrar "conectado como X"
  public_key       text,                   -- no es secreta
  access_token_enc bytea not null,         -- cifrado con MP_TOKEN_ENC_KEY
  refresh_token_enc bytea not null,
  expires_at       timestamptz not null,
  live_mode        boolean not null default true,
  connected_at     timestamptz not null default now(),
  connected_by     uuid references auth.users(id) on delete set null
);
alter table public.restaurant_payment_accounts enable row level security;
-- SIN POLÍTICAS: con RLS activo y cero políticas, nadie lee ni escribe con la anon key.
-- Sólo la service_role key (que saltea RLS) puede tocarla, es decir sólo las funciones de api/.
```

Ese "cero políticas" es la parte importante: no hay forma de que un bug de frontend filtre un token, porque el
frontend **no tiene permiso de leer la tabla**, ni siquiera siendo owner.

Para que el admin pueda ver el estado de conexión sin tocar los secretos, una RPC `security definer`:

```sql
create function public.get_payment_account_status(p_restaurant_id uuid) returns jsonb ...
-- valida can_manage(p_restaurant_id) con coalesce(..., false) y devuelve
-- { connected, mp_nickname, expires_at, live_mode } — nunca los tokens
```

Cifrado: AES-256-GCM con `MP_TOKEN_ENC_KEY` desde la función (el `crypto` de Node alcanza). Alternativa más
"nativa" si se prefiere no manejar la clave: Supabase Vault. El cifrado es defensa en profundidad: aunque alguien
consiga leer la tabla, sin la clave los tokens no sirven.

### §8.2 Pagos

Un solo modelo sirve para los dos momentos de pago (§0): el pago siempre cuelga de la **sesión** (la mesa), y
además apunta al **pedido** cuando es un prepago.

```sql
create type public.payment_status as enum ('pending','approved','rejected','refunded','cancelled');
create type public.payment_kind   as enum ('bill','prepaid');   -- la cuenta al final · una ronda prepagada

create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants(id) on delete cascade,
  session_id       uuid not null,
  kind             public.payment_kind not null,
  order_id         uuid,                                   -- sólo en 'prepaid', una vez creado el pedido
  pending_order_id uuid,                                   -- sólo en 'prepaid', el carrito en espera (§8.4)
  amount           integer not null check (amount > 0),    -- centavos, congelado al crear la preferencia
  charges_amount   integer not null default 0,             -- parte del importe que son cargos/ajustes de mesa
  tip              integer not null default 0 check (tip >= 0),
  status           public.payment_status not null default 'pending',
  provider         text not null default 'mercadopago',
  preference_id    text,
  mp_payment_id    text unique,              -- ← ancla de idempotencia
  mp_status        text, mp_status_detail text,
  live_mode        boolean not null default true,
  payer_email      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  approved_at      timestamptz,
  foreign key (session_id, restaurant_id) references public.table_sessions(id, restaurant_id) on delete cascade,
  foreign key (order_id, restaurant_id)   references public.orders(id, restaurant_id)         on delete set null,
  check (kind = 'prepaid' or (order_id is null and pending_order_id is null))
);
```

`charges_amount` existe porque el mozo decide caso por caso si el cubierto y los gastos extra entran en el cobro
(§0): hay que poder reconstruir después qué se cobró exactamente, no sólo el total.

**Decisión de diseño clave: no se agrega `'paid'` a `session_status`.** Dos motivos:

1. **Técnico:** `alter type ... add value` no se puede usar en la misma transacción en la que se agrega, así que
   obliga a partir la migración en dos. Evitable.
2. **De producto, y es el que manda:** el estado "pagado" no es binario. Si el comensal paga $10.000 y después
   pide un postre, la mesa vuelve a tener saldo. Modelándolo como **suma de pagos aprobados**, el saldo
   (`total − pagado`) responde solo tres preguntas abiertas del backlog:
   - *¿pagos parciales?* → sí, naturalmente;
   - *¿qué pasa si pide algo más después de pagar?* → el saldo vuelve a ser positivo y reaparece "Pagar";
   - *¿dividir la cuenta?* → varios pagos sobre la misma sesión ya funcionan (sin repartir ítem por ítem).

`session_totals()` (bloque 3 de v1.1) se extiende para devolver `paid` y `balance`, y `get_session_state` los
expone. Los pagos **no** llevan política para anon: el comensal los ve a través de `get_session_state`, que es
`security definer` y donde el uuid de sesión ya es la credencial (`CLAUDE.md` §5b). El staff sí:
`select using (can_operate(restaurant_id))`.

### §8.3 Configuración de cobro por restaurante y estados de OAuth

Con dos modos de Mercado Pago **más** el cobro por el mozo, un solo enum se vuelve combinatorio
(`waiter`, `mp_bill`, `mp_prepaid`, `waiter+bill`, `waiter+prepaid`…). Conviene separar las dos preguntas, que son
independientes:

```sql
create type public.payment_timing as enum ('bill','prepaid');   -- ver §0

alter table public.restaurants
  -- ¿se puede pagar con Mercado Pago, y en qué momento? null = MP deshabilitado
  add column mp_timing public.payment_timing,
  -- ¿además se puede pagar con el mozo en la mesa? (el comportamiento actual)
  add column waiter_payment_enabled boolean not null default true;

create table public.mp_oauth_states (      -- anti-CSRF del flujo OAuth, efímero
  state text primary key,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  code_verifier text not null,             -- PKCE
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '15 minutes'
);
alter table public.mp_oauth_states enable row level security;   -- sin políticas, igual que §8.1
```

Los defaults (`mp_timing = null`, `waiter_payment_enabled = true`) dejan a **todos los restaurantes existentes
exactamente como están hoy**: se puede desplegar todo esto sin que ningún cliente note un cambio. Un restaurante
puede tener los dos medios a la vez (MP + mozo), que es probablemente lo más común al principio.

Regla de integridad que conviene forzar: `mp_timing` no puede quedar seteado si no hay cuenta de MP conectada. Como
la conexión vive en otra tabla (§8.1, sin políticas), esto se valida en la RPC/endpoint que cambia la
configuración, no con un `check`.

### §8.4 Pedidos en espera de pago (sólo modo prepago)

El problema del prepago: **el pedido no puede llegar a la cocina hasta que MP confirme**, o el restaurante cocina
gratis. Dos formas de resolverlo:

| | Agregar `pending_payment` a `order_status` | **Guardar el carrito aparte y crear el pedido al confirmarse el pago** ✅ |
|---|---|---|
| Impacto | Toca `ACTIVE_STATUSES`, `fetchActiveOrders`, el KDS, las políticas RLS y todas las consultas que filtran por estado. Un olvido = pedido sin pagar visible en cocina | Cero impacto en el pipeline de pedidos existente |
| Migración | `alter type ... add value` → migración partida en dos | Tabla nueva, sin tocar el enum |
| Abandonos | Pedidos fantasma dentro de `orders` que hay que filtrar para siempre | Filas en una tabla lateral que expiran y se borran |

**Recomendación: la segunda.** El pedido se crea recién cuando el pago está aprobado, usando la lógica de
`place_order` que ya existe y ya valida todo.

```sql
create table public.pending_orders (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  session_id    uuid not null,
  table_token   text not null,
  items         jsonb not null,              -- mismo formato que p_items de place_order
  amount        integer not null check (amount > 0),   -- cotizado y congelado por el servidor
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '30 minutes',
  consumed_at   timestamptz,                 -- cuándo se convirtió en pedido real
  foreign key (session_id, restaurant_id) references public.table_sessions(id, restaurant_id) on delete cascade
);
alter table public.pending_orders enable row level security;   -- sin políticas: sólo el backend
```

**Detalle fino que hay que decidir de antemano** (si no, aparece en producción): entre que el comensal entra a
Mercado Pago y vuelve pasan minutos, y en el medio un plato puede quedar agotado o cambiar de precio.
Recomendación: **si el pago fue aprobado, el pedido se crea igual** —el precio es el congelado en
`pending_orders.amount`— y si algún ítem quedó sin stock se crea el pedido y se **avisa al mozo** con una marca
visible en la comanda. Rechazar un pedido ya pagado es mucho peor: hay que devolver plata y el comensal ya está
sentado esperando. Esto implica que `place_order` necesita una variante interna que **no** revalide
disponibilidad (pero sí todo lo demás), invocada sólo por el webhook.

Un job (el mismo cron diario, o `pg_cron`) borra las `pending_orders` vencidas sin consumir.

## §9. Endpoints (`api/`)

Cinco archivos. Todos en TypeScript, todos con la `service_role` key, ninguno devuelve un token.

### §9.1 `POST /api/mp/oauth/start` — autenticado (owner/admin)

1. Lee el JWT de Supabase del header `Authorization: Bearer <token>` (el frontend lo saca de la sesión) y lo
   valida contra Supabase; confirma que el usuario es owner/admin **de ese** restaurante.
2. Genera `state` aleatorio y `code_verifier` (43–128 caracteres) + `code_challenge` (SHA-256, base64url).
3. Guarda la fila en `mp_oauth_states`.
4. Devuelve la URL de autorización:

```
https://auth.mercadopago.com/authorization
  ?client_id=<MP_CLIENT_ID>
  &response_type=code
  &platform_id=mp
  &state=<state>
  &redirect_uri=<APP_BASE_URL>/api/mp/oauth/callback
  &code_challenge=<challenge>&code_challenge_method=S256
```

### §9.2 `GET /api/mp/oauth/callback` — público (lo llama el navegador del dueño)

1. Toma `code` y `state` del query.
2. Busca el `state` en `mp_oauth_states`; si no existe o venció → error y redirect a
   `/admin/configuracion?mp=error`. **Borra la fila** (un `state` se usa una sola vez).
3. Canjea el código —tiene **10 minutos** de validez—:

```
POST https://api.mercadopago.com/oauth/token
{ client_id, client_secret, code, grant_type: 'authorization_code',
  redirect_uri, code_verifier }     // + test_token: true en el entorno de prueba
```

4. Cifra `access_token` y `refresh_token`, hace `upsert` en `restaurant_payment_accounts` con
   `expires_at = now() + 180 días` y los datos de la cuenta.
5. Redirige a `/admin/configuracion?mp=ok`.

### §9.3 `POST /api/mp/checkout` — público (lo llama el comensal, sin login)

Es el endpoint más expuesto de todos: lo invoca un anónimo. Sirve a los dos modos de §0 y en ambos **el importe lo
calcula el servidor**; el navegador nunca manda plata.

1. Body: `{ tableToken, sessionId, kind, items?, tip? }` (`items` sólo en `prepaid`). Verifica que la sesión exista,
   esté abierta y pertenezca a la mesa de ese token (la misma comprobación que hacen las RPCs de hoy).
2. Verifica que `mp_timing` del restaurante coincida con el `kind` pedido y que el restaurante no esté suspendido
   ni en `read_only` (bloque 2 de v1.1).
3. **Calcula el importe**, según el modo:
   - **`bill`**: `session_totals(sessionId)` → `balance` (ya incluye los cargos que el mozo dejó activos y los
     ajustes). Si `balance <= 0`, error `NOTHING_TO_PAY`.
   - **`prepaid`**: cotiza los `items` con la misma lógica de precios de `place_order` (precios y opciones desde la
     base, nunca del cliente), les suma los cargos de mesa que el mozo haya dejado activos y **que todavía no se
     hayan cobrado en esta sesión** (el cubierto se cobra una vez, no en cada ronda), y guarda todo en
     `pending_orders`.
4. Crea la fila en `payments` (`status = 'pending'`, `kind`, `amount`, `charges_amount`, `tip`, y
   `pending_order_id` si es prepago).
5. Crea la preferencia con el **`access_token` del restaurante**:

```
POST https://api.mercadopago.com/checkout/preferences
{
  items: [{ id: <session>, title: "Mesa 7 — Consumo", quantity: 1,
            unit_price: <balance/100>, currency_id: "ARS" }],
  external_reference: "<payments.id>",
  notification_url: "<APP_BASE_URL>/api/mp/webhook",
  back_urls: { success: "<APP_BASE_URL>/r/<slug>/m/<token>?pago=ok",
               pending: "...?pago=pendiente", failure: "...?pago=error" },
  auto_return: "approved",
  binary_mode: true,
  expiration_date_to: <ahora + 30 min>
  // sin marketplace_fee: no cobramos comisión por pago (decidido 2026-09-27)
}
```

6. Guarda `preference_id` y devuelve **sólo** `{ init_point }`. El frontend redirige ahí.

Decisiones que conviene no discutir después:

- **Un solo ítem con el total**, no el detalle plato por plato. Los cargos porcentuales (cubierto %) y los ajustes
  negativos (descuentos) no se pueden representar como ítems de MP, y si el detalle no suma exactamente el total,
  MP rechaza la preferencia. El detalle ya lo ve el comensal en "La cuenta".
- **`binary_mode: true`**: el pago queda *aprobado* o *rechazado*, nunca "pendiente". En una mesa no se puede
  esperar: además descarta de movida los medios offline (cupón para pagar en un kiosco), que no tienen sentido
  acá.
- **`expiration_date_to` corto (30 min)**: evita que alguien pague mañana un link viejo de una mesa ya cerrada.
- **Centavos → decimal con cuidado:** la base guarda enteros (centavos) y MP espera decimales. Calcular el string
  con enteros (`Math.trunc(cents/100)` + `'.'` + resto en dos dígitos) en vez de `cents/100` a secas, para no
  arrastrar error de punto flotante en el importe que se cobra.
- **Límite de abuso:** el endpoint crea filas y llama a una API externa sin login. Rate limit por
  `sessionId` + IP, y reusar la preferencia vigente si ya existe una `pending` del mismo importe en los últimos
  minutos en lugar de crear otra.

### §9.4 `POST /api/mp/webhook` — público (lo llama Mercado Pago)

**Esta es la única confirmación válida de que se pagó.** Que el comensal vuelva con `?pago=ok` no prueba nada
(puede escribir esa URL a mano).

1. **Validar la firma.** MP manda `x-signature: ts=<epoch>,v1=<hmac>` y `x-request-id`. Se arma el manifest:

```
id:<data.id en minúsculas>;request-id:<x-request-id>;ts:<ts>;
```

   (si algún valor no vino, se omite esa parte), se calcula **HMAC-SHA256** con `MP_WEBHOOK_SECRET` y se compara
   con `v1` en **tiempo constante** (`crypto.timingSafeEqual`). Rechazar además si `ts` tiene más de ~5 minutos
   (anti-replay). Firma inválida → **401 y no se procesa nada**.
2. Tomar `data.id` (el id del pago en MP) y **consultar a la API de MP** el pago
   (`GET /v1/payments/<id>` con el token del restaurante). Nunca confiar en el cuerpo del webhook para el estado
   ni para el importe: el cuerpo sólo trae el id.
3. Ubicar nuestro pago por `external_reference` (= `payments.id`).
4. **Idempotencia:** MP puede avisar el mismo pago varias veces y reintenta cada 15 minutos si no respondés
   2xx. `mp_payment_id` es `unique`; la actualización se hace de una sola vez y volver a procesar el mismo aviso
   no cambia nada ni duplica.
5. Actualizar `status`, `mp_status`, `approved_at`, `payer_email`, `live_mode`.
6. **Si es un prepago aprobado (`kind = 'prepaid'`), recién ahí crear el pedido**: tomar `pending_orders`, invocar
   la variante interna de `place_order` (§8.4), guardar `payments.order_id` y marcar `consumed_at`. Todo en **una
   transacción**, y protegido por `consumed_at is null` para que dos webhooks simultáneos no creen dos pedidos.
   Si el pago quedó rechazado, no se crea nada y la fila vence sola.
7. Responder **200 en menos de 22 segundos** (el timeout de MP). Si algo falló de nuestro lado, responder 500 a
   propósito: MP reintenta.

> Para el modo cuenta no hace falta tocar nada más: el comensal ya consulta `get_session_state` cada 8 segundos y
> el staff tiene realtime + refetch de 15 s, así que el pago aparece solo. En modo prepago, el pedido nuevo también
> viaja por realtime al mozo y a la cocina como cualquier otro, porque **es** un pedido normal.

### §9.5 `GET /api/mp/refresh-tokens` — cron

Protegido con `CRON_SECRET`. Renueva los tokens con `expires_at` a menos de 30 días usando
`grant_type: 'refresh_token'`, y deja registro si alguno falla (un restaurante que revocó el acceso desde su
cuenta de MP: hay que avisarle, no reintentar para siempre).

## §10. Frontend

Cambios chicos, porque la infraestructura de datos ya existe.

| Dónde | Qué |
|---|---|
| `services/payments.ts` (nuevo) | `startMpOauth()`, `getPaymentAccountStatus()`, `disconnectMp()`, `createBillCheckout(sessionId, tip)`, `createPrepaidCheckout(sessionId, items)` → llaman a `api/` con `fetch`, no a supabase-js |
| `features/admin/AdminSettingsPage.tsx` o pestaña **Pagos** nueva | Estado de conexión, conectar/desconectar, **selector de momento de cobro** (`mp_timing`) y switch de "cobro por el mozo", vencimiento del token. Respetar `adminNav.ts` si se suma pestaña |
| `features/client/CartDrawer.tsx` | **Modo prepago:** el botón deja de ser "Confirmar pedido" y pasa a **"Pagar y pedir"**, con una línea que aclare que el pedido sale a cocina al confirmarse el pago. En modo cuenta, sin cambios |
| `features/client/MyOrders.tsx` ("La cuenta") | **Modo cuenta:** botón **"Pagar"** + desglose (subtotal, cargos activos, ajustes, pagado, saldo). **Modo prepago:** no hay saldo que pagar, muestra el historial de rondas pagadas. Si `waiter_payment_enabled`, además "Pedir la cuenta". "Llamar al mozo" siempre |
| `features/client/ClientView.tsx` | Leer `?pago=ok\|pendiente\|error` al volver de MP y mostrar un toast; **no** dar por pagado por el query param, esperar al estado de la sesión. En prepago, mostrar "esperando confirmación" hasta que aparezca el pedido |
| `features/waiter/TablesOverview.tsx` | Badge "Pagó" / "Saldo $X", y los **toggles de cargos** de la mesa (cubierto/servicio: entran o no, decisión del mozo — ver §0). Advertir al cerrar una mesa con saldo pendiente, sin bloquear: puede haber pagado en efectivo |
| `types/domain.ts` | `SessionState` con `paid`, `balance`, `charges`, `adjustments`, `payments`; `Restaurant` con `mpTiming` y `waiterPaymentEnabled` |
| `lib/errors.ts` | Códigos nuevos: `PAYMENTS_NOT_ENABLED`, `NOTHING_TO_PAY`, `PAYMENT_PROVIDER_ERROR`, `PREPAID_EXPIRED`, más `RESTAURANT_SUSPENDED`/`ORDERS_DISABLED` del bloque 2 de v1.1 |

## §11. Pruebas

1. **Usuarios de prueba de MP**: crear dos (un *vendedor* y un *comprador*) desde el panel. El vendedor hace de
   restaurante y conecta su cuenta por OAuth usando las **credenciales de prueba** (`test_token: true`).
2. **Tarjetas de prueba** de la documentación de MP, con los nombres de titular que fuerzan cada resultado
   (aprobado / rechazado por fondos / rechazado por código de seguridad).
3. **Simulador de webhooks** del panel de MP para probar la validación de firma sin pagar.
4. **Pruebas automatizadas** (vitest, sin red): la función pura de validación de firma (manifest + HMAC, casos
   válido/alterado/vencido), la conversión centavos→decimal, y el cálculo de saldo con pagos parciales. La lógica
   HTTP se prueba a mano.
5. **Checks de aislamiento** (`scripts/verify-rls.mjs`): con la anon key, `select` sobre
   `restaurant_payment_accounts` y `mp_oauth_states` devuelve **error o cero filas**, y un staff de otro
   restaurante no ve los `payments` ajenos. Esto es lo que impide que un token se filtre.
6. **Ensayo real de punta a punta** en producción con el restaurante propio o uno amigo, pagando un importe
   mínimo (p. ej. $100) con una tarjeta real, y verificando que la plata llegó a la cuenta del restaurante.

## §12. Puesta en marcha

1. Bloque 3 de v1.1 cerrado (`session_totals`, cargos activables por el mozo).
2. Migraciones a dev → `db:types` → `db:verify*`. Después a prod con el ritual de `docs/deploy.md` §1.
3. Endpoints y frontend detrás de `mp_timing = null` (default): se puede desplegar **todo** sin que ningún cliente
   note nada.
4. **Modo cuenta primero** (§0): activarlo en **un** restaurante piloto, con la aplicación de prueba y después con
   la de producción.
5. **Modo prepago después**, cuando el modo cuenta esté rodado: agrega `pending_orders` y el camino del webhook que
   crea pedidos, que es la parte con más aristas.
6. Recién entonces ofrecerlo como opción al resto.

**Plan de rollback:** `mp_timing = null` en el restaurante afectado y vuelve al flujo actual, sin deploy. Es la
razón por la que la configuración es un dato y no una variable de entorno.

## §13. Decisiones pendientes

| # | Decisión | Recomendación |
|---|---|---|
| 1 | ~~¿Cobramos `marketplace_fee` por pago?~~ | **Resuelto (2026-09-27): no.** El modelo de ingresos es mensualidad + pago único inicial; Mercado Pago sirve sólo para que el dueño vincule su cuenta y el comensal le pague directo a él. Ventaja lateral importante: **nunca pasa plata de terceros por nuestras manos**, así que no hay nada que rendir ni retener. El campo queda disponible por si algún día cambia el modelo |
| 2 | ¿Propina dentro del pago? | Dejar el campo `tip` en la base desde ahora, pero **no** mostrarlo en v2.0. Sumar propina obliga a decidir a quién le corresponde y eso es una conversación con el restaurante, no una feature |
| 3 | ¿Dividir la cuenta ítem por ítem? | No en v2.0. El modelo de saldo ya permite que dos personas paguen la mitad cada una; repartir por plato es otro proyecto |
| 4 | ~~¿La mesa se cierra sola al pagarse?~~ | **Resuelto (2026-09-27): no.** La sesión queda abierta hasta que **el mozo** la cierra, en los dos modos, para que el comensal pueda seguir pidiendo |
| 5 | ~~¿Los dos modos a la vez?~~ | **Resuelto (2026-09-27):** sí. MP y cobro por el mozo son independientes (`mp_timing` + `waiter_payment_enabled`, §8.3), y el momento del cobro por MP es configurable por restaurante (§0) |
| 6 | ¿Una o dos aplicaciones de MP (prod/dev)? | Dos (§2.4) |
| 7 | Cifrado de tokens: clave propia o Supabase Vault | Clave propia (`MP_TOKEN_ENC_KEY`) por simplicidad; Vault si se prefiere no custodiar la clave |
| 8 | **Prepago: ¿el cubierto se cobra en la primera ronda o al final?** | En la primera ronda, si el mozo lo dejó activo, y **una sola vez por sesión** (§9.3). Si se cobrara al final, el modo prepago necesitaría un cobro extra de cierre y deja de ser "prepago" |
| 9 | **Prepago: ¿qué pasa si el comensal paga y un plato quedó agotado en el medio?** | Crear el pedido igual y avisar al mozo en la comanda (§8.4). Devolver plata es peor que resolverlo en el salón |
| 10 | Prepago: ¿se permite propina por ronda? | No en v2.0, mismo criterio que la decisión 2 |

---

## §14. Qué hay que explicarle al cliente

Redactado en lenguaje de salón, listo para **copiar a `docs/manual-mozo-cocina.md` (mozo y cocina) y a
`docs/alta-restaurante.md` (dueño) el día que esto se implemente**. Todavía no lo metí en esos dos archivos a
propósito: son los que se le entregan a personal real y hoy describirían una función que no existe.

### Para el dueño

- **La plata es tuya y va directo a tu cuenta.** Vinculás tu cuenta de Mercado Pago una vez desde
  *Administración → Configuración → Pagos*. Nosotros no tocamos el dinero ni cobramos comisión por los pagos de tus
  clientes: sólo la mensualidad y el pago inicial del sistema.
- **Mercado Pago sí te cobra su comisión** por cada pago que recibís, como en cualquier cobro con MP. Eso es entre
  tu restaurante y Mercado Pago.
- **Elegís cuándo cobrar:**
  - *Al final (la cuenta):* el cliente pide todo y paga una vez cuando se va. Es lo habitual en servicio de mesa.
  - *Prepago (al pedir):* el cliente paga cada pedido antes de que salga a la cocina. Nadie se va sin pagar, pero
    **cada ronda es un pago distinto, así que Mercado Pago cobra comisión por cada una**.
- **Podés tener las dos formas de cobro a la vez:** Mercado Pago y que el mozo cobre en la mesa. Muchos clientes
  prefieren la segunda y conviene dejarla disponible.
- **El cubierto y los gastos extra los decide el mozo en cada mesa.** Vos configurás cuáles existen y cuánto valen;
  el mozo elige si se le cobran a esa mesa o no (para poder perdonarlos cuando corresponde).
- Necesitás una cuenta de Mercado Pago **del mismo país** que la moneda configurada y con los datos verificados.
- La vinculación se renueva sola. Si en algún momento revocás el acceso desde tu cuenta de Mercado Pago, los pagos
  dejan de funcionar hasta que la vuelvas a vincular.

### Para el mozo

- **El pago no libera la mesa: la liberás vos.** Cerrá la mesa cuando los comensales se fueron y levantás la mesa,
  como siempre. Si la cerrás antes, el cliente pierde la posibilidad de seguir pidiendo.
- En *Mesas* ves si la mesa **pagó** y si quedó **saldo**. Si pagaron en efectivo, cerrala igual: el aviso de saldo
  no te bloquea.
- **Los switches de cubierto y gastos extra** están en la mesa. Si a esa mesa no le vas a cobrar el cubierto,
  desactivalo **antes** de que pague.
- Si el cliente **ya pagó**, los cargos de esa mesa quedan bloqueados. Si hay que sumar algo (rompieron un vaso),
  se carga como *ajuste* y eso genera un saldo nuevo a pagar.
- **Sólo en modo prepago**, dos cosas para tener en la cabeza:
  - **El pedido aparece recién cuando Mercado Pago confirma el pago.** Si un cliente te dice "ya pedí" y no lo ves
    en tu pantalla, es que el pago no se completó (cerró la app de MP, se le rechazó la tarjeta, o está tardando
    unos segundos). Pedile que lo intente de nuevo.
  - **Si un plato se agotó justo mientras el cliente estaba pagando**, el pedido entra igual —porque ya pagó— y te
    llega **con un aviso**. Ahí hay que ir a la mesa, ofrecerle un cambio o avisarle que ese ítem se devuelve. Es el
    único caso del sistema que se resuelve hablando con el cliente.

### Para la cocina

- En modo *al final*, nada cambia respecto de hoy.
- En modo *prepago*, **todo lo que ves en la pantalla ya está pagado**: si la comanda llegó, el pago se confirmó. La
  pantalla funciona igual que siempre.
- Si una comanda viene con el aviso de "ítem agotado", el mozo ya está avisado: esperá su indicación antes de
  preparar ese ítem.

### Para explicarle al comensal (cartelería o el mozo)

- Podés seguir pidiendo después de pagar; la mesa sigue abierta hasta que te vas.
- Si cerrás la pantalla de Mercado Pago sin terminar el pago, **el pedido no se hizo**.

---

## Fuentes

Datos de la API verificados el 2026-09-27 contra la documentación oficial:

- [Integrar Checkout Pro en marketplace](https://www.mercadopago.com.br/developers/en/docs/checkout-pro/how-tos/integrate-marketplace) — uso del `access_token` del vendedor y `marketplace_fee`; el orden en que se descuentan las comisiones
- [OAuth — crear y refrescar token](https://www.mercadopago.com.ar/developers/es/docs/security/oauth/creation) — URL de autorización, parámetros, PKCE, `POST /oauth/token`, validez de 180 días y del código de 10 minutos
- [OAuth — referencia del endpoint](https://www.mercadopago.com.ar/developers/es/reference/oauth/_oauth_token/post)
- [Notificaciones webhooks](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/additional-content/notifications/webhooks) — configuración en el panel, evento `payment`, cuerpo de la notificación, `x-signature`/`x-request-id`, clave secreta, respuesta 200/201, timeout de 22 s y reintentos cada 15 min
- [Preferencias de Checkout Pro](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/integrate-preferences) — campos de la preferencia y `init_point` / `sandbox_init_point`
- [Credenciales](https://www.mercadopago.com.ar/developers/es/docs/your-integrations/credentials) — diferencia entre credenciales de prueba y producción
- [Supabase — configuración de funciones](https://supabase.com/docs/guides/functions/function-configuration) y [securing Edge Functions](https://supabase.com/docs/guides/functions/auth) — `verify_jwt = false` para webhooks públicos, por si se elige esa alternativa a Vercel

> Mercado Pago cambia su documentación seguido. Antes de implementar, revalidar los nombres de campos de §9.3 y
> el formato del manifest de §9.4 contra los links de arriba.
