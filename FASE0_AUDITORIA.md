# Fase 0 — Auditoría de `Reymen-AI-OPS-Platform`

Auditoría de solo lectura. No se modificó ningún archivo ni se creó ninguna
rama — confirmado al final: `git status` sigue limpio, seguimos en `main`.

```
git branch --show-current  → main
git status                 → working tree clean
git log -1 --oneline       → 0ec97c1 Admin sidebar: fondo azul marca Reymen en tema claro, tema oscuro intacto
git remote -v              → https://github.com/ReymenSolutions/Reymen-AI-OPS-Platform.git
```

## 1. Estado actual del proyecto

Este NO es un proyecto vacío ni un prototipo — es un producto de Reymen ya
avanzado, con 14 "Fases" de desarrollo real completadas (visibles en el
historial de commits): entitlements de módulos, confiabilidad de webhooks,
CRM/pipeline, WhatsApp con toma de control humano, Agenda, seguimientos
automáticos vía n8n, Laboratorio de IA (versionado de prompts + sandbox +
A/B testing), centro de operación por cliente, métricas de
consumo/rentabilidad, onboarding real, ROI accionable, paquetes por
industria, y planes que expresan módulos.

Tiene CI real en GitHub Actions (`lint` → `typecheck` → `test` → `build` →
`e2e` con Playwright, en cada push/PR a `main`/`master`) y documentación
técnica interna enorme y mantenida al día:
`docs/DOCUMENTACION_TECNICA.md` (~3100 líneas, con changelog por fase) y
`docs/GUIA_DE_USUARIO.md`.

Solo existe la rama `main` — no hay `develop` todavía (la creo en cuanto
me des luz verde, según lo que acordamos).

## 2. Arquitectura encontrada

- **Next.js 15 (App Router), una sola aplicación monolítica** — a
  diferencia del otro proyecto REYMEN (SmartCard) que es un monorepo con
  tres apps separadas (`apps/admin`, `apps/ops`, `apps/public`). Aquí todo
  vive en un solo Next.js, separado por *route groups*: `(auth)` público,
  `(portal)` para el cliente final, `(admin)` para staff de Reymen.
- **Base de datos: PostgreSQL propio vía Prisma ORM** — NO Supabase. 30
  modelos, `prisma/schema.prisma` de 1029 líneas, migraciones versionadas
  en `prisma/migrations/`.
- **Auth: NextAuth v5 (beta) + Prisma Adapter** — credenciales con
  `bcrypt`, 2FA por TOTP, sesión JWT. Config separada para middleware
  (edge-safe, sin bcrypt/Prisma en el bundle) vs. la app completa.
- **Multi-tenant: shared-database/shared-schema, aislamiento 100% a nivel
  de APLICACIÓN** — cada query de Prisma filtra manualmente
  `organizationId` (extraído del JWT de sesión, nunca de un parámetro del
  cliente). **No hay RLS de base de datos** como en el proyecto Supabase —
  diferencia arquitectónica de fondo, ver Riesgos.
- **Infra:** Docker Compose (`app` + `postgres` + `n8n` + `nginx` manual +
  `certbot`) en un VPS. A diferencia del otro proyecto, aquí el
  `nginx.conf` se mantiene a mano (no hay `nginx-proxy` +
  `letsencrypt-companion` con descubrimiento automático por
  `VIRTUAL_HOST`).
- **n8n como motor real de automatización** — WhatsApp, recordatorios de
  citas, seguimientos de leads. "Principio de invisibilidad de n8n": el
  cliente nunca ve URLs ni IDs internos de n8n.
- **Internacionalización real es/en** en toda la UI
  (`src/lib/i18n.ts`, 1045 líneas de diccionario).
- **UI:** Tailwind 4 + Radix UI + componentes propios estilo shadcn
  (`src/components/ui`), Recharts para gráficas, `sonner` para toasts.
- **Billing real con Stripe** (checkout, portal de cliente, webhooks de
  suscripción) — a diferencia del `ManualBillingProvider` del otro
  proyecto (donde Reymen registra pagos a mano), aquí sí hay cobro
  automático.

## 3. Qué ya está construido

- **Tenancy + Auth:** `Organization`, `User` con 7 roles
  (`SUPER_ADMIN/ADMIN/OWNER/MANAGER/AGENT/VIEWER/CLIENT`).
- **Sistema de módulos comerciales — ya existe, en producción**: enum
  `PlatformModule` (`CRM`, `AI_WHATSAPP`, `AUTOMATIONS`, `NFC_QR`,
  `MARKETING_ADS`) + tabla `OrganizationModule`
  (`status`: ACTIVE/SUSPENDED/CANCELLED, `source`:
  SUBSCRIBED/ADMIN_GRANTED) + helpers `hasModule` / `requireModule` /
  `assertModuleEnabled` / `getEnabledModules`
  (`src/lib/modules.ts`). **Es exactamente el mismo patrón de
  "entitlements" que armamos para REYMEN Ops**, solo que aquí ya lleva 8
  fases de uso real.
- **RBAC granular por acción** (`src/lib/permissions.ts`) — catálogo de
  `Action` + matriz por rol, con receta documentada paso a paso para
  agregar nuevas (`docs/DOCUMENTACION_TECNICA.md` §18).
- **CRM completo:** Leads, pipeline de `Opportunity` con etapas
  configurables, notas, detección de duplicados.
- **WhatsApp AI:** asistente configurable, conversaciones, mensajes, toma
  de control humano, estados de entrega.
- **Agenda:** servicios, disponibilidad semanal, citas, recordatorios
  automáticos vía n8n (con control de concurrencia serializable para
  evitar doble-booking).
- **Seguimientos automáticos de leads** (`FollowUpRule`/`FollowUpLog`).
- **Laboratorio de IA:** versionado de prompts, sandbox de prueba, casos
  de prueba reutilizables, experimentos A/B con juicio humano.
- **Motor de templates** instalables por industria + paquetes curados
  (Fase 12), reusando el mismo flujo de instalación.
- **Auditoría** (`AuditLog`) fire-and-forget.
- **Onboarding real** basado en estado persistido (Fase 10), dashboard con
  ROI accionable (Fase 11).
- **Planes** (`starter`/`professional`/`enterprise`) que expresan qué
  módulos incluyen (Fase 13), sin tocar el cobro real todavía.
- **Reserva explícita para SmartCard, ya en el código**: el enum
  `PlatformModule` YA tiene `NFC_QR`, con este comentario textual en el
  schema:

  > `NFC_QR // reserved — no schema/UI yet, integration point for a
  > separate future repo`

  Es un hallazgo importante — lo desarrollo en la sección 5.

## 4. Qué falta

- `NFC_QR`: 0% construido — solo el nombre existe en el enum. Ningún
  modelo, ninguna ruta, ningún UI.
- **No existen `FOOD` ni `REALTY`** en el enum `PlatformModule` — hay que
  agregarlos (migración de Prisma, ver sección 7).
- No hay rama `develop` todavía.
- `PLAN_MODULES` (qué módulos trae cada plan) no contempla módulos nuevos
  — hay que decidir si SmartCard/Food/Realty entran a los planes
  existentes o se venden como add-ons independientes (el propio código ya
  distingue "módulo por plan" de "módulo otorgado por cortesía", así que
  el mecanismo ya soporta ambos casos).
- No hay nada de infraestructura NFC/QR física en este repo — aunque la
  librería `qrcode` YA está instalada como dependencia de producción (no
  encontré ningún uso actual en el código — puede ser un indicio de que
  algo se empezó a explorar, o simplemente se instaló previendo esto).

## 5. Riesgos encontrados

**Tensión arquitectónica importante (la más relevante de toda la
auditoría):** el propio comentario del código dice que `NFC_QR` es un
"integration point for a separate future repo" — quien diseñó este
sistema originalmente NO planeaba construir SmartCard dentro de este
monolito, sino conectarlo desde un repositorio aparte. Nosotros **ya
tenemos exactamente ese repositorio aparte**, completo y funcionando
(Supabase + `apps/admin`/`apps/ops`/`apps/public`), con SmartCard Fase 1 +
Bloque 1 (límites de plan) + Fase 2 (panel self-serve completo) ya
construidos, probados contra Postgres real, y compilando limpio — lo
terminamos esta misma semana. Construir SmartCard otra vez aquí, desde
cero, con otro stack (Prisma en vez de RLS de Supabase), duplicaría
trabajo real ya hecho y ya probado. Te planteo la decisión en la sección 6
antes de tocar código.

**Aislamiento multi-tenant sin red de seguridad de base de datos:** como
no hay RLS de Postgres aquí, cada query nueva que escriba para Food/Realty
depende 100% de que yo (o quien sea) nunca olvide el filtro
`organizationId` a mano. Un solo endpoint donde se me olvide es una fuga
de datos entre clientes, sin una segunda capa de defensa como la que
teníamos con RLS en el otro proyecto. Esto no bloquea nada, pero significa
que cada módulo nuevo necesita pruebas explícitas de aislamiento cruzado
(dos organizaciones, confirmar que ninguna ve nada de la otra) como
disciplina obligatoria, no opcional — el propio repo ya hace esto en
varios `*.test.ts` existentes, así que sigo su propio estándar.

**Dos infraestructuras distintas conviviendo en Reymen:** este proyecto
usa Prisma+Postgres propio y nginx manual; el otro usa Supabase Cloud y
nginx-proxy automático. Si la intención final es que SmartCard/Food/Realty
convivan con el sistema de usuarios/organizaciones de este repo, hay una
decisión de fondo pendiente sobre si esto se vuelve el "REYMEN OPS"
central y el otro proyecto se retira, si serán productos hermanos con
inicio de sesión compartido entre ellos, o si quedan completamente
separados por diseño.

**Estándar de calidad alto que hay que igualar:** CI real, tests unitarios
junto a cada archivo de lógica, tests e2e con Playwright, disciplina de
comentarios explicando decisiones de diseño. Cualquier módulo nuevo tiene
que sostener ese nivel (no bajar el estándar existente) — lo tomo como
obligación, no como opción.

**Sin riesgo de secretos comprometidos:** `.gitignore` correcto
(`.env`/`.env*.local` excluidos), ningún archivo `.env` trackeado en git,
sin patrones de claves (`sk_live_`, llaves AWS, certificados privados) en
el código que revisé.

## 6. Propuesta de arquitectura — necesito tu decisión aquí

Dado el hallazgo de la sección 5, te doy dos caminos reales para
SmartCard. Food y Realty no tienen esta ambigüedad — se construyen desde
cero aquí de cualquier forma, así que el plan de esas dos (secciones 9 y
10) es el mismo sin importar lo que decidas.

**Opción A — respetar la nota original del código.** SmartCard NO se
reconstruye aquí. Este repo solo agrega el "punto de integración": activar
o desactivar el módulo `NFC_QR` por organización (casi gratis, reusando
`OrganizationModule` tal cual existe), y opcionalmente un puente ligero
hacia el otro proyecto (por ejemplo, un link con inicio de sesión hacia
`ops.reymen.mx` desde el portal, o mapear `organizationId` ↔ `company_id`
si en algún momento quieren datos compartidos). El trabajo real de
SmartCard sigue viviendo en `reymen-smartcard`, que ya funciona.

**Opción B — todo dentro de esta sola plataforma**, que es como lo
planteaste originalmente. Construyo SmartCard desde cero aquí, con
Prisma/Next.js, como un módulo más, exactamente igual a como se van a ver
Food y Realty. Esto significa reescribir perfiles/NFC/QR/links/analítica
que **ya funcionan hoy** en el otro proyecto, con otro stack por completo.

Sea cual sea tu elección, los tres módulos seguirían el mismo patrón
*module-aware* que este repo ya usa y documenta para CRM/Automations/AI:
nuevo valor en el enum `PlatformModule` → modelo(s) Prisma con
`organizationId` → gate con `hasModule`/`requireModule` → nueva sección en
`PortalSidebar` (+ traducciones es/en) → Server Actions con el patrón
"auth check → org scope → mutación → `revalidatePath`" → tests unitarios +
e2e, igual que todo lo demás en este repo.

## 7. Propuesta de estructura de carpetas

Dentro del monolito, cada módulo seguiría el patrón ya usado por
CRM/Automations/AI_WHATSAPP:

```
src/app/(portal)/portal/food/...
src/app/(portal)/portal/realty/...
src/app/(portal)/portal/smartcard/...     ← solo si eliges Opción B
src/app/api/webhooks/n8n/food/...          ← si Food necesita eventos externos (ej. POS)
src/actions/food.ts, src/actions/realty.ts
src/lib/food.ts, src/lib/realty.ts         ← lógica de negocio no trivial, mismo nivel que onboarding.ts/roi.ts
prisma/schema.prisma                       ← nuevos modelos + una migración por módulo
```

Nada de esto se crea todavía — depende de la decisión de la sección 6 y de
tu aprobación general.

## 8. Plan para SmartCard (condicionado a la sección 6)

- **Si eliges Opción A:** solo activar `NFC_QR` en `OrganizationModule`
  por organización, una entrada en `PortalSidebar` que enlaza al panel
  real en `ops.reymen.mx`, y (si lo quieres) una forma de que ese enlace
  ya lleve la sesión iniciada. Trabajo de 1-2 días, no un módulo nuevo.
- **Si eliges Opción B:** portar el modelo de datos que ya probamos esta
  semana (perfil, links, tarjeta, eventos de analítica) a modelos Prisma
  con `organizationId`, reconstruir el panel self-serve
  (`apps/ops/app/smartcard` del otro repo) como
  `src/app/(portal)/portal/smartcard`, y las rutas públicas de
  redirección NFC/QR como nuevas rutas en `src/app/api` o en `(public)`.
  Trabajo de varias semanas, reescribiendo funcionalidad ya validada.

## 9. Plan para Food

Sin ambigüedad — se construye aquí de cualquier forma:

- Modelos nuevos: `FoodProduct`/`Recipe`/`RecipeIngredient`,
  `InventoryItem`/`InventoryMovement`, `Supplier`/`Purchase`, `Sale`/
  `SaleItem`, `Table`/`Ticket`/`Shift`, todos con `organizationId`.
  Costo por receta = suma de `costo unitario del ingrediente × cantidad`;
  ventas vs. consumo de insumos como reporte cruzado (Sale ↔ Recipe ↔
  InventoryMovement).
- Nuevo valor `FOOD` en `PlatformModule`.
- Server Actions + páginas en `(portal)/portal/food/{ventas,inventario,
  recetas,proveedores,operacion,analytics}`.
- Reusa: `Organization`/multi-tenant, RBAC (nuevas `Action`s
  `food:*`), `AuditLog`, patrón de reportes de `roi.ts`/`metrics.ts`.

## 10. Plan para Realty

También sin ambigüedad:

- Modelos nuevos: `Property` (alta/edición/fotos/ubicación/precio/
  estado), extender `Lead` o crear `RealtyProspect` con presupuesto/zona
  de interés/lead score (el CRM de leads ya existe — evaluar si
  Realty reusa `Lead`+`Opportunity` tal cual, con campos extra, en vez de
  duplicar el concepto de prospecto), `Campaign` (publicidad asociada a
  propiedades). Reportes de zona (`prospectos por colonia`, demanda) como
  agregaciones sobre estas tablas — mapas/heatmaps son una fase posterior,
  no bloquean el modelo de datos inicial.
- Nuevo valor `REALTY` en `PlatformModule`.
- Server Actions + páginas en `(portal)/portal/realty/{propiedades,
  prospectos,zonas,publicidad,reportes}`.
- Reusa exactamente lo mismo que Food (tenancy, RBAC, AuditLog), más
  probablemente el CRM de `Lead`/`Opportunity` ya existente en vez de
  reinventar el concepto de prospecto.

## 11. Dependencias compartidas

- `Organization`/`User`/`UserRole` (tenancy + auth) — se reusa tal cual,
  cero cambios.
- `PlatformModule`/`OrganizationModule` (entitlements) — se extiende el
  enum, el resto se reusa tal cual.
- `permissions.ts` (RBAC) — se extiende el catálogo de `Action`, el resto
  se reusa tal cual.
- Componentes UI (`src/components/ui`, estilo Radix/shadcn),
  `PortalSidebar`, el patrón de Server Actions, el patrón de webhooks n8n
  (si Food/Realty necesitan eventos externos como un POS), `i18n.ts`,
  `AuditLog` para trazabilidad.
- `PLAN_MODULES`/Stripe si deciden que los módulos nuevos se vendan
  dentro de un plan en vez de como add-on independiente.

## 12. Orden recomendado de implementación

1. Resolver la decisión de la sección 6 (SmartCard: reusar el repo que ya
   funciona vs. reconstruir aquí).
2. Crear `develop` desde `main` — con tu autorización, todavía no lo hice.
3. Empezar por **Food o Realty** (el que te urja más comercialmente) como
   `feature/*` — ninguno de los dos tiene la ambigüedad de "ya existe en
   otro lado", así que sirven para validar el patrón *module-aware*
   completo en este repo (enum → modelos → RBAC → UI → tests) antes de
   tocar SmartCard.
4. SmartCard al final, ya con la decisión de arquitectura resuelta y el
   patrón validado en, al menos, un módulo real de este repo.

---

**No se modificó nada durante esta auditoría.** Sigo en `main`, working
tree limpio. Espero tu aprobación antes de crear `develop` o cualquier
`feature/*`.
