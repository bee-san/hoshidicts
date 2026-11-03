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
//
// The first version of this file had v, n and adj without subconditions.
// Once Yomitan's rules were read (step 3), v and n were given Yomitan's
// definitions (v over v_phr, n over np and ns), which
// tools/merge-transforms.mjs requires to be equal. A rule's `v` output and a
// dictionary's `v` tag still stand for the same bits, so no deinflection or
// lookup changes. adv is Yomitan's too; only the lower-cased outputs of
// the h, t and n prefixes give it.
const conditions = {
    v: {name: 'Verb', isDictionaryForm: true, subConditions: ['v_phr']},
    v_phr: {name: 'Phrasal verb', isDictionaryForm: true},
    n: {name: 'Noun', isDictionaryForm: true, subConditions: ['np', 'ns']},
    np: {name: 'Noun plural', isDictionaryForm: true},
    ns: {name: 'Noun singular', isDictionaryForm: true},
    adj: {name: 'Adjective', isDictionaryForm: true},
    adv: {name: 'Adverb', isDictionaryForm: true},
    // A verb form whose lenition or past d' was removed, for the Munster
    // -(e)as and -(a)is past forms only: no dictionary row carries it.
    lenited: {name: 'Lenited verb form', isDictionaryForm: false},
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
    // A stem with a first or last letter in a class has at least one letter,
    // and a stem change with a consonant after the vowel ends in a consonant:
    // the constraints that would only repeat that are left out.
    if (rule.stemMinLength === 1 && (rule.stemEndsWith || rule.stemStartsWith)) { delete rule.stemMinLength; }
    if (rule.stemEndsWith === CONSONANT && rule.stemChange?.between === CONSONANT && !rule.inflected && rule.type === 'suffix') { delete rule.stemEndsWith; }
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
function plainEndings(id, pairs, conditionsOut, constraints = {}) {
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
const endings = plainEndings;

// --- Mutations ------------------------------------------------------------------
// A mutation is the outermost change: the particle before the word causes it,
// whatever the word's own ending. These rules remove it from the text as found
// and give no conditions, so every inflection rule and every part of speech
// can follow.
const LENITED = [['bh', 'b'], ['ch', 'c'], ['dh', 'd'], ['fh', 'f'], ['gh', 'g'], ['mh', 'm'], ['ph', 'p'], ['sh', 's'], ['th', 't']];
const ECLIPSED = [['mb', 'b'], ['gc', 'c'], ['nd', 'd'], ['bhf', 'f'], ['ng', 'g'], ['bp', 'p'], ['dt', 't']];
const upper = (s) => s[0].toUpperCase() + s.slice(1);

// The regular past tense is the stem lenited (bhris sé), or with d' before a
// vowel or fh (d'ól sí, d'fhág siad). The lenition and elision rules below
// remove those, so `past` holds only the irregular past forms. A first
// version had lenited-stem rules here too; they gave the same texts as
// lenition with a `past` trace, which a lookup then showed for every lenited
// word with a verb homograph (mhaith → maith "past", bheidh → beidh "past").
transform('past', 'past', 'Past tense of the irregular verbs: chonaic, chuaigh, rinne, dúirt, fuair, tháinig, thug, rug, chuala, bhí, with the dependent forms faca, deachaigh, dearna, raibh. Regular verbs lenite the stem (bhris, cheannaigh, shiúil) or put d\' before a vowel or fh (d\'ól, d\'éirigh, d\'fhág), which lenition and the elided particle remove.');

transform('lenition', 'lenition', 'Lenition (séimhiú): h after the first consonant, after mo, do, a (his), ní, má, the article (an bhean), in compounds and on adjectives after a feminine noun: bhean → bean, chat → cat, shráid → sráid, Shasana → Sasana.');
for (const [inflected, deinflected] of LENITED) {
    prefix('lenition', inflected, deinflected, [], {stemStartsWith: AFTER_MUTATION});
    prefix('lenition', upper(inflected), upper(deinflected), [], {stemStartsWith: AFTER_MUTATION});
}
// The Munster past forms in -(e)as and -(a)is are read with their lenited
// initial or past d' (mholas, d'ólais): as plain endings they read the -as
// nouns as verbs (beartas → beart). Their rules keep the initial and give the
// intermediate condition `lenited`, which only these twins of the lenition and
// d' rules take, so the reading takes two steps and a lenited noun of one step
// comes first (chlós → clós, not clóigh; chumas → cumas, not cum). The twins
// also apply to a text without conditions, where they repeat the texts of the
// rules above with narrower conditions.
for (const [inflected, deinflected] of LENITED) {
    add('lenition', {type: 'prefix', inflected, deinflected, conditionsIn: ['lenited'], conditionsOut: ['v'], stemStartsWith: AFTER_MUTATION});
    add('lenition', {type: 'prefix', inflected: upper(inflected), deinflected: upper(deinflected), conditionsIn: ['lenited'], conditionsOut: ['v'],
        stemStartsWith: AFTER_MUTATION});
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
// A capital after the prefix marks a name (nÉirinn) or a title (an tAire,
// i nAontroim); dictionaries list titles in lower case, so both are given.
// The lower-cased output is a dictionary form of any tagged part of speech
// and no rule takes it further. Lenition and eclipsis have no such output: on
// the Irish Wikipedia's frequent words it put corcaí (marshes) before
// Corcaigh for Chorcaí (1,826 tokens) while fixing Fhéile (666; Known gaps).
const LOWER_FIRST = [{case: 'lowerFirst'}];
const LOWER_OUT = ['n', 'v', 'adj', 'adv'];
add('eclipsis', {type: 'prefix', inflected: 'n', deinflected: '', conditionsIn: [], conditionsOut: LOWER_OUT, stemStartsWith: UPPER_VOWEL, then: LOWER_FIRST});

transform('h-prefix', 'h before a vowel', 'h before a vowel after na (na hoíche), a (her: a hathair), le, go, chomh, ní (copula) and the ordinals: hoíche → oíche, hÉireann → Éireann, hathair → athair.');
prefix('h-prefix', 'h', '', [], {stemStartsWith: VOWEL});
prefix('h-prefix', 'h-', '', [], {stemStartsWith: VOWEL});
add('h-prefix', {type: 'prefix', inflected: 'h', deinflected: '', conditionsIn: [], conditionsOut: LOWER_OUT, stemStartsWith: UPPER_VOWEL, then: LOWER_FIRST});

transform('t-prefix', 't before a vowel or s', 't- before a vowel of a masculine noun after the article (an t-uisce, an tUachtarán, an tAire) and t before s after an (an tsráid, an tsúil): t-uisce → uisce, tUachtarán → Uachtarán, tAire → aire, tsráid → sráid.');
prefix('t-prefix', 't-', '', [], {stemStartsWith: LOWER_VOWEL});
prefix('t-prefix', 't', '', [], {stemStartsWith: UPPER_VOWEL});
add('t-prefix', {type: 'prefix', inflected: 't', deinflected: '', conditionsIn: [], conditionsOut: LOWER_OUT, stemStartsWith: UPPER_VOWEL, then: LOWER_FIRST});
prefix('t-prefix', 'ts', 's', [], {stemStartsWith: AFTER_MUTATION});
prefix('t-prefix', 'tS', 'S', [], {stemStartsWith: AFTER_MUTATION});

transform('elision', 'elided particle', 'd\', m\' and b\' before a vowel or fh: do (your), mo (my), the past particle do and the copula ba: d\'athair → athair, m\'fhear → fear, d\'ólfadh → ólfadh, b\'fhéidir → féidir.');
for (const particle of ['d\'', 'm\'', 'b\'', 'dh\'']) {
    prefix('elision', particle, '', [], {stemStartsWith: VOWEL});
    prefix('elision', `${particle}fh`, 'f', [], {stemStartsWith: AFTER_MUTATION});
}
// The past d' before the Munster -(e)as and -(a)is forms (d'ólas, d'fhágais).
add('elision', {type: 'prefix', inflected: 'd\'', deinflected: '', conditionsIn: ['lenited'], conditionsOut: ['v'], stemStartsWith: VOWEL});
add('elision', {type: 'prefix', inflected: 'd\'fh', deinflected: 'f', conditionsIn: ['lenited'], conditionsOut: ['v'], stemStartsWith: AFTER_MUTATION});

// The emphatic suffixes. -sa/-se/-san/-sean follow the vowel quality of the
// word. On the prepositional pronouns they are written out below (agamsa,
// leatsa, aigesean); otherwise they are read only after the synthetic verb
// endings -m, -nn and -d (molaimse, mholfainnse, molfadsa), because a rule for
// every word in -se read brainse as brain and stáitse as stáit. The first
// person plural -ne is written out (a rule for every word in -nne read rinne
// as rinn).
transform('emphatic', 'emphatic', 'Emphatic suffixes -sa, -se, -san, -sean and -ne on prepositional pronouns and verbs, and the emphatic pronouns: agamsa → agam, againne → againn, aigesean → aige, molaimse → molaim, mholfainnse → mholfainn, mise → mé, eisean → é.');
endings('emphatic', [['msa', 'm'], ['mse', 'm'], ['nnsa', 'nn'], ['nnse', 'nn'], ['dsa', 'd'], ['dse', 'd']], [], {stemMinLength: 2, stemCharacters: NO_SPACE});
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

const BUA_VOWELS = ['ua', 'ao', 'ó', 'ú', 'á', 'eá'];
const SYNCOPE_BROAD = ['l', 'n', 'r'];
const SYNCOPE_SLENDER = ['l', 'n', 'r', 's'];
// First-conjugation verbs of more than one syllable whose ending broadens
// before an ending that begins with a vowel or f: sábháil (sábhálann),
// tionóil (tionólann), siúil (siúlann), taispeáin (taispeánann); before t
// the -áin, -óil and -úil verbs broaden too (taispeántar, siúltar).
const DEPALATALISED = [['ál', 'áil'], ['ól', 'óil'], ['úl', 'úil'], ['án', 'áin']];
const DEPALATALISED_T = [['ól', 'óil'], ['úl', 'úil'], ['án', 'áin']];
// Other first-conjugation verbs of two syllables broaden their last vowel
// before every broad ending: adhlaic (adhlacann, d'adhlacamar), diúraic
// (diúracfaidh), diongaibh (diongabhfaidh), tiomáin (thiomántaí).
const BROADENING = [['a', 'ai'], ['á', 'ái'], ['ó', 'ói'], ['ú', 'úi']];
const VOWEL_START = /^[aeiouáéíóúf]/;

// The Munster synthetic past forms in -(e)as and -(a)is are read only with
// the lenited initial or the d' of the past (mholas, bhrisis, d'ólais,
// d'fhágas): as plain endings they read the -as nouns and their genitives
// as verbs (beartas → beart, cleachtais → cleacht, fearas → fear).
const LENITED_ONLY = new Set(['past-1sg-munster', 'past-2sg-munster']);
// The initial is kept (identity prefix pairs); the twins remove it.
const PAST_INITIALS = [...LENITED.map(([i]) => [i, i]), ['d\'', 'd\''], ['d\'fh', 'd\'fh']];
function lenitedEndings(id, pairs, conditionsOut, constraints = {}) {
    const unique = [...new Map(pairs.filter(([i]) => i !== '').map((p) => [p.join('\t'), p])).values()];
    if (unique.length === 0) { return; }
    const groups = EXPANDED ? unique.map((p) => [p]) : [unique];
    for (const suffixes of groups) {
        add(id, {type: 'circumfix', prefixes: PAST_INITIALS, suffixes, conditionsIn: [], conditionsOut: ['lenited'], ...constraints});
    }
}

function verbEndings(id, b1, s1, b2, s2, bua, le, su) {
    const V = ['v'];
    const endings = LENITED_ONLY.has(id) ? lenitedEndings : plainEndings;
    // First conjugation: the ending is added to the dictionary form.
    endings(id, [...b1, ...s1].map((e) => [e, '']), V, {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
    // Stems in -th lose it before t (caith → caitear, caiteá, caití), and
    // stems in -t take one t (docht → dochtar, dochtaí; tit → titear).
    endings(id, [...b1, ...s1].filter((e) => e.startsWith('t')).map((e) => [e, 'th']), V, {stemMinLength: 1, stemCharacters: NO_SPACE, stemEndsWith: VOWEL});
    endings(id, [...b1, ...s1].filter((e) => e.startsWith('t')).map((e) => [e, 't']), V, {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
    endings(id, b1.filter((e) => VOWEL_START.test(e)).flatMap((e) => DEPALATALISED.map(([s, lemma]) => [s + e, lemma])), V, {stemMinLength: 1, stemCharacters: NO_SPACE});
    endings(id, b1.filter((e) => e.startsWith('t')).flatMap((e) => DEPALATALISED_T.map(([s, lemma]) => [s + e, lemma])), V, {stemMinLength: 1, stemCharacters: NO_SPACE});
    for (const [from, to] of BROADENING) {
        endings(id, b1.map((e) => [e, '']), V, {stemMinLength: 5, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT,
            stemChange: {from: [from], to, occurrence: 'last', between: CONSONANT}});
    }
    // Second conjugation in -aigh and -igh: the ending replaces it. A few
    // -igh verbs take the broad endings (uimhrigh → uimhraíonn).
    endings(id, [...b2.map((e) => [e, 'aigh']), ...s2.map((e) => [e, 'igh'])], V, {stemMinLength: 2, stemCharacters: NO_SPACE});
    endings(id, b2.map((e) => [e, 'igh']), V, {stemMinLength: 3, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
    // Syncopated second conjugation: oscl+aíonn → oscail, imr+íonn → imir.
    endings(id, [...SYNCOPE_BROAD.flatMap((c) => b2.map((e) => [c + e, `ai${c}`])), ...SYNCOPE_SLENDER.flatMap((c) => s2.map((e) => [c + e, `i${c}`]))], V,
        {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
    // Second conjugation that broadens without syncope: freastail →
    // freastalaíonn, taistil → taistealaíonn.
    endings(id, [...SYNCOPE_BROAD.flatMap((c) => b2.map((e) => [`a${c}${e}`, `ai${c}`])), ...SYNCOPE_BROAD.flatMap((c) => b2.map((e) => [`ea${c}${e}`, `i${c}`]))], V,
        {stemMinLength: 3, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
    // Second conjugation ending in a consonant: foghlaimíonn → foghlaim.
    endings(id, s2.map((e) => [e, '']), V, {stemMinLength: 3, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
    // Monosyllables in -igh: buaigh, meáigh, léigh, suigh, and after a
    // consonant only (ligh, figh, nigh, dligh) the endings of suigh.
    endings(id, [...BUA_VOWELS.flatMap((v) => bua.map((e) => [v + e, `${v}igh`])), ...le.map((e) => [`é${e}`, 'éigh']), ...su.map((e) => [`u${e}`, 'uigh'])], V,
        {stemMinLength: 1, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
    endings(id, su.map((e) => [e, 'igh']), V, {stemMinLength: 1, stemCharacters: CONSONANT});
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
    endings('verbal-adjective', [['aithe', 'igh']], V, {stemMinLength: 3, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
    endings('verbal-adjective', [['artha', 'air'], ['anta', 'ain'], ['alta', 'ail'], ['eartha', 'ir'], ['eanta', 'in'], ['ste', 'is'],
        ['ánta', 'áin'], ['últa', 'úil'], ['ólta', 'óil']], V, {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
    // A broad ending after a slender stem broadens it: tochais → tochasta,
    // loisc → loiscthe but adhlaic → adhlactha.
    endings('verbal-adjective', [['sta', 'is'], ['ctha', 'ic']], V, {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: '[a]'});
    endings('verbal-adjective', [...BUA_VOWELS.map((v) => [`${v}ite`, `${v}igh`]), ['éite', 'éigh'], ['uite', 'uigh']], V,
        {stemMinLength: 1, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
}

transform('verbal-noun', 'verbal noun', 'Verbal noun (ag + verbal noun is the progressive): fágáil, feiceáil, déanamh, caitheamh, fanacht, éisteacht, féachaint, leanúint, ceartú, míniú, ceannach, oscailt, imirt, labhairt, tarraingt; irregular rá, teacht, dul, fáil, tabhairt, bheith.');
{
    const V = ['v'];
    endings('verbal-noun', [['áil', ''], ['eáil', ''], ['amh', ''], ['eamh', ''], ['acht', ''], ['eacht', ''], ['aint', ''], ['int', ''], ['úint', ''], ['iúint', '']], V,
        {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
    endings('verbal-noun', [['ú', 'aigh'], ['iú', 'igh'], ['ach', 'aigh']], V, {stemMinLength: 2, stemCharacters: NO_SPACE});
    endings('verbal-noun', [['ú', 'igh']], V, {stemMinLength: 3, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
    // The -adh verbal noun of a slender stem that broadens: loisc → loscadh.
    for (const [from, to] of [...BROADENING, ['o', 'oi'], ['u', 'ui']]) {
        endings('verbal-noun', [['adh', '']], V, {stemMinLength: 4, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT,
            stemChange: {from: [from], to, occurrence: 'last', between: CONSONANT}});
    }
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
// The relative of the present in -(e)as after an initial that cannot be
// lenited, which the lenited-only Munster rules do not read: mar a leanas
// ("as follows").
whole('past-1sg-munster', 'leanas', 'lean', ['v']);
for (const [form, lemma] of IRREGULAR_VERBAL_NOUNS) { whole('verbal-noun', form, lemma, ['v']); }
// Eclipsed dependent forms of bí and déan whose unmutated form is also a
// noun (fuil "blood", dearna "palm"): written out, one step from the verb,
// so that a dictionary without its own entry for them shows the verb first
// (whole-word rules are found before the mutation rules, 7.4).
whole('present', 'bhfuil', 'bí', ['v']);
whole('past', 'ndearna', 'déan', ['v']);
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
const SLENDER = [['ai', 'a'], ['ái', 'á'], ['oi', 'o'], ['ói', 'ó'], ['ui', 'u'], ['úi', 'ú'], ['ei', 'ea'], ['ei', 'e'], ['éi', 'ia'], ['éi', 'éa'], ['i', 'ea'], ['i', 'io'], ['í', 'ío']];
const changeLast = (from, to) => ({from: [from], to, occurrence: 'last', between: CONSONANT});

transform('slender', 'genitive / plural / vocative', 'Slender form of a first-declension noun or adjective: genitive singular (an bháid, an fhir, an Sasanaigh), plural (na báid, na fir, éin), vocative (a Sheáin, a fhir) and the genitive masculine of adjectives (an fhir mhóir): báid → bád, fir → fear, éin → éan, poist → post, Sasanaigh → Sasanach, Eiritréigh → Eiritréach.');
for (const [from, to] of SLENDER) {
    suffix('slender', '', '', ['n', 'adj'], {stemCharacters: NO_SPACE, stemEndsWith: CONSONANT, stemChange: changeLast(from, to)});
}
endings('slender', [['aigh', 'ach'], ['igh', 'each'], ['éigh', 'éach']], ['n', 'adj'], {stemMinLength: 2, stemCharacters: NO_SPACE});

transform('genitive', 'genitive', 'Genitive singular of the second to fifth declensions: -e with a slender stem (sráide, bróige, coise, láimhe, gréine), -aí and -í for -ach and -each (gealaí, báistí), the broad endings of agent nouns (múinteora, dochtúra, búistéara, feola, bliana), -ach, -rach, -ar and -n (cathrach, traenach, athar, teangan, carad, Éireann), and the irregular nouns (tí, lae, mná, Dé, mara, fola).');
{
    const N = ['n'];
    suffix('genitive', 'e', '', N, {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
    for (const [from, to] of [['ai', 'a'], ['ái', 'á'], ['oi', 'o'], ['ói', 'ó'], ['ui', 'u'], ['úi', 'ú'], ['éi', 'ia'], ['ei', 'ea']]) {
        suffix('genitive', 'e', '', N, {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT, stemChange: changeLast(from, to)});
    }
    endings('genitive', [['aí', 'ach'], ['í', 'each'], ['éara', 'éir']], N, {stemMinLength: 2, stemCharacters: NO_SPACE});
    endings('genitive', [['ra', 'ir'], ['la', 'il'], ['na', 'in']], N, {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: BROAD_VOWEL});
    // -nach, -lach and -rach after a broad vowel (traein → traenach, beoir →
    // beorach) are written out: as rules they read -(e)ach adjectives as the
    // genitive of a noun (réigiúnach → réigiúin, séasúrach → séasúir).
    for (const [form, lemma] of [['traenach', 'traein'], ['beorach', 'beoir'], ['corónach', 'coróin']]) { whole('genitive', form, lemma, N); }
    endings('genitive', [['rach', 'air'], ['reach', 'ir'], ['ar', 'air'], ['ár', 'áir'], ['an', 'ain'], ['ann', 'ainn'], ['an', 'a'], ['ag', 'aig']], N,
        {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
    // The genitive of a verbal noun is its verbal adjective: an athraithe,
    // an mholta, an chinnte, na briste.
    endings('genitive', [['aithe', 'ú'], ['ithe', 'iú'], ['ta', 'adh'], ['tha', 'adh'], ['te', 'eadh'], ['the', 'eadh']], N,
        {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
    endings('genitive', [['fa', 'bh'], ['fa', 'mh']], N, {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: VOWEL});
    // Verbal nouns in -áil, -úil, -óil and -aim: cothabháil → cothabhála,
    // foghlaim → foghlama.
    endings('genitive', [['ála', 'áil'], ['úla', 'úil'], ['óla', 'óil'], ['ama', 'aim']], N, {stemMinLength: 2, stemCharacters: NO_SPACE});
    endings('genitive', [['anta', 'aint']], N, {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
    endings('genitive', [['ann', ''], ['ún', 'ú'], ['ad', 'a'], ['ead', 'e']], N, {stemMinLength: 3, stemCharacters: NO_SPACE});
    for (const [form, lemma] of [['tí', 'teach'], ['lae', 'lá'], ['Dé', 'Dia'], ['dí', 'deoch'], ['mara', 'muir'], ['fola', 'fuil'], ['meala', 'mil'],
        ['olla', 'olann'], ['scine', 'scian'], ['sléibhe', 'sliabh'], ['leapa', 'leaba'], ['talún', 'talamh'], ['míosa', 'mí'], ['oibre', 'obair'],
        ['coda', 'cuid'], ['Éirinn', 'Éire'], ['iníne', 'iníon'], ['mic', 'mac'], ['buachalla', 'buachaill'], ['bó', 'bó'], ['cnoic', 'cnoc']]) {
        if (form !== lemma) { whole('genitive', form, lemma, N); }
    }
}

transform('noun-a', 'plural / genitive', 'The ending -a: plural of many nouns (bróga, cosa, lámha, fuinneoga, úlla, tosca) and the genitive singular of the third declension (ama, srutha, locha, Gaeltachta, sleachta).');
suffix('noun-a', 'a', '', ['n'], {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
// A slender final consonant broadens before -a: toisc → tosca, sliocht → sleachta.
for (const [from, to] of [['o', 'oi'], ['u', 'ui'], ['a', 'ai'], ['á', 'ái'], ['ó', 'ói'], ['ú', 'úi'], ['ea', 'io'], ['ea', 'ei']]) {
    suffix('noun-a', 'a', '', ['n'], {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT, stemChange: changeLast(from, to)});
}

transform('plural', 'plural', 'Strong plurals: -(e)anna (scoileanna, amanna), -í (cailíní, múinteoirí, páistí), -aí (daltaí, rudaí), -(e)acha (teangacha, cathracha, litreacha), -te and -the (bailte, coillte, ríthe), -ta (scéalta), -anta (oícheanta, uaireanta), -nna (míonna), -ite (sluaite), -uithe (athruithe), -taí and -tí of verbal nouns (moltaí, cinntí), and the irregular plurals (mná, daoine, tithe, laethanta, cairde, ba).');
{
    const N = ['n'];
    // -eacha, -neacha and a bare -acha are left out: they read the plural
    // of -(e)ach adjectives as nouns (réigiúnacha → réigiún, straitéiseacha
    // → straitéis, leictreonacha → leictreon), which adj-plural reads right.
    endings('plural', [['anna', ''], ['eanna', ''], ['í', ''], ['í', 'e'], ['aí', 'a'], ['acha', 'a'],
        ['ithe', 'í'], ['aithe', 'aí'], ['te', ''], ['te', 'e'], ['rí', 'ir'],
        ['taí', 'adh'], ['thaí', 'adh'], ['tí', 'eadh'], ['uithe', 'ú'], ['úlacha', 'úil'], ['álacha', 'áil'], ['ánacha', 'áin'], ['ónacha', 'óin']], N,
    {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
    endings('plural', [['the', ''], ['nna', ''], ['ite', ''], ['thaí', ''], ['anta', '']], N, {stemMinLength: 1, stemCharacters: NO_SPACE, stemEndsWith: VOWEL});
    endings('plural', [['onna', '']], N, {stemMinLength: 1, stemCharacters: NO_SPACE, stemEndsWith: '[í]'});
    // -eacha after l, m, n or r (foirm → foirmeacha, ceolchoirm →
    // ceolchoirmeacha, muintir → muintireacha) and -neacha after m (ainm →
    // ainmneacha); after other consonants -eacha is mostly the plural of an
    // -each adjective (straitéiseacha).
    endings('plural', [['eacha', '']], N, {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: '[lmnr]'});
    endings('plural', [['neacha', '']], N, {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: '[m]'});
    // -ta after d, l, n or s (scéal → scéalta, ceol → ceolta, rón → rónta):
    // all 103 such plurals of wty-ga-en; after other consonants -ta is a
    // verbal adjective or a genitive.
    endings('plural', [['ta', '']], N, {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: '[dlns]'});
    // Syncopated -air and -ir nouns: cathair → cathracha, máthair →
    // máthracha, litir → litreacha. wty-ga-en's 39 such plurals have c, h, s
    // or t before -racha and d, f, g, h or t before -reacha; after other
    // letters they would read other words as -air and -ir nouns.
    // The stem seacht- is left out: seachtracha is the plural of the adjective
    // seachtrach (external), which wty-ga-en lacks, and the rule then led to
    // seachtair, a form of seachtar (seven people): 9,181 tokens of the
    // Irish Wikipedia's 10,000 most frequent words (Naisc sheachtracha).
    endings('plural', [['racha', 'air']], N, {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: '[chst]', stemNotStartsWithText: 'seacht'});
    endings('plural', [['reacha', 'ir']], N, {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: '[dfght]'});
    // Compounds of duine: seandaoine → seanduine, andaoine → anduine.
    suffix('plural', 'daoine', 'duine', N, {stemMinLength: 2, stemCharacters: NO_SPACE});
    // -eanta after r (uair → uaireanta); -anta after a vowel is above
    // (oíche → oícheanta). After other consonants -anta is the genitive of an
    // -aint verbal noun (cosaint → cosanta), not a plural (cosanta is not cos).
    endings('plural', [['eanta', '']], N, {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: '[r]'});
    for (const [form, lemma] of [['mná', 'bean'], ['ban', 'bean'], ['daoine', 'duine'], ['tithe', 'teach'], ['laethanta', 'lá'], ['ba', 'bó'],
        ['cairde', 'cara'], ['blianta', 'bliain'], ['bliana', 'bliain'], ['aibhneacha', 'abhainn'], ['leapacha', 'leaba'], ['uibheacha', 'ubh'],
        ['caoirigh', 'caora'], ['fiacla', 'fiacail'], ['doirse', 'doras'], ['soilse', 'solas'], ['bóithre', 'bóthar'], ['tailte', 'talamh'],
        ['aithreacha', 'athair'], ['máithreacha', 'máthair'], ['oibreacha', 'obair'], ['sceana', 'scian'], ['sléibhte', 'sliabh'],
        ['déithe', 'dia'], ['nithe', 'ní'], ['slite', 'slí'], ['deirfiúracha', 'deirfiúr'], ['uaire', 'uair'], ['cinn', 'ceann'],
        ['guaillí', 'gualainn'], ['troithe', 'troigh'], ['foirne', 'foireann'], ['ranna', 'roinn'], ['ranna', 'rann'], ['tíortha', 'tír']]) {
        whole('plural', form, lemma, N);
    }
}

// The plural in -aí of a noun without a final vowel (rud → rudaí) is its own
// transform, ordered after the adjective forms: the same ending is the
// comparative of -ach adjectives (níos tábhachtaí → tábhachtach, not
// tábhacht). The other plurals come before the adjective forms (daltaí →
// dalta, not daltach; acmhainní → acmhainn, not acmhainneach).
transform('plural-ai', 'plural', 'Plural in -aí of a noun ending in a consonant: rudaí → rud.');
endings('plural-ai', [['aí', '']], ['n'], {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});

transform('adj-plural', 'plural', 'Plural of an adjective: móra, beaga, deasa, tábhachtacha, díreacha; with syncope ramhra, folmha, socra, láidre.');
endings('adj-plural', [['a', '']], ['adj'], {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
endings('adj-plural', [['acha', 'ach'], ['eacha', 'each']], ['adj'], {stemMinLength: 2, stemCharacters: NO_SPACE});
endings('adj-plural', [['ra', 'ar'], ['mha', 'amh'], ['ra', 'air'], ['re', 'ir']], ['adj'], {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});

transform('adj-e', 'comparative / plural / genitive feminine', 'An adjective in -e or -úla: the comparative and superlative (níos óige, is glaine), the genitive singular feminine (na mná óige) and, for slender stems, the plural (glice, maithe): óige → óg, glaine → glan, gile → geal, mine → mion, deise → deas, tábhachtaí → tábhachtach, dírí → díreach, suimiúla → suimiúil, láidre → láidir, deacra → deacair, milse → milis.');
{
    const A = ['adj'];
    suffix('adj-e', 'e', '', A, {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
    for (const [from, to] of [['ai', 'a'], ['ái', 'á'], ['oi', 'o'], ['ói', 'ó'], ['ui', 'u'], ['úi', 'ú'], ['ei', 'ea'], ['éi', 'éa'], ['i', 'ea'], ['i', 'io'], ['í', 'ío']]) {
        suffix('adj-e', 'e', '', A, {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT, stemChange: changeLast(from, to)});
    }
    endings('adj-e', [['úla', 'úil'], ['aí', 'ach'], ['í', 'each']], A, {stemMinLength: 2, stemCharacters: NO_SPACE});
    endings('adj-e', [['re', 'ir'], ['ra', 'air'], ['se', 'is']], A, {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
    // Syncope: the vowel of the last syllable drops before -e (daingean →
    // daingne, íseal → ísle), and a broad stem becomes slender (folamh →
    // foilmhe, uasal → uaisle).
    endings('adj-e', [['ne', 'ean'], ['le', 'eal'], ['re', 'ear']], A, {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT});
    for (const [from, to] of [['oi', 'o'], ['ai', 'a'], ['ui', 'u']]) {
        endings('adj-e', [['mhe', 'amh'], ['le', 'al'], ['ne', 'an'], ['re', 'ar'], ['se', 'as']], A,
            {stemMinLength: 2, stemCharacters: NO_SPACE, stemEndsWith: CONSONANT, stemChange: changeLast(from, to)});
    }
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
        if (form === '') { return; }
        // Emphatic forms: -ne for the first person plural (againne, linne),
        // -san/-sean for the third person masculine and plural, -sa/-se for
        // the others, broad after a broad vowel or consonant (agamsa, acusan)
        // and slender after a slender one (duitse, aigesean).
        const slender = /[eéií][^aeiouáéíóú]*$/.test(form);
        const ending = person === 4 && form.endsWith('nn') ? 'e'
            : person === 2 || person === 6 ? (slender ? 'sean' : 'san') : (slender ? 'se' : 'sa');
        whole('emphatic', form + ending, form, []);
    });
}

transform('copula', 'copula', 'Forms of the copula is: ba (past and conditional), níorbh, arbh, gurbh, nárbh, cérbh (before a vowel or f), ab and gurb (dependent present before a vowel).');
for (const form of ['ba', 'níorbh', 'arbh', 'gurbh', 'nárbh', 'cérbh', 'ab', 'gurb']) { whole('copula', form, 'is', []); }

// --- Output ------------------------------------------------------------------------------
// Rules that match the same ending apply in file order, and with equal traces
// the first one found names a result (traceSelection "shortest"). Noun and
// adjective forms are far more frequent in text than the verb forms they
// share endings with (faisnéise, the genitive of faisnéis, is also its
// present subjunctive), so the nominal transforms come before the verb
// endings; the mutations and the irregular forms keep their place first.
const NOMINAL = ['plural', 'adj-e', 'adj-plural', 'comparative', 'plural-ai', 'noun-a', 'slender', 'genitive'];
const group = (t) => (['past', 'lenition', 'eclipsis', 'h-prefix', 't-prefix', 'elision', 'emphatic'].includes(t.id) ? 0 : NOMINAL.includes(t.id) ? 1 : 2);
// Within the nominal transforms: a plural before the adjective forms and a
// genitive (daltaí is the plural of dalta, not daltach; seirbhísí of
// seirbhís, not the genitive of seirbhíseach), except the -aí plural of a
// noun without a final vowel, which comes after the adjective forms.
const rank = (t) => (NOMINAL.includes(t.id) ? NOMINAL.indexOf(t.id) : 0);
const ordered = transforms.map((t, i) => [t, i]).sort(([a, i], [b, j]) => group(a) - group(b) || rank(a) - rank(b) || i - j).map(([t]) => t);
const out = {schema: 1, conditions, transforms: ordered.filter((t) => t.rules.length > 0)};
writeFileSync(OUT, formatTransforms(out));
const rules = out.transforms.reduce((n, t) => n + t.rules.length, 0);
const expanded = out.transforms.reduce((n, t) => n + t.rules.reduce((m, r) => m + (r.suffixes ? r.suffixes.length : 1), 0), 0);
console.log(`ga: ${out.transforms.length} transforms, ${rules} rules (${expanded} with cross products expanded) in ${OUT}`);
