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
function parseRepositoryData(codeLines) {
  if (!codeLines) {
    console.error("No code lines found");
    return null;
  }

  const repositories = {};
  let currentRepositoryId = "";

  for (const codeLine of codeLines) {
    const lineText = codeLine.innerText.trim();

    // Skip comments and repository key lines
    if (lineText.startsWith("#") || /^[\w\.-]+:\s*$/.test(lineText)) {
      continue;
    }

    if (lineText.startsWith("type: ")) {
      currentRepositoryId = codeLine.id.trim();
      const typeValue = lineText.replace("type: ", "").split("#")[0].trim();
      repositories[currentRepositoryId] = { type: typeValue };
    } else if (lineText.startsWith("url: ") && currentRepositoryId) {
      let url = lineText.replace("url: ", "").split("#")[0].trim();
      if (!url.startsWith("https://") && url.startsWith("git@")) {
        url = convertSshToHttp(url);
        if (!url) continue;
      }
      repositories[currentRepositoryId].url = url;
    } else if (lineText.startsWith("version: ") && currentRepositoryId) {
      const versionValue = lineText.replace("version: ", "").split("#")[0].trim();
      repositories[currentRepositoryId].version = versionValue;
      // Apply version logic once
      if (repositories[currentRepositoryId].type.includes("git") && repositories[currentRepositoryId].url) {
        if (!versionValue) {
          repositories[currentRepositoryId].url = repositories[currentRepositoryId].url.replace(".git", "");
        } else if (COMMIT_HASH_PATTERN.test(versionValue)) {
          repositories[currentRepositoryId].url =
            repositories[currentRepositoryId].url.replace(".git", "") + "/blob/" + versionValue;
        } else {
          repositories[currentRepositoryId].url =
            repositories[currentRepositoryId].url.replace(".git", "") + "/tree/" + versionValue;
        }
      }
      currentRepositoryId = "";
    }
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

  for (const key in repositories) {
    const repo = repositories[key];
    if (!repo.url || !repo.type) {
      console.warn(`Incomplete repository data for key: ${key}`);
      continue;
    }

    if (!repo.type.includes("git")) {
      console.warn("Repository type is not git");
      continue;
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
  const repositories = parseRepositoryData(codeLines);
  removeRepoButtons();
  displayRepoButtons(repositories, codeLinesElement);
}

function registerEventListeners(codeLinesElement) {
  window.addEventListener("resize", () => {
    updateRepoButtons(codeLinesElement);
  });

  let debounceTimeout;
  window.addEventListener("scroll", () => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
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

function findFilenameElement() {
  const fileNameElement = document.getElementById("file-name-id");
  const wideFileNameElement = document.getElementById("file-name-id-wide");
  if (!fileNameElement && !wideFileNameElement) {
    // console.log("file-name-id-wide not found");
    return null;
  }
  return fileNameElement || wideFileNameElement;
}

function getCurrentFilename() {
  const element = findFilenameElement();
  return element ? element.textContent || "" : "";
}

function isReposFilename(filename) {
  return filename.includes(".repos");
}

// Centralized handling for filename logic
let debounceTimeout;

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
    removeRepoButtons();
    // Wait for the file to load
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      init();
    }, 500);

    console.log("Filename changed to include .repos");
  } else if (previouslyRepos && !currentlyRepos) {
    console.log("Filename changed to exclude .repos");
    removeRepoButtons();
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
