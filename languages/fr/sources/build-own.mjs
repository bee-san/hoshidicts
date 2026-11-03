#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/fr/sources/own.json: the French deinflection rules written
// for this pack (docs/languages.md, section 14 step 2), from the paradigm
// tables below. Run from the repository root:
//
//   node languages/fr/sources/build-own.mjs
//
// The tables follow the standard description of French inflection (the
// Bescherelle conjugation classes, Grevisse's *Le Bon Usage*, the 1990
// spelling rectifications, and Wiktionary's French conjugation tables): the
// first group (-er) with its spelling changes (-cer, -ger, e/é → è,
// -eler/-eter, -yer), the second group (-ir, -iss-), the third group by
// model verb, être, avoir, aller and faire; elided articles and pronouns
// (l', d', j', m', t', s', n', c', qu'), pronouns attached to imperatives and
// inverted subjects (donne-moi, lève-toi, parle-t-il), pronominal verbs
// (je me lève → se lever), and the plural, feminine and -ment forms of nouns
// and adjectives. No table is copied from these sources.

import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// --- Conditions ----------------------------------------------------------------
// v, n and adj are the part-of-speech tags French Yomitan dictionaries put in
// their `rules` column (wiktionary-to-yomitan writes v, n, adj and adv).
// They have Yomitan's definitions, which tools/merge-transforms.mjs requires
// of a condition both files have. vcl is what an elided pronoun before a
// verb leaves (s'élève → élève, j'ai → ai): the word after j', m', t', s',
// n' and c' is a verb, so only the verb rules read it (and the infinitive
// rule: m'aider → aider), and it matches no dictionary term itself (élève is
// élever there, never the noun élève). The verb rules take vcl and not v, so
// a verb they reach is not read again.
// A reflexive pronoun agrees with the person of the verb after it through a
// mark on the pronoun, not a condition (see personThen). imp and fin are what a pronoun
// after a hyphen leaves: an imperative (donne-moi → donne) or a finite verb
// whose subject was inverted (parle-t-il → parle). No dictionary term carries
// them, so a text with only these conditions never matches.
const conditions = {
    v: {name: 'Verb', isDictionaryForm: true},
    vcl: {name: 'Verb after an elided pronoun (j\', m\', t\', s\', n\', c\')', isDictionaryForm: false},
    n: {name: 'Noun', isDictionaryForm: true},
    adj: {name: 'Adjective', isDictionaryForm: true},
    imp: {name: 'Imperative before a hyphenated pronoun', isDictionaryForm: false},
    // No rule gives raw, so a rule that takes only raw applies only to the
    // scanned text itself (whose conditions are 0, which every rule takes).
    raw: {name: 'The scanned text itself (no rule gives this)', isDictionaryForm: false},
    fin: {name: 'Finite verb before an inverted subject', isDictionaryForm: false},
};

// --- Transforms -------------------------------------------------------------------
const transforms = [];
const byId = new Map();
const seen = new Set();

function transform(id, name, description) {
    if (byId.has(id)) { return byId.get(id); }
    const t = {id, name, description, source: 'own', rules: []};
    transforms.push(t);
    byId.set(id, t);
    return t;
}

function add(id, rule) {
    const t = byId.get(id);
    if (t === undefined) { throw new Error(`no transform ${id}`); }
    const key = `${id}\u0000${JSON.stringify(rule)}`;
    if (seen.has(key)) { return; }
    seen.add(key);
    t.rules.push(rule);
}

const suffix = (inflected, deinflected, conditionsIn, conditionsOut, extra = {}) =>
    ({type: 'suffix', inflected, deinflected, conditionsIn, conditionsOut, ...extra});
const prefix = (inflected, deinflected, conditionsIn, conditionsOut, extra = {}) =>
    ({type: 'prefix', inflected, deinflected, conditionsIn, conditionsOut, ...extra});
const whole = (inflected, deinflected, conditionsIn, conditionsOut) =>
    ({type: 'wholeWord', inflected, deinflected, conditionsIn, conditionsOut});

// --- Elision ------------------------------------------------------------------------
// The apostrophe separates words (docs/languages.md 4.3), so a lookup that
// starts at an elided word reads it with the word after it. The elided word is
// removed (l'homme → homme, j'ai → ai → avoir), and alone it is read as its
// elided and full forms (l → l', le, la). The preprocessor straightApostrophe
// turns ’ into ', so the rules are written with '.
transform('elision', 'elided word',
    'An elided article, pronoun, de, ne or que before a word, removed: l\'homme → homme, d\'eau → eau, j\'ai → ai, qu\'il → il, n\'est → est.');
const ELIDED = [
    ['l', ['le', 'la']], ['d', ['de']], ['j', ['je']], ['m', ['me']], ['t', ['te']], ['s', ['se', 'si']],
    ['n', ['ne']], ['c', ['ce']], ['ç', ['ça']], ['qu', ['que']], ['jusqu', ['jusque']], ['lorsqu', ['lorsque']],
    ['puisqu', ['puisque']], ['quoiqu', ['quoique']], ['presqu', ['presque']],
];
// Before a verb only: j', m', t', s', n', c' (and ç'). l' is also an article,
// and qu' and d' come before any word. The conjunctions and adverbs jusqu',
// lorsqu', puisqu', quoiqu' and presqu' are not removed: a lookup from them
// is for them (lorsqu'il → lorsque, not il; jusqu'à la → jusqu'à, not à
// la), and the elided-form rules below read them.
const BEFORE_VERB = new Set(['j', 'm', 't', 's', 'n', 'c', 'ç']);
const KEPT = new Set(['jusqu', 'lorsqu', 'puisqu', 'quoiqu', 'presqu']);
// Any word may follow the apostrophe, as in informal writing (j'suis,
// t'sais). After m', t', s' and l', a following en or y belongs with them to
// a pronominal verb or an object (s'en revenait, s'y prend, je l'y ai vu):
// the rule leaves those for the whole text (s'en aller, s'y prendre), so
// that en revenait is not read as the phrase en revenir, nor l'y avait as y
// avoir. A stem constraint takes one text, so these rules
// are split by the stem's first letter.
const CLITIC = new Set(['m', 't', 's', 'l']);
for (const [short] of ELIDED) {
    if (KEPT.has(short)) { continue; }
    const out = BEFORE_VERB.has(short) ? ['vcl'] : [];
    // qu' is not removed before à: a lookup from qu' then read the phrase
    // after it (qu'à la condition → à la, qu'à moi-même → à moi: 58 first
    // results in the measured texts, most of them wrong).
    if (short === 'qu') {
        add('elision', prefix(`${short}'`, '', [], out, {stemNotStartsWith: '[à]'}));
        add('elision', prefix(`${short}'`, '', [], out, {stemStartsWith: '[à]', stemNotStartsWithText: 'à '}));
        continue;
    }
    if (!CLITIC.has(short)) {
        add('elision', prefix(`${short}'`, '', [], out));
        continue;
    }
    add('elision', prefix(`${short}'`, '', [], out, {stemNotStartsWith: '[ey]'}));
    add('elision', prefix(`${short}'`, '', [], out, {stemStartsWith: '[e]', stemNotStartsWithText: 'en '}));
    add('elision', prefix(`${short}'`, '', [], out, {stemStartsWith: '[y]', stemNotStartsWithText: 'y '}));
}
transform('elided-form', 'elided form',
    'The word an apostrophe follows, read as its elided and full forms: l → l\', le, la; qu → qu\', que.');
for (const [short, full] of ELIDED) {
    add('elided-form', whole(short, `${short}'`, [], []));
    for (const f of full) { add('elided-form', whole(short, f, [], [])); }
}

// --- Pronouns after a hyphen ---------------------------------------------------------
// Hyphens separate words, so a lookup reads an imperative with the pronouns
// attached to it (donne-moi, dis-le-lui) and a verb with its inverted subject
// (parle-t-il, dit-elle, est-ce). The pronouns are removed and the verb is
// read through the imperative (imp) or the finite tenses (fin). -nous and
// -vous can be either. A reflexive pronoun after an imperative gives the
// pronominal verb: lève-toi → se lève → se lever, va-t'en → s'en va → s'en aller.
// The pronoun is joined to the verb with +, as the preprocessor joinPronoun
// joins it (se+lève), so that the regular endings, whose stem is one word,
// read the verb; the postprocessor unjoinPronoun writes the space again.
transform('reflexive-imperative', 'reflexive imperative',
    'An affirmative imperative with a reflexive pronoun after it, read as the pronominal verb: lève-toi → se lève, assieds-toi → s\'assieds, va-t\'en → s\'en va.');
add('reflexive-imperative', {type: 'circumfix', inflectedPrefix: '', deinflectedPrefix: 'se+', inflectedSuffix: '-toi', deinflectedSuffix: '',
    conditionsIn: [], conditionsOut: ['imp'], stemNotStartsWith: '{vowel}'});
add('reflexive-imperative', {type: 'circumfix', inflectedPrefix: '', deinflectedPrefix: "s'", inflectedSuffix: '-toi', deinflectedSuffix: '',
    conditionsIn: [], conditionsOut: ['imp'], stemStartsWith: '{elidable}'});
for (const p of ["-t'en", '-nous-en', '-vous-en']) {
    add('reflexive-imperative', {type: 'circumfix', inflectedPrefix: '', deinflectedPrefix: "s'en+", inflectedSuffix: p, deinflectedSuffix: '',
        conditionsIn: [], conditionsOut: ['imp']});
}
transform('imperative-pronoun', 'imperative + pronoun',
    'An affirmative imperative with the pronouns attached to it after a hyphen, removed: donne-moi → donne, dis-le-lui → dis, vas-y → vas.');
const IMPERATIVE_PRONOUNS = [
    '-moi', '-le', '-la', '-les', '-lui', '-leur', '-y', '-en', "-m'en", "-m'y",
    '-le-moi', '-la-moi', '-les-moi', '-le-lui', '-la-lui', '-les-lui', '-le-leur', '-la-leur', '-les-leur',
    '-le-nous', '-la-nous', '-les-nous', '-le-vous', '-la-vous', '-les-vous', '-lui-en', '-leur-en', '-nous-en', '-vous-en',
    '-nous-y', '-vous-y', '-les-y',
];
for (const p of IMPERATIVE_PRONOUNS) {
    add('imperative-pronoun', suffix(p, '', [], ['imp']));
}
transform('hyphen-nous-vous', '-nous, -vous',
    'An imperative with nous or vous attached to it, or a verb with nous or vous as its inverted subject, the pronoun removed: asseyez-vous → asseyez, pouvez-vous → pouvez.');
for (const p of ['-nous', '-vous']) {
    add('hyphen-nous-vous', suffix(p, '', [], ['imp', 'fin']));
}
transform('inverted-subject', 'inverted subject',
    'A verb with its subject pronoun after it, as in questions and after quotations, removed: parle-t-il → parle, dit-elle → dit, est-ce → est, puis-je → puis.');
for (const p of ['-je', '-tu', '-il', '-elle', '-on', '-ils', '-elles', '-t-il', '-t-elle', '-t-on', '-ce']) {
    add('inverted-subject', suffix(p, '', [], ['fin']));
}
transform('demonstrative', '-ci, -là',
    'A noun with the demonstrative -ci or -là after it, removed: ce jour-là → jour, cette fois-ci → fois.');
for (const p of ['-ci', '-là']) {
    add('demonstrative', suffix(p, '', [], ['n']));
}

// --- Plural -------------------------------------------------------------------------
// The rules never reach across a space (stemCharacters notSpace): the plural
// of a phrase's last word does not make its headword. The plural comes
// before the verbs in this file, so that at the ending -es it is tried before
// the second person of an -er verb: portes, élèves and drogues are read as
// porte, élève and drogue first, porter, élever and droguer after.
const W = {stemCharacters: '{notSpace}'};
transform('plural', 'plural', 'Plural of a noun or adjective: livres → livre, chevaux → cheval, travaux → travail, jeux → jeu, vœux → vœu, yeux → œil.');
// The same plurals again with the ending a verb rule matches (élèves, armées,
// boutons, trompettes, partis), so that the plural is tried at that length,
// before the verb (élever, armer, bouter, trompeter, partir).
for (const [inflected, deinflected] of [['es', 'e'], ['ées', 'ée'], ['és', 'é'], ['ettes', 'ette'], ['elles', 'elle'], ['oies', 'oie'],
    ['aies', 'aie'], ['uies', 'uie'], ['ons', 'on'], ['ions', 'ion'], ['is', 'i'], ['us', 'u']]) {
    add('plural', suffix(inflected, deinflected, [], ['n', 'adj'], {...W, stemMinLength: 1}));
}
// A word in -s, -x or -z keeps its form in the plural, so a plural in -s
// never ends in ss, xs or zs: Miss is not the plural of mis.
add('plural', suffix('s', '', [], ['n', 'adj'], {...W, stemMinLength: 2, stemNotEndsWith: '[sxz]'}));
add('plural', suffix('eaux', 'eau', [], ['n', 'adj'], W));
for (const [inflected, deinflected] of [['aux', 'au'], ['eux', 'eu'], ['œux', 'œu'], ['oux', 'ou'], ['aux', 'al'], ['aux', 'ail']]) {
    add('plural', suffix(inflected, deinflected, [], ['n', 'adj'], {...W, stemMinLength: 1}));
}
for (const [inflected, deinflected] of [['yeux', 'œil'], ['cieux', 'ciel'], ['aïeux', 'aïeul'], ['messieurs', 'monsieur'], ['mesdames', 'madame'],
    ['mesdemoiselles', 'mademoiselle'], ['messeigneurs', 'monseigneur'], ['bonshommes', 'bonhomme'], ['gentilshommes', 'gentilhomme']]) {
    add('plural', whole(inflected, deinflected, [], ['n']));
}

// --- Verbs: the person of a joined pronoun -------------------------------------------
// A rule for a first person singular form marks a me, m', m'en or m'y at the
// start of the text as agreeing with it (me lève → me*lever, m'appelle →
// m'*appeler), a rule for a second person singular form a te, t', t'en or
// t'y, whether the preprocessor joinPronoun joined the pronoun to the verb
// (me+lève) or not; and the pronominal rule reads only marked pronouns. So a
// pronoun before a form of its person gives the pronominal verb (je me lève
// → se lever, tu t'appelles → s'appeler), a pronoun before an infinitive
// gives none (il va m'appeler, je vais te prendre: an object there as often
// as a reflexive pronoun), and nor does one before another person (il me
// dit). The postprocessor unjoinPronoun writes the space back.
// A pronoun before a space is marked where joinPronoun joined it; an elided
// m' or t' is not joined, and is marked as it is.
const MARKS = {
    '1s': [['me+', 'me*'], ["m'en+", "m'en*"], ["m'y+", "m'y*"], ["m'", "m'*"]],
    '2s': [['te+', 'te*'], ["t'en+", "t'en*"], ["t'y+", "t'y*"], ["t'", "t'*"]],
};
function personThen(finite, persons) {
    const map = {};
    for (const person of ['1s', '2s']) {
        if (finite && persons.includes(person)) { for (const [from, to] of MARKS[person]) { map[from] = to; } }
    }
    return Object.keys(map).length === 0 ? {} : {then: [{map, at: 'start'}]};
}

// --- Verbs: paradigms ---------------------------------------------------------------
const PERSONS = ['1s', '2s', '3s', '1p', '2p', '3p'];
const PERSON_NAME = {'1s': 'je', '2s': 'tu', '3s': 'il', '1p': 'nous', '2p': 'vous', '3p': 'ils'};
const SINGULAR = {
    e: ['e', 'es', 'e'], s: ['s', 's', 't'], x: ['x', 'x', 't'], ds: ['ds', 'ds', 'd'],
    ts: ['ts', 'ts', 't'], cs: ['cs', 'cs', 'c'], ps: ['ps', 'ps', 'pt'],
};
const SIMPLE_PAST = {
    a: ['ai', 'as', 'a', 'âmes', 'âtes', 'èrent'],
    i: ['is', 'is', 'it', 'îmes', 'îtes', 'irent'],
    u: ['us', 'us', 'ut', 'ûmes', 'ûtes', 'urent'],
    in: ['ins', 'ins', 'int', 'înmes', 'întes', 'inrent'],
};
const IMPERFECT_SUBJUNCTIVE = {
    a: ['asse', 'asses', 'ât', 'assions', 'assiez', 'assent'],
    i: ['isse', 'isses', 'ît', 'issions', 'issiez', 'issent'],
    u: ['usse', 'usses', 'ût', 'ussions', 'ussiez', 'ussent'],
    in: ['insse', 'insses', 'înt', 'inssions', 'inssiez', 'inssent'],
};
const IMPERFECT = ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'];
const FUTURE = ['ai', 'as', 'a', 'ons', 'ez', 'ont'];
const CONDITIONAL = ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'];
const SUBJUNCTIVE = ['e', 'es', 'e', 'ions', 'iez', 'ent'];
const list = (x) => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

// Joins a first-group stem and an ending: c → ç and g → ge before a and o.
function join1(stem, ending) {
    if (/^[aoâ]/u.test(ending)) {
        if (stem.endsWith('c')) { return stem.slice(0, -1) + 'ç' + ending; }
        if (stem.endsWith('g')) { return stem + 'e' + ending; }
    }
    return stem + ending;
}

/**
 * The simple tenses and participles of a verb, as {tense: {person: [forms]}}.
 * A model gives its stems: sg [[stem, singular type]...], pl (nous, vous),
 * p3 (ils), impf (imperfect, default pl), ps [[stem, type]...], fut, sb and sb2
 * (subjunctive singular and ils, nous and vous; default p3 and pl), imp
 * ([2s, 1p, 2p] forms or null), ppr, pp ([m, f, mp, fp] or a masculine
 * singular to agree), and `set` to replace whole cells: {tense: {person: [...]}}.
 */
function paradigm(m) {
    const t = {};
    const joinStem = m.firstGroup ? join1 : (a, b) => a + b;
    const put = (tense, person, form) => {
        const cell = ((t[tense] ??= {})[person] ??= []);
        if (!cell.includes(form)) { cell.push(form); }
    };
    for (const [stem, type] of m.sg ?? []) { SINGULAR[type].forEach((e, i) => put('present', PERSONS[i], joinStem(stem, e))); }
    for (const s of list(m.pl)) { put('present', '1p', joinStem(s, 'ons')); put('present', '2p', joinStem(s, 'ez')); }
    for (const s of list(m.p3)) { put('present', '3p', joinStem(s, 'ent')); }
    for (const s of list(m.impf ?? m.pl)) { IMPERFECT.forEach((e, i) => put('imperfect', PERSONS[i], joinStem(s, e))); }
    for (const [stem, type] of m.ps ?? []) {
        SIMPLE_PAST[type].forEach((e, i) => put('simple-past', PERSONS[i], joinStem(stem, e)));
        IMPERFECT_SUBJUNCTIVE[type].forEach((e, i) => put('imperfect-subjunctive', PERSONS[i], joinStem(stem, e)));
    }
    for (const f of list(m.fut)) {
        FUTURE.forEach((e, i) => put('future', PERSONS[i], f + e));
        CONDITIONAL.forEach((e, i) => put('conditional', PERSONS[i], f + e));
    }
    for (const s of list(m.sb ?? m.p3)) { for (const i of [0, 1, 2, 5]) { put('subjunctive', PERSONS[i], joinStem(s, SUBJUNCTIVE[i])); } }
    for (const s of list(m.sb2 ?? m.pl)) { for (const i of [3, 4]) { put('subjunctive', PERSONS[i], joinStem(s, SUBJUNCTIVE[i])); } }
    if (m.imp !== null) {
        const [i2s, i1p, i2p] = m.imp ?? [
            (m.sg ?? []).map(([stem, type]) => joinStem(stem, type === 'e' ? 'e' : SINGULAR[type][1])),
            list(m.pl).map((s) => joinStem(s, 'ons')),
            list(m.pl).map((s) => joinStem(s, 'ez')),
        ];
        for (const f of list(i2s)) { put('imperative', '2s', f); }
        // An -er imperative takes an s before en and y: parles-en, vas-y.
        for (const f of list(i2s)) { if (f.endsWith('e') && (m.firstGroup || m.eType)) { put('imperative', '2s', `${f}s`); } }
        for (const f of list(i1p)) { put('imperative', '1p', f); }
        for (const f of list(i2p)) { put('imperative', '2p', f); }
    }
    for (const f of list(m.ppr ?? list(m.pl).map((s) => joinStem(s, 'ant')))) { put('present-participle', '-', f); }
    if (m.pp !== undefined) {
        const forms = Array.isArray(m.pp) ? m.pp : agree(m.pp, m.ppInvariable);
        const [ms, fs, mp, fp] = forms;
        for (const f of list(ms)) { put('past-participle', '-', f); }
        for (const f of list(fs)) { put('past-participle-f', '-', f); }
        for (const f of list(mp)) { put('past-participle-mp', '-', f); }
        for (const f of list(fp)) { put('past-participle-fp', '-', f); }
    }
    for (const [tense, cells] of Object.entries(m.set ?? {})) {
        for (const [person, forms] of Object.entries(cells)) { (t[tense] ??= {})[person] = [...list(forms)]; }
    }
    for (const [tense, cells] of Object.entries(m.also ?? {})) {
        for (const [person, forms] of Object.entries(cells)) { for (const f of list(forms)) { put(tense, person, f); } }
    }
    return t;
}

/** The four forms of a past participle: masculine, feminine, masculine plural, feminine plural. */
function agree(pp, invariable = false) {
    if (invariable) { return [pp, [], [], []]; }
    const base = pp.replace(/[ûù]$/u, (c) => (c === 'û' ? 'u' : 'u'));
    const ms = pp;
    const fs = base + 'e';
    const mp = /[sx]$/u.test(pp) ? pp : base + 's';
    const fp = base + 'es';
    return [ms, fs, mp, fp];
}

// --- Verbs: models ------------------------------------------------------------------
// Each model is conjugated in full; `keep` is the number of leading letters of
// the infinitive that its rules leave out, so the rules apply to every verb of
// the class (craindre with keep 2 gives `ains` → `aindre`, which also reads
// plains → plaindre). With keep 0 the rules are the model's whole forms, so
// they apply to the model and its compounds (viens → venir, deviens →
// devenir, me souviens → me souvenir).
//
// `stem` constrains what may come before an ending:
//   - word: the ending is part of a word, so the verb's stem has at least
//     `min` letters (2 for -er and -ir verbs, otherwise 1);
//   - free: anything may (a compound's prefix, or a pronoun and a space:
//     me souviens, s'en va);
//   - alone: nothing or a non-letter (a space, an apostrophe) may, for the
//     short forms of être, avoir and aller (es, a, va), which end many words.
const MODELS = [];
function model(inf, keep, stem, m) { MODELS.push({inf, keep, stem, ...m}); }

// être, avoir, aller: every form written out.
// être and vouloir are not read after en (j'en suis sûr, je n'en veux plus):
// there en is the pronoun and the verb a copula, an auxiliary (je m'en suis
// allé) or wants some of it, and a reading of the phrases en être and en
// vouloir would come first, being longer. 9 of 12 sampled en être readings
// of Tatoeba were wrong (README.md, Rule provenance). avoir's forms other
// than the third person singular are not read after y: il y a is the
// phrase y avoir, j'y ai and vous y avez are y and the auxiliary. The stem
// constraint leaves out every stem that starts with the letters of en, m'en,
// t'en, s'en (e, m, t, s) or y: of wty-fr-en's headwords that end in être,
// vouloir or avoir, only en être, s'en être, tant qu'à y être, en vouloir
// and y avoir start with them. The elided pronoun before a verb (s'est,
// m'est, t'es) is removed by its own rule first.
model('être', 0, 'alone', {notAfter: '[emst]',
    set: {
        present: {'1s': 'suis', '2s': 'es', '3s': 'est', '1p': 'sommes', '2p': 'êtes', '3p': 'sont'},
        imperfect: {'1s': 'étais', '2s': 'étais', '3s': 'était', '1p': 'étions', '2p': 'étiez', '3p': 'étaient'},
        'simple-past': {'1s': 'fus', '2s': 'fus', '3s': 'fut', '1p': 'fûmes', '2p': 'fûtes', '3p': 'furent'},
        future: {'1s': 'serai', '2s': 'seras', '3s': 'sera', '1p': 'serons', '2p': 'serez', '3p': 'seront'},
        conditional: {'1s': 'serais', '2s': 'serais', '3s': 'serait', '1p': 'serions', '2p': 'seriez', '3p': 'seraient'},
        subjunctive: {'1s': 'sois', '2s': 'sois', '3s': 'soit', '1p': 'soyons', '2p': 'soyez', '3p': 'soient'},
        'imperfect-subjunctive': {'1s': 'fusse', '2s': 'fusses', '3s': 'fût', '1p': 'fussions', '2p': 'fussiez', '3p': 'fussent'},
        imperative: {'2s': 'sois', '1p': 'soyons', '2p': 'soyez'},
        'present-participle': {'-': 'étant'},
        'past-participle': {'-': 'été'},
    },
});
model('avoir', 0, 'alone', {notAfter: '[y]', notAfterPersons: ['1s', '2s', '1p', '2p', '3p'],
    set: {
        present: {'1s': 'ai', '2s': 'as', '3s': 'a', '1p': 'avons', '2p': 'avez', '3p': 'ont'},
        imperfect: {'1s': 'avais', '2s': 'avais', '3s': 'avait', '1p': 'avions', '2p': 'aviez', '3p': 'avaient'},
        'simple-past': {'1s': 'eus', '2s': 'eus', '3s': 'eut', '1p': 'eûmes', '2p': 'eûtes', '3p': 'eurent'},
        future: {'1s': 'aurai', '2s': 'auras', '3s': 'aura', '1p': 'aurons', '2p': 'aurez', '3p': 'auront'},
        conditional: {'1s': 'aurais', '2s': 'aurais', '3s': 'aurait', '1p': 'aurions', '2p': 'auriez', '3p': 'auraient'},
        subjunctive: {'1s': 'aie', '2s': 'aies', '3s': 'ait', '1p': 'ayons', '2p': 'ayez', '3p': 'aient'},
        'imperfect-subjunctive': {'1s': 'eusse', '2s': 'eusses', '3s': 'eût', '1p': 'eussions', '2p': 'eussiez', '3p': 'eussent'},
        imperative: {'2s': 'aie', '1p': 'ayons', '2p': 'ayez'},
        'present-participle': {'-': 'ayant'},
        'past-participle': {'-': 'eu'},
        'past-participle-f': {'-': 'eue'},
        'past-participle-mp': {'-': 'eus'},
        'past-participle-fp': {'-': 'eues'},
    },
});
// aller keeps every form, also those the regular endings read (allons,
// allait), with its stem constraint: so they follow y and s'en, as the
// dictionaries' phrases y aller and s'en aller need (nous y allions, il s'en
// allait).
model('aller', 0, 'alone', {
    firstGroup: true, keepRegular: true,
    sg: [], pl: 'all', p3: [], ps: [['all', 'a']], fut: 'ir', sb: 'aill', sb2: 'all', pp: 'allé',
    set: {
        present: {'1s': 'vais', '2s': 'vas', '3s': 'va', '1p': 'allons', '2p': 'allez', '3p': 'vont'},
        imperative: {'2s': ['va', 'vas'], '1p': 'allons', '2p': 'allez'},
    },
});
// faire and dire: written out from their stems; compounds keep 0.
// faire is not read after la, le, les or l': la faisait souffrir is not the
// phrase la faire (23 first results in the measured texts, all wrong).
// No compound of faire starts with l.
model('faire', 0, 'free', {notAfter: '[l]',
    sg: [['fai', 's']], pl: 'fais', p3: [], ps: [['f', 'i']], fut: 'fer', sb: 'fass', sb2: 'fass', pp: 'fait',
    set: {present: {'1s': 'fais', '2s': 'fais', '3s': 'fait', '1p': 'faisons', '2p': 'faites', '3p': 'font'},
        imperative: {'2s': 'fais', '1p': 'faisons', '2p': 'faites'}},
});
model('dire', 0, 'free', {
    sg: [['di', 's']], pl: 'dis', p3: 'dis', ps: [['d', 'i']], fut: 'dir', pp: 'dit',
    // contredire, interdire, médire, prédire and dédire say vous …disez.
    set: {present: {'2p': ['dites', 'disez']}, imperative: {'2s': 'dis', '1p': 'disons', '2p': ['dites', 'disez']}},
});
model('maudire', 0, 'free', {sg: [['maudi', 's']], pl: 'maudiss', p3: 'maudiss', ps: [['maud', 'i']], fut: 'maudir', pp: 'maudit'});

// Third group, -ir.
for (const v of ['venir', 'tenir']) {
    const c = v[0];
    model(v, 0, 'free', {sg: [[`${c}ien`, 's']], pl: `${c}en`, p3: `${c}ienn`, ps: [[c, 'in']], fut: `${c}iendr`, pp: `${c}enu`});
}
model('acquérir', 3, 'word', {sg: [['acquier', 's']], pl: 'acquér', p3: 'acquièr', ps: [['acqu', 'i']], fut: 'acquerr', pp: 'acquis'});
for (const [v, sg, pp] of [['partir', 'par', 'parti'], ['sortir', 'sor', 'sorti'], ['sentir', 'sen', 'senti'], ['mentir', 'men', 'menti'],
    ['repentir', 'repen', 'repenti'], ['dormir', 'dor', 'dormi'], ['servir', 'ser', 'servi']]) {
    const s = v.slice(0, -2);
    model(v, 0, 'free', {sg: [[sg, 's']], pl: s, p3: s, ps: [[s, 'i']], fut: v, pp});
}
model('bouillir', 0, 'free', {sg: [['bou', 's']], pl: 'bouill', p3: 'bouill', ps: [['bouill', 'i']], fut: 'bouillir', pp: 'bouilli'});
model('vêtir', 0, 'free', {sg: [['vê', 'ts']], pl: 'vêt', p3: 'vêt', ps: [['vêt', 'i']], fut: 'vêtir', pp: 'vêtu'});
for (const [v, keep] of [['ouvrir', 2], ['offrir', 2]]) {
    const s = v.slice(0, -2);
    model(v, keep, 'word', {eType: true, sg: [[s, 'e']], pl: s, p3: s, ps: [[s, 'i']], fut: v, pp: v.slice(0, -3) + 'ert'});
}
model('cueillir', 1, 'word', {eType: true, sg: [['cueill', 'e']], pl: 'cueill', p3: 'cueill', ps: [['cueill', 'i']], fut: 'cueiller', pp: 'cueilli'});
model('assaillir', 3, 'word', {eType: true, sg: [['assaill', 'e']], pl: 'assaill', p3: 'assaill', ps: [['assaill', 'i']], fut: 'assaillir', pp: 'assailli'});
model('courir', 0, 'free', {sg: [['cour', 's']], pl: 'cour', p3: 'cour', ps: [['cour', 'u']], fut: 'courr', pp: 'couru'});
model('mourir', 0, 'free', {sg: [['meur', 's']], pl: 'mour', p3: 'meur', sb: 'meur', sb2: 'mour', ps: [['mour', 'u']], fut: 'mourr', pp: 'mort'});
model('fuir', 0, 'free', {sg: [['fui', 's']], pl: 'fuy', p3: 'fui', ps: [['fu', 'i']], fut: 'fuir', pp: 'fui'});
model('haïr', 0, 'free', {
    sg: [['hai', 's']], pl: 'haïss', p3: 'haïss', fut: 'haïr', pp: 'haï',
    set: {
        'simple-past': {'1s': 'haïs', '2s': 'haïs', '3s': 'haït', '1p': 'haïmes', '2p': 'haïtes', '3p': 'haïrent'},
        'imperfect-subjunctive': {'1s': 'haïsse', '2s': 'haïsses', '3s': 'haït', '1p': 'haïssions', '2p': 'haïssiez', '3p': 'haïssent'},
    },
});

// Third group, -oir.
model('recevoir', 2, 'word', {sg: [['reçoi', 's']], pl: 'recev', p3: 'reçoiv', ps: [['reç', 'u']], fut: 'recevr', pp: 'reçu'});
// voir and its compounds, listed: a free stem would read ravis as ravoir and
// devis as devoir. prévoir and pourvoir have the future prévoirai,
// pourvoirai, and pourvoir the simple past pourvus.
for (const [v, fut, ps] of [['voir', 'verr', 'i'], ['revoir', 'reverr', 'i'], ['entrevoir', 'entreverr', 'i'],
    ['prévoir', 'prévoir', 'i'], ['pourvoir', 'pourvoir', 'u'], ['dépourvoir', 'dépourvoir', 'u']]) {
    const s = v.slice(0, -1);  // voi
    const y = `${s.slice(0, -1)}y`;  // voy
    model(v, 0, v === 'voir' ? 'alone' : 'free', {sg: [[s, 's']], pl: y, p3: s, sb: s, sb2: y, ps: [[v.slice(0, -3), ps]], fut, pp: `${v.slice(0, -3)}u`});
}
model('devoir', 0, 'free', {sg: [['doi', 's']], pl: 'dev', p3: 'doiv', ps: [['d', 'u']], fut: 'devr', pp: ['dû', 'due', 'dus', 'dues']});
model('pouvoir', 0, 'free', {
    sg: [['peu', 'x']], pl: 'pouv', p3: 'peuv', sb: 'puiss', sb2: 'puiss', ps: [['p', 'u']], fut: 'pourr', imp: null, pp: 'pu', ppInvariable: true,
    also: {present: {'1s': 'puis'}},
});
model('savoir', 0, 'free', {
    sg: [['sai', 's']], pl: 'sav', p3: 'sav', sb: 'sach', sb2: 'sach', ps: [['s', 'u']], fut: 'saur', pp: 'su',
    imp: ['sache', 'sachons', 'sachez'], ppr: 'sachant',
});
model('vouloir', 0, 'free', {notAfter: '[e]',
    sg: [['veu', 'x']], pl: 'voul', p3: 'veul', sb: 'veuill', sb2: 'voul', ps: [['voul', 'u']], fut: 'voudr', pp: 'voulu',
    imp: [['veuille', 'veux'], ['veuillons', 'voulons'], ['veuillez', 'voulez']],
});
model('valoir', 0, 'free', {
    sg: [['vau', 'x']], pl: 'val', p3: 'val', sb: ['vaill', 'val'], sb2: 'val', ps: [['val', 'u']], fut: 'vaudr', pp: 'valu',
});
model('falloir', 0, 'free', {
    set: {present: {'3s': 'faut'}, imperfect: {'3s': 'fallait'}, 'simple-past': {'3s': 'fallut'}, future: {'3s': 'faudra'},
        conditional: {'3s': 'faudrait'}, subjunctive: {'3s': 'faille'}, 'imperfect-subjunctive': {'3s': 'fallût'},
        'past-participle': {'-': 'fallu'}},
});
model('pleuvoir', 0, 'free', {
    set: {present: {'3s': 'pleut', '3p': 'pleuvent'}, imperfect: {'3s': 'pleuvait', '3p': 'pleuvaient'},
        'simple-past': {'3s': 'plut', '3p': 'plurent'}, future: {'3s': 'pleuvra', '3p': 'pleuvront'},
        conditional: {'3s': 'pleuvrait', '3p': 'pleuvraient'}, subjunctive: {'3s': 'pleuve', '3p': 'pleuvent'},
        'imperfect-subjunctive': {'3s': 'plût'}, 'present-participle': {'-': 'pleuvant'}, 'past-participle': {'-': 'plu'}},
});
model('asseoir', 0, 'free', {
    sg: [['assie', 'ds'], ['assoi', 's']], pl: ['assey', 'assoy'], p3: ['assey', 'assoi'], ps: [['ass', 'i']],
    fut: ['assiér', 'assoir', 'asseyer'], pp: 'assis',
});
model('surseoir', 0, 'free', {sg: [['sursoi', 's']], pl: 'sursoy', p3: 'sursoi', sb: 'sursoi', sb2: 'sursoy', ps: [['surs', 'i']], fut: 'surseoir', pp: 'sursis'});
// clore, éclore and enclore; frire; échoir and déchoir; foutre.
model('clore', 0, 'free', {sg: [['clo', 's']], pl: 'clos', p3: 'clos', fut: 'clor', pp: 'clos',
    set: {present: {'3s': ['clôt', 'clot']}}, imp: [['clos'], [], []]});
model('frire', 0, 'free', {sg: [['fri', 's']], fut: 'frir', pp: 'frit', imp: [['fris'], [], []]});
model('déchoir', 0, 'free', {sg: [['déchoi', 's']], pl: 'déchoy', p3: 'déchoi', ps: [['déch', 'u']], fut: 'déchoir', pp: 'déchu'});
model('échoir', 0, 'free', {set: {present: {'3s': 'échoit', '3p': 'échoient'}, future: {'3s': 'échoira'}, 'simple-past': {'3s': 'échut'},
    'present-participle': {'-': 'échéant'}, 'past-participle': {'-': 'échu'}, 'past-participle-f': {'-': 'échue'},
    'past-participle-mp': {'-': 'échus'}, 'past-participle-fp': {'-': 'échues'}}});
model('foutre', 0, 'free', {sg: [['fou', 's']], pl: 'fout', p3: 'fout', fut: 'foutr', pp: 'foutu'});
model('mouvoir', 0, 'free', {
    sg: [['meu', 's']], pl: 'mouv', p3: 'meuv', ps: [['m', 'u']], fut: 'mouvr', pp: ['mû', [], [], []],
});
// émouvoir and promouvoir: ému, émue, promus; listed, so that mue, mues and
// remue (muer, remuer) are not read as mouvoir.
model('émouvoir', 0, 'free', {sg: [['émeu', 's']], pl: 'émouv', p3: 'émeuv', ps: [['ém', 'u']], fut: 'émouvr', pp: 'ému'});
model('promouvoir', 0, 'free', {sg: [['promeu', 's']], pl: 'promouv', p3: 'promeuv', ps: [['prom', 'u']], fut: 'promouvr', pp: 'promu'});

// Third group, -re.
model('prendre', 0, 'free', {sg: [['pren', 'ds']], pl: 'pren', p3: 'prenn', ps: [['pr', 'i']], fut: 'prendr', pp: 'pris'});
model('mettre', 0, 'free', {sg: [['me', 'ts']], pl: 'mett', p3: 'mett', ps: [['m', 'i']], fut: 'mettr', pp: 'mis'});
model('battre', 0, 'free', {sg: [['ba', 'ts']], pl: 'batt', p3: 'batt', ps: [['batt', 'i']], fut: 'battr', pp: 'battu'});
for (const [v, keep] of [['rendre', 1], ['répandre', 3], ['répondre', 3], ['perdre', 1], ['mordre', 1]]) {
    const s = v.slice(0, -2);
    model(v, keep, 'word', {sg: [[s.slice(0, -1), 'ds']], pl: s, p3: s, ps: [[s, 'i']], fut: v.slice(0, -1), pp: `${s}u`});
}
model('rompre', 1, 'word', {sg: [['rom', 'ps']], pl: 'romp', p3: 'romp', ps: [['romp', 'i']], fut: 'rompr', pp: 'rompu'});
model('vaincre', 0, 'free', {sg: [['vain', 'cs']], pl: 'vainqu', p3: 'vainqu', ps: [['vainqu', 'i']], fut: 'vaincr', pp: 'vaincu'});
for (const [v, keep, stem] of [['craindre', 2, 'word'], ['peindre', 1, 'word'], ['joindre', 1, 'free']]) {
    // joindre is free: oindre itself has nothing before oindre.
    const s = v.slice(0, -3);  // crain
    const g = `${s.slice(0, -1)}gn`;  // craign
    model(v, keep, stem, {sg: [[s, 's']], pl: g, p3: g, ps: [[g, 'i']], fut: v.slice(0, -1), pp: `${s}t`});
}
// traire and its compounds, listed: a free stem would read the imperfect of
// every -trer verb (rentrait, montrait) as a -traire verb (rentraire).
for (const v of ['traire', 'abstraire', 'distraire', 'extraire', 'soustraire']) {
    const s = v.slice(0, -2);  // trai
    const y = `${s.slice(0, -1)}y`;  // tray
    model(v, 0, v === 'traire' ? 'alone' : 'free', {sg: [[s, 's']], pl: y, p3: s, sb: s, sb2: y, ps: [[y, 'a']], fut: `${v.slice(0, -1)}`, pp: `${s}t`});
}
model('plaire', 0, 'free', {sg: [['plai', 's']], pl: 'plais', p3: 'plais', ps: [['pl', 'u']], fut: 'plair', pp: 'plu', ppInvariable: true,
    // plaît; plait in the 1990 spelling.
    set: {present: {'3s': ['plaît', 'plait']}}});
// taire: the feminine participles tue and tues are left out; they are much
// more often tuer (il tue, tu tues), and a longer ending is tried first.
model('taire', 0, 'free', {sg: [['tai', 's']], pl: 'tais', p3: 'tais', ps: [['t', 'u']], fut: 'tair', pp: ['tu', [], 'tus', []]});
for (const [v, pp] of [['connaître', 'connu'], ['paraître', 'paru']]) {
    const s = v.slice(0, -4);
    model(v, 0, 'free', {
        sg: [[`${s}i`, 's']], pl: `${s}iss`, p3: `${s}iss`, ps: [[s.slice(0, -1), 'u']], fut: [`${s}îtr`, `${s}itr`], pp,
        set: {present: {'3s': [`${s}ît`, `${s}it`]}},
    });
}
model('naître', 0, 'free', {sg: [['nai', 's']], pl: 'naiss', p3: 'naiss', ps: [['naqu', 'i']], fut: ['naîtr', 'naitr'], pp: 'né',
    set: {present: {'3s': ['naît', 'nait']}}});
// paître and repaître: paître has no simple past; repaître's is repus.
model('repaître', 0, 'alone', {ps: [['rep', 'u']], imp: null});
model('paître', 0, 'free', {sg: [['pai', 's']], pl: 'paiss', p3: 'paiss', fut: ['paîtr', 'paitr'], pp: 'pu', ppInvariable: true,
    set: {present: {'3s': ['paît', 'pait']}}});
model('croître', 0, 'free', {
    sg: [['croî', 's']], pl: 'croiss', p3: 'croiss', fut: ['croîtr', 'croitr'], pp: ['crû', 'crue', 'crus', 'crues'],
    set: {'simple-past': {'1s': 'crûs', '2s': 'crûs', '3s': 'crût', '1p': 'crûmes', '2p': 'crûtes', '3p': 'crûrent'},
        'imperfect-subjunctive': {'1s': 'crûsse', '2s': 'crûsses', '3s': 'crût', '1p': 'crûssions', '2p': 'crûssiez', '3p': 'crûssent'}},
});
// accroître and décroître: accrus, accrut, accru, without the circumflex of
// croître. A letter must come before crus, so that crut is croire.
model('accroître', 2, 'word', {ps: [['accr', 'u']], pp: 'accru', imp: null,
    // j'accrois, il accroît (accroit in the 1990 spelling), without the
    // circumflex of je croîs.
    set: {present: {'1s': 'accrois', '2s': 'accrois', '3s': ['accroît', 'accroit']}, imperative: {'2s': 'accrois'}}});
// croire has no compounds in use (accroire has only its infinitive), so
// accrut, accru are accroître only.
model('croire', 0, 'alone', {sg: [['croi', 's']], pl: 'croy', p3: 'croi', sb: 'croi', sb2: 'croy', ps: [['cr', 'u']], fut: 'croir', pp: 'cru'});
model('boire', 0, 'free', {sg: [['boi', 's']], pl: 'buv', p3: 'boiv', ps: [['b', 'u']], fut: 'boir', pp: 'bu'});
model('conclure', 3, 'word', {
    sg: [['conclu', 's']], pl: 'conclu', p3: 'conclu', ps: [['concl', 'u']], fut: 'conclur', pp: 'conclu',
    // inclure and occlure: inclus, incluse.
    also: {'past-participle': {'-': 'conclus'}, 'past-participle-f': {'-': 'concluse'}, 'past-participle-fp': {'-': 'concluses'}},
});
// résoudre has the participle résolu; dissoudre and absoudre have dissous,
// dissoute and absous, absoute (absolu is an adjective, not absoudre).
model('résoudre', 0, 'free', {sg: [['résou', 's']], pl: 'résolv', p3: 'résolv', ps: [['résol', 'u']], fut: 'résoudr', pp: 'résolu'});
for (const v of ['dissoudre', 'absoudre']) {
    const s = v.slice(0, -3);  // dissou
    const l = `${s.slice(0, -1)}lv`;  // dissolv
    model(v, 0, 'free', {sg: [[s, 's']], pl: l, p3: l, ps: [[`${s.slice(0, -1)}l`, 'u']], fut: `${v.slice(0, -1)}`, pp: [`${s}s`, `${s}te`, `${s}s`, `${s}tes`]});
}
model('coudre', 0, 'free', {sg: [['cou', 'ds']], pl: 'cous', p3: 'cous', ps: [['cous', 'i']], fut: 'coudr', pp: 'cousu'});
model('moudre', 0, 'free', {sg: [['mou', 'ds']], pl: 'moul', p3: 'moul', ps: [['moul', 'u']], fut: 'moudr', pp: 'moulu'});
model('suivre', 0, 'free', {sg: [['sui', 's']], pl: 'suiv', p3: 'suiv', ps: [['suiv', 'i']], fut: 'suivr', pp: 'suivi'});
model('vivre', 0, 'free', {sg: [['vi', 's']], pl: 'viv', p3: 'viv', ps: [['véc', 'u']], fut: 'vivr', pp: 'vécu'});
model('lire', 0, 'free', {sg: [['li', 's']], pl: 'lis', p3: 'lis', ps: [['l', 'u']], fut: 'lir', pp: 'lu'});
// rire and sourire, listed: a free stem would read écrie and écriant
// (s'écrier) as écrire.
for (const v of ['rire', 'sourire']) {
    const s = v.slice(0, -2);  // ri
    model(v, 0, v === 'rire' ? 'alone' : 'free', {sg: [[s, 's']], pl: s, p3: s, ps: [[v.slice(0, -3), 'i']], fut: v.slice(0, -1), pp: s, ppInvariable: true});
}
model('écrire', 1, 'word', {sg: [['écri', 's']], pl: 'écriv', p3: 'écriv', ps: [['écriv', 'i']], fut: 'écrir', pp: 'écrit'});
model('suffire', 0, 'free', {sg: [['suffi', 's']], pl: 'suffis', p3: 'suffis', ps: [['suff', 'i']], fut: 'suffir', pp: 'suffi', ppInvariable: true});
model('confire', 0, 'free', {sg: [['confi', 's']], pl: 'confis', p3: 'confis', ps: [['conf', 'i']], fut: 'confir', pp: 'confit'});
model('conduire', 4, 'word', {sg: [['condui', 's']], pl: 'conduis', p3: 'conduis', ps: [['conduis', 'i']], fut: 'conduir', pp: 'conduit'});
// nuire, luire and reluire: nui, lui.
model('nuire', 1, 'word', {set: {'past-participle': {'-': 'nui'}}});

// First group: the spelling changes of the stem. The regular endings come
// from parler (keep 4: e → er); the others add only the forms that the
// regular endings do not already read (plaçons, mangeons, appelle, jette,
// emploie, essuie, paie, enverrai). lever and céder are read by the
// stem-change rules below.
model('envoyer', 0, 'free', {firstGroup: true, fut: 'enverr', imp: null});
model('parler', 4, 'word', {firstGroup: true, regular: true, min: 2, sg: [['parl', 'e']], pl: 'parl', p3: 'parl', ps: [['parl', 'a']], fut: 'parler', pp: 'parlé'});
model('placer', 3, 'word', {firstGroup: true, sg: [['plac', 'e']], pl: 'plac', p3: 'plac', ps: [['plac', 'a']], fut: 'placer', pp: 'placé'});
model('manger', 3, 'word', {firstGroup: true, sg: [['mang', 'e']], pl: 'mang', p3: 'mang', ps: [['mang', 'a']], fut: 'manger', pp: 'mangé'});
model('appeler', 3, 'word', {firstGroup: true, sg: [['appell', 'e']], pl: 'appel', p3: 'appell', sb: 'appell', sb2: 'appel', ps: [['appel', 'a']], fut: 'appeller', pp: 'appelé'});
model('jeter', 1, 'word', {firstGroup: true, sg: [['jett', 'e']], pl: 'jet', p3: 'jett', sb: 'jett', sb2: 'jet', ps: [['jet', 'a']], fut: 'jetter', pp: 'jeté'});
model('employer', 4, 'word', {firstGroup: true, sg: [['emploi', 'e']], pl: 'employ', p3: 'emploi', sb: 'emploi', sb2: 'employ', ps: [['employ', 'a']], fut: 'emploier', pp: 'employé'});
model('essuyer', 3, 'word', {firstGroup: true, sg: [['essui', 'e']], pl: 'essuy', p3: 'essui', sb: 'essui', sb2: 'essuy', ps: [['essuy', 'a']], fut: 'essuier', pp: 'essuyé'});
model('payer', 1, 'word', {firstGroup: true, sg: [['pai', 'e']], pl: 'pay', p3: 'pai', sb: 'pai', sb2: 'pay', ps: [['pay', 'a']], fut: 'paier', pp: 'payé'});
// Second group.
model('finir', 3, 'word', {regular: true, min: 2, sg: [['fini', 's']], pl: 'finiss', p3: 'finiss', ps: [['fin', 'i']], fut: 'finir', pp: 'fini'});

// --- Verbs: transforms ----------------------------------------------------------------
const TENSES = [
    ['present', 'present', 'Present indicative', true, ['fin', 'vcl']],
    ['imperfect', 'imperfect', 'Imperfect indicative (imparfait)', true, ['fin', 'vcl']],
    ['simple-past', 'simple past', 'Simple past (passé simple), the past tense of written narrative', true, ['fin', 'vcl']],
    ['future', 'future', 'Simple future (futur simple)', true, ['fin', 'vcl']],
    ['conditional', 'conditional', 'Present conditional', true, ['fin', 'vcl']],
    ['subjunctive', 'subjunctive', 'Present subjunctive', true, ['vcl']],
    ['imperfect-subjunctive', 'imperfect subjunctive', 'Imperfect subjunctive (imparfait du subjonctif), mostly in literary writing', true, ['vcl']],
    ['imperative', 'imperative', 'Imperative', false, ['imp']],
    ['present-participle', 'present participle', 'Present participle and gerund (-ant)', false, ['vcl']],
    ['past-participle', 'past participle', 'Past participle, masculine singular', false, ['vcl']],
    ['past-participle-f', 'past participle (feminine)', 'Past participle, feminine singular', false, ['vcl']],
    ['past-participle-mp', 'past participle (plural)', 'Past participle, masculine plural', false, ['vcl']],
    ['past-participle-fp', 'past participle (feminine plural)', 'Past participle, feminine plural', false, ['vcl']],
];
const TENSE = new Map(TENSES.map(([id, name, description, finite, conditionsIn]) => [id, {id, name, description, finite, conditionsIn}]));
// Person sets in the order their transforms are written, so that a form of
// one person comes before the same form of two (suis: être, present (je),
// before suivre, present (je, tu)).
const PERSON_SETS = [['1s'], ['2s'], ['3s'], ['1s', '2s'], ['1s', '3s'], ['2s', '3s'], ['1s', '2s', '3s'], ['1p'], ['2p'], ['3p'], ['3s', '3p'], ['-']];
const EXAMPLES = {};

function verbTransformId(tense, persons) {
    return persons[0] === '-' ? tense : `${tense}-${persons.join('-')}`;
}
for (const [tense] of TENSES) {
    const t = TENSE.get(tense);
    for (const persons of PERSON_SETS) {
        const id = verbTransformId(tense, persons);
        const name = persons[0] === '-' ? t.name : `${t.name} (${persons.map((p) => PERSON_NAME[p]).join(', ')})`;
        const names = persons.map((p) => PERSON_NAME[p]);
        const who = persons[0] === '-' ? '' : `, ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]}`;
        EXAMPLES[id] = {name, description: `${t.description}${who}`};
    }
}

/** Groups a paradigm's forms by tense and form: the persons each form is. */
function cellsByForm(par) {
    const out = [];
    for (const [tense] of TENSES) {
        const cells = par[tense];
        if (cells === undefined) { continue; }
        const persons = new Map();
        for (const [person, forms] of Object.entries(cells)) {
            for (const form of forms) { (persons.get(form) ?? persons.set(form, []).get(form)).push(person); }
        }
        for (const [form, ps] of persons) {
            ps.sort((a, b) => PERSONS.indexOf(a) - PERSONS.indexOf(b));
            out.push({tense, form, persons: ps});
        }
    }
    return out;
}

const regularModels = MODELS.filter((m) => m.regular);
const regularParadigms = regularModels.map((m) => ({m, par: paradigm(m)}));

/** Whether a regular model's endings already read `form` as `inf`. */
function regularReads(form, inf) {
    for (const {m, par} of regularParadigms) {
        const stemLength = m.inf.length - m.keep;
        const infEnding = m.inf.slice(m.keep);
        if (!inf.endsWith(infEnding)) { continue; }
        const stem = inf.slice(0, inf.length - infEnding.length);
        if (stem.length < (m.min ?? 0)) { continue; }
        for (const cells of Object.values(par)) {
            for (const forms of Object.values(cells)) {
                for (const f of forms) {
                    const ending = f.slice(m.keep);
                    if (form === stem + ending) { return true; }
                }
            }
        }
        void stemLength;
    }
    return false;
}

const verbRules = [];  // [transformId, rule], in model order
for (const m of MODELS) {
    const par = paradigm(m);
    const inf = m.inf;
    const deinflected = inf.slice(m.keep);
    for (const {tense, form, persons} of cellsByForm(par)) {
        if (!form.startsWith(inf.slice(0, m.keep))) { throw new Error(`${inf}: ${form} does not start with ${inf.slice(0, m.keep)}`); }
        if (!m.regular && m.firstGroup && !m.keepRegular && regularReads(form, inf)) { continue; }
        const inflected = form.slice(m.keep);
        const t = TENSE.get(tense);
        const set = PERSON_SETS.find((s) => s.join() === persons.join());
        if (set === undefined) { throw new Error(`${inf} ${tense} ${form}: no transform for ${persons.join(',')}`); }
        const out = ['v'];
        const extra = {};
        if (m.stem === 'word') {
            extra.stemMinLength = m.min ?? 1;
            // The regular endings are short, and a lookup meets them at the
            // end of texts of several words (prendre chez, le cherchions):
            // their stem is one word, so that prendre chez is not read as
            // prendre cher, nor le cherchions as le chercher. A reflexive
            // pronoun before them is joined to the verb by the preprocessor
            // joinPronoun (me parle → me+parle → se parler).
            if (m.regular) { extra.stemCharacters = '{notSpace}'; }
        } else if (m.stem === 'alone') {
            extra.stemNotEndsWith = '{letter}';
        }
        // After en, a present participle is the gerund (en revenant, en
        // voulant), not a form of a phrase with en (en revenir, en vouloir).
        if (tense === 'present-participle') { extra.stemNotStartsWithText = 'en '; }
        if (inflected === '' && Object.keys(extra).length === 0) { throw new Error(`${inf}: empty ending without a constraint`); }
        Object.assign(extra, personThen(t.finite, persons));
        if (m.notAfter !== undefined && (m.notAfterPersons === undefined || persons.every((p) => m.notAfterPersons.includes(p)))) {
            extra.stemNotStartsWith = m.notAfter;
        }
        verbRules.push([verbTransformId(tense, set), suffix(inflected, deinflected, t.conditionsIn, out, extra)]);
    }
}

// The stem change of lever, mener, acheter (e → è) and céder, espérer,
// régler, célébrer (é → è) before a silent e: lève, lèvera, cède, célèbre.
// The è nearest the ending (in French spelling, è comes before a consonant
// or the u of gu and qu: lève, allègue, dissèque) becomes e or é
// (the dictionary decides which verb exists); the future of céder is cédera
// (traditional) or cèdera (1990 spelling), and both read céder.
const MUTE = [
    ['present', ['1s', '3s'], 'e'], ['present', ['2s'], 'es'], ['present', ['3p'], 'ent'],
    ['subjunctive', ['1s', '3s'], 'e'], ['subjunctive', ['2s'], 'es'], ['subjunctive', ['3p'], 'ent'],
    ['imperative', ['2s'], 'e'], ['imperative', ['2s'], 'es'],
    ...FUTURE.map((e, i) => ['future', [PERSONS[i]], `er${e}`]),
    ['conditional', ['1s', '2s'], 'erais'], ['conditional', ['3s'], 'erait'], ['conditional', ['1p'], 'erions'],
    ['conditional', ['2p'], 'eriez'], ['conditional', ['3p'], 'eraient'],
];
for (const [tense, persons, ending] of MUTE) {
    const t = TENSE.get(tense);
    const out = ['v'];
    for (const to of ['e', 'é']) {
        verbRules.push([verbTransformId(tense, persons), suffix(ending, 'er', t.conditionsIn, out, {
            stemCharacters: '{notSpace}', stemChange: {from: ['è'], to, occurrence: 'last'}, ...personThen(t.finite, persons),
        })]);
    }
}

// The imperfect subjunctive endings -asse, -asses, -assent, -assions and
// -assiez are also the present, subjunctive and imperfect of the -asser
// verbs, and a longer ending is tried first: ramasse, tracasse and rêvasse
// would read ramer, tracer and rêver before ramasser, tracasser and
// rêvasser. These rules read the -asser verbs at the same length; they come
// first in this file.
for (const [tense, persons, ending] of [
    ['present', ['1s', '3s'], 'e'], ['present', ['2s'], 'es'], ['present', ['3p'], 'ent'],
    ['subjunctive', ['1s', '3s'], 'e'], ['subjunctive', ['2s'], 'es'], ['subjunctive', ['3p'], 'ent'],
    ['imperative', ['2s'], 'e'], ['imperfect', ['1p'], 'ions'], ['imperfect', ['2p'], 'iez'],
    ['subjunctive', ['1p'], 'ions'], ['subjunctive', ['2p'], 'iez']]) {
    const t = TENSE.get(tense);
    const out = ['v'];
    verbRules.unshift([verbTransformId(tense, persons), suffix(`ass${ending}`, 'asser', t.conditionsIn, out, {stemCharacters: '{notSpace}', ...personThen(t.finite, persons)})]);
}

// A plural participle is often also the plural of a noun or adjective (les
// faits, les traits, des écrits, des produits). The plural transform reads
// each such ending too, at the same length, so that the noun comes first:
// a longer ending is tried first, and the plural comes before the verbs.
for (const [tid, rule] of verbRules) {
    if (!tid.startsWith('past-participle-mp') && !tid.startsWith('past-participle-fp')) { continue; }
    if (!rule.inflected.endsWith('s') || rule.inflected.length < 3) { continue; }
    const singular = rule.inflected.slice(0, -1);
    const {stemMinLength, stemNotEndsWith} = rule;
    const extra = {...W};
    if (stemMinLength !== undefined) { extra.stemMinLength = stemMinLength; }
    if (stemNotEndsWith !== undefined) { extra.stemNotEndsWith = stemNotEndsWith; }
    // Not the invariable participles (pris, assis), whose singular ends in s too.
    if (verbRules.some(([t2, r2]) => t2 === 'past-participle' && r2.inflected === rule.inflected && r2.deinflected === rule.deinflected)) { continue; }
    add('plural', suffix(rule.inflected, singular, [], ['n', 'adj'], extra));
}

// Each verb transform's description names a few of its forms, taken from
// these verbs' paradigms.
const EXAMPLE_VERBS = ['parler', 'finir', 'prendre', 'venir', 'faire', 'être', 'avoir', 'aller', 'pouvoir', 'falloir'];
const examplesOf = new Map();
for (const inf of EXAMPLE_VERBS) {
    const m = MODELS.find((x) => x.inf === inf);
    for (const {tense, form, persons} of cellsByForm(paradigm(m))) {
        const set = PERSON_SETS.find((x) => x.join() === persons.join());
        const id = verbTransformId(tense, set);
        const list = examplesOf.get(id) ?? examplesOf.set(id, []).get(id);
        if (list.length < 3) { list.push(`${form} (${inf})`); }
    }
}
// Transforms in tense order, then person-set order; rules in model order.
for (const [tense] of TENSES) {
    for (const persons of PERSON_SETS) {
        const id = verbTransformId(tense, persons);
        const rules = verbRules.filter(([tid]) => tid === id);
        if (rules.length === 0) { continue; }
        const examples = examplesOf.get(id);
        transform(id, EXAMPLES[id].name, `${EXAMPLES[id].description}${examples ? `: ${examples.join(', ')}` : ''}.`);
        for (const [, rule] of rules) { add(id, rule); }
    }
}

// --- Pronominal verbs ---------------------------------------------------------------
// A reflexive pronoun before a verb of its person gives the pronominal verb,
// which dictionaries list with se: je me lève → me*lever → se lever, tu
// t'appelles → s'appeler, je m'en vais → s'en aller. se itself needs no rule
// (se lève → se+lever → se lever). The rule takes an infinitive whose
// pronoun a rule of its person marked (see personThen), so a form of
// another person is never read (il me dit is not se dire), nor an
// infinitive after the pronoun (il va m'appeler is not s'appeler; in
// Tatoeba such readings were wrong more often than right). A form that is
// first and third person (il me parle) or first and second (tu me prends)
// still reads as pronominal: the subject before the pronoun is not in the
// text. Two exceptions, measured on Tatoeba: prendre (tu me prends pour un
// idiot is not se prendre; that reading was wrong 37 times and right 15),
// and suivre (je me suis, je te suis are être and suivre). m'en, t'en, m'y
// and t'y before an infinitive (je vais m'en aller, je vais m'y prendre) do
// give the pronominal verb, except être (m'en être pris is not s'en être):
// those rows take only the scanned text itself (condition raw).
transform('pronominal', 'pronominal',
    'A verb with a reflexive pronoun of its person before it, looked up with se: je me lève → se lever, tu t\'appelles → s\'appeler, je m\'en vais → s\'en aller.');
const INFINITIVE_ENDINGS = [['er', 'er'], ['ir', 'ir'], ['re', 're']];
for (const pronoun of ['me', 'te']) {
    const circumfix = (inflectedPrefix, deinflectedPrefix, extra) => ({type: 'circumfix', prefixes: [[inflectedPrefix, deinflectedPrefix]],
        suffixes: INFINITIVE_ENDINGS, conditionsIn: ['v'], conditionsOut: ['v'], stemCharacters: '{letter}', ...extra});
    add('pronominal', circumfix(`${pronoun}*`, 'se ', {stemNotStartsWith: '[ps]'}));
    add('pronominal', circumfix(`${pronoun}*`, 'se ', {stemStartsWith: '[p]', stemNotStartsWithText: 'pren'}));
    add('pronominal', circumfix(`${pronoun}*`, 'se ', {stemStartsWith: '[s]', stemNotStartsWithText: 'suiv'}));
    add('pronominal', circumfix(`${pronoun[0]}'*`, "s'", {}));
    add('pronominal', circumfix(`${pronoun[0]}'en*`, "s'en ", {}));
    add('pronominal', circumfix(`${pronoun[0]}'y*`, "s'y ", {}));
    for (const [joined, out] of [[`${pronoun[0]}'en+`, "s'en "], [`${pronoun[0]}'y+`, "s'y "]]) {
        add('pronominal', {...circumfix(joined, out, {stemNotStartsWithText: 'êt'}), conditionsIn: ['raw']});
    }
}

// --- Infinitive after an elided pronoun -------------------------------------------
// After m', t' and s' (and j', n', c'), the elision leaves a verb (vcl), which
// the conjugation rules read; an infinitive needs none, and this rule reads
// it as the verb: m'aider → aider, t'appeler → appeler, s'asseoir → asseoir.
transform('infinitive', 'infinitive',
    'An infinitive after an elided pronoun, read as the verb: m\'aider → aider, t\'appeler → appeler, s\'asseoir → asseoir.');
for (const ending of ['er', 'ir', 'ïr', 're']) {
    add('infinitive', suffix(ending, ending, ['vcl'], ['v'], {stemCharacters: '{notSpace}', stemMinLength: 1}));
}

// --- Nouns and adjectives -----------------------------------------------------------
// As the plural, the feminine and adverb rules never reach across a space.
transform('feminine', 'feminine', 'Feminine of an adjective, and its superlative in -issime: grande → grand, première → premier, heureuse → heureux, active → actif, belle → beau, blanche → blanc, richissime → riche.');
const FEMININE = [
    ['e', '', 2], ['ère', 'er'], ['ète', 'et'], ['ette', 'et'], ['elle', 'el'], ['elle', 'eau'], ['eille', 'eil'], ['enne', 'en'], ['onne', 'on'],
    ['anne', 'an'], ['ulle', 'ul'], ['ille', 'il'], ['sse', 's'], ['ve', 'f'], ['ève', 'ef'], ['euse', 'eux'], ['euse', 'eur'], ['ouse', 'oux'],
    ['rice', 'eur'], ['che', 'c'], ['èche', 'ec'], ['que', 'c'], ['cque', 'c'], ['gue', 'g'], ['olle', 'ou'], ['olle', 'ol'],
    ['ieille', 'ieux'], ['aîche', 'ais'], ['aiche', 'ais'], ['orite', 'ori'], ['uë', 'u'], ['üe', 'u'], ['ouce', 'oux'], ['ousse', 'oux'],
    ['ausse', 'aux'], ['esse', 'ès'], ['ouse', 'ou'],
];
for (const [inflected, deinflected, min = 1] of FEMININE) {
    add('feminine', suffix(inflected, deinflected, ['adj'], ['adj'], {...W, stemMinLength: min}));
}
// The superlative in -issime: richissime → riche, grandissime → grand.
for (const [inflected, deinflected] of [['issime', 'e'], ['issime', '']]) {
    add('feminine', suffix(inflected, deinflected, ['adj'], ['adj'], {...W, stemMinLength: 3}));
}
// Written out: an -igne rule would read saigne as sain.
for (const [inflected, deinflected] of [['maligne', 'malin'], ['bénigne', 'bénin']]) {
    add('feminine', whole(inflected, deinflected, ['adj'], ['adj']));
}
transform('feminine-noun', 'feminine noun',
    'Feminine of a noun for a person, by the endings such nouns take: joueuse → joueur, actrice → acteur, pécheresse → pécheur, jardinière → jardinier, musicienne → musicien, citoyenne → citoyen, veuve → veuf.');
// Not -onne, -ante or -ente: donne, chante and présente would read don,
// chant and présent before donner, chanter and présenter, whose present
// they also are, because a longer ending is tried first.
for (const [inflected, deinflected] of [['euse', 'eur'], ['rice', 'eur'], ['eresse', 'eur'], ['ière', 'ier'], ['ienne', 'ien'], ['yenne', 'yen'], ['ve', 'f']]) {
    add('feminine-noun', suffix(inflected, deinflected, ['n'], ['n'], {...W, stemMinLength: 2}));
}
transform('adverb', 'adverb in -ment', 'An adverb in -ment, read as its adjective: vraiment → vrai, lentement → lente, couramment → courant, évidemment → évident, précisément → précise.');
for (const [inflected, deinflected, min] of [['ment', '', 3], ['amment', 'ant', 1], ['emment', 'ent', 1], ['ément', 'e', 2], ['ûment', 'u', 1]]) {
    add('adverb', suffix(inflected, deinflected, [], ['adj'], {...W, stemMinLength: min}));
}
for (const [inflected, deinflected] of [['gentiment', 'gentil'], ['brièvement', 'bref'], ['impunément', 'impuni']]) {
    add('adverb', whole(inflected, deinflected, [], ['adj']));
}

// --- Determiners and pronouns ----------------------------------------------------
// Dictionaries give determiners, pronouns and numerals no part of speech
// (wiktionary-to-yomitan's rules column has only v, n, adj and adv), so the
// plural and feminine rules, which give one, do not reach them. Their forms
// are written out, with no conditions.
transform('determiner', 'determiner form',
    'A form of a determiner, pronoun or numeral: toutes → tout, quelques → quelque, cette → ce, mes → mon, laquelle → lequel, millions → million.');
for (const [lemma, forms] of [
    ['tout', ['toute', 'toutes', 'tous']], ['quelque', ['quelques']], ['aucun', ['aucune', 'aucuns', 'aucunes']], ['quel', ['quelle', 'quels', 'quelles']],
    ['lequel', ['laquelle', 'lesquels', 'lesquelles']], ['auquel', ['auxquels', 'auxquelles']], ['duquel', ['desquels', 'desquelles']],
    ['ce', ['cet', 'cette', 'ces']], ['mon', ['ma', 'mes']], ['ton', ['ta', 'tes']], ['son', ['sa', 'ses']], ['notre', ['nos']], ['votre', ['vos']],
    ['leur', ['leurs']], ['le', ['la', 'les']], ['un', ['une']], ['celui', ['celle', 'ceux', 'celles']], ['nul', ['nulle', 'nuls', 'nulles']],
    ['million', ['millions']], ['milliard', ['milliards']], ['cent', ['cents']], ['vingt', ['vingts']]]) {
    for (const form of forms) { add('determiner', whole(form, lemma, [], [])); }
}

// --- Writing --------------------------------------------------------------------------
// Suffix rules of one transform that share their conditions and constraints
// are written as one circumfix row in the cross-product form (section 7.3)
// with an empty prefix: the same rules, expanded when the pack loads, in
// the same order at each ending, in a file small enough for sources/
// (section 3). A row keeps the place of its first rule.
const CONSTRAINTS = ['stemMinLength', 'stemCharacters', 'stemContains', 'stemStartsWith', 'stemEndsWith', 'stemNotStartsWith',
    'stemNotEndsWith', 'stemStartsWithText', 'stemNotStartsWithText', 'stemChange', 'then'];
function compact(rules) {
    const out = [];
    const rows = new Map();
    for (const rule of rules) {
        if (rule.type !== 'suffix' || rule.inflected === '') { out.push(rule); continue; }
        const shape = {conditionsIn: rule.conditionsIn, conditionsOut: rule.conditionsOut};
        for (const key of CONSTRAINTS) { if (rule[key] !== undefined) { shape[key] = rule[key]; } }
        const key = JSON.stringify(shape);
        let row = rows.get(key);
        if (row === undefined) {
            row = {type: 'circumfix', prefixes: [['', '']], suffixes: [], ...shape};
            rows.set(key, row);
            out.push(row);
        }
        row.suffixes.push([rule.inflected, rule.deinflected]);
    }
    // A row of one rule stays a suffix rule.
    return out.map((rule) => (rule.type === 'circumfix' && rule.prefixes?.[0]?.[0] === '' && rule.suffixes?.length === 1 && rule.inflectedPrefix === undefined
        ? (({prefixes: _p, suffixes: [[inflected, deinflected]], type: _t, conditionsIn, conditionsOut, ...rest}) =>
            ({type: 'suffix', inflected, deinflected, conditionsIn, conditionsOut, ...rest}))(rule)
        : rule));
}
const expandedRules = transforms.reduce((n, t) => n + t.rules.length, 0);
for (const t of transforms) { t.rules = compact(t.rules); }
const out = {schema: 1, conditions, transforms};
const text = formatTransforms(out);
writeFileSync(join(here, 'own.json'), text);
const rows = transforms.reduce((n, t) => n + t.rules.length, 0);
console.log(`fr: ${transforms.length} transforms, ${expandedRules} rules in ${rows} rows in sources/own.json`);
