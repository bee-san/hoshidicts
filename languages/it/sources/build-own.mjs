#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/it/sources/own.json: the Italian deinflection rules written
// for this pack (docs/languages.md, section 14 step 2), from the paradigm
// tables below. Run from the repository root:
//
//   node languages/it/sources/build-own.mjs
//
// The tables follow the standard description of Italian inflection (Serianni,
// Grammatica italiana; the conjugation and declension tables of Wiktionary's
// Italian entries; Treccani's verb tables): the three conjugations (-are,
// -ere, -ire, and -ire with -isc-) in every simple tense and mood, with the
// spelling of -care/-gare (cerchi), -ciare/-giare (comincerò), -iare
// (studi), -gliere (tolgo), -gnere (spengo) and -cere (piaccio) verbs; the
// irregular verbs and their compounds (essere, avere, andare, dare, stare,
// fare, dire, the modals, venire, tenere, porre, trarre, -durre, bere and
// the others); the strong past historic and past participle (presi, preso);
// enclitic pronouns after infinitives, gerunds and imperatives (farlo,
// dicendomi, dammelo, alziamoci); pronominal (-rsi) verbs after a reflexive
// pronoun that agrees with the verb (mi lavo, se ne va, me la cavo); and the
// plural, feminine, superlative and -mente forms of nouns and adjectives.
// No text or table is copied from those sources.

import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// --- Conditions ------------------------------------------------------------------
// v, n, adj and adv are the parts of speech dictionaries write in their
// `rules` column (wiktionary-to-yomitan writes these names for the languages
// it tags). The others are intermediate states that no dictionary term
// carries: a form whose attached pronouns were removed, and the person of a
// conjugated verb read after a pronoun, which a reflexive pronoun must agree
// with (mi lavo, ti lavi, si lava, ci laviamo, vi lavate give lavarsi; mi
// lava, it washes me, does not).
const conditions = {
    v: {name: 'Verb', isDictionaryForm: true},
    n: {name: 'Noun', isDictionaryForm: true},
    adj: {name: 'Adjective', isDictionaryForm: true},
    adv: {name: 'Adverb', isDictionaryForm: true},
    imp: {name: 'Imperative without its pronouns', isDictionaryForm: false},
    imp_tu: {name: 'Imperative (tu) with ti before it', isDictionaryForm: false},
    imp_noi: {name: 'Imperative (noi) with ci before it', isDictionaryForm: false},
    imp_voi: {name: 'Imperative (voi) with vi before it', isDictionaryForm: false},
    ger: {name: 'Gerund without its pronouns', isDictionaryForm: false},
    refl: {name: 'A verb after a pronoun, the pronoun marked with a +', isDictionaryForm: false},
    ptcp: {name: 'Infinitive of a past participle, marked with a %, for the -rsi verb', isDictionaryForm: false},
    clinf: {name: 'Infinitive without its final e, before an attached pronoun', isDictionaryForm: false},
    p1s: {name: 'First person singular (agrees with mi)', isDictionaryForm: false},
    p2s: {name: 'Second person singular (agrees with ti)', isDictionaryForm: false},
    p3: {name: 'Third person (agrees with si)', isDictionaryForm: false},
    p1p: {name: 'First person plural (agrees with ci)', isDictionaryForm: false},
    p2p: {name: 'Second person plural (agrees with vi)', isDictionaryForm: false},
    // The written-out forms of fare, dare, dire and bere after a pronoun, by
    // person: their stem has one letter, which the pronominal rule takes only
    // from these forms (si fa, si dice, me la bevo), never from a regular
    // ending (mi dà is not mi + dire).
    short_p1s: {name: 'fare, dare, dire or bere, first person singular', isDictionaryForm: false},
    short_p2s: {name: 'fare, dare, dire or bere, second person singular', isDictionaryForm: false},
    short_p3: {name: 'fare, dare, dire or bere, third person', isDictionaryForm: false},
    short_p1p: {name: 'fare, dare, dire or bere, first person plural', isDictionaryForm: false},
    short_p2p: {name: 'fare, dare, dire or bere, second person plural', isDictionaryForm: false},
};

// --- Transforms and rules -------------------------------------------------------------
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

// Stems are lower-case letters ({lower}, a class of language.json): a
// capitalized word is read through its decapitalized variant (Libri → libri
// → libro, Parlavano → parlavano → parlare), so a rule never reaches a
// proper name from a capitalized word at the start of a sentence (Ieri is
// ieri, not the surname Iero; Rido is ridere, not the name Ridere).

function add(id, rule) {
    const t = byId.get(id);
    if (t === undefined) { throw new Error(`no transform ${id}`); }

    const key = `${id}\u0000${JSON.stringify(rule)}`;
    if (seen.has(key)) { return; }
    seen.add(key);
    t.rules.push(rule);
}

function suffix(id, inflected, deinflected, conditionsIn, conditionsOut, extra = {}) {
    add(id, {type: 'suffix', inflected, deinflected, conditionsIn, conditionsOut, ...extra});
}

// A whole word is written as a suffix rule whose stem must be empty
// (stemCharacters [], which no code point is in), so the compaction below can
// put the whole words of one transform and conditions in one cross product.
function whole(id, inflected, deinflected, conditionsIn, conditionsOut) {
    add(id, {type: 'suffix', inflected, deinflected, conditionsIn, conditionsOut, stemCharacters: '[]'});
}

// --- Verb slots ------------------------------------------------------------------------
// One transform per tense (or mood) and person, so a trace names both. Each
// slot lists its regular endings for -are, -ere, -ire and -isc- verbs (the
// last only where they differ from -ire), the persons a reflexive pronoun
// before it may agree with, and the conditions it reads (an imperative or a
// gerund whose pronouns were removed).
const SLOTS = [
    ['present-io', 'present (io)', 'Present indicative, first person singular (io): parlo, temo, dormo, finisco.', ['p1s'],
        {are: ['o'], ere: ['o'], ire: ['o'], isc: ['isco']}],
    ['present-tu', 'present (tu)', 'Present indicative, second person singular (tu): parli, temi, dormi, finisci.', ['p2s'],
        {are: ['i'], ere: ['i'], ire: ['i'], isc: ['isci']}],
    ['present-lui', 'present (lui, lei)', 'Present indicative, third person singular (lui, lei, Lei): parla, teme, dorme, finisce.', ['p3'],
        {are: ['a'], ere: ['e'], ire: ['e'], isc: ['isce']}],
    ['present-noi', 'present (noi)', 'Present indicative, first person plural (noi): parliamo, temiamo, dormiamo, finiamo.', ['p1p'],
        {are: ['iamo'], ere: ['iamo'], ire: ['iamo']}],
    ['present-voi', 'present (voi)', 'Present indicative, second person plural (voi): parlate, temete, dormite, finite.', ['p2p'],
        {are: ['ate'], ere: ['ete'], ire: ['ite']}],
    ['present-loro', 'present (loro)', 'Present indicative, third person plural (loro): parlano, temono, dormono, finiscono.', ['p3'],
        {are: ['ano'], ere: ['ono'], ire: ['ono'], isc: ['iscono']}],
    ['imperfect-io', 'imperfect (io)', 'Imperfect indicative, first person singular (io): parlavo, temevo, dormivo.', ['p1s'],
        {are: ['avo'], ere: ['evo'], ire: ['ivo']}],
    ['imperfect-tu', 'imperfect (tu)', 'Imperfect indicative, second person singular (tu): parlavi, temevi, dormivi.', ['p2s'],
        {are: ['avi'], ere: ['evi'], ire: ['ivi']}],
    ['imperfect-lui', 'imperfect (lui, lei)', 'Imperfect indicative, third person singular (lui, lei): parlava, temeva, dormiva.', ['p3'],
        {are: ['ava'], ere: ['eva'], ire: ['iva']}],
    ['imperfect-noi', 'imperfect (noi)', 'Imperfect indicative, first person plural (noi): parlavamo, temevamo, dormivamo.', ['p1p'],
        {are: ['avamo'], ere: ['evamo'], ire: ['ivamo']}],
    ['imperfect-voi', 'imperfect (voi)', 'Imperfect indicative, second person plural (voi): parlavate, temevate, dormivate.', ['p2p'],
        {are: ['avate'], ere: ['evate'], ire: ['ivate']}],
    ['imperfect-loro', 'imperfect (loro)', 'Imperfect indicative, third person plural (loro): parlavano, temevano, dormivano.', ['p3'],
        {are: ['avano'], ere: ['evano'], ire: ['ivano']}],
    ['preterite-io', 'past historic (io)', 'Past historic (passato remoto), first person singular (io): parlai, temei or temetti, dormii.', ['p1s'],
        {are: ['ai'], ere: ['ei', 'etti'], ire: ['ii']}],
    ['preterite-tu', 'past historic (tu)', 'Past historic (passato remoto), second person singular (tu): parlasti, temesti, dormisti.', ['p2s'],
        {are: ['asti'], ere: ['esti'], ire: ['isti']}],
    ['preterite-lui', 'past historic (lui, lei)', 'Past historic (passato remoto), third person singular (lui, lei): parlò, temé or temette, dormì.', ['p3'],
        {are: ['ò'], ere: ['é', 'ette', 'è'], ire: ['ì']}],
    ['preterite-noi', 'past historic (noi)', 'Past historic (passato remoto), first person plural (noi): parlammo, tememmo, dormimmo.', ['p1p'],
        {are: ['ammo'], ere: ['emmo'], ire: ['immo']}],
    ['preterite-voi', 'past historic (voi)', 'Past historic (passato remoto), second person plural (voi): parlaste, temeste, dormiste.', ['p2p'],
        {are: ['aste'], ere: ['este'], ire: ['iste']}],
    ['preterite-loro', 'past historic (loro)', 'Past historic (passato remoto), third person plural (loro): parlarono, temerono or temettero, dormirono.', ['p3'],
        {are: ['arono'], ere: ['erono', 'ettero'], ire: ['irono']}],
    ['future-io', 'future (io)', 'Future indicative, first person singular (io): parlerò, temerò, dormirò.', ['p1s'],
        {are: ['erò'], ere: ['erò'], ire: ['irò']}],
    ['future-tu', 'future (tu)', 'Future indicative, second person singular (tu): parlerai, temerai, dormirai.', ['p2s'],
        {are: ['erai'], ere: ['erai'], ire: ['irai']}],
    ['future-lui', 'future (lui, lei)', 'Future indicative, third person singular (lui, lei): parlerà, temerà, dormirà.', ['p3'],
        {are: ['erà'], ere: ['erà'], ire: ['irà']}],
    ['future-noi', 'future (noi)', 'Future indicative, first person plural (noi): parleremo, temeremo, dormiremo.', ['p1p'],
        {are: ['eremo'], ere: ['eremo'], ire: ['iremo']}],
    ['future-voi', 'future (voi)', 'Future indicative, second person plural (voi): parlerete, temerete, dormirete.', ['p2p'],
        {are: ['erete'], ere: ['erete'], ire: ['irete']}],
    ['future-loro', 'future (loro)', 'Future indicative, third person plural (loro): parleranno, temeranno, dormiranno.', ['p3'],
        {are: ['eranno'], ere: ['eranno'], ire: ['iranno']}],
    ['conditional-io', 'conditional (io)', 'Present conditional, first person singular (io): parlerei, temerei, dormirei.', ['p1s'],
        {are: ['erei'], ere: ['erei'], ire: ['irei']}],
    ['conditional-tu', 'conditional (tu)', 'Present conditional, second person singular (tu): parleresti, temeresti, dormiresti.', ['p2s'],
        {are: ['eresti'], ere: ['eresti'], ire: ['iresti']}],
    ['conditional-lui', 'conditional (lui, lei)', 'Present conditional, third person singular (lui, lei): parlerebbe, temerebbe, dormirebbe.', ['p3'],
        {are: ['erebbe'], ere: ['erebbe'], ire: ['irebbe']}],
    ['conditional-noi', 'conditional (noi)', 'Present conditional, first person plural (noi): parleremmo, temeremmo, dormiremmo.', ['p1p'],
        {are: ['eremmo'], ere: ['eremmo'], ire: ['iremmo']}],
    ['conditional-voi', 'conditional (voi)', 'Present conditional, second person plural (voi): parlereste, temereste, dormireste.', ['p2p'],
        {are: ['ereste'], ere: ['ereste'], ire: ['ireste']}],
    ['conditional-loro', 'conditional (loro)', 'Present conditional, third person plural (loro): parlerebbero, temerebbero, dormirebbero.', ['p3'],
        {are: ['erebbero'], ere: ['erebbero'], ire: ['irebbero']}],
    // A pronoun before the present subjunctive singular agrees only with lui
    // and Lei (si accomodi, che si lavi): the form is also io's and tu's, and
    // mi and ti before it are objects far more often than reflexives (mi dica,
    // ti piaccia, ti dia: 133 of 177 ti places in Tatoeba). tu's pairs te ne
    // and te la still agree (che te ne vada), through PAIR_PERSONS below.
    ['subjunctive-sg', 'present subjunctive (io, tu, lui)', 'Present subjunctive, singular (che io, tu, lui, lei; also the Lei imperative): parli, tema, dorma, finisca.', ['p3'],
        {are: ['i'], ere: ['a'], ire: ['a'], isc: ['isca']}],
    ['subjunctive-noi', 'present subjunctive (noi)', 'Present subjunctive, first person plural (che noi): parliamo, temiamo, dormiamo, finiamo.', ['p1p'],
        {are: ['iamo'], ere: ['iamo'], ire: ['iamo']}],
    ['subjunctive-voi', 'present subjunctive (voi)', 'Present subjunctive, second person plural (che voi): parliate, temiate, dormiate, finiate.', ['p2p'],
        {are: ['iate'], ere: ['iate'], ire: ['iate']}],
    ['subjunctive-loro', 'present subjunctive (loro)', 'Present subjunctive, third person plural (che loro; also the Loro imperative): parlino, temano, dormano, finiscano.', ['p3'],
        {are: ['ino'], ere: ['ano'], ire: ['ano'], isc: ['iscano']}],
    ['subjunctive-imperfect-sg', 'imperfect subjunctive (io, tu)', 'Imperfect subjunctive, first and second person singular (che io, che tu): parlassi, temessi, dormissi.', ['p1s', 'p2s'],
        {are: ['assi'], ere: ['essi'], ire: ['issi']}],
    ['subjunctive-imperfect-lui', 'imperfect subjunctive (lui, lei)', 'Imperfect subjunctive, third person singular (che lui, che lei): parlasse, temesse, dormisse.', ['p3'],
        {are: ['asse'], ere: ['esse'], ire: ['isse']}],
    ['subjunctive-imperfect-noi', 'imperfect subjunctive (noi)', 'Imperfect subjunctive, first person plural (che noi): parlassimo, temessimo, dormissimo.', ['p1p'],
        {are: ['assimo'], ere: ['essimo'], ire: ['issimo']}],
    ['subjunctive-imperfect-voi', 'imperfect subjunctive (voi)', 'Imperfect subjunctive, second person plural (che voi): parlaste, temeste, dormiste.', ['p2p'],
        {are: ['aste'], ere: ['este'], ire: ['iste']}],
    ['subjunctive-imperfect-loro', 'imperfect subjunctive (loro)', 'Imperfect subjunctive, third person plural (che loro): parlassero, temessero, dormissero.', ['p3'],
        {are: ['assero'], ere: ['essero'], ire: ['issero']}],
    ['imperative-tu', 'imperative (tu)', 'Imperative, second person singular (tu): parla, temi, dormi, finisci; da\', di\', fa\', sta\', va\'.', [],
        {are: ['a'], ere: ['i'], ire: ['i'], isc: ['isci']}],
    ['imperative-noi', 'imperative (noi)', 'Imperative, first person plural (noi): parliamo, temiamo, dormiamo, finiamo.', [],
        {are: ['iamo'], ere: ['iamo'], ire: ['iamo']}],
    ['imperative-voi', 'imperative (voi)', 'Imperative, second person plural (voi): parlate, temete, dormite, finite.', [],
        {are: ['ate'], ere: ['ete'], ire: ['ite']}],
    ['gerund', 'gerund', 'Gerund: parlando, temendo, dormendo, finendo.', [],
        {are: ['ando'], ere: ['endo'], ire: ['endo']}],
    ['participle-present', 'present participle', 'Present participle, singular and plural: parlante, parlanti, temente, dormiente.', [],
        {are: ['ante', 'anti'], ere: ['ente', 'enti'], ire: ['ente', 'enti', 'iente', 'ienti']}],
    ['participle', 'past participle', 'Past participle, masculine and feminine, singular and plural: parlato, parlata, parlati, parlate; temuto; dormito.', [],
        {are: ['ato', 'ata', 'ati', 'ate'], ere: ['uto', 'uta', 'uti', 'ute'], ire: ['ito', 'ita', 'iti', 'ite']}],
];
const PERSONS = new Map(SLOTS.map(([id, , , persons]) => [id, persons]));
// The noun and adjective transforms come first in the file: where a word's own
// rows name a noun and a verb (figli: figlio and figliare; chiavi: chiave and
// chiavare), both readings take one step and are dictionary-confirmed, so they
// tie, and ties go to the reading found first, which rule order decides
// (docs/languages.md 7.1, 7.4, 9.6). The noun is the reading a learner usually
// needs (hachi-lang-it's first audit, MAJOR-1).
const NOMINAL_FIRST = [
    ['plural', 'plural', 'Plural of a noun or adjective: libri, case, cani, problemi, amiche, parchi, amici, arance, figli.'],
    ['feminine', 'feminine', 'Feminine singular of an adjective, or of a noun for a person: rossa, attrice, studentessa, padrona.'],
    ['feminine-plural', 'feminine plural', 'Feminine plural of an adjective: rosse, bianche, lunghe, lisce.'],
    ['superlative', 'superlative', 'Absolute superlative (-issimo): bellissimo, grandissima, lunghissimi, velocissime.'],
    ['adverb', 'adverb (-mente)', 'Adverb formed from an adjective with -mente: lentamente, fortemente, facilmente, regolarmente.'],
];
for (const [id, name, description] of NOMINAL_FIRST) { transform(id, name, description); }
for (const [id, name, description] of SLOTS) { transform(id, name, description); }

// The conditions each slot reads. An imperative whose pronouns were removed
// (guardalo → guarda) has imp; one whose reflexive pronoun was moved before
// it, which must agree with it, has imp_tu, imp_noi or imp_voi (alzati →
// ti+alza, alziamoci → ci+alziamo, alzatevi → vi+alzate). A gerund whose
// pronouns were removed (dicendolo → dicendo) has ger. Every other slot reads
// only the text as it was scanned (or as a processor wrote it).
const IN = {
    'imperative-tu': ['imp', 'imp_tu'],
    'imperative-noi': ['imp', 'imp_noi'],
    'imperative-voi': ['imp', 'imp_voi'],
    gerund: ['ger'],
};
const inFor = (slot) => IN[slot] ?? [];
const outFor = () => ['v'];
const SHORT = {p1s: 'short_p1s', p2s: 'short_p2s', p3: 'short_p3', p1p: 'short_p1p', p2p: 'short_p2p'};
// Persons a slot agrees with only after a pronoun pair (te ne, te la): the
// present subjunctive singular after te ne is tu's (che te ne vada).
const PAIR_PERSONS = {'subjunctive-sg': [['p2s', 'te+']]};
// The slots a pronoun the clitic rules moved (+) can stand before: the
// gerund and the imperatives (dicendosi → si+dicendo, alzati → ti+alza).
const MARKED = new Set(['gerund', 'imperative-tu', 'imperative-noi', 'imperative-voi']);

// Every verb rule is written for one word of letters, and again for a verb
// after a pronoun marked with a + (stemContains [+]):
// - a pronoun written before a conjugated verb, which the proclitic rule
//   marks (mi lavo → mi+lavo, refl): the rule gives only the person of the
//   slot, which no dictionary term carries, so the phrase is read only
//   through a pronominal rule that agrees with it, and a verb rule never
//   turns the last word of a phrase into another phrase (non mi disse is not
//   the idiom non mi dire, un'ora sola is not ora solare);
// - a pronoun the clitic rules moved from after an imperative or a gerund
//   (alzati → ti+alza): the rule gives the verb, for the pronominal rule
//   (ti+alzare → alzarsi).
// The stems a rule leaves out (`split`) are left out of the single word only:
// after a mark the stem starts with the pronoun, and the pronominal rule
// checks the verb's own stem.
function forms(slot, inflected, deinflected, extra, short, split = {}) {
    suffix(slot, inflected, deinflected, inFor(slot), outFor(slot), {...extra, ...split, stemCharacters: '{lower}'});
    const persons = PERSONS.get(slot);
    // After a mark the stem is the pronoun, its + and the verb's letters
    // (ti+lav), never a phrase (ti+lavi le man).
    const marked = {...extra, stemContains: '[+]', stemCharacters: '[{lower}+]'};
    if (persons.length > 0) {
        suffix(slot, inflected, deinflected, ['refl'], short ? persons.map((p) => SHORT[p]) : persons, marked);
    }
    for (const [person, pair] of PAIR_PERSONS[slot] ?? []) {
        suffix(slot, inflected, deinflected, ['refl'], [short ? SHORT[person] : person], {...marked, stemStartsWithText: pair});
    }
    if (MARKED.has(slot)) {
        suffix(slot, inflected, deinflected, inFor(slot), ['v'], marked);
    }
}

// Every regular ending needs a stem of two letters or more, so short words do
// not read as verbs (da is not a form of dare through -a, mare is not a form
// of mandare). The verbs whose stem has one letter (dare, fare, dire, bere)
// are written out below.
const MIN_STEM = 2;
const LEMMA = {are: 'are', ere: 'ere', ire: 'ire', isc: 'ire'};

function verb(slot, inflected, deinflected, extra = {}, split = {}) {
    forms(slot, inflected, deinflected, {stemMinLength: MIN_STEM, ...extra}, false, split);
}

// -care, -gare, -ciare and -giare verbs write ch, gh or ci, gi before e and
// i (cerchi, paghi, cominci, comincerò), which the rules below read; the
// plain -are endings that start with e or i leave out stems that end in c or
// g, so baci is baciare, not a verb bacare.
const PLAIN_ARE = {stemNotEndsWith: '[cg]'};
// Irregular verbs whose stem a regular ending would also read in a frequent
// word that is not their form: dove and sede are where and seat, not dovere
// and sedere (whose third persons are deve and siede); sala, vena and mora
// are room, vein and blackberry, not salire, venire and morire (salga,
// venga, muoia). The regular rules of those slots leave out exactly these
// stems; longer stems that start with them stay (dovete, sedete, saliva).
const EXCLUDED_STEMS = [
    {cls: 'ere', stems: ['dov', 'sed'], slots: /^present-lui$/u},
    {cls: 'ire', stems: ['sal', 'ven', 'mor'], slots: /^subjunctive-sg$/u},
];
// The rule objects for a regular ending that leave out whole stems (at most
// one per first letter): the stems that start with none of their letters,
// and for each, the stems that start with its letter but not with it, and
// the longer stems that start with it.
function splitStems(slot, cls) {
    const stems = EXCLUDED_STEMS.filter((e) => e.cls === cls && e.slots.test(slot)).flatMap((e) => e.stems);
    if (stems.length === 0) { return [{}]; }
    const firsts = stems.map((stem) => stem[0]);
    if (new Set(firsts).size !== firsts.length) { throw new Error(`${slot}: two excluded stems start with one letter`); }
    return [
        {stemNotStartsWith: `[${firsts.join('')}]`},
        ...stems.flatMap((stem) => [
            {stemStartsWith: `[${stem[0]}]`, stemNotStartsWithText: stem},
            {stemStartsWithText: stem, stemMinLength: [...stem].length + 1},
        ]),
    ];
}
// The past historic in -etti, -ette and -ettero is used after the stems of
// credere, vendere, temere, ricevere, dovere, potere, sedere, battere and the
// like, which end in d, m, t or v; other stems are left out, so the plural of
// a diminutive is not read as one (casette is not a form of a verb casere).
const ETTI = {stemEndsWith: '[dmtv]'};
for (const [slot, , , , endings] of SLOTS) {
    for (const cls of ['are', 'ere', 'ire', 'isc']) {
        for (const ending of endings[cls] ?? []) {
            // -isc- verbs: the stem before -isc- is two letters or more
            // (capisco, finisce), so disco and fisco are not dire and fire.
            const spelling = cls === 'are' && /^[ei]/u.test(ending) ? PLAIN_ARE : {};
            const splits = splitStems(slot, cls);
            splits.forEach((split, i) => {
                // The marked variant once, without the split.
                if (i === 0) {
                    verb(slot, ending, LEMMA[cls], /^ett/u.test(ending) ? ETTI : spelling, split);
                } else {
                    suffix(slot, ending, LEMMA[cls], inFor(slot), outFor(slot),
                        {stemMinLength: MIN_STEM, ...(/^ett/u.test(ending) ? ETTI : spelling), ...split, stemCharacters: '{lower}'});
                }
            });
        }
    }
}

// --- Spelling of -are verbs ----------------------------------------------------------
// -care and -gare keep the hard sound with an h before e and i (cerchi,
// cerchiamo, cercherò; paghi, pagherei). -ciare and -giare drop their i before
// e (comincerò, mangerei; lascerò is -sciare). -iare verbs write one i where
// the stem's i meets an ending's (studi, studiamo, studiate, studino; mangi,
// cominci, lasci, sbagli); the stressed ì of inviare keeps both (invii,
// inviino), which the plain endings read.
for (const [slot, , , , endings] of SLOTS) {
    for (const ending of endings.are ?? []) {
        if (/^[ei]/u.test(ending)) {
            verb(slot, 'ch' + ending, 'care');
            verb(slot, 'gh' + ending, 'gare');
        }
        if (/^e/u.test(ending)) {
            verb(slot, 'c' + ending, 'ciare');
            verb(slot, 'g' + ending, 'giare');
        }
        if (/^i/u.test(ending)) {
            verb(slot, ending, 'iare');
        }
    }
}

// --- Spelling of -ere and -ire verbs --------------------------------------------------
// -gliere verbs (togliere, scegliere, cogliere, sciogliere) write lg before a
// and o (tolgo, tolgono, tolga) and gli where the stem's i meets an ending's
// (togli, togliamo, togliate). -gnere (spegnere) writes ng before a and o
// (spengo, spenga). -cere verbs with cqu in the past historic (piacere,
// tacere, giacere) write cci before a and o (piaccio, piacciono, piaccia,
// piacciamo). -cire verbs with u (cucire, scucire) write ci before a and o
// (cucio, cuciono, cucia). Past participles in -iuto keep the stem's soft c
// (conosciuto, cresciuto, piaciuto, taciuto).
const SPELLING = [
    ['present-io', [['lgo', 'gliere'], ['ngo', 'gnere'], ['accio', 'acere'], ['ucio', 'ucire']]],
    ['present-tu', [['gli', 'gliere']]],
    ['present-noi', [['gliamo', 'gliere'], ['acciamo', 'acere']]],
    ['present-loro', [['lgono', 'gliere'], ['ngono', 'gnere'], ['acciono', 'acere'], ['uciono', 'ucire']]],
    ['subjunctive-sg', [['lga', 'gliere'], ['nga', 'gnere'], ['accia', 'acere'], ['ucia', 'ucire']]],
    ['subjunctive-noi', [['gliamo', 'gliere'], ['acciamo', 'acere']]],
    ['subjunctive-voi', [['gliate', 'gliere'], ['acciate', 'acere']]],
    ['subjunctive-loro', [['lgano', 'gliere'], ['ngano', 'gnere'], ['acciano', 'acere'], ['uciano', 'ucire']]],
    ['imperative-tu', [['gli', 'gliere']]],
    ['imperative-noi', [['gliamo', 'gliere'], ['acciamo', 'acere']]],
    ['preterite-io', [['acqui', 'acere']]],
    ['preterite-lui', [['acque', 'acere']]],
    ['preterite-loro', [['acquero', 'acere']]],
    ['participle', [['ciuto', 'cere'], ['ciuta', 'cere'], ['ciuti', 'cere'], ['ciute', 'cere']]],
];
// tacere and cucire have a one-letter stem (taccio, tacque, cucio).
for (const [slot, pairs] of SPELLING) {
    for (const [inflected, deinflected] of pairs) {
        verb(slot, inflected, deinflected, /^(acere|ucire)$/u.test(deinflected) ? {stemMinLength: 1} : {});
    }
}

// --- Irregular verbs -------------------------------------------------------------------
// Forms that the regular endings do not give, by slot. `mode` says where a
// form is read: 'whole' only as the word itself (the modals, essere, avere:
// si può, si deve and si è are not potersi, doversi and essersi); 'compound'
// also at the end of a longer word, so compounds share the forms (rifaccio,
// ottengo, propongo, produssi); a list of prefixes for the short forms of
// fare, dare and stare (rifà, ridà, sottostà), which as endings would read
// other words (truffa, staffa). Forms the regular endings give (andavo,
// stavo, avevo, potei) are not repeated.
const tense = (name, forms) => Object.fromEntries(['io', 'tu', 'lui', 'noi', 'voi', 'loro']
    .map((person, i) => [`${name}-${person}`, forms[i]]).filter(([, f]) => f !== null && f !== undefined));
const subj = (sg, noi, voi, loro) => ({'subjunctive-sg': sg, 'subjunctive-noi': noi, 'subjunctive-voi': voi, 'subjunctive-loro': loro});
const subjImpf = (sg, lui, noi, voi, loro) => ({
    'subjunctive-imperfect-sg': sg, 'subjunctive-imperfect-lui': lui, 'subjunctive-imperfect-noi': noi,
    'subjunctive-imperfect-voi': voi, 'subjunctive-imperfect-loro': loro,
});
const imp = (tu, noi, voi) => ({'imperative-tu': tu, 'imperative-noi': noi, 'imperative-voi': voi});
// The six persons of a stem with regular endings (fac + evo ..., dic + essi ...).
const sixOn = (stem, endings) => endings.map((e) => stem + e);
const IMPF_E = ['evo', 'evi', 'eva', 'evamo', 'evate', 'evano'];
const FUT = ['ò', 'ai', 'à', 'emo', 'ete', 'anno'];
const COND = ['ei', 'esti', 'ebbe', 'emmo', 'este', 'ebbero'];
const SUBJ_IMPF_E = ['essi', 'esse', 'essimo', 'este', 'essero'];
const future = (stem) => ({...tense('future', sixOn(stem, FUT)), ...tense('conditional', sixOn(stem, COND))});
const participle = (masculine) => ({participle: ['o', 'a', 'i', 'e'].map((e) => masculine.slice(0, -1) + e)});

const IRREGULAR = [
    {lemma: 'essere', mode: 'whole', forms: {
        ...tense('present', ['sono', 'sei', 'è', 'siamo', 'siete', 'sono']),
        ...tense('imperfect', ['ero', 'eri', 'era', 'eravamo', 'eravate', 'erano']),
        ...tense('preterite', ['fui', 'fosti', 'fu', 'fummo', 'foste', 'furono']),
        ...future('sar'),
        ...subj('sia', 'siamo', 'siate', 'siano'),
        ...subjImpf('fossi', 'fosse', 'fossimo', 'foste', 'fossero'),
        ...imp('sii', 'siamo', 'siate'),
        gerund: 'essendo',
        ...participle('stato'),
    }},
    {lemma: 'avere', mode: 'whole', forms: {
        ...tense('present', ['ho', 'hai', 'ha', 'abbiamo', null, 'hanno']),
        ...tense('preterite', ['ebbi', null, 'ebbe', null, null, 'ebbero']),
        ...future('avr'),
        ...subj('abbia', 'abbiamo', 'abbiate', 'abbiano'),
        ...imp('abbi', 'abbiamo', 'abbiate'),
    }},
    {lemma: 'potere', mode: 'whole', forms: {
        ...tense('present', ['posso', 'puoi', 'può', 'possiamo', null, 'possono']),
        ...future('potr'),
        ...subj('possa', 'possiamo', 'possiate', 'possano'),
    }},
    {lemma: 'volere', mode: 'whole', forms: {
        ...tense('present', ['voglio', 'vuoi', 'vuole', 'vogliamo', null, 'vogliono']),
        ...tense('preterite', ['volli', null, 'volle', null, null, 'vollero']),
        ...future('vorr'),
        ...subj('voglia', 'vogliamo', 'vogliate', 'vogliano'),
        ...imp('vogli', 'vogliamo', 'vogliate'),
    }},
    {lemma: 'dovere', mode: 'whole', forms: {
        ...tense('present', ['devo', 'devi', 'deve', 'dobbiamo', null, 'devono']),
        'present-io': ['devo', 'debbo'], 'present-loro': ['devono', 'debbono'],
        ...future('dovr'),
        ...subj(['debba', 'deva'], 'dobbiamo', 'dobbiate', ['debbano', 'devano']),
    }},
    {lemma: 'sapere', mode: 'whole', forms: {
        ...tense('present', ['so', 'sai', 'sa', 'sappiamo', null, 'sanno']),
        ...tense('preterite', ['seppi', null, 'seppe', null, null, 'seppero']),
        ...future('sapr'),
        ...subj('sappia', 'sappiamo', 'sappiate', 'sappiano'),
        ...imp('sappi', 'sappiamo', 'sappiate'),
    }},
    // andare: vo, vai and va only as words (va is also the end of nova,
    // riva); vado, vanno, vada and vadano also after a pronoun (me ne vado).
    {lemma: 'andare', mode: 'whole', forms: {
        ...tense('present', ['vo', 'vai', 'va', null, null, null]),
        ...imp('vai', null, null),
    }},
    {lemma: 'andare', mode: 'compound', forms: {
        ...tense('present', ['vado', null, null, null, null, 'vanno']),
        ...subj('vada', null, null, 'vadano'),
        ...future('andr'),
    }},
    // dare and stare: every form, as a word and with the prefixes of their
    // compounds (ridà, ridiede, sottostà, sottostette). Most verbs in -dare
    // and -stare are regular (guardare, mandare, restare, costare), so these
    // forms are not read at the end of other words (credette is not cre +
    // dette).
    {lemma: 'dare', mode: ['ri'], forms: {
        ...tense('present', ['do', 'dai', 'dà', 'diamo', 'date', 'danno']),
        ...tense('imperfect', ['davo', 'davi', 'dava', 'davamo', 'davate', 'davano']),
        ...tense('preterite', [['diedi', 'detti'], 'desti', ['diede', 'dette'], 'demmo', 'deste', ['diedero', 'dettero']]),
        ...future('dar'),
        ...subj('dia', 'diamo', 'diate', 'diano'),
        ...subjImpf('dessi', 'desse', 'dessimo', 'deste', 'dessero'),
        ...imp('dai', 'diamo', 'date'),
        ...participle('dato'),
    }},
    // stessi and stesse are left out: they are nearly always stesso's plurals
    // (gli stessi, le stesse), which the plural rule reads; wty-it-en's rows
    // still name stare for them.
    {lemma: 'stare', mode: ['ri', 'sotto', 'sovra', 'sopra'], forms: {
        ...tense('present', ['sto', 'stai', 'sta', null, null, 'stanno']),
        ...tense('preterite', ['stetti', 'stesti', 'stette', 'stemmo', 'steste', 'stettero']),
        ...future('star'),
        ...subj('stia', 'stiamo', 'stiate', 'stiano'),
        ...subjImpf(null, null, 'stessimo', 'steste', 'stessero'),
        ...imp('stai', null, null),
    }},
    // fare: the short forms with the prefixes of its compounds; the longer
    // ones at the end of any word (rifacevo, soddisfacendo, contraffatto).
    {lemma: 'fare', mode: ['ri', 'dis', 'soddis', 'contraf', 'sopraf', 'assue', 'lique', 'stupe', 'tume', 'putre', 'rare', 'torre', 'stra'], forms: {
        ...tense('present', [['faccio', 'fo'], 'fai', 'fa', null, 'fate', 'fanno']),
        ...imp('fai', null, 'fate'),
    }},
    {lemma: 'fare', mode: 'compound', forms: {
        'present-io': 'faccio', 'present-noi': 'facciamo',
        ...tense('imperfect', sixOn('fac', IMPF_E)),
        ...tense('preterite', ['feci', 'facesti', 'fece', 'facemmo', 'faceste', 'fecero']),
        ...future('far'),
        ...subj('faccia', 'facciamo', 'facciate', 'facciano'),
        ...subjImpf(...sixOn('fac', SUBJ_IMPF_E)),
        ...imp(null, 'facciamo', null),
        gerund: 'facendo',
        'participle-present': ['facente', 'facenti'],
        ...participle('fatto'),
    }},
    // dire's past historic is read only with the prefixes of its compounds:
    // at the end of any word, -dissi, -disse and -dissero would also be the
    // imperfect subjunctive of -dire verbs (impedisse, tradisse, spedisse),
    // and the trace would name the wrong tense.
    {lemma: 'dire', mode: ['bene', 'male', 'pre', 'contrad', 'ri', 'dis', 'inter', 'in'], forms: {
        ...tense('preterite', ['dissi', null, 'disse', null, null, 'dissero']),
    }},
    {lemma: 'dire', mode: 'compound', forms: {
        ...tense('present', ['dico', 'dici', 'dice', 'diciamo', 'dite', 'dicono']),
        ...tense('imperfect', sixOn('dic', IMPF_E)),
        ...tense('preterite', [null, 'dicesti', null, 'dicemmo', 'diceste', null]),
        ...future('dir'),
        ...subj('dica', 'diciamo', 'diciate', 'dicano'),
        ...subjImpf(...sixOn('dic', SUBJ_IMPF_E)),
        ...imp(null, 'diciamo', 'dite'),
        gerund: 'dicendo',
        'participle-present': ['dicente', 'dicenti'],
        ...participle('detto'),
    }},
    {lemma: 'bere', mode: 'compound', forms: {
        ...tense('present', sixOn('bev', ['o', 'i', 'e', 'iamo', 'ete', 'ono'])),
        ...tense('imperfect', sixOn('bev', IMPF_E)),
        ...tense('preterite', [['bevvi', 'bevetti'], 'bevesti', ['bevve', 'bevette'], 'bevemmo', 'beveste', ['bevvero', 'bevettero']]),
        ...future('berr'),
        ...subj('beva', 'beviamo', 'beviate', 'bevano'),
        ...subjImpf(...sixOn('bev', SUBJ_IMPF_E)),
        ...imp('bevi', 'beviamo', 'bevete'),
        gerund: 'bevendo',
        'participle-present': ['bevente', 'beventi'],
        ...participle('bevuto'),
    }},
    {lemma: 'venire', mode: 'compound', forms: {
        ...tense('present', ['vengo', 'vieni', 'viene', null, null, 'vengono']),
        ...tense('preterite', ['venni', null, 'venne', null, null, 'vennero']),
        ...future('verr'),
        ...subj('venga', null, null, 'vengano'),
        ...imp('vieni', null, null),
        ...participle('venuto'),
    }},
    {lemma: 'tenere', mode: 'compound', forms: {
        ...tense('present', ['tengo', 'tieni', 'tiene', null, null, 'tengono']),
        ...tense('preterite', ['tenni', null, 'tenne', null, null, 'tennero']),
        ...future('terr'),
        ...subj('tenga', null, null, 'tengano'),
        ...imp('tieni', null, null),
    }},
    {lemma: 'uscire', mode: 'compound', forms: {
        ...tense('present', ['esco', 'esci', 'esce', null, null, 'escono']),
        ...subj('esca', null, null, 'escano'),
        ...imp('esci', null, null),
    }},
    {lemma: 'salire', mode: 'compound', forms: {
        ...tense('present', ['salgo', null, null, null, null, 'salgono']),
        ...subj('salga', null, null, 'salgano'),
    }},
    {lemma: 'rimanere', mode: 'compound', forms: {
        ...tense('present', ['rimango', null, null, null, null, 'rimangono']),
        ...tense('preterite', ['rimasi', null, 'rimase', null, null, 'rimasero']),
        ...future('rimarr'),
        ...subj('rimanga', null, null, 'rimangano'),
        ...participle('rimasto'),
    }},
    {lemma: 'valere', mode: 'compound', forms: {
        ...tense('present', ['valgo', null, null, null, null, 'valgono']),
        ...future('varr'),
        ...subj('valga', null, null, 'valgano'),
    }},
    {lemma: 'parere', mode: 'compound', forms: {
        ...tense('present', ['paio', null, null, 'paiamo', null, 'paiono']),
        ...future('parr'),
        ...subj('paia', 'paiamo', 'paiate', 'paiano'),
    }},
    // apparire and comparire (also apparisco, comparisco, through -isc-).
    {lemma: 'apparire', mode: 'compound', forms: {
        ...tense('present', ['appaio', null, null, null, null, 'appaiono']),
        ...subj('appaia', null, null, 'appaiano'),
        ...tense('preterite', [['apparvi', 'apparsi'], null, ['apparve', 'apparse'], null, null, ['apparvero', 'apparsero']]),
        ...participle('apparso'),
    }},
    {lemma: 'comparire', mode: 'compound', forms: {
        ...tense('present', ['compaio', null, null, null, null, 'compaiono']),
        ...subj('compaia', null, null, 'compaiano'),
        ...tense('preterite', [['comparvi', 'comparsi'], null, ['comparve', 'comparse'], null, null, ['comparvero', 'comparsero']]),
        ...participle('comparso'),
    }},
    {lemma: 'dolere', mode: 'compound', forms: {
        ...tense('present', ['dolgo', 'duoli', 'duole', null, null, 'dolgono']),
        ...future('dorr'),
        ...subj('dolga', null, null, 'dolgano'),
    }},
    {lemma: 'morire', mode: 'compound', forms: {
        ...tense('present', ['muoio', 'muori', 'muore', null, null, 'muoiono']),
        ...future('morr'),
        ...subj('muoia', null, null, 'muoiano'),
        ...imp('muori', null, null),
        ...participle('morto'),
    }},
    {lemma: 'udire', mode: 'whole', forms: {
        ...tense('present', ['odo', 'odi', 'ode', null, null, 'odono']),
        ...future('udr'),
        ...subj('oda', null, null, 'odano'),
        ...imp('odi', null, null),
    }},
    {lemma: 'sedere', mode: 'compound', forms: {
        ...tense('present', [['siedo', 'seggo'], 'siedi', 'siede', null, null, ['siedono', 'seggono']]),
        ...future('sieder'),
        ...subj(['sieda', 'segga'], null, null, ['siedano', 'seggano']),
        ...imp('siedi', null, null),
    }},
    {lemma: 'nuocere', mode: 'whole', forms: {
        ...tense('present', [['noccio', 'nuoccio'], 'nuoci', 'nuoce', ['nociamo', 'nuociamo'], ['nocete', 'nuocete'], ['nocciono', 'nuocciono']]),
        ...tense('preterite', ['nocqui', null, 'nocque', null, null, 'nocquero']),
        ...subj(['noccia', 'nuoccia'], null, null, ['nocciano', 'nuocciano']),
        ...participle('nociuto'),
    }},
    {lemma: 'cuocere', mode: 'compound', forms: {
        ...tense('present', ['cuocio', null, null, 'cociamo', 'cocete', 'cuociono']),
        ...subj('cuocia', null, null, 'cuociano'),
    }},
    // muovere, cuocere, nuocere and scuotere may write o for uo where the
    // stress falls on the ending (moviamo, moverò, cocevo, scotendo).
    ...[['muovere', 'mov'], ['cuocere', 'coc'], ['nuocere', 'noc'], ['scuotere', 'scot'], ['percuotere', 'percot']].map(([lemma, stem]) => ({
        lemma, mode: 'compound', forms: {
            ...tense('present', [null, null, null, stem + 'iamo', stem + 'ete', null]),
            ...tense('imperfect', sixOn(stem, IMPF_E)),
            ...future(stem + 'er'),
            ...subjImpf(...sixOn(stem, SUBJ_IMPF_E)),
            gerund: stem + 'endo',
            'participle-present': [stem + 'ente', stem + 'enti'],
        }})),
    // porre, trarre and -durre: every form, at the end of any word (propongo,
    // distraevo, produssi); -durre has no verb without a prefix. The
    // compounds of porre have a prefix of two letters or more (esporre,
    // proporre), so sposi, spose and sposto are not s + porre (sposare,
    // spostare); its own forms are whole words (PORRE below).
    {lemma: 'porre', mode: 'compound', minStem: 2, forms: {
        ...tense('present', sixOn('pon', ['go', 'i', 'e', 'iamo', 'ete', 'gono'])),
        ...tense('imperfect', sixOn('pon', IMPF_E)),
        ...tense('preterite', ['posi', 'ponesti', 'pose', 'ponemmo', 'poneste', 'posero']),
        ...future('porr'),
        ...subj('ponga', 'poniamo', 'poniate', 'pongano'),
        ...subjImpf(...sixOn('pon', SUBJ_IMPF_E)),
        ...imp('poni', 'poniamo', 'ponete'),
        gerund: 'ponendo',
        'participle-present': ['ponente', 'ponenti'],
        ...participle('posto'),
    }},
    {lemma: 'trarre', mode: 'compound', forms: {
        ...tense('present', ['traggo', 'trai', 'trae', 'traiamo', 'traete', 'traggono']),
        ...tense('imperfect', sixOn('tra', IMPF_E)),
        ...tense('preterite', ['trassi', 'traesti', 'trasse', 'traemmo', 'traeste', 'trassero']),
        ...future('trarr'),
        ...subj('tragga', 'traiamo', 'traiate', 'traggano'),
        ...subjImpf(...sixOn('tra', SUBJ_IMPF_E)),
        ...imp('trai', 'traiamo', 'traete'),
        gerund: 'traendo',
        'participle-present': ['traente', 'traenti'],
        ...participle('tratto'),
    }},
    {lemma: 'durre', mode: 'compound', minStem: 2, forms: {
        ...tense('present', sixOn('duc', ['o', 'i', 'e', 'iamo', 'ete', 'ono'])),
        ...tense('imperfect', sixOn('duc', IMPF_E)),
        ...tense('preterite', ['dussi', 'ducesti', 'dusse', 'ducemmo', 'duceste', 'dussero']),
        ...future('durr'),
        ...subj('duca', 'duciamo', 'duciate', 'ducano'),
        ...subjImpf(...sixOn('duc', SUBJ_IMPF_E)),
        ...imp('duci', 'duciamo', 'ducete'),
        gerund: 'ducendo',
        'participle-present': ['ducente', 'ducenti'],
        ...participle('dotto'),
    }},
];

// compiere, adempiere, empiere and riempiere take the endings of -ire verbs
// in most persons (compio, compiamo, compirò, compii, compì, compiuto).
IRREGULAR.push({lemma: 'mpiere', mode: 'compound', minStem: 1, forms: {
    ...tense('present', ['mpio', 'mpi', 'mpie', 'mpiamo', 'mpite', 'mpiono']),
    ...tense('imperfect', sixOn('mpiv', ['o', 'i', 'a', 'amo', 'ate', 'ano'])),
    ...tense('preterite', sixOn('mp', ['ii', 'isti', 'ì', 'immo', 'iste', 'irono'])),
    ...future('mpir'),
    ...subj('mpia', 'mpiamo', 'mpiate', 'mpiano'),
    ...subjImpf(...sixOn('mp', ['issi', 'isse', 'issimo', 'iste', 'issero'])),
    gerund: 'mpiendo',
    ...participle('mpiuto'),
}});

// porre's own forms, as whole words (pongo, posi, porrò, posto).
IRREGULAR.push({...IRREGULAR.find((entry) => entry.lemma === 'porre'), mode: 'whole', minStem: 0});

// Future and conditional stems that drop or change the e or i of the
// infinitive (vedrò, vivrò, cadrò, rimarrò, terrò).
for (const [stem, lemma] of [['vedr', 'vedere'], ['vivr', 'vivere'], ['cadr', 'cadere'], ['godr', 'godere']]) {
    IRREGULAR.push({lemma, mode: 'compound', forms: future(stem)});
}

// The strong past historic (first and third person singular, third person
// plural) and past participle of -ere verbs and some -ire verbs; the other
// persons are regular (presi, prendesti, prese, prendemmo, prendeste,
// presero). At the end of any word, so compounds share them (compresi,
// sorpreso, riconobbi, interruppe). An empty participle is regular.
const STRONG = [
    ['prendere', 'presi', 'preso'], ['rendere', 'resi', 'reso'], ['scendere', 'scesi', 'sceso'], ['spendere', 'spesi', 'speso'],
    ['accendere', 'accesi', 'acceso'], ['offendere', 'offesi', 'offeso'], ['difendere', 'difesi', 'difeso'], ['tendere', 'tesi', 'teso'],
    ['appendere', 'appesi', 'appeso'], ['dipendere', 'dipesi', 'dipeso'], ['sospendere', 'sospesi', 'sospeso'], ['espandere', 'espansi', 'espanso'],
    ['ridere', 'risi', 'riso'], ['dividere', 'divisi', 'diviso'], ['uccidere', 'uccisi', 'ucciso'], ['decidere', 'decisi', 'deciso'],
    ['incidere', 'incisi', 'inciso'], ['coincidere', 'coincisi', 'coinciso'], ['chiudere', 'chiusi', 'chiuso'], ['concludere', 'conclusi', 'concluso'],
    ['escludere', 'esclusi', 'escluso'], ['includere', 'inclusi', 'incluso'], ['illudere', 'illusi', 'illuso'], ['deludere', 'delusi', 'deluso'],
    ['alludere', 'allusi', 'alluso'], ['eludere', 'elusi', 'eluso'], ['accludere', 'acclusi', 'accluso'], ['precludere', 'preclusi', 'precluso'],
    ['persuadere', 'persuasi', 'persuaso'], ['dissuadere', 'dissuasi', 'dissuaso'], ['evadere', 'evasi', 'evaso'], ['invadere', 'invasi', 'invaso'],
    ['radere', 'rasi', 'raso'], ['rodere', 'rosi', 'roso'], ['esplodere', 'esplosi', 'esploso'], ['chiedere', 'chiesi', 'chiesto'],
    ['spondere', 'sposi', 'sposto'], ['scondere', 'scosi', 'scosto'], ['fondere', 'fusi', 'fuso'], ['mettere', 'misi', 'messo'],
    ['sistere', '', 'sistito'],
    ['scrivere', 'scrissi', 'scritto'], ['leggere', 'lessi', 'letto'], ['eleggere', 'elessi', 'eletto'], ['reggere', 'ressi', 'retto'],
    ['correggere', 'corressi', 'corretto'], ['proteggere', 'protessi', 'protetto'], ['distruggere', 'distrussi', 'distrutto'],
    ['friggere', 'frissi', 'fritto'], ['fliggere', 'flissi', 'flitto'], ['sconfiggere', 'sconfissi', 'sconfitto'],
    ['trafiggere', 'trafissi', 'trafitto'], ['crocifiggere', 'crocifissi', 'crocifisso'], ['trudere', 'trusi', 'truso'],
    ['eccellere', 'eccelsi', 'eccelso'],
    ['dirigere', 'diressi', 'diretto'], ['erigere', 'eressi', 'eretto'], ['redigere', 'redassi', 'redatto'], ['esigere', '', 'esatto'],
    ['piangere', 'piansi', 'pianto'], ['giungere', 'giunsi', 'giunto'], ['pungere', 'punsi', 'punto'], ['ungere', 'unsi', 'unto'],
    ['spingere', 'spinsi', 'spinto'], ['fingere', 'finsi', 'finto'], ['dipingere', 'dipinsi', 'dipinto'], ['cingere', 'cinsi', 'cinto'],
    ['stringere', 'strinsi', 'stretto'], ['tingere', 'tinsi', 'tinto'], ['spegnere', 'spensi', 'spento'], ['accorgere', 'accorsi', 'accorto'],
    ['porgere', 'porsi', 'porto'], ['sorgere', 'sorsi', 'sorto'], ['emergere', 'emersi', 'emerso'], ['immergere', 'immersi', 'immerso'],
    ['sommergere', 'sommersi', 'sommerso'], ['spargere', 'sparsi', 'sparso'], ['volgere', 'volsi', 'volto'], ['vincere', 'vinsi', 'vinto'],
    ['torcere', 'torsi', 'torto'], ['cuocere', 'cossi', 'cotto'], ['scuotere', 'scossi', 'scosso'], ['percuotere', 'percossi', 'percosso'],
    ['muovere', 'mossi', 'mosso'], ['vivere', 'vissi', 'vissuto'], ['scegliere', 'scelsi', 'scelto'], ['togliere', 'tolsi', 'tolto'],
    ['cogliere', 'colsi', 'colto'], ['sciogliere', 'sciolsi', 'sciolto'], ['valere', 'valsi', 'valso'], ['parere', 'parvi', 'parso'],
    ['dolere', 'dolsi', ''], ['correre', 'corsi', 'corso'], ['perdere', 'persi', 'perso'], ['mordere', 'morsi', 'morso'],
    ['ardere', 'arsi', 'arso'], ['espellere', 'espulsi', 'espulso'], ['primere', 'pressi', 'presso'], ['redimere', 'redensi', 'redento'],
    ['sumere', 'sunsi', 'sunto'], ['connettere', 'connessi', 'connesso'], ['annettere', 'annessi', 'annesso'], ['riflettere', 'riflessi', 'riflesso'],
    ['nascere', 'nacqui', 'nato'], ['conoscere', 'conobbi', ''], ['crescere', 'crebbi', ''], ['rompere', 'ruppi', 'rotto'],
    ['cadere', 'caddi', ''], ['vedere', 'vidi', 'visto'], ['succedere', 'successi', 'successo'], ['concedere', 'concessi', 'concesso'],
    ['discutere', 'discussi', 'discusso'], ['risolvere', 'risolsi', 'risolto'], ['assolvere', 'assolsi', 'assolto'], ['scindere', 'scissi', 'scisso'],
    ['ledere', 'lesi', 'leso'], ['elidere', 'elisi', 'eliso'], ['intridere', 'intrisi', 'intriso'], ['aprire', 'apersi', 'aperto'],
    ['coprire', 'copersi', 'coperto'], ['offrire', 'offersi', 'offerto'], ['soffrire', 'soffersi', 'sofferto'],
];
for (const [lemma, preterite, pp] of STRONG) {
    const forms = {};
    if (preterite !== '') {
        const stem = preterite.slice(0, -1);
        forms['preterite-io'] = preterite;
        forms['preterite-lui'] = stem + 'e';
        forms['preterite-loro'] = stem + 'ero';
    }
    if (pp !== '') { Object.assign(forms, participle(pp)); }
    if (Object.keys(forms).length > 0) {
        // -primere, -sumere, -fliggere and -trudere have no common verb
        // without a prefix (esprimere, assumere, affliggere, protrudere),
        // so their stem is two letters or more;
        // -spondere, -scondere and -sistere one (rispondere, nascondere,
        // ascondere, esistere, assistere).
        const minStem = /^(primere|sumere|fliggere|trudere)$/u.test(lemma) ? 2 : /^(spondere|scondere|sistere)$/u.test(lemma) ? 1 : 0;
        IRREGULAR.push({lemma, mode: 'compound', minStem, forms});
    }
}

// fare, dare, dire and bere: their written-out forms after a pronoun carry
// the short_* conditions.
const SHORT_LEMMAS = new Set(['fare', 'dare', 'dire', 'bere']);
// The compounds of fare are read from their forms at the end of a word, but
// not after a stem that ends in f (affaccia, affaccio and affatto are not af
// + fare, si affaccia is not affarsi); contraffare and sopraffare, whose
// stem does, are written out from the same forms (contraffaccio,
// sopraffatto, si contraffaranno).
const SPLITS = {fare: [{stemNotEndsWith: '[f]'}]};
const F_COMPOUNDS = ['contraf', 'sopraf'];
for (const {lemma, mode, minStem = 0, forms: table} of IRREGULAR) {
    for (const [slot, value] of Object.entries(table)) {
        if (!PERSONS.has(slot)) { throw new Error(`${lemma}: no slot ${slot}`); }
        for (const form of [value].flat().filter((f) => f !== null && f !== undefined)) {
            if (mode === 'whole') {
                whole(slot, form, lemma, inFor(slot), outFor(slot));
            } else if (mode === 'compound') {
                const base = minStem > 0 ? {stemMinLength: minStem} : {};
                for (const split of SPLITS[lemma] ?? [{}]) {
                    forms(slot, form, lemma, {...base, ...split}, SHORT_LEMMAS.has(lemma));
                }
                if (lemma === 'fare') {
                    for (const prefix of F_COMPOUNDS) {
                        forms(slot, prefix + form, prefix + lemma, base, true);
                    }
                }
            } else {
                // The short forms of fare, dare and stare: as words, after a
                // pronoun (si fa, ci sta), and with the prefixes of their
                // compounds (rifà, soddisfanno, sottostà).
                whole(slot, form, lemma, inFor(slot), outFor(slot));
                const persons = PERSONS.get(slot);
                // After a marked pronoun the form is the whole verb (si+fa):
                // the stem ends with the mark.
                const marked = (written, lemma2, outs) => suffix(slot, written, lemma2, ['refl'], outs, {stemEndsWith: '[+]'});
                if (persons.length > 0) {
                    marked(form, lemma, SHORT_LEMMAS.has(lemma) ? persons.map((p) => SHORT[p]) : persons);
                }
                for (const prefix of mode) {
                    // The compounds of fa, da and sta are written with an
                    // accent (rifà, ridà, sottostà) and often without one;
                    // ridò keeps its accent (rido is ridere).
                    const short = /^(fa|dà|sta)$/u.test(form);
                    const spellings = short ? [form.replace(/à$/u, 'a'), form.replace(/a$/u, 'à')] : form === 'do' ? ['dò'] : [form];
                    for (const written of spellings) {
                        whole(slot, prefix + written, prefix + lemma, inFor(slot), outFor(slot));
                        if (persons.length > 0) {
                            marked(prefix + written, prefix + lemma, persons);
                        }
                    }
                }
            }
        }
    }
}

// The present participle with an attached si (misurantesi, occupantisi).
for (const [inflected, deinflected] of [['antesi', 'arsi'], ['antisi', 'arsi'], ['entesi', 'ersi'], ['entisi', 'ersi'], ['entesi', 'irsi'], ['entisi', 'irsi']]) {
    verb('participle-present', inflected, deinflected);
}
// The past participle of a pronominal verb, looked up in its -rsi form, one
// step after the infinitive (pentito → pentire → pentirsi, inginocchiata →
// inginocchiare → inginocchiarsi, messo → mettere → mettersi). The participle
// rules below write that infinitive with a % before it, which no text or
// dictionary has, and the -rsi rule reads only such a text: so an infinitive
// as written (alzare, mi devo alzare) never gives the -rsi verb, and a
// dictionary's one-step reading of the same word comes first (alzati is
// traced as the imperative wty-it-en names, not as a participle).
// comperare is an old spelling of comprare that wty-it-en lists only as a
// reference to it, so comperato reached comperarsi before comprare (23 of the
// rule's 26 wrong first results in 752,265 lookups of five Gutenberg texts
// and Tatoeba); the stem is left out.
transform('participle-pronominal', 'past participle (-rsi verb)', 'The past participle of a pronominal verb, looked up in its -rsi form: pentito → pentirsi, vergognata → vergognarsi, inginocchiati → inginocchiarsi.');
const PTCP_MARK = '%';
const marked = (inflected, deinflected, extra) => add('participle', {type: 'circumfix', inflectedPrefix: '', deinflectedPrefix: PTCP_MARK,
    inflectedSuffix: inflected, deinflectedSuffix: deinflected, conditionsIn: [], conditionsOut: ['ptcp'], stemCharacters: '{lower}', ...extra});
for (const [vowel, cls] of [['a', 'are'], ['u', 'ere'], ['i', 'ire']]) {
    for (const tail of ['o', 'a', 'i', 'e']) {
        const splits = cls === 'are' ? [{stemNotStartsWith: '[c]'}, {stemStartsWith: '[c]', stemNotStartsWithText: 'comper'}] : [{}];
        for (const split of splits) { marked(`${vowel}t${tail}`, cls, {stemMinLength: 2, ...split}); }
    }
}
// The strong participles of the irregular tables, with the same stems
// (messo, permesso, accorto, posto).
for (const {lemma, mode, minStem = 0, forms: table} of IRREGULAR) {
    if (mode !== 'compound' || table.participle === undefined) { continue; }
    for (const form of table.participle) {
        for (const split of SPLITS[lemma] ?? [{}]) { marked(form, lemma, {...(minStem > 0 ? {stemMinLength: minStem} : {}), ...split}); }
    }
}
add('participle-pronominal', {type: 'circumfix', prefixes: [[PTCP_MARK, '']],
    suffixes: [['are', 'arsi'], ['ere', 'ersi'], ['ire', 'irsi'], ['rre', 'rsi']], conditionsIn: ['ptcp'], conditionsOut: ['v']});

// --- Enclitic pronouns -------------------------------------------------------------------
// Pronouns written after an infinitive (which loses its final e: farlo,
// vederti, porlo, condurla), a gerund (dicendomi, facendone) or an
// affirmative imperative of tu, noi and voi (guardalo, prendimi, facciamolo,
// ditemi). One transform per pronoun or pair: an indirect or reflexive one
// (me, te, se, ce, ve, glie) before a direct one or ne (dimmelo, darglielo,
// andarsene, cavarsela). A clitic rule removes the pronouns and marks what
// is left as the verb they followed (clinf, ger, imp); the infinitive,
// gerund and imperative rules then read it (farlo → far → fare).
//
// A reflexive pronoun also gives the -rsi verb, one step later than the verb
// itself (lavarmi → lavare, then → lavarsi), because it is often an object
// (dirmi, tell me). The clitic rule moves it before the verb with a + (si+,
// se+ne+, se+la+), the verb rules read the verb, and the pronominal rule
// gives the -rsi verb. With an imperative the pronoun must agree with its
// person: ti with tu (alzati), ci with noi (alziamoci), vi with voi
// (alzatevi); alzami (lift me) is only alzare.
const SINGLE = ['mi', 'ti', 'si', 'ci', 'vi', 'lo', 'la', 'li', 'le', 'gli', 'ne'];
const INDIRECT = ['me', 'te', 'se', 'ce', 've', 'glie'];
const DIRECT = ['lo', 'la', 'li', 'le', 'ne'];
const CLUSTERS = [...SINGLE.map((p) => [p]), ...INDIRECT.flatMap((p) => DIRECT.map((d) => [p, d]))];
// The reflexive pronoun of a cluster (me, te, se, ce, ve are the forms of mi,
// ti, si, ci, vi before another pronoun), or null.
const REFLEXIVE_OF = {mi: 'mi', ti: 'ti', si: 'si', ci: 'ci', vi: 'vi', me: 'mi', te: 'ti', se: 'si', ce: 'ci', ve: 'vi'};
// The + marker a reflexive cluster becomes: si+ for one pronoun (any person:
// lavarmi, lavarti and lavarsi are all lavarsi), se+X+ for a pair
// (andarmene → se+ne+, cavarsela → se+la+). Imperatives keep the person.
function marker(pronouns, person = 'si') {
    if (pronouns.length === 1) { return `${person}+`; }
    return `${{si: 'se', ti: 'te', ci: 'ce', vi: 've'}[person]}+${pronouns[1]}+`;
}
const IMPERATIVE_OF = {ti: 'imp_tu', ci: 'imp_noi', vi: 'imp_voi'};
// The verb before the pronouns is one word that ends in r (an infinitive
// without its e), o (a gerund, facciamo) or another vowel (guarda, prendi,
// fate), so the rules never turn the last word of a phrase into another
// phrase (modo di farsi is not modo di fare), and casi and baci are not ca
// + si and ba + ci (the infinitive, gerund and imperative rules need longer
// stems).
const CLITIC_HOST = {stemCharacters: '{lower}', stemEndsWith: '[aeior]', stemMinLength: 2};
// Monosyllabic imperatives double the pronoun's first consonant (dammi,
// dillo, fallo, stacci, vattene); gli does not (dagli, diglielo).
const MONOSYLLABIC = [['da', "da'", 'dare'], ['di', "di'", 'dire'], ['fa', "fa'", 'fare'], ['sta', "sta'", 'stare'], ['va', "va'", 'andare']];
for (const [, written, lemma] of MONOSYLLABIC) {
    suffix('imperative-tu', written, lemma, inFor('imperative-tu'), outFor('imperative-tu'));
}
for (const pronouns of CLUSTERS) {
    const cluster = pronouns.join('');
    const id = `clitic-${cluster}`;
    const reflexive = REFLEXIVE_OF[pronouns[0]] ?? null;
    transform(id, pronouns.map((p) => `+${p}`).join(' '),
        `${pronouns.length === 2 ? 'The pronouns' : 'The pronoun'} ${pronouns.join(' and ')} attached to an infinitive, a gerund or an imperative: ` +
        `${['parlar', 'dicendo', 'guarda'].map((host) => host + cluster).join(', ')}.`);
    // si and se (third person) never follow an imperative of tu, noi or voi.
    const hosts = reflexive === 'si' ? ['clinf', 'ger'] : ['clinf', 'ger', 'imp'];
    suffix(id, cluster, '', [], hosts, CLITIC_HOST);
    if (reflexive !== null) {
        add(id, {type: 'circumfix', inflectedPrefix: '', deinflectedPrefix: marker(pronouns), inflectedSuffix: cluster, deinflectedSuffix: '',
            conditionsIn: [], conditionsOut: ['clinf', 'ger'], ...CLITIC_HOST});
    }
    const agreeing = IMPERATIVE_OF[reflexive];
    if (agreeing !== undefined) {
        add(id, {type: 'circumfix', inflectedPrefix: '', deinflectedPrefix: marker(pronouns, reflexive), inflectedSuffix: cluster,
            deinflectedSuffix: '', conditionsIn: [], conditionsOut: [agreeing], ...CLITIC_HOST, stemEndsWith: '[aeio]'});
    }
    if (reflexive === 'si') { continue; }
    for (const [base, written] of MONOSYLLABIC) {
        // dalla, dallo, dalle, dalli and dagli are the preposition da with an
        // article; stalla, stallo, valle and vallo are nouns.
        if (base === 'da' && ['lo', 'la', 'li', 'le', 'gli'].includes(cluster)) { continue; }
        if ((base === 'sta' || base === 'va') && ['lo', 'la', 'li', 'le'].includes(cluster)) { continue; }
        const doubled = cluster.startsWith('gli') ? cluster : cluster[0] + cluster;
        whole(id, base + doubled, written, [], ['imp']);
        if (reflexive === 'ti') {
            whole(id, base + doubled, marker(pronouns, 'ti') + written, [], ['imp_tu']);
        }
    }
}
// The infinitive the clitic rules leave without its final e: parlar(lo),
// veder(ti), dormir(ne), por(lo), condur(la), trar(ne); the stem before -ar,
// -er and -ir has two letters or more, fare, dare, dire and bere one. After a
// moved pronoun (si+lavar) it gives the verb the pronominal rule reads.
transform('infinitive', 'infinitive', 'An infinitive that lost its final e before an attached pronoun: parlarlo, vederti, dormirne, porlo, condurla, farlo.');
for (const [inflected, deinflected, constraint] of [
    ['ar', 'are', {stemMinLength: 2}], ['er', 'ere', {stemMinLength: 2}], ['ir', 'ire', {stemMinLength: 2}],
    ['or', 'orre', {stemEndsWith: '[p]'}], ['ur', 'urre', {stemEndsWith: '[d]'}], ['ar', 'arre', {stemEndsWith: '[r]'}],
    ['far', 'fare', {}], ['dar', 'dare', {}], ['dir', 'dire', {}], ['ber', 'bere', {}],
]) {
    suffix('infinitive', inflected, deinflected, ['clinf'], ['v'], {...constraint, stemCharacters: '{lower}'});
    suffix('infinitive', inflected, deinflected, ['clinf'], ['v'], {...constraint, stemContains: '[+]'});
}

// The irregular gerunds, at the end of any word (rifacendo, proponendo,
// distraendo, producendo) and after a pronoun the clitic rules moved (si+).
for (const [form, lemma, min] of [['dando', 'dare', 0], ['facendo', 'fare', 0], ['dicendo', 'dire', 0], ['bevendo', 'bere', 0],
    ['ponendo', 'porre', 0], ['traendo', 'trarre', 0], ['ducendo', 'durre', 2]]) {
    forms('gerund', form, lemma, min > 0 ? {stemMinLength: min} : {}, false);
}

// --- Pronominal verbs ---------------------------------------------------------------------
// A pronoun written before a verb is marked first (mi lavo → mi+lavo, refl),
// the verb rules then read the marked verb and give its person, and a
// pronominal rule turns the phrase into the -rsi verb when the pronoun agrees
// with that person (mi+lavare, p1s → lavarsi). The mark keeps the phrase as
// written away from the pronominal rules: a rule whose conditionsIn holds a
// person also applies to a text without conditions (docs/languages.md 7.2),
// which would read mi compare (it appears to me) as the infinitive compare.
transform('proclitic', 'pronoun before the verb', 'A pronoun written before a verb: mi lavo, ti ricordi, si accorge, ci vuole, ' +
    "se ne va, me la cavo, c'entra, m'alzo.");
transform('pronominal', '-rsi verb', 'A verb with a reflexive pronoun before it or attached to it, looked up in its -rsi form: mi lavo → lavarsi, ' +
    'ti ricordi → ricordarsi, se ne va → andarsene, me la cavo → cavarsela, alzati → alzarsi.');
const PERSON = {mi: 'p1s', ti: 'p2s', si: 'p3', ci: 'p1p', vi: 'p2p'};
const BEFORE = {mi: 'me', ti: 'te', si: 'se', ci: 'ce', vi: 've'};
const ELIDED = {mi: "m'", ti: "t'", si: "s'", ci: "c'", vi: "v'"};
const ANY_PERSON = Object.values(PERSON);
const ANY_SHORT = Object.values(SHORT);
// The marks: one pronoun (mi lavo, m'alzo) and the pairs before ne and la
// (me ne vado, ce la faccio).
for (const pronoun of Object.keys(PERSON)) {
    add('proclitic', {type: 'prefix', inflected: pronoun + ' ', deinflected: pronoun + '+', conditionsIn: [], conditionsOut: ['refl']});
    add('proclitic', {type: 'prefix', inflected: ELIDED[pronoun], deinflected: pronoun + '+', conditionsIn: [], conditionsOut: ['refl']});
    for (const direct of ['ne', 'la']) {
        add('proclitic', {type: 'prefix', inflected: `${BEFORE[pronoun]} ${direct} `, deinflected: `${BEFORE[pronoun]}+${direct}+`,
            conditionsIn: [], conditionsOut: ['refl']});
    }
}
// The infinitive endings. The verb's own stem is letters and three or more
// of them, so a pronoun before a short or misread word gives no -rsi verb
// through a regular ending (si scava is not sc + ava, scarsi). Only the forms
// of porre, condurre and trarre and their compounds give -orre, -urre and
// -arre, so those take the stems of those verbs: p alone or three letters or
// more (si pose, si espose; mi sposi is not sp + orre, sporsi), three or more
// (si conduce, si riduce), tr alone or four or more (si trae, si distrae).
const VERB_STEM = {stemMinLength: 3};
// -arre takes only the compounds of trarre, written out: a -trare verb's
// imperfect subjunctive also reads as a trarre compound (mostrasse as
// mos + trasse), whose -arsi form would be the -trare verb's with a wrong
// trace.
const TRARRE_VERBS = ['trarre', 'attrarre', 'astrarre', 'contrarre', 'detrarre', 'distrarre', 'estrarre', 'protrarre', 'ritrarre', 'sottrarre'];
const CLASSES = [
    [['are', 'ar'], ['ere', 'er'], ['ire', 'ir']],
    [['orre', 'or'], [{stemCharacters: '[p]', stemMinLength: 1}, {stemMinLength: 3}]],
    [['urre', 'ur'], [{stemMinLength: 3}]],
];
// The regular endings read a few stems of verbs that conjugate otherwise
// (sections above): after a pronoun, volere and ridare give no -rsi verb
// through them (si vola and se ne vola are volare, ti ridi is ridere), and
// volere's own forms are whole words, so it gives none at all; volerci and
// volercene are written out below (ci vuole, ce ne vuole).
const PRONOMINAL_EXCLUDED = {are: ['rid'], ere: ['vol']};
function pronominal(prefixes, tail, conditionsIn) {
    for (const [e, b] of CLASSES[0]) {
        const stems = PRONOMINAL_EXCLUDED[e] ?? [];
        const splits = stems.length === 0 ? [{}] : [{stemNotStartsWith: `[${stems.map((x) => x[0]).join('')}]`},
            ...stems.flatMap((stem) => [{stemStartsWith: `[${stem[0]}]`, stemNotStartsWithText: stem},
                {stemStartsWithText: stem, stemMinLength: [...stem].length + 1}])];
        for (const split of splits) {
            add('pronominal', {type: 'circumfix', prefixes: prefixes.map((p) => [p, '']), suffixes: [[e, b + tail]],
                conditionsIn, conditionsOut: ['v'], ...VERB_STEM, ...split});
        }
    }
    for (const [[e, b], constraints] of CLASSES.slice(1)) {
        for (const constraint of constraints) {
            add('pronominal', {type: 'circumfix', prefixes: prefixes.map((p) => [p, '']), suffixes: [[e, b + tail]],
                conditionsIn, conditionsOut: ['v'], ...constraint});
        }
    }
    add('pronominal', {type: 'circumfix', prefixes: prefixes.map((p) => [p, '']), suffixes: TRARRE_VERBS.map((v) => [v, v.replace(/rre$/u, 'r') + tail]),
        conditionsIn, conditionsOut: ['v'], stemCharacters: '[]'});
}
// Verbs whose stem has fewer than three letters are written out: fare, dare,
// dire and bere, from their written-out forms (short_*: si fa, si dice, me
// la bevo), and stare, amare, unire, usare and beare from any form (si sta,
// ci amiamo, si unisce, si usa). Their compounds keep them (si rifà).
const SHORT_VERBS = [['fare', 'far'], ['dare', 'dar'], ['dire', 'dir'], ['bere', 'ber']];
const SHORT_STEMS = [['stare', 'star'], ['amare', 'amar'], ['unire', 'unir'], ['usare', 'usar'], ['beare', 'bear']];
// A reflexive pronoun before stare is not stare's -rsi verb (si sta bene is
// impersonal, mi sto preparando is prepararsi, read below), so stare gives
// no starsi; starci and starsene stay (ci sta, se ne stava).
function shortPronominal(prefixes, tail, persons) {
    add('pronominal', {type: 'circumfix', prefixes: prefixes.map((p) => [p, '']), suffixes: SHORT_VERBS.map(([v, b]) => [v, b + tail]),
        conditionsIn: persons.map((p) => SHORT[p]), conditionsOut: ['v']});
    const stems = tail === 'si' ? SHORT_STEMS.filter(([v]) => v !== 'stare') : SHORT_STEMS;
    add('pronominal', {type: 'circumfix', prefixes: prefixes.map((p) => [p, '']), suffixes: stems.map(([v, b]) => [v, b + tail]),
        conditionsIn: persons, conditionsOut: ['v']});
}
// ce la + any person first: ce la faremo and ce la facciamo are farcela far
// more often than farsela (35 Tatoeba places), and the -sela readings of the
// other persons (me la cavo, te la prendi) have no -cela rival.
pronominal(['ce+la+'], 'cela', ANY_PERSON);
shortPronominal(['ce+la+'], 'cela', ANY_PERSON);
for (const [pronoun, person] of Object.entries(PERSON)) {
    // mi lavo, ti lavi, si lava, ci laviamo, vi lavate (lavarsi).
    pronominal([pronoun + '+'], 'si', [person]);
    shortPronominal([pronoun + '+'], 'si', [person]);
    // me ne vado (andarsene), me la cavo (cavarsela).
    for (const direct of ['ne', 'la']) {
        pronominal([`${BEFORE[pronoun]}+${direct}+`], `se${direct}`, [person]);
        shortPronominal([`${BEFORE[pronoun]}+${direct}+`], `se${direct}`, [person]);
    }
}
// The negative imperative of tu is non + the infinitive, with the pronoun
// before it: non ti preoccupare, non ti muovere (preoccuparsi, muoversi).
// Only ti: non mi lasciare is don't leave me.
// The infinitive is one word with the stems the other pronominal rules take
// (ti scorre is not ti + scorre, scorsi; ti pare is not parsi), or one of the
// short verbs (non ti fare, non ti dare).
for (const [e, b] of CLASSES[0]) {
    add('pronominal', {type: 'circumfix', prefixes: [['ti+', '']], suffixes: [[e, b + 'si']],
        conditionsIn: ['refl'], conditionsOut: ['v'], ...VERB_STEM, stemCharacters: '{lower}'});
}
for (const [[e, b], constraints] of CLASSES.slice(1)) {
    for (const constraint of constraints) {
        add('pronominal', {type: 'circumfix', prefixes: [['ti+', '']], suffixes: [[e, b + 'si']],
            conditionsIn: ['refl'], conditionsOut: ['v'], stemCharacters: '{lower}', ...constraint});
    }
}
add('pronominal', {type: 'circumfix', prefixes: [['ti+', '']], suffixes: TRARRE_VERBS.map((v) => [v, v.replace(/rre$/u, 'rsi')]),
    conditionsIn: ['refl'], conditionsOut: ['v'], stemCharacters: '[]'});
add('pronominal', {type: 'circumfix', prefixes: [['ti+', '']], suffixes: [...SHORT_VERBS, ...SHORT_STEMS].map(([v, b]) => [v, b + 'si']),
    conditionsIn: ['refl'], conditionsOut: ['v'], stemCharacters: '[]'});
// ci, ce ne and ce la before any person: esserci, volerci, metterci,
// entrarci, pensarci (ci vuole, ci metto, c'entra, ci penso),
// volercene, andarcene (ce ne vuole), farcela, cavarcela (ce la faccio).
for (const [prefix, tail] of [['ci+', 'ci'], ['ce+ne+', 'cene']]) {
    pronominal([prefix], tail, ANY_PERSON);
    shortPronominal([prefix], tail, ANY_PERSON);
}
// essere and volere are read only as whole words (si è and si vuole are not
// essersi and volersi), so their third persons after ci are written out:
// c'è, ci sono, c'era, ci sarà (esserci); ci vuole, ci vogliono, ci vorrà
// (volerci); ce ne vuole (volercene). ci siamo is left to the dictionary,
// whose row names essersi first: it is mostly the reflexive compound past
// (ci siamo sposati, ci siamo divertiti), 896 of its 1,068 Tatoeba places.
for (const [lemma, forms] of [
    ['esserci', ["c'è", 'ci sono', "c'era", "c'erano", 'ci sarà', 'ci saranno', 'ci sarebbe', 'ci sarebbero', 'ci fu', 'ci furono',
        'ci sia', 'ci siano', 'ci fosse', 'ci fossero', 'ci sei', 'ci siete']],
    ['volerci', ['ci vuole', 'ci vogliono', 'ci voleva', 'ci volevano', 'ci vorrà', 'ci vorranno', 'ci vorrebbe', 'ci vorrebbero',
        'ci volle', 'ci vollero', 'ci voglia', 'ci vogliano', 'ci volesse', 'ci volessero']],
    ['volercene', ['ce ne vuole', 'ce ne vogliono', 'ce ne voleva', 'ce ne volevano', 'ce ne vorrà', 'ce ne vorrebbe', 'ce ne volle']],
]) {
    for (const form of forms) { whole('pronominal', form, lemma, [], ['v']); }
}
// ce l'ho, ce l'hai, ce l'avevo (avercela) and ce l'ho fatta (farcela).
const AVERE_FORMS = ['ho', 'hai', 'ha', 'abbiamo', 'avete', 'hanno', ...sixOn('av', IMPF_E), ...sixOn('avr', FUT), ...sixOn('avr', COND),
    'abbia', 'abbiate', 'abbiano', ...sixOn('av', SUBJ_IMPF_E)];
for (const form of AVERE_FORMS) {
    whole('pronominal', `ce l'${form}`, 'avercela', [], ['v']);
}
for (const form of ['ho', 'hai', 'ha', 'abbiamo', 'avete', 'hanno', ...sixOn('av', IMPF_E), ...sixOn('avr', FUT)]) {
    whole('pronominal', `ce l'${form} fatta`, 'farcela', [], ['v']);
}
// se ne va and te ne vai: the short forms of andare after the pronouns.
for (const [text, lemma] of [['se ne va', 'andarsene'], ['te ne vai', 'andarsene'], ['se ne vada', 'andarsene']]) {
    whole('pronominal', text, lemma, [], ['v']);
}
// --- Clitic climbing --------------------------------------------------------------------
// A pronoun written before stare that belongs to the gerund after it (the
// progressive: mi sto preparando, si sta divertendo, ci stiamo avvicinando,
// se ne sta andando), or before a modal that belongs to the infinitive after
// it (mi devo alzare, ti puoi sedere, me ne voglio andare). When the pronoun
// agrees with the person of stare or of the modal, these rules drop that
// verb and keep the pronoun before the other one, which the gerund rules and
// the rule below read as the -rsi verb (prepararsi, divertirsi, alzarsi,
// andarsene). A pronoun that does not agree is an object (mi sta guardando,
// he is watching me; mi devi aiutare, you must help me), and gets no -rsi
// verb. A lone si before a modal is mostly impersonal (si può fare, si deve
// dire), so only its pairs take a modal (se ne deve andare).
transform('climbing', 'pronoun of the next verb', 'A pronoun before stare or a modal that belongs to the gerund or infinitive after it: ' +
    'mi sto preparando → prepararsi, si sta divertendo → divertirsi, mi devo alzare → alzarsi, me ne voglio andare → andarsene.');
const STARE_FORMS = {
    p1s: ['sto', 'stavo', 'starò', 'starei', 'stessi'],
    p2s: ['stai', 'stavi', 'starai', 'staresti', 'stessi'],
    p3: ['sta', 'stanno', 'stava', 'stavano', 'starà', 'staranno', 'starebbe', 'starebbero', 'stia', 'stiano', 'stesse', 'stessero'],
    p1p: ['stiamo', 'stavamo', 'staremo', 'staremmo', 'stessimo'],
    p2p: ['state', 'stavate', 'starete', 'stareste', 'steste'],
};
const MODAL_FORMS = {
    p1s: ['devo', 'debbo', 'dovevo', 'dovrò', 'dovrei', 'posso', 'potevo', 'potrò', 'potrei', 'voglio', 'volevo', 'vorrò', 'vorrei'],
    p2s: ['devi', 'dovevi', 'dovrai', 'dovresti', 'puoi', 'potevi', 'potrai', 'potresti', 'vuoi', 'volevi', 'vorrai', 'vorresti'],
    p3: ['deve', 'devono', 'doveva', 'dovevano', 'dovrà', 'dovranno', 'dovrebbe', 'dovrebbero', 'può', 'possono', 'poteva', 'potevano',
        'potrà', 'potranno', 'potrebbe', 'potrebbero', 'vuole', 'vogliono', 'voleva', 'volevano', 'vorrà', 'vorranno', 'vorrebbe', 'vorrebbero'],
    p1p: ['dobbiamo', 'dovevamo', 'dovremo', 'dovremmo', 'possiamo', 'potevamo', 'potremo', 'potremmo', 'vogliamo', 'volevamo', 'vorremo', 'vorremmo'],
    p2p: ['dovete', 'dovevate', 'dovrete', 'dovreste', 'potete', 'potevate', 'potrete', 'potreste', 'volete', 'volevate', 'vorrete', 'vorreste'],
};
for (const [pronoun, person] of Object.entries(PERSON)) {
    for (const mark of [`${pronoun}+`, `${BEFORE[pronoun]}+ne+`]) {
        // The gerund rules after a mark read one word (forms above).
        add('climbing', {type: 'circumfix', prefixes: STARE_FORMS[person].map((form) => [`${mark}${form} `, mark]),
            suffixes: [['ando', 'ando'], ['endo', 'endo']], conditionsIn: ['refl'], conditionsOut: ['ger']});
        if (mark === 'si+') { continue; }
        add('climbing', {type: 'circumfix', prefixes: MODAL_FORMS[person].map((form) => [`${mark}${form} `, mark]),
            suffixes: [['are', 'are'], ['ere', 'ere'], ['ire', 'ire'], ['rre', 'rre']], conditionsIn: ['refl'], conditionsOut: ['v'],
            stemCharacters: '{lower}'});
    }
}

// A pronoun the clitic rules moved before the verb (ti+alza → ti+alzare,
// se+ne+andare), or that the clitic-climbing rules kept before the verb it
// belongs to (mi+preparare): the verb rules give v, and the pronoun already
// agrees.
const MARKERS = [
    [['mi+', 'si+', 'ti+', 'ci+', 'vi+'], 'si'],
    ...DIRECT.map((d) => [['me', 'se', 'te', 'ce', 've'].map((p) => `${p}+${d}+`), `se${d}`]),
];
for (const [prefixes, tail] of MARKERS) {
    add('pronominal', {type: 'circumfix', prefixes: prefixes.map((p) => [p, '']),
        suffixes: [...CLASSES[0], CLASSES[1][0], CLASSES[2][0], ['arre', 'ar']].map(([e, b]) => [e, b + tail]),
        conditionsIn: ['v'], conditionsOut: ['v']});
}

// --- Nouns and adjectives ------------------------------------------------------------------
// The transforms of this section are created first (NOMINAL_FIRST, above).

const NOMINAL = ['n', 'adj'];
// Noun and adjective rules read one word, so the last word of a phrase is not
// read as another phrase (a casa is not a caso, se ne is not se no).
const ONE_WORD = {stemCharacters: '{lower}'};
// Plural endings: -o/-i, -a/-e, -e/-i, -a/-i (problema, poeta), the hard c
// and g of -co, -go, -ca, -ga (parchi, laghi, amiche, righe, duchi,
// colleghi), the soft ones of -co and -go (amici, psicologi), -cia and -gia
// after a consonant (arance, spiagge), and the unstressed -io (figli,
// occhi). The stem is two letters or more, so short function words are not
// plurals (dei, lei, noi, mai).
// For -i, the -e singular is tried before the -o one: where a word's rows name
// both (cani: cane and the archaic adjective cano; mesi: mese and meso), the
// -e noun is the frequent one far more often than not in it_50k.
for (const [inflected, deinflected, out] of [
    ['i', 'e', NOMINAL], ['i', 'o', NOMINAL], ['e', 'a', NOMINAL], ['i', 'a', NOMINAL],
    ['chi', 'co', NOMINAL], ['ghi', 'go', NOMINAL], ['che', 'ca', NOMINAL], ['ghe', 'ga', NOMINAL],
    ['chi', 'ca', ['n']], ['ghi', 'ga', ['n']], ['ci', 'co', NOMINAL], ['gi', 'go', NOMINAL],
    ['ce', 'cia', NOMINAL], ['ge', 'gia', NOMINAL], ['i', 'io', NOMINAL],
]) {
    suffix('plural', inflected, deinflected, [], out, {stemMinLength: 2, ...ONE_WORD});
}
// Loanwords with an English plural (computers, mainframes, yuppies); Italian
// writes most of them without -s.
suffix('plural', 's', '', [], ['n'], {stemMinLength: 3, ...ONE_WORD});
// Plurals that are not regular: uomini, dei, buoi, mogli, templi, and the
// feminine plurals in -a of masculine nouns in -o (uova, braccia, dita).
for (const [plural, singular] of [
    ['uomini', 'uomo'], ['dei', 'dio'], ['buoi', 'bue'], ['mogli', 'moglie'], ['templi', 'tempio'], ['superfici', 'superficie'],
    ['uova', 'uovo'], ['paia', 'paio'], ['centinaia', 'centinaio'], ['migliaia', 'migliaio'], ['mila', 'mille'], ['dita', 'dito'],
    ['braccia', 'braccio'], ['ginocchia', 'ginocchio'], ['labbra', 'labbro'], ['ossa', 'osso'], ['ciglia', 'ciglio'],
    ['sopracciglia', 'sopracciglio'], ['lenzuola', 'lenzuolo'], ['mura', 'muro'], ['urla', 'urlo'], ['grida', 'grido'],
    ['corna', 'corno'], ['membra', 'membro'], ['fondamenta', 'fondamento'], ['budella', 'budello'], ['miglia', 'miglio'],
    ['calcagna', 'calcagno'], ['cervella', 'cervello'], ['fusa', 'fuso'], ['gesta', 'gesto'], ['risa', 'riso'],
    ['orecchie', 'orecchio'],
]) {
    whole('plural', plural, singular, [], ['n']);
}
// bello and quello before a noun: begli, bei, quegli, quei (begli occhi, quei
// giorni). The article i, il's plural: wty-it-en has no entry for it, only
// form-of rows, the first of which it follows names the letter I.
for (const [plural, singular] of [['begli', 'bello'], ['bei', 'bello'], ['quegli', 'quello'], ['quei', 'quello'], ['i', 'il']]) {
    whole('plural', plural, singular, [], ['adj']);
}
// Feminine adjectives in -a; nouns for people in -trice, -essa, -ona, -iera
// and -ora (attrice → attore, studentessa → studente, poetessa → poeta,
// padrona → padrone, infermiera → infermiere, signora → signore).
suffix('feminine', 'a', 'o', [], ['adj'], {stemMinLength: 2, ...ONE_WORD});
// These also read the singular the plural rule gives (attrici → attrice →
// attore), so the feminine noun, which dictionaries list, comes first and the
// masculine second (patronesse is patronessa before patrona).
for (const [inflected, deinflected, min] of [['trice', 'tore', 0], ['essa', 'e', 3], ['essa', 'a', 3], ['ona', 'one', 3], ['iera', 'iere', 3], ['ora', 'ore', 3]]) {
    suffix('feminine', inflected, deinflected, NOMINAL, NOMINAL, {stemMinLength: min, ...ONE_WORD});
}
// Feminine plural adjectives: rosse, bianche, lunghe, and lisce and grige
// (liscio, grigio).
for (const [inflected, deinflected, out, min] of [
    ['e', 'o', ['adj'], 2], ['che', 'co', ['adj'], 2], ['ghe', 'go', ['adj'], 2], ['ce', 'cio', ['adj'], 2], ['ge', 'gio', ['adj'], 2],
]) {
    suffix('feminine-plural', inflected, deinflected, [], out, {stemMinLength: min, ...ONE_WORD});
}
// Preferred readings. Where a word's rows name two lemmas that the rules
// reach with traces of one length, the lookup shows first the one it found
// first (docs/languages.md 9.6): the one through the longer ending, or, for
// one ending, through the transform and rule that come first in this file.
// That order shows the frequent reading first for most such words: the
// noun and adjective transforms come first (figli is figlio before
// figliare), and -i is -e before -o (cani is cane before cano). For these
// words of it_50k's top 10,000 it does not, and a whole-word rule, which is
// found before any ending, reaches the reading they nearly always have
// first; the other stays second (soli: solo, then sole). The words were
// judged by hand among those whose first lemma's citation form is at least
// 10 times rarer than another lemma their rows name, and among the 306 of
// the top 10,000 whose first result changes when the verb slots come first
// (README, Measurements): the verbs below are the ones whose bare form is
// nearly always the verb (serve, credi, continua, ami, scherzi).
const PREFERRED = [
    ['plural', NOMINAL, [
        ['soli', 'solo'], ['armi', 'arma'], ['conti', 'conto'], ['regali', 'regalo'], ['messi', 'messo'], ['calci', 'calcio'],
        ['rischi', 'rischio'], ['omicidi', 'omicidio'], ['sacrifici', 'sacrificio'], ['decenni', 'decennio'],
        ['stronzate', 'stronzata'], ['cazzate', 'cazzata'], ['discorsi', 'discorso'], ['armati', 'armato'],
        ['alleati', 'alleato'], ['privati', 'privato'], ['arrabbiati', 'arrabbiato'], ['sbagliati', 'sbagliato'],
        ['innamorati', 'innamorato'], ['bloccati', 'bloccato'], ['fregati', 'fregato'], ['collegati', 'collegato'],
        ['vari', 'vario'], ['saluti', 'saluto'],
    ]],
    ['feminine-plural', ['adj'], [
        ['vere', 'vero'], ['private', 'privato'], ['armate', 'armato'], ['complicate', 'complicato'], ['sbagliate', 'sbagliato'],
    ]],
    ['present-io', ['v'], [['domando', 'domandare']]],
    ['present-tu', ['v'], [
        ['torni', 'tornare'], ['spegni', 'spegnere'], ['credi', 'credere'], ['ami', 'amare'], ['ascolti', 'ascoltare'],
        ['cerchi', 'cercare'], ['scherzi', 'scherzare'], ['manchi', 'mancare'], ['fidi', 'fidare'], ['menti', 'mentire'],
        ['paghi', 'pagare'], ['perdoni', 'perdonare'], ['tocchi', 'toccare'], ['dimentichi', 'dimenticare'], ['osi', 'osare'],
        ['accetti', 'accettare'], ['compri', 'comprare'], ['accompagni', 'accompagnare'], ['vendi', 'vendere'],
        ['puzzi', 'puzzare'], ['figuri', 'figurare'], ['temi', 'temere'], ['presti', 'prestare'], ['fumi', 'fumare'],
        ['sali', 'salire'], ['aspetti', 'aspettare'],
    ]],
    ['present-lui', ['v'], [
        ['pare', 'parere'], ['accade', 'accadere'], ['indovina', 'indovinare'], ['supera', 'superare'], ['vende', 'vendere'],
        ['serve', 'servire'], ['continua', 'continuare'], ['vive', 'vivere'], ['usa', 'usare'], ['merita', 'meritare'],
        ['dimentica', 'dimenticare'], ['compra', 'comprare'], ['riporta', 'riportare'], ['incontra', 'incontrare'],
        ['teme', 'temere'], ['osa', 'osare'], ['bacia', 'baciare'], ['cola', 'colare'], ['accosta', 'accostare'],
    ]],
    ['subjunctive-sg', ['v'], [['accada', 'accadere'], ['riposi', 'riposare']]],
    // comperò and comperai, the past historic of comperare, an older
    // spelling of comprare that wty-it-en gives only as a form-of row: read
    // as comprare's, they come before compare (godfather) through the future
    // and conditional endings (comp + erò).
    ['preterite-io', ['v'], [['comperai', 'comprare']]],
    ['preterite-lui', ['v'], [['comperò', 'comprare']]],
];
for (const [id, out, pairs] of PREFERRED) {
    for (const [word, lemma] of pairs) { whole(id, word, lemma, [], out); }
}
// Superlatives in -issimo, -issima, -issimi, -issime of adjectives and
// adverbs in -o, -e and -io (bellissimo, grandissimo, benissimo,
// vecchissimo), with the hard c and g of -co and -go (bianchissimo,
// lunghissimo).
// Both an -o and an -e adjective can make one superlative, and the -o reading
// comes first; it leaves out the stems of frequent -e adjectives whose -o
// twin is a rare word (dolcissimo is dolce, not dolco; tristissimo is
// triste, not tristo).
const SUPERLATIVE_EXCLUDED = ['dolc', 'trist'];
const superlativeSplits = [
    {stemNotStartsWith: `[${SUPERLATIVE_EXCLUDED.map((stem) => stem[0]).join('')}]`},
    ...SUPERLATIVE_EXCLUDED.flatMap((stem) => [
        {stemStartsWith: `[${stem[0]}]`, stemNotStartsWithText: stem},
        {stemStartsWithText: stem, stemMinLength: [...stem].length + 1},
    ]),
];
for (const tail of ['o', 'a', 'i', 'e']) {
    for (const [inflected, deinflected] of [['issim', 'o'], ['issim', 'e'], ['issim', 'io'], ['chissim', 'co'], ['ghissim', 'go']]) {
        for (const split of inflected === 'issim' && deinflected === 'o' ? superlativeSplits : [{}]) {
            suffix('superlative', inflected + tail, deinflected, [], ['adj', 'adv'], {stemMinLength: 2, ...ONE_WORD, ...split});
        }
    }
}
// Adverbs in -mente: the feminine of adjectives in -o (lentamente → lento),
// adjectives in -e (fortemente → forte), and those in -le and -re, which
// lose their e (facilmente → facile, regolarmente → regolare).
for (const [inflected, deinflected] of [['amente', 'o'], ['emente', 'e'], ['lmente', 'le'], ['rmente', 're']]) {
    suffix('adverb', inflected, deinflected, [], ['adj'], {stemMinLength: 2, ...ONE_WORD});
}

// --- Output -----------------------------------------------------------------------------------
// The suffix rules of a transform that share their conditions and stem
// constraints are written as one circumfix in cross-product form with an
// empty prefix (docs/languages.md 7.3), which the engine expands when the
// pack loads: the same rules in a fifth of the bytes. `--expanded` writes
// them as separate suffix rules instead (for `eval-language --per-rule`,
// which counts a cross product as one rule), to the file given after it.
function compact(rules) {
    const out = [];
    const groups = new Map();
    for (const rule of rules) {
        let prefixes;
        let tails;
        let rest;
        if (rule.type === 'suffix') {
            const {type: _type, inflected, deinflected, ...others} = rule;
            [prefixes, tails, rest] = [[['', '']], [[inflected, deinflected]], others];
        } else if (rule.type === 'circumfix' && rule.inflectedPrefix !== undefined) {
            const {type: _type, inflectedPrefix, deinflectedPrefix, inflectedSuffix, deinflectedSuffix, ...others} = rule;
            [prefixes, tails, rest] = [[[inflectedPrefix, deinflectedPrefix]], [[inflectedSuffix, deinflectedSuffix]], others];
        } else if (rule.type === 'circumfix' && rule.prefixes !== undefined) {
            const {type: _type, prefixes: p, suffixes, ...others} = rule;
            [prefixes, tails, rest] = [p, suffixes, others];
        } else {
            out.push(rule);
            continue;
        }
        const key = JSON.stringify([prefixes, rest]);
        let group = groups.get(key);
        if (group === undefined) {
            group = {type: 'circumfix', prefixes, suffixes: [], ...rest};
            groups.set(key, group);
            out.push(group);
        }
        group.suffixes.push(...tails);
    }
    // A group of one prefix and one suffix is written as the rule it was.
    return out.map((rule) => {
        if (rule.type !== 'circumfix' || rule.prefixes.length > 1 || rule.suffixes.length > 1) { return rule; }
        const {type: _type, prefixes: [[inflectedPrefix, deinflectedPrefix]], suffixes: [[inflected, deinflected]], ...rest} = rule;
        if (inflectedPrefix === '' && deinflectedPrefix === '') { return {type: 'suffix', inflected, deinflected, ...rest}; }
        return {type: 'circumfix', inflectedPrefix, deinflectedPrefix, inflectedSuffix: inflected, deinflectedSuffix: deinflected, ...rest};
    });
}
const expanded = process.argv.indexOf('--expanded');
const written = expanded >= 0 ? transforms : transforms.map((t) => ({...t, rules: compact(t.rules)}));
const own = {schema: 1, conditions, transforms: written};
const file = expanded >= 0 ? process.argv[expanded + 1] : join(here, 'own.json');
if (file === undefined) { throw new Error('--expanded needs a file'); }
writeFileSync(file, formatTransforms(own));
const rules = transforms.reduce((n, t) => n + t.rules.length, 0);
const objects = written.reduce((n, t) => n + t.rules.length, 0);
console.log(`${file}: ${transforms.length} transforms, ${rules} rules (${objects} rule objects)`);
