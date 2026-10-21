import { defineConfig } from "drizzle-kit";
import "./src/config/load-env";
import { migrationDatabaseUrl, withVerifiedTls } from "./src/db/connection";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: withVerifiedTls(migrationDatabaseUrl() ?? ""),
  },
});
