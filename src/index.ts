import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { z } from "zod";
import { requireBearerAuth } from "./modelcontextprotocol/server/auth/middleware/auth";
import { OAuthMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import { metadataHandler } from "./modelcontextprotocol/server/auth/handlers/metadata";
import { createProtectedResourceMetadata } from "./metadata.js";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { DEFAULT_CONFIG, createAuth0Metadata } from "./config.js";
import { logRequestAndResponseMiddleware } from "./middleware";

type Env = {
  WORKER_URL: string;
  AUTH0_ISSUER_URL?: string;
  AUTH0_AUDIENCE?: string;
  MCP_SERVER_URL?: string;
  MCP_SERVER_NAME?: string;
};

const app = new Hono<{ Bindings: Env }>();
app.use(logger());

// カスタムロギングミドルウェア
app.use(logRequestAndResponseMiddleware);

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

// Auth0メタデータを動的に作成
const createOAuthMetadata = (env: Env): OAuthMetadata => {
  const issuerUrl = env.AUTH0_ISSUER_URL || DEFAULT_CONFIG.AUTH0_ISSUER_URL;
  return createAuth0Metadata(issuerUrl);
};

// リソースサーバーの識別子（audienceとして使用）
const getResourceServerUrl = (workerUrl: string, env: Env) => {
  // return env.MCP_SERVER_URL || `${workerUrl}/mcp`;
  return env.MCP_SERVER_URL || `${workerUrl}`;
};

const createTokenVerifier = (workerUrl: string, env: Env) => {
  const oauthMetadata = createOAuthMetadata(env);
  const JWKS = createRemoteJWKSet(new URL(oauthMetadata.jwks_uri as string));
  const audience = env.AUTH0_AUDIENCE || getResourceServerUrl(workerUrl, env);

  // UserInfoエンドポイントを使用したopaque token検証
  const verifyOpaqueToken = async (token: string) => {
    const userInfoEndpoint = oauthMetadata.userinfo_endpoint;
    if (!userInfoEndpoint) {
      throw new Error("UserInfo endpoint not found in OAuth metadata");
    }

    try {
      const response = await fetch(userInfoEndpoint as string, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Invalid or expired token");
        }
        throw new Error(`UserInfo request failed: ${response.statusText}`);
      }

      const userInfo = await response.json();

      // 必須フィールドの確認
      if (!userInfo.sub) {
        throw new Error("Subject (sub) field is missing in UserInfo");
      }

      // opaque tokenの場合、UserInfoからの情報を使用
      // 注意: Auth0では、audienceパラメータなしで取得したトークンはopaque tokenになる
      // JWT形式のアクセストークンを取得するには、認証時にaudienceパラメータを指定する必要がある

      return {
        token,
        clientId: userInfo.sub,
        scopes: ["openid"], // UserInfoへのアクセスができたのでopenidスコープは確実
        expiresAt: Date.now() + 3600000, // デフォルトで1時間
        // UserInfoから取得可能な情報のみを提供
        extra: {
          sub: userInfo.sub || "",
          // UserInfoから取得した情報
          email: userInfo.email || "",
          email_verified: userInfo.email_verified || "",
          name: userInfo.name || "",
          picture: userInfo.picture || "",
          nickname: userInfo.nickname || "",
          updated_at: userInfo.updated_at || "",
        },
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("Failed to verify opaque token");
    }
  };

  // JWT検証
  const verifyJWT = async (token: string) => {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: oauthMetadata.issuer,
      audience: audience,
      algorithms: ["RS256"],
    });

    if (!payload.sub) {
      throw new Error("Subject (sub) claim is missing");
    }

    const scopes =
      typeof payload.scope === "string" ? payload.scope.split(" ") : [];

    // openidスコープの確認
    if (!scopes.includes("openid")) {
      throw new Error("Token is missing required 'openid' scope");
    }

    const clientId = (payload.azp ||
      payload.client_id ||
      payload.sub) as string;

    const expiresAt = payload.exp ? payload.exp * 1000 : Date.now() + 3600000;

    return {
      token,
      clientId,
      scopes,
      expiresAt,
      // JWT形式の場合も追加のクレーム情報を提供
      extra: {
        sub: payload.sub,
        aud: payload.aud,
        iat: payload.iat,
        exp: payload.exp,
        iss: payload.iss,
        azp: payload.azp,
        scope: payload.scope,
      },
    };
  };

  return {
    verifyAccessToken: async (token: string) => {
      try {
        // トークンの形式を確認
        const tokenParts = token.split(".");
        const isJWT = tokenParts.length === 3;

        if (isJWT) {
          // JWTの場合
          console.log("JWT token detected");
          try {
            return await verifyJWT(token);
          } catch (jwtError) {
            // JWT検証が失敗した場合、opaque tokenとして検証を試みる
            return await verifyOpaqueToken(token);
          }
        } else {
          console.log("opaque token detected");
          // JWT形式でない場合はopaque tokenとして扱う
          return await verifyOpaqueToken(token);
        }
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Invalid or expired token: ${error.message}`);
        }
        throw new Error("Invalid or expired token");
      }
    },
  };
};

app.get("/.well-known/oauth-protected-resource", (c) => {
  const env = c.env;
  const workerUrl = env.WORKER_URL;
  const oauthMetadata = createOAuthMetadata(env);
  const serverUrl = getResourceServerUrl(workerUrl, env);
  const serverName = env.MCP_SERVER_NAME || DEFAULT_CONFIG.MCP_SERVER_NAME;

  return metadataHandler(
    createProtectedResourceMetadata({
      oauthMetadata,
      resourceServerUrl: new URL(serverUrl),
      // scopesSupported: ["mcp:tools"],
      scopesSupported: ["openid"],
      resourceName: serverName,
      serviceDocumentationUrl: new URL(serverUrl),
    })
  )(c);
});

app.use("/mcp", async (c, next) => {
  const env = c.env;
  const workerUrl = env.WORKER_URL;
  const tokenVerifier = createTokenVerifier(workerUrl, env);

  const bearerAuthMiddleware = requireBearerAuth({
    verifier: tokenVerifier,
    requiredScopes: ["openid"],
    resourceMetadataUrl: `${workerUrl}/.well-known/oauth-protected-resource`,
  });

  return await bearerAuthMiddleware(c, next);
});

app.all("/mcp", async (c) => {
  const transport = new StreamableHTTPTransport();
  await mcpServer.connect(transport);
  return transport.handleRequest(c);
});

export default app;
