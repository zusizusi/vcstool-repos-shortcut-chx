/**
 * Background script for vcstool repos shortcut extension
 * Monitors GitHub URL changes and notifies content scripts
 * Compatible with both Chrome and Firefox
 */

/**
 * Browser API compatibility layer
 */
const browserAPI = (() => {
  // Check if we're in Firefox or Chrome
  if (typeof browser !== "undefined") {
    // Firefox uses the browser global
    return browser;
  } else if (typeof chrome !== "undefined") {
    // Chrome uses the chrome global
    return chrome;
  }
  throw new Error("Extension API not available. This script must run in a browser extension environment with either Chrome or Firefox APIs.");
})();

/**
 * Configuration constants
 */
const CONFIG = {
  GITHUB_MATCH: /https:\/\/github\.com\//, // Regex to quickly verify we care about the navigated URL
  MESSAGE_TYPE: "VCSTOOL_REPOS_URL_CHANGE_DETECTED", // Message type sent to content script
  DEBUG: false, // Enable/disable verbose logging
};

/**
 * Logger utility for consistent logging
 */
const Logger = {
  info: (message, ...args) =>
    CONFIG.DEBUG && console.log(`[Background] ${message}`, ...args),
  warn: (message, ...args) => console.warn(`[Background] ${message}`, ...args),
  error: (message, ...args) =>
    console.error(`[Background] ${message}`, ...args),
};

/**
 * Navigation handler class to manage URL monitoring
 */
class NavigationHandler {
  /**
   * Check if URL matches GitHub pattern
   * @param {string} url - URL to check
   * @returns {boolean} True if URL is a GitHub URL
   */
  static isGitHubUrl(url) {
    return url && CONFIG.GITHUB_MATCH.test(url);
  }

  /**
   * Notify content script about URL change
   * @param {number} tabId - Tab ID
   * @param {string} url - New URL
   */
  static async notifyTab(tabId, url) {
    try {
      await browserAPI.tabs.sendMessage(tabId, {
        type: CONFIG.MESSAGE_TYPE,
        url,
      });
      Logger.info(`Notified tab ${tabId} about URL change: ${url}`);
    } catch (error) {
      Logger.warn(`Failed to notify tab ${tabId}:`, error.message);
    }
  }

  /**
   * Handle navigation events
   * @param {Object} details - Navigation details from webNavigation API
   * @param {string} eventType - Type of navigation event
   */
  static handleNavigation(details, eventType) {
    if (!details.tabId || !NavigationHandler.isGitHubUrl(details.url)) {
      return; // Ignore non-GitHub navigations or missing tab info
    }

    Logger.info(`${eventType}:`, details.url);
    NavigationHandler.notifyTab(details.tabId, details.url);
  }

  /**
   * Initialize navigation listeners
   */
  static init() {
    // SPA navigations (pushState/replaceState) on GitHub
    browserAPI.webNavigation.onHistoryStateUpdated.addListener((details) => {
      NavigationHandler.handleNavigation(details, "History state updated");
    });

    // Standard committed navigations (page loads, link clicks)
    browserAPI.webNavigation.onCommitted.addListener((details) => {
      NavigationHandler.handleNavigation(details, "Navigation committed");
    });

    // URL fragment (#hash) updates
    browserAPI.webNavigation.onReferenceFragmentUpdated.addListener(
      (details) => {
        NavigationHandler.handleNavigation(
          details,
          "Reference fragment updated"
        );
      }
    );

    // Tab updates (reload or load completion)
    browserAPI.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (
        changeInfo.status === "complete" &&
        NavigationHandler.isGitHubUrl(tab.url)
      ) {
        Logger.info("Tab updated:", tab.url);
        NavigationHandler.notifyTab(tabId, tab.url);
      }
    });

    Logger.info("Navigation handlers initialized");
  }
}

// Initialize the extension (entry point for background service worker)
NavigationHandler.init();
