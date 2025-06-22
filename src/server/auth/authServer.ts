import { OAuthMetadata } from "../../shared/auth";

export const setupAuthServer = ():OAuthMetadata => {
    //todo use auth0
    return {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
        introspection_endpoint: 'https://auth.example.com/introspect',
        response_types_supported: ['code', 'token', 'id_token', 'code id_token'],
    }
}