#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// The lookup measurements of README.md (Measurements). Not run by any test.
// Each rule set is loaded from a temporary copy of the pack whose
// transforms.json is that file, and looked up with sources/lookup-batch.cpp
// as a host's hover does: 16 results, scan length 16 (--scan N changes it), no
// language options.
//
//   node languages/de/sources/measure.mjs frequent <inputs dir> <unimorph deu> <dictionary> <transforms.json>... [--batch <lookup-batch>] [--show N]
//   node languages/de/sources/measure.mjs text <inputs dir> <unimorph deu> <dictionary> <name> <transforms.json>... [--batch <lookup-batch>] [--dump <file>]
//   node languages/de/sources/measure.mjs after <inputs dir> <unimorph deu> <dictionary> <transforms.json>... [--batch <lookup-batch>] [--dump <file>]
//   node languages/de/sources/measure.mjs start <inputs dir> <unimorph deu> <dictionary> <transforms.json>... [--batch <lookup-batch>] [--show N]
//   node languages/de/sources/measure.mjs diff <inputs dir> <unimorph deu> <dictionary> <name> <a.json> <b.json> [--batch <lookup-batch>] [--show N]
//
// <inputs dir> is what sources/measure-inputs.py writes and <dictionary> the
// same dictionary imported by hoshidicts-cli import. A word's lemmas are the
// word itself, as written and with a small first letter (a word at the start
// of a sentence), the lemmas the dictionary's form-of rows name for those and
// the lemmas UniMorph gives for them, and the lemmas of those lemmas (two
// steps: mußte -> musste -> müssen, gesenktem -> gesenkt -> senken). Lemmas
// are compared as written, so All (the universe) is not alles. wty-de-en
// writes some lemmas with a note ("musste which was deprecated in the
// spelling reform"); the note is removed. A result "with a definition" is
// one that is not a form-of row (lookup-batch's formOf). A trace step is a
// rule of the pack unless lookup-batch marks it as a rule a form-of row
// names.
//
// frequent: the 10,000 words of frequent.tsv, each looked up whole. A rule
//   reaches a word when a result for the whole word with a definition is one
//   of its lemmas other than the word and its trace has a rule of the pack.
//   For those words: the first result with a definition is not one of the
//   word's lemmas (wrong first), or a result with such a wrong expression and
//   a rule of the pack in its trace comes before the first lemma (wrong
//   above); with their share of the list's tokens.
// text: every hover of hovers-<name>.txt. The first result with a definition
//   is judged by its matched text:
//   - the hovered word: right when it is one of the word's lemmas; wrong when
//     it is not and the word has lemmas other than itself (form-of rows or
//     UniMorph name some); otherwise unjudged;
//   - a longer text (several words): a dictionary entry of several words
//     (no rule of the pack in its trace) or a rule's reading. When it is a
//     verb of one word that starts with the last word of the matched text, a
//     separable particle, and the text does not follow that particle with a
//     clause end (. , ; : ! ? … " » « ) – or und, oder, aber, als, wenn,
//     weil, dass, denn, sondern, bis, ob), the particle is a preposition or
//     an adverb there and the reading is wrong (ging nach Hause ->
//     nachgehen); a reading of the pack's separated-prefix rule is right when
//     the dictionary has a form-of row for the hovered word and the particle
//     that names the verb (strengt an -> anstrengen; wiktionary-to-yomitan
//     writes these rows for the separated forms of separable verbs), and
//     wrong when it has none and the hovered word is not a verb form (no row
//     of the word, as written or in small letters, has the rules tag v:
//     lange an; -> anlangen, der Hand hin. -> hindern); a reading the
//     dictionary's form-of rows give for the matched text is right otherwise
//     (bis zu, es gibt); the rest is unjudged;
//   - a shorter text (part of a compound or of a word the dictionary lacks):
//     counted apart.
//   Wrong results are grouped by the rules of the pack in their trace.
// start: the frequent words that German text writes with a small letter
//   (frequent.tsv's third column), each looked up with a capital first
//   letter, as at the start of a sentence (Alles, Lassen, Früher). The first
//   result with a definition for the whole word is wrong when it is not one
//   of the word's lemmas and its trace has a rule of the pack (Alles -> All,
//   the universe); counted with the share of the list's tokens.
// diff: the hovers of hovers-<name>.txt whose first result with a
//   definition differs between two rule sets, grouped by word and the two
//   results, most frequent first: what adding or removing rules changes.
// after: the Tatoeba hovers whose word is an article, pronoun, auxiliary or
//   contraction and whose next word is one of the frequent words, judged as
//   in text: whether the function word and the form after it are read as one.

import {spawn} from 'node:child_process';
import {cpSync, createReadStream, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {Readable} from 'node:stream';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';

const PACK = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const batch = option('--batch', 'build/lookup-batch-de');
const show = Number(option('--show', '0'));
const dump = option('--dump', null);
// The scan length in code points (a host's setting; 16 by default, as Yomitan's).
const scan = option('--scan', '16');
const positional = args.filter((a, i) => !a.startsWith('--') && !['--batch', '--show', '--dump', '--scan'].includes(args[i - 1]));
const [mode, inputs, unimorph, dictionary, ...rest] = positional;
const lower = (s) => s.toLowerCase().replaceAll('\u2019', "'");
const lines = (file) => readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));

/** Runs lookup-batch for one rule set and calls onAnswer(index, results) per input line. */
async function lookups(transformsFile, input, onAnswer) {
    const temp = mkdtempSync(join(tmpdir(), 'de-measure-'));
    try {
        cpSync(PACK, join(temp, 'de'), {recursive: true});
        writeFileSync(join(temp, 'de', 'transforms.json'), readFileSync(transformsFile));
        const child = spawn(batch, [temp, 'de', dictionary, '16', scan], {stdio: ['pipe', 'pipe', 'inherit']});
        input.pipe(child.stdin);
        let index = 0;
        for await (const line of createInterface({input: child.stdout, crlfDelay: Infinity})) {
            if (line.startsWith('{')) { onAnswer(index++, JSON.parse(line).results); }
        }
        return index;
    } finally {
        rmSync(temp, {recursive: true, force: true});
    }
}

// The lemmas of every form: the form-of rows and UniMorph (lowercase).
const lemmas = new Map();
const apostrophe = (s) => s.replaceAll('\u2019', "'");
const addLemma = (form, lemma) => {
    const key = apostrophe(form);
    const set = lemmas.get(key) ?? new Set();
    set.add(apostrophe(lemma.replace(/ which was .*$/u, '')));
    lemmas.set(key, set);
};
const verbForms = new Set();
for (const [form, lemma, rules = ''] of lines(join(inputs, 'redirects.tsv'))) {
    addLemma(form, lemma);
    if (rules.split(' ').includes('v')) { verbForms.add(form); }
}
for (const [expression, rules = ''] of lines(join(inputs, 'headwords.tsv'))) {
    if (rules.split(' ').includes('v')) { verbForms.add(expression); }
}
const isVerbForm = (word) => verbForms.has(word) || verbForms.has(lower(word));
for (const [lemma, form] of lines(unimorph)) { if (form) { addLemma(form, lemma); } }
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const lemmasOf = (word) => {
    const written = apostrophe(word);
    const out = new Set([written, lowerFirst(written)]);
    for (const variant of [written, lowerFirst(written)]) {
        for (const lemma of lemmas.get(variant) ?? []) {
            out.add(lemma);
            for (const second of lemmas.get(lemma) ?? []) { out.add(second); }
        }
    }
    return out;
};
const hasLemmas = (word) => [...lemmasOf(word)].some((l) => l !== apostrophe(word) && l !== lowerFirst(apostrophe(word)));
const isLemma = (word, expression) => lemmasOf(word).has(apostrophe(expression));

const PARTICLES = new Set(JSON.parse(readFileSync(join(PACK, 'sources', 'own.json'), 'utf8'))
    .transforms.find((t) => t.id === 'zu-infinitive').rules[0].prefixes.map(([, p]) => p));
const CLAUSE_END = /^(?:$|[.,;:!?…"»«“”„)\u2013-]|\s+(?:und|oder|aber|als|wenn|weil|dass|daß|denn|sondern|bis|ob)\b)/u;

if (mode === 'frequent') {
    // The word as German text writes it (frequent.tsv's third column).
    const words = lines(join(inputs, 'frequent.tsv')).map(([, count, cased]) => [cased, count]);
    const total = words.reduce((n, [, c]) => n + Number(c), 0);
    for (const file of rest) {
        const hasRule = (r) => r.dictionary.some((d) => !d);
        let reached = 0, reachedTokens = 0, firstWrong = 0, firstTokens = 0, above = 0, aboveTokens = 0;
        const examples = [];
        const aboveExamples = [];
        await lookups(file, Readable.from([`${words.map(([w]) => w).join('\n')}\n`]), (i, results) => {
            const [word, count] = words[i];
            const ok = lemmasOf(word);
            const self = new Set([word, lowerFirst(word)]);
            const defs = results.filter((r) => !r.formOf && lower(r.matched) === lower(word));
            if (!defs.some((r) => hasRule(r) && !self.has(r.expression) && ok.has(r.expression))) { return; }
            ++reached;
            reachedTokens += Number(count);
            if (!ok.has(defs[0].expression)) {
                ++firstWrong;
                firstTokens += Number(count);
                if (examples.length < show) { examples.push(`${word} (${count}): ${defs.slice(0, 4).map((r) => `${r.expression}[${r.trace.join(',')}]`).join('  ')}`); }
            }
            const at = defs.findIndex((r) => ok.has(r.expression) && !self.has(r.expression));
            if (defs.slice(0, at).some((r) => hasRule(r) && !ok.has(r.expression))) {
                ++above;
                aboveTokens += Number(count);
                if (aboveExamples.length < show) { aboveExamples.push(`${word} (${count}): ${defs.slice(0, at + 1).map((r) => `${r.expression}[${r.trace.join(',')}]`).join('  ')}`); }
            }
        });
        const share = (n) => `${(100 * n / total).toFixed(2)}% of the list's tokens`;
        console.log(`${file}: ${words.length} words (${total} tokens); a rule reaches the lemma of ${reached} (${share(reachedTokens)}); of those, the first entry with a definition is wrong for ${firstWrong} (${share(firstTokens)}), and a wrong reading of a rule comes before the lemma for ${above} (${share(aboveTokens)})`);
        for (const example of examples) { console.log(`   first: ${example}`); }
        for (const example of aboveExamples) { console.log(`   above: ${example}`); }
    }
} else if (mode === 'start') {
    const all = lines(join(inputs, 'frequent.tsv'));
    const total = all.reduce((n, [, c]) => n + Number(c), 0);
    const words = all.filter(([, , cased]) => cased.charAt(0) !== cased.charAt(0).toUpperCase())
        .map(([, count, cased]) => [cased, count, cased.charAt(0).toUpperCase() + cased.slice(1)]);
    for (const file of rest) {
        let wrong = 0, wrongTokens = 0, dictionaryWrong = 0, dictionaryTokens = 0;
        const examples = [];
        const dictionaryExamples = [];
        await lookups(file, Readable.from([`${words.map(([, , capital]) => capital).join('\n')}\n`]), (i, results) => {
            const [word, count, capital] = words[i];
            const top = results.find((r) => !r.formOf && lower(r.matched) === lower(word));
            if (top === undefined || isLemma(word, top.expression)) { return; }
            if (!top.dictionary.some((d) => !d)) {
                ++dictionaryWrong;
                dictionaryTokens += Number(count);
                if (dictionaryExamples.length < show) { dictionaryExamples.push(`${capital} (${count}): ${top.expression}[${top.trace.join(',')}]`); }
                return;
            }
            ++wrong;
            wrongTokens += Number(count);
            if (examples.length < show) { examples.push(`${capital} (${count}): ${top.expression}[${top.trace.join(',')}]`); }
        });
        const share = (n) => `${(100 * n / total).toFixed(2)}% of the list's tokens`;
        console.log(`${file}: ${words.length} frequent words written in small letters, looked up with a capital letter; the first entry with a definition is a wrong reading of a rule for ${wrong} (${share(wrongTokens)}), and another wrong entry (the capitalized word's own entry or form-of row) for ${dictionaryWrong} (${share(dictionaryTokens)})`);
        for (const example of examples) { console.log(`   rule: ${example}`); }
        for (const example of dictionaryExamples) { console.log(`   dictionary: ${example}`); }
    }
} else if (mode === 'diff') {
    const [name, a, b] = rest;
    const hovers = readFileSync(join(inputs, `hovers-${name}.txt`), 'utf8').split('\n');
    const words = readFileSync(join(inputs, `words-${name}.txt`), 'utf8').split('\n');
    hovers.pop();
    words.pop();
    const describe = (r) => (r === undefined ? '(none)' : `${r.expression} (${r.matched}) [${r.trace.join(',')}]`);
    const firstA = [];
    await lookups(a, Readable.from([`${hovers.join('\n')}\n`]), (i, results) => { firstA[i] = describe(results.find((r) => !r.formOf)); });
    const groups = new Map();
    let changed = 0;
    await lookups(b, Readable.from([`${hovers.join('\n')}\n`]), (i, results) => {
        const second = describe(results.find((r) => !r.formOf));
        if (second === firstA[i]) { return; }
        ++changed;
        const key = `${words[i]}: ${firstA[i]} -> ${second}`;
        groups.set(key, (groups.get(key) ?? 0) + 1);
    });
    console.log(`${name}: ${hovers.length} hovers; the first result with a definition differs at ${changed} between ${a} and ${b}`);
    for (const [key, n] of [...groups].sort((x, y) => y[1] - x[1]).slice(0, show)) { console.log(`   ${n}\t${key}`); }
} else if (mode === 'text' || mode === 'after') {
    let name, sets;
    if (mode === 'text') { [name, ...sets] = rest; } else { name = 'tatoeba'; sets = rest; }
    let hovers = readFileSync(join(inputs, `hovers-${name}.txt`), 'utf8').split('\n');
    let words = readFileSync(join(inputs, `words-${name}.txt`), 'utf8').split('\n');
    hovers.pop();
    words.pop();
    if (mode === 'after') {
        const FUNCTION = new Set(('der die das den dem des ein eine einen einem einer eines kein keine keinen keinem keiner ' +
            'ich du er sie es wir ihr mich dich sich uns euch mir dir ihm ihn ihnen man ' +
            'bin bist ist sind seid war warst waren wart habe hast hat haben habt hatte hattest hatten werde wirst wird werden werdet wurde ' +
            'würde würden kann kannst können muss musst müssen will willst wollen soll sollst sollen darf darfst dürfen mag möchte ' +
            'am im zum zur ins beim vom ans aufs fürs ums').split(' '));
        const frequent = new Set(lines(join(inputs, 'frequent.tsv')).map(([w]) => lower(w)));
        const keep = [];
        for (let i = 0; i + 1 < hovers.length; ++i) {
            const next = /^\S+\s+([A-Za-zÀ-ÖØ-öø-ɏẞ]+)/u.exec(hovers[i]);
            if (FUNCTION.has(lower(words[i])) && next !== null && frequent.has(lower(next[1]))) { keep.push(i); }
        }
        hovers = keep.map((i) => hovers[i]);
        words = keep.map((i) => words[i]);
    }
    const dumped = [];
    for (const file of sets) {
        const counts = {lookups: 0, none: 0, right: 0, wrong: 0, unjudged: 0, multiRight: 0, multiWrongDictionary: 0, multiWrongRule: 0, multiUnjudged: 0, shorter: 0};
        const groups = new Map();
        const group = (key, word) => {
            const g = groups.get(key) ?? {count: 0, words: new Map()};
            ++g.count;
            g.words.set(word, (g.words.get(word) ?? 0) + 1);
            groups.set(key, g);
        };
        await lookups(file, Readable.from([`${hovers.join('\n')}\n`]), (i, results) => {
            ++counts.lookups;
            const word = words[i];
            const top = results.find((r) => !r.formOf);
            const rules = top ? top.trace.filter((t, k) => !top.dictionary[k]) : [];
            let verdict;
            if (top === undefined) {
                verdict = 'none';
            } else if (lower(top.matched) === lower(word)) {
                if (isLemma(word, top.expression)) {
                    verdict = 'right';
                } else if (hasLemmas(word)) {
                    verdict = 'wrong';
                } else {
                    verdict = 'unjudged';
                }
            } else if (top.matched.length > word.length) {
                const matchedWords = top.matched.split(' ');
                const last = lower(matchedWords[matchedWords.length - 1]);
                const after = hovers[i].slice(top.matched.length);
                const particleVerb = PARTICLES.has(last) && !top.expression.includes(' ') && lower(top.expression).startsWith(last);
                if (particleVerb && !CLAUSE_END.test(after)) {
                    verdict = rules.length > 0 ? 'multiWrongRule' : 'multiWrongDictionary';
                } else if (rules.includes('separated-prefix')) {
                    const particle = last.replace(/[^a-zäöüß]+$/u, '');
                    if (isLemma(`${lower(word)} ${particle}`, top.expression)) {
                        verdict = 'multiRight';
                    } else {
                        verdict = isVerbForm(word) ? 'multiUnjudged' : 'multiWrongRule';
                    }
                } else if (isLemma(top.matched, top.expression) && rules.length === 0) {
                    verdict = 'multiRight';
                } else {
                    verdict = 'multiUnjudged';
                }
            } else {
                verdict = 'shorter';
            }
            ++counts[verdict];
            if (verdict === 'wrong' || verdict.startsWith('multiWrong')) {
                group(`${verdict}: ${rules.join('|') || '(no rule)'}`, `${word} -> ${top.expression} (${top.matched})`);
            }
            if (dump !== null && ['unjudged', 'multiUnjudged', 'wrong', 'multiWrongRule', 'multiWrongDictionary'].includes(verdict)) {
                dumped.push([file, verdict, word, top.matched, top.expression, top.trace.join('|'), hovers[i]].join('\t'));
            }
        });
        const pct = (n) => `${(100 * n / counts.lookups).toFixed(2)}%`;
        console.log(`${file} (${name}${mode === 'after' ? ', after a function word' : ''}): ${counts.lookups} lookups; no result ${counts.none}; ` +
            `first entry with a definition for the hovered word: right ${counts.right}, wrong ${counts.wrong} (${pct(counts.wrong)}), unjudged ${counts.unjudged}; ` +
            `for several words: right (a dictionary entry) ${counts.multiRight}, a preposition read as a particle by a dictionary entry ${counts.multiWrongDictionary} (${pct(counts.multiWrongDictionary)}) ` +
            `or by a rule ${counts.multiWrongRule} (${pct(counts.multiWrongRule)}), unjudged ${counts.multiUnjudged}; part of a word ${counts.shorter}`);
        for (const [key, g] of [...groups].sort((a, b) => b[1].count - a[1].count).slice(0, 12)) {
            const top = [...g.words].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w, n]) => `${w} ×${n}`).join('; ');
            console.log(`   ${g.count}\t${key}\t${top}`);
        }
    }
    if (dump !== null) { writeFileSync(dump, dumped.join('\n') + '\n'); }
} else {
    console.error('usage: measure.mjs frequent|text|after <inputs dir> <unimorph deu> <dictionary> ... (see the header)');
    process.exit(2);
}
