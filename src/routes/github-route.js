import express, { json } from "express";
import { createOrUpdateFile, deleteFile, getDeploymentStatus, getLatestCommit, readFileOrFolder, uploadLargeJsonToGitHub } from "../models/github-model.js";
import project from "../config/projects.json" with { type: "json" };

const seleted = 0
const owner = project[seleted].owner;
const repo = project[seleted].repo;
const route = express.Router();
function getTokken() {
    const point = JSON.parse(process.env.TOKKEN);
    return point ? point[project[seleted].tokken] : "";
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

export default route;