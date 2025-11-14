/**
 * OAuth 2.0 with PKCE Implementation
 *
 * Implements the OAuth 2.0 authorization code flow with PKCE (Proof Key for Code Exchange)
 * for secure authentication. Supports both silent authentication via iframe and
 * full-page redirects when interaction is required.
 *
 * PKCE Flow:
 * 1. Generate random code_verifier (64 chars)
 * 2. Create code_challenge from SHA-256 hash of verifier
 * 3. Send challenge with authorization request
 * 4. Exchange code + verifier for access token
 *
 * @module oauth
 */

import { forgeRockConfig } from './config.js';

const config = await forgeRockConfig();
/**
 * Generates a cryptographically secure random string for PKCE
 *
 * @param {number} length - Length of the random string
 * @returns {string} Base64url-encoded random string
 */
function generateRandomString(length) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._';
    return Array.from(array, byte => chars[byte % chars.length]).join('');
}

/**
 * Generates a code challenge from a verifier using SHA-256
 *
 * @param {string} verifier - The code verifier string
 * @returns {Promise<string>} Base64url-encoded SHA-256 hash of the verifier
 */
async function generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    // Convert to base64url format (RFC 7636)
    const base64 = btoa(String.fromCharCode(...new Uint8Array(hash)));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Generates PKCE parameters and stores them in sessionStorage
 * The state parameter is used as the key to prevent CSRF attacks
 *
 * @returns {Promise<{state: string, verifier: string, challenge: string}>} PKCE parameters
 */
async function generateAndStorePKCE() {
    const state = generateRandomString(32);
    const verifier = generateRandomString(64);
    const challenge = await generateCodeChallenge(verifier);

    // Store verifier and challenge keyed by state for later retrieval
    sessionStorage.setItem(state, JSON.stringify({ verifier, challenge }));

    return { state, verifier, challenge };
}

/**
 * Builds the OAuth authorization URL with all required parameters
 *
 * @param {string} state - CSRF protection state parameter
 * @param {string} challenge - PKCE code challenge
 * @param {string} [prompt] - Optional prompt parameter ('none' for silent auth)
 * @returns {string} Complete authorization URL
 */
function buildAuthUrl(state, challenge, prompt) {
    const authUrl = config.iam.baseUrl + config.iam.authorizationEndpoint;
    const params = new URLSearchParams({
        client_id: config.iam.clientId,
        redirect_uri: config.iam.redirectUri,
        response_type: 'code',
        scope: config.iam.scopes.join(' '),
        state: state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
    });

    // Add prompt parameter if specified (e.g., 'none' for silent authentication)
    if (prompt) {
        params.set('prompt', prompt);
    }

    return authUrl + '?' + params.toString();
}

/**
 * Exchanges an authorization code for an access token
 *
 * @param {string} code - Authorization code from OAuth provider
 * @param {string} verifier - PKCE code verifier
 * @returns {Promise<string>} Access token
 * @throws {Error} If token exchange fails
 */
async function exchangeCodeForToken(code, verifier) {
    const tokenUrl = config.iam.baseUrl + config.iam.tokenEndpoint;
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.iam.clientId,
        code: code,
        redirect_uri: config.iam.redirectUri,
        code_verifier: verifier
    });

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
    });

    if (!response.ok) {
        throw new Error('Token exchange failed: ' + response.statusText);
    }

    const data = await response.json();
    return data.access_token;
}

/**
 * Attempts to obtain an access token silently using a hidden iframe
 * This works if the user has an active session with the identity provider
 *
 * @returns {Promise<string>} Access token if successful
 * @throws {Error} 'interaction_required' if user must authenticate interactively
 */
async function getAccessTokenSilently() {
    const { state, challenge } = await generateAndStorePKCE();
    const authUrl = buildAuthUrl(state, challenge, 'none');

    return new Promise((resolve, reject) => {
        // Create hidden iframe for silent authentication
        const iframe = document.createElement('iframe');
        iframe.src = authUrl;
        iframe.style.display = 'none';
        document.body.appendChild(iframe);

        // Set timeout to prevent hanging
        const timeout = setTimeout(() => {
            document.body.removeChild(iframe);
            reject(new Error('interaction_required'));
        }, config.iam.timeout); // 10 seconds timeout

        // Listen for postMessage from callback page
        const messageHandler = (event) => {
            // SECURITY: Validate message origin to prevent message injection attacks
            const expectedOrigin = new URL(config.iam.redirectUri).origin;
            if (event.origin !== expectedOrigin) {
                console.warn('Rejected postMessage from unexpected origin:', event.origin, 'Expected:', expectedOrigin);
                return;
            }

            if (event.data.type === 'oauthCallback') {
                clearTimeout(timeout);
                document.body.removeChild(iframe);
                window.removeEventListener('message', messageHandler);

                const { code, state: receivedState, error } = event.data;

                if (error === 'interaction_required') {
                    reject(new Error('interaction_required'));
                } else if (error) {
                    reject(new Error('OAuth error: ' + error));
                } else if (code && receivedState === state) {
                    // Retrieve stored PKCE data using state as key
                    const pkceData = JSON.parse(sessionStorage.getItem(receivedState));
                    if (pkceData) {
                        sessionStorage.removeItem(receivedState);
                        exchangeCodeForToken(code, pkceData.verifier).then(resolve).catch(reject);
                    } else {
                        reject(new Error('PKCE data not found'));
                    }
                } else {
                    reject(new Error('Invalid callback'));
                }
            }
        };

        window.addEventListener('message', messageHandler);
    });
}

/**
 * Redirects the user to the login page for interactive authentication
 * Called when silent authentication fails
 */
async function redirectToLogin() {
    const { state, challenge } = await generateAndStorePKCE();
    const authUrl = buildAuthUrl(state, challenge, '');
    window.location.href = authUrl;
}

/**
 * Main function to obtain an access token
 * Attempts silent authentication first, falls back to redirect if needed
 *
 * @returns {Promise<string>} Access token
 * @throws {Error} If authentication fails (before redirect)
 */
async function getAccessToken() {
    try {
        return await getAccessTokenSilently();
    } catch (error) {
        if (error.message === 'interaction_required') {
            // Redirect to login page (this will navigate away from current page)
            redirectToLogin();
            // Note: Code after this point won't execute due to redirect
        } else {
            throw error;
        }
    }
}

// Export public API
export { getAccessToken, exchangeCodeForToken };

