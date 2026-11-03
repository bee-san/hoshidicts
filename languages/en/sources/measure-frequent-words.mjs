#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// "Frequent words with a wrong candidate" of README.md (Measurements). Not run
// by any test.
//
//   node languages/en/sources/measure-frequent-words.mjs <inputs dir> <unimorph eng> <transforms.json>...
//       [--cli build/hoshidicts-cli] [--languages languages] [--no-options] [--show N]
//
// <inputs dir> holds what sources/measure-inputs.py writes. For each frequent
// word, the deinflections hoshidicts-cli gives (every optional transform on,
// unless --no-options) are checked against the dictionary: a deinflected text
// is a candidate when it is a headword whose rules pass the part-of-speech
// filter (docs/languages.md 7.2: the text's conditions are empty or overlap
// the conditions of one of the headword's tags). It is a wrong candidate when
// it is neither the word itself nor a lemma the dictionary's form-of rows or
// UniMorph give for the word. Prints, per transforms file, the number of
// words with at least one wrong candidate.

import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const cli = option('--cli', 'build/hoshidicts-cli');
const languages = option('--languages', 'languages');
const show = Number(option('--show', '0'));
const positional = args.filter((a, i) => !a.startsWith('--') && !['--cli', '--languages', '--show'].includes(args[i - 1]));
const [inputs, unimorph, ...transformFiles] = positional;
if (!inputs || !unimorph || transformFiles.length === 0) {
    console.error('usage: measure-frequent-words.mjs <inputs dir> <unimorph eng> <transforms.json>... [--cli <hoshidicts-cli>] [--languages <dir>] [--no-options] [--show N]');
    process.exit(2);
}

const lines = (file) => readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
const words = lines(join(inputs, 'frequent-words.tsv')).map(([word]) => word);
const wanted = new Set(words);
const tags = new Map();
for (const [expression, rules = ''] of lines(join(inputs, 'headwords.tsv'))) {
    const set = tags.get(expression) ?? new Set();
    for (const tag of rules.split(' ')) { if (tag) { set.add(tag); } }
    tags.set(expression, set);
}
const right = new Map();
const addRight = (form, lemma) => {
    if (!wanted.has(form)) { return; }
    const set = right.get(form) ?? new Set([form]);
    set.add(lemma);
    right.set(form, set);
};
for (const [form, lemma] of lines(join(inputs, 'redirects.tsv'))) { addRight(form, lemma); }
for (const [lemma, form] of lines(unimorph)) { addRight(form, lemma); }

for (const file of transformFiles) {
    const {conditions} = JSON.parse(readFileSync(file, 'utf8'));
    const leaves = (key) => (conditions[key].subConditions ? conditions[key].subConditions.flatMap(leaves) : [key]);
    const tagLeaves = new Map(Object.entries(conditions).filter(([, c]) => c.isDictionaryForm).map(([key]) => [key, new Set(leaves(key))]));
    const passes = (text, textConditions) => {
        const t = tags.get(text);
        if (t === undefined) { return false; }
        if (textConditions.length === 0) { return true; }
        return [...t].some((tag) => textConditions.some((c) => tagLeaves.get(tag)?.has(c)));
    };
    const run = spawnSync(cli, ['--languages', languages, 'deinflect', 'en', '--stdin', ...(args.includes('--no-options') ? [] : ['--all-options']), '--transforms', file],
        {input: `${words.join('\n')}\n`, maxBuffer: 2 ** 30});
    if (run.status !== 0) {
        console.error(run.stderr.toString());
        process.exit(1);
    }
    let withWrong = 0;
    const examples = [];
    for (const line of run.stdout.toString().split('\n')) {
        if (!line.startsWith('{')) { continue; }
        const {input, results} = JSON.parse(line);
        const ok = right.get(input) ?? new Set([input]);
        const wrong = new Set(results.filter((r) => r.text !== input && !ok.has(r.text) && passes(r.text, r.conditions)).map((r) => r.text));
        if (wrong.size > 0) {
            ++withWrong;
            if (examples.length < show) { examples.push(`${input} -> ${[...wrong].join(', ')}`); }
        }
    }
    console.log(`${file}: ${withWrong} of ${words.length} frequent words have a wrong candidate`);
    for (const example of examples) { console.log(`   ${example}`); }
}
