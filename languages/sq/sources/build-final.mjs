#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/sq/transforms.json, sources/yomitan-provenance.tsv and
// the reasons of tests/yomitan.tsv (docs/languages.md, section 14 step 5):
//
//   node languages/sq/sources/build-final.mjs
//
// The final set is sources/own.json with every Yomitan rule left out (the
// README gives the numbers). An own rule is marked `both` when a Yomitan rule
// of the corresponding transform makes the same deinflection: the same rule
// type, and the same ending replaced by the same text, either exactly or with
// a common part in front (Yomitan's `va` → `j` is the own `ova` → `oj` on the
// stems Yomitan's rule reaches; Yomitan's `hemi` → `hem` is the own `emi` →
// `em` after h), and it was in the first own-rules commit (LATER lists those
// written after Yomitan's file was read). sources/yomitan-provenance.tsv lists, for each Yomitan rule,
// the own rules that make its deinflection. tests/yomitan.tsv keeps Yomitan's
// cases with `*` as reasons, since the final set has none of Yomitan's
// transform ids; the own rules reach all 98 lemmas.

import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pack = join(here, '..');
const own = JSON.parse(readFileSync(join(here, 'own.json'), 'utf8'));
const yomitan = JSON.parse(readFileSync(join(here, 'yomitan.json'), 'utf8'));

// Yomitan's transforms and the own transforms that make the same forms.
const persons = ['1sg', '2sg', '3sg', '1pl', '2pl', '3pl'];
const yomitanPerson = {'first-person singular': '1sg', 'second-person singular': '2sg', 'third-person singular': '3sg', 'first-person plural': '1pl', 'second-person plural': '2pl', 'third-person plural': '3pl'};
function counterparts(id) {
    const person = Object.entries(yomitanPerson).find(([words]) => id.includes(words))?.[1];
    if (id === 'definite') { return ['n-def-sg-m', 'n-def-nom-f', 'n-def-obl-f']; }
    if (id === 'singular definite accusative') { return ['n-def-acc-m', 'n-def-acc-f']; }
    if (id === 'plural') { return ['n-pl', 'n-def-pl']; }
    if (id === 'participle') { return ['ptcp']; }
    if (id === 'mediopassive') { return persons.flatMap((p) => [`np-pres-${p}`, `np-impf-${p}`]).concat(['np-imp-2sg', 'np-imp-2pl']); }
    // The own verbal-noun rule (vn) was written after Yomitan's rules were
    // read, so it is not `both`; no own rule of the same form was written before.
    if (id === 'nominalization') { return []; }
    if (id.startsWith('present indicative')) { return [person === '3sg' ? 'pres-2sg' : `pres-${person}`, `np-pres-${person}`]; }
    if (id.startsWith('imperfect')) { return [`impf-${person}`, `np-impf-${person}`]; }
    if (id.startsWith('aorist')) { return [`aor-${person}`, 'np-aor-3sg']; }
    if (id.startsWith('imperative second-person singular')) { return ['imp-2sg', 'np-imp-2sg']; }
    if (id.startsWith('imperative second-person plural')) { return ['pres-2pl', 'np-imp-2pl']; }
    if (id.startsWith('optative')) { return [`opt-${person}`]; }
    throw new Error(`no counterpart for Yomitan transform ${id}`);
}

const classes = JSON.parse(readFileSync(join(pack, 'language.json'), 'utf8')).classes;
/** The letters of a one-letter class such as `[ei]` or `{consonant}`. */
function letters(cls) {
    const body = cls.startsWith('{') ? classes[cls.slice(1, -1)] : cls;
    if (!body.startsWith('[') || body.startsWith('[^')) { throw new Error(`unexpected stem class ${cls}`); }
    return new Set([...body.slice(1, -1)]);
}
/** A stem whose last letter is `last` meets the rule's final-letter constraints. */
function fits(rule, last) {
    if (rule.stemEndsWith && !letters(rule.stemEndsWith).has(last)) { return false; }
    if (rule.stemNotEndsWith && letters(rule.stemNotEndsWith).has(last)) { return false; }
    return true;
}

/** The same deinflection: equal type and the same replacement, possibly with
 * a common part in front, which the shorter rule then reads as the end of its
 * stem: its final-letter class must allow it (own `` → `j` after e or i is not
 * Yomitan's `o` → `oj`). */
function same(a, b) {
    if (a.type !== b.type || a.type !== 'suffix') { return false; }
    const [long, short] = a.inflected.length >= b.inflected.length ? [a, b] : [b, a];
    if (!long.inflected.endsWith(short.inflected) || !long.deinflected.endsWith(short.deinflected)) { return false; }
    const front = long.inflected.slice(0, long.inflected.length - short.inflected.length);
    if (long.deinflected !== front + short.deinflected) { return false; }
    return front === '' || fits(short, [...front].at(-1));
}

// Own rules written after Yomitan's file was read (their transform, ending
// and replacement are not in the first commit of this pack, `sq: own
// rules`, whose hash changes when lang/sq is rebased and which a squash
// merge leaves out of main, so the list is written out here): they are
// not `both`, whatever Yomitan has (section 7.1: `both` is written
// independently and also in Yomitan).
const MASCULINE_E = ['djal', 'kal', 'lum', 'uj', 'gjum', 'burr', 'brum', 'djath', 'gjalp', 'drith', 'dhjam', 'mjalt', 'grur', 'dyll', 'ball', 'vrer', 'lëm', 'at', 'qir', 'bab', 'mam'];
const LATER = new Set([
    'n-def-sg-m\u0000oi\u0000ua', 'np-aor-3sg\u0000ye\u0000ej',
    // After audit-hachi-lang-sq-b: noun and present rules at the longer endings.
    'n-def-nom-f\u0000ta\u0000të', 'n-def-nom-f\u0000ka\u0000kë', 'n-def-acc-f\u0000ën\u0000ë', 'pres-2sg\u0000uan\u0000uaj', 'n-def-nom-f\u0000ja\u0000jë', 'n-def-nom-f\u0000jta\u0000jtë', 'n-def-acc-f\u0000jtën\u0000jtë',
    // After audit-hachi-lang-sq-d.
    'n-def-sg-m\u0000uni\u0000un',
    ...['np-pres-2sg:hesh', 'np-pres-3sg:het', 'np-pres-1pl:hemi', 'np-pres-2pl:heni', 'np-pres-3pl:hen',
        'np-impf-1sg:hesha', 'np-impf-2sg:heshe', 'np-impf-3sg:hej', 'np-impf-1pl:heshim', 'np-impf-2pl:heshit', 'np-impf-3pl:heshin',
        'np-imp-2sg:hu', 'np-imp-2pl:huni'].map((x) => { const [id, end] = x.split(':'); return `${id}\u0000${end}\u0000hem`; }),
    ...MASCULINE_E.flatMap((stem) => [['n-def-sg-m', 'i'], ['n-def-acc-m', 'in'], ['n-def-obl-m', 'it']].map(([id, end]) => `${id}\u0000${stem}${end}\u0000${stem}ë`)),
]);

const rows = ['# Yomitan rule (transform, index, inflected → deinflected) and the own rules that make the same deinflection; written by sources/build-final.mjs', '# yomitan_transform\trule\tinflected\tdeinflected\town_rules'];
const both = new Set();
let paired = 0;
for (const t of yomitan.transforms) {
    const targets = new Set(counterparts(t.id));
    t.rules.forEach((rule, index) => {
        const matches = [];
        for (const o of own.transforms) {
            if (!targets.has(o.id)) { continue; }
            o.rules.forEach((r, i) => {
                if (same(rule, r) && !LATER.has(`${o.id}\u0000${r.inflected}\u0000${r.deinflected}`)) {
                    matches.push(`${o.id}[${i}] ${r.inflected} → ${r.deinflected}`);
                    both.add(`${o.id}\u0000${i}`);
                }
            });
        }
        if (matches.length > 0) { ++paired; }
        rows.push([t.id, index, rule.inflected, rule.deinflected, matches.length > 0 ? matches.join('; ') : '(none)'].join('\t'));
    });
}

const counts = {own: 0, both: 0};
const transforms = own.transforms.map((t) => {
    const rules = t.rules.map((r, i) => {
        const source = both.has(`${t.id}\u0000${i}`) ? 'both' : 'own';
        ++counts[source];
        return source === 'own' ? {...r} : {...r, source: 'both'};
    });
    const sources = new Set(rules.map((r) => r.source ?? 'own'));
    const transformSource = sources.size === 1 && sources.has('both') ? 'both' : 'own';
    const out = {id: t.id, name: t.name, description: t.description, source: transformSource};
    out.rules = rules.map((r) => {
        const {source, ...rest} = r;
        const s = source ?? 'own';
        return s === transformSource ? rest : {...rest, source: s};
    });
    return out;
});
writeFileSync(join(pack, 'transforms.json'), formatTransforms({schema: 1, conditions: own.conditions, transforms}));
writeFileSync(join(here, 'yomitan-provenance.tsv'), rows.join('\n') + '\n');

// tests/yomitan.tsv: Yomitan's cases, reasons `*`.
const testFile = join(pack, 'tests', 'yomitan.tsv');
const lines = readFileSync(testFile, 'utf8').split('\n');
writeFileSync(testFile, lines.map((line) => {
    if (line.startsWith('#') || line === '') { return line; }
    const cells = line.split('\t');
    cells[5] = '*';
    return cells.join('\t');
}).join('\n'));

const yomitanRules = yomitan.transforms.reduce((n, t) => n + t.rules.length, 0);
console.log(`sq: transforms.json ${transforms.length} transforms, ${counts.own + counts.both} rules (${counts.own} own, ${counts.both} both, 0 yomitan); ${paired} of ${yomitanRules} Yomitan rules have an own counterpart`);
