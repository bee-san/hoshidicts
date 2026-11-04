#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/yi/transforms.json and sources/yomitan-provenance.tsv:
//
//   node languages/yi/sources/own-rules.mjs && node languages/yi/sources/build-final.mjs
//
// The final rules are the own rules (sources/own.json). Yomitan's 83 rules
// (sources/yomitan.json) are left out: on the measurement sets they reach 3
// forms the own rules do not and add false candidates and wrong first
// results (README.md, Rule provenance). An own rule is marked `both` when it
// reads the same ending, for the same form, as a Yomitan rule:
//
// - a plural ending removed (Yomitan's `plural`: -ס, -ן, -ען, -ער, -ים, -עס, -ות),
//   and -עך, which Yomitan's plural removes from a diminutive (own `diminutivePlural`);
// - -ער with the same change of the stem's last vowel (Yomitan's `umlaut_plural`:
//   ע for אַ, אָ; י for ו; ײ for ױ, which the own rules write יי for וי), and -ן with ײ for ױ;
// - a diminutive ending (Yomitan's `diminutive`: -ל, -עלע, -קע, -טשיק), and -ל or -עלע
//   with one of those vowel changes (`diminutive_and_umlaut`);
// - the present endings -סט and -ט and the participle's -נדיק
//   (`verb_present_singular_to_first_person`, `verb_present_plural_to_first_person` -ט).
//
// Yomitan's rules give a verb's 1sg form or a stem with a medial final letter,
// the own rules the infinitive and the final letter, so `both` means the same
// ending is read, not that the outputs are equal. A rule whose ending follows
// a final letter written medially (וואָכן → וואָך) counts by its ending (-ן).

import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pack = dirname(here);
const own = JSON.parse(readFileSync(join(here, 'own.json'), 'utf8'));
const yomitan = JSON.parse(readFileSync(join(here, 'yomitan.json'), 'utf8'));

const FINALS = new Set(['ך', 'ם', 'ן', 'ף', 'ץ']);
const MEDIAL = ['כ', 'מ', 'נ', 'פֿ', 'צ'];
/** The ending a rule reads: its inflected part without a medial letter that the rule writes final. */
function ending(rule) {
    const inflected = rule.inflected ?? rule.inflectedSuffix ?? '';
    if (FINALS.has(rule.deinflected ?? '')) {
        for (const m of MEDIAL) {
            if (inflected.startsWith(m)) { return inflected.slice(m.length); }
        }
    }
    return inflected;
}
const LIGATURE = {'\u05F2': 'יי', '\u05F1': 'וי', '\uFB2E': 'אַ', '\uFB2F': 'אָ', '\u05D0': 'א'};
/** A vowel change as `inflected>dictionary` letters, ligatures and presentation forms written out. */
function change(stemChange) {
    if (stemChange === undefined) { return null; }
    const plain = (s) => [...s].map((c) => LIGATURE[c] ?? c).join('');
    return `${plain(stemChange.from[0])}>${plain(stemChange.to)}`;
}
const VOWEL_PAIRS = new Set(['ע>אַ', 'ע>אָ', 'י>ו', 'יי>וי']);

// [own transform, test on the own rule, Yomitan transform ids it shares the ending with]
const BOTH = [
    ['plural', (r) => !r.stemChange && ['ס', 'ן', 'ען', 'ער', 'ים', 'עס', 'ות'].includes(ending(r)), ['plural']],
    ['plural', (r) => r.stemChange && ending(r) === 'ער' && VOWEL_PAIRS.has(change(r.stemChange)), ['umlaut_plural']],
    ['plural', (r) => r.stemChange && ending(r) === 'ן' && change(r.stemChange) === 'יי>וי', ['umlaut_plural']],
    ['diminutivePlural', (r) => ending(r).endsWith('עך'), ['plural']],
    ['diminutive', (r) => !r.stemChange && ['ל', 'עלע', 'קע', 'טשיק'].includes(ending(r)) && r.deinflected === '', ['diminutive']],
    ['diminutive', (r) => r.stemChange && ['ל', 'עלע'].includes(ending(r)) && VOWEL_PAIRS.has(change(r.stemChange)), ['diminutive_and_umlaut']],
    ['2sg', (r) => r.type === 'suffix' && ending(r).endsWith('סט'), ['verb_present_singular_to_first_person']],
    ['3sg', (r) => r.type === 'suffix' && ending(r).endsWith('ט'),
        ['verb_present_singular_to_first_person', 'verb_present_plural_to_first_person']],
    ['presentParticiple', (r) => ending(r).endsWith('נדיק'), ['verb_present_singular_to_first_person']],
];

const shared = new Map();  // Yomitan transform id -> number of own rules marked both for it
let marked = 0;
for (const t of own.transforms) {
    t.source = 'own';
    for (const rule of t.rules) {
        delete rule.source;
        const hits = BOTH.filter(([id, test]) => id === t.id && test(rule));
        if (hits.length > 0) {
            rule.source = 'both';
            ++marked;
            for (const [, , ids] of hits) {
                for (const id of ids) { shared.set(id, (shared.get(id) ?? 0) + 1); }
            }
        }
    }
}
writeFileSync(join(pack, 'transforms.json'), formatTransforms(own));

// Each Yomitan rule: the own rules that read its ending, or why none does.
const NONE = {
    'plural:נס': 'reads -נס as the ending (צייכנס → צייכ); the own rules remove -ס after ן (צייכנס → צייכן)',
    'plural:ערען': 'no such standard plural; the own rules read -ען after -ער (קאַמערן → קאַמער)',
    'plural:ענעס': 'no such standard plural',
    'plural:ענס': 'no such standard plural',
    'plural:ערס': 'no such standard plural ending; the own rules read -ס after -ער (לערערס → לערער)',
    'plural:סער': 'no such plural ending',
    'verb_present_plural_to_first_person:טס': 'dialect second person plural (-טס); reads וועלטס (the world\'s) as וועלן',
};
const rows = ['# Yomitan rule (sources/yomitan.json) <TAB> ending <TAB> vowel change <TAB> own rules that read the same ending (marked both), or why none does'];
for (const t of yomitan.transforms) {
    t.rules.forEach((rule, i) => {
        const pair = change(rule.stemChange) ?? '';
        const key = `${t.id}:${rule.inflected}`;
        let own = NONE[key];
        if (own === undefined) {
            const ids = BOTH.filter(([, test, ys]) => ys.includes(t.id) && own_rules_for(t.id, rule, test)).map(([id]) => id);
            own = ids.length > 0 ? [...new Set(ids)].join(', ')
                : pair === '' ? 'none: no own rule reads this ending'
                    : 'none: the own rules read this ending without this vowel change (a changed vowel goes with -ער, -ל, -עלע or no ending)';
        }
        rows.push(`${t.id}[${i}]\t${rule.inflected}\t${pair}\t${own}`);
    });
}
function own_rules_for(yomitanId, rule, test) {
    const pair = change(rule.stemChange);
    const same = (r) => ending(r) === rule.inflected || (rule.inflected === 'עך' && ending(r).endsWith('עך'));
    return own.transforms.some((t) => t.rules.some((r) => test(r) && same(r) && change(r.stemChange) === pair))
        || (yomitanId.startsWith('verb_') && own.transforms.some((t) => t.rules.some((r) => test(r) && ending(r).endsWith(rule.inflected))));
}
writeFileSync(join(here, 'yomitan-provenance.tsv'), rows.join('\n') + '\n');
const rules = own.transforms.reduce((n, t) => n + t.rules.length, 0);
console.log(`yi: ${own.transforms.length} transforms, ${rules} rules (${rules - marked} own, ${marked} both, 0 yomitan) in transforms.json; `
    + `${rows.length - 1} Yomitan rules in yomitan-provenance.tsv`);
