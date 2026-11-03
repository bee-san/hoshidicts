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
// - nom_pal: a noun or adjective stem with the palatal final consonant of a
//   case form (fir, maicc), which the depalatalisation rules undo.
// - nom_uinf: a stem with u-infection (fiur, purt).
// - n_dict, adj_dict: a noun's or adjective's headword form.
// A text after a removed initial mutation has no conditions: it can be any
// word, and every rule applies to it as to the text as written.
const conditions = {
    v: {name: 'Verb', isDictionaryForm: true, subConditions: ['v_dict', 'v_conj', 'v_conj3']},
    v_dict: {name: 'Verb, third singular present (headword form)', isDictionaryForm: false},
    v_conj: {name: 'Conjunct verbal complex (·beir, do·beir)', isDictionaryForm: false},
    v_conj3: {name: 'Third singular conjunct (·beir, do·beir)', isDictionaryForm: false},
    n: {name: 'Noun', isDictionaryForm: true, subConditions: ['n_dict', 'nom_pal', 'nom_uinf']},
    n_dict: {name: 'Noun, nominative singular (headword form)', isDictionaryForm: false},
    adj: {name: 'Adjective', isDictionaryForm: true, subConditions: ['adj_dict', 'nom_pal', 'nom_uinf']},
    adj_dict: {name: 'Adjective, nominative singular masculine (headword form)', isDictionaryForm: false},
    nom_pal: {name: 'Noun or adjective stem with a palatal final consonant (fir, maicc)', isDictionaryForm: false},
    nom_uinf: {name: 'Noun or adjective stem with u-infection (fiur, purt)', isDictionaryForm: false},
};

const NOMINAL = ['n_dict', 'adj_dict'];
const VERB = ['v_dict'];

// --- Character classes (language.json names them; repeated here inline) -------
const VOWEL = 'aeiouáéíóúæǽ';
const VOWEL_CLASS = `[${VOWEL}AEIOUÁÉÍÓÚÆǼ]`;
const LOWER_VOWEL_CLASS = `[${VOWEL}]`;
const CONSONANT = 'bcdfghlmnprstḃċḋḟġṁṅṗṡṫ';
const CONSONANT_CLASS = `[${CONSONANT}]`;
// A stem of letters only: no dot, hyphen, apostrophe or space, so an ending
// rule never reads the words before a space (docs/languages.md 14 step 2) or
// the pretonic part of a verbal complex.
const LETTERS = '[{letter}\\u0300-\\u036F]';
// A dotted stem: letters and the middle dot, at least one dot.
const DOTTED = '[{letter}\\u0300-\\u036F\\u00B7]';
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
        pfx('nd', 'd', [], [], {stemStartsWith: '[{letter}]'}),
        pfx('ng', 'g', [], [], {stemStartsWith: '[{letter}]'}),
        pfx('ll', 'l', [], [], {stemStartsWith: LOWER_VOWEL_CLASS}),
        pfx('mm', 'm', [], [], {stemStartsWith: LOWER_VOWEL_CLASS}),
        pfx('nn', 'n', [], [], {stemStartsWith: LOWER_VOWEL_CLASS}),
        pfx('rr', 'r', [], [], {stemStartsWith: LOWER_VOWEL_CLASS}),
    ]);

// n written against a vowel without a hyphen (nech for n-ech, nanmae for
// n-anmae): kept apart because a word may itself begin with n and a vowel.
add('nasalizationNoHyphen', 'nasalization',
    'Nasalised initial vowel written with n and no hyphen (nanmae → anmae, nech → ech).',
    [pfx('n', '', [], [], {stemStartsWith: VOWEL_CLASS, stemMinLength: 2})]);

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
// nasalised (ní·charat, nod·n-ail). A compound verb in deuterotonic form is
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

// Lenition and nasalisation after the dot (ní·charat, ro·chan, nod·n-ail,
// forsa·mmitter): the first dot's following letters made radical.
const afterDot = [
    ['ch', 'c'], ['th', 't'], ['ph', 'p'], ['ḟ', 'f'], ['ṡ', 's'], ['ḃ', 'b'], ['ċ', 'c'], ['ḋ', 'd'], ['ġ', 'g'], ['ṁ', 'm'], ['ṗ', 'p'], ['ṫ', 't'],
];
add('lenitionAfterDot', 'lenition',
    'Lenited initial of the stressed part of a verbal complex (ní·charat → ní·carat, do·chuirethar → do·cuirethar).',
    afterDot.map(([from, to]) => replace(`·${from}`, `·${to}`, ['v_conj'], ['v_conj'], {occurrence: 'first'})));
add('lenitedFAfterDot', 'lenition',
    'Lenited f, which is silent, not written after the dot (fod·era → fod·fera, ro·itir → ro·fitir).',
    [...'aeiouáéíóú'].map((v) => replace(`·${v}`, `·f${v}`, ['v_conj'], ['v_conj'], {occurrence: 'first'})));
add('nasalizationAfterDot', 'nasalization',
    'Nasalised initial of the stressed part of a verbal complex (nod·n-ail → nod·ail, ara·mberar → ara·berar, forsa·mmitter → forsa·mitter).',
    [
        ['n-', ''], ['n\u2011', ''], ['mb', 'b'], ['nd', 'd'], ['ng', 'g'], ['mm', 'm'], ['ll', 'l'], ['nn', 'n'], ['rr', 'r'],
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
        rules.push(sfx(inflected, deinflected, ['v_conj'], ['v_conj3'], dotted({stemEndsWith: CONSONANT_CLASS})));
        // ·berat → ·beir, ·gabat → ·gaib: the third singular is palatal.
        for (const [from, to] of [['e', 'ei'], ['a', 'ai'], ['o', 'oi'], ['u', 'ui']]) {
            rules.push(sfx(inflected, deinflected, ['v_conj'], ['v_conj3'],
                dotted({stemEndsWith: CONSONANT_CLASS, stemChange: palatalize(from, to)})));
        }
    }
    add(id, name, description, rules);
}
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
        ...[['a', 'ai'], ['o', 'oi'], ['u', 'ui'], ['e', 'ei']].map(([from, to]) =>
            head('', 'id', {stemMinLength: 2, stemEndsWith: CONSONANT_CLASS, stemChange: palatalize(from, to)})),
    ]);

// --- Absolute endings ---------------------------------------------------------
// A simple verb without a particle takes absolute endings; each is turned
// into the third singular absolute, the headword. W1 verbs end in -aid,
// W2 and S verbs in -id; strong verbs whose stem vowel alternates (biru,
// berait, beirid) are palatalised back.
const plain = (extra = {}) => ({stemCharacters: LETTERS, stemMinLength: 2, ...extra});
const absolute = {
    'pres-1sg': ['1st singular present', 'First singular present indicative or subjunctive (caraim → caraid, léiciu → léicid, biru → beirid, gníu → gníid).',
        [['aim', 'aid'], ['aimm', 'aid'], ['u', 'aid'], ['im', 'id'], ['imm', 'id'], ['iu', 'id'], ['u', 'id']]],
    'pres-2sg': ['2nd singular present', 'Second singular present indicative (carai → caraid, léici → léicid, biri → beirid).',
        [['ai', 'aid'], ['i', 'id']]],
    'pres-1pl': ['1st plural present', 'First plural present indicative (carmai → caraid, léicmi → léicid, bermai → beirid).',
        [['mai', 'aid'], ['mmai', 'aid'], ['ammai', 'aid'], ['mi', 'id'], ['mmi', 'id'], ['mai', 'id']]],
    'pres-2pl': ['2nd plural present', 'Second plural present indicative (carthae → caraid, léicthe → léicid, beirthe → beirid).',
        [['thae', 'aid'], ['the', 'id'], ['te', 'id']]],
    'pres-3pl': ['3rd plural present', 'Third plural present indicative or subjunctive (carait → caraid, léicit → léicid, berait → beirid).',
        [['ait', 'aid'], ['it', 'id'], ['ait', 'id']]],
    'rel-3sg': ['relative', 'Third singular relative (caras → caraid, léices → léicid, beres → beirid, gnís → gníid).',
        [['as', 'aid'], ['es', 'id'], ['s', 'id']]],
    'rel-pl': ['relative', 'First and third plural relative (carmae, cartae → caraid; léicme, léicte → léicid).',
        [['mae', 'aid'], ['tae', 'aid'], ['me', 'id'], ['te', 'id']]],
    'pass-pres': ['passive', 'Passive present (carthair, carthar, cartair → caraid; léicthir, léictir → léicid; berair → beirid).',
        [['thair', 'aid'], ['thar', 'aid'], ['tair', 'aid'], ['tar', 'aid'], ['thir', 'id'], ['ther', 'id'], ['tir', 'id'], ['ter', 'id'], ['air', 'aid'], ['air', 'id'], ['ir', 'id']]],
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
for (const [id, [name, description, list]] of Object.entries(absolute)) {
    const rules = [];
    for (const [inflected, deinflected] of list) {
        rules.push(sfx(inflected, deinflected, [], VERB, plain()));
        if (deinflected === 'id') {
            // biru, berait, beres → beirid: strong verbs palatalise the stem
            // in the third singular.
            for (const [from, to] of [['e', 'ei'], ['i', 'ei'], ['a', 'ai']]) {
                if (['u', 'i', 'mai', 'ait', 'es', 'air', 'ir', 'the', 'te', 'mi'].includes(inflected)) {
                    rules.push(sfx(inflected, deinflected, [], VERB, plain({stemChange: palatalize(from, to)})));
                }
            }
        }
        if (id === 'fut-abs' && deinflected === 'aid') {
            // mairbfid → marbaid: the W1 f-future has a palatal stem.
            rules.push(sfx(inflected.replace(/^fa/, 'f'), deinflected, [], VERB, plain({stemChange: {from: ['ai'], to: 'a', occurrence: 'last', between: CONSONANT_CLASS}})));
        }
    }
    add(id, name, description, rules);
}

// --- The copula and the substantive verb --------------------------------------
// Irregular forms, written out (is "is", attá "is, exists").
const copula = [
    // present
    'am', 'at', 'it', 'ammi', 'adib', 'as', 'ata', 'iss',
    // negative and dependent forms
    'nít', 'nítat', 'nidat', 'nídat', 'níta', 'nípu', 'nípo', 'níbu', 'níbo', 'níba', 'nípa', 'níptar', 'níbtar', 'nibtar', 'níbad', 'nípad', 'níbat', 'nípat',
    // subjunctive, past subjunctive, preterite, future
    'ba', 'bá', 'bat', 'bad', 'bed', 'bid', 'bith', 'bit', 'bes', 'bas', 'betis', 'batar', 'robo', 'ropo', 'robu', 'ropu', 'rop', 'rob', 'robtar', 'roptar', 'ropad', 'robad',
];
add('copula', 'copula',
    'A form of the copula is (am, it, níptar, bid, ropo → is).',
    uniq(copula).map((w) => whole(w, 'is', ['v_conj'], VERB)));
const substantive = [
    'atá', 'atáa', 'ataat', 'atáat', 'ataam', 'atam', 'ataí', 'atai',
    'tá', '·tá', 'táa', '·táa', 'taat', '·taat', 'atáa', 'tó', '·tó', 'taam', '·taam', 'taíd', '·taíd',
    'fil', '·fil', 'file', 'filet', '·filet', 'filus', 'filis',
    'bíu', 'bíuu', 'biuu', 'bí', 'bíid', 'biid', 'bíit', 'bíd', 'bíth', 'bíthir', 'bís', 'bimmi', 'bímmi',
    'boí', 'boi', '·boí', 'bói', 'bátar', '·bátar', 'batar', 'bammar', 'bámmar', 'robátar', 'roboí', 'robói',
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
        [['aib', ''], ['ib', ''], ['ib', 'e'], ['aib', 'ae'], ['ib', 'i'], ['aibh', '']]],
    'nom-pl': ['plural', 'Nominative or accusative plural (falla → fall, branu → bran, cailli → caille, súili → súil, rechtae → recht).',
        [['a', ''], ['u', ''], ['i', 'e'], ['i', ''], ['ai', 'ae'], ['ae', ''], ['e', '']]],
    'gen-sg': ['genitive', 'Genitive singular (rechto, rechta → recht; fechtae → fecht; imdai → imdae; tíre → tír).',
        [['o', ''], ['a', ''], ['ae', ''], ['e', ''], ['ai', 'ae'], ['i', 'e']]],
    'dat-sg-io': ['dative', 'Dative singular of io- and ia-stems (cailliu → caille, éscu → éscae, airdiu → airde).',
        [['iu', 'e'], ['u', 'ae'], ['iu', 'ae']]],
    'n-stem': ['n-stem', 'Oblique cases of n-stems (déicsin, déicsen → déicsiu; toimten → toimtiu; léimmen → léimm; luamain, luamon → luam).',
        [['in', 'iu'], ['en', 'iu'], ['ain', ''], ['on', ''], ['an', ''], ['men', ''], ['me', ''], ['mim', ''], ['menaib', ''], ['main', ''], ['mon', '']]],
    'dental-stem': ['dental stem', 'Oblique cases of t- and d-stems (carat, cairdea → cara; filed → fili; treodataid, treodatad → treodatu; araid → arae).',
        [['at', 'a'], ['ed', 'i'], ['taid', 'tu'], ['tad', 'tu'], ['aid', 'ae'], ['ait', 'ae'], ['at', 'ae']]],
    'r-stem': ['r-stem', 'Genitive of the r-stems athair, máthair, bráthair (athar → athair, máthar → máthair).',
        [['thar', 'thair'], ['thraib', 'thair'], ['thrib', 'thair']]],
    'guttural-stem': ['guttural stem', 'Oblique cases of k- and g-stems (ríg → rí, airech → aire, cathrach → cathair).',
        [['g', ''], ['ig', 'e'], ['ech', 'e'], ['rach', 'air'], ['raig', 'air'], ['rchaib', 'ir']]],
};
for (const [id, [name, description, list]] of Object.entries(endings)) {
    add(id, name, description, list.flatMap(([inflected, deinflected]) => {
        const rules = [sfx(inflected, deinflected, [], NOMINAL, nom())];
        // The ending removed, the stem may still be palatal (túaithe →
        // túaith → túath) or u-infected; the second step undoes it.
        if (deinflected === '' && inflected !== 'aib' && inflected !== 'ib') {
            rules.push(sfx(inflected, '', [], ['nom_pal'], nom()));
        }
        return rules;
    }));
}

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
        ...[...depal, ...raised].map(([from, to]) => sfx('', '', ['nom_pal'], NOMINAL,
            {stemCharacters: LETTERS, stemMinLength: 2, stemEndsWith: CONSONANT_CLASS, stemChange: {from: [from], to, occurrence: 'last', between: CONSONANT_CLASS}})),
        sfx('aig', 'ach', ['nom_pal'], NOMINAL, nom()),
        sfx('ig', 'ech', ['nom_pal'], NOMINAL, nom()),
    ]);

// u-infection undone (dative singular and accusative plural of o-stems,
// some adjectives): fiur → fer, fiull → fell, purt → port, sun → son, maull
// → mall.
add('uInfection', 'u-infection',
    'Case form with u-infection: dative singular of o-stems (fiur → fer, purt → port, maull → mall).',
    [['iu', 'e'], ['u', 'o'], ['au', 'a'], ['eu', 'e']].map(([from, to]) => sfx('', '', [], NOMINAL,
        {stemCharacters: LETTERS, stemMinLength: 2, stemEndsWith: CONSONANT_CLASS, stemChange: {from: [from], to, occurrence: 'last', between: CONSONANT_CLASS}})));

// The accusative plural -u raises e to i (firu → fer).
add('acc-pl-raised', 'accusative plural',
    'Accusative plural of o-stems with raised e (firu → fer, cinnu → cenn).',
    raised.map(([from, to]) => sfx('u', '', [], NOMINAL,
        {stemCharacters: LETTERS, stemMinLength: 2, stemEndsWith: CONSONANT_CLASS, stemChange: {from: [from], to, occurrence: 'last', between: CONSONANT_CLASS}})));

// Comparison of adjectives: comparative -iu, -u; superlative -em, -am;
// equative -ithir, -idir; with the stem made palatal (siniu, sinem → sen;
// mailliu → mall).
add('comparative', 'comparative',
    'Comparative of an adjective (bindiu → bind, ardu → ard, siniu → sen, mailliu → mall).',
    [
        sfx('iu', '', [], ['adj_dict'], nom()),
        sfx('u', '', [], ['adj_dict'], nom()),
        sfx('iu', '', [], ['nom_pal'], nom()),
    ]);
add('superlative', 'superlative',
    'Superlative of an adjective (sinem → sen, ardam → ard, maillem → mall).',
    [
        sfx('em', '', [], ['adj_dict'], nom()),
        sfx('am', '', [], ['adj_dict'], nom()),
        sfx('em', '', [], ['nom_pal'], nom()),
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
    'bó': ['bóu', 'bou', 'baí', 'bai', 'bú', 'buaib', 'boin', 'bóib', 'báo'],
    'duine': ['dóini', 'doíni', 'dóine', 'doíne', 'dóinib', 'doínib', 'duini', 'dóenib'],
    'cú': ['con', 'coin', 'conaib', 'cona', 'conu'],
    'rí': ['ríg', 'ríga', 'rígu', 'rígaib', 'rig', 'riga'],
    'tech': ['taige', 'tige', 'tig', 'taig', 'tigi', 'tigib', 'tegdais'],
    'lá': ['laa', 'láa', 'lae', 'laithe', 'láithe', 'láib', 'laib', 'laithib'],
};
add('irregularNoun', 'irregular noun',
    'A case form of an irregular noun (Dé → día, mná → ben, bóu → bó, dóini → duine, coin → cú, ríg → rí, taige → tech, laithe → lá).',
    Object.entries(irregularNouns).flatMap(([lemma, forms]) => uniq(forms).map((f) => whole(f, lemma, [], ['n_dict']))));

// Words a text writes together that a dictionary lists apart.
add('fused', 'spelling',
    'Words written together that dictionaries list apart (intan → in tan).',
    [whole('intan', 'in tan', [], [])]);

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
// Old Irish spelling varies between manuscripts and editions; a dictionary
// lists one spelling. nd and nn, mb and mm stand for the same sound (cend,
// cenn; imb, imm); a final voiceless stop may be written single or double
// (mac, macc; brat, bratt); an unstressed final -d is often written -th
// (caraith for caraid); final unstressed -ae and -e interchange (dorche,
// dorchae). The output can be any kind of word, so it has no conditions.
add('spelling', 'spelling',
    'Spelling variant: nd for nn, mm for mb (and back), a single or doubled final c, t or p, -th for unstressed final -d, -e for -ae (cend → cenn, imb → imm, mac → macc, caraith → caraid, dorche → dorchae).',
    [
        replace('nd', 'nn', [], [], {occurrence: 'all', notAtStart: true}),
        replace('nn', 'nd', [], [], {occurrence: 'all', notAtStart: true}),
        replace('mb', 'mm', [], [], {occurrence: 'all', notAtStart: true}),
        replace('mm', 'mb', [], [], {occurrence: 'all', notAtStart: true}),
        sfx('cc', 'c', [], [], {stemMinLength: 2, stemCharacters: LETTERS}),
        sfx('c', 'cc', [], [], {stemMinLength: 2, stemCharacters: LETTERS, stemNotEndsWith: '[c]'}),
        sfx('tt', 't', [], [], {stemMinLength: 2, stemCharacters: LETTERS}),
        sfx('t', 'tt', [], [], {stemMinLength: 2, stemCharacters: LETTERS, stemNotEndsWith: '[t]'}),
        sfx('pp', 'p', [], [], {stemMinLength: 2, stemCharacters: LETTERS}),
        sfx('th', 'd', [], [], {stemMinLength: 3, stemCharacters: LETTERS}),
        sfx('e', 'ae', [], [], {stemMinLength: 3, stemCharacters: LETTERS, stemNotEndsWith: LOWER_VOWEL_CLASS}),
        sfx('ae', 'e', [], [], {stemMinLength: 3, stemCharacters: LETTERS}),
    ]);

// --- Output -------------------------------------------------------------------
const out = {schema: 1, conditions, transforms};
const argOut = process.argv.indexOf('--out');
const file = argOut >= 0 ? process.argv[argOut + 1] : join(here, 'own.json');
writeFileSync(file, formatTransforms(out));
const ruleCount = transforms.reduce((n, t) => n + t.rules.length, 0);
console.log(`${file}: ${transforms.length} transforms, ${ruleCount} rules`);
