// SPDX-License-Identifier: GPL-3.0-or-later
// The lookup measurements of README.md (Measurements). Not run by any test.
//
//   node languages/ko/sources/measure.mjs <command> --terms <extracted kty-ko-en.zip> --dictionary <kty-ko-en imported> [options]
//
//   frequent <ko_50k.txt> --unimorph <kor>   the 10,000 most frequent words whose lemma a rule reaches
//   positions <kor_sentences.tsv>            Tatoeba: every word position, and the words after a pronoun or 안/못
//   text <file>... [--sample 60]             real text, with a seeded sample of the positions no form-of row judges
//   realuse                                  sources/real-use.tsv
//   traces --unimorph <kor>                  trace quality on UniMorph's finite forms
//   wasm <hachidori checkout> [--runs 10]    hdw_language_load, heap and hdw_lookup on sources/benchmark-words.txt
//
// Options: --cli build/hoshidicts-cli, --batch build/lookup-batch (languages/en/sources/lookup-batch.cpp built
// as its header says), --languages languages. A lookup is what a host's hover makes: the text from the word to
// the end of its sentence, 16 results, scan length 16, default options. Its first result with a definition is
// the first that lookup-batch does not mark as a form-of row. A word's lemmas are the terms its kty-ko-en
// form-of references name ([lemma, [rules]], docs/languages.md 9.10) with an inflection among their rules
// (not only hangeul, hanja, eumhun or a romanization), and for `frequent` UniMorph's lemmas.

import {spawnSync} from 'node:child_process';
import {readFileSync, readdirSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assemble, jamo} from './select-rules.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const option = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const positional = argv.filter((a, i) => !a.startsWith('--') && !(argv[i - 1] ?? '').startsWith('--'));
const [command, ...inputs] = positional;
const cli = resolve(option('--cli', 'build/hoshidicts-cli'));
const batch = resolve(option('--batch', 'build/lookup-batch'));
const languages = resolve(option('--languages', 'languages'));
const dictionary = option('--dictionary', null);
const HANGUL = /[\uAC00-\uD7A3]+/gu;

const INFLECTION = /indicative|interrogative|imperative|hortative|causative|conditional|noun-from-verb|determiner|adnominal|assertive|contrastive|conjunctive|sequential|motive|connective|infinitive|passive|verbal noun|polite|past|future|present/;

/** Each expression's lemmas, as its form-of references with an inflection name them. */
function references(termsDir) {
    const lemmas = new Map();
    for (const name of readdirSync(termsDir).filter((n) => /^term_bank_\d+\.json$/.test(n))) {
        for (const row of JSON.parse(readFileSync(join(termsDir, name), 'utf8'))) {
            for (const g of Array.isArray(row[5]) ? row[5] : []) {
                if (Array.isArray(g) && typeof g[0] === 'string' && g[0] !== '' && Array.isArray(g[1]) && g[1].some((r) => INFLECTION.test(r))) {
                    const set = lemmas.get(row[0]) ?? new Set();
                    set.add(g[0]);
                    lemmas.set(row[0], set);
                }
            }
        }
    }
    return lemmas;
}

function lookup(texts) {
    const run = spawnSync(batch, [languages, 'ko', resolve(dictionary), '16', '16'], {input: `${texts.join('\n')}\n`, encoding: 'utf8', maxBuffer: 1 << 30});
    if (run.status !== 0) { throw new Error(`lookup-batch: ${run.stderr}`); }
    return run.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l).results.find((r) => !r.formOf) ?? null);
}

/**
 * right: a lemma of the word; own: the word's own entry; phrase: an entry of several words that begins with
 * the word, matched as written (캐나다 사람, 안 돼요); wrong: anything else; none: no result.
 */
function judge(first, word, lemmas) {
    if (first === null) { return 'none'; }
    if (lemmas.has(first.expression)) { return 'right'; }
    if (first.expression === word) { return 'own'; }
    return first.trace.length === 0 && first.matched.startsWith(`${word} `) ? 'phrase' : 'wrong';
}

const pct = (n, d) => `${(100 * n / d).toFixed(2)}%`;
const show = (first) => (first === null ? '-' : `${first.expression}@${first.matched}${first.trace.length ? ` [${first.trace.join(' > ')}]` : ''}`);

function unimorphLemmas(file) {
    const map = new Map();
    for (const line of readFileSync(file, 'utf8').split('\n')) {
        const [lemma, form, tags] = line.split('\t');
        if (!tags || !/^(V|ADJ)/.test(tags)) { continue; }
        const set = map.get(form) ?? new Set();
        set.add(lemma);
        map.set(form, set);
    }
    return map;
}

function deinflect(words) {
    const run = spawnSync(cli, ['deinflect', 'ko', '--stdin', '--transforms', join(here, '..', 'transforms.json')], {input: `${words.map(jamo).join('\n')}\n`, encoding: 'utf8', maxBuffer: 1 << 30});
    if (run.status !== 0) { throw new Error(`deinflect: ${run.stderr}`); }
    return run.stdout.split('\n').filter((l) => l.startsWith('{')).map((l) => new Set(JSON.parse(l).results.map((r) => assemble(r.text))));
}

function frequent(file) {
    const n = Number(option('--n', '10000'));
    const list = readFileSync(file, 'utf8').split('\n').filter(Boolean).slice(0, n).map((l) => l.split(' ')).map(([w, c]) => [w, Number(c)]);
    const refs = references(option('--terms'));
    const um = unimorphLemmas(option('--unimorph'));
    const lemmasOf = (w) => new Set([...(refs.get(w) ?? []), ...(um.get(w) ?? [])]);
    const reached = deinflect(list.map(([w]) => w));
    const rows = list.filter(([w], i) => [...lemmasOf(w)].some((l) => reached[i].has(l)));
    const firsts = lookup(rows.map(([w]) => w));
    const tokens = list.reduce((s, [, c]) => s + c, 0);
    const sum = {right: [0, 0], own: [0, 0], phrase: [0, 0], wrong: [0, 0], none: [0, 0]};
    const wrong = [];
    rows.forEach(([w, c], i) => {
        const verdict = judge(firsts[i], w, lemmasOf(w));
        sum[verdict][0] += 1;
        sum[verdict][1] += c;
        if (verdict === 'wrong' || verdict === 'none') { wrong.push(`${w} (${c}): ${show(firsts[i])}; lemmas ${[...lemmasOf(w)].join(', ')}`); }
    });
    console.log(`${list.length} words, ${tokens} tokens; a rule reaches a lemma of ${rows.length} (${pct(rows.reduce((s, [, c]) => s + c, 0), tokens)} of the tokens)`);
    for (const [k, [words, t]] of Object.entries(sum)) { console.log(`  ${k}: ${words} words, ${pct(t, tokens)} of the tokens`); }
    for (const line of wrong.slice(0, Number(option('--show', '40')))) { console.log(`  ${line}`); }
}

/** [text from the word to the end, word, previous word] for every word of every sentence. */
function positionsOf(sentences) {
    const out = [];
    for (const s of sentences) {
        let previous = null;
        for (const m of s.matchAll(HANGUL)) {
            out.push([s.slice(m.index), m[0], previous]);
            previous = m[0];
        }
    }
    return out;
}

function report(name, items, refs) {
    const firsts = lookup(items.map(([t]) => t));
    const sum = {right: 0, own: 0, phrase: 0, wrong: 0, none: 0};
    let judged = 0;
    const rest = [];
    const wrongBy = new Map();
    items.forEach(([, w], i) => {
        const lemmas = refs.get(w);
        if (!lemmas) { if (firsts[i] !== null) { rest.push(i); } else { sum.none += 1; } return; }
        ++judged;
        const verdict = judge(firsts[i], w, lemmas);
        sum[verdict] += 1;
        if (verdict === 'wrong') {
            const key = firsts[i].trace[0] ?? '(no rule)';
            const group = wrongBy.get(key) ?? {n: 0, examples: new Map()};
            group.n += 1;
            const e = `${w}: ${show(firsts[i])}`;
            group.examples.set(e, (group.examples.get(e) ?? 0) + 1);
            wrongBy.set(key, group);
        }
    });
    console.log(`${name}: ${items.length} positions, ${items.length - sum.none} find something; form-of rows name the word's lemmas at ${judged}:`
        + ` right ${sum.right}, own entry ${sum.own}, phrase entry ${sum.phrase}, wrong ${sum.wrong} (${pct(sum.wrong, judged)}), nothing ${judged - sum.right - sum.own - sum.phrase - sum.wrong}`);
    for (const [k, g] of [...wrongBy].sort((a, b) => b[1].n - a[1].n).slice(0, 8)) {
        console.log(`  wrong, first rule ${k}: ${g.n}; ${[...g.examples].sort((a, b) => b[1] - a[1]).slice(0, Number(option('--examples', '6'))).map(([e, c]) => `${e} ${c}`).join('; ')}`);
    }
    // A rule applied to a scanned prefix that spans a space (docs/languages.md 14, step 5).
    const across = new Map();
    firsts.forEach((f) => {
        if (f !== null && f.matched.includes(' ') && f.trace.length > 0) { const k = `${f.matched} -> ${f.expression} [${f.trace.join(' > ')}]`; across.set(k, (across.get(k) ?? 0) + 1); }
    });
    console.log(`  first results a rule reads across a space: ${[...across.values()].reduce((a, b) => a + b, 0)}: ${[...across].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${k} ${v}`).join('; ')}`);
    return {firsts, rest};
}

function positions(file) {
    const refs = references(option('--terms'));
    const sentences = readFileSync(file, 'utf8').split('\n').map((l) => (l.split('\t')[2] ?? '').normalize('NFC')).filter(Boolean);
    const items = positionsOf(sentences);
    report('Tatoeba', items, refs);
    // The forms after a pronoun (with or without a particle) or 안/못, and the lookups from those words.
    const own = JSON.parse(readFileSync(join(here, 'own.json'), 'utf8'));
    const pronouns = new Set(['안', '못', ...own.transforms.filter((t) => ['particle', 'topic', 'object', 'subject', 'possessive'].includes(t.id))
        .flatMap((t) => t.rules.map((r) => assemble(r.inflected)))]);
    const behind = items.filter(([, , p]) => pronouns.has(p));
    report('after a pronoun or 안/못', behind, refs);
    const from = items.filter(([t, w]) => pronouns.has(w) && t.length > w.length);
    const firsts = lookup(from.map(([t]) => t));
    const across = from.map(([t], i) => [t, firsts[i]]).filter(([, f]) => f !== null && f.matched.includes(' '));
    console.log(`  from the pronoun or 안/못 itself: ${from.length} lookups, ${across.length} whose first result reads past it`);
    for (const [t, f] of across.slice(0, 20)) { console.log(`    ${t.slice(0, 20)}: ${show(f)}`); }
}

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), a | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function text(files) {
    const refs = references(option('--terms'));
    const sentences = files.flatMap((f) => readFileSync(f, 'utf8').normalize('NFC').split(/(?<=[.!?…」”"])\s+|\n+/u)).filter((s) => s.trim() !== '');
    const items = positionsOf(sentences);
    const {firsts, rest} = report('text', items, refs);
    const random = mulberry32(1);
    const sample = new Set();
    const size = Math.min(Number(option('--sample', '60')), rest.length);
    while (sample.size < size) { sample.add(rest[Math.floor(random() * rest.length)]); }
    console.log(`  ${rest.length} positions find something but have no form-of row; a sample of ${size} to judge by hand:`);
    for (const i of [...sample].sort((a, b) => a - b)) { console.log(`    ${items[i][0].slice(0, 24)}\t${show(firsts[i])}`); }
}

function realuse() {
    const rows = readFileSync(join(here, 'real-use.tsv'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t'));
    const texts = rows.map(([sentence, word]) => sentence.slice(sentence.indexOf(word)));
    const run = spawnSync(batch, [languages, 'ko', resolve(dictionary), '16', '16'], {input: `${texts.join('\n')}\n`, encoding: 'utf8', maxBuffer: 1 << 30});
    const results = run.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l).results.filter((r) => !r.formOf));
    let first = 0, among = 0;
    const misses = [];
    rows.forEach(([, word, lemma], i) => {
        if (results[i][0]?.expression === lemma) { ++first; } else { misses.push(`${word} -> ${show(results[i][0] ?? null)}`); }
        if (results[i].some((r) => r.expression === lemma)) { ++among; }
    });
    console.log(`${rows.length} words: the lemma is the first result with a definition for ${first}, among the results for ${among}; not first: ${misses.join('; ')}`);
}

function traces() {
    const rows = readFileSync(option('--unimorph'), 'utf8').split('\n').map((l) => l.split('\t'))
        .filter((r) => r[2] && /(^|;)FIN(;|$)/.test(r[2]) && /^[가-힣]+$/.test(r[1]) && /^(V|ADJ)/.test(r[2]));
    const run = spawnSync(cli, ['deinflect', 'ko', '--stdin', '--transforms', join(here, '..', 'transforms.json')], {input: `${rows.map((r) => jamo(r[1])).join('\n')}\n`, encoding: 'utf8', maxBuffer: 1 << 30});
    const answers = run.stdout.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l).results);
    const has = (ids, list) => ids.some((t) => list.includes(t));
    const honorific = ['-(으)시', '-(으)세요', '-(으)셔요', '-(으)십시오', '-(으)시어요', '-(으)십시다', '-(으)십사', '-(으)시압'];
    let reached = 0, agree = 0;
    rows.forEach(([lemma, , tags], i) => {
        const pos = tags.startsWith('V') ? 'v' : 'adj';
        const best = answers[i].filter((d) => assemble(d.text) === lemma && (d.conditions.length === 0 || d.conditions.includes(pos)))
            .sort((a, b) => a.trace.length - b.trace.length)[0];
        if (!best) { return; }
        ++reached;
        const want = (x) => tags.split(/[;.:]/).includes(x);
        if (has(best.trace, ['-았/었', '-았/었었']) === want('PST') && has(best.trace, ['-겠', '-아/어야겠']) === want('FUT') && has(best.trace, honorific) === want('ELEV')) { ++agree; }
    });
    console.log(`${rows.length} finite rows (lemma, form, tags), ${reached} reached; the shortest trace to the lemma agrees with PST, FUT and ELEV for ${agree} (${pct(agree, reached)})`);
}

async function wasm(hachidori) {
    const language = readFileSync(join(here, '..', 'language.json'), 'utf8');
    const transforms = readFileSync(join(here, '..', 'transforms.json'), 'utf8');
    const words = readFileSync(join(here, 'benchmark-words.txt'), 'utf8').split('\n').filter(Boolean);
    const runs = Number(option('--runs', '10'));
    for (const variant of ['hoshidicts', 'hoshidicts-threaded']) {
        const {default: create} = await import(join(resolve(hachidori), 'extension', 'vendor', `${variant}.mjs`));
        const loads = [];
        let heap = 0;
        let M = null;
        for (let i = 0; i < runs; ++i) {
            M = await create();
            const stats = () => JSON.parse(M.ccall('hdw_memory_stats', 'string', [], [])).liveAllocatedBytes;
            const before = stats();
            const t = performance.now();
            if (M.ccall('hdw_language_load', 'number', ['string', 'string'], [language, transforms]) !== 1) { throw new Error(M.ccall('hdw_last_error', 'string', [], [])); }
            loads.push(performance.now() - t);
            heap = stats() - before;
        }
        M.FS.mkdirTree('/dicts/ko');
        for (const f of readdirSync(dictionary)) { M.FS.writeFile(`/dicts/ko/${f}`, readFileSync(join(dictionary, f))); }
        if (!M.ccall('hdw_add_dict', 'number', ['string', 'number', 'number', 'number'], ['/dicts/ko', 0, 1, 1])) { throw new Error(M.ccall('hdw_last_error', 'string', [], [])); }
        const times = [];
        for (let pass = 0; pass < 6; ++pass) {
            for (const w of words) {
                const t = performance.now();
                M.ccall('hdw_lookup', 'string', ['string', 'number', 'number', 'string'], [w, 16, 16, JSON.stringify({language: 'ko'})]);
                if (pass > 0) { times.push(performance.now() - t); }
            }
        }
        const q = (a, f) => a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(f * a.length))];
        console.log(`${variant}: hdw_language_load median ${q(loads, 0.5).toFixed(1)} ms over ${runs} engines, heap +${heap} bytes; hdw_lookup p50 ${q(times, 0.5).toFixed(3)} ms, p95 ${q(times, 0.95).toFixed(3)} ms (${times.length} lookups)`);
    }
}

const commands = {frequent: () => frequent(inputs[0]), positions: () => positions(inputs[0]), text: () => text(inputs), realuse, traces, wasm: () => wasm(inputs[0])};
if (!commands[command]) {
    console.error('usage: node languages/ko/sources/measure.mjs frequent|positions|text|realuse|traces|wasm ... (see the header)');
    process.exit(2);
}
await commands[command]();
