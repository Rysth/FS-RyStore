import { closeDatabase } from "../db/client.ts";
import {
  cleanupExpiredSessions,
  cleanupExpiredVerifications,
  handleEmail,
  handleOrderNotification,
} from "./handlers.ts";
import {
  getBoss,
  QUEUES,
  shutdownQueue,
  type EmailJob,
  type OrderNotificationJob,
} from "./queue.ts";

/**
 * Worker entrypoint, replacing `bundle exec bin/jobs` (Solid Queue).
 *
 * Runs in its own container so a slow email cannot occupy an api request
 * thread, matching how the Rails deployment was already split.
 */
async function main(): Promise<void> {
  const boss = await getBoss();

  // v10 hands the handler a batch, even when batchSize is 1.
  await boss.work<EmailJob>(QUEUES.sendEmail, { batchSize: 5 }, async (jobs) => {
    for (const job of jobs) {
      await handleEmail(job.data);
      console.log(`[jobs] correo enviado: ${job.data.type} -> ${job.data.to}`);
    }
  });

  await boss.work<OrderNotificationJob>(QUEUES.orderNotification, { batchSize: 5 }, async (jobs) => {
    for (const job of jobs) {
      const sent = await handleOrderNotification(job.data);
      console.log(
        `[jobs] aviso de pedido ${job.data.orderId} (${job.data.event}): ${sent ? "enviado" : "omitido"}`,
      );
    }
  });

  await boss.work(QUEUES.cleanupVerifications, async () => {
    const deleted = await cleanupExpiredVerifications();
    console.log(`[jobs] verificaciones caducadas eliminadas: ${deleted}`);
  });

  await boss.work(QUEUES.cleanupSessions, async () => {
    const deleted = await cleanupExpiredSessions();
    console.log(`[jobs] sesiones caducadas eliminadas: ${deleted}`);
  });

  // Rails' OtpCleanupJob re-enqueued itself every hour, which meant the loop
  // died with any failed run and had to be kick-started by hand. config/
  // recurring.yml was entirely commented out, so nothing scheduled it at all.
  // pg-boss owns the schedule instead.
  await boss.schedule(QUEUES.cleanupVerifications, "0 * * * *");
  await boss.schedule(QUEUES.cleanupSessions, "30 3 * * *");

  console.log("[jobs] worker listo: correo, avisos de pedidos y limpiezas programadas");
}

const shutdown = async (signal: string) => {
  console.log(`[jobs] ${signal} recibido, cerrando...`);
  await shutdownQueue();
  await closeDatabase();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

try {
  await main();
} catch (error) {
  console.error("[jobs] fallo al arrancar el worker", error);
  process.exit(1);
}
