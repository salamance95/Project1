/** 서버 시작. 기본 포트는 파이썬 백엔드와 겹치지 않게 8003을 쓴다. */

import { createApp } from "./app.js";
import { databasePath } from "./core/db.js";
import { seedMaster } from "./db/seed.js";

const PORT = Number(process.env.PORT ?? 8003);

seedMaster();

createApp().listen(PORT, () => {
  console.log(`fitness-backend-js: http://127.0.0.1:${PORT}`);
  console.log(`database: ${databasePath}`);
});
