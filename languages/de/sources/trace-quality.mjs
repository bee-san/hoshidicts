#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Trace quality of README.md (Measurements). Not run by any test. For each
// UniMorph row of tests/corpus.tsv and tests/gaps.tsv a rule set reaches, the
// trace a lookup shows (traceSelection "shortest": the fewest processor
// steps, then the shortest trace, then the first; docs/languages.md 9.6) is
// checked against the row's UniMorph features: does it name the tense, mood,
// person or form (past (wir, sie) for V;IND;PST;PL;1, plural for N;NOM;PL,
// separated prefix for a separated particle)?
//
//   node languages/de/sources/trace-quality.mjs <transforms.json>... [--cli build/hoshidicts-cli]

import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const cli = args.includes('--cli') ? args[args.indexOf('--cli') + 1] : resolve(here, '../../../build/hoshidicts-cli');
const files = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--cli');
const languages = resolve(here, '..', '..');

const rows = ['corpus.tsv', 'gaps.tsv'].flatMap((name) => readFileSync(join(here, '..', 'tests', name), 'utf8').split('\n')
    .filter((line) => line !== '' && !line.startsWith('#')).map((line) => line.split('\t')).filter((cells) => cells[0].includes(';')));

/** The transform ids (own and Yomitan's) whose name says the row's form, or null when no rule does. */
function expected(tags, source) {
    const t = new Set(tags.split(';'));
    const has = (...xs) => xs.every((x) => t.has(x));
    if (source.includes(' ')) { return /separated[- ]prefix/u; }
    if (t.has('V.PTCP')) { return has('PST') ? /past[- ]participle/u : /present-participle/u; }
    if (has('V', 'NFIN')) { return /zu-infinitive/u; }
    if (has('V', 'IMP')) { return /imperative|present-er|present-ich/u; }
    if (has('V', 'IND', 'PRS')) {
        if (has('SG', '1')) { return /present-ich|present-modal/u; }
        if (has('SG', '2')) { return /present-du/u; }
        if (has('SG', '3')) { return /present-er|present-du-er|present-modal/u; }
        if (has('PL', '2')) { return /present-er/u; }
        return /present-wir/u;
    }
    if (has('V', 'IND', 'PST')) {
        if (has('SG', '2')) { return /past-du/u; }
        if (has('PL', '2')) { return /past-ihr/u; }
        return has('PL') ? /past-wir/u : /^past$/u;
    }
    if (has('V', 'SBJV', 'PRS')) { return /subjunctive-1|present-ich|present-wir/u; }
    if (has('V', 'SBJV', 'PST')) { return /subjunctive-2|^past/u; }
    if (has('N', 'DAT', 'PL')) { return /dative-plural|plural/u; }
    if (has('N', 'PL')) { return /plural/u; }
    if (has('N', 'GEN')) { return /genitive/u; }
    if (has('ADJ', 'CMPR')) { return /comparative/u; }
    if (has('ADJ', 'SPRL')) { return /superlative/u; }
    if (has('ADJ')) { return /declined/u; }
    return null;
}

function run(cliArgs, inputs) {
    const result = spawnSync(cli, cliArgs, {input: inputs.join('\n') + '\n', encoding: 'utf8', maxBuffer: 1 << 30});
    if (result.status !== 0) { throw new Error(`${cli} ${cliArgs.join(' ')} failed: ${result.stderr}`); }
    return result.stdout.trimEnd().split('\n').map((line) => JSON.parse(line));
}
const sources = [...new Set(rows.map((r) => r[2]))];
const variants = new Map(run(['--languages', languages, 'preprocess', 'de', '--stdin', '--all-options'], sources)
    .map((answer) => [answer.input, answer.variants]));
const texts = [...new Set([...variants.values()].flat().map((v) => v.text))];
for (const file of files) {
    const {conditions} = JSON.parse(readFileSync(file, 'utf8'));
    const leaves = (name) => (conditions[name].subConditions ? conditions[name].subConditions.flatMap(leaves) : [name]);
    const deinflections = new Map(run(['--languages', languages, 'deinflect', 'de', '--stdin', '--all-options', '--transforms', resolve(file)], texts)
        .map((answer) => [answer.input, answer.results]));
    let reached = 0, named = 0;
    const byCategory = new Map();
    for (const [tags, , source, term, rule] of rows) {
        const allowed = new Set(leaves(rule));
        let best = null;
        for (const {text, steps} of variants.get(source)) {
            for (const d of deinflections.get(text)) {
                if (d.text !== term || !(d.conditions.length === 0 || d.conditions.some((c) => allowed.has(c)))) { continue; }
                if (best === null || steps < best.steps || (steps === best.steps && d.trace.length < best.trace.length)) { best = {steps, trace: d.trace}; }
            }
        }
        if (best === null) { continue; }
        ++reached;
        const want = expected(tags, source);
        const ok = want !== null && best.trace.some((id) => want.test(id));
        if (ok) { ++named; }
        const category = tags.split(';').slice(0, 3).join(';');
        const c = byCategory.get(category) ?? [0, 0];
        c[0] += 1;
        c[1] += ok ? 1 : 0;
        byCategory.set(category, c);
    }
    console.log(`${file}: ${rows.length} UniMorph rows, ${reached} reached; the trace a lookup shows names the form for ${named} (${(100 * named / Math.max(reached, 1)).toFixed(1)}%)`);
    const misses = [...byCategory].filter(([, [n, ok]]) => ok < n).sort((a, b) => (b[1][0] - b[1][1]) - (a[1][0] - a[1][1])).slice(0, 6);
    if (misses.length > 0) { console.log(`   most rows without it: ${misses.map(([k, [n, ok]]) => `${k} ${n - ok}/${n}`).join(', ')}`); }
}
