"use strict";

/* ============================================================
 * Columbia Course Planner — 前端逻辑（零依赖）
 * 数据来自 data/courses.js（window.COURSES）、data/semesters.js、
 * data/buildings.js。历史学期通过 fetch 直接拉取 GitHub 镜像（CORS 支持）。
 * ============================================================ */

const COURSES_2027 = window.COURSES_2027_SPRING || window.COURSES || [];
const COURSES_2026 = window.COURSES_2026_FALL || [];
const COURSES_2026_SPRING = window.COURSES_2026_SPRING || [];
const TERM_DATA = {
  "2027-Spring": COURSES_2027,
  "2026-Fall": COURSES_2026,
  "2026-Spring": COURSES_2026_SPRING,
};
const COURSES = COURSES_2027;
const SEMESTERS = window.SEMESTERS || [];
const BUILDINGS = window.BUILDINGS || [];
const enrollHistoryCache = new Map();
const culpaReviewCache = new Map();
if (window.ENROLL_HISTORY && window.ENROLL_HISTORY.term) {
  enrollHistoryCache.set(window.ENROLL_HISTORY.term, window.ENROLL_HISTORY);
}
let enrollLoadChain = Promise.resolve();
const enrollHistoryLoading = new Set();
const MIRROR_BASE = "https://raw.githubusercontent.com/soid/columbia-catalog-data/master";
const CUSTOM_TERMS_KEY = "cu-custom-terms";
const TERM_STORAGE_KEY = "cu-selected-term";

function readSavedTerm() {
  try { return localStorage.getItem(TERM_STORAGE_KEY); } catch { return null; }
}
function saveSelectedTerm(term) {
  try { localStorage.setItem(TERM_STORAGE_KEY, term); } catch { /* ignore */ }
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const DAY_MINI = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FOCUS_LABEL = "GSAS × IEOR × Business";
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
const BUSINESS_CODES = new Set(["FINC", "DROM", "ACCT", "BUEC"]);

function scopeOf(c) {
  const code = String(c.deptCode || "").toUpperCase();
  const name = c.dept || "";
  if (code === "IEOR") return "IEOR";
  if (BUSINESS_CODES.has(code)) return "Business";
  if (code === "BUSI") {
    return /business|mendelson/i.test(name) && !/professional|auditing|columbia college/i.test(name)
      ? "Business" : null;
  }
  if (GSAS_CODES.has(code)) return "GSAS";
  return null;
}

function isInScope(c) { return scopeOf(c) !== null; }

const state = {
  courses: COURSES,
  term: "2027-Spring",
  schedule: [],            // 加入课表的 section 对象
  taken: [],               // 已修课程号
  planBuckets: [[], [], [], [], [], [], [], []],  // 8 个学期
  planTarget: 0,
  planTemplate: "IEOR (sample)",
  browsePage: 0,
  pageSize: 48,
  filters: { scope: "all", dept: "all", level: "all", campus: "all", method: "all", day: "all", sort: "default" },
  recResult: [],
  recDept: "QMSS",
  recSort: "score",
  dailyDept: "all",
  searchQuery: "",
  searchDepartment: "all",
  searchInstructor: "",
  searchPage: 0,
  instructorName: "",
  instructorReturn: null,
  calendarView: "week",
  calendarSelected: null,
  calendarMiniMonth: null,
  calendarQuery: "",
  calendarEvents: null,
  calendarHiddenSources: null,
  calendarTimeFormat: "24h",
  googleCalendarEvents: [],
  googleCalendarConnected: false,
  googleCalendarLoading: false,
  googleCalendarError: "",
  googleCalendarSyncedAt: null,
  modalCourse: null,
};

let instructorIndexCache = null;
let instructorIndexPromise = null;

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normCode(s) {
  return String(s || "").trim().toUpperCase().replace(/\s+/g, " ");
}

function daysLabel(days) {
  if (!days || !days.length) return "Time TBA";
  return days.map((d) => DAY_NAMES[d - 1]).join(" · ");
}

function timeLabel(min) {
  if (min == null) return "";
  const h24 = Math.floor(min / 60), m = min % 60;
  const ap = h24 < 12 ? "am" : "pm";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, "0")}${ap}`;
}

function meetingKey(s) {
  return `${(s.days || []).join("")}|${s.start}|${s.end}`;
}

function timeRangeLabel(start, end) {
  const s = timeLabel(start);
  const e = timeLabel(end);
  const sa = s.slice(-2);
  const ea = e.slice(-2);
  if (sa === ea && !s.startsWith("12")) return `${s.slice(0, -2)}–${e}`;
  return `${s}–${e}`;
}

function formatMeeting(s) {
  const days = (s.days || []).map((d) => DAY_MINI[d - 1]).join(" / ");
  if (s.start == null) return days ? `${days} · Time TBA` : "Time TBA";
  const time = timeRangeLabel(s.start, s.end);
  return days ? `${days} · ${time}` : `${time} · Day TBA`;
}

function meetingsOf(sections) {
  const seen = new Set();
  const out = [];
  for (const s of sections) {
    if (s.start == null && !(s.days || []).length) continue;
    const key = meetingKey(s);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(formatMeeting(s));
  }
  return out;
}

function meetingParts(section) {
  const days = (section.days || []).map((d) => DAY_MINI[d - 1]).join("/");
  return {
    days: days || "Day TBA",
    time: section.start != null ? timeRangeLabel(section.start, section.end) : "Time TBA",
  };
}

function cleanLocation(location) {
  if (!location) return "";
  let s = String(location).trim().split(",")[0];
  s = s.replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b.*$/i, "").trim();
  s = s.replace(/\b\d{1,2}:\d{2}\s*(am|pm)?\b.*$/i, "").trim();
  s = s.replace(/\bTime TBA\b.*$/i, "").trim();
  return s || String(location).split(",")[0].trim();
}

function termShort(term) {
  const m = String(term || "").match(/^(\d{4})-(\w+)$/);
  return m ? `${m[1]} ${m[2]}` : (term || "");
}

function termLabel(term) {
  const m = String(term || "").match(/^(\d{4})-(\w+)$/);
  if (!m) return term || "";
  return `${m[1]} ${m[2]}`;
}

function semesterStart(term) {
  const m = String(term || "").match(/^(\d{4})-(Spring|Summer|Fall)$/);
  if (!m) return null;
  const knownStart = typeof CALENDAR_ACADEMIC_DATES !== "undefined"
    ? CALENDAR_ACADEMIC_DATES.find((event) =>
        event.date.startsWith(`${m[1]}-`) && /classes begin/i.test(event.title))
    : null;
  if (knownStart) return knownStart.date;
  const md = { Spring: "01-18", Summer: "05-27", Fall: "09-02" }[m[2]];
  return `${m[1]}-${md}`;
}

function calendarTermStartKey(term) {
  const year = String(term || "").match(/^(\d{4})-/)?.[1];
  if (!year) return null;
  const academicStart = CALENDAR_ACADEMIC_DATES.find((event) =>
    event.date.startsWith(`${year}-`) && /classes begin/i.test(event.title));
  return academicStart?.date || semesterStart(term);
}

function defaultCalendarDateForTerm(term) {
  const startKey = calendarTermStartKey(term);
  if (!startKey) return new Date();
  const start = calendarFromKey(startKey);
  const end = calendarAddDays(start, 130);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today < start || today > end ? start : today;
}

function nthMondayOfMonth(year, month, nth) {
  const d = new Date(Date.UTC(year, month - 1, 1));
  const firstMon = 1 + ((8 - d.getUTCDay()) % 7);
  d.setUTCDate(firstMon + (nth - 1) * 7);
  return d.toISOString().slice(0, 10);
}

/** 可以 drop 课的最后一天（Course Drop Deadline，与 snapshot.mjs 一致）。 */
function termDropDeadline(term) {
  const m = String(term || "").match(/^(\d{4})-(Spring|Summer|Fall)$/);
  if (!m) return null;
  const year = Number(m[1]);
  if (m[2] === "Fall") return `${year}-10-20`;
  if (m[2] === "Spring") {
    const start = year === 2021 ? `${year}-01-11` : addDaysStr(nthMondayOfMonth(year, 1, 3), 1);
    return addDaysStr(start, 35);
  }
  return null;
}

function addDaysStr(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

function pointAt(series, dateStr) {
  if (!series || !series.length) return null;
  const hit = series.find(([d]) => d >= dateStr);
  const p = hit || series[series.length - 1];
  return { d: p[0], e: p[1] };
}

/**
 * 退课率只使用开学后至 drop deadline 的数据：
 * - base 取开学前 14 天内的最高在册人数，避免把报名阶段增长算成退课；
 * - end 取 drop deadline 或当前最后一个有效点；
 * - 少于 10 人或样本不足时标记 lowSample，不用它做教师评价。
 */
function enrollAnalysis(course, term = state.term) {
  const series = [...(course.series || [])].sort(([a], [b]) => a.localeCompare(b));
  const startDate = semesterStart(term);
  if (!series.length || !startDate) return null;
  const deadline = termDropDeadline(term);
  const endBoundary = deadline || series.at(-1)[0];
  const postStart = series.filter(([date]) => date >= startDate && date <= endBoundary);
  const latest = { d: series.at(-1)[0], e: series.at(-1)[1] };
  if (!postStart.length) {
    const point = pointAt(series, startDate) || latest;
    return {
      start: point,
      week1: point,
      week2: point,
      end: latest,
      base: 0,
      drop: 0,
      rate: 0,
      ended: latest.e === 0,
      lowSample: true,
      hasPostStart: false,
      startDate,
      deadline,
      samplePoints: 0,
    };
  }
  const start = pointAt(postStart, startDate) || postStart[0];
  const week1 = pointAt(postStart, addDaysStr(startDate, 7)) || start;
  const week2 = pointAt(postStart, addDaysStr(startDate, 14)) || week1;
  const end = postStart.at(-1);
  const opening = postStart.filter(([date]) => date <= addDaysStr(startDate, 14));
  const base = Math.max(0, ...opening.map(([, enrolled]) => enrolled || 0));
  if (!base) {
    return {
      start,
      week1,
      week2,
      end,
      base: 0,
      drop: 0,
      rate: 0,
      ended: end.e === 0,
      lowSample: true,
      hasPostStart: true,
      startDate,
      deadline,
      samplePoints: postStart.length,
    };
  }
  const drop = base - end.e;
  const rate = drop / base;
  const ended = end.e === 0 || (base >= 20 && end.e < base * 0.15);
  return {
    start,
    week1,
    week2,
    end,
    base,
    drop,
    rate,
    ended,
    lowSample: base < 10 || postStart.length < 2,
    hasPostStart: true,
    startDate,
    deadline,
    complete: Boolean(deadline && end.d >= deadline),
    samplePoints: postStart.length,
  };
}

function difficultySignal(rate, ended = false) {
  if (ended) return { label: "Ended / module", tone: "info" };
  if (rate >= 0.25) return { label: "≥25% drop", tone: "high" };
  if (rate >= 0.12) return { label: "12–24% drop", tone: "mid" };
  if (rate >= 0.04) return { label: "4–11% drop", tone: "low" };
  return { label: "Stable / increasing", tone: "stable" };
}

function levelOf(code) {
  const m = String(code || "").match(/(\d{4})/);
  return m ? Number(m[1]) : 0;
}

function sectionTitle(s) {
  return s.code || "";
}

/* ---------- 课程分组 ---------- */
function groupByCode(courses) {
  const map = new Map();
  for (const c of courses) {
    const k = normCode(c.code);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(c);
  }
  const list = [];
  const deadline = termDropDeadline(state.term);
  for (const [code, sections] of map) {
    const best = sections.find((s) => s.instructor) || sections[0];
    const culpaMax = Math.max(...sections.map((s) => s.culpa || 0));
    const points = sections.map((s) => s.points).filter((p) => p != null);
    const capacityTotal = sections.reduce((a, s) => a + (s.capacity || 0), 0);
    const hasCapacity = sections.some((s) => s.capacity != null);
    const seriesMap = new Map();
    let enrolledTotal = 0;
    let enrollLastDate = null;
    for (const s of sections) {
      const pts = (s.enrollSeries || []).filter(([d]) => !deadline || d <= deadline);
      for (const p of pts) {
        seriesMap.set(p[0], (seriesMap.get(p[0]) || 0) + (p[1] || 0));
      }
      const last = pts[pts.length - 1];
      enrolledTotal += last ? (last[1] || 0) : (s.enrolled || 0);
      if (last && (!enrollLastDate || last[0] > enrollLastDate)) enrollLastDate = last[0];
    }
    const series = [...seriesMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    list.push({
      code,
      title: best.title,
      dept: best.dept,
      deptCode: best.deptCode,
      sections,
      culpa: culpaMax,
      level: levelOf(code),
      minPoints: points.length ? Math.min(...points) : null,
      campuses: [...new Set(sections.map((s) => s.campus).filter(Boolean))],
      enrolledTotal,
      capacityTotal,
      hasCapacity,
      series,
      enrollLastDate,
    });
  }
  return list;
}

/* 缓存“按课程号分组 + 搜索文本”，避免每次输入都重算整个目录 */
let groupedCache = null;
function getGrouped() {
  if (groupedCache && groupedCache.src === state.courses) return groupedCache.list;
  const list = groupByCode(state.courses).map((c) => ({
    ...c,
    hay: [c.code, c.title, c.dept, c.deptCode,
      ...c.sections.map((s) => s.instructor || ""),
      ...c.sections.map((s) => s.desc || "")].join(" ").toLowerCase(),
  }));
  groupedCache = { src: state.courses, list };
  return list;
}

function sectionLabel(section) {
  if (!section) return "";
  const id = section.classId || "";
  const last = id.split("-").pop();
  if (/^[A-Za-z0-9]{1,4}$/.test(last)) return last;
  return section.callNumber || id || "";
}

function withZeroBaseline(series) {
  if (!series || !series.length) return [];
  const first = series.findIndex((p) => p[1] > 0);
  if (first === -1) return series;
  const baselineDate = addDaysStr(series[first][0], -1);
  if (first > 0 && series[first - 1][0] === baselineDate) return series.slice(first - 1);
  return [[baselineDate, 0], ...series.slice(first)];
}

function sectionToCard(section) {
  const deadline = termDropDeadline(state.term);
  const clipped = deadline
    ? (section.enrollSeries || []).filter(([d]) => d <= deadline)
    : (section.enrollSeries || []);
  const lastPt = clipped[clipped.length - 1];
  return {
    code: normCode(section.code),
    title: section.title,
    dept: section.dept,
    deptCode: section.deptCode,
    sections: [section],
    culpa: section.culpa || 0,
    level: levelOf(section.code),
    minPoints: section.points,
    campuses: section.campus ? [section.campus] : [],
    enrolledTotal: lastPt ? lastPt[1] || 0 : (section.enrolled || 0),
    capacityTotal: section.capacity || 0,
    hasCapacity: section.capacity != null,
    series: withZeroBaseline(clipped),
    enrollLastDate: lastPt ? lastPt[0] : (section.enrollLastDate || null),
    section,
  };
}

let sectionCache = null;
function getSections() {
  if (sectionCache && sectionCache.src === state.courses) return sectionCache.list;
  const list = state.courses.map(sectionToCard).map((c) => ({
    ...c,
    hay: [
      c.code, c.title, c.dept, c.deptCode,
      c.section.instructor || "", c.section.desc || "",
      c.section.location || "", c.section.classId || "",
      c.section.callNumber || "",
    ].join(" ").toLowerCase(),
  }));
  sectionCache = { src: state.courses, list };
  return list;
}

/* ---------- 路由 / 导航 ---------- */
const NAV = [
  ["browse", "Browse"],
  ["analysis", "Enrollment"],
  ["planner", "Plan"],
  ["calendar", "Calendar"],
  ["map", "Map"],
];

const viewStack = [];
let viewIndex = -1;

function updateViewNav() {
  const back = $("#nav-back");
  const fwd = $("#nav-forward");
  if (back) back.disabled = viewIndex <= 0;
  if (fwd) fwd.disabled = viewIndex >= viewStack.length - 1;
}

function goView(delta) {
  const next = viewIndex + delta;
  if (next < 0 || next >= viewStack.length) return;
  viewIndex = next;
  const entry = viewStack[viewIndex];
  if (entry.view === "search") {
    state.searchQuery = entry.q || "";
    state.searchDepartment = entry.dept || "all";
    state.searchInstructor = entry.instructor || "";
    syncSearchFields();
  }
  if (entry.view === "instructor") {
    state.instructorName = entry.instructorName || "";
  }
  switchView(entry.view, { noHistory: true });
}

function switchView(id, opts = {}) {
  $$(".view").forEach((v) => (v.hidden = v.id !== `view-${id}`));
  const navId = id === "search" || id === "instructor" ? "browse" : id;
  $$(".nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === navId));
  if (id !== "browse") setFilterPanelOpen(false);
  document.body.dataset.view = id;
  if (id === "calendar") {
    document.body.style.overflow = "auto";
    document.documentElement.style.overflow = "";
  }
  if (!opts.noHistory) {
    const entry = {
      view: id,
      q: id === "search" ? (opts.q ?? state.searchQuery) : null,
      dept: id === "search" ? state.searchDepartment : null,
      instructor: id === "search" ? state.searchInstructor : null,
      instructorName: id === "instructor" ? state.instructorName : null,
    };
    const cur = viewStack[viewIndex];
    if (!cur || cur.view !== entry.view || cur.q !== entry.q || cur.instructorName !== entry.instructorName) {
      viewStack.length = viewIndex + 1;
      viewStack.push(entry);
      viewIndex = viewStack.length - 1;
    }
  }
  updateViewNav();
  const hash = id === "search"
    ? `#/search${searchHash() ? `?${searchHash()}` : ""}`
    : id === "instructor"
      ? `#/instructor/${encodeURIComponent(state.instructorName)}`
      : `#/${id}`;
  if (location.hash !== hash) history.replaceState(null, "", hash);
  if (id === "map") { initMap(); refreshMapPins(); }
  if (id === "search") renderSearchResults();
  if (id === "instructor") renderInstructorProfile();
  if (id === "analysis") renderAnalysis();
  if (id === "planner") renderPlanner();
  if (id === "calendar") {
    renderCalendar();
    if (googleCalendarTokenValid() && Date.now() - (state.googleCalendarSyncedAt || 0) > 60_000) {
      syncGoogleCalendar();
    }
  }
  window.scrollTo({ top: 0 });
}

const NAV_ICONS = {
  browse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>',
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 2.6-6.4"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></svg>',
  recommend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.7 1.9 1.9.7-1.9.7L19 20.2l-.7-1.9-1.9-.7 1.9-.7z"/></svg>',
  analysis: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18"/><path d="M5 16l4-5 4 3 6-8"/><path d="M16 6h3v3"/></svg>',
  planner: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 20V11"/><path d="M10 20V4"/><path d="M16 20v-6"/><path d="M22 20H2"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
};

function buildNav() {
  const nav = $("#nav");
  const inkPath = "M110 27C105 14 82 7 56 7C30 7 8 13 5 23C2 34 24 44 53 46C80 48 105 40 111 31C116 24 105 16 94 12C82 8 68 7 55 8";
  nav.innerHTML = NAV.map(([id, label]) =>
    `<button data-view="${id}" title="${esc(label)}" aria-label="${esc(label)}">
      <span class="nav-label">
        ${label}
        <svg class="nav-hand-ink" viewBox="0 0 120 48" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path class="nav-ink-line" pathLength="1" d="${inkPath}" />
          <path class="nav-ink-grain" pathLength="1" d="${inkPath}" />
        </svg>
      </span>
    </button>`).join("");
  nav.querySelector("button")?.classList.add("active");
  nav.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) switchView(b.dataset.view);
  });
}

function renderTermSwitch() {
  const terms = SEMESTERS
    .filter((s) => s.enrollment && !/Summer/i.test(s.term))
    .map((s) => s.term)
    .sort((a, b) => b.localeCompare(a));
  const selectTerms = [...new Set([state.term, ...terms])].filter(Boolean);
  const labelText = (t) => {
    const m = String(t).match(/^(\d{4})-(Spring|Summer|Fall)$/);
    return m ? `${m[2]} ${m[1]}` : t;
  };
  const labelEl = $("#term-menu-label");
  if (labelEl) labelEl.textContent = labelText(state.term);
  const menu = $("#term-menu");
  if (menu) {
    menu.innerHTML = selectTerms.map((t) =>
      `<button type="button" role="option" data-term-option="${esc(t)}" class="${state.term === t ? "active" : ""}" aria-selected="${state.term === t}">${esc(labelText(t))}</button>`).join("");
  }
}

function setTerm(term) {
  const data = TERM_DATA[term];
  if (!data || !data.length) {
    toast("This term is not available.");
    return;
  }
  state.term = term;
  state.courses = data;
  saveSelectedTerm(term);
  state.schedule = [];
  state.calendarSelected = defaultCalendarDateForTerm(term);
  state.calendarMiniMonth = new Date(state.calendarSelected.getFullYear(), state.calendarSelected.getMonth(), 1);
  state.browsePage = 0;
  groupedCache = null;
  sectionCache = null;
  buildFilters();
  renderBrowse();
  renderTermSwitch();
  renderCalendar();
  refreshDataFreshness();
  if (!$("#view-search").hidden) renderSearchResults();
  if (!$("#view-analysis").hidden) renderAnalysis();
  const sel = $("#term-select");
  if (sel && [...sel.options].some((o) => o.value === term)) {
    sel.value = term;
    updateHistoryLinks();
  }
  toast(`Switched to ${termShort(term)}. Schedule cleared.`);
}

const termBundleLoading = new Map();

/** 按需加载本地打包的学期数据（完整课表 + 选课记录）。 */
function loadTermBundle(term) {
  if (TERM_DATA[term] && TERM_DATA[term].length) return Promise.resolve(TERM_DATA[term]);
  const globalName = `COURSES_${term.replace("-", "_").toUpperCase()}`;
  if (window[globalName] && window[globalName].length) {
    TERM_DATA[term] = window[globalName];
    return Promise.resolve(TERM_DATA[term]);
  }
  if (termBundleLoading.has(term)) return termBundleLoading.get(term);
  const p = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = `data/courses-${term}.js`;
    s.onload = () => {
      const data = window[globalName];
      if (data && data.length) TERM_DATA[term] = data;
      termBundleLoading.delete(term);
      resolve(data && data.length ? data : null);
    };
    s.onerror = () => { termBundleLoading.delete(term); resolve(null); };
    document.head.appendChild(s);
  });
  termBundleLoading.set(term, p);
  return p;
}

/** 选择任一学期：优先用本地完整数据包，缺失时再回退到镜像。 */
async function selectTerm(term) {
  if (TERM_DATA[term] && TERM_DATA[term].length) { setTerm(term); return; }
  const info = SEMESTERS.find((s) => s.term === term);
  if (!info) { toast("This term is not available."); return; }
  toast(`Loading ${termShort(term)}…`);
  const bundled = await loadTermBundle(term);
  if (bundled) { setTerm(term); return; }
  try {
    const res = await fetch(info.json);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const normalized = raw.map((rec) => normalizeRecord(rec)).filter(isInScope);
    if (!normalized.length) throw new Error("No in-scope sections");
    TERM_DATA[term] = normalized;
    state.term = term;
    state.courses = normalized;
    saveSelectedTerm(term);
    state.schedule = [];
    state.calendarSelected = defaultCalendarDateForTerm(term);
    state.calendarMiniMonth = new Date(state.calendarSelected.getFullYear(), state.calendarSelected.getMonth(), 1);
    state.browsePage = 0;
    groupedCache = null;
    sectionCache = null;
    buildFilters();
    renderBrowse();
    renderTermSwitch();
    renderCalendar();
    refreshDataFreshness();
    if (!$("#view-analysis").hidden) renderAnalysis();
    toast(`Switched to ${termShort(term)}.`);
  } catch (err) {
    toast(`Could not load ${termShort(term)}: ${err.message}`);
    if (!state.courses.length) {
      state.term = "2027-Spring";
      state.courses = COURSES_2027;
      saveSelectedTerm(state.term);
      buildFilters();
      renderBrowse();
      renderTermSwitch();
      renderCalendar();
    }
  }
}

/* ============================================================
 * 课程浏览
 * ============================================================ */
const LEVEL_OPTIONS = [
  ["all", "All levels"],
  ["1", "1000 level (intro)"],
  ["2", "2000 level"],
  ["3", "3000 level"],
  ["4", "4000 level"],
  ["6", "6000+ level (graduate)"],
];
const METHOD_OPTIONS = [
  ["all", "All modes"],
  ["In-Person", "In-Person"],
  ["Hybrid", "Hybrid"],
  ["Online", "Online"],
];
const SORT_OPTIONS = [
  ["default", "Sort: default"],
  ["title", "Sort: Course title"],
  ["points", "Sort: Credits (high → low)"],
  ["culpa", "Sort: CULPA (high → low)"],
];
const DAY_OPTIONS = [
  ["all", "Any day"],
  ["1", "Monday"],
  ["2", "Tuesday"],
  ["3", "Wednesday"],
  ["4", "Thursday"],
  ["5", "Friday"],
  ["6", "Saturday"],
  ["7", "Sunday"],
];

function filterSelectHTML(key, options, current) {
  const cur = options.find(([v]) => String(v) === String(current)) || options[0];
  return `
    <div class="filter-dd" data-filter="${key}">
      <button class="filter-dd-btn" type="button" aria-haspopup="listbox" aria-expanded="false">
        <span class="filter-dd-label">${esc(cur[1])}</span>
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <div class="filter-dd-menu" role="listbox" hidden>
        <input class="filter-dd-input" type="text" autocomplete="off" spellcheck="false" placeholder="Type to filter…" aria-label="Filter options" />
        <div class="filter-dd-options">
          ${options.map(([v, t]) => `<button class="filter-dd-option" type="button" role="option" data-value="${esc(v)}" class="${String(v) === String(current) ? "active" : ""}" aria-selected="${String(v) === String(current)}">${esc(t)}</button>`).join("")}
        </div>
      </div>
    </div>`;
}

function buildFilters() {
  const all = getSections();
  const depts = [...new Set(all.map((c) => c.deptCode).filter(Boolean))].sort();
  const campuses = [...new Set(state.courses.map((c) => c.campus).filter(Boolean))].sort();
  const f = state.filters;
  if (f.dept !== "all" && !depts.includes(f.dept)) f.dept = "all";
  if (f.campus !== "all" && !campuses.includes(f.campus)) f.campus = "all";
  const deptOptions = [["all", "All depts"], ...depts.map((d) => [d, d])];
  const campusOptions = [["all", "All campuses"], ...campuses.map((c) => [c, c])];
  $("#filters").innerHTML = [
    filterSelectHTML("dept", deptOptions, f.dept),
    filterSelectHTML("level", LEVEL_OPTIONS, f.level),
    filterSelectHTML("campus", campusOptions, f.campus),
    filterSelectHTML("method", METHOD_OPTIONS, f.method),
    filterSelectHTML("sort", SORT_OPTIONS, f.sort),
    filterSelectHTML("day", DAY_OPTIONS, f.day),
  ].join("");
  updateFilterToggle();
}

function closeFilterMenus() {
  $$(".filter-dd.open").forEach((dd) => {
    dd.classList.remove("open");
    dd.querySelector(".filter-dd-btn")?.setAttribute("aria-expanded", "false");
    const menu = dd.querySelector(".filter-dd-menu");
    if (menu) setTimeout(() => { if (!dd.classList.contains("open")) menu.hidden = true; }, 160);
  });
}

function activeFilterCount() {
  const f = state.filters;
  return ["dept", "level", "campus", "method", "day"].filter((key) => f[key] !== "all").length
    + (f.sort !== "default" ? 1 : 0);
}

function updateFilterToggle() {
  const button = $("#filter-toggle");
  const badge = $("#filter-count");
  if (!button || !badge) return;
  const count = activeFilterCount();
  badge.textContent = count;
  badge.hidden = count === 0;
  button.setAttribute("aria-label", count ? `Filters, ${count} active` : "Filters");
}

function setFilterPanelOpen(open) {
  const panel = $("#filter-panel");
  const button = $("#filter-toggle");
  if (!panel || !button) return;
  panel.hidden = !open;
  button.setAttribute("aria-expanded", String(open));
  if (open) {
    hideSearchSuggestions();
    closeFilterMenus();
  }
}

function matchesFilters(course) {
  const f = state.filters;
  if (f.scope !== "all" && scopeOf(course) !== f.scope) return false;
  if (f.dept !== "all" && course.deptCode !== f.dept) return false;
  if (f.level !== "all") {
    if (f.level === "6" && course.level < 6000) return false;
    if (f.level !== "6" && Math.floor(course.level / 1000) * 1000 !== Number(f.level) * 1000) return false;
  }
  if (f.campus !== "all" && !course.campuses.includes(f.campus)) return false;
  if (f.method !== "all" && !course.sections.some((s) => (s.method || "").toLowerCase() === f.method.toLowerCase())) return false;
  if (f.day !== "all") {
    const day = Number(f.day);
    if (!course.sections.some((s) => s.days && s.days.includes(day))) return false;
  }
  return true;
}

function sortCourses(list) {
  const s = state.filters.sort;
  if (s === "title") return list.sort((a, b) => a.title.localeCompare(b.title));
  if (s === "points") return list.sort((a, b) => (b.minPoints || 0) - (a.minPoints || 0));
  if (s === "culpa") return list.sort((a, b) => (b.culpa || 0) - (a.culpa || 0));
  return list.sort((a, b) => a.deptCode.localeCompare(b.deptCode) || a.code.localeCompare(b.code));
}

function searchCourses(q) {
  q = q.trim().toLowerCase();
  const list = getSections();
  return q ? list.filter((c) => c.hay.includes(q)) : list;
}

function searchCoursesByFields({ course = "", department = "all", instructor = "" }) {
  const courseNeedle = normalizeSearchText(course);
  const instructorNeedle = normalizeSearchText(instructor);
  return getSections().filter((item) => {
    if (department !== "all" && item.deptCode !== department) return false;
    const courseHay = normalizeSearchText([
      item.code,
      item.title,
      item.section.classId,
      item.section.callNumber,
    ].join(" "));
    const instructorHay = normalizeSearchText(item.section.instructor || "");
    if (courseNeedle && !courseNeedle.split(" ").every((token) => courseHay.includes(token))) return false;
    if (instructorNeedle && !instructorNeedle.split(" ").every((token) => instructorHay.includes(token))) return false;
    return true;
  });
}

function titleCaseLabel(value) {
  return String(value || "").trim().toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function cardHTML(course, opts = {}) {
  const sec = course.sections;
  const one = course.section || course.sections[0];
  const instructors = [...new Set(sec.map((s) => s.instructor).filter(Boolean))];
  const credits = one.pointsLabel || one.points || course.minPoints;
  const meeting = meetingParts(one);
  const daysSet = new Set(one.days || []);
  const dayList = [1, 2, 3, 4, 5, 6, 7];
  const dayStrip = `
    <div class="day-strip">
      ${dayList.map((d) => {
        const active = daysSet.has(d);
        const label = d === 4 ? "R" : DAY_MINI[d - 1][0];
        return active
          ? `<button class="day-box active" data-day-filter="${d}" title="Filter by ${DAY_NAMES[d - 1]}">${label}</button>`
          : `<span class="day-box">${label}</span>`;
      }).join("")}
    </div>`;
  const timePill = `<button class="time-chip" data-act="cal" title="Add this section to your schedule">${esc(meeting.time)}</button>`;
  const an = enrollAnalysis(course);
  const hasEnroll = course.enrolledTotal > 0;
  const pct = course.hasCapacity && course.capacityTotal
    ? Math.min(100, Math.round((course.enrolledTotal / course.capacityTotal) * 100)) : null;
  const pctClass = pct == null ? "" : pct < 40 ? "low" : pct < 80 ? "mid" : "high";
  const arrowDown = `<svg class="drop-arrow" viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v15"/><path d="m5 13 7 7 7-7"/></svg>`;
  const arrowUp = `<svg class="drop-arrow" viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20V5"/><path d="m5 11 7-7 7 7"/></svg>`;
  const enrolled = hasEnroll ? course.enrolledTotal : 0;
  const capacity = course.hasCapacity ? course.capacityTotal : null;
  const openSeats = capacity != null ? Math.max(0, capacity - enrolled) : null;
  const countTip = capacity != null ? `${enrolled} enrolled · ${capacity} seats total` : `${enrolled} enrolled`;
  const fillTip = pct != null ? `${pct}% of seats filled${openSeats != null ? ` · ${openSeats} open` : ""}` : "Capacity unknown";
  let dropTip = "No post-start enrollment data for this section.";
  let dropChip = `<span class="enroll-box drop muted" data-tip="${esc(dropTip)}" title="${esc(dropTip)}">—</span>`;
  if (an && an.hasPostStart) {
    if (an.ended) {
      dropTip = "Enrollment reached near zero — this is likely an ended or module section.";
      dropChip = `<span class="enroll-box drop muted" data-tip="${esc(dropTip)}" title="${esc(dropTip)}">Ended</span>`;
    } else {
      const ratePct = Math.round(an.rate * 100);
      if (ratePct > 0) {
        const dropClass = ratePct >= 25 ? "high" : ratePct >= 12 ? "mid" : "";
        dropTip = `Enrollment fell ${ratePct}% from its opening peak to ${an.complete ? "the drop deadline" : "the latest available point"}.`;
        dropChip = `<span class="enroll-box drop ${dropClass}" data-tip="${esc(dropTip)}" title="${esc(dropTip)}">${arrowDown}${ratePct}%</span>`;
      } else if (ratePct < 0) {
        dropTip = `Enrollment grew ${Math.abs(ratePct)}% from its opening peak to ${an.complete ? "the drop deadline" : "the latest available point"}.`;
        dropChip = `<span class="enroll-box drop up" data-tip="${esc(dropTip)}" title="${esc(dropTip)}">${arrowUp}${Math.abs(ratePct)}%</span>`;
      } else {
        dropTip = "Enrollment is unchanged from its opening peak through the measured period.";
        dropChip = `<span class="enroll-box drop flat" data-tip="${esc(dropTip)}" title="${esc(dropTip)}">0%</span>`;
      }
    }
  }
  return `
    <div class="course-card" data-code="${esc(course.code)}" data-section="${esc(one.classId || "")}">
      <span class="stamp-shape" aria-hidden="true"></span>
      <div class="cc-main">
        <div class="cc-title" title="${esc(course.title)}" data-full-title="${esc(course.title)}">${esc(course.title)}</div>
        <div class="cc-code-row">
          <span class="cc-code-tags">
            <span class="cc-code">${esc(course.code)}</span>
            <span class="chip section-chip">Section ${esc(sectionLabel(one))}</span>
          </span>
        </div>
        <div class="cc-meta">
          ${instructors.length
            ? `<button class="info-pill instructor-pill" data-instructor="${esc(instructors[0])}" title="Open instructor profile">
                <span>${esc(instructors[0])}${instructors.length > 1 ? ` +${instructors.length - 1}` : ""}</span>
              </button>`
            : ""}
          ${course.culpa ? `<span class="chip warn">CULPA ${course.culpa}</span>` : ""}
          <span class="chip term">${esc(termShort(state.term))}</span>
          ${one.type ? `<span class="chip">${esc(titleCaseLabel(one.type))}</span>` : ""}
          ${credits != null && String(credits).trim() ? `<span class="chip credits" title="${esc(credits)} credits">${esc(credits)} cr</span>` : ""}
        </div>
        <div class="cc-days-row">
          ${dayStrip}
          ${timePill}
        </div>
        ${opts.reason ? `<div class="cc-reason">${esc(opts.reason)}</div>` : ""}
      </div>
      <div class="cc-bottom">
        ${pct != null ? `<div class="enroll-bar ${pctClass}"><span style="width:${pct}%"></span></div>` : `<div class="enroll-bar-spacer"></div>`}
        <div class="cc-enroll-inline ${pctClass}">
          <span class="enroll-box enroll-combo" data-tip="${esc(countTip)}${pct != null ? ` · ${esc(fillTip)}` : ""}" title="${esc(countTip)}${pct != null ? ` · ${esc(fillTip)}` : ""}">
            <b>${hasEnroll ? course.enrolledTotal : "—"}</b>${course.hasCapacity && course.capacityTotal ? `<span class="enroll-capacity">/<b>${course.capacityTotal}</b></span>` : ""}
            ${pct != null ? `<span class="enroll-combo-pct">${pct}%</span>` : ""}
          </span>
          ${dropChip}
        </div>
        <div class="card-add-wrap">
          <button class="card-add" type="button" aria-label="Add to…" title="Add to…"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg></button>
          <div class="card-add-menu" hidden>
            <button type="button" data-act="cal">Add to schedule</button>
            <button type="button" data-act="plan">Add to plan</button>
          </div>
        </div>
      </div>
    </div>`;
}

let titleFitFrame = 0;
function fitCourseCardTitles() {
  cancelAnimationFrame(titleFitFrame);
  titleFitFrame = requestAnimationFrame(() => {
    document.querySelectorAll("#course-list .cc-title, #search-results .cc-title").forEach((title) => {
      title.style.removeProperty("font-size");
    });
  });
}

function decorateStampCards(selector) {
  const list = $(selector);
  if (!list) return;
  const cards = [...list.querySelectorAll(":scope > .course-card")];
  if (!cards.length) return;
  const columns = getComputedStyle(list).gridTemplateColumns.split(/\s+/).filter(Boolean).length || 1;
  cards.forEach((card, index) => {
    const column = index % columns;
    card.classList.toggle("stamp-edge-right", column < columns - 1);
    card.classList.toggle("stamp-edge-bottom", index + columns < cards.length);
    card.style.setProperty("--stamp-column", String(column));
  });
}

let stampResizeFrame = 0;
function scheduleStampCardLayout() {
  cancelAnimationFrame(stampResizeFrame);
  stampResizeFrame = requestAnimationFrame(() => {
    ["#course-list", "#search-results"].forEach((selector) => {
      decorateStampCards(selector);
    });
  });
}

function renderBrowse() {
  const list = searchCourses("").filter(matchesFilters);
  sortCourses(list);

  const start = 0, end = Math.min(list.length, (state.browsePage + 1) * state.pageSize);
  const slice = list.slice(start, end);
  $("#course-list").innerHTML = slice.map((c) => cardHTML(c)).join("");
  fitCourseCardTitles();
  scheduleStampCardLayout();
  $("#load-more").hidden = end >= list.length;
  if (!list.length) $("#course-list").innerHTML = `<div class="notice info" style="grid-column:1/-1">No matching courses. Try relaxing the filters.</div>`;
}

function searchHash() {
  const params = new URLSearchParams();
  if (state.searchQuery) params.set("q", state.searchQuery);
  if (state.searchDepartment !== "all") params.set("dept", state.searchDepartment);
  if (state.searchInstructor) params.set("instructor", state.searchInstructor);
  return params.toString();
}

function syncSearchFields() {
  const course = $("#search");
  if (course) course.value = state.searchQuery;
}

function openSearch(query = "", options = {}) {
  state.searchQuery = String(options.course ?? query ?? "").trim();
  state.searchDepartment = options.department || "all";
  state.searchInstructor = String(options.instructor || "").trim();
  state.searchPage = 0;
  syncSearchFields();
  hideSearchSuggestions();
  switchView("search", { q: state.searchQuery });
}

function renderSearchResults() {
  const q = String(state.searchQuery || "").trim();
  const instructor = String(state.searchInstructor || "").trim();
  const department = state.searchDepartment || "all";
  const sub = $("#search-sub");
  const listEl = $("#search-results");
  const more = $("#search-more");
  if (!listEl) return;
  syncSearchFields();
  const hasQuery = Boolean(q || instructor || department !== "all");
  const list = hasQuery ? searchCoursesByFields({ course: q, department, instructor }) : [];
  if (sub) {
    const labels = [];
    if (q) labels.push(`<span class="search-query">“${esc(q)}”</span>`);
    if (department !== "all") labels.push(`<span class="search-query">${esc(department)}</span>`);
    if (instructor) labels.push(`<span class="search-query">${esc(instructor)}</span>`);
    sub.innerHTML = hasQuery
      ? `<span class="search-count"><b>${list.length}</b> result${list.length === 1 ? "" : "s"}</span>
         <span class="search-for">${department !== "all" || instructor ? "matching" : "for"}</span> ${labels.join(" · ")}`
      : `<span class="search-hint">Search by course, department, or instructor in the top bar.</span>`;
  }
  const limit = Math.min(list.length, (state.searchPage + 1) * state.pageSize);
  listEl.innerHTML = list.slice(0, limit).map((c) => cardHTML(c)).join("")
    || `<div class="notice info" style="grid-column:1/-1">No matching courses. Try another code, title or instructor.</div>`;
  fitCourseCardTitles();
  scheduleStampCardLayout();
  if (more) more.hidden = limit >= list.length;
}

function sparklineSVG(series, w = 600, h = 100, key = "s", interactive = false) {
  if (!series || series.length < 2) return "";
  const values = series.map((p) => p[1]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const pts = series.map((p, i) => [
    24 + (i * (w - 48)) / (series.length - 1),
    h - 14 - ((p[1] - min) / span) * (h - 32),
  ]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L ${pts[pts.length - 1][0].toFixed(1)} ${h - 10} L ${pts[0][0].toFixed(1)} ${h - 10} Z`;
  const gid = `g-${String(key).replace(/[^A-Za-z0-9]/g, "")}-${series.length}`;
  const dots = interactive ? series.map((p, i) => `
    <circle class="spark-dot-hit" cx="${pts[i][0].toFixed(1)}" cy="${pts[i][1].toFixed(1)}" r="9"
      fill="transparent" data-date="${esc(p[0])}" data-value="${p[1]}"></circle>
    <circle class="spark-dot" cx="${pts[i][0].toFixed(1)}" cy="${pts[i][1].toFixed(1)}" r="2.6" fill="#426b50" pointer-events="none"></circle>
  `).join("") : "";
  const svg = `
    <svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#426b50" stop-opacity="0.20"/>
          <stop offset="1" stop-color="#426b50" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#${gid})"/>
      <path d="${line}" fill="none" stroke="#426b50" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
    </svg>`;
  if (!interactive) return svg;
  const fmtDate = (d) => d.slice(5).replace("-", "/");
  const midIndex = Math.floor((series.length - 1) / 2);
  const yMid = Math.round((min + max) / 2);
  return `
    <div class="spark-wrap">
      <div class="chart-y"><span>${max}</span><span>${yMid}</span><span>${min}</span></div>
      <div class="chart-col">
        ${svg}
        <div class="chart-x">
          <span>${fmtDate(series[0][0])}</span>
          <span>${fmtDate(series[midIndex][0])}</span>
          <span>${fmtDate(series[series.length - 1][0])}</span>
        </div>
      </div>
      <div class="spark-tip" hidden></div>
    </div>`;
}

function bindSparklines(root) {
  root.querySelectorAll(".spark-wrap").forEach((wrap) => {
    const tip = wrap.querySelector(".spark-tip");
    wrap.querySelectorAll(".spark-dot-hit").forEach((dot) => {
      dot.addEventListener("mouseenter", () => {
        tip.textContent = `${dot.dataset.date} · ${dot.dataset.value} enrolled`;
        tip.hidden = false;
        const wr = wrap.getBoundingClientRect();
        const dr = dot.getBoundingClientRect();
        tip.style.left = `${Math.max(8, Math.min(wr.width - 150, dr.left - wr.left - 62))}px`;
        tip.style.top = `${Math.max(4, dr.top - wr.top - 36)}px`;
      });
      dot.addEventListener("mouseleave", () => { tip.hidden = true; });
    });
  });
}

function comparisonFor(code) {
  const key = normCode(code);
  return Object.entries(TERM_DATA).flatMap(([term, rows]) => {
    const deadline = termDropDeadline(term);
    return rows.filter((r) => normCode(r.code) === key).map((s) => {
      const clipped = (s.enrollSeries || []).filter(([d]) => !deadline || d <= deadline);
      const an = clipped.length > 1 ? enrollAnalysis({ series: withZeroBaseline(clipped) }, term) : null;
      return {
        term,
        section: s,
        enrolled: s.enrolled ?? 0,
        capacity: s.capacity ?? null,
        asOf: s.enrollLastDate || null,
        points: s.points,
        instructor: s.instructor || "TBA",
        meeting: meetingsOf([s])[0] || "Time TBA",
        drop: an ? { rate: an.rate, ended: an.ended, hasPostStart: an.hasPostStart } : null,
      };
    });
  });
}

function renderComparison(comp) {
  const terms = new Set(comp.map((x) => x.term));
  if (terms.size < 2) return "";
  const max = Math.max(...comp.map((x) => x.enrolled || 0), 1);
  const years = new Map();
  for (const item of comp) {
    const year = item.term.slice(0, 4);
    if (!years.has(year)) years.set(year, []);
    years.get(year).push(item);
  }
  const groups = [...years.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, items]) => [
      year,
      items.sort((a, b) =>
        b.term.localeCompare(a.term) ||
        String(sectionLabel(a.section)).localeCompare(String(sectionLabel(b.section)))),
    ]);
  const renderRow = (x) => {
    const fill = x.capacity != null
      ? Math.min(100, Math.round(((x.enrolled || 0) / x.capacity) * 100))
      : Math.round(((x.enrolled || 0) / max) * 100);
    const tone = fill < 40 ? "low" : fill < 80 ? "mid" : "high";
    let dropLabel = `<span class="cmp-drop muted">—</span>`;
    if (x.drop && x.drop.hasPostStart) {
      if (x.drop.ended) {
        dropLabel = `<span class="cmp-drop muted">Ended</span>`;
      } else {
        const pct = Math.round(x.drop.rate * 100);
        if (pct > 0) dropLabel = `<span class="cmp-drop ${pct >= 25 ? "high" : pct >= 12 ? "mid" : ""}">↓ ${pct}%</span>`;
        else if (pct < 0) dropLabel = `<span class="cmp-drop up">↑ ${Math.abs(pct)}%</span>`;
        else dropLabel = `<span class="cmp-drop flat">0%</span>`;
      }
    }
    return `
      <div class="cmp-row">
        <div class="cmp-left">
          <span class="cmp-term">${esc(termShort(x.term))}</span>
          <span class="cmp-sec">Section ${esc(sectionLabel(x.section))}</span>
        </div>
        <div class="cmp-mid">
          <div class="cmp-bar ${tone}"><span style="width:${fill}%"></span></div>
          <b>${x.enrolled || 0}${x.capacity != null ? ` / ${x.capacity}` : ""}</b>
          ${dropLabel}
        </div>
        <div class="cmp-inst" title="${esc(x.instructor)}">${esc(x.instructor)}</div>
      </div>`;
  };
  return `
    <div class="term-compare">
      <div class="ea-head"><h3>Term comparison</h3><span>Per section</span></div>
      ${groups.map(([year, items]) => `
        <section class="cmp-year-group">
          <div class="cmp-year-heading">
            <span>${esc(year)}</span>
            <small>${items.length} section${items.length === 1 ? "" : "s"}</small>
          </div>
          <div class="cmp-list">${items.map(renderRow).join("")}</div>
        </section>`).join("")}
      <div class="daily-note">Snapshots are taken at different points in each term. Registration-phase numbers are not final.</div>
    </div>`;
}

function renderEnrollAnalysis(course, an) {
  if (!an) return "";
  if (!an.hasPostStart) {
    return `
      <div class="enroll-analysis">
        <div class="ea-head"><h3>Enrollment</h3><span>${esc(an.end.d)}</span></div>
        <div class="ea-stats">
          <div><b>Current enrolled</b><span>${an.end.e}</span></div>
          <div><b>Term</b><span>${esc(termShort(state.term))}</span></div>
        </div>
        ${sparklineSVG(course.series, 600, 100, course.code, true)}
        <div class="ea-note info">This term has not started yet; these are registration-phase numbers. Once classes begin, week 1 / week 2 and latest comparisons will appear automatically.</div>
      </div>`;
  }
  if (an.ended) {
    return `
      <div class="enroll-analysis">
        <div class="ea-head"><h3>Enrollment trend</h3><span>${esc(an.end.d)}</span></div>
        <div class="ea-stats">
          <div><b>Week 1</b><span>${an.week1.e}</span></div>
          <div><b>Week 2</b><span>${an.week2.e}</span></div>
          <div><b>Latest</b><span>${an.end.e}</span></div>
        </div>
        ${sparklineSVG(course.series, 600, 100, course.code, true)}
        <div class="ea-note info">
          <b>Ended / module course</b>
          <span>Latest enrollment is near or at zero, which usually means the module has ended. It is not used as a difficulty signal.</span>
        </div>
      </div>`;
  }
  return `
    <div class="enroll-analysis">
      <div class="ea-head"><h3>Post-start enrollment</h3><span>${esc(an.end.d)}</span></div>
      <div class="ea-stats">
        <div><b>Opening peak</b><span>${an.base}</span></div>
        <div><b>Week 1</b><span>${an.week1.e}</span></div>
        <div><b>Week 2</b><span>${an.week2.e}</span></div>
        <div><b>${an.complete ? "At drop deadline" : "Latest"}</b><span>${an.end.e}</span></div>
      </div>
      ${sparklineSVG(course.series, 600, 100, course.code, true)}
      <div class="ea-hint">Drop rate compares the opening 14-day peak with the drop deadline${an.complete ? "" : " or latest available point"}.</div>
    </div>`;
}

/* ---------- 课程详情 ---------- */
function openCourse(code, sectionId = "") {
  const sections = state.courses.filter((c) => normCode(c.code) === normCode(code));
  if (!sections.length) return;
  state.modalCourse = { code, sectionId };
  const c = groupByCode(sections)[0];
  const selected = sections.find((s) => s.classId === sectionId) || sections[0];
  const selectedCard = sectionToCard(selected);
  const body = $("#modal-body");
  const prereqHTML = renderPrereqs(selected.prereqs);
  const description = (c.sections.find((s) => s.desc)?.desc || "No description available.")
    .replace(/^Description\.\s*/i, "");
  const an = enrollAnalysis(selectedCard);
  const comp = comparisonFor(c.code);
  body.innerHTML = `
    <div class="m-folder">
      <div class="m-folder-tabs" role="tablist" aria-label="Course details">
        <button class="m-folder-tab active" type="button" role="tab" id="m-tab-overview" aria-controls="m-panel-overview" aria-selected="true" data-mtab="overview">Overview</button>
        <button class="m-folder-tab" type="button" role="tab" id="m-tab-materials" aria-controls="m-panel-materials" aria-selected="false" data-mtab="materials">Course materials</button>
      </div>
      <div class="m-folder-head">
        <h2>${esc(c.code)} · ${esc(c.title)}</h2>
        <div class="m-sub">${esc(c.dept)}${c.sections[0].subtitle && c.sections[0].subtitle !== c.title ? " · " + esc(c.sections[0].subtitle) : ""} · Section ${esc(sectionLabel(selected))}</div>
      </div>
      <section class="m-folder-panel" id="m-panel-overview" role="tabpanel" aria-labelledby="m-tab-overview" data-mpanel="overview">
        <div class="m-grid">
          <div><b>Term</b>${esc(termLabel(state.term))}</div>
          <div><b>Credits</b>${selected.points != null ? selected.points : "—"}</div>
          <div><b>Type</b>${esc([...new Set(c.sections.map((s) => s.type).filter(Boolean))].join(" / ") || "—")}</div>
          <div><b>Instructor</b>${selected.instructor ? `<button class="instructor-link" type="button" data-instructor="${esc(selected.instructor)}">${esc(selected.instructor)}</button>` : "TBA"}</div>
        </div>
        <details class="m-desc-details">
          <summary>
            <span>Description</span>
            <span class="m-desc-toggle" aria-hidden="true">
              <span class="m-desc-expand">Expand</span>
              <span class="m-desc-collapse">Collapse</span>
            </span>
          </summary>
          <div class="m-desc">${esc(description)}</div>
        </details>
        ${an ? renderEnrollAnalysis(selectedCard, an) : ""}
        <div class="culpa-review-host" id="culpa-review-host">
          <div class="culpa-review-loading">Loading CULPA reviews…</div>
        </div>
        ${renderComparison(comp)}
      </section>
      <section class="m-folder-panel" id="m-panel-materials" role="tabpanel" aria-labelledby="m-tab-materials" data-mpanel="materials" hidden>
        <div class="m-grid">
          <div class="m-prereq-cell"><b>Prerequisites</b>${prereqHTML || "None"}</div>
        </div>
        <h3 class="section-title m-folder-section-title">Section details</h3>
        <table class="sections-table">
          <thead><tr><th>Section</th><th>Instructor</th><th>Days</th><th>Time</th><th>Location</th><th>Enrolled</th></tr></thead>
          <tbody>
          ${c.sections.map((s) => `
            <tr class="${s.classId === selected.classId ? "selected" : ""}">
              <td title="${esc(s.classId || "")}">${esc(sectionLabel(s) || "—")}</td>
              <td>${s.instructor ? `<button class="instructor-link" type="button" data-instructor="${esc(s.instructor)}">${esc(s.instructor)}</button>` : "TBA"}</td>
              <td>${esc((s.days || []).map((d) => DAY_MINI[d - 1]).join("/") || "TBA")}</td>
              <td>${s.start != null ? esc(timeRangeLabel(s.start, s.end)) : "TBA"}</td>
              <td>${s.location
                ? (matchBuilding(s.location)
                  ? `<button class="loc-link" data-loc="${esc(s.location)}" title="${esc(cleanLocation(s.location))}">${esc(cleanLocation(s.location))}</button>`
                  : esc(cleanLocation(s.location)))
                : "TBA"}</td>
              <td>${s.enrolled != null ? s.enrolled : "—"}${s.capacity != null ? "/" + s.capacity : ""}</td>
            </tr>`).join("")}
          </tbody>
        </table>
        ${c.sections[0].method ? `<div class="m-grid"><div><b>Mode</b>${esc(c.sections[0].method)}</div></div>` : ""}
      </section>
      <div class="modal-actions">
        <button class="btn primary" data-addcal="${esc(c.code)}">Add to schedule</button>
        <button class="btn ghost" data-addplan="${esc(c.code)}">Add to plan</button>
        ${c.sections[0].link ? `<a class="btn ghost m-course-link" href="${esc(c.sections[0].link)}" target="_blank" rel="noopener">Official course page ↗</a>` : ""}
      </div>
    </div>
  `;
  const folderTabs = [...body.querySelectorAll(".m-folder-tab")];
  const selectFolderTab = (name) => {
    folderTabs.forEach((tab) => {
      const active = tab.dataset.mtab === name;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    body.querySelectorAll(".m-folder-panel").forEach((panel) => {
      panel.hidden = panel.dataset.mpanel !== name;
    });
    $(".modal").scrollTop = 0;
  };
  folderTabs.forEach((tab) => tab.addEventListener("click", () => selectFolderTab(tab.dataset.mtab)));
  body.querySelector(".m-folder-tabs")?.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const current = folderTabs.findIndex((tab) => tab.classList.contains("active"));
    const next = (current + (event.key === "ArrowRight" ? 1 : -1) + folderTabs.length) % folderTabs.length;
    selectFolderTab(folderTabs[next].dataset.mtab);
    folderTabs[next].focus();
  });
  body.querySelectorAll(".instructor-link").forEach((button) => {
    button.addEventListener("click", () => {
      const instructor = button.dataset.instructor;
      closeModal();
      openInstructor(instructor);
    });
  });
  body.querySelectorAll(".prereq-link").forEach((a) =>
    a.addEventListener("click", () => openCourse(a.dataset.code)));
  body.querySelectorAll(".loc-link").forEach((btn) =>
    btn.addEventListener("click", () => showLocation(btn.dataset.loc)));
  bindSparklines(body);
  body.querySelector("[data-addcal]")?.addEventListener("click", () => {
    addSectionsToSchedule(c.code, selected.classId);
  });
  body.querySelector("[data-addplan]")?.addEventListener("click", () => {
    addToPlan(c.code);
  });
  $("#modal").hidden = false;
  document.body.style.overflow = "hidden";
  loadCulpaReviews(c.code, selected.instructor || "");
}

function renderCulpaReviews(data, instructor, host) {
  const searchName = String(instructor || "").trim();
  const rmpQuery = `site:ratemyprofessors.com ${searchName} Columbia`;
  const rmpLink = searchName && !/^(faculty|tba)$/i.test(searchName)
    ? `<a class="review-outlink" href="https://www.google.com/search?q=${encodeURIComponent(rmpQuery)}" target="_blank" rel="noopener" title="RateMyProfessors profile pages are unavailable; search RMP on Google">Search RateMyProfessors ↗</a>`
    : "";
  if (!data?.ok) {
    const message = data?.unavailable
      ? "CULPA reviews are unavailable in this static deployment."
      : "No matching CULPA course page was found.";
    host.innerHTML = `
      <div class="culpa-empty">
        <span>${message}</span>
        ${rmpLink}
      </div>`;
    return;
  }
  const reviews = data.reviews || [];
  const rating = data.averageRating != null ? Number(data.averageRating).toFixed(1) : "—";
  const reviewDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? ""
      : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };
  host.innerHTML = `
    <section class="culpa-review-card">
      <div class="culpa-review-head">
        <div>
          <span class="culpa-kicker">CULPA · Student reviews</span>
          <h3>${esc(data.courseName || data.code)}</h3>
        </div>
        <div class="culpa-review-links">
          ${rmpLink}
          <a class="review-outlink" href="https://culpa.info/course/${encodeURIComponent(data.courseId)}" target="_blank" rel="noopener">Open on CULPA ↗</a>
        </div>
      </div>
      <div class="culpa-review-summary">
        <div><b>${rating}</b><span>average rating</span></div>
        <div><b>${Number(data.reviewCount || reviews.length).toLocaleString("en-US")}</b><span>published reviews</span></div>
      </div>
      ${reviews.length ? `<div class="culpa-review-list">
        ${reviews.slice(0, 3).map((review) => `
          <article class="culpa-review">
            <div class="culpa-review-meta">
              <span>${"★".repeat(Math.max(1, Math.min(5, Number(review.rating) || 1)))}</span>
              <b>${esc(review.professor || "CULPA reviewer")}</b>
              <time>${esc(reviewDate(review.date))}</time>
            </div>
            <p title="${esc(review.content || "")}">${esc(review.content || "")}</p>
            ${review.workload ? `<small><b>Workload</b> ${esc(review.workload)}</small>` : ""}
          </article>`).join("")}
      </div>` : `<div class="culpa-empty">No published CULPA reviews for this course yet.</div>`}
      <p class="culpa-disclaimer">CULPA is an independent student-run review site. Reviews are anecdotal and are not official Columbia course evaluations.</p>
    </section>`;
}

async function loadCulpaReviews(code, instructor) {
  const host = $("#culpa-review-host");
  if (!host) return;
  const normalized = normCode(code);
  try {
    let data = culpaReviewCache.get(normalized);
    if (!data) {
      let response = await fetch(`/api/culpa-course?code=${encodeURIComponent(normalized)}`, { cache: "no-store" });
      if (!response.ok) {
        response = await fetch("data/culpa-reviews.json", { cache: "no-store" });
        if (response.ok) {
          const cache = await response.json();
          data = cache.courses?.[normalized] || { ok: false, unavailable: true, code: normalized, reviews: [] };
        }
      } else {
        data = await response.json();
      }
      if (!data) throw new Error("CULPA reviews unavailable");
      culpaReviewCache.set(normalized, data);
    }
    if (host.isConnected) renderCulpaReviews(data, instructor, host);
  } catch (_) {
    if (host.isConnected) {
      renderCulpaReviews({ ok: false, unavailable: true }, instructor, host);
    }
  }
}

function renderPrereqs(prereqs) {
  if (!prereqs || !prereqs.length) return "";
  const groups = prereqs.map((g) => {
    const codes = (Array.isArray(g) ? g : [g]).map((x) =>
      `<span class="prereq-link" data-code="${esc(x)}">${esc(x)}</span>`);
    return codes.length > 1 ? `(${codes.join(" or ")})` : codes.join("");
  });
  return groups.join(" and ");
}

function closeModal() {
  $("#modal").hidden = true;
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
  state.modalCourse = null;
}

/* ============================================================
 * 历史学期
 * ============================================================ */
function renderHistory() {
  const sel = $("#term-select");
  const terms = [...SEMESTERS].sort((a, b) => b.term.localeCompare(a.term));
  sel.innerHTML = terms.map((s) =>
    `<option value="${esc(s.term)}" ${s.term === state.term ? "selected" : ""}>${esc(s.term)}</option>`).join("");
  updateHistoryLinks();
}

function makeTermInfo(term) {
  return {
    term,
    custom: true,
    json: `${MIRROR_BASE}/classes/${term}.json`,
    csv: `${MIRROR_BASE}/classes/${term}.csv`,
    enrollment: `${MIRROR_BASE}/classes-enrollment/${term}.json`,
  };
}

function loadCustomTerms() {
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOM_TERMS_KEY) || "[]");
    for (const t of saved) {
      if (!SEMESTERS.some((s) => s.term === t)) SEMESTERS.push(makeTermInfo(t));
    }
  } catch { /* ignore malformed storage */ }
}

function persistCustomTerms() {
  const custom = SEMESTERS.filter((s) => s.custom).map((s) => s.term);
  localStorage.setItem(CUSTOM_TERMS_KEY, JSON.stringify(custom));
}

function addCustomTerm() {
  const raw = ($("#new-term").value || "").trim();
  const m = raw.match(/^(\d{4})-(spring|summer|fall)$/i);
  if (!m) {
    toast("Use a term like 2028-Fall, 2029-Spring, or 2028-Summer.");
    return;
  }
  const term = `${m[1]}-${m[2][0].toUpperCase()}${m[2].slice(1).toLowerCase()}`;
  if (!SEMESTERS.some((s) => s.term === term)) {
    SEMESTERS.push(makeTermInfo(term));
    persistCustomTerms();
  }
  renderHistory();
  $("#term-select").value = term;
  updateHistoryLinks();
  $("#new-term").value = "";
  loadTerm();
}

function updateHistoryLinks() {
  const term = $("#term-select").value;
  const info = SEMESTERS.find((s) => s.term === term);
  if (!info) return;
  $("#load-enroll").hidden = !info.enrollment;
  $("#history-links").innerHTML = `
    <a href="${esc(info.json)}" target="_blank" rel="noopener">Download JSON</a>
    <a href="${esc(info.csv)}" target="_blank" rel="noopener">Download CSV</a>
    ${info.enrollment ? `<a href="${esc(info.enrollment)}" target="_blank" rel="noopener">Enrollment data</a>` : ""}
  `;
}

async function loadTerm() {
  const term = $("#term-select").value;
  const info = SEMESTERS.find((s) => s.term === term);
  if (!info) return;
  $("#history-loading").hidden = false;
  $("#history-error").hidden = true;
  $("#history-meta").textContent = "";
  try {
    const res = await fetch(info.json);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const normalized = raw.map((rec) => normalizeRecord(rec)).filter(isInScope);
    state.courses = normalized;
    state.term = term;
    TERM_DATA[term] = normalized;
    sectionCache = null;
    state.schedule = [];
    buildFilters();
    renderBrowse();
    renderTermSwitch();
    renderCalendar();
    $("#history-meta").textContent = `Loaded ${term}: ${normalized.length} ${FOCUS_LABEL} sections. Open Browse to search them.`;
  } catch (err) {
    $("#history-error").hidden = false;
    $("#history-error").textContent = `Load failed: ${err.message}. Check your connection or download the raw file above.`;
  } finally {
    $("#history-loading").hidden = true;
  }
}

function buildEnrollmentMap(raw, term) {
  const deadline = termDropDeadline(term);
  const map = new Map();
  for (const r of raw) {
    let entries = Object.keys(r.enrollment || {}).sort().map((date) => {
      const [a, b] = String(r.enrollment[date] || "").split("/");
      return {
        date,
        enrolled: Number.parseInt(a, 10),
        capacity: /^\d+$/.test(b || "") ? Number.parseInt(b, 10) : null,
      };
    }).filter((p) => Number.isFinite(p.enrolled));
    if (!entries.length) continue;
    if (deadline) {
      const cut = entries.filter((p) => p.date <= deadline);
      if (cut.length) entries = cut;
    }
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

async function loadEnrollmentForTerm() {
  const term = $("#term-select").value;
  const info = SEMESTERS.find((s) => s.term === term);
  if (!info?.enrollment) return;
  const btn = $("#load-enroll");
  btn.disabled = true;
  btn.textContent = "Loading…";
  $("#history-meta").textContent = "Loading enrollment data (may be tens of MB)…";
  try {
    const res = await fetch(info.enrollment);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const map = buildEnrollmentMap(raw, term);
    let matched = 0;
    let snapshot = "";
    for (const c of state.courses) {
      const e = map.get(c.callNumber);
      if (e) {
        c.enrolled = e.last.enrolled;
        c.capacity = e.last.capacity;
        c.enrollSeries = e.series;
        c.enrollLastDate = e.last.date;
        matched++;
        if (e.last.date > snapshot) snapshot = e.last.date;
      }
    }
    groupedCache = null;
    sectionCache = null;
    buildFilters();
    renderBrowse();
    if (!$("#view-analysis").hidden) renderAnalysis();
    $("#history-meta").textContent = `Merged enrollment for ${matched} sections in ${term} (updated ${snapshot || "—"}).`;
  } catch (err) {
    $("#history-meta").textContent = `Enrollment load failed: ${err.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Load enrollment";
  }
}

function normalizeRecord(rec) {
  const WEEKDAY = { M: 1, T: 2, W: 3, H: 4, R: 4, F: 5, S: 6, U: 7 };
  const toMin = (t) => {
    if (!t || !/^\d{1,2}:\d{2}(am|pm)$/i.test(t)) return null;
    const m = t.match(/^(\d{1,2}):(\d{2})(am|pm)$/i);
    let h = Number(m[1]); const min = Number(m[2]); const ap = m[3].toLowerCase();
    if (ap === "pm" && h !== 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    return h * 60 + min;
  };
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
    start: toMin(rec.scheduled_time_start),
    end: toMin(rec.scheduled_time_end),
    startLabel: rec.scheduled_time_start || null,
    endLabel: rec.scheduled_time_end || null,
    location: rec.location || null,
    campus: rec.campus || null,
    method: rec.method_of_instruction || null,
    points: parseFloat(String(rec.points || "").split("-")[0]) || null,
    pointsLabel: rec.points ? String(rec.points) : null,
    prereqs: Array.isArray(rec.prerequisites) ? rec.prerequisites : [],
    callNumber: rec.call_number || null,
    enrolled: rec.enrolled ?? null,
    capacity: rec.capacity ?? null,
    enrollSeries: Array.isArray(rec.enrollSeries) ? rec.enrollSeries : null,
    enrollLastDate: rec.enrollLastDate || null,
    classId: rec.class_id || null,
    openTo: Array.isArray(rec.open_to) ? rec.open_to : [],
    type: rec.type || null,
    link: rec.link || null,
  };
}

/* ============================================================
 * 推荐
 * ============================================================ */
function renderRecommendView() {
  const depts = [...new Set(state.courses.map((c) => c.deptCode).filter(Boolean))].sort();
  if (state.recDept !== "all" && !depts.includes(state.recDept)) {
    state.recDept = depts.includes("QMSS") ? "QMSS" : "all";
  }
  const label = $("#rec-dept-label");
  if (label) label.textContent = state.recDept === "all" ? "All departments" : state.recDept;
  const menu = $("#rec-dept-menu");
  if (menu) {
    const opts = [["all", "All departments"], ...depts.map((d) => [d, d])];
    menu.innerHTML = opts.map(([v, t]) =>
      `<button type="button" role="option" data-recv="${esc(v)}" class="${state.recDept === v ? "active" : ""}" aria-selected="${state.recDept === v}">${esc(t)}</button>`).join("");
  }
  const badge = $("#rec-term-badge");
  if (badge) badge.textContent = termShort(state.term);
  const sortEl = $("#rec-sort");
  if (sortEl) {
    sortEl.innerHTML = [["score", "Best matches"], ["open", "Most open"], ["stable", "Lowest drop"]]
      .map(([k, l]) => `<button class="btn small ${state.recSort === k ? "active" : ""}" data-recsort="${k}">${l}</button>`).join("");
  }
  runRecommend();
}

function renderTaken() {
  const el = $("#rec-taken");
  if (!el) return;
  el.innerHTML = state.taken.map((t) =>
    `<span class="tag">${esc(t)} <button data-x="${esc(t)}">×</button></span>`).join("");
  el.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      state.taken = state.taken.filter((x) => x !== b.dataset.x);
      renderTaken();
    }));
}

function addTaken(code) {
  code = normCode(code);
  if (code && !state.taken.includes(code)) { state.taken.push(code); renderTaken(); }
}

function prereqMet(course, takenSet) {
  if (!course.prereqs || !course.prereqs.length) return true;
  return course.prereqs.every((group) => {
    const g = Array.isArray(group) ? group : [group];
    return g.some((code) => takenSet.has(normCode(code)));
  });
}

function runRecommend() {
  const dept = state.recDept;
  const rows = [];
  for (const c of getSections()) {
    if (dept !== "all" && c.deptCode !== dept) continue;
    const type = String((c.section && c.section.type) || "").toUpperCase();
    if (/DISCUSSION|RECITATION|INDEPENDENT/.test(type)) continue;
    if (c.minPoints == null || c.minPoints <= 0) continue;
    const fill = c.hasCapacity && c.capacityTotal > 0 ? c.enrolledTotal / c.capacityTotal : null;
    if (fill == null || fill >= 1) continue;
    const an = enrollAnalysis(c);
    if (an && an.ended) continue;
    const dropKnown = !!(an && an.hasPostStart && !an.lowSample);
    const dropRate = dropKnown ? an.rate : null;
    const open = Math.max(0, Math.min(1, 1 - fill));
    const stability = dropRate == null ? 0.5 : Math.max(0, Math.min(1, 1 - dropRate));
    const score = open * 0.6 + stability * 0.4;
    const openSeats = Math.max(0, (c.capacityTotal || 0) - c.enrolledTotal);
    rows.push({ c, fill, openSeats, dropRate, dropKnown, score });
  }
  if (state.recSort === "open") {
    rows.sort((a, b) => a.fill - b.fill || b.score - a.score);
  } else if (state.recSort === "stable") {
    rows.sort((a, b) => {
      const da = a.dropRate == null ? 9 : a.dropRate;
      const db = b.dropRate == null ? 9 : b.dropRate;
      return da - db || b.score - a.score;
    });
  } else {
    rows.sort((a, b) => b.score - a.score || a.fill - b.fill);
  }
  const top = rows.slice(0, 18);
  state.recResult = top.map((x) => x.c);
  const meta = $("#rec-meta");
  if (meta) meta.textContent = `${dept === "all" ? "All departments" : dept} · ${rows.length} sections with open seats · ${termShort(state.term)}`;
  const res = $("#rec-results");
  if (res) {
    res.innerHTML = top.map(({ c, fill, openSeats, dropRate, dropKnown, score }) => {
      const dropLabel = !dropKnown
        ? "drop —"
        : dropRate > 0.005
          ? `drop ${Math.round(dropRate * 100)}%`
          : dropRate < -0.005
            ? `grew ${Math.round(-dropRate * 100)}%`
            : "stable";
      return cardHTML(c, { reason: `Score ${Math.round(score * 100)} · ${openSeats} open seat${openSeats === 1 ? "" : "s"} · ${Math.round(fill * 100)}% filled · ${dropLabel}` });
    }).join("") || `<div class="notice info" style="grid-column:1/-1">No sections with open seats for ${esc(dept)} in ${esc(termShort(state.term))}.</div>`;
  }
}

/* ============================================================
 * 选课人数分析
 * ============================================================ */
let analysisSort = "drop";

function dailyHistoryForTerm() {
  return enrollHistoryCache.get(state.term) || null;
}

/** 按需加载某个学期的选课周期日志（data/enrollment-history/<term>.js）。 */
function loadEnrollHistory(term) {
  if (enrollHistoryCache.has(term)) return Promise.resolve(enrollHistoryCache.get(term));
  if (enrollHistoryLoading.has(term)) return enrollLoadChain;
  enrollHistoryLoading.add(term);
  enrollLoadChain = enrollLoadChain.then(() => new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = `data/enrollment-history/${term}.js`;
    s.onload = () => {
      const h = window.ENROLL_HISTORY;
      if (h && h.term) enrollHistoryCache.set(h.term, h);
      enrollHistoryLoading.delete(term);
      if (h?.term === state.term) renderDataFreshness();
      resolve(enrollHistoryCache.get(term) || null);
    };
    s.onerror = () => {
      enrollHistoryLoading.delete(term);
      resolve(null);
    };
    document.head.appendChild(s);
  }));
  return enrollLoadChain;
}

function dailyMetricsHTML(metrics, lastValue) {
  const values = [
    ["Sections", metrics ? metrics.sectionCount : "—"],
    ["Total enrolled", lastValue ? lastValue.totalEnrolled : "—"],
    ["Current enrolled", metrics ? `${metrics.totalEnrolled}${metrics.totalCap ? ` / ${metrics.totalCap}` : ""}` : "—"],
    ["Net change", lastValue ? (lastValue.netChange >= 0 ? "+" : "") + lastValue.netChange : "—"],
    ["Average drop-off", metrics && metrics.averageDropOff != null ? `${metrics.averageDropOff}%` : "—"],
    ["Added", lastValue ? `+${lastValue.added}` : "—"],
    ["Sections with ≥25% drop", metrics ? metrics.highDropCount : "—"],
    ["Dropped", lastValue ? `-${lastValue.dropped}` : "—"],
  ];
  return values.map(([label, value]) => `<div><b>${label}</b><span>${value}</span></div>`).join("");
}

function combinedFlowChartSVG(points, width = 900, height = 356) {
  if (!points.length) return "";
  const left = 46;
  const right = 42;
  const barTop = 18;
  const barBottom = Math.round(height * 0.66);
  const dividerY = Math.round(height * 0.715);
  const lineTop = Math.round(height * 0.77);
  const lineBottom = Math.round(height * 0.94);
  const axisY = height - 6;
  const plotW = width - left - right;
  const maxFlow = Math.max(...points.flatMap((point) => [point.added, point.dropped]), 1);
  const maxTotal = Math.max(...points.map((point) => point.total), 1);
  const slot = plotW / points.length;
  const barW = Math.max(1, Math.min(10, slot * 0.3));
  const flowHeight = barBottom - barTop;
  const totalHeight = lineBottom - lineTop;
  const fmt = (n) => Number(n).toLocaleString("en-US");

  const flowGrid = [maxFlow, maxFlow / 2, 0].map((value, index) => {
    const y = barTop + (flowHeight * index) / 2;
    return `
      <line class="flow-grid-line" x1="${left}" y1="${y.toFixed(1)}" x2="${width - right}" y2="${y.toFixed(1)}"/>
      <text class="flow-axis-label" x="${left - 9}" y="${(y + 3).toFixed(1)}" text-anchor="end">${fmt(Math.round(value))}</text>`;
  }).join("");

  const bars = points.map((point, index) => {
    const center = left + slot * index + slot / 2;
    const addX = center - barW - 0.35;
    const dropX = center + 0.35;
    const addHeight = (point.added / maxFlow) * flowHeight;
    const dropHeight = (point.dropped / maxFlow) * flowHeight;
    return `
      <rect class="flow-bar-add" x="${addX.toFixed(1)}" y="${(barBottom - addHeight).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(point.added ? 1.5 : 0, addHeight).toFixed(1)}" rx="1.5"/>
      <rect class="flow-bar-drop" x="${dropX.toFixed(1)}" y="${(barBottom - dropHeight).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(point.dropped ? 1.5 : 0, dropHeight).toFixed(1)}" rx="1.5"/>`;
  }).join("");

  const totalSlot = plotW / Math.max(1, points.length - 1);
  const linePoints = points.map((point, index) => [
    left + totalSlot * index,
    lineTop + (1 - point.total / maxTotal) * totalHeight,
  ]);
  const linePath = linePoints.map(([x, y], index) =>
    `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${(left + plotW).toFixed(1)} ${lineBottom} L ${left} ${lineBottom} Z`;

  const labelIndexes = [0, Math.floor((points.length - 1) / 2), points.length - 1];
  const labels = [...new Set(labelIndexes)].map((index) => {
    const x = left + slot * index + slot / 2;
    return `<text class="flow-axis-label flow-date-label" x="${x.toFixed(1)}" y="${axisY}" text-anchor="${index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}">${esc(points[index].date.slice(5).replace("-", "/"))}</text>`;
  }).join("");

  const hits = points.map((point, index) => `
    <rect class="flow-hit" x="${(left + slot * index).toFixed(1)}" y="${barTop}" width="${slot.toFixed(1)}" height="${lineBottom - barTop}"
      data-date="${esc(point.date)}" data-added="${point.added}" data-dropped="${point.dropped}" data-total="${point.total}"/>`).join("");

  return `
    <svg class="flow-chart" viewBox="0 0 ${width} ${height}" role="group" tabindex="0" aria-label="Interactive daily additions, drops, and cumulative enrollment">
      ${flowGrid}
      <line class="flow-baseline" x1="${left}" y1="${barBottom}" x2="${width - right}" y2="${barBottom}"/>
      ${bars}
      <line class="flow-pane-divider" x1="${left}" y1="${dividerY}" x2="${width - right}" y2="${dividerY}"/>
      <text class="flow-axis-label flow-right-label" x="${width - right + 9}" y="${lineTop + 3}" text-anchor="start">${(maxTotal / 1000).toFixed(1)}k</text>
      <path class="enrollment-line-area" d="${areaPath}"/>
      <path class="enrollment-line" d="${linePath}"/>
      <circle class="enrollment-line-dot" cx="${linePoints.at(-1)[0].toFixed(1)}" cy="${linePoints.at(-1)[1].toFixed(1)}" r="3"/>
      ${labels}
      ${hits}
    </svg>`;
}

function bindFlowChart(root) {
  const panel = root.querySelector(".flow-panel");
  const tip = root.querySelector(".flow-tooltip");
  const chart = root.querySelector(".flow-chart");
  if (!panel || !tip || !chart) return;
  const hits = [...root.querySelectorAll(".flow-hit")];
  let pinned = null;
  let keyboardIndex = Math.max(0, hits.length - 1);

  const setActive = (hit) => {
    root.querySelectorAll(".flow-hit.active").forEach((item) => item.classList.remove("active"));
    hit?.classList.add("active");
  };
  const show = (hit) => {
    const panelRect = panel.getBoundingClientRect();
    const hitRect = hit.getBoundingClientRect();
    setActive(hit);
    tip.innerHTML = `
      <b>${esc(hit.dataset.date)}</b>
      <span><em class="up">+${Number(hit.dataset.added).toLocaleString("en-US")}</em> added</span>
      <span><em class="down">-${Number(hit.dataset.dropped).toLocaleString("en-US")}</em> dropped</span>
      <span>${Number(hit.dataset.total).toLocaleString("en-US")} enrolled</span>`;
    tip.hidden = false;
    const x = hitRect.left - panelRect.left + hitRect.width / 2;
    const y = Math.max(4, hitRect.top - panelRect.top - 4);
    tip.style.left = `${Math.max(10, Math.min(panelRect.width - 190, x - 84))}px`;
    tip.style.top = `${y}px`;
  };
  const hide = () => {
    if (pinned) {
      show(pinned);
      return;
    }
    tip.hidden = true;
    setActive(null);
  };
  const nearestHit = (clientX) => hits.reduce((best, hit) => {
    const rect = hit.getBoundingClientRect();
    const distance = Math.abs(rect.left + rect.width / 2 - clientX);
    return !best || distance < best.distance ? { hit, distance } : best;
  }, null)?.hit;

  chart.addEventListener("pointermove", (event) => {
    const hit = nearestHit(event.clientX);
    if (hit) show(hit);
  });
  chart.addEventListener("pointerleave", hide);
  chart.addEventListener("click", (event) => {
    if (event.target.closest(".flow-hit")) return;
    const hit = nearestHit(event.clientX);
    if (!hit) return;
    pinned = pinned === hit ? null : hit;
    if (pinned) show(hit);
    else hide();
  });
  chart.addEventListener("focus", () => hits[keyboardIndex] && show(hits[keyboardIndex]));
  chart.addEventListener("blur", hide);
  chart.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    keyboardIndex = Math.max(0, Math.min(hits.length - 1, keyboardIndex + (event.key === "ArrowRight" ? 1 : -1)));
    show(hits[keyboardIndex]);
  });
  hits.forEach((hit) => {
    hit.addEventListener("click", (event) => {
      event.stopPropagation();
      pinned = pinned === hit ? null : hit;
      if (pinned) show(hit);
      else hide();
    });
    hit.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      pinned = pinned === hit ? null : hit;
      if (pinned) show(hit);
      else hide();
    });
  });
}

function renderDailyHistory(metrics) {
  const box = $("#analysis-daily");
  const h = dailyHistoryForTerm();
  box.hidden = false;
  if (!h) {
    box.innerHTML = `
      <div class="daily-head">
        <div><h3>Daily add / drop log</h3></div>
      </div>
      <div class="daily-stats analysis-total-stats">${dailyMetricsHTML(metrics, null)}</div>`;
    return;
  }
  const summary = h.summary || [];
  if (!summary.length) {
    box.innerHTML = `
      <div class="daily-head">
        <div>
          <h3>Daily add / drop log</h3>
        </div>
      </div>
      <div class="daily-stats analysis-total-stats">${dailyMetricsHTML(metrics, null)}</div>`;
    return;
  }
  const last = summary[summary.length - 1];
  const deptSet = new Set();
  for (const d of summary) for (const k of Object.keys(d.depts || {})) deptSet.add(k);
  const depts = [...deptSet].sort();
  if (state.dailyDept !== "all" && !deptSet.has(state.dailyDept)) state.dailyDept = "all";
  const dept = state.dailyDept;
  const lastValue = dept === "all" ? last : last?.depts?.[dept];
  const cyclePoints = summary.map((day) => {
    const values = dept === "all" ? day : day.depts?.[dept];
    return {
      date: day.date,
      added: values?.added || 0,
      dropped: values?.dropped || 0,
      netChange: values?.netChange || 0,
      total: values?.totalEnrolled || 0,
    };
  });
  const enrolled = lastValue?.totalEnrolled || 0;
  const capacity = lastValue?.totalCapacity || 0;
  const fillPct = capacity ? Math.min(100, Math.round((enrolled / capacity) * 100)) : 0;
  const openSeats = capacity ? Math.max(0, capacity - enrolled) : null;
  const weekNet = summary.slice(-7).reduce((sum, day) => {
    const value = dept === "all" ? day : day.depts?.[dept];
    return sum + (value?.netChange || 0);
  }, 0);
  const topMoves = (h.recent?.at(-1)?.top || [])
    .filter((move) => dept === "all" || String(move.code).startsWith(`${dept} `))
    .sort((a, b) => Math.abs(b.de) - Math.abs(a.de))
    .slice(0, 3);
  const chart = combinedFlowChartSVG(cyclePoints);
  const stat = (label, value, note = "") => `
    <div class="pulse-stat">
      <span>${label}</span>
      <b>${value}</b>
      ${note ? `<small>${note}</small>` : ""}
    </div>`;
  box.innerHTML = `
    <div class="daily-head">
      <div>
        <h3>Enrollment pulse</h3>
      </div>
      <div class="daily-head-side">
        <div class="filter-dd daily-dept-dd">
          <button class="filter-dd-btn" type="button" aria-haspopup="listbox" aria-expanded="false">
            <span class="filter-dd-label">${esc(dept === "all" ? "All departments" : dept)}</span>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <div class="filter-dd-menu" role="listbox" hidden>
            <input class="filter-dd-input" type="text" autocomplete="off" spellcheck="false" placeholder="Type to filter…" aria-label="Filter departments" />
            <div class="filter-dd-options">
              <button class="filter-dd-option" type="button" role="option" data-dvalue="all" class="${dept === "all" ? "active" : ""}" aria-selected="${dept === "all"}">All departments</button>
              ${depts.map((d) => `<button class="filter-dd-option" type="button" role="option" data-dvalue="${esc(d)}" class="${d === dept ? "active" : ""}" aria-selected="${d === dept}">${esc(d)}</button>`).join("")}
            </div>
          </div>
        </div>
        <div class="daily-badge">${h.complete ? `Complete through ${esc(h.dropDeadline)}` : `Latest ${esc(h.latestDate)}`}</div>
      </div>
    </div>
    <div class="enrollment-dashboard">
      <section class="flow-panel">
        <div class="pulse-panel-head">
          <div><b>Adds vs drops</b></div>
          <div class="flow-legend">
            <span><i class="add"></i>Added</span>
            <span><i class="drop"></i>Dropped</span>
            <span><i class="line"></i>Enrolled</span>
          </div>
        </div>
        ${chart}
        <div class="flow-tooltip" hidden></div>
      </section>
      <aside class="capacity-panel">
        <div class="pulse-panel-head"><div><b>Seat utilization</b></div></div>
        <div class="capacity-ring" style="--fill:${fillPct}%">
          <div><b>${fillPct}%</b><span>filled</span></div>
        </div>
        <div class="capacity-copy">
          <span><b>${enrolled.toLocaleString("en-US")}</b> enrolled</span>
          <span><b>${openSeats == null ? "—" : openSeats.toLocaleString("en-US")}</b> open seats</span>
        </div>
        <div class="pulse-movers">
          <span>Largest changes today</span>
          ${topMoves.length
            ? topMoves.map((move) => `<div><b>${esc(move.code)}</b><em class="${move.de >= 0 ? "up" : "down"}">${move.de >= 0 ? "+" : ""}${move.de}</em></div>`).join("")
            : `<small>No section-level movements in the latest snapshot.</small>`}
        </div>
      </aside>
    </div>
    <div class="pulse-stats">
      ${stat("Current enrolled", enrolled.toLocaleString("en-US"))}
      ${stat("7-day net", `${weekNet >= 0 ? "+" : ""}${weekNet.toLocaleString("en-US")}`)}
      ${stat("Today added", `+${(lastValue?.added || 0).toLocaleString("en-US")}`)}
      ${stat("Today dropped", `-${(lastValue?.dropped || 0).toLocaleString("en-US")}`)}
    </div>
  `;
  const dd = box.querySelector(".daily-dept-dd");
  const ddBtn = dd?.querySelector(".filter-dd-btn");
  const ddMenu = dd?.querySelector(".filter-dd-menu");
  const ddInput = dd?.querySelector(".filter-dd-input");
  ddBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const wasOpen = dd.classList.contains("open");
    closeFilterMenus();
    if (!wasOpen) {
      dd.classList.add("open");
      if (ddMenu) {
        ddMenu.hidden = false;
        dd.querySelectorAll(".filter-dd-option").forEach((option) => { option.hidden = false; });
        if (ddInput) ddInput.value = "";
        requestAnimationFrame(() => ddInput?.focus({ preventScroll: true }));
      }
      ddBtn.setAttribute("aria-expanded", "true");
    }
  });
  ddInput?.addEventListener("input", () => {
    const query = ddInput.value.trim().toLowerCase();
    dd.querySelectorAll(".filter-dd-option").forEach((option) => {
      option.hidden = !!query && !option.textContent.toLowerCase().includes(query);
    });
  });
  ddInput?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeFilterMenus();
      ddBtn?.focus();
      return;
    }
    if (e.key !== "Enter") return;
    const first = [...dd.querySelectorAll(".filter-dd-option")].find((option) => !option.hidden);
    if (!first) return;
    e.preventDefault();
    state.dailyDept = first.dataset.dvalue;
    closeFilterMenus();
    renderAnalysis();
  });
  ddMenu?.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      state.dailyDept = b.dataset.dvalue;
      closeFilterMenus();
      renderAnalysis();
    });
  });
  bindFlowChart(box);
  bindSparklines(box);
}

function analysisRowHTML(c, an) {
  const pct = an.hasPostStart ? Math.round(an.rate * 100) : null;
  const sig = an.hasPostStart ? difficultySignal(an.rate, an.ended) : null;
  const badge = !an.hasPostStart
    ? `<span class="drop-badge stable">Registration</span>`
    : an.ended
      ? `<span class="drop-badge stable">Ended</span>`
    : an.rate > 0
      ? `<span class="drop-badge ${sig.tone}">↓ ${pct}%</span>`
      : `<span class="drop-badge stable">↑ ${Math.abs(pct)}%</span>`;
  return `
    <div class="analysis-row" data-code="${esc(c.code)}" data-section="${esc(c.section?.classId || "")}">
      <div class="ar-main">
        <div class="ar-code">${esc(c.code)} · Section ${esc(sectionLabel(c.section))} · ${esc(c.deptCode)}</div>
        <div class="ar-title" title="${esc(c.title)}">${esc(c.title)}</div>
      </div>
      <div class="ar-spark">${sparklineSVG(c.series, 180, 48, c.code + "a")}</div>
      <div class="ar-side">
        ${badge}
      </div>
    </div>`;
}

function renderAnalysis() {
  if (!enrollHistoryCache.has(state.term)) {
    loadEnrollHistory(state.term).then(() => {
      if ($("#view-analysis") && !$("#view-analysis").hidden) renderAnalysis();
    });
  }
  const query = ($("#analysis-search")?.value || "").trim().toLowerCase();
  const all = getSections().filter((c) => {
    if (state.dailyDept !== "all" && c.code.split(/\s+/)[0].toUpperCase() !== state.dailyDept) return false;
    if (!query) return true;
    const section = c.section;
    return [
      c.code, c.title, c.dept, c.deptCode,
      sectionLabel(section), section.instructor || "",
      section.classId || "", section.callNumber || "",
    ].join(" ").toLowerCase().includes(query);
  });
  const items = all.map((c) => ({ c, an: enrollAnalysis(c) })).filter((x) => x.an);
  const post = items.filter((x) => x.an.hasPostStart && !x.an.ended && !x.an.lowSample);
  const high = post.filter((x) => x.an.rate >= 0.25).length;
  const avg = post.length ? post.reduce((a, x) => a + x.an.rate, 0) / post.length : 0;
  const totalEnrolled = all.reduce((a, c) => a + c.enrolledTotal, 0);
  const totalCap = all.reduce((a, c) => a + c.capacityTotal, 0);

  renderDailyHistory({
    sectionCount: all.length,
    totalEnrolled,
    totalCap,
    averageDropOff: post.length ? Math.round(avg * 100) : null,
    highDropCount: high,
  });

  const hasPost = post.length > 0;
  $("#analysis-sort").innerHTML = [["drop", "By drop-off"], ["enroll", "By enrollment"]]
    .map(([k, label]) => `<button class="btn small ${analysisSort === k ? "active" : ""}" data-sort="${k}">${label}</button>`).join("");

  const sorted = [...(hasPost ? post : items)];
  sorted.sort((a, b) => analysisSort === "drop" && hasPost
    ? b.an.rate - a.an.rate
    : b.c.enrolledTotal - a.c.enrolledTotal);
  const visible = sorted.slice(0, 80);
  $("#analysis-list").innerHTML = visible.map(({ c, an }) => analysisRowHTML(c, an)).join("")
    || `<div class="notice info">No data available.</div>`;
}

/* ============================================================
 * 教师档案
 * ============================================================ */
function loadInstructorIndex() {
  if (instructorIndexCache) return Promise.resolve(instructorIndexCache);
  if (instructorIndexPromise) return instructorIndexPromise;
  instructorIndexPromise = fetch("data/instructors.json", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`Instructor index unavailable (${response.status})`);
      return response.json();
    })
    .then((data) => {
      instructorIndexCache = data;
      return data;
    })
    .catch((error) => {
      instructorIndexPromise = null;
      throw error;
    });
  return instructorIndexPromise;
}

function openInstructor(name) {
  const instructor = String(name || "").trim();
  if (!instructor) return;
  const currentView = document.body.dataset.view || "browse";
  if (currentView !== "instructor") {
    state.instructorReturn = {
      view: currentView,
      q: state.searchQuery,
      dept: state.searchDepartment,
      instructor: state.searchInstructor,
    };
  }
  state.instructorName = instructor;
  switchView("instructor");
}

function leaveInstructorProfile() {
  const destination = state.instructorReturn;
  state.instructorReturn = null;
  if (destination?.view === "search") {
    state.searchQuery = destination.q || "";
    state.searchDepartment = destination.dept || "all";
    state.searchInstructor = destination.instructor || "";
    syncSearchFields();
    switchView("search");
    return;
  }
  switchView(destination?.view && destination.view !== "instructor" ? destination.view : "browse");
}

function instructorOfferings(profile) {
  return (profile?.o || []).map((row) => ({
    term: row[0],
    code: row[1],
    title: row[2],
    enrolled: Number(row[3]) || 0,
    capacity: Number(row[4]) || 0,
    dropRate: row[5] == null ? null : Number(row[5]),
    points: Number(row[6]) || 0,
    sections: Number(row[7]) || 1,
    schedule: row[8] || "Time TBA",
    dropBase: Number(row[9]) || 0,
    dropComplete: row[10] === 1,
  })).sort((a, b) => b.term.localeCompare(a.term) || a.code.localeCompare(b.code));
}

function instructorTeachingRows(offerings) {
  const teaching = offerings.filter((row) =>
    row.points > 0 &&
    !/independent|fieldwork|practica|research|recitation/i.test(row.title) &&
    !/GR(?:5999|8001|8101)/i.test(row.code));
  return teaching.length ? teaching : offerings;
}

function instructorMetrics(offerings, profile) {
  const teaching = instructorTeachingRows(offerings);
  const completed = teaching.filter((row) =>
    row.term !== state.term && row.dropRate != null && row.dropBase >= 10);
  const totalEnrolled = teaching.reduce((sum, row) => sum + row.enrolled, 0);
  const totalCapacity = teaching.reduce((sum, row) => sum + row.capacity, 0);
  const avgFill = totalCapacity ? totalEnrolled / totalCapacity : 0;
  const dropBase = completed.reduce((sum, row) => sum + row.dropBase, 0);
  const avgDrop = dropBase
    ? completed.reduce((sum, row) => sum + row.dropRate * row.dropBase, 0) / dropBase
    : null;
  const terms = [...new Set(teaching.map((row) => row.term))];
  const courses = [...new Set(teaching.map((row) => row.code))];
  const departments = [...new Set(profile?.d || [])];
  const avgEnrollment = teaching.length ? totalEnrolled / teaching.length : 0;
  const reviewRating = Array.isArray(profile?.r) ? Number(profile.r[0]) : null;
  const reviewCount = Array.isArray(profile?.r) ? Number(profile.r[1]) : 0;
  const axes = [
    { key: "popularity", label: "Demand", value: Math.max(0, Math.min(100, avgFill * 100)) },
    { key: "stability", label: "Retention", value: avgDrop == null ? 50 : Math.max(0, Math.min(100, (1 - Math.min(.5, avgDrop) / .5) * 100)) },
    { key: "experience", label: "Experience", value: Math.max(0, Math.min(100, terms.length / 10 * 100)) },
    { key: "breadth", label: "Breadth", value: Math.max(0, Math.min(100, courses.length / 8 * 100)) },
    { key: "scale", label: "Class size", value: Math.max(0, Math.min(100, avgEnrollment / 150 * 100)) },
  ];
  if (reviewRating != null) {
    axes.push({ key: "rating", label: "Reviews", value: Math.max(0, Math.min(100, reviewRating / 5 * 100)) });
  }
  const weighted = axes.reduce((sum, axis) => {
    const weight = axis.key === "stability" ? .3
      : axis.key === "popularity" ? .25
        : axis.key === "rating" ? .05
          : axis.key === "experience" || axis.key === "breadth" ? .15
            : .1;
    return sum + axis.value * weight;
  }, 0);
  const weightSum = axes.reduce((sum, axis) => {
    return sum + (axis.key === "stability" ? .3
      : axis.key === "popularity" ? .25
        : axis.key === "rating" ? .05
          : axis.key === "experience" || axis.key === "breadth" ? .15
            : .1);
  }, 0);
  return {
    teaching,
    completed,
    totalEnrolled,
    totalCapacity,
    avgFill,
    avgDrop,
    avgEnrollment,
    terms,
    courses,
    departments,
    reviewRating,
    reviewCount,
    axes,
    score: Math.round(weighted / weightSum),
  };
}

function instructorScoreTone(score) {
  if (score >= 82) return "excellent";
  if (score >= 68) return "strong";
  if (score >= 52) return "steady";
  return "developing";
}

function radarChartSVG(axes, size = 338) {
  if (!axes.length) return "";
  const center = size / 2;
  const radius = size * .31;
  const labelRadius = radius + 34;
  const angleFor = (index) => -Math.PI / 2 + (Math.PI * 2 * index) / axes.length;
  const pointFor = (index, ratio) => [
    center + Math.cos(angleFor(index)) * radius * ratio,
    center + Math.sin(angleFor(index)) * radius * ratio,
  ];
  const polygon = (ratio) => axes.map((_, index) => pointFor(index, ratio).map((n) => n.toFixed(1)).join(",")).join(" ");
  const levels = [.25, .5, .75, 1].map((ratio) =>
    `<polygon class="prof-radar-grid" points="${polygon(ratio)}"/>`).join("");
  const spokes = axes.map((_, index) => {
    const [x, y] = pointFor(index, 1);
    return `<line class="prof-radar-spoke" x1="${center}" y1="${center}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
  }).join("");
  const dataPoints = axes.map((axis, index) =>
    pointFor(index, Math.max(.06, Math.min(1, axis.value / 100)))) ;
  const dataPolygon = dataPoints.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const labels = axes.map((axis, index) => {
    const [x, y] = pointFor(index, 1);
    const dx = Math.cos(angleFor(index)) * (labelRadius - radius);
    const dy = Math.sin(angleFor(index)) * (labelRadius - radius);
    const anchor = Math.abs(dx) < 5 ? "middle" : dx > 0 ? "start" : "end";
    return `<text class="prof-radar-label" x="${(x + dx).toFixed(1)}" y="${(y + dy + 4).toFixed(1)}" text-anchor="${anchor}">${esc(axis.label)} <tspan>${Math.round(axis.value)}</tspan></text>`;
  }).join("");
  return `
    <svg class="prof-radar-chart" viewBox="0 0 ${size} ${size}" role="img" aria-label="Instructor profile radar chart">
      ${levels}${spokes}
      <polygon class="prof-radar-area" points="${dataPolygon}"/>
      ${dataPoints.map(([x, y]) => `<circle class="prof-radar-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5"/>`).join("")}
      ${labels}
    </svg>`;
}

function termChartSVG(offerings) {
  const grouped = new Map();
  for (const row of offerings) {
    const current = grouped.get(row.term) || { term: row.term, enrolled: 0, capacity: 0, dropBase: 0, dropWeighted: 0 };
    current.enrolled += row.enrolled;
    current.capacity += row.capacity;
    if (row.dropRate != null && row.dropBase) {
      current.dropBase += row.dropBase;
      current.dropWeighted += row.dropRate * row.dropBase;
    }
    grouped.set(row.term, current);
  }
  const rows = [...grouped.values()]
    .map((row) => ({ ...row, fill: row.capacity ? row.enrolled / row.capacity : null, drop: row.dropBase ? row.dropWeighted / row.dropBase : null }))
    .sort((a, b) => a.term.localeCompare(b.term));
  if (!rows.length) return "";
  const width = 900;
  const height = 300;
  const left = 54;
  const right = 48;
  const top = 28;
  const bottom = 42;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const maxEnrolled = Math.max(...rows.map((row) => row.enrolled), 1);
  const slot = plotW / rows.length;
  const barW = Math.max(12, Math.min(34, slot * .48));
  const grid = [0, .5, 1].map((ratio) => {
    const y = top + plotH * ratio;
    return `<line class="prof-chart-grid" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}"/>`;
  }).join("");
  const bars = rows.map((row, index) => {
    const x = left + slot * index + slot / 2 - barW / 2;
    const h = row.enrolled / maxEnrolled * plotH;
    return `<rect class="prof-chart-bar" x="${x.toFixed(1)}" y="${(top + plotH - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="2"><title>${esc(row.term)} · ${row.enrolled} enrolled</title></rect>`;
  }).join("");
  const dropPoints = rows.map((row, index) => {
    if (row.drop == null) return null;
    return [left + slot * index + slot / 2, top + Math.min(.5, row.drop) / .5 * plotH];
  });
  const dropPaths = [];
  let currentPath = [];
  dropPoints.forEach((point) => {
    if (!point) {
      if (currentPath.length > 1) dropPaths.push(currentPath.join(" "));
      currentPath = [];
      return;
    }
    const [x, y] = point;
    currentPath.push(`${currentPath.length ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`);
  });
  if (currentPath.length > 1) dropPaths.push(currentPath.join(" "));
  const labels = rows.map((row, index) => {
    if (rows.length > 8 && index % 2 && index !== rows.length - 1) return "";
    const x = left + slot * index + slot / 2;
    return `<text class="prof-chart-label" x="${x.toFixed(1)}" y="${height - 14}" text-anchor="middle">${esc(row.term.replace("-", " ").replace("20", "'"))}</text>`;
  }).join("");
  return `
    <svg class="prof-term-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Enrollment and drop-rate history by term">
      ${grid}
      ${bars}
      ${dropPaths.map((path) => `<path class="prof-drop-line" d="${path}"/>`).join("")}
      ${rows.map((row, index) => {
        const point = dropPoints[index];
        return point
          ? `<circle class="prof-drop-dot" cx="${point[0].toFixed(1)}" cy="${point[1].toFixed(1)}" r="3"><title>${esc(row.term)} · ${(row.drop * 100).toFixed(1)}% drop</title></circle>`
          : "";
      }).join("")}
      ${labels}
      <text class="prof-chart-axis-label" x="${left}" y="16">Enrollment</text>
      <text class="prof-chart-axis-label prof-chart-axis-right" x="${width - right}" y="16" text-anchor="end">Drop line · 0–50%</text>
    </svg>`;
}

function instructorCourseBarsHTML(offerings) {
  const byCourse = new Map();
  for (const row of offerings) {
    const current = byCourse.get(row.code) || {
      code: row.code,
      title: row.title,
      total: 0,
      terms: new Set(),
      dropBase: 0,
      dropWeighted: 0,
    };
    current.total += row.enrolled;
    current.terms.add(row.term);
    if (row.dropRate != null && row.dropBase) {
      current.dropBase += row.dropBase;
      current.dropWeighted += row.dropRate * row.dropBase;
    }
    byCourse.set(row.code, current);
  }
  const rows = [...byCourse.values()]
    .map((row) => ({ ...row, drop: row.dropBase ? row.dropWeighted / row.dropBase : null }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
  const max = Math.max(...rows.map((row) => row.total), 1);
  return rows.map((row) => `
    <div class="prof-course-bar-row">
      <div class="prof-course-bar-label"><b>${esc(row.code)}</b><span>${esc(row.title)}</span></div>
      <div class="prof-course-bar-track"><i style="width:${Math.max(2, row.total / max * 100)}%"></i></div>
      <div class="prof-course-bar-stat"><b>${row.total.toLocaleString("en-US")}</b><span>${row.terms.size} term${row.terms.size === 1 ? "" : "s"}${row.drop == null ? "" : ` · ${(row.drop * 100).toFixed(1)}% drop`}</span></div>
    </div>`).join("");
}

function instructorHistoryHTML(offerings) {
  const byTerm = new Map();
  for (const row of offerings) {
    if (!byTerm.has(row.term)) byTerm.set(row.term, []);
    byTerm.get(row.term).push(row);
  }
  return [...byTerm.entries()].map(([term, rows]) => `
    <section class="prof-term-group">
      <div class="prof-term-head"><b>${esc(termShort(term))}</b><span>${rows.length} offering${rows.length === 1 ? "" : "s"}</span></div>
      <div class="prof-offering-list">
        ${rows.map((row) => `
          <article class="prof-offering${term === state.term ? " current" : ""}" data-course="${esc(row.code)}" data-term="${esc(term)}">
            <div class="prof-offering-code">${esc(row.code)}</div>
            <div class="prof-offering-main">
              <b>${esc(row.title)}</b>
              <span>${esc(row.schedule)}</span>
            </div>
            <div class="prof-offering-metric"><b>${row.enrolled}${row.capacity ? ` / ${row.capacity}` : ""}</b><span>${row.capacity ? `${Math.round(row.enrolled / row.capacity * 100)}% filled` : "capacity n/a"}</span></div>
            <div class="prof-offering-metric ${row.dropRate != null && row.dropRate >= .2 ? "warn" : ""}"><b>${row.dropRate == null ? "—" : `${(row.dropRate * 100).toFixed(1)}%`}</b><span>${row.dropRate == null ? "pre-term" : "post-start drop"}</span></div>
          </article>`).join("")}
      </div>
    </section>`).join("");
}

function renderInstructorProfile() {
  const host = $("#instructor-page");
  if (!host) return;
  const requested = state.instructorName;
  host.innerHTML = `<div class="instructor-loading"><span></span><b>Building instructor dossier</b><small>Loading all available course history…</small></div>`;
  loadInstructorIndex().then((index) => {
    if (!state.instructorName || $("#view-instructor").hidden) return;
    const profiles = index.instructors || {};
    let canonical = Object.prototype.hasOwnProperty.call(profiles, state.instructorName) ? state.instructorName : null;
    if (!canonical) {
      const needle = normalizeSearchText(state.instructorName);
      canonical = Object.keys(profiles).find((name) => normalizeSearchText(name) === needle) || null;
    }
    if (!canonical) {
      host.innerHTML = `<div class="notice info"><b>Instructor not found.</b><span>No teaching history is available for “${esc(state.instructorName)}”.</span><button class="btn small ghost" data-prof-back>Back</button></div>`;
      host.querySelector("[data-prof-back]")?.addEventListener("click", leaveInstructorProfile);
      return;
    }
    state.instructorName = canonical;
    const profile = profiles[canonical];
    const offerings = instructorOfferings(profile);
    const metrics = instructorMetrics(offerings, profile);
    const scoreTone = instructorScoreTone(metrics.score);
    const latest = offerings[0];
    const initials = canonical.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    const reviewTag = metrics.reviewRating == null
      ? ""
      : `<span>${metrics.reviewRating.toFixed(1)} / 5 · ${metrics.reviewCount} reviews</span>`;
    host.innerHTML = `
      <header class="prof-hero">
        <div class="prof-monogram" aria-hidden="true">${esc(initials || "?")}</div>
        <div class="prof-identity">
          <span class="prof-kicker">Instructor dossier · ${esc(metrics.departments.join(" / ") || "Columbia University")}</span>
          <h1>${esc(canonical)}</h1>
          <p>${metrics.courses.length} courses across ${metrics.terms.length} terms${latest ? ` · Latest ${esc(termShort(latest.term))}` : ""}</p>
          <div class="prof-identity-tags">
            <span>${metrics.totalEnrolled.toLocaleString("en-US")} course enrollments</span>
            <span>${metrics.avgDrop == null ? "Drop history pending" : `${(metrics.avgDrop * 100).toFixed(1)}% weighted drop`}</span>
            ${reviewTag}
          </div>
        </div>
        <div class="prof-score ${scoreTone}" style="--score:${metrics.score}">
          <b>${metrics.score}</b>
          <small>of 100</small>
        </div>
      </header>
      <div class="prof-dashboard">
        <section class="prof-panel prof-radar-panel">
          <div class="prof-panel-head"><div><h2>Teaching radar</h2></div></div>
          ${radarChartSVG(metrics.axes)}
        </section>
        <section class="prof-panel prof-trend-panel">
          <div class="prof-panel-head"><div><h2>Enrollment &amp; drop history</h2></div></div>
          ${termChartSVG(metrics.teaching)}
          <div class="prof-chart-key"><span><i class="bar"></i>Course enrollments</span><span><i class="line"></i>Weighted drop rate</span></div>
        </section>
        <section class="prof-panel prof-course-panel">
          <div class="prof-panel-head"><div><h2>Most-taught courses</h2></div></div>
          <div class="prof-course-bars">${instructorCourseBarsHTML(metrics.teaching)}</div>
        </section>
      </div>
      <section class="prof-history">
        <div class="prof-panel-head"><div><h2>Every available course</h2></div></div>
        ${instructorHistoryHTML(offerings)}
      </section>`;
    host.querySelectorAll(".prof-offering[data-course]").forEach((row) => {
      row.addEventListener("click", () => {
        if (row.dataset.term === state.term) openCourse(row.dataset.course);
      });
    });
  }).catch((error) => {
    host.innerHTML = `<div class="notice error"><b>Instructor history unavailable.</b><span>${esc(error.message)}</span><button class="btn small ghost" data-prof-back>Back</button></div>`;
    host.querySelector("[data-prof-back]")?.addEventListener("click", leaveInstructorProfile);
  });
}

/* ============================================================
 * 规划 / 建模
 * ============================================================ */
const TEMPLATES = {
  "IEOR (sample)": {
    totalCredits: 124,
    required: ["IEOR E3658", "IEOR E3608", "IEOR E4004", "IEOR E4106", "IEOR E4100", "IEOR E4212"],
  },
  "Business (sample)": {
    totalCredits: 124,
    required: ["ACCT B5001", "FINC B5300", "DROM B5100", "BUEC B5200", "BUSI UN3021"],
  },
  "IEOR + Business (sample)": {
    totalCredits: 124,
    required: ["IEOR E3658", "IEOR E4004", "FINC B5300", "DROM B5100", "ACCT B5001"],
  },
  "QMSS / GSAS (sample)": {
    totalCredits: 124,
    required: ["QMSS GR5010", "QMSS GR5015", "STAT GR5203", "STAT GR5204", "STAT GR5205"],
  },
};

function renderPlanner() {
  renderPlanTemplateMenu();
  const buckets = $("#plan-buckets");
  buckets.innerHTML = state.planBuckets.map((b, i) => `
    <div class="bucket">
      <h4>Semester ${i + 1}${i === state.planTarget ? " · target" : ""}</h4>
      <div class="b-sum">${b.length} courses · ${bucketCredits(b)} credits</div>
      ${b.map((code) => `<div class="bucket-item"><b>${esc(code)}</b><button data-rm="${i}" data-code="${esc(code)}">×</button></div>`).join("")}
      <button class="btn small ghost" data-set="${i}">Set as target</button>
    </div>`).join("");
  buckets.querySelectorAll("[data-set]").forEach((b) =>
    b.addEventListener("click", () => { state.planTarget = Number(b.dataset.set); renderPlanner(); }));
  buckets.querySelectorAll("[data-rm]").forEach((b) =>
    b.addEventListener("click", () => {
      const i = Number(b.dataset.rm);
      state.planBuckets[i] = state.planBuckets[i].filter((x) => x !== b.dataset.code);
      renderPlanner();
    }));
  renderProgress();
}

function renderPlanTemplateMenu() {
  const keys = Object.keys(TEMPLATES);
  if (!TEMPLATES[state.planTemplate]) state.planTemplate = keys[0];
  const label = $("#plan-template-label");
  if (label) label.textContent = state.planTemplate;
  const menu = $("#plan-template-menu");
  if (menu) {
    menu.innerHTML = keys.map((k) =>
      `<button type="button" role="option" data-plan-template="${esc(k)}" class="${state.planTemplate === k ? "active" : ""}" aria-selected="${state.planTemplate === k}">${esc(k)}</button>`).join("");
  }
}

function setPlanTemplateMenuOpen(open) {
  const menu = $("#plan-template-menu");
  const btn = $("#plan-template-btn");
  if (!menu || !btn) return;
  clearTimeout(window._planTplTimer);
  if (open) {
    menu.hidden = false;
    requestAnimationFrame(() => menu.classList.add("open"));
    btn.setAttribute("aria-expanded", "true");
  } else {
    menu.classList.remove("open");
    btn.setAttribute("aria-expanded", "false");
    window._planTplTimer = setTimeout(() => {
      if (!menu.classList.contains("open")) menu.hidden = true;
    }, 160);
  }
}

function bucketCredits(bucket) {
  const byCode = getGrouped();
  let sum = 0;
  for (const code of bucket) {
    const c = byCode.find((x) => x.code === code);
    sum += c ? (c.minPoints || 0) : 0;
  }
  return sum;
}

function openPlanReceiptPreview() {
  const byCode = new Map(getGrouped().map((course) => [normCode(course.code), course]));
  const semesters = state.planBuckets.map((bucket, index) => {
    const items = bucket.map((code) => {
      const course = byCode.get(normCode(code));
      return {
        code: normCode(code),
        title: course?.title || "Course not in current data",
        credits: Number(course?.minPoints) || 0,
      };
    });
    return {
      number: index + 1,
      items,
      credits: items.reduce((sum, item) => sum + item.credits, 0),
    };
  }).filter((semester) => semester.items.length);

  if (!semesters.length) {
    toast("Add courses to your plan first.");
    return;
  }

  const totalCourses = semesters.reduce((sum, semester) => sum + semester.items.length, 0);
  const totalCredits = semesters.reduce((sum, semester) => sum + semester.credits, 0);
  const issuedAt = new Date();
  const issuedLabel = issuedAt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const dateKey = [
    issuedAt.getFullYear(),
    String(issuedAt.getMonth() + 1).padStart(2, "0"),
    String(issuedAt.getDate()).padStart(2, "0"),
  ].join("");
  const receiptId = `AV-${dateKey}-${String(totalCourses).padStart(2, "0")}`;
  const semesterMarkup = semesters.map((semester) => `
    <section class="receipt-section">
      <div class="receipt-section-head">
        <b>SEMESTER ${semester.number}</b>
        <span>${semester.items.length} ${semester.items.length === 1 ? "COURSE" : "COURSES"}</span>
      </div>
      ${semester.items.map((item) => `
        <div class="receipt-line">
          <div>
            <b>${esc(item.code)}</b>
            <span>${esc(item.title)}</span>
          </div>
          <em>${item.credits ? `${esc(item.credits)} CR` : "— CR"}</em>
        </div>`).join("")}
      <div class="receipt-subtotal"><span>SEMESTER CREDITS</span><b>${esc(semester.credits)}</b></div>
    </section>`).join("");

  $("#modal-body").innerHTML = `
    <div class="receipt-preview">
      <div class="receipt-machine">
        <div class="receipt-slot" aria-hidden="true"><span></span></div>
        <div class="receipt-output">
          <article class="receipt-sheet" id="plan-receipt-sheet" aria-label="Course plan receipt">
            <div class="receipt-brand">ANTIVERGIL</div>
            <h2 class="receipt-title">COURSE PLAN RECEIPT</h2>
            <p class="receipt-tagline">Columbia University planning tool</p>
            <div class="receipt-rule"></div>
            <div class="receipt-meta">
              <div><span>RECEIPT</span><b>${esc(receiptId)}</b></div>
              <div><span>ISSUED</span><b>${esc(issuedLabel)}</b></div>
              <div><span>TEMPLATE</span><b>${esc(state.planTemplate)}</b></div>
              <div><span>TERM CONTEXT</span><b>${esc(termShort(state.term))}</b></div>
            </div>
            <div class="receipt-rule dashed"></div>
            <div class="receipt-items">${semesterMarkup}</div>
            <div class="receipt-rule dashed"></div>
            <div class="receipt-totals">
              <div><span>TOTAL COURSES</span><b>${totalCourses}</b></div>
              <div><span>TOTAL CREDITS</span><b>${totalCredits}</b></div>
              <div><span>SEMESTERS USED</span><b>${semesters.length}</b></div>
            </div>
            <div class="receipt-thanks">THANK YOU FOR PLANNING AHEAD.</div>
            <div class="receipt-barcode" aria-hidden="true"></div>
            <div class="receipt-code">${esc(receiptId)}</div>
            <p class="receipt-fineprint">Planning receipt only. Not an official Columbia registration, bill, or transcript.</p>
          </article>
        </div>
      </div>
      <div class="receipt-preview-actions">
        <button class="btn small ghost" id="receipt-close" type="button">Close</button>
        <button class="btn small primary" id="receipt-print" type="button">Print receipt</button>
      </div>
    </div>`;
  $("#modal").hidden = false;
  document.body.style.overflow = "hidden";
  $("#receipt-close")?.addEventListener("click", closeModal);
  $("#receipt-print")?.addEventListener("click", () => window.print());
}

function renderProgress() {
  const tpl = TEMPLATES[state.planTemplate] || Object.values(TEMPLATES)[0];
  const planned = state.planBuckets.flat().map(normCode);
  const doneSet = new Set([...state.taken.map(normCode), ...planned]);
  const credits = state.planBuckets.reduce((acc, b) => acc + bucketCredits(b), 0);
  const requiredDone = tpl.required.filter((r) => doneSet.has(normCode(r)));
  const pct = Math.min(100, Math.round((credits / tpl.totalCredits) * 100));
  $("#plan-progress").innerHTML = `
    <div class="progress-row">
      <div class="pr-top"><span>Total credits (planned ${credits} / ${tpl.totalCredits})</span><b>${pct}%</b></div>
      <div class="bar"><span style="width:${pct}%"></span></div>
    </div>
    <div class="progress-row">
      <div class="pr-top"><span>Required courses (${requiredDone.length} / ${tpl.required.length})</span><b>${tpl.required.length ? Math.round(requiredDone.length / tpl.required.length * 100) : 0}%</b></div>
      <div class="bar"><span style="width:${tpl.required.length ? requiredDone.length / tpl.required.length * 100 : 0}%"></span></div>
    </div>
    <div style="font-size:12px;color:var(--muted);margin-top:10px">⚠️ Sample template, not official degree requirements. Credits are estimated from this dataset.</div>
  `;
}

function addToPlan(code) {
  code = normCode(code);
  if (!code) return;
  if (!state.planBuckets[state.planTarget].includes(code)) {
    state.planBuckets[state.planTarget].push(code);
    toast(`Added to Semester ${state.planTarget + 1}`);
  } else {
    toast("This course is already in that semester.");
  }
}

/* 先修课依赖图 */
function resolveCourse(code) {
  const k = normCode(code);
  const exact = state.courses.find((c) => normCode(c.code) === k);
  if (exact) return exact;
  const compact = k.replace(/\s+/g, "");
  const compactHit = state.courses.find((c) => normCode(c.code).replace(/\s+/g, "") === compact);
  if (compactHit) return compactHit;
  const m = compact.match(/^([A-Z]{2,4})(\d{3,4})$/);
  if (m) {
    const letters = m[1], num = m[2];
    return state.courses.find((c) => {
      const cn = normCode(c.code);
      return cn.replace(/\s+/g, "").endsWith(num) && cn.split(/\s+/)[0].includes(letters);
    }) || null;
  }
  return null;
}

let prereqIndexCache = null;
const graphMemory = new Map();

function getPrereqIndex() {
  if (prereqIndexCache && prereqIndexCache.src === state.courses) return prereqIndexCache;
  const prereqs = new Map();
  const dependents = new Map();
  for (const c of state.courses) {
    const code = normCode(c.code);
    const list = new Set();
    for (const group of c.prereqs || []) {
      for (const p of (Array.isArray(group) ? group : [group])) {
        const raw = normCode(typeof p === "string" ? p : (p && (p.code || p.course)) || "");
        if (!raw) continue;
        const rec = resolveCourse(raw);
        list.add(rec ? normCode(rec.code) : raw);
      }
    }
    if (!list.size) continue;
    prereqs.set(code, list);
    for (const pc of list) {
      if (!dependents.has(pc)) dependents.set(pc, new Set());
      dependents.get(pc).add(code);
    }
  }
  prereqIndexCache = { src: state.courses, prereqs, dependents };
  return prereqIndexCache;
}

function graphKey(rootCode) {
  return [state.term, normCode(rootCode), [...state.taken].sort().join(","), state.planBuckets.flat().sort().join(",")].join("|");
}

function buildGraph(rootCode, maxUp = 4, maxDown = 2) {
  const key = graphKey(rootCode);
  if (graphMemory.has(key)) return graphMemory.get(key);
  const root = normCode(rootCode);
  const idx = getPrereqIndex();
  const nodes = new Map();
  const rootRec = resolveCourse(root);
  nodes.set(root, { code: root, level: 0, found: !!rootRec, title: rootRec ? rootRec.title : null });

  let frontier = [root];
  const seenUp = new Set([root]);
  for (let d = 1; d <= maxUp; d++) {
    const next = [];
    for (const code of frontier) {
      for (const p of idx.prereqs.get(code) || []) {
        if (seenUp.has(p)) continue;
        seenUp.add(p);
        const r = resolveCourse(p);
        nodes.set(p, { code: p, level: -d, found: !!r, title: r ? r.title : null });
        next.push(p);
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  frontier = [root];
  const seenDown = new Set([root]);
  for (let d = 1; d <= maxDown; d++) {
    const next = [];
    for (const code of frontier) {
      for (const dep of idx.dependents.get(code) || []) {
        if (seenDown.has(dep)) continue;
        seenDown.add(dep);
        const r = resolveCourse(dep);
        nodes.set(dep, { code: dep, level: d, found: !!r, title: r ? r.title : null });
        next.push(dep);
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  if (graphMemory.size > 20) graphMemory.delete(graphMemory.keys().next().value);
  graphMemory.set(key, nodes);
  return nodes;
}

function drawGraph(rootCode) {
  const nodes = buildGraph(rootCode);
  const holder = $("#graph-holder");
  if (!nodes.size) { holder.innerHTML = `<div class="notice info">Course not found in the dataset.</div>`; return; }

  const levels = new Map();
  for (const n of nodes.values()) {
    if (!levels.has(n.level)) levels.set(n.level, []);
    levels.get(n.level).push(n);
  }
  const levelKeys = [...levels.keys()].sort((a, b) => a - b);
  const minLevel = Math.min(...levelKeys);
  const maxLevel = Math.max(...levelKeys);
  const maxItems = Math.max(1, ...levelKeys.map((l) => levels.get(l).length));
  const xGap = 214, yGap = 84, pad = 30, nodeW = 152, nodeH = 40;
  const positions = new Map();
  for (const lv of levelKeys) {
    const items = levels.get(lv);
    const offset = ((maxItems - items.length) * yGap) / 2;
    items.forEach((n, i) => {
      positions.set(n.code, { x: pad + (lv - minLevel) * xGap, y: pad + offset + i * yGap });
    });
  }

  const idx = getPrereqIndex();
  const takenSet = new Set(state.taken.map(normCode));
  const plannedSet = new Set(state.planBuckets.flat().map(normCode));
  const rootKey = normCode(rootCode);

  let edges = "";
  for (const n of nodes.values()) {
    const from = positions.get(n.code);
    if (!from) continue;
    for (const p of idx.prereqs.get(n.code) || []) {
      const to = positions.get(p);
      if (!to) continue;
      edges += `<path d="M ${to.x + nodeW} ${to.y} C ${to.x + nodeW + 36} ${to.y}, ${from.x - 36} ${from.y}, ${from.x} ${from.y}" fill="none" stroke="#9db4d6" stroke-width="1.5" marker-end="url(#arrow)"/>`;
    }
  }

  let circles = "";
  for (const n of nodes.values()) {
    const p = positions.get(n.code);
    let fill = "#c9d4e5";
    let sub = "#eef2f8";
    if (n.code === rootKey) fill = "#012169";
    else if (takenSet.has(n.code)) fill = "#1a7f37";
    else if (plannedSet.has(n.code)) fill = "#0a84ff";
    else if (n.found) fill = "#1d4f91";
    if (!n.found) sub = "#7c8798";
    const label = n.title ? (n.title.length > 18 ? n.title.slice(0, 18) + "…" : n.title) : n.code;
    circles += `
      <g transform="translate(${p.x},${p.y})">
        <rect x="0" y="-20" width="${nodeW}" height="${nodeH}" rx="10" fill="${fill}"></rect>
        <text x="12" y="-2" fill="#fff" font-size="11" font-weight="700">${esc(n.code)}</text>
        <text x="12" y="12" fill="${sub}" font-size="10">${esc(label)}</text>
      </g>`;
  }

  const width = pad * 2 + (maxLevel - minLevel) * xGap + nodeW;
  const height = pad * 2 + Math.max(1, maxItems - 1) * yGap + nodeH;
  holder.innerHTML = `
    <div class="graph-scroll">
      <svg width="${width}" height="${Math.max(height, 140)}" viewBox="0 0 ${width} ${Math.max(height, 140)}">
        <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9db4d6"/></marker></defs>
        ${edges}${circles}
      </svg>
    </div>
    <div class="graph-axis">← Prerequisites (上级)　·　Course　·　Dependents (下级) →</div>
    <div class="graph-legend">
      <span><i style="background:#012169"></i>This course</span>
      <span><i style="background:#1a7f37"></i>Taken</span>
      <span><i style="background:#0a84ff"></i>Planned</span>
      <span><i style="background:#1d4f91"></i>Prerequisite</span>
      <span><i style="background:#c9d4e5"></i>Not in catalog</span>
    </div>`;
}

/* ============================================================
 * 日历
 * ============================================================ */
const CALENDAR_EVENTS_KEY = "cu-calendar-events-v1";
const CALENDAR_VISIBILITY_KEY = "cu-calendar-hidden-sources-v1";
const CALENDAR_START_HOUR = 8;
const CALENDAR_END_HOUR = 21;
const CALENDAR_START_MINUTES = CALENDAR_START_HOUR * 60;
const CALENDAR_END_MINUTES = CALENDAR_END_HOUR * 60;
const CALENDAR_VISIBLE_HOURS = CALENDAR_END_HOUR - CALENDAR_START_HOUR;
const CALENDAR_SOURCES = [
  { id: "courses", label: "Courses", color: "#1a73e8", group: "my" },
  { id: "study", label: "Study sessions", color: "#0f9d58", group: "my" },
  { id: "tasks", label: "Tasks", color: "#7b61ff", group: "my" },
  { id: "personal", label: "Personal", color: "#e8710a", group: "my" },
  { id: "holidays", label: "US holidays", color: "#138a72", group: "other" },
  { id: "academic", label: "Academic calendar", color: "#64748b", group: "other" },
  { id: "google", label: "Google Calendar", color: "#2d7775", group: "other" },
];
const CALENDAR_SOURCE_MAP = new Map(CALENDAR_SOURCES.map((source) => [source.id, source]));
const CALENDAR_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const CALENDAR_WEEKDAYS_MINI = ["S", "M", "T", "W", "T", "F", "S"];
const CALENDAR_COURSE_COLORS = [
  "#2f6690",
  "#3f7d62",
  "#b3742b",
  "#8c5b88",
  "#3f7f86",
  "#b24e4e",
  "#657b3f",
  "#5b67a6",
];
const CALENDAR_ACADEMIC_DATES = [
  { date: "2026-11-25", title: "Thanksgiving break begins" },
  { date: "2026-12-14", title: "Last day of fall classes" },
  { date: "2026-12-15", title: "Reading period begins" },
  { date: "2026-12-18", title: "Fall final examinations begin" },
  { date: "2027-01-19", title: "Spring classes begin" },
];

function calendarUid(prefix = "event") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function calendarDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function calendarFromKey(key) {
  const [year, month, day] = String(key).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function calendarAddDays(date, amount) {
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return d;
}

function calendarStartOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function calendarSameDay(a, b) {
  return calendarDateKey(a) === calendarDateKey(b);
}

function calendarMonthLabel(date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function calendarNthWeekday(year, month, weekday, nth) {
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (nth - 1) * 7);
}

function calendarHolidayEventsForYear(year) {
  const thanksgiving = calendarNthWeekday(year, 10, 4, 4);
  const events = [
    { date: calendarDateKey(thanksgiving), title: "Thanksgiving Day" },
    { date: calendarDateKey(calendarAddDays(thanksgiving, 1)), title: "Day after Thanksgiving" },
    { date: `${year}-12-25`, title: "Christmas Day" },
    { date: `${year}-07-04`, title: "Independence Day" },
    { date: `${year}-01-01`, title: "New Year's Day" },
  ];
  return events.map((event) => ({
    ...event,
    id: `holiday-${event.date}-${event.title.replace(/\s+/g, "-").toLowerCase()}`,
    kind: "holiday",
    source: "holidays",
    start: null,
    end: null,
    allDay: true,
    location: "",
    notes: "University holiday calendar",
  }));
}

function calendarAcademicEventsForYear(year) {
  return CALENDAR_ACADEMIC_DATES
    .filter((event) => event.date.startsWith(`${year}-`))
    .map((event) => ({
      ...event,
      id: `academic-${event.date}-${event.title.replace(/\s+/g, "-").toLowerCase()}`,
      kind: "academic",
      source: "academic",
      start: null,
      end: null,
      allDay: true,
      location: "",
      notes: "Columbia academic calendar",
    }));
}

function defaultCalendarEvents() {
  const week = calendarStartOfWeek(new Date());
  const at = (offset, start, end, source, title, location = "") => ({
    id: calendarUid(source),
    title,
    source,
    date: calendarDateKey(calendarAddDays(week, offset)),
    start,
    end,
    allDay: false,
    location,
    notes: "",
  });
  return [
    at(1, 9 * 60, 10 * 60 + 30, "study", "Deep work · Butler 4", "Butler Library"),
    at(2, 14 * 60, 15 * 60, "tasks", "Problem set review", "IEOR study room"),
    at(3, 18 * 60 + 30, 20 * 60, "personal", "Dinner with study group", "Morningside Heights"),
  ];
}

function loadCalendarEvents() {
  try {
    const raw = localStorage.getItem(CALENDAR_EVENTS_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  const seeded = defaultCalendarEvents();
  saveCalendarEvents(seeded);
  return seeded;
}

function saveCalendarEvents(events = state.calendarEvents) {
  try { localStorage.setItem(CALENDAR_EVENTS_KEY, JSON.stringify(events || [])); } catch {}
}

function loadCalendarVisibility() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CALENDAR_VISIBILITY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCalendarVisibility() {
  try { localStorage.setItem(CALENDAR_VISIBILITY_KEY, JSON.stringify(state.calendarHiddenSources || [])); } catch {}
}

function initializeCalendarState() {
  if (!state.calendarSelected) state.calendarSelected = defaultCalendarDateForTerm(state.term);
  state.calendarSelected.setHours(0, 0, 0, 0);
  if (!state.calendarMiniMonth) state.calendarMiniMonth = new Date(state.calendarSelected.getFullYear(), state.calendarSelected.getMonth(), 1);
  if (!Array.isArray(state.calendarEvents)) state.calendarEvents = loadCalendarEvents();
  if (!Array.isArray(state.calendarHiddenSources)) state.calendarHiddenSources = loadCalendarVisibility();
}

function calendarSourceVisible(sourceId) {
  return !(state.calendarHiddenSources || []).includes(sourceId);
}

function calendarSourceFor(sourceId) {
  return CALENDAR_SOURCE_MAP.get(sourceId) || CALENDAR_SOURCES[0];
}

function calendarEventColor(event) {
  if (event.kind !== "course") return calendarSourceFor(event.source).color;
  const code = normCode(event.courseCode || event.title);
  let hash = 0;
  for (let index = 0; index < code.length; index += 1) {
    hash = ((hash * 31) + code.charCodeAt(index)) >>> 0;
  }
  return CALENDAR_COURSE_COLORS[hash % CALENDAR_COURSE_COLORS.length];
}

function calendarAllEventsInRange(start, end) {
  initializeCalendarState();
  const events = [];
  const last = calendarAddDays(end, -1);
  for (let cursor = new Date(start); cursor <= last; cursor = calendarAddDays(cursor, 1)) {
    const key = calendarDateKey(cursor);
    const dayNumber = cursor.getDay() === 0 ? 7 : cursor.getDay();
    if (calendarSourceVisible("courses")) {
      const courseStartKey = calendarTermStartKey(state.term);
      if (!courseStartKey || key >= courseStartKey) {
        for (const section of state.schedule) {
          if (section.start == null || !(section.days || []).includes(dayNumber)) continue;
          events.push({
            id: `course-${section.classId}-${key}`,
            kind: "course",
            source: "courses",
            title: `${section.code} · ${section.title}`,
            date: key,
            start: section.start,
            end: section.end || section.start + 60,
            allDay: false,
            location: cleanLocation(section.location) || "",
            notes: section.instructor || "",
            courseCode: section.code,
            sectionId: section.classId,
          });
        }
      }
    }
    for (const event of state.calendarEvents) {
      if (event.date === key && calendarSourceVisible(event.source)) {
        events.push({ ...event, kind: "custom" });
      }
    }
    if (calendarSourceVisible("google")) {
      for (const event of state.googleCalendarEvents || []) {
        if (event.date === key) events.push(event);
      }
    }
    if (calendarSourceVisible("holidays")) {
      events.push(...calendarHolidayEventsForYear(cursor.getFullYear()).filter((event) => event.date === key));
    }
    if (calendarSourceVisible("academic")) {
      events.push(...calendarAcademicEventsForYear(cursor.getFullYear()).filter((event) => event.date === key));
    }
  }
  const query = state.calendarQuery.trim().toLowerCase();
  return events
    .filter((event) => !query || `${event.title} ${event.location || ""} ${event.notes || ""}`.toLowerCase().includes(query))
    .sort((a, b) => a.date.localeCompare(b.date) || Number(a.start ?? -1) - Number(b.start ?? -1) || a.title.localeCompare(b.title));
}

function calendarHasItemsOnDate(date) {
  const key = calendarDateKey(date);
  if (calendarSourceVisible("study") || calendarSourceVisible("tasks") || calendarSourceVisible("personal")) {
    if (state.calendarEvents?.some((event) => event.date === key && calendarSourceVisible(event.source))) return true;
  }
  if (calendarSourceVisible("academic") && calendarAcademicEventsForYear(date.getFullYear()).some((event) => event.date === key)) return true;
  if (calendarSourceVisible("holidays") && calendarHolidayEventsForYear(date.getFullYear()).some((event) => event.date === key)) return true;
  if (calendarSourceVisible("google") && (state.googleCalendarEvents || []).some((event) => event.date === key)) return true;
  const dayNumber = date.getDay() === 0 ? 7 : date.getDay();
  return calendarSourceVisible("courses") && state.schedule.some((section) => section.start != null && (section.days || []).includes(dayNumber));
}

function calendarTimeInput(minutes) {
  return `${pad2(Math.floor(minutes / 60) % 24)}:${pad2(minutes % 60)}`;
}

function calendarTimeFromInput(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function calendarTimeText(minutes) {
  if (minutes == null) return "All day";
  if (state.calendarTimeFormat === "24h") return calendarTimeInput(minutes);
  return timeLabel(minutes);
}

function calendarEventTime(event) {
  if (event.allDay) return "All day";
  return `${calendarTimeText(event.start)} – ${calendarTimeText(event.end)}`;
}

function layoutCalendarEvents(events) {
  const sorted = [...events].sort((a, b) => a.start - b.start || a.end - b.end);
  const positioned = [];
  let group = [];
  let groupEnd = -1;
  const flush = () => {
    if (!group.length) return;
    const laneEnds = [];
    for (const event of group) {
      let lane = laneEnds.findIndex((end) => end <= event.start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = event.end;
      event._lane = lane;
    }
    for (const event of group) {
      event._lanes = Math.max(1, laneEnds.length);
      positioned.push(event);
    }
    group = [];
    groupEnd = -1;
  };
  for (const event of sorted) {
    if (!group.length || event.start < groupEnd) {
      group.push(event);
      groupEnd = Math.max(groupEnd, event.end);
    } else {
      flush();
      group.push(event);
      groupEnd = event.end;
    }
  }
  flush();
  return positioned;
}

function calendarEventClassName(event, conflicts) {
  const color = calendarEventColor(event);
  const classes = ["calendar-event"];
  if (event.kind === "custom") classes.push("draggable");
  if (event.end - event.start <= 45) classes.push("compact");
  if (event.source === "personal") classes.push("solid");
  if (event.kind === "course" && conflicts.some(([a, b]) => a.classId === event.sectionId || b.classId === event.sectionId)) classes.push("conflict");
  return { className: classes.join(" "), color };
}

function calendarEventMarkup(event, conflicts) {
  const visibleStart = Math.max(event.start, CALENDAR_START_MINUTES);
  const visibleEnd = Math.min(event.end, CALENDAR_END_MINUTES);
  const visibleMinutes = CALENDAR_END_MINUTES - CALENDAR_START_MINUTES;
  const top = ((visibleStart - CALENDAR_START_MINUTES) / visibleMinutes) * 100;
  const height = ((visibleEnd - visibleStart) / visibleMinutes) * 100;
  const laneCount = event._lanes || 1;
  const lane = event._lane || 0;
  const left = laneCount === 1 ? 2 : 1 + lane * (98 / laneCount);
  const width = laneCount === 1 ? "calc(100% - 4px)" : `calc(${98 / laneCount}% - 2px)`;
  const { className, color } = calendarEventClassName(event, conflicts);
  return `<button type="button" class="${className}" style="top:${top.toFixed(4)}%;height:max(22px,${height.toFixed(4)}%);left:${left}%;width:${width};--event-color:${color}" title="${esc(event.title)}&#10;${esc(calendarEventTime(event))}&#10;${esc(event.location || "")}" data-calendar-event="${esc(event.id)}" ${event.kind === "custom" ? 'draggable="true"' : ""}>
    <b>${esc(event.title)}</b><span>${esc(calendarEventTime(event))}${event.location ? ` · ${esc(event.location)}` : ""}</span>
  </button>`;
}

function addSectionsToSchedule(code, sectionId = "") {
  const sections = state.courses.filter((c) => normCode(c.code) === normCode(code));
  const pick = sections.filter((s) => s.start != null && s.days && s.days.length);
  const chosen = sections.find((s) => s.classId === sectionId) || pick[0] || sections[0];
  if (!chosen) return;
  if (state.schedule.some((s) => s.classId === chosen.classId)) {
    toast("This section is already in your schedule.");
    return;
  }
  state.schedule.push(chosen);
  toast(`Added to schedule: ${chosen.code}`);
  renderCalendar();
  refreshMapPins();
}

function removeFromSchedule(classId) {
  const removed = state.schedule.find((section) => section.classId === classId);
  state.schedule = state.schedule.filter((s) => s.classId !== classId);
  renderCalendar();
  refreshMapPins();
  if (removed) toast(`${removed.code} removed from calendar.`);
}

function conflicts() {
  const list = [];
  for (let i = 0; i < state.schedule.length; i++) {
    for (let j = i + 1; j < state.schedule.length; j++) {
      const a = state.schedule[i], b = state.schedule[j];
      if (a.start == null || b.start == null) continue;
      const overlapDay = (a.days || []).some((d) => (b.days || []).includes(d));
      const overlapTime = a.start < b.end && b.start < a.end;
      if (overlapDay && overlapTime) list.push([a, b]);
    }
  }
  return list;
}

function calendarPeriodBounds() {
  const selected = new Date(state.calendarSelected);
  if (state.calendarView === "day") {
    return { start: selected, end: calendarAddDays(selected, 1) };
  }
  if (state.calendarView === "month") {
    const start = new Date(selected.getFullYear(), selected.getMonth(), 1);
    return { start, end: new Date(selected.getFullYear(), selected.getMonth() + 1, 1) };
  }
  if (state.calendarView === "agenda") {
    return { start: selected, end: calendarAddDays(selected, 14) };
  }
  const start = calendarStartOfWeek(selected);
  return { start, end: calendarAddDays(start, 7) };
}

function calendarRangeTitle(start, end) {
  if (state.calendarView === "day") {
    return start.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }
  if (state.calendarView === "month") return calendarMonthLabel(start);
  if (state.calendarView === "agenda") return "Upcoming · 14 days";
  const last = calendarAddDays(end, -1);
  if (start.getMonth() === last.getMonth()) {
    return `${start.toLocaleDateString("en-US", { month: "long" })} ${start.getDate()}–${last.getDate()}, ${last.getFullYear()}`;
  }
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${last.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

function renderCalendarChrome(start, end) {
  const today = new Date();
  const selectedIsToday = calendarSameDay(state.calendarSelected, today);
  $("#cal-range").textContent = calendarRangeTitle(start, end);
  const subrange = $("#cal-subrange");
  if (subrange) {
    subrange.textContent = `${selectedIsToday ? "Today · " : ""}${state.calendarSelected.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`;
  }
  $("#cal-time-format").textContent = state.calendarTimeFormat;
  const googleButton = $("#gcal-open");
  if (googleButton) {
    googleButton.textContent = state.googleCalendarConnected
      ? (state.googleCalendarLoading ? "Syncing Google…" : "Google · Synced")
      : "Connect";
    googleButton.classList.toggle("is-connected", state.googleCalendarConnected);
    googleButton.disabled = state.googleCalendarLoading;
  }
  $$("[data-calview]").forEach((button) => {
    const active = button.dataset.calview === state.calendarView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

function renderMiniCalendar() {
  initializeCalendarState();
  const month = state.calendarMiniMonth;
  const start = calendarStartOfWeek(new Date(month.getFullYear(), month.getMonth(), 1));
  const today = new Date();
  let days = "";
  for (let index = 0; index < 42; index += 1) {
    const date = calendarAddDays(start, index);
    const classes = ["mini-day"];
    if (date.getMonth() !== month.getMonth()) classes.push("outside");
    if (calendarSameDay(date, today)) classes.push("today");
    if (calendarSameDay(date, state.calendarSelected)) classes.push("selected");
    if (calendarHasItemsOnDate(date)) classes.push("has-event");
    days += `<button type="button" class="${classes.join(" ")}" data-calendar-date="${calendarDateKey(date)}" aria-label="${esc(date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }))}">${date.getDate()}</button>`;
  }
  $("#mini-calendar").innerHTML = `
    <div class="mini-calendar-head">
      <span>${calendarMonthLabel(month)}</span>
      <div class="mini-calendar-nav">
        <button type="button" data-calendar-month="-1" aria-label="Previous month"><svg viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></svg></button>
        <button type="button" data-calendar-month="1" aria-label="Next month"><svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg></button>
      </div>
    </div>
    <div class="mini-weekdays">${CALENDAR_WEEKDAYS_MINI.map((day) => `<span>${day}</span>`).join("")}</div>
    <div class="mini-days">${days}</div>`;
}

function renderCalendarSources() {
  const build = (group) => CALENDAR_SOURCES.filter((source) => source.group === group).map((source) => `
    <label class="calendar-source-row" style="--source-color:${source.color}">
      <input type="checkbox" data-calendar-source="${source.id}" ${calendarSourceVisible(source.id) ? "checked" : ""} />
      <span class="calendar-source-check" aria-hidden="true"></span>
      <span>${esc(source.label)}</span>
    </label>`).join("");
  $("#cal-my-sources").innerHTML = build("my");
  $("#cal-other-sources").innerHTML = build("other");
}

function renderCalendarInspector(events) {
  const now = new Date();
  const upcoming = events
    .filter((event) => {
      const date = calendarFromKey(event.date);
      if (event.allDay) return date >= new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return date > now || (calendarSameDay(date, now) && event.start >= now.getHours() * 60 + now.getMinutes());
    })
    .sort((a, b) => `${a.date}-${a.start ?? 0}`.localeCompare(`${b.date}-${b.start ?? 0}`));
  const next = upcoming[0] || events.slice().sort((a, b) => `${a.date}-${a.start ?? 0}`.localeCompare(`${b.date}-${b.start ?? 0}`))[0];
  if (next) {
    const source = calendarSourceFor(next.source);
    const eventColor = calendarEventColor(next);
    $("#calendar-focus").innerHTML = `
      <div class="calendar-focus-card" style="--event-color:${eventColor}">
        <div class="focus-kicker">Next up · ${esc(source.label)}</div>
        <h3>${esc(next.title)}</h3>
        <p>${esc(calendarFromKey(next.date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }))}${next.location ? ` · ${esc(next.location)}` : ""}</p>
        <div class="calendar-focus-time">${esc(calendarEventTime(next))}</div>
      </div>`;
  } else {
    $("#calendar-focus").innerHTML = `
      <div class="calendar-focus-card">
        <div class="focus-kicker">Open space</div>
        <h3>Your calendar is clear</h3>
        <p>Use Create or press N to add a block.</p>
      </div>`;
  }
  const timed = events.filter((event) => !event.allDay);
  const hours = timed.reduce((sum, event) => sum + Math.max(0, event.end - event.start), 0) / 60;
  const tasks = events.filter((event) => event.source === "tasks").length;
  const holidays = events.filter((event) => event.source === "holidays" || event.source === "academic").length;
  $("#calendar-insights").innerHTML = `
    <div class="calendar-insight"><span class="calendar-insight-icon">◷</span><div><span>Planned time</span><b>${hours.toFixed(hours % 1 ? 1 : 0)} hours</b></div><em>${timed.length} blocks</em></div>
    <div class="calendar-insight"><span class="calendar-insight-icon">✓</span><div><span>Tasks</span><b>${tasks} due</b></div><em>${tasks ? "review" : "clear"}</em></div>
    <div class="calendar-insight"><span class="calendar-insight-icon">i</span><div><span>Calendar notes</span><b>${holidays} dates</b></div><em>official</em></div>`;
  $("#calendar-course-count").textContent = String(state.schedule.length);
  $("#cal-list").innerHTML = state.schedule.length ? state.schedule.map((section) => `
    <div class="cal-row">
      <div class="cal-row-main">
        <div class="cr-main">${esc(section.code)}</div>
        <div class="cr-sub">${esc(formatMeeting(section))}</div>
      </div>
      <button type="button" data-remove-course="${esc(section.classId)}" title="Remove from calendar">×</button>
    </div>`).join("") : `<div class="cr-sub">No courses yet. Add one from Browse.</div>`;
  $("#cal-list").querySelectorAll("[data-remove-course]").forEach((button) => {
    button.addEventListener("click", () => removeFromSchedule(button.dataset.removeCourse));
  });
}

function renderTimeGridCalendar(days) {
  const rangeStart = days[0];
  const rangeEnd = calendarAddDays(days[days.length - 1], 1);
  const events = calendarAllEventsInRange(rangeStart, rangeEnd);
  const allDay = events.filter((event) => event.allDay);
  const conflictPairs = conflicts();
  const today = new Date();
  const head = `<div class="calendar-gutter"></div>${days.map((date) => {
    const dateEvents = allDay.filter((event) => event.date === calendarDateKey(date));
    const classes = ["calendar-day-head"];
    if (calendarSameDay(date, today)) classes.push("today");
    if (calendarSameDay(date, state.calendarSelected)) classes.push("selected");
    if (date.getDay() === 0 || date.getDay() === 6) classes.push("weekend");
    return `<button type="button" class="${classes.join(" ")}" data-calendar-date="${calendarDateKey(date)}">
      <small>${CALENDAR_WEEKDAYS[date.getDay()].slice(0, 3)}</small>
      <span class="calendar-day-number">${date.getDate()}</span>
      <em>${esc(dateEvents[0]?.title || "")}</em>
    </button>`;
  }).join("")}`;
  const allDayRow = `<div class="calendar-all-day-label">ALL DAY</div>${days.map((date) => {
    const items = allDay.filter((event) => event.date === calendarDateKey(date));
    return `<div class="calendar-all-day-cell">${items.map((event) => {
      const color = calendarEventColor(event);
      return `<button type="button" class="calendar-all-day-event" style="--event-color:${color}" data-calendar-event="${esc(event.id)}">${esc(event.title)}</button>`;
    }).join("")}</div>`;
  }).join("")}`;
  const rail = Array.from({ length: CALENDAR_VISIBLE_HOURS + 1 }, (_, index) => {
    const hour = CALENDAR_START_HOUR + index;
    const edgeClass = hour === CALENDAR_START_HOUR ? " is-start" : hour === CALENDAR_END_HOUR ? " is-end" : "";
    return `<span class="calendar-hour-label${edgeClass}" style="top:${(index / CALENDAR_VISIBLE_HOURS * 100).toFixed(4)}%">${calendarTimeText(hour * 60)}</span>`;
  }).join("");
  const columns = days.map((date) => {
    const key = calendarDateKey(date);
    const timed = layoutCalendarEvents(events.filter((event) => event.date === key
      && !event.allDay
      && event.end > CALENDAR_START_MINUTES
      && event.start < CALENDAR_END_MINUTES));
    const isToday = calendarSameDay(date, today);
    const nowMinutes = today.getHours() * 60 + today.getMinutes();
    const showNow = nowMinutes >= CALENDAR_START_MINUTES && nowMinutes <= CALENDAR_END_MINUTES;
    const nowTop = (nowMinutes - CALENDAR_START_MINUTES) / (CALENDAR_END_MINUTES - CALENDAR_START_MINUTES) * 100;
    return `<div class="calendar-day-column ${date.getDay() === 0 || date.getDay() === 6 ? "weekend" : ""}" data-calendar-drop-date="${key}">
      ${timed.map((event) => calendarEventMarkup(event, conflictPairs)).join("")}
      ${isToday && showNow ? `<div class="calendar-now-line" style="top:${nowTop.toFixed(4)}%"><span class="calendar-now-label">${calendarTimeText(nowMinutes)}</span></div>` : ""}
    </div>`;
  }).join("");
  $("#calendar").innerHTML = `
    <div class="calendar-week-shell">
      <div class="calendar-week-head">${head}</div>
      <div class="calendar-all-day-row">${allDayRow}</div>
      <div class="calendar-week-scroll" id="calendar-week-scroll">
        <div class="calendar-week-body"><div class="calendar-hour-rail">${rail}</div>${columns}</div>
      </div>
    </div>`;
  requestAnimationFrame(() => {
    const scroll = $("#calendar-week-scroll");
    if (!scroll) return;
    scroll.scrollTop = 0;
  });
  return events;
}

function renderMonthCalendar() {
  const monthStart = new Date(state.calendarSelected.getFullYear(), state.calendarSelected.getMonth(), 1);
  const gridStart = calendarStartOfWeek(monthStart);
  const gridEnd = calendarAddDays(gridStart, 42);
  const events = calendarAllEventsInRange(gridStart, gridEnd);
  const today = new Date();
  const weekdayHead = CALENDAR_WEEKDAYS.map((day) => `<span>${day.slice(0, 3)}</span>`).join("");
  let cells = "";
  for (let index = 0; index < 42; index += 1) {
    const date = calendarAddDays(gridStart, index);
    const key = calendarDateKey(date);
    const dayEvents = events.filter((event) => event.date === key);
    const classes = ["calendar-month-day"];
    if (date.getMonth() !== monthStart.getMonth()) classes.push("outside");
    if (calendarSameDay(date, today)) classes.push("today");
    cells += `<div class="${classes.join(" ")}" data-calendar-date="${key}">
      <span class="calendar-month-date">${date.getDate()}</span>
      ${dayEvents.slice(0, 3).map((event) => {
        const color = calendarEventColor(event);
        return `<button type="button" class="calendar-month-event" style="--event-color:${color}" data-calendar-event="${esc(event.id)}"><span>${esc(event.title)}</span></button>`;
      }).join("")}
      ${dayEvents.length > 3 ? `<button type="button" class="calendar-month-more" data-calendar-date="${key}">+${dayEvents.length - 3} more</button>` : ""}
    </div>`;
  }
  $("#calendar").innerHTML = `<div class="calendar-month-shell"><div class="calendar-month-weekdays">${weekdayHead}</div><div class="calendar-month-grid">${cells}</div></div>`;
  return events;
}

function renderAgendaCalendar() {
  const start = new Date(state.calendarSelected);
  const end = calendarAddDays(start, 14);
  const events = calendarAllEventsInRange(start, end);
  const grouped = new Map();
  for (const event of events) {
    if (!grouped.has(event.date)) grouped.set(event.date, []);
    grouped.get(event.date).push(event);
  }
  const body = Array.from(grouped.entries()).map(([key, items]) => {
    const date = calendarFromKey(key);
    return `<section class="calendar-agenda-day">
      <div class="calendar-agenda-date">${esc(date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase())}<b>${date.getDate()}</b>${esc(date.toLocaleDateString("en-US", { month: "short" }))}</div>
      <div class="calendar-agenda-events">${items.map((event) => {
        const source = calendarSourceFor(event.source);
        const color = calendarEventColor(event);
        return `<button type="button" class="calendar-agenda-event" style="--event-color:${color}" data-calendar-event="${esc(event.id)}">
          <time>${esc(calendarEventTime(event))}</time><b>${esc(event.title)}</b><small>${esc(source.label)}</small>
        </button>`;
      }).join("")}</div>
    </section>`;
  }).join("");
  $("#calendar").innerHTML = `<div class="calendar-agenda-shell">${body || `<div class="calendar-agenda-empty">No events in the next 14 days.</div>`}</div>`;
  return events;
}

function renderCalendar() {
  initializeCalendarState();
  const { start, end } = calendarPeriodBounds();
  renderCalendarChrome(start, end);
  renderMiniCalendar();
  renderCalendarSources();
  let events = [];
  if (state.calendarView === "month") {
    events = renderMonthCalendar();
  } else if (state.calendarView === "agenda") {
    events = renderAgendaCalendar();
  } else {
    const days = [];
    const count = state.calendarView === "day" ? 1 : 7;
    for (let index = 0; index < count; index += 1) days.push(calendarAddDays(start, index));
    events = renderTimeGridCalendar(days);
  }
  state.calendarRenderedEvents = events;
  const conflictPairs = conflicts();
  const cbox = $("#cal-conflicts");
  if (conflictPairs.length) {
    cbox.hidden = false;
    cbox.innerHTML = `Time conflict · ${conflictPairs.map(([a, b]) => `${esc(a.code)} / ${esc(b.code)}`).join(" · ")}`;
  } else {
    cbox.hidden = true;
  }
}

function openCalendarReadonlyEvent(event) {
  const source = calendarSourceFor(event.source);
  $("#modal-body").innerHTML = `
    <div class="calendar-event-form">
      <div class="form-head">
        <div><div class="form-kicker" style="color:${source.color}">${esc(source.label)}</div><h2>${esc(event.title)}</h2></div>
      </div>
      <div class="calendar-form-grid">
        <div><b>Date</b><br>${esc(calendarFromKey(event.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }))}</div>
        <div><b>Time</b><br>${esc(calendarEventTime(event))}</div>
        <div class="wide"><b>Location</b><br>${esc(event.location || "—")}</div>
        <div class="wide"><b>Notes</b><br>${esc(event.notes || "—")}</div>
      </div>
      <div class="form-actions">
        ${event.kind === "google" && event.htmlLink ? `<a class="btn ghost form-delete" href="${esc(event.htmlLink)}" target="_blank" rel="noopener">Open in Google Calendar</a>` : ""}
        <button class="btn ghost" type="button" data-close-calendar-modal>Close</button>
      </div>
    </div>`;
  $("#modal").hidden = false;
  document.body.style.overflow = "hidden";
  $("#modal-body [data-close-calendar-modal]")?.addEventListener("click", closeModal);
}

function openCalendarCourseEvent(event) {
  const section = state.schedule.find((item) => item.classId === event.sectionId);
  const eventColor = calendarEventColor(event);
  const dateLabel = calendarFromKey(event.date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  $("#modal-body").innerHTML = `
    <div class="calendar-event-form calendar-course-event-modal">
      <div class="form-head">
        <div>
          <div class="form-kicker" style="color:${eventColor}">Course on your calendar</div>
          <h2>${esc(event.courseCode || section?.code || "Course")}</h2>
        </div>
      </div>
      <div class="calendar-course-event-grid">
        <div class="wide"><b>${esc(section?.title || event.title.split("·").slice(1).join("·").trim() || "Course")}</b></div>
        <div><span>Date</span><strong>${esc(dateLabel)}</strong></div>
        <div><span>Time</span><strong>${esc(calendarEventTime(event))}</strong></div>
        <div><span>Section</span><strong>${esc(section ? sectionLabel(section) : "—")}</strong></div>
        <div><span>Instructor</span><strong>${esc(section?.instructor || event.notes || "TBA")}</strong></div>
        <div><span>Location</span><strong>${esc(event.location || "Location TBA")}</strong></div>
        <div><span>Credits</span><strong>${esc(section?.pointsLabel || section?.points || "—")}</strong></div>
      </div>
      <div class="form-actions">
        <button class="btn ghost calendar-remove-course-btn" type="button" data-remove-calendar-course>
          <span aria-hidden="true">×</span>
          Remove from calendar
        </button>
        <button class="btn ghost" type="button" data-close-calendar-modal>Close</button>
        <button class="btn primary" type="button" data-open-calendar-course>Open course</button>
      </div>
    </div>`;
  $("#modal").hidden = false;
  document.body.style.overflow = "hidden";
  $("#modal-body [data-close-calendar-modal]")?.addEventListener("click", closeModal);
  $("#modal-body [data-open-calendar-course]")?.addEventListener("click", () => {
    openCourse(event.courseCode, event.sectionId);
  });
  $("#modal-body [data-remove-calendar-course]")?.addEventListener("click", () => {
    removeFromSchedule(event.sectionId);
    closeModal();
  });
}

function openCalendarComposer({ event = null, date = null, start = 9 * 60, source = "study" } = {}) {
  const editing = event?.kind === "custom" ? event : null;
  const eventDate = editing?.date ? calendarFromKey(editing.date) : (date ? calendarFromKey(date) : new Date(state.calendarSelected));
  const eventStart = editing?.start ?? start;
  const eventEnd = editing?.end ?? Math.min(24 * 60, eventStart + 60);
  const eventSource = editing?.source || (source === "task" ? "tasks" : source);
  const isAllDay = Boolean(editing?.allDay);
  const sources = CALENDAR_SOURCES.filter((item) => ["study", "tasks", "personal"].includes(item.id));
  $("#modal-body").innerHTML = `
    <form class="calendar-event-form" id="calendar-event-form" aria-label="${editing ? "Edit event" : "Create event"}">
      <input type="hidden" name="eventId" value="${esc(editing?.id || "")}" />
      <label>Title<input name="title" maxlength="80" required value="${esc(editing?.title || "")}" placeholder="e.g. Review problem set" autofocus /></label>
      <div class="calendar-form-grid">
        <label>Calendar<select name="source">${sources.map((item) => `<option value="${item.id}" ${item.id === eventSource ? "selected" : ""}>${esc(item.label)}</option>`).join("")}</select></label>
        <label>Date<input name="date" type="date" required value="${calendarDateKey(eventDate)}" /></label>
        <label class="wide calendar-all-day-toggle">
          <input name="allDay" type="checkbox" ${isAllDay ? "checked" : ""} />
          <span class="calendar-toggle-track" aria-hidden="true"><i></i></span>
          <span class="calendar-toggle-copy"><b>All-day event</b><small>Show at the top of the calendar</small></span>
        </label>
        <div class="calendar-form-grid wide calendar-time-fields" ${isAllDay ? "hidden" : ""}>
          <label>Start<input name="start" type="time" value="${calendarTimeInput(eventStart)}" /></label>
          <label>End<input name="end" type="time" value="${calendarTimeInput(eventEnd)}" /></label>
        </div>
        <label class="wide">Location<input name="location" maxlength="90" value="${esc(editing?.location || "")}" placeholder="Butler Library, Mudd 315…" /></label>
        <label class="wide">Notes<textarea name="notes" maxlength="500" placeholder="Agenda, preparation, links…">${esc(editing?.notes || "")}</textarea></label>
      </div>
      <div class="form-actions">
        ${editing ? `<button class="btn ghost form-delete" type="button" data-delete-calendar-event="${esc(editing.id)}">Delete</button>` : ""}
        <button class="btn ghost" type="button" data-close-calendar-modal>Cancel</button>
        <button class="btn primary" type="submit">${editing ? "Save changes" : "Create event"}</button>
      </div>
    </form>`;
  $("#modal").hidden = false;
  document.body.style.overflow = "hidden";
  const form = $("#calendar-event-form");
  const allDayInput = form.elements.allDay;
  const timeFields = form.querySelector(".calendar-time-fields");
  allDayInput.addEventListener("change", () => { timeFields.hidden = allDayInput.checked; });
  form.querySelector("[data-close-calendar-modal]")?.addEventListener("click", closeModal);
  form.querySelector("[data-delete-calendar-event]")?.addEventListener("click", async (clickEvent) => {
    const eventId = clickEvent.currentTarget.dataset.deleteCalendarEvent;
    const original = state.calendarEvents.find((item) => item.id === eventId);
    if (original?.googleEventId && googleCalendarTokenValid()) {
      try { await deleteGoogleCalendarEvent(original); }
      catch (error) { toast(`Google delete failed: ${error.message}`); }
    }
    state.calendarEvents = state.calendarEvents.filter((item) => item.id !== eventId);
    saveCalendarEvents();
    closeModal();
    renderCalendar();
    toast("Event deleted.");
  });
  form.addEventListener("submit", async (submitEvent) => {
    submitEvent.preventDefault();
    const data = new FormData(form);
    const title = String(data.get("title") || "").trim();
    if (!title) return;
    const allDay = data.get("allDay") === "on";
    const startMinutes = allDay ? null : calendarTimeFromInput(data.get("start"));
    const endMinutes = allDay ? null : calendarTimeFromInput(data.get("end"));
    if (!allDay && (startMinutes == null || endMinutes == null || endMinutes <= startMinutes)) {
      toast("Choose an end time after the start time.");
      return;
    }
    const index = state.calendarEvents.findIndex((item) => item.id === (data.get("eventId") || ""));
    const original = index >= 0 ? state.calendarEvents[index] : null;
    let payload = {
      id: data.get("eventId") || calendarUid(data.get("source")),
      title,
      source: data.get("source") || "study",
      date: data.get("date"),
      start: startMinutes,
      end: endMinutes,
      allDay,
      location: String(data.get("location") || "").trim(),
      notes: String(data.get("notes") || "").trim(),
      googleEventId: original?.googleEventId || null,
    };
    if (state.googleCalendarConnected && googleCalendarTokenValid()) {
      try {
        payload = await pushCalendarEventToGoogle(payload);
      } catch (error) {
        state.googleCalendarError = error.message;
        toast(`Saved locally · Google sync failed: ${error.message}`);
      }
    }
    if (index >= 0) state.calendarEvents[index] = payload;
    else state.calendarEvents.push(payload);
    saveCalendarEvents();
    closeModal();
    renderCalendar();
    toast(index >= 0 ? "Event updated." : "Event added to your calendar.");
  });
  form.elements.title.focus();
}

function showCalendarEventById(id) {
  const event = (state.calendarRenderedEvents || []).find((item) => item.id === id);
  if (!event) return;
  if (event.kind === "course") openCalendarCourseEvent(event);
  else if (event.kind === "custom") openCalendarComposer({ event });
  else openCalendarReadonlyEvent(event);
}

function makeScheduleShareCode() {
  if (!state.schedule.length) return "";
  const payload = {
    v: 1,
    t: state.term,
    c: state.schedule.map((section) => [section.code, section.classId]),
  };
  return `AVC1.${btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`;
}

function parseScheduleShareCode(input) {
  const compact = String(input || "").trim().replace(/\s+/g, "");
  if (!compact.startsWith("AVC1.")) throw new Error("This is not a valid Antivergil course code.");
  const encoded = compact.slice(5).replace(/-/g, "+").replace(/_/g, "/");
  const padded = encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
  let payload;
  try {
    payload = JSON.parse(atob(padded));
  } catch {
    throw new Error("This course code could not be read.");
  }
  if (payload?.v !== 1 || !payload.t || !Array.isArray(payload.c)) {
    throw new Error("This course code is incomplete or unsupported.");
  }
  return payload;
}

function importScheduleShareCode(input) {
  const payload = parseScheduleShareCode(input);
  if (payload.t !== state.term) {
    throw new Error(`This code is for ${termShort(payload.t)}. Switch to that term first.`);
  }
  let added = 0;
  let duplicates = 0;
  let missing = 0;
  for (const item of payload.c) {
    const code = Array.isArray(item) ? item[0] : item?.c;
    const classId = Array.isArray(item) ? item[1] : item?.id;
    const candidates = state.courses.filter((course) => normCode(course.code) === normCode(code));
    const section = candidates.find((course) => course.classId === classId)
      || candidates.find((course) => course.start != null && (course.days || []).length)
      || candidates[0];
    if (!section) {
      missing += 1;
    } else if (state.schedule.some((course) => course.classId === section.classId)) {
      duplicates += 1;
    } else {
      state.schedule.push(section);
      added += 1;
    }
  }
  renderCalendar();
  refreshMapPins();
  return { added, duplicates, missing };
}

async function copyScheduleShareCode(text) {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = $("#calendar-share-output");
    if (!field) return false;
    field.focus();
    field.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    }
  }
}

function openCalendarShareDialog() {
  const shareCode = makeScheduleShareCode();
  $("#modal-body").innerHTML = `
    <div class="calendar-event-form calendar-share-dialog">
      <div class="form-head">
        <div>
          <div class="form-kicker">Calendar sharing</div>
          <h2>Share / import courses</h2>
        </div>
        <span class="calendar-share-count">${state.schedule.length} ${state.schedule.length === 1 ? "course" : "courses"}</span>
      </div>
      <label class="calendar-share-field">
        <span>Your course code</span>
        <textarea id="calendar-share-output" readonly spellcheck="false" placeholder="Add courses to your calendar to create a code.">${esc(shareCode)}</textarea>
      </label>
      <button class="btn small ghost calendar-copy-code" id="calendar-share-copy" type="button" ${shareCode ? "" : "disabled"}>Copy code</button>
      <div class="calendar-share-divider"><span>or import a code</span></div>
      <label class="calendar-share-field">
        <span>Paste a classmate’s course code</span>
        <textarea id="calendar-share-input" spellcheck="false" autocomplete="off" placeholder="AVC1.…"></textarea>
      </label>
      <p class="calendar-share-note">Only course selections are shared. Personal events stay private.</p>
      <div class="calendar-share-status" id="calendar-share-status" role="status" aria-live="polite" hidden></div>
      <div class="form-actions">
        <button class="btn ghost" type="button" data-close-calendar-modal>Cancel</button>
        <button class="btn primary" id="calendar-share-import" type="button" disabled>Import &amp; add courses</button>
      </div>
    </div>`;
  $("#modal").hidden = false;
  document.body.style.overflow = "hidden";
  const input = $("#calendar-share-input");
  const importButton = $("#calendar-share-import");
  const status = $("#calendar-share-status");
  const showStatus = (message, isError = false) => {
    status.textContent = message;
    status.classList.toggle("is-error", isError);
    status.hidden = false;
  };
  input.addEventListener("input", () => {
    importButton.disabled = !input.value.trim();
    status.hidden = true;
  });
  $("#modal-body [data-close-calendar-modal]")?.addEventListener("click", closeModal);
  $("#calendar-share-copy")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    if (!await copyScheduleShareCode(shareCode)) {
      showStatus("Copy failed. Select the code and copy it manually.", true);
      return;
    }
    button.textContent = "Copied ✓";
    button.classList.add("is-copied");
    setTimeout(() => {
      button.textContent = "Copy code";
      button.classList.remove("is-copied");
    }, 1400);
  });
  importButton.addEventListener("click", () => {
    try {
      const result = importScheduleShareCode(input.value);
      const notes = [`${result.added} added`];
      if (result.duplicates) notes.push(`${result.duplicates} already present`);
      if (result.missing) notes.push(`${result.missing} unavailable`);
      closeModal();
      toast(`Courses imported · ${notes.join(" · ")}`);
    } catch (error) {
      showStatus(error.message || "This code could not be imported.", true);
    }
  });
  input.focus();
}

function bindCalendarFeature() {
  const createButton = $("#calendar-create");
  const createMenu = $("#calendar-create-menu");
  const closeCreateMenu = () => {
    if (!createMenu || !createButton) return;
    createMenu.hidden = true;
    createButton.setAttribute("aria-expanded", "false");
  };
  createButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    createMenu.hidden = !createMenu.hidden;
    createButton.setAttribute("aria-expanded", String(!createMenu.hidden));
  });
  createMenu?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-create-kind]");
    if (!button) return;
    const kind = button.dataset.createKind;
    closeCreateMenu();
    openCalendarComposer({
      source: kind === "task" ? "tasks" : kind,
      date: calendarDateKey(state.calendarSelected),
    });
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".calendar-create-wrap")) closeCreateMenu();
  });

  const shiftCalendar = (direction) => {
    const selected = new Date(state.calendarSelected);
    if (state.calendarView === "day") selected.setDate(selected.getDate() + direction);
    else if (state.calendarView === "month") selected.setMonth(selected.getMonth() + direction, 1);
    else selected.setDate(selected.getDate() + direction * (state.calendarView === "agenda" ? 14 : 7));
    state.calendarSelected = selected;
    state.calendarMiniMonth = new Date(selected.getFullYear(), selected.getMonth(), 1);
    renderCalendar();
  };
  $("#cal-prev")?.addEventListener("click", () => shiftCalendar(-1));
  $("#cal-next")?.addEventListener("click", () => shiftCalendar(1));
  $("#cal-today")?.addEventListener("click", () => {
    state.calendarSelected = new Date();
    state.calendarSelected.setHours(0, 0, 0, 0);
    state.calendarMiniMonth = new Date(state.calendarSelected.getFullYear(), state.calendarSelected.getMonth(), 1);
    renderCalendar();
  });
  $$("[data-calview]").forEach((button) => button.addEventListener("click", () => {
    state.calendarView = button.dataset.calview;
    state.calendarMiniMonth = new Date(state.calendarSelected.getFullYear(), state.calendarSelected.getMonth(), 1);
    renderCalendar();
  }));
  $("#cal-time-format")?.addEventListener("click", () => {
    state.calendarTimeFormat = state.calendarTimeFormat === "24h" ? "12h" : "24h";
    renderCalendar();
  });
  $("#cal-sidebar-toggle")?.addEventListener("click", (event) => {
    const app = $("#calendar-app");
    if (!app) return;
    const button = event.currentTarget;
    if (window.matchMedia("(min-width: 981px)").matches) {
      const collapsed = app.classList.toggle("sidebar-collapsed");
      button.setAttribute("aria-expanded", String(!collapsed));
      button.title = collapsed ? "Open calendar sidebar" : "Collapse calendar sidebar";
    } else {
      const open = app.classList.toggle("sidebar-open");
      button.setAttribute("aria-expanded", String(open));
      button.title = open ? "Close calendar sidebar" : "Open calendar sidebar";
    }
  });
  $("#cal-event-search")?.addEventListener("input", (event) => {
    state.calendarQuery = event.target.value;
    renderCalendar();
  });
  $("#mini-calendar")?.addEventListener("click", (event) => {
    const monthButton = event.target.closest("[data-calendar-month]");
    if (monthButton) {
      const next = new Date(state.calendarMiniMonth);
      next.setMonth(next.getMonth() + Number(monthButton.dataset.calendarMonth), 1);
      state.calendarMiniMonth = next;
      renderMiniCalendar();
      return;
    }
    const dateButton = event.target.closest("[data-calendar-date]");
    if (!dateButton) return;
    state.calendarSelected = calendarFromKey(dateButton.dataset.calendarDate);
    state.calendarMiniMonth = new Date(state.calendarSelected.getFullYear(), state.calendarSelected.getMonth(), 1);
    renderCalendar();
  });
  function onCalendarSourceChange(event) {
    const input = event.target.closest("[data-calendar-source]");
    if (!input) return;
    const hidden = new Set(state.calendarHiddenSources || []);
    if (input.checked) hidden.delete(input.dataset.calendarSource);
    else hidden.add(input.dataset.calendarSource);
    state.calendarHiddenSources = [...hidden];
    saveCalendarVisibility();
    renderCalendar();
  }
  $("#cal-my-sources")?.addEventListener("change", onCalendarSourceChange);
  $("#cal-other-sources")?.addEventListener("change", onCalendarSourceChange);

  $("#calendar")?.addEventListener("click", (event) => {
    const eventButton = event.target.closest("[data-calendar-event]");
    if (eventButton) {
      showCalendarEventById(eventButton.dataset.calendarEvent);
      return;
    }
    const dateButton = event.target.closest("[data-calendar-date]");
    if (dateButton) {
      state.calendarSelected = calendarFromKey(dateButton.dataset.calendarDate);
      state.calendarMiniMonth = new Date(state.calendarSelected.getFullYear(), state.calendarSelected.getMonth(), 1);
      renderCalendar();
      return;
    }
    const dayColumn = event.target.closest("[data-calendar-drop-date]");
    if (!dayColumn) return;
    const rect = dayColumn.getBoundingClientRect();
    const position = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const rawMinutes = CALENDAR_START_MINUTES + position * (CALENDAR_END_MINUTES - CALENDAR_START_MINUTES);
    const minutes = Math.round(rawMinutes / 15) * 15;
    openCalendarComposer({
      date: dayColumn.dataset.calendarDropDate,
      start: minutes,
      source: "study",
    });
  });

  let draggedEventId = "";
  $("#calendar")?.addEventListener("dragstart", (event) => {
    const item = event.target.closest("[data-calendar-event][draggable='true']");
    if (!item) return;
    draggedEventId = item.dataset.calendarEvent;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedEventId);
  });
  $("#calendar")?.addEventListener("dragover", (event) => {
    if (event.target.closest("[data-calendar-drop-date]")) event.preventDefault();
  });
  $("#calendar")?.addEventListener("drop", (event) => {
    const column = event.target.closest("[data-calendar-drop-date]");
    if (!column || !draggedEventId) return;
    event.preventDefault();
    const item = state.calendarEvents.find((entry) => entry.id === draggedEventId);
    if (!item) return;
    const duration = item.allDay ? null : Math.max(15, item.end - item.start);
    const rect = column.getBoundingClientRect();
    const position = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const rawMinutes = Math.max(CALENDAR_START_MINUTES, Math.min(CALENDAR_END_MINUTES - 15, CALENDAR_START_MINUTES + position * (CALENDAR_END_MINUTES - CALENDAR_START_MINUTES)));
    const start = Math.round(rawMinutes / 15) * 15;
    item.date = column.dataset.calendarDropDate;
    if (!item.allDay) {
      item.start = start;
      item.end = Math.min(CALENDAR_END_MINUTES, start + duration);
    }
    saveCalendarEvents();
    draggedEventId = "";
    renderCalendar();
    toast("Event moved.");
    if (item.googleEventId && googleCalendarTokenValid()) {
      pushCalendarEventToGoogle(item)
        .then((synced) => {
          Object.assign(item, synced);
          saveCalendarEvents();
          renderCalendar();
        })
        .catch((error) => toast(`Moved locally · Google sync failed: ${error.message}`));
    }
  });
  $("#calendar")?.addEventListener("dragend", () => { draggedEventId = ""; });

  document.addEventListener("keydown", (event) => {
    if (document.body.dataset.view !== "calendar" || !$("#modal").hidden) return;
    if (event.target.closest("input, textarea, select, [contenteditable='true']")) return;
    if (event.key.toLowerCase() === "n") {
      event.preventDefault();
      openCalendarComposer({ date: calendarDateKey(state.calendarSelected), source: "study" });
    } else if (event.key.toLowerCase() === "t") {
      event.preventDefault();
      state.calendarSelected = new Date();
      state.calendarSelected.setHours(0, 0, 0, 0);
      renderCalendar();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      shiftCalendar(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      shiftCalendar(1);
    }
  });
}

function pad2(n) { return String(n).padStart(2, "0"); }
function nextMonday() {
  const d = new Date();
  const day = d.getDay(); // 0 Sun, 1 Mon, ...
  const diff = day === 1 ? 0 : (day === 0 ? 1 : 8 - day);
  d.setDate(d.getDate() + diff);
  return d;
}
function icsDate(d) {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;
}

function googleCalendarUrl(section, day) {
  const monday = nextMonday();
  monday.setHours(0, 0, 0, 0);
  const start = new Date(monday);
  start.setDate(monday.getDate() + (day - 1));
  start.setMinutes(section.start);
  const end = new Date(start);
  end.setMinutes(section.end || section.start + 60);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${section.code} ${section.title}`,
    dates: `${icsDate(start)}/${icsDate(end)}`,
    details: `Instructor: ${section.instructor || "TBA"}\nTerm: ${termShort(state.term)}\nSection: ${sectionLabel(section)}`,
    location: cleanLocation(section.location) || "",
    recur: "RRULE:FREQ=WEEKLY;COUNT=15",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function openGooglePicker() {
  if (!state.schedule.length) {
    toast("Add courses to your schedule first.");
    return;
  }
  const items = state.schedule.map((s) => `
    <div class="gcal-item">
      <div class="gcal-item-main">
        <b>${esc(s.code)} · ${esc(s.title)}</b>
        <span>Section ${esc(sectionLabel(s))} · ${esc(cleanLocation(s.location) || "Location TBA")}</span>
      </div>
      <div class="gcal-item-actions">
        ${(s.days || []).map((d) =>
          `<a class="btn small primary" href="${esc(googleCalendarUrl(s, d))}" target="_blank" rel="noopener">${DAY_NAMES[d - 1]}</a>`).join("")}
      </div>
    </div>`).join("");
  $("#modal-body").innerHTML = `
    <h2>Add to Google Calendar</h2>
    <div class="m-sub">Choose a class day. Google Calendar opens with a prefilled weekly event — save it there.</div>
    <div class="gcal-list">${items}</div>
    <div class="daily-note">For a bulk import of the whole schedule, use Export .ics.</div>`;
  $("#modal").hidden = false;
  document.body.style.overflow = "hidden";
}

function exportICS() {
  if (!state.schedule.length && !(state.calendarEvents || []).length) { toast("Your calendar is empty."); return; }
  const monday = nextMonday();
  monday.setHours(0, 0, 0, 0);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Columbia Course Planner//CN", "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:Columbia ${termShort(state.term)} Schedule`];
  for (const s of state.schedule) {
    if (s.start == null) continue;
    for (const day of s.days || []) {
      const start = new Date(monday); start.setDate(monday.getDate() + (day - 1)); start.setMinutes(s.start);
      const end = new Date(start); end.setMinutes(s.end || s.start + 60);
      lines.push("BEGIN:VEVENT",
        `UID:${s.classId}-${day}@columbia-planner`,
        `DTSTART:${icsDate(start)}`, `DTEND:${icsDate(end)}`,
        `SUMMARY:${s.code} ${s.title}`,
        s.location ? `LOCATION:${cleanLocation(s.location)}` : "",
        "END:VEVENT");
    }
  }
  for (const event of state.calendarEvents || []) {
    if (!calendarSourceVisible(event.source)) continue;
    if (event.allDay) {
      const startKey = event.date.replace(/-/g, "");
      const endKey = calendarDateKey(calendarAddDays(calendarFromKey(event.date), 1)).replace(/-/g, "");
      lines.push("BEGIN:VEVENT",
        `UID:${event.id}@columbia-planner`,
        `DTSTART;VALUE=DATE:${startKey}`,
        `DTEND;VALUE=DATE:${endKey}`,
        `SUMMARY:${event.title}`,
        event.location ? `LOCATION:${event.location}` : "",
        event.notes ? `DESCRIPTION:${event.notes}` : "",
        "END:VEVENT");
    } else {
      const start = calendarFromKey(event.date);
      start.setMinutes(event.start);
      const end = new Date(start);
      end.setMinutes(event.end);
      lines.push("BEGIN:VEVENT",
        `UID:${event.id}@columbia-planner`,
        `DTSTART:${icsDate(start)}`,
        `DTEND:${icsDate(end)}`,
        `SUMMARY:${event.title}`,
        event.location ? `LOCATION:${event.location}` : "",
        event.notes ? `DESCRIPTION:${event.notes}` : "",
        "END:VEVENT");
    }
  }
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `columbia-schedule-${state.term}.ics`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast("Exported .ics — includes courses and personal calendar events.");
}

/* ============================================================
 * 校园地图（Google Maps 真实卫星图 / 可选 Google 3D）
 * ============================================================ */
const MAP_CONFIG = {
  googleApiKey: "",
  googleMapId: "",
  center: { lat: 40.8077, lng: -73.9621 },
  zoom: 17,
  ...(window.COLUMBIA_MAPS || {}),
};
const MAP_DEFAULT_QUERY = "Columbia University, New York, NY";
let map3d = null;
let googleMapsPromise = null;
let mapMarkers = [];

function matchBuilding(location) {
  if (!location) return null;
  const loc = location.toLowerCase();
  return BUILDINGS.find((b) => b.keywords.some((k) => loc.includes(k.toLowerCase()))) || null;
}

function showLocation(location) {
  const b = matchBuilding(location);
  if (!b) return;
  closeModal();
  switchView("map");
  setTimeout(() => focusBuilding3D(b), 240);
}

function resolveMapTarget(value) {
  if (value && typeof value === "object" && Number.isFinite(value.lat) && Number.isFinite(value.lng)) return value;
  const query = String(value || "").trim().toLowerCase();
  if (!query) return {
    name: "Columbia University",
    lat: MAP_CONFIG.center.lat,
    lng: MAP_CONFIG.center.lng,
  };
  const matched = BUILDINGS.find((b) =>
    b.name.toLowerCase() === query
    || b.name.toLowerCase().includes(query)
    || b.keywords.some((k) => query.includes(k.toLowerCase()) || k.toLowerCase().includes(query))
  );
  return matched || {
    name: String(value || "Columbia University").trim(),
    lat: MAP_CONFIG.center.lat,
    lng: MAP_CONFIG.center.lng,
  };
}

function mapEmbedUrl(target) {
  const t = resolveMapTarget(target);
  const query = t?.name && t.name !== "Columbia University"
    ? `${t.name}, Columbia University, New York, NY`
    : MAP_DEFAULT_QUERY;
  const lat = t?.lat ?? MAP_CONFIG.center.lat;
  const lng = t?.lng ?? MAP_CONFIG.center.lng;
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&ll=${lat},${lng}&t=k&z=18&hl=en&output=embed`;
}

function updateMapLinks(target) {
  const t = resolveMapTarget(target);
  const lat = t?.lat ?? MAP_CONFIG.center.lat;
  const lng = t?.lng ?? MAP_CONFIG.center.lng;
  const name = t?.name || "Columbia University";
  const earth = $("#map-open-earth");
  const apple = $("#map-open-apple");
  if (earth) earth.href = `https://earth.google.com/web/@${lat},${lng},55a,720d,35y,0h,65t,0r`;
  if (apple) apple.href = `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(name)}&t=k`;
}

function initMapEmbed(host, target) {
  const t = resolveMapTarget(target);
  host.innerHTML = `<iframe
    class="map-embed-frame"
    src="${mapEmbedUrl(t)}"
    title="Google Maps satellite map of Columbia University"
    loading="eager"
    allowfullscreen
    referrerpolicy="no-referrer-when-downgrade"></iframe>`;
  const iframe = host.querySelector(".map-embed-frame");
  const loading = $("#map-loading");
  const fallback = $("#map-fallback");
  iframe?.addEventListener("load", () => {
    if (loading) loading.style.display = "none";
    if (fallback) fallback.hidden = true;
  });
  iframe?.addEventListener("error", () => {
    if (loading) loading.style.display = "none";
    if (fallback) fallback.hidden = false;
  });
  map3d = { mode: "embed", host, iframe, target: t };
  updateMapLinks(t);
}

function loadGoogleMaps() {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps);
  if (googleMapsPromise) return googleMapsPromise;
  googleMapsPromise = new Promise((resolve, reject) => {
    const callback = "__columbiaGoogleMapsReady";
    const timeout = window.setTimeout(() => reject(new Error("Google Maps timed out")), 12000);
    window[callback] = () => {
      window.clearTimeout(timeout);
      resolve(window.google.maps);
    };
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(MAP_CONFIG.googleApiKey)}&v=weekly&loading=async&callback=${callback}`;
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("Google Maps failed to load"));
    };
    document.head.appendChild(script);
  });
  return googleMapsPromise;
}

async function syncGoogleMapMarkers() {
  if (!map3d?.googleMap) return;
  mapMarkers.forEach((marker) => { marker.map = null; });
  mapMarkers = [];
  try {
    const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");
    const seen = new Set();
    for (const section of state.schedule) {
      const building = matchBuilding(section.location);
      if (!building || seen.has(building.name)) continue;
      seen.add(building.name);
      mapMarkers.push(new AdvancedMarkerElement({
        map: map3d.googleMap,
        position: { lat: building.lat, lng: building.lng },
        title: `${section.code} · ${building.name}`,
      }));
    }
  } catch {
    // Course locations remain available in the list below the map.
  }
}

async function initGoogleMap(host) {
  try {
    const maps = await loadGoogleMaps();
    const { Map } = await maps.importLibrary("maps");
    const googleMap = new Map(host, {
      center: MAP_CONFIG.center,
      zoom: MAP_CONFIG.zoom,
      mapId: MAP_CONFIG.googleMapId || "DEMO_MAP_ID",
      mapTypeId: "satellite",
      tilt: 67,
      heading: 0,
      gestureHandling: "greedy",
      streetViewControl: false,
      fullscreenControl: false,
    });
    map3d = { mode: "google", host, googleMap, target: resolveMapTarget() };
    const loading = $("#map-loading");
    if (loading) loading.style.display = "none";
    $("#map-fallback")?.setAttribute("hidden", "");
    updateMapLinks();
    refreshMapPins();
  } catch {
    initMapEmbed(host);
  }
}

function initMap() {
  if (!$("#map")) return;
  const loading = $("#map-loading");
  if (window.CAMPUS_MODEL_INITIALIZED && typeof window.renderCampusModel === "function") {
    if (loading) loading.hidden = true;
    map3d = { mode: "atlas" };
    updateMapLinks();
    refreshMapPins();
    return;
  }
  if (typeof window.renderCampusModel === "function") {
    if (loading) loading.style.display = "";
    map3d = { mode: "atlas" };
    window.renderCampusModel();
    updateMapLinks();
    onMapResize();
    refreshMapPins();
    return;
  }
  if (loading) loading.style.display = "none";
  const fallback = $("#map-fallback");
  if (fallback) fallback.hidden = false;
}

function onMapResize() {
  if (map3d?.googleMap) google.maps.event.trigger(map3d.googleMap, "resize");
}

function focusBuilding3D(value) {
  const target = resolveMapTarget(value);
  if (!map3d) initMap();
  updateMapLinks(target);
  if (map3d?.mode === "atlas" && typeof window.focusCampusModel === "function") {
    window.focusCampusModel(String(value || target.name));
    map3d.target = target;
    return;
  }
  if (map3d?.googleMap) {
    map3d.googleMap.panTo({ lat: target.lat, lng: target.lng });
    map3d.googleMap.setZoom(18);
    map3d.googleMap.setTilt?.(67);
    map3d.googleMap.setHeading?.(0);
    map3d.target = target;
  } else if (map3d?.iframe) {
    map3d.iframe.src = mapEmbedUrl(target);
    map3d.target = target;
  }
}

function refreshMapPins() {
  syncGoogleMapMarkers();
  renderMapList();
}

function renderMapList() {
  const list = $("#map-list");
  const located = state.schedule
    .map((s) => ({ s, b: matchBuilding(s.location) }))
    .filter((x) => x.b);
  const courseTargets = new Map();
  for (const { s, b } of located) {
    if (!courseTargets.has(b.name)) {
      courseTargets.set(b.name, { name: b.name, lat: b.lat, lng: b.lng, codes: [] });
    }
    courseTargets.get(b.name).codes.push(s.code);
  }
  window.updateCampusCourseTargets?.([...courseTargets.values()]);
  const count = $("#map-course-count");
  if (count) count.textContent = String(located.length);
  if (!state.schedule.length) {
    list.innerHTML = `<div class="notice info">No courses selected.</div>`;
    return;
  }
  list.innerHTML = state.schedule.map((s) => {
    const b = matchBuilding(s.location);
    return `<div class="cal-row">
      <div>
        <div class="cr-main">${esc(s.code)} · ${esc(s.title)}</div>
        <div class="cr-sub">${esc(cleanLocation(s.location) || "Location TBA")}${b ? " → " + esc(b.name) : ""}</div>
      </div>
      ${b ? `<button data-fly="${esc(b.name)}">View on map</button>` : ""}
    </div>`;
  }).join("");
  list.querySelectorAll("[data-fly]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const b = BUILDINGS.find((x) => x.name === btn.dataset.fly);
      if (b) focusBuilding3D(b);
    }));
}

/* ============================================================
 * 通用
 * ============================================================ */
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => (t.hidden = true), 2200);
}

const DATA_STATUS_POLL_MS = 5 * 60 * 1000;
let courseDataRefreshPromise = null;
let latestDataStatus = {};

function formatDataDate(value) {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "—";
  return new Date(`${text}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatSyncTime(value) {
  if (!value) return "";
  const source = String(value);
  const parsed = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(source)
    ? new Date(`${source}:00-05:00`)
    : new Date(source);
  if (Number.isNaN(parsed.getTime())) return source;
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function renderDataFreshness(status = latestDataStatus) {
  const host = $("#data-as-of");
  if (!host) return;
  latestDataStatus = status;
  const history = dailyHistoryForTerm() || window.ENROLL_HISTORY || {};
  const matchesActiveTerm = !status.term || status.term === state.term;
  const dataThrough = matchesActiveTerm
    ? status.dataThrough || history.latestDate || history.baseDate
    : history.latestDate || history.baseDate;
  const syncedAt = matchesActiveTerm
    ? status.lastSuccessfulSyncAt || status.snapshotUpdatedAt || history.updatedAt
    : history.updatedAt;
  const state = status.status || "ready";
  $("#data-as-of-date").textContent = formatDataDate(dataThrough);
  $("#data-as-of-time").textContent = state === "syncing"
    ? "Checking now…"
    : syncedAt ? `Synced ${formatSyncTime(syncedAt)}` : "Sync pending";
  host.classList.toggle("is-syncing", state === "syncing");
  host.classList.toggle("is-error", state === "error");
  host.classList.toggle("is-stale", state === "ready" && Boolean(status.lastError));
  host.title = state === "error"
    ? `Last sync failed: ${status.lastError || "unknown error"}`
    : `Source: ${status.source || "Columbia course data"} · refreshed hourly`;
  const hasNewData = matchesActiveTerm && Boolean(dataThrough && history.latestDate && dataThrough > history.latestDate);
  $(".data-as-of-cadence").textContent = matchesActiveTerm ? "Refreshed hourly" : "Historical snapshot";
  $("#data-as-of-refresh").hidden = !hasNewData;
}

function loadedCourseDataDate() {
  return state.courses.reduce((latest, course) => {
    const date = course.enrollLastDate || "";
    return date > latest ? date : latest;
  }, "");
}

async function refreshLoadedCourseData(status) {
  const incomingDate = status.dataThrough || "";
  if (
    status.status !== "ready" ||
    status.term !== state.term ||
    !incomingDate ||
    incomingDate <= loadedCourseDataDate()
  ) return false;
  if (courseDataRefreshPromise) return courseDataRefreshPromise;

  courseDataRefreshPromise = (async () => {
    try {
      const cacheKey = encodeURIComponent(status.lastSuccessfulSyncAt || incomingDate);
      const [coursesResponse, historyResponse] = await Promise.all([
        fetch(`data/courses-${state.term}.json?v=${cacheKey}`, { cache: "no-store" }),
        fetch(`data/enrollment-history/latest.js?v=${cacheKey}`, { cache: "no-store" }),
      ]);
      if (!coursesResponse.ok) throw new Error(`HTTP ${coursesResponse.status}`);
      const rows = await coursesResponse.json();
      if (!Array.isArray(rows) || !rows.length) throw new Error("Empty course dataset");

      COURSES_2027.splice(0, COURSES_2027.length, ...rows);
      TERM_DATA[state.term] = COURSES_2027;
      state.courses = COURSES_2027;
      groupedCache = null;
      sectionCache = null;

      if (historyResponse.ok) {
        const text = await historyResponse.text();
        const marker = text.indexOf("=");
        if (marker >= 0) {
          const history = JSON.parse(text.slice(marker + 1).trim().replace(/;\s*$/, ""));
          window.ENROLL_HISTORY = history;
          enrollHistoryCache.set(history.term, history);
        }
      }

      buildFilters();
      renderBrowse();
      renderPlanner();
      if (!$("#view-analysis").hidden) renderAnalysis();
      if (!$("#view-calendar").hidden) renderCalendar();
      if (!$("#modal").hidden && state.modalCourse?.code) {
        openCourse(state.modalCourse.code, state.modalCourse.sectionId);
      }
      document.fonts?.ready.then(fitCourseCardTitles);
      $("#data-as-of-refresh").hidden = true;
      toast(`Enrollment data updated to ${formatDataDate(incomingDate)}.`);
      return true;
    } catch (_) {
      $("#data-as-of-refresh").hidden = false;
      return false;
    } finally {
      courseDataRefreshPromise = null;
    }
  })();
  return courseDataRefreshPromise;
}

async function refreshDataFreshness() {
  try {
    let response = await fetch("/api/data-status", { cache: "no-store" });
    if (!response.ok) response = await fetch("data/sync-status.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const status = await response.json();
    latestDataStatus = status;
    renderDataFreshness(status);
    await refreshLoadedCourseData(status);
  } catch (_) {
    renderDataFreshness({ status: "ready", dataThrough: window.ENROLL_HISTORY?.latestDate });
  }
}

function bindDataFreshness() {
  renderDataFreshness();
  refreshDataFreshness();
  setInterval(refreshDataFreshness, DATA_STATUS_POLL_MS);
  $("#data-as-of-refresh")?.addEventListener("click", () => location.reload());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshDataFreshness();
  });
  document.querySelector(".nav")?.addEventListener("click", () => {
    setTimeout(refreshDataFreshness, 0);
  });
}

function closeCardAddMenus() {
  document.querySelectorAll(".card-add-menu.open").forEach((m) => {
    m.classList.remove("open");
    m.hidden = true;
  });
}

function setTermMenuOpen(open) {
  const menu = $("#term-menu");
  const btn = $("#term-menu-btn");
  if (!menu || !btn) return;
  clearTimeout(window._termMenuTimer);
  if (open) {
    menu.hidden = false;
    requestAnimationFrame(() => menu.classList.add("open"));
    btn.setAttribute("aria-expanded", "true");
  } else {
    menu.classList.remove("open");
    btn.setAttribute("aria-expanded", "false");
    window._termMenuTimer = setTimeout(() => {
      if (!menu.classList.contains("open")) menu.hidden = true;
    }, 180);
  }
}

/* ============================================================
 * 账户 / Google 登录
 * ============================================================ */
const AUTH_STORAGE_KEY = "cu-auth-user";

function loadAuthUser() {
  try { return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "null"); } catch { return null; }
}
function saveAuthUser(user) {
  try { localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user)); } catch { /* ignore */ }
}
function clearAuthUser() {
  try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch { /* ignore */ }
}

let authUser = loadAuthUser();
let googleScriptPromise = null;

function isColumbiaEmail(value) {
  return /^[^\s@]+@columbia\.edu$/i.test(String(value || "").trim());
}

if (authUser && !isColumbiaEmail(authUser.email || "")) {
  authUser = null;
  clearAuthUser();
}

function initialsOf(user) {
  const src = String((user && (user.name || user.email)) || "U").replace(/@.*/, "").trim();
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : src.slice(0, 2)).toUpperCase() || "U";
}

function renderRailBrand() {
  const btn = $("#topbar-account");
  if (!btn) return;
  if (authUser) {
    btn.classList.add("is-user");
    btn.title = authUser.email ? `${authUser.name || "Signed in"} · ${authUser.email}` : "Signed in";
    btn.setAttribute("aria-label", "Account");
    btn.innerHTML = authUser.picture
      ? `<img src="${esc(authUser.picture)}" alt="" referrerpolicy="no-referrer" />`
      : `<span class="topbar-initials">${esc(initialsOf(authUser))}</span>`;
  } else {
    btn.classList.remove("is-user");
    btn.title = "Sign in";
    btn.setAttribute("aria-label", "Sign in");
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-4 3.1-6 7-6s6.2 2 7 6"/></svg>`;
  }
}

function googleConfigured() {
  const id = window.COLUMBIA_AUTH && window.COLUMBIA_AUTH.googleClientId;
  return !!id && /^https?:$/.test(location.protocol);
}

function openAccount() {
  if (!authUser) {
    const next = `${location.pathname}${location.search}${location.hash}`;
    location.assign(`login.html?next=${encodeURIComponent(next)}`);
    return;
  }
  const modal = $("#account-modal");
  if (!modal) return;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  renderAccount();
}

function closeAccount() {
  const modal = $("#account-modal");
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = "";
}

function renderAccount() {
  const body = $("#account-body");
  if (!body) return;
  if (authUser) {
    const avatar = authUser.picture
      ? `<img src="${esc(authUser.picture)}" alt="" referrerpolicy="no-referrer" />`
      : `<span class="account-initials">${esc(initialsOf(authUser))}</span>`;
    body.innerHTML = `
      <div class="account-logo">CU</div>
      <h2 id="account-title">You're signed in</h2>
      <p>Your schedule, plan and preferences stay on this device.</p>
      <div class="account-user">
        ${avatar}
        <div>
          <div class="au-name">${esc(authUser.name || "Columbia student")}</div>
          <div class="au-email">${esc(authUser.email || "")}</div>
        </div>
      </div>
      <div class="account-actions">
        <button class="primary" type="button" id="account-done">Done</button>
        <button type="button" id="account-signout">Sign out</button>
      </div>
      <div class="account-status">${authUser.provider === "google" ? "Signed in with Google." : "Preview sign-in (Google OAuth not configured)."}</div>
    `;
    $("#account-signout")?.addEventListener("click", signOut);
    $("#account-done")?.addEventListener("click", closeAccount);
    return;
  }

  const configured = googleConfigured();
  const fileHint = location.protocol === "file:"
    ? "Google sign-in needs the site served over http(s). Run <b>node serve.mjs</b> and open http://localhost:8000, or use the local preview below."
    : "Add your Google OAuth Client ID in <b>data/auth-config.js</b> to enable the official Google button.";
  const googleFallback = `
    <button class="google-btn" type="button" id="google-demo">
      <svg class="google-g" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      </svg>
      Sign in with Google
    </button>`;
  body.innerHTML = `
    <div class="account-logo">CU</div>
    <h2 id="account-title">Sign in</h2>
    <p>Continue with your Google account to personalise the planner.</p>
    <div class="account-google" id="google-button">${configured ? "" : googleFallback}</div>
    <div class="account-hint">${fileHint}</div>
  `;
  if (configured) setupGoogleSignIn($("#google-button"));
  $("#google-demo")?.addEventListener("click", previewSignIn);
}

function previewSignIn() {
  const email = window.prompt("Enter your @columbia.edu email for preview sign-in:");
  if (email) localSignIn(email);
}

function localSignIn(email) {
  const clean = String(email || "").trim().toLowerCase();
  if (!isColumbiaEmail(clean)) {
    toast("Use a Columbia email ending in @columbia.edu.");
    return false;
  }
  const name = clean.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  authUser = { name, email: clean, picture: null, provider: "local" };
  saveAuthUser(authUser);
  renderRailBrand();
  renderAccount();
  toast(`Signed in as ${clean}`);
  return true;
}

function loadGoogleScript() {
  if (window.google && window.google.accounts && window.google.accounts.id) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;
  googleScriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("could not load Google Identity Services"));
    document.head.appendChild(s);
  });
  return googleScriptPromise;
}

async function setupGoogleSignIn(container) {
  if (!container) return;
  try {
    await loadGoogleScript();
    if (!window.google || !window.google.accounts || !window.google.accounts.id) {
      throw new Error("Google Identity Services unavailable");
    }
    window.google.accounts.id.initialize({
      client_id: window.COLUMBIA_AUTH.googleClientId,
      callback: handleGoogleCredential,
      auto_select: false,
      cancel_on_tap_outside: true,
      hd: "columbia.edu",
    });
    window.google.accounts.id.renderButton(container, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "signin_with",
      shape: "pill",
      logo_alignment: "left",
      width: 300,
    });
  } catch (err) {
    container.innerHTML = `<div class="account-hint">Google sign-in is unavailable: ${esc(err.message)}</div>`;
  }
}

function handleGoogleCredential(response) {
  try {
    let b64 = String(response.credential || "").split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    b64 += "=".repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(b64));
    if (!isColumbiaEmail(payload.email)) {
      authUser = null;
      clearAuthUser();
      renderRailBrand();
      toast("Use your @columbia.edu Google account.");
      return;
    }
    authUser = {
      name: payload.name,
      email: String(payload.email).toLowerCase(),
      picture: payload.picture,
      sub: payload.sub,
      provider: "google",
    };
    saveAuthUser(authUser);
    renderRailBrand();
    renderAccount();
    toast(`Signed in as ${authUser.email}`);
  } catch {
    toast("Google sign-in failed.");
  }
}

const GOOGLE_CALENDAR_CLIENT_KEY = "cu-google-calendar-client-id";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
let googleCalendarAccessToken = "";
let googleCalendarTokenExpiresAt = 0;
let googleCalendarTokenClient = null;
let googleCalendarTokenClientId = "";
let googleCalendarAuthResolve = null;
let googleCalendarAuthReject = null;

function googleCalendarClientId() {
  const configured = window.COLUMBIA_AUTH && window.COLUMBIA_AUTH.googleClientId;
  if (configured) return String(configured).trim();
  try { return String(localStorage.getItem(GOOGLE_CALENDAR_CLIENT_KEY) || "").trim(); } catch { return ""; }
}

function saveGoogleCalendarClientId(clientId) {
  try { localStorage.setItem(GOOGLE_CALENDAR_CLIENT_KEY, String(clientId || "").trim()); } catch {}
}

function googleCalendarTokenValid() {
  return Boolean(googleCalendarAccessToken && Date.now() < googleCalendarTokenExpiresAt);
}

function googleCalendarOriginReady() {
  return location.protocol === "http:" || location.protocol === "https:";
}

function renderGoogleCalendarDialog() {
  const clientId = googleCalendarClientId();
  const connected = state.googleCalendarConnected && googleCalendarTokenValid();
  const syncTime = state.googleCalendarSyncedAt
    ? new Date(state.googleCalendarSyncedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "Not synced yet";
  const origin = location.origin && location.origin !== "null" ? location.origin : "http://localhost:8000";
  $("#modal-body").innerHTML = `
    <div class="google-calendar-dialog">
      <div class="form-head">
        <div>
          <div class="form-kicker">Live integration</div>
          <h2>Google Calendar</h2>
        </div>
        <span class="google-calendar-status ${connected ? "connected" : ""}"><i></i>${connected ? "Connected" : "Not connected"}</span>
      </div>
      ${!googleCalendarOriginReady() ? `
        <div class="google-calendar-warning">
          Google OAuth requires an HTTP or HTTPS origin. Start the local server and open the planner at
          <b>http://localhost:8000</b>.
        </div>` : ""}
      ${state.googleCalendarError ? `<div class="google-calendar-warning">${esc(state.googleCalendarError)}</div>` : ""}
      <div class="google-calendar-account-card">
        <div class="google-calendar-mark">G</div>
        <div>
          <b>${connected ? "Primary calendar" : "Connect your primary calendar"}</b>
          <span>${connected ? `Last sync · ${esc(syncTime)}` : "Read and write your events through Google OAuth"}</span>
        </div>
      </div>
      ${!connected ? `
        <label class="google-calendar-client-field">
          OAuth Web Client ID
          <input id="google-calendar-client-id" value="${esc(clientId)}" placeholder="1234567890-abc.apps.googleusercontent.com" spellcheck="false" />
        </label>
        <div class="google-calendar-setup">
          <b>Google Cloud setup</b>
          <ol>
            <li>Enable <strong>Google Calendar API</strong>.</li>
            <li>Create an <strong>OAuth 2.0 Web application</strong> Client ID.</li>
            <li>Authorize JavaScript origin <code>${esc(origin)}</code>.</li>
            <li>Use scope <code>${esc(GOOGLE_CALENDAR_SCOPE)}</code>.</li>
          </ol>
        </div>
        <div class="form-actions">
          <button class="btn ghost" type="button" data-close-calendar-modal>Cancel</button>
          <button class="btn primary" type="button" id="google-calendar-connect">Connect Google Calendar</button>
        </div>` : `
        <div class="google-calendar-sync-help">
          New events created here are also saved to Google Calendar. Google events appear under
          <b>Other calendars → Google Calendar</b>.
        </div>
        <div class="form-actions google-calendar-actions">
          <button class="btn ghost" type="button" id="google-calendar-disconnect">Disconnect</button>
          <button class="btn ghost" type="button" id="google-calendar-open-browser">Open Google Calendar</button>
          <button class="btn primary" type="button" id="google-calendar-sync">Sync now</button>
        </div>`}
    </div>`;
  $("#modal").hidden = false;
  document.body.style.overflow = "hidden";
  document.querySelectorAll("[data-close-calendar-modal]").forEach((button) => button.addEventListener("click", closeModal));
  $("#google-calendar-connect")?.addEventListener("click", async () => {
    const input = $("#google-calendar-client-id");
    const nextClientId = String(input?.value || "").trim();
    if (!nextClientId || !nextClientId.endsWith(".apps.googleusercontent.com")) {
      toast("Paste a valid Google OAuth Web Client ID.");
      input?.focus();
      return;
    }
    saveGoogleCalendarClientId(nextClientId);
    await connectGoogleCalendar();
  });
  $("#google-calendar-sync")?.addEventListener("click", async () => {
    closeModal();
    await syncGoogleCalendar({ interactive: true });
  });
  $("#google-calendar-disconnect")?.addEventListener("click", () => {
    disconnectGoogleCalendar();
    closeModal();
  });
  $("#google-calendar-open-browser")?.addEventListener("click", () => {
    window.open("https://calendar.google.com/calendar/u/0/r/week", "_blank", "noopener");
  });
}

function openGoogleCalendarDialog() {
  renderGoogleCalendarDialog();
}

async function connectGoogleCalendar() {
  if (!googleCalendarOriginReady()) {
    toast("Google Calendar requires an http:// or https:// page.");
    renderGoogleCalendarDialog();
    return;
  }
  const clientId = googleCalendarClientId();
  if (!clientId) {
    toast("Add your Google OAuth Client ID first.");
    renderGoogleCalendarDialog();
    return;
  }
  state.googleCalendarError = "";
  state.googleCalendarLoading = true;
  try {
    await loadGoogleScript();
    if (!window.google?.accounts?.oauth2) throw new Error("Google Identity Services did not load.");
    if (!googleCalendarTokenClient || googleCalendarTokenClientId !== clientId) {
      googleCalendarTokenClientId = clientId;
      googleCalendarTokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: GOOGLE_CALENDAR_SCOPE,
        callback: (response) => {
          if (response.error) {
            googleCalendarAuthReject?.(new Error(response.error_description || response.error));
            googleCalendarAuthReject = null;
            googleCalendarAuthResolve = null;
            return;
          }
          googleCalendarAccessToken = response.access_token;
          const expiresIn = Number(response.expires_in) || 3300;
          googleCalendarTokenExpiresAt = Date.now() + Math.max(60, expiresIn - 60) * 1000;
          state.googleCalendarConnected = true;
          googleCalendarAuthResolve?.();
          googleCalendarAuthResolve = null;
          googleCalendarAuthReject = null;
        },
        error_callback: (error) => {
          googleCalendarAuthReject?.(new Error(error?.message || "Google authorization was cancelled."));
          googleCalendarAuthResolve = null;
          googleCalendarAuthReject = null;
        },
      });
    }
    await new Promise((resolve, reject) => {
      googleCalendarAuthResolve = resolve;
      googleCalendarAuthReject = reject;
      googleCalendarTokenClient.requestAccessToken({ prompt: "consent", login_hint: authUser?.email || "" });
    });
    closeModal();
    await syncGoogleCalendar({ interactive: true });
  } catch (error) {
    state.googleCalendarConnected = false;
    state.googleCalendarError = error.message || "Google Calendar connection failed.";
    toast(state.googleCalendarError);
    renderGoogleCalendarDialog();
  } finally {
    state.googleCalendarLoading = false;
    const bounds = calendarPeriodBounds();
    renderCalendarChrome(bounds.start, bounds.end);
  }
}

function disconnectGoogleCalendar() {
  if (googleCalendarAccessToken && window.google?.accounts?.oauth2?.revoke) {
    try { window.google.accounts.oauth2.revoke(googleCalendarAccessToken, () => {}); } catch {}
  }
  googleCalendarAccessToken = "";
  googleCalendarTokenExpiresAt = 0;
  state.googleCalendarConnected = false;
  state.googleCalendarEvents = [];
  state.googleCalendarSyncedAt = null;
  state.googleCalendarError = "";
  renderCalendar();
  toast("Google Calendar disconnected.");
}

async function googleCalendarRequest(path, options = {}) {
  if (!googleCalendarTokenValid()) throw new Error("Google Calendar authorization expired. Connect again.");
  const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${googleCalendarAccessToken}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  if (response.status === 401) {
    state.googleCalendarConnected = false;
    googleCalendarAccessToken = "";
    googleCalendarTokenExpiresAt = 0;
  }
  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = payload?.error?.message || "";
    } catch {}
    throw new Error(detail || `Google Calendar API error ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

function googleEventToCalendarEvent(item, calendarId = "primary") {
  const allDay = Boolean(item.start?.date);
  const startDate = allDay ? calendarFromKey(item.start.date) : new Date(item.start.dateTime);
  const endDate = allDay ? calendarFromKey(item.end.date) : new Date(item.end.dateTime);
  return {
    id: `google-${calendarId}-${item.id}`,
    kind: "google",
    source: "google",
    googleEventId: item.id,
    googleCalendarId: calendarId,
    googleRecurringEventId: item.recurringEventId || null,
    title: item.summary || "(No title)",
    date: calendarDateKey(startDate),
    start: allDay ? null : startDate.getHours() * 60 + startDate.getMinutes(),
    end: allDay ? null : endDate.getHours() * 60 + endDate.getMinutes(),
    allDay,
    location: item.location || "",
    notes: item.description || "",
    htmlLink: item.htmlLink || "https://calendar.google.com/",
  };
}

async function syncGoogleCalendar({ interactive = false } = {}) {
  if (!googleCalendarTokenValid()) {
    state.googleCalendarConnected = false;
    if (interactive) {
      openGoogleCalendarDialog();
      toast("Connect Google Calendar to sync.");
    }
    return;
  }
  state.googleCalendarLoading = true;
  state.googleCalendarError = "";
  renderCalendarChrome(...Object.values(calendarPeriodBounds()));
  try {
    const start = calendarAddDays(calendarStartOfWeek(new Date()), -21);
    const end = calendarAddDays(start, 210);
    const params = new URLSearchParams({
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      showDeleted: "false",
      maxResults: "2500",
    });
    const data = await googleCalendarRequest(`/calendars/primary/events?${params.toString()}`);
    const remoteEvents = [];
    for (const item of data.items || []) {
      if (item.status === "cancelled") continue;
      const mapped = googleEventToCalendarEvent(item);
      const plannerId = item.extendedProperties?.private?.columbiaPlannerEventId;
      if (plannerId) {
        const local = state.calendarEvents.find((event) => event.id === plannerId);
        if (local) {
          local.googleEventId = item.id;
          local.title = mapped.title;
          local.date = mapped.date;
          local.start = mapped.start;
          local.end = mapped.end;
          local.allDay = mapped.allDay;
          local.location = mapped.location;
          local.notes = mapped.notes;
          continue;
        }
      }
      remoteEvents.push(mapped);
    }
    saveCalendarEvents();
    state.googleCalendarEvents = remoteEvents;
    state.googleCalendarConnected = true;
    state.googleCalendarSyncedAt = Date.now();
    renderCalendar();
    toast(`Google Calendar synced · ${remoteEvents.length} events`);
  } catch (error) {
    state.googleCalendarError = error.message || "Google Calendar sync failed.";
    if (!googleCalendarTokenValid()) state.googleCalendarConnected = false;
    toast(state.googleCalendarError);
  } finally {
    state.googleCalendarLoading = false;
    if (!googleCalendarClientId() || !googleCalendarTokenValid()) renderCalendar();
    else {
      const bounds = calendarPeriodBounds();
      renderCalendarChrome(bounds.start, bounds.end);
    }
  }
}

function googleCalendarDateBody(event) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  if (event.allDay) {
    const start = calendarDateKey(calendarFromKey(event.date));
    const end = calendarDateKey(calendarAddDays(calendarFromKey(event.date), 1));
    return { start: { date: start }, end: { date: end } };
  }
  const start = calendarFromKey(event.date);
  start.setHours(Math.floor(event.start / 60), event.start % 60, 0, 0);
  const end = calendarFromKey(event.date);
  end.setHours(Math.floor(event.end / 60), event.end % 60, 0, 0);
  return {
    start: { dateTime: start.toISOString(), timeZone },
    end: { dateTime: end.toISOString(), timeZone },
  };
}

async function pushCalendarEventToGoogle(event) {
  if (!state.googleCalendarConnected || !googleCalendarTokenValid()) return event;
  const body = {
    summary: event.title,
    location: event.location || "",
    description: event.notes || "",
    ...googleCalendarDateBody(event),
    extendedProperties: { private: { columbiaPlannerEventId: event.id } },
  };
  const existingGoogleId = state.calendarEvents.find((item) => item.id === event.id)?.googleEventId;
  const result = await googleCalendarRequest(
    existingGoogleId
      ? `/calendars/primary/events/${encodeURIComponent(existingGoogleId)}`
      : "/calendars/primary/events",
    { method: existingGoogleId ? "PATCH" : "POST", body: JSON.stringify(body) },
  );
  return { ...event, googleEventId: result.id };
}

async function deleteGoogleCalendarEvent(event) {
  if (!event?.googleEventId || !state.googleCalendarConnected || !googleCalendarTokenValid()) return;
  await googleCalendarRequest(`/calendars/primary/events/${encodeURIComponent(event.googleEventId)}`, { method: "DELETE" });
}

function signOut() {
  authUser = null;
  clearAuthUser();
  if (window.google && window.google.accounts && window.google.accounts.id) {
    try { window.google.accounts.id.disableAutoSelect(); } catch { /* ignore */ }
  }
  renderRailBrand();
  renderAccount();
  toast("Signed out.");
}

/* ---------- Search suggestions ---------- */
let suggestItems = [];
let suggestActive = -1;

function normalizeSearchText(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function isSubsequence(needle, haystack) {
  if (!needle) return false;
  let i = 0;
  for (let j = 0; j < haystack.length && i < needle.length; j++) {
    if (haystack[j] === needle[i]) i++;
  }
  return i === needle.length;
}

function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function tokenMatches(token, hay, words) {
  if (!token) return false;
  if (hay.includes(token)) return true;
  if (token.length < 4) return false;
  const maxD = token.length >= 7 ? 2 : 1;
  return words.some((w) => Math.abs(w.length - token.length) <= maxD && editDistance(token, w) <= maxD);
}

function searchSuggestions(query) {
  const q = normalizeSearchText(query);
  if (!q) return { courses: [], departments: [], instructors: [] };
  const qTokens = q.split(" ").filter(Boolean);
  const qCompact = q.replace(/\s+/g, "");
  const sections = getSections();
  const courses = new Map();
  const departments = new Map();
  const instructors = new Map();
  for (const c of sections) {
    let info = courses.get(c.code);
    if (!info) {
      info = { code: c.code, title: c.title, sectionId: (c.section && c.section.classId) || "" };
      courses.set(c.code, info);
    }
    const inst = c.section && c.section.instructor;
    if (inst) {
      const current = instructors.get(inst) || { name: inst, sections: 0, departments: new Set() };
      current.sections++;
      current.departments.add(c.deptCode);
      instructors.set(inst, current);
    }
    if (c.deptCode) {
      const dept = departments.get(c.deptCode) || { code: c.deptCode, name: c.dept, courses: new Set() };
      dept.courses.add(c.code);
      departments.set(c.deptCode, dept);
    }
  }
  const courseOut = [];
  for (const info of courses.values()) {
    const codeN = normalizeSearchText(info.code);
    const titleN = normalizeSearchText(info.title);
    const hay = `${codeN} ${titleN}`;
    const words = hay.split(" ").filter(Boolean);
    const codeCompact = codeN.replace(/\s+/g, "");
    let score = -1;
    if (codeN.startsWith(q) || codeCompact.startsWith(qCompact)) score = 0;
    else if (codeN.includes(q) || codeCompact.includes(qCompact)) score = 1;
    else if (titleN.startsWith(q)) score = 2;
    else if (titleN.includes(q)) score = 3;
    else if (qTokens.every((t) => tokenMatches(t, hay, words))) score = 4;
    if (score >= 0) courseOut.push({ type: "course", label: info.code, sub: info.title, value: info.code, sectionId: info.sectionId, score });
  }
  const departmentOut = [];
  for (const dept of departments.values()) {
    const deptN = normalizeSearchText(`${dept.code} ${dept.name}`);
    const deptWords = deptN.split(" ").filter(Boolean);
    if (deptN.includes(q) || qTokens.every((token) => tokenMatches(token, deptN, deptWords))) {
      departmentOut.push({
        type: "department",
        label: dept.code,
        sub: `${titleCaseLabel(dept.name)} · ${dept.courses.size} courses`,
        value: dept.code,
        score: dept.code.toLowerCase().startsWith(q) ? 0 : 2,
      });
    }
  }
  const instructorOut = [];
  for (const instructor of instructors.values()) {
    const instN = normalizeSearchText(instructor.name);
    const instWords = instN.split(" ").filter(Boolean);
    if (instN.includes(q) || qTokens.every((t) => tokenMatches(t, instN, instWords))) {
      instructorOut.push({
        type: "instructor",
        label: instructor.name,
        sub: `${[...instructor.departments].sort().join(", ")} · ${instructor.sections} section${instructor.sections === 1 ? "" : "s"}`,
        value: instructor.name,
        score: instN.startsWith(q) ? 0 : 2,
      });
    }
  }
  const byScore = (a, b) => a.score - b.score || a.label.localeCompare(b.label);
  courseOut.sort(byScore);
  departmentOut.sort(byScore);
  instructorOut.sort(byScore);
  return {
    courses: courseOut.slice(0, 8),
    departments: departmentOut.slice(0, 6),
    instructors: instructorOut.slice(0, 8),
  };
}

function renderSearchSuggestions() {
  const box = $("#search-suggest");
  if (!box) return;
  const input = $("#search");
  const grouped = searchSuggestions(input ? input.value : "");
  suggestItems = [...grouped.courses, ...grouped.departments, ...grouped.instructors];
  suggestActive = -1;
  if (!suggestItems.length) { box.hidden = true; box.innerHTML = ""; return; }
  const group = (title, items, offset) => `
    <section class="search-suggest-col">
      <div class="search-suggest-heading"><span>${title}</span><small>${items.length}</small></div>
      ${items.length ? items.map((it, i) => `
        <button type="button" class="search-suggest-item" data-i="${offset + i}">
          <span class="ss-main">${esc(it.label)}</span>
          <span class="ss-sub">${esc(it.sub)}</span>
        </button>`).join("") : `<div class="search-suggest-empty">No matches</div>`}
    </section>`;
  const departmentOffset = grouped.courses.length;
  const instructorOffset = departmentOffset + grouped.departments.length;
  box.classList.add("search-suggest-grouped");
  box.innerHTML = `
    <div class="search-suggest-grid">
      ${group("Courses", grouped.courses, 0)}
      ${group("Departments", grouped.departments, departmentOffset)}
      ${group("Instructors", grouped.instructors, instructorOffset)}
    </div>
    <button type="button" class="search-suggest-all" data-search-all>
         <span>View combined results for “${esc(input ? input.value.trim() : "")}”</span>
         <span class="ss-type">Enter</span>
    </button>`;
  box.hidden = false;
}

function hideSearchSuggestions() {
  const box = $("#search-suggest");
  if (!box) return;
  box.hidden = true;
  box.innerHTML = "";
  suggestItems = [];
  suggestActive = -1;
}

function positionSearchCaret() {
  const input = $("#search");
  const caret = $("#search-caret");
  const host = input?.closest(".topbar-search");
  if (!input || !caret || !host) return;
  const shouldShow = !input.value && document.activeElement !== input;
  caret.hidden = !shouldShow;
  if (!shouldShow) return;
  const style = getComputedStyle(input);
  const canvas = positionSearchCaret.canvas || (positionSearchCaret.canvas = document.createElement("canvas"));
  const context = canvas.getContext("2d");
  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const textWidth = context.measureText(input.placeholder || "").width;
  const inputRect = input.getBoundingClientRect();
  const hostRect = host.getBoundingClientRect();
  caret.style.left = `${inputRect.left - hostRect.left + textWidth + 3}px`;
}

function updateSuggestActive() {
  const box = $("#search-suggest");
  if (!box) return;
  box.querySelectorAll(".search-suggest-item").forEach((el, i) => el.classList.toggle("active", i === suggestActive));
  box.querySelector(".search-suggest-item.active")?.scrollIntoView({ block: "nearest" });
}

function applySuggestion(it) {
  if (!it) return;
  if (it.type === "department") {
    openSearch("", { department: it.value });
  } else if (it.type === "instructor") {
    openInstructor(it.value);
  } else {
    openSearch(it.value);
  }
}

function bindGlobal() {
  const searchInput = $("#search");
  searchInput.addEventListener("input", () => {
    renderSearchSuggestions();
    positionSearchCaret();
  });
  searchInput.addEventListener("focus", () => {
    if (searchInput.value.trim()) renderSearchSuggestions();
    positionSearchCaret();
  });
  searchInput.addEventListener("blur", () => {
    setTimeout(hideSearchSuggestions, 140);
    requestAnimationFrame(positionSearchCaret);
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (suggestActive >= 0 && suggestItems[suggestActive]) applySuggestion(suggestItems[suggestActive]);
      else openSearch(searchInput.value);
      return;
    }
    if (e.key === "Escape") {
      hideSearchSuggestions();
      return;
    }
    if (!suggestItems.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      suggestActive = Math.min(suggestItems.length - 1, suggestActive + 1);
      updateSuggestActive();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      suggestActive = Math.max(0, suggestActive - 1);
      updateSuggestActive();
    }
  });
  $("#search-suggest")?.addEventListener("mousedown", (e) => {
    if (e.target.closest("[data-search-all]")) {
      e.preventDefault();
      openSearch(searchInput.value);
      return;
    }
    const b = e.target.closest(".search-suggest-item");
    if (!b) return;
    e.preventDefault();
    applySuggestion(suggestItems[Number(b.dataset.i)]);
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".topbar-search")) hideSearchSuggestions();
  });
  $("#analysis-search").addEventListener("input", renderAnalysis);
  $("#filter-toggle").addEventListener("click", (e) => {
    e.stopPropagation();
    const panel = $("#filter-panel");
    setFilterPanelOpen(panel ? panel.hidden : false);
  });
  $("#filter-close").addEventListener("click", () => setFilterPanelOpen(false));
  $("#filter-clear").addEventListener("click", () => {
    Object.assign(state.filters, {
      scope: "all",
      dept: "all",
      level: "all",
      campus: "all",
      method: "all",
      day: "all",
      sort: "default",
    });
    state.browsePage = 0;
    closeFilterMenus();
    buildFilters();
    renderBrowse();
  });
  $("#filters").addEventListener("click", (e) => {
    const btn = e.target.closest(".filter-dd-btn");
    if (btn) {
      const dd = btn.closest(".filter-dd");
      const wasOpen = dd.classList.contains("open");
      closeFilterMenus();
      if (!wasOpen) {
        dd.classList.add("open");
        const menu = dd.querySelector(".filter-dd-menu");
        if (menu) {
          menu.hidden = false;
          requestAnimationFrame(() => menu.querySelector(".filter-dd-input")?.focus());
        }
        btn.setAttribute("aria-expanded", "true");
      }
      return;
    }
    const opt = e.target.closest(".filter-dd-menu button");
    if (opt) {
      const dd = opt.closest(".filter-dd");
      state.filters[dd.dataset.filter] = opt.dataset.value;
      state.browsePage = 0;
      closeFilterMenus();
      buildFilters();
      renderBrowse();
    }
  });
  $("#filters").addEventListener("input", (e) => {
    const field = e.target.closest(".filter-dd-input");
    if (!field) return;
    const query = field.value.trim().toLowerCase();
    field.closest(".filter-dd")?.querySelectorAll(".filter-dd-option").forEach((option) => {
      option.hidden = !!query && !option.textContent.toLowerCase().includes(query);
    });
  });
  $("#filters").addEventListener("keydown", (e) => {
    const field = e.target.closest(".filter-dd-input");
    if (!field) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeFilterMenus();
      field.closest(".filter-dd")?.querySelector(".filter-dd-btn")?.focus();
      return;
    }
    if (e.key !== "Enter") return;
    const first = field.closest(".filter-dd")?.querySelector(".filter-dd-option:not([hidden])");
    if (!first) return;
    e.preventDefault();
    first.click();
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".filter-dd")) closeFilterMenus();
    if (!e.target.closest(".filter-panel") && !e.target.closest("#filter-toggle")) {
      setFilterPanelOpen(false);
    }
  });
  $("#term-menu-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    setTermMenuOpen(!$("#term-menu").classList.contains("open"));
  });
  $("#term-menu").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-term-option]");
    if (!b) return;
    const labelEl = $("#term-menu-label");
    labelEl?.classList.add("switching");
    setTermMenuOpen(false);
    setTimeout(() => {
      selectTerm(b.dataset.termOption);
      requestAnimationFrame(() => labelEl?.classList.remove("switching"));
    }, 120);
  });
  const joinCta = $("#floating-plan-cta");
  joinCta?.addEventListener("click", () => {
    const next = `${location.pathname}${location.search}${location.hash}`;
    location.assign(`login.html?next=${encodeURIComponent(next)}`);
  });
  $("#floating-plan-later")?.addEventListener("click", () => {
    const banner = $("#floating-cta-banner");
    if (!banner) return;
    banner.classList.add("is-dismissing");
    setTimeout(() => {
      banner.hidden = true;
      toast("No problem. We’ll leave your plan right here.");
    }, 160);
  });
  $("#rail-brand")?.addEventListener("click", () => switchView("browse"));
  $("#topbar-account")?.addEventListener("click", openAccount);
  $("#nav-back")?.addEventListener("click", () => goView(-1));
  $("#nav-forward")?.addEventListener("click", () => goView(1));
  $("#account-close")?.addEventListener("click", closeAccount);
  $("#account-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "account-modal") closeAccount();
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".analysis-term-wrap")) setTermMenuOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      setTermMenuOpen(false);
      setFilterPanelOpen(false);
    }
  });
  $("#load-more").addEventListener("click", () => { state.browsePage++; renderBrowse(); });
  $("#search-more")?.addEventListener("click", () => { state.searchPage++; renderSearchResults(); });
  const onCourseCardClick = (e) => {
    const card = e.target.closest(".course-card");
    if (!card) return;
    const dayBtn = e.target.closest("button[data-day-filter]");
    if (dayBtn) {
      e.stopPropagation();
      state.filters.day = dayBtn.dataset.dayFilter;
      state.browsePage = 0;
      switchView("browse");
      buildFilters();
      renderBrowse();
      toast(`Filtered by ${DAY_NAMES[Number(dayBtn.dataset.dayFilter) - 1]}`);
      return;
    }
    const inst = e.target.closest("button[data-instructor]");
    if (inst) {
      e.stopPropagation();
      openInstructor(inst.dataset.instructor);
      return;
    }
    const addBtn = e.target.closest(".card-add");
    if (addBtn) {
      e.stopPropagation();
      const menu = addBtn.parentElement.querySelector(".card-add-menu");
      const willOpen = menu && menu.hidden;
      closeCardAddMenus();
      if (willOpen) {
        menu.hidden = false;
        menu.classList.add("open");
      }
      return;
    }
    const btn = e.target.closest("button[data-act]");
    if (btn) {
      e.stopPropagation();
      if (btn.dataset.act === "cal") addSectionsToSchedule(card.dataset.code, card.dataset.section);
      if (btn.dataset.act === "plan") addToPlan(card.dataset.code);
      closeCardAddMenus();
      return;
    }
    openCourse(card.dataset.code, card.dataset.section);
  };
  $("#course-list").addEventListener("click", onCourseCardClick);
  $("#search-results").addEventListener("click", onCourseCardClick);
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".card-add-wrap")) closeCardAddMenus();
  });
  $("#modal-close").addEventListener("click", closeModal);
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeModal(); closeAccount(); }
  });

  $("#term-select").addEventListener("change", updateHistoryLinks);
  $("#load-term").addEventListener("click", loadTerm);
  $("#load-enroll").addEventListener("click", loadEnrollmentForTerm);
  $("#add-term").addEventListener("click", addCustomTerm);
  $("#new-term").addEventListener("keydown", (e) => { if (e.key === "Enter") addCustomTerm(); });

  $(".analysis-stat-controls").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-sort]");
    if (!b) return;
    analysisSort = b.dataset.sort;
    renderAnalysis();
  });
  $("#analysis-list").addEventListener("click", (e) => {
    const row = e.target.closest(".analysis-row");
    if (row) openCourse(row.dataset.code, row.dataset.section);
  });

  $("#plan-template-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    setPlanTemplateMenuOpen(!$("#plan-template-menu").classList.contains("open"));
  });
  $("#plan-template-menu")?.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-plan-template]");
    if (!b) return;
    state.planTemplate = b.dataset.planTemplate;
    setPlanTemplateMenuOpen(false);
    renderPlanTemplateMenu();
    renderProgress();
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".plan-template-select")) setPlanTemplateMenuOpen(false);
  });
  $("#plan-print-receipt")?.addEventListener("click", openPlanReceiptPreview);
  $("#graph-run").addEventListener("click", () => drawGraph($("#graph-input").value));
  $("#graph-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") drawGraph(e.target.value);
  });

  $("#ics-export").addEventListener("click", exportICS);
  $("#gcal-open").addEventListener("click", openGoogleCalendarDialog);
  $("#calendar-share-code")?.addEventListener("click", openCalendarShareDialog);
  $("#map-search").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const q = e.target.value.trim();
    if (!q) return;
    focusBuilding3D(q);
    toast(`Showing ${q} on the map`);
  });
  const titleTip = $("#course-title-tip");
  const hideTitleTip = () => { if (titleTip) titleTip.hidden = true; };
  const moveTitleTip = (e) => {
    if (!titleTip || titleTip.hidden) return;
    const margin = 12;
    const left = Math.max(margin, Math.min(e.clientX + 14, window.innerWidth - titleTip.offsetWidth - margin));
    const above = e.clientY + 20 + titleTip.offsetHeight > window.innerHeight;
    const top = above ? e.clientY - titleTip.offsetHeight - 14 : e.clientY + 20;
    titleTip.style.left = `${left}px`;
    titleTip.style.top = `${Math.max(margin, top)}px`;
  };
  document.addEventListener("pointerover", (e) => {
    const title = e.target.closest(".cc-title[data-full-title]");
    if (!title || title.scrollWidth <= title.clientWidth + 1) {
      hideTitleTip();
      return;
    }
    titleTip.textContent = title.dataset.fullTitle;
    titleTip.hidden = false;
    moveTitleTip(e);
  });
  document.addEventListener("pointermove", (e) => {
    if (e.target.closest(".cc-title[data-full-title]")) moveTitleTip(e);
    else hideTitleTip();
  });
  document.addEventListener("pointerout", (e) => {
    if (e.target.closest(".cc-title[data-full-title]")) hideTitleTip();
  });
  window.addEventListener("scroll", hideTitleTip, { passive: true });
  window.addEventListener("resize", fitCourseCardTitles);
  window.addEventListener("resize", positionSearchCaret);
  window.addEventListener("resize", scheduleStampCardLayout);
  requestAnimationFrame(positionSearchCaret);
}

function startIntro() {
  const splash = $("#intro-splash");
  if (!splash) return;
  const app = $(".app-shell");
  if (document.documentElement.classList.contains("intro-skip")) {
    splash.remove();
    return;
  }
  history.scrollRestoration = "manual";
  window.scrollTo(0, 0);
  if (app) app.inert = true;
  document.documentElement.classList.add("intro-running");

  const tileRoot = $("#intro-tiles");
  const wordTileRoot = $("#intro-word-tiles");
  const wordFill = $("#intro-word-fill");
  const images = [
    "assets/intro-columbia/columbia-50.jpg",
    "assets/intro-columbia/columbia-49.jpg",
    "assets/intro-columbia/columbia-03.jpg",
    "assets/intro-columbia/columbia-18.jpg",
    "assets/intro-columbia/columbia-47.jpg",
    "assets/intro-columbia/columbia-01.jpg",
    "assets/intro-columbia/columbia-23.jpg",
    "assets/intro-columbia/columbia-46.jpg",
    "assets/intro-columbia/columbia-34.jpg",
    "assets/intro-columbia/columbia-09.jpg",
    "assets/intro-columbia/columbia-29.jpg",
    "assets/intro-columbia/columbia-31.jpg",
    "assets/intro-columbia/columbia-40.jpg",
    "assets/intro-columbia/columbia-05.jpg",
    "assets/intro-columbia/columbia-20.jpg",
    "assets/intro-columbia/columbia-11.jpg",
    "assets/intro-columbia/columbia-38.jpg",
    "assets/intro-columbia/columbia-45.jpg",
    "assets/intro-columbia/columbia-41.jpg",
    "assets/intro-columbia/columbia-16.jpg",
    "assets/intro-columbia/columbia-44.jpg",
    "assets/intro-columbia/columbia-06.jpg",
    "assets/intro-columbia/columbia-51.jpg",
    "assets/intro-columbia/columbia-42.jpg",
    "assets/intro-columbia/columbia-12.jpg",
    "assets/intro-columbia/columbia-36.jpg",
    "assets/intro-columbia/columbia-39.jpg",
    "assets/intro-columbia/columbia-13.jpg",
    "assets/intro-columbia/columbia-48.jpg",
    "assets/intro-columbia/columbia-02.jpg",
    "assets/intro-columbia/columbia-43.jpg",
    "assets/intro-columbia/columbia-21.jpg",
    "assets/intro-columbia/columbia-37.jpg",
    "assets/intro-columbia/columbia-07.jpg",
    "assets/intro-columbia/columbia-35.jpg",
    "assets/intro-columbia/columbia-22.jpg",
    "assets/intro-columbia/columbia-04.jpg",
    "assets/intro-columbia/columbia-32.jpg",
    "assets/intro-columbia/columbia-19.jpg",
    "assets/intro-columbia/columbia-17.jpg",
    "assets/intro-columbia/columbia-14.jpg",
    "assets/intro-columbia/columbia-28.jpg",
    "assets/intro-columbia/columbia-08.jpg",
    "assets/intro-columbia/columbia-10.jpg",
    "assets/intro-columbia/columbia-26.jpg",
  ];
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const smooth = (value) => {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const easeOutCubic = (value) => 1 - Math.pow(1 - clamp(value, 0, 1), 3);
  const duration = 10400;
  let tiles = [];
  let frame = 0;
  let introComplete = false;
  let lastProgress = 0;

  const buildTiles = () => {
    const compact = innerWidth <= 700;
    const cols = compact ? 5 : 9;
    const rows = compact ? 9 : 5;
    tileRoot.innerHTML = "";
    wordTileRoot.innerHTML = "";
    tiles = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const index = row * cols + col;
        const tile = document.createElement("div");
        tile.className = "intro-tile";
        tile.style.left = `${(col * 100) / cols}%`;
        tile.style.top = `${(row * 100) / rows}%`;
        tile.style.width = `${100 / cols}%`;
        tile.style.height = `${100 / rows}%`;
        tile.style.backgroundImage = `url("${images[index % images.length]}")`;
        tile.style.backgroundPosition = `${20 + (index * 17) % 60}% ${20 + (index * 23) % 60}%`;
        tileRoot.appendChild(tile);
        const wordTile = tile.cloneNode();
        wordTileRoot.appendChild(wordTile);
        const targetX = (col + 0.5) * (innerWidth / cols);
        const targetY = (row + 0.5) * (innerHeight / rows);
        const seedRatio = ((index * 37) % (cols * rows)) / Math.max(1, cols * rows - 1);
        const seedX = innerWidth * (0.075 + seedRatio * 0.85);
        const seedY = innerHeight * (0.47 + ((index * 11) % 5 - 2) * 0.032);
        const dx = seedX - targetX;
        const dy = seedY - targetY;
        tiles.push({
          tile,
          wordTile,
          dx,
          dy,
          delay: seedRatio * 0.13 + row * 0.008,
          rotation: (index % 7 - 3) * 0.45,
          rotateX: (index % 5 - 2) * 7.5,
          rotateY: (Math.floor(index / cols) % 4 - 1.5) * 7,
        });
      }
    }
  };

  const finishIntro = () => {
    if (introComplete) return;
    introComplete = true;
    if (frame) cancelAnimationFrame(frame);
    splash.style.opacity = "0";
    splash.style.pointerEvents = "none";
    if (app) app.inert = false;
    document.documentElement.classList.remove("intro-running");
    try { sessionStorage.setItem("ma-auto-intro-v6", "1"); } catch {}
    setTimeout(() => splash.remove(), 0);
  };

  const render = (progress) => {
    lastProgress = clamp(progress, 0, 1);
    const letterProgress = smooth((lastProgress - 0.56) / 0.14);
    const whiteProgress = smooth((lastProgress - 0.69) / 0.07);
    tileRoot.style.opacity = String(1 - letterProgress);
    wordTileRoot.style.opacity = String(letterProgress);
    wordFill.style.opacity = String(whiteProgress);

    tiles.forEach(({ tile, wordTile, dx, dy, delay, rotation, rotateX, rotateY }) => {
      const appear = easeOutCubic((lastProgress - 0.035 - delay) / 0.58);
      const scale = 0.1 + appear * 0.9;
      const transform = `perspective(900px) translate3d(${dx * (1 - appear)}px, ${dy * (1 - appear)}px, 0) rotateX(${rotateX * (1 - appear)}deg) rotateY(${rotateY * (1 - appear)}deg) rotate(${rotation * (1 - appear)}deg) scale(${scale})`;
      tile.style.transform = transform;
      wordTile.style.transform = transform;
      tile.style.opacity = String(clamp(appear * 4, 0, 1));
      wordTile.style.opacity = tile.style.opacity;
    });

    const veil = 1 - smooth((lastProgress - 0.93) / 0.07);
    splash.style.opacity = String(veil);
    splash.style.pointerEvents = veil < 0.02 ? "none" : "auto";
    if (app) app.inert = veil >= 0.02;

    if (lastProgress >= 1) finishIntro();
  };

  const animate = (now) => {
    const progress = clamp((now - startedAt) / duration, 0, 1);
    render(progress);
    if (progress < 1) frame = requestAnimationFrame(animate);
  };

  buildTiles();
  render(0);
  let startedAt = performance.now();
  frame = requestAnimationFrame(animate);
  addEventListener("resize", () => {
    buildTiles();
    render(lastProgress);
  });
  splash.addEventListener("click", finishIntro, { once: true });
}

function init() {
  loadCustomTerms();
  document.body.classList.remove("sidebar-collapsed");
  let pendingSavedTerm = null;
  const savedTerm = readSavedTerm();
  if (savedTerm && SEMESTERS.some((s) => s.term === savedTerm)) {
    if (TERM_DATA[savedTerm] && TERM_DATA[savedTerm].length) {
      state.term = savedTerm;
      state.courses = TERM_DATA[savedTerm];
    } else {
      state.term = savedTerm;
      state.courses = [];
      pendingSavedTerm = savedTerm;
    }
  }
  buildNav();
  renderRailBrand();
  renderTermSwitch();
  buildFilters();
  renderBrowse();
  renderHistory();
  renderPlanner();
  bindCalendarFeature();
  renderCalendar();
  if (googleCalendarClientId()) loadGoogleScript().catch(() => {});
  renderTaken();
  bindGlobal();
  bindDataFreshness();
  // 预填一个示例：便于演示推荐
  if (!state.taken.length) {
    state.taken = ["COMS W1004"];
    renderTaken();
  }
  const rawHash = (location.hash || "").replace(/^#\/?/, "");
  const [initialView, queryStr] = rawHash.split("?");
  let initial = NAV.some(([id]) => id === initialView) ? initialView : "browse";
  if (initialView === "search") {
    const params = new URLSearchParams(queryStr || "");
    state.searchQuery = params.get("q") || "";
    state.searchDepartment = params.get("dept") || "all";
    state.searchInstructor = params.get("instructor") || "";
    initial = "search";
  }
  if (initialView.startsWith("instructor/")) {
    try {
      state.instructorName = decodeURIComponent(initialView.slice("instructor/".length));
      initial = "instructor";
    } catch {
      state.instructorName = "";
    }
  }
  switchView(initial);
  fitCourseCardTitles();
  document.fonts?.ready.then(fitCourseCardTitles);
  document.fonts?.ready.then(positionSearchCaret);
  if (pendingSavedTerm) selectTerm(pendingSavedTerm);
  if (queryStr) {
    const params = new URLSearchParams(queryStr);
    const qTerm = params.get("term");
    if (qTerm && TERM_DATA[qTerm]) setTerm(qTerm);
    const course = params.get("course");
    const section = params.get("section") || "";
    if (course) setTimeout(() => openCourse(course, section), 120);
  }
}

document.addEventListener("DOMContentLoaded", init);
