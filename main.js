/**
 * Content script for vcstool repos shortcut extension
 * Adds shortcut buttons to open repository URLs from .repos files on GitHub
 */

const CONFIG = {
  SELECTORS: {
    CODE_FILE: "react-code-file-contents",
    CODE_LINES: "react-code-lines",
    FILE_LINE: "react-file-line",
    BUTTON: "open-repo-button",
    FILE_TREE_ID: "repos-file-tree",
  },
  RETRY: { MAX: 10, INTERVAL: 300 },
  DEBOUNCE: 100,
};

const REGEX = {
  SSH_URL: /^git@([\w.-]+):([\w.-]+)\/([\w.-]+)\.git$/,
  REPOS_KEY: /^[\w.\-\/_]+:\s*(#.*)?$/,
  COMMIT_HASH: /^[0-9a-f]{40}$/,
};

const Utils = {
  convertSshToHttp(url) {
    const match = url.match(REGEX.SSH_URL);
    if (!match) return null;
    return `https://${match[1]}/${match[2]}/${match[3]}.git`;
  },

  isReposFile(url) {
    return url
      .split(/[?#]/)[0]
      .split("/")
      .some((s) => s.includes(".repos"));
  },

  parseRepositories(codeLines) {
    const repos = {};
    let currentBlock = [];

    const processBlock = (lines) => {
      if (!lines.length) return;
      const name = lines[0].innerText.split(":")[0].trim();
      if (repos[name]) return;

      const repo = { name, key: lines[0].id };
      lines.slice(1).forEach((line) => {
        const text = line.innerText.trim();
        if (!text || text.startsWith("#")) return;

        const [key, ...valParts] = text.split(":");
        if (!valParts.length) return;
        let val = valParts.join(":").split("#")[0].trim();

        if (key.trim() === "type") repo.type = val;
        if (key.trim() === "url") {
          if (val.startsWith("git@")) val = Utils.convertSshToHttp(val);
          repo.url = val;
        }
        if (key.trim() === "version") repo.version = val;
      });

      if (repo.url && repo.type?.includes("git")) {
        if (repo.version) {
          const isHash = REGEX.COMMIT_HASH.test(repo.version);
          repo.url =
            repo.url.replace(/\.git$/, "") +
            (isHash ? `/blob/${repo.version}` : `/tree/${repo.version}`);
        } else {
          repo.url = repo.url.replace(/\.git$/, "");
        }
        repos[name] = repo;
      }
    };

    for (const line of codeLines) {
      const text = line.innerText.trim();
      if (REGEX.REPOS_KEY.test(text)) {
        if (line.id !== "LC1" || text !== "repositories:") {
          processBlock(currentBlock);
          currentBlock = [line];
          continue;
        }
      }
      if (currentBlock.length) currentBlock.push(line);
    }
    processBlock(currentBlock);
    return repos;
  },
};

const UI = {
  createButton(repo, top, left) {
    const link = document.createElement("a");
    link.href = repo.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = CONFIG.SELECTORS.BUTTON;

    Object.assign(link.style, {
      position: "absolute",
      zIndex: "999",
      top: `${top}px`,
      left: `${left}px`,
      transform: "translate(-50%, -50%)", // Center the button at the vertical center of the line and horizontally at 'left'
      textDecoration: "none",
    });

    const btn = document.createElement("button");
    btn.title = `Open ${repo.name}`;
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M3.75 2h3.5a.75.75 0 0 1 0 1.5h-3.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-3.5a.75.75 0 0 1 1.5 0v3.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5C2 2.784 2.784 2 3.75 2Zm6.854-1h4.146a.25.25 0 0 1 .25.25v4.146a.25.25 0 0 1-.427.177L13.03 4.03 9.28 7.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.75-3.75-1.543-1.543A.25.25 0 0 1 10.604 1Z"/></svg>`;

    Object.assign(btn.style, {
      background: "#0969da",
      border: "1px solid #0969da",
      borderRadius: "6px",
      color: "white",
      cursor: "pointer",
      padding: "6px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: "26px",
      minHeight: "26px",
      transition: "all 0.2s ease",
      transformOrigin: "center",
    });

    btn.onmouseenter = () => {
      btn.style.backgroundColor = "#0856c5";
      btn.style.transform = "scale(1.05)";
    };
    btn.onmouseleave = () => {
      btn.style.backgroundColor = "#0969da";
      btn.style.transform = "scale(1)";
    };

    link.appendChild(btn);
    document.body.appendChild(link);
  },

  renderButtons(repos, container) {
    this.removeButtons();
    if (!repos || !container) return;

    const containerRect = container.getBoundingClientRect();
    const left = containerRect.left + window.scrollX;
    const scrollY = window.scrollY;

    Object.values(repos).forEach((repo) => {
      const line = document.getElementById(repo.key);
      if (!line) return;
      const rect = line.getBoundingClientRect();
      // Position at the start of the line, centered vertically
      this.createButton(repo, rect.top + scrollY + rect.height / 2, left);
    });
  },

  removeButtons() {
    document
      .querySelectorAll(`.${CONFIG.SELECTORS.BUTTON}`)
      .forEach((el) => el.remove());
  },
};

class App {
  constructor() {
    this.lastUrl = "";
    this.lastTitle = "";
    this.timer = null;
    this.fileTreeObserver = null;
    this.contentObserver = null;
    this.titleObserver = null;
    this.repos = null;
    this.listenersRegistered = false;

    this.update = this.update.bind(this);
    this.updateWithoutReparse = this.updateWithoutReparse.bind(this);

    this.handleResize = this.updateWithoutReparse;
    this.handleScroll = () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.update(true), CONFIG.DEBOUNCE);
    };
    this.handleContentChange = () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.update(true), CONFIG.DEBOUNCE);
    };
  }

  registerGlobalListeners(container) {
    if (this.listenersRegistered) return;
    this.listenersRegistered = true;

    this.observeFileTree();
    this.observeContent(container);
    window.addEventListener("resize", this.handleResize, { passive: true });
    window.addEventListener("scroll", this.handleScroll, { passive: true });
  }

  unregisterGlobalListeners() {
    if (!this.listenersRegistered) return;
    this.listenersRegistered = false;

    if (this.fileTreeObserver) {
      this.fileTreeObserver.disconnect();
      this.fileTreeObserver = null;
    }
    if (this.contentObserver) {
      this.contentObserver.disconnect();
      this.contentObserver = null;
    }

    window.removeEventListener("resize", this.handleResize, { passive: true });
    window.removeEventListener("scroll", this.handleScroll, { passive: true });
  }

  update(reparse = true) {
    const container = document.getElementsByClassName(
      CONFIG.SELECTORS.CODE_FILE
    )[0];
    const linesContainer = container?.getElementsByClassName(
      CONFIG.SELECTORS.CODE_LINES
    )[0];

    if (!container || !linesContainer) return;

    const lines = linesContainer.getElementsByClassName(
      CONFIG.SELECTORS.FILE_LINE
    );

    if (reparse || !this.repos || Object.keys(this.repos).length === 0) {
      this.repos = Utils.parseRepositories(lines);
      const count = Object.keys(this.repos).length;
      if (count > 0) {
        console.debug("[vcstool-repos-shortcut] parsed repos", { count });
      } else if (lines.length > 0) {
        console.debug("[vcstool-repos-shortcut] parsed 0 repos from lines", {
          linesCount: lines.length,
        });
      }
    }
    UI.renderButtons(this.repos, container);
  }

  updateWithoutReparse() {
    this.update(false);
  }

  observeContent(container) {
    if (this.contentObserver) {
      this.contentObserver.disconnect();
    }

    this.contentObserver = new MutationObserver(() => {
      this.handleContentChange();
    });

    this.contentObserver.observe(container, {
      childList: true,
      subtree: true,
    });
  }

  observeFileTree() {
    if (this.fileTreeObserver) return;

    const fileTree = document.getElementById(CONFIG.SELECTORS.FILE_TREE_ID);
    if (!fileTree) return;

    this.fileTreeObserver = new ResizeObserver(() => {
      clearTimeout(this.timer);
      this.timer = setTimeout(this.handleResize, CONFIG.DEBOUNCE);
    });

    this.fileTreeObserver.observe(fileTree);
  }

  checkUrl() {
    const currentUrl = location.href;
    const currentTitle = document.title;
    console.debug("[vcstool-repos-shortcut] checkUrl", {
      currentUrl,
      currentTitle,
    });
    this.processUrl(currentUrl);
  }

  setupTitleObserver() {
    const headElement = document.querySelector("head");
    if (headElement) {
      this.titleObserver = new MutationObserver(() => {
        // Check if title actually changed to avoid redundant processing
        if (document.title !== this.lastTitle) {
          console.debug(
            "[vcstool-repos-shortcut] head mutation & title changed",
            {
              newTitle: document.title,
              oldTitle: this.lastTitle,
              url: location.href,
            }
          );
          this.checkUrl();
        }
      });
      this.titleObserver.observe(headElement, {
        childList: true,
        subtree: true,
      });
    }
  }

  init() {
    if (!Utils.isReposFile(location.href)) return;

    let attempts = 0;
    const tryLoad = () => {
      const container = document.getElementsByClassName(
        CONFIG.SELECTORS.CODE_FILE
      )[0];

      if (container) {
        this.update();
        this.registerGlobalListeners(container);
      } else if (attempts++ < CONFIG.RETRY.MAX) {
        setTimeout(tryLoad, CONFIG.RETRY.INTERVAL);
      } else {
        console.debug(
          "[vcstool-repos-shortcut] tryLoad failed: max attempts reached"
        );
      }
    };
    tryLoad();
  }

  processUrl(url) {
    console.debug("[vcstool-repos-shortcut] processUrl", {
      url,
      lastUrl: this.lastUrl,
      isRepos: Utils.isReposFile(url),
    });
    if (url === this.lastUrl) return;
    this.lastUrl = url;
    this.lastTitle = document.title; // Keep track of title too

    UI.removeButtons();
    this.repos = null;
    this.unregisterGlobalListeners();
    clearTimeout(this.timer);

    this.init();
  }
}

const app = new App();

// SPA handling
// Watch document.head for changes to <title> or replacement of <title> element
app.setupTitleObserver();

console.debug("[vcstool-repos-shortcut] initial load", {
  initialUrl: location.href,
  initialTitle: document.title,
});
// Initial load
app.checkUrl();
