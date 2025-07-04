import { createRemoteJWKSet, jwtVerify, decodeJwt, decodeProtectedHeader } from 'jose';
import type { JWTPayload, ProtectedHeaderParameters } from 'jose';

interface Auth0Config {
  domain: string;
  audience?: string;
}

interface DecodedToken {
  header: ProtectedHeaderParameters;
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