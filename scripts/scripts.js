import {
  loadHeader,
  loadFooter,
  decorateButtons,
  decorateIcons,
  decorateSections,
  decorateBlocks,
  decorateTemplateAndTheme,
  waitForFirstImage,
  loadSection,
  loadSections,
  loadCSS,
  isAuthor,
} from './aem.js';

import { getAccessToken, exchangeCodeForToken } from './oauth.js';

/**
 * Moves all the attributes from a given elmenet to another given element.
 * @param {Element} from the element to copy attributes from
 * @param {Element} to the element to copy attributes to
 */
export function moveAttributes(from, to, attributes) {
  if (!attributes) {
    // eslint-disable-next-line no-param-reassign
    attributes = [...from.attributes].map(({ nodeName }) => nodeName);
  }
  attributes.forEach((attr) => {
    const value = from.getAttribute(attr);
    if (value) {
      to?.setAttribute(attr, value);
      from.removeAttribute(attr);
    }
  });
}

/**
 * Move instrumentation attributes from a given element to another given element.
 * @param {Element} from the element to copy attributes from
 * @param {Element} to the element to copy attributes to
 */
export function moveInstrumentation(from, to) {
  moveAttributes(
    from,
    to,
    [...from.attributes]
      .map(({ nodeName }) => nodeName)
      .filter((attr) => attr.startsWith('data-aue-') || attr.startsWith('data-richtext-')),
  );
}

/**
 * load fonts.css and set a session storage flag
 */
async function loadFonts() {
  await loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`);
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks() {
  try {
    // TODO: add auto block, if needed
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

/**
 * Decorate anchor to handle external and new tab links
 */
function decorateAnchors(main) {
  if (!main) return;
  const anchors = Array.from(main.querySelectorAll('a'));
  anchors.forEach((anchor) => {
    const link = anchor.href;
    if (!link) return;
    try {
      const isExternal = link.startsWith('http') && !link.includes(window.location.hostname);
      const extensions = ['.pdf', '.doc', '.docx', '.csv', '.xlsx', '.xls', '.jpg', '.zip', '.pptx', '.png'];
      const url = new URL(link, window.location.origin);
      const { pathname } = url;
      if (isExternal || extensions.some((ext) => pathname?.endsWith(ext))) {
        anchor.setAttribute('target', '_blank');
        anchor.setAttribute('rel', 'noopener nofollow');
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Invalid URL in anchor: ${link}`, error);
    }
  });
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
// eslint-disable-next-line import/prefer-default-export
export function decorateMain(main) {
  // hopefully forward compatible button decoration
  decorateButtons(main);
  decorateIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decorateBlocks(main);
  decorateAnchors(main);
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  document.documentElement.lang = 'en';
  decorateTemplateAndTheme();
  const main = doc.querySelector('main');
  if (main) {
    decorateMain(main);
    document.body.classList.add('appear');
    await loadSection(main.querySelector('.section'), waitForFirstImage);
  }

  try {
    /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
    if (window.innerWidth >= 900 || sessionStorage.getItem('fonts-loaded')) {
      loadFonts();
    }
  } catch (e) {
    // do nothing
  }
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  const main = doc.querySelector('main');
  await loadSections(main);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadHeader(doc.querySelector('header'));
  loadFooter(doc.querySelector('footer'));

  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();
}

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  // eslint-disable-next-line import/no-cycle
  window.setTimeout(() => import('./delayed.js'), 3000);
  // load anything that can be postponed to the latest here
}

async function loadPage() {
  if (!(window.location.origin.includes('localhost') || isAuthor)) {
    if (window.location.pathname == '/callback') {
      forgeRockCallback();
    } else {
      await loadForgeRock();
    }
  }
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

/**
 * Helper function that converts an AEM path into an EDS path.
 */
export function getEDSLink(aemPath) {
  return window.hlx.aemRoot
    ? aemPath.replace(window.hlx.aemRoot, '').replace('.html', '').replace('/index', '/')
    : aemPath;
}

/**
 * Helper function that adapts the path to work on EDS and AEM rendering
 */
export function getLink(edsPath) {
  return window.hlx.aemRoot
  && !edsPath.startsWith(window.hlx.aemRoot)
  && edsPath.indexOf('.html') === -1
    ? `${window.hlx.aemRoot}${edsPath}.html`
    : edsPath;
}

window.hlx.aemRoot = '/content/cil';

async function loadForgeRock() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const state = urlParams.get('state');
  const error = urlParams.get('error');

  if (error) {
    // Handle OAuth error (e.g., user denied access)
    console.error('OAuth error:', error);
    // In production, show user-friendly error message
    return;
  }

  if (code && state) {
    // Handle OAuth callback - exchange code for token
    const pkceData = JSON.parse(sessionStorage.getItem(state));

    if (pkceData) {
      sessionStorage.removeItem(state);

      try {
        const accessToken = await exchangeCodeForToken(code, pkceData.verifier);

        // Clear URL parameters for clean browser history
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (err) {
        console.error('Token exchange failed:', err);
        // In production, show user-friendly error message
      }
    } else {
      console.error('PKCE data not found - possible CSRF attack or session timeout');
    }
  } else {
    // No callback parameters - try silent authentication or redirect to login
    try {
      const accessToken = await getAccessToken();
    } catch (err) {
      // If redirected for authentication, this won't execute
      console.error('Failed to get token:', err);
    }
  }
}

async function forgeRockCallback() {
  const url = new URL(document.location);
  const params = url.searchParams;
  const authCode = params.get('code');
  const state = params.get('state');
  const error = params.get('error');

  // Only proceed if we have a state parameter and either code or error
  // State is required for security (CSRF protection)
  if (state && (authCode || error)) {
    // Determine if this is a top-level window or iframe
    if (window.top === window.self) {
      // Full-Page Callback Mode (Interactive Authentication)
      // User was redirected here after logging in at IAM
      console.log('Handling callback in focus.');

      if (authCode) {
        // Success: Got authorization code
        // Redirect back to main application with code and state
        const applicationPath = url.pathname.replace('/callback', '/');
        window.location.replace(`${applicationPath}?code=${authCode}&state=${state}`);
      } else {
        // Error: Authorization failed (e.g., user denied access)
        // Redirect back to main application with error and state
        const applicationPath = url.pathname.replace('/callback', '/');
        window.location.replace(`${applicationPath}?error=${error}&state=${state}`);
      }
    } else {
      // Hidden Iframe Mode (Silent Authentication)
      // This page was loaded in an iframe for silent token refresh
      console.log('Handling callback in iframe.');

      // SECURITY: Use specific origin instead of wildcard
      // Extract the origin from the current URL
      const targetOrigin = window.location.origin;

      // Post message to parent window with OAuth results
      // Parent window (oauth.js) is listening for this message
      window.parent.postMessage({
        type: 'oauthCallback', // Message type identifier
        code: authCode, // Authorization code (null if error)
        state, // State for PKCE data lookup
        error, // Error code (null if success)
      }, targetOrigin); // SECURITY: Specific origin prevents message interception
    }
  }
  // If no state or neither code nor error, do nothing
  // This might happen if user navigates directly to callback.html
}

loadPage();
