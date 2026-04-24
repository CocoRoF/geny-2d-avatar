import type { Migrator } from "../types.js";
import { migratorV100ToV110 } from "./v1-0-0-to-v1-1-0.js";
import { migratorV110ToV120 } from "./v1-1-0-to-v1-2-0.js";
import { migratorV120ToV130 } from "./v1-2-0-to-v1-3-0.js";

export const MIGRATORS: readonly Migrator[] = [
  migratorV100ToV110,
  migratorV110ToV120,
  migratorV120ToV130,
];

export { migratorV100ToV110, migratorV110ToV120, migratorV120ToV130 };
