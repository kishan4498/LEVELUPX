import type { RequestHandler } from "express";

import type { AuthRequest } from "../../common/types/auth.types.js";
import type { UserService } from "./user.service.js";
import type { ListingQuery } from "./user.types.js";

export class UserController {
  constructor(private readonly service: UserService) {}

  me: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const user = await this.service.getMe(auth.user!.id);
      return res.json({ success: true, data: { user } });
    } catch (error) {
      return next(error);
    }
  };

  updateUserIdentity: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const user = await this.service.updateUserIdentity(auth.user!.id, req.body);
      return res.json({ success: true, data: { user } });
    } catch (error) {
      return next(error);
    }
  };

  finalizeOnboarding: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const user = await this.service.finalizeOnboarding(auth.user!.id, req.body);
      return res.json({ success: true, data: { user } });
    } catch (error) {
      return next(error);
    }
  };

  profile: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const profile = await this.service.getProfile(auth.user!.id);
      return res.json({ success: true, data: { profile } });
    } catch (error) {
      return next(error);
    }
  };

  characterClasses: RequestHandler = async (_req, res, next) => {
    try {
      const characterClasses = await this.service.listCharacterClasses();
      return res.json({ success: true, data: { characterClasses } });
    } catch (error) {
      return next(error);
    }
  };

  skills: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const skills = await this.service.listSkills(auth.user!.id);
      return res.json({ success: true, data: { skills } });
    } catch (error) {
      return next(error);
    }
  };

  cosmetics: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const cosmetics = await this.service.listCosmetics(auth.user!.id);
      return res.json({ success: true, data: { cosmetics } });
    } catch (error) {
      return next(error);
    }
  };

  equipCharacterClass: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const profile = await this.service.equipCharacterClass(auth.user!.id, req.body);
      return res.json({ success: true, data: { profile } });
    } catch (error) {
      return next(error);
    }
  };

  equipCosmetic: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const profile = await this.service.equipCosmetic(auth.user!.id, req.body);
      return res.json({ success: true, data: { profile } });
    } catch (error) {
      return next(error);
    }
  };

  purchaseCosmetic: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const profile = await this.service.purchaseCosmetic(auth.user!.id, req.body);
      return res.json({ success: true, data: { profile } });
    } catch (error) {
      return next(error);
    }
  };

  marketplaceListings: RequestHandler = async (req, res, next) => {
    try {
      const listings = await this.service.listMarketplaceListings(req.query as ListingQuery);
      return res.json({ success: true, data: { listings } });
    } catch (error) {
      return next(error);
    }
  };

  createMarketplaceListing: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const listing = await this.service.createMarketplaceListing(auth.user!.id, req.body);
      return res.status(201).json({ success: true, data: { listing } });
    } catch (error) {
      return next(error);
    }
  };

  cancelMarketplaceListing: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const listingId = String(req.params.listingId);
      const listing = await this.service.cancelMarketplaceListing(auth.user!.id, listingId);
      return res.json({ success: true, data: { listing } });
    } catch (error) {
      return next(error);
    }
  };

  buyMarketplaceListing: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const listingId = String(req.params.listingId);
      const purchase = await this.service.buyMarketplaceListing(auth.user!.id, listingId);
      return res.json({ success: true, data: purchase });
    } catch (error) {
      return next(error);
    }
  };
}
