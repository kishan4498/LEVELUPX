import type { IProductEventRepository } from "./productEvent.repository.js";
import type { CreateProductEventInput, ProductFunnelDto, ProductEventName } from "./productEvent.types.js";

const funnelSteps: ProductEventName[] = [
  "onboarding_started",
  "onboarding_completed",
  "quest_created",
  "quest_completed",
  "focus_completed"
];

export class ProductEventService {
  constructor(
    private readonly repo: IProductEventRepository,
    private readonly now: () => Date = () => new Date()
  ) {}

  async record(userId: string, event: CreateProductEventInput): Promise<void> {
    await this.repo.create(userId, event);
  }

  async funnel(): Promise<ProductFunnelDto> {
    const to = this.now();
    const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const stats = await this.repo.aggregate(funnelSteps, from, to);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      steps: stats.map((step, index) => {
        const previous = stats[index - 1];
        return {
          ...step,
          conversionFromPrevious:
            !previous || previous.uniqueUsers === 0
              ? null
              : Math.round((step.uniqueUsers / previous.uniqueUsers) * 1000) / 10
        };
      })
    };
  }
}
