export const USER_PASSWORD_OMIT = Object.freeze({ password: true });

export function stripPassword(record) {
  if (!record || typeof record !== "object") {
    return record;
  }
  const copy = { ...record };
  delete copy.password;
  return copy;
}

export function stripPasswordFromRecords(records) {
  if (!Array.isArray(records)) {
    return records;
  }
  return records.map(stripPassword);
}
