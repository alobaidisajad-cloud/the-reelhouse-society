/** The database as production will hold it, read from text; see house.js. */
export interface HouseFunction { name: string; header: string; body: string; definer: boolean; args: string; returnsTrigger: boolean }
export interface HouseTrigger { name: string; table: string; timing: string; events: string[]; level: 'ROW' | 'STATEMENT'; when: string; fn: string; fnArgs: string }
export interface HousePolicy { name: string; table: string; cmd: string; restrictive: boolean; roles: string[]; using: string | null; check: string | null }
export interface House {
  functions: Map<string, HouseFunction>;
  triggers: Map<string, HouseTrigger>;
  policies: Map<string, HousePolicy>;
  executes: Map<string, Set<string>>;
  tables: Map<string, Map<string, Set<string>>>;
}
export function read(sql?: string, opts?: { pendingFrom?: number }): House;
export function houseText(): { text: string; pendingFrom: number };
export function mask(sql: string): { text: string; bodies: { from: number; start: number; end: number; tag: string }[] };
export function uncommented(sql: string): string;
export function qualified(raw: string): string;
export function membersRun(house: House, name: string): boolean;
export function triggersOn(house: House, table: string): HouseTrigger[];
