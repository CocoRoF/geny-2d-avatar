export interface Migrator {
  readonly from: string;
  readonly to: string;
  apply(outDir: string): Promise<string[]>;
}

export interface ParameterDef {
  id: string;
  display_name: { en: string; ko: string; ja: string };
  unit: string;
  range: readonly [number, number];
  default: number;
  required: boolean;
  group: string;
  channel: string;
  cubism: string;
  physics_output?: boolean;
  notes?: string;
}

export interface DeformerNodeDef {
  id: string;
  type: string;
  parent: string | null;
  params_in: readonly string[];
  notes?: string;
}

export interface MigrationReportGroup {
  from: string;
  to: string;
  todos: string[];
}

export interface MigrateOptions {
  reportPath?: string;
}

export interface MigrateResult {
  appliedSteps: ReadonlyArray<{ from: string; to: string }>;
  targetVersion: string;
  reportPath: string;
  todos: MigrationReportGroup[];
}
