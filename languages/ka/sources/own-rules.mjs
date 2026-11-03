#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/ka/sources/own.json: the Georgian deinflection rules written
// for this pack (docs/languages.md, section 14 step 2). Run from the
// repository root:
//
//   node languages/ka/sources/own-rules.mjs
//
// The rules follow the standard description of Modern Georgian inflection
// (Hewitt, Georgian: A Structural Reference Grammar, 1995; Aronson, Georgian:
// A Reading Grammar, 1990; the declension and conjugation tables of English
// Wiktionary): seven cases with the stem types of nouns and adjectives
// (consonant stems with -ი, truncating -ა/-ე stems, non-truncating -ო/-უ
// stems) and their syncope (წყალი → წყლის, ქვეყანა → ქვეყნის); the plural
// in -ებ- and the archaic plural in -ნ-/-თ-; the postpositions written
// together with a case form (-ში, -ზე, -თან, -ვით, -თვის, -გან, -კენ, -ადმი,
// -ებრ, -დან, -ურთ, -მდე); the -ა extension of case endings; the clitics
// -ც, -ვე, -ღა, the copula -ა/-აა and the quotative -ო, -მეთქი, -თქო; the
// superlative უ-...-ესი and the moderative მო-...-ო; the case forms of the
// personal and demonstrative pronouns; and the verb: the person and number
// endings of the present, imperfect and subjunctive, the aorist and
// optative, the perfect and pluperfect (with their inversion markers), the
// subject marker ვ-, the object markers მ-, გ-, გვ- with the version vowels
// and the third-person markers ს-/ჰ-, and the preverbs that make the future
// from the present.
//
// Lemmas are what Georgian dictionaries made from English Wiktionary list:
// a noun or adjective in the nominative singular, a verb in the third
// person singular of the present (წერს, აკეთებს) or, for a perfective verb,
// of the future (დაწერს, გააკეთებს). Verb rules reach both: the future
// form and, by removing its preverb, the present.

import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// --- Letters ------------------------------------------------------------------
// The 28 consonants and 5 vowels of the modern alphabet. Stems consist of
// Mkhedruli letters and hyphens, so a hyphenated compound inflects
// (და-ძმას → და-ძმა) and no rule takes in punctuation. The stems of the noun
// and clitic rules may also hold spaces (WORDS, set at the end of this file),
// because a phrase inflects on its last word (დაბადების დღეზე → დაბადების
// დღე, უცხო ენის → უცხო ენა); the genitive's are words only, so that
// როგორ არის "how is" is not read as the phrase როგორ არა, and so are the
// verb rules', whose person prefixes must not reach past the first word.
const CONS = '[ბგდვზთკლმნპჟრსტფქღყშჩცძწჭხჯჰ]';
const VSTEM = '[აეოუ]'; // vowels a noun stem can end in (-ი is the nominative ending)
const LETTERS = '[{mkhedruli}\\-]';
const WORDS = '[{mkhedruli}\\- ]';

// --- Conditions ---------------------------------------------------------------
// n, adj, pron and v are the parts of speech dictionaries tag terms with.
// vs and vp keep the verb rules from feeding themselves: a rule for an
// ending takes vp (or the text as written) and gives vs, a rule for a person
// prefix takes vs and gives vp, so an ending rule whose output ends in an
// ending it reads (-ა → -ება) never applies to that output. dat, gen, ins and adv are
// intermediate states: a case form whose postposition or extension was
// removed, which only the rules of that case take.
//
// After Yomitan's rules were read (step 3), the conditions both files have
// (v, n, adj, adv) were given Yomitan's definitions, which
// tools/merge-transforms.mjs requires to be equal: n became the union of np
// and ns, the adverbial state was renamed advc (adv is Yomitan's adverb), and
// verb outputs carry v beside their own state. No deinflection changed.
const conditions = {
    v: {name: 'Verb', isDictionaryForm: true},
    n: {name: 'Noun', isDictionaryForm: true, subConditions: ['np', 'ns']},
    np: {name: 'Noun plural', isDictionaryForm: true},
    ns: {name: 'Noun singular', isDictionaryForm: true},
    adj: {name: 'Adjective', isDictionaryForm: true},
    adv: {name: 'Adverb', isDictionaryForm: true},
    nom: {name: 'Noun or adjective', isDictionaryForm: true, subConditions: ['n', 'adj']},
    pron: {name: 'Pronoun', isDictionaryForm: true},
    vs: {name: 'Verb whose ending was made third person singular', isDictionaryForm: false},
    vp: {name: 'Verb whose person prefix was made third person', isDictionaryForm: false},
    vf: {name: 'Verb in the present, made from the future', isDictionaryForm: false},
    dat: {name: 'Dative form before a postposition', isDictionaryForm: false},
    gen: {name: 'Genitive form before a postposition', isDictionaryForm: false},
    ins: {name: 'Instrumental form before a postposition', isDictionaryForm: false},
    advc: {name: 'Adverbial form before a postposition', isDictionaryForm: false},
    gens: {name: 'Genitive form whose syncope was undone', isDictionaryForm: false},
    inss: {name: 'Instrumental form whose syncope was undone', isDictionaryForm: false},
    advs: {name: 'Adverbial form whose syncope was undone', isDictionaryForm: false},
    pls: {name: 'Plural form whose syncope was undone', isDictionaryForm: false},
};

// --- Helpers ------------------------------------------------------------------
function suffix(inflected, deinflected, conditionsIn, conditionsOut, extra = {}) {
    return {type: 'suffix', inflected, deinflected, conditionsIn, conditionsOut, stemCharacters: LETTERS, ...extra};
}
function prefix(inflected, deinflected, conditionsIn, conditionsOut, extra = {}) {
    return {type: 'prefix', inflected, deinflected, conditionsIn, conditionsOut, stemCharacters: LETTERS, ...extra};
}
function wholeWord(inflected, deinflected, conditionsIn, conditionsOut) {
    return {type: 'wholeWord', inflected, deinflected, conditionsIn, conditionsOut};
}
function circumfix(prefixes, suffixes, conditionsIn, conditionsOut, extra = {}) {
    return {type: 'circumfix', prefixes, suffixes, conditionsIn, conditionsOut, stemCharacters: LETTERS, ...extra};
}
const transforms = [];
function transform(id, name, description, rules, extra = {}) {
    if (transforms.some((t) => t.id === id)) { throw new Error(`duplicate transform ${id}`); }
    transforms.push({id, name, description, source: 'own', ...extra, rules});
}

// Syncope: a stem that loses its last vowel before an ending that starts with
// a vowel (the genitive -ის, the instrumental -ით, the adverbial -ად and the
// plural -ები): [reduced ending of the stem, full ending]. The syncope rules
// put the vowel back and keep the ending (წყლის → წყალის), so the case rule
// then takes the full stem, and a reading without syncope (სახლების →
// სახლი) has a shorter trace than one with it (სახლების → სახელი).
const SYNCOPE = [
    ['ლ', 'ელ'], ['ლ', 'ალ'], ['ლ', 'ოლ'],
    ['რ', 'არ'], ['რ', 'ერ'], ['რ', 'ორ'],
    ['ნ', 'ან'], ['ნ', 'ენ'], ['ნ', 'ონ'],
    ['მ', 'ამ'], ['მ', 'ემ'],
    ['ბ', 'აბ'], ['ბ', 'ობ'],
    ['ვ', 'ავ'], ['ვ', 'ევ'],
    ['დ', 'ად'], ['დ', 'ედ'],
    ['ყ', 'აყ'], ['ხ', 'ეხ'],
    ['ვრ', 'ორ'], ['ვნ', 'ონ'], ['ვზ', 'ოზ'],
];

// The rules of a case whose ending starts with a vowel and so takes the
// reduced stem: consonant stems (-ი) and truncated -ა and -ე stems.
// A stem whose syncope the sync rules undid (conditions gens, inss, advs, pls)
// takes only the -ი and -ა rules: -ე stems have no syncope (მესამე, მესამის).
function reducedStemRules(ending, conditionsIn, conditionsOut, synced) {
    return [
        suffix(ending, 'ი', [...conditionsIn, synced], conditionsOut, {stemMinLength: 1, stemEndsWith: CONS}),
        suffix(ending, 'ა', [...conditionsIn, synced], conditionsOut, {stemMinLength: 1}),
        suffix(ending, 'ე', conditionsIn, conditionsOut, {stemMinLength: 1}),
    ];
}

// --- Nouns and adjectives: the cases -----------------------------------------
const NOM = ['nom'];
transform('erg', 'ergative', 'Ergative case: -მა after a consonant stem (კაცმა → კაცი), -მ after a vowel stem (დედამ → დედა).', [
    suffix('მა', 'ი', [], NOM, {stemMinLength: 2, stemEndsWith: CONS}),
    suffix('მ', '', [], NOM, {stemMinLength: 2, stemEndsWith: VSTEM}),
]);
transform('dat', 'dative', 'Dative case: -ს (სახლს → სახლი, დედას → დედა).', [
    suffix('ს', 'ი', ['dat'], NOM, {stemMinLength: 2, stemEndsWith: CONS}),
    suffix('ს', '', ['dat'], NOM, {stemMinLength: 2, stemEndsWith: VSTEM}),
]);
transform('gen', 'genitive', 'Genitive case: -ის, with the last vowel of an -ა or -ე stem dropped (დედის → დედა) and syncope (წყლის → წყალი); -ს after an -ო or -უ stem (რადიოს → რადიო).', [
    ...reducedStemRules('ის', ['gen'], NOM, 'gens'),
    suffix('ს', '', ['gen'], NOM, {stemMinLength: 2, stemEndsWith: '[ოუ]'}),
    suffix('სი', '', ['gen'], NOM, {stemMinLength: 2, stemEndsWith: '[ოუ]'}),
]);
transform('ins', 'instrumental', 'Instrumental case: -ით (სახლით → სახლი, დედით → დედა, წყლით → წყალი); -თი or -თ after an -ო or -უ stem (რადიოთი → რადიო).', [
    ...reducedStemRules('ით', ['ins'], NOM, 'inss'),
    suffix('თი', '', ['ins'], NOM, {stemMinLength: 2, stemEndsWith: '[ოუ]'}),
    suffix('თ', '', ['ins'], NOM, {stemMinLength: 2, stemEndsWith: '[ოუ]'}),
]);
transform('adv', 'adverbial', 'Adverbial case: -ად (სახლად → სახლი, კარგად → კარგი, ქვეყნად → ქვეყანა); -დ after an -ე, -ო or -უ stem (მეფედ → მეფე).', [
    ...reducedStemRules('ად', ['advc'], NOM, 'advs').filter((rule) => rule.deinflected !== 'ე'),
    suffix('დ', '', ['advc'], NOM, {stemMinLength: 2, stemEndsWith: '[ეოუ]'}),
]);
transform('voc', 'vocative', 'Vocative case: -ო after a consonant stem (კაცო → კაცი), -ვ or -ო after a vowel stem (დედავ → დედა, ძმაო → ძმა).', [
    suffix('ო', 'ი', [], NOM, {stemMinLength: 2, stemEndsWith: CONS}),
    suffix('ვ', '', [], NOM, {stemMinLength: 2, stemEndsWith: VSTEM}),
    suffix('ო', '', [], NOM, {stemMinLength: 2, stemEndsWith: '[ა]'}),
]);
// The case rules above also turn a plural case form into the nominative
// plural (სახლებს → სახლები), which this rule takes to the singular.
transform('pl', 'plural', 'Plural -ებ- (nominative -ები): სახლები → სახლი, დედები → დედა, მეფეები → მეფე, წყლები → წყალი.', [
    ...reducedStemRules('ები', ['nom'], NOM, 'pls').filter((rule) => rule.deinflected !== 'ე'),
    suffix('ები', '', ['nom'], NOM, {stemMinLength: 2, stemEndsWith: '[ეოუ]'}),
]);
transform('pl-archaic', 'archaic plural', 'Archaic (literary) plural: nominative -ნი, ergative, dative and genitive -თა, dative -თ, vocative -ნო (ქართველთა → ქართველი, დედანი → დედა).', [
    suffix('ნი', 'ი', [], NOM, {stemMinLength: 2, stemEndsWith: CONS}),
    suffix('ნი', '', [], NOM, {stemMinLength: 2, stemEndsWith: VSTEM}),
    suffix('თა', 'ი', ['dat', 'gen'], NOM, {stemMinLength: 2, stemEndsWith: CONS}),
    suffix('თა', '', ['dat', 'gen'], NOM, {stemMinLength: 2, stemEndsWith: VSTEM}),
    suffix('თ', '', [], NOM, {stemMinLength: 3, stemEndsWith: VSTEM}),
    suffix('ნო', 'ი', [], NOM, {stemMinLength: 2, stemEndsWith: CONS}),
    suffix('ნო', '', [], NOM, {stemMinLength: 2, stemEndsWith: VSTEM}),
]);

transform('sync', 'syncope', 'The vowel a stem loses before an ending that starts with a vowel, put back (წყლის → წყალის, ქვეყნები → ქვეყანები, სოფლიდან → სოფელიდან).', [
    ...[['ის', ['gen'], ['gens']], ['ით', ['ins'], ['inss']], ['ად', ['advc'], ['advs']], ['ები', ['nom'], ['pls']]].flatMap(([ending, conditionIn, conditionOut]) =>
        SYNCOPE.map(([reduced, full]) => suffix(reduced + ending, full + ending, conditionIn, conditionOut, {stemMinLength: 1, stemEndsWith: CONS}))),
]);

// --- The -ა extension of case endings ----------------------------------------
transform('ext', '-ა extension', 'The vowel -ა added to a case ending in careful or old-fashioned style and before some postpositions (სახლსა → სახლს, სახლისა → სახლის, სახლითა → სახლით, სახლადა → სახლად).', [
    suffix('სა', 'ს', ['dat'], ['dat'], {stemMinLength: 2}),
    suffix('ისა', 'ის', ['gen'], ['gen'], {stemMinLength: 1}),
    suffix('ითა', 'ით', ['ins'], ['ins'], {stemMinLength: 1}),
    suffix('ადა', 'ად', ['advc'], ['advc'], {stemMinLength: 1}),
    suffix('და', 'დ', ['advc'], ['advc'], {stemMinLength: 2, stemEndsWith: '[ეოუ]'}),
]);

// --- Postpositions written together with a case form -------------------------
transform('pp-shi', '-ში (in)', 'The postposition -ში "in", on the dative, whose -ს it replaces (სახლში → სახლს, სახლებში → სახლებს); a pronoun keeps the -ს (მასში → მას).', [
    suffix('ში', 'ს', [], ['dat'], {stemMinLength: 2}),
    suffix('ში', '', [], ['dat'], {stemMinLength: 2, stemEndsWith: '[ს]'}),
]);
transform('pp-ze', '-ზე (on)', 'The postposition -ზე "on, about", on the dative (სახლზე → სახლს, მასზე → მას).', [
    suffix('ზე', 'ს', [], ['dat'], {stemMinLength: 2}),
    suffix('ზე', '', [], ['dat'], {stemMinLength: 2, stemEndsWith: '[ს]'}),
]);
transform('pp-tan', '-თან (at, with)', 'The postposition -თან "at, near, with", on the dative: it replaces the -ს of a consonant stem (სახლთან → სახლს) and follows it after a vowel stem or a pronoun (დედასთან → დედას, მასთან → მას).', [
    suffix('თან', 'ს', [], ['dat'], {stemMinLength: 2, stemEndsWith: CONS}),
    suffix('თან', '', [], ['dat'], {stemMinLength: 2, stemEndsWith: '[ს]'}),
]);
transform('pp-vit', '-ვით (like)', 'The postposition -ვით "like": -ივით after a consonant stem (სახლივით → სახლს), -სავით after a vowel stem (დედასავით → დედას).', [
    suffix('ივით', 'ს', [], ['dat'], {stemMinLength: 2, stemEndsWith: CONS}),
    suffix('ავით', '', [], ['dat'], {stemMinLength: 2, stemEndsWith: '[ს]'}),
]);
transform('pp-tvis', '-თვის (for)', 'The postposition -თვის "for", on the genitive (სახლისთვის → სახლის, სახლისათვის → სახლისა).', [
    suffix('თვის', '', [], ['gen'], {stemMinLength: 2}),
]);
transform('pp-gan', '-გან (from)', 'The postposition -გან "from, out of, by", on the genitive (სახლისგან → სახლის, ხისაგან → ხისა).', [
    suffix('გან', '', [], ['gen'], {stemMinLength: 2}),
]);
transform('pp-ken', '-კენ (towards)', 'The postposition -კენ "towards", on the genitive (სახლისკენ → სახლის).', [
    suffix('კენ', '', [], ['gen'], {stemMinLength: 2}),
]);
transform('pp-admi', '-ადმი (towards, to)', 'The postposition -ადმი "towards, in relation to", on the genitive (სახლისადმი → სახლის).', [
    suffix('ადმი', '', [], ['gen'], {stemMinLength: 2, stemEndsWith: '[ს]'}),
]);
transform('pp-ebr', '-ებრ (like)', 'The literary postposition -ებრ "like", on the genitive (სახლისებრ → სახლის).', [
    suffix('ებრ', '', [], ['gen'], {stemMinLength: 2, stemEndsWith: '[ს]'}),
]);
transform('pp-dan', '-დან (from)', 'The postposition -დან "from, since", on the instrumental, whose -თ it replaces (სახლიდან → სახლით, რადიოდან → რადიოთ).', [
    suffix('იდან', 'ით', [], ['ins'], {stemMinLength: 1, stemEndsWith: CONS}),
    suffix('დან', 'თ', [], ['ins'], {stemMinLength: 2, stemEndsWith: '[ოუ]'}),
]);
transform('pp-urt', '-ურთ (together with)', 'The literary postposition -ურთ "together with", on the instrumental (სახლითურთ → სახლით).', [
    suffix('ურთ', '', [], ['ins'], {stemMinLength: 2, stemEndsWith: '[თ]'}),
]);
transform('pp-mde', '-მდე (up to)', 'The postposition -მდე "up to, until", on the adverbial, whose -დ it replaces (სახლამდე → სახლად, დედამდე → დედად).', [
    suffix('მდე', 'დ', [], ['advc'], {stemMinLength: 2, stemEndsWith: VSTEM}),
]);

// --- Adjectives: superlative, moderative, attributive form --------------------
// The superlative (elative) უ-...-ესი declines like any adjective, so its
// rules also take the nominative the case rules give (უდიდესმა → უდიდესი).
const SUPERLATIVE_SUFFIXES = [['ესი', 'ი'], ['ესი', 'ე'], ...[['ლ', 'ალ'], ['ლ', 'ელ'], ['რ', 'არ'], ['რ', 'ერ'], ['ნ', 'ან']].map(([reduced, full]) => [reduced + 'ესი', full + 'ი'])];
transform('sup', 'superlative', 'Superlative უ-...-ესი "most, very" (უდიდესი → დიდი, უმცირესი → მცირე, უმაღლესი → მაღალი, უახლოესი → ახლო).', [
    circumfix([['უ', '']], SUPERLATIVE_SUFFIXES, ['nom'], ['adj'], {stemMinLength: 2, stemEndsWith: CONS}),
    circumfix([['უ', '']], [['ესი', '']], ['nom'], ['adj'], {stemMinLength: 2, stemEndsWith: '[ო]'}),
]);
transform('moder', 'moderative', 'Moderative მო-...-ო "-ish" (მოთეთრო → თეთრი, მოწითალო → წითელი).', [
    circumfix([['მო', '']], [['ო', 'ი'], ['ალო', 'ელი']], ['nom'], ['adj'], {stemMinLength: 2, stemEndsWith: CONS}),
]);
// An adjective before a noun in the dative or adverbial loses its -ი
// (ახალ სახლს, ქართულ ენაზე).
transform('attr', 'attributive', 'An adjective or noun before the noun it qualifies, in the dative or adverbial case, without its -ი (ახალ → ახალი, ქართულ → ქართული).', [
    suffix('', 'ი', [], NOM, {stemMinLength: 3, stemEndsWith: CONS}),
]);

// --- Clitics ------------------------------------------------------------------
// Clitics attach to any word form, so their output has no conditions and
// every rule may follow.
transform('cl-c', '-ც (also)', 'The clitic -ც "also, even, too", -აც after a consonant (მეც → მე, სახლშიც → სახლში, ვისაც → ვის).', [
    suffix('ც', '', [], [], {stemMinLength: 2}),
    suffix('აც', '', [], [], {stemMinLength: 2, stemEndsWith: CONS}),
]);
transform('cl-ve', '-ვე (same, very)', 'The emphatic clitic -ვე "the same, right, very" (იქვე → იქ, ახლავე → ახლა, დღესვე → დღეს).', [
    suffix('ვე', '', [], [], {stemMinLength: 2}),
    suffix('ავე', '', [], [], {stemMinLength: 2, stemEndsWith: CONS}),
]);
transform('cl-gha', '-ღა (still, only)', 'The clitic -ღა "still, only, any more" (რაღა → რა, ახლაღა → ახლა).', [
    suffix('ღა', '', [], [], {stemMinLength: 2}),
]);
transform('cop', 'copula -ა', 'The copula "is" written onto the word before it: -ა after a vowel (კარგია → კარგი, ქვეყანაა → ქვეყანა), -აა after a consonant (სადაა → სად, კარგადაა → კარგად).', [
    suffix('ია', 'ი', [], [], {stemMinLength: 2}),
    suffix('ეა', 'ე', [], [], {stemMinLength: 2}),
    suffix('აა', 'ა', [], [], {stemMinLength: 2}),
    suffix('ოა', 'ო', [], [], {stemMinLength: 2}),
    suffix('უა', 'უ', [], [], {stemMinLength: 2}),
    suffix('აა', '', [], [], {stemMinLength: 2, stemEndsWith: CONS}),
]);
transform('quot', 'quotative -ო', 'The quotative clitic -ო at the end of reported speech, "he/she/they say" (მოვალო → მოვალ, წავიდაო → წავიდა).', [
    suffix('ო', '', [], [], {stemMinLength: 3}),
]);
transform('quot-1', 'quotative -მეთქი', 'The quotative clitic -მეთქი "I said" (მოვალმეთქი → მოვალ).', [
    suffix('მეთქი', '', [], [], {stemMinLength: 2}),
]);
transform('quot-2', 'quotative -თქო', 'The quotative clitic -თქო "say that, tell (him)" (მოვალთქო → მოვალ).', [
    suffix('თქო', '', [], [], {stemMinLength: 2}),
]);

// --- Pronouns -----------------------------------------------------------------
// The personal and demonstrative pronouns have their own oblique stems
// (მე: ჩემ-; ის: მა-, მი-; ეს: ამ-; ის: იმ-; ეგ: მაგ-), which the case rules
// cannot reach.
const PRONOUN_FORMS = {
    'მე': ['ჩემთვის', 'ჩემზე', 'ჩემთან', 'ჩემგან', 'ჩემში', 'ჩემკენ', 'ჩემსავით', 'ჩემამდე'],
    'შენ': ['შენთვის', 'შენზე', 'შენთან', 'შენგან', 'შენში', 'შენკენ', 'შენსავით', 'შენამდე'],
    'ჩვენ': ['ჩვენთვის', 'ჩვენზე', 'ჩვენთან', 'ჩვენგან', 'ჩვენში', 'ჩვენკენ', 'ჩვენსავით', 'ჩვენამდე'],
    'თქვენ': ['თქვენთვის', 'თქვენზე', 'თქვენთან', 'თქვენგან', 'თქვენში', 'თქვენკენ', 'თქვენსავით', 'თქვენამდე'],
    'ის': ['მას', 'მან', 'მისთვის', 'მასზე', 'მასთან', 'მისგან', 'მასში', 'მისკენ', 'მასავით', 'იმას', 'იმან', 'იმის', 'იმისი', 'იმისა', 'იმით', 'იმად', 'იმ', 'იმისთვის', 'იმაზე', 'იმასთან', 'იმისგან', 'იმაში', 'იმისკენ', 'იმასავით', 'იმათ'],
    'ისინი': ['მათ', 'მათთვის', 'მათზე', 'მათთან', 'მათგან', 'მათში', 'მათკენ', 'მათსავით'],
    'ეს': ['ამას', 'ამან', 'ამის', 'ამისი', 'ამისა', 'ამით', 'ამად', 'ამ', 'ამისთვის', 'ამაზე', 'ამასთან', 'ამისგან', 'ამაში', 'ამისკენ', 'ამასავით', 'ამათ', 'ესენი'],
    'ეგ': ['მაგას', 'მაგან', 'მაგის', 'მაგისი', 'მაგით', 'მაგ', 'მაგისთვის', 'მაგაზე', 'მაგასთან', 'მაგაში', 'მაგათ', 'ეგენი'],
    'ვინ': ['ვის', 'ვისთვის', 'ვისზე', 'ვისთან', 'ვისგან', 'ვისკენ'],
    'რა': ['რას', 'რამ', 'რის', 'რით', 'რად', 'რისთვის', 'რაზე', 'რასთან', 'რისგან', 'რაში', 'რისკენ'],
};
transform('pron', 'pronoun case', 'A case form of a personal, demonstrative or interrogative pronoun, alone or with a postposition (ჩემთვის → მე, მას → ის, ამაზე → ეს, რაში → რა).',
    Object.entries(PRONOUN_FORMS).flatMap(([lemma, forms]) => forms.map((form) => wholeWord(form, lemma, [], ['pron']))));

// --- Verbs --------------------------------------------------------------------
// A verb form is preverb + person marker + version vowel + root + thematic
// suffix + ending. The rules undo it in steps: the ending (person, number,
// tense) becomes the third person singular; then the person markers at the
// front are removed (ვ- of the first-person subject; მ-, გ-, გვ- of a first-
// or second-person object, whose third-person counterparts are nothing, ს-
// or ჰ-, and მი-/გი-/გვი- for უ-); then the preverb, which turns the
// future into the present.
const PREVERBS = ['ა', 'ამო', 'აღ', 'გა', 'გადა', 'გადმო', 'გამო', 'გარდა', 'და', 'მი', 'მიმო', 'მო', 'შე', 'შემო', 'ჩა', 'ჩამო', 'წა', 'წამო', 'წარ'];
const PV = ['', ...PREVERBS];
const VIN = ['vp'];
const VOUT = ['v', 'vs'];
const VF_IN = ['vs', 'vp'];
const VF = ['v', 'vf'];
// The third person singular of an active verb ends in a thematic suffix and
// -ს, or in a root consonant and -ს.
const ACTIVE = ['ებს', 'ავს', 'ობს', 'ამს', 'ს', 'ის'];

transform('pres-2', '2nd person', 'Second person singular of the present or future, also the first person once its ვ- is removed: the stem without -ს (აკეთებ → აკეთებს, ხატავ → ხატავს, ჭრი → ჭრის, იმალები → იმალება).', [
    ...['ებ', 'ობ', 'ავ', 'ამ', 'ევ', 'ენ', 'ოფ'].map((e) => suffix(e, e + 'ს', VIN, VOUT, {stemMinLength: 2})),
    suffix('ი', 'ის', VIN, VOUT, {stemMinLength: 2, stemEndsWith: CONS}),
    suffix('ი', 'ა', VIN, VOUT, {stemMinLength: 2, stemEndsWith: '[ბვ]'}),
]);
transform('pres-1', 'person prefix, bare stem', 'A first-person subject (ვ-) or a first- or second-person object (მ-, გ-, გვ-) on the bare stem of a verb whose stem ends in its root, made third person (ვწერ → წერს, დავწერ → დაწერს, მიჭერ → იჭერს); and the second person of such a verb with the version vowel ი- (იჭერ → იჭერს).', [
    circumfix(PV.flatMap((p) => ['ვ', 'მ', 'გ', 'გვ'].map((m) => [p + m, p])), [['', 'ს']], [], VOUT, {stemMinLength: 2, stemEndsWith: CONS}),
    circumfix(PV.flatMap((p) => ['ვ', 'მ', 'გ', 'გვ'].map((m) => [p + m, p + 'ს'])), [['', 'ს']], [], VOUT, {stemMinLength: 2, stemEndsWith: CONS, stemStartsWith: '[დთტძცწჭჩჯზ]'}),
    circumfix(PV.flatMap((p) => ['ვ', 'მ', 'გ', 'გვ'].map((m) => [p + m, p + 'ჰ'])), [['', 'ს']], [], VOUT, {stemMinLength: 2, stemEndsWith: CONS, stemStartsWith: '[გკქყპფ]'}),
    circumfix(PV.map((p) => [p + 'ი', p + 'ი']), [['', 'ს']], [], VOUT, {stemMinLength: 2, stemEndsWith: '[რლნ]'}),
]);
transform('pres-pl', '1st/2nd person plural', 'The -თ of the first and second person plural (ვაკეთებთ → ვაკეთებს, ვიმალებით → ვიმალება, უნდათ → უნდა).', [
    suffix('თ', 'ს', VIN, VOUT, {stemMinLength: 2}),
    suffix('ით', 'ა', VIN, VOUT, {stemMinLength: 2, stemEndsWith: '[ბვ]'}),
    suffix('ათ', 'ა', VIN, VOUT, {stemMinLength: 2}),
]);
transform('pres-3pl', '3rd person plural', 'Third person plural of the present or future: -ენ, -იან (აკეთებენ → აკეთებს, ჭრიან → ჭრის, იმალებიან → იმალება).', [
    suffix('ენ', 'ს', VIN, VOUT, {stemMinLength: 2}),
    suffix('იან', 'ის', VIN, VOUT, {stemMinLength: 2}),
    suffix('იან', 'ა', VIN, VOUT, {stemMinLength: 2, stemEndsWith: '[ბვ]'}),
]);
transform('theme-12', '1st/2nd person theme', 'A first- or second-person theme (subject in the nominative) of a verb whose experiencer is in the dative: -ვარ, -ხარ, -ვართ, -ხართ for -ს (მიყვარხარ "I love you" → მიყვარს, მოგწონვარ → მოგწონს).', [
    ...['ვარ', 'ხარ', 'ვართ', 'ხართ'].map((e) => suffix(e, 'ს', VIN, VOUT, {stemMinLength: 2, stemEndsWith: CONS})),
]);
transform('impf', 'imperfect', 'Imperfect, and the conditional made from the future: -დი, -და, -დით, -დნენ (ვაკეთებდი → ვაკეთებს, წერდა → წერს, მოდიოდა → მოდის, იმალებოდა → იმალება).', [
    ...['დი', 'და', 'დით', 'დნენ'].map((e) => suffix(e, 'ს', VIN, VOUT, {stemMinLength: 2})),
    ...['ოდი', 'ოდა', 'ოდით', 'ოდნენ'].flatMap((e) => [suffix(e, 'ს', VIN, VOUT, {stemMinLength: 2}), suffix(e, 'ის', VIN, VOUT, {stemMinLength: 2})]),
    ...['ოდი', 'ოდა', 'ოდით', 'ოდნენ', 'ოდათ'].map((e) => suffix(e, 'ა', VIN, VOUT, {stemMinLength: 2, stemEndsWith: '[ბვ]'})),
    ...['ოდი', 'ოდა', 'ოდით', 'ოდნენ', 'ოდათ'].map((e) => suffix(e, 'ია', VIN, VOUT, {stemMinLength: 2, stemEndsWith: CONS})),
    suffix('ოდათ', 'ის', VIN, VOUT, {stemMinLength: 2}),
    suffix('ოდათ', 'ს', VIN, VOUT, {stemMinLength: 2}),
]);
transform('subj', 'subjunctive', 'Present and future subjunctive: -დე, -დეს, -დეთ (აკეთებდეს → აკეთებს, იმალებოდეს → იმალება).', [
    ...['დე', 'დეს', 'დეთ'].map((e) => suffix(e, 'ს', VIN, VOUT, {stemMinLength: 2})),
    ...['ოდე', 'ოდეს', 'ოდეთ'].flatMap((e) => [suffix(e, 'ს', VIN, VOUT, {stemMinLength: 2}), suffix(e, 'ის', VIN, VOUT, {stemMinLength: 2})]),
    ...['ოდე', 'ოდეს', 'ოდეთ'].map((e) => suffix(e, 'ა', VIN, VOUT, {stemMinLength: 2, stemEndsWith: '[ბვ]'})),
    ...['ოდე', 'ოდეს', 'ოდეთ'].map((e) => suffix(e, 'ია', VIN, VOUT, {stemMinLength: 2, stemEndsWith: CONS})),
]);
// The aorist and optative are made from the future stem without its
// thematic suffix, so each ending is tried with every suffix it may stand
// for; a strong aorist shows a root vowel that the present lacks (გავჭერი,
// გაჭრის; მოვკალი, მოკლავს).
const STRONG = {stemMinLength: 2, stemEndsWith: CONS, stemChange: {from: ['ე', 'ა'], to: '', occurrence: 'last', between: CONS}};
// The third person singular -ა is not read after -ებ- or -ობ- (the aorist
// drops the thematic suffix, so გაკეთება is a verbal noun), nor as a root
// verb's after ვ (მოწევა, გაცემა are verbal nouns); after another ბ it is
// (დააბა → დააბამს).
transform('aor', 'aorist', 'Aorist (past), whose second person is also the imperative: -ე, -ა, -ო, -ეთ, -ეს, and -ი, -ით with a root vowel (დავწერე → დავწერს, გააკეთა → გააკეთებს, გაათბო → გაათბობს, გავჭერი → გავჭრის); of passives -ე, -ა, -ეთ, -ნენ, -ი, -ით and -დი, -და, -დით, -დნენ (დაიმალა → დაიმალება, გაწითლდა → გაწითლდება).', [
    ...['ე', 'ეთ', 'ეს'].flatMap((e) => ACTIVE.map((t) => suffix(e, t, VIN, VOUT, {stemMinLength: 2, stemEndsWith: CONS}))),
    ...ACTIVE.map((t) => suffix('ა', t, VIN, VOUT, {stemMinLength: 2, stemEndsWith: CONS, stemNotEndsWith: t === 'ს' ? '[ბვ]' : '[ბ]'})),
    ...ACTIVE.map((t) => suffix('ბა', 'ბ' + t, VIN, VOUT, {stemMinLength: 1, stemNotEndsWith: '[ეო]'})),
    ...['ებს', 'ობს', 'ოფს'].map((t) => suffix('ო', t, VIN, VOUT, {stemMinLength: 2, stemEndsWith: CONS})),
    ...['ი', 'ით'].flatMap((e) => ACTIVE.map((t) => suffix(e, t, VIN, VOUT, STRONG))),
    ...['ი', 'ით'].flatMap((e) => ['ავს', 'ამს', 'ებს'].map((t) => suffix(e, t, VIN, VOUT, {stemMinLength: 2, stemEndsWith: CONS}))),
    ...['ე', 'ა', 'ეთ', 'ეს'].map((e) => suffix(e, 'ს', VIN, VOUT, {stemMinLength: 2, stemEndsWith: CONS, stemChange: {from: ['ი'], to: 'ე', occurrence: 'last', between: CONS}})),
    ...['იე', 'ია', 'იეთ', 'იეს'].map((e) => suffix(e, 'ევს', VIN, VOUT, {stemMinLength: 2, stemEndsWith: CONS})),
    ...['ე', 'ა', 'ეთ', 'ნენ', 'ი', 'ით'].map((e) => suffix(e, 'ება', VIN, VOUT, {stemMinLength: 2})),
    suffix('ო', 'ობა', VIN, VOUT, {stemMinLength: 2}),
    ...['დი', 'და', 'დით', 'დნენ'].map((e) => suffix(e, 'დება', VIN, VOUT, {stemMinLength: 2})),
]);
transform('opt', 'optative', 'Optative, also the third-person imperative: -ო, -ოს, -ოთ, -ონ, and -ა, -ას, -ათ, -ან after a strong root (დაწეროს → დაწერს, გავჭრა → გავჭრის); of passives -ო, -ოს, -ოთ, -ონ and -დე, -დეს, -დეთ, -დნენ (დაიმალოს → დაიმალება).', [
    ...['ო', 'ოს', 'ოთ', 'ონ'].flatMap((e) => ACTIVE.map((t) => suffix(e, t, VIN, VOUT, {stemMinLength: 2, stemEndsWith: CONS}))),
    ...['ა', 'ას', 'ათ', 'ან'].flatMap((e) => ['ის', 'ავს', 'ამს'].map((t) => suffix(e, t, VIN, VOUT, {stemMinLength: 2, stemEndsWith: CONS}))),
    ...['ო', 'ოს', 'ოთ', 'ონ'].map((e) => suffix(e, 'ს', VIN, VOUT, {stemMinLength: 2, stemEndsWith: CONS, stemChange: {from: ['ი'], to: 'ე', occurrence: 'last', between: CONS}})),
    ...['იო', 'იოს', 'იოთ', 'იონ'].map((e) => suffix(e, 'ევს', VIN, VOUT, {stemMinLength: 2, stemEndsWith: CONS})),
    ...['ო', 'ოს', 'ოთ', 'ონ'].flatMap((e) => ['ება', 'ობა'].map((t) => suffix(e, t, VIN, VOUT, {stemMinLength: 2}))),
    ...['აო', 'აოს', 'აოთ', 'აონ'].map((e) => suffix(e, 'ავებს', VIN, VOUT, {stemMinLength: 2})),
    ...['დე', 'დეს', 'დეთ', 'დნენ'].map((e) => suffix(e, 'დება', VIN, VOUT, {stemMinLength: 2})),
]);

// The perfect series: the logical subject is marked like an indirect object
// (მი-, გი-, უ-, გვი- in the perfect; მე-, გე-, ე-, გვე- in the pluperfect
// and perfect subjunctive), and a plural subject adds -თ. The rules first
// make the third person singular, then the future.
const VPERF = ['vperf'];
conditions.vperf = {name: 'Verb, perfect series, third person', isDictionaryForm: false};
transform('inv-pl', 'perfect, plural', 'The -თ of a plural subject in the perfect series (დაგვიწერიათ → დაგვიწერია, დაეწერათ → დაეწერა).', [
    suffix('იათ', 'ია', VPERF, VPERF, {stemMinLength: 2}),
    ...['ივარ', 'იხარ', 'ივართ', 'იხართ'].map((e) => suffix(e, 'ია', VPERF, VPERF, {stemMinLength: 2, stemEndsWith: CONS})),
    suffix('ათ', 'ა', VPERF, VPERF, {stemMinLength: 2}),
    suffix('ოთ', 'ოს', VPERF, VPERF, {stemMinLength: 2}),
    suffix('ოთ', 'ო', VPERF, VPERF, {stemMinLength: 2}),
]);
transform('inv-person', 'perfect, 1st/2nd person', 'A first- or second-person subject in the perfect series, marked like an indirect object (დამიწერია → დაუწერია, დამეწერა → დაეწერა).', [
    circumfix(PV.flatMap((p) => ['მი', 'გი', 'გვი', 'ვუ'].map((m) => [p + m, p + 'უ'])), [['ია', 'ია']], VPERF, VPERF, {stemMinLength: 1, stemEndsWith: CONS}),
    circumfix(PV.flatMap((p) => ['მე', 'გე', 'გვე'].map((m) => [p + m, p + 'ე'])), [['ა', 'ა'], ['ო', 'ო'], ['ს', 'ს']], VPERF, VPERF, {stemMinLength: 1}),
]);
transform('perf', 'perfect', 'Perfect (evidential past), third person singular -უ-...-ია, made into the future (დაუწერია → დაწერს, გაუკეთებია → გააკეთებს, უთამაშია → ითამაშებს).', [
    circumfix(PV.map((p) => [p + 'უ', p]), ['ს', 'ავს', 'ამს', 'ის', 'ებს'].map((t) => ['ია', t]), VPERF, VOUT, {stemMinLength: 1, stemEndsWith: CONS}),
    circumfix(PV.map((p) => [p + 'უ', p + 'ა']), [['ია', 'ს'], ['ია', 'ობს'], ['ია', 'ებს']], VPERF, VOUT, {stemMinLength: 1, stemEndsWith: CONS}),
    circumfix(PV.map((p) => [p + 'უ', p + 'უ']), [['ია', 'ს'], ['ია', 'ებს'], ['ია', 'ავს']], VPERF, VOUT, {stemMinLength: 1, stemEndsWith: CONS}),
    circumfix(PV.map((p) => [p + 'უ', p + 'ი']), [['ია', 'ებს']], VPERF, VOUT, {stemMinLength: 1, stemEndsWith: CONS}),
]);
transform('pluperf', 'pluperfect', 'Pluperfect, third person singular -ე-...-ა (-ინა, -ო), made into the future (დაეწერა → დაწერს, გაეკეთებინა → გააკეთებს, გაეთბო → გაათბობს, ეთამაშა → ითამაშებს).', [
    circumfix(PV.map((p) => [p + 'ე', p]), [...['ს', 'ავს', 'ამს', 'ის'].map((t) => ['ა', t]), ['ო', 'ებს'], ['ინა', 'ს']], VPERF, VOUT, {stemMinLength: 1, stemEndsWith: CONS}),
    circumfix(PV.map((p) => [p + 'ე', p + 'ა']), [['ინა', 'ს'], ['ო', 'ობს']], VPERF, VOUT, {stemMinLength: 1, stemEndsWith: CONS}),
    circumfix(PV.map((p) => [p + 'ე', p + 'უ']), [['ა', 'ებს'], ['ა', 'ს']], VPERF, VOUT, {stemMinLength: 1, stemEndsWith: CONS}),
    circumfix(PV.map((p) => [p + 'ე', p + 'ი']), [['ა', 'ებს']], VPERF, VOUT, {stemMinLength: 1, stemEndsWith: CONS}),
]);
transform('perf-subj', 'perfect subjunctive', 'Perfect subjunctive, third person singular -ე-...-ოს (-ინოს, -ას), made into the future (დაეწეროს → დაწერს, გაეკეთებინოს → გააკეთებს).', [
    circumfix(PV.map((p) => [p + 'ე', p]), [...['ს', 'ავს', 'ამს', 'ებს'].map((t) => ['ოს', t]), ['ას', 'ის'], ['ინოს', 'ს']], VPERF, VOUT, {stemMinLength: 1, stemEndsWith: CONS}),
    circumfix(PV.map((p) => [p + 'ე', p + 'ა']), [['ინოს', 'ს'], ['ოს', 'ობს']], VPERF, VOUT, {stemMinLength: 1, stemEndsWith: CONS}),
    circumfix(PV.map((p) => [p + 'ე', p + 'უ']), [['ას', 'ებს'], ['ოს', 'ს']], VPERF, VOUT, {stemMinLength: 1, stemEndsWith: CONS}),
    circumfix(PV.map((p) => [p + 'ე', p + 'ი']), [['ოს', 'ებს']], VPERF, VOUT, {stemMinLength: 1, stemEndsWith: CONS}),
]);
// Intransitive (passive) verbs make the perfect series from the past
// participle and the copula (დამალულა "it has hidden", დავმალულვარ "I
// have hidden"); the participle then gives the future.
const PARTICIPLE_ENDINGS = ['ვარ', 'ხარ', 'ა', 'ვართ', 'ხართ', 'ან', 'იყავი', 'იყო', 'იყავით', 'იყვნენ', 'იყოს', 'იყოთ', 'იყონ'];
transform('perf-pass', 'perfect, intransitive', 'Perfect series of an intransitive verb: the past participle with the copula (დამალულა → დამალული, გაწითლებულხარ → გაწითლებული).', [
    ...['ულ', 'ილ'].flatMap((p) => PARTICIPLE_ENDINGS.map((e) => suffix(p + e, p + 'ი', [], ['v', 'vs', 'adj'], {stemMinLength: 2}))),
]);
transform('ptcp-pass', 'past participle', 'The past participle of an intransitive verb made into its future (დამალული → დაიმალება, გაწითლებული → გაწითლდება).', [
    circumfix(PREVERBS.map((p) => [p, p + 'ი']), [['ული', 'ება']], ['vs', 'vp', 'adj'], VOUT, {stemMinLength: 2, stemEndsWith: CONS}),
    circumfix(PREVERBS.map((p) => [p, p]), [['ებული', 'დება'], ['ენილი', 'ება']], ['vs', 'vp', 'adj'], VOUT, {stemMinLength: 2, stemEndsWith: CONS}),
    circumfix(PREVERBS.map((p) => [p, p + 'ი']), [['ებული', 'ება'], ['ილი', 'ება']], ['vs', 'vp', 'adj'], VOUT, {stemMinLength: 2, stemEndsWith: CONS}),
]);

// Person markers at the front of the verb, after any preverb.
// Without a preverb the rest of the word has at least four letters, and after
// the one-letter preverb ა- five, so short words that start like a person
// marker (ვისი, მისი, მათ) are left alone. After ა- an object marker before
// the version vowel ი- is read by the მი- → უ- rule only (ამისი is the
// genitive of ეს, not a verb ა-მ-ის-).
const personMin = (p) => (p === '' ? 4 : p.length === 1 ? 5 : 3);
transform('subj-1', '1st person ვ-', 'The first-person subject marker ვ- (ვაკეთებ → აკეთებ, დავწერე → დაწერე), and before a verb with a third-person indirect object ს- or ჰ- (ვთხოვ → სთხოვ).', PV.flatMap((p) => [
    prefix(p + 'ვ', p, ['vs'], ['v', 'vp'], {stemMinLength: personMin(p)}),
    prefix(p + 'ვ', p + 'ს', ['vs'], ['v', 'vp'], {stemMinLength: 3, stemStartsWith: '[დთტძცწჭჩჯზ]'}),
    prefix(p + 'ვ', p + 'ჰ', ['vs'], ['v', 'vp'], {stemMinLength: 3, stemStartsWith: '[გკქყპფ]'}),
]));
function objectRules(marker, extra = {}) {
    return PV.flatMap((p) => [
        prefix(p + marker, p, ['vs'], ['v', 'vp'], {stemMinLength: personMin(p), ...(p === '' ? extra : p === 'ა' ? {stemNotStartsWith: '[ი]'} : {})}),
        prefix(p + marker, p + 'ს', ['vs'], ['v', 'vp'], {stemMinLength: 3, stemStartsWith: '[დთტძცწჭჩჯზ]'}),
        prefix(p + marker, p + 'ჰ', ['vs'], ['v', 'vp'], {stemMinLength: 3, stemStartsWith: '[გკქყპფ]'}),
        prefix(p + marker + 'ი', p + 'უ', ['vs'], ['v', 'vp'], {stemMinLength: personMin(p) - 1}),
        prefix(p + marker + 'ი', p + 'ი', ['vs'], ['v', 'vp'], {stemMinLength: personMin(p) - 1}),
    ]);
}
transform('obj-1', '1st person object მ-', 'A first-person singular object or experiencer, made third person (მხატავს → ხატავს, მიყვარს → უყვარს, მომწონს → მოსწონს, მყავს → ჰყავს).', objectRules('მ'));
// გ- before the version vowel ა- looks like the preverb გა-: after a stem
// that starts like a first person, a version vowel or a preverb (გავიდა,
// გაიგო, გადავიდა) it is the preverb.
transform('obj-2', '2nd person object გ-', 'A second-person object or experiencer, made third person (გხატავს → ხატავს, გიყვარს → უყვარს, გეშინია → ეშინია, გაკეთებს → აკეთებს).', [
    ...objectRules('გ', {stemNotStartsWith: '[ა]'}),
    prefix('გა', 'ა', ['vs'], ['v', 'vp'], {stemMinLength: 2, stemNotStartsWith: '[ვიეუდმ]'}),
]);
transform('obj-1pl', '1st person plural object გვ-', 'A first-person plural object or experiencer, made third person (გვხატავს → ხატავს, გვიყვარს → უყვარს).', objectRules('გვ'));

// The future is the present with a preverb; removing it gives the present,
// the form most dictionaries list the verb under. A preverb that begins a
// longer one is not removed where the longer one fits (გადარჩება → რჩება,
// not დარჩება).
function longerPreverb(p) {
    const next = [...new Set(PREVERBS.filter((q) => q.length > p.length && q.startsWith(p)).map((q) => q[p.length]))];
    return next.length ? {stemNotStartsWith: `[${next.join('')}]`} : {};
}
// Medial verbs make their future with ი- and -ებ- (ითამაშებს, present თამაშობს).
transform('pv', 'future → present', 'A preverb removed: the future made into the present (დაწერს → წერს, გააკეთებს → აკეთებს, დაიმალება → იმალება); a medial verb makes its future with ი- and -ებ- (ითამაშებს → თამაშობს, იმუშავებს → მუშაობს, იცინებს → იცინის).', [
    ...PREVERBS.map((p) => circumfix([[p, '']], [['ს', 'ს']], VF_IN, VF, {stemMinLength: 3, stemEndsWith: '[ბვმრნლფ]', ...longerPreverb(p)})),
    ...PREVERBS.map((p) => circumfix([[p, '']], [['ის', 'ის']], VF_IN, VF, {stemMinLength: 2, stemEndsWith: CONS, ...longerPreverb(p)})),
    ...PREVERBS.map((p) => circumfix([[p, '']], [['ება', 'ება'], ['ობა', 'ობა'], ['ევა', 'ევა']], VF_IN, VF, {stemMinLength: 2, ...longerPreverb(p)})),
    circumfix([['ი', '']], [['ებს', 'ობს'], ['ებს', 'ავს'], ['ებს', 'ეობს'], ['ებს', 'ებს'], ['ებს', 'ს'], ['ებს', 'ის'], ['ავებს', 'ავს'], ['ავებს', 'აობს'], ['ის', 'ობს']], VF_IN, VF, {stemMinLength: 3}),
    circumfix([['ი', 'ი']], [['ებს', 'ის']], VF_IN, VF, {stemMinLength: 2}),
]);

// --- Phrases ------------------------------------------------------------------
// The noun and clitic transforms whose stems may hold spaces (see WORDS).
const PHRASE_TRANSFORMS = new Set(['erg', 'dat', 'ins', 'adv', 'voc', 'pl', 'pl-archaic', 'sync', 'ext',
    'pp-shi', 'pp-ze', 'pp-tan', 'pp-vit', 'pp-tvis', 'pp-gan', 'pp-ken', 'pp-admi', 'pp-ebr', 'pp-dan', 'pp-urt', 'pp-mde',
    'cl-c', 'cl-ve', 'cl-gha', 'cop', 'quot', 'quot-1', 'quot-2']);
for (const t of transforms) {
    if (!PHRASE_TRANSFORMS.has(t.id)) { continue; }
    for (const rule of t.rules) {
        if (rule.type === 'suffix' && rule.stemCharacters === LETTERS) { rule.stemCharacters = WORDS; }
    }
}

// --- Output -------------------------------------------------------------------
const own = {schema: 1, conditions, transforms};
const text = formatTransforms(own);
writeFileSync(join(here, 'own.json'), text);
console.log(`own.json: ${transforms.length} transforms, ${transforms.reduce((n, t) => n + t.rules.length, 0)} rules`);
