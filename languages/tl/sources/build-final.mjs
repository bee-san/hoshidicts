#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/tl/transforms.json, the final rule set (docs/languages.md,
// section 14 step 5), and sets the reasons of tests/yomitan.tsv:
//
//   node languages/tl/sources/build-final.mjs
//
// 1. The union of sources/own.json and sources/yomitan.json, as
//    tools/merge-transforms.mjs makes it.
// 2. An own rule that makes a deinflection a Yomitan rule makes (the same rule
//    type and affixes) is marked `both`, whether or not the Yomitan rule
//    stays.
// 3. A Yomitan rule is left out when an own rule repeats it: the same type
//    and affixes, and the own rule accepts every stem the Yomitan rule
//    accepts (each of the own rule's stem constraints and stem changes is
//    also the Yomitan rule's). A Yomitan rule that an own rule only narrows
//    stays, so nothing it reads is lost.
// 4. The Yomitan transforms in REMOVED and the single Yomitan rules in
//    REMOVED_RULES are left out, each for the harm README.md (Rule
//    provenance) measures.
// 5. The own rules written after Yomitan's rules were read, as constrained
//    versions of them (DERIVED), are marked `yomitan`: they are ported, not
//    written independently.
// 6. The own transforms come first, in sources/own.json's order, then the
//    Yomitan transforms that remain, so that where both reach a term with
//    the same number of steps, the own trace is the one a lookup keeps.
// 7. A row of tests/yomitan.tsv whose reasons name a transform the final set
//    does not have gets the reasons `*` (the final rules reach its term
//    through their own transforms); sources/yomitan.json passes the file with
//    Yomitan's reasons, which README.md reports.

import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isMain} from '../../../tools/lib/cli.mjs';
import {formatTransforms} from '../../../tools/lib/json.mjs';
import {mergeTransforms} from '../../../tools/merge-transforms.mjs';

const pack = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => JSON.parse(readFileSync(join(pack, name), 'utf8'));

// Yomitan transforms left out of the final set, with the harm each does in
// the union (README.md, Rule provenance, has the numbers and the commands).
export const REMOVED = {
    '-an': 'on Tatoeba, wrong first results only (Talagang -> Talag, Abenang -> Abe, matandaan -> matanda); the own -an reaches its right readings',
    '-in': 'on Tatoeba, wrong first results only (ring -> d, Alin -> Al, Kunin -> Ko, Basahin -> Basa)',
    '-ng': 'breaks 4 negatives (ang -> a, lang -> la, nang -> na, sang -> sa); malalaking -> lalaki first',
    'ma-': 'breaks the negative mama -> ma; on Tatoeba, wrong first results only (mag -> g, Max -> x, mapo -> po)',
    'i-': 'breaks the negatives ina -> na and isa -> sa; on Tatoeba, wrong first results only (Io -> o, ice -> ce, ID -> d)',
    'ka-': 'breaks the negatives kasi -> si, kaya -> ya and kanya -> nya; the own ka- (a root of four letters) keeps its right readings',
    'pa-': 'breaks the negatives paano -> ano, papa -> pa and pala -> la; paano ba -> ano ba, pay -> y first; the own pa- keeps its right readings',
    'pala-': 'palala -> la and palaga -> ga first; the own pala- keeps palatanong -> tanong',
    'mag-...-an': 'maghapunan -> hapo and magtanghalian -> tanghali first, against 5 right first results',
    'pag-': 'pagbibigay -> bibigay, pagbabayaran -> babayaran and paglalagyan -> lalagyan first, where the own rules give the root',
    'pag-...-in': 'pagbaunin -> bao and pagyamanin -> yama first',
    'ma-...-an': 'Marian -> di and malalakaran -> lumakad first',
    'ma-...-in': 'magasin -> gas, mafin -> f, Makasin -> kas first (33 positions) against 6 right; the own ma- -in needs a root of four letters',
    'magpa-': 'magpasa -> sa first (no minimum root); the own magpa- keeps magpaamo -> amo and magpauna -> una',
    'tag-': 'tagalog -> alog first (16 positions in the Gutenberg texts); the own tag- needs the hyphen before a vowel',
    'magsi-': 'magsi- + root collides with mag- + a root in si- (magsikap -> kap, magsimula -> mula, nagsisipilyo -> pilyo); the own magsi- is tried after mag-',
    'magma-': 'magmahal. -> hal. first at the end of a sentence (4 Tatoeba positions) and magmasa -> sa; the own rules read its right forms through mag- and the contemplative',
    'pa-...-an': 'stems of one letter: papuan -> pu, padaan -> da, paman -> m first; the own pa- -an needs three letters',
    'makapang-': 'makapangahas -> ahas first at 12 of its 17 Gutenberg positions; the own maka- reads it as maka- + pangahas, and makapanggamot as maka- + manggamot',
};

// Single Yomitan rules left out, by `<transform id> <inflected affix>`, with
// their harm. Each is a prefix rule that an own rule makes with a stem
// constraint; without the constraint it reads only wrong first results on
// Tatoeba (T) and the two Gutenberg texts (G), measured with the pass copy.
// The rest of each transform stays (Yomitan's pang- and mapag- stay whole:
// they read pangdiyeta, mapagusisa).
export const REMOVED_RULES = {
    'mag- mag': 'a vowel after mag- without the hyphen: magubat -> ubat, magalak -> alak, magipit -> ipit (T 4, G 14)',
    'ipa- ipa': 'stems of two letters and phrases: ipasa -> sa, ipaalam mo -> alam mo (T 14)',
    'magka- magka': 'magkasing -> si (T 13)',
    'maka- maka': 'makaya -> ya, makal -> l, makaw -> w (T 4, G 4)',
    'maka- makar': 'makar -> d (T 1)',
    'ika- ika': 'ikasang -> sa, ikama -> ma (T 3, G 1)',
    'mang- mang': 'mango -> o (T 3)',
    'naka- naka': 'nakama -> ma, nakay -> y, nakawang -> wa (T 2, G 1)',
    'naka- nakar': 'nakar -> d (T 1, G 1)',
    'kaka- kaka': 'kakae -> e (T 1)',
    'mapa- mapa': 'mapala -> la, mapag -> g, mapasa -> sa (T 1, G 9)',
    'pakiki- pakiki': 'pakikita -> ta (G 1)',
};
export const ruleKey = (transform, rule) => `${transform.id} ${rule.inflected ?? rule.inflectedPrefix ?? rule.anchorPrefix ?? ''}`;

// Own rules added after Yomitan's rules were read, as constrained versions of
// them (README.md, History): the transforms ka, pa, pala, tag and maIn
// (Yomitan's ka-, pa-, pala-, tag-, ma-...-in), and the -unan, -unin,
// -ran -> d and pagkar-/pagkakar- rules (its -an, -in, sandwich and pagka-
// rules).
const DERIVED_TRANSFORMS = new Set(['ka', 'pa', 'pala', 'tag', 'maIn']);
function derived(transform, rule) {
    if (DERIVED_TRANSFORMS.has(transform.id)) { return true; }
    if (rule.type === 'suffix' && (rule.inflected === 'unin' || rule.inflected === 'unan')) { return true; }
    if (rule.type === 'prefix' && (rule.inflected === 'pagkar' || rule.inflected === 'pagkakar')) { return true; }
    if (rule.type === 'circumfix' && rule.suffixes !== undefined &&
        rule.suffixes.every(([inflected, deinflected]) => /^un(an|in)$/.test(inflected) || (inflected === 'ran' && deinflected === 'd'))) { return true; }
    return false;
}

// The fields of a rule that decide which stems it accepts.
const STEM_FIELDS = ['stemMinLength', 'stemCharacters', 'stemContains', 'stemStartsWith', 'stemEndsWith', 'stemNotStartsWith',
    'stemNotEndsWith', 'stemStartsWithText', 'stemNotStartsWithText', 'stemChange'];

/** True when every stem `yomitanRule` accepts, `ownRule` accepts too. */
export function acceptsAll(ownRule, yomitanRule) {
    return STEM_FIELDS.every((field) => ownRule[field] === undefined || JSON.stringify(ownRule[field]) === JSON.stringify(yomitanRule[field]));
}

/** Rule identity for steps 2 and 3: type and affixes (one key per pair of a cross product). */
export function keysOf(rule) {
    switch (rule.type) {
        case 'prefix':
        case 'suffix':
        case 'wholeWord':
        case 'replace':
            return [`${rule.type}\u0000${rule.inflected}\u0000${rule.deinflected}`];
        case 'circumfix': {
            const prefixes = rule.prefixes ?? [[rule.inflectedPrefix, rule.deinflectedPrefix]];
            const suffixes = rule.suffixes ?? [[rule.inflectedSuffix, rule.deinflectedSuffix]];
            return prefixes.flatMap(([ip, dp]) => suffixes.map(([is, ds]) => `circumfix\u0000${ip}\u0000${dp}\u0000${is}\u0000${ds}`));
        }
        default:
            return [];
    }
}

export function buildFinal() {
    const union = mergeTransforms(read('sources/own.json'), read('sources/yomitan.json')).transforms;

    const ownKeys = new Map();
    for (const transform of union.transforms) {
        if (transform.source === 'yomitan') { continue; }
        for (const rule of transform.rules) {
            for (const key of keysOf(rule)) {
                if (!ownKeys.has(key)) { ownKeys.set(key, []); }
                ownKeys.get(key).push(rule);
            }
        }
    }

    const ownTransforms = [];
    const yomitanTransforms = [];
    let duplicates = 0;
    let removedRules = 0;
    const markBoth = (rule) => { rule.source = 'both'; };
    for (const transform of union.transforms) {
        if (transform.source !== 'yomitan') {
            ownTransforms.push(transform);
            continue;
        }
        const rules = [];
        for (const rule of transform.rules) {
            const keys = keysOf(rule);
            // Step 2.
            for (const key of keys) { (ownKeys.get(key) ?? []).forEach(markBoth); }
            if (transform.id in REMOVED || ruleKey(transform, rule) in REMOVED_RULES) {
                ++removedRules;
                continue;
            }
            // Step 3.
            const repeated = keys.length > 0 && keys.every((key) => (ownKeys.get(key) ?? []).some((mine) => acceptsAll(mine, rule)));
            if (repeated) {
                ++duplicates;
                continue;
            }
            rules.push(rule);
        }
        if (rules.length > 0) { yomitanTransforms.push({...transform, rules}); }
    }

    // Step 5.
    let derivedRules = 0;
    for (const transform of ownTransforms) {
        for (const rule of transform.rules) {
            if (derived(transform, rule)) {
                rule.source = 'yomitan';
                ++derivedRules;
            }
        }
    }

    // A transform whose rules all have one source says so itself.
    for (const transform of ownTransforms) {
        const sources = new Set(transform.rules.map((r) => r.source ?? transform.source));
        if (sources.size === 1) {
            transform.source = [...sources][0];
            for (const rule of transform.rules) { delete rule.source; }
        }
    }

    const final = {schema: 1, conditions: union.conditions, wordLists: union.wordLists ?? {}, transforms: [...ownTransforms, ...yomitanTransforms]};
    writeFileSync(join(pack, 'transforms.json'), formatTransforms(final));

    const count = (pred) => final.transforms.reduce((n, t) => n + t.rules.filter((r) => pred(r.source ?? t.source)).length, 0);
    console.log(`transforms.json: ${final.transforms.length} transforms, ${count(() => true)} rules ` +
        `(${count((s) => s === 'own')} own, ${count((s) => s === 'yomitan')} yomitan, ${count((s) => s === 'both')} both); ` +
        `${duplicates} Yomitan rules an own rule repeats left out, ${removedRules} Yomitan rules removed ` +
        `(${Object.keys(REMOVED).length} transforms and ${Object.keys(REMOVED_RULES).length} single rules), ` +
        `${derivedRules} own rules written after Yomitan's were read marked yomitan`);

    // Step 6: tests/yomitan.tsv.
    const ids = new Set(final.transforms.map((t) => t.id));
    const tsv = join(pack, 'tests', 'yomitan.tsv');
    let changed = 0;
    const lines = readFileSync(tsv, 'utf8').split('\n').map((line) => {
        const cells = line.split('\t');
        if (line.startsWith('#') || cells.length !== 6 || cells[5] === '*') { return line; }
        if (cells[5].split('|').every((id) => ids.has(id))) { return line; }
        ++changed;
        return [...cells.slice(0, 5), '*'].join('\t');
    });
    writeFileSync(tsv, lines.join('\n'));
    console.log(`tests/yomitan.tsv: ${changed} rows given the reasons * (their Yomitan transform is not in the final set)`);
}

if (isMain(import.meta.url)) { buildFinal(); }
