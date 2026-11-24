#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const COURSE_FILE = path.join(ROOT, "data", "courses-2027-Spring.js");
const OUTPUT_FILE = path.join(ROOT, "data", "culpa-reviews.json");
const CONCURRENCY = 4;

function loadCourseCodes() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(COURSE_FILE, "utf8"), context);
  const courses = context.window.COURSES_2027_SPRING || context.window.COURSES_2027 || [];
  return {
    codes: [...new Set(courses.map((course) => String(course.code || "").trim().toUpperCase()).filter(Boolean))],
    prefixes: [...new Set(courses.map((course) => String(course.code || "").trim().split(/\s+/)[0]).filter(Boolean))],
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "antivergil-course-planner/1.0",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function mapLimit(items, limit, worker) {
  let index = 0;
  const results = [];
  async function run() {
    while (index < items.length) {
      const current = index++;
      try {
        results[current] = await worker(items[current], current);
      } catch (error) {
        results[current] = { error: error.message, source: items[current] };
      }
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function main() {
  const { codes, prefixes } = loadCourseCodes();
  const known = new Set(codes);
  const matches = new Map();
  const searches = await mapLimit(prefixes, 3, async (prefix) => {
    const results = await fetchJson(`https://culpa.info/api/course/search?queryString=${encodeURIComponent(prefix)}&maxResults=1000`);
    for (const result of results || []) {
      const header = result?.course_header;
      const code = String(header?.course_code || "").trim().toUpperCase();
      if (header?.course_id && known.has(code)) matches.set(code, header);
    }
    return prefix;
  });

  const entries = [...matches.entries()];
  const courseResults = await mapLimit(entries, CONCURRENCY, async ([code, header]) => {
    const courseId = header.course_id;
    const [card, reviews] = await Promise.all([
      fetchJson(`https://culpa.info/api/course_page/card/${courseId}`),
      fetchJson(`https://culpa.info/api/review/course/${courseId}?page=1&sort_key=recent`),
    ]);
    return [code, {
      ok: true,
      code,
      courseId,
      courseName: header.course_name,
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
    }];
  });

  const courses = {};
  for (const result of courseResults) {
    if (!Array.isArray(result)) continue;
    courses[result[0]] = result[1];
  }
  const output = {
    updatedAt: new Date().toISOString(),
    term: "2027-Spring",
    searchedPrefixes: searches.filter((item) => typeof item === "string").length,
    matchedCourses: Object.keys(courses).length,
    courses,
  };
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  const temp = `${OUTPUT_FILE}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(output, null, 2)}\n`);
  fs.copyFileSync(temp, OUTPUT_FILE);
  fs.unlinkSync(temp);
  console.log(`CULPA cache complete: ${output.matchedCourses} courses from ${prefixes.length} prefixes.`);
}

main().catch((error) => {
  console.error(`CULPA cache failed: ${error.message}`);
  process.exit(1);
});
