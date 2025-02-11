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
    console.log("Invalid SSH URL format:", sshUrl);
    return null;
  }
}

//function to extract field values from a line.
function getFieldValue(text, prefix) {
  if (text.startsWith(prefix)) {
    return text.slice(prefix.length).split("#")[0].trim();
  }
  return null;
}

// function to apply version logic.
function applyVersionLogic(repo) {
  if (repo.type && repo.type.includes("git") && repo.url) {
    let baseUrl = repo.url;
    if (baseUrl.endsWith(".git")) {
      baseUrl = baseUrl.slice(0, -4);
    }
    if (repo.version) {
      if (COMMIT_HASH_PATTERN.test(repo.version)) {
        repo.url = baseUrl + "/blob/" + repo.version;
      } else {
        repo.url = baseUrl + "/tree/" + repo.version;
      }
    } else {
      repo.url = baseUrl;
    }
  }
}

// Add a global repositories object to persist across invocations.
let storedRepositories = {};

function parseRepositoryData(repositories, codeLines) {
  if (!codeLines) {
    console.error("No code lines found");
    return null;
  }
  let currentBlock = [];

  function processBlock(blockLines) {
    if (blockLines.length === 0) return;
    const repoKeyLine = blockLines[0].innerText.trim();
    const repoName = repoKeyLine.split(":")[0].trim();
    // Skip if already stored in storedRepositories.
    if (repositories[repoName]) return;
    const repo = { name: repoName };
    console.debug("Processing repository:", repoName);

    for (let i = 1; i < blockLines.length; i++) {
      const text = blockLines[i].innerText.trim();
      if (!text || text.startsWith("#")) continue;
      let value;
      if ((value = getFieldValue(text, "type:"))) {
        repo.type = value;
      } else if ((value = getFieldValue(text, "url:"))) {
        if (!value.startsWith("https://") && value.startsWith("git@")) {
          value = convertSshToHttp(value);
          if (!value) continue;
        }
        repo.url = value;
      } else if ((value = getFieldValue(text, "version:"))) {
        repo.version = value;
      }
    }
    applyVersionLogic(repo);
    repo.key = blockLines[0].id || repoName;
    if (repo.url && repo.type && repo.version && repo.key) {
      repositories[repoName] = repo;
    }
  }

  // Iterate over all code lines and split into repository blocks.
  for (const codeLine of codeLines) {
    const lineText = codeLine.innerText.trim();
    if (/^[\w.\-\/_]+:\s*(#.*)?$/.test(lineText)) {
      if (codeLine.id === "LC1" && lineText === "repositories:") {
        continue;
      }
      if (currentBlock.length > 0) {
        processBlock(currentBlock);
      }
      currentBlock = [codeLine];
    } else {
      if (currentBlock.length > 0) {
        currentBlock.push(codeLine);
      }
    }
  }
  if (currentBlock.length > 0) {
    processBlock(currentBlock);
  }
  return Object.keys(repositories).length > 0 ? repositories : null;
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

function displayRepoButtons(repositories, codeLinesElement) {
  if (!repositories) {
    console.error("No repository data available");
    return;
  }

  const textareaRect = getTextareaRect();
  if (!textareaRect) {
    console.error("Failed to get textarea rect");
    return;
  }

  for (const key_name in repositories) {
    const repo = repositories[key_name];
    if (repo.name == "repositories" && repo.key == "LC1") {
      continue;
    }
    if (!repo.url || !repo.type) {
      console.warn(`Incomplete repository data for key: ${repo.key}, name: ${repo.name}, url: ${repo.url}, type: ${repo.type}, version: ${repo.version}`);
      continue;
    }

    if (!repo.type.includes("git")) {
      console.warn("Repository type is not git");
      continue;
    }

    const codeLineElement = codeLinesElement.querySelector(`#${repo.key}`);
    if (!codeLineElement) {
      console.error(`Code line element not found for key: ${repo.key}`);
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

function getElementByClass(className) {
  const element = document.getElementsByClassName(className)[0];
  if (!element) {
    console.error(`Element with class ${className} not found`);
    return null;
  }
  return element;
}


function updateRepoButtons(codeLinesElement) {
  const codeLines = codeLinesElement.getElementsByClassName(FILE_LINE_CLASS);
  parseRepositoryData(storedRepositories, codeLines);
  removeRepoButtons();
  displayRepoButtons(storedRepositories, codeLinesElement);
}

function registerEventListeners(codeLinesElement) {
  window.addEventListener("resize", () => {
    updateRepoButtons(codeLinesElement);
  });

  let scrollDebounce;
  window.addEventListener("scroll", () => {
    clearTimeout(scrollDebounce);
    scrollDebounce = setTimeout(() => {
      updateRepoButtons(codeLinesElement);
    }, 100);
  });
}

function init() {
  try {
    const codeFileContentsElement = getElementByClass(CODE_FILE_CLASS);
    if (!codeFileContentsElement) return;

    const codeLinesElement =
      codeFileContentsElement.getElementsByClassName(CODE_LINES_CLASS)[0];
    if (!codeLinesElement) {
      console.error("Code lines element not found");
      return;
    }

    updateRepoButtons(codeLinesElement);
    registerEventListeners(codeLinesElement);
  } catch (error) {
    console.error("An error occurred:", error);
  }
}


const findFilenameElement = () => {
  const fileNameElement = document.getElementById("file-name-id");
  const wideFileNameElement = document.getElementById("file-name-id-wide");
  if (!fileNameElement && !wideFileNameElement) {
    return null;
  }
  return fileNameElement || wideFileNameElement;
};

function getCurrentFilename() {
  const element = findFilenameElement();
  return element ? element.textContent || "" : "";
}

function isReposFilename(filename) {
  return filename.includes(".repos");
}

// Centralized handling for filename logic
let filenameDebounce;

function handleFilenameChange(newFilename) {
  if (!newFilename) {
    removeRepoButtons();
    previousFilename = "";
    return;
  }
  const previouslyRepos = isReposFilename(previousFilename);
  const currentlyRepos = isReposFilename(newFilename);

  if (
    currentlyRepos &&
    (!previousFilename || !previouslyRepos || previousFilename !== newFilename)
  ) {
    storedRepositories = {};
    removeRepoButtons();
    clearTimeout(filenameDebounce);
    filenameDebounce = setTimeout(() => {
      init();
    }, 500);

    console.debug("Filename changed to include .repos");
  } else if (previouslyRepos && !currentlyRepos) {
    console.debug("Filename changed to exclude .repos");
    removeRepoButtons();
    storedRepositories = {};
  }
  previousFilename = newFilename;
}

let previousFilename = "";

function observeFilenameChanges() {
  const observer = new MutationObserver(() => {
    const updatedFilename = getCurrentFilename();
    handleFilenameChange(updatedFilename);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Initial check
  const initialFilename = getCurrentFilename();
  if (isReposFilename(initialFilename)) {
    removeRepoButtons();
    init();
  }
  previousFilename = initialFilename;
}
observeFilenameChanges();
