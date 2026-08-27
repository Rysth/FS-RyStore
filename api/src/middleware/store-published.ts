import type { FastifyReply, FastifyRequest } from "fastify";
import { getBusiness } from "../services/business.ts";
import { fail } from "../lib/response.ts";

/**
 * Closes the storefront when `businesses.published` is false.
 *
 * Ported from Api::V1::Public::BaseController#enforce_store_published!. It is
 * deliberately not applied everywhere in /public:
 *
 * - GET /public/store stays open, or a closed shop could not even render its
 *   own name and logo on the "volvemos pronto" page.
 * - The order routes stay open, so a buyer who already checked out can still
 *   open their confirmation link, upload a transfer receipt or cancel.
 */
export async function enforceStorePublished(
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const business = await getBusiness();
  if (!business.published) {
    await fail(reply, "La tienda no está disponible en este momento. Vuelve pronto.", 503, {
      error: "store_unpublished",
    });
  }
}
