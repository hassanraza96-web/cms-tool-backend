import dotenv from "dotenv";
import app from "./src/app.js";
dotenv.config();



app.listen(process.env.PORT, () => {
    console.log(`http://localhost:${process.env.PORT}`, "Server in Runing");
});