import { Context } from "hono";

export const logRequestAndResponseMiddleware = async (c: Context, next: () => Promise<void>) => {
    // リクエストヘッダーをログ出力
    const reqHeaders: Record<string, string> = {};
    c.req.raw.headers.forEach((value, key) => {
      reqHeaders[key] = value;
    });
    console.log("Request Headers:", JSON.stringify(reqHeaders, null, 2));
  
    // Authorizationヘッダーの詳細解析
    const authHeader = c.req.header("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const tokenParts = token.split(".");
      console.log("Token Analysis:", {
        parts: tokenParts.length,
        isJWS: tokenParts.length === 3,
        isJWE: tokenParts.length === 5,
        header: tokenParts[0] ? JSON.parse(atob(tokenParts[0])) : null
      });
    }
  
    // リクエストボディをログ出力
    const contentType = c.req.header("content-type");
    if (
      contentType &&
      (contentType.includes("application/json") ||
        contentType.includes("text/plain"))
    ) {
      try {
        // bodyをバッファリングして再利用可能にする
        const arrayBuffer = await c.req.arrayBuffer();
        const bodyText = new TextDecoder().decode(arrayBuffer);
        console.log("Request Body:", bodyText);
  
        // 新しいRequestオブジェクトを作成してbodyを再度読めるようにする
        const newRequest = new Request(c.req.raw.url, {
          method: c.req.raw.method,
          headers: c.req.raw.headers,
          body: arrayBuffer,
        });
        c.req.raw = newRequest;
      } catch (e) {
        console.log("Request Body: (Unable to read body)");
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
      console.log("Response Headers:", JSON.stringify(resHeaders, null, 2));
    };
  
    c.json = (object: any, ...args: any[]) => {
      const result = originalJson(object, ...args);
      logResponseHeaders();
      console.log("Response Body (JSON):", JSON.stringify(object));
      return result;
    };
  
    c.text = (text: string, ...args: any[]) => {
      const result = originalText(text, ...args);
      logResponseHeaders();
      console.log("Response Body (Text):", text);
      return result;
    };
  
    c.html = (html: string, ...args: any[]) => {
      const result = originalHtml(html, ...args);
      logResponseHeaders();
      console.log(
        "Response Body (HTML):",
        html.substring(0, 500) + (html.length > 500 ? "..." : "")
      );
      return result;
    };
  
    await next();
  }