import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import { Hono } from "hono";
import { logger } from 'hono/logger'
import { z } from "zod";
import { requireBearerAuth } from "./modelcontextprotocol/server/auth/middleware/auth";
import { OAuthMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import { metadataHandler } from "./modelcontextprotocol/server/auth/handlers/metadata";
import { createProtectedResourceMetadata } from "./metadata.js";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { DEFAULT_CONFIG, createAuth0Metadata } from "./config.js";

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
app.use(async (c, next) => {
  // リクエストヘッダーをログ出力
  const reqHeaders: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    reqHeaders[key] = value;
  });
  console.log('Request Headers:', JSON.stringify(reqHeaders, null, 2));

  // リクエストボディをログ出力
  const contentType = c.req.header('content-type');
  if (contentType && (contentType.includes('application/json') || contentType.includes('text/plain'))) {
    try {
      // bodyをバッファリングして再利用可能にする
      const arrayBuffer = await c.req.arrayBuffer();
      const bodyText = new TextDecoder().decode(arrayBuffer);
      console.log('Request Body:', bodyText);
      
      // 新しいRequestオブジェクトを作成してbodyを再度読めるようにする
      const newRequest = new Request(c.req.raw.url, {
        method: c.req.raw.method,
        headers: c.req.raw.headers,
        body: arrayBuffer,
      });
      c.req.raw = newRequest;
    } catch (e) {
      console.log('Request Body: (Unable to read body)');
    }
  }

  // レスポンスボディとヘッダーをキャプチャするために元のメソッドを拡張
  const originalJson = c.json.bind(c);
  const originalText = c.text.bind(c);
  const originalHtml = c.html.bind(c);

  // レスポンス作成時にヘッダーもログ出力
  const logResponseHeaders = () => {
    const resHeaders: Record<string, string> = {};
    c.res.headers.forEach((value, key) => {
      resHeaders[key] = value;
    });
    console.log('Response Headers:', JSON.stringify(resHeaders, null, 2));
  };

  c.json = (object: any, ...args: any[]) => {
    const result = originalJson(object, ...args);
    logResponseHeaders();
    console.log('Response Body (JSON):', JSON.stringify(object));
    return result;
  };

  c.text = (text: string, ...args: any[]) => {
    const result = originalText(text, ...args);
    logResponseHeaders();
    console.log('Response Body (Text):', text);
    return result;
  };

  c.html = (html: string, ...args: any[]) => {
    const result = originalHtml(html, ...args);
    logResponseHeaders();
    console.log('Response Body (HTML):', html.substring(0, 500) + (html.length > 500 ? '...' : ''));
    return result;
  };

  await next();
});

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
  return env.MCP_SERVER_URL || `${workerUrl}/mcp`;
};

const createTokenVerifier = (workerUrl: string, env: Env) => {
  const oauthMetadata = createOAuthMetadata(env);
  const JWKS = createRemoteJWKSet(new URL(oauthMetadata.jwks_uri as string));
  const audience = env.AUTH0_AUDIENCE || getResourceServerUrl(workerUrl, env);
  
  return {
  verifyAccessToken: async (token: string) => {
    try {
      // JWTの検証とデコード
      console.log("JWT検証開始:", {
        issuer: oauthMetadata.issuer,
        audience: audience,
        tokenPrefix: token.substring(0, 50) + "..."
      });
      
      const { payload } = await jwtVerify(token, JWKS, {
        // 発行者の検証
        issuer: oauthMetadata.issuer,
        // Audienceの検証（RFC 8707準拠）
        audience: audience,
      });
      
      console.log("JWT検証成功:", {
        sub: payload.sub,
        aud: payload.aud,
        iss: payload.iss,
        exp: payload.exp
      });

      // 必須クレームの確認
      if (!payload.sub) {
        throw new Error("Subject (sub) claim is missing");
      }

      // スコープの解析（Auth0では文字列として格納される）
      const scopes = typeof payload.scope === "string" 
        ? payload.scope.split(" ") 
        : [];

      // クライアントIDの取得（Auth0ではazpまたはclient_idクレーム）
      const clientId = (payload.azp || payload.client_id || payload.sub) as string;

      // 有効期限の取得（JWTのexpクレームから）
      const expiresAt = payload.exp ? payload.exp * 1000 : Date.now() + 3600000;

      return {
        token,
        clientId,
        scopes,
        expiresAt,
      };
    } catch (error) {
      // エラーメッセージを適切にフォーマット
      console.error("JWT検証エラー:", error);
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
      scopesSupported: [],
      resourceName: serverName,
      serviceDocumentationUrl: new URL(serverUrl),
    })
  )(c);
});

app.use("/mcp", async (c, next) => {
  const env = c.env;
  const workerUrl = env.WORKER_URL;
  const tokenVerifier = createTokenVerifier(workerUrl, env);
  console.log("hogeeeeeeeeeeeeeeeeeeeeee2");

  const bearerAuthMiddleware = requireBearerAuth({
    verifier: tokenVerifier,
    requiredScopes: ["mcp:tools"],
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
