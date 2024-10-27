console.log("git extension test");

// Convert SSH URL to HTTP URL
function convertSshToHttp(sshUrl) {
  const sshPattern = /^git@([\w.-]+):([\w.-]+)\/([\w.-]+)\.git$/;
  const match = sshUrl.match(sshPattern);
  if (match) {
    const domain = match[1];
    const username = match[2];
    const repository = match[3];
    return `https://${domain}/${username}/${repository}.git`;
  } else {
    console.error("Invalid SSH URL format");
    return null;
  }
}

// Parse repository data from code lines and create an object
function parseReposData(codeLines) {
  if (!codeLines) {
    console.error("No code lines found");
    return null;
  }

  let repos = {};
  let reposId = "";

  for (let i = 0; i < codeLines.length; i++) {
    const codeLine = codeLines[i];
    const codeLineText = codeLine.innerText.trim();

    if (codeLineText.startsWith("type: ")) {
      reposId = codeLine.id.trim();
      const type = codeLineText.replace("type: ", "");
      repos[reposId] = { type: type };
    } else if (
      codeLineText.startsWith("url: ") &&
      codeLine.id === "LC" + (parseInt(reposId.slice(2)) + 1)
    ) {
      let url = codeLineText.replace("url: ", "").trim();
      if (!url.startsWith("https://") && url.startsWith("git@")) {
        url = convertSshToHttp(url);
        if (!url) {
          console.error("Failed to convert SSH URL to HTTP");
          continue;
        }
      }
      repos[reposId].url = url;
    } else if (
      codeLineText.startsWith("version: ") &&
      codeLine.id === "LC" + (parseInt(reposId.slice(2)) + 2)
    ) {
      const version = codeLineText.replace("version: ", "").trim();
      repos[reposId].version = version;
      reposId = "";
    } else {
      reposId = "";
    }
  }

  return Object.keys(repos).length > 0 ? repos : null;
}

// Function to get the position of the text area
function getTextareaRect() {
  const textarea = document.getElementById("read-only-cursor-text-area");
  if (!textarea) {
    console.error("Textarea not found");
    return null;
  }
  return textarea.getBoundingClientRect();
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

    const commitHashPattern = /^[0-9a-f]{40}$/;
    if (!repo.version) {
      repo.url = repo.url.replace(".git", "");
    } else if (commitHashPattern.test(repo.version)) {
      repo.url = repo.url.replace(".git", "") + "/blob/" + repo.version;
    } else {
      repo.url = repo.url.replace(".git", "") + "/tree/" + repo.version;
    }

    const codeLineElement = codeLinesElement.querySelector("#" + key);
    if (!codeLineElement) {
      console.error(`Code line element not found for key: ${key}`);
      continue;
    }

    const rect = codeLineElement.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    const left = textareaRect.left - 50;

    const link = document.createElement("a");
    link.href = repo.url;
    link.style.position = "absolute";
    link.style.zIndex = "999";
    link.style.top = `${top}px`;
    link.style.left = `${left}px`;

    const button = document.createElement("button");
    button.className = "open-repo-button";
    button.innerHTML = "Open";
    link.appendChild(button);

    document.body.appendChild(link);
  }
}

function removeRepoButtons() {
  const buttons = document.querySelectorAll(".open-repo-button");
  buttons.forEach((button) => button.remove());
}

function init() {
  try {
    const reposFile = document.getElementsByClassName(
      "Box-sc-g0xbh4-0 react-code-file-contents"
    )[0];
    console.log(reposFile);
    const codeLinesElement =
      reposFile.getElementsByClassName("react-code-lines")[0];
    const codeLines =
      codeLinesElement.getElementsByClassName("react-file-line");

    const repos = parseReposData(codeLines);
    displayRepoButtons(repos, codeLinesElement);
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

function observeDOMChanges() {
  const observer = new MutationObserver(() => {
    const reposFile = document.getElementsByClassName(
      "Box-sc-g0xbh4-0 react-code-file-contents"
    )[0];
    const textarea = document.getElementById("read-only-cursor-text-area");

    if (reposFile && textarea) {
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
