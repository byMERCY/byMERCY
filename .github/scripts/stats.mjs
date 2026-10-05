// Renders dist/stats.svg: total contributions, current and longest streak.
// Data comes straight from the GitHub GraphQL API, no third-party services.
import { mkdirSync, writeFileSync } from "node:fs";

const login = process.env.GH_USER;
const token = process.env.GITHUB_TOKEN;
const out = process.argv[2] || "dist/stats.svg";

async function gql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json));
  return json.data;
}

const { user } = await gql(`query($login: String!) { user(login: $login) { createdAt } }`, { login });
const now = new Date();
const days = [];
for (let year = new Date(user.createdAt).getUTCFullYear(); year <= now.getUTCFullYear(); year++) {
  const from = new Date(Date.UTC(year, 0, 1));
  const to = year === now.getUTCFullYear() ? now : new Date(Date.UTC(year, 11, 31, 23, 59, 59));
  const data = await gql(`query($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) { contributionsCollection(from: $from, to: $to) {
      contributionCalendar { weeks { contributionDays { date contributionCount } } }
    } }
  }`, { login, from: from.toISOString(), to: to.toISOString() });
  for (const w of data.user.contributionsCollection.contributionCalendar.weeks)
    for (const d of w.contributionDays) days.push(d);
}
days.sort((a, b) => a.date.localeCompare(b.date));

const total = days.reduce((n, d) => n + d.contributionCount, 0);
const firstDay = days.find(d => d.contributionCount > 0)?.date;

let longest = { len: 0 }, run = { len: 0 };
for (const d of days) {
  if (d.contributionCount > 0) {
    run = run.len ? { ...run, len: run.len + 1, end: d.date } : { len: 1, start: d.date, end: d.date };
    if (run.len > longest.len) longest = run;
  } else run = { len: 0 };
}

// A streak is still alive if today has no contributions yet but yesterday did.
let current = { len: 0 };
let i = days.length - 1;
if (i >= 0 && days[i].contributionCount === 0) i--;
if (i >= 0 && days[i].contributionCount > 0) {
  current = { len: 0, end: days[i].date };
  while (i >= 0 && days[i].contributionCount > 0) { current.len++; current.start = days[i].date; i--; }
}

const fmt = iso => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const range = s => s.len ? (s.start === s.end ? fmt(s.start) : `${fmt(s.start)} – ${fmt(s.end)}`) : "No streak yet";
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

const C = { bg: "#2B3AF5", ink: "#FFFFFF", yellow: "#FFE14D", pink: "#FF5FA8", haze: "#C9CEFF" };
const font = `font-family="'Segoe UI', Ubuntu, 'Helvetica Neue', sans-serif"`;

function column(x, value, label, sub, color) {
  return `
  <g transform="translate(${x}, 0)" text-anchor="middle" ${font}>
    <text y="92" font-size="30" font-weight="700" fill="${C.ink}">${esc(value)}</text>
    <text y="128" font-size="14" font-weight="700" fill="${color}">${esc(label)}</text>
    <text y="150" font-size="12" fill="${C.haze}">${esc(sub)}</text>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="495" height="195" viewBox="0 0 495 195" role="img" aria-label="${esc(`Total contributions ${total}, current streak ${current.len}, longest streak ${longest.len}`)}">
  <rect width="495" height="195" rx="12" fill="${C.bg}"/>
  <line x1="165" y1="40" x2="165" y2="155" stroke="#FFFFFF" stroke-opacity=".25"/>
  <line x1="330" y1="40" x2="330" y2="155" stroke="#FFFFFF" stroke-opacity=".25"/>
  ${column(82.5, total.toLocaleString("en-US"), "Total Contributions", firstDay ? `${fmt(firstDay)} – Present` : "Nothing yet", C.ink)}
  <circle cx="247.5" cy="82" r="38" fill="none" stroke="${C.yellow}" stroke-width="5"/>
  <path d="M247.5 30c-5 6-9 10-9 15a9 9 0 0 0 18 0c0-5-4-9-9-15z" fill="${C.pink}" stroke="${C.bg}" stroke-width="3"/>
  <g text-anchor="middle" ${font}>
    <text x="247.5" y="93" font-size="30" font-weight="700" fill="${C.ink}">${current.len}</text>
    <text x="247.5" y="146" font-size="14" font-weight="700" fill="${C.yellow}">Current Streak</text>
    <text x="247.5" y="168" font-size="12" fill="${C.haze}">${esc(range(current))}</text>
  </g>
  ${column(412.5, longest.len, "Longest Streak", range(longest), C.ink)}
</svg>
`;

mkdirSync(out.replace(/[\\/][^\\/]+$/, ""), { recursive: true });
writeFileSync(out, svg);
console.log(`total=${total} current=${current.len} longest=${longest.len} -> ${out}`);
