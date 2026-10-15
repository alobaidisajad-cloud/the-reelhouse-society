/** The one list of the files each sweep reads; see universe.js. */
export type UniverseName =
  | 'routes' | 'appCode' | 'appData' | 'appTests' | 'tests' | 'testSupport' | 'scripts' | 'config' | 'mockups'
  | 'flows' | 'runFlows' | 'docs' | 'workflows' | 'migrations' | 'notMigrations' | 'undo' | 'snapshot'
  | 'rehearsals' | 'supabaseSql' | 'functions' | 'standIns' | 'website';

export type SupabaseKind =
  | 'migration' | 'not a migration' | 'undo' | 'snapshot' | 'old snapshot' | 'function' | 'rehearsal'
  | 'diagnostic' | 'script' | 'restore' | 'loose sql' | 'email template' | 'record' | 'doc' | 'unknown';

/** `ext`: only these endings. `under`: only files in these folders or with these names, from mobile/. */
export interface FilesOptions { ext?: string[]; under?: string[] }

export interface Universe {
  REPO: string;
  MOBILE: string;
  files(names: UniverseName | UniverseName[], opts?: FilesOptions): string[];
  routeClosure(): string[];
  rel(path: string): string;
  repoRel(path: string): string;
  kindOf(path: string): SupabaseKind;
  notSweptBecause(path: string): string | null;
  everyFile(): string[];
  universesOf(repoRelPath: string): UniverseName[];
}

export const REPO: string;
export const MOBILE: string;
export function files(names: UniverseName | UniverseName[], opts?: FilesOptions): string[];
export function routeClosure(): string[];
export function rel(path: string): string;
export function repoRel(path: string): string;
export function kindOf(path: string): SupabaseKind;
export function notSweptBecause(path: string): string | null;
export function everyFile(): string[];
export function universesOf(repoRelPath: string): UniverseName[];
export function at(repo: string): Universe;
export const UNIVERSES: Record<UniverseName, { says: string; roots: string[]; top?: boolean; withClosure?: boolean }>;
export function isTest(repoRelPath: string): boolean;
