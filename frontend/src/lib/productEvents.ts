import { apiRequest } from "./api";

export type ProductEventName =
  | "onboarding_started"
  | "onboarding_completed"
  | "quest_created"
  | "quest_completed"
  | "focus_started"
  | "focus_completed"
  | "insight_actioned"
  | "custom_reward_redeemed"
  | "offline_action_queued"
  | "offline_action_synced"
  | "accountability_connected";

export function trackProductEvent(
  name: ProductEventName,
  properties?: Record<string, string | number | boolean | null>
) {
  // Product analytics must never block the action the user actually came to do.
  return apiRequest("/product-events", {
    method: "POST",
    body: JSON.stringify({ name, properties })
  }).catch(() => undefined);
}
