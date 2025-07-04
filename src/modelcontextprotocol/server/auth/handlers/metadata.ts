import { Context } from "hono";
import { OAuthMetadata, OAuthProtectedResourceMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";

export function metadataHandler(metadata: OAuthMetadata | OAuthProtectedResourceMetadata) {
  return (c: Context) => {
    // CORS headers
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type");
    
    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }
    
    if (c.req.method === "GET") {
      return c.json(metadata, 200);
    }
    
    return c.text("Method not allowed", 405);
  };
}