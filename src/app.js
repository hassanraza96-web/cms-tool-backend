import express from "express";
import githubRoute from "./routes/github-route.js";
import cookieParser from 'cookie-parser'
import cors from "cors";
const app = express();

app.use(cors({
    origin: [
        "http://localhost:3007",
        "https://cms.myurbanlimos.com",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(cookieParser());

app.get("/", (req, res) => {
    res.json({
        server: "running is true"
    })
});

app.use("/api/github", githubRoute);

export default app;