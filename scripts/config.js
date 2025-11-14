/**
 * Client-Side Configuration
 *
 * Configuration for browser-based OAuth flow and API endpoints.
 * Contains OAuth client settings, IAM endpoints, and session parameters.
 *
 * @module config
 */

// eslint-disable-next-line import/prefer-default-export,consistent-return
export async function forgeRockConfig() {
  try {
    const response = await fetch(`${window.hlx.codeBasePath}/forgerock-config.json`);
    const data = await response.json();
    const configValues = data.data[0];
    const { origin } = window.location;
    const env = {
      dev: 'https://publish-p138853-e1404402.adobeaemcloud.com/',
      stage: 'https://publish-p138853-e1404403.adobeaemcloud.com/',
      prod: 'https://publish-p138853-e1404355.adobeaemcloud.com/',
    };

    const config = {
      app: {
        // Application base URL (must match OAuth redirect URI origin)
        baseUrl: origin,
        environment: env[data.environment?.toLowerCase()] || env.dev
      },
      iam: {
        // OAuth 2.0 Client Configuration
        clientId: configValues.clientId, // Public client ID
        scopes: ['openid', 'profile', 'email', 'attribute:agent_ids.read'],
        redirectUri: `${origin}/callback`,

        // IAM Endpoints
        baseUrl: configValues.baseUrl,
        authorizationEndpoint: `/api/openid/oauth/v3/${configValues.brand}/authorize`,
        tokenEndpoint: `/api/openid/oauth/v3/${configValues.brand}/access_token`,
        sessionEndpoint: `/api/openid/oauth/v3/${configValues.brand}/sessions`,

        // Session Management
        sessionCheckInterval: configValues.sessionCheckInterval, // Check session every 2 minutes
        timeout: configValues.timeout // 10 second timeout for silent auth
      }
    };
    return config;
  } catch (error) {
    console.error('Error loading ForgeRock Config:', error);
  }
}
