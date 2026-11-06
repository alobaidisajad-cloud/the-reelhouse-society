/**
 * thePrivacyInventoryIsWhole.test.ts — what the house collects is written down whole, and what is
 * told to the stores and the iPhone is written from it (WORKLIST P1.6, P4.51).
 *
 * store/privacy-inventory.json names each kind of data, why it is kept, whether it is linked to the
 * member, and who receives it. This fails when a shipped package, a table holding a member's id or
 * a user agent, an outside host the app's code names, or a required-reason API a package's own
 * manifest declares is missing from it; when the app's privacy manifest (app.json) says other than
 * it; and when a store form was written from another version of it (store/forms.cjs writes them).
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { files, rel } from '@/test-utils/universe';
import { MOBILE, stripComments } from '@/test-utils/readCode';
import { SNAPSHOT_SQL } from '@/test-utils/schema';

const { formsOf, hashOf, FORMS } = require('../store/forms.cjs');

type Data = { kept: string[]; sentTo: string[]; clients: string[]; apple: { type: string; purposes: string[]; also?: string[] } | null };
type Inventory = {
  data: Record<string, Data>;
  services: Record<string, { hosts: string[] }>;
  links: { hosts: string[] };
  notReached: Record<string, string>;
  sdks: Record<string, { sends: string[]; why: string }>;
  tables: Record<string, { data: string[]; kind: 'own' | 'record' }>;
  memberColumnsWithoutKey: { members: string[]; notMembers: Record<string, string> };
  requiredReasonApis: { categories: Record<string, { reasons: string[] }> };
};

const INVENTORY_TEXT = readFileSync(join(MOBILE, 'store', 'privacy-inventory.json'), 'utf8');
const inv: Inventory = JSON.parse(INVENTORY_TEXT);
const SQL = SNAPSHOT_SQL();
const appJson = JSON.parse(readFileSync(join(MOBILE, 'app.json'), 'utf8')).expo;
const deps = Object.keys(JSON.parse(readFileSync(join(MOBILE, 'package.json'), 'utf8')).dependencies);

/** Each public table holding a member's id by a foreign key, or a user agent, read from the snapshot. */
const MEMBER_KEY = /ALTER TABLE ONLY public\.(\w+)\s+ADD CONSTRAINT \S+ FOREIGN KEY \((\w+)\) REFERENCES (?:public\.profiles|auth\.users)\(id\)/g;
const keyed = new Set([...SQL.matchAll(MEMBER_KEY)].map((m) => `${m[1]}.${m[2]}`));
const tablesOf = (cols: Iterable<string>) => [...cols].map((c) => `public.${c.split('.')[0]}`);
const createTables = [...SQL.matchAll(/CREATE TABLE public\.(\w+) \(([\s\S]*?)\n\);/g)];
const withUserAgent = createTables.filter((m) => /^\s+user_agent /m.test(m[2]!)).map((m) => `public.${m[1]}`);

/** Each uuid column named as a member's, with no foreign key to say so. */
const MEMBERISH = /user|author|_by$|member|admin|creator|reporter|owner|blocker|blocked|sender|actor|editor|granted|target/;
const unkeyed = createTables.flatMap((m) => [...m[2]!.matchAll(/^\s+(\w+) uuid/gm)]
  .map((c) => `${m[1]}.${c[1]}`).filter((col) => MEMBERISH.test(col.split('.')[1]!) && !keyed.has(col))).sort();

describe('the inventory reads what it guards', () => {
  it('finds the packages, the tables and the hosts, rather than empty lists that agree', () => {
    expect(deps.length).toBeGreaterThan(50);
    expect(keyed.size).toBeGreaterThan(30);
    expect(withUserAgent).toEqual(['public.error_logs']);
    expect(Object.keys(inv.data).length).toBeGreaterThan(10);
  });
});

describe('every package that ships', () => {
  it('is named, with what it sends and why, and nothing is named that does not ship', () => {
    expect(Object.keys(inv.sdks).sort()).toEqual([...deps].sort());
    expect(Object.entries(inv.sdks).filter(([, s]) => !s.why || s.sends.some((x) => !inv.services[x])).map(([n]) => n)).toEqual([]);
  });
});

describe('every table that holds a member', () => {
  const named = Object.keys(inv.tables).filter((t) => t.startsWith('public.'));

  it('is named: each with a foreign key to a member, a member column without one, or a user agent', () => {
    const want = new Set([...tablesOf(keyed), ...tablesOf(inv.memberColumnsWithoutKey.members), ...withUserAgent]);
    expect(named.sort()).toEqual([...want].sort());
  });

  it('names each column that holds a member without a key, and says what each one like it holds instead', () => {
    expect([...inv.memberColumnsWithoutKey.members, ...Object.keys(inv.memberColumnsWithoutKey.notMembers)].sort()).toEqual(unkeyed);
  });

  it('names Auth\'s and the file store\'s own records too', () => {
    for (const t of ['auth.users', 'auth.sessions', 'auth.audit_log_entries', 'storage.objects']) expect(inv.tables[t]).toBeDefined();
  });

  it('says what each holds, as the data it names, and each data\'s tables name it back', () => {
    const wrong: string[] = [];
    for (const [t, row] of Object.entries(inv.tables)) {
      if (!['own', 'record'].includes(row.kind)) wrong.push(`${t}: kind ${row.kind}`);
      for (const d of row.data) if (!inv.data[d]?.kept.includes(t)) wrong.push(`${t} holds ${d}, which does not name it`);
    }
    for (const [id, d] of Object.entries(inv.data)) {
      for (const t of d.kept) if (!inv.tables[t]?.data.includes(id)) wrong.push(`${id} is kept in ${t}, which does not name it`);
      for (const s of d.sentTo) if (!inv.services[s]) wrong.push(`${id} goes to ${s}, no service`);
    }
    expect(wrong).toEqual([]);
  });
});

describe('every outside address the app\'s code names', () => {
  const named = new Map<string, string>();
  for (const f of files('appCode')) {
    const code = stripComments(readFileSync(f, 'utf8'), f);
    for (const m of code.matchAll(/https?:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)) if (!named.has(m[1]!.toLowerCase())) named.set(m[1]!.toLowerCase(), rel(f));
  }
  const known = new Set([...Object.values(inv.services).flatMap((s) => s.hosts), ...inv.links.hosts, ...Object.keys(inv.notReached)]);

  it('is a service the inventory names, a link the phone opens, or never reached and why', () => {
    expect(named.size).toBeGreaterThan(5);
    expect([...named].filter(([h]) => !known.has(h)).map(([h, f]) => `${h} (${f})`)).toEqual([]);
  });

  it('names no link or unreached address the code no longer has', () => {
    expect([...inv.links.hosts, ...Object.keys(inv.notReached)].filter((h) => !named.has(h))).toEqual([]);
  });
});

describe('the required-reason APIs', () => {
  /** Every privacy manifest a package in node_modules ships, the shipped packages' own and theirs. */
  const manifests: string[] = [];
  const look = (dir: string, depth: number) => {
    if (depth > 5 || !existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory() && !/^(node_modules|android|__tests__|example|docs)$/.test(e.name)) look(join(dir, e.name), depth + 1);
      else if (e.name.endsWith('.xcprivacy')) manifests.push(join(dir, e.name));
    }
  };
  const NM = join(MOBILE, 'node_modules');
  for (const name of readdirSync(NM)) {
    if (name.startsWith('.')) continue;
    for (const pkg of name.startsWith('@') ? readdirSync(join(NM, name)).map((p) => `${name}/${p}`) : [name]) {
      if (/^(expo|expo-[\w-]+|react-native|react-native-[\w-]+|@[\w-]+\/react-native[\w-]*|@react-native-community\/[\w-]+|@shopify\/[\w-]+|@sentry\/react-native)$/.test(pkg)) look(join(NM, pkg), 0);
    }
  }
  const declared = new Map<string, Set<string>>();
  for (const m of manifests) {
    const t = readFileSync(m, 'utf8');
    for (const a of t.matchAll(/<string>(NSPrivacyAccessedAPICategory\w+)<\/string>[\s\S]*?<array>([\s\S]*?)<\/array>/g)) {
      const reasons = declared.get(a[1]!) ?? new Set<string>();
      for (const r of a[2]!.matchAll(/<string>([^<]+)<\/string>/g)) reasons.add(r[1]!);
      declared.set(a[1]!, reasons);
    }
  }

  it('reads the packages\' manifests', () => {
    expect(manifests.length).toBeGreaterThan(10);
  });

  it('names every category and reason a package\'s own manifest declares', () => {
    const missing = [...declared].flatMap(([cat, reasons]) => [...reasons]
      .filter((r) => !inv.requiredReasonApis.categories[cat]?.reasons.includes(r)).map((r) => `${cat} ${r}`));
    expect(missing).toEqual([]);
  });

  it('is what the app\'s own manifest declares, exactly', () => {
    expect(appJson.ios.privacyManifests.NSPrivacyAccessedAPITypes).toEqual(Object.entries(inv.requiredReasonApis.categories)
      .map(([type, c]) => ({ NSPrivacyAccessedAPIType: type, NSPrivacyAccessedAPITypeReasons: c.reasons })));
  });
});

describe('what the stores and the iPhone are told', () => {
  it('every answer file was written from this inventory, as store/forms.cjs writes it', () => {
    const dir = join(MOBILE, 'store', 'forms');
    expect(files('store').map(rel).filter((f) => f.startsWith('store/forms/')).sort()).toEqual(Object.keys(FORMS).map((n) => `store/forms/${n}`).sort());
    const written = formsOf(INVENTORY_TEXT) as Record<string, string>;
    for (const name of Object.keys(FORMS)) {
      const text = readFileSync(join(dir, name), 'utf8').replace(/\r\n/g, '\n');
      expect([name, JSON.parse(text).inventory]).toEqual([name, hashOf(INVENTORY_TEXT)]);
      expect([name, text]).toEqual([name, written[name]]);
    }
  });

  /** Apple's names for its data types and purposes, as its privacy manifest keys spell them. */
  const APPLE: Record<string, string> = {
    'Crash Data': 'CrashData', 'Customer Support': 'CustomerSupport', 'Device ID': 'DeviceID', 'Email Address': 'EmailAddress',
    'Name': 'Name', 'Other Data Types': 'OtherDataTypes', 'Other Diagnostic Data': 'OtherDiagnosticData',
    'Other User Content': 'OtherUserContent', 'Performance Data': 'PerformanceData', 'Photos or Videos': 'PhotosorVideos',
    'Purchase History': 'PurchaseHistory', 'Search History': 'SearchHistory', 'User ID': 'UserID',
  };

  it('the app\'s privacy manifest says what the App Store answers say: no tracking, and the same data', () => {
    const form = JSON.parse(readFileSync(join(MOBILE, 'store', 'forms', 'app-store-privacy.json'), 'utf8'));
    const pm = appJson.ios.privacyManifests;
    expect([pm.NSPrivacyTracking, pm.NSPrivacyTrackingDomains, form.tracking]).toEqual([false, [], false]);
    expect(form.collected.filter((c: { type: string }) => !APPLE[c.type]).map((c: { type: string }) => c.type)).toEqual([]);
    expect(pm.NSPrivacyCollectedDataTypes).toEqual(form.collected.map((c: { type: string; linkedToTheMember: boolean; purposes: string[] }) => ({
      NSPrivacyCollectedDataType: `NSPrivacyCollectedDataType${APPLE[c.type]}`,
      NSPrivacyCollectedDataTypeLinked: c.linkedToTheMember,
      NSPrivacyCollectedDataTypeTracking: false,
      NSPrivacyCollectedDataTypePurposes: c.purposes.map((p) => `NSPrivacyCollectedDataTypePurpose${p.replace(/ /g, '')}`),
    })));
  });

  it('the App Store answers hold every data type the app collects, and none it does not', () => {
    const form = JSON.parse(readFileSync(join(MOBILE, 'store', 'forms', 'app-store-privacy.json'), 'utf8'));
    const want = new Set(Object.values(inv.data).filter((d) => d.clients.includes('app') && d.apple)
      .flatMap((d) => [d.apple!.type, ...(d.apple!.also ?? [])]));
    expect(form.collected.map((c: { type: string }) => c.type).sort()).toEqual([...want].sort());
  });
});
