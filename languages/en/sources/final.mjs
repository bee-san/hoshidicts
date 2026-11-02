#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/en/transforms.json, the final rule set (docs/languages.md,
// section 14 step 5): the union of sources/own.json and sources/yomitan.json
// as tools/merge-transforms.mjs makes it, without the rules listed in
// REMOVED, and with the transforms in OPTIONAL turned off unless a request
// enables them. README.md gives the measurements behind each entry.
//
//   node languages/en/sources/final.mjs [--out <file>] [--default-only]
//
// --default-only also leaves out the optional transforms: the rules a lookup
// uses when no option is on, for measuring them alone.

import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mergeTransforms} from '../../../tools/merge-transforms.mjs';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => JSON.parse(readFileSync(join(here, name), 'utf8'));

// Rules left out of the union: [transform id, source file, rule fields that
// identify it, reason]. Each must match exactly one rule of that file.
const S = (inflected, deinflected, conditionsIn, conditionsOut) => ({type: 'suffix', inflected, deinflected, conditionsIn, conditionsOut});
export const REMOVED = [
    ['plural', 'yomitan', S('s', '', ['np'], ['ns']), "own's -s has a stem of at least two letters not ending in s or ' (was -> wa, class -> clas)"],
    ['plural', 'yomitan', S('es', '', ['np'], ['ns']), 'cares -> car, hopes -> hop, rates -> rat; own rules list the endings that take -es'],
    ['plural', 'yomitan', S('ves', 'fe', ['np'], ['ns']), 'serves -> serfe, curves -> curfe; own rules list the -f and -fe nouns'],
    ['plural', 'yomitan', S('ves', 'f', ['np'], ['ns']), 'serves -> serf, proves -> prof, nerves -> nerf'],
    ['past', 'yomitan', S('ed', 'e', ['v'], ['v']), "bed -> be, red -> re, fed -> fe; own's -d after e needs a stem of three letters"],
    ['ing', 'yomitan', S('ing', 'e', ['v'], ['v']), "being -> bee, dying -> dye, lying -> lye; own's rule does not add e after a, e, i, o or y"],
    ['ing', 'yomitan', S('ing', '', ['v'], ['v']), 'a verb condition in and out lets it follow itself and other verb rules (feelings -> feel, bringing -> br); own -ing covers every row'],
    ['3rd pers. sing. pres', 'yomitan', S('s', '', ['v'], ['v']), 'has -> ha, was -> wa, process -> proces -> proc'],
    ['3rd pers. sing. pres', 'yomitan', S('es', '', ['v'], ['v']), 'makes -> mak, hopes -> hop, rates -> rat'],
    ['interposed object', 'yomitan', {type: 'interposedObject'}, "its particles include in, on, over and by, which after an object mostly start a prepositional phrase (put her foot on the table -> put on); own rule uses the particles that do not"],
    // These take a text that is already a verb or adjective, so in the union
    // they also apply to the output of an own rule for another ending.
    ...['dd', 'gg', 'nn', 'tt', 'rr'].map((cc) => ['ing', 'yomitan', S(`${cc}ing`, cc[0], ['v'], ['v']), 'follows own third-person -s: weddings -> wed, winnings -> win, beginnings -> begin, settings -> set, fittings -> fit']),
    ['comparative', 'yomitan', S('er', '', ['adj'], ['adj']), "no stem minimum and follows own -er: her -> h, per -> p, der -> d, trader -> trad"],
    ['superlative', 'yomitan', S('est', '', ['adj'], ['adj']), 'no stem minimum: west -> w, nest -> n, pest -> p, best -> b'],
    ['superlative', 'yomitan', S('est', 'e', ['adj'], ['adj']), 'after own -er makes semest of semester, it gives seme'],
    ['past', 'yomitan', S('ed', '', ['v'], ['v']), "no stem minimum: bed -> b, red -> r, med -> m; own -ed and own archaic -'d cover its rows"],
    ['archaic', 'yomitan', S("'d", 'ed', ['v'], ['v']), "no stem minimum: he'd -> heed, we'd -> weed; own archaic -'d needs a stem of three letters"],
    ['plural', 'yomitan', S('ies', 'y', ['np'], ['ns']), 'no stem minimum: pies -> py, dies -> dy; own -ies needs two letters before it'],
    ['past', 'yomitan', S('ied', 'y', ['v'], ['v']), 'no stem minimum: died -> dy, lied -> ly; own -ied needs two letters before it'],
    ['3rd pers. sing. pres', 'yomitan', S('ies', 'y', ['v'], ['v']), 'no stem minimum: dies -> dy, lies -> ly; own -ies needs two letters before it'],
    ['ing', 'yomitan', S('ying', 'ie', ['v'], ['v']), 'trying -> trie, crying -> crie (obsolete spellings Wiktionary lists); own rules list the -ie verbs (lying, dying, tying, vying)'],
    ['past', 'yomitan', S('cked', 'c', ['v'], ['v']), 'locked -> loc, ticked -> tic; own -cked needs an earlier vowel (panicked, trafficked)'],
    ['ing', 'yomitan', S('cking', 'c', ['v'], ['v']), 'locking -> loc, ticking -> tic, fracking -> frac'],
    ['past', 'yomitan', S('ssed', 's', ['v'], ['v']), 'pressed -> pres; own doubled s does not follow e'],
    ['ing', 'yomitan', S('ssing', 's', ['v'], ['v']), 'pressing -> pres'],
];

// Transforms that only an enabled option turns on: [id, reason].
export const OPTIONAL = [
    ['adverb', 'derivation, not inflection: only -> on, likely -> like; Wiktionary-based dictionaries list the adverbs'],
    ['-y', 'derivation: by -> b, my -> me, they -> thee, party -> part, early -> earl'],
    ['un-', 'derivation: under -> der, unless -> less, unit -> it'],
    ['-able', 'derivation: capable -> cap, available -> avail'],
    ['going-to future', 'hides the hovered word: going to school -> school'],
    ['will future', 'hides the hovered word: will paint -> paint'],
    ['imperative negative', "hides the hovered word: don't touch -> touch"],
];

function matches(rule, fields) {
    return Object.entries(fields).every(([key, value]) => JSON.stringify(rule[key]) === JSON.stringify(value));
}

/** Removes the listed rules from a source file, checking each matches one rule. */
function without(file, name) {
    const out = structuredClone(file);
    for (const [id, source, fields] of REMOVED) {
        if (source !== name) { continue; }
        const transform = out.transforms.find((t) => t.id === id);
        if (transform === undefined) { throw new Error(`REMOVED names no transform ${id} in ${name}.json`); }
        const hits = transform.rules.filter((rule) => matches(rule, fields));
        if (hits.length !== 1) { throw new Error(`REMOVED ${id} ${JSON.stringify(fields)} matches ${hits.length} rules of ${name}.json`); }
        transform.rules = transform.rules.filter((rule) => rule !== hits[0]);
    }
    return out;
}

export function finalTransforms({defaultOnly = false} = {}) {
    const {transforms} = mergeTransforms(without(read('own.json'), 'own'), without(read('yomitan.json'), 'yomitan'));
    for (const [id] of OPTIONAL) {
        const transform = transforms.transforms.find((t) => t.id === id);
        if (transform === undefined) { throw new Error(`OPTIONAL names no transform ${id}`); }
        transform.optional = true;
    }
    // Keep key order: id, name, description, source, optional, rules.
    transforms.transforms = transforms.transforms.map(({id, name, description, source, optional, i18n, rules}) => ({id, name, description, source, optional, i18n, rules}));
    if (defaultOnly) { transforms.transforms = transforms.transforms.filter((t) => !t.optional); }
    // A transform left without rules is dropped, and a word list no rule names
    // (Yomitan's particles, which only its removed interposed-object rule used).
    transforms.transforms = transforms.transforms.filter((t) => t.rules.length > 0);
    const named = new Set(transforms.transforms.flatMap((t) => t.rules.flatMap((r) => [r.followedBy, r.particles, r.guardWords])));
    transforms.wordLists = Object.fromEntries(Object.entries(transforms.wordLists ?? {}).filter(([key]) => named.has(key)));
    return transforms;
}

const args = process.argv.slice(2);
if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    const out = args.includes('--out') ? resolve(args[args.indexOf('--out') + 1]) : join(here, '..', 'transforms.json');
    const result = finalTransforms({defaultOnly: args.includes('--default-only')});
    writeFileSync(out, formatTransforms(result));
    const counts = {own: 0, yomitan: 0, both: 0};
    for (const t of result.transforms) {
        for (const rule of t.rules) { ++counts[rule.source ?? t.source]; }
    }
    console.log(`${out}: ${result.transforms.length} transforms, ${counts.own + counts.yomitan + counts.both} rules (${counts.own} own, ${counts.yomitan} yomitan, ${counts.both} both)`);
}
