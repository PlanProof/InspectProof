import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static sample plans (PDFs for mobile testing)
app.use(
  "/api/storage/sample-plans",
  express.static(path.join(__dirname, "..", "static", "sample-plans"), {
    setHeaders(res) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Disposition", "inline");
    },
  }),
);

app.use("/api", router);

export default app;
