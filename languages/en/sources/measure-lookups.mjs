#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// The lookup measurements of README.md (Measurements). Not run by any test.
// Each rule set is loaded from a temporary copy of the pack whose
// transforms.json is that file and whose language.json has no settings (a
// setting may name transforms another rule set lacks), and looked up with
// lookup-batch (see sources/lookup-batch.cpp), 16 results, scan length 16.
//
//   node languages/en/sources/measure-lookups.mjs hovers <inputs dir> <hover.txt> <words.txt> <dictionary> <transforms.json>... [--batch build/lookup-batch]
//   node languages/en/sources/measure-lookups.mjs first <inputs dir> <unimorph eng> <dictionary> <transforms.json>... [--batch build/lookup-batch]
//
// <inputs dir> is what sources/measure-inputs.py writes; <dictionary> is the
// same dictionary imported by hoshidicts-cli import.
//
// hovers (texts from sources/make-hovers.py), per rule set:
// - interposed-object first results: the first result's trace has the
//   interposed object, split by the hovered word: an auxiliary (am is are was
//   were be been being have has had having do does did will would shall
//   should can could may might must), a word the dictionary has no verb entry
//   for (no row with the rules tag v, as written or in lowercase), or other;
// - last-word readings: the first result's matched text has a space, its
//   trace is not empty and has only the single-word transforms (plural, 3rd
//   pers. sing. pres, present, past, pastParticiple, ing, comparative,
//   superlative), and it differs from the matched text only in the last word
//   (long as -> long a, found a -> found on).
// first (inputs from sources/measure-inputs.py), per rule set, over the
// 20,000 frequent words looked up whole: the words whose first entry with
// definitions (a result that is not a form-of row and matches the whole
// word) is a wrong deinflection, and those where a wrong deinflection comes
// before the lemma. A deinflection is wrong when it has a trace and its
// expression is neither the word nor a lemma the dictionary's form-of rows or
// UniMorph give for the word; all comparisons ignore letter case.

import {spawn} from 'node:child_process';
import {cpSync, createReadStream, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {Readable} from 'node:stream';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';

const PACK = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const batch = args.includes('--batch') ? args[args.indexOf('--batch') + 1] : 'build/lookup-batch';
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--batch');
const [mode, ...rest] = positional;
const lower = (s) => s.toLowerCase().replaceAll('\u2019', "'");

/** Runs lookup-batch for one rule set and calls onAnswer(index, results) per input line. */
async function lookups(transformsFile, dictionary, input, onAnswer) {
    const temp = mkdtempSync(join(tmpdir(), 'en-measure-'));
    try {
        cpSync(PACK, join(temp, 'en'), {recursive: true});
        const language = JSON.parse(readFileSync(join(PACK, 'language.json'), 'utf8'));
        language.settings = [];
        writeFileSync(join(temp, 'en', 'language.json'), JSON.stringify(language));
        writeFileSync(join(temp, 'en', 'transforms.json'), readFileSync(transformsFile));
        const child = spawn(batch, [temp, 'en', dictionary, '16', '16'], {stdio: ['pipe', 'pipe', 'inherit']});
        input.pipe(child.stdin);
        let index = 0;
        for await (const line of createInterface({input: child.stdout, crlfDelay: Infinity})) {
            if (line.startsWith('{')) { onAnswer(index++, JSON.parse(line).results); }
        }
        return index;
    } finally {
        rmSync(temp, {recursive: true, force: true});
    }
}

const AUXILIARIES = new Set('am is are was were be been being have has had having do does did will would shall should can could may might must'.split(' '));
const SINGLE_WORD = new Set(['plural', '3rd pers. sing. pres', 'present', 'past', 'pastParticiple', 'ing', 'comparative', 'superlative']);

if (mode === 'hovers') {
    const [inputs, hoverFile, wordsFile, dictionary, ...sets] = rest;
    const words = readFileSync(wordsFile, 'utf8').split('\n');
    const verbs = new Set();
    for (const line of readFileSync(join(inputs, 'headwords.tsv'), 'utf8').split('\n')) {
        const [expression, rules = ''] = line.split('\t');
        if (rules.split(' ').includes('v')) { verbs.add(expression); }
    }
    for (const file of sets) {
        const counts = {interposed: 0, auxiliary: 0, noVerb: 0, lastWord: 0};
        const hovers = await lookups(file, dictionary, createReadStream(hoverFile), (i, results) => {
            const top = results[0];
            if (!top || top.trace.length === 0) { return; }
            if (top.trace.includes('interposed object')) {
                ++counts.interposed;
                const word = words[i];
                if (AUXILIARIES.has(word.toLowerCase())) {
                    ++counts.auxiliary;
                } else if (!verbs.has(word) && !verbs.has(word.toLowerCase())) {
                    ++counts.noVerb;
                }
                return;
            }
            if (!top.matched.includes(' ') || !top.trace.every((t) => SINGLE_WORD.has(t))) { return; }
            const m = lower(top.matched).split(' ');
            const e = lower(top.expression).split(' ');
            if (m.length === e.length && m.every((w, k) => (k === m.length - 1 ? w !== e[k] : w === e[k]))) { ++counts.lastWord; }
        });
        console.log(`${file}: ${hovers} hovers; interposed-object first results ${counts.interposed} (at an auxiliary ${counts.auxiliary}, at a word with no verb entry ${counts.noVerb}); last-word readings ${counts.lastWord}`);
    }
} else if (mode === 'first') {
    const [inputs, unimorph, dictionary, ...sets] = rest;
    const words = readFileSync(join(inputs, 'frequent-words.tsv'), 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t')[0]);
    const wanted = new Set(words);
    const right = new Map();
    const addRight = (form, lemma) => {
        if (!wanted.has(form)) { return; }
        const set = right.get(form) ?? new Set([lower(form)]);
        set.add(lower(lemma));
        right.set(form, set);
    };
    for (const line of readFileSync(join(inputs, 'redirects.tsv'), 'utf8').split('\n')) {
        const [form, lemma] = line.split('\t');
        if (lemma) { addRight(form, lemma); }
    }
    for (const line of readFileSync(unimorph, 'utf8').split('\n')) {
        const [lemma, form] = line.split('\t');
        if (form) { addRight(form, lemma); }
    }
    for (const file of sets) {
        let firstWrong = 0, aboveLemma = 0;
        await lookups(file, dictionary, Readable.from([`${words.join('\n')}\n`]), (i, results) => {
            const word = words[i];
            const ok = right.get(word) ?? new Set([lower(word)]);
            const defs = results.filter((r) => !r.formOf && lower(r.matched) === lower(word));
            const wrong = (r) => r.trace.length > 0 && !ok.has(lower(r.expression));
            if (defs.length > 0 && wrong(defs[0])) { ++firstWrong; }
            const lemmaAt = defs.findIndex((r) => lower(r.expression) !== lower(word) && ok.has(lower(r.expression)));
            if (lemmaAt > 0 && defs.slice(0, lemmaAt).some(wrong)) { ++aboveLemma; }
        });
        console.log(`${file}: ${words.length} words; a wrong deinflection is the first entry with definitions for ${firstWrong}, comes before the lemma for ${aboveLemma}`);
    }
} else {
    console.error('usage: measure-lookups.mjs hovers <inputs dir> <hover.txt> <words.txt> <dictionary> <transforms.json>... | first <inputs dir> <unimorph eng> <dictionary> <transforms.json>... [--batch <lookup-batch>]');
    process.exit(2);
}
