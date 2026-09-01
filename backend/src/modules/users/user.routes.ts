import { Router } from "express";

import { authMiddleware } from "../../common/middlewares/authMiddleware.js";
import { validateRequest } from "../../common/middlewares/validateRequest.js";
import { PrismaUserRepository } from "./user.repository.js";
import { UserController } from "./user.controller.js";
import { UserService } from "./user.service.js";
import {
  finalizeOnboardingSchema,
  createMarketplaceListingSchema,
  marketplaceListingQuerySchema,
  marketplaceListingParamsSchema,
  purchaseCosmeticSchema,
  equipCharacterClassSchema,
  equipCosmeticSchema,
  updateUserIdentitySchema
} from "./user.validation.js";

const repo = new PrismaUserRepository();
const service = new UserService(repo);
const controller = new UserController(service);

export const userRouter = Router();

userRouter.use(authMiddleware);

userRouter.get("/character-classes", controller.characterClasses);
userRouter.get("/skills", controller.skills);
userRouter.get("/cosmetics", controller.cosmetics);
userRouter.get("/marketplace/listings", validateRequest({ query: marketplaceListingQuerySchema }), controller.marketplaceListings);
userRouter.post(
  "/marketplace/listings",
  validateRequest({ body: createMarketplaceListingSchema }),
  controller.createMarketplaceListing
);
userRouter.post(
  "/marketplace/listings/:listingId/buy",
  validateRequest({ params: marketplaceListingParamsSchema }),
  controller.buyMarketplaceListing
);
userRouter.post(
  "/marketplace/listings/:listingId/cancel",
  validateRequest({ params: marketplaceListingParamsSchema }),
  controller.cancelMarketplaceListing
);
userRouter.get("/me", controller.me);
userRouter.patch("/me", validateRequest({ body: updateUserIdentitySchema }), controller.updateUserIdentity);
userRouter.patch(
  "/me/onboarding",
  validateRequest({ body: finalizeOnboardingSchema }),
  controller.finalizeOnboarding
);
userRouter.get("/me/profile", controller.profile);
userRouter.patch(
  "/me/character-class",
  validateRequest({ body: equipCharacterClassSchema }),
  controller.equipCharacterClass
);
userRouter.patch(
  "/me/cosmetic",
  validateRequest({ body: equipCosmeticSchema }),
  controller.equipCosmetic
);
userRouter.post(
  "/me/cosmetic/purchase",
  validateRequest({ body: purchaseCosmeticSchema }),
  controller.purchaseCosmetic
);
