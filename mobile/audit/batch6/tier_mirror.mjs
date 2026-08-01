// Exhaustive proof that the SQL tier predicate mirrors src/utils/tier.ts exactly.
// The TS side is a verbatim transcription of the shipped helpers.

const TIER_WEIGHTS = { free: 0, cinephile: 0, archivist: 1, auteur: 2, founding: 3 };

function normalizeTier(tierStr) {
  if (!tierStr || tierStr === 'free') return 'cinephile';
  const t = tierStr.toLowerCase();
  if (t === 'archivist' || t === 'auteur' || t === 'founding') return t;
  return 'cinephile';
}
function getTierWeight(tierStr) {
  const tier = normalizeTier(tierStr);
  return TIER_WEIGHTS[tier] ?? 0;
}
function resolveTier(input) {
  if (!input) return 'cinephile';
  if (typeof input === 'string') return normalizeTier(input);
  const tWeight = getTierWeight(input.tier);
  const effectiveRole = input.is_founding ? 'founding' : input.role;
  const rWeight = getTierWeight(effectiveRole);
  return tWeight >= rWeight ? normalizeTier(input.tier) : normalizeTier(effectiveRole);
}
const isArchivistPlusTier = i => getTierWeight(resolveTier(i)) >= TIER_WEIGHTS['archivist'];
const isAuteurPlusTier   = i => getTierWeight(resolveTier(i)) >= TIER_WEIGHTS['auteur'];

const VALUES = [null, '', 'free', 'cinephile', 'archivist', 'auteur', 'founding',
                'admin', 'AUTEUR', 'Archivist', 'projectionist', 'garbage'];
const rows = [];
for (const tier of VALUES)
  for (const role of VALUES)
    for (const is_founding of [true, false, null]) {
      const input = { tier, role, is_founding };
      rows.push({
        tier, role, is_founding,
        archivist: isArchivistPlusTier(input),
        auteur: isAuteurPlusTier(input),
      });
    }

const sqlLit = v => (v === null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
console.log(rows.map(r =>
  `${sqlLit(r.tier)}|${sqlLit(r.role)}|${r.is_founding === null ? 'NULL' : r.is_founding}|${r.archivist}|${r.auteur}`
).join('\n'));
