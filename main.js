console.log("git extension test");

function convertSshToHttp(sshUrl) {
  const sshPattern = /^git@([\w.-]+):([\w.-]+)\/([\w.-]+)\.git$/;
  const match = sshUrl.match(sshPattern);
  if (match) {
    const domain = match[1];
    const username = match[2];
    const repository = match[3];
    return `https://${domain}/${username}/${repository}.git`;
  } else {
    console.log("Invalid SSH URL format");
    return NaN;
  }
}

let reposFile = document.getElementsByClassName(
  "Box-sc-g0xbh4-0 react-code-file-contents"
)[0];
let codeLinesElement = reposFile.getElementsByClassName("react-code-lines")[0];
let codeLinesBlocks = codeLinesElement.getElementsByClassName(
  "react-no-virtualization-wrapper"
);

let codeLines = [];
if (codeLinesBlocks) {
  for (var i = 0; i < codeLinesBlocks.length; i++) {
    let codeBlock = codeLinesBlocks[i];
    for (var j = 0; j < codeBlock.children.length; j++) {
      let codeLine = codeBlock.children[j];
      codeLines.push(codeLine);
    }
  }
}

let repos = {};
let reposId = "";

// Assuming that type, url, and version are three consecutive lines
for (var i = 0; i < codeLines.length; i++) {
  let codeLine = codeLines[i];
  let codeLineText = codeLine.innerText;
  if (codeLineText.includes("type: ")) {
    reposId = codeLine.id.trim(); // id is the id of type
    let type = codeLineText.replace("type: ", "");
    repos[reposId] = { type: type };
  } else if (
    codeLineText.includes("url: ") &&
    codeLine.id === "LC" + (parseInt(reposId.slice(2)) + 1)
  ) {
    let url = codeLineText.replace("url: ", "").trim();
    if (url.includes("https://") === false && url.includes("git@")) {
      url = convertSshToHttp(url);
      console.log(url);
    }
    repos[reposId].url = url;
  } else if (
    codeLineText.includes("version: ") &&
    codeLine.id === "LC" + (parseInt(reposId.slice(2)) + 2)
  ) {
    let version = codeLineText.replace("version: ", "").trim();
    repos[reposId].version = version;
    reposId = "";
  }
}

// let repos = {
//     reposId: {
//       type: "exampleType",
//       url: "https://example.com",
//       version: "1.0.0"
//     }
//   };

// Get the position and size of the textarea
let textarea = document.getElementById("read-only-cursor-text-area");
let textareaRect = textarea.getBoundingClientRect();

for (let key in repos) {
  let repo = repos[key];
  if (!repo.url || !repo.type || !repo.version) {
    continue;
  }
  if (repo.type.includes("git") === false) {
    console.log("type is not git");
    continue;
  }

  if (repo.version) {
    const commitHashPattern = /^[0-9a-f]{40}$/;
    if (repo.version.match(commitHashPattern)) {
      repo.url = repo.url.replace(".git", "") + "/bolb/" + repo.version;
    } else {
      repo.url = repo.url.replace(".git", "") + "/tree/" + repo.version;
    }
  }

  // Get an element with a specific ID from codeLinesElement
  let codeLineElement = codeLinesElement.querySelector("#" + key);
  let rect = codeLineElement.getBoundingClientRect();
  let top = rect.top + window.scrollY;
  let left = textareaRect.left - 50;

  // Add a button to open the URL next to the text
  let button = document.createElement("button");
  button.style.position = "absolute";
  button.style.zIndex = "999";
  button.style.pointerEvents = "auto";
  button.innerHTML = "open";
  button.onclick = function () {
    window.open(repo.url);
  };
  button.style.top = top + "px";
  button.style.left = left + "px";
  document.body.appendChild(button);
}
