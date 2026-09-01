import { createServer } from "node:http";

import { createApp } from "./app.js";
import { initializeErrorTracking } from "./common/monitoring/errorTracking.js";
import { env } from "./config/env.js";
import { createRealtimeServer } from "./realtime/realtime.server.js";

initializeErrorTracking();

const app = createApp();
const server = createServer(app);

createRealtimeServer(server);

server.listen(env.PORT, () => {
  console.log(`LevelUpX API is running on port ${env.PORT}`);
});
