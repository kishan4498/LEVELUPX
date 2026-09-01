import { z } from "zod";

export const adminTrustedDeviceParamsSchema = z.object({
  id: z.string().uuid()
});
