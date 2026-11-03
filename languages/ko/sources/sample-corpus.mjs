#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Samples languages/ko/tests/corpus.tsv from UniMorph Korean
// (https://github.com/unimorph/kor, file `kor`; CC BY-SA 3.0):
//
//   node languages/ko/sources/sample-corpus.mjs <path to unimorph kor> [--per-tag 12] [--seed 1]
//
// Rows whose lemma or form is not plain Hangul (scraping leftovers such as
// 두근거린다-georinda, and multi-word lemmas) and the few rows tagged other
// than V or ADJ are skipped. Each (form, lemma) pair is kept once, under the
// first tag set it has in the file. From every tag set the sampler takes
// `--per-tag` pairs in a seeded random order, so every paradigm cell
// (statement, question, command, connective, adnominal, ... with tense,
// speech level and honorific) is in the sample.

import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function main(argv) {
    const positional = [];
    let perTag = 12;
    let seed = 1;
    for (let i = 0; i < argv.length; ++i) {
        if (argv[i] === '--per-tag') { perTag = Number(argv[++i]); } else if (argv[i] === '--seed') { seed = Number(argv[++i]); } else { positional.push(argv[i]); }
    }
    if (positional.length !== 1) {
        console.error('usage: node sample-corpus.mjs <unimorph kor file> [--per-tag n] [--seed n]');
        return 2;
    }
    const lines = readFileSync(positional[0], 'utf8').split('\n').filter((l) => l !== '');
    const seen = new Set();
    const byTag = new Map();
    let skipped = 0;
    for (const line of lines) {
        const [lemma, form, tags] = line.split('\t');
        const pos = tags.split(/[;.]/)[0];
        if (!/^[가-힣]+다$/.test(lemma) || !/^[가-힣]+$/.test(form) || (pos !== 'V' && pos !== 'ADJ')) {
            ++skipped;
            continue;
        }
        const key = `${form}\t${lemma}\t${pos}`;
        if (seen.has(key)) { continue; }
        seen.add(key);
        if (!byTag.has(tags)) { byTag.set(tags, []); }
        byTag.get(tags).push({lemma, form, pos, tags});
    }
    const random = mulberry32(seed);
    const rows = [];
    for (const tags of [...byTag.keys()].sort()) {
        const pairs = byTag.get(tags);
        for (let i = pairs.length - 1; i > 0; --i) {
            const j = Math.floor(random() * (i + 1));
            [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
        }
        rows.push(...pairs.slice(0, perTag));
    }
    const header = [
        `# Source: UniMorph Korean (https://github.com/unimorph/kor) at 35bbecb10a3045e24b783a6efd2202e844a1ba3d, compiled from`,
        `# Wiktionary inflection tables by Maria Nepomniashchaya, Daria Rodionova and Anastasia Yemelina; CC BY-SA 3.0.`,
        `# ${rows.length} pairs: ${perTag} per UniMorph tag set, seed ${seed} (languages/ko/sources/sample-corpus.mjs); ${skipped} rows skipped`,
        `# (not plain Hangul, or not V/ADJ). Rows the rules do not reach are in gaps.tsv.`,
        '# category\tvalid\tsource\tterm\trule\treasons',
    ];
    const body = rows.map((r) => `${r.tags}\t1\t${r.form}\t${r.lemma}\t${r.pos === 'V' ? 'v' : 'adj'}\t*`);
    const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'corpus.tsv');
    writeFileSync(out, [...header, ...body].join('\n') + '\n');
    console.log(`${out}: ${rows.length} rows from ${byTag.size} tag sets (${seen.size} distinct pairs, ${skipped} skipped)`);
    return 0;
}

process.exitCode = main(process.argv.slice(2));
