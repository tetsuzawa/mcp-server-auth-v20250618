import { Context, MiddlewareHandler } from "hono";
import { InsufficientScopeError, InvalidTokenError, OAuthError, ServerError } from "../error";
import { OAuthTokenVerifier } from "../provider";
import { AuthInfo } from "../types";

export type BearerAuthMiddlewareOptions = {
  /**
   * A provider used to verify tokens.
   */
  verifier: OAuthTokenVerifier;

  /**
   * Optional scopes that the token must have.
   */
  requiredScopes?: string[];

  /**
   * Optional resource metadata URL to include in WWW-Authenticate header.
   */
  resourceMetadataUrl?: string;
};

declare module "hono" {
  interface ContextVariableMap {
    /**
     * Information about the validated access token, if the `requireBearerAuth` middleware was used.
     */
    auth?: AuthInfo;
  }
}

/**
 * Middleware that requires a valid Bearer token in the Authorization header.
 *
 * This will validate the token with the auth provider and add the resulting auth info to the context.
 *
 * If resourceMetadataUrl is provided, it will be included in the WWW-Authenticate header
 * for 401 responses as per the OAuth 2.0 Protected Resource Metadata spec.
 */
export function requireBearerAuth({ verifier, requiredScopes = [], resourceMetadataUrl }: BearerAuthMiddlewareOptions): MiddlewareHandler {
  return async (c: Context, next) => {
    try {
      const authHeader = c.req.header("authorization");
      if (!authHeader) {
        throw new InvalidTokenError("Missing Authorization header");
      }

      const [type, token] = authHeader.split(' ');
      if (type.toLowerCase() !== 'bearer' || !token) {
        throw new InvalidTokenError("Invalid Authorization header format, expected 'Bearer TOKEN'");
      }

      const authInfo = await verifier.verifyAccessToken(token);

      // Check if token has the required scopes (if any)
      if (requiredScopes.length > 0) {
        const hasAllScopes = requiredScopes.every(scope =>
          authInfo.scopes.includes(scope)
        );

        if (!hasAllScopes) {
          throw new InsufficientScopeError("Insufficient scope");
        }
      }

      // Check if the token is expired
      if (!!authInfo.expiresAt && authInfo.expiresAt < Date.now() / 1000) {
        throw new InvalidTokenError("Token has expired");
      }

      c.set("auth", authInfo);
      await next();
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        const wwwAuthValue = resourceMetadataUrl
          ? `Bearer error="${error.errorCode}", error_description="${error.message}", resource_metadata="${resourceMetadataUrl}"`
          : `Bearer error="${error.errorCode}", error_description="${error.message}"`;
        c.header("WWW-Authenticate", wwwAuthValue);
        return c.json(error.toResponseObject(), 401);
      } else if (error instanceof InsufficientScopeError) {
        const wwwAuthValue = resourceMetadataUrl
          ? `Bearer error="${error.errorCode}", error_description="${error.message}", resource_metadata="${resourceMetadataUrl}"`
          : `Bearer error="${error.errorCode}", error_description="${error.message}"`;
        c.header("WWW-Authenticate", wwwAuthValue);
        return c.json(error.toResponseObject(), 403);
      } else if (error instanceof ServerError) {
        return c.json(error.toResponseObject(), 500);
      } else if (error instanceof OAuthError) {
        return c.json(error.toResponseObject(), 400);
      } else {
        const serverError = new ServerError("Internal Server Error");
        return c.json(serverError.toResponseObject(), 500);
      }
    }
  };
}