import { Hono } from "hono";
import { cors } from "hono/cors";
import { OAuthMetadata, OAuthProtectedResourceMetadata } from "../../../shared/auth.js";

export function metadataHandler(metadata: OAuthMetadata | OAuthProtectedResourceMetadata) {
  const app = new Hono();

  // Configure CORS to allow any origin, to make accessible to web-based MCP clients
  app.use("*", cors());

  // GET endpoint only
  app.get("/", (c) => {
    return c.json(metadata, 200);
  });

  // Return 405 Method Not Allowed for other methods
  app.all("/", (c) => {
    return c.text("Method not allowed", 405);
  });

  return app;
}