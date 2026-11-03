#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// The check of docs/languages.md section 14 step 7: in a scratch copy of the
// pack, each stem constraint, exclusion and word group the own rules add is
// taken out on its own, tests/classes.json is written again, and
// language-conformance-test runs on the copy. A mutation no test notices
// needs a row. Not run by any test.
//
//   node languages/tl/sources/ablate.mjs [--cli-dir build]
//
// Prints one line per mutation: its name, the number of rules it changes,
// and the conformance test's failures (the first one named), or "no test
// fails".
import {execFileSync, spawnSync} from 'node:child_process';
import {cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const pack = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(pack, '..', '..');
const args = process.argv.slice(2);
const buildDir = args.includes('--cli-dir') ? args[args.indexOf('--cli-dir') + 1] : join(repo, 'build');
const original = JSON.parse(readFileSync(join(pack, 'transforms.json'), 'utf8'));

const own = (t, r) => (r.source ?? t.source) !== 'yomitan';
const has = (key, value) => (t, r) => own(t, r) && (value === undefined ? r[key] !== undefined : r[key] === value);
const drop = (key) => (r) => { const {[key]: _, ...rest} = r; return rest; };
const set = (key, value) => (r) => ({...r, [key]: value});
const inT = (ids) => (t) => ids.includes(t.id);

// Each mutation: [name, rule predicate (transform, rule), rule edit] or a whole-transform edit.
const MUTATIONS = [
    ['linker: stem of two letters', (t, r) => t.id === 'linker' && r.type === 'suffix', set('stemMinLength', 2)],
    ['linker: stem may hold a space', (t, r) => t.id === 'linker' && r.type === 'suffix', drop('stemCharacters')],
    ['linker: no listed short forms', (t, r) => t.id === 'linker' && r.type === 'wholeWord' && r.inflected.length === 4, null],
    ['linker: no -g after n list', (t, r) => t.id === 'linker' && r.type === 'wholeWord' && r.inflected.length > 4, null],
    ['linker: no phrase patterns', (t, r) => t.id === 'linker' && r.type === 'pattern', null],
    ['copied syllable: any vowel after it', has('stemStartsWithText'), (r) => (r.stemStartsWithText.length === 1 ? drop('stemStartsWithText')(r) : r)],
    ['-in/-an: capitalised stems allowed', has('stemNotStartsWith'), drop('stemNotStartsWith')],
    ['one word: stems may hold a space', (t, r) => own(t, r) && r.stemCharacters === '[^ ]', drop('stemCharacters')],
    ['-an: after mag- too', has('stemNotStartsWithText', 'mag'), drop('stemNotStartsWithText')],
    ['magpa-/mapa-: three-letter consonant roots', (t, r) => inT(['magpa', 'mapa'])(t) && r.stemStartsWith !== undefined && r.stemMinLength === 4, set('stemMinLength', 3)],
    ['ka-/pa-: three-letter roots', (t, r) => inT(['ka', 'pa'])(t) && r.stemMinLength === 4, set('stemMinLength', 3)],
    ['pala-: three-letter roots', (t, r) => t.id === 'pala' && r.stemMinLength === 4, set('stemMinLength', 3)],
    ['ka-/pa-/pala-: roots may hold a space', (t, r) => inT(['ka', 'pa', 'pala'])(t), drop('stemCharacters')],
    ['ka- -an: three-letter roots', (t, r) => t.id === 'kaAn' && r.stemMinLength === 4, set('stemMinLength', 3)],
    ['ma- -in: three-letter roots', (t, r) => t.id === 'maIn' && r.stemMinLength === 4, set('stemMinLength', 3)],
    ['pang-: three letters after a merged consonant', (t, r) => t.id === 'pang' && r.stemMinLength === 4, set('stemMinLength', 3)],
    ['tag-: before a vowel without the hyphen', (t, r) => t.id === 'tag' && r.stemStartsWith !== undefined, drop('stemStartsWith')],
    ['prefixes: first letter after the consonant any', (t, r) => own(t, r) && r.stemStartsWith === '[aeioulrwy]', drop('stemStartsWith')],
    ['d -> r: any vowel after it', (t, r) => own(t, r) && /^\[[aeiou]\]$/.test(r.stemStartsWith ?? ''), drop('stemStartsWith')],
    ['prefix reduplication: no straight-to-root rules', (t, r) => inT(['progressive', 'contemplative'])(t) && r.type === 'prefix' && r.deinflected === '' && /^[mn]ak|^[mn]agpap|^[mn]agkak/.test(r.inflected), null],
    // The one-word constraint of each transform on its own (the mutation
    // above takes them all out at once).
    ...['objectIn', 'locativeAn', 'maAn', 'makaAn', 'paAn', 'pagAn', 'pagIn', 'paIn', 'kaAn', 'ka', 'pa', 'pala', 'mang', 'paki', 'gerund', 'recentlyCompleted', 'pang'].map((id) => [
        `one word: ${id} stems may hold a space`, (t, r) => t.id === id && r.stemCharacters === '[^ ]', drop('stemCharacters')]),
    ['one word: magsi- patterns may read into the next word', (t, r) => t.id === 'magsi' && r.type === 'pattern' && r.pattern.includes('(?![^ ]* )'),
        (r) => ({...r, pattern: r.pattern.replace('(?![^ ]* )', '')})],
    ["'y: after a consonant too", (t, r) => t.id === 'contractionAy', drop('stemEndsWith')],
    ["'y: a stem of one letter", (t, r) => t.id === 'contractionAy', drop('stemMinLength')],
    ['ka- -an: no u -> o', (t, r) => t.id === 'kaAn' && (r.stemChange !== undefined || JSON.stringify(r.suffixes ?? []).includes('"u')), null],
    // Each word of the -g after n list on its own.
    ...['noong', 'naming', 'saang', 'kanang', 'hapong', 'bayang', 'labang'].map((form) => [
        `linker: no ${form} -> ${form.slice(0, -1)}`, (t, r) => t.id === 'linker' && r.type === 'wholeWord' && r.inflected === form, null]),
];
// Processor edits: [name, edit of language.json].
const PROCESSORS = [
    ['oldNg: G̃ kept', (language) => {
        for (const p of language.lookup.preprocessors) {
            if (p.id === 'oldNg') { for (const variant of p.variants) { for (const step of variant) { delete step.map?.['G̃']; } } }
        }
        return language;
    }],
];
const ORDER = [
    ['nakaka- after the aspect rules', (transforms) => {
        const i = transforms.findIndex((t) => t.id === 'nakaka');
        const [t] = transforms.splice(i, 1);
        transforms.splice(transforms.findIndex((x) => x.id === 'recentlyCompleted') + 1, 0, t);
        return transforms;
    }],
    ['ma- -an after -an', (transforms) => {
        const i = transforms.findIndex((t) => t.id === 'maAn');
        const [t] = transforms.splice(i, 1);
        transforms.splice(transforms.findIndex((x) => x.id === 'locativeAn') + 1, 0, t);
        return transforms;
    }],
    ['magsi- before mag-', (transforms) => {
        const i = transforms.findIndex((t) => t.id === 'magsi');
        const [t] = transforms.splice(i, 1);
        transforms.splice(transforms.findIndex((x) => x.id === 'mag'), 0, t);
        return transforms;
    }],
];

function run(name, transforms, changed, language = null) {
    const dir = mkdtempSync(join(tmpdir(), 'tl-ablate-'));
    try {
        cpSync(pack, join(dir, 'tl'), {recursive: true});
        writeFileSync(join(dir, 'tl', 'transforms.json'), formatTransforms({...original, transforms}));
        if (language !== null) { writeFileSync(join(dir, 'tl', 'language.json'), `${JSON.stringify(language, null, 2)}\n`); }
        execFileSync('node', [join(repo, 'tools', 'check-classes.mjs'), 'tl', '--write', '--languages', dir], {stdio: 'ignore'});
        const result = spawnSync(join(buildDir, 'language-conformance-test'), [join(dir, 'tl')], {encoding: 'utf8'});
        const fails = (result.stdout + result.stderr).split('\n').filter((l) => l.startsWith('FAIL'));
        console.log(`${name} (${changed} rules): ${fails.length ? `${fails.length} failures, first: ${fails[0].replace(/^FAIL tl: /, '')}` : 'no test fails'}`);
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
}

for (const [name, predicate, edit] of MUTATIONS) {
    let changed = 0;
    const transforms = original.transforms.map((t) => ({...t, rules: t.rules.flatMap((r) => {
        if (!predicate(t, r)) { return [r]; }
        ++changed;
        return edit === null ? [] : [edit(r)];
    })})).filter((t) => t.rules.length > 0);
    run(name, transforms, changed);
}
for (const [name, reorder] of ORDER) {
    run(name, reorder(structuredClone(original.transforms)), 'order');
}
for (const [name, edit] of PROCESSORS) {
    run(name, original.transforms, 'processor', edit(JSON.parse(readFileSync(join(pack, 'language.json'), 'utf8'))));
}
