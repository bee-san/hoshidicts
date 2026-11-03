#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// The differential check of docs/languages.md, section 8.2: compares the
// engine with Yomitan's own code for one language.
//
//   node tools/check-yomitan.mjs <yomitan checkout> <code>... [--cli <hoshidicts-cli>] [--languages <dir>] [--show <n>]
//   node tools/check-yomitan.mjs <yomitan checkout> --all
//
// Rules: for a pack with sources/yomitan.json it generates inputs from every
// rule's affixes on stems from the pack's letter class (circumfix parts,
// stemChange.from, pattern anchors and word lists for the mapped rules), adds
// Yomitan's test sources with every prefix and the pack's corpus words, runs
// Yomitan's LanguageTransformer (resetting lastIndex before every test of a
// rule with the g flag) and
// `hoshidicts-cli --languages <dir> deinflect <code> --stdin --all-options --transforms <pack>/sources/yomitan.json`,
// and requires the same set of (text, conditions) for every input. Yomitan's
// results that are the empty text, or derived from one, are dropped: the
// engine neither records nor expands an empty text (section 7.4).
//
// Processors: every Yomitan pre- and postprocessor of the language is paired
// with the pack processor of the same id and both run, alone, on the corpus
// strings, the host.sample texts and inputs built from the characters the
// pack processor names; the sets of outputs must be equal. The engine runs
// one processor through a temporary copy of the pack whose only preprocessor
// it is (`hoshidicts-cli --languages <tmp> preprocess <code> --stdin`). The
// Japanese pack is exempt (section 11.3).
//
// sources/yomitan-differences.tsv lists the deliberate differences:
//
//   # kind<TAB>id<TAB>side<TAB>input<TAB>text<TAB>conditions<TAB>reason
//   rule	*	yomitan	/ (?:up|on)[a-z]/	*	*	Yomitan matches a particle as a prefix of the next word.
//   processor	addHamzaBottom	*	*	*	*	Why the pack has no such processor.
//
// kind is `rule` or `processor`; id a transform id the result's trace
// contains (rule) or a Yomitan processor id (processor), or `*`; side
// `yomitan` (a result only Yomitan gives), `pack` (only the engine) or `*`;
// input, text and conditions are exact values, `*`, or a /regular
// expression/ (JavaScript, `u` flag); conditions are condition names in
// declaration order separated by `|`, empty for none. An unpaired Yomitan
// processor is the difference (processor, <id>, yomitan, *, *, *).

import {spawnSync} from 'node:child_process';
import {existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {isMain} from './lib/cli.mjs';
import {DEFAULT_LANGUAGES_DIR, REPO_ROOT, corpusStrings, listPacks, loadPack, readDeinflectionTsv, readJson, readTsv} from './lib/pack.mjs';
import {stepKind} from './lib/steps.mjs';
import {
    PINNED_REVISION,
    findTransformTest,
    loadLanguageTransformer,
    loadTextProcessors,
    loadTransformDescriptor,
    loadTransformTests,
    yomitanRevision,
} from './lib/yomitan.mjs';

export const DEFAULT_CLI = join(REPO_ROOT, 'build', 'hoshidicts-cli');
const DIFFERENCE_KINDS = new Set(['rule', 'processor']);
const SIDES = new Set(['yomitan', 'pack', '*']);

function codePoints(text) {
    return Array.from(text);
}

/**
 * Reads sources/yomitan-differences.tsv.
 * @param {string} file
 * @returns {{line: number, kind: string, id: string, side: string, input: string, text: string, conditions: string, reason: string, used: number}[]}
 */
export function readDifferences(file) {
    if (!existsSync(file)) { return []; }
    return readTsv(file, 7).rows.map(({line, cells: [kind, id, side, input, text, conditions, reason]}) => {
        if (!DIFFERENCE_KINDS.has(kind)) { throw new Error(`${file}:${line}: kind is rule or processor`); }
        if (!SIDES.has(side)) { throw new Error(`${file}:${line}: side is yomitan, pack or *`); }
        if (reason.trim() === '') { throw new Error(`${file}:${line}: every difference needs a reason`); }
        for (const cell of [input, text, conditions]) {
            if (isRegExpCell(cell)) {
                try {
                    new RegExp(cell.slice(1, -1), 'u');
                } catch (error) {
                    throw new Error(`${file}:${line}: ${error.message}`);
                }
            }
        }
        return {line, kind, id, side, input, text, conditions, reason, used: 0};
    });
}

function isRegExpCell(cell) {
    return cell.length >= 2 && cell.startsWith('/') && cell.endsWith('/');
}

function cellMatches(cell, value) {
    if (cell === '*') { return true; }
    if (isRegExpCell(cell)) { return new RegExp(cell.slice(1, -1), 'u').test(value); }
    return cell === value;
}

/**
 * The first difference row that explains a discrepancy, or null.
 * @param {ReturnType<typeof readDifferences>} rows
 * @param {{kind: string, id?: string, traces?: string[][], side: string, input: string, text: string, conditions: string}} item
 */
export function explain(rows, item) {
    for (const row of rows) {
        if (row.kind !== item.kind) { continue; }
        if (row.side !== '*' && row.side !== item.side) { continue; }
        if (row.kind === 'rule') {
            if (row.id !== '*' && !(item.traces ?? []).some((trace) => trace.includes(row.id))) { continue; }
        } else if (row.id !== '*' && row.id !== item.id) {
            continue;
        }
        if (!cellMatches(row.input, item.input) || !cellMatches(row.text, item.text) || !cellMatches(row.conditions, item.conditions)) { continue; }
        ++row.used;
        return row;
    }
    return null;
}

/**
 * How to run a CLI: an executable, or a .mjs/.js file run with this Node.
 * @param {string} cli
 * @returns {[string, string[]]}
 */
function command(cli) {
    return /\.m?js$/.test(cli) ? [process.execPath, [cli]] : [cli, []];
}

/**
 * Runs `hoshidicts-cli ... --stdin` on inputs and returns one parsed JSON
 * object per input.
 * @param {string} cli
 * @param {string[]} args
 * @param {string[]} inputs
 * @returns {any[]}
 */
export function runCli(cli, args, inputs) {
    const [file, prefix] = command(cli);
    const result = spawnSync(file, [...prefix, ...args], {
        input: inputs.length === 0 ? '' : `${inputs.join('\n')}\n`,
        encoding: 'utf8',
        maxBuffer: 1 << 30,
        timeout: 30 * 60 * 1000,
    });
    if (result.error) { throw new Error(`${cli}: ${result.error.message}`); }
    if (result.status !== 0) { throw new Error(`${cli} ${args.join(' ')} exited with ${result.status}: ${(result.stderr || '').trim().slice(0, 2000)}`); }
    const lines = result.stdout.split('\n').filter((line) => line.startsWith('{'));
    if (lines.length !== inputs.length) {
        throw new Error(`${cli} ${args.join(' ')} answered ${lines.length} lines for ${inputs.length} inputs`);
    }
    return lines.map((line, i) => {
        const value = JSON.parse(line);
        if (value.input !== inputs[i]) { throw new Error(`${cli}: answer ${i + 1} is for ${JSON.stringify(value.input)}, not ${JSON.stringify(inputs[i])}`); }
        return value;
    });
}

/**
 * The letters stems are made of: code points of the pack's letter class (its
 * `letter` class, else text.wordCharacters, else text.pattern) that the
 * sample words use most, then the class's first members.
 * @param {ReturnType<typeof loadPack>} pack
 * @param {string[]} words
 * @param {number} count
 * @returns {string[]}
 */
export function stemLetters(pack, words, count = 8) {
    const {classes, language} = pack;
    const field = classes.has('letter') ? '{letter}' : language.text?.wordCharacters ?? language.text?.pattern;
    if (typeof field !== 'string') { return ['a', 'b', 'c', 'd'].slice(0, count); }
    const isLetter = classes.matcher(field);
    const frequency = new Map();
    for (const word of words) {
        for (const c of word) {
            if (isLetter(/** @type {number} */ (c.codePointAt(0)))) { frequency.set(c, (frequency.get(c) ?? 0) + 1); }
        }
    }
    const letters = [...frequency].sort((a, b) => b[1] - a[1] || a[0].codePointAt(0) - b[0].codePointAt(0)).map(([c]) => c);
    for (const [first, last] of classes.ranges(field)) {
        for (let cp = first; cp <= last && letters.length < count; ++cp) {
            const c = String.fromCodePoint(cp);
            if (!letters.includes(c) && /\p{L}/u.test(c)) { letters.push(c); }
        }
        if (letters.length >= count) { break; }
    }
    return letters.slice(0, count);
}

function expandCrossProduct(rule) {
    if (rule.type !== 'circumfix' || (rule.prefixes === undefined && rule.suffixes === undefined)) { return [rule]; }
    const out = [];
    for (const [inflectedPrefix, deinflectedPrefix] of rule.prefixes ?? [['', '']]) {
        for (const [inflectedSuffix, deinflectedSuffix] of rule.suffixes ?? [['', '']]) {
            out.push({...rule, inflectedPrefix, deinflectedPrefix, inflectedSuffix, deinflectedSuffix});
        }
    }
    return out;
}

/**
 * Inputs for the rule comparison (section 8.2).
 * @param {ReturnType<typeof loadPack>} pack
 * @param {any} ported the parsed sources/yomitan.json
 * @param {string[]} testSources Yomitan's test sources
 * @param {string[]} corpusWords sources and terms of the pack's corpus
 * @returns {string[]}
 */
export function ruleInputs(pack, ported, testSources, corpusWords) {
    const seen = new Set();
    const out = [];
    const add = (text) => {
        if (typeof text !== 'string' || text === '' || /[\n\r]/.test(text) || seen.has(text)) { return; }
        seen.add(text);
        out.push(text);
    };
    const letters = stemLetters(pack, [...testSources, ...corpusWords]);
    const l = (i) => letters[i % letters.length];
    const stem = (n, offset = 0) => Array.from({length: n}, (_, i) => l(i + offset)).join('');
    const shortWords = [...new Set(corpusWords.filter((w) => !w.includes(' ') && codePoints(w).length <= 8))].slice(0, 3);
    const stems = [stem(1), stem(3), stem(5, 2), ...shortWords];
    const lists = ported.wordLists ?? {};
    for (const transform of ported.transforms ?? []) {
        for (const original of transform.rules ?? []) {
            for (const rule of expandCrossProduct(original)) {
                const minimum = rule.stemMinLength ?? 0;
                const local = [...stems, ...(minimum > 1 ? [stem(minimum - 1, 1), stem(minimum, 1)] : [])];
                const changeStems = (rule.stemChange?.from ?? []).flatMap((from) => [l(0) + from + l(1), l(2) + from + l(1) + l(3), from + l(1)]);
                switch (rule.type) {
                    case 'suffix':
                        add(rule.inflected);
                        for (const s of [...local, ...changeStems]) { add(s + rule.inflected); }
                        break;
                    case 'prefix':
                        add(rule.inflected);
                        for (const s of [...local, ...changeStems]) { add(rule.inflected + s); }
                        break;
                    case 'wholeWord':
                        add(rule.inflected);
                        add(l(0) + rule.inflected);
                        break;
                    case 'circumfix': {
                        const p = rule.inflectedPrefix ?? '';
                        const s = rule.inflectedSuffix ?? '';
                        add(p + s);
                        for (const middle of [stem(1), stem(3), ...changeStems]) { add(p + middle + s); }
                        break;
                    }
                    case 'replace':
                        add(rule.inflected);
                        add(l(0) + rule.inflected + l(1));
                        add(rule.inflected + stem(2));
                        break;
                    case 'pattern':
                        if (typeof rule.anchorSuffix === 'string') {
                            for (const s of stems) { add(s + rule.anchorSuffix); }
                        }
                        if (typeof rule.anchorPrefix === 'string') {
                            for (const s of stems) { add(rule.anchorPrefix + s); }
                        }
                        break;
                    case 'phrasal':
                        for (const word of lists[rule.followedBy] ?? []) {
                            add(`${stem(3)}${rule.inflected} ${word}`);
                        }
                        for (const word of (lists[rule.followedBy] ?? []).slice(0, 8)) {
                            add(`${stem(3)}${rule.inflected} ${word}${l(1)}`);
                            add(`${stem(3)}${rule.inflected} ${word} ${stem(2)}`);
                        }
                        break;
                    case 'interposedObject': {
                        const particles = lists[rule.particles] ?? [];
                        const guards = lists[rule.guardWords] ?? [];
                        for (const particle of particles) {
                            add(`${stem(3)} ${stem(2, 1)} ${particle}`);
                            add(`${stem(3)} ${stem(3, 2)} ${stem(4, 1)} ${particle} ${stem(2)}`);
                        }
                        for (const guard of guards.slice(0, 12)) {
                            add(`${stem(3)} ${guard} ${stem(2, 1)} ${particles[0] ?? ''}`);
                        }
                        break;
                    }
                }
            }
        }
    }
    for (const source of testSources) {
        const cps = codePoints(source);
        for (let n = 1; n <= cps.length; ++n) { add(cps.slice(0, n).join('')); }
    }
    for (const word of corpusWords) { add(word); }
    return out;
}

function conditionLeaves(conditions) {
    return Object.entries(conditions ?? {}).filter(([, c]) => c.subConditions === undefined).map(([name]) => name);
}

/**
 * Yomitan's transformer for a descriptor, with lastIndex reset before every
 * test of a rule that has the g (or y) flag.
 */
function yomitanTransformer(LanguageTransformer, descriptor) {
    const transformer = new LanguageTransformer();
    transformer.addDescriptor(descriptor);
    let reset = 0;
    for (const transform of transformer._transforms) {
        for (const rule of transform.rules) {
            const regExp = rule.isInflected;
            if (regExp instanceof RegExp && (regExp.global || regExp.sticky)) {
                ++reset;
                rule.isInflected = {
                    source: regExp.source,
                    flags: regExp.flags,
                    test(text) {
                        regExp.lastIndex = 0;
                        const result = regExp.test(text);
                        regExp.lastIndex = 0;
                        return result;
                    },
                };
            }
        }
    }
    const leaves = conditionLeaves(descriptor.conditions).map((name) => [name, transformer.getConditionFlagsFromConditionType(name)]);
    return {
        reset,
        transform(text) {
            // The engine neither records nor expands an empty text (section
            // 7.4); Yomitan does both, so such results are dropped here.
            return transformer.transform(text).filter(({text: t, trace}) => t !== '' && trace.every((frame) => frame.text !== '')).map(({text: t, conditions, trace}) => ({
                text: t,
                conditions: leaves.filter(([, flag]) => (conditions & flag) !== 0).map(([name]) => name),
                trace: trace.map((frame) => frame.transform),
            }));
        },
    };
}

function resultSet(results) {
    /** @type {Map<string, {text: string, conditions: string, traces: string[][]}>} */
    const map = new Map();
    for (const {text, conditions, trace} of results) {
        const names = conditions.join('|');
        const key = `${text}\u0000${names}`;
        const entry = map.get(key);
        if (entry === undefined) {
            map.set(key, {text, conditions: names, traces: [trace]});
        } else {
            entry.traces.push(trace);
        }
    }
    return map;
}

function describe(item) {
    const where = item.kind === 'processor' ? ` processor ${item.id}` : '';
    const trace = item.traces?.[0]?.length ? ` via ${item.traces[0].join(' < ')}` : '';
    return `${item.side} only${where}: ${JSON.stringify(item.input)} -> ${JSON.stringify(item.text)}${item.kind === 'rule' ? ` [${item.conditions}]` : ''}${trace}`;
}

/**
 * Compares the rules of sources/yomitan.json with Yomitan's transformer.
 * @returns {Promise<{inputs: number, results: number, unexplained: object[], explained: number, reset: number} | null>}
 */
export async function compareRules({root, pack, cli, languagesDir, differences}) {
    const portedFile = join(pack.dir, 'sources', 'yomitan.json');
    if (!existsSync(portedFile)) { return null; }
    const ported = readJson(portedFile);
    const todos = (ported.transforms ?? []).reduce((n, t) => n + (t.rules ?? []).filter((r) => r.type === 'todo').length, 0);
    if (todos > 0) { throw new Error(`${portedFile} still has ${todos} todo rules; map them first (section 8.3)`); }
    const found = await loadTransformDescriptor(root, pack.code);
    if (found === null) { throw new Error(`${portedFile} exists but Yomitan has no ext/js/language/${pack.code}/*-transforms.js`); }
    const testFile = findTransformTest(root, pack.code);
    const testSources = testFile === null ? [] : (await loadTransformTests(root, testFile)).flatMap((c) => c.tests.map((t) => t.source));
    const corpusWords = [];
    for (const name of ['corpus.tsv', 'cases.tsv', 'defaults.tsv']) {
        const file = join(pack.dir, 'tests', name);
        if (existsSync(file)) {
            for (const row of readDeinflectionTsv(file).rows) { corpusWords.push(row.source, row.term); }
        }
    }
    const inputs = ruleInputs(pack, ported, testSources, corpusWords);
    const LanguageTransformer = await loadLanguageTransformer(root);
    const yomitan = yomitanTransformer(LanguageTransformer, found.descriptor);
    // Yomitan applies every transform, so the engine runs with every optional
    // one of sources/yomitan.json on. The CLI checks the pack with its own
    // rules file and then uses these rules only (section 10.3).
    const answers = runCli(cli, ['--languages', languagesDir, 'deinflect', pack.code, '--stdin', '--all-options', '--transforms', portedFile], inputs);
    const unexplained = [];
    let explained = 0;
    let results = 0;
    inputs.forEach((input, i) => {
        const theirs = resultSet(yomitan.transform(input));
        const ours = resultSet(answers[i].results.map((r) => ({text: r.text, conditions: r.conditions, trace: r.trace})));
        results += theirs.size;
        for (const [side, a, b] of [['yomitan', theirs, ours], ['pack', ours, theirs]]) {
            for (const [key, entry] of a) {
                if (b.has(key)) { continue; }
                const item = {kind: 'rule', side, input, text: entry.text, conditions: entry.conditions, traces: entry.traces};
                if (explain(differences, item) === null) {
                    unexplained.push(item);
                } else {
                    ++explained;
                }
            }
        }
    });
    return {inputs: inputs.length, results, unexplained, explained, reset: yomitan.reset};
}

/**
 * Inputs built from the characters a pack processor names.
 * @param {any} processor
 * @param {ReturnType<typeof loadPack>} pack
 * @param {string[]} letters
 * @returns {string[]}
 */
export function processorInputs(processor, pack, letters) {
    const out = [];
    const a = letters[0] ?? 'a';
    const b = letters[1] ?? 'b';
    const around = (piece) => [piece, a + piece, piece + a, a + piece + b, piece + piece, a + piece + b + piece];
    const sample = (ranges, limit) => {
        const picked = [];
        for (const [first, last] of ranges) {
            for (const cp of new Set([first, last, Math.floor((first + last) / 2)])) {
                if (picked.length < limit) { picked.push(String.fromCodePoint(cp)); }
            }
        }
        return picked;
    };
    for (const steps of processor.variants ?? []) {
        for (const step of steps) {
            switch (stepKind(step)) {
                case 'case':
                    for (const c of letters) { out.push(c, c.toUpperCase(), c.toLowerCase(), c.toUpperCase() + a + b, a.toUpperCase() + c.toUpperCase()); }
                    break;
                case 'strip':
                    for (const c of sample(pack.classes.ranges(step.strip), 64)) { out.push(...around(c)); }
                    break;
                case 'normalize': {
                    if (step.within !== undefined) {
                        for (const c of sample(pack.classes.ranges(step.within), 64)) { out.push(...around(c)); }
                        break;
                    }
                    const field = pack.language.text?.pattern;
                    const inPack = typeof field === 'string' ? pack.classes.matcher(field) : () => true;
                    let n = 0;
                    for (let cp = 0xA0; cp <= 0x1FFFF && n < 400; ++cp) {
                        if (cp >= 0xD800 && cp <= 0xDFFF) { continue; }
                        const c = String.fromCodePoint(cp);
                        const normalized = c.normalize(step.normalize);
                        if (normalized === c || normalized === '') { continue; }
                        if (![...normalized].every((x) => inPack(/** @type {number} */ (x.codePointAt(0))))) { continue; }
                        out.push(c, a + c + b);
                        ++n;
                    }
                    break;
                }
                case 'map':
                    for (const [key, value] of Object.entries(step.map)) { out.push(...around(key), ...around(value)); }
                    break;
                case 'alternatives':
                    for (const [key, values] of Object.entries(step.alternatives)) { out.push(...around(key), ...values.flatMap(around)); }
                    break;
                case 'pattern':
                    for (const c of new Set(step.pattern.replace(/\\u([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(Number.parseInt(h, 16))).replace(/[\\^$.*+?()[\]{}|]/g, ''))) {
                        out.push(...around(c));
                    }
                    break;
                default:
                    break;
            }
        }
    }
    return out;
}

/**
 * Compares the pack's processors with Yomitan's.
 */
export async function compareProcessors({root, pack, cli, differences}) {
    const yomitan = await loadTextProcessors(root, pack.code);
    if (yomitan === null) { return {processors: [], unexplained: [], explained: 0}; }
    const ours = [...(pack.language.lookup?.preprocessors ?? []), ...(pack.language.lookup?.postprocessors ?? [])];
    const base = corpusStrings(pack);
    const letters = stemLetters(pack, base);
    const unexplained = [];
    let explained = 0;
    const processors = [];
    for (const theirs of [...yomitan.preprocessors, ...yomitan.postprocessors]) {
        const mine = ours.find((p) => p.id === theirs.id);
        if (mine === undefined) {
            const item = {kind: 'processor', id: theirs.id, side: 'yomitan', input: '*', text: '*', conditions: '*'};
            if (explain(differences, item) === null) {
                unexplained.push({...item, note: `Yomitan's ${theirs.id} has no pack processor with that id`});
            } else {
                ++explained;
            }
            processors.push({id: theirs.id, paired: false, inputs: 0});
            continue;
        }
        const seen = new Set();
        const inputs = [...base, ...processorInputs(mine, pack, letters)].filter((t) => t !== '' && !/[\n\r]/.test(t) && !seen.has(t) && seen.add(t));
        const temp = mkdtempSync(join(tmpdir(), 'hoshidicts-check-yomitan-'));
        let answers;
        try {
            const {optional: _optional, ...alone} = mine;
            const language = structuredClone(pack.language);
            language.lookup = {...language.lookup, preprocessors: [alone], postprocessors: [], transforms: null, variantPasses: []};
            language.settings = [];
            mkdirSync(join(temp, pack.code));
            writeFileSync(join(temp, pack.code, 'language.json'), JSON.stringify(language, null, 2));
            answers = runCli(cli, ['--languages', temp, 'preprocess', pack.code, '--stdin'], inputs);
        } finally {
            rmSync(temp, {recursive: true, force: true});
        }
        inputs.forEach((input, i) => {
            const theirSet = new Set(theirs.process(input));
            const ourSet = new Set(answers[i].variants.map((v) => v.text));
            for (const [side, a, b] of [['yomitan', theirSet, ourSet], ['pack', ourSet, theirSet]]) {
                for (const text of a) {
                    if (b.has(text)) { continue; }
                    const item = {kind: 'processor', id: theirs.id, side, input, text, conditions: '*'};
                    if (explain(differences, item) === null) {
                        unexplained.push(item);
                    } else {
                        ++explained;
                    }
                }
            }
        });
        processors.push({id: theirs.id, paired: true, inputs: inputs.length});
    }
    return {processors, unexplained, explained};
}

/**
 * Runs the whole check for one pack.
 * @returns {Promise<{ok: boolean, lines: string[]}>}
 */
export async function checkYomitan(root, code, {cli = DEFAULT_CLI, languagesDir = DEFAULT_LANGUAGES_DIR, show = 20} = {}) {
    const pack = loadPack(code, {languagesDir});
    const differencesFile = join(pack.dir, 'sources', 'yomitan-differences.tsv');
    const differences = readDifferences(differencesFile);
    const lines = [];
    let ok = true;
    const rules = await compareRules({root, pack, cli, languagesDir: resolve(languagesDir), differences});
    if (rules === null) {
        lines.push(`${code}: no sources/yomitan.json; rules not compared`);
    } else {
        lines.push(`${code}: rules: ${rules.inputs} inputs, ${rules.results} Yomitan results, ${rules.explained} listed differences, ${rules.unexplained.length} unexplained (lastIndex reset on ${rules.reset} rules)`);
        if (rules.unexplained.length > 0) { ok = false; }
        for (const item of rules.unexplained.slice(0, show)) { lines.push(`  ${describe(item)}`); }
    }
    if (code === 'ja') {
        lines.push(`${code}: processors exempt (section 11.3)`);
    } else {
        const processors = await compareProcessors({root, pack, cli, differences});
        lines.push(`${code}: processors: ${processors.processors.map((p) => (p.paired ? `${p.id} (${p.inputs} inputs)` : `${p.id} (unpaired)`)).join(', ') || 'none in Yomitan'}; ${processors.explained} listed differences, ${processors.unexplained.length} unexplained`);
        if (processors.unexplained.length > 0) { ok = false; }
        for (const item of processors.unexplained.slice(0, show)) { lines.push(`  ${item.note ?? describe(item)}`); }
    }
    for (const row of differences) {
        if (row.used === 0) { lines.push(`${code}: note: ${differencesFile}:${row.line} explains nothing in this run`); }
    }
    return {ok, lines};
}

function usage() {
    console.error('usage: node tools/check-yomitan.mjs <yomitan checkout> <code>... | --all [--cli <hoshidicts-cli>] [--languages <dir>] [--show <n>]');
    return 2;
}

async function main(argv) {
    const positional = [];
    let cli = process.env.HOSHIDICTS_CLI ?? DEFAULT_CLI;
    let languagesDir = DEFAULT_LANGUAGES_DIR;
    let all = false;
    let show = 20;
    for (let i = 0; i < argv.length; ++i) {
        const arg = argv[i];
        if (arg === '--cli') {
            cli = argv[++i];
        } else if (arg === '--languages') {
            languagesDir = argv[++i];
        } else if (arg === '--all') {
            all = true;
        } else if (arg === '--show') {
            show = Number(argv[++i]);
        } else if (arg.startsWith('-')) {
            return usage();
        } else {
            positional.push(arg);
        }
    }
    if (positional.length < 1 || cli === undefined || languagesDir === undefined || !(show >= 0)) { return usage(); }
    const [root, ...codes] = positional;
    if (all) { codes.push(...listPacks(languagesDir).filter((c) => !codes.includes(c))); }
    if (codes.length === 0) { return usage(); }
    const revision = yomitanRevision(root);
    if (revision !== PINNED_REVISION) {
        console.warn(`warning: ${root} is at ${revision ?? 'an unknown revision'}, not the pinned ${PINNED_REVISION}`);
    }
    if (!/\.m?js$/.test(cli) && !existsSync(cli)) {
        console.error(`${cli} does not exist; build hoshidicts-cli (cmake -DHOSHIDICTS_CLI=ON) or pass --cli`);
        return 1;
    }
    let failed = 0;
    for (const code of codes) {
        try {
            const {ok, lines} = await checkYomitan(root, code, {cli, languagesDir, show});
            for (const line of lines) { (ok ? console.log : console.error)(line); }
            if (!ok) { ++failed; }
        } catch (error) {
            console.error(`${code}: ${error.message}`);
            ++failed;
        }
    }
    return failed === 0 ? 0 : 1;
}

if (isMain(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
