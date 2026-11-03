#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/eo/sources/own.json: the Esperanto deinflection rules
// written for this pack (docs/languages.md, section 14 step 2). Run from the
// repository root:
//
//   node languages/eo/sources/build-own.mjs
//
// Esperanto inflection is regular and agglutinative (Fundamento de Esperanto,
// 1905, Gramatiko §§ 1-16; Kalocsay and Waringhien, Plena Analiza Gramatiko
// de Esperanto; Wiktionary's Esperanto inflection tables). A word is a root,
// optional affixes, a word-class ending and inflections:
//
// - nouns end in -o, adjectives in -a, derived adverbs in -e;
// - -j marks the plural of nouns and adjectives (domoj, belaj);
// - -n marks the accusative, the direct object or the direction of motion
//   (domon, belajn, hejmen, kien, min);
// - verbs have six finite endings for every verb: -i (infinitive, the
//   headword), -as (present), -is (past), -os (future), -us (conditional)
//   and -u (volitive, the imperative);
// - six participles, active -ant-, -int-, -ont- and passive -at-, -it-, -ot-,
//   each with the adjective ending (leganta, legitaj), the noun ending (one
//   who reads: leganto) and the adverb ending (while reading: legante), and
//   the plural and accusative of the first two (legantajn, legitojn);
// - the -o of a noun and the -a of the article may be elided and replaced by
//   an apostrophe (dank' al, de l' mondo);
// - the personal pronouns (mi, ci, vi, li, ŝi, ĝi, si, ni, ili, oni) take
//   -n; their possessives (mia, via, ...) are adjectives;
// - the correlatives in -u and -a take -j and -n, those in -o and -e take
//   -n (kiujn, tian, nenion, tien).
//
// There are no irregular forms. Comparison is analytic (pli, plej), and the
// verb has no person or number.
//
// Conditions. v, n, adj and adv are the part-of-speech tags Esperanto
// dictionaries put in their `rules` column (wiktionary-to-yomitan writes these
// four; pronouns, determiners, correlatives and names have none). A verb
// rule's output is the infinitive, so it carries v and the part-of-speech
// filter keeps only verbs. The endings of nouns, adjectives and adverbs say
// their word class, so declension removes -j and -n with no condition: its
// output is looked up whatever the dictionary says it is, which reaches the
// pronouns, determiners, correlatives and names that dictionaries list
// without a part of speech (kion → kio, tiajn → tia, Parizon → Parizo).
//
// Stem constraints. Every suffix rule takes a stem without a space
// (stemCharacters [^ ]): a lookup tries every prefix that ends at a word
// boundary (docs/languages.md 9.2), and Esperanto phrases inflect on their
// first word or on every word, never on the last word alone, so a rule
// applied to a phrase only invents phrases. A minimum stem keeps the most
// frequent short words from being read as inflections: kaj (and) is not ka
// + -j, jen and sen are not je and se + -n, ĝis (until) is not ĝi + -is, and
// nu, du and ĉu are not volitives.

import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';
import {EXCLUDED_STEMS, exclusionKey, withoutStems} from './excluded-stems.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const conditions = {
    v: {name: 'Verb', isDictionaryForm: true},
    n: {name: 'Noun', isDictionaryForm: true},
    adj: {name: 'Adjective', isDictionaryForm: true},
    adv: {name: 'Adverb', isDictionaryForm: true},
};

const transforms = [];
const byId = new Map();

function transform(id, name, description, extra = {}) {
    const t = {id, name, description, source: 'own', ...extra, rules: []};
    transforms.push(t);
    byId.set(id, t);
    return t;
}

function add(id, rule) {
    byId.get(id).rules.push(rule);
}

const NO_SPACE = '[^ ]';
// The class `upper` of language.json: the capitals of A-Z, Latin-1 and Latin
// Extended-A (see UPPER below).
const UPPER_CLASS = '{upper}';

function suffix(id, inflected, deinflected, conditionsIn, conditionsOut, stemMinLength, extra = {}) {
    add(id, {type: 'suffix', inflected, deinflected, conditionsIn, conditionsOut, stemMinLength, stemCharacters: NO_SPACE, ...extra});
}

function whole(id, inflected, deinflected, conditionsIn = [], conditionsOut = []) {
    add(id, {type: 'wholeWord', inflected, deinflected, conditionsIn, conditionsOut});
}

// --- Declension -----------------------------------------------------------------
// The accusative is the outermost ending (dom-o-j-n), so it is removed first
// and the plural after it: domojn → domoj → domo.

transform('accusative', 'accusative',
    'Accusative -n: the direct object, or the direction of motion. domon → domo, belan → bela, domojn → domoj, hejmen → hejme, kien → kie, kion → kio, min → mi, kiun → kiu.');
// Noun and adjective, singular. Two letters at least: von, don, dan and ron
// (von in German names, a letter's accusative, foreign words) are not vo, do,
// da and ro; ion and ian, the one-letter correlatives, are written out
// below. The first version allowed one letter for them; on the four books
// of the measurements that gave 15 wrong readings and no right one.
suffix('accusative', 'on', 'o', [], [], 2);
suffix('accusative', 'an', 'a', [], [], 2);
// Plural: the stem has two letters at least, as for the plural itself.
suffix('accusative', 'ojn', 'oj', [], [], 2);
suffix('accusative', 'ajn', 'aj', [], [], 2);
// Adverb of place, direction (hejme → hejmen, supre → supren, kie → kien).
// Two letters at least: jen (here is) and sen (without) are not je and se.
suffix('accusative', 'en', 'e', [], [], 2);
// The personal pronouns, and the reform pronouns some writers use (ri for
// anyone, ŝli and iŝi; added after the corpus sample had ŝlin).
for (const pronoun of ['mi', 'ci', 'vi', 'li', 'ŝi', 'ĝi', 'si', 'ni', 'ili', 'oni', 'ri', 'ŝli', 'iŝi']) {
    whole('accusative', `${pronoun}n`, pronoun);
}
// The demonstratives with ĉi (this), whose declined forms dictionaries
// list only in part (wty-eo-en has tiu ĉi, tiuj ĉi, tio ĉi and ĉi tio):
// the stem rules never take a space, so these are whole phrases.
for (const [form, base] of [['tiun ĉi', 'tiu ĉi'], ['tiujn ĉi', 'tiuj ĉi'], ['tion ĉi', 'tio ĉi'], ['ĉi tion', 'ĉi tio']]) {
    whole('accusative', form, base);
}
// The correlatives in -u (kiu, tiu, iu, ĉiu, neniu): a whole-word list, since
// a word in -un or -uj is otherwise no inflection (nun is not nu, kun is not
// ku, tuj is not tu).
const U_CORRELATIVES = ['kiu', 'tiu', 'iu', 'ĉiu', 'neniu'];
for (const word of U_CORRELATIVES) {
    whole('accusative', `${word}n`, word);
    whole('accusative', `${word}jn`, `${word}j`);
}
// One-letter stems the minimums leave out: ion (something), ian (some
// kind), ien (somewhere to), iajn.
whole('accusative', 'ion', 'io');
whole('accusative', 'ian', 'ia');
whole('accusative', 'ien', 'ie');
whole('accusative', 'iajn', 'iaj');
// unu (one) as a pronoun: unun, and unuj (some) with unujn.
whole('accusative', 'unun', 'unu');
whole('accusative', 'unujn', 'unuj');
// Names that keep their own spelling take the ending after an apostrophe
// (Tolstoj'n, Basmanov'jn).
suffix('accusative', "'n", '', [], [], 2);
suffix('accusative', "'jn", "'j", [], [], 2);

transform('plural', 'plural', 'Plural -j of nouns and adjectives. domoj → domo, belaj → bela, kiuj → kiu, miaj → mia.');
// Two letters at least: kaj (and) is not ka, hoj (ahoy) is not ho. And no
// capital: a capitalised plural is almost always a common word at the start
// of a sentence (Leonoj, Kronoj, Egiptoj), which the lookup also tries
// decapitalised, while its capitalised singular is often a name (Leono,
// Egipto), which would come first. On Tatoeba's 22,130 capitalised plurals
// this took the wrong first results from 324 to 1; 25 plurals of names
// (Amerikoj, Koreoj) lose their reading (README.md, Known gaps). This was
// added after Yomitan's rules were read, from that measurement.
suffix('plural', 'oj', 'o', [], [], 2, {stemNotStartsWith: UPPER_CLASS});
suffix('plural', 'aj', 'a', [], [], 2, {stemNotStartsWith: UPPER_CLASS});
for (const word of U_CORRELATIVES) {
    whole('plural', `${word}j`, word);
}
whole('plural', 'iaj', 'ia');
whole('plural', 'unuj', 'unu');
suffix('plural', "'j", '', [], [], 2);

// --- Verbs ------------------------------------------------------------------------
// Every verb root has two letters at least (iri, ami, agi, uzi), so ĝis
// (until) is not ĝi + -is, and du, nu and ĉu are not volitives.

const TENSES = [
    ['present', 'present', 'as', 'Present tense -as: mi legas (I read, I am reading) → legi.'],
    ['past', 'past', 'is', 'Past tense -is: mi legis (I read, I was reading) → legi.'],
    ['future', 'future', 'os', 'Future tense -os: mi legos (I will read) → legi.'],
    ['conditional', 'conditional', 'us', 'Conditional -us: mi legus (I would read) → legi.'],
    ['volitive', 'volitive', 'u', 'Volitive -u, the imperative and the wish: legu! (read!), ke mi legu (that I should read) → legi.'],
];
for (const [id, name, ending, description] of TENSES) {
    transform(id, name, description);
    suffix(id, ending, 'i', [], ['v'], 2);
}

// --- Participles --------------------------------------------------------------------
// Each participle as an adjective (leganta: reading), a noun (leganto: one who
// reads) and an adverb (legante: while reading). The adjective and the noun
// take -j and -n, which declension removes first: legantajn → legantaj →
// leganta → legi.

const PARTICIPLES = [
    ['ant', 'present active participle', 'legi → leganta (reading), leganto (reader, one who is reading), legante (while reading)'],
    ['int', 'past active participle', 'legi → leginta (having read), leginto (one who has read), leginte (having read)'],
    ['ont', 'future active participle', 'legi → legonta (about to read), legonto (one who will read), legonte (being about to read)'],
    ['at', 'present passive participle', 'legi → legata (being read), legato (one who is being read), legate (while being read)'],
    ['it', 'past passive participle', 'legi → legita (read, having been read), legito (one who has been read), legite (having been read)'],
    ['ot', 'future passive participle', 'legi → legota (to be read), legoto (one who will be read), legote (being about to be read)'],
];
const FORMS = [
    ['a', 'adj', 'adjective'],
    ['o', 'n', 'noun'],
    ['e', 'adv', 'adverb'],
];
for (const [morpheme, name, examples] of PARTICIPLES) {
    for (const [ending, condition, word] of FORMS) {
        const id = `${morpheme}${ending}`;
        const fullName = word === 'adjective' ? name : `${name} (${word})`;
        const article = word === 'adjective' || word === 'adverb' ? 'an' : 'a';
        const description = `-${morpheme}${ending}, the ${name} as ${article} ${word}: ${examples}.`;
        transform(id, fullName, description);
        suffix(id, `${morpheme}${ending}`, 'i', [condition], ['v'], 2);
    }
}

// --- Elision ------------------------------------------------------------------------
// Poetry and older prose replace the -o of a noun and the -a of the article
// with an apostrophe (dank' al, kor' al kor', de l' mondo). The elided -o is
// the processor `elision` of language.json, not a rule: a word with an
// apostrophe at its end is as often a word before a closing single quote
// ('Trinku min', drink me), and a processor's reading costs the processor
// step that the quote's removal costs too, so the word itself (min) comes
// first and the elided noun (mino) after it. A rule's reading would cost
// no step and come first (the audit's MINOR-1). The first version of the
// pack had the rule ' → o with a stem of two letters, which the processor's
// pattern keeps. The article stays a rule.
transform('elision', 'elision', "Elided article: l' → la. (The elided -o of a noun is the processor elision: dank' → danko.)");
whole('elision', "l'", 'la');

// --- Word formation --------------------------------------------------------------
// Esperanto builds most words from roots and a closed list of affixes, and
// writers coin new ones freely (ekridetis: ek- + rid + -et- + -is), so a
// dictionary cannot list them all. These rules remove one affix at a time and
// give the word with the ending of its base; a word the dictionary has ranks
// before them, since its trace is shorter (docs/languages.md 9.6).
//
// A suffix sits between the root and the word-class ending, which says what
// the derived word is (-o noun, -a adjective, -e adverb, -i verb); the base
// keeps the ending of its own class. A prefix keeps the ending, so it is a
// circumfix rule with the same ending on both sides, and the condition of
// that ending. Bases of the wrong class are dropped by the part-of-speech
// filter. Roots have two letters at least.
//
// A word-formation rule needs a stem that starts with a small letter. A
// capitalised word is a name or the first word of a sentence; the second is
// also looked up decapitalised, with one more processor step, and a reading
// of the word as written ranks first on processor steps (docs/languages.md
// 9.6): without this, Sinjorino at the start of a sentence would show
// Sinjoro (the Lord), a form-of row of sinjoro, before sinjorino.
// The capital letters of A-Z, Latin-1 and Latin Extended-A, which include
// Ĉ Ĝ Ĥ Ĵ Ŝ Ŭ (not those of Extended-B, which Esperanto text does not use).
// language.json defines it as the class `upper`.
const UPPER = '{upper}';

const ENDING_CONDITION = {o: 'n', a: 'adj', e: 'adv', i: 'v'};

// [id, name, affix, derived endings, base endings, stemMinLength, description].
// Base endings '=' keep the derived word's class: dometo is a small domo,
// beleta a little bela, rideti to laugh a little (ridi).
const SUFFIXES = [
    ['ad', '-ad- (continued action)', 'ad', 'oiae', 'i', 2, 'Continued or repeated action: kurado (running) → kuri, venadis → venadi → veni.'],
    ['aĉ', '-aĉ- (pejorative)', 'aĉ', 'oaie', '=', 2, 'Poor or contemptible: domaĉo (hovel) → domo, skribaĉi (to scribble) → skribi.'],
    ['aĵ', '-aĵ- (thing)', 'aĵ', 'o', 'iao', 2, 'A concrete thing made, done or having a quality: manĝaĵo (food) → manĝi, novaĵo (news) → nova, bovaĵo (beef) → bovo.'],
    ['an', '-an- (member)', 'an', 'o', 'o', 2, 'Member, follower or inhabitant: klubano → klubo, urbano → urbo.'],
    ['ar', '-ar- (group)', 'ar', 'o', 'o', 2, 'A collection: arbaro (forest) → arbo, vortaro (dictionary) → vorto.'],
    ['ebl', '-ebl- (possible)', 'ebl', 'aeo', 'i', 2, 'Possible to: farebla (feasible) → fari, kompreneble (of course) → kompreni.'],
    ['ec', '-ec- (quality)', 'ec', 'o', 'ao', 2, 'The quality or state: beleco (beauty) → bela, infaneco (childhood) → infano.'],
    ['eg', '-eg- (augmentative)', 'eg', 'oaie', '=', 2, 'Large or intense: domego → domo, grandega → granda, ridegi → ridi, bonege → bone.'],
    ['ej', '-ej- (place)', 'ej', 'o', 'io', 2, 'The place for: lernejo (school) → lerni, kafejo (café) → kafo.'],
    ['em', '-em- (inclined to)', 'em', 'aoe', 'i', 2, 'Inclined to: laborema (hard-working) → labori, dormema (sleepy) → dormi.'],
    ['end', '-end- (to be done)', 'end', 'ae', 'i', 2, 'Must be done: pagenda (payable) → pagi, legenda (to be read) → legi.'],
    ['estr', '-estr- (leader)', 'estr', 'o', 'o', 2, 'The head of: lernejestro (headmaster) → lernejo, urbestro (mayor) → urbo.'],
    ['et', '-et- (diminutive)', 'et', 'oaie', '=', 2, 'Small or weak: dometo → domo, beleta → bela, rideti (to smile) → ridi.'],
    ['id', '-id- (offspring)', 'id', 'o', 'o', 2, 'The young or descendant: katido (kitten) → kato, bovido (calf) → bovo.'],
    ['ig', '-ig- (cause)', 'ig', 'iao', 'iao', 2, 'To make, to cause to be or do: purigi (to clean) → pura, mortigi (to kill) → morti.'],
    ['iĝ', '-iĝ- (become)', 'iĝ', 'iao', 'iao', 2, 'To become, to get: ruĝiĝi (to blush) → ruĝa, leviĝi (to rise) → levi, edziĝi (to marry) → edzo.'],
    ['il', '-il- (tool)', 'il', 'o', 'i', 2, 'The tool for: tranĉilo (knife) → tranĉi, ludilo (toy) → ludi.'],
    ['in', '-in- (female)', 'in', 'o', 'o', 2, 'Female: patrino (mother) → patro, reĝino (queen) → reĝo, katino → kato.'],
    ['ind', '-ind- (worthy)', 'ind', 'ae', 'i', 2, 'Worthy of: laŭdinda (praiseworthy) → laŭdi, vidinda → vidi.'],
    ['ist', '-ist- (professional)', 'ist', 'o', 'oi', 2, 'A person occupied with: dentisto (dentist) → dento, kudristo (tailor) → kudri.'],
    ['uj', '-uj- (container)', 'uj', 'o', 'o', 2, 'Container, tree or country: sukerujo (sugar bowl) → sukero, pomujo → pomo.'],
    ['ul', '-ul- (person)', 'ul', 'o', 'ao', 2, 'A person characterised by: junulo (young person) → juna, riĉulo → riĉa.'],
];
for (const [id, name, affix, derived, bases, stemMinLength, description] of SUFFIXES) {
    transform(id, name, description);
    for (const d of derived) {
        for (const b of bases === '=' ? d : bases) {
            suffix(id, `${affix}${d}`, b, [ENDING_CONDITION[d]], [ENDING_CONDITION[b]], stemMinLength, {stemNotStartsWith: UPPER});
        }
    }
}

// The word-class ending alone changes the class of a root: rapida (fast) →
// rapide (quickly), kaŭzo (cause) → kaŭze (because of), lano (wool) → lana
// (woollen), skribi (to write) → skriba (written). Dictionaries list the
// nouns, verbs and main adjectives of a root and leave many of its adverbs
// and adjectives out, so an adverb is also looked up as the adjective, the
// noun and the verb of its root. An adjective is looked up as the noun and
// the verb, and a noun as the verb, only when a request turns that on (pack
// setting otherWordClasses): names in -a would be read as nouns otherwise
// (Marta, the heroine of Marta, as marto, March), and most nouns would
// show their verb after them. Each pair goes one way, so no chain of these
// rules comes back to its start.
transform('adverbClass', 'adverb', 'The adverb of a root whose adjective, noun or verb is the headword: rigide (rigidly) → rigida, kaŭze (because of) → kaŭzo, konsente (in agreement) → konsenti.');
for (const [from, to] of [['e', 'a'], ['e', 'o'], ['e', 'i']]) {
    suffix('adverbClass', from, to, [ENDING_CONDITION[from]], [ENDING_CONDITION[to]], 2, {stemNotStartsWith: UPPER});
}
transform('otherWordClass', 'word class', 'Another word class of the same root, when a request turns it on: lana (woollen) → lano, skriba (written) → skribi, eldiro (utterance) → eldiri.', {optional: true});
for (const [from, to] of [['a', 'o'], ['a', 'i'], ['o', 'i']]) {
    suffix('otherWordClass', from, to, [ENDING_CONDITION[from]], [ENDING_CONDITION[to]], 2, {stemNotStartsWith: UPPER});
}

// [id, name, prefix, endings it is used with, stemMinLength, description]
const PREFIXES = [
    ['mal', 'mal- (opposite)', 'mal', 'oaie', 2, 'The opposite: malbona (bad) → bona, malfermi (to open) → fermi, malsupren → supren.'],
    ['ne', 'ne- (not)', 'ne', 'ae', 2, 'Not: nejuna → juna, nekonata (unknown) → konata.'],
    ['re', 're- (again, back)', 're', 'i', 2, 'Again or back: reveni (to come back) → veni, relegi → legi.'],
    ['ek', 'ek- (beginning)', 'ek', 'i', 2, 'Beginning or sudden action: ekridi (to burst out laughing) → ridi, ekvidi → vidi.'],
    ['dis', 'dis- (apart)', 'dis', 'i', 2, 'Apart, in all directions: disiri (to part) → iri, disĵeti → ĵeti.'],
    ['for', 'for- (away)', 'for', 'i', 2, 'Away: foriri (to leave) → iri, forkuri → kuri.'],
    ['el', 'el- (out)', 'el', 'i', 2, 'Out, thoroughly: eliri (to go out) → iri, elpensi (to devise) → pensi.'],
    ['en', 'en- (in)', 'en', 'i', 2, 'In, into: eniri (to enter) → iri, enkuri → kuri.'],
    ['kun', 'kun- (together)', 'kun', 'io', 2, 'Together: kunveni (to meet) → veni, kunlabori → labori, kunsento (sympathy) → sento.'],
    ['al', 'al- (to)', 'al', 'i', 2, 'To, towards: aliri (to approach) → iri, aldoni (to add) → doni.'],
    ['antaŭ', 'antaŭ- (before)', 'antaŭ', 'i', 2, 'Before: antaŭdiri (to predict) → diri, antaŭvidi → vidi.'],
    ['ĉe', 'ĉe- (at)', 'ĉe', 'i', 3, 'At: ĉeesti (to attend) → esti.'],
    ['ĉirkaŭ', 'ĉirkaŭ- (around)', 'ĉirkaŭ', 'i', 2, 'Around: ĉirkaŭvolvi (to wrap around) → volvi, ĉirkaŭrigardi → rigardi.'],
    ['de', 'de- (from, off)', 'de', 'i', 3, 'From, off: defali (to fall off) → fali, depreni (to take away) → preni.'],
    ['inter', 'inter- (between)', 'inter', 'i', 2, 'Between, mutually: intermiksi (to intermix) → miksi, interŝanĝi → ŝanĝi.'],
    ['kontraŭ', 'kontraŭ- (against)', 'kontraŭ', 'i', 2, 'Against: kontraŭstari (to oppose) → stari.'],
    ['per', 'per- (by means of)', 'per', 'i', 3, 'Achieved by: perlabori (to earn) → labori.'],
    ['post', 'post- (after)', 'post', 'i', 2, 'After, behind: postlasi (to leave behind) → lasi.'],
    ['preter', 'preter- (past)', 'preter', 'i', 2, 'Past, beyond: preterpasi (to pass by) → pasi, preterŝoviĝi → ŝoviĝi.'],
    ['pri', 'pri- (about)', 'pri', 'i', 2, 'About, making a verb transitive: prikalkuli (to calculate) → kalkuli, priskribi (to describe) → skribi.'],
    ['sub', 'sub- (under)', 'sub', 'i', 2, 'Under: submeti (to submit) → meti, subskribi (to sign) → skribi.'],
    ['super', 'super- (over)', 'super', 'i', 2, 'Over: superŝuti (to shower) → ŝuti.'],
    ['sur', 'sur- (on)', 'sur', 'i', 2, 'On: surmeti (to put on) → meti, surpaŝi → paŝi.'],
    ['tra', 'tra- (through)', 'tra', 'i', 2, 'Through: trabati (to pierce) → bati, travivi (to live through) → vivi.'],
    ['trans', 'trans- (across)', 'trans', 'i', 2, 'Across: transkuri (to run across) → kuri, transdoni (to hand over) → doni.'],
    ['ge', 'ge- (both sexes)', 'ge', 'o', 2, 'Both sexes together: gepatroj (parents) → patroj, gefratoj → fratoj.'],
    ['pra', 'pra- (primordial)', 'pra', 'oa', 2, 'Primordial, of an earlier generation: praavo (great-grandfather) → avo, prahomo → homo.'],
    ['mis', 'mis- (wrongly)', 'mis', 'i', 2, 'Wrongly: miskompreni (to misunderstand) → kompreni.'],
];
for (const [id, name, prefix, endings, stemMinLength, description] of PREFIXES) {
    transform(id, name, description);
    for (const e of endings) {
        const c = ENDING_CONDITION[e];
        add(id, {type: 'circumfix', inflectedPrefix: prefix, deinflectedPrefix: '', inflectedSuffix: e, deinflectedSuffix: e,
            conditionsIn: [c], conditionsOut: [c], stemMinLength, stemCharacters: NO_SPACE});
    }
}

// sen- (without) makes an adjective or adverb of a noun: senforta (without
// strength) → forto, senbrue (noiselessly) → bruo.
transform('sen', 'sen- (without)', 'Without: senforta (weak) → forto, senbrue (noiselessly) → bruo, senkulpa (innocent) → kulpo.');
for (const e of 'ae') {
    add('sen', {type: 'circumfix', inflectedPrefix: 'sen', deinflectedPrefix: '', inflectedSuffix: e, deinflectedSuffix: 'o',
        conditionsIn: [ENDING_CONDITION[e]], conditionsOut: ['n'], stemMinLength: 2, stemCharacters: NO_SPACE});
}

// --- Exact stems left out ---------------------------------------------------------
// Names and loanwords the dictionary lacks that rules read as derived words,
// shown first (excluded-stems.mjs has the list, the measurement and the
// splitting of a rule by the text its stem starts with). These were added
// after Yomitan's rules were read, from the audit's measurement of real text.
for (const t of transforms) {
    t.rules = t.rules.flatMap((rule) => {
        const excluded = EXCLUDED_STEMS[exclusionKey(t.id, rule)];
        return excluded ? withoutStems(rule, excluded.map(([stem]) => stem)) : [rule];
    });
}

// --- Output ------------------------------------------------------------------------
const out = {schema: 1, conditions, transforms: transforms.filter((t) => t.rules.length > 0)};
const file = join(here, 'own.json');
writeFileSync(file, formatTransforms(out));
const rules = out.transforms.reduce((n, t) => n + t.rules.length, 0);
console.log(`eo: ${out.transforms.length} transforms, ${rules} rules in ${file}`);
