import { createRemoteJWKSet, jwtVerify, decodeJwt, decodeProtectedHeader } from 'jose';
import type { JWTPayload, JWTHeaderParameters } from 'jose';

interface Auth0Config {
  domain: string;
  audience?: string;
}

interface DecodedToken {
  header: JWTHeaderParameters;
  payload: JWTPayload;
}

export class Auth0JWTDecoder {
  private JWKS: ReturnType<typeof createRemoteJWKSet>;
  private domain: string;
  private audience?: string;
  private issuer: string;

  constructor(config: Auth0Config) {
    this.domain = config.domain;
    this.audience = config.audience;
    this.issuer = `https://${config.domain}/`;
    this.JWKS = createRemoteJWKSet(new URL(`https://${config.domain}/.well-known/jwks.json`));
  }

  /**
   * JWTトークンをデコード（検証なし）
   */
  decode(token: string): DecodedToken {
    try {
      const payload = decodeJwt(token);
      const header = decodeProtectedHeader(token);
      return { header, payload };
    } catch (error) {
      throw new Error('Invalid token: Unable to decode');
    }
  }

  /**
   * JWTトークンを検証してデコード
   */
  async verify(token: string): Promise<JWTPayload> {
    try {
      const verifyOptions: any = {
        issuer: this.issuer,
        algorithms: ['RS256'],
      };

      if (this.audience) {
        verifyOptions.audience = this.audience;
      }

      const { payload } = await jwtVerify(token, this.JWKS, verifyOptions);
      return payload;
    } catch (error) {
      throw new Error(`JWT verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * トークンの有効期限をチェック
   */
  isExpired(token: string): boolean {
    try {
      const { payload } = this.decode(token);
      if (!payload.exp) {
        return true;
      }
      return Date.now() >= payload.exp * 1000;
    } catch {
      return true;
    }
  }

  /**
   * トークンからクレームを取得
   */
  getClaims(token: string): JWTPayload | null {
    try {
      const { payload } = this.decode(token);
      return payload;
    } catch {
      return null;
    }
  }

  /**
   * 特定のクレームを取得
   */
  getClaim(token: string, claim: string): unknown {
    const claims = this.getClaims(token);
    return claims ? claims[claim] : undefined;
  }

  /**
   * Auth0のカスタムクレームを取得（名前空間付き）
   */
  getCustomClaims(token: string, namespace?: string): Record<string, unknown> {
    const claims = this.getClaims(token);
    if (!claims) return {};

    const customClaims: Record<string, unknown> = {};
    const prefix = namespace || 'https://';

    Object.keys(claims).forEach(key => {
      if (key.startsWith(prefix)) {
        customClaims[key] = claims[key];
      }
    });

    return customClaims;
  }
}

// 使用例
if (require.main === module) {
  // コマンドライン引数からトークンを取得
  const token = process.argv[2];
  const domain = process.env.AUTH0_DOMAIN || 'your-domain.auth0.com';
  const audience = process.env.AUTH0_AUDIENCE;

  if (!token) {
    console.error('Usage: ts-node jwt-decoder.ts <JWT_TOKEN>');
    process.exit(1);
  }

  const decoder = new Auth0JWTDecoder({ domain, audience });

  console.log('=== JWT Decode (without verification) ===');
  try {
    const decoded = decoder.decode(token);
    console.log('Header:', JSON.stringify(decoded.header, null, 2));
    console.log('Payload:', JSON.stringify(decoded.payload, null, 2));
    console.log('Expired:', decoder.isExpired(token));
    
    // カスタムクレームの表示
    const customClaims = decoder.getCustomClaims(token);
    if (Object.keys(customClaims).length > 0) {
      console.log('Custom Claims:', JSON.stringify(customClaims, null, 2));
    }
  } catch (error) {
    console.error('Decode error:', error);
  }

  console.log('\n=== JWT Verify (with verification) ===');
  decoder.verify(token)
    .then(payload => {
      console.log('Verified payload:', JSON.stringify(payload, null, 2));
    })
    .catch(error => {
      console.error('Verification error:', error);
    });
}