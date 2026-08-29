import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray, like } from "drizzle-orm";
import { closeDatabase, db } from "../src/db/client.ts";
import {
  cashRegisters,
  paymentItems,
  payments,
  products,
  restaurantOrderItems,
  restaurantOrders,
  users,
} from "../src/db/schema.ts";
import { openCashRegister } from "../src/services/restaurant/cash-registers.ts";
import {
  cancelRestaurantOrder,
  createPaidRestaurantOrder,
  kitchenQueue,
  serializeKitchenOrder,
} from "../src/services/restaurant/orders.ts";

const PREFIX = "Test Restaurante";

const TEST_USER_ID = "restaurant-test-user";
let userId = TEST_USER_ID;
let productId = 0;

before(async () => {
  await db
    .insert(users)
    .values({
      id: TEST_USER_ID,
      fullname: "Restaurant Test User",
      email: "restaurant-test@example.com",
      emailVerified: true,
      username: "restaurant_test",
    })
    .onConflictDoNothing();

  const [product] = await db.select({ id: products.id }).from(products).where(eq(products.slug, "demo-camiseta")).limit(1);
  assert.ok(product, "falta el catálogo demo — corre npm run db:seed:dev");
  productId = product.id;

  await cleanup();
});

after(async () => {
  await cleanup();
  await db.delete(users).where(eq(users.id, TEST_USER_ID));
  await closeDatabase();
});

describe("restaurant orders", () => {
  it("rechaza pedidos sin caja abierta", async () => {
    const result = await createPaidRestaurantOrder({
      userId,
      customerName: `${PREFIX} Sin Caja`,
      channel: "local",
      paymentMethod: "cash",
      receivedAmount: "20.00",
      items: [{ product_id: productId, quantity: 1 }],
    });

    assert.equal(result.success, false);
    assert.deepEqual(result.errors, ["Abre una caja antes de tomar pedidos"]);
  });

  it("crea un pedido pagado, numerado y visible para cocina sin precios", async () => {
    const opened = await openCashRegister({ userId, openingAmount: "50.00" });
    assert.equal(opened.success, true);

    const result = await createPaidRestaurantOrder({
      userId,
      customerName: `${PREFIX} Cliente`,
      channel: "local",
      paymentMethod: "cash",
      receivedAmount: "25.00",
      items: [
        {
          product_id: productId,
          quantity: 2,
          removed_ingredients: ["Cebolla", " Cebolla "],
          extras: [{ name: "Tocino", price: "1.00" }],
          notes: "Bien dorado",
        },
      ],
    });

    assert.equal(result.success, true);
    assert.equal(result.value.order.status, "preparing");
    assert.equal(result.value.order.paymentStatus, "paid");
    assert.equal(result.value.order.number, 1);
    assert.equal(result.value.order.totalAmount, "22.00");
    assert.equal(result.value.items[0]!.unitPrice, "10.00");
    assert.equal(result.value.items[0]!.extrasTotal, "2.00");
    assert.deepEqual(result.value.items[0]!.removedIngredients, ["Cebolla"]);

    const [payment] = await db.select().from(payments).where(eq(payments.orderId, result.value.order.id));
    assert.equal(payment?.amount, "22.00");
    assert.equal(payment?.receivedAmount, "25.00");

    const queue = await kitchenQueue();
    const kitchenOrder = queue.find((record) => record.order.id === result.value.order.id);
    assert.ok(kitchenOrder);
    const payload = serializeKitchenOrder(kitchenOrder);
    assert.equal("total_amount" in payload, false);
    assert.equal("unit_price" in payload.items[0]!, false);
    assert.equal(payload.items[0]!.notes, "Bien dorado");
  });

  it("cancela un pedido en preparación con motivo obligatorio", async () => {
    const opened = await openCashRegister({ userId, openingAmount: "50.00" });
    assert.equal(opened.success, true);

    const created = await createPaidRestaurantOrder({
      userId,
      customerName: `${PREFIX} Cancelar`,
      channel: "local",
      paymentMethod: "cash",
      receivedAmount: "15.00",
      items: [{ product_id: productId, quantity: 1 }],
    });
    assert.equal(created.success, true);

    const withoutReason = await cancelRestaurantOrder(created.value.order.id, userId, "");
    assert.equal(withoutReason.success, false);
    assert.ok(withoutReason.errors[0]?.includes("motivo"));

    const cancelled = await cancelRestaurantOrder(created.value.order.id, userId, "Cliente se arrepintió");
    assert.equal(cancelled.success, true);
    assert.equal(cancelled.value.order.status, "cancelled");
    assert.equal(cancelled.value.order.cancelReason, "Cliente se arrepintió");
    assert.ok(cancelled.value.order.cancelledAt);
  });

  it("no cancela un pedido ya entregado", async () => {
    const opened = await openCashRegister({ userId, openingAmount: "50.00" });
    assert.equal(opened.success, true);

    const created = await createPaidRestaurantOrder({
      userId,
      customerName: `${PREFIX} Entregado`,
      channel: "local",
      paymentMethod: "cash",
      receivedAmount: "15.00",
      items: [{ product_id: productId, quantity: 1 }],
    });
    assert.equal(created.success, true);

    // Marcar como listo y entregado directamente en BD para el test
    await db
      .update(restaurantOrders)
      .set({ status: "ready", readyAt: new Date(), updatedAt: new Date() })
      .where(eq(restaurantOrders.id, created.value.order.id));
    await db
      .update(restaurantOrders)
      .set({ status: "delivered", deliveredAt: new Date(), updatedAt: new Date() })
      .where(eq(restaurantOrders.id, created.value.order.id));

    const result = await cancelRestaurantOrder(created.value.order.id, userId, "Error");
    assert.equal(result.success, false);
    assert.ok(result.errors[0]?.includes("entregado"));
  });
});

async function cleanup(): Promise<void> {
  const rows = await db
    .select({ id: restaurantOrders.id })
    .from(restaurantOrders)
    .where(like(restaurantOrders.customerName, `${PREFIX}%`));
  const orderIds = rows.map((row) => row.id);

  if (orderIds.length > 0) {
    const paymentRows = await db.select({ id: payments.id }).from(payments).where(inArray(payments.orderId, orderIds));
    const paymentIds = paymentRows.map((row) => row.id);

    if (paymentIds.length > 0) {
      await db.delete(paymentItems).where(inArray(paymentItems.paymentId, paymentIds));
    }

    await db.delete(payments).where(inArray(payments.orderId, orderIds));
    await db.delete(restaurantOrderItems).where(inArray(restaurantOrderItems.orderId, orderIds));
    await db.delete(restaurantOrders).where(inArray(restaurantOrders.id, orderIds));
  }
  await db.delete(cashRegisters).where(eq(cashRegisters.openedBy, userId));
}
