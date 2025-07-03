export const DEFAULT_CONFIG = {
  // Auth0設定
  AUTH0_ISSUER_URL: "https://dev-g7d6jxky7ire758q.us.auth0.com",
  AUTH0_AUDIENCE: "http://localhost:3000/mcp",
  
  // MCP サーバー設定
  MCP_SERVER_URL: "http://localhost:3000/mcp",
  MCP_SERVER_NAME: "mcp-server",
} as const;

// Auth0 OAuth メタデータ
export const createAuth0Metadata = (issuerUrl: string) => ({
  issuer: `${issuerUrl}/`,
  authorization_endpoint: `${issuerUrl}/authorize`,
  token_endpoint: `${issuerUrl}/oauth/token`,
  device_authorization_endpoint: `${issuerUrl}/oauth/device/code`,
  userinfo_endpoint: `${issuerUrl}/userinfo`,
  mfa_challenge_endpoint: `${issuerUrl}/mfa/challenge`,
  jwks_uri: `${issuerUrl}/.well-known/jwks.json`,
  registration_endpoint: `${issuerUrl}/oidc/register`,
  revocation_endpoint: `${issuerUrl}/oauth/revoke`,
  response_types_supported: ["code", "token"],
  scopes_supported: ["openid", "profile", "offline_access", "name", "given_name", "family_name", "nickname", "email", "email_verified", "picture", "created_at", "identities", "phone", "address"],
  response_modes_supported: ["query", "fragment", "form_post"],
  subject_types_supported: ["public"],
  token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "private_key_jwt"],
  grant_types_supported: ["authorization_code"],
  code_challenge_methods_supported: ["S256", "plain"],
  id_token_signing_alg_values_supported: ["RS256", "RS384", "PS256"],
  token_endpoint_auth_signing_alg_values_supported: ["RS256", "RS384", "PS256"],
  claims_supported: ["aud", "auth_time", "created_at", "email", "email_verified", "exp", "family_name", "given_name", "iat", "identities", "iss", "name", "nickname", "phone_number", "picture", "sub"],
  request_uri_parameter_supported: false,
  request_parameter_supported: false,
  end_session_endpoint: `${issuerUrl}/oidc/logout`,
});