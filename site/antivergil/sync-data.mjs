#!/usr/bin/env node
/**
 * Refresh the course catalog and enrollment snapshots without exposing partially
 * written files to the running site. Suitable for an hourly scheduler or cron.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { refreshOfficialEnrollment } from "./official-enrollment.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TERM = process.env.DATA_SYNC_TERM || "2027-Spring";
const INTERVAL_MINUTES = Math.max(1, Number(process.env.DATA_SYNC_INTERVAL_MINUTES) || 60);
const STATUS_PATH = path.join(ROOT, "data", "sync-status.json");
const STAGE_ROOT = path.join(ROOT, "work", "data-sync-stage");
const stageDir = path.join(STAGE_ROOT, `run-${Date.now()}`);
const stagedCoursesJson = path.join(stageDir, `courses-${TERM}.json`);
const stagedCoursesJs = path.join(stageDir, `courses-${TERM}.js`);
const stagedHistoryDir = path.join(stageDir, "enrollment-history");

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (_) { return fallback; }
}

function readWindowJson(file) {
  const text = fs.readFileSync(file, "utf8");
  const marker = text.indexOf("=");
  if (marker < 0) throw new Error(`Invalid generated data: ${file}`);
  return JSON.parse(text.slice(marker + 1).trim().replace(/;\s*$/, ""));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  fs.copyFileSync(temp, file);
  fs.unlinkSync(temp);
}

function writeStatus(value) {
  writeJson(STATUS_PATH, value);
}

function copyIntoPlace(source, target) {
  if (!fs.existsSync(source)) throw new Error(`Missing generated file: ${source}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      env: { ...process.env, DATA_SYNC_TERM: TERM },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stdout.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `Child process exited with code ${code}`));
    });
  });
}

function updateHistoryIndex(history) {
  const indexPath = path.join(ROOT, "data", "enrollment-history", "index.js");
  let index = {};
  try { index = readWindowJson(indexPath); } catch (_) {}
  index[TERM] = {
    registrationStart: history.registrationStart,
    classesStart: history.classesStart,
    dropDeadline: history.dropDeadline,
    latestDate: history.latestDate || history.baseDate,
    days: history.summary?.length || 0,
  };
  writeJson(
    indexPath.replace(/\.js$/, ".json"),
    index,
  );
  const temp = `${indexPath}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `window.ENROLL_HISTORY_INDEX = ${JSON.stringify(index, null, 1)};`);
  fs.copyFileSync(temp, indexPath);
  fs.unlinkSync(temp);
}

async function main() {
  const previous = readJson(STATUS_PATH, {});
  const startedAt = new Date().toISOString();
  const existingCoursesJson = path.join(ROOT, "data", `courses-${TERM}.json`);
  const existingCoursesJs = path.join(ROOT, "data", `courses-${TERM}.js`);
  const existingHistoryDir = path.join(ROOT, "data", "enrollment-history");
  const historyFiles = [
    `${TERM}.json`,
    `${TERM}.js`,
    `${TERM}-summary.csv`,
    "latest.js",
  ];
  let catalogSource = "live mirror";
  let snapshotSource = "live mirror";
  let mirrorFallbackReason = null;

  fs.mkdirSync(stagedHistoryDir, { recursive: true });
  writeStatus({
    ...previous,
    status: "syncing",
    term: TERM,
    intervalMinutes: INTERVAL_MINUTES,
    lastAttemptAt: startedAt,
    nextSyncAt: new Date(Date.now() + INTERVAL_MINUTES * 60_000).toISOString(),
  });

  try {
    try {
      await runNode([
        path.join(ROOT, "crawler.mjs"),
        "bundle",
        "--out",
        stagedCoursesJson,
        "--with-enrollment",
      ]);
    } catch (error) {
      mirrorFallbackReason = error.message;
      catalogSource = "cached catalog";
      copyIntoPlace(existingCoursesJson, stagedCoursesJson);
      copyIntoPlace(existingCoursesJs, stagedCoursesJs);
      console.warn(`Catalog mirror unavailable; using cached catalog. ${error.message}`);
    }

    try {
      await runNode([
        path.join(ROOT, "snapshot.mjs"),
        TERM,
        "--out-dir",
        stagedHistoryDir,
        "--cache-dir",
        path.join(ROOT, "work", "raw-enroll"),
        "--courses-file",
        stagedCoursesJson,
        "--refresh",
      ]);
    } catch (error) {
      snapshotSource = "cached history";
      for (const name of historyFiles) {
        copyIntoPlace(
          path.join(existingHistoryDir, name),
          path.join(stagedHistoryDir, name),
        );
      }
      console.warn(`Enrollment mirror unavailable; using cached history. ${error.message}`);
    }

    const official = await refreshOfficialEnrollment({
      term: TERM,
      coursesPath: stagedCoursesJson,
      historyDir: stagedHistoryDir,
    });
    const latest = official.compact;
    const stagedTermBase = path.join(stagedHistoryDir, TERM);
    const copyPairs = [
      [stagedCoursesJson, path.join(ROOT, "data", `courses-${TERM}.json`)],
      [stagedCoursesJs, path.join(ROOT, "data", `courses-${TERM}.js`)],
      [`${stagedTermBase}.json`, path.join(ROOT, "data", "enrollment-history", `${TERM}.json`)],
      [`${stagedTermBase}.js`, path.join(ROOT, "data", "enrollment-history", `${TERM}.js`)],
      [`${stagedTermBase}-summary.csv`, path.join(ROOT, "data", "enrollment-history", `${TERM}-summary.csv`)],
      [path.join(stagedHistoryDir, "latest.js"), path.join(ROOT, "data", "enrollment-history", "latest.js")],
    ];
    copyPairs.forEach(([source, target]) => copyIntoPlace(source, target));
    updateHistoryIndex(latest);

    const completedAt = new Date().toISOString();
    writeStatus({
      status: "ready",
      term: TERM,
      intervalMinutes: INTERVAL_MINUTES,
      dataThrough: latest.latestDate,
      snapshotUpdatedAt: latest.updatedAt,
      officialUpdatedAt: official.officialUpdatedAt,
      lastAttemptAt: startedAt,
      lastSuccessfulSyncAt: completedAt,
      nextSyncAt: new Date(Date.now() + INTERVAL_MINUTES * 60_000).toISOString(),
      source: "Columbia Directory of Classes + soid catalog mirror",
      catalogSource,
      snapshotSource,
      subjectsUpdated: official.subjectsUpdated,
      subjectsRequested: official.subjectsRequested,
      matchedSections: official.matched,
      unmatchedSections: official.totalSections - official.matched,
      warning: [
        official.subjectErrors.length
          ? `${official.subjectErrors.length} subject page(s) unavailable; previous counts retained for those sections.`
          : official.matched < official.totalSections
            ? `${official.totalSections - official.matched} sections without a numeric official count retained their previous value.`
            : null,
        mirrorFallbackReason
          ? "Catalog/enrollment mirror was unavailable; official counts were applied to the latest cached catalog."
          : null,
      ].filter(Boolean).join(" ") || null,
      lastError: null,
    });
    console.log(
      `Sync complete: data through ${latest.latestDate}; ` +
      `${official.matched} official section counts across ${official.subjectsUpdated} subjects.`,
    );
  } catch (error) {
    writeStatus({
      ...previous,
      status: "error",
      term: TERM,
      intervalMinutes: INTERVAL_MINUTES,
      lastAttemptAt: startedAt,
      nextSyncAt: new Date(Date.now() + INTERVAL_MINUTES * 60_000).toISOString(),
      source: "soid/columbia-catalog-data",
      lastError: error.message,
    });
    throw error;
  } finally {
    const relative = path.relative(STAGE_ROOT, stageDir);
    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
      fs.rmSync(stageDir, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(`Sync failed: ${error.message}`);
  process.exitCode = 1;
});
