import PgBoss from "pg-boss";
import { env, isTest } from "../config/env.ts";

/**
 * Background jobs on pg-boss, replacing Solid Queue.
 *
 * pg-boss uses the same Postgres database (in its own `pgboss` schema), so the
 * property AGENTS.md §1 cares about is preserved: no Redis, no extra service to
 * operate on a client's server.
 *
 * The api container enqueues; the worker container runs the handlers.
 */

export const QUEUES = {
  sendEmail: "send-email",
  orderNotification: "order-notification",
  cleanupVerifications: "cleanup-verifications",
  cleanupSessions: "cleanup-sessions",
} as const;

/**
 * Tells the shop an order arrived, or that its buyer uploaded a receipt.
 *
 * Carries the id rather than the order: the handler re-reads it, so a status
 * change between enqueue and delivery is reflected in the email. An order that
 * no longer exists is not an error — the handler returns quietly.
 */
export type OrderNotificationJob = {
  orderId: number;
  event: "new_order" | "payment_proof";
};

export type EmailJob =
  | { type: "verify_account"; to: string; url: string }
  | { type: "reset_password"; to: string; url: string }
  | { type: "admin_invitation"; to: string; fullname: string; url: string };

let boss: PgBoss | null = null;
let starting: Promise<PgBoss> | null = null;

const DEADLOCK = "40P01";

async function createQueueWithRetry(instance: PgBoss, name: string, attempts = 3): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await instance.createQueue(name);
      return;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== DEADLOCK || attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
}

export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;
  if (starting) return starting;

  starting = (async () => {
    const instance = new PgBoss({
      connectionString: env.DATABASE_URL,
      // These deployments are low traffic; a small pool keeps the worker from
      // competing with the api for connections.
      max: 3,
      schema: "pgboss",
    });

    instance.on("error", (error) => {
      console.error("[pg-boss]", error);
    });

    await instance.start();

    // v10 requires queues to exist before send() or work().
    //
    // Sequentially, never in parallel: create_queue takes a
    // ShareRowExclusiveLock on the same partitioned table, so concurrent calls
    // deadlock against each other. The retry covers the remaining window where
    // the api and worker containers start at the same moment.
    for (const name of Object.values(QUEUES)) {
      await createQueueWithRetry(instance, name);
    }

    boss = instance;
    return instance;
  })();

  return starting;
}

/**
 * Enqueues an email.
 *
 * Rails used `deliver_later` for exactly these, so delivery has always been
 * asynchronous. What is new is that a transient SMTP failure is retried with
 * backoff rather than lost.
 */
export async function enqueueEmail(job: EmailJob): Promise<void> {
  // Tests exercise handlers directly; going through Postgres there would make
  // them slow and order-dependent.
  if (isTest) return;

  const instance = await getBoss();
  await instance.send(QUEUES.sendEmail, job, {
    retryLimit: 5,
    retryDelay: 2,
    retryBackoff: true,
    expireInSeconds: 120,
    retentionDays: 3,
  });
}

/**
 * Enqueued from the request that created the order rather than from inside the
 * creator: that saves in a transaction, so notifying there would fire before
 * the commit and the handler could read an order that does not exist yet.
 */
export async function enqueueOrderNotification(job: OrderNotificationJob): Promise<void> {
  if (isTest) return;

  const instance = await getBoss();
  await instance.send(QUEUES.orderNotification, job, {
    retryLimit: 5,
    retryDelay: 2,
    retryBackoff: true,
    expireInSeconds: 120,
    retentionDays: 3,
  });
}

export async function shutdownQueue(): Promise<void> {
  if (boss) {
    await boss.stop({ graceful: true });
    boss = null;
    starting = null;
  }
}
