/**
 * Content script for vcstool repos shortcut extension
 * Adds shortcut buttons to open repository URLs from .repos files on GitHub
 */

/**
 * Configuration constants
 */
const CONFIG = {
  SSH_PATTERN: /^git@([\w.-]+):([\w.-]+)\/([\w.-]+)\.git$/,
  COMMIT_HASH_PATTERN: /^[0-9a-f]{40}$/,
  SELECTORS: {
    CODE_FILE_CLASS: "react-code-file-contents",
    CODE_LINES_CLASS: "react-code-lines",
    FILE_LINE_CLASS: "react-file-line",
    TEXTAREA_ID: "read-only-cursor-text-area",
    BUTTON_CLASS: "open-repo-button",
  },
  RETRY: {
    MAX_ATTEMPTS: 8,
    INTERVAL: 300,
  },
  DEBOUNCE_DELAY: 100,
  DEBUG: true,
};

/**
 * Logger utility for consistent logging
 */
const Logger = {
  info: (message, ...args) =>
    CONFIG.DEBUG && console.log(`[VCSTools] ${message}`, ...args),
  warn: (message, ...args) => console.warn(`[VCSTools] ${message}`, ...args),
  error: (message, ...args) => console.error(`[VCSTools] ${message}`, ...args),
  debug: (message, ...args) =>
    CONFIG.DEBUG && console.debug(`[VCSTools] ${message}`, ...args),
};

/**
 * Repository data type definition
 * @typedef {Object} Repository
 * @property {string} name - Repository name
 * @property {string} url - Repository URL
 * @property {string} type - Repository type (usually git)
 * @property {string} version - Version/branch/commit
 * @property {string} key - Element ID key
 */

/**
 * URL utility functions
 */
class UrlUtils {
  /**
   * Convert SSH URL to HTTP URL
   * @param {string} sshUrl - SSH URL to convert
   * @returns {string|null} HTTP URL or null if invalid
   */
  static convertSshToHttp(sshUrl) {
    const match = sshUrl.match(CONFIG.SSH_PATTERN);
    if (match) {
      const [, domain, username, repository] = match;
      return `https://${domain}/${username}/${repository}.git`;
    }
    Logger.warn("Invalid SSH URL format:", sshUrl);
    return null;
  }

  /**
   * Extract filename from URL
   * @param {string} url - URL to extract filename from
   * @returns {string} Filename or empty string
   */
  static extractFilenameFromUrl(url) {
    if (!url) return "";
    const clean = url.split(/[?#]/)[0];
    const segments = clean.split("/").filter(Boolean);

    for (let i = segments.length - 1; i >= 0; i--) {
      if (segments[i].includes(".repos")) {
        Logger.info("Found .repos file:", segments[i]);
        return decodeURIComponent(segments[i]);
      }
    }
    return "";
  }

  /**
   * Check if filename is a repos file
   * @param {string} filename - Filename to check
   * @returns {boolean} True if it's a repos file
   */
  static isReposFilename(filename) {
    return filename.includes(".repos");
  }
}

/**
 * Repository parser class
 */
class RepositoryParser {
  /**
   * Get field value from a line of text
   * @param {string} text - Text line
   * @param {string} prefix - Field prefix
   * @returns {string|null} Field value or null
   */
  static getFieldValue(text, prefix) {
    if (text.startsWith(prefix)) {
      return text.slice(prefix.length).split("#")[0].trim();
    }
    return null;
  }

  /**
   * Apply version logic to repository object
   * @param {Repository} repo - Repository object to modify
   */
  static applyVersionLogic(repo) {
    if (!repo.type?.includes("git") || !repo.url) return;

    let baseUrl = repo.url;
    if (baseUrl.endsWith(".git")) {
      baseUrl = baseUrl.slice(0, -4);
    }

    if (repo.version) {
      if (CONFIG.COMMIT_HASH_PATTERN.test(repo.version)) {
        repo.url = `${baseUrl}/blob/${repo.version}`;
      } else {
        repo.url = `${baseUrl}/tree/${repo.version}`;
      }
    } else {
      repo.url = baseUrl;
    }
  }

  /**
   * Process a block of repository lines
   * @param {HTMLElement[]} blockLines - Array of line elements
   * @param {Object} repositories - Repository storage object
   */
  static processRepositoryBlock(blockLines, repositories) {
    if (blockLines.length === 0) return;

    const repoKeyLine = blockLines[0].innerText.trim();
    const repoName = repoKeyLine.split(":")[0].trim();

    if (repositories[repoName]) return;

    const repo = { name: repoName };
    Logger.debug("Processing repository:", repoName);

    // Process configuration lines
    blockLines.slice(1).forEach((line) => {
      const text = line.innerText.trim();
      if (!text || text.startsWith("#")) return;

      let value;
      if ((value = RepositoryParser.getFieldValue(text, "type:"))) {
        repo.type = value;
      } else if ((value = RepositoryParser.getFieldValue(text, "url:"))) {
        if (!value.startsWith("https://") && value.startsWith("git@")) {
          value = UrlUtils.convertSshToHttp(value);
          if (!value) return;
        }
        repo.url = value;
      } else if ((value = RepositoryParser.getFieldValue(text, "version:"))) {
        repo.version = value;
      }
    });

    RepositoryParser.applyVersionLogic(repo);
    repo.key = blockLines[0].id;

    // Validate repository data
    if (repo.url && repo.type && repo.version && repo.key) {
      repositories[repoName] = repo;
    }
  }

  /**
   * Parse repository data from code lines
   * @param {Object} repositories - Repository storage object
   * @param {HTMLCollectionOf<Element>} codeLines - Code line elements
   * @returns {Object|null} Parsed repositories or null
   */
  static parseRepositoryData(repositories, codeLines) {
    if (!codeLines) {
      Logger.error("No code lines found");
      return null;
    }

    let currentBlock = [];

    Array.from(codeLines).forEach((codeLine) => {
      const lineText = codeLine.innerText.trim();

      // Check if this is a repository key line
      if (/^[\w.\-\/_]+:\s*(#.*)?$/.test(lineText)) {
        // Skip the top-level "repositories:" line
        if (codeLine.id === "LC1" && lineText === "repositories:") return;

        // Process previous block if exists
        if (currentBlock.length > 0) {
          RepositoryParser.processRepositoryBlock(currentBlock, repositories);
        }

        currentBlock = [codeLine];
      } else if (currentBlock.length > 0) {
        currentBlock.push(codeLine);
      }
    });

    // Process final block
    if (currentBlock.length > 0) {
      RepositoryParser.processRepositoryBlock(currentBlock, repositories);
    }

    return Object.keys(repositories).length > 0 ? repositories : null;
  }
}

/**
 * UI management class
 */
class UIManager {
  /**
   * Get element by class name with error handling
   * @param {string} className - Class name to search for
   * @returns {Element|null} Found element or null
   */
  static getElementByClass(className) {
    const element = document.getElementsByClassName(className)[0];
    if (!element) {
      Logger.error(`Element with class ${className} not found`);
      return null;
    }
    return element;
  }

  /**
   * Get the position of the text area
   * @returns {DOMRect|null} Textarea rectangle or null
   */
  static getTextareaRect() {
    const readOnlyTextArea = document.getElementById(
      CONFIG.SELECTORS.TEXTAREA_ID
    );
    if (!readOnlyTextArea) {
      Logger.error("Textarea not found");
      return null;
    }
    return readOnlyTextArea.getBoundingClientRect();
  }

  /**
   * Create a repository button
   * @param {Repository} repo - Repository data
   * @param {number} top - Top position
   * @param {number} left - Left position
   * @returns {HTMLElement} Created button element
   */
  static createRepoButton(repo, top, left) {
    const link = document.createElement("a");
    link.href = repo.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.style.cssText = `
      position: absolute;
      z-index: 999;
      top: ${top}px;
      left: ${left}px;
      text-decoration: none;
    `;

    const button = document.createElement("button");
    button.className = CONFIG.SELECTORS.BUTTON_CLASS;
    button.title = `Open ${repo.name} repository in new tab`;

    // External link SVG icon
    button.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M3.75 2h3.5a.75.75 0 0 1 0 1.5h-3.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-3.5a.75.75 0 0 1 1.5 0v3.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5C2 2.784 2.784 2 3.75 2Zm6.854-1h4.146a.25.25 0 0 1 .25.25v4.146a.25.25 0 0 1-.427.177L13.03 4.03 9.28 7.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.75-3.75-1.543-1.543A.25.25 0 0 1 10.604 1Z"/></svg>
    `;

    button.style.cssText = `
      background: #0969da;
      border: 1px solid #0969da;
      border-radius: 6px;
      color: white;
      cursor: pointer;
      padding: 6px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 26px;
      min-height: 26px;
    `;

    // Add hover effects
    button.addEventListener("mouseenter", () => {
      button.style.backgroundColor = "#0856c5";
      button.style.transform = "scale(1.05)";
    });

    button.addEventListener("mouseleave", () => {
      button.style.backgroundColor = "#0969da";
      button.style.transform = "scale(1)";
    });

    link.appendChild(button);
    document.body.appendChild(link);

    return link;
  }

  /**
   * Display repository buttons
   * @param {Object} repositories - Repository data
   * @param {Element} codeLinesElement - Code lines container element
   */
  static displayRepoButtons(repositories, codeLinesElement) {
    if (!repositories) {
      Logger.error("No repository data available");
      return;
    }

    const textareaRect = UIManager.getTextareaRect();
    if (!textareaRect) {
      Logger.error("Failed to get textarea rect");
      return;
    }

    let buttonCount = 0;
    Object.values(repositories).forEach((repo) => {
      const { name, key, url, type, version } = repo;

      // Skip the repositories: line
      if (name === "repositories" && key === "LC1") return;

      if (!url || !type) {
        Logger.warn(
          `Incomplete repository data for key: ${key}, name: ${name}, url: ${url}, type: ${type}, version: ${version}`
        );
        return;
      }

      if (!type.includes("git")) {
        Logger.warn("Repository type is not git");
        return;
      }

      const codeLineElement = codeLinesElement.querySelector(`#${key}`);
      if (!codeLineElement) {
        Logger.error(`Code line element not found for key: ${key}`);
        return;
      }

      const rect = codeLineElement.getBoundingClientRect();
      UIManager.createRepoButton(
        repo,
        rect.top + window.scrollY,
        textareaRect.left
      );
      buttonCount++;
    });

    Logger.info(`Created ${buttonCount} repository buttons`);
  }

  /**
   * Remove all repository buttons
   */
  static removeRepoButtons() {
    const buttons = document.querySelectorAll(
      `.${CONFIG.SELECTORS.BUTTON_CLASS}`
    );
    buttons.forEach((button) => {
      const link = button.parentElement;
      if (link) link.remove();
    });

    if (buttons.length > 0) {
      Logger.debug(`Removed ${buttons.length} repository buttons`);
    }
  }
}

/**
 * Main application class
 */
class VCSToolsExtension {
  constructor() {
    this.storedRepositories = {};
    this.lastProcessedUrl = "";
    this.scrollDebounceTimer = null;
    this.isInitialized = false;
  }

  /**
   * Update repository buttons
   * @param {Element} codeLinesElement - Code lines container
   */
  updateRepoButtons(codeLinesElement) {
    try {
      const codeLines = codeLinesElement.getElementsByClassName(
        CONFIG.SELECTORS.FILE_LINE_CLASS
      );
      RepositoryParser.parseRepositoryData(this.storedRepositories, codeLines);
      UIManager.removeRepoButtons();
      UIManager.displayRepoButtons(this.storedRepositories, codeLinesElement);
    } catch (error) {
      Logger.error("Error updating repository buttons:", error);
    }
  }

  /**
   * Register event listeners
   * @param {Element} codeLinesElement - Code lines container
   */
  registerEventListeners(codeLinesElement) {
    // Window resize listener
    window.addEventListener("resize", () => {
      this.updateRepoButtons(codeLinesElement);
    });

    // Scroll listener with debouncing
    window.addEventListener("scroll", () => {
      if (this.scrollDebounceTimer) {
        clearTimeout(this.scrollDebounceTimer);
      }

      this.scrollDebounceTimer = setTimeout(() => {
        this.updateRepoButtons(codeLinesElement);
      }, CONFIG.DEBOUNCE_DELAY);
    });

    Logger.debug("Event listeners registered");
  }

  /**
   * Initialize the extension
   */
  init() {
    try {
      const codeFileContentsElement = UIManager.getElementByClass(
        CONFIG.SELECTORS.CODE_FILE_CLASS
      );
      if (!codeFileContentsElement) {
        Logger.debug("Code file contents element not found, retrying later");
        return false;
      }

      const codeLinesElement = codeFileContentsElement.getElementsByClassName(
        CONFIG.SELECTORS.CODE_LINES_CLASS
      )[0];
      if (!codeLinesElement) {
        Logger.error("Code lines element not found");
        return false;
      }

      this.storedRepositories = {};

      this.updateRepoButtons(codeLinesElement);

      if (!this.isInitialized) {
        this.registerEventListeners(codeLinesElement);
        this.isInitialized = true;
      }

      Logger.info("Extension initialized successfully");
      return true;
    } catch (error) {
      Logger.error("An error occurred during initialization:", error);
      return false;
    }
  }

  /**
   * Schedule initialization with retries
   * @param {number} attempts - Number of retry attempts
   * @param {number} interval - Retry interval in milliseconds
   */
  scheduleInitWithRetries(
    attempts = CONFIG.RETRY.MAX_ATTEMPTS,
    interval = CONFIG.RETRY.INTERVAL
  ) {
    let count = 0;

    const tryInit = () => {
      count++;

      if (this.init()) {
        return; // Successfully initialized
      }

      if (count < attempts) {
        Logger.debug(
          `Initialization attempt ${count}/${attempts} failed, retrying in ${interval}ms`
        );
        setTimeout(tryInit, interval);
      } else {
        Logger.warn(`Failed to initialize after ${attempts} attempts`);
      }
    };

    tryInit();
  }

  /**
   * Process URL change
   * @param {string} url - New URL
   */
  processUrl(url) {
    if (!url || url === this.lastProcessedUrl) return;

    this.lastProcessedUrl = url;
    UIManager.removeRepoButtons();
    this.storedRepositories = {};
    this.isInitialized = false;

    const filename = UrlUtils.extractFilenameFromUrl(url);
    if (filename && UrlUtils.isReposFilename(filename)) {
      Logger.info(`Processing repos file: ${filename}`);
      this.scheduleInitWithRetries();
    }
  }

  /**
   * Initialize URL monitoring
   */
  initUrlMonitoring() {
    // Process initial URL
    this.processUrl(window.location.href);

    // Listen for messages from background script
    if (
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      chrome.runtime.onMessage
    ) {
      chrome.runtime.onMessage.addListener((message) => {
        if (message && message.type === "VCSTOOL_REPOS_URL_CHANGE_DETECTED") {
          Logger.info("Received URL change message:", message.url);
          this.processUrl(message.url);
        }
      });
    }

    Logger.info("URL monitoring initialized");
  }
}

// Initialize the extension
const vcsToolsExtension = new VCSToolsExtension();
vcsToolsExtension.initUrlMonitoring();
