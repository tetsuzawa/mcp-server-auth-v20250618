import { OAuthMetadata, OAuthProtectedResourceMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";

const checkIssuerUrl = (issuer: URL): void => {
  // Technically RFC 8414 does not permit a localhost HTTPS exemption, but this will be necessary for ease of testing
  if (
    issuer.protocol !== "https:" &&
    issuer.hostname !== "localhost" &&
    issuer.hostname !== "127.0.0.1"
  ) {
    throw new Error("Issuer URL must be HTTPS");
  }
  if (issuer.hash) {
    throw new Error(`Issuer URL must not have a fragment: ${issuer}`);
  }
  if (issuer.search) {
    throw new Error(`Issuer URL must not have a query string: ${issuer}`);
  }
};

export function createProtectedResourceMetadata(
  options: AuthMetadataOptions
): OAuthProtectedResourceMetadata {
  checkIssuerUrl(new URL(options.oauthMetadata.issuer));
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