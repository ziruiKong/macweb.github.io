import fs from "node:fs";
import path from "node:path";

const OFFICIAL_BASE = "https://doc.sis.columbia.edu/subj";
const REQUEST_HEADERS = {
  "User-Agent": "columbia-course-planner/1.0 (hourly academic-data refresh)",
  Accept: "text/html",
};

function termFolder(term) {
  const match = String(term || "").match(/^(\d{4})-(Spring|Summer|Fall)$/);
  if (!match) throw new Error(`Unsupported term: ${term}`);
  return `_${match[2]}${match[1]}.html`;
}

function parseDate(text) {
  const value = String(text || "").trim();
  const clean = value.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/i)?.[0];
  if (!clean) return null;
  const parsed = new Date(`${clean} 12:00:00 UTC`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function parseSisUpdate(html) {
  const match = html.match(/SIS update\s+(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/i);
  if (!match) return null;
  const [, month, day, year, hour, minute] = match;
  return new Date(`20${year}-${month}-${day}T${hour}:${minute}:00-05:00`).toISOString();
}

export function parseSubjectPage(html) {
  const records = new Map();
  const blockPattern = /<div class="course-details"><dl>([\s\S]*?)<\/dl><\/div>/gi;
  let block;
  while ((block = blockPattern.exec(html))) {
    const body = block[1];
    const call = body.match(/Call Number:<\/dt><dd>([^<]+)<\/dd>/i)?.[1]?.trim();
    const enrollment = body.match(
      /Enrollment:<\/dt><dd>(\d+)\s+students(?:\s+\((\d+)\s+max\))?\s+as of\s+([^<]+)<\/dd>/i,
    );
    if (!call || !enrollment) continue;
    const date = parseDate(enrollment[3]);
    if (!date) continue;
    records.set(call, {
      callNumber: call,
      enrolled: Number(enrollment[1]),
      capacity: enrollment[2] == null ? null : Number(enrollment[2]),
      date,
    });
  }
  return { records, sisUpdatedAt: parseSisUpdate(html) };
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function nyNow() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date()).replace(",", "");
}

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function compactHistory(history) {
  const recent = history.days.slice(-45).map((day) => ({
    date: day.date,
    totalEnrolled: day.totalEnrolled,
    totalCapacity: day.totalCapacity,
    netChange: day.netChange,
    added: day.added,
    dropped: day.dropped,
    changedSections: day.changedSections,
    top: Object.entries(day.changes || {})
      .filter(([, change]) => change.de !== 0)
      .sort((a, b) => Math.abs(b[1].de) - Math.abs(a[1].de))
      .slice(0, 30)
      .map(([callNumber, change]) => ({
        call: callNumber,
        code: change.code,
        de: change.de,
        e: change.e,
      })),
  }));
  const latest = history.days.at(-1);
  return {
    term: history.term,
    updatedAt: history.updatedAt,
    registrationStart: history.registrationStart,
    classesStart: history.classesStart,
    dropDeadline: history.dropDeadline,
    lastDataDate: history.lastDataDate,
    baseDate: history.base.date,
    latestDate: latest?.date || history.base.date,
    complete: Boolean(history.dropDeadline && latest?.date >= history.dropDeadline),
    summary: history.summary,
    recent,
  };
}

function appendOfficialDay(history, courses, officialByCall, officialDate) {
  const currentDayIndex = history.days.findIndex((day) => day.date === officialDate);
  const previous = currentDayIndex > 0
    ? history.days[currentDayIndex - 1]
    : currentDayIndex === 0 ? null : history.days.at(-1);
  if (!previous) throw new Error(`No baseline day before ${officialDate}`);

  const changes = {};
  const deptChanges = {};
  let added = 0;
  let dropped = 0;
  let enrolledDelta = 0;
  let capacityDelta = 0;
  let matched = 0;

  for (const course of courses) {
    const official = officialByCall.get(String(course.callNumber || ""));
    if (!official) continue;
    matched++;
    const priorPoint = [...(course.enrollSeries || [])]
      .reverse()
      .find(([date]) => date < official.date);
    const priorEnrolled = priorPoint ? priorPoint[1] : (course.enrolled || 0);
    const priorCapacity = course.capacity ?? null;
    const enrolledChange = official.enrolled - priorEnrolled;
    const capacityChange = official.capacity == null || priorCapacity == null
      ? 0
      : official.capacity - priorCapacity;
    enrolledDelta += enrolledChange;
    capacityDelta += capacityChange;
    if (enrolledChange > 0) added += enrolledChange;
    if (enrolledChange < 0) dropped += -enrolledChange;

    const series = (course.enrollSeries || []).filter(([date]) => date !== official.date);
    series.push([official.date, official.enrolled]);
    series.sort((a, b) => a[0].localeCompare(b[0]));
    course.enrolled = official.enrolled;
    course.capacity = official.capacity;
    course.enrollSeries = series;
    course.enrollLastDate = official.date;

    if (!enrolledChange && !capacityChange) continue;
    changes[course.callNumber] = {
      code: course.code,
      de: enrolledChange,
      dc: capacityChange,
      e: official.enrolled,
      c: official.capacity,
    };
    const dept = String(course.code || "").trim().split(/\s+/)[0].toUpperCase();
    if (!dept) continue;
    const summary = deptChanges[dept] || (deptChanges[dept] = {
      added: 0,
      dropped: 0,
      netChange: 0,
      capacityChange: 0,
      changedSections: 0,
    });
    if (enrolledChange > 0) summary.added += enrolledChange;
    if (enrolledChange < 0) summary.dropped += -enrolledChange;
    summary.netChange += enrolledChange;
    summary.capacityChange += capacityChange;
    summary.changedSections++;
  }

  if (!matched) throw new Error("Official pages did not match any local sections");
  const depts = {};
  for (const [dept, values] of Object.entries(previous.depts || {})) {
    const change = deptChanges[dept] || {};
    depts[dept] = {
      totalEnrolled: values.totalEnrolled + (change.netChange || 0),
      totalCapacity: values.totalCapacity + (change.capacityChange || 0),
      added: change.added || 0,
      dropped: change.dropped || 0,
      netChange: change.netChange || 0,
      changedSections: change.changedSections || 0,
    };
  }

  const entry = {
    date: officialDate,
    sourceDate: officialDate,
    totalEnrolled: previous.totalEnrolled + enrolledDelta,
    totalCapacity: previous.totalCapacity + capacityDelta,
    netChange: added - dropped,
    added,
    dropped,
    changedSections: Object.keys(changes).length,
    newSections: 0,
    depts,
    changes,
  };
  if (currentDayIndex >= 0) history.days[currentDayIndex] = entry;
  else history.days.push(entry);
  history.days.sort((a, b) => a.date.localeCompare(b.date));
  history.summary = history.days.map(({ changes: _changes, ...summary }) => summary);
  history.lastDataDate = officialDate;
  history.updatedAt = nyNow();
  return { matched, changedSections: entry.changedSections, netChange: entry.netChange };
}

export async function refreshOfficialEnrollment({
  term,
  coursesPath,
  historyDir,
  concurrency = 1,
}) {
  const courses = JSON.parse(fs.readFileSync(coursesPath, "utf8"));
  const subjects = [...new Set(courses.map((course) => course.deptCode).filter(Boolean))];
  const page = termFolder(term);
  const errors = [];
  const officialByCall = new Map();
  let latestDate = "";
  let sisUpdatedAt = "";

  const pages = await mapLimit(subjects, concurrency, async (subject) => {
    const url = `${OFFICIAL_BASE}/${encodeURIComponent(subject)}/${page}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 40));
        const response = await fetch(url, { headers: REQUEST_HEADERS });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const parsed = parseSubjectPage(await response.text());
        if (!parsed.records.size) throw new Error("No enrollment rows returned");
        return { subject, ...parsed };
      } catch (error) {
        if (attempt === 1) {
          errors.push(`${subject}: ${error.message}`);
          return { subject, records: new Map(), sisUpdatedAt: null };
        }
      }
    }
    return { subject, records: new Map(), sisUpdatedAt: null };
  });

  for (const result of pages) {
    if (result.sisUpdatedAt && result.sisUpdatedAt > sisUpdatedAt) sisUpdatedAt = result.sisUpdatedAt;
    for (const [callNumber, record] of result.records) {
      officialByCall.set(callNumber, record);
      if (record.date > latestDate) latestDate = record.date;
    }
  }
  console.log(
    `Official subject pages: ${pages.filter((result) => result.records.size).length}/${subjects.length}; ` +
    `${officialByCall.size} unique sections parsed.` +
    (pages.some((result) => !result.records.size)
      ? ` Empty page(s): ${pages.filter((result) => !result.records.size).map((result) => result.subject).join(", ")}`
      : ""),
  );
  if (!officialByCall.size || !latestDate) {
    throw new Error(`Official Directory refresh failed: ${errors.slice(0, 4).join("; ")}`);
  }

  const historyPath = path.join(historyDir, `${term}.json`);
  const history = JSON.parse(fs.readFileSync(historyPath, "utf8"));
  const result = appendOfficialDay(history, courses, officialByCall, latestDate);
  const unmatched = courses
    .filter((course) => !officialByCall.has(String(course.callNumber || "")))
    .slice(0, 8)
    .map((course) => course.callNumber);
  console.log(
    `Official matching: ${result.matched}/${courses.length}` +
    (unmatched.length ? `; unmatched examples: ${unmatched.join(", ")}` : ""),
  );
  const compact = compactHistory(history);

  writeFile(coursesPath, JSON.stringify(courses));
  writeFile(
    coursesPath.replace(/\.json$/, ".js"),
    `window.COURSES_${term.replace(/-/g, "_").toUpperCase()} = ${JSON.stringify(courses)};`,
  );
  writeFile(historyPath, JSON.stringify(history));
  writeFile(
    historyPath.replace(/\.json$/, ".js"),
    `window.ENROLL_HISTORY = ${JSON.stringify(compact)};`,
  );
  writeFile(path.join(historyDir, "latest.js"), `window.ENROLL_HISTORY = ${JSON.stringify(compact)};`);
  writeFile(
    historyPath.replace(/\.json$/, "-summary.csv"),
    ["date,totalEnrolled,totalCapacity,netChange,added,dropped,changedSections,newSections"]
      .concat(history.days.map((day) => [
        day.date,
        day.totalEnrolled,
        day.totalCapacity,
        day.netChange,
        day.added,
        day.dropped,
        day.changedSections,
        day.newSections,
      ].join(",")))
      .join("\n"),
  );

  return {
    ...result,
    dataThrough: latestDate,
    officialUpdatedAt: sisUpdatedAt || null,
    subjectsRequested: subjects.length,
    subjectsUpdated: pages.filter((pageResult) => pageResult.records.size).length,
    subjectErrors: errors,
    totalSections: courses.length,
    compact,
  };
}
