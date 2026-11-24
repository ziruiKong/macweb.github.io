#!/usr/bin/env node
/**
 * 极简静态服务器（零依赖）。在项目目录运行：
 *   node serve.mjs            # 默认 http://localhost:8000
 *   node serve.mjs 9000       # 指定端口
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2]) || 8000;
const SYNC_INTERVAL_MINUTES = Math.max(1, Number(process.env.DATA_SYNC_INTERVAL_MINUTES) || 60);
const SYNC_INTERVAL_MS = SYNC_INTERVAL_MINUTES * 60_000;
const SYNC_ENABLED = process.env.DATA_SYNC_ENABLED !== "0";
const STATUS_FILE = path.join(__dirname, "data", "sync-status.json");
let syncRunning = false;
let syncTimer = null;
let nextSyncAt = null;
const culpaCache = new Map();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

function readSyncStatus() {
  try {
    return JSON.parse(fs.readFileSync(STATUS_FILE, "utf8"));
  } catch (_) {
    return { status: "pending", term: "2027-Spring", intervalMinutes: SYNC_INTERVAL_MINUTES };
  }
}

function scheduleSync(delayMs) {
  if (!SYNC_ENABLED) return;
  clearTimeout(syncTimer);
  nextSyncAt = new Date(Date.now() + delayMs).toISOString();
  syncTimer = setTimeout(runSync, delayMs);
}

function runSync() {
  if (syncRunning) return;
  syncRunning = true;
  console.log(`[data-sync] starting (${SYNC_INTERVAL_MINUTES} minute schedule)`);
  const child = spawn(process.execPath, [path.join(__dirname, "sync-data.mjs")], {
    cwd: __dirname,
    env: {
      ...process.env,
      DATA_SYNC_INTERVAL_MINUTES: String(SYNC_INTERVAL_MINUTES),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => process.stdout.write(`[data-sync] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[data-sync] ${chunk}`));
  child.on("error", (error) => {
    console.error(`[data-sync] could not start: ${error.message}`);
  });
  child.on("exit", (code) => {
    syncRunning = false;
    console.log(`[data-sync] finished with code ${code}`);
    scheduleSync(SYNC_INTERVAL_MS);
  });
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "columbia-course-planner/1.0",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function getCulpaCourse(code) {
  const normalized = String(code || "").trim().toUpperCase();
  const cached = culpaCache.get(normalized);
  if (cached && Date.now() - cached.createdAt < 6 * 60 * 60 * 1000) return cached.value;

  const searchUrl = `https://culpa.info/api/course/search?queryString=${encodeURIComponent(normalized)}&maxResults=10`;
  const results = await fetchJson(searchUrl);
  const match = results.find((item) =>
    String(item.course_header?.course_code || "").toUpperCase() === normalized);
  if (!match) {
    const value = { ok: false, code: normalized, reviews: [], reviewCount: 0 };
    culpaCache.set(normalized, { createdAt: Date.now(), value });
    return value;
  }

  const courseId = match.course_header.course_id;
  const [card, reviews] = await Promise.all([
    fetchJson(`https://culpa.info/api/course_page/card/${courseId}`),
    fetchJson(`https://culpa.info/api/review/course/${courseId}?page=1&sort_key=recent`),
  ]);
  const value = {
    ok: true,
    code: match.course_header.course_code,
    courseId,
    courseName: match.course_header.course_name,
    reviewCount: card.course_summary?.num_reviews ?? reviews.number_of_reviews ?? 0,
    averageRating: card.course_summary?.avg_rating ?? null,
    reviews: (reviews.reviews || []).slice(0, 5).map((review) => ({
      id: review.review_id,
      rating: review.rating,
      content: review.content,
      workload: review.workload,
      date: review.submission_date,
      professor: [review.professor_header?.first_name, review.professor_header?.last_name].filter(Boolean).join(" "),
      agreeCount: review.agree_count,
      disagreeCount: review.disagree_count,
    })),
  };
  culpaCache.set(normalized, { createdAt: Date.now(), value });
  return value;
}

const server = http.createServer(async (req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  if (urlPath === "/api/culpa-course") {
    const requestUrl = new URL(req.url, "http://localhost");
    const code = requestUrl.searchParams.get("code") || "";
    try {
      const payload = await getCulpaCourse(code);
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(payload));
    } catch (_) {
      res.writeHead(502, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify({ ok: false, error: "CULPA is temporarily unavailable." }));
    }
    return;
  }
  if (urlPath === "/api/data-status") {
    const payload = {
      ...readSyncStatus(),
      intervalMinutes: SYNC_INTERVAL_MINUTES,
      nextSyncAt: nextSyncAt || readSyncStatus().nextSyncAt || null,
      syncRunning,
      serverTime: new Date().toISOString(),
    };
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(payload));
    return;
  }
  const filePath = path.join(__dirname, urlPath);
  // 防目录穿越
  const rel = path.relative(__dirname, filePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 Not Found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": [".html", ".js", ".json"].includes(ext) ? "no-cache" : "public, max-age=3600",
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Columbia Course Planner 已启动：http://localhost:${PORT}`);
  console.log(`数据同步：每 ${SYNC_INTERVAL_MINUTES} 分钟一次`);
  console.log("按 Ctrl+C 停止。");
  scheduleSync(2_000);
});
