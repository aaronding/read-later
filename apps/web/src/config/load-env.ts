// For scripts that run outside Next.js (worker, migrations, drizzle-kit):
// import this first to read the repository-root .env.
import { loadRootEnv } from "./root-env";

loadRootEnv();
