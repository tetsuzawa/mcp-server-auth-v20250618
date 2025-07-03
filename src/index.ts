import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import { Hono } from "hono";
import { z } from "zod";
import { requireBearerAuth } from "./modelcontextprotocol/server/auth/middleware/auth";
import { OAuthMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import { metadataHandler } from "./modelcontextprotocol/server/auth/handlers/metadata";
import { createProtectedResourceMetadata } from "./metadata.js";

const app = new Hono();

// Your MCP server implementation
const mcpServer = new McpServer({
  name: "my-mcp-server",
  version: "1.0.0",
});
mcpServer.registerTool(
  "multiply",
  {
    description: "Multiply two numbers",
    inputSchema: { a: z.number(), b: z.number() },
  },
  async ({ a, b }) => ({
    content: [{ type: "text", text: String(a * b) }],
  })
);

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

// TODO: use auth0
// const oauthMetadata: OAuthMetadata = setupAuthServer();
const oauthMetadata: OAuthMetadata = {
  issuer: "https://localhost:3000",
  authorization_endpoint: "https://localhost:3000/authorize",
  token_endpoint: "https://localhost:3000/token",
  introspection_endpoint: "https://localhost:3000/introspect",
  revocation_endpoint: "https://localhost:3000/revoke",
  response_types_supported: ["code", "token"],
  scopes_supported: ["read", "write", "openid"],
  token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
  grant_types_supported: ["authorization_code", "client_credentials", "refresh_token"],
  code_challenge_methods_supported: ["S256", "plain"],
};

const tokenVerifier = {
  verifyAccessToken: async (token: string) => {
    // TODO: JWTの検証を行う

    // 以下の例はoauth2.0のintrospection endpointを使用した検証の例
    // const endpoint = oauthMetadata.introspection_endpoint;

    // if (!endpoint) {
    //   throw new Error('No token verification endpoint available in metadata');
    // }

    // const response = await fetch(endpoint, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/x-www-form-urlencoded',
    //   },
    //   body: new URLSearchParams({
    //     token: token
    //   }).toString()
    // });

    // if (!response.ok) {
    //   throw new Error(`Invalid or expired token: ${await response.text()}`);
    // }

    // const data = await response.json();

    // if (!data.aud) {
    //   throw new Error(`Resource Indicator (RFC8707) missing`);
    // }
    // if (!checkResourceAllowed({ requestedResource: data.aud, configuredResource: mcpServerUrl })) {
    //   throw new Error(`Expected resource indicator ${mcpServerUrl}, got: ${data.aud}`);
    // }

    // Convert the response to AuthInfo format

    // TODO: 本実装
    // これはハードコード
    return {
      token,
      clientId: "my-client-id",
      scopes: ["read", "write"],
      expiresAt: Date.now() + 1000 * 60 * 60 * 24,
    };
  },
};

app.route(
  "/.well-known/oauth-protected-resource",
  metadataHandler(
    createProtectedResourceMetadata({
      oauthMetadata,
      resourceServerUrl: new URL("http://localhost:3000/mcp"),
      scopesSupported: ["mcp:tools:multiply"],
      resourceName: "mcp-server",
      serviceDocumentationUrl: new URL("http://localhost:3000/mcp"),
    })
  )
);

app.use(
  "/mcp/*",
  requireBearerAuth({
    verifier: tokenVerifier,
    requiredScopes: ["mcp:tools"],
    resourceMetadataUrl:
      "http://localhost:3000/.well-known/oauth-protected-resource",
  })
);

app.all("/mcp", async (c) => {
  const transport = new StreamableHTTPTransport();
  await mcpServer.connect(transport);
  return transport.handleRequest(c);
});

export default app;
