import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import type { Database } from "../db/client.ts";
import {
  branches,
  businesses,
  downloadableCatalogs,
  productBranches,
} from "../db/schema.ts";
import type { Branch, Business, DownloadableCatalog } from "../db/schema.ts";
import { assetUrl } from "../lib/serializers.ts";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const MAX_BRANCH_NAME_LENGTH = 120;
export const MAX_CATALOG_TITLE_LENGTH = 140;

export function serializeInformationalBusiness(business: Business) {
  return {
    about_title: business.aboutTitle,
    about_body: business.aboutBody,
    contact_intro: business.contactIntro,
  };
}

export function serializeBranch(branch: Branch) {
  return {
    id: branch.id,
    name: branch.name,
    address: branch.address,
    hours: branch.hours,
    phone: branch.phone,
    whatsapp: branch.whatsapp,
    maps_url: branch.mapsUrl,
    active: branch.active,
    position: branch.position,
    created_at: branch.createdAt.toISOString(),
    updated_at: branch.updatedAt.toISOString(),
  };
}

export function publicBranchJson(branch: Branch) {
  return {
    id: branch.id,
    name: branch.name,
    address: branch.address,
    hours: branch.hours,
    phone: branch.phone,
    whatsapp: branch.whatsapp,
    maps_url: branch.mapsUrl,
  };
}

export function serializeDownloadableCatalog(catalog: DownloadableCatalog) {
  return {
    id: catalog.id,
    title: catalog.title,
    description: catalog.description,
    cover_image_url: assetUrl(catalog.coverImageKey),
    file_url: assetUrl(catalog.fileKey),
    active: catalog.active,
    position: catalog.position,
    created_at: catalog.createdAt.toISOString(),
    updated_at: catalog.updatedAt.toISOString(),
  };
}

export async function listBranches({ active }: { active?: boolean } = {}): Promise<Branch[]> {
  return db
    .select()
    .from(branches)
    .where(active === undefined ? undefined : eq(branches.active, active))
    .orderBy(asc(branches.position), asc(branches.name));
}

export async function findBranch(id: number): Promise<Branch | null> {
  const [branch] = await db.select().from(branches).where(eq(branches.id, id)).limit(1);
  return branch ?? null;
}

export async function nextBranchPosition(): Promise<number> {
  const [{ next = 1 } = {}] = await db
    .select({ next: sql<number>`coalesce(max(${branches.position}) + 1, 1)::int` })
    .from(branches);
  return next;
}

export async function reorderBranches(positions: Array<{ id: number; position: number }>): Promise<void> {
  await db.transaction(async (tx) => {
    for (const row of positions) {
      await tx
        .update(branches)
        .set({ position: row.position, updatedAt: new Date() })
        .where(eq(branches.id, row.id));
    }
  });
}

export async function listDownloadableCatalogs({ active }: { active?: boolean } = {}): Promise<DownloadableCatalog[]> {
  return db
    .select()
    .from(downloadableCatalogs)
    .where(active === undefined ? undefined : eq(downloadableCatalogs.active, active))
    .orderBy(asc(downloadableCatalogs.position), asc(downloadableCatalogs.title));
}

export async function findDownloadableCatalog(id: number): Promise<DownloadableCatalog | null> {
  const [catalog] = await db
    .select()
    .from(downloadableCatalogs)
    .where(eq(downloadableCatalogs.id, id))
    .limit(1);
  return catalog ?? null;
}

export async function nextDownloadableCatalogPosition(): Promise<number> {
  const [{ next = 1 } = {}] = await db
    .select({ next: sql<number>`coalesce(max(${downloadableCatalogs.position}) + 1, 1)::int` })
    .from(downloadableCatalogs);
  return next;
}

export async function reorderDownloadableCatalogs(positions: Array<{ id: number; position: number }>): Promise<void> {
  await db.transaction(async (tx) => {
    for (const row of positions) {
      await tx
        .update(downloadableCatalogs)
        .set({ position: row.position, updatedAt: new Date() })
        .where(eq(downloadableCatalogs.id, row.id));
    }
  });
}

export async function existingBranchIds(ids: number[]): Promise<number[]> {
  if (ids.length === 0) return [];
  const rows = await db.select({ id: branches.id }).from(branches).where(inArray(branches.id, ids));
  return rows.map((row) => row.id);
}

export async function replaceProductBranches(
  tx: Transaction,
  productId: number,
  branchIds: number[],
): Promise<void> {
  await tx.delete(productBranches).where(eq(productBranches.productId, productId));
  if (branchIds.length === 0) return;

  await tx.insert(productBranches).values(
    [...new Set(branchIds)].map((branchId) => ({
      productId,
      branchId,
    })),
  );
}

export async function loadProductBranches(productIds: number[]): Promise<Map<number, Branch[]>> {
  const result = new Map<number, Branch[]>();
  if (productIds.length === 0) return result;

  const rows = await db
    .select({ productId: productBranches.productId, branch: branches })
    .from(productBranches)
    .innerJoin(branches, eq(productBranches.branchId, branches.id))
    .where(inArray(productBranches.productId, productIds))
    .orderBy(asc(branches.position), asc(branches.name));

  for (const row of rows) {
    const list = result.get(row.productId) ?? [];
    list.push(row.branch);
    result.set(row.productId, list);
  }

  return result;
}

export async function updateInformationalBusiness(
  businessId: number,
  values: { aboutTitle?: string | null; aboutBody?: string | null; contactIntro?: string | null },
): Promise<Business> {
  const [updated] = await db
    .update(businesses)
    .set({
      ...(values.aboutTitle !== undefined ? { aboutTitle: values.aboutTitle } : {}),
      ...(values.aboutBody !== undefined ? { aboutBody: values.aboutBody } : {}),
      ...(values.contactIntro !== undefined ? { contactIntro: values.contactIntro } : {}),
      updatedAt: new Date(),
    })
    .where(eq(businesses.id, businessId))
    .returning();

  return updated!;
}
