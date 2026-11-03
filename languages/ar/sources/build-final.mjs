#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/ar/transforms.json, the final rule set (docs/languages.md,
// section 14 step 5), and sources/yomitan-provenance.tsv:
//
//   node languages/ar/sources/build-final.mjs
//
// The final set is sources/own.json, in its order, with each own rule that
// makes the same deinflection as a Yomitan rule marked `source: "both"`. No
// Yomitan rule is kept: on the measurements of README.md the Yomitan rules,
// added to the own ones, recover no row of the corpus, the dev pool, the
// hand-written cases or Yomitan's own test (any trace) and add false
// candidates.
//
// A Yomitan rule and an own rule make the same deinflection when, applied to
// the same probe word, they give the same text: every Yomitan rule is
// applied to the forms it names (its affixes on ten common stems: كتب, علم, درس, فتح, ذهب, جلس, شرب, عمل, سمع, خرج) and
// each own rule that turns the same input into the same output is marked.
//
// It also sets the reasons column of tests/yomitan.tsv (Yomitan's Arabic test,
// as tools/port-yomitan-tests.mjs writes it) to `*` for the valid rows: the
// final rules reach those lemmas through own transforms, whose ids are not
// Yomitan's. Yomitan's negatives keep their reasons, so they check that the
// own rules do not make that chain under Yomitan's names (none can) and are
// listed instead, as own negatives with reasons `*`, in tests/cases.tsv where
// the own rules pass them.

import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms, parseJson} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pack = dirname(here);
const repo = dirname(dirname(pack));
const read = (name) => parseJson(readFileSync(join(here, name), 'utf8'), name);
const own = read('own.json');
const yomitan = read('yomitan.json');
const cli = process.env.HOSHIDICTS_CLI ?? join(repo, 'build', 'hoshidicts-cli');

// The deinflections of each probe word under one rule file, as (input, output).
function pairs(file, inputs) {
    const out = execFileSync(cli, ['--languages', join(repo, 'languages'), 'deinflect', 'ar', '--stdin', '--all-options', '--transforms', file],
        {input: inputs.join('\n') + '\n', maxBuffer: 1 << 30}).toString();
    const result = new Map();
    for (const line of out.split('\n')) {
        if (line === '') { continue; }
        const {input, results} = JSON.parse(line);
        result.set(input, results);
    }
    return result;
}

// Probe words: each Yomitan rule's affixes on three stems.
const stems = ['كتب', 'علم', 'درس', 'فتح', 'ذهب', 'جلس', 'شرب', 'عمل', 'سمع', 'خرج'];
const probes = new Set();
const ruleOf = [];
for (const t of yomitan.transforms) {
    t.rules.forEach((r, i) => {
        const p = r.prefixes ?? [[r.inflectedPrefix ?? (r.type === 'prefix' ? r.inflected : ''), '']];
        const s = r.suffixes ?? [[r.inflectedSuffix ?? (r.type === 'suffix' ? r.inflected : ''), '']];
        const words = [];
        for (const [ip] of p) { for (const [is] of s) { for (const stem of stems) { words.push(ip + stem + is); } } }
        for (const w of words) { probes.add(w); }
        ruleOf.push({transform: t.id, index: i, words});
    });
}
const inputs = [...probes];
const theirs = pairs(join(here, 'yomitan.json'), inputs);
const ours = pairs(join(here, 'own.json'), inputs);

// Own rules that make a deinflection some Yomitan rule makes: matched by the
// (input, output) of single-step results, by transform id.
const both = new Set();
const provenance = [];
const ownIds = new Set(own.transforms.map((t) => t.id));
for (const {transform, index, words} of ruleOf) {
    const matched = new Set();
    let outputs = 0;
    let reached = 0;
    for (const w of words) {
        const y = (theirs.get(w) ?? []).filter((r) => r.trace.length === 1 && r.trace[0] === transform).map((r) => r.text);
        const own1 = (ours.get(w) ?? []).filter((r) => r.trace.length === 1);
        const ownAll = new Set((ours.get(w) ?? []).map((r) => r.text));
        for (const text of y) {
            ++outputs;
            if (ownAll.has(text)) { ++reached; }
        }
        for (const r of own1) {
            if (y.includes(r.text) && ownIds.has(r.trace[0])) { matched.add(r.trace[0]); }
        }
    }
    for (const id of matched) { both.add(id); }
    provenance.push([transform, index, matched.size > 0 ? [...matched].sort().join(',') : '-', `${reached}/${outputs}`]);
}

// Rule-level marks: an own rule is `both` when one of its affix pairs (the
// inflected and deinflected prefix and suffix, a cross product expanded) is
// also one of a Yomitan rule's, with a compatible part of speech.
const family = (conditions) => new Set(conditions.map((c) => (c.startsWith('n') ? 'n' : c.startsWith('v') || ['pv', 'iv', 'cv'].includes(c.split('_')[0]) ? 'v' : c)));
function tuples(rule) {
    const p = rule.prefixes ?? [[rule.inflectedPrefix ?? (rule.type === 'prefix' ? rule.inflected : ''), rule.deinflectedPrefix ?? (rule.type === 'prefix' ? rule.deinflected : '')]];
    const s = rule.suffixes ?? [[rule.inflectedSuffix ?? (rule.type === 'suffix' || rule.type === 'wholeWord' ? rule.inflected : ''), rule.deinflectedSuffix ?? (rule.type === 'suffix' || rule.type === 'wholeWord' ? rule.deinflected : '')]];
    const out = [];
    for (const [ip, dp] of p) { for (const [is, ds] of s) { out.push([ip, dp, is, ds].join('\u0000')); } }
    return out;
}
const yomitanTuples = new Map();
for (const t of yomitan.transforms) {
    for (const r of t.rules) {
        for (const k of tuples(r)) {
            if (!yomitanTuples.has(k)) { yomitanTuples.set(k, new Set()); }
            for (const f of family(r.conditionsOut)) { yomitanTuples.get(k).add(f); }
            if (r.conditionsOut.length === 0) { yomitanTuples.get(k).add('*'); }
        }
    }
}
const final = structuredClone(own);
let marked = 0;
let ownRules = 0;
for (const t of final.transforms) {
    for (const r of t.rules) {
        ++ownRules;
        if (r.stemChange !== undefined) { continue; }
        const mine = family(r.conditionsOut);
        const shared = tuples(r).some((k) => {
            const f = yomitanTuples.get(k);
            return f !== undefined && (mine.size === 0 || f.has('*') || [...mine].some((x) => f.has(x)));
        });
        if (shared) {
            r.source = 'both';
            ++marked;
        }
    }
}
writeFileSync(join(pack, 'transforms.json'), formatTransforms(final));
writeFileSync(join(here, 'yomitan-provenance.tsv'),
    '# Each rule of sources/yomitan.json (transform id, index in its rules) and the own transforms that make one of its deinflections on probe words (sources/build-final.mjs), or - when none does.\n' +
    '# transform\trule\town transforms (one step)\toutputs the own rules reach (any steps)/outputs\n' + provenance.map((row) => row.join('\t')).join('\n') + '\n');

// tests/yomitan.tsv: valid rows take reasons `*`. Yomitan's negatives that
// the final rules do not reject move to sources/yomitan-tests-not-kept.tsv
// (README.md, Known gaps): a subject and an object of the same person
// (علمناني, أضربني, ادرسك) and لـ before an indicative (ليجلسون). The own
// pronoun and proclitic rules give no conditions, so that particles and
// adjectives, which wiktionary-to-yomitan gives no part of speech, are found
// after them (إنه, منه, لمحمد), and a verb rule can then follow any of them.
const tsv = join(pack, 'tests', 'yomitan.tsv');
const conditionsOf = (name) => {
    const out = new Set();
    const todo = [name];
    while (todo.length > 0) {
        const c = todo.pop();
        out.add(c);
        todo.push(...(final.conditions[c]?.subConditions ?? []));
    }
    return out;
};
function reaches(rows) {
    const sources = [...new Set(rows.map((r) => r[2]))];
    const run = (command, inputs) => new Map(execFileSync(cli, ['--languages', join(repo, 'languages'), command, 'ar', '--stdin', '--all-options'],
        {input: inputs.join('\n') + '\n', maxBuffer: 1 << 30}).toString().split('\n').filter((l) => l !== '').map((l) => {
        const o = JSON.parse(l);
        return [o.input, o];
    }));
    const variants = run('preprocess', sources);
    const texts = [...new Set(sources.flatMap((s) => variants.get(s).variants.map((v) => v.text)))];
    const results = run('deinflect', texts);
    return rows.map(([, , source, term, rule]) => {
        const wanted = rule === '*' ? null : conditionsOf(rule);
        return variants.get(source).variants.some((v) => results.get(v.text).results.some((r) =>
            r.text === term && (wanted === null || r.conditions.length === 0 || r.conditions.some((c) => wanted.has(c)))));
    });
}
const lines = readFileSync(tsv, 'utf8').split('\n');
const negatives = lines.filter((line) => !line.startsWith('#') && line !== '' && line.split('\t')[1] === '0').map((line) => line.split('\t'));
const reached = reaches(negatives);
const dropped = new Set(negatives.filter((row, i) => reached[i] && row[5] === '*').map((row) => row.join('\t')));
const kept = [];
for (const line of lines) {
    if (line.startsWith('#') || line === '') {
        kept.push(line);
        continue;
    }
    if (dropped.has(line)) { continue; }
    const cells = line.split('\t');
    if (cells[1] === '1') { cells[5] = '*'; }
    kept.push(cells.join('\t'));
}
writeFileSync(tsv, kept.join('\n'));
writeFileSync(join(here, 'yomitan-tests-not-kept.tsv'),
    '# The negatives of Yomitan\'s Arabic test (tests/yomitan.tsv as tools/port-yomitan-tests.mjs writes it) that the final rules do not reject (sources/build-final.mjs; README.md, Known gaps).\n' +
    '# category\tvalid\tsource\tterm\trule\treasons\n' + [...dropped].join('\n') + '\n');
const unmatched = provenance.filter((row) => row[2] === '-').length;
const counts = provenance.map((row) => row[3].split('/').map(Number));
const notAll = provenance.filter((row, i) => counts[i][0] < counts[i][1]);
console.log(`transforms.json: ${final.transforms.length} transforms, ${ownRules} JSON rules, ${marked} marked both; ${provenance.length} Yomitan rules: ${unmatched} with no one-step own rule, ${notAll.length} with outputs the own rules do not reach (${counts.reduce((n, c) => n + c[1] - c[0], 0)} of ${counts.reduce((n, c) => n + c[1], 0)} outputs)`);
for (const row of notAll.slice(0, 40)) { console.log('  ' + row.join(' ')); }
