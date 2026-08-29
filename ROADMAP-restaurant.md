# Roadmap — HungerApp (Restaurante)

> Rama activa: `feature/hungerapp-restaurant-mode`
> Estado: MVP en progreso. Lo marcado con [x] ya está en la rama.

---

## Fase 1 — MVP Fundacional (en progreso)

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

### 1.3 Comanda (Toma de Pedidos) [x]
- [x] Crear pedido pagado directamente
- [x] Campos: cliente, canal (`local`/`whatsapp`/`rappi`/`pedidosya`/`self_order`), método de pago
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
- [x] Tarjetas grandes, sin precios ni métricas visibles
- [x] Botón "Marcar LISTO"
- [x] Ruta fullscreen `/kitchen` para rol `kitchen` (kiosco/TV)
- [x] Cálculo de `prep_seconds` al marcar listo

### 1.5 Entrega [x]
- [x] Botón "Entregar" en comanda para pedidos `ready`
- [x] Cálculo de `delivery_seconds` al entregar

---

## Fase 2 — Operación Completa (pendiente)

### 2.1 Pedidos Pendientes / Drafts
- [ ] Estado `draft` real: crear pedido sin pagar, pagar después
- [ ] Pedidos `pending`/`partially_paid`: cobrar en partes o dejar cuenta abierta
- [ ] Endpoint para agregar pago a pedido existente (`paymentStatus` ya lo soporta)
- [ ] UI en comanda: "Guardar pedido" vs "Cobrar y enviar"
- [ ] Listado de pedidos pendientes de pago

### 2.2 Mesas
- [ ] Tabla `tables` (número, nombre, capacidad, estado: free/occupied)
- [ ] Campo `table_id` en `restaurant_orders`
- [ ] Selector de mesa en comanda
- [ ] Visualización de mesas ocupadas en comanda
- [ ] Transferir pedido entre mesas
- [ ] Canal `self_order` vinculado a mesa (QR por mesa)

### 2.3 Autoservicio / Menú Digital (QR)
- [ ] Pantalla pública tipo `/menu/:table_token` o similar (no requiere login)
- [ ] Leer catálogo desde API pública
- [ ] Carrito local, enviar pedido como `self_order`
- [ ] Generar QR por mesa que apunte al menú
- [ ] Pedidos self-order entran a cocina como `preparing` pero sin pago (cobro manual en caja)

### 2.4 Búsqueda y Navegación
- [ ] Buscar pedido por número en comanda
- [ ] Filtros en historial: por canal, por método de pago, por estado
- [ ] Paginación en historial del día (límite actual 200)

### 2.5 Kiosco de Cocina — Alertas
- [ ] Sonido/alerta visual cuando llega un nuevo pedido `preparing`
- [ ] Contador de pedidos pendientes en badge/título de pestaña
- [ ] Opción de silenciar alertas
- [ ] Mostrar tiempo transcurrido en vivo (timer desde `confirmed_at`)

---

## Fase 3 — Control y Reportes (pendiente)

### 3.1 Métricas de Cocina
- [ ] Endpoint `GET /api/v1/restaurant/kitchen/metrics` (requiere `view_kitchen_metrics`)
- [ ] Tiempo promedio de preparación por rango de fecha
- [ ] Tiempo promedio de entrega
- [ ] Pedidos por hora
- [ ] Top productos más solicitados para cocina
- [ ] UI en admin para manager/admin

### 3.2 Reportes de Ventas Restaurante
- [ ] Reporte por rango de fechas (no solo día actual)
- [ ] Incluir pedidos cancelados en sección aparte (con motivo)
- [ ] Promedio de ticket
- [ ] Ventas por canal (local/WhatsApp/Rappi/etc.)
- [ ] Ventas por hora
- [ ] Exportar a XLSX

### 3.3 Caja Avanzada
- [ ] Historial de cajas cerradas (listado por fecha)
- [ ] Reapertura de caja del día (solo admin)
- [ ] Arqueo detallado: desglose de cada transacción
- [ ] Pedidos cancelados en cierre de caja (monto y motivo)

### 3.4 Auditoría
- [ ] Quién canceló qué y por qué (ya se guarda, falta exponer en reporte)
- [ ] Log de cambios de estado por pedido
- [ ] Quién abrió/cerró caja y cuándo

---

## Fase 4 — Integraciones y Escalabilidad (pendiente)

### 4.1 Impresión
- [ ] Ticket de cocina al crear pedido (impresora térmica)
- [ ] Ticket de cliente al cobrar
- [ ] Comando de impresión vía API o WebSocket

### 4.2 Integraciones Delivery
- [ ] Webhook/simulación para recibir pedidos de Rappi/PedidosYa
- [ ] Estado de sincronización con plataforma externa

### 4.3 Propinas
- [ ] Campo `tip_amount` en pedido/pago
- [ ] Distribución de propinas entre staff

### 4.4 Múltiples cajas simultáneas
- [ ] Permitir más de una caja abierta (actualmente índice único lo bloquea)
- [ ] Asignar caja a cajero específico

---

## Decisión de Diseño Abierta

### ¿Draft vs Paid-only?
Actualmente todo pedido se crea como `preparing` + `paid`. El schema soporta `draft`, `pending`, `partially_paid` pero no se usan. Para restaurantes de barra rápida, el flujo actual está bien. Para restaurantes de mesa, se necesita drafts.

**Recomendación:** implementar drafts como feature toggle por negocio (campo en `businesses` o variable de entorno) para no complicar el flujo rápido actual.

### ¿Mesas obligatorias?
Para comida rápida/cafetería, las mesas no son necesarias. Para restaurante tradicional, sí.

**Recomendación:** hacer mesas opcionales en la comanda (dropdown "Mesa — Opcional"). Si se habilita el módulo mesas, entonces se requiere.

---

## Próxima Tarea Sugerida

La más valiosa para completar el MVP operativo es **2.1 Pedidos Pendientes / Drafts** o **2.2 Mesas + 2.3 QR**. Depende del tipo de restaurante objetivo:

- **Barra rápida / Cafetería:** priorizar 2.1 (cuentas abiertas) + 2.5 (alertas cocina)
- **Restaurante tradicional:** priorizar 2.2 (mesas) + 2.3 (QR autoservicio)

¿Cuál vertical se ajusta más al cliente que instalará esto primero?
