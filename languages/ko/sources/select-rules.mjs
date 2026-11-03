#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Chooses which of Yomitan's rules the final Korean rule set leaves out
// (docs/languages.md, section 14 step 5) and writes sources/removed-rules.tsv,
// which sources/final-rules.mjs applies:
//
//   node languages/ko/sources/select-rules.mjs --unimorph <unimorph kor file> --terms <directory of the extracted kty-ko-en.zip> --sentences <Tatoeba kor_sentences.tsv> [--cli build/hoshidicts-cli] [--write-sets <dir>]
//
// --write-sets also writes the measurement sets into <dir> (unimorph.tsv,
// cases.tsv, yomitan.tsv, nouns.tsv, chains.tsv, plain.tsv, sentences.tsv
// and tokens.tsv), for measuring the rule sets on exactly these rows.
//
// Measurement sets (written to a temporary directory, never committed; the
// README's Rule provenance and Measurements describe each):
//   - every V/ADJ pair of UniMorph Korean that is plain Hangul;
//   - tests/cases.tsv and tests/yomitan.tsv, valid rows' `reasons` relaxed to
//     `*` (own and Yomitan rules give different traces for the same lemma);
//   - 75,000 noun + particle rows (학교에서 -> 학교) and their prefixes that end
//     inside the particle; they count only false candidates;
//   - Yomitan's endings after a stem marked p, f, eusi or do (먹었으나 -> 먹다,
//     됐건만 -> 되다): the chain set;
//   - Yomitan's endings after plain stems (가곤 -> 가다, 먹으려 -> 먹다), without
//     -기로, -고는 and -건만, written for the README only: as a guard it keeps
//     rules that misread common words (-(으)리 reads 메리 as 메다, -건 이건 as
//     이다, -(으)ㄹ라 몰라 as 모다), so tests/cases.tsv's plain-stem rows keep the
//     endings a learner meets instead;
//   - the Tatoeba words with one lemma (false candidates only), and the same
//     once per occurrence (tokens.tsv, first rank only).
// The dictionary is kty-ko-en as published; the pack follows its form-of
// references (lookup.formOf "follow", docs/languages.md 9.10).
//
// The phases, in order:
//   1. copies: every Yomitan rule that equals an own rule (type, affixes,
//      input conditions) but has no stem constraint where the own rule has
//      `stemEndsWith`, and gives no output condition the own rule lacks
//      (바라야 -> 바르다, 바랐자 -> 발다). They go together; sources/final-rules.mjs
//      finds them again, so removed-rules.tsv says so in one line. If that
//      lowers recall, the script stops and names the rows.
//   2. rounds of `eval-language --per-rule`: every Yomitan rule that recovers
//      no row but adds a false candidate or breaks a negative goes; a round
//      that lowers recall on any set is undone rule by rule.
//   3. negatives several paths break: the Yomitan rules on those paths that
//      recover no row go.
//   4. ties: a Yomitan rule on a path to a false candidate as short as the
//      lemma's, where the own rules alone have no such tie, goes only if the
//      number of valid rows whose lemma a lookup ranks first goes up and no
//      recall drops (counted over UniMorph, the cases,
//      Yomitan's test, the chain set and tokens.tsv).
// Own rules are never removed.

import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mergeTransforms} from '../../../tools/merge-transforms.mjs';
import {formatTransforms} from '../../../tools/lib/json.mjs';
import {COPIES_LINE, copiesOf, removeRules, ruleKey} from './final-rules.mjs';

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

/**
 * Imports the dictionary's term banks unchanged; returns the imported
 * directory and the tags of each headword that has a row other than a
 * form-of row (a form-of row is never a lemma).
 */
function publishedDictionary(termsDir, work, cli) {
    const files = [];
    const tags = new Map();
    for (const name of readdirSync(termsDir).sort()) {
        const data = readFileSync(join(termsDir, name));
        if (/^term_bank_\d+\.json$/.test(name)) {
            const rows = JSON.parse(data.toString('utf8'));
            for (const r of rows) {
                if (isFormOf(r)) { continue; }
                const set = tags.get(r[0]) ?? new Set();
                for (const t of (r[3] || '').split(' ').filter(Boolean)) { set.add(t); }
                tags.set(r[0], set);
            }
            files.push([name, data]);
        } else {
            files.push([name, data]);
        }
    }
    const zip = join(work, 'dictionary.zip');
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
// Sets the removal rounds do not measure: tokens.tsv only counts first rank,
// plain.tsv is written for the README's numbers.
const MEASUREMENT_ONLY = new Set(['tokens', 'plain']);

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
    sets.chains = chainRows();
    sets.plain = plainRows();
    const silver = silverWords(options.sentences, options.unimorph, tags);
    sets.sentences = silver.lines;
    sets.tokens = silver.weighted;
    const files = {};
    for (const [name, lines] of Object.entries(sets)) {
        files[name] = join(work, `${name}.tsv`);
        writeFileSync(files[name], `${lines.join('\n')}\n`);
    }
    return files;
}


// Stems before an ending, by the condition Yomitan's ending rules mark them
// with: [stem, lemma].
const CHAIN_STEMS = {
    p: [['먹었', '먹다'], ['받았', '받다'], ['읽었', '읽다'], ['앉았', '앉다'], ['있었', '있다'], ['없었', '없다'], ['좋았', '좋다'], ['많았', '많다'],
        ['입었', '입다'], ['찾았', '찾다'], ['갔', '가다'], ['봤', '보다'], ['왔', '오다'], ['줬', '주다'], ['했', '하다'], ['하였', '하다'],
        ['됐', '되다'], ['되었', '되다'], ['마셨', '마시다'], ['썼', '쓰다'], ['몰랐', '모르다'], ['추웠', '춥다'], ['도왔', '돕다'], ['들었', '듣다'],
        ['지었', '짓다'], ['나았', '낫다'], ['그랬', '그렇다'], ['살았', '살다'], ['섰', '서다'], ['폈', '펴다'], ['보냈', '보내다'], ['가셨', '가다'],
        ['받으셨', '받다']],
    f: [['먹겠', '먹다'], ['받겠', '받다'], ['가겠', '가다'], ['하겠', '하다'], ['있겠', '있다'], ['좋겠', '좋다'], ['춥겠', '춥다'], ['모르겠', '모르다'],
        ['살겠', '살다'], ['먹었겠', '먹다'], ['가셨겠', '가다'], ['가시겠', '가다'], ['받으시겠', '받다']],
    eusi: [['가시', '가다'], ['보시', '보다'], ['하시', '하다'], ['받으시', '받다'], ['읽으시', '읽다'], ['들으시', '듣다'], ['도우시', '돕다'],
        ['사시', '살다'], ['지으시', '짓다'], ['모르시', '모르다'], ['좋으시', '좋다']],
    do: [['먹더', '먹다'], ['가더', '가다'], ['좋더', '좋다'], ['하더', '하다'], ['먹었더', '먹다']],
};

const JAMO_VOWEL = /[\u314F-\u3163]/u;
/** Jamo as hangul.assemble joins them: an initial, a vowel (or two) and a final, greedily. */
function assemble(text) {
    const cs = [...text];
    let out = '';
    for (let i = 0; i < cs.length;) {
        const initial = CHO.indexOf(cs[i]);
        if (initial < 0 || i + 1 >= cs.length || !JAMO_VOWEL.test(cs[i + 1])) { out += cs[i++]; continue; }
        let vowel = cs[i + 1];
        let k = i + 2;
        if (k < cs.length && JAMO_VOWEL.test(cs[k]) && JUNG.includes(vowel + cs[k])) { vowel += cs[k++]; }
        let final = '';
        for (const n of [2, 1]) {
            const part = cs.slice(k, k + n);
            const candidate = part.join('');
            if (part.length === n && JONG.indexOf(candidate) > 0 && !(k + n < cs.length && JAMO_VOWEL.test(cs[k + n]))) { final = candidate; break; }
        }
        out += String.fromCodePoint(0xAC00 + initial * 588 + JUNG.indexOf(vowel) * 28 + JONG.indexOf(final));
        i = k + [...final].length;
    }
    return out;
}

/** Yomitan's endings after the stems of CHAIN_STEMS, as whole syllables. */
function chainRows() {
    const yomitan = JSON.parse(readFileSync(join(here, 'yomitan.json'), 'utf8'));
    const lines = ['# Yomitan endings after -았/었-, -겠-, -(으)시- and -더- (measurement only)'];
    const seen = new Set();
    for (const t of yomitan.transforms) {
        for (const rule of t.rules) {
            if (rule.type !== 'suffix' || rule.deinflected !== '') { continue; }
            for (const condition of rule.conditionsOut.filter((c) => c in CHAIN_STEMS)) {
                // After a final consonant (ㅆ) an ending must start a syllable.
                if (condition !== 'eusi' && condition !== 'do' && JAMO_VOWEL.test([...rule.inflected][0])) { continue; }
                for (const [stem, lemma] of CHAIN_STEMS[condition]) {
                    const word = assemble(jamo(stem) + rule.inflected);
                    if (!/^[\uAC00-\uD7A3]+( [\uAC00-\uD7A3]+)*$/u.test(word) || seen.has(`${word}\t${lemma}`)) { continue; }
                    seen.add(`${word}\t${lemma}`);
                    lines.push([`${t.id} after ${condition}`, 1, word, lemma, '*', '*'].join('\t'));
                }
            }
        }
    }
    return lines;
}

// Plain stems before Yomitan's endings: [stem class, part of speech, lemma].
const PLAIN_STEMS = [
    ['vowel', 'v', '가다'], ['vowel', 'v', '보다'], ['vowel', 'v', '배우다'], ['vowel', 'v', '바꾸다'], ['vowel', 'v', '만나다'], ['vowel', 'v', '기다리다'],
    ['vowel', 'adj', '예쁘다'], ['vowel', 'adj', '피곤하다'],
    ['consonant', 'v', '먹다'], ['consonant', 'v', '받다'], ['consonant', 'v', '읽다'], ['consonant', 'v', '찾다'], ['consonant', 'adj', '좋다'], ['consonant', 'adj', '작다'],
    ['lieul', 'v', '살다'], ['lieul', 'v', '만들다'], ['lieul', 'v', '알다'], ['lieul', 'adj', '길다'],
];
// Endings whose plain-stem rules read a noun with a particle as a verb, ahead
// of the noun (감기로 -> 감다, 사고는 -> 사다, 물건만 -> 물다).
const PLAIN_LEFT_OUT = new Set(['-기로', '-고는', '-건만']);
const JAMO_CONSONANT = /^[\u3131-\u314E]/u;

/** Yomitan's endings after plain stems, as whole syllables. */
function plainRows() {
    const yomitan = JSON.parse(readFileSync(join(here, 'yomitan.json'), 'utf8'));
    const lines = ['# Yomitan endings after plain verb and adjective stems (measurement only)'];
    const seen = new Set();
    for (const t of yomitan.transforms) {
        if (PLAIN_LEFT_OUT.has(t.id)) { continue; }
        const plain = t.rules.filter((r) => r.type === 'suffix' && r.conditionsIn.length === 0 && r.deinflected === 'ㄷㅏ' && JAMO_CONSONANT.test(r.inflected));
        const overlaps = (a, b) => a.conditionsOut.some((c) => b.conditionsOut.includes(c));
        for (const rule of plain) {
            const x = rule.inflected;
            // A -(으)- or -스- variant (ㅇㅡㄹㅕ, ㅅㅡㅂㄴㅣㄷㅏ, ㄴㅡㄴㄷㅏ) is for consonant stems
            // when the same ending also has the bare variant (ㄹㅕ, ㅂㄴㅣㄷㅏ, ㄴㄷㅏ), which
            // is then for vowel stems.
            const consonantOnly = x.startsWith('ㅇㅡ') || plain.some((r) => r !== rule && overlaps(r, rule) && /^[ㅅㄴ]ㅡ/u.test(x) && x.slice(2) === r.inflected);
            const vowelOnly = plain.some((r) => r !== rule && overlaps(r, rule) && /^[ㅇㅅㄴ]ㅡ/u.test(r.inflected) && r.inflected.slice(2) === x);
            const harmony = /^ㅇ[ㅏㅓ]/u.test(x);
            // The -아/어 ending with 아/어 merged into a stem's ㅏ, ㅓ, ㅕ, ㅐ or ㅔ (가 + 아도
            // = 가도, 가 + 았자 = 갔자), when the ending also has ㅇㅏ/ㅇㅓ + this rule's text.
            const contracted = plain.some((r) => r !== rule && overlaps(r, rule) && (r.inflected === `ㅇㅓ${x}` || r.inflected === `ㅇㅏ${x}`));
            for (const [kind, pos, lemma] of PLAIN_STEMS) {
                if (!rule.conditionsOut.includes(pos)) { continue; }
                const stem = jamo(lemma.slice(0, -1));
                if (contracted) {
                    if (kind !== 'vowel' || !/[ㅏㅓㅕㅐㅔ]$/u.test(stem) || stem.endsWith('ㅎㅏ')) { continue; }
                } else if (harmony) {
                    // -아/어 endings: 받아, 먹어, 살아, 만들어.
                    if (kind === 'vowel' || (x[1] === 'ㅏ') !== /[ㅏㅗ][^ㅏ-ㅣ]*$/u.test(stem)) { continue; }
                } else if (x.startsWith('ㅇ')) {
                    if (!x.startsWith('ㅇㅡ') || kind !== 'consonant') { continue; }
                } else if (consonantOnly) {
                    if (kind !== 'consonant') { continue; }
                } else if (vowelOnly) {
                    if (kind === 'consonant' || (kind === 'lieul' && /^[ㄴㅂㅅ]/u.test(x))) { continue; }
                } else if (kind === 'lieul' && /^[ㄴㅂㅅ]/u.test(x)) {
                    continue;
                }
                const word = assemble(stem + x);
                if (!/^[\uAC00-\uD7A3]+$/u.test(word) || jamo(word) !== stem + x || seen.has(`${word}\t${lemma}`)) { continue; }
                // The stem's syllables stay as they are, except that the last one
                // may take the ending's first consonant as its final (가 + ㄴ가 = 간가).
                const base = lemma.slice(0, -1);
                if (!word.startsWith(base.slice(0, -1)) || jamo(word).slice(0, stem.length) !== stem) { continue; }
                seen.add(`${word}\t${lemma}`);
                lines.push([`${t.id} plain ${kind}`, 1, word, lemma, pos, '*'].join('\t'));
            }
        }
    }
    return lines;
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
    const weighted = ['# Tatoeba words with one lemma, once per occurrence (measurement only)'];
    const seen = new Map();
    for (const line of readFileSync(sentencesFile, 'utf8').split('\n')) {
        const text = (line.split('\t')[2] ?? '').normalize('NFC');
        for (const [word] of text.matchAll(/[\uAC00-\uD7A3]+/g)) {
            if (seen.has(word)) {
                const row = seen.get(word);
                if (row !== null) { weighted.push(row); }
                continue;
            }
            seen.set(word, null);
            const labels = new Set();
            if (tags.has(word)) { labels.add(word); }
            for (const lemma of forms.get(word) ?? []) { labels.add(lemma); }
            if (labels.size === 0) {
                const noun = split(word);
                if (noun !== null) { labels.add(noun); }
            }
            if (labels.size === 1) {
                const row = ['tatoeba', 1, word, [...labels][0], '*', '*'].join('\t');
                seen.set(word, row);
                lines.push(row);
                weighted.push(row);
            }
        }
    }
    return {lines, weighted};
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
        if (MEASUREMENT_ONLY.has(name)) { continue; }
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
    // Not the chain set: the own rules reach few of its rows, so there is
    // nothing to compare a tie with.
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


/** The number of valid rows whose lemma a lookup ranks first. */
function rankScore(options, work, files, dictionary, removed) {
    const own = JSON.parse(readFileSync(join(here, 'own.json'), 'utf8'));
    const yomitan = removeRules(JSON.parse(readFileSync(join(here, 'yomitan.json'), 'utf8')), removed);
    const file = join(work, 'candidate-rank.json');
    writeFileSync(file, formatTransforms(mergeTransforms(own, yomitan).transforms));
    let score = 0;
    const recall = {};
    for (const name of ['unimorph', 'cases', 'yomitan', 'chains', 'tokens']) {
        const run = spawnSync(options.cli, ['eval-language', 'ko', files[name], '--transforms', file, '--dictionary', dictionary], {encoding: 'utf8', maxBuffer: 1 << 30});
        if (run.status !== 0) { throw new Error(`eval-language failed on ${files[name]}: ${run.stderr}`); }
        const result = JSON.parse(run.stdout);
        score += Math.round(result.firstRank * result.positives);
        recall[name] = result.recall;
    }
    return {score, recall};
}

/** Yomitan rules equal to a stem-constrained own rule but for the constraint (final-rules.mjs's test). */
function unconstrainedCopies(current) {
    const isCopy = copiesOf(JSON.parse(readFileSync(join(here, 'own.json'), 'utf8')));
    return current.rules.filter((r) => r.source === 'yomitan' && isCopy(r.rule)).map((r) => ({...r, copy: true}));
}

/** The valid rows of `names` that `after` loses and `before` reaches, with the transforms on their paths. */
function lostRows(options, files, names, before, after) {
    const lost = [];
    for (const name of names) {
        const rows = readFileSync(files[name], 'utf8').split('\n').filter((l) => l !== '' && !l.startsWith('#')).map((l) => l.split('\t'))
            .filter((c) => c.length === 6 && c[1] === '1')
            .map((c) => ({source: c[2], term: c[3], rule: c[4] === '*' ? null : c[4], reasons: c[5] === '*' ? null : c[5] === '' ? [] : c[5].split('|')}));
        const sources = rows.map((r) => r.source);
        const had = deinflectAll(options.cli, before, sources);
        const has = deinflectAll(options.cli, after, sources);
        rows.forEach((row, i) => {
            if (has[i].some((r) => matchesRow(r, row))) { return; }
            lost.push(`${row.source} -> ${row.term} (${had[i].filter((x) => matchesRow(x, row)).map((r) => r.trace.join(' ')).join('; ')})`);
        });
    }
    return lost;
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
        const {dir: dictionary, tags} = publishedDictionary(resolve(options.terms), work, options.cli);
        const files = measurementSets(options, work, tags);
        if (options['write-sets']) {
            mkdirSync(resolve(options['write-sets']), {recursive: true});
            for (const [name, file] of Object.entries(files)) { writeFileSync(join(resolve(options['write-sets']), `${name}.tsv`), readFileSync(file)); }
        }
        const removed = [];
        let current = measure(options, work, files, dictionary, removed);
        const start = current.recall;
        // First the Yomitan copies of stem-constrained own rules: a test of the
        // rules themselves, before anything measured.
        const beforeCopies = join(work, 'before-copies.json');
        writeFileSync(beforeCopies, readFileSync(join(work, 'candidate.json')));
        const copies = unconstrainedCopies(current);
        const trial = measure(options, work, files, dictionary, copies);
        const lost = lowered(current.recall, trial.recall);
        if (lost.length > 0) {
            const rows = lostRows(options, files, lost, beforeCopies, join(work, 'candidate.json'));
            throw new Error(`leaving out the ${copies.length} Yomitan copies of stem-constrained own rules loses rows the own rules should reach:\n${rows.join('\n')}`);
        }
        removed.push(...copies);
        current = trial;
        console.log(`copies: removed ${copies.length} Yomitan rules that copy a stem-constrained own rule without its constraint`);
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
        // Ranking: rules that tie a false candidate with the lemma, removed one
        // at a time while the first-rank count goes up and no recall drops.
        console.log(`first-rank count of the union: ${rankScore(options, work, files, dictionary, []).score}`);
        let rank = rankScore(options, work, files, dictionary, removed);
        console.log(`first-rank count before the ranking phase: ${rank.score}`);
        for (let round = 1; round <= 3; ++round) {
            current = measure(options, work, files, dictionary, removed);
            const blamed = rankingBlame(options, work, files, tags, current);
            const taken = [];
            for (const c of blamed) {
                const trial = rankScore(options, work, files, dictionary, [...removed, ...taken, c]);
                const lost = Object.keys(trial.recall).filter((name) => name !== 'tokens' && trial.recall[name] < rank.recall[name]);
                if (lost.length === 0 && trial.score > rank.score) {
                    taken.push(c);
                    rank = trial;
                }
            }
            if (taken.length === 0) { break; }
            removed.push(...taken);
            console.log(`ranking ${round}: removed ${taken.length} of ${blamed.length} Yomitan rules that tie a false candidate with the lemma (${removed.length} in all); first-rank count ${rank.score}`);
        }
        current = measure(options, work, files, dictionary, removed);
        for (const r of removed) {
            if (r.rule.type !== 'suffix' || Object.keys(withoutSource(r.rule)).sort().join(',') !== 'conditionsIn,conditionsOut,deinflected,inflected,type') {
                throw new Error(`removed-rules.tsv holds plain suffix rules only: ${JSON.stringify(r.rule)}`);
            }
        }
        const lines = [
            '# Yomitan rules the final rule set leaves out, written by sources/select-rules.mjs; sources/final-rules.mjs applies them.',
            '# Each recovers no row of the measurement sets and adds false candidates, breaks a negative, or ties a false candidate with the lemma (README.md, Rule provenance).',
            `${COPIES_LINE} (${removed.filter((r) => r.copy).length} rules at this run).`,
            '# None recovers a row. transform\tinflected\tdeinflected\tconditionsIn\tconditionsOut\tfalseCandidates\tnote',
            ...removed.filter((r) => !r.copy).map((r) => [r.transform, r.rule.inflected, r.rule.deinflected, r.rule.conditionsIn.join(','), r.rule.conditionsOut.join(','),
                r.falseCandidates, r.negative ? `breaks ${r.negative} with other paths` : r.ties ? `ties a false candidate with the lemma on ${r.ties} paths, as in ${r.example}`
                    : ''].join('\t')),
        ];
        writeFileSync(join(here, 'removed-rules.tsv'), `${lines.join('\n')}\n`);
        console.log(JSON.stringify({before: start, after: current.recall}, null, 1));
        console.log(`${removed.length} rules left out: ${removed.filter((r) => !r.copy).length} listed in ${join(here, 'removed-rules.tsv')} and ${removed.filter((r) => r.copy).length} copies; the final set has ${JSON.parse(readFileSync(join(work, 'candidate.json'), 'utf8')).transforms.reduce((n, t) => n + t.rules.length, 0)} rules`);
    } finally {
        rmSync(work, {recursive: true, force: true});
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) { main(); }
export {assemble, chainRows, isFormOf, jamo, plainRows, ruleKey};
