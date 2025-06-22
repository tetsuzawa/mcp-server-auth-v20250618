import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import { Hono } from "hono";
import { z } from "zod";
import { requireBearerAuth } from "./server/auth/middleware/auth";
import { OAuthMetadata, OAuthProtectedResourceMetadata } from "./shared/auth";
import { setupAuthServer } from "./server/auth/authServer";
import { metadataHandler } from "./server/auth/handlers/metadata";

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
const oauthMetadata: OAuthMetadata = setupAuthServer();

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

// const checkIssuerUrl = (issuer: URL): void => {
//   // Technically RFC 8414 does not permit a localhost HTTPS exemption, but this will be necessary for ease of testing
//   if (
//     issuer.protocol !== "https:" &&
//     issuer.hostname !== "localhost" &&
//     issuer.hostname !== "127.0.0.1"
//   ) {
//     throw new Error("Issuer URL must be HTTPS");
//   }
//   if (issuer.hash) {
//     throw new Error(`Issuer URL must not have a fragment: ${issuer}`);
//   }
//   if (issuer.search) {
//     throw new Error(`Issuer URL must not have a query string: ${issuer}`);
//   }
// };

export function createProtectedResourceMetadata(
  options: AuthMetadataOptions
): OAuthProtectedResourceMetadata {
  // checkIssuerUrl(new URL(options.oauthMetadata.issuer));
  return {
    resource: options.resourceServerUrl.href,

    authorization_servers: [options.oauthMetadata.issuer],

    scopes_supported: options.scopesSupported,
    resource_name: options.resourceName,
    resource_documentation: options.serviceDocumentationUrl?.href,
  };
}
export type AuthMetadataOptions = {
  /**
   * OAuth Metadata as would be returned from the authorization server
   * this MCP server relies on
   */
  oauthMetadata: OAuthMetadata;

  /**
   * The url of the MCP server, for use in protected resource metadata
   */
  resourceServerUrl: URL;

  /**
   * The url for documentation for the MCP server
   */
  serviceDocumentationUrl?: URL;

  /**
   * An optional list of scopes supported by this MCP server
   */
  scopesSupported?: string[];

  /**
   * An optional resource name to display in resource metadata
   */
  resourceName?: string;
};
