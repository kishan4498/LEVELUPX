import type { CosmeticItem } from "@prisma/client";

export function cosmeticCoinPrice(cosmetic: Pick<CosmeticItem, "rarity" | "unlockLevel">) {
  const basePrices: Record<CosmeticItem["rarity"], number> = {
    COMMON: 50,
    RARE: 120,
    EPIC: 240,
    LEGENDARY: 500
  };

  return basePrices[cosmetic.rarity] + cosmetic.unlockLevel * 10;
}
