#!/usr/bin/env node
/**
 * Columbia 课程数据爬虫 / 刷新脚本（零依赖，Node 18+）。
 *
 * 数据来源说明：
 *  - 哥大 Registrar 官方 Open Data Service 提供 XML/JSON 课程数据：
 *      https://academic.cuit.columbia.edu/opendataservice/doc/json
 *  - 本脚本默认从社区镜像 soid/columbia-catalog-data 拉取（该镜像每日从
 *    哥大 Directory of Classes 爬取，并富化了 Wikipedia / CULPA 信息，
 *    且 raw.githubusercontent.com 支持 CORS，前端可直接按学期拉取）。
 *  - 想从源头爬取可参考官方爬虫：github.com/soid/columbia-catalog-scraper
 *
 * 用法：
 *   node crawler.mjs list                        # 列出可用学期
 *   node crawler.mjs fetch 2026-Fall             # 拉取完整学期数据
 *   node crawler.mjs fetch 2026-Fall --depts COMS,ECON,STAT --out data/my.json
 *   node crawler.mjs bundle                          # 生成专注目录（IEOR + 商学院，默认）
 *   node crawler.mjs bundle --with-enrollment        # 同时合并最新选课人数
 *   node crawler.mjs bundle --all                    # 生成完整目录（全部院系）
 *   node crawler.mjs bundle --depts COMS,QMSS        # 只保留指定院系
 *   node crawler.mjs sample                           # bundle 的别名
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIRROR = "https://raw.githubusercontent.com/soid/columbia-catalog-data/master";
const API = "https://api.github.com/repos/soid/columbia-catalog-data/contents";
const DEFAULT_TERM = "2027-Spring";

const WEEKDAY = { M: 1, T: 2, W: 3, H: 4, R: 4, F: 5, S: 6, U: 7 };

/** 专注范围：GSAS + IEOR + Columbia Business School。 */
const GSAS_CODES = new Set([
  "AHIS", "ANTH", "ASTR", "BIOL", "CHEM", "CLAS", "CLCV", "CLEN", "CLLN", "CLPH",
  "COMS", "CSER", "EAAS", "EALC", "EAST", "ECON", "EEEB", "EESC", "ENGL", "FREN",
  "GERM", "GREK", "HIST", "ITAL", "LATN", "LING", "MATH", "MESA", "MUSI", "PHAR",
  "PHIL", "PHYS", "POLS", "PORT", "PSYC", "QMSS", "RELI", "RUSS", "SOCI", "SPAN",
  "STAT", "SDEV", "AFAS", "AMST", "TIBT", "YIDD", "WGS",
  "ARAB", "HEBR", "PERS", "TURK", "URDU", "HIND", "TAML", "SWAH", "CHIN", "JAPN",
  "KORE", "SANS", "AHUM", "MDES", "CHNS", "JPNS", "KORN", "ASCE", "HSEA", "GRKM",
  "CPLS", "WMST", "HRTS", "NSBV", "COGS", "URBS", "EDUC", "NUTR", "RESI", "BINF", "NBHV",
]);
function isFocused(rec) {
  const code = (rec.department_code || "").toUpperCase();
  const name = rec.department || "";
  if (code === "IEOR" || GSAS_CODES.has(code)) return true;
  if (["FINC", "DROM", "ACCT", "BUEC"].includes(code)) return true;
  if (code === "BUSI") {
    // BUSI 在不同年份也承载 SPS / Auditing / Columbia College 的课，只保留商学院本部
    return /business|mendelson/i.test(name) && !/professional|auditing|columbia college/i.test(name);
  }
  return false;
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function toMinutes(t) {
  if (!t || !/^\d{1,2}:\d{2}(am|pm)$/i.test(t)) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})(am|pm)$/i);
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = m[3].toLowerCase();
  if (ap === "pm" && h !== 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return h * 60 + min;
}

function pointsNum(p) {
  const n = parseFloat(String(p).split("-")[0]);
  return Number.isFinite(n) ? n : null;
}

/** 同时写 .json（可下载/归档）与 .js（前端 <script> 直接加载，支持 file://）。 */
function writeBoth(jsonPath, data, globalName) {
  const dir = path.dirname(jsonPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(data));
  const jsPath = jsonPath.replace(/\.json$/, ".js");
  fs.writeFileSync(jsPath, `window.${globalName} = ${JSON.stringify(data)};`);
  return { jsonPath, jsPath };
}

/** 精简单条记录，去掉无用字段并规整类型。 */
function normalize(rec) {
  return {
    code: rec.course_code || "",
    title: rec.course_title || "",
    subtitle: rec.course_subtitle || null,
    desc: (rec.course_descr || "").slice(0, 900),
    dept: rec.department || "",
    deptCode: rec.department_code || "",
    instructor: rec.instructor || null,
    culpa: rec.instructor_culpa_reviews_count ?? null,
    wikipedia: rec.instructor_wikipedia_link || null,
    days: [...new Set(String(rec.scheduled_days || "").toUpperCase().replace(/[^A-Z]/g, "").split("").filter((d) => WEEKDAY[d]).map((d) => WEEKDAY[d]))],
    start: toMinutes(rec.scheduled_time_start),
    end: toMinutes(rec.scheduled_time_end),
    startLabel: rec.scheduled_time_start || null,
    endLabel: rec.scheduled_time_end || null,
    location: rec.location || null,
    campus: rec.campus || null,
    method: rec.method_of_instruction || null,
    points: pointsNum(rec.points),
    pointsLabel: rec.points ? String(rec.points) : null,
    prereqs: Array.isArray(rec.prerequisites) ? rec.prerequisites : [],
    callNumber: rec.call_number || null,
    enrolled: null,
    capacity: null,
    enrollSeries: null,
    enrollLastDate: null,
    classId: rec.class_id || null,
    openTo: Array.isArray(rec.open_to) ? rec.open_to : [],
    type: rec.type || null,
    link: rec.link || null,
  };
}

async function json(url) {
  const res = await fetch(url, { headers: { "User-Agent": "columbia-course-planner/1.0" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

async function listSemesters() {
  const files = await json(`${API}/classes`);
  const terms = files
    .filter((f) => f.name.endsWith(".json"))
    .map((f) => ({
      term: f.name.replace(".json", ""),
      sizeMb: +(f.size / 1048576).toFixed(2),
      json: `${MIRROR}/classes/${f.name}`,
      csv: `${MIRROR}/classes/${f.name.replace(".json", ".csv")}`,
    }))
    .sort((a, b) => (a.term < b.term ? -1 : 1));
  console.log(terms.map((t) => `${t.term}  ${t.sizeMb}MB`).join("\n"));
  return terms;
}

function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** 把逐日 “已选/容量” 历史压缩成每周采样 + 最新一天。 */
function enrollmentMap(raw) {
  const map = new Map();
  for (const r of raw) {
    const en = r.enrollment || {};
    const entries = Object.keys(en).sort().map((date) => {
      const [a, b] = String(en[date] || "").split("/");
      return {
        date,
        enrolled: Number.parseInt(a, 10),
        capacity: /^\d+$/.test(b || "") ? Number.parseInt(b, 10) : null,
      };
    }).filter((p) => Number.isFinite(p.enrolled));
    if (!entries.length) continue;
    const lastDate = entries[entries.length - 1].date;
    const series = [];
    let lastKept = null;
    for (const p of entries) {
      if (p.enrolled <= 0) continue;
      const recent = daysBetween(p.date, lastDate) <= 42;
      if (recent || !lastKept || daysBetween(lastKept, p.date) >= 7) {
        series.push([p.date, p.enrolled]);
        lastKept = p.date;
      }
    }
    const last = entries[entries.length - 1];
    if (!series.length) series.push([last.date, last.enrolled]);
    else if (series[series.length - 1][0] !== last.date) series.push([last.date, last.enrolled]);
    map.set(r.call_number, { last, series });
  }
  return map;
}

async function fetchTerm(term, depts, out) {
  const url = `${MIRROR}/classes/${term}.json`;
  console.error(`下载 ${url} ...`);
  const raw = await json(url);
  const wanted = depts ? new Set(depts.map((d) => d.trim().toUpperCase())) : null;
  let rows = raw;
  if (wanted) rows = raw.filter((c) => wanted.has((c.department_code || "").toUpperCase()));
  const outRows = rows.map(normalize);
  const outPath = path.resolve(__dirname, out);
  const w = writeBoth(outPath, outRows, "COURSES");
  console.log(`已写入 ${outRows.length} 条记录 -> ${w.jsonPath} 与 ${w.jsPath}`);
}

/** 生成前端内置目录。默认包含全部院系；可用 --depts 缩小范围。 */
async function buildBundle(out, depts, fromLocal, all, enrollLocal, withEnrollment) {
  const url = `${MIRROR}/classes/${DEFAULT_TERM}.json`;
  let raw;
  if (fromLocal) {
    console.error(`读取本地文件 ${fromLocal} ...`);
    raw = JSON.parse(fs.readFileSync(path.resolve(__dirname, fromLocal), "utf8"));
  } else {
    console.error(`下载 ${url} ...`);
    raw = await json(url);
  }
  const wanted = depts ? new Set(depts.map((d) => d.trim().toUpperCase())) : null;
  const rows = raw
    .filter((c) => (all ? true : wanted ? wanted.has((c.department_code || "").toUpperCase()) : isFocused(c)))
    .map(normalize);
  if (enrollLocal || withEnrollment) {
    let eraw;
    if (enrollLocal) {
      console.error(`读取选课人数 ${enrollLocal} ...`);
      eraw = JSON.parse(fs.readFileSync(path.resolve(__dirname, enrollLocal), "utf8"));
    } else {
      const eurl = `${MIRROR}/classes-enrollment/${DEFAULT_TERM}.json`;
      console.error(`下载选课人数 ${eurl} ...`);
      eraw = await json(eurl);
    }
    const emap = enrollmentMap(eraw);
    let matched = 0;
    for (const row of rows) {
      const e = emap.get(row.callNumber);
      if (e) {
        row.enrolled = e.last.enrolled;
        row.capacity = e.last.capacity;
        row.enrollSeries = e.series;
        row.enrollLastDate = e.last.date;
        matched++;
      }
    }
    console.log(`已合并选课人数：${matched}/${rows.length} 条匹配`);
  }
  const outPath = path.resolve(__dirname, out);
  const baseName = path.basename(outPath, ".json");
  const globalName = /courses-\d{4}-(Spring|Summer|Fall)$/.test(baseName)
    ? `COURSES_${baseName.replace(/^courses-/, "").replace(/-/g, "_").toUpperCase()}`
    : "COURSES";
  const w = writeBoth(outPath, rows, globalName);
  console.log(`已写入 ${rows.length} 条记录（${raw.length} 条中的 ${rows.length} 条）-> ${w.jsonPath} 与 ${w.jsPath}`);
}

const cmd = process.argv[2] || "sample";
const deptArg = arg("--depts");
const outArg = arg("--out");

try {
  if (cmd === "list") {
    await listSemesters();
  } else if (cmd === "semesters") {
    const [classes, enroll] = await Promise.all([
      json(`${API}/classes`),
      json(`${API}/classes-enrollment`).catch(() => []),
    ]);
    const enrollSet = new Set(enroll.map((f) => f.name.replace(".json", "")));
    const terms = classes
      .filter((f) => f.name.endsWith(".json"))
      .map((f) => {
        const term = f.name.replace(".json", "");
        return {
          term,
          json: `${MIRROR}/classes/${f.name}`,
          csv: `${MIRROR}/classes/${f.name.replace(".json", ".csv")}`,
          enrollment: enrollSet.has(term) ? `${MIRROR}/classes-enrollment/${f.name}` : null,
        };
      })
      .sort((a, b) => (a.term < b.term ? 1 : -1));
    const outPath = path.resolve(__dirname, outArg || "data/semesters.json");
    const w = writeBoth(outPath, terms, "SEMESTERS");
    console.log(`已写入学期索引 ${terms.length} 个 -> ${w.jsonPath} 与 ${w.jsPath}`);
  } else if (cmd === "fetch") {
    const term = process.argv[3] || DEFAULT_TERM;
    await fetchTerm(term, deptArg ? deptArg.split(",") : null, outArg || `data/${term}.json`);
  } else if (cmd === "bundle" || cmd === "sample") {
    await buildBundle(
      outArg || "data/courses.json",
      deptArg ? deptArg.split(",") : null,
      arg("--from-local"),
      hasFlag("--all"),
      arg("--enroll-local"),
      hasFlag("--with-enrollment"),
    );
  } else {
    console.log("未知命令。用法见文件头部注释：list | fetch <term> | sample");
  }
} catch (err) {
  console.error("失败:", err.message);
  process.exit(1);
}
