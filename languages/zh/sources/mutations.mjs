#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// The scratch-copy check of docs/languages.md section 14 step 7: each
// mutation below removes one stem constraint, exclusion, lookahead or word
// list (or one group of entries with a purpose of its own) from a copy of the
// pack, writes the copy's tests/classes.json, and runs the conformance test on
// it. A mutation the tests do not notice is printed as SURVIVED.
//
//   node languages/zh/sources/mutations.mjs [--cli-dir build] [--work <dir>] [--only <name>]

import {cpSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatJson, formatTransforms} from '../../../tools/lib/json.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const pack = resolve(here, '..');
const repo = resolve(pack, '..', '..');
const argument = (name, fallback) => {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : fallback;
};
const buildDir = resolve(repo, argument('--cli-dir', 'build'));
const work = resolve(argument('--work', join(repo, 'build', 'zh-mutations')));
const only = argument('--only', null);

const transforms0 = JSON.parse(readFileSync(join(pack, 'transforms.json'), 'utf8'));
const language0 = JSON.parse(readFileSync(join(pack, 'language.json'), 'utf8'));

/** Rules of a transform, by id. */
const rulesOf = (t, id) => t.transforms.find((x) => x.id === id).rules;
/** Removes the characters of `chars` from a class string "[...]". */
const without = (cls, chars) => cls.replace(/^\[|\]$/gu, '').split('').filter((c) => !chars.includes(c)).join('');
const separable = (t, edit) => { for (const r of rulesOf(t, 'separable')) { r.pattern = edit(r.pattern, r); } };

const mutations = {
    // erhua: its exclusion class and each group of it.
    'erhua: no stemNotEndsWith': (t) => { for (const r of rulesOf(t, 'erhua')) { delete r.stemNotEndsWith; } },
    'erhua: no function words (的 了 着)': (t) => { for (const r of rulesOf(t, 'erhua')) { r.stemNotEndsWith = `[${without(r.stemNotEndsWith, '的地得了着著过過')}]`; } },
    'erhua: no pronouns (我 他)': (t) => { for (const r of rulesOf(t, 'erhua')) { r.stemNotEndsWith = `[${without(r.stemNotEndsWith, '我你您他她它们們')}]`; } },
    'erhua: no numerals and 个': (t) => { for (const r of rulesOf(t, 'erhua')) { r.stemNotEndsWith = `[${without(r.stemNotEndsWith, '个個两兩一二三四五六七八九十几幾')}]`; } },
    'erhua: no 儿子 words (女 婴 育)': (t) => { for (const r of rulesOf(t, 'erhua')) { r.stemNotEndsWith = `[${without(r.stemNotEndsWith, '女男婴嬰孤幼胎育')}]`; } },
    'erhua: no foreign-name endings (莱 丽)': (t) => { for (const r of rulesOf(t, 'erhua')) { r.stemNotEndsWith = `[${without(r.stemNotEndsWith, '莱萊丽麗')}]`; } },
    // A-not-A and reduplication: each list emptied.
    'aNotA: no monosyllables': (t) => { const x = t.transforms.find((y) => y.id === 'aNotA'); x.rules = x.rules.filter((r) => [...r.inflected].length !== 3); },
    'aNotA: no disyllables': (t) => { const x = t.transforms.find((y) => y.id === 'aNotA'); x.rules = x.rules.filter((r) => [...r.inflected].length === 3); },
    'aNotA: prefix instead of whole word': (t) => { for (const r of rulesOf(t, 'aNotA')) { if ([...r.inflected].length === 3) { r.type = 'prefix'; } } },
    'aMeiA: prefix instead of whole word': (t) => { for (const r of rulesOf(t, 'aMeiA')) { if ([...r.inflected].length === 3) { r.type = 'prefix'; } } },
    'redupAyiA: whole word instead of prefix': (t) => { for (const r of rulesOf(t, 'redupAyiA')) { r.type = 'wholeWord'; } },
    // separable: each lookahead and each insertion restriction.
    'separable: 的 right after the verb': (t) => separable(t, (p) => p.replace('(?!.(?:的|', '(?!.(?:')),
    'separable: adjective of a longer noun': (t) => separable(t, (p) => p.replace(/\|\[好小白\]/u, '')),
    'separable: 时 starting the insertions': (t) => separable(t, (p) => p.replace(/\|\[时時\]/u, '')),
    'separable: 把 before 脸, 了 before 差, 大 小 中 before 学': (t) => separable(t, (p, r) => (['脸', '臉', '差', '学', '學'].includes(r.anchorSuffix) ? p.replace(/\{0,5\}\[[^\]]*\](?=(?:脸|臉|差|学|學)\$$)/u, '{1,6}') : p)),
    'separable: 的 after a non-possessor': (t) => separable(t, (p) => p.replace(/\|\[\^的\]\*\[\^[^\]]*\]的\)\)/u, '))')),
    'separable: next/last after 上 and 下': (t) => separable(t, (p) => p.replace(/\(\?!\[一二两兩[^\]]*\]\|/gu, '(?!').replace(/\(\?!\[一二两兩[^\]]*\]\)/gu, '')),
    'separable: measure-word objects after numerals': (t) => separable(t, (p, r) => (['口', '门', '門', '年'].includes(r.anchorSuffix) ? p.replace(/\{0,5\}\[[^\]]*\](?=[^\]]*$)/u, '{1,6}') : p)),
    'separable: 这 那 上 下 场 before 面': (t) => separable(t, (p, r) => (r.anchorSuffix === '面' ? p.replace(/\{0,5\}\[[^\]]*\](?=面\$$)/u, '{1,6}') : p)),
    'separable: 开 上 下 before 车': (t) => separable(t, (p, r) => (['车', '車'].includes(r.anchorSuffix) ? p.replace(/\{0,5\}\[[^\]]*\](?=[车車]\$$)/u, '{1,6}') : p)),
    'separable: 回 before 家': (t) => separable(t, (p, r) => (r.anchorSuffix === '家' ? p.replace(/\{0,5\}\[[^\]]*\](?=家\$$)/u, '{1,6}') : p)),
    'separable: 把 before 手': (t) => separable(t, (p, r) => (r.anchorSuffix === '手' ? p.replace(/\{0,5\}\[[^\]]*\](?=手\$$)/u, '{1,6}') : p)),
    'separable: 下 before 字, 这 那 个 before 地, 热 before 豆腐': (t) => separable(t, (p, r) => (['字', '地', '豆腐'].includes(r.anchorSuffix) ? p.replace(/\{0,5\}\[[^\]]*\](?=(?:字|地|豆腐)\$$)/u, '{1,6}') : p)),
    'separable: no 很 in the insertions': (t) => separable(t, (p) => p.replaceAll('很', '')),
    'separable: 度 as a verb of 假 (度过假期)': (t) => separable(t, (p, r) => (r.anchorSuffix === '假' ? p.replace(/\(((?:[\u4E00-\u9FFF]\|?)+)\)/u, (m, v) => `(${v}|度)`) : p)),
    // potential forms: exclusions, groups, the separate 明白/清楚 rules, 会.
    'potentialNot: no stemNotStartsWith': (t) => { delete rulesOf(t, 'potentialNot')[0].stemNotStartsWith; },
    'potentialDe: no stemNotStartsWith': (t) => { delete rulesOf(t, 'potentialDe')[0].stemNotStartsWith; },
    'potential: 明 白 楚 as complements': (t) => { for (const id of ['potentialNot', 'potentialDe']) { const r = rulesOf(t, id)[0]; r.stemChange.between = r.stemChange.between.replace(']', '明白楚]'); } },
    'potential: 会 as a complement': (t) => { for (const id of ['potentialNot', 'potentialDe']) { const r = rulesOf(t, id)[0]; r.stemChange.between = r.stemChange.between.replace(']', '会會]'); } },
    'potentialLiao: no stemEndsWith': (t) => { delete rulesOf(t, 'potentialLiao')[0].stemEndsWith; },
};
// Groups of the named exclusion classes in language.json.
const classMutations = {
    'zhNotPotential: no pronouns': ['zhNotPotential', '我你妳他她它牠们們'],
    'zhNotPotential: no adverbs': ['zhNotPotential', '都也就还還全将將永再早以从決决绝絕并並毫仍尚亦皆均竟怎何岂豈偏总總只已曾正刚剛又才可很太更一'],
    'zhNotPotential: no nouns of time and 眼': ['zhNotPotential', '天年眼面'],
    'zhNotPotential: no 不 and 得': ['zhNotPotential', '不得'],
    'zhNotPotentialDe: no 变 经 (变得, 经得)': ['zhNotPotentialDe', '变變经經'],
    'zhNotPotentialDe: no pronouns': ['zhNotPotentialDe', '我你妳他她它牠们們'],
};

function run(name, edit) {
    const dir = join(work, 'languages');
    rmSync(work, {recursive: true, force: true});
    mkdirSync(dir, {recursive: true});
    cpSync(pack, join(dir, 'zh'), {recursive: true});
    const transforms = structuredClone(transforms0);
    const language = structuredClone(language0);
    edit(transforms, language);
    writeFileSync(join(dir, 'zh', 'transforms.json'), formatTransforms(transforms));
    writeFileSync(join(dir, 'zh', 'language.json'), formatJson(language));
    const write = spawnSync(process.execPath, [join(repo, 'tools', 'check-classes.mjs'), 'zh', '--write', '--languages', dir], {encoding: 'utf8'});
    if (write.status !== 0) { return `classes.json failed: ${write.stderr.trim().split('\n').at(-1)}`; }
    const test = spawnSync(join(buildDir, 'language-conformance-test'), [join(dir, 'zh'), join(work, 'scratch')], {encoding: 'utf8'});
    const failures = (test.stdout + test.stderr).split('\n').filter((l) => l.startsWith('FAIL'));
    return test.status === 0 ? 'SURVIVED' : `killed (${failures.length} failures, e.g. ${failures[0]?.replace(/^FAIL zh: /u, '') ?? test.status})`;
}

let survived = 0;
const all = [
    ...Object.entries(mutations),
    ...Object.entries(classMutations).map(([name, [cls, chars]]) => [name, (t, l) => { l.classes[cls] = `[${without(l.classes[cls], chars)}]`; }]),
];
for (const [name, edit] of all) {
    if (only !== null && !name.includes(only)) { continue; }
    const result = run(name, edit);
    if (result === 'SURVIVED') { ++survived; }
    console.log(`${result === 'SURVIVED' ? 'SURVIVED' : 'killed  '}  ${name}${result === 'SURVIVED' ? '' : `: ${result.replace(/^killed /u, '')}`}`);
}
rmSync(work, {recursive: true, force: true});
console.log(`${all.length} mutations, ${survived} survived`);
process.exitCode = survived === 0 ? 0 : 1;
