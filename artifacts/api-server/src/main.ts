/**
 * Bootstrap entry point.
 *
 * This file MUST remain the thinnest possible — it only imports validateEnv
 * (which itself has zero env-dependent side effects) and calls it BEFORE any
 * other module is loaded. Only after validation passes does it dynamically
 * import the main application, so any module-level env reads happen after we
 * have confirmed the required variables are present.
 */
import { validateEnvVars } from "./lib/validateEnv.js";

validateEnvVars();

await import("./index.js");
