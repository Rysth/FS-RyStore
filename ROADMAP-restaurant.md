# Roadmap — HungerApp (Restaurante / HS Comanda)

> Rama activa: `feature/hungerapp-restaurant-mode`
> Estado: MVP en progreso. Lo marcado con [x] ya está en la rama.
> Cliente objetivo: HungerStrike (patio de comidas, Ecuador). Las fases y el alcance
> siguen el doc "HS Comanda — Lógica de Negocio" (fuente de verdad del dominio).
> Ver también §15 de ese doc: "Decisiones de alcance ya cerradas (no re-litigar)".

---

## Fuera de alcance por diseño (cerrado, no re-litigar)

- **Mesas / cuentas por mesa.** El pedido es la unidad del negocio; no hay "cuenta"
  ni "mesa" por encima. Es un patio de comidas — agrupar por mesa mezclaría
  clientes distintos en una factura.
- **Kiosco de autoservicio / menú digital público (QR).**
- **Reservas y mapa del local.**
- **Modo offline.**
- **División de cuentas por porcentajes o entre N personas.**
- **Inventario/stock/kardex, compras, facturación electrónica/SRI, contabilidad,
  costos y recetas** — eso lo cubre Contifico (ver Fase 4). Ningún módulo de
  Comanda debe duplicarlo.

---

## Fase 1 — Base multicanal (MVP Fundacional) [en progreso]

### 1.1 Infraestructura y Roles [x]
- [x] Variable `APP_VERTICAL=restaurant` activa/desactiva módulos
- [x] Tablas: `cash_registers`, `restaurant_orders`, `restaurant_order_items`, `payments`, `payment_items`
- [x] Migración generada y schema relaciones
- [x] Permisos restaurante: `view_cash_register`, `manage_cash_register`, `deliver_orders`, `view_kitchen`, `complete_kitchen_orders`, `charge_payments`, `void_payments`, `view_kitchen_metrics`
- [x] Roles: `cashier`, `kitchen` en seed RBAC + fixtures dev
- [x] Rutas restaurante condicionales por vertical
- [x] Redirección de login según rol (`kitchen` → `/kitchen`)

### 1.2 Caja [x]
- [x] Abrir caja con fondo inicial
- [x] Índice único: una sola caja abierta por fecha de negocio
- [x] Solo quien abrió puede cerrar
- [x] Bloqueo de cierre si hay pedidos `preparing` o `ready`
- [x] Reporte diario básico: totales por método de pago + top productos
- [x] `platform_total` separado de `cash_total` — el dinero de Rappi/PedidosYa
      no infla el cajón esperado (verificado en `cash-registers.ts`)

### 1.3 Comanda (Toma de Pedidos) [x]
- [x] Crear pedido pagado directamente (`preparing` + `paid` en un solo paso —
      esto ya implementa el modelo de **prepago** que la Fase 2 del doc de
      negocio define como objetivo, no solo el MVP de barra rápida)
- [x] Campos: cliente, canal (`local`/`whatsapp`/`rappi`/`pedidosya`/`self_order`), método de pago (`cash`/`transfer`/`card`/`platform`)
- [x] Efectivo: recibido + cálculo de cambio visible
- [x] Referencia para transferencia/tarjeta/plataforma
- [x] Líneas con producto, cantidad, extras (nombre+precio), notas
- [x] Ingredientes base por producto (`default_ingredients`) → chips "Sin ___" en comanda
- [x] Cancelación de pedido con motivo obligatorio (requiere `void_payments`)
- [x] Historial del día (entregados + cancelados)
- [x] Listado filtra por fecha de negocio actual

### 1.4 Cocina [x]
- [x] Cola de pedidos `preparing`/`ready`
- [x] Polling cada 4 segundos
- [x] Tarjetas grandes, sin precios ni métricas visibles (payload deliberadamente pobre)
- [x] Botón "Marcar LISTO"
- [x] Ruta fullscreen `/kitchen` para rol `kitchen` (kiosco/TV)
- [x] Cálculo de `prep_seconds` al marcar listo
- [ ] Idempotencia confirmada en UI: doble pulsación de LISTO debe dar mensaje
      informativo ("ya fue marcado como listo"), no error rojo — verificar

### 1.5 Entrega [x]
- [x] Botón "Entregar" en comanda para pedidos `ready`
- [x] Cálculo de `delivery_seconds` al entregar

### 1.6 Pendiente para cerrar Fase 1
- [ ] Pulido táctil de la pantalla de comanda (el doc de negocio lo marca
      explícitamente como pendiente antes de pasar a Fase 2)

---

## Fase 2 — Centralizador (pendiente)

> Objetivo del doc de negocio: que los 4 canales convivan sin fricción y el
> local sea rápido. **La decisión "draft vs paid-only" ya está cerrada**: el
> pago va al inicio y dispara la entrada a cocina (prepago). El cobro parcial
> por selección de productos pierde sentido en este modelo — se cobra el
> pedido entero antes de que exista en cocina. No se implementan cuentas
> abiertas ni pedidos `draft` persistidos como flujo normal.

### 2.1 Métodos de pago y datáfono
- [x] Schema soporta `card` y `platform` como métodos de pago
- [ ] Definir integración con datáfono (pregunta abierta al cliente: ¿con cuál
      trabajan? determina si se integra o se anota a mano con referencia del voucher)
- [ ] UI de comanda para `card` (hoy probablemente solo cubre cash/transfer bien)

### 2.2 Toma de pedido en 3 pasos
- [ ] Reducir toques: el diálogo de personalización (ingredientes/extras) debe
      abrirse **solo si hace falta**, no por cada línea agregada
- [ ] Paso 1: tocar productos en la cuadrícula (1 toque por línea sin modal)
- [ ] Paso 2: nombre + canal
- [ ] Paso 3: cobrar (método + billete) — el cobro es lo que manda a cocina
- [ ] Entrada manual de WhatsApp: confirmar que el flujo actual permite tomar
      un pedido de WhatsApp marcando el canal, sin catálogo especial

### 2.3 Mix de ventas por canal
- [ ] Reporte: unidades y dinero por canal, para hoy / últimos 7 / últimos 30
      días operativos
- [ ] UI en el panel del dueño

### 2.4 Panel de tiempos de cocción
- [ ] Endpoint `GET /api/v1/restaurant/kitchen/metrics` (requiere `view_kitchen_metrics`)
- [ ] **Mediana** de `prep_seconds` (no promedio — un pedido olvidado 20 min
      arrastra la media y esconde que el resto del servicio fue bien)
- [ ] Conteo de pedidos que superaron 2 minutos (meta: bajar de ~4 min a 2 min)
- [ ] Cruce por canal (un Rappi de 6 min no es el mismo problema que un local de 6 min)
- [ ] UI en admin para manager/admin — **nunca** visible para el rol `kitchen`
      (sin cronómetro en la pantalla de cocina, es una decisión de producto)

### 2.5 Variantes de producto
- [ ] `restaurant_order_items` debe poder referenciar `product_variants`
      (hoy solo referencia `products`, la tabla de variantes existe para el
      catálogo general pero el módulo restaurante no la usa)
- [ ] Migrar Personal/Dúo, Micheladas y "Frozen" de productos sueltos a variantes
- [ ] Conservar `product_id` en ítems históricos al migrar (no romper el histórico)

### 2.6 Búsqueda y Navegación
- [ ] Buscar pedido por número en comanda
- [ ] Filtros en historial: por canal, por método de pago, por estado
- [ ] Paginación en historial del día (límite actual 200)

### 2.7 Kiosco de Cocina — Alertas
- [ ] Sonido/alerta visual cuando llega un nuevo pedido `preparing`
- [ ] Contador de pedidos pendientes en badge/título de pestaña
- [ ] Opción de silenciar alertas
- ~~Timer en vivo desde `confirmed_at`~~ — **descartado**: el doc de negocio
  prohíbe explícitamente mostrar un cronómetro a cocina ("el dueño no quiere
  que cocina sepa que se le está midiendo el tiempo"); `confirmed_at` solo se
  usa para ordenar las tarjetas.

### 2.8 Onboarding Rappi / PedidosYa (gestión, no código)
- [ ] Iniciar solicitud de aprobación con Rappi (proceso manual)
- [ ] Iniciar solicitud con PedidosYa: requiere además NDA + llaves PGP
- [ ] Es el camino crítico más largo del roadmap — arrancar ya, aunque los
      webhooks (Fase 5) no se implementen todavía

---

## Fase 3 — Sucursales (pendiente)

> Pasar de una instancia por local a **una sola instancia con tabla `branches`**,
> para tener vista consolidada y comparar sucursales sin un tercer sistema.

### 3.1 Modelo de datos
- [ ] Tabla `branches` y `branch_id` en todo el dominio (caja, pedidos, cobros, usuarios, métricas)
- [ ] Usuarios asignados a una sucursal

### 3.2 Invariantes que dejan de ser globales
- [ ] Caja abierta: de "una en todo el sistema" a "una por sucursal"
- [ ] Numeración de pedidos: `(business_date, number)` → `(branch_id, business_date, number)`
- [ ] Lock de numeración: derivado del `branch_id`
- [ ] Nombre de categoría: definir si el menú es compartido o por sucursal
- [ ] Día operativo: por caja de sucursal, no global

### 3.3 Reportes multi-sucursal
- [ ] `GET caja actual` devuelve la caja de la sucursal del usuario, o lista completa para el dueño
- [ ] Vista consolidada y comparación entre sucursales para el dueño

### 3.4 Caja Avanzada
- [ ] Historial de cajas cerradas (listado por fecha, por sucursal)
- [ ] Reapertura de caja del día (solo admin)
- [ ] Arqueo detallado: desglose de cada transacción
- [ ] Pedidos cancelados en cierre de caja (monto y motivo)

### 3.5 Auditoría
- [ ] Quién canceló qué y por qué (ya se guarda, falta exponer en reporte)
- [ ] Log de cambios de estado por pedido
- [ ] Quién abrió/cerró caja y cuándo

### 3.6 Reportes de Ventas (rango de fechas)
- [ ] Reporte por rango de fechas (no solo día actual)
- [ ] Incluir pedidos cancelados en sección aparte (con motivo)
- [ ] Promedio de ticket
- [ ] Ventas por hora
- [ ] Exportar a XLSX

---

## Fase 4 — Integración Contifico (pendiente)

> Eliminar la doble digitación. Contifico es el sistema contable — Comanda no
> debe duplicar inventario, facturación ni contabilidad.

- [ ] **Dirección 1 — traer catálogo:** Contifico gana; catálogo de solo lectura
      en Comanda. Requiere `contifico_id` en productos y categorías.
- [ ] **Dirección 2 — enviar venta:** por cada pedido cobrado, un documento con
      detalles y cobros vía `/documento/` + `/documento/{id}/cobro/`. Necesita
      token del POS y mapeo `payment_method` → `forma_cobro`.
- [ ] **Desglose de IVA:** los precios ya incluyen 15% (no 12% como el ejemplo
      oficial de Contifico) — definir cómo desglosarlo hacia atrás antes de
      integrar, para no generar descuadre contable después.
- [ ] Conciliación y manejo de errores
- [ ] Bloquea el arranque: API Key de Contifico, token del POS, `producto_id`
      de cada ítem del menú (preguntar al cliente si ya los tiene)

---

## Fase 5 — Delivery integrado (pendiente)

- [ ] Webhook Rappi → cola de cocina (requiere onboarding completado, ver 2.8)
- [ ] Webhook PedidosYa → cola de cocina (requiere onboarding + NDA + PGP, ver 2.8)
- [ ] Método de pago `platform` ya existe en schema — verificar que el flujo de
      creación desde webhook lo use y no toque el cajón
- [ ] Conciliación de liquidaciones (Rappi/PedidosYa pagan por transferencia,
      días después, ya descontada su comisión)
- [ ] Definir si hay recargo en precios de delivery para cubrir la comisión
      (pregunta abierta al cliente)

---

## Otras funcionalidades sin fase asignada aún

### Impresión
- [ ] Ticket de cocina al crear pedido (impresora térmica)
- [ ] Ticket de cliente al cobrar
- [ ] Comando de impresión vía API o WebSocket

### Propinas
- [ ] Campo `tip_amount` en pedido/pago
- [ ] Distribución de propinas entre staff

---

## Preguntas abiertas para el cliente (del doc de negocio)

1. ¿Con qué datáfono trabajan? (bloquea 2.1)
2. ¿Ya tienen API Key de Contifico y token del POS, o hay que solicitarlos? (bloquea Fase 4)
3. ¿El menú es idéntico en todas las sucursales, o cada una tendrá el suyo? (bloquea 3.2)
4. ¿Ya son socios integrados de Rappi y PedidosYa, o hay que arrancar el onboarding ya? (bloquea Fase 5 — arrancar 2.8 cuanto antes)
5. ¿Los precios de delivery son los mismos que en local, o llevan recargo por comisión? (bloquea Fase 5)

---

## Próxima Tarea Sugerida

Completar Fase 1 (pulido táctil, 1.6) y luego Fase 2 en este orden de valor:
**2.3 Mix por canal** y **2.4 Panel de tiempos de cocción** son las métricas que
el dueño ya está pidiendo y no tocan flujo operativo — bajo riesgo, alto valor
visible. **2.2 Toma en 3 pasos** reduce fricción diaria del cajero. **2.8
Onboarding Rappi/PedidosYa** debe arrancarse en paralelo (gestión, no bloquea
desarrollo) porque es el ítem de mayor lead time de todo el roadmap.
