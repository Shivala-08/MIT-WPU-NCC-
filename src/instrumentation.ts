import {
  assertSafeDatabaseTarget,
  describeDatabaseTarget,
} from "./lib/prisma-target.mjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  const mode =
    process.env.NODE_ENV === "production" ? "production" : "development";

  const { target } = assertSafeDatabaseTarget({
    url: process.env.DATABASE_URL,
    mode,
    env: process.env,
  });

  console.info(
    `[prisma-target] ${describeDatabaseTarget(target)} (${mode} mode). The target is verified once per process; restart the server after changing DATABASE_URL.`
  );
}
