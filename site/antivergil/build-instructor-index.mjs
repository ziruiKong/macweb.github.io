#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(ROOT, "data");
const OUTPUT = path.join(DATA_DIR, "instructors.json");
const TERM_RE = /^courses-(\d{4}-(?:Spring|Fall))\.json$/;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function addDays(date, amount) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function nthMondayOfMonth(year, month, nth) {
  const value = new Date(Date.UTC(year, month - 1, 1));
  const firstMonday = 1 + ((8 - value.getUTCDay()) % 7);
  value.setUTCDate(firstMonday + (nth - 1) * 7);
  return value.toISOString().slice(0, 10);
}

function semesterStart(term) {
  const match = String(term || "").match(/^(\d{4})-(Spring|Summer|Fall)$/);
  if (!match) return null;
  const monthDay = { Spring: "01-18", Summer: "05-27", Fall: "09-02" }[match[2]];
  return `${match[1]}-${monthDay}`;
}

function dropDeadline(term) {
  const match = String(term || "").match(/^(\d{4})-(Spring|Summer|Fall)$/);
  if (!match) return null;
  const year = Number(match[1]);
  if (match[2] === "Fall") return `${year}-10-20`;
  if (match[2] === "Spring") {
    const start = year === 2021 ? `${year}-01-11` : addDays(nthMondayOfMonth(year, 1, 3), 1);
    return addDays(start, 35);
  }
  return null;
}

function cleanInstructor(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeName(value) {
  return cleanInstructor(value).toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function scheduleLabel(section) {
  const days = (section.days || [])
    .map((day) => DAY_NAMES[Number(day)] || "")
    .filter(Boolean)
    .join("/");
  const time = section.startLabel && section.endLabel
    ? `${section.startLabel}–${section.endLabel}`
    : "Time TBA";
  const sectionId = String(section.classId || "").split("-").at(-1) || String(section.callNumber || "");
  return `${sectionId ? `${sectionId} · ` : ""}${days ? `${days} ` : ""}${time}`;
}

function analyzeDrop(series, term) {
  const start = semesterStart(term);
  const deadline = dropDeadline(term);
  if (!start || !series.length) return { rate: null, base: 0, end: 0, complete: false };
  const cutoff = deadline || "9999-12-31";
  const window = series.filter(([date]) => date >= start && date <= cutoff);
  if (window.length < 2) return { rate: null, base: 0, end: window.at(-1)?.[1] || 0, complete: false };
  const firstWindowEnd = addDays(start, 14);
  const opening = window.filter(([date]) => date <= firstWindowEnd);
  const base = Math.max(...opening.map(([, enrolled]) => enrolled || 0));
  const end = window.at(-1)[1] || 0;
  if (base < 5) return { rate: null, base, end, complete: window.at(-1)[0] >= deadline };
  const rate = Math.max(0, (base - end) / base);
  return { rate, base, end, complete: Boolean(deadline && window.at(-1)[0] >= deadline) };
}

function addSeries(target, series) {
  for (const [date, enrolled] of series || []) {
    target.set(date, (target.get(date) || 0) + (Number(enrolled) || 0));
  }
}

function buildReviewIndex(cache) {
  const byInstructor = new Map();
  for (const course of Object.values(cache?.courses || {})) {
    for (const review of course.reviews || []) {
      const name = cleanInstructor(review.professor);
      const rating = Number(review.rating);
      if (!name || !Number.isFinite(rating) || rating <= 0) continue;
      const key = normalizeName(name);
      const current = byInstructor.get(key) || { name, ratings: [], reviews: 0 };
      current.ratings.push(rating);
      current.reviews++;
      byInstructor.set(key, current);
    }
  }
  const output = new Map();
  for (const [key, value] of byInstructor) {
    const average = value.ratings.reduce((sum, rating) => sum + rating, 0) / value.ratings.length;
    output.set(key, {
      name: value.name,
      average: Math.round(average * 10) / 10,
      reviews: value.reviews,
    });
  }
  return output;
}

function main() {
  const files = fs.readdirSync(DATA_DIR)
    .map((name) => ({ name, match: name.match(TERM_RE) }))
    .filter((entry) => entry.match)
    .sort((a, b) => b.match[1].localeCompare(a.match[1]));
  const terms = files.map((entry) => entry.match[1]);
  const instructors = new Map();

  for (const entry of files) {
    const term = entry.match[1];
    const rows = JSON.parse(fs.readFileSync(path.join(DATA_DIR, entry.name), "utf8"));
    const grouped = new Map();
    for (const section of rows) {
      const instructor = cleanInstructor(section.instructor);
      const code = String(section.code || "").trim();
      if (!instructor || !code || /tba/i.test(instructor)) continue;
      const key = `${instructor}\0${term}\0${code}`;
      const current = grouped.get(key) || { instructor, term, code, sections: [], series: new Map() };
      current.sections.push(section);
      addSeries(current.series, section.enrollSeries);
      grouped.set(key, current);
    }

    for (const item of grouped.values()) {
      const nameKey = normalizeName(item.instructor);
      const profile = instructors.get(nameKey) || {
        name: item.instructor,
        departments: new Set(),
        offerings: [],
      };
      const first = item.sections.find((section) => section.instructor) || item.sections[0];
      const seriesLatest = [...item.series.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .at(-1)?.[1];
      const reportedEnrollments = item.sections
        .map((section) => section.enrolled)
        .filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)))
        .map(Number);
      const latestEnrollment = Number.isFinite(Number(seriesLatest))
        ? Number(seriesLatest)
        : reportedEnrollments.length
          ? reportedEnrollments.reduce((sum, value) => sum + value, 0)
          : null;
      const capacity = item.sections.reduce((sum, section) => sum + (Number(section.capacity) || 0), 0);
      const drop = analyzeDrop(
        [...item.series.entries()].sort(([a], [b]) => a.localeCompare(b)),
        term,
      );
      if (first.dept) profile.departments.add(first.dept);
      profile.offerings.push([
        term,
        item.code,
        first.title || item.code,
        latestEnrollment,
        capacity,
        drop.rate == null ? null : Math.round(drop.rate * 1000) / 1000,
        Number(first.points) || 0,
        item.sections.length,
        [...new Set(item.sections.map(scheduleLabel))].join("; "),
        drop.base,
        drop.complete ? 1 : 0,
      ]);
      instructors.set(nameKey, profile);
    }
  }

  const reviewIndex = buildReviewIndex(
    JSON.parse(fs.readFileSync(path.join(DATA_DIR, "culpa-reviews.json"), "utf8")),
  );
  const compact = {};
  for (const [key, profile] of instructors) {
    const reviews = reviewIndex.get(key);
    compact[profile.name] = {
      d: [...profile.departments].sort(),
      o: profile.offerings.sort((a, b) => b[0].localeCompare(a[0]) || a[1].localeCompare(b[1])),
      ...(reviews ? { r: [reviews.average, reviews.reviews] } : {}),
    };
  }

  const output = {
    generatedAt: new Date().toISOString(),
    source: "Columbia Directory of Classes enrollment archive",
    terms,
    instructors: compact,
  };
  fs.writeFileSync(OUTPUT, `${JSON.stringify(output)}\n`);
  console.log(
    `Instructor index: ${Object.keys(compact).length} instructors, ` +
    `${terms.length} terms, ${(fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(2)} MB.`,
  );
}

main();
