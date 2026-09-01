import { z } from "zod";

import { productEventNames } from "./productEvent.types.js";

const eventPropertyValue = z.union([z.string().max(120), z.number().finite(), z.boolean(), z.null()]);

export const createProductEventSchema = z.object({
  name: z.enum(productEventNames),
  properties: z
    .record(z.string().trim().min(1).max(40), eventPropertyValue)
    .refine((properties) => Object.keys(properties).length <= 20, "At most 20 event properties are allowed")
    .optional()
});
