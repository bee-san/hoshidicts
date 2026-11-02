#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Chooses which of Yomitan's rules the final Korean rule set leaves out
// (docs/languages.md, section 14 step 5) and writes sources/removed-rules.tsv,
// which sources/final-rules.mjs applies:
//
//   node languages/ko/sources/select-rules.mjs --unimorph <unimorph kor file> --terms <extracted kty-ko-en.zip> --sentences <Tatoeba kor_sentences.tsv> [--cli build/hoshidicts-cli]
//
// Measurement sets (written to a temporary directory, never committed):
//   - every V/ADJ form -> lemma pair of UniMorph Korean that is plain Hangul
//     (191,146 pairs at 35bbecb);
//   - tests/cases.tsv and tests/yomitan.tsv with `reasons` relaxed to `*` in
//     their valid rows, since own and Yomitan rules give different traces for
//     the same lemma;
//   - 75,000 noun + particle rows (3,000 nouns, pronouns and names of the
//     dictionary, of at most three syllables, each with 25 particles and
//     copula forms, such as 학교에서 -> 학교, seeded), and the prefixes of
//     those words that end inside the particle (학교에), which a lookup also
//     tries: any other headword a rule reaches from them is a false candidate.
//     Nouns are reached by shortening, not by rules, so these rows count only
//     false candidates, never recoveries or recall;
//   - every Korean word of Tatoeba's Korean sentences (CC BY 2.0 FR) whose
//     lemma is unambiguous: a headword of the dictionary, a form with one
//     lemma in UniMorph, or a noun + particle (12,852 words of 20,469 in the
//     2026-11-02 export). Like the nouns, these rows count only false
//     candidates.
// The dictionary is kty-ko-en without its form-of rows (rows whose glossary
// is only [lemma, [inflection]] references): they match inflected words
// exactly and say nothing about the rules.
//
// Each round runs `hoshidicts-cli eval-language --per-rule --dictionary` on
// the sets with the union of sources/own.json and sources/yomitan.json minus
// the rules removed so far, and removes every Yomitan rule that recovers no
// row (every row it helps has another path) but adds a false candidate or
// breaks a negative. Own rules are never removed. A round that would lower
// recall on any set is undone rule by rule. It stops when no rule qualifies.
// A negative that several paths break gives no single rule the blame, so a
// phase replays the deinflections of every negative still broken and
// removes the Yomitan rules on those paths that recover no row.
// A last phase looks at ranking: a lookup ranks the readings of a word by
// trace length, so a false candidate reached in as few steps as the lemma
// ties with it. For each valid row of the UniMorph, cases and Yomitan sets
// where that happens with the candidate set but not with sources/own.json
// alone, the Yomitan rules on the short paths to the false candidate that
// recover no row are removed (Yomitan's one-step -(으)셔요 ties 마셔요 -> 마다
// with 마셔요 -> 마시다, where own rules take two steps to 마다).

import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mergeTransforms} from '../../../tools/merge-transforms.mjs';
import {formatTransforms} from '../../../tools/lib/json.mjs';
import {removeRules, ruleKey} from './final-rules.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pack = resolve(here, '..');
const repo = resolve(pack, '..', '..');

function args(argv) {
    const out = {cli: join(repo, 'build', 'hoshidicts-cli')};
    for (let i = 0; i < argv.length; ++i) {
        const key = argv[i].replace(/^--/, '');
        out[key] = argv[++i];
    }
    if (!out.unimorph || !out.terms || !out.sentences) {
        console.error('usage: node languages/ko/sources/select-rules.mjs --unimorph <kor> --terms <extracted kty-ko-en.zip> --sentences <kor_sentences.tsv> [--cli <hoshidicts-cli>]');
        process.exit(2);
    }
    return out;
}

// --- A stored ZIP, as tests/language_conformance_test.cpp writes one ---------
const CRC = Array.from({length: 256}, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; ++k) { c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; }
    return c >>> 0;
});
function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (const b of buf) { c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); }
    return (c ^ 0xFFFFFFFF) >>> 0;
}
function storedZip(files) {
    const parts = [];
    const central = [];
    let offset = 0;
    for (const [name, data] of files) {
        const n = Buffer.from(name, 'utf8');
        const crc = crc32(data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
        local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(n.length, 26);
        parts.push(local, n, data);
        const entry = Buffer.alloc(46);
        entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x0800, 8);
        entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(data.length, 24);
        entry.writeUInt16LE(n.length, 28); entry.writeUInt32LE(offset, 42);
        central.push(entry, n);
        offset += 30 + n.length + data.length;
    }
    const size = central.reduce((s, b) => s + b.length, 0);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16);
    return Buffer.concat([...parts, ...central, end]);
}

function isFormOf(row) {
    const glossary = row[5];
    return Array.isArray(glossary) && glossary.length > 0 && glossary.every((g) => Array.isArray(g));
}

/** Imports kty-ko-en without its form-of rows; returns the imported directory and the headwords' tags. */
function lemmaDictionary(termsDir, work, cli) {
    const files = [];
    const tags = new Map();
    for (const name of readdirSync(termsDir).sort()) {
        const data = readFileSync(join(termsDir, name));
        if (/^term_bank_\d+\.json$/.test(name)) {
            const rows = JSON.parse(data.toString('utf8')).filter((r) => !isFormOf(r));
            for (const r of rows) {
                const set = tags.get(r[0]) ?? new Set();
                for (const t of (r[3] || '').split(' ').filter(Boolean)) { set.add(t); }
                tags.set(r[0], set);
            }
            files.push([name, Buffer.from(JSON.stringify(rows))]);
        } else if (name === 'index.json') {
            const index = JSON.parse(data.toString('utf8'));
            index.title = `${index.title} lemmas`;
            files.push([name, Buffer.from(JSON.stringify(index))]);
        } else {
            files.push([name, data]);
        }
    }
    const zip = join(work, 'lemmas.zip');
    writeFileSync(zip, storedZip(files));
    const run = spawnSync(cli, ['import', zip], {encoding: 'utf8'});
    if (run.status !== 0) { throw new Error(`import failed: ${run.stderr}`); }
    const title = /^title: (.*)$/m.exec(run.stdout)[1];
    return {dir: join(work, title), tags};
}

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

// Sets whose rows count only false candidates (section comment at the top).
const FALSE_CANDIDATES_ONLY = new Set(['nouns', 'sentences']);

const PARTICLES = [['이', '가'], ['을', '를'], ['은', '는'], ['의', '의'], ['에', '에'], ['에서', '에서'], ['에게', '에게'], ['도', '도'], ['만', '만'],
    ['으로', '로'], ['과', '와'], ['이나', '나'], ['이야', '야'], ['이라면', '라면'], ['이라고', '라고'], ['처럼', '처럼'], ['마다', '마다'], ['까지', '까지'],
    ['부터', '부터'], ['한테', '한테'], ['이랑', '랑'], ['이다', '다'], ['이에요', '예요'], ['이었다', '였다'], ['인데', '인데']];

function measurementSets(options, work, tags) {
    const sets = {};
    // UniMorph: every V/ADJ pair of plain Hangul.
    const seen = new Set();
    const unimorph = ['# UniMorph kor, every V/ADJ pair (measurement only)'];
    for (const line of readFileSync(options.unimorph, 'utf8').split('\n')) {
        const [lemma, form, tagSet] = line.split('\t');
        if (!tagSet) { continue; }
        const pos = tagSet.split(/[;.]/)[0];
        if ((pos !== 'V' && pos !== 'ADJ') || !/^[가-힣]+다$/.test(lemma) || !/^[가-힣]+$/.test(form)) { continue; }
        const key = `${form}\t${lemma}`;
        if (seen.has(key)) { continue; }
        seen.add(key);
        unimorph.push([tagSet, 1, form, lemma, pos === 'V' ? 'v' : 'adj', '*'].join('\t'));
    }
    sets.unimorph = unimorph;
    // The pack's hand-written and Yomitan test files, valid rows' traces relaxed.
    for (const name of ['cases', 'yomitan']) {
        sets[name] = readFileSync(join(pack, 'tests', `${name}.tsv`), 'utf8').split('\n').filter(Boolean).map((line) => {
            if (line.startsWith('#')) { return line; }
            const cells = line.split('\t');
            if (cells[1] === '1') { cells[5] = '*'; }
            return cells.join('\t');
        });
    }
    // Nouns, pronouns and names with particles.
    const nouns = [...tags].filter(([w, t]) => (t.has('n') || t.has('pron') || t.has('name')) && /^[가-힣]{1,3}$/.test(w) && !w.endsWith('다')).map(([w]) => w).sort();
    const random = mulberry32(1);
    for (let i = nouns.length - 1; i > 0; --i) {
        const j = Math.floor(random() * (i + 1));
        [nouns[i], nouns[j]] = [nouns[j], nouns[i]];
    }
    const hasFinal = (w) => (w.codePointAt(w.length - 1) - 0xAC00) % 28 !== 0;
    sets.nouns = ['# noun + particle (measurement only)'];
    const prefixes = new Set();
    for (const noun of nouns.slice(0, 3000)) {
        for (const [afterConsonant, afterVowel] of PARTICLES) {
            const word = noun + (hasFinal(noun) ? afterConsonant : afterVowel);
            sets.nouns.push(['np', 1, word, noun, '*', '*'].join('\t'));
            // Character resolution also looks up every prefix (section 9.2); a
            // prefix that ends inside the particle (우리마 of 우리마다) must not
            // reach another headword either, or it outranks the noun.
            for (let n = noun.length + 1; n < word.length; ++n) {
                prefixes.add(['np prefix', 1, word.slice(0, n), noun, '*', '*'].join('\t'));
            }
        }
    }
    sets.nouns.push(...prefixes);
    sets.sentences = silverWords(options.sentences, options.unimorph, tags);
    const files = {};
    for (const [name, lines] of Object.entries(sets)) {
        files[name] = join(work, `${name}.tsv`);
        writeFileSync(files[name], `${lines.join('\n')}\n`);
    }
    return files;
}


const SILVER_PARTICLES = ['이', '가', '을', '를', '은', '는', '의', '에', '에서', '에게', '께', '께서', '도', '만', '으로', '로', '과', '와', '이나', '나',
    '이야', '야', '처럼', '마다', '까지', '부터', '한테', '랑', '이랑', '서', '보다', '밖에', '조차', '마저', '만큼', '대로', '라도', '이라도', '요', '이요',
    '에는', '에도', '에서는', '에서도', '에게는', '에게도', '으로는', '로는', '와는', '과는', '까지는', '까지도', '부터는', '만은', '만이', '만을', '이다',
    '다', '이었다', '였다', '이에요', '예요', '입니다', '인', '인데', '이고', '고', '이라고', '라고', '이라는', '라는', '이지만', '지만', '이면', '면',
    '이라면', '라면', '들', '들이', '들을', '들은', '들의', '들에게', '들도', '들과', '들이다'];

/** Tatoeba words with one lemma by the dictionary, UniMorph or a noun + particle split. */
function silverWords(sentencesFile, unimorphFile, tags) {
    const forms = new Map();
    for (const line of readFileSync(unimorphFile, 'utf8').split('\n')) {
        const [lemma, form, tagSet] = line.split('\t');
        if (!tagSet || !/^[가-힣]+다$/.test(lemma) || !/^[가-힣]+$/.test(form)) { continue; }
        const set = forms.get(form) ?? new Set();
        set.add(lemma);
        forms.set(form, set);
    }
    const nounLike = (w) => { const t = tags.get(w); return t !== undefined && (t.has('n') || t.has('pron') || t.has('name')); };
    const split = (word) => {
        for (let i = word.length - 1; i >= 1; --i) {
            if (nounLike(word.slice(0, i)) && SILVER_PARTICLES.includes(word.slice(i))) { return word.slice(0, i); }
        }
        return null;
    };
    const lines = ['# Tatoeba words with one lemma (measurement only)'];
    const seen = new Set();
    for (const line of readFileSync(sentencesFile, 'utf8').split('\n')) {
        const text = (line.split('\t')[2] ?? '').normalize('NFC');
        for (const [word] of text.matchAll(/[\uAC00-\uD7A3]+/g)) {
            if (seen.has(word)) { continue; }
            seen.add(word);
            const labels = new Set();
            if (tags.has(word)) { labels.add(word); }
            for (const lemma of forms.get(word) ?? []) { labels.add(lemma); }
            if (labels.size === 0) {
                const noun = split(word);
                if (noun !== null) { labels.add(noun); }
            }
            if (labels.size === 1) { lines.push(['tatoeba', 1, word, [...labels][0], '*', '*'].join('\t')); }
        }
    }
    return lines;
}

function evaluate(cli, transformsFile, setFile, dictionary) {
    const run = spawnSync(cli, ['eval-language', 'ko', setFile, '--transforms', transformsFile, '--dictionary', dictionary, '--per-rule'], {encoding: 'utf8', maxBuffer: 1 << 30});
    if (run.status !== 0) { throw new Error(`eval-language failed on ${setFile}: ${run.stderr}`); }
    return JSON.parse(run.stdout);
}

/** The final rule set without `removed`, with the per-rule sums over every set. */
function measure(options, work, files, dictionary, removed) {
    const own = JSON.parse(readFileSync(join(here, 'own.json'), 'utf8'));
    const yomitan = removeRules(JSON.parse(readFileSync(join(here, 'yomitan.json'), 'utf8')), removed);
    const {transforms} = mergeTransforms(own, yomitan);
    const file = join(work, 'candidate.json');
    writeFileSync(file, formatTransforms(transforms));
    const rules = new Map();
    for (const t of transforms.transforms) {
        t.rules.forEach((r, i) => rules.set(`${t.id}#${i}`, {transform: t.id, rule: r, source: r.source ?? t.source, recovers: 0, falseCandidates: 0, breaks: 0}));
    }
    const recall = {};
    for (const [name, setFile] of Object.entries(files)) {
        const result = evaluate(options.cli, file, setFile, dictionary);
        recall[name] = {recall: result.recall, negativesPassed: result.negativesPassed, falseCandidates: result.falseCandidates, firstRank: result.firstRank};
        for (const p of result.perRule) {
            const r = rules.get(`${p.transform}#${p.rule}`);
            // Nouns are reached by shortening, not by rules: their rows only
            // count the false candidates rules add.
            if (!FALSE_CANDIDATES_ONLY.has(name)) { r.recovers += p.recovers; }
            r.falseCandidates += p.falseCandidates;
            r.breaks += p.breaks;
        }
    }
    return {rules: [...rules.values()], recall};
}


// Hangul syllables as the jamo the rules see (hangul.disassemble).
const CHO = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
const JUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅗㅏ', 'ㅗㅐ', 'ㅗㅣ', 'ㅛ', 'ㅜ', 'ㅜㅓ', 'ㅜㅔ', 'ㅜㅣ', 'ㅠ', 'ㅡ', 'ㅡㅣ', 'ㅣ'];
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄱㅅ', 'ㄴ', 'ㄴㅈ', 'ㄴㅎ', 'ㄷ', 'ㄹ', 'ㄹㄱ', 'ㄹㅁ', 'ㄹㅂ', 'ㄹㅅ', 'ㄹㅌ', 'ㄹㅍ', 'ㄹㅎ', 'ㅁ', 'ㅂ', 'ㅂㅅ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
function jamo(text) {
    let out = '';
    for (const c of text) {
        const cp = c.codePointAt(0);
        if (cp >= 0xAC00 && cp <= 0xD7A3) {
            const i = cp - 0xAC00;
            out += CHO[Math.floor(i / 588)] + JUNG[Math.floor((i % 588) / 28)] + JONG[i % 28];
        } else {
            out += c;
        }
    }
    return out;
}

/** Results of `hoshidicts-cli deinflect` for one source with a transforms object. */
function deinflectOne(cli, work, transforms, source) {
    const file = join(work, 'probe.json');
    writeFileSync(file, JSON.stringify(transforms));
    const run = spawnSync(cli, ['deinflect', 'ko', jamo(source), '--all-options', '--transforms', file], {encoding: 'utf8'});
    if (run.status !== 0) { throw new Error(`deinflect failed: ${run.stderr}`); }
    return JSON.parse(run.stdout.split('\n').find((l) => l.startsWith('{'))).results;
}

/** The transforms object without one rule (by transform id and rule key). */
function withoutRule(transforms, transformId, key) {
    const out = structuredClone(transforms);
    const t = out.transforms.find((x) => x.id === transformId);
    t.rules = t.rules.filter((r) => ruleKey(r) !== key);
    return out;
}

/**
 * The Yomitan rules of `transforms` without which no result that `bad`
 * accepts remains for `source`, found by deinflecting again: a rule whose
 * removal alone leaves none; otherwise every Yomitan rule whose removal
 * leaves fewer, when removing them together leaves none. Empty when own
 * rules give such a result too.
 */
function blameByRemoval(cli, work, transforms, source, bad) {
    const offending = deinflectOne(cli, work, transforms, source).filter(bad).length;
    if (offending === 0) { return []; }
    const ids = new Set(deinflectOne(cli, work, transforms, source).filter(bad).flatMap((r) => r.trace));
    const alone = [];
    const helping = [];
    for (const t of transforms.transforms) {
        if (!ids.has(t.id)) { continue; }
        for (const rule of t.rules) {
            if ((rule.source ?? t.source) !== 'yomitan') { continue; }
            const left = deinflectOne(cli, work, withoutRule(transforms, t.id, ruleKey(rule)), source).filter(bad).length;
            if (left === 0) { alone.push({transform: t.id, rule}); } else if (left < offending) { helping.push({transform: t.id, rule}); }
        }
    }
    if (alone.length > 0) { return alone; }
    let without = transforms;
    for (const h of helping) { without = withoutRule(without, h.transform, ruleKey(h.rule)); }
    return helping.length > 0 && !deinflectOne(cli, work, without, source).some(bad) ? helping : [];
}

/** Whether a deinflection result gives a corpus row's term under its rule and reasons (row_matches). */
function matchesRow(result, row) {
    if (jamo(result.text) !== jamo(row.term)) { return false; }
    if (row.rule !== null && result.conditions.length > 0 && !result.conditions.includes(row.rule)) { return false; }
    return row.reasons === null || result.trace.join('|') === row.reasons.join('|');
}

function deinflectAll(cli, transformsFile, sources) {
    const run = spawnSync(cli, ['deinflect', 'ko', '--stdin', '--all-options', '--transforms', transformsFile], {input: `${sources.map(jamo).join('\n')}\n`, encoding: 'utf8', maxBuffer: 1 << 30});
    if (run.status !== 0) { throw new Error(`deinflect failed: ${run.stderr}`); }
    return run.stdout.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l).results);
}

/**
 * For each row: the false candidates (jamo text -> shortest trace) a lookup of
 * the whole source reaches in no more steps than the lemma, with their
 * results, or null when there are none.
 */
function rankRisks(results, rows, tagsByJamo, dictForm) {
    return rows.map((row, i) => {
        const lemma = jamo(row.term);
        const source = jamo(row.source);
        let best = Infinity;
        const others = new Map();
        for (const r of results[i]) {
            const text = jamo(r.text);
            if (text === source) { continue; }
            const tags = tagsByJamo.get(text);
            if (tags === undefined) { continue; }
            if (r.conditions.length > 0 && !r.conditions.some((c) => dictForm.has(c) && tags.has(c))) { continue; }
            if (text === lemma) {
                best = Math.min(best, r.trace.length);
            } else {
                const list = others.get(text) ?? [];
                list.push(r);
                others.set(text, list);
            }
        }
        if (best === Infinity) { return null; }
        const risky = [...others].filter(([, list]) => list.some((r) => r.trace.length <= best));
        return risky.length === 0 ? null : {best, risky};
    });
}

/** Yomitan rules that tie a false candidate with the lemma where own rules alone do not. */
function rankingBlame(options, work, files, tags, current) {
    const tagsByJamo = new Map([...tags].map(([w, t]) => [jamo(w), t]));
    const candidateFile = join(work, 'candidate.json');
    const transforms = JSON.parse(readFileSync(candidateFile, 'utf8'));
    const dictForm = new Set(Object.entries(transforms.conditions).filter(([, c]) => c.isDictionaryForm).map(([k]) => k));
    const recovering = new Set(current.rules.filter((r) => r.recovers > 0).map((r) => `${r.transform}#${ruleKey(r.rule)}`));
    const blamed = new Map();
    for (const name of ['unimorph', 'cases', 'yomitan']) {
        const rows = readFileSync(files[name], 'utf8').split('\n').filter((l) => l !== '' && !l.startsWith('#')).map((l) => l.split('\t'))
            .filter((c) => c[1] === '1').map((c) => ({source: c[2], term: c[3]}));
        const sources = rows.map((r) => r.source);
        const mine = rankRisks(deinflectAll(options.cli, join(here, 'own.json'), sources), rows, tagsByJamo, dictForm);
        const results = deinflectAll(options.cli, candidateFile, sources);
        const theirs = rankRisks(results, rows, tagsByJamo, dictForm);
        rows.forEach((row, i) => {
            if (theirs[i] === null || mine[i] !== null) { return; }
            for (const [text, list] of theirs[i].risky) {
                const best = theirs[i].best;
                const tie = (r) => jamo(r.text) === text && r.trace.length <= best && (r.conditions.length === 0 || r.conditions.some((c) => dictForm.has(c) && (tagsByJamo.get(text) ?? new Set()).has(c)));
                for (const u of blameByRemoval(options.cli, work, transforms, row.source, tie)) {
                    const key = `${u.transform}#${ruleKey(u.rule)}`;
                    if (recovering.has(key)) { continue; }
                    const e = blamed.get(key) ?? {...u, recovers: 0, falseCandidates: 0, breaks: 0, ties: 0, example: `${row.source} -> ${row.term}`};
                    ++e.ties;
                    blamed.set(key, e);
                }
                void list;
            }
        });
    }
    return [...blamed.values()];
}

function withoutSource(rule) {
    const {source: _source, ...rest} = rule;
    return rest;
}

function lowered(before, after) {
    return Object.keys(before).filter((name) => !FALSE_CANDIDATES_ONLY.has(name) && after[name].recall < before[name].recall);
}

function main() {
    const options = args(process.argv.slice(2));
    const work = mkdtempSync(join(tmpdir(), 'ko-select-'));
    try {
        const {dir: dictionary, tags} = lemmaDictionary(resolve(options.terms), work, options.cli);
        const files = measurementSets(options, work, tags);
        const removed = [];
        let current = measure(options, work, files, dictionary, removed);
        const start = current.recall;
        for (let round = 1; ; ++round) {
            const candidates = current.rules.filter((r) => r.source === 'yomitan' && r.recovers === 0 && (r.falseCandidates > 0 || r.breaks > 0));
            if (candidates.length === 0) { break; }
            let next = measure(options, work, files, dictionary, [...removed, ...candidates]);
            let accepted = candidates;
            if (lowered(current.recall, next.recall).length > 0) {
                // Undo the round and take the candidates one at a time.
                accepted = [];
                for (const c of candidates) {
                    const trial = measure(options, work, files, dictionary, [...removed, ...accepted, c]);
                    if (lowered(current.recall, trial.recall).length === 0) { accepted.push(c); next = trial; }
                }
                if (accepted.length === 0) { break; }
            }
            removed.push(...accepted);
            current = next;
            console.log(`round ${round}: removed ${accepted.length} Yomitan rules (${removed.length} in all)`);
        }
        // Negatives broken by several paths at once (candidate.json is the current set again).
        current = measure(options, work, files, dictionary, removed);
        const recovering = new Set(current.rules.filter((r) => r.recovers > 0).map((r) => `${r.transform}#${ruleKey(r.rule)}`));
        const negatives = [];
        for (const name of ['cases', 'yomitan']) {
            for (const line of readFileSync(files[name], 'utf8').split('\n')) {
                const cells = line.split('\t');
                if (line.startsWith('#') || cells.length !== 6 || cells[1] !== '0') { continue; }
                negatives.push({source: cells[2], term: cells[3], rule: cells[4] === '*' ? null : cells[4], reasons: cells[5] === '*' ? null : cells[5] === '' ? [] : cells[5].split('|')});
            }
        }
        const candidateFile = join(work, 'candidate.json');
        const transforms = JSON.parse(readFileSync(candidateFile, 'utf8'));
        const blamed = new Map();
        for (const row of negatives) {
            for (const r of blameByRemoval(options.cli, work, transforms, row.source, (result) => matchesRow(result, row))) {
                const key = `${r.transform}#${ruleKey(r.rule)}`;
                if (!recovering.has(key)) { blamed.set(key, {...r, recovers: 0, falseCandidates: 0, breaks: 1, negative: `${row.source} -> ${row.term}`}); }
            }
        }
        const accepted = [];
        for (const c of blamed.values()) {
            const trial = measure(options, work, files, dictionary, [...removed, ...accepted, c]);
            if (lowered(current.recall, trial.recall).length === 0) { accepted.push(c); current = trial; }
        }
        removed.push(...accepted);
        console.log(`negatives: removed ${accepted.length} Yomitan rules on the paths of broken negatives (${removed.length} in all)`);
        // Ranking: rules that tie a false candidate with the lemma.
        for (let round = 1; round <= 3; ++round) {
            current = measure(options, work, files, dictionary, removed);
            const blamed = rankingBlame(options, work, files, tags, current);
            if (blamed.length === 0) { break; }
            let trial = measure(options, work, files, dictionary, [...removed, ...blamed]);
            let taken = blamed;
            if (lowered(current.recall, trial.recall).length > 0) {
                taken = [];
                for (const c of blamed) {
                    const one = measure(options, work, files, dictionary, [...removed, ...taken, c]);
                    if (lowered(current.recall, one.recall).length === 0) { taken.push(c); trial = one; }
                }
            }
            if (taken.length === 0) { break; }
            removed.push(...taken);
            current = trial;
            console.log(`ranking ${round}: removed ${taken.length} Yomitan rules that tie a false candidate with the lemma (${removed.length} in all)`);
        }
        const lines = [
            '# Yomitan rules the final rule set leaves out, written by sources/select-rules.mjs; sources/final-rules.mjs applies them.',
            '# Each recovers no row of the measurement sets but adds false candidates or breaks negatives (README.md, Measurements).',
            '# transform\trule\trecovers\tfalseCandidates\tbreaks\tnote',
            ...removed.map((r) => [r.transform, JSON.stringify(withoutSource(r.rule)), r.recovers, r.falseCandidates, r.breaks, r.negative ? `breaks ${r.negative} with other paths` : r.ties ? `ties a false candidate with the lemma on ${r.ties} paths, as in ${r.example}` : ''].join('\t')),
        ];
        writeFileSync(join(here, 'removed-rules.tsv'), `${lines.join('\n')}\n`);
        console.log(JSON.stringify({before: start, after: current.recall}, null, 1));
        console.log(`${removed.length} rules in ${join(here, 'removed-rules.tsv')}`);
    } finally {
        rmSync(work, {recursive: true, force: true});
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) { main(); }
export {ruleKey};
