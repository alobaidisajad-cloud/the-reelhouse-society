#!/usr/bin/env node
/**
 * forms.cjs — the App Store privacy answers and Play's data safety answers, written from
 * privacy-inventory.json (WORKLIST P1.6, P7.7). Each answer file records the hash of the inventory
 * it was written from; thePrivacyInventoryIsWhole fails when the inventory has changed since, or
 * when a file differs from what this writes. After any change to the inventory:
 *
 *   node store/forms.cjs
 *
 * and the answers in App Store Connect and the Play Console are redone from the files it writes.
 */
const { createHash } = require('crypto');
const { readFileSync, writeFileSync } = require('fs');
const { join } = require('path');

const INVENTORY = join(__dirname, 'privacy-inventory.json');
const FORMS = {
  'app-store-privacy.json': appStore,
  'play-data-safety.json': play,
};

/** The inventory's hash, as its text reads on any checkout (line endings set aside). */
function hashOf(text) {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
}

/** What the app (not the website) collects, each a data type of the form's own words. */
function appData(inv, form) {
  const rows = new Map();
  for (const [id, d] of Object.entries(inv.data)) {
    if (!d.clients.includes('app') || !d[form]) continue;
    for (const type of [d[form].type, ...(d[form].also ?? [])]) {
      const row = rows.get(type) ?? { type, linked: false, required: false, purposes: new Set(), from: [] };
      row.linked ||= d.linked;
      row.required ||= d.required;
      for (const p of d[form].purposes) row.purposes.add(p);
      row.from.push(id);
      rows.set(type, row);
    }
  }
  return [...rows.values()].sort((a, b) => a.type.localeCompare(b.type))
    .map((r) => ({ ...r, purposes: [...r.purposes].sort() }));
}

function appStore(inv) {
  return {
    why: 'The App Store privacy answers (App Store Connect, App Privacy), written by store/forms.cjs from privacy-inventory.json. Nothing is used to track: no data is joined with other companies\' data for advertising, or shared with a data broker.',
    tracking: false,
    collected: appData(inv, 'apple').map(({ type, linked, purposes, from }) => ({ type, linkedToTheMember: linked, usedToTrack: false, purposes, from })),
  };
}

function play(inv) {
  return {
    why: 'Play\'s data safety answers (Play Console, App content, Data safety), written by store/forms.cjs from privacy-inventory.json. Nothing is shared: every service named in the inventory acts for the house (Play counts a service provider as no sharing).',
    encryptedInTransit: true,
    membersCanAskForDeletion: true,
    collected: appData(inv, 'play').map(({ type, required, purposes, from }) => ({ type, shared: false, optional: !required, ephemeral: false, purposes, from })),
  };
}

/** Every answer file, as this writes it from the inventory's text. */
function formsOf(text) {
  const inv = JSON.parse(text);
  const inventory = hashOf(text);
  return Object.fromEntries(Object.entries(FORMS).map(([name, make]) => [name, `${JSON.stringify({ inventory, ...make(inv) }, null, 2)}\n`]));
}

if (require.main === module) {
  for (const [name, body] of Object.entries(formsOf(readFileSync(INVENTORY, 'utf8')))) {
    writeFileSync(join(__dirname, 'forms', name), body);
    console.log(`wrote store/forms/${name}`);
  }
}

module.exports = { formsOf, hashOf, FORMS };
