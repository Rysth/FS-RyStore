import { asc, eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { businesses, type Business } from "../db/schema.ts";

/**
 * The deployment is single-tenant: exactly one business row (AGENTS.md §1).
 *
 * Rails expressed this as `Business.first || Business.create(...)` inside
 * `Business.current`, which quietly tolerated extra rows — the dev database had
 * accumulated nine. Here the lowest id wins, same as `first`, and the row is
 * created on demand with the same defaults.
 */
export async function getBusiness(): Promise<Business> {
  const [existing] = await db.select().from(businesses).orderBy(asc(businesses.id)).limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(businesses)
    .values({
      name: "MicroBiz",
      slogan: "Powered by RysthDesign",
      whatsapp: "",
      instagram: "",
      facebook: "",
      tiktok: "",
    })
    .returning();

  return created!;
}

export async function updateBusiness(
  id: number,
  values: Partial<Omit<Business, "id" | "createdAt">>,
): Promise<Business> {
  const [updated] = await db
    .update(businesses)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(businesses.id, id))
    .returning();

  return updated!;
}
