#!/usr/bin/env node
/**
 * 每日选课/退课快照记录器（零依赖）。
 *
 *   node snapshot.mjs                       # 默认 2027-Spring，拉取最新数据并同步历史
 *   node snapshot.mjs 2026-Fall             # 单独生成某个历史学期
 *   node snapshot.mjs --all                 # 生成所有有数据的 Fall/Spring 历史学期
 *   node snapshot.mjs 2027-Spring --from-local ../../work/2027-Spring-enroll.json
 *
 * 输出（data/enrollment-history/<term>.*）：
 *   <term>.json        完整历史（base + 每日变化）
 *   <term>.js          网站可直接加载的轻量版
 *   <term>-summary.csv 每日汇总
 *   index.js           可用学期清单（供网站索引）
 *
 * 选课周期界定：
 *   - registrationStart：该学期镜像里首次出现非零选课人数的日期（≈ 选课开始）。
 *   - dropDeadline：可以 drop 课的最后一天（Course Drop Deadline）。
 *       Fall = 10 月 20 日；Spring = 开学 + 35 天（约第六周）。
 *   - 日志范围 = [registrationStart, min(最新数据日, dropDeadline)]，中间缺失的日期
 *     会用前值补齐（净变化为 0），保证“完整选课周期”。
 *
 * 数据源：soid/columbia-catalog-data 的 classes-enrollment 镜像（每天更新）。
 * 每次运行都会用镜像里的完整逐日数据重建/补齐历史，因此漏跑几天也不会丢记录。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIRROR = "https://raw.githubusercontent.com/soid/columbia-catalog-data/master";

// 有逐日选课数据的 Fall / Spring 学期（Summer 因多 Session、不同 drop 截止而暂不纳入）。
const ALL_TERMS = [
  "2020-Fall",
  "2021-Spring", "2021-Fall",
  "2022-Spring", "2022-Fall",
  "2023-Spring", "2023-Fall",
  "2024-Spring", "2024-Fall",
  "2025-Spring", "2025-Fall",
  "2026-Spring", "2026-Fall",
  "2027-Spring",
];

const GSAS_CODES = new Set([
  "AHIS", "ANTH", "ASTR", "BIOL", "CHEM", "CLAS", "CLCV", "CLEN", "CLLN", "CLPH",
  "COMS", "CSER", "EAAS", "EALC", "EAST", "ECON", "EEEB", "EESC", "ENGL", "FREN",
  "GERM", "GREK", "HIST", "ITAL", "LATN", "LING", "MATH", "MESA", "MUSI", "PHAR",
  "PHIL", "PHYS", "POLS", "PORT", "PSYC", "QMSS", "RELI", "RUSS", "SOCI", "SPAN",
  "STAT", "SDEV", "AFAS", "AMST", "TIBT", "YIDD", "WGS", "AHUM", "MDES", "CHNS",
  "JPNS", "KORN", "ASCE", "HSEA", "GRKM", "CPLS", "WMST", "HRTS", "NSBV", "COGS",
  "URBS", "EDUC", "NUTR", "RESI", "BINF", "NBHV",
]);
const BUSINESS_CODES = new Set(["BUSI", "FINC", "DROM", "ACCT", "BUEC"]);
function isFocusCode(code) {
  const prefix = String(code || "").trim().split(/\s+/)[0].toUpperCase();
  return prefix === "IEOR" || BUSINESS_CODES.has(prefix) || GSAS_CODES.has(prefix);
}
function deptOfCode(code) {
  return String(code || "").trim().split(/\s+/)[0].toUpperCase();
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const fromLocal = arg("--from-local");
const outDir = path.resolve(__dirname, arg("--out-dir", "data/enrollment-history"));
const rawCacheDir = path.resolve(__dirname, arg("--cache-dir", "../../work/raw-enroll"));
const coursesFile = arg("--courses-file");
const refresh = process.argv.includes("--refresh");

/* ---------- 日期工具 ---------- */
function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function nyNow() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date()).replace(",", "");
}

/**
 * 哥大（Morningside / Arts & Sciences / SEAS）开学与退课截止：
 *   - Fall 开学 = 劳动节次日（9 月第一个周二）；drop 截止 ≈ 10 月 20 日。
 *   - Spring 开学 = 马丁·路德·金纪念日次日（周二）；drop 截止 ≈ 开学 + 35 天（第六周）。
 *   - Spring 2021 因 COVID 提前到 1/11（周一）。
 * Summer 返回 null（多 Session，另行处理）。
 */
function computeCalendar(term) {
  const m = String(term || "").match(/^(\d{4})-(Spring|Summer|Fall)$/);
  if (!m) return { classesStart: null, dropDeadline: null };
  const year = Number(m[1]);
  const season = m[2];
  const iso = (d) => d.toISOString().slice(0, 10);
  const nthMonday = (yr, month, nth) => {
    const d = new Date(Date.UTC(yr, month - 1, 1));
    const firstMon = 1 + ((8 - d.getUTCDay()) % 7);
    d.setUTCDate(firstMon + (nth - 1) * 7);
    return d;
  };
  if (season === "Fall") {
    const start = addDays(iso(nthMonday(year, 9, 1)), 1); // 劳动节（9 月第 1 个周一）次日
    return { classesStart: start, dropDeadline: `${year}-10-20` }; // 可以 drop 课的最后一天
  }
  if (season === "Spring") {
    const start = year === 2021
      ? `${year}-01-11`
      : addDays(iso(nthMonday(year, 1, 3)), 1); // MLK（1 月第 3 个周一）次日
    return { classesStart: start, dropDeadline: addDays(start, 35) }; // 约第六周，可以 drop 课的最后一天
  }
  return { classesStart: null, dropDeadline: null };
}

async function loadRaw(term) {
  if (fromLocal) {
    console.error(`读取本地选课数据 ${fromLocal} ...`);
    return JSON.parse(fs.readFileSync(path.resolve(__dirname, fromLocal), "utf8"));
  }
  const cachePath = path.join(rawCacheDir, `${term}.json`);
  if (!refresh && fs.existsSync(cachePath)) {
    console.error(`读取缓存 ${cachePath} ...`);
    return JSON.parse(fs.readFileSync(cachePath, "utf8"));
  }
  const url = `${MIRROR}/classes-enrollment/${term}.json`;
  console.error(`下载 ${url} ...`);
  const res = await fetch(url, { headers: { "User-Agent": "columbia-course-planner/1.0" } });
  if (!res.ok) throw new Error(`下载失败：HTTP ${res.status}`);
  const raw = await res.json();
  fs.mkdirSync(rawCacheDir, { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(raw));
  return raw;
}

function parsePoint(value) {
  const [a, b] = String(value || "").split("/");
  const enrolled = Number.parseInt(a, 10);
  if (!Number.isFinite(enrolled)) return null;
  return {
    enrolled,
    capacity: /^\d+$/.test(b || "") ? Number.parseInt(b, 10) : null,
  };
}

/** 把逐日原始数据整理成 date -> callNumber -> {code,enrolled,capacity}。 */
function indexByDate(raw) {
  const byDate = new Map();
  for (const row of raw) {
    const en = row.enrollment || {};
    for (const [date, value] of Object.entries(en)) {
      const p = parsePoint(value);
      if (!p) continue;
      if (!byDate.has(date)) byDate.set(date, new Map());
      byDate.get(date).set(row.call_number, {
        code: row.course_code,
        enrolled: p.enrolled,
        capacity: p.capacity,
      });
    }
  }
  return byDate;
}

function totalsOf(state) {
  let enrolled = 0;
  let capacity = 0;
  for (const v of state.values()) {
    enrolled += v.enrolled;
    capacity += v.capacity || 0;
  }
  return { enrolled, capacity };
}

function deptSnapshot(state) {
  const depts = {};
  for (const v of state.values()) {
    const dept = deptOfCode(v.code);
    if (!dept) continue;
    const d = depts[dept] || (depts[dept] = { totalEnrolled: 0, totalCapacity: 0 });
    d.totalEnrolled += v.enrolled;
    d.totalCapacity += v.capacity || 0;
  }
  return depts;
}

/** 计算某一天的日变化与各部门汇总。 */
function dayEntry(date, changes, newSections, totals, depts, deptChanges) {
  const list = Object.values(changes).filter((c) => c.de !== 0 || c.dc !== 0);
  const added = list.reduce((a, c) => a + Math.max(0, c.de), 0);
  const dropped = list.reduce((a, c) => a + Math.max(0, -c.de), 0);
  const deptsOut = {};
  for (const [dept, t] of Object.entries(depts)) {
    const c = deptChanges[dept];
    deptsOut[dept] = {
      totalEnrolled: t.totalEnrolled,
      totalCapacity: t.totalCapacity,
      added: c?.added || 0,
      dropped: c?.dropped || 0,
      netChange: c?.netChange || 0,
      changedSections: c?.changedSections || 0,
    };
  }
  return {
    date,
    sourceDate: date,
    totalEnrolled: totals.enrolled,
    totalCapacity: totals.capacity,
    netChange: added - dropped,
    added,
    dropped,
    changedSections: list.length,
    newSections,
    depts: deptsOut,
    changes,
  };
}

/** 把某个日期的原始逐课程数据应用（含变化计算）到 state。 */
function applyDay(byDate, date, state) {
  const changes = {};
  let newSections = 0;
  const day = byDate.get(date);
  if (day) {
    for (const [callNumber, next] of day) {
      const prev = state.get(callNumber);
      if (!prev) {
        state.set(callNumber, next);
        changes[callNumber] = {
          code: next.code, de: 0, dc: 0,
          e: next.enrolled, c: next.capacity, isNew: true,
        };
        newSections++;
        continue;
      }
      const de = next.enrolled - prev.enrolled;
      const dc = (next.capacity || 0) - (prev.capacity || 0);
      if (de !== 0 || dc !== 0) {
        changes[callNumber] = { code: next.code, de, dc, e: next.enrolled, c: next.capacity };
      }
      state.set(callNumber, next);
    }
  }
  const totals = totalsOf(state);
  const depts = deptSnapshot(state);
  const list = Object.values(changes).filter((c) => c.de !== 0 || c.dc !== 0);
  const deptChanges = {};
  for (const c of list) {
    const dept = deptOfCode(c.code);
    if (!dept) continue;
    const d = deptChanges[dept] || (deptChanges[dept] = { added: 0, dropped: 0, netChange: 0, changedSections: 0 });
    if (c.de > 0) d.added += c.de;
    if (c.de < 0) d.dropped += -c.de;
    d.netChange += c.de;
    d.changedSections++;
  }
  return { changes, newSections, totals, depts, deptChanges };
}

/**
 * 构建完整选课周期历史：
 *   [registrationStart, min(最新数据日, dropDeadline)]，缺失日期用前值补齐。
 */
function buildHistory(raw, term, calendar) {
  const byDate = indexByDate(raw);
  const allDates = [...byDate.keys()].sort();
  if (!allDates.length) throw new Error("选课数据为空");

  // 1) 回放找到首次出现非零选课人数的日期（≈ 选课开始）。
  const probe = new Map();
  let registrationStart = null;
  for (const date of allDates) {
    const day = byDate.get(date);
    if (day) for (const [cn, next] of day) probe.set(cn, next);
    if (totalsOf(probe).enrolled > 0) { registrationStart = date; break; }
  }
  registrationStart = registrationStart || allDates[0];

  const lastDataDate = allDates[allDates.length - 1];
  const dropDeadline = calendar.dropDeadline;
  const endDate = dropDeadline && lastDataDate > dropDeadline ? dropDeadline : lastDataDate;

  // 2) 预载 registrationStart 之前的基线状态。
  const state = new Map();
  for (const date of allDates) {
    if (date >= registrationStart) break;
    const day = byDate.get(date);
    if (day) for (const [cn, next] of day) state.set(cn, next);
  }
  const base = {
    date: registrationStart,
    sourceDate: registrationStart,
    sections: Object.fromEntries([...state].map(([k, v]) => [k, { ...v }])),
  };

  // 3) 连续遍历 [registrationStart, endDate]，缺失日期补齐为净变化 0。
  const days = [];
  for (let date = registrationStart; date <= endDate; date = addDays(date, 1)) {
    const { changes, newSections, totals, depts, deptChanges } = applyDay(byDate, date, state);
    days.push(dayEntry(date, changes, newSections, totals, depts, deptChanges));
  }

  return {
    term,
    createdAt: nyNow(),
    updatedAt: nyNow(),
    registrationStart,
    classesStart: calendar.classesStart,
    dropDeadline,
    lastDataDate,
    base,
    days,
    summary: days.map(({ changes, ...rest }) => rest),
  };
}

/** 网站用的轻量版：只保留汇总和最近 45 天的重点变化。 */
function compactForSite(history) {
  const recent = history.days.slice(-45).map((day) => ({
    date: day.date,
    totalEnrolled: day.totalEnrolled,
    totalCapacity: day.totalCapacity,
    netChange: day.netChange,
    added: day.added,
    dropped: day.dropped,
    changedSections: day.changedSections,
    top: Object.entries(day.changes)
      .filter(([, c]) => c.de !== 0)
      .sort((a, b) => Math.abs(b[1].de) - Math.abs(a[1].de))
      .slice(0, 30)
      .map(([callNumber, c]) => ({
        call: callNumber, code: c.code, de: c.de, e: c.e,
      })),
  }));
  const latest = history.days.length ? history.days[history.days.length - 1] : null;
  return {
    term: history.term,
    updatedAt: history.updatedAt,
    registrationStart: history.registrationStart,
    classesStart: history.classesStart,
    dropDeadline: history.dropDeadline,
    lastDataDate: history.lastDataDate,
    baseDate: history.base.date,
    latestDate: latest ? latest.date : history.base.date,
    complete: !!history.dropDeadline && latest?.date >= history.dropDeadline,
    summary: history.summary,
    recent,
  };
}

function writeOutputs(history, index) {
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.join(outDir, history.term);

  fs.writeFileSync(`${base}.json`, JSON.stringify(history));
  fs.writeFileSync(`${base}.js`, `window.ENROLL_HISTORY = ${JSON.stringify(compactForSite(history))};`);
  fs.writeFileSync(
    `${base}-summary.csv`,
    ["date,totalEnrolled,totalCapacity,netChange,added,dropped,changedSections,newSections"]
      .concat(history.days.map((d) =>
        [d.date, d.totalEnrolled, d.totalCapacity, d.netChange, d.added, d.dropped, d.changedSections, d.newSections].join(",")))
      .join("\n")
  );

  if (history.term === "2027-Spring") {
    fs.copyFileSync(`${base}.js`, path.join(outDir, "latest.js"));
  }
  if (index) {
    fs.writeFileSync(
      path.join(outDir, "index.js"),
      `window.ENROLL_HISTORY_INDEX = ${JSON.stringify(index, null, 1)};`
    );
  }
  return { base };
}

function report(history) {
  const last = history.days[history.days.length - 1];
  const span = `${history.registrationStart} → ${last ? last.date : history.registrationStart}`;
  const win = history.dropDeadline ? `drop 截止 ${history.dropDeadline}` : "无 drop 截止";
  console.log(
    `已记录 ${history.term}：${span}（${history.days.length} 天；${win}）；` +
    `最新总选课 ${last ? last.totalEnrolled : "—"}，` +
    `最新日净变化 ${last ? (last.netChange >= 0 ? "+" : "") + last.netChange : "—"}。`
  );
}

async function generateOne(term) {
  const calendar = computeCalendar(term);
  if (!calendar.dropDeadline) {
    console.error(`跳过 ${term}：无 Fall/Spring 退课截止日期。`);
    return null;
  }
  const bundledPath = coursesFile
    ? path.resolve(__dirname, coursesFile)
    : path.resolve(__dirname, `data/courses-${term}.json`);
  let allowedCalls = null;
  if (fs.existsSync(bundledPath)) {
    const rows = JSON.parse(fs.readFileSync(bundledPath, "utf8"));
    allowedCalls = new Set(rows.map((r) => r.callNumber).filter(Boolean));
  }
  const raw = await loadRaw(term);
  const focused = raw.filter((row) =>
    allowedCalls ? allowedCalls.has(row.call_number) : isFocusCode(row.course_code));
  if (!focused.length) throw new Error("过滤后无数据（可能该学期镜像里没有 GSAS/IEOR/Business 课程）");
  const history = buildHistory(focused, term, calendar);
  const written = writeOutputs(history, false);
  report(history);
  return { history, written };
}

async function main() {
  const cli = process.argv.slice(2).filter((a) => !a.startsWith("--") && a !== "enroll");
  const all = process.argv.includes("--all");
  const explicit = cli.length ? cli[0] : "2027-Spring";

  if (all) {
    const index = {};
    for (const term of ALL_TERMS) {
      try {
        const r = await generateOne(term);
        if (r) {
          const h = r.history;
          index[term] = {
            registrationStart: h.registrationStart,
            classesStart: h.classesStart,
            dropDeadline: h.dropDeadline,
            latestDate: h.days.length ? h.days[h.days.length - 1].date : h.registrationStart,
            days: h.days.length,
          };
        }
      } catch (err) {
        console.error(`快照失败（${term}）：${err.message}`);
      }
    }
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, "index.js"),
      `window.ENROLL_HISTORY_INDEX = ${JSON.stringify(index, null, 1)};`
    );
    console.log(`\n完成。已生成 ${Object.keys(index).length} 个学期的选课周期日志。`);
    return;
  }

  const r = await generateOne(explicit);
  if (r) {
    const index = {};
    const h = r.history;
    index[h.term] = {
      registrationStart: h.registrationStart,
      classesStart: h.classesStart,
      dropDeadline: h.dropDeadline,
      latestDate: h.days.length ? h.days[h.days.length - 1].date : h.registrationStart,
      days: h.days.length,
    };
    fs.writeFileSync(
      path.join(outDir, "index.js"),
      `window.ENROLL_HISTORY_INDEX = ${JSON.stringify(index, null, 1)};`
    );
    console.log(`输出：${r.written.base}.json / .js / -summary.csv`);
  }
}

main().catch((err) => {
  console.error("快照失败：", err.message);
  process.exit(1);
});
