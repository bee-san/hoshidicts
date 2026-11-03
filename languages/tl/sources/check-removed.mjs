#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// The constructed-form check of README.md (Rule provenance; docs/languages.md
// section 14 step 5, "Remove a rule only for measured harm"): for each Yomitan
// transform and each single Yomitan rule sources/build-final.mjs leaves out
// (REMOVED, REMOVED_RULES), the forms its rules make from common lemmas, and
// the share of them the final rules reach with and without it. Not run by any
// test.
//
//   node languages/tl/sources/check-removed.mjs [--cli build/hoshidicts-cli]
//
// A rule that replaces the inflected affixes P...S by D...E makes, from a
// lemma that starts with D and ends with E, the form P + (the lemma between
// D and E) + S; a stem change u -> o is applied backwards (o -> u in the last
// syllable). The lemmas are the common roots, adjectives and pronouns below
// whose shape the rule takes. Patterns and the hyphen rule are skipped.
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';
import {REMOVED, REMOVED_RULES, ruleKey} from './build-final.mjs';

const pack = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(pack, '..', '..');
const args = process.argv.slice(2);
const cli = args.includes('--cli') ? args[args.indexOf('--cli') + 1] : join(repo, 'build', 'hoshidicts-cli');
const yomitan = JSON.parse(readFileSync(join(pack, 'sources', 'yomitan.json'), 'utf8'));
const final = JSON.parse(readFileSync(join(pack, 'transforms.json'), 'utf8'));

const LEMMAS = ['kain', 'sulat', 'basa', 'luto', 'aral', 'bili', 'inom', 'tulog', 'ganda', 'laki', 'sabi', 'gawa', 'dala',
    'dating', 'dami', 'dasal', 'daan', 'bago', 'tawag', 'sagot', 'turo', 'bukas', 'linis', 'hiya', 'sakit', 'ako', 'ikaw',
    'siya', 'ito', 'iyon', 'tanong', 'lakad', 'hanap', 'tingin', 'usap', 'isip', 'alis', 'upo', 'ulan', 'saya'];

function forms(rule) {
    const out = [];
    const make = (p, d, s, e) => {
        for (const lemma of LEMMAS) {
            if (!lemma.startsWith(d) || !lemma.endsWith(e) || lemma.length - d.length - e.length < 2) { continue; }
            let stem = lemma.slice(d.length, lemma.length - e.length);
            if (rule.stemChange) {
                const i = stem.lastIndexOf('o');
                if (i < 0 || !/^[bcdfghjklmnpqrstvwxyz]+$/.test(stem.slice(i + 1))) { continue; }
                stem = `${stem.slice(0, i)}u${stem.slice(i + 1)}`;
            }
            out.push([`${p}${stem}${s}`, lemma]);
            if (out.length >= 10) { return; }
        }
    };
    switch (rule.type) {
        case 'prefix': make(rule.inflected, rule.deinflected, '', ''); break;
        case 'suffix': make('', '', rule.inflected, rule.deinflected); break;
        case 'wholeWord': out.push([rule.inflected, rule.deinflected]); break;
        case 'circumfix':
            for (const [p, d] of rule.prefixes ?? [[rule.inflectedPrefix, rule.deinflectedPrefix]]) {
                for (const [s, e] of rule.suffixes ?? [[rule.inflectedSuffix, rule.deinflectedSuffix]]) { make(p, d, s, e); }
            }
            break;
        default: break;
    }
    return out;
}

const dir = mkdtempSync(join(tmpdir(), 'tl-removed-'));
const recall = (transformsFile, corpus) => JSON.parse(execFileSync(cli, ['--languages', join(repo, 'languages'), 'eval-language', 'tl', corpus,
    '--transforms', transformsFile], {encoding: 'utf8'})).recall;
console.log('| Yomitan transform | Constructed forms | Final rules | Final rules with it |');
console.log('| --- | ---: | ---: | ---: |');
for (const id of Object.keys(REMOVED)) {
    const transform = yomitan.transforms.find((t) => t.id === id);
    const pairs = [...new Map(transform.rules.flatMap(forms).map((p) => [p.join('\t'), p])).values()];
    if (pairs.length === 0) {
        console.log(`| ${id} | 0 | - | - |`);
        continue;
    }
    const corpus = join(dir, `${id.replace(/[^a-z]/g, '_')}.tsv`);
    writeFileSync(corpus, `# category\tvalid\tsource\tterm\trule\treasons\n${pairs.map(([f, l]) => `${id}\t1\t${f}\t${l}\t*\t*`).join('\n')}\n`);
    const withIt = join(dir, 'with.json');
    writeFileSync(withIt, formatTransforms({...final, transforms: [...final.transforms, {...transform, source: 'yomitan'}]}));
    const pct = (v) => `${(100 * v).toFixed(1)}%`;
    console.log(`| ${id} | ${pairs.length} | ${pct(recall(join(pack, 'transforms.json'), corpus))} | ${pct(recall(withIt, corpus))} |`);
}

console.log('\n| Yomitan rule | Constructed forms | Final rules | Final rules with it |');
console.log('| --- | ---: | ---: | ---: |');
for (const key of Object.keys(REMOVED_RULES)) {
    const transform = yomitan.transforms.find((t) => t.rules.some((r) => ruleKey(t, r) === key));
    const rule = transform.rules.find((r) => ruleKey(transform, r) === key);
    const pairs = [...new Map(forms(rule).map((p) => [p.join('\t'), p])).values()];
    if (pairs.length === 0) {
        console.log(`| ${key} | 0 | - | - |`);
        continue;
    }
    const corpus = join(dir, `rule-${key.replace(/[^a-z]/g, '_')}.tsv`);
    writeFileSync(corpus, `# category\tvalid\tsource\tterm\trule\treasons\n${pairs.map(([f, l]) => `${transform.id}\t1\t${f}\t${l}\t*\t*`).join('\n')}\n`);
    const withIt = join(dir, 'with-rule.json');
    writeFileSync(withIt, formatTransforms({...final, transforms: [...final.transforms,
        {...transform, id: `${transform.id} (removed rule)`, name: `${transform.name} (removed rule)`, source: 'yomitan', rules: [rule]}]}));
    const pct = (v) => `${(100 * v).toFixed(1)}%`;
    console.log(`| ${key} | ${pairs.length} | ${pct(recall(join(pack, 'transforms.json'), corpus))} | ${pct(recall(withIt, corpus))} |`);
}
