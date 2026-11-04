#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/sga/sources/own.json: the Old Irish deinflection rules
// written for this pack (docs/languages.md, section 14 step 2), from the
// paradigm tables below. Run from the repository root:
//
//   node languages/sga/sources/build-own.mjs [--out <file>]
//
// The tables follow the standard description of Old Irish (c. 700-900):
// R. Thurneysen, A Grammar of Old Irish (1946); D. Stifter, Sengoídelc: Old
// Irish for Beginners (2006); J. Strachan, Old-Irish Paradigms (4th ed. 1949);
// and Wiktionary's Old Irish declension and conjugation tables. No table or
// text is copied from them: the endings are the regular ones those works
// describe, written out here.
//
// Orthography. Rules read the normalised spelling of editions and of
// Wiktionary: a middle dot after the pretonic part of a verbal complex
// (do·beir, ní·beir, nom·charat), a hyphen after a nasalising n before a
// vowel (in n-ech) and before an emphasising suffix (labrad-sa), length marks
// (á é í ó ú) and the dotted letters ḟ ṡ for lenited f and s. A dictionary
// lists a compound verb under its third singular present without the dot
// (dobeir), a simple verb under its third singular present absolute
// (beirid), and a conjunct form with a leading dot (·beir).

import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// --- Conditions ---------------------------------------------------------------
// v, n and adj are the part-of-speech tags a Yomitan dictionary would put in
// its `rules` column. Each stands for the union of its subconditions, which
// the rules use to order a deinflection's steps:
// - v_dict: a verb's headword form (third singular present: beirid, dobeir).
// - v_conj: a conjunct verbal complex whose particle, infixed pronoun or
//   mutation was removed; the dot still marks where the stressed part starts
//   (·charat, do·cuirethar).
// - v_conj3: the third singular conjunct form an ending rule reached
//   (·cara, do·beir), which the last step turns into the headword.
// - v_conj3u, v_absu: a third singular conjunct or absolute whose stem
//   vowel may still need palatalising (·berat → ·ber → ·beir; berait →
//   berid → beirid); a step of its own does it.
// - nom_pal: a noun or adjective stem with the palatal final consonant of a
//   case form (fir, maicc), which the depalatalisation rules undo.
// - nom_uinf: a stem with u-infection (fiur, purt).
// - n_dict, adj_dict: a noun's or adjective's headword form.
// - spelt: a spelling variant of the text (cend for cenn, macc for mac).
//   It can be any word, so every part of speech accepts it; the condition
//   only keeps the alternations from being applied to each other's output
//   (cenn → cend → cenn …), which multiplied the deinflections of a word
//   with several of them into the hundreds.
// - fw: a function word a whole-word rule reached (a conjugated preposition,
//   ní's Middle Irish nocho, cenae, os é). No rule takes it.
// A text after a removed initial mutation has no conditions: it can be any
// word, and every rule applies to it as to the text as written.
const conditions = {
    v: {name: 'Verb', isDictionaryForm: true, subConditions: ['v_dict', 'v_conj', 'v_conj3', 'spelt']},
    v_dict: {name: 'Verb, third singular present (headword form)', isDictionaryForm: false},
    v_conj: {name: 'Conjunct verbal complex (·beir, do·beir)', isDictionaryForm: false},
    v_conj3: {name: 'Third singular conjunct (·beir, do·beir)', isDictionaryForm: false},
    v_conj3u: {name: 'Third singular conjunct whose stem may still need palatalising (·ber for ·beir)', isDictionaryForm: false},
    v_absu: {name: 'Third singular absolute whose stem may still need palatalising (berid for beirid)', isDictionaryForm: false},
    n: {name: 'Noun', isDictionaryForm: true, subConditions: ['n_dict', 'nom_pal', 'nom_uinf', 'spelt']},
    n_dict: {name: 'Noun, nominative singular (headword form)', isDictionaryForm: false},
    adj: {name: 'Adjective', isDictionaryForm: true, subConditions: ['adj_dict', 'nom_pal', 'nom_uinf', 'spelt']},
    adj_dict: {name: 'Adjective, nominative singular masculine (headword form)', isDictionaryForm: false},
    nom_pal: {name: 'Noun or adjective stem with a palatal final consonant (fir, maicc)', isDictionaryForm: false},
    nom_uinf: {name: 'Noun or adjective stem with u-infection (fiur, purt)', isDictionaryForm: false},
    spelt: {name: 'Spelling variant (any part of speech)', isDictionaryForm: false},
    fw: {name: 'Function word: preposition, article, particle, conjunction, adverb, numeral', isDictionaryForm: true},
};

const NOMINAL = ['n_dict', 'adj_dict'];
const VERB = ['v_dict'];

// --- Character classes (language.json names them; repeated here inline) -------
const VOWEL = 'aeiouáéíóúæǽ';
const VOWEL_CLASS = `[${VOWEL}AEIOUÁÉÍÓÚÆǼ]`;
const LOWER_VOWEL_CLASS = `[${VOWEL}]`;
const CONSONANT = 'bcdfghlmnprstḃċḋḟġṁṅṗṡṫ';
const CONSONANT_CLASS = `[${CONSONANT}]`;
// The stem of an absolute first singular or third plural: a consonant, or the
// í of a hiatus verb (gníu, gníit → gníid; líit → líid).
const HIATUS_OR_CONSONANT = `[${CONSONANT}í]`;
// A stem of letters only: no dot, hyphen, apostrophe or space, so an ending
// rule never reads the words before a space (docs/languages.md 14 step 2) or
// the pretonic part of a verbal complex.
const LETTERS = '[{letter}\\u0300-\\u036F]';
// A dotted stem: letters, the abbreviation signs (ɔ for con) and the middle
// dot, at least one dot.
const DOTTED = '[{letter}{abbreviation}\\u0300-\\u036F\\u00B7]';
const DOT = '[\\u00B7]';

const sfx = (inflected, deinflected, conditionsIn, conditionsOut, extra = {}) =>
    ({type: 'suffix', inflected, deinflected, conditionsIn, conditionsOut, ...extra});
const pfx = (inflected, deinflected, conditionsIn, conditionsOut, extra = {}) =>
    ({type: 'prefix', inflected, deinflected, conditionsIn, conditionsOut, ...extra});
const whole = (inflected, deinflected, conditionsIn, conditionsOut) =>
    ({type: 'wholeWord', inflected, deinflected, conditionsIn, conditionsOut});
const replace = (inflected, deinflected, conditionsIn, conditionsOut, extra = {}) =>
    ({type: 'replace', inflected, deinflected, conditionsIn, conditionsOut, ...extra});

const transforms = [];
const add = (id, name, description, rules, extra = {}) => {
    if (transforms.some((t) => t.id === id)) { throw new Error(`duplicate transform ${id}`); }
    transforms.push({id, name, description, source: 'own', ...extra, rules});
};

// ============================================================================
// 1. Initial mutations
// ============================================================================
// Lenition is written h after c, t and p (ch, th, ph), a dot over f and s (ḟ,
// ṡ: silent f, s pronounced h), and in some texts a dot over the other
// consonants. Nasalisation is written n- before a vowel (in n-ech, also
// without the hyphen in many editions: nech), m before b, n before d and g,
// and doubles l, m, n, r (in llia); before c, t, p, f and s it is not
// written. A vowel after certain words takes a prothetic h (a hÉrinn, hí).
// The rules give the radical form, which can be any kind of word, so their
// output has no conditions (docs/languages.md 14 step 2).

const lenition = [
    ['ch', 'c'], ['th', 't'], ['ph', 'p'],
    ['ḟ', 'f'], ['ṡ', 's'], ['ḃ', 'b'], ['ċ', 'c'], ['ḋ', 'd'], ['ġ', 'g'], ['ṁ', 'm'], ['ṗ', 'p'], ['ṫ', 't'],
];
add('lenition', 'lenition',
    'Lenited initial consonant: ch, th, ph for c, t, p; ḟ, ṡ and the other dotted letters for f, s, b, c, d, g, m, p, t (a chenn → cenn, a ḟer → fer).',
    lenition.map(([from, to]) => pfx(from, to, [], [], {stemStartsWith: '[{letter}]'})));

add('nasalization', 'nasalization',
    'Nasalised initial: n- before a vowel, m before b, n before d and g, a doubled l, m, n or r (in n-ech → ech, a mbó → bó, a ndía → día, a ngein → gein).',
    [
        pfx('n-', '', [], [], {stemStartsWith: VOWEL_CLASS}),
        pfx('n\u2011', '', [], [], {stemStartsWith: VOWEL_CLASS}),
        pfx('mb', 'b', [], [], {stemStartsWith: '[{letter}]'}),
        // Manuscripts and diplomatic editions mark the nasal with a dot over
        // n or m (ṅdé for nDé, ṁbith for mbith).
        pfx('ṅ', '', [], [], {stemStartsWith: '[{letter}]'}),
        pfx('ṁb', 'b', [], [], {stemStartsWith: '[{letter}]'}),
        pfx('nd', 'd', [], [], {stemStartsWith: '[{letter}]'}),
        pfx('ng', 'g', [], [], {stemStartsWith: '[{letter}]'}),
        pfx('ll', 'l', [], [], {stemStartsWith: LOWER_VOWEL_CLASS}),
        pfx('mm', 'm', [], [], {stemStartsWith: LOWER_VOWEL_CLASS}),
        pfx('nn', 'n', [], [], {stemStartsWith: LOWER_VOWEL_CLASS}),
        pfx('rr', 'r', [], [], {stemStartsWith: LOWER_VOWEL_CLASS}),
    ]);

// n written against a vowel without a hyphen (nech for n-ech, nanmae for
// n-anmae): kept apart because a word may itself begin with n and a vowel.
// níth "conflict" (and the river Níth), which the dictionary does not list,
// is no nasalised ith "corn" (9 lookups of the Táin, none ith).
add('nasalizationNoHyphen', 'nasalization',
    'Nasalised initial vowel written with n and no hyphen (nanmae → anmae, nech → ech).',
    [pfx('n', '', [], [], {stemStartsWith: VOWEL_CLASS, stemMinLength: 2, stemNotStartsWithText: 'ith'})]);

add('hProthesis', 'h-prothesis',
    'Prothetic h before a vowel (a hÉrinn → Érinn, hí → í, h-uile → uile).',
    [
        pfx('h-', '', [], [], {stemStartsWith: VOWEL_CLASS}),
        pfx('h', '', [], [], {stemStartsWith: VOWEL_CLASS}),
    ]);

// ============================================================================
// 2. The verbal complex
// ============================================================================
// A verb after a conjunct particle (ní, ro, no, in, co, dia, ...) takes its
// conjunct form, written after a dot (ní·beir). An infixed pronoun stands
// between the particle or the first preverb and the dot (nom·charat "they
// love me", dom·beir "gives me"). After the dot the verb may be lenited or
// nasalised (nom·charat, nod·n-ail); in Middle Irish also after ní (ní·charat). A compound verb in deuterotonic form is
// its preverb, the dot and the conjunct form (do·beir), and its headword is
// written without the dot (dobeir).

// Conjunct particles: removed, leaving the conjunct form with a leading dot.
const particles = [
    // negatives
    'ní', 'ni', 'nícon', 'nicon', 'nícho', 'nád', 'nad', 'ná', 'na', 'nach', 'nach', 'arna', 'arná', 'connach', 'mani', 'maní', 'cani', 'cini', 'cení',
    // verbal particles and conjunctions that take conjunct forms
    'ro', 'ru', 'no', 'nu', 'in', 'co', 'con', 'dia', 'dian', 'ma', 'mad', 'cía', 'cia', 'ce', 'ara', 'ol', 'hi', 'i', 'a',
];
const uniq = (list) => [...new Set(list)];
add('particle', 'conjunct particle',
    'A conjunct particle before the verb removed: negative ní, nícon, nád, ná, arna; perfective ro; no; interrogative in; co, dia, ma, cía, ara (ní·beir → ·beir, ro·gab → ·gab).',
    uniq(particles).map((p) => pfx(`${p}·`, '·', ['v_conj'], ['v_conj'], {stemStartsWith: '[{letter}]'})));

// Infixed pronouns. Class A after a vowel (no, ní, ro, do, fo): 1sg m, 2sg t,
// 3sg masc and neut a (no + a = na, do + a = da), 3sg fem s, 1pl n, 2pl b,
// 3pl s. Class B after ad, as, con, for, fris, imm, in, ar (dom, dot, t, da,
// don, dob). Class C after relative particles and in relative clauses (dom,
// dot, id or d, da, don, dob). The rule removes the pronoun and keeps the
// particle or preverb with its dot.
const infixes = [
    // class A after no, ní, ro, do, fo, ...
    ['nom', 'no'], ['not', 'no'], ['nos', 'no'], ['non', 'no'], ['nob', 'no'], ['na', 'no'], ['nod', 'no'], ['noda', 'no'], ['nonda', 'no'], ['nondob', 'no'], ['nudub', 'no'], ['nundam', 'no'], ['nuda', 'no'],
    ['ním', 'ní'], ['nít', 'ní'], ['nís', 'ní'], ['nín', 'ní'], ['níb', 'ní'], ['nícom', 'nícon'], ['nicom', 'nicon'],
    ['nacham', 'nach'], ['nachat', 'nach'], ['nachid', 'nach'], ['nachib', 'nach'], ['nachan', 'nach'], ['náchib', 'nach'], ['nachid', 'nach'],
    ['rom', 'ro'], ['rot', 'ro'], ['ros', 'ro'], ['ron', 'ro'], ['rob', 'ro'], ['ra', 'ro'], ['rod', 'ro'], ['rond', 'ro'], ['rund', 'ro'], ['ronda', 'ro'], ['runda', 'ro'],
    ['dom', 'do'], ['dum', 'do'], ['dot', 'do'], ['dos', 'do'], ['dus', 'do'], ['don', 'do'], ['dun', 'do'], ['dob', 'do'], ['dub', 'do'], ['da', 'do'], ['dod', 'do'], ['dud', 'do'], ['dund', 'do'], ['dond', 'do'], ['doda', 'do'], ['duda', 'do'], ['dan', 'do'],
    ['fom', 'fo'], ['fot', 'fo'], ['fos', 'fo'], ['fus', 'fo'], ['fa', 'fo'], ['fod', 'fo'], ['fond', 'fo'], ['fund', 'fo'], ['foda', 'fo'], ['fuand', 'fo'],
    ['mam', 'ma'], ['manim', 'mani'], ['manid', 'mani'],
    ['cot', 'con'], ['cota', 'con'], ['conda', 'con'], ['conid', 'con'], ['condid', 'con'], ['condan', 'con'], ['condon', 'con'], ['conim', 'con'],
    ['atom', 'ad'], ['atot', 'ad'], ['atob', 'ad'], ['atat', 'ad'], ['atamm', 'ad'], ['atann', 'ad'], ['adid', 'ad'], ['adind', 'ad'],
    ['asid', 'as'], ['asind', 'as'], ['assid', 'as'],
    ['arid', 'ar'], ['arind', 'ar'], ['arin', 'ar'], ['arus', 'ar'], ['arros', 'ar'], ['arrot', 'ar'], ['aras', 'ar'], ['arda', 'ar'],
    ['immid', 'imm'], ['imma', 'imm'], ['imme', 'imm'],
    ['frit', 'fris'], ['fritum', 'fris'], ['frita', 'fris'], ['frissa', 'fris'],
    ['forid', 'for'], ['fordob', 'for'],
    ['inda', 'in'], ['indam', 'in'],
    ['dia', 'dia'],
];
add('infixedPronoun', 'infixed pronoun',
    'An infixed pronoun removed from the particle or preverb before the dot: nom·charat → no·charat, dom·beir → do·beir, atom·aig → ad·aig, nod·n-ail → no·n-ail.',
    uniq(infixes.filter(([a, b]) => a !== b).map(([a, b]) => `${a}\u0000${b}`)).map((key) => {
        const [a, b] = key.split('\u0000');
        return pfx(`${a}·`, `${b}·`, ['v_conj'], ['v_conj'], {stemStartsWith: '[{letter}]'});
    }));

// Lenition and nasalisation after the dot (nom·charat, ro·chan, nod·n-ail,
// forsa·mmitter): the first dot's following letters made radical.
const afterDot = [
    ['ch', 'c'], ['th', 't'], ['ph', 'p'], ['ḟ', 'f'], ['ṡ', 's'], ['ḃ', 'b'], ['ċ', 'c'], ['ḋ', 'd'], ['ġ', 'g'], ['ṁ', 'm'], ['ṗ', 'p'], ['ṫ', 't'],
];
add('lenitionAfterDot', 'lenition',
    'Lenited initial of the stressed part of a verbal complex (no·charat → no·carat, do·chuirethar → do·cuirethar).',
    afterDot.map(([from, to]) => replace(`·${from}`, `·${to}`, ['v_conj'], ['v_conj'], {occurrence: 'first'})));
add('lenitedFAfterDot', 'lenition',
    'Lenited f, which is silent, not written after the dot (fod·era → fod·fera, ro·itir → ro·fitir).',
    [...'aeiouáéíóú'].map((v) => replace(`·${v}`, `·f${v}`, ['v_conj'], ['v_conj'], {occurrence: 'first'})));
add('nasalizationAfterDot', 'nasalization',
    'Nasalised initial of the stressed part of a verbal complex (nod·n-ail → nod·ail, ara·mberar → ara·berar, forsa·mmitter → forsa·mitter).',
    [
        ['n-', ''], ['n\u2011', ''], ['mb', 'b'], ['nd', 'd'], ['ng', 'g'], ['mm', 'm'], ['ll', 'l'], ['nn', 'n'], ['rr', 'r'], ['ṅ', ''], ['ṁb', 'b'],
    ].map(([from, to]) => replace(`·${from}`, `·${to}`, ['v_conj'], ['v_conj'], {occurrence: 'first'})));

// --- Conjunct endings ---------------------------------------------------------
// The conjunct form of a simple verb after its particle (·carat) or the
// deuterotonic form of a compound (do·berat) becomes the third singular
// conjunct (·cara, do·beir). The stem must contain the dot, so these rules
// never read an absolute form. Classes (Stifter's names): W1 a-stems
// (caraid, ·cara), W2 i-stems (léicid, ·léici), S strong verbs with a
// consonant-final third singular (beirid ·beir, gaibid ·gaib, benaid ·ben,
// dingid ·ding), H hiatus verbs (gníid ·gní), and deponents (labraithir
// ·labrathar, midithir ·midethar, suidigidir ·suidigedar).

const dotted = (extra = {}) => ({stemCharacters: DOTTED, stemContains: DOT, stemMinLength: 2, ...extra});
// A stem change that makes the last vowel before the final consonants
// palatal (ber → beir, gab → gaib), for strong verbs whose third singular
// conjunct is palatal while other persons are not (·berat → ·beir).
const palatalize = (from, to) => ({from: [from], to, occurrence: 'last', between: CONSONANT_CLASS});

// W1: third singular conjunct ends in -a.
const w1Conj = {
    'conj-pres': [['aim', 'a'], ['u', 'a'], ['ai', 'a'], ['am', 'a'], ['aid', 'a'], ['at', 'a']],
    'conj-pass': [['thar', 'a'], ['tar', 'a'], ['atar', 'a']],
    'conj-ipf': [['ainn', 'a'], ['inn', 'a'], ['tha', 'a'], ['ad', 'a'], ['mais', 'a'], ['thae', 'a'], ['the', 'a'], ['tais', 'a'], ['tis', 'a']],
    'conj-pret': [['us', 'a'], ['ais', 'a'], ['sam', 'a'], ['said', 'a'], ['sat', 'a'], ['tha', 'a']],
    'conj-fut': [['fa', 'a'], ['fe', 'a'], ['fam', 'a'], ['faid', 'a'], ['fat', 'a'], ['fathar', 'a'], ['far', 'a']],
    'conj-cond': [['fainn', 'a'], ['fad', 'a'], ['faitis', 'a'], ['fatis', 'a'], ['fimmis', 'a'], ['fide', 'a'], ['fitis', 'a']],
    'conj-subj': [['ae', 'a']],
};
// W2: third singular conjunct ends in -i.
const w2Conj = {
    'conj-pres': [['im', 'i'], ['imm', 'i'], ['iu', 'i'], ['em', 'i'], ['id', 'i'], ['et', 'i']],
    'conj-pass': [['ther', 'i'], ['ter', 'i'], ['etar', 'i']],
    'conj-ipf': [['inn', 'i'], ['thea', 'i'], ['ed', 'i'], ['mis', 'i'], ['the', 'i'], ['tis', 'i']],
    'conj-pret': [['ius', 'i'], ['sius', 'i'], ['is', 'i'], ['sem', 'i'], ['sid', 'i'], ['set', 'i']],
    'conj-fut': [['fiub', 'i'], ['fe', 'i'], ['fea', 'i'], ['fem', 'i'], ['fid', 'i'], ['fet', 'i'], ['fider', 'i'], ['fiter', 'i']],
    'conj-cond': [['finn', 'i'], ['feda', 'i'], ['fed', 'i'], ['fimmis', 'i'], ['fide', 'i'], ['fitis', 'i']],
    'conj-subj': [['e', 'i'], ['ea', 'i']],
};
// S and H: third singular conjunct ends in a consonant or a long vowel;
// the ending is removed (·berat → ·ber, then palatalised: ·beir).
const sConj = {
    'conj-pres': [['u', ''], ['iu', ''], ['im', ''], ['imm', ''], ['am', ''], ['em', ''], ['id', ''], ['aid', ''], ['at', ''], ['et', ''], ['ait', '']],
    'conj-pass': [['ar', ''], ['er', ''], ['tar', ''], ['ter', ''], ['ther', ''], ['thar', '']],
    'conj-ipf': [['inn', ''], ['ainn', ''], ['tha', ''], ['thea', ''], ['ed', ''], ['ad', ''], ['mis', ''], ['mais', ''], ['the', ''], ['thae', ''], ['tis', ''], ['tais', '']],
    'conj-pret': [['us', ''], ['ius', ''], ['sam', ''], ['sem', ''], ['set', ''], ['sat', ''], ['atar', ''], ['etar', ''], ['ammar', ''], ['emmar', '']],
};
// Deponents: third singular conjunct ends in -athar, -ethar, -adar, -edar.
const depConj = [
    // 1sg, 2sg, 1pl, 2pl, 3pl, passive and preterite endings → 3sg
    ['ur', 'athar'], ['iur', 'ethar'], ['iur', 'edar'], ['ur', 'adar'],
    ['ither', 'ethar'], ['ther', 'athar'], ['ider', 'edar'],
    ['ammar', 'athar'], ['emmar', 'ethar'], ['ammar', 'adar'], ['emmar', 'edar'], ['mar', 'athar'], ['mer', 'edar'],
    ['aid', 'athar'], ['id', 'ethar'], ['id', 'edar'],
    ['atar', 'athar'], ['etar', 'ethar'], ['atar', 'adar'], ['etar', 'edar'],
    ['astar', 'athar'], ['estar', 'ethar'], ['astar', 'adar'], ['estar', 'edar'],
    ['satar', 'athar'], ['setar', 'ethar'],
    ['ad', 'athar'], ['ed', 'ethar'], ['ed', 'edar'],
];

const conjNames = {
    'conj-pres': ['present', 'Present indicative, conjunct (·carat → ·cara, do·berat → do·beir, ·léicet → ·léici).'],
    'conj-pass': ['passive', 'Passive, conjunct (·carthar → ·cara, do·berar → do·beir).'],
    'conj-ipf': ['imperfect', 'Imperfect or past subjunctive, conjunct (·caratis → ·cara, no·léiced → ·léici).'],
    'conj-pret': ['preterite', 'Preterite, conjunct (·carsat → ·cara, ro·léicset → ·léici).'],
    'conj-fut': ['future', 'Future, conjunct (·léicfea → ·léici).'],
    'conj-cond': ['conditional', 'Conditional, conjunct (·léicfed → ·léici).'],
    'conj-subj': ['subjunctive', 'Present subjunctive, conjunct (·carae → ·cara, ·léicea → ·léici).'],
};
for (const [id, [name, description]] of Object.entries(conjNames)) {
    const rules = [];
    for (const [inflected, deinflected] of w1Conj[id] ?? []) {
        rules.push(sfx(inflected, deinflected, ['v_conj'], ['v_conj3'], dotted()));
    }
    for (const [inflected, deinflected] of w2Conj[id] ?? []) {
        rules.push(sfx(inflected, deinflected, ['v_conj'], ['v_conj3'], dotted()));
    }
    for (const [inflected, deinflected] of sConj[id] ?? []) {
        // ·benat → ·ben; ·berat → ·ber, which the palatal-stem step makes
        // ·beir. The stem may end in a vowel: the hiatus verbs (·gníat →
        // ·gní, ad·ciam → ad·cí) and W1 and W2 endings these lists have and
        // the W1 and W2 lists do not (ad·cosnaitis → ad·cosnai). The
        // passive keeps a consonant before its ending: after a vowel its
        // endings read deponents and other verbs (in·samlathar is not
        // samlaid, ro·cloither is not cloid).
        rules.push(sfx(inflected, deinflected, ['v_conj'], ['v_conj3', 'v_conj3u'],
            dotted(id === 'conj-pass' ? {stemEndsWith: CONSONANT_CLASS} : {})));
    }
    add(id, name, description, rules);
}
// The first singular conjunct of strong verbs has u-infection (·biur,
// as·biur → as·beir; ·gaibiu → ·gaib).
add('conj-1sg', '1st singular',
    'First singular present, conjunct, of a strong verb (as·biur → as·beir, do·biur → do·beir).',
    [
        sfx('iur', 'eir', ['v_conj'], ['v_conj3'], dotted({stemEndsWith: CONSONANT_CLASS})),
        sfx('iurt', 'ert', ['v_conj'], ['v_conj3'], dotted({stemEndsWith: CONSONANT_CLASS})),
    ]);
add('conj-dep', 'deponent',
    'Deponent verb, conjunct: other persons and tenses to the third singular (·labratar → ·labrathar, ·midiur → ·midethar).',
    depConj.map(([inflected, deinflected]) => sfx(inflected, deinflected, ['v_conj'], ['v_conj3'], dotted())));
// The preterite third singular conjunct of W1 and W2 verbs has no ending
// (·car, ·léic): the class vowel is added back.
add('conj-pret3sg', 'preterite',
    'Third singular preterite, conjunct, without ending (·car → ·cara, ·léic → ·léici).',
    [
        sfx('', 'a', ['v_conj'], ['v_conj3'], dotted({stemEndsWith: CONSONANT_CLASS})),
        sfx('', 'i', ['v_conj'], ['v_conj3'], dotted({stemEndsWith: CONSONANT_CLASS})),
    ]);

// A final lenited g is often written ch (ad·aich for ad·aig), and a strong
// verb's third singular conjunct is sometimes written without its palatal
// stem (as·ber for as·beir).
add('conj-spelling', 'spelling',
    'Spelling of a conjunct third singular: final ch for g (ad·aich → ad·aig).',
    [sfx('ch', 'g', ['v_conj'], ['v_conj3'], dotted())]);
// Compounds of téit "goes" write the third singular -tét, -théit and
// -tǽt (do·tét, dothéit, dothǽt; headword dotét).
add('tet', 'téit',
    'Third singular of a compound of téit written -téit, -tǽt, -táet, -tóet (dotéit, dotǽt, dotáet → dotét).',
    [['téit', 'tét'], ['tǽt', 'tét'], ['táet', 'tét'], ['tóet', 'tét'], ['taet', 'tét'], ['tæt', 'tét']].map(([from, to]) =>
        sfx(from, to, ['v_dict'], VERB, {stemMinLength: 2, stemCharacters: LETTERS})));
// The third singular of a strong verb has a palatal stem where other
// persons do not (·berat, ·beir; ·gabat, ·gaib), and e is raised to i
// before it (·dlegat, ·dlig; ·ebat, ·ib). Texts also write the third
// singular without it (as·ber for as·beir).
add('conj-palatal', 'palatal stem',
    'Third singular conjunct of a strong verb with its palatal stem (·ber → ·beir, ·gab → ·gaib, ·dleg → ·dlig; as·ber → as·beir).',
    [['e', 'ei'], ['a', 'ai'], ['o', 'oi'], ['u', 'ui'], ['e', 'i']].map(([from, to]) =>
        sfx('', '', ['v_conj', 'v_conj3u'], ['v_conj3'], dotted({stemChange: palatalize(from, to)}))));

// Manuscripts and diplomatic editions write a compound verb without the
// dot, and lenition of its stressed part is then inside the word
// (dochuirethar for do·cuirethar, focheird for fo·ceird). The preverbs
// that lenite are listed; the output is the headword.
const lenitingPreverbs = ['do', 'du', 'fo', 'fu', 'ro', 'ru', 'di', 'imm', 'im', 'ar', 'for', 'fris', 'con', 'ad', 'at', 'as', 'in', 'tar'];
add('lenitionInCompound', 'lenition',
    'Lenited stressed part of a compound verb written without the dot (dochuirethar → docuirethar, focheird → foceird, dothǽt → dotǽt).',
    lenitingPreverbs.flatMap((pv) => [['ch', 'c'], ['th', 't'], ['ph', 'p'], ['ḟ', 'f'], ['ṡ', 's']].map(([from, to]) =>
        pfx(`${pv}${from}`, `${pv}${to}`, [], VERB, {stemMinLength: 2, stemCharacters: LETTERS}))));

// --- From the conjunct form to the headword -------------------------------------
// A compound verb's headword is its deuterotonic third singular without the
// dot (do·beir → dobeir, ro·cluinethar → rocluinethar). The preverbs are
// listed, so that a conjunct particle (ní·beir) never reads as one; a
// variant spelling of a preverb gives the spelling headwords use (du·gní →
// dogní, fu·ceird → foceird, ɔ·gní → congní, n-as·beir → asbeir).
const preverbs = [
    ['ad', 'ad'], ['at', 'ad'], ['at', 'at'], ['ar', 'ar'], ['as', 'as'], ['ass', 'as'], ['es', 'as'], ['con', 'con'], ['com', 'com'], ['co', 'con'], ['ɔ', 'con'], ['ↄ', 'con'],
    ['de', 'di'], ['di', 'di'], ['do', 'do'], ['du', 'do'], ['to', 'do'], ['tu', 'do'], ['etar', 'etar'], ['eter', 'eter'], ['etir', 'etir'],
    ['fo', 'fo'], ['fu', 'fo'], ['for', 'for'], ['far', 'for'], ['fur', 'for'], ['fris', 'fris'], ['frith', 'frith'],
    ['íar', 'íar'], ['iar', 'íar'], ['íarmi', 'íarmi'], ['iarmi', 'íarmi'], ['imm', 'imm'], ['im', 'imm'], ['imb', 'imm'], ['in', 'in'], ['ind', 'ind'],
    ['ocu', 'ocu'], ['remi', 'remi'], ['ro', 'ro'], ['ru', 'ro'], ['sech', 'sech'], ['sechmo', 'sechmo'], ['tar', 'tar'], ['tarmi', 'tarmi'], ['tremi', 'tremi'], ['tri', 'tri'], ['tris', 'tris'],
    ['n-as', 'as'], ['n-ad', 'ad'], ['ndu', 'do'], ['ndo', 'do'],
];
add('deuterotonic', 'compound verb',
    'Compound verb in deuterotonic form: the headword is written without the dot (do·beir → dobeir, du·gní → dogní).',
    preverbs.map(([written, head]) => pfx(`${written}·`, head, ['v_conj', 'v_conj3'], VERB, {stemStartsWith: '[{letter}]'})));
// A simple verb's headword is its third singular absolute: ·cara → caraid,
// ·léici → léicid, ·beir → beirid, ·ben → benaid, ·gní → gníid, and for
// deponents ·labrathar → labraithir, ·midethar → midithir. A strong verb's
// third singular conjunct may be written without the palatal stem the
// absolute has (·gab, preterite, → gaibid).
const simpleHead = [
    ['a', 'aid'], ['i', 'id'],
    ['athar', 'aithir'], ['ethar', 'ithir'], ['adar', 'aidir'], ['edar', 'idir'],
];
const head = (s, d, extra = {}) => ({type: 'circumfix', inflectedPrefix: '·', deinflectedPrefix: '', inflectedSuffix: s, deinflectedSuffix: d,
    conditionsIn: ['v_conj', 'v_conj3'], conditionsOut: VERB, stemCharacters: LETTERS, ...extra});
add('absolute', 'absolute',
    'Simple verb: the third singular conjunct to the absolute form, its headword (·cara → caraid, ·léici → léicid, ·beir → beirid, ·ben → benaid, ·gní → gníid).',
    [
        ...simpleHead.map(([s, d]) => head(s, d, {stemMinLength: 1})),
        head('', 'id', {stemMinLength: 2}),
        head('', 'aid', {stemMinLength: 2, stemEndsWith: CONSONANT_CLASS}),
    ]);

// --- Absolute endings ---------------------------------------------------------
// A simple verb without a particle takes absolute endings; each is turned
// into the third singular absolute, the headword. W1 verbs end in -aid,
// W2 and S verbs in -id; strong verbs whose stem vowel alternates (biru,
// berait, beirid) are palatalised back.
const plain = (extra = {}) => ({stemCharacters: LETTERS, stemMinLength: 2, ...extra});
const absolute = {
    // The stem of a weak or strong verb ends in a consonant before the
    // ending (car-aim, léic-iu, bir-u), that of a hiatus verb in í (gní-u);
    // `druim` "ridge" is not dru- + -im.
    'pres-1sg': ['1st singular present', 'First singular present indicative or subjunctive (caraim → caraid, léiciu → léicid, biru → beirid).',
        [['aim', 'aid'], ['aimm', 'aid'], ['u', 'aid'], ['im', 'id'], ['imm', 'id'], ['iu', 'id'], ['u', 'id']], {stemEndsWith: HIATUS_OR_CONSONANT}],
    'pres-2sg': ['2nd singular present', 'Second singular present indicative (carai → caraid, biri → beirid).',
        [['ai', 'aid'], ['i', 'id']], {stemMinLength: 3, stemEndsWith: CONSONANT_CLASS}],
    'pres-1pl': ['1st plural present', 'First plural present indicative (carmai → caraid, léicmi → léicid, bermai → beirid).',
        [['mai', 'aid'], ['mmai', 'aid'], ['ammai', 'aid'], ['mi', 'id'], ['mmi', 'id'], ['mai', 'id']]],
    'pres-2pl': ['2nd plural present', 'Second plural present indicative (carthae → caraid, léicthe → léicid, beirthe → beirid).',
        [['thae', 'aid'], ['the', 'id']]],
    // As in the first singular, the stem ends in a consonant or the í of a
    // hiatus verb: `dóit` (plural of doe "upper arm") and `táit` are no verbs
    // in -id.
    'pres-3pl': ['3rd plural present', 'Third plural present indicative or subjunctive (carait → caraid, léicit → léicid, berait → beirid).',
        [['ait', 'aid'], ['it', 'id'], ['ait', 'id']], {stemEndsWith: HIATUS_OR_CONSONANT}],
    'rel-3sg': ['relative', 'Third singular relative (caras → caraid, léices → léicid, beres → beirid, gnís → gníid).',
        [['as', 'aid'], ['es', 'id'], ['s', 'id']]],
    'rel-pl': ['relative', 'First and third plural relative (carmae, cartae → caraid; léicme, léicte → léicid).',
        [['mae', 'aid'], ['tae', 'aid'], ['me', 'id'], ['te', 'id']]],
    'pass-pres': ['passive', 'Passive present (carthair, carthar, cartair → caraid; léicthir, léictir → léicid; berair → beirid).',
        [['thair', 'aid'], ['thar', 'aid'], ['tair', 'aid'], ['tar', 'aid'], ['thir', 'id'], ['ther', 'id'], ['tir', 'id'], ['ter', 'id'], ['air', 'aid'], ['air', 'id']]],
    'pret-abs': ['preterite', 'Preterite, absolute (carais, carsait → caraid; léicis, léicsit → léicid).',
        [['ais', 'aid'], ['sai', 'aid'], ['su', 'aid'], ['saimmi', 'aid'], ['saithe', 'aid'], ['sait', 'aid'],
            ['is', 'id'], ['si', 'id'], ['siu', 'id'], ['simmi', 'id'], ['sithe', 'id'], ['sit', 'id']]],
    'pret-pass': ['passive preterite', 'Passive preterite, absolute (carthae → caraid, léicthe → léicid).',
        [['thae', 'aid'], ['thai', 'aid'], ['the', 'id'], ['thi', 'id']]],
    'fut-abs': ['future', 'f-future, absolute (línfaid → línaid, léicfid, léicfit → léicid).',
        [['fa', 'aid'], ['fae', 'aid'], ['faid', 'aid'], ['fammai', 'aid'], ['faithe', 'aid'], ['fait', 'aid'], ['fas', 'aid'],
            ['fea', 'id'], ['fe', 'id'], ['fid', 'id'], ['fimmi', 'id'], ['fide', 'id'], ['fit', 'id'], ['fes', 'id'], ['fidir', 'id'], ['fitir', 'id']]],
    'imperative': ['imperative', 'Imperative third singular, first and third plural (carad, caram, carat → caraid; léiced, léicem, léicet → léicid).',
        [['ad', 'aid'], ['am', 'aid'], ['at', 'aid'], ['ed', 'id'], ['em', 'id'], ['et', 'id']]],
    'suffixed-pronoun': ['suffixed pronoun', 'Third singular with a suffixed pronoun "it, him" (beirthi → beirid, gaibthi → gaibid, bentai → benaid).',
        [['thi', 'id'], ['tai', 'aid']]],
    'deponent': ['deponent', 'Deponent verb, absolute (labrur, labratair, labrathar → labraithir; midiur, miditir, midethar → midithir; suidigiur → suidigidir).',
        [['ur', 'aithir'], ['iur', 'ithir'], ['iur', 'idir'], ['ither', 'aithir'], ['ammair', 'aithir'], ['immir', 'ithir'], ['mir', 'idir'],
            ['atair', 'aithir'], ['itir', 'ithir'], ['itir', 'idir'], ['athar', 'aithir'], ['ethar', 'ithir'], ['edar', 'idir'], ['adar', 'aidir']]],
};
for (const [id, [name, description, list, extra = {}]] of Object.entries(absolute)) {
    const rules = [];
    for (const [inflected, deinflected] of list) {
        // biru, berait, beres → berid, which the palatal-stem step makes
        // beirid.
        rules.push(sfx(inflected, deinflected, [], deinflected === 'id' ? ['v_dict', 'v_absu'] : VERB, plain(extra)));
        if (id === 'fut-abs' && deinflected === 'aid') {
            // mairbfid → marbaid: the W1 f-future has a palatal stem.
            rules.push(sfx(inflected.replace(/^fa/, 'f'), deinflected, [], VERB, plain({stemChange: {from: ['ai'], to: 'a', occurrence: 'last', between: CONSONANT_CLASS}})));
        }
    }
    add(id, name, description, rules);
}

// Strong verbs palatalise the stem in the third singular absolute (biru,
// berait, beres; beirid), and e is raised to i before it (dlegait, dligid).
add('abs-palatal', 'palatal stem',
    'Third singular absolute of a strong verb with its palatal stem (berid → beirid, gabid → gaibid, dlegid → dligid).',
    [['e', 'ei'], ['i', 'ei'], ['a', 'ai'], ['e', 'i']].map(([from, to]) =>
        sfx('id', 'id', ['v_absu'], VERB, plain({stemChange: palatalize(from, to)}))));

// --- The copula and the substantive verb --------------------------------------
// Irregular forms, written out (is "is", attá "is, exists").
const copula = [
    // present
    'am', 'at', 'it', 'ammi', 'adib', 'as', 'ata', 'iss',
    // negative and dependent forms
    'nít', 'nítat', 'nidat', 'nídat', 'níta', 'nípu', 'nípo', 'níbu', 'níbo', 'níba', 'nípa', 'níptar', 'níbtar', 'nibtar', 'níbad', 'nípad', 'níbat', 'nípat',
    // subjunctive, past subjunctive, preterite, future
    'ba', 'bá', 'bat', 'bad', 'bed', 'bid', 'bith', 'bit', 'bes', 'bas', 'bus', 'betis', 'batar', 'robo', 'ropo', 'robu', 'ropu', 'rop', 'rob', 'robtar', 'roptar', 'ropad', 'robad',
];
add('copula', 'copula',
    'A form of the copula is (am, it, níptar, bid, ropo → is).',
    uniq(copula).map((w) => whole(w, 'is', [], VERB)));
const substantive = [
    'atá', 'atáa', 'ataat', 'atáat', 'ataam', 'atam', 'ataí', 'atai',
    'tá', '·tá', 'táa', '·táa', 'taat', '·taat', 'atáa', 'tó', '·tó', 'taam', '·taam', 'taíd', '·taíd',
    'fil', '·fil', 'file', 'filet', '·filet', 'filus', 'filis',
    'bíu', 'bíuu', 'biuu', 'bí', 'bíid', 'biid', 'bíit', 'bíd', 'bíth', 'bíthir', 'bís', 'bimmi', 'bímmi',
    'boí', 'boi', '·boí', 'bói', 'bái', 'bátar', '·bátar', 'batar', 'bammar', 'bámmar', 'robátar', 'roboí', 'robói',
    'bia', 'bieid', 'bias', 'bieit', 'bethir', '·bia', '·biat', 'bïat',
    'beith', 'beit', 'beid', 'bed', 'beth', 'betis', '·beth', '·betis', '·bet', 'roib', '·roib', 'robae', '·robae',
];
add('substantive', 'substantive verb',
    'A form of the substantive verb attá (·tá, fil, filet, bíid, boí, bia, ·roib → attá).',
    uniq(substantive).map((w) => whole(w, 'attá', ['v_conj'], VERB)));

// ============================================================================
// 3. Nouns and adjectives
// ============================================================================
// Case endings of the o-, a-, io-, ia-, i- and u-stems and the consonant
// stems. Many case forms differ from the nominative only by a palatal final
// consonant (gen. sg. fir, nom. pl. fir of fer; dat. sg. mainn of mann) or by
// u-infection (dat. sg. fiur of fer, purt of port); those stems are undone
// in a second step.
const nom = (extra = {}) => ({stemCharacters: LETTERS, stemMinLength: 2, ...extra});
const endings = {
    'dat-pl': ['dative plural', 'Dative plural or dual (feraib → fer, súilib → súil, airib → aire, bélraib → bélrae).',
        [['aib', ''], ['ib', ''], ['ib', 'e'], ['aib', 'ae'], ['aibh', '']], {stemMinLength: 3, stemEndsWith: CONSONANT_CLASS}],
    'nom-pl': ['plural', 'Nominative or accusative plural (falla → fall, branu → bran, cailli → caille, súili → súil, rechtae → recht).',
        [['a', ''], ['u', ''], ['i', 'e'], ['i', ''], ['ai', 'ae'], ['ae', ''], ['e', ''], ['a', 'ae']], {stemMinLength: 3, stemEndsWith: CONSONANT_CLASS}],
    'gen-sg': ['genitive', 'Genitive singular (rechto, rechta → recht; fechtae → fecht; imdai → imdae; tíre → tír).',
        [['o', ''], ['a', ''], ['ae', ''], ['e', ''], ['ai', 'ae'], ['i', 'e']], {stemMinLength: 3, stemEndsWith: CONSONANT_CLASS}],
    'dat-sg-io': ['dative', 'Dative singular of io- and ia-stems (cailliu → caille, éscu → éscae, airdiu → airde).',
        [['iu', 'e'], ['u', 'ae'], ['iu', 'ae']], {stemMinLength: 3, stemEndsWith: CONSONANT_CLASS}],
    'n-stem': ['n-stem', 'Oblique cases of n-stems (déicsin, déicsen → déicsiu; toimten → toimtiu; léimmen → léimm; luamain, luamon → luam).',
        [['in', 'iu'], ['en', 'iu']], {stemMinLength: 3, stemEndsWith: CONSONANT_CLASS}],
    'mn-stem': ['n-stem', 'Oblique cases of the neuter n-stems in -m (léimmen, léimmenaib, léimmim → léimm; neimim → neim; luamain, luamon, luamnaib → luam).',
        [['men', 'm'], ['mim', 'm'], ['menaib', 'm'], ['main', 'm'], ['mon', 'm'], ['mna', 'm'], ['mnaib', 'm'], ['mann', 'm'], ['manaib', 'm'], ['me', 'm']], {stemMinLength: 3}],
    'aid-stem': ['i-stem', 'Oblique cases of the i-stems in -aid (sercada, sercado, sercadaib → sercaid; búada → búaid).',
        [['ada', 'aid'], ['ado', 'aid'], ['adaib', 'aid'], ['adi', 'aid']], {stemMinLength: 2}],
    'dental-stem': ['dental stem', 'Oblique cases of the abstract nouns in -tu (slántad, slántaid → slántu; treodatad → treodatu).',
        [['taid', 'tu'], ['tad', 'tu'], ['taith', 'tu']], {stemMinLength: 3}],
    'r-stem': ['r-stem', 'Genitive of the r-stems athair, máthair, bráthair (athar → athair, máthar → máthair).',
        [['thar', 'thair'], ['thraib', 'thair'], ['thrib', 'thair']], {stemMinLength: 1}],
    'guttural-stem': ['guttural stem', 'Oblique cases of the k-stems cathair and nathair (cathrach, cathraig → cathair).',
        [['rach', 'air'], ['raig', 'air'], ['rchaib', 'air'], ['rachaib', 'air']], {stemMinLength: 3, stemEndsWith: '[h]'}],
};
// gilla "lad" is no plural or genitive: the dictionary has no entry for it,
// and gill (a form of gell "pledge") would come first.
const notPlural = {a: 'gill'};
for (const [id, [name, description, list, extra = {}]] of Object.entries(endings)) {
    add(id, name, description, list.flatMap(([inflected, deinflected]) => {
        const exclusion = (id === 'nom-pl' || id === 'gen-sg') && deinflected === '' && notPlural[inflected] !== undefined
            ? {stemNotStartsWithText: notPlural[inflected]} : {};
        const rules = [sfx(inflected, deinflected, [], NOMINAL, nom({...extra, ...exclusion}))];
        // After an ending that starts with e or i the stem may still be
        // palatal (túaithe → túaith → túath); the second step undoes it.
        // Before a, o or u a consonant is not palatal, and e is raised to i
        // only before u (firu, which acc-pl-raised reads), so `gilla` is
        // not gell + -a.
        if (deinflected === '' && /^[ei]/u.test(inflected) && inflected !== 'ib') {
            rules.push(sfx(inflected, '', [], ['nom_pal'], nom({...extra, ...exclusion})));
        }
        return rules;
    }));
}

// Syncope: a noun of two syllables loses the vowel of its second syllable
// before an ending (bríathar, bríathraib; samail, samlae; lánamain,
// lánamnae; féchem, féchemna). The vowel is put back before the last
// consonant.
const syncopeEndings = ['aib', 'ib', 'a', 'ae', 'ai', 'e', 'i', 'u', 'o'];
add('syncope', 'syncope',
    'Case form of a noun whose second syllable lost its vowel before the ending (bríathraib, bríathra → bríathar; samlae → samail; lánamnae → lánamain; féchemna → féchem).',
    ['r', 'l', 'n', 'm'].flatMap((c) => ['a', 'ai', 'e'].flatMap((v) => syncopeEndings.map((e) =>
        sfx(`${c}${e}`, `${v}${c}`, [], NOMINAL, nom({stemMinLength: 3}))))));

// Palatal final consonants undone: the i written before them is removed, and
// e raised to i is lowered again (fir → fer, cinn → cenn, maicc → macc, baill
// → ball, sáil → sál, puirt → port, eich → ech, slóig → slóg), and the
// unstressed -aig, -ig of -ach, -ech stems (brataig → bratach).
const depal = [
    ['ai', 'a'], ['ei', 'e'], ['oi', 'o'], ['ui', 'u'], ['ui', 'o'], ['ái', 'á'], ['éi', 'é'], ['ói', 'ó'], ['úi', 'ú'], ['uai', 'ua'], ['úai', 'úa'], ['éoi', 'éo'], ['éi', 'ía'], ['iu', 'éo'],
];
const raised = 'bcdfglmnprst'.split('').map((c) => [`${c}i`, `${c}e`]);
add('depalatalization', 'palatal stem',
    'Case form with a palatal final consonant: genitive singular and nominative plural of o-stems, dative and accusative singular of a-stems (fir → fer, maicc → macc, mainn → mann, puirt → port, brataig → bratach).',
    [
        // The stem change's `between` makes the stem end in a consonant.
        ...[...depal, ...raised].map(([from, to]) => sfx('', '', ['nom_pal'], NOMINAL,
            {stemCharacters: LETTERS, stemMinLength: 2, stemChange: {from: [from], to, occurrence: 'last', between: CONSONANT_CLASS}})),
        sfx('aig', 'ach', ['nom_pal'], NOMINAL, nom()),
        sfx('ig', 'ech', ['nom_pal'], NOMINAL, nom()),
    ]);

// u-infection undone (dative singular and accusative plural of o-stems,
// some adjectives): fiur → fer, fiull → fell, purt → port, sun → son, maull
// → mall.
add('uInfection', 'u-infection',
    'Case form with u-infection: dative singular of o-stems (fiur → fer, purt → port, maull → mall).',
    [['iu', 'e'], ['u', 'o'], ['au', 'a'], ['eu', 'e']].map(([from, to]) => sfx('', '', [], NOMINAL,
        {stemCharacters: LETTERS, stemMinLength: 4, stemChange: {from: [from], to, occurrence: 'last', between: CONSONANT_CLASS}})));

// The accusative plural -u raises e to i (firu → fer).
add('acc-pl-raised', 'accusative plural',
    'Accusative plural of o-stems with raised e (firu → fer, cinnu → cenn).',
    raised.map(([from, to]) => sfx('u', '', [], NOMINAL,
        {stemCharacters: LETTERS, stemChange: {from: [from], to, occurrence: 'last', between: CONSONANT_CLASS}})));

// Comparison of adjectives: comparative -iu, -u; superlative -em, -am;
// equative -ithir, -idir; with the stem made palatal (siniu, sinem → sen;
// mailliu → mall).
// The comparative ending follows the adjective's final consonant: `síu`
// "before" is not sí + -u.
add('comparative', 'comparative',
    'Comparative of an adjective (bindiu → bind, ardu → ard, siniu → sen, mailliu → mall).',
    [
        sfx('iu', '', [], ['adj_dict'], nom({stemEndsWith: CONSONANT_CLASS})),
        sfx('u', '', [], ['adj_dict'], nom({stemEndsWith: CONSONANT_CLASS})),
        sfx('iu', '', [], ['nom_pal'], nom({stemEndsWith: CONSONANT_CLASS})),
    ]);
// Superlatives in -am (ardam) are left out: -am is also the first plural of
// conjunct and imperative verbs (·cerdam, beram), which a real text has far
// more often.
add('superlative', 'superlative',
    'Superlative of an adjective (sinem → sen, maillem → mall, láinem → lán).',
    [
        sfx('em', '', [], ['adj_dict'], nom({stemMinLength: 3, stemEndsWith: CONSONANT_CLASS})),
        sfx('em', '', [], ['nom_pal'], nom({stemMinLength: 3, stemEndsWith: CONSONANT_CLASS})),
    ]);
add('equative', 'equative',
    'Equative of an adjective (ardithir → ard, lethidir → lethan).',
    [
        sfx('ithir', '', [], ['adj_dict'], nom()),
        sfx('idir', '', [], ['adj_dict'], nom()),
        sfx('ithir', '', [], ['nom_pal'], nom()),
        sfx('idir', '', [], ['nom_pal'], nom()),
    ]);

// Irregular nouns, written out: the forms of the most frequent nouns whose
// stems change in ways no ending rule reaches (día "God", ben "woman", bó
// "cow", duine "person", cú "hound", rí "king", tech "house", lá "day").
const irregularNouns = {
    'día': ['dé', 'dáe', 'dǽ', 'dee', 'déib', 'déi', 'dia', 'deo', 'dee'],
    'ben': ['mná', 'mnaí', 'mnai', 'ban', 'mnáib', 'mnaib', 'bein', 'mnaa'],
    // Not bai: unmarked, the Táin's bái "was" (attá) is far more frequent.
    'bó': ['bóu', 'bou', 'baí', 'bú', 'buaib', 'boin', 'bóib', 'báo'],
    'duine': ['dóini', 'doíni', 'dóine', 'doíne', 'dóinib', 'doínib', 'duini', 'dóenib', 'dune'],
    'cú': ['coin', 'conaib', 'cona', 'conu'],
    'rí': ['ríg', 'ríga', 'rígu', 'rígaib', 'rig', 'riga'],
    'tech': ['taige', 'tige', 'tig', 'taig', 'tigi', 'tigib', 'tegdais'],
    'lá': ['laa', 'láa', 'lae', 'laithe', 'láithe', 'láib', 'laib', 'laithib'],
    'cara': ['carat', 'carait', 'cairde', 'cairdea', 'cairdib', 'carit'],
    'fili': ['filed', 'filid', 'fileda', 'filedaib', 'filedo'],
    'tene': ['tened', 'teneid', 'tenid'],
    // mag "plain" (an s-stem): the genitive maige, which the dictionary
    // keys as the adjective maige, and the later spelling maigi.
    'mag': ['maigi'],
    // dead "end": the dative díaid of i ndíaid "after".
    'dead': ['díaid', 'diaid'],
    // The Táin's plural of líaig "physician" (7 lookups); the dictionary lists legi.
    'líaig': ['leigi'],
    // The cases of caur "hero" (curaid, curad, curadaib), not the verb cúraid.
    'caur': ['curaid', 'curad', 'curadaib', 'curadu'],
};
add('irregularNoun', 'irregular noun',
    'A case form of an irregular noun (Dé → día, mná → ben, bóu → bó, dóini → duine, coin → cú, ríg → rí, taige → tech, laithe → lá).',
    Object.entries(irregularNouns).flatMap(([lemma, forms]) => uniq(forms).map((f) => whole(f, lemma, [], ['n_dict']))));

// Words a text writes together that a dictionary lists apart.
add('fused', 'spelling',
    'Words written together that dictionaries list apart (intan → in tan).',
    [whole('intan', 'in tan', [], ['fw'])]);

// Conjugated prepositions (Thurneysen §§ 432-439): a preposition with a
// suffixed personal pronoun, read as the preposition. The dictionary keys
// many of these as form-of rows, without length marks; texts write them
// with marks (úaim), and some forms it lacks (leis, frim, remi). A
// preposition with the possessive (triana "through his") is read the same
// way. Each form maps to the dictionary's headword of the preposition.
const prepositions = {
    'a': ['ass', 'asum', 'essiut', 'essi', 'essib', 'esib', 'eissib'],
    'ar': ['airium', 'airiut', 'airi', 'airthi', 'airiunn', 'airib', 'airriu', 'erum', 'erut', 'erunn', 'erib', 'erru'],
    'co': ['cucum', 'cucut', 'cuci', 'cucai', 'cucunn', 'cucuib', 'cucu'],
    'di': ['dím', 'dít', 'dín', 'dínn', 'díb', 'díib'],
    'do': ['dom', 'dam', 'duit', 'dait', 'dún', 'dúib', 'duib', 'dóib', 'doib'],
    'eter': ['etrom', 'etrum', 'etrut', 'etrunn', 'etruib', 'etarru'],
    'fo': ['foum', 'fout', 'founn', 'foib'],
    'for': ['form', 'fort', 'fair', 'foir', 'forrae', 'fornn', 'fuirib', 'forib', 'forru'],
    'fri': ['frim', 'frimm', 'frium', 'frit', 'fritt', 'friut', 'fris', 'friss', 'frie', 'frinn', 'frib', 'friu'],
    'imb': ['immum', 'immut', 'immunn', 'immib', 'impe', 'impu'],
    'la': ['lim', 'limm', 'lium', 'lat', 'latt', 'leis', 'leiss', 'lee', 'linn', 'lib', 'leo', 'leu', 'lasa'],
    'ó': ['úaim', 'úaimm', 'úait', 'úad', 'úadi', 'úaidi', 'úainn', 'úain', 'úaib', 'úadaib', 'úadib', 'uaim', 'uait', 'uad', 'uainn', 'uain', 'uaib', 'uadib'],
    'oc': ['ocum', 'ocut', 'ocunn', 'occaib', 'occo'],
    'ré': ['rium', 'riut', 'remi', 'rempe', 'riunn', 'remib'],
    'tar': ['torum', 'torut', 'tairis', 'tairsi', 'torunn', 'toraib', 'tarru'],
    'tri': ['trium', 'triut', 'triit', 'tree', 'triunn', 'triib', 'treu', 'treo', 'tria', 'triana'],
    'úas': ['úasum', 'úasut', 'úaisi', 'úasunn', 'úasaib'],
    'cen': ['cenum', 'cenut', 'cenunn', 'cenuib'],
};
add('prepositionalPronoun', 'conjugated preposition',
    'A preposition with a suffixed pronoun or the possessive, read as the preposition (frim "to me" → fri, leis "with him" → la, úaim "from me" → ó, triana "through his" → tri).',
    Object.entries(prepositions).flatMap(([head, forms]) => uniq(forms).map((f) => whole(f, head, [], ['fw']))));

// Other function words in the spellings the texts have and the
// dictionary does not key.
add('functionWord', 'function word',
    'A function word in a spelling the dictionary does not list: Middle Irish nocho for nícon "not", cena for cenae "besides", os é "and he", dond "to the", naib for the article, mesi, misi and mise for messe "I", nír for ní with ro, nói for noí "nine", nái for n-aí "of them" (cach nái "each one") or noí.',
    [
        whole('nocho', 'nícon', [], ['fw']), whole('nochon', 'nícon', [], ['fw']),
        whole('cena', 'cene', [], ['fw']),
        whole('ossé', 'os', [], ['fw']), whole('osse', 'os', [], ['fw']), whole('ossí', 'os', [], ['fw']),
        whole('dond', 'in', [], ['fw']), whole('naib', 'in', [], ['fw']),
        whole('mesi', 'messe', [], ['fw']), whole('messi', 'messe', [], ['fw']),
        whole('misi', 'messe', [], ['fw']), whole('mise', 'messe', [], ['fw']),
        whole('nír', 'ní', [], ['fw']),
        // The Táin writes nine nōi (6 of 6) and the pronoun n-aí nāi (7 of
        // its 12 nāi; the other 5 are nine).
        whole('nói', 'noí', [], ['fw']), whole('nái', 'aí', [], ['fw']), whole('nái', 'noí', [], ['fw']),
    ]);

// The verbal noun and the passive of do·gní "does", which the dictionary does
// not list (do dēnam "to do" read as denaid "sucks", 10 lookups of the Táin).
add('irregularVerb', 'irregular verb',
    'A form of do·gní "does" the dictionary does not list: the verbal noun dénum, dénam and the passive déntar, dénaiter (dénam → dogní).',
    ['dénum', 'dénam', 'dénom', 'déntar', 'dénaiter'].map((w) => whole(w, 'dogní', [], ['v_dict'])));

// A noun written without the length mark of its headword.
add('unmarkedLength', 'spelling',
    'A noun written without the length mark of its headword (liaig → líaig "physician").',
    [whole('liaig', 'líaig', [], ['n_dict'])]);

// ============================================================================
// 4. Emphasising suffixes
// ============================================================================
// The notae augentes (-sa, -se 1sg; -su, -so, -siu 2sg; -som, -sem 3sg masc
// and 3pl; -si 3sg fem and 2pl; -ni 1pl) follow a verb, a conjugated
// preposition or a noun with a possessive. With a hyphen (labrad-sa) the
// word before it is a word of its own; the rule lets the whole word match.
const emphatic = ['sa', 'se', 'su', 'so', 'siu', 'sium', 'som', 'sem', 'si', 'ni', 'sni', 'side', 'sidi', 'sin', 'siu'];
add('emphatic', 'emphasising suffix',
    'An emphasising suffix after a hyphen (labrad-sa → labrad, tuit-som → tuit, aní-siu → aní).',
    uniq(emphatic).flatMap((s) => [
        sfx(`-${s}`, '', [], [], {stemMinLength: 1, stemCharacters: DOTTED}),
        sfx(`\u2011${s}`, '', [], [], {stemMinLength: 1, stemCharacters: DOTTED}),
    ]));

// ============================================================================
// 5. Spelling alternations
// ============================================================================
// Old Irish spelling varies between manuscripts and editions, and a
// dictionary lists one spelling. nd and nn, mb and mm stand for the same
// sound (cend, cenn; imb, imm); a final c or t may be written single or
// doubled (mac, macc; brat, bratt); an unstressed final -d is often written
// -th (caraith for caraid); final unstressed -ae and -e interchange
// (dorche, dorchae). Each alternation is applied once, at the end of a
// deinflection (the condition spelt).
const SPELT = ['spelt'];
// A spelling variant of the text as written, or of the headword form an
// inflection rule reached (cendaib → cend → cenn).
const BEFORE_SPELT = ['n_dict', 'adj_dict', 'v_dict'];
add('spelling', 'spelling',
    'Spelling variant: nd for nn, mm for mb (and back), a single or doubled final c or t, -th for unstressed final -d, -e for -ae (cend → cenn, imb → imm, mac → macc, caraith → caraid, dorche → dorchae).',
    [
        replace('nd', 'nn', BEFORE_SPELT, SPELT, {occurrence: 'all', notAtStart: true}),
        replace('nn', 'nd', BEFORE_SPELT, SPELT, {occurrence: 'all', notAtStart: true}),
        replace('mb', 'mm', BEFORE_SPELT, SPELT, {occurrence: 'all', notAtStart: true}),
        replace('mm', 'mb', BEFORE_SPELT, SPELT, {occurrence: 'all', notAtStart: true}),
        sfx('c', 'cc', BEFORE_SPELT, SPELT, {stemMinLength: 2, stemCharacters: LETTERS, stemNotEndsWith: '[c]'}),
        sfx('t', 'tt', BEFORE_SPELT, SPELT, {stemMinLength: 2, stemCharacters: LETTERS, stemNotEndsWith: '[t]'}),
        // Unstressed final -th for -d: only after a second syllable, so
        // that stressed túaith, sceith, beith keep their t (as a plain
        // suffix rule, túaith read as túaid and sceith as sceid).
        {type: 'pattern', pattern: `^(.*${VOWEL_CLASS}[${CONSONANT}${CONSONANT.toUpperCase()}]+${VOWEL_CLASS}+)th$`,
            replacement: '$1d', anchorSuffix: 'th', conditionsIn: BEFORE_SPELT, conditionsOut: SPELT},
        sfx('e', 'ae', BEFORE_SPELT, SPELT, {stemMinLength: 3, stemCharacters: LETTERS, stemNotEndsWith: LOWER_VOWEL_CLASS}),
        sfx('ae', 'e', BEFORE_SPELT, SPELT, {stemMinLength: 3, stemCharacters: LETTERS}),
    ]);
// A host's hover after the hyphen starts at the suffix itself (labrad-sa:
// the text sa …). Dictionaries list the suffixes with their hyphen (-sa).
const emphaticHeads = ['som', 'sem', 'sa', 'se', 'su', 'so', 'siu', 'si', 'ni', 'sni'];
add('emphaticAlone', 'emphasising suffix',
    'An emphasising suffix on its own, as a hover after the hyphen finds it: its headword has the hyphen (som → -som, sa → -sa).',
    emphaticHeads.map((w) => whole(w, `-${w}`, [], ['fw'])));

// --- Output -------------------------------------------------------------------
const out = {schema: 1, conditions, transforms};
const argOut = process.argv.indexOf('--out');
const file = argOut >= 0 ? process.argv[argOut + 1] : join(here, 'own.json');
writeFileSync(file, formatTransforms(out));
const ruleCount = transforms.reduce((n, t) => n + t.rules.length, 0);
console.log(`${file}: ${transforms.length} transforms, ${ruleCount} rules`);
