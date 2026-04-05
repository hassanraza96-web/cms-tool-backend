import axios from "axios"

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

