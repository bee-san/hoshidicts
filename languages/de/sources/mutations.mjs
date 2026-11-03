#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// The mutation check of README.md (docs/languages.md 14, step 7). Not run by
// any test. For each stem constraint, exclusion, word list and processor the
// pack adds, it writes a scratch copy of languages/de/ without it, writes
// that copy's tests/classes.json and runs language-conformance-test on it.
// Every mutation must make a test fail.
//
//   node languages/de/sources/mutations.mjs <scratch dir> [--conformance build/language-conformance-test] [--only <name>]

import {spawnSync} from 'node:child_process';
import {cpSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatJson, formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..', '..');
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const scratch = resolve(args[0] ?? '');
const conformance = resolve(option('--conformance', join(root, 'build', 'language-conformance-test')));
const only = option('--only', null);
if (args[0] === undefined || args[0].startsWith('--')) {
    console.error('usage: node languages/de/sources/mutations.mjs <scratch dir> [--conformance <language-conformance-test>] [--only <name>]');
    process.exit(2);
}

const transforms = () => JSON.parse(readFileSync(join(here, '..', 'transforms.json'), 'utf8'));
const language = () => JSON.parse(readFileSync(join(here, '..', 'language.json'), 'utf8'));
const byId = (t, id) => {
    const found = t.transforms.find((x) => x.id === id);
    if (found === undefined) { throw new Error(`no transform ${id}`); }
    return found;
};
/** The rules of a transform that match a test; at least one must. */
const rules = (t, id, test) => {
    const found = byId(t, id).rules.filter(test);
    if (found.length === 0) { throw new Error(`no rule of ${id} matches`); }
    return found;
};
const suffixRule = (inflected, deinflected) => (r) => r.type === 'suffix' && r.inflected === inflected && r.deinflected === deinflected;
const listedVerbRules = (t) => t.transforms.flatMap((x) => x.rules.filter((r) => r.type === 'circumfix' && r.prefixes?.length === 1 && r.prefixes[0][0] === '' && r.conditionsOut.includes('v')));
const separated = (t) => rules(t, 'separated-prefix', (r) => r.type === 'pattern');

// name -> function(transforms, language) that changes them in place
const MUTATIONS = {
    'present-du st after s ß x z': (t) => { for (const r of rules(t, 'present-du', suffixRule('st', 'en'))) { delete r.stemNotEndsWith; } },
    'present-du est only after d t m n': (t) => { for (const r of rules(t, 'present-du', suffixRule('est', 'en'))) { delete r.stemEndsWith; } },
    'present-er et only after d t m n': (t) => { for (const r of rules(t, 'present-er', suffixRule('et', 'en'))) { delete r.stemEndsWith; } },
    'regular endings: minimum stem 2': (t) => { for (const id of ['present-ich', 'present-du', 'present-er', 'past', 'past-du', 'past-wir', 'past-ihr']) { for (const r of byId(t, id).rules) { if (r.stemMinLength === 2) { r.stemMinLength = 1; } } } },
    'stems without a space': (t) => { for (const x of t.transforms) { for (const r of x.rules) { if (r.stemCharacters === '{stemChar}') { delete r.stemCharacters; } } } },
    'verb and adjective endings only in small letters': (t) => { for (const x of t.transforms) { for (const r of x.rules) { if (r.stemStartsWith === '{lower}') { delete r.stemStartsWith; } } } },
    'imperative: not after a vowel, d or t': (t) => { for (const r of rules(t, 'imperative', suffixRule('', 'en'))) { delete r.stemEndsWith; } },
    'imperative: not schloß': (t) => { for (const r of rules(t, 'imperative', suffixRule('', 'en'))) { delete r.stemNotStartsWithText; } },
    'listed verb forms not after c': (t) => { for (const r of listedVerbRules(t)) { delete r.stemNotEndsWith; } },
    'separated: no article as the verb': (t) => { for (const r of separated(t)) { r.pattern = r.pattern.replace(/^\^\(\?![^)]*\) \)/u, '^'); } },
    'separated: only finite verbs (sep)': (t) => { for (const r of separated(t)) { r.conditionsOut = ['sep', 'v']; } },
    'separated: needs the end of the clause': (t) => {
        const r = separated(t)[0];
        byId(t, 'separated-prefix').rules.push({...r, pattern: r.pattern.replace(/\\\.\$$/u, '$'), anchorSuffix: ' an'});
    },
    'separated: und and oder end a clause': (t) => { const x = byId(t, 'separated-prefix'); x.rules = x.rules.filter((r) => r.type !== 'pattern' || ![' und', ' oder'].includes(r.anchorSuffix)); },
    'separated: particle list emptied but an': (t) => { for (const r of separated(t)) { r.pattern = r.pattern.replace(/ \(([^)]*)\)/u, ' (an)'); } },
    'zu-infinitive: particle list emptied but an': (t) => { for (const r of rules(t, 'zu-infinitive', (x) => x.type === 'circumfix')) { r.prefixes = [['anzu', 'an']]; } },
    'nouns read in small letters': (t) => { for (const x of t.transforms) { for (const r of x.rules) { if (r.stemStartsWith === '{lowerInitial}') { r.stemStartsWith = '{upper}'; } } } },
    'nouns get their capital letter back': (t) => { for (const x of t.transforms) { for (const r of x.rules) { if (r.then !== undefined) { delete r.then; } } } },
    'plural n only after e l r': (t) => { for (const r of rules(t, 'plural', suffixRule('n', ''))) { delete r.stemEndsWith; } },
    'plural s only after a vowel': (t) => { for (const r of rules(t, 'plural', suffixRule('s', ''))) { delete r.stemEndsWith; } },
    'plural-s not after s ß x z': (t) => { for (const r of rules(t, 'plural-s', suffixRule('s', ''))) { r.stemEndsWith = '{consonant}'; } },
    'Latin plural en -> o only after d k t': (t) => { for (const r of rules(t, 'plural', suffixRule('en', 'o'))) { delete r.stemEndsWith; } },
    'Latin plural en -> is only after s x': (t) => { for (const r of rules(t, 'plural', suffixRule('en', 'is'))) { delete r.stemEndsWith; } },
    'Latin plural ien only after l p z': (t) => { for (const r of rules(t, 'plural', suffixRule('ien', ''))) { delete r.stemEndsWith; } },
    'umlaut plural: last vowel before consonants': (t) => { for (const r of byId(t, 'plural').rules) { if (r.stemChange?.between !== undefined) { r.stemChange.betweenMinLength = 0; delete r.stemChange.between; } } },
    'dative plural only after e l r': (t) => { for (const r of byId(t, 'dative-plural').rules) { delete r.stemEndsWith; } },
    'genitive s not after s ß x z': (t) => { for (const r of rules(t, 'genitive', suffixRule('s', ''))) { delete r.stemNotEndsWith; } },
    'genitive apostrophe only after s ß x z': (t) => { for (const r of rules(t, 'genitive', suffixRule("'", ''))) { delete r.stemEndsWith; } },
    'superlative st not after s ß x z': (t) => { for (const r of rules(t, 'superlative', suffixRule('st', ''))) { delete r.stemNotEndsWith; } },
    'superlative est only after d t s ß x z or a vowel': (t) => { for (const r of rules(t, 'superlative', suffixRule('est', ''))) { delete r.stemEndsWith; } },
    'declined teure only after u': (t) => { for (const r of rules(t, 'declined', (x) => x.type === 'suffix' && x.deinflected === 'er' && x.inflected.startsWith('r'))) { delete r.stemEndsWith; } },
    'adjectives before nouns': (t) => {
        const ids = ['declined', 'comparative', 'superlative'];
        const moved = t.transforms.filter((x) => ids.includes(x.id));
        t.transforms = t.transforms.filter((x) => !ids.includes(x.id));
        const at = t.transforms.findIndex((x) => x.id === 'dative-plural') + 1;
        t.transforms.splice(at, 0, ...moved);
    },
    'e-adjective endings written with the e': (t) => { for (const r of rules(t, 'declined', (x) => x.type === 'suffix' && x.deinflected === 'e' && ['en', 'er', 'es', 'em'].includes(x.inflected))) { r.inflected = r.inflected.slice(1); r.deinflected = ''; r.stemEndsWith = '[e]'; } },
    'dropped e of -eren and -erem': (t) => { const x = byId(t, 'declined'); x.rules = x.rules.filter((r) => !(r.type === 'suffix' && ['ern', 'erm'].includes(r.inflected) && r.deinflected === 'er')); },
    'old spellings of listed verb forms': (t) => {
        for (const r of listedVerbRules(t)) {
            const modern = new Set(r.suffixes.map(([inflected, lemma]) => `${inflected.replace(/ss(?=$|[^aeiouyäöü])/gu, 'ß')}\u0000${lemma}`)
                .filter((key, i) => key.split('\u0000')[0] !== r.suffixes[i][0]));
            r.suffixes = r.suffixes.filter(([inflected, lemma]) => !modern.has(`${inflected}\u0000${lemma}`));
        }
    },
    'Yomitan rules after the own ones': (t) => {
        const yomitan = t.transforms.filter((x) => x.source === 'yomitan');
        t.transforms = [...yomitan, ...t.transforms.filter((x) => x.source !== 'yomitan')];
    },
    'processor capitalizeWord': (_t, l) => { l.lookup.preprocessors = l.lookup.preprocessors.filter((p) => p.id !== 'capitalizeWord'); },
    'processor eszettPreprocessor': (_t, l) => { l.lookup.preprocessors = l.lookup.preprocessors.filter((p) => p.id !== 'eszettPreprocessor'); },
    'processor normalizeApostrophes': (_t, l) => { l.lookup.preprocessors = l.lookup.preprocessors.filter((p) => p.id !== 'normalizeApostrophes'); },
    'processor removeSoftHyphens': (_t, l) => { l.lookup.preprocessors = l.lookup.preprocessors.filter((p) => p.id !== 'removeSoftHyphens'); },
    'processor normalizeUnicode': (_t, l) => { l.lookup.preprocessors = l.lookup.preprocessors.filter((p) => p.id !== 'normalizeUnicode'); },
    'searchResolution character': (_t, l) => { l.lookup.searchResolution = 'word'; },
};

mkdirSync(scratch, {recursive: true});
let survivors = 0;
for (const [name, mutate] of Object.entries(MUTATIONS)) {
    if (only !== null && name !== only) { continue; }
    const dir = join(scratch, 'languages');
    rmSync(dir, {recursive: true, force: true});
    mkdirSync(dir, {recursive: true});
    cpSync(join(here, '..'), join(dir, 'de'), {recursive: true});
    const t = transforms();
    const l = language();
    mutate(t, l);
    writeFileSync(join(dir, 'de', 'transforms.json'), formatTransforms(t));
    writeFileSync(join(dir, 'de', 'language.json'), formatJson(l));
    const classes = spawnSync(process.execPath, [join(root, 'tools', 'check-classes.mjs'), 'de', '--write', '--languages', dir], {encoding: 'utf8'});
    const run = spawnSync(conformance, [join(dir, 'de'), join(root, 'build')], {encoding: 'utf8', maxBuffer: 1 << 28});
    const failures = `${run.stdout}\n${run.stderr}`.split('\n').filter((line) => line.startsWith('FAIL') && !line.includes('README.md'));
    const killed = classes.status !== 0 || failures.length > 0;
    if (!killed) { ++survivors; }
    console.log(`${killed ? 'killed  ' : 'SURVIVED'} ${name}${killed ? `: ${(failures[0] ?? classes.stderr.trim().split('\n')[0] ?? '').slice(0, 150)}` : ''}`);
}
console.log(`${Object.keys(MUTATIONS).length} mutations, ${survivors} survived`);
