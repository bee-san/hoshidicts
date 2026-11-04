#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// The removal check of README.md (Rule provenance) for Yomitan's 16 rules
// (docs/languages.md section 14 step 5, "Remove a rule only for measured
// harm"). Not run by any test.
//
//   node languages/ka/sources/yomitan-ablation.mjs <hoshidicts-cli> <imported dictionary> <transforms file> <out dir> [hover files...]
//
// 1. Writes <out dir>/yomitan-endings.tsv: every ending Yomitan's rules strip
//    or restore, on ten common lemmas, declined by this script (written for
//    the pack; no dictionary data).
// 2. Runs eval-language on it and on <out dir>/corpus-gaps.tsv with the
//    transforms file, then with each Yomitan rule removed, and prints recall
//    and false candidates for each.
// The transforms file is transforms.json (or a copy) and the dictionary
// wty-ka-en as published, imported with hoshidicts-cli import; the pack's
// lookup.untaggedTerms "pass" applies, as in a lookup.

import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const [cli, dict, transformsFile, out] = process.argv.slice(2);
const languages = new URL('../..', import.meta.url).pathname;

// [lemma, stem before a consonant ending, stem before a vowel ending, kind]
const LEMMAS = [
    ['სახლი', 'სახლ', 'სახლ', 'c'], ['ქალაქი', 'ქალაქ', 'ქალაქ', 'c'], ['წიგნი', 'წიგნ', 'წიგნ', 'c'],
    ['ბავშვი', 'ბავშვ', 'ბავშვ', 'c'], ['წყალი', 'წყალ', 'წყლ', 'c'], ['დედა', 'დედა', 'დედ', 'a'],
    ['ქვეყანა', 'ქვეყანა', 'ქვეყნ', 'a'], ['სკოლა', 'სკოლა', 'სკოლ', 'a'], ['მეფე', 'მეფე', 'მეფ', 'e'],
    ['კარგი', 'კარგ', 'კარგ', 'c'],
];
function forms([lemma, full, reduced, kind]) {
    const vowel = kind !== 'c';
    const pl = (kind === 'e' ? full : reduced) + 'ებ';
    return {
        'ები': pl + 'ი', 'ებს': pl + 'ს', 'ებების': pl + 'ების',
        'მა': vowel ? full + 'მ' : full + 'მა', 'ს': full + 'ს', 'ის': reduced + 'ის', 'ით': reduced + 'ით',
        'ად': kind === 'e' ? full + 'დ' : reduced + 'ად', 'ო': vowel ? full + 'ვ' : full + 'ო',
        'ში': full + 'ში', 'ზე': full + 'ზე', 'შია': full + 'შია', 'ზეა': full + 'ზეა',
    };
}
const rows = ['# Written for this pack (GPL-3.0-or-later): the endings of Yomitan\'s Georgian rules on ten lemmas (sources/yomitan-ablation.mjs).',
    '# category\tvalid\tsource\tterm\trule\treasons'];
for (const entry of LEMMAS) {
    for (const [ending, form] of Object.entries(forms(entry))) {
        // ებების is not Georgian (Yomitan lists it); its forms test only false candidates.
        rows.push(`yomitan:${ending}\t1\t${form}\t${entry[0]}\t*\t*`);
    }
}
const endingsFile = join(out, 'yomitan-endings.tsv');
writeFileSync(endingsFile, rows.join('\n') + '\n');

const base = JSON.parse(readFileSync(transformsFile, 'utf8'));
const variants = [['all rules', base]];
for (const t of base.transforms) {
    t.rules.forEach((rule, i) => {
        if ((rule.source ?? t.source) !== 'yomitan') { return; }
        const copy = structuredClone(base);
        copy.transforms.find((x) => x.id === t.id).rules.splice(i, 1);
        variants.push([`without ${t.id}[${i}] ${rule.inflected} → ${rule.deinflected}`, copy]);
    });
}
const noYomitan = structuredClone(base);
for (const t of noYomitan.transforms) { t.rules = t.rules.filter((rule) => (rule.source ?? t.source) !== 'yomitan'); }
noYomitan.transforms = noYomitan.transforms.filter((t) => t.rules.length);
variants.push(['without all 16', noYomitan]);
for (const [label, transforms] of variants) {
    const file = join(out, 'ablation.json');
    writeFileSync(file, JSON.stringify(transforms));
    const results = [endingsFile, join(out, 'corpus-gaps.tsv')].map((tsv) => JSON.parse(execFileSync(cli,
        ['--languages', languages, 'eval-language', 'ka', tsv, '--transforms', file, '--dictionary', dict], {maxBuffer: 1 << 28}).toString()));
    console.log(`${label}\tendings: recall ${results[0].recall.toFixed(4)}, falseCandidates ${results[0].falseCandidates.toFixed(4)}, firstRank ${results[0].firstRank.toFixed(4)}`
        + `\tcorpus+gaps: recall ${results[1].recall.toFixed(4)}, falseCandidates ${results[1].falseCandidates.toFixed(4)}, firstRank ${results[1].firstRank.toFixed(4)}`);
}
