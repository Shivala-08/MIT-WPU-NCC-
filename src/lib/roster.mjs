import { isAllowedCollegeEmail, normalizeEmail } from "./eligibility.mjs";

/**
 * @typedef {{
 *   line: number,
 *   email: string,
 *   fullName: string,
 *   prn: string | null,
 *   regiNumber: string | null,
 *   wing: string | null,
 *   division: string | null,
 *   year: string | null,
 *   branch: string | null,
 * }} RosterValidRow
 */

/**
 * @typedef {{ line: number, email: string, error: string }} RosterInvalidRow
 */

export const ROSTER_MAX_ROWS = 500;

export const ROSTER_COLUMNS = Object.freeze([
  "email",
  "fullName",
  "prn",
  "regiNumber",
  "wing",
  "division",
  "year",
  "branch",
]);

const HEADER_ALIASES = {
  email: "email",
  "email address": "email",
  "college email": "email",
  "college email address": "email",
  name: "fullName",
  fullname: "fullName",
  "full name": "fullName",
  "cadet name": "fullName",
  prn: "prn",
  "university prn": "prn",
  reginumber: "regiNumber",
  "regi number": "regiNumber",
  "regimental number": "regiNumber",
  wing: "wing",
  "ncc wing": "wing",
  division: "division",
  year: "year",
  "academic year": "year",
  branch: "branch",
  "branch/department": "branch",
  "branch / department": "branch",
  department: "branch",
};

/**
 * @param {string} line
 * @returns {string[]}
 */
function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (quoted) {
      if (character === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        current += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
      continue;
    }

    if (character === ",") {
      cells.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

/**
 * @param {unknown} text
 * @returns {{ header: (string | null)[] | null, rows: { line: number, record: Record<string, string> }[], missingHeader?: boolean }}
 */
export function parseRosterCsv(text) {
  const lines = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  const populated = [];
  lines.forEach((line, index) => {
    if (line.trim().length > 0) {
      populated.push({ line: index + 1, text: line });
    }
  });

  if (populated.length === 0) {
    return { header: null, rows: [] };
  }

  const headerCells = splitCsvLine(populated[0].text).map((cell) =>
    cell.toLowerCase().replace(/\s+/g, " ").trim()
  );

  const header = headerCells.map((cell) => HEADER_ALIASES[cell] ?? null);

  if (!header.includes("email")) {
    return { header: null, rows: [], missingHeader: true };
  }

  const rows = populated.slice(1).map((entry) => {
    const cells = splitCsvLine(entry.text);
    const record = {};

    header.forEach((column, index) => {
      if (!column) {
        return;
      }
      record[column] = cells[index] ?? "";
    });

    return { line: entry.line, record };
  });

  return { header, rows };
}

/**
 * @param {{ line: number, record: Record<string, string> }[]} rows
 * @param {{ allowedEmailDomains?: string | string[] }} [options]
 * @returns {{ valid: RosterValidRow[], invalid: RosterInvalidRow[] }}
 */
export function validateRosterRows(rows, { allowedEmailDomains } = {}) {
  const valid = [];
  const invalid = [];
  const seen = new Map();

  for (const row of rows) {
    const email = normalizeEmail(row.record.email);
    const fullName = String(row.record.fullName ?? "").trim();

    if (!email) {
      invalid.push({ line: row.line, email: "", error: "Email address is required" });
      continue;
    }

    if (!isAllowedCollegeEmail(email, allowedEmailDomains)) {
      invalid.push({
        line: row.line,
        email,
        error: "Email address is outside the allowed college domain",
      });
      continue;
    }

    if (seen.has(email)) {
      invalid.push({
        line: row.line,
        email,
        error: `Duplicate row, already listed on line ${seen.get(email)}`,
      });
      continue;
    }

    seen.set(email, row.line);

    if (!fullName) {
      invalid.push({ line: row.line, email, error: "Full name is required" });
      continue;
    }

    valid.push({
      line: row.line,
      email,
      fullName,
      prn: String(row.record.prn ?? "").trim() || null,
      regiNumber: String(row.record.regiNumber ?? "").trim() || null,
      wing: String(row.record.wing ?? "").trim() || null,
      division: String(row.record.division ?? "").trim() || null,
      year: String(row.record.year ?? "").trim() || null,
      branch: String(row.record.branch ?? "").trim() || null,
    });
  }

  return { valid, invalid };
}

/**
 * @param {unknown} text
 * @param {{ allowedEmailDomains?: string | string[] }} [options]
 * @returns {{ header: (string | null)[] | null, valid: RosterValidRow[], invalid: RosterInvalidRow[] }}
 */
export function parseAndValidateRosterCsv(text, options = {}) {
  const parsed = parseRosterCsv(text);

  if (parsed.missingHeader) {
    return {
      header: null,
      valid: [],
      invalid: [
        {
          line: 1,
          email: "",
          error:
            "The CSV needs an email column (for example: email, full name, prn, wing, year)",
        },
      ],
    };
  }

  if (parsed.rows.length > ROSTER_MAX_ROWS) {
    return {
      header: parsed.header,
      valid: [],
      invalid: [
        {
          line: parsed.rows.length + 1,
          email: "",
          error: `A roster import is limited to ${ROSTER_MAX_ROWS} rows`,
        },
      ],
    };
  }

  const { valid, invalid } = validateRosterRows(parsed.rows, options);

  return { header: parsed.header, valid, invalid };
}
