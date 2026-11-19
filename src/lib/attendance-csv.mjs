const RISKY_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

export function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  let text = String(value);

  if (text.length > 0 && RISKY_PREFIXES.includes(text[0])) {
    text = `'${text}`;
  }

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

/**
 * Builds a CSV document from a list of rows.
 *
 * The columns are declared by the caller, so only the fields that the export
 * needs are ever written. Password hashes, tokens and other secrets are not
 * part of any export column.
 */
export function toCsv(rows, columns) {
  const header = columns
    .map((column) => escapeCsvValue(column.header))
    .join(",");

  const body = (rows ?? [])
    .map((row) =>
      columns
        .map((column) => {
          const raw =
            typeof column.value === "function"
              ? column.value(row)
              : row[column.key];

          return escapeCsvValue(raw);
        })
        .join(",")
    )
    .join("\n");

  return `${header}\n${body}`;
}
