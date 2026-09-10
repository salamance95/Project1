/** Express 앱 구성. CORS와 오류 처리는 파이썬(FastAPI) 쪽과 같은 규칙을 따른다. */

import cors from "cors";
import express from "express";

import { router } from "./routes/index.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
      ],
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));

  app.use("/api", router);

  // 없는 경로는 FastAPI와 같은 형태로 응답한다.
  app.use((req, res) => res.status(404).json({ detail: "Not Found" }));

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);

    const status = error.status ?? 500;
    if (status >= 500) console.error(error);

    return res.status(status).json({
      detail: error.detail ?? error.message ?? "Internal Server Error",
    });
  });

  return app;
}
