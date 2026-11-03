#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/ga/sources/own.json: the Irish deinflection rules written
// for this pack (docs/languages.md, section 14 step 2), from the tables below.
// Run from the repository root:
//
//   node languages/ga/sources/build-own.mjs [--expanded] [--out <file>]
//
// --expanded writes every cross product (the verb ending tables) as plain
// suffix rules, so `eval-language --per-rule` can count each ending; the
// committed file uses the cross-product form of section 7.3.
//
// The tables follow the standard description of Irish (An Caighdeán Oifigiúil,
// 2017 revision; Wiktionary's Irish conjugation and declension tables):
//
// - initial mutations: lenition (séimhiú), eclipsis (urú), h before a vowel,
//   t before a vowel or s, and the elided particles d', m', b';
// - verbs: the two conjugations (broad and slender stems, syncopated second
//   conjugation stems such as oscail/oscl-, imir/imr-), the monosyllables in
//   -igh (buaigh, léigh, suigh), the -áil/-áin verbs, every tense and mood with
//   the synthetic forms of the standard and the common Munster ones, the
//   autonomous forms, the verbal adjective and the verbal noun, and the eleven
//   irregular verbs with their dependent forms;
// - nouns: genitive, plural and vocative of the five declensions (slender
//   endings, -e, -a, -ach, the strong plurals) and the irregular nouns;
// - adjectives: genitive, plural, comparative and the irregular comparatives;
// - prepositional pronouns, emphatic suffixes and copula forms.
//
// Every rule takes the text as a lookup gives it (conditions 0) and none takes
// another rule's part of speech, so a chain is at most: mutation or elided
// particle, emphatic suffix, then one inflection rule.

import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const EXPANDED = args.includes('--expanded');
const outIndex = args.indexOf('--out');
const OUT = outIndex >= 0 ? args[outIndex + 1] : join(here, 'own.json');

// --- Conditions -------------------------------------------------------------
// wiktionary-to-yomitan's Irish dictionaries put v, n, adj and adv in the
// `rules` column. Names, prepositions, pronouns and particles have none, so
// rules that can reach them (mutations, prepositional pronouns, the copula)
// give no conditions: a form without conditions matches every term.
const conditions = {
    v: {name: 'Verb', isDictionaryForm: true},
    n: {name: 'Noun', isDictionaryForm: true},
    adj: {name: 'Adjective', isDictionaryForm: true},
};

// Classes of language.json used by the rules.
const NO_SPACE = '[^ ]';                 // a stem of one word
const CONSONANT = '{consonant}';         // [bcdfghlmnprst]
const BROAD_VOWEL = '{broadVowel}';      // [aouáóú]
const AFTER_MUTATION = '{afterMutation}';  // what follows the h of lenition or an eclipsed consonant
const LOWER_VOWEL = '{lowerVowel}';
const UPPER_VOWEL = '{upperVowel}';
const VOWEL = '{vowel}';

// --- Building blocks ----------------------------------------------------------
const transforms = [];
const byId = new Map();
const seen = new Map();

function transform(id, name, description) {
    if (byId.has(id)) { throw new Error(`duplicate transform ${id}`); }
    const t = {id, name, description, source: 'own', rules: []};
    transforms.push(t);
    byId.set(id, t);
    seen.set(id, new Set());
    return t;
}

function add(id, rule) {
    const t = byId.get(id);
    if (!t) { throw new Error(`unknown transform ${id}`); }
    const key = JSON.stringify(rule);
    if (seen.get(id).has(key)) { return; }
    seen.get(id).add(key);
    t.rules.push(rule);
}

function prefix(id, inflected, deinflected, conditionsOut, constraints = {}) {
    add(id, {type: 'prefix', inflected, deinflected, conditionsIn: [], conditionsOut, ...constraints});
}

function suffix(id, inflected, deinflected, conditionsOut, constraints = {}) {
    add(id, {type: 'suffix', inflected, deinflected, conditionsIn: [], conditionsOut, ...constraints});
}

function whole(id, inflected, deinflected, conditionsOut) {
    add(id, {type: 'wholeWord', inflected, deinflected, conditionsIn: [], conditionsOut});
}

// Several endings that share their constraints: one cross-product circumfix
// with an empty prefix (section 7.3), or plain suffix rules with --expanded.
function endings(id, pairs, conditionsOut, constraints = {}) {
    const unique = [];
    const keys = new Set();
    for (const [inflected, deinflected] of pairs) {
        const key = `${inflected}\t${deinflected}`;
        if (inflected === '' || keys.has(key)) { continue; }
        keys.add(key);
        unique.push([inflected, deinflected]);
    }
    if (unique.length === 0) { return; }
    if (EXPANDED || unique.length === 1) {
        for (const [inflected, deinflected] of unique) { suffix(id, inflected, deinflected, conditionsOut, constraints); }
        return;
    }
    add(id, {type: 'circumfix', prefixes: [['', '']], suffixes: unique, conditionsIn: [], conditionsOut, ...constraints});
}

// --- Mutations ------------------------------------------------------------------
// A mutation is the outermost change: the particle before the word causes it,
// whatever the word's own ending. These rules remove it from the text as found
// and give no conditions, so every inflection rule and every part of speech
// can follow.
const LENITED = [['bh', 'b'], ['ch', 'c'], ['dh', 'd'], ['fh', 'f'], ['gh', 'g'], ['mh', 'm'], ['ph', 'p'], ['sh', 's'], ['th', 't']];
const ECLIPSED = [['mb', 'b'], ['gc', 'c'], ['nd', 'd'], ['bhf', 'f'], ['ng', 'g'], ['bp', 'p'], ['dt', 't']];
const upper = (s) => s[0].toUpperCase() + s.slice(1);

// Verbs: a lenited stem without an ending, and d' before a vowel or fh, is the
// past tense (bhris sé, d'ól sí, d'fhág siad). This transform comes first so
// that a verb found this way is traced as past, not only as lenited.
transform('past', 'past', 'Past tense: the stem lenited (bhris, cheannaigh, shiúil), or with d\' before a vowel or fh (d\'ól, d\'éirigh, d\'fhág). The irregular verbs have past forms of their own (chonaic, chuaigh, rinne, dúirt, fuair, tháinig, thug, rug, chuala, bhí; dependent faca, deachaigh, dearna, raibh).');
for (const [inflected, deinflected] of LENITED) {
    prefix('past', inflected, deinflected, ['v'], {stemStartsWith: AFTER_MUTATION});
}
prefix('past', 'd\'', '', ['v'], {stemStartsWith: LOWER_VOWEL});
prefix('past', 'd\'fh', 'f', ['v'], {stemStartsWith: AFTER_MUTATION});

transform('lenition', 'lenition', 'Lenition (séimhiú): h after the first consonant, after mo, do, a (his), ní, má, the article (an bhean), in compounds and on adjectives after a feminine noun: bhean → bean, chat → cat, shráid → sráid, Shasana → Sasana.');
for (const [inflected, deinflected] of LENITED) {
    prefix('lenition', inflected, deinflected, [], {stemStartsWith: AFTER_MUTATION});
    prefix('lenition', upper(inflected), upper(deinflected), [], {stemStartsWith: AFTER_MUTATION});
}

transform('eclipsis', 'eclipsis', 'Eclipsis (urú): a consonant before the first one, or n- before a vowel, after ár, bhur, a (their), i, go, an (interrogative), nach, dá and the article after prepositions: mbád → bád, gcathair → cathair, bhfuil → fuil, ndoras → doras, n-athair → athair, i nÉirinn → Éirinn, i mBaile Átha Cliath → Baile Átha Cliath.');
for (const [inflected, deinflected] of ECLIPSED) {
    prefix('eclipsis', inflected, deinflected, [], {stemStartsWith: AFTER_MUTATION});
    // nGaillimh, mBaile, bhFrainc: the eclipsing letters stay lowercase.
    const capital = inflected.slice(0, -1) + inflected.slice(-1).toUpperCase();
    prefix('eclipsis', capital, upper(deinflected), [], {stemStartsWith: AFTER_MUTATION});
}
prefix('eclipsis', 'n-', '', [], {stemStartsWith: LOWER_VOWEL});
prefix('eclipsis', 'n', '', [], {stemStartsWith: UPPER_VOWEL});

transform('h-prefix', 'h before a vowel', 'h before a vowel after na (na hoíche), a (her: a hathair), le, go, chomh, ní (copula) and the ordinals: hoíche → oíche, hÉireann → Éireann, hathair → athair.');
prefix('h-prefix', 'h', '', [], {stemStartsWith: VOWEL});
prefix('h-prefix', 'h-', '', [], {stemStartsWith: VOWEL});

transform('t-prefix', 't before a vowel or s', 't- before a vowel of a masculine noun after the article (an t-uisce, an tUachtarán) and t before s after an (an tsráid, an tsúil): t-uisce → uisce, tUachtarán → Uachtarán, tsráid → sráid.');
prefix('t-prefix', 't-', '', [], {stemStartsWith: LOWER_VOWEL});
prefix('t-prefix', 't', '', [], {stemStartsWith: UPPER_VOWEL});
prefix('t-prefix', 'ts', 's', [], {stemStartsWith: AFTER_MUTATION});
prefix('t-prefix', 'tS', 'S', [], {stemStartsWith: AFTER_MUTATION});

transform('elision', 'elided particle', 'd\', m\' and b\' before a vowel or fh: do (your), mo (my), the past particle do and the copula ba: d\'athair → athair, m\'fhear → fear, d\'ólfadh → ólfadh, b\'fhéidir → féidir.');
for (const particle of ['d\'', 'm\'', 'b\'', 'dh\'']) {
    prefix('elision', particle, '', [], {stemStartsWith: VOWEL});
    prefix('elision', `${particle}fh`, 'f', [], {stemStartsWith: AFTER_MUTATION});
}

transform('emphatic', 'emphatic', 'Emphatic suffixes -sa, -se, -san, -sean and -ne on nouns after a possessive, prepositional pronouns and verbs, and the emphatic pronouns: mo theachsa → teach, agamsa → agam, molaimse → molaim, againne → againn, mise → mé, eisean → é.');
endings('emphatic', [['sa', ''], ['se', ''], ['san', ''], ['sean', ''], ['nne', 'nn']], [], {stemMinLength: 2, stemCharacters: NO_SPACE});
for (const [form, base] of [['mise', 'mé'], ['tusa', 'tú'], ['seisean', 'sé'], ['eisean', 'é'], ['sise', 'sí'], ['ise', 'í'],
    ['sinne', 'sinn'], ['sibhse', 'sibh'], ['siadsan', 'siad'], ['iadsan', 'iad']]) {
    whole('emphatic', form, base, []);
}

// --- Verbs ------------------------------------------------------------------
// The dictionary form of a verb is the imperative 2nd singular (mol, bris,
// ceannaigh, éirigh, oscail, imir). Endings by stem class:
//
//   b1  first conjugation, broad stem: mol, fág, ól, scríobh
//   s1  first conjugation, slender stem: bris, cuir, caill, éist
//   b2  second conjugation, broad: ceannaigh (ceann-), and syncopated
//       oscail (oscl-), labhair (labhr-), cosain (cosn-), codail (codl-)
//   s2  second conjugation, slender: éirigh (éir-), imigh, and syncopated
//       imir (imr-), inis (ins-), aithin (aithn-), and consonant-final
//       foghlaim, tarraing, tuirling
//   bua monosyllables in -igh after a broad long vowel: buaigh (bua-),
//       glaoigh (glao-), dóigh (dó-), brúigh (brú-), báigh (bá-)
//   le  monosyllables in -éigh: léigh (lé-), pléigh, téigh
//   su  monosyllables in -uigh: suigh (su-), luigh, guigh
//
// Munster synthetic forms (mholas, mholadar, molfad, molaid) appear in
// literature and in Wiktionary's tables, so they are read too.
const VERB_ENDINGS = [
    // id, name, description, b1, s1, b2, s2, bua, le, su
    ['present-1sg', 'present 1sg', 'Present tense, first person singular (also the imperative 1sg): molaim, brisim, ceannaím, éirím, osclaím, buaim, léim, suím.',
        ['aim'], ['im'], ['aím'], ['ím'], ['im'], ['im'], ['ím']],
    ['present', 'present', 'Present tense with a pronoun or noun subject (mol + -ann): molann sé, briseann tú, ceannaíonn siad, éiríonn sí, buann, léann, suíonn.',
        ['ann'], ['eann'], ['aíonn'], ['íonn'], ['nn'], ['ann'], ['íonn']],
    ['present-1pl', 'present 1pl', 'Present tense, first person plural (also the present subjunctive 1pl): molaimid, brisimid, ceannaímid, éirímid, buaimid, léimid, suímid.',
        ['aimid'], ['imid'], ['aímid'], ['ímid'], ['imid'], ['imid'], ['ímid']],
    ['present-autonomous', 'present autonomous', 'Present autonomous (no subject named; also the imperative and present subjunctive autonomous): moltar, bristear, ceannaítear, éirítear, buaitear, léitear, suitear, caitear.',
        ['tar'], ['tear'], ['aítear'], ['ítear'], ['itear'], ['itear'], ['itear']],
    ['present-2sg-munster', 'present 2sg (Munster)', 'Present tense, second person singular, Munster synthetic form (also the present subjunctive 2sg): molair, brisir, ceannaír.',
        ['air'], ['ir'], ['aír'], ['ír'], ['ir'], ['ir'], ['ír']],
    ['present-3pl-munster', 'present 3pl (Munster)', 'Present tense, third person plural, Munster synthetic form: molaid, brisid, ceannaíd.',
        ['aid'], ['id'], ['aíd'], ['íd'], ['id'], ['id'], ['íd']],
    ['past-1sg-munster', 'past 1sg (Munster) / present relative', 'Past tense, first person singular, Munster synthetic form (mholas, bhriseas), which is also the Munster relative of the present (a mholas).',
        ['as'], ['eas'], ['aíos'], ['íos'], ['s'], ['as'], ['íos']],
    ['past-2sg-munster', 'past 2sg (Munster)', 'Past tense, second person singular, Munster synthetic form: mholais, bhrisis, cheannaís.',
        ['ais'], ['is'], ['aís'], ['ís'], ['is'], [], ['ís']],
    ['past-1pl', 'past 1pl', 'Past tense, first person plural: mholamar, bhriseamar, cheannaíomar, d\'éiríomar, bhuamar, léamar, shuíomar.',
        ['amar'], ['eamar'], ['aíomar'], ['íomar'], ['mar'], ['amar'], ['íomar']],
    ['past-2pl-munster', 'past 2pl (Munster)', 'Past tense, second person plural, Munster synthetic form: mholabhair, bhriseabhair, cheannaíobhair.',
        ['abhair'], ['eabhair'], ['aíobhair'], ['íobhair'], ['bhair'], ['abhair'], ['íobhair']],
    ['past-3pl-munster', 'past 3pl (Munster)', 'Past tense, third person plural, Munster synthetic form: mholadar, bhriseadar, cheannaíodar.',
        ['adar'], ['eadar'], ['aíodar'], ['íodar'], ['dar'], ['adar'], ['íodar']],
    ['adh', 'past autonomous / habitual / verbal noun', 'The ending -(e)adh, -(a)íodh: past autonomous (moladh é, ceannaíodh), past habitual and past subjunctive 3rd singular (mholadh sé, dá gceannaíodh sé), imperative 3rd singular (moladh sé), and the verbal noun of many verbs (ag moladh, ag briseadh).',
        ['adh'], ['eadh'], ['aíodh'], ['íodh'], ['dh'], ['adh'], ['íodh']],
    ['future', 'future', 'Future tense with a pronoun or noun subject: molfaidh, brisfidh, ceannóidh, éireoidh, osclóidh, buafaidh, léifidh, suífidh; Munster ceannóchaidh.',
        ['faidh'], ['fidh'], ['óidh', 'óchaidh'], ['eoidh', 'eochaidh'], ['faidh'], ['ifidh'], ['ífidh']],
    ['future-1pl', 'future 1pl', 'Future tense, first person plural: molfaimid, brisfimid, ceannóimid, éireoimid, buafaimid, léifimid.',
        ['faimid'], ['fimid'], ['óimid', 'óchaimid'], ['eoimid', 'eochaimid'], ['faimid'], ['ifimid'], ['ífimid']],
    ['future-autonomous', 'future autonomous', 'Future autonomous: molfar, brisfear, ceannófar, éireofar, buafar, léifear.',
        ['far'], ['fear'], ['ófar', 'óchar'], ['eofar', 'eochar'], ['far'], ['ifear'], ['ífear']],
    ['future-1sg-munster', 'future 1sg (Munster)', 'Future tense, first person singular, Munster synthetic form: molfad, brisfead, ceannód.',
        ['fad'], ['fead'], ['ód'], ['eod'], ['fad'], ['ifead'], ['ífead']],
    ['future-2sg-munster', 'future 2sg (Munster)', 'Future tense, second person singular, Munster synthetic form: molfair, brisfir, ceannóir.',
        ['fair'], ['fir'], ['óir'], ['eoir'], ['fair'], ['ifir'], ['ífir']],
    ['future-3pl-munster', 'future 3pl (Munster)', 'Future tense, third person plural, Munster synthetic form: molfaid, brisfid, ceannóid.',
        ['faid'], ['fid'], ['óid'], ['eoid'], ['faid'], ['ifid'], ['ífid']],
    ['future-relative-munster', 'future relative (Munster)', 'Relative form of the future, Munster: a mholfas, a bhrisfeas, a cheannós.',
        ['fas'], ['feas'], ['ós'], ['eos'], ['fas'], ['ifeas'], ['ífeas']],
    ['conditional-1sg', 'conditional 1sg', 'Conditional mood, first person singular: mholfainn, bhrisfinn, cheannóinn, d\'éireoinn, bhuafainn, léifinn.',
        ['fainn'], ['finn'], ['óinn', 'óchainn'], ['eoinn', 'eochainn'], ['fainn'], ['ifinn'], ['ífinn']],
    ['conditional-2sg', 'conditional 2sg', 'Conditional mood, second person singular: mholfá, bhrisfeá, cheannófá, d\'éireofá, bhuafá, léifeá.',
        ['fá'], ['feá'], ['ófá', 'óchthá'], ['eofá', 'eochthá'], ['fá'], ['ifeá'], ['ífeá']],
    ['conditional', 'conditional', 'Conditional mood with a pronoun or noun subject: mholfadh, bhrisfeadh, cheannódh, d\'éireodh, bhuafadh, léifeadh.',
        ['fadh'], ['feadh'], ['ódh', 'óchadh'], ['eodh', 'eochadh'], ['fadh'], ['ifeadh'], ['ífeadh']],
    ['conditional-1pl', 'conditional 1pl', 'Conditional mood, first person plural: mholfaimis, bhrisfimis, cheannóimis, d\'éireoimis.',
        ['faimis'], ['fimis'], ['óimis', 'óchaimis'], ['eoimis', 'eochaimis'], ['faimis'], ['ifimis'], ['ífimis']],
    ['conditional-3pl', 'conditional 3pl', 'Conditional mood, third person plural: mholfaidís, bhrisfidís, cheannóidís, d\'éireoidís.',
        ['faidís'], ['fidís'], ['óidís', 'óchaidís'], ['eoidís', 'eochaidís'], ['faidís'], ['ifidís'], ['ífidís']],
    ['conditional-autonomous', 'conditional autonomous', 'Conditional autonomous: mholfaí, bhrisfí, cheannófaí, d\'éireofaí.',
        ['faí'], ['fí'], ['ófaí', 'óchthaí'], ['eofaí', 'eochthaí'], ['faí'], ['ifí'], ['ífí']],
    ['habitual-1sg', 'past habitual 1sg', 'Past habitual, first person singular (also the past subjunctive 1sg): mholainn, bhrisinn, cheannaínn, d\'éirínn, bhuainn, léinn.',
        ['ainn'], ['inn'], ['aínn'], ['ínn'], ['inn'], ['inn'], ['ínn']],
    ['habitual-2sg', 'past habitual 2sg', 'Past habitual, second person singular (also the past subjunctive 2sg): mholtá, bhristeá, cheannaíteá, bhuaiteá, léiteá, chaiteá.',
        ['tá'], ['teá'], ['aíteá'], ['íteá'], ['iteá'], ['iteá'], ['iteá']],
    ['habitual-1pl', 'past habitual / imperative 1pl', 'First person plural of the past habitual and past subjunctive (mholaimis, dá mbrisimis) and of the imperative (molaimis): ceannaímis, éirímis, buaimis, léimis.',
        ['aimis'], ['imis'], ['aímis'], ['ímis'], ['imis'], ['imis'], ['ímis']],
    ['habitual-3pl', 'past habitual / imperative 3pl', 'Third person plural of the past habitual and past subjunctive (mholaidís, dá mbrisidís) and of the imperative (molaidís): ceannaídís, éirídís, buaidís, léidís.',
        ['aidís'], ['idís'], ['aídís'], ['ídís'], ['idís'], ['idís'], ['ídís']],
    ['habitual-autonomous', 'past habitual autonomous', 'Past habitual autonomous (also the past subjunctive autonomous): mholtaí, bhristí, cheannaítí, bhuaití, léití, chaití.',
        ['taí'], ['tí'], ['aítí'], ['ítí'], ['ití'], ['ití'], ['ití']],
    ['imperative-2pl', 'imperative 2pl', 'Imperative, second person plural: molaigí, brisigí, ceannaígí, éirígí, osclaígí, buaigí, léigí, suígí.',
        ['aigí'], ['igí'], ['aígí'], ['ígí'], ['igí'], ['igí'], ['ígí']],
    ['subjunctive', 'present subjunctive', 'Present subjunctive (after go, nár, sula): go mola sé, go mbrise, go gceannaí, go n-éirí, go mbua, go lé, go dté, go suí.',
        ['a'], ['e'], ['aí'], ['í'], [''], [''], ['í']],
];

const BUA_VOWELS = ['ua', 'ao', 'ó', 'ú', 'á'];
const SYNCOPE_BROAD = ['l', 'n', 'r'];
const SYNCOPE_SLENDER = ['l', 'n', 'r', 's'];
// First-conjugation verbs of more than one syllable whose ending broadens
// before an ending that begins with a vowel or f: sábháil (sábhálann),
// tionóil (tionólann), siúil (siúlann), taispeáin (taispeánann).
const DEPALATALISED = [['ál', 'áil'], ['ól', 'óil'], ['úl', 'úil'], ['án', 'áin']];
const VOWEL_START = /^[aeiouáéíóúf]/;

function verbEndings(id, b1, s1, b2, s2, bua, le, su) {
    const V = ['v'];
    // First conjugation: the ending is added to the dictionary form.
    endings(id, [...b1, ...s1].map((e) => [e, '']), V, {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
    // Stems in -th lose it before t: caith → caitear, caiteá, caití, caite.
    endings(id, [...b1, ...s1].filter((e) => e.startsWith('t')).map((e) => [e, 'th']), V, {stemMinLength: 1, stemCharacters: NO_SPACE, stemEndsWith: VOWEL});
    endings(id, b1.filter((e) => VOWEL_START.test(e)).flatMap((e) => DEPALATALISED.map(([s, lemma]) => [s + e, lemma])), V, {stemMinLength: 1, stemCharacters: NO_SPACE});
    // Second conjugation in -aigh and -igh: the ending replaces it.
    endings(id, [...b2.map((e) => [e, 'aigh']), ...s2.map((e) => [e, 'igh'])], V, {stemMinLength: 2, stemCharacters: NO_SPACE});
    // Syncopated second conjugation: oscl+aíonn → oscail, imr+íonn → imir.
    endings(id, [...SYNCOPE_BROAD.flatMap((c) => b2.map((e) => [c + e, `ai${c}`])), ...SYNCOPE_SLENDER.flatMap((c) => s2.map((e) => [c + e, `i${c}`]))], V,
        {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
    // Second conjugation ending in a consonant: foghlaimíonn → foghlaim.
    endings(id, s2.map((e) => [e, '']), V, {stemMinLength: 3, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
    // Monosyllables in -igh.
    endings(id, [...BUA_VOWELS.flatMap((v) => bua.map((e) => [v + e, `${v}igh`])), ...le.map((e) => [`é${e}`, 'éigh']), ...su.map((e) => [`u${e}`, 'uigh'])], V,
        {stemMinLength: 1, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
}

for (const [id, name, description, ...columns] of VERB_ENDINGS) {
    transform(id, name, description);
    verbEndings(id, ...columns);
}

transform('verbal-adjective', 'verbal adjective', 'Verbal adjective (past participle): molta, briste, scríofa, caite, ceannaithe, éirithe, oscailte, labhartha, imeartha, buaite, léite, suite, sábháilte, taispeánta.');
{
    const V = ['v'];
    endings('verbal-adjective', [['ta', ''], ['tha', ''], ['te', ''], ['the', '']], V, {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
    endings('verbal-adjective', [['te', 'th'], ['ta', 'th'], ['fa', 'bh'], ['fa', 'mh']], V, {stemMinLength: 1, stemCharacters: NO_SPACE, stemEndsWith: VOWEL});
    endings('verbal-adjective', [['aithe', 'aigh'], ['ithe', 'igh']], V, {stemMinLength: 2, stemCharacters: NO_SPACE});
    endings('verbal-adjective', [['artha', 'air'], ['anta', 'ain'], ['alta', 'ail'], ['eartha', 'ir'], ['eanta', 'in'], ['ste', 'is'],
        ['ánta', 'áin'], ['últa', 'úil'], ['ólta', 'óil']], V, {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
    endings('verbal-adjective', [...BUA_VOWELS.map((v) => [`${v}ite`, `${v}igh`]), ['éite', 'éigh'], ['uite', 'uigh']], V,
        {stemMinLength: 1, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
}

transform('verbal-noun', 'verbal noun', 'Verbal noun (ag + verbal noun is the progressive): fágáil, feiceáil, déanamh, caitheamh, fanacht, éisteacht, ceartú, míniú, ceannach, oscailt, imirt, labhairt, tarraingt; irregular rá, teacht, dul, fáil, tabhairt, bheith.');
{
    const V = ['v'];
    endings('verbal-noun', [['áil', ''], ['eáil', ''], ['amh', ''], ['eamh', ''], ['acht', ''], ['eacht', '']], V, {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
    endings('verbal-noun', [['ú', 'aigh'], ['iú', 'igh'], ['ach', 'aigh']], V, {stemMinLength: 2, stemCharacters: NO_SPACE});
    suffix('verbal-noun', 't', '', V, {stemMinLength: 3, stemCharacters: NO_SPACE, stemEndsWith: '{beforeVerbalNounT}'});
}

// Irregular verbs and other forms no ending table reaches. Each form is the
// text as written (a lenited or eclipsed form is first unmutated by the
// mutation rules, so the unmutated form is listed: bhfaca → faca).
const IRREGULAR_VERBS = {
    'bí': {
        'present': ['tá', 'atá', 'fuil', 'níl', 'bíonn'],
        'present-1sg': ['táim', 'fuilim', 'nílim', 'bím'],
        'present-1pl': ['táimid', 'fuilimid', 'nílimid', 'bímid'],
        'present-autonomous': ['táthar', 'fuiltear', 'níltear', 'bítear'],
        'present-3pl-munster': ['bíd'],
        'past': ['raibh'],
        'past-1sg-munster': ['bhíos', 'rabhas'],
        'past-2sg-munster': ['bhís', 'rabhais'],
        'past-1pl': ['bhíomar', 'rabhamar'],
        'past-2pl-munster': ['bhíobhair', 'rabhabhair'],
        'past-3pl-munster': ['bhíodar', 'rabhadar'],
        'adh': ['bhíothas', 'rabhthas', 'bíodh'],
        'future': ['beidh'],
        'future-1pl': ['beimid'],
        'future-autonomous': ['beifear'],
        'future-1sg-munster': ['bead'],
        'future-3pl-munster': ['beid'],
        'conditional': ['beadh'],
        'conditional-1sg': ['beinn'],
        'conditional-2sg': ['beifeá'],
        'conditional-1pl': ['beimis'],
        'conditional-3pl': ['beidís'],
        'conditional-autonomous': ['beifí'],
        'habitual-1sg': ['bínn'],
        'habitual-2sg': ['bíteá'],
        'habitual-1pl': ['bímis'],
        'habitual-3pl': ['bídís'],
        'habitual-autonomous': ['bítí'],
        'imperative-2pl': ['bígí'],
        'verbal-noun': ['bheith'],
    },
    'abair': {
        'present': ['deir', 'deireann'],
        'present-1sg': ['deirim', 'abraim'],
        'present-1pl': ['deirimid'],
        'present-autonomous': ['deirtear', 'abairtear'],
        'present-2sg-munster': ['deirir'],
        'present-3pl-munster': ['deirid'],
        'past': ['dúirt'],
        'past-1sg-munster': ['dúras'],
        'past-2sg-munster': ['dúrais'],
        'past-1pl': ['dúramar'],
        'past-2pl-munster': ['dúrabhair'],
        'past-3pl-munster': ['dúradar'],
        'adh': ['dúradh', 'deireadh', 'abradh'],
        'future': ['déarfaidh'],
        'future-1pl': ['déarfaimid'],
        'future-autonomous': ['déarfar'],
        'future-1sg-munster': ['déarfad'],
        'future-3pl-munster': ['déarfaid'],
        'conditional': ['déarfadh'],
        'conditional-1sg': ['déarfainn'],
        'conditional-2sg': ['déarfá'],
        'conditional-1pl': ['déarfaimis'],
        'conditional-3pl': ['déarfaidís'],
        'conditional-autonomous': ['déarfaí'],
        'habitual-1sg': ['deirinn'],
        'habitual-2sg': ['deirteá'],
        'habitual-1pl': ['deirimis', 'abraimis'],
        'habitual-3pl': ['deiridís', 'abraidís'],
        'habitual-autonomous': ['deirtí'],
        'imperative-2pl': ['abraigí'],
        'subjunctive': ['deire'],
        'verbal-adjective': ['ráite'],
        'verbal-noun': ['rá'],
    },
    'beir': {
        'past': ['rug'],
        'past-1sg-munster': ['rugas'],
        'past-2sg-munster': ['rugais'],
        'past-1pl': ['rugamar'],
        'past-2pl-munster': ['rugabhair'],
        'past-3pl-munster': ['rugadar'],
        'adh': ['rugadh'],
        'future': ['béarfaidh'],
        'future-1pl': ['béarfaimid'],
        'future-autonomous': ['béarfar'],
        'future-1sg-munster': ['béarfad'],
        'conditional': ['béarfadh'],
        'conditional-1sg': ['béarfainn'],
        'conditional-2sg': ['béarfá'],
        'conditional-1pl': ['béarfaimis'],
        'conditional-3pl': ['béarfaidís'],
        'conditional-autonomous': ['béarfaí'],
        'verbal-noun': ['breith'],
    },
    'clois': {
        'past': ['chuala'],
        'past-1sg-munster': ['chualas'],
        'past-2sg-munster': ['chualais'],
        'past-1pl': ['chualamar'],
        'past-2pl-munster': ['chualabhair'],
        'past-3pl-munster': ['chualadar'],
        'adh': ['chualathas', 'chualadh'],
        'verbal-noun': ['cloisteáil', 'cloisint'],
    },
    'déan': {
        'past': ['rinne', 'dearna'],
        'past-1sg-munster': ['rinneas', 'dearnas'],
        'past-2sg-munster': ['rinnis', 'dearnais'],
        'past-1pl': ['rinneamar', 'dearnamar'],
        'past-2pl-munster': ['rinneabhair', 'dearnabhair'],
        'past-3pl-munster': ['rinneadar', 'dearnadar'],
        'adh': ['rinneadh', 'dearnadh'],
    },
    'faigh': {
        'past': ['fuair'],
        'past-1sg-munster': ['fuaireas'],
        'past-2sg-munster': ['fuairis'],
        'past-1pl': ['fuaireamar'],
        'past-2pl-munster': ['fuaireabhair'],
        'past-3pl-munster': ['fuaireadar'],
        'adh': ['fuarthas'],
        'future': ['gheobhaidh', 'faighidh'],
        'future-1pl': ['gheobhaimid'],
        'future-autonomous': ['gheofar', 'faighfear'],
        'future-1sg-munster': ['gheobhad'],
        'future-2sg-munster': ['gheobhair'],
        'future-3pl-munster': ['gheobhaid'],
        'conditional': ['gheobhadh'],
        'conditional-1sg': ['gheobhainn'],
        'conditional-2sg': ['gheofá'],
        'conditional-1pl': ['gheobhaimis'],
        'conditional-3pl': ['gheobhaidís'],
        'conditional-autonomous': ['gheofaí'],
        'verbal-noun': ['fáil'],
    },
    'feic': {
        'past': ['chonaic', 'faca'],
        'past-1sg-munster': ['chonac', 'facas'],
        'past-2sg-munster': ['chonaicís', 'facais'],
        'past-1pl': ['chonaiceamar', 'facamar'],
        'past-2pl-munster': ['chonaiceabhair', 'facabhair'],
        'past-3pl-munster': ['chonaiceadar', 'facadar'],
        'adh': ['chonacthas', 'facthas'],
        // Munster independent forms of the present, future and conditional.
        'present': ['chíonn'],
        'present-1sg': ['chím'],
        'present-1pl': ['chímid'],
        'present-autonomous': ['chítear'],
        'future': ['chífidh'],
        'future-1pl': ['chífimid'],
        'conditional': ['chífeadh'],
        'conditional-1sg': ['chífinn'],
    },
    'ith': {
        'future': ['íosfaidh'],
        'future-1pl': ['íosfaimid'],
        'future-autonomous': ['íosfar'],
        'future-1sg-munster': ['íosfad'],
        'conditional': ['íosfadh'],
        'conditional-1sg': ['íosfainn'],
        'conditional-2sg': ['íosfá'],
        'conditional-1pl': ['íosfaimis'],
        'conditional-3pl': ['íosfaidís'],
        'conditional-autonomous': ['íosfaí'],
        'verbal-noun': ['ithe'],
    },
    'tabhair': {
        'past': ['thug'],
        'verbal-adjective': ['tugtha'],
        'verbal-noun': ['tabhairt'],
    },
    'tar': {
        'past': ['tháinig'],
        'past-1sg-munster': ['thánag', 'thángas'],
        'past-2sg-munster': ['thángais'],
        'past-1pl': ['thángamar'],
        'past-2pl-munster': ['thángabhair'],
        'past-3pl-munster': ['thángadar'],
        'adh': ['thángthas', 'thángathas'],
        'verbal-adjective': ['tagtha'],
        'verbal-noun': ['teacht'],
    },
    'téigh': {
        'past': ['chuaigh', 'deachaigh'],
        'past-1sg-munster': ['chuas', 'deachas'],
        'past-2sg-munster': ['chuais', 'deachais'],
        'past-1pl': ['chuamar', 'deachamar'],
        'past-2pl-munster': ['chuabhair', 'deachabhair'],
        'past-3pl-munster': ['chuadar', 'deachadar'],
        'adh': ['chuathas', 'deachthas', 'deachathas'],
        'future': ['rachaidh', 'raghaidh'],
        'future-1pl': ['rachaimid', 'raghaimid'],
        'future-autonomous': ['rachfar', 'raghfar'],
        'future-1sg-munster': ['rachad', 'raghad'],
        'future-2sg-munster': ['rachair'],
        'future-3pl-munster': ['rachaid'],
        'future-relative-munster': ['rachas'],
        'conditional': ['rachadh', 'raghadh'],
        'conditional-1sg': ['rachainn', 'raghainn'],
        'conditional-2sg': ['rachfá', 'raghfá'],
        'conditional-1pl': ['rachaimis', 'raghaimis'],
        'conditional-3pl': ['rachaidís', 'raghaidís'],
        'conditional-autonomous': ['rachfaí', 'raghfaí'],
        'verbal-adjective': ['dulta'],
        'verbal-noun': ['dul'],
    },
    'nigh': {
        'present': ['níonn'], 'present-1sg': ['ním'], 'present-1pl': ['nímid'], 'present-autonomous': ['nitear'],
        'past-1pl': ['níomar'], 'adh': ['níodh'], 'future': ['nífidh'], 'future-1pl': ['nífimid'], 'future-autonomous': ['nífear'],
        'conditional': ['nífeadh'], 'conditional-1sg': ['nífinn'], 'conditional-2sg': ['nífeá'], 'conditional-1pl': ['nífimis'],
        'conditional-3pl': ['nífidís'], 'conditional-autonomous': ['nífí'], 'habitual-1sg': ['nínn'], 'habitual-2sg': ['niteá'],
        'habitual-1pl': ['nímis'], 'habitual-3pl': ['nídís'], 'habitual-autonomous': ['nití'], 'imperative-2pl': ['nígí'],
        'verbal-adjective': ['nite'],
    },
};
// Verbal nouns that no ending rule reaches.
const IRREGULAR_VERBAL_NOUNS = [
    ['cur', 'cuir'], ['siúl', 'siúil'], ['insint', 'inis'], ['codladh', 'codail'], ['imeacht', 'imigh'], ['éirí', 'éirigh'],
    ['suí', 'suigh'], ['luí', 'luigh'], ['guí', 'guigh'], ['leanúint', 'lean'], ['iompar', 'iompair'], ['ceangal', 'ceangail'],
    ['buachan', 'buaigh'], ['glaoch', 'glaoigh'], ['léamh', 'léigh'], ['plé', 'pléigh'], ['bualadh', 'buail'],
    ['creidiúint', 'creid'], ['tuiscint', 'tuig'], ['coinneáil', 'coinnigh'], ['titim', 'tit'], ['smaoineamh', 'smaoinigh'],
    ['fiafraí', 'fiafraigh'], ['oibriú', 'oibrigh'], ['cloí', 'cloígh'], ['tosú', 'tosaigh'],
];

// Stems that take the regular endings of their own class but are not the
// dictionary form: tabhair (tug-, tabhar-), tar (tag-, tioc-).
const IRREGULAR_STEMS = [
    // lemma, stem, ending tables (the ids of VERB_ENDINGS whose b1 endings it takes)
    ['tabhair', 'tug', ['present-1sg', 'present', 'present-1pl', 'present-autonomous', 'present-3pl-munster', 'past-1sg-munster', 'past-2sg-munster',
        'past-1pl', 'past-2pl-munster', 'past-3pl-munster', 'adh', 'habitual-1sg', 'habitual-2sg', 'habitual-1pl', 'habitual-3pl', 'habitual-autonomous',
        'imperative-2pl', 'subjunctive']],
    ['tabhair', 'tabhar', ['future', 'future-1pl', 'future-autonomous', 'future-1sg-munster', 'future-3pl-munster', 'conditional', 'conditional-1sg',
        'conditional-2sg', 'conditional-1pl', 'conditional-3pl', 'conditional-autonomous']],
    ['tar', 'tag', ['present-1sg', 'present', 'present-1pl', 'present-autonomous', 'present-3pl-munster', 'adh', 'habitual-1sg', 'habitual-2sg',
        'habitual-1pl', 'habitual-3pl', 'habitual-autonomous', 'imperative-2pl', 'subjunctive']],
    ['tar', 'tioc', ['future', 'future-1pl', 'future-autonomous', 'future-1sg-munster', 'future-3pl-munster', 'conditional', 'conditional-1sg',
        'conditional-2sg', 'conditional-1pl', 'conditional-3pl', 'conditional-autonomous']],
];

for (const [lemma, tenses] of Object.entries(IRREGULAR_VERBS)) {
    for (const [id, forms] of Object.entries(tenses)) {
        for (const form of forms) { whole(id, form, lemma, ['v']); }
    }
}
for (const [form, lemma] of IRREGULAR_VERBAL_NOUNS) { whole('verbal-noun', form, lemma, ['v']); }
for (const [lemma, stem, ids] of IRREGULAR_STEMS) {
    for (const id of ids) {
        const row = VERB_ENDINGS.find((r) => r[0] === id);
        for (const ending of row[3]) { whole(id, stem + ending, lemma, ['v']); }
    }
}

// --- Nouns and adjectives ---------------------------------------------------------
// Slenderisation: an i before the last consonants of the word (bád → báid,
// cat → cait, post → poist, éan → éin, fear → fir), the genitive singular and
// the plural of first-declension nouns, their vocative, and the genitive
// singular masculine of adjectives (an fhir mhóir). -ach → -aigh and
// -each → -igh likewise (Sasanach → Sasanaigh, coileach → coiligh).
const SLENDER = [['ai', 'a'], ['ái', 'á'], ['oi', 'o'], ['ói', 'ó'], ['ui', 'u'], ['úi', 'ú'], ['ei', 'ea'], ['ei', 'e'], ['éi', 'éa'], ['i', 'ea'], ['í', 'ío']];
const changeLast = (from, to) => ({from: [from], to, occurrence: 'last', between: CONSONANT});

transform('slender', 'genitive / plural / vocative', 'Slender form of a first-declension noun or adjective: genitive singular (an bháid, an fhir, an Sasanaigh), plural (na báid, na fir, éin), vocative (a Sheáin, a fhir) and the genitive masculine of adjectives (an fhir mhóir): báid → bád, fir → fear, éin → éan, poist → post, Sasanaigh → Sasanach.');
for (const [from, to] of SLENDER) {
    suffix('slender', '', '', ['n', 'adj'], {stemCharacters: NO_SPACE, stemEndsWith: CONSONANT, stemChange: changeLast(from, to)});
}
endings('slender', [['aigh', 'ach'], ['igh', 'each']], ['n', 'adj'], {stemMinLength: 2, stemCharacters: NO_SPACE});

transform('genitive', 'genitive', 'Genitive singular of the second to fifth declensions: -e with a slender stem (sráide, bróige, coise, láimhe, gréine), -aí and -í for -ach and -each (gealaí, báistí), the broad endings of agent nouns (múinteora, dochtúra, búistéara, feola, bliana), -ach, -rach, -ar and -n (cathrach, traenach, athar, teangan, carad, Éireann), and the irregular nouns (tí, lae, mná, Dé, mara, fola).');
{
    const N = ['n'];
    suffix('genitive', 'e', '', N, {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
    for (const [from, to] of [['ai', 'a'], ['ái', 'á'], ['oi', 'o'], ['ói', 'ó'], ['ui', 'u'], ['úi', 'ú'], ['éi', 'ia'], ['ei', 'ea']]) {
        suffix('genitive', 'e', '', N, {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT, stemChange: changeLast(from, to)});
    }
    endings('genitive', [['aí', 'ach'], ['í', 'each'], ['éara', 'éir']], N, {stemMinLength: 2, stemCharacters: NO_SPACE});
    endings('genitive', [['ra', 'ir'], ['la', 'il'], ['na', 'in'], ['nach', 'in'], ['lach', 'il'], ['rach', 'ir']], N, {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: BROAD_VOWEL});
    endings('genitive', [['rach', 'air'], ['each', ''], ['ar', 'air'], ['ár', 'áir'], ['an', 'ain'], ['ann', 'ainn'], ['an', 'a'], ['ag', 'aig']], N,
        {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
    endings('genitive', [['ann', ''], ['ún', 'ú'], ['ad', 'a'], ['ead', 'e']], N, {stemMinLength: 3, stemCharacters: NO_SPACE});
    for (const [form, lemma] of [['tí', 'teach'], ['lae', 'lá'], ['Dé', 'Dia'], ['dí', 'deoch'], ['mara', 'muir'], ['fola', 'fuil'], ['meala', 'mil'],
        ['olla', 'olann'], ['scine', 'scian'], ['sléibhe', 'sliabh'], ['leapa', 'leaba'], ['talún', 'talamh'], ['míosa', 'mí'], ['oibre', 'obair'],
        ['coda', 'cuid'], ['Éirinn', 'Éire'], ['iníne', 'iníon'], ['mic', 'mac'], ['buachalla', 'buachaill'], ['bó', 'bó'], ['cnoic', 'cnoc']]) {
        if (form !== lemma) { whole('genitive', form, lemma, N); }
    }
}

transform('noun-a', 'plural / genitive', 'The ending -a: plural of many nouns (bróga, cosa, lámha, fuinneoga, úlla) and the genitive singular of the third declension (ama, srutha, locha, Gaeltachta).');
suffix('noun-a', 'a', '', ['n'], {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});

transform('plural', 'plural', 'Strong plurals: -(e)anna (scoileanna, amanna), -í (cailíní, múinteoirí, páistí), -aí (daltaí, rudaí), -(e)acha (teangacha, cathracha, litreacha), -te and -the (bailte, coillte, ríthe), -ta (scéalta), -anta (oícheanta, uaireanta), -nna (míonna), and the irregular plurals (mná, daoine, tithe, laethanta, cairde, ba).');
{
    const N = ['n'];
    endings('plural', [['anna', ''], ['eanna', ''], ['í', ''], ['í', 'e'], ['aí', 'a'], ['aí', ''], ['acha', 'a'], ['eacha', ''], ['neacha', ''],
        ['racha', 'air'], ['reacha', 'ir'], ['ithe', 'í'], ['te', ''], ['te', 'e'], ['ta', '']], N, {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
    endings('plural', [['the', ''], ['nna', '']], N, {stemMinLength: 1, stemCharacters: NO_SPACE, stemEndsWith: VOWEL});
    endings('plural', [['anta', ''], ['eanta', '']], N, {stemMinLength: 2, stemCharacters: NO_SPACE});
    for (const [form, lemma] of [['mná', 'bean'], ['ban', 'bean'], ['daoine', 'duine'], ['tithe', 'teach'], ['laethanta', 'lá'], ['ba', 'bó'],
        ['cairde', 'cara'], ['blianta', 'bliain'], ['bliana', 'bliain'], ['aibhneacha', 'abhainn'], ['leapacha', 'leaba'], ['uibheacha', 'ubh'],
        ['caoirigh', 'caora'], ['fiacla', 'fiacail'], ['doirse', 'doras'], ['soilse', 'solas'], ['bóithre', 'bóthar'], ['tailte', 'talamh'],
        ['aithreacha', 'athair'], ['máithreacha', 'máthair'], ['oibreacha', 'obair'], ['sceana', 'scian'], ['sléibhte', 'sliabh'],
        ['déithe', 'dia'], ['nithe', 'ní'], ['slite', 'slí'], ['deirfiúracha', 'deirfiúr'], ['uaire', 'uair'], ['cinn', 'ceann']]) {
        whole('plural', form, lemma, N);
    }
}

transform('adj-plural', 'plural', 'Plural of an adjective: móra, beaga, deasa, tábhachtacha, díreacha.');
endings('adj-plural', [['a', '']], ['adj'], {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
endings('adj-plural', [['acha', 'ach'], ['eacha', 'each']], ['adj'], {stemMinLength: 2, stemCharacters: NO_SPACE});

transform('adj-e', 'comparative / plural / genitive feminine', 'An adjective in -e or -úla: the comparative and superlative (níos óige, is glaine), the genitive singular feminine (na mná óige) and, for slender stems, the plural (glice, maithe): óige → óg, glaine → glan, gile → geal, deise → deas, tábhachtaí → tábhachtach, dírí → díreach, suimiúla → suimiúil, láidre → láidir, deacra → deacair, milse → milis.');
{
    const A = ['adj'];
    suffix('adj-e', 'e', '', A, {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
    for (const [from, to] of [['ai', 'a'], ['ái', 'á'], ['oi', 'o'], ['ói', 'ó'], ['ui', 'u'], ['úi', 'ú'], ['ei', 'ea'], ['éi', 'éa'], ['i', 'ea'], ['í', 'ío']]) {
        suffix('adj-e', 'e', '', A, {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT, stemChange: changeLast(from, to)});
    }
    endings('adj-e', [['úla', 'úil'], ['aí', 'ach'], ['í', 'each']], A, {stemMinLength: 2, stemCharacters: NO_SPACE});
    endings('adj-e', [['re', 'ir'], ['ra', 'air'], ['se', 'is']], A, {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
}

transform('comparative', 'comparative', 'Irregular comparatives and superlatives (níos mó, is fearr): mó → mór, lú → beag, fearr → maith, measa → olc, sine → sean, faide → fada, giorra → gearr, teo → te, fusa → furasta, túisce → luath, áille → álainn, ísle → íseal, uaisle → uasal.');
for (const [form, lemma] of [['mó', 'mór'], ['lú', 'beag'], ['fearr', 'maith'], ['measa', 'olc'], ['sine', 'sean'], ['faide', 'fada'], ['sia', 'fada'],
    ['giorra', 'gearr'], ['teo', 'te'], ['fusa', 'furasta'], ['túisce', 'luath'], ['gaire', 'gar'], ['lia', 'iomaí'], ['áille', 'álainn'],
    ['ísle', 'íseal'], ['uaisle', 'uasal'], ['fliche', 'fliuch'], ['tréine', 'tréan'], ['líonmhaire', 'líonmhar']]) {
    whole('comparative', form, lemma, ['adj']);
}

// --- Prepositional pronouns ---------------------------------------------------
// Each preposition joins a personal pronoun: ag + mé → agam. The result gives
// the preposition, which dictionaries list without a part of speech.
const PREPOSITIONAL_PRONOUNS = {
    // preposition: [1sg, 2sg, 3sg masc, 3sg fem, 1pl, 2pl, 3pl]
    'ag': ['agam', 'agat', 'aige', 'aici', 'againn', 'agaibh', 'acu'],
    'ar': ['orm', 'ort', 'air', 'uirthi', 'orainn', 'oraibh', 'orthu'],
    'as': ['asam', 'asat', '', 'aisti', 'asainn', 'asaibh', 'astu'],
    'chuig': ['chugam', 'chugat', 'chuige', 'chuici', 'chugainn', 'chugaibh', 'chucu'],
    'de': ['díom', 'díot', '', 'di', 'dínn', 'díbh', 'díobh'],
    'do': ['dom', 'duit', 'dó', 'di', 'dúinn', 'daoibh', 'dóibh'],
    'faoi': ['fúm', 'fút', '', 'fúithi', 'fúinn', 'fúibh', 'fúthu'],
    'i': ['ionam', 'ionat', 'ann', 'inti', 'ionainn', 'ionaibh', 'iontu'],
    'idir': ['', '', '', '', 'eadrainn', 'eadraibh', 'eatarthu'],
    'le': ['liom', 'leat', 'leis', 'léi', 'linn', 'libh', 'leo'],
    'ó': ['uaim', 'uait', 'uaidh', 'uaithi', 'uainn', 'uaibh', 'uathu'],
    'roimh': ['romham', 'romhat', 'roimhe', 'roimpi', 'romhainn', 'romhaibh', 'rompu'],
    'thar': ['tharam', 'tharat', 'thairis', 'thairsti', 'tharainn', 'tharaibh', 'tharstu'],
    'trí': ['tríom', 'tríot', 'tríd', 'tríthi', 'trínn', 'tríbh', 'tríothu'],
    'um': ['umam', 'umat', 'uime', 'uimpi', 'umainn', 'umaibh', 'umpu'],
};
const PERSONS = [
    ['pp-1sg', 'with me (1sg)', 'Prepositional pronoun, first person singular: agam, orm, liom, dom, uaim, fúm.'],
    ['pp-2sg', 'with you (2sg)', 'Prepositional pronoun, second person singular: agat, ort, leat, duit, uait, fút.'],
    ['pp-3sg-masc', 'with him (3sg m.)', 'Prepositional pronoun, third person singular masculine: aige, air, leis, dó, uaidh, ann.'],
    ['pp-3sg-fem', 'with her (3sg f.)', 'Prepositional pronoun, third person singular feminine: aici, uirthi, léi, di, uaithi, inti.'],
    ['pp-1pl', 'with us (1pl)', 'Prepositional pronoun, first person plural: againn, orainn, linn, dúinn, uainn, fúinn.'],
    ['pp-2pl', 'with you (2pl)', 'Prepositional pronoun, second person plural: agaibh, oraibh, libh, daoibh, uaibh, fúibh.'],
    ['pp-3pl', 'with them (3pl)', 'Prepositional pronoun, third person plural: acu, orthu, leo, dóibh, uathu, fúthu.'],
];
for (const [id, name, description] of PERSONS) { transform(id, name, description); }
for (const [preposition, forms] of Object.entries(PREPOSITIONAL_PRONOUNS)) {
    forms.forEach((form, person) => {
        if (form !== '' && form !== preposition) { whole(PERSONS[person][0], form, preposition, []); }
    });
}

transform('copula', 'copula', 'Forms of the copula is: ba (past and conditional), níorbh, arbh, gurbh, nárbh, cérbh (before a vowel or f), ab and gurb (dependent present before a vowel).');
for (const form of ['ba', 'níorbh', 'arbh', 'gurbh', 'nárbh', 'cérbh', 'ab', 'gurb']) { whole('copula', form, 'is', []); }

// --- Output ------------------------------------------------------------------------------
const out = {schema: 1, conditions, transforms: transforms.filter((t) => t.rules.length > 0)};
writeFileSync(OUT, formatTransforms(out));
const rules = out.transforms.reduce((n, t) => n + t.rules.length, 0);
const expanded = out.transforms.reduce((n, t) => n + t.rules.reduce((m, r) => m + (r.suffixes ? r.suffixes.length : 1), 0), 0);
console.log(`ga: ${out.transforms.length} transforms, ${rules} rules (${expanded} with cross products expanded) in ${OUT}`);
