import express, { json } from "express";
import { createFilesAndFoldersTree, createOrUpdateFile, deleteFile, deleteFolderModal, getDeploymentStatus, getLatestCommit, GitHubTree, readFileOrFolder, uploadLargeJsonToGitHub } from "../models/github-model.js";
import project from "../config/projects.json" with { type: "json" };

const seleted = 0
const owner = project[seleted].owner;
const repo = project[seleted].repo;
const route = express.Router();
function getTokken() {
    if (process.env.TOKKEN) {
        const point = JSON.parse(process.env.TOKKEN);
        return point ? point[project[seleted].tokken] : ""
    } else {
        return "";
    }
}

route.get("/read-file", async (req, res) => {
    const tokken = getTokken();
    const { path } = req.query || "";
    readFileOrFolder(owner, repo, path ? path : "", tokken).then((e) => {
        res.json({
            root: e
        });
    }).catch((err) => {
        res.status(404).json({
            error: err,
        });
    });
});

route.post("/write-file", async (req, res) => {
    const tokken = getTokken();
    try {
        const { fileName, content, commit } = req.body;

        if (!fileName || !content || !commit) {
            return res.status(400).json({ error: "Invalid payload" });
        }

        const result = await createOrUpdateFile(
            owner,
            repo,
            fileName,
            content,
            tokken,
            commit
        );

        return res.status(200).json({
            success: true,
            result
        });

    } catch (err) {
        return res.status(404).json({
            success: false,
            error: err.message || err
        });
    }
});

route.post("/write-large-file", async (req, res) => {
    const tokken = getTokken();
    try {
        const { fileName, content, commit } = req.body;

        if (!fileName || !content || !commit) {
            return res.status(400).json({ error: "Invalid payload" });
        }

        const result = await uploadLargeJsonToGitHub(
            {
                token: tokken,
                owner,
                repo,
                branch: 'main',
                data: content,
                filePrefix: 'data-part',
                parallel: 5,
                chunkSizeBytes: 2 * 1024 * 1024 // default 2MB
            }
            // owner,
            // repo,
            // fileName,
            // content,
            // tokken,
            // commit,
        );

        return res.status(200).json({
            success: true,
            result
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            error: err.message || err
        });
    }
});

route.post("/delete-file", async (req, res) => {
    const tokken = getTokken();
    const { fileName = null, commit = "" } = req?.body;
    if (fileName && commit && fileName !== "" && commit !== "") {
        const result = await deleteFile(owner, repo, fileName, tokken, commit, req, res);
        if (result) {
            res.json(result);
        }
    } else {
        res.json({
            error: "server error",
        })
    }
});

route.post("/delete-folder", async (req, res) => {
    const { folderPath, commit } = req.body;
    const token = getTokken();

    // ─── Validation ───────────────────────────────────────────────
    if (!folderPath || !commit) {
        return res.json({
            success: false,
            message: "folderPath aur commit dono required hain"
        });
    }

    const blockedPaths = ["/", "/src", "/src/app", "src", "src/app"];
    if (blockedPaths.includes(folderPath.trim())) {
        return res.json({
            success: false,
            message: `"${folderPath}" ko delete nahi kar sakte — protected path hai`
        });
    }

    // ─── Delete ───────────────────────────────────────────────────
    const result = await deleteFolderModal({
        owner,
        repo,
        folderPath: folderPath.trim(),
        token,
        message: commit
    });

    return res.json(result);
});

route.get("/get-deployment-info", async (req, res) => {
    const tokken = getTokken();
    const data = await getLatestCommit(owner, repo, tokken, "main");
    if (data.sha) {
        const deploy = await getDeploymentStatus(owner, repo, data.sha, tokken);
        res.json({
            deploy,
            data,
        });
    }
});

route.get("/get-repo", async (req, res) => {
    const { path = "" } = req.query;
    const tokken = getTokken();
    const tree = new GitHubTree({ owner, repo, token: tokken, branch: "main" });
    const result = await tree.fetch(path);
    if (result) {
        res.json(result)
    }
});


route.post("/create-tree", async (req, res) => {
    const token = getTokken();
    const config = {
        token,
        owner,
        repo,
        branch: "main",
    }
    if (!req.body) return res.json({
        error: true,
        message: "bad request"
    });
    const { files, commit } = req?.body;
    if (!files || !commit) return res.json({
        error: true,
        message: "Missing required data: both 'files' and 'commitMessage' must be provided."
    });

    if (!Array.isArray(files)) return res.json({
        error: true,
        message: "'files' must be an array containing file objects."
    });

    if (!files.length) return res.json({
        error: true,
        message: "'files' array cannot be empty. At least one file object is required."
    });

    if (!files.every(file =>
        file &&
        typeof file.path === "string" && file.path.trim() !== "" &&
        typeof file.content === "string"
    )) return res.json({
        error: true,
        message: "Each file must be an object with a valid 'path' (non-empty string) and 'content'."
    });

    const result = await createFilesAndFoldersTree(config, files, commit);

    return res.json(result);
});

export default route; 