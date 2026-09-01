import { resolveHostedSchedulerPlan } from "./hostedScheduler.js";
import { registeredJobs } from "./registry.js";

const plan = resolveHostedSchedulerPlan(process.env, registeredJobs);

console.log(JSON.stringify(plan, null, 2));
