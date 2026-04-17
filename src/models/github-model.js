import axios from "axios";
import https from "https";

// Common headers for GitHub API
function getHeaders(token) {
    return {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
    };
}

// 1. CREATE or UPDATE file
export async function createOrUpdateFile(owner, repo, path, contentText, token, message) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const content = Buffer.from(contentText).toString('base64');

    try {
        const response = await axios.get(url, { headers: getHeaders(token) });
        const sha = response.data.sha;

        const updateResponse = await axios.put(
            url,
            { message, content, sha },
            { headers: getHeaders(token) }
        );

        return {
            status: "updated",
            url: updateResponse.data.content.download_url
        };

    } catch (error) {
        if (error.response?.status === 404) {
            const createResponse = await axios.put(
                url,
                { message, content },
                { headers: getHeaders(token) }
            );

            return {
                status: "created",
                url: createResponse.data.content.download_url
            };
        }

        throw error;
    }
}


// 2. READ file or folder contents
export async function readFileOrFolder(owner, repo, path, token) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    try {
        const response = await axios.get(url, { headers: getHeaders(token) });
        return response.data; // ye file ya folder ka data return karega
    } catch (error) {
        console.error('Error fetching:', error.response ? error.response.data : error.message);
        return null;
    }
}

// 3. DELETE file
export async function deleteFile(owner, repo, path, token, message) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    try {
        const response = await axios.get(url, { headers: getHeaders(token) });
        const sha = response.data.sha;

        const deleteResponse = await axios.delete(url, {
            headers: getHeaders(token),
            data: { message, sha }
        });
        console.log('File deleted:', deleteResponse.data.content ? deleteResponse.data.content.download_url : path);
        return {
            deleted: "successfully deleted at " + repo, raw: "Successfully Deleted",
            success: true
        }
    } catch (error) {
        console.error('Error deleting:', error.response ? error.response.data : error.message);
        return {
            deleted: "server error at " + repo, raw: "Please review the file and try again. If the issue persists, kindly contact Adeel for further assistance or clarification.",
            success: true
        }
    }
}


async function getAllFilesViaTree(owner, repo, folderPath, token) {
    const repoRes = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}`,
        { headers: getHeaders(token) }
    );
    const branch = repoRes.data.default_branch;

    const branchRes = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/branches/${branch}`,
        { headers: getHeaders(token) }
    );
    const treeSha = branchRes.data.commit.commit.tree.sha;

    const treeRes = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`,
        { headers: getHeaders(token) }
    );

    return treeRes.data.tree.filter(
        (item) => item.type === "blob" && item.path.startsWith(folderPath + "/")
    );
}


export async function deleteFolderModal({ owner, repo, folderPath, token, message }) {
    try {
        const files = await getAllFilesViaTree(owner, repo, folderPath, token);

        if (files.length === 0) {
            return {
                success: false,
                raw: "Folder nahi mila ya already khali hai.",
                deleted: null,
            };
        }

        for (const file of files) {
            await axios.delete(
                `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}`,
                {
                    headers: getHeaders(token),
                    data: { message: `${message} - ${file.path}`, sha: file.sha },
                }
            );
        }

        return {
            success: true,
            raw: `Successfully deleted folder "${folderPath}" from ${repo}`,
            deleted: `${files.length} files deleted`,
        };
    } catch (error) {
        return {
            success: false,
            raw: error.response?.data?.message || error.message,
            deleted: null,
        };
    }
}

// --------------------
// Example usage
// const owner = 'YOUR_GITHUB_USERNAME';
// const repo = 'YOUR_REPO_NAME';
// const token = 'YOUR_PERSONAL_ACCESS_TOKEN';

// // CREATE or UPDATE
// createOrUpdateFile(owner, repo, 'test.txt', 'Hello from Node.js', token, 'Create or update test.txt');

// // READ folder (root folder)
// readFileOrFolder(owner, repo, '', token).then(data => console.log('Repo contents:', data));

// // DELETE file
// // deleteFile(owner, repo, 'test.txt', token, 'Delete test.txt');






/** Split array into small chunks based on maxBytes */
function splitJsonArray(array, maxBytes = 2 * 1024 * 1024) {
    const chunks = [];
    let currentChunk = [];
    let currentSize = 0;

    for (const item of array) {
        const itemStr = JSON.stringify(item);
        const itemSize = Buffer.byteLength(itemStr, 'utf8');

        if (currentSize + itemSize > maxBytes && currentChunk.length > 0) {
            chunks.push(currentChunk);
            currentChunk = [];
            currentSize = 0;
        }

        currentChunk.push(item);
        currentSize += itemSize;
    }

    if (currentChunk.length > 0) chunks.push(currentChunk);
    return chunks;
}

/** Upload single chunk to GitHub */
async function putJsonChunk({ token, owner, repo, path, branch = 'main', data }) {
    const base64Content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');

    try {
        const res = await axios.put(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
            message: `Add chunk ${path}`,
            content: base64Content,
            branch
        }, {
            headers: { Authorization: `token ${token}` },
            timeout: 60000
        });

        return { success: true, url: res.data.content.download_url };
    } catch (err) {
        return { success: false, error: err.response?.data || err.message };
    }
}

/** Main exportable function with custom chunk size */
export async function uploadLargeJsonToGitHub({
    token,
    owner,
    repo,
    branch = 'main',
    data,
    filePrefix = 'data-part',
    parallel = 5,
    chunkSizeBytes = 2 * 1024 * 1024 // default 2MB
}) {
    if (!Array.isArray(data)) throw new Error('Data must be an array');

    // Split into chunks using custom size
    const chunks = splitJsonArray(data, chunkSizeBytes);
    console.log(`Total chunks: ${chunks.length}`);

    const results = [];
    let index = 0;

    while (index < chunks.length) {
        const batch = chunks.slice(index, index + parallel);
        const batchPromises = batch.map((chunk, i) =>
            putJsonChunk({
                token,
                owner,
                repo,
                branch,
                path: `${filePrefix}-${index + i + 1}.json`,
                data: chunk
            })
        );

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        console.log(`Uploaded chunks ${index + 1} to ${index + batch.length}`);
        index += parallel;
    }

    return results;
}



export async function getLatestCommit(owner, repo, token, branch = "main") {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`;

    const res = await axios.get(url, {
        headers: getHeaders(token)
    });

    return {
        sha: res.data.sha,
        message: res.data.commit.message,
        author: res.data.commit.author.name,
        date: res.data.commit.author.date,
        data: res.data
    };
}


export async function getDeploymentStatus(owner, repo, sha, token) {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits/${sha}/statuses`;

    const res = await axios.get(url, {
        headers: getHeaders(token)
    });

    // return res.data.map(s => ({
    //     state: s.state,              // success | failure | pending | error
    //     description: s.description,  // build failed, preview ready etc
    //     context: s.context,          // netlify / vercel
    //     target_url: s.target_url,     // preview / logs link
    // }));
    return res.data;
}



/**
 * GitHub Repo Tree Model
 *
 * Usage:
 *   const tree = new GitHubTree({ owner, repo, token });
 *
 *   // poora tree
 *   await tree.fetch();
 *
 *   // sirf ek folder ka tree
 *   await tree.fetch("src/components");
 */

export class GitHubTree {
    constructor({ owner, repo, branch = null, token = null }) {
        if (!owner || !repo) throw new Error("owner aur repo required hain");
        this.owner = owner;
        this.repo = repo;
        this.branch = branch;
        this.token = token;
    }

    _get(path) {
        return new Promise((resolve, reject) => {
            const req = https.request(
                {
                    hostname: "api.github.com",
                    path,
                    method: "GET",
                    headers: {
                        "User-Agent": "github-tree-model",
                        Accept: "application/vnd.github+json",
                        ...(this.token && { Authorization: `Bearer ${this.token}` }),
                    },
                },
                (res) => {
                    let raw = "";
                    res.on("data", (c) => (raw += c));
                    res.on("end", () => {
                        try {
                            const json = JSON.parse(raw);
                            if (res.statusCode >= 400)
                                return reject(new Error(`GitHub ${res.statusCode}: ${json.message}`));
                            resolve(json);
                        } catch (e) {
                            reject(new Error("Parse error: " + e.message));
                        }
                    });
                }
            );
            req.on("error", reject);
            req.end();
        });
    }

    async _defaultBranch() {
        const data = await this._get(`/repos/${this.owner}/${this.repo}`);
        return data.default_branch || "main";
    }

    _buildNested(flatTree) {
        const root = { name: "root", path: "", folder_child: {}, files: [] };
        const folderMap = { "": root };

        for (const item of flatTree) {
            if (item.type !== "tree") continue;
            const parts = item.path.split("/");
            const node = {
                name: parts[parts.length - 1],
                path: item.path,
                folder_child: {},
                files: [],
            };
            folderMap[item.path] = node;
            const parentPath = parts.slice(0, -1).join("/");
            const parent = folderMap[parentPath] || root;
            parent.folder_child[node.name] = node;
        }

        for (const item of flatTree) {
            if (item.type !== "blob") continue;
            const parts = item.path.split("/");
            const parentPath = parts.slice(0, -1).join("/");
            const parent = folderMap[parentPath] || root;
            parent.files.push({
                name: parts[parts.length - 1],
                path: item.path,
                size: item.size ?? 0,
            });
        }

        return { root, folderMap };
    }

    // path ke mutabiq node nikalo
    _getNodeByPath(root, folderMap, filterPath) {
        if (!filterPath || filterPath === "") return root;

        // folderMap mein direct lookup
        if (folderMap[filterPath]) return folderMap[filterPath];

        // nahi mila
        return null;
    }

    async fetch(filterPath = "") {
        if (!this.branch) {
            this.branch = await this._defaultBranch();
        }

        const data = await this._get(
            `/repos/${this.owner}/${this.repo}/git/trees/${this.branch}?recursive=1`
        );

        const flat = data.tree || [];
        const { root, folderMap } = this._buildNested(flat);

        // agar path diya hai toh sirf us node ka result do
        const targetNode = this._getNodeByPath(root, folderMap, filterPath);

        if (!targetNode) {
            return {
                meta: {
                    owner: this.owner,
                    repo: this.repo,
                    branch: this.branch,
                    path: filterPath,
                    error: `Path "${filterPath}" nahi mila repo mein`,
                },
                tree: null,
            };
        }

        // stats sirf is node ke andar ki count karo
        const countFiles = (node) => {
            let count = node.files.length;
            for (const child of Object.values(node.folder_child)) {
                count += countFiles(child);
            }
            return count;
        };

        return {
            meta: {
                owner: this.owner,
                repo: this.repo,
                branch: this.branch,
                path: filterPath || "/",
                truncated: data.truncated ?? false,
                totalFiles: countFiles(targetNode),
                totalFolders: Object.keys(folderMap).filter(
                    (k) => k !== "" && k.startsWith(filterPath || "")
                ).length,
            },
            tree: targetNode,
        };
    }
}






// ============================================================
//  HELPER — GitHub API Request
// ============================================================
function githubRequest(config, method, path, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: "api.github.com",
            path,
            method,
            headers: {
                Authorization: `Bearer ${config.token}`,
                Accept: "application/vnd.github+json",
                "User-Agent": "nodejs-github-manager",
                "Content-Type": "application/json",
            },
        };

        const req = https.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    resolve(data);
                }
            });
        });

        req.on("error", reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}



// ============================================================
//  FUNCTION 1 — Multiple Files & Folders Create karo
//
//  @param {Object} config        - GitHub config
//  @param {string} config.token  - GitHub Personal Access Token
//  @param {string} config.owner  - GitHub username
//  @param {string} config.repo   - Repository name
//  @param {string} config.branch - Branch name (e.g. "main")
//
//  @param {Array}  files               - Files ki list
//  @param {string} files[].path        - File ka path (e.g. "src/index.js")
//  @param {string} files[].content     - File ka content
//  @param {string} [files[].mode]      - File mode (default: "100644")
//
//  @param {string} commitMessage - Commit message
// ============================================================
export async function createFilesAndFoldersTree(config, files, commitMessage) {
    try {
        // Step 1: Latest commit SHA
        const branchData = await githubRequest(
            config,
            "GET",
            `/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`
        );
        if (!branchData.object?.sha) throw new Error(`Branch error: ${branchData.message}`);
        const latestCommitSha = branchData.object.sha;

        // Step 2: Base tree SHA
        const commitData = await githubRequest(
            config,
            "GET",
            `/repos/${config.owner}/${config.repo}/git/commits/${latestCommitSha}`
        );
        if (!commitData.tree?.sha) throw new Error(`Commit fetch error: ${commitData.message}`);
        const baseTreeSha = commitData.tree.sha;

        // Step 3: Nayi tree banao
        const tree = files.map((file) => ({
            path: file.path,
            mode: file.mode || "100644",
            type: "blob",
            content: file.content,
        }));
        const treeData = await githubRequest(
            config,
            "POST",
            `/repos/${config.owner}/${config.repo}/git/trees`,
            { base_tree: baseTreeSha, tree }
        );
        if (!treeData.sha) throw new Error(`Tree error: ${treeData.message}`);

        // Step 4: Commit banao
        const newCommitData = await githubRequest(
            config,
            "POST",
            `/repos/${config.owner}/${config.repo}/git/commits`,
            { message: commitMessage, tree: treeData.sha, parents: [latestCommitSha] }
        );
        if (!newCommitData.sha) throw new Error(`New commit error: ${newCommitData.message}`);

        // Step 5: Branch update karo
        const updateData = await githubRequest(
            config,
            "PATCH",
            `/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`,
            { sha: newCommitData.sha }
        );
        if (!updateData.object?.sha) throw new Error(`Branch update error: ${updateData.message}`);

        return {
            success: true,
            commitSha: newCommitData.sha,
            filesCreated: files.map((f) => f.path),
        };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// ============================================================
//  FUNCTION 3 — File Rename karo
//
//  @param {Object} config        - GitHub config (upar dekho)
//  @param {string} oldPath       - Purani file ka path
//  @param {string} newPath       - Nayi file ka path
//  @param {string} commitMessage - Commit message
// ============================================================
export async function renameFile(config, oldPath, newPath, commitMessage) {
    const fileData = await githubRequest(
        config,
        "GET",
        `/repos/${config.owner}/${config.repo}/contents/${oldPath}`
    );
    if (fileData.message) return { success: false, error: `File not found: ${fileData.message}` };

    const content = fileData.content.replace(/\n/g, "");
    const sha = fileData.sha;

    // Nayi file banao
    const createData = await githubRequest(
        config,
        "PUT",
        `/repos/${config.owner}/${config.repo}/contents/${newPath}`,
        {
            message: commitMessage || `Rename: ${oldPath} → ${newPath}`,
            content,
            branch: config.branch,
        }
    );
    if (createData.message) return { success: false, error: createData.message };

    // Purani file delete karo
    const deleteData = await githubRequest(
        config,
        "DELETE",
        `/repos/${config.owner}/${config.repo}/contents/${oldPath}`,
        {
            message: `Delete after rename: ${oldPath}`,
            sha,
            branch: config.branch,
        }
    );
    if (deleteData.message) return { success: false, error: deleteData.message };

    return { success: true, oldPath, newPath };
}






export async function renameFolder(config, oldFolderPath, newFolderPath, commitMessage) {
    try {
        // ─── Step 1: Tree se saari files fetch karo ───────────────────────────
        const repoData = await githubRequest(config, "GET", `/repos/${config.owner}/${config.repo}`);
        const branch = config.branch || repoData.default_branch;

        const branchData = await githubRequest(config, "GET", `/repos/${config.owner}/${config.repo}/branches/${branch}`);
        const treeSha = branchData.commit.commit.tree.sha;

        const treeData = await githubRequest(config, "GET", `/repos/${config.owner}/${config.repo}/git/trees/${treeSha}?recursive=1`);

        const files = treeData.tree.filter(
            (item) => item.type === "blob" && item.path.startsWith(oldFolderPath + "/")
        );

        if (files.length === 0) {
            return { success: false, error: `Folder not found: "${oldFolderPath}"` };
        }

        // ─── Step 2: Har file ka content fetch karo, naye path pe create karo ─
        const results = []
        for (const file of files) {
            const newFilePath = file.path.replace(oldFolderPath, newFolderPath);

            // Content fetch karo
            const fileData = await githubRequest(config, "GET", `/repos/${config.owner}/${config.repo}/contents/${file.path}`);
            if (fileData.message) {
                results.push({ success: false, file: file.path, error: fileData.message });
                continue;
            }

            const content = fileData.content.replace(/\n/g, "");

            // Naye path pe create karo
            const createData = await githubRequest(config, "PUT", `/repos/${config.owner}/${config.repo}/contents/${newFilePath}`,
                {
                    message: commitMessage || `Rename: ${file.path} → ${newFilePath}`,
                    content,
                    branch,
                }
            );
            if (createData.message) {
                results.push({ success: false, file: file.path, error: createData.message });
                continue;
            }

            // Purani file delete karo
            const deleteData = await githubRequest(config, "DELETE", `/repos/${config.owner}/${config.repo}/contents/${file.path}`,
                {
                    message: `Delete after rename: ${file.path}`,
                    sha: file.sha,
                    branch,
                }
            );
            if (deleteData.message) {
                results.push({ success: false, file: file.path, error: deleteData.message });
                continue;
            }

            results.push({ success: true, oldPath: file.path, newPath: newFilePath });
        }

        // ─── Step 3: Result check karo ────────────────────────────────────────
        const failed = results.filter(r => !r.success);
        const passed = results.filter(r => r.success);

        if (failed.length === 0) {
            return {
                success: true,
                oldFolderPath,
                newFolderPath,
                totalRenamed: passed.length,
            };
        }

        return {
            success: false,
            error: `${passed.length} files renamed, ${failed.length} files failed`,
            failed,
            passed,
        };

    } catch (error) {
        return {
            success: false,
            error: error.message || "Unknown error occurred",
        };
    }
}








// Example 1: Multiple files & folders ek saath
// const files = [
//   { path: "README.md",           content: "# My Project" },
//   { path: "src/index.js",        content: 'console.log("Hello!");' },
//   { path: "src/utils/helper.js", content: "module.exports = {};" },
//   { path: "config/config.json",  content: '{ "port": 3000 }' },
//   { path: "logs/.gitkeep",       content: "" }, // empty folder
// ];

// createFilesAndFoldersTree(config, files, "feat: project structure banai")
//   .then(console.log);


// Example 3: File rename
// renameFile(config, "old-name.js", "new-name.js", "refactor: rename ki")
//   .then(console.log);

