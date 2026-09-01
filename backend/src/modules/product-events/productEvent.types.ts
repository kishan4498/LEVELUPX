export const productEventNames = [
  "onboarding_started",
  "onboarding_completed",
  "quest_created",
  "quest_completed",
  "focus_started",
  "focus_completed",
  "insight_actioned",
  "custom_reward_redeemed",
  "offline_action_queued",
  "offline_action_synced",
  "accountability_connected"
] as const;

export type ProductEventName = (typeof productEventNames)[number];
export type ProductEventProperties = Record<string, string | number | boolean | null>;

export type CreateProductEventInput = {
  name: ProductEventName;
  properties?: ProductEventProperties;
};

export type ProductFunnelStepDto = {
  name: ProductEventName;
  events: number;
  uniqueUsers: number;
  conversionFromPrevious: number | null;
};

export type ProductFunnelDto = {
  from: string;
  to: string;
  steps: ProductFunnelStepDto[];
};
