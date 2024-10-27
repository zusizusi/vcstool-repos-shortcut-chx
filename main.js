console.log("Hello from vcstool repos shortcut extension");

const SSH_PATTERN = /^git@([\w.-]+):([\w.-]+)\/([\w.-]+)\.git$/;
const COMMIT_HASH_PATTERN = /^[0-9a-f]{40}$/;
const CODE_FILE_CLASS = "Box-sc-g0xbh4-0 react-code-file-contents";
const CODE_LINES_CLASS = "react-code-lines";
const FILE_LINE_CLASS = "react-file-line";
const TEXTAREA_ID = "read-only-cursor-text-area";
const BUTTON_CLASS = "open-repo-button";

// Convert SSH URL to HTTP URL
function convertSshToHttp(sshUrl) {
  const match = sshUrl.match(SSH_PATTERN);
  if (match) {
    const [_, domain, username, repository] = match;
    return `https://${domain}/${username}/${repository}.git`;
  } else {
    console.error("Invalid SSH URL format:", sshUrl);
    return null;
  }
}

// Parse repository data from code lines and create an object
function parseReposData(codeLines) {
  if (!codeLines) {
    console.error("No code lines found");
    return null;
  }

  const repos = {};
  let reposId = "";

  for (const codeLine of codeLines) {
    const codeLineText = codeLine.innerText.trim();

    if (codeLineText.startsWith("type: ")) {
      reposId = codeLine.id.trim();
      repos[reposId] = { type: codeLineText.replace("type: ", "") };
    } else if (
      codeLineText.startsWith("url: ") &&
      codeLine.id === `LC${parseInt(reposId.slice(2)) + 1}`
    ) {
      let url = codeLineText.replace("url: ", "").trim();
      if (!url.startsWith("https://") && url.startsWith("git@")) {
        url = convertSshToHttp(url);
        if (!url) continue;
      }
      repos[reposId].url = url;
    } else if (
      codeLineText.startsWith("version: ") &&
      codeLine.id === `LC${parseInt(reposId.slice(2)) + 2}`
    ) {
      repos[reposId].version = codeLineText.replace("version: ", "").trim();
      reposId = "";
    } else {
      reposId = "";
    }
  }

  return Object.keys(repos).length > 0 ? repos : null;
}

// Function to get the position of the text area
function getTextareaRect() {
  const readOnlyTextArea = document.getElementById(TEXTAREA_ID);
  if (!readOnlyTextArea) {
    console.error("Textarea not found");
    return null;
  }
  return readOnlyTextArea.getBoundingClientRect();
}

function createRepoButton(repo, top, left) {
  const link = document.createElement("a");
  link.href = repo.url;
  link.style.position = "absolute";
  link.style.zIndex = "999";
  link.style.top = `${top}px`;
  link.style.left = `${left}px`;

  const button = document.createElement("button");
  button.className = BUTTON_CLASS;
  button.innerHTML = "Open";
  link.appendChild(button);

  document.body.appendChild(link);
}

function displayRepoButtons(repos, codeLinesElement) {
  if (!repos) {
    console.error("No repository data available");
    return;
  }

  const textareaRect = getTextareaRect();
  if (!textareaRect) {
    console.error("Failed to get textarea rect");
    return;
  }

  for (const key in repos) {
    const repo = repos[key];
    if (!repo.url || !repo.type) {
      console.warn(`Incomplete repository data for key: ${key}`);
      continue;
    }

    if (!repo.type.includes("git")) {
      console.warn("Repository type is not git");
      continue;
    }

    if (!repo.version) {
      repo.url = repo.url.replace(".git", "");
    } else if (COMMIT_HASH_PATTERN.test(repo.version)) {
      repo.url = repo.url.replace(".git", "") + "/blob/" + repo.version;
    } else {
      repo.url = repo.url.replace(".git", "") + "/tree/" + repo.version;
    }

    const codeLineElement = codeLinesElement.querySelector(`#${key}`);
    if (!codeLineElement) {
      console.error(`Code line element not found for key: ${key}`);
      continue;
    }

    const rect = codeLineElement.getBoundingClientRect();
    createRepoButton(repo, rect.top + window.scrollY, textareaRect.left - 50);
  }
}

function removeRepoButtons() {
  const buttons = document.querySelectorAll(`.${BUTTON_CLASS}`);
  buttons.forEach((button) => button.remove());
}

function init() {
  try {
    const codeFileContentsElements =
      document.getElementsByClassName(CODE_FILE_CLASS)[0];
    if (!codeFileContentsElements) {
      console.error("Repos file element not found");
      return;
    }

    const codeLinesElement =
      codeFileContentsElements.getElementsByClassName(CODE_LINES_CLASS)[0];
    if (!codeLinesElement) {
      console.error("Code lines element not found");
      return;
    }

    const codeLines = codeLinesElement.getElementsByClassName(FILE_LINE_CLASS);
    const repos = parseReposData(codeLines);
    displayRepoButtons(repos, codeLinesElement);
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

function observeDOMChanges() {
  const observer = new MutationObserver(() => {
    const codeFileContentsElements =
      document.getElementsByClassName(CODE_FILE_CLASS)[0];
    const readOnlyTextArea = document.getElementById(TEXTAREA_ID);

    if (codeFileContentsElements && readOnlyTextArea) {
      observer.disconnect();
      init();
    }
  });

  observer.observe(document, { subtree: true, childList: true });
}

// Monitor URL changes
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    if (lastUrl.includes(".repos")) {
      removeRepoButtons();
    }
    lastUrl = url;
    if (url.includes(".repos")) {
      observeDOMChanges();
    }
  }
}).observe(document, { subtree: true, childList: true });

// Initial check if the page is loaded directly with .repos file
if (location.href.includes(".repos")) {
  observeDOMChanges();
}
