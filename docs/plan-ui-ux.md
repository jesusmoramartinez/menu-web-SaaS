# Plan de implementación — UI y UX en celular, tablet y computadora

Plan para que la app se vea y se use bien en los tres tamaños de pantalla donde realmente corre. Escrito el
2026-09-27 a partir de una revisión del código actual (los números de abajo están medidos, no estimados).

Se cruza con dos planes: las mejoras de admin que pide el backlog (B1 tema ampliado, B3 emoji, B4 formulario de
plato) están en [`docs/plan-v1.1-funcionalidades.md`](plan-v1.1-funcionalidades.md) — **este plan define los
cimientos visuales sobre los que esas pantallas se rediseñan**, así que la Fase 1 de acá va antes que el bloque 4
de allá. Lo de Mercado Pago no toca nada de esto.

---

## 1. Diagnóstico: qué encontré

### 1.1 La app es mobile-only, no responsive

`CLAUDE.md` §6 manda "mobile-first: todo debe funcionar a 360px", y eso se cumple. Pero *mobile-first* quedó en
*mobile-only*: casi ningún componente tiene reglas para pantallas grandes. Cantidad de clases responsivas
(`sm:`/`md:`/`lg:`/`xl:`/`2xl:`) por archivo:

| Archivo | Reglas responsivas |
|---|---|
| `features/landing/LandingPage.tsx` | 4 |
| `features/waiter/TablesOverview.tsx` · `features/kitchen/KitchenView.tsx` | 3 cada uno |
| `components/ui/Modal.tsx` · `Button.tsx` · `Skeleton.tsx` | 3 cada uno |
| `features/waiter/WaiterView.tsx` · `AlertsPanel.tsx` · `staff/StaffTopBar.tsx` · `client/MenuItemCard.tsx` · `admin/AdminTablesPage.tsx` | 2 cada uno |
| `features/client/ClientView.tsx` · `demo/DemoBar.tsx` | 1 cada uno |
| **`admin/AdminLayout.tsx` · `AdminMenuPage.tsx` · `AdminStaffPage.tsx` · `AdminSettingsPage.tsx` · `ItemEditModal.tsx` · `OptionGroupEditor.tsx`** | **0** |
| `waiter/OrderCard.tsx` · `OrderEditModal.tsx` · `kitchen/KitchenTicket.tsx` | **0** |
| `client/CartDrawer.tsx` · `MyOrders.tsx` · `MenuFilters.tsx` · `ItemOptionsSheet.tsx` · `ClientHeader.tsx` · `OrderStatusSteps.tsx` · `ThanksScreen.tsx` | **0** |

El caso más caro es el **panel de administración: cero reglas responsivas en todas sus páginas**. Es justo la
pantalla que el dueño usa sentado en una notebook para cargar 80 platos, y hoy la ve como una columna angosta
(`max-w-5xl`) con el resto del monitor vacío. Cargar un menú así es lento y la lentitud del alta es el costo real
de vender (`docs/alta-restaurante.md` promete 30 minutos).

El segundo es la **cocina**: `KitchenView` escala hasta `xl:grid-cols-4` pero dentro de `max-w-7xl` (1280 px), y
`KitchenTicket` no tiene ninguna regla propia. En un monitor de 1920 px colgado en la cocina se desperdicia un
tercio de la pantalla y la letra queda del mismo tamaño que en un celular, para leerse a un metro y medio de
distancia.

### 1.2 Objetivos de toque por debajo del mínimo recomendado

| Control | Tamaño real | Referencia |
|---|---|---|
| `Button` size `sm` (`px-3 py-1.5 text-sm`) | ~30 px de alto | WCAG 2.5.5 (AAA) pide 44×44; WCAG 2.2 2.5.8 (AA) pide 24×24 mínimo |
| `QtyControl` | 28 px (`sm`) / 36 px (`md`) | ídem |
| Botones de ícono con `p-2` (5: cerrar modal, cerrar sesión, silenciar, pantalla completa, reiniciar demo) | ~32–34 px | ídem |

Ninguno está por debajo del mínimo absoluto de 24 px, así que no es una falla de accesibilidad grave — pero sí es
la causa de los "toqué y no pasó nada" en un celular, y el `QtyControl` es de los controles que más se usan
(cambiar cantidades en el carrito, y el mozo editando comandas con el dedo, apurado, parado).

### 1.3 Contraste insuficiente en texto secundario

`text-stone-400` (#a8a29e) sobre blanco da ≈2.8:1, por debajo del 4.5:1 que pide WCAG AA para texto normal. Está
usado **33 veces**, entre otros en `KitchenView` (las etiquetas de los contadores del KDS), `MyOrders`,
`AdminMenuPage`, `AdminStaffPage`, `LoginPage` y `OrderStatusSteps`. `text-stone-500` (#78716c) sí pasa (≈4.6:1).

Es el tipo de detalle que no se nota en un monitor bueno a oscuras y sí en una tablet con reflejo en una cocina, o
para alguien de más de 45 años — es decir, exactamente el público del mozo y del dueño.

### 1.4 Detalles que faltan y ya deberían estar

- **`env(safe-area-inset-*)` se usa una sola vez** (la barra flotante del carrito en `ClientView.tsx:196`). Las
  hojas inferiores (`CartDrawer`, `ItemOptionsSheet`) no lo usan: en un iPhone con barra de gestos, el botón
  principal ("Confirmar pedido", "Agregar") queda pegado o debajo del indicador de inicio.
- **No hay `prefers-reduced-motion`** en ningún lado: `animate-slide-up` y `animate-fade-in` (`index.css`) se
  ejecutan siempre, ignorando la preferencia del sistema.
- **No hay `prefers-color-scheme`**: la app es sólo clara. En una cocina de noche, una pantalla blanca a pleno
  brillo es la queja número uno de cualquier KDS.
- **Anchos de contenedor inconsistentes** entre roles: comensal `max-w-3xl`, admin `max-w-5xl` con una barra
  superior `max-w-6xl` (la barra es más ancha que el contenido que encabeza), cocina `max-w-7xl`. No hay un token
  común.
- **Tamaños de letra sueltos** tipo `text-[10px]` / `text-[11px]` en badges y etiquetas, por fuera de cualquier
  escala.

### 1.5 Lo que ya está bien y no hay que tocar

Para que el plan no rompa lo que funciona: `EmptyState`, `Skeleton` (`MenuSkeleton`/`CardsSkeleton`),
`ErrorState`, `OfflineBanner`, `ToastProvider` y `Modal`/`Sheet` con `useFocusTrap` ya cubren estados vacíos, de
carga, de error y de diálogo con accesibilidad resuelta. **Se reusan, no se reinventan.** Lo mismo con el patrón
de tabs horizontales en vez de sidebar (decisión deliberada de `CLAUDE.md` §3/§6) y con `focus-visible` en
`Button`.

---

## 2. Los cuatro contextos de uso reales

Todo el plan se ordena alrededor de esto, porque "hacerlo responsive" sin decidir para qué pantalla es cada cosa
lleva a rediseñar de más:

| Vista | Dispositivo real | Condiciones | Qué tiene que priorizar |
|---|---|---|---|
| **Comensal** | Celular propio, siempre. 360–430 px | Con una mano, luz variable, datos móviles, apurado | Velocidad de carga, fotos que den hambre, toques grandes, cero aprendizaje |
| **Mozo** | Celular en la mano; a veces tablet en una barra | Parado, moviéndose, con una mano, ruido | Toques grandes, información de un vistazo, acciones sin confirmaciones largas |
| **Cocina (KDS)** | Tablet 10" fija, o monitor de 21–27" | Se mira **a 1–2 metros**, manos ocupadas/sucias, a veces poca luz | Letra grande, contraste alto, densidad configurable, modo oscuro, nada de scroll fino |
| **Admin** | Notebook o desktop para cargar el menú; celular para ajustes rápidos | Sentado, con tiempo, tareas repetitivas largas | Aprovechar el ancho, menos clics por plato, ver muchas filas juntas |

La conclusión incómoda: hoy **las cuatro vistas están diseñadas para el primer caso**.

---

## 3. Fase 1 — Cimientos (sin cambio visual aparente)

Nada de esto se "ve" en una captura, pero todas las fases siguientes dependen de que exista. Es una tanda corta.

### 3.1 Tokens en `src/index.css`

Ampliar el `@theme` (hoy sólo tiene la fuente y los `brand-*`) con:

- **Escala tipográfica** con variable de multiplicador: `--font-scale` (default 1), aplicada a los tamaños de
  texto. Es lo que después permite el "tamaño de letra" por restaurante (B1 en v1.1) y la densidad del KDS
  (Fase 3) **sin tocar cada componente**.
- **Anchos de contenedor** como tokens (`--w-content-client`, `--w-content-admin`, `--w-content-kds`) para
  terminar con los `max-w-*` sueltos y desalineados.
- **Alturas mínimas de control**: `--tap-min: 44px`.

### 3.2 Objetivos de toque

- `Button`: agregar `min-h` por tamaño (`sm` → 36 px, `md` → 44 px, `lg` → 48 px) y revisar los pocos lugares
  donde `sm` se usa para acciones principales (ahí va `md`).
- `QtyControl`: 44×44 en `md` y 36×36 en `sm`, con el ícono más grande (14 → 18 px).
- Los 5 botones de ícono con `p-2` (`Modal`, `StaffTopBar`, `SoundToggle`, `KitchenView`, `DemoBar`): pasar a
  `min-h-11 min-w-11` (44 px) manteniendo el ícono chico — el área clickeable crece, el dibujo no.

Es cambio de clases, sin reescribir componentes. El riesgo es que crezcan barras que hoy están justas
(`StaffTopBar` a 360 px, `DemoBar`): verificar esos dos casos explícitamente.

### 3.3 Contraste

Regla: **`text-stone-400` nunca para texto**; sólo para íconos decorativos o bordes. Reemplazar las 33
ocurrencias por `text-stone-500` (o `stone-600` cuando es sobre fondo `stone-50`/`stone-100`, que baja el
contraste). En `KitchenView`, que se mira de lejos, ir directo a `stone-300` sobre el header oscuro y `stone-600`
sobre claro.

### 3.4 Áreas seguras y movimiento

- `Modal`/`Sheet`: `padding-bottom: max(1rem, env(safe-area-inset-bottom))` en el pie de las hojas inferiores, y
  `env(safe-area-inset-top)` donde haya contenido pegado arriba. Se arregla **una vez en el primitivo** y lo
  heredan `CartDrawer`, `ItemOptionsSheet`, `OrderEditModal` y `ItemEditModal`.
- `index.css`: envolver las animaciones en `@media (prefers-reduced-motion: reduce)` → duración 0 / sin
  transform. Incluye el `active:scale-95` de `Button` y el `animate-spin` del reset de la demo.

### 3.5 Formato de moneda por contexto

Aprovechar esta fase para el helper `useMoney()` que propone el bloque 0.2 de v1.1 (hoy `restaurant.locale`
existe y nadie lo usa, y `formatPrice(x, currency)` se repite en ~17 lugares). Simplifica todos los componentes
que las fases siguientes van a tocar.

**Verificación de la fase:** `lint`/`typecheck`/`test`/`build` en verde y un recorrido a 360 px de las cuatro
vistas confirmando que **nada se movió de lugar** salvo los controles que crecieron.

---

## 4. Fase 2 — Admin en pantalla grande (la de mayor impacto)

Objetivo concreto y medible: **bajar la cantidad de clics y de scroll para cargar un menú de 40 platos**.

### 4.1 Layout de dos columnas desde `lg`

Hoy: una columna de `max-w-5xl`, todo apilado, y editar un plato abre un modal que tapa la lista.

Propuesta: en `lg` (≥1024 px), **lista a la izquierda + panel de detalle a la derecha**, sin modal. El dueño ve el
menú completo mientras edita un plato, y pasar al siguiente es un clic. En `< lg` se mantiene exactamente el
comportamiento actual (lista + modal), así el celular no cambia.

Esto se implementa **una vez en `AdminLayout`** como slot opcional de detalle, y lo usan `AdminMenuPage`
(categorías/platos) y `AdminStaffPage` (equipo/asignaciones). `ItemEditModal` se convierte en un componente de
contenido reutilizable que se monta dentro del `Modal` en celular y dentro del panel en desktop — un solo
formulario, dos contenedores.

> Coordinar con el bloque 5 de v1.1 (rediseño del formulario de plato por pasos): conviene hacer **primero** este
> contenedor y después el formulario, no al revés.

### 4.2 Listas como tablas reales desde `md`

`AdminMenuPage`, `AdminStaffPage` y `AdminTablesPage` usan tarjetas apiladas. Desde `md` (≥768 px, tablet
horizontal y notebook) conviene una tabla de verdad: columnas alineadas (nombre, precio, visible, agotado,
acciones), encabezado fijo al hacer scroll y campos editables en línea. Comparar 20 precios en tarjetas apiladas
es imposible; en una tabla es un vistazo.

Mantener las tarjetas en `< md`. El mismo dato, dos presentaciones: separar la fila en un componente que decide
su forma por breakpoint, sin duplicar la lógica de mutación (`useAdminMutations`).

### 4.3 Menos fricción en tareas repetitivas

Aprovechando que hay ancho: acciones por fila siempre visibles (no detrás de un menú), **duplicar plato** (idea
del plan v1.1), arrastrar para ordenar en `md+` conservando las flechas ▲▼ en celular, y atajos de teclado
básicos (Enter para guardar, Esc para cerrar) que en desktop se dan por sentados.

### 4.4 Alinear contenedores

Unificar `AdminLayout` (`max-w-5xl`) con `StaffTopBar` (`max-w-6xl`) usando los tokens de 3.1, para que la barra
y el contenido compartan el borde izquierdo.

---

## 5. Fase 3 — Cocina: densidad, distancia y modo oscuro

### 5.1 Densidad configurable, por dispositivo

Tres modos —**Compacta / Normal / Grande**— que cambian `--font-scale` y el padding de `KitchenTicket`. Se guardan
**por dispositivo** en `localStorage`, con el mismo patrón que el mute del sonido
(`useSoundPreference`, clave `menu:sound-enabled` → agregar `menu:kds-density`), porque es una propiedad de la
pantalla y no del restaurante: la tablet de 10" y el monitor de 27" del mismo local necesitan valores distintos.

Esto resuelve, sin discusión de marca, la pregunta abierta de B1 en v1.1 sobre si el tamaño de letra aplica a
todas las vistas: **en cocina el tamaño es una decisión del dispositivo, no del dueño.**

### 5.2 Escalar con el ancho real

`KitchenView` hoy corta en `xl:grid-cols-4` dentro de `max-w-7xl`. Para un monitor grande: permitir `2xl` y más
columnas, y que el contenedor use el ancho completo en modo pantalla completa (ya existe `useFullscreen`). El
objetivo es que **entren más comandas sin scroll**: en cocina, scrollear es perder una comanda.

### 5.3 Modo oscuro (empezando por cocina)

Implementar con `prefers-color-scheme` **más** un interruptor manual (una cocina puede querer oscuro a mediodía),
persistido por dispositivo. Definir los colores como tokens en `index.css` y derivar: el color de marca del
restaurante ya entra por variables CSS (`lib/brandStyle.ts`), así que el tema oscuro tiene que **derivar** tonos
en lugar de tener una paleta fija, o el naranja de un cliente sobre fondo oscuro puede quedar ilegible. Reusar la
función de contraste que propone B1 en v1.1 para validarlo.

Orden sugerido: cocina primero (es donde se pide), después mozo, y el comensal **al final o nunca** — el menú es
la carta del restaurante y su identidad visual es del dueño, no del sistema operativo del comensal.

### 5.4 Legibilidad del ticket

`KitchenTicket` no tiene ninguna regla responsiva: revisar jerarquía pensando en 1,5 m de distancia (mesa y
cantidades grandes, notas del cliente destacadas como ya lo están, tiempos con `tabular-nums`), y elevar los
`text-[10px]`/`text-[11px]` que sobrevivan en esta vista.

---

## 6. Fase 4 — Mozo

- **Dos columnas desde `md`** (tablet o celular horizontal): alertas + entrantes a un lado, en cocina + listos al
  otro. Hoy todo va en una columna y el mozo scrollea mientras camina.
- **Zona de pulgar:** las acciones primarias de `OrderCard` ("A cocina", "Entregado") en la mitad inferior de la
  tarjeta y con altura de 44 px, que es donde llega el pulgar sosteniendo el teléfono con una mano.
- `OrderEditModal` (0 reglas responsivas): en tablet aprovechar el ancho para ver todos los ítems sin scroll
  interno.
- **Confirmaciones:** revisar que las acciones frecuentes no pidan confirmación y las destructivas (cancelar
  pedido) sí, con `ConfirmDialog` (nunca `window.confirm`, `CLAUDE.md` §6).

---

## 7. Fase 5 — Comensal

Es la vista que más se ve y la que ya está mejor. Ajustes puntuales, no rediseño:

- **Fotos más grandes.** Hoy la imagen es de 96 px (`h-24 w-24`) al costado. Un menú vende con fotos: ofrecer
  al dueño elegir entre **lista compacta** (la actual, buena para cartas largas de bebidas) y **tarjetas con foto
  ancha** (mejor para platos), como preferencia del restaurante.
- **Placeholder decente** cuando no hay foto: hoy es un cuadrado gris vacío (anotado en
  `docs/pulido-2026-09-23.md`); un ícono o la inicial de la categoría se ve intencional en vez de roto.
- **Volver arriba** al cambiar de categoría, y un botón flotante de "subir" en cartas largas.
- **Peso de la página:** con las imágenes comprimidas a WebP (B2 en v1.1) el menú carga rápido con datos móviles;
  medirlo con Lighthouse en 3G simulada antes y después.
- A partir de `sm` ya hay dos columnas de platos (`MenuItemCard`): mantener `max-w-3xl` — un menú a 1400 px de
  ancho se lee peor, no mejor.

---

## 8. Fase 6 — Landing

Es la única pantalla que un prospecto ve en una computadora, y hoy tiene 4 reglas responsivas y ninguna imagen del
producto. Agregar: capturas reales de las cuatro vistas (o un mockup de celular sobre la mesa con el QR), una
sección de precios aunque el cobro sea manual, y las preguntas frecuentes que ya salieron al vender. Es trabajo de
contenido más que de código.

---

## 9. Cómo se verifica (esto es lo que hace el plan revisable y no una opinión)

**Antes de empezar, tomar la medición base; al cerrar cada fase, repetirla.**

1. **Matriz de viewports** en las DevTools (device toolbar), recorriendo las cuatro vistas en cada uno:

| Ancho | Representa | Qué se mira |
|---|---|---|
| 360 px | Android chico (el mínimo que exige `CLAUDE.md`) | Nada se desborda, nada se corta |
| 390 px | iPhone moderno | Áreas seguras arriba y abajo |
| 768 px | Tablet vertical | Admin: ¿ya son tablas? |
| 1024 px | Tablet horizontal / KDS 10" | Cocina: columnas y tamaño de letra |
| 1280 px | Notebook | Admin: dos columnas |
| 1920 px | Monitor de cocina o desktop | Cocina: ¿se aprovecha el ancho? |

2. **Dispositivo real** para lo que el emulador no muestra: un iPhone (áreas seguras, rebote del scroll, teclado
   tapando inputs) y la tablet que vaya a la cocina. El emulador no reproduce el indicador de inicio ni el
   comportamiento del teclado.
3. **Contraste automático:** extensión axe DevTools o Lighthouse → sección Accessibility, con el objetivo de
   cero errores de contraste. Es el chequeo que hoy fallaría por lo de §1.3.
4. **Lighthouse en móvil con red 3G simulada** sobre el menú de un restaurante real: anotar el LCP antes y
   después de las fases 1 y 5.
5. **Toques:** verificar 44 px con el inspector en los controles de la Fase 1.
6. **`prefers-reduced-motion`** y **modo oscuro** forzados desde DevTools (Rendering → Emulate CSS media
   features).
7. **Impresión:** la hoja de QR (`AdminTablesPage`, `hidden print:block`) tiene que seguir saliendo bien —
   recordar que en jsdom el texto de cada mesa aparece dos veces a propósito (`admin.test.tsx`).
8. **Tests:** los smoke con `createMemoryRouter` no detectan problemas visuales. No inventar tests de layout;
   lo que sí conviene es un test unitario de las funciones puras nuevas (contraste, escala de densidad).

---

## 10. Reglas nuevas para `CLAUDE.md` §6

Si el plan se aprueba, estas reglas van al archivo cuando se implemente cada fase (la regla de mantener
`CLAUDE.md` actualizado está en su encabezado):

- **Mobile-first no es mobile-only:** todo componente nuevo declara qué hace de `md` en adelante. Si la respuesta
  es "nada", que sea una decisión escrita, no un olvido.
- **Objetivos de toque:** mínimo 44×44 px en controles primarios; 36 px en secundarios densos. Nunca menos de 24.
- **`text-stone-400` no se usa para texto**, sólo decorativo. Texto secundario: `stone-500` sobre blanco,
  `stone-600` sobre fondos `stone-50/100`.
- **Áreas seguras:** cualquier cosa fija abajo usa `env(safe-area-inset-bottom)`.
- **Animaciones:** toda animación nueva se neutraliza bajo `prefers-reduced-motion`.
- **Tamaños de letra:** de la escala; nada de `text-[Npx]` salvo caso justificado por escrito.
- **Densidad de cocina:** preferencia por dispositivo (`localStorage`), nunca configuración del restaurante.

---

## 11. Decisiones pendientes

| # | Decisión | Recomendación |
|---|---|---|
| 1 | ¿Se hace modo oscuro en las cuatro vistas o sólo en cocina (y quizás mozo)? | Cocina y mozo. El comensal ve la marca del restaurante, no el tema de su teléfono |
| 2 | ¿El admin en desktop va a dos columnas (lista + detalle) o se queda con modal más ancho? | Dos columnas: el ahorro real está en no perder de vista la lista |
| 3 | ¿"Lista compacta vs. tarjetas con foto" es elección del dueño o decisión nuestra? | Del dueño (una carta de vinos y una de hamburguesas no se muestran igual), con un default sensato |
| 4 | ¿Entra la landing en esta ronda o después de los bloques de v1.1? | Después: no bloquea nada, y conviene tener capturas de las pantallas ya rediseñadas |
| 5 | Orden entre este plan y v1.1 | **Fase 1 de acá** → bloques 0–3 de v1.1 → **Fase 2 de acá** junto con el bloque 4/5 de v1.1 (admin), para no rediseñar admin dos veces |
