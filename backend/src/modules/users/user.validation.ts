import { ProductivityMode } from "@prisma/client";
import { z } from "zod";

export const updateUserIdentitySchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    avatarUrl: z.string().url().max(500).nullable().optional()
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one user field must be provided"
  });

export const equipCharacterClassSchema = z.object({
  characterClassId: z.string().uuid()
});

export const finalizeOnboardingSchema = z.object({
  timezone: z.string().trim().min(1).max(80),
  productivityMode: z.nativeEnum(ProductivityMode),
  preferredFocusMinutes: z.number().int().min(5).max(180),
  dailyGoalMinutes: z.number().int().min(10).max(720),
  characterClassId: z.string().uuid().optional()
});

export const equipCosmeticSchema = z.object({
  cosmeticItemId: z.string().uuid()
});

export const purchaseCosmeticSchema = equipCosmeticSchema;

export const createMarketplaceListingSchema = z.object({
  cosmeticItemId: z.string().uuid(),
  priceCoins: z.number().int().min(1).max(100000)
});

export const marketplaceListingQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(80).optional(),
    rarity: z.enum(["COMMON", "RARE", "EPIC", "LEGENDARY"]).optional(),
    minPriceCoins: z.coerce.number().int().min(1).max(100000).optional(),
    maxPriceCoins: z.coerce.number().int().min(1).max(100000).optional()
  })
  .refine((query) => {
    if (query.minPriceCoins === undefined || query.maxPriceCoins === undefined) {
      return true;
    }

    return query.minPriceCoins <= query.maxPriceCoins;
  }, {
    message: "Minimum price cannot be greater than maximum price",
    path: ["minPriceCoins"]
  });

export const marketplaceListingParamsSchema = z.object({
  listingId: z.string().uuid()
});
