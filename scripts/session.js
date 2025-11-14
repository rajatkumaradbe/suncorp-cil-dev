/**
 * Session Management and Validation
 *
 * Monitors user session validity by periodically checking with the identity provider.
 * Attaches to user activity events to detect when validation is needed.
 * Automatically logs out and reloads the page if session becomes invalid.
 *
 * @module session
 */

import { forgeRockConfig } from './config.js';

const config = await forgeRockConfig();

/**
 * Returns the current timestamp in milliseconds
 * @returns {number} Current time in ms
 */
function now() {
    return Date.now();
}

/**
 * Logs the user out by calling the IAM logout endpoint
 * This terminates the session on the identity provider side
 *
 * @returns {Promise<void>}
 */
export async function doLogout() {
    try {
        await fetch(`${config.iam.baseUrl}/api/iam/v1/sessions?_action=logout`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Accept-Api-Version': 'resource=3.1, protocol=1.0'
            },
            credentials: 'include' // Include session cookies
        });
    } catch (err) {
        console.error('Logout API failed:', err);
    }
}

/**
 * Creates a session checker instance that monitors session validity
 *
 * The checker validates the session by calling the IAM validate endpoint
 * at most once per configured interval. Validation is triggered by user
 * activity events (clicks, keypresses, mouse movements, etc.)
 *
 * @param {Object} [options] - Configuration options (currently unused)
 * @returns {{attach: Function, detach: Function}} Session checker instance
 */
export function createSessionChecker(options = {}) {
    const interval = config.iam.sessionCheckInterval;
    let lastCheck = now();
    let attached = false;

    /**
     * Validates the current session with the identity provider
     *
     * @returns {Promise<boolean>} True if session is valid, false otherwise
     */
    async function validateSession() {
        try {
            const resp = await fetch(`${config.iam.baseUrl}/api/iam/v1/sessions?_action=validate`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Accept-Api-Version': 'protocol=1.0,resource=2.0'
                },
                credentials: 'include' // Include session cookies
            });

            if (!resp.ok) {
                console.warn('Session validate API returned status', resp.status);
                return false;
            }

            const data = await resp.json();
            return Boolean(data && data.valid);
        } catch (err) {
            console.error('Session validation error:', err);
            return false;
        }
    }

    /**
     * Checks session validity if enough time has passed since last check
     * Logs out and reloads page if session is invalid
     *
     * @returns {Promise<void>}
     */
    async function checkIfNeeded() {
        const nowTs = now();

        // Only check if interval has elapsed to avoid excessive API calls
        if (nowTs - lastCheck >= interval) {
            lastCheck = nowTs;
            console.log('sessionChecker: validating session at', new Date(nowTs).toLocaleString());

            const valid = await validateSession();

            if (!valid) {
                console.log('sessionChecker: session invalid, logging out');
                await doLogout();
                window.location.reload(); // Reload triggers re-authentication
            }
        }
    }

    /**
     * User activity event handler
     * Triggers session validation check in a fire-and-forget manner
     */
    async function activityHandler() {
        try {
            await checkIfNeeded();
        } catch (err) {
            console.error('Error during session check on activity:', err);
        }
    }

    /**
     * Attaches event listeners for user activity
     * Once attached, session will be validated on user interaction
     */
    function attach() {
        if (attached) return;
        attached = true;

        // Listen to various user interaction events
        window.addEventListener('click', activityHandler);
        window.addEventListener('keypress', activityHandler);
        window.addEventListener('focus', activityHandler);
        window.addEventListener('mousemove', activityHandler);
        window.addEventListener('scroll', activityHandler);
        window.addEventListener('blur', activityHandler);
        window.addEventListener('touchstart', activityHandler);
        window.addEventListener('touchmove', activityHandler);
        document.addEventListener('visibilitychange', activityHandler);

        console.log('sessionChecker: attached event handlers');
    }

    /**
     * Removes all event listeners
     * Call when session checking should stop (e.g., during logout)
     */
    function detach() {
        if (!attached) return;
        attached = false;

        window.removeEventListener('click', activityHandler);
        window.removeEventListener('keypress', activityHandler);
        window.removeEventListener('focus', activityHandler);
        window.removeEventListener('mousemove', activityHandler);
        window.removeEventListener('scroll', activityHandler);
        window.removeEventListener('blur', activityHandler);
        window.removeEventListener('touchstart', activityHandler);
        window.removeEventListener('touchmove', activityHandler);
        document.removeEventListener('visibilitychange', activityHandler);

        console.log('sessionChecker: detached event handlers');
    }

    return {
        attach,
        detach
    };
}

export default createSessionChecker;
