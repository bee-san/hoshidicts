#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// The eval-language table of README.md (Measurements 1). Not run by any test.
//
//   node languages/ka/sources/measure-eval.mjs <hoshidicts-cli> <imported wty-ka-en> <scratch dir>
//
// For each rule set (sources/own.json, sources/yomitan.json, their union by
// tools/merge-transforms.mjs, transforms.json) and each value of
// lookup.untaggedTerms (the pack's "pass", and "filter" in a scratch copy of
// the pack), runs eval-language --dictionary on corpus.tsv with gaps.tsv
// (one file), cases.tsv, and copies of both whose first line is
// `# options: default`, and prints one Markdown table row per run.

import {execFileSync} from 'node:child_process';
import {cpSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

const repo = resolve(new URL('../../..', import.meta.url).pathname);
const [cli, dict, scratchArg] = process.argv.slice(2);
const scratch = resolve(scratchArg);
const pack = join(repo, 'languages', 'ka');
const tests = join(pack, 'tests');
mkdirSync(scratch, {recursive: true});

const corpusGaps = join(scratch, 'corpus+gaps.tsv');
writeFileSync(corpusGaps, readFileSync(join(tests, 'corpus.tsv'), 'utf8')
    + readFileSync(join(tests, 'gaps.tsv'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).join('\n') + '\n');
const files = [['corpus.tsv + gaps.tsv', corpusGaps], ['cases.tsv', join(tests, 'cases.tsv')]];
for (const [label, file] of [...files]) {
    const copy = join(scratch, label.replace(/[^a-z]+/g, '-') + 'defaults.tsv');
    writeFileSync(copy, '# options: default\n' + readFileSync(file, 'utf8'));
    files.push([`${label} (defaults)`, copy]);
}

const union = join(scratch, 'union.json');
execFileSync('node', [join(repo, 'tools/merge-transforms.mjs'), 'ka', '--out', union], {stdio: 'pipe'});
const sets = [['own', join(pack, 'sources/own.json')], ['Yomitan', join(pack, 'sources/yomitan.json')], ['union', union], ['final', join(pack, 'transforms.json')]];

const filterDir = join(scratch, 'filter');
rmSync(filterDir, {recursive: true, force: true});
cpSync(pack, join(filterDir, 'ka'), {recursive: true});
const language = JSON.parse(readFileSync(join(filterDir, 'ka', 'language.json'), 'utf8'));
language.lookup.untaggedTerms = 'filter';
writeFileSync(join(filterDir, 'ka', 'language.json'), JSON.stringify(language, null, 2) + '\n');
const languagesDirs = [['pass', join(repo, 'languages')], ['filter', filterDir]];

const pct = (x) => (x === null || x === undefined ? '-' : `${(100 * x).toFixed(2)}%`);
console.log('| rules | untaggedTerms | file | rows | recall | negatives passed | false candidates | first rank |');
console.log('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |');
for (const [setLabel, transforms] of sets) {
    for (const [mode, languages] of languagesDirs) {
        for (const [fileLabel, file] of files) {
            const out = JSON.parse(execFileSync(cli, ['--languages', languages, 'eval-language', 'ka', file, '--transforms', transforms, '--dictionary', dict], {maxBuffer: 1 << 28}).toString());
            console.log(`| ${setLabel} | ${mode} | ${fileLabel} | ${out.rows} | ${pct(out.recall)} | ${pct(out.negativesPassed)} | ${out.falseCandidates.toFixed(4)} | ${pct(out.firstRank)} |`);
        }
    }
}
