export function canManageSessions(role) {
  return role === "ADMIN" || role === "OFFICER";
}

export function canAdministerSessions(role) {
  return role === "ADMIN";
}

export function canCorrectClosedSession(role) {
  return role === "ADMIN";
}

export function canExportAttendance(role) {
  return role === "ADMIN";
}

export function canReviewLeave(role) {
  return role === "ADMIN";
}

export function canReadLeaveQueue(role) {
  return role === "ADMIN" || role === "OFFICER";
}

export function canReadReports(role) {
  return role === "ADMIN" || role === "OFFICER";
}
