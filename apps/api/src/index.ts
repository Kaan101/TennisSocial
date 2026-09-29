import { createApp } from "./app";
import { config } from "./config";

const app = await createApp();
await app.listen({ port: config.port, host: "0.0.0.0" });
