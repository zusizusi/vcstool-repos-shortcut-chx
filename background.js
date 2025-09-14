/**
 * Background script for vcstool repos shortcut extension
 * Monitors GitHub URL changes and notifies content scripts
 */

/**
 * Configuration constants
 */
const CONFIG = {
  GITHUB_MATCH: /https:\/\/github\.com\//,
  MESSAGE_TYPE: "VCSTOOL_REPOS_URL_CHANGE_DETECTED",
  DEBUG: true,
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
      await chrome.tabs.sendMessage(tabId, {
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
   * @param {Object} details - Navigation details
   * @param {string} eventType - Type of navigation event
   */
  static handleNavigation(details, eventType) {
    if (!details.tabId || !NavigationHandler.isGitHubUrl(details.url)) {
      return;
    }

    Logger.info(`${eventType}:`, details.url);
    NavigationHandler.notifyTab(details.tabId, details.url);
  }

  /**
   * Initialize navigation listeners
   */
  static init() {
    // Handle history state updates (GitHub SPA navigation)
    chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
      NavigationHandler.handleNavigation(details, "History state updated");
    });

    // Handle committed navigation
    chrome.webNavigation.onCommitted.addListener((details) => {
      NavigationHandler.handleNavigation(details, "Navigation committed");
    });

    // Handle fragment updates
    chrome.webNavigation.onReferenceFragmentUpdated.addListener((details) => {
      NavigationHandler.handleNavigation(details, "Reference fragment updated");
    });

    // Handle tab updates (reload, initial load)
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
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

// Initialize the extension
NavigationHandler.init();
