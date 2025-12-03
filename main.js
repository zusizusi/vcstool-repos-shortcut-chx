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

const Utils = {
  convertSshToHttp(url) {
    const match = url.match(/^git@([\w.-]+):([\w.-]+)\/([\w.-]+)\.git$/);
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

        if (key === "type") repo.type = val;
        if (key === "url") {
          if (val.startsWith("git@")) val = Utils.convertSshToHttp(val);
          repo.url = val;
        }
        if (key === "version") repo.version = val;
      });

      if (repo.url && repo.type?.includes("git")) {
        if (repo.version) {
          const isHash = /^[0-9a-f]{40}$/.test(repo.version);
          repo.url =
            repo.url.replace(/\.git$/, "") +
            (isHash ? `/blob/${repo.version}` : `/tree/${repo.version}`);
        } else {
          repo.url = repo.url.replace(/\.git$/, "");
        }
        repos[name] = repo;
      }
    };

    Array.from(codeLines).forEach((line) => {
      const text = line.innerText.trim();
      if (/^[\w.\-\/_]+:\s*(#.*)?$/.test(text)) {
        if (line.id !== "LC1" || text !== "repositories:") {
          processBlock(currentBlock);
          currentBlock = [line];
          return;
        }
      }
      if (currentBlock.length) currentBlock.push(line);
    });
    processBlock(currentBlock);
    return repos;
  },
};

const UI = {
  createButton(repo, top, left) {
    const link = document.createElement("a");
    link.href = repo.url;
    link.target = "_blank";
    link.className = CONFIG.SELECTORS.BUTTON;

    Object.assign(link.style, {
      position: "absolute",
      zIndex: "999",
      top: `${top}px`,
      left: `${left}px`,
      transform: "translate(-50%, -50%)", // Center on the point
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

    Object.values(repos).forEach((repo) => {
      const line = document.getElementById(repo.key);
      if (!line) return;
      const rect = line.getBoundingClientRect();
      // Position at the start of the line, centered vertically
      this.createButton(
        repo,
        rect.top + window.scrollY + rect.height / 2,
        left
      );
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
    this.timer = null;
    this.fileTreeObserver = null;
    this.contentObserver = null;
    this.repos = null;

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
    if (reparse || !this.repos) {
      this.repos = Utils.parseRepositories(lines);
    }
    UI.renderButtons(this.repos, container);
  }

  updateWithoutReparse() {
    this.update(false);
  }

  observeContent(container) {
    if (this.contentObserver) return;

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

  init() {
    if (!Utils.isReposFile(location.href)) return;

    let attempts = 0;
    const tryLoad = () => {
      const container = document.getElementsByClassName(
        CONFIG.SELECTORS.CODE_FILE
      )[0];
      if (container) {
        this.update();
        this.observeFileTree();
        this.observeContent(container);
        window.addEventListener("resize", this.handleResize);
        window.addEventListener("scroll", this.handleScroll, { passive: true });
      } else if (attempts++ < CONFIG.RETRY.MAX) {
        setTimeout(tryLoad, CONFIG.RETRY.INTERVAL);
      }
    };
    tryLoad();
  }

  processUrl(url) {
    if (url === this.lastUrl) return;
    this.lastUrl = url;

    UI.removeButtons();
    this.repos = null;
    if (this.fileTreeObserver) {
      this.fileTreeObserver.disconnect();
      this.fileTreeObserver = null;
    }
    if (this.contentObserver) {
      this.contentObserver.disconnect();
      this.contentObserver = null;
    }
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("scroll", this.handleScroll);

    this.init();
  }
}

const app = new App();
const checkUrl = () => app.processUrl(location.href);

// SPA handling
const titleElement = document.querySelector("title");
if (titleElement) {
  new MutationObserver(checkUrl).observe(titleElement, { childList: true });
}
checkUrl();

// Fallback for SPA navigations where <title> is not updated (e.g. some file-tree navigations)
// Periodically check the URL and trigger processing only when it actually changes.
setInterval(checkUrl, 1000);
