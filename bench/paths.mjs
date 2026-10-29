import path from "node:path";
import { fileURLToPath } from "node:url";

// Keep fresh experiments separate from the published evidence when requested.
// Relative overrides are resolved from the caller's working directory.
export const RESULTS_DIR = process.env.RESULTS_DIR
  ? path.resolve(process.env.RESULTS_DIR)
  : fileURLToPath(new URL("./results/", import.meta.url));
