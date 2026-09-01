import type { Prisma } from "@prisma/client";

import { prisma } from "../../prisma/client.js";
import type { CreateProductEventInput, ProductEventName } from "./productEvent.types.js";

export type ProductEventAggregate = {
  name: ProductEventName;
  events: number;
  uniqueUsers: number;
};

export interface IProductEventRepository {
  create(userId: string, event: CreateProductEventInput): Promise<void>;
  aggregate(names: ProductEventName[], from: Date, to: Date): Promise<ProductEventAggregate[]>;
}

export class PrismaProductEventRepository implements IProductEventRepository {
  async create(userId: string, event: CreateProductEventInput) {
    await prisma.productEvent.create({
      data: {
        userId,
        name: event.name,
        properties: event.properties as Prisma.InputJsonValue | undefined
      }
    });
  }

  async aggregate(names: ProductEventName[], from: Date, to: Date): Promise<ProductEventAggregate[]> {
    const activity = await prisma.productEvent.findMany({
      where: {
        name: { in: [...names] },
        occurredAt: { gte: from, lte: to }
      },
      select: { name: true, userId: true }
    });

    return names.map((name) => {
      const events = activity.filter((event) => event.name === name);
      return {
        name,
        events: events.length,
        uniqueUsers: new Set(events.flatMap((event) => (event.userId ? [event.userId] : []))).size
      };
    });
  }
}
