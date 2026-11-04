#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes sources/own.json: Arabic deinflection rules written for this pack
// from Arabic grammar (docs/languages.md, section 14 step 2), before Yomitan's
// Arabic rules were read. Run from anywhere:
//
//   node languages/ar/sources/own-rules.mjs
//
// The rules read unvowelled text (the preprocessors remove vowel marks
// first): only the letters U+0621-U+064A, the `base` class. wiktionary-to-
// yomitan tags verbs and nouns (v, n) and leaves adjectives, names and
// particles untagged, which match only a deinflection without conditions, so
// the clitics and the noun endings give none or n; the conjugations give v,
// which nothing takes in. vf is a verb form that keeps its person affixes.

import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

// `v` has Yomitan's definition (subconditions pv, iv, cv), which the merge
// tool requires of a condition both rule files define (section 14 step 5).
const conditions = {
    v: {name: 'Verb', isDictionaryForm: true, subConditions: ['pv', 'iv', 'cv']},
    pv: {name: 'Perfect Verb (no affixes)', isDictionaryForm: true},
    iv: {name: 'Imperfect Verb (no affixes)', isDictionaryForm: true},
    cv: {name: 'Command Verb (no affixes)', isDictionaryForm: true},
    n: {name: 'Noun', isDictionaryForm: true},
    vf: {name: 'Verb form with its person affixes', isDictionaryForm: false},
    nd: {name: 'Noun after the article or a noun ending', isDictionaryForm: false},
};

// Letters that can be a root consonant, for the rules that name one.
const RADICALS = [...'ءأإآؤئبتثجحخدذرزسشصضطظعغفقكلمنهوي'];
// Every letter a word can end in. A rule that spells its last letter out
// (c -> c) is indexed at that letter, so at that node it runs in file order
const FINALS = [...RADICALS, 'ا', 'ى', 'ة'];
const STEM = '{base}';
// The letters other than ا, و, ي and ى: a stem of them is a sound verb's.
const STRONG = '[\\u0621-\\u0626\\u0628-\\u063A\\u0641-\\u0647]';
// The letters other than ا and ى (a defective verb's stem may have و or ي:
// احو, اطو).
const NO_ALIF = '[\\u0621-\\u0626\\u0628-\\u063A\\u0641-\\u0648\\u064A]';

const V_IN = ['vf'];
const V_OUT = ['v'];
// Noun endings also follow الـ, which gives nd beside n; construct endings,
// the pronouns and the accusative ـًا never do. A broken plural gives n
const N_IN = ['nd'];
// A stem that starts with a proclitic letter (و ف ب ك ل) needs three letters
// for an ending with nothing in its place: وبين is و + بين, not a dual of وب,
const SHORT = (inflected, deinflected, options = {}) => [
    suffix(inflected, deinflected, {...options, min: 3, extra: {...(options.extra ?? {}), stemStartsWith: '[وفبكل]'}}),
    suffix(inflected, deinflected, {...options, min: 2, extra: {...(options.extra ?? {}), stemNotStartsWith: '[وفبكل]'}}),
];
const NOT_AL = {stemNotStartsWithText: 'ال'};

function suffix(inflected, deinflected, {min = 2, out = [], into = [], extra = {}} = {}) {
    return {type: 'suffix', inflected, deinflected, conditionsIn: into, conditionsOut: out, stemMinLength: min, stemCharacters: STEM, ...extra};
}
function prefix(inflected, deinflected, {min = 2, out = [], into = [], extra = {}} = {}) {
    return {type: 'prefix', inflected, deinflected, conditionsIn: into, conditionsOut: out, stemMinLength: min, stemStartsWith: STEM, ...extra};
}
function whole(inflected, deinflected, {out = [], into = []} = {}) {
    return {type: 'wholeWord', inflected, deinflected, conditionsIn: into, conditionsOut: out};
}
function cross(prefixes, suffixes, {min = 2, out = V_OUT, into = V_IN, extra = {}} = {}) {
    const rule = {type: 'circumfix', prefixes, suffixes, conditionsIn: into, conditionsOut: out, stemCharacters: STEM, ...extra};
    if (min > 0) { rule.stemMinLength = min; }
    return rule;
}
// Several suffix rules with the same constraints, as one cross product with
// an empty prefix (one JSON rule instead of one per consonant).
function suffixes(pairs, {min = 2, out = [], into = [], extra = {}} = {}) {
    return cross([['', '']], pairs, {min, out, into, extra});
}

// The hollow-verb change: the و or ي right before the last consonant becomes
// ا (يقول -> قال, يستطيع -> استطاع), written out per consonant so that only
const SEAT_TO_ALIF = {from: ['ئ', 'ؤ'], to: 'أ', occurrence: 'last', between: STEM, betweenMinLength: 0};
const SEAT_TO_YA = {from: ['أ'], to: 'ئ', occurrence: 'last', between: STEM, betweenMinLength: 0};
const hollow = (ending, deinflected = '') => RADICALS.flatMap((c) => [['و' + c + ending, 'ا' + c + deinflected], ['ي' + c + ending, 'ا' + c + deinflected]]);

const transforms = [];
function transform(id, name, description, rules, more = {}) {
    transforms.push({id, name, description, source: 'own', ...more, rules});
}

// ---------------------------------------------------------------- proclitics
// One-letter words written together with the next word. Each is its own
// transform, so a chain shows each one (وبالكتاب: و, بـ, الـ). Their outputs
transform('wa', 'و (and)', 'The conjunction وَ (wa, "and") written together with the next word: وكتب is و + كتب, والكتاب is و + الكتاب.', [
    prefix('و', ''),
]);
transform('fa', 'ف (so, then)', 'The conjunction فَ (fa, "so, then") written together with the next word: فقال is ف + قال.', [
    prefix('ف', ''),
]);
transform('bi', 'بـ (with, in, by)', 'The preposition بِ (bi, "with, in, by") written together with the next word: بالقلم is بـ + القلم, بيده is بـ + يده.', [
    prefix('ب', ''),
    // بحكم (by virtue of), before بح + ـكم.
    whole('بحكم', 'حكم'),
]);
transform('ka', 'كـ (like, as)', 'The preposition كَ (ka, "like, as") written together with the next word: كالبحر is كـ + البحر.', [
    prefix('ك', ''),
]);
transform('li', 'لـ (for, to)', 'The preposition or particle لِ (li, "for, to, so that") written together with the next word: لمحمد is لـ + محمد, ليكتب is لـ + يكتب. Before الـ the alif of the article is not written: للبيت is لـ + البيت, and before a word that starts with ل only two lams are written: لله is لـ + الله, لليل is لـ + الليل.', [
    prefix('ل', '', {extra: {stemNotStartsWith: '[ل]'}}),
    prefix('لل', 'ال', {extra: {stemNotStartsWith: '[ل]'}}),
    // A noun that starts with ل loses the ل of الـ too: لليل is لـ + الليل.
    prefix('لل', 'الل', {min: 1, extra: {stemNotStartsWith: '[ل]'}}),
]);
transform('la', 'لا (not, no)', 'The negation لا written together with the next word, as informal text does: لاشيء is لا شيء ("nothing"), لايمكن is لا يمكن.', [
    prefix('لا', '', {min: 3}),
]);
transform('al', 'الـ (the)', 'The definite article الـ (al-, "the"): الكتاب is الـ + كتاب.', [
    // A noun (no pronoun or ـًا follows الـ), indexed at the last letter so it
    // runs before the imperatives that read ال as stem letters (الحق, not
    {...cross([['ال', '']], FINALS.map((c) => [c, c]), {min: 1, out: ['n', 'nd'], into: []}), stemCharacters: undefined},
    // الحين (now), before the imperative of لحى.
    whole('الحين', 'حين', {out: ['n', 'nd'], into: []}),
]);
transform('demonstrative', 'demonstrative', 'تلك is the feminine of ذلك ("that"), and لذا is لهذا ("therefore").', [
    whole('تلك', 'ذلك'),
    whole('لذا', 'لهذا'),
]);
transform('hamzaOmitted', 'written without hamza', 'Frequent words written without their hamza, as informal text does (اين for أين, اجل for أجل). The processors add the hamza to any word, but a rule that reads the word as written ranks before that (docs/languages.md 9.6), so these are listed.', [
    ...[['اين', 'أين'], ['اول', 'أول'], ['اجل', 'أجل'], ['اخر', 'آخر'], ['ابدا', 'أبدا'], ['الان', 'الآن'], ['انك', 'أن'], ['اننا', 'أن'],
        ['اني', 'أن'], ['انتي', 'أنت'], ['انتما', 'أنتما'], ['الم', 'ألم'], ['امل', 'أمل'], ['اكيد', 'أكيد'], ['احيانا', 'أحيانا'],
        ['اخيرا', 'أخيرا'], ['احد', 'أحد'], ['احدا', 'أحد'], ['احدى', 'أحد'], ['اعلى', 'أعلى'], ['اوه', 'أوه'], ['امي', 'أم'],
        ['اريد', 'أراد'], ['اردت', 'أراد'], ['اراد', 'أراد'], ['اكون', 'كان'], ['اقول', 'قال'], ['اقوم', 'قام'], ['اعود', 'عاد'],
        ['اموت', 'مات'], ['احبك', 'أحب'], ['اصبحت', 'أصبح'], ['اصبح', 'أصبح'], ['اعطيني', 'أعطى'], ['اعطيك', 'أعطى'], ['اخبرت', 'أخبر'], ['احضرت', 'أحضر'], ['ايتها', 'أيها'], ['اود', 'ود']].map(([i, d]) => whole(i, d)),
]);
transform('listedPlural', 'listed plural', 'أيدي (hands) is the plural of يد, before the verbs أيد and يدى that the dictionary also names. With a pronoun: أيديهم.', [
    whole('أيدي', 'يد', {out: ['n', 'nd'], into: []}),
]);
transform('listedNoun', 'listed noun', 'Frequent nouns and numbers whose ordinary reading the rules would put after a rarer one: بيتي (my house), not the imperative of بات; سيدي (sir), not سـ + يدى; the tens in ـين (اثنين, عشرين), not verbs.', [
    ...[['بيتي', 'بيت'], ['سيدى', 'سيد'], ['سيدتى', 'سيدة'], ['اثنين', 'اثنان'], ['عشرين', 'عشرون'], ['ثلاثين', 'ثلاثون'],
        ['أربعين', 'أربعون'], ['خمسين', 'خمسون'], ['ستين', 'ستون'], ['سبعين', 'سبعون'], ['ثمانين', 'ثمانون'], ['تسعين', 'تسعون'],
        ['الصور', 'صورة']].map(([i, d]) => whole(i, d)),
]);
transform('definiteAdjective', 'الـ + adjective', 'A definite adjective whose spelling is also a rarer noun, read as the adjective: الكبيرة (the big, not "the great sin"), الأولى (the first), الكلاب (the dogs). wiktionary-to-yomitan leaves adjectives untagged, so the rule gives no part of speech.', [
    ...[['الكبيرة', 'كبير'], ['الصغيرة', 'صغير'], ['الأولى', 'أول'], ['السابقة', 'سابق'], ['التالية', 'تال'], ['السوداء', 'أسود'], ['الكلاب', 'كلب']].map(([i, d]) => whole(i, d)),
]);
transform('sa', 'سـ (will)', 'The future prefix سَ (sa-, "will") before a present-tense verb: سيكتب is سـ + يكتب, سأذهب is سـ + أذهب.', [
    prefix('س', '', {min: 3, out: ['v', 'vf'], extra: {stemStartsWith: '[يتنأآ]'}}),
]);

// ------------------------------------------------------------ pronoun suffixes
// The attached pronouns, with the spellings a word takes before them: ة as ت
// (مدرسته), ى as ا (معناه), the hamza's seat (سماؤه), ـوا without alif
const PRONOUNS = [
    ['p1s', 'ـي (my, me)', 'ي', 'my (and me after a preposition)', 'كتابي is كتاب + ـي, مني is من + ـي'],
    ['p1sObj', 'ـني (me)', 'ني', 'me, after a verb or إنّ and its sisters', 'علمني is علم + ـني, إنني is إن + ـني'],
    ['p1p', 'ـنا (our, us)', 'نا', 'our, us', 'بيتنا is بيت + ـنا'],
    ['p2s', 'ـك (your, you)', 'ك', 'your, you (one person)', 'كتابك is كتاب + ـك'],
    ['p2d', 'ـكما (your, you two)', 'كما', 'your, you (two)', 'بيتكما is بيت + ـكما'],
    ['p2mp', 'ـكم (your, you)', 'كم', 'your, you (plural)', 'بيتكم is بيت + ـكم'],
    ['p2fp', 'ـكن (your, you f.)', 'كن', 'your, you (feminine plural)', 'بيتكن is بيت + ـكن'],
    ['p3ms', 'ـه (his, him, it)', 'ه', 'his, him, its, it', 'كتابه is كتاب + ـه, كتبه is كتب + ـه'],
    ['p3fs', 'ـها (her, it)', 'ها', 'her, its, it', 'بيتها is بيت + ـها'],
    ['p3d', 'ـهما (their, them two)', 'هما', 'their, them (two)', 'بيتهما is بيت + ـهما'],
    ['p3mp', 'ـهم (their, them)', 'هم', 'their, them', 'بيتهم is بيت + ـهم'],
    ['p3fp', 'ـهن (their, them f.)', 'هن', 'their, them (feminine plural)', 'بيتهن is بيت + ـهن'],
];
for (const [id, name, p, gloss, example] of PRONOUNS) {
    // A pronoun also follows the future prefix: سيكتبونه is سـ + يكتبون + ـه.
    const rules = [
        // ـي not after ي: the dual and plural's oblique ـي takes it as one ي
        // (ولديّ, not ولديي; Yomitan's test marks ولديي invalid), which leaves
        suffix(p, '', {into: V_IN, extra: p === 'ي' ? {...NOT_AL, stemNotEndsWith: '[يأ]'} : NOT_AL}),
        suffix('ؤ' + p, 'ء', {extra: NOT_AL}), suffix('ئ' + p, 'ء', {extra: NOT_AL}),
        suffix('ؤ' + p, 'أ', {extra: NOT_AL}), suffix('ئ' + p, 'أ', {extra: NOT_AL}),
        suffix('ا' + p, 'ى', {into: V_IN, extra: NOT_AL}),
    ];
    if (p !== 'ني') {
        // صوت (voice) before the rarer صوة that the feminine rule below reads
        // (صوتك, صوته). Among the 20,000 most frequent words the other ت/ة
        rules.push(whole('صوت' + p, 'صوت'));
        // A noun: the feminine rule does not read مدرسته as مدرس, nor رأيته
        // ("I saw him") as رأي.
        rules.push(suffix('ت' + p, 'ة', {out: ['n'], extra: NOT_AL}));
    }
    if (p !== 'ي') {
        // Verbs: only an object pronoun.
        rules.push(suffix('و' + p, 'وا', {min: 3, into: V_IN, out: ['v', 'vf']}));
        // ـتمو is "you (pl.)", which takes no object "you" (علمتموك is not a word).
        if (!['ك', 'كما', 'كم', 'كن'].includes(p)) { rules.push(suffix('تمو' + p, 'تم', {into: V_IN, out: ['v', 'vf']})); }
        rules.push(suffix('آ' + p, 'أى', {min: 1, into: V_IN, out: V_OUT}));
        if (p !== 'ني') {
            rules.push(suffix('تي' + p, 'ت', {out: ['v', 'vf']}));
        }
    }
    if (p === 'نا') {
        // مع, من and عن with ـنا, before the hollow past (معنا is not ماع).
        rules.push(whole('معنا', 'مع'), whole('منا', 'من'), whole('عنا', 'عن'));
    }
    if (p !== 'ني') {
        rules.push(whole('ب' + p, 'ب'), whole('ل' + p, 'ل'));
        for (const [stem, lemma] of [['علي', 'على'], ['إلي', 'إلى'], ['الي', 'إلى'], ['لدي', 'لدى']]) {
            rules.push(whole(stem + (p === 'ي' ? '' : p), lemma));
        }
    }
    transform(id, name, `The attached pronoun ـ${p} (${gloss}): ${example}.`, rules);
}

// --------------------------------------------------------- nouns and adjectives
// The endings give a noun (adjectives are untagged and found through their
// form-of rows: كبيرة, الكبيرات), never a verb (سيكون is not of سيك). The five
{
    const nouns = [['أب', 'أب'], ['أخ', 'أخ'], ['حم', 'حم']];
    const clitics = ['', 'و', 'ف', 'ب', 'ل', 'ك', 'وب', 'ول', 'فب', 'فل'];
    const pronouns = ['', 'ه', 'ها', 'هما', 'هم', 'هن', 'ك', 'كما', 'كم', 'كن', 'نا'];
    transform('fiveNouns', 'أبو, أخو (five nouns)', 'The nouns أب (father), أخ (brother) and حم (father-in-law) write their case as a long vowel before a pronoun or the word they belong to: أبوه, أباه, أبيه (his father); أخوك, أخاك, أخيك (your brother); أبو بكر. With و, ف, بـ, لـ and كـ before them: وأبوه, لأخيه. Their dual keeps the و: أبوان (parents), أخوين.', [
        cross(clitics.flatMap((c) => nouns.map(([i, d]) => [c + i, d])), ['و', 'ا', 'ي'].flatMap((v) => pronouns.map((pr) => [v + pr, ''])), {min: 0, into: N_IN, out: ['n'], extra: {stemCharacters: '[]'}}),
        // The dual: أبوان (parents), أخوين; after الـ too (الأخوان).
        cross(nouns, ['وان', 'وين', 'وا', 'وي'].map((e) => [e, '']), {min: 0, into: N_IN, out: ['n'], extra: {stemCharacters: '[]'}}),
    ]);
}
transform('feminine', 'feminine (ـة)', 'The feminine ending ـة of an adjective or a noun for a person: كبيرة is كبير + ـة, عربية is عربي + ـة, الكبيرة is الكبير + ـة.', [
    // On the word as written, after الـ and after the dual and plural endings
    // (كبيرتان, الكبيرة); a noun before a pronoun (مدرسته) keeps its ة.
    suffix('ة', '', {into: N_IN, out: ['n', 'nd']}),
    suffix('ئة', 'ء', {into: N_IN, out: ['n', 'nd']}),
    {type: 'circumfix', inflectedPrefix: 'ال', deinflectedPrefix: 'ال', inflectedSuffix: 'ة', deinflectedSuffix: '', conditionsIn: [], conditionsOut: ['n', 'nd'], stemMinLength: 2, stemCharacters: STEM},
]);
transform('defectiveNoun', 'noun in ـٍ (ي)', 'A noun or adjective of the pattern فاعٍ (قاضٍ, ماشٍ, صافٍ, ثانٍ) writes its ي back after الـ and before an ending: القاضي, الماشي, صافيان, صافية, ماشيين.', [
    // Only after الـ or an ending (a word written with a final ي is read as
    // the pronoun ي), and only in the pattern فاعٍ, spelled out letter by
    cross(RADICALS.map((c) => [c + 'ا', c + 'ا']), RADICALS.map((c) => [c + 'ي', c]), {min: 0, into: N_IN, out: ['n'], extra: {stemCharacters: '[]'}}),
]);
transform('accusative', 'accusative (ـًا)', 'The indefinite accusative ending ـًا, written with an alif: كتابًا (كتابا), شكرًا, شيئًا (شيئا, from شيء). Words that end in ة, ى or ا take no alif.', [
    ...SHORT('ا', '', {out: ['n', 'nd'], extra: {...NOT_AL, stemNotEndsWith: '[اةى]'}}),
    suffix('ئا', 'ء', {out: ['n', 'nd'], extra: NOT_AL}),
    // Spelled out where a verb ending ends the same way, so that the noun is
    // read first: شيئا is شيء (not the passive of شاء), وقتا is وقت (not وقى).
    suffix('يئا', 'يء', {min: 1, out: ['n', 'nd'], extra: NOT_AL}),
    suffix('تا', 'ت', {out: ['n', 'nd'], extra: NOT_AL}),
    // A noun with و or ي before its last letter (صوتا, قولا, دورا, جوعا),
    // found at the same ending as the hollow dual imperative and past (صات,
    suffixes(['و', 'ي'].flatMap((w) => RADICALS.filter((c) => w + c !== 'ين').map((c) => [w + c + 'ا', w + c])), {min: 1, out: ['n', 'nd'], extra: NOT_AL}),
    ...[['دينا', 'دين'], ['حينا', 'حين']].map(([i, d]) => whole(i, d, {out: ['n', 'nd']})),
]);
transform('dual', 'dual (ـان)', 'The dual ending ـان (nominative), and ـتا of a word in ة before the word it belongs to: كتابان is two of كتاب, مدرستان and مدرستا of مدرسة, مستشفيان of مستشفى, عصوان of عصا, صحراوان of صحراء.', [
    ...SHORT('ان', '', {out: ['n', 'nd'], into: N_IN}),
    suffix('تان', 'ة', {out: ['n', 'nd'], into: N_IN}),
    suffix('يان', 'ى', {out: ['n', 'nd'], into: N_IN}),
    suffix('وان', 'ا', {out: ['n', 'nd'], into: N_IN}),
    suffix('اوان', 'اء', {out: ['n', 'nd'], into: N_IN}),
    suffix('آن', 'أ', {out: ['n', 'nd'], into: N_IN}),
    suffix('ئان', 'ء', {out: ['n', 'nd'], into: N_IN}),
    suffix('آن', 'ء', {out: ['n', 'nd'], into: N_IN}),
    suffix('تا', 'ة', {out: ['n', 'nd'], extra: NOT_AL}),
]);
transform('oblique', 'dual or plural (ـين)', 'The ending ـين, the dual (ـَيْن) or the masculine plural (ـِين) after a preposition or as an object: كتابين is two of كتاب, معلمين is معلم in the plural, مدرستين is two of مدرسة, عربيين is عربي in the dual or plural.', [
    ...SHORT('ين', '', {out: ['n', 'nd'], into: N_IN}),
    suffix('تين', 'ة', {out: ['n', 'nd'], into: N_IN}),
    suffix('يين', 'ى', {out: ['n', 'nd'], into: N_IN}),
    suffix('وين', 'ا', {out: ['n', 'nd'], into: N_IN}),
    suffix('اوين', 'اء', {out: ['n', 'nd'], into: N_IN}),
    suffix('ئين', 'ء', {out: ['n', 'nd'], into: N_IN}),
    suffix('أين', 'ء', {out: ['n', 'nd'], into: N_IN}),
    suffix('أين', 'أ', {out: ['n', 'nd'], into: N_IN}),
]);
transform('pluralMasc', 'plural (ـون)', 'The masculine sound plural ending ـون (nominative): معلمون is معلم in the plural.', [
    ...SHORT('ون', '', {out: ['n', 'nd'], into: N_IN}),
    suffix('ئون', 'ء', {out: ['n', 'nd'], into: N_IN}),
]);
transform('construct', 'construct (ـو)', 'The ending ـو of a masculine plural before the word it belongs to (معلمو المدرسة, "the school\'s teachers"), and of أبو and أخو.', [
    suffix('و', '', {out: ['n'], extra: NOT_AL}),
]);
transform('pluralFem', 'plural (ـات)', 'The feminine sound plural ending ـات: معلمات is معلمة in the plural, سيارات of سيارة, امتحانات of امتحان, مستشفيات of مستشفى, سنوات of سنة, سماوات of سماء, منشآت of منشأة.', [
    suffix('ات', 'ة', {out: ['n', 'nd'], into: N_IN}),
    ...SHORT('ات', '', {out: ['n', 'nd'], into: N_IN}),
    suffix('يات', 'ى', {out: ['n', 'nd'], into: N_IN}),
    suffix('وات', 'ة', {out: ['n', 'nd'], into: N_IN}),
    suffix('اوات', 'اء', {out: ['n', 'nd'], into: N_IN}),
    suffix('آت', 'أة', {out: ['n', 'nd'], into: N_IN}),
    suffix('ئات', 'ء', {out: ['n', 'nd'], into: N_IN}),
]);
// The comparative's feminine فُعلى (كبرى) and plural أفاعل (أكابر) are not
// rules: written as a cross product of first letters, their output (أكبر)

// Broken plurals whose pattern shows the singular, for nouns only; فُعول,
// فِعال and فَعَلة are left out (خروج, مكان, ليلة), and الـ is never stem
{
    const CONS = RADICALS;
    const DROP_ALIF = (min) => ({from: ['ا'], to: '', occurrence: 'last', between: STEM, betweenMinLength: min});
    // Optional (brokenPlurals): the dictionary's form-of rows already reach
    // these, and on the three texts the rule fixed 1 first result and broke 104.
    transform('brokenPlural', 'plural (broken)', 'A broken plural whose pattern shows its singular: أطفال (طفل), وزراء (وزير), مكاتب (مكتب), مشاكل (مشكلة), شوارع (شارع), قواعد (قاعدة), رسائل (رسالة), حقائق (حقيقة), تفاصيل (تفصيل), أسلحة (سلاح). Off unless the brokenPlurals setting is on.', [
        // أفعال -> فعل: أطفال, أخبار, أعمال, أولاد.
        // Not after a middle و or ي, whose singular has ا (أبواب: باب, not بوب).
        cross([['أ', '']], CONS.map((c) => ['ا' + c, c]), {into: N_IN, out: ['n'], extra: {...NOT_AL, stemNotEndsWith: '[وي]'}}),
        // فعلاء -> فعيل: وزراء, عملاء, غرباء, فقراء.
        cross([['', '']], CONS.map((c) => [c + 'اء', 'ي' + c]), {into: N_IN, out: ['n'], extra: NOT_AL}),
        // مفاعل -> مفعل, مفعلة: مكاتب, مشاكل, ملابس.
        cross([['م', 'م']], [['', ''], ['', 'ة']], {min: 3, into: N_IN, out: ['n'], extra: {...NOT_AL, stemChange: DROP_ALIF(2)}}),
        // فواعل -> فاعل, فاعلة: شوارع, هواتف, قواعد, نوافذ (a letter before وا:
        // وابن is و + ابن).
        cross(CONS.map((c) => [c + 'وا', c + 'ا']), [['', ''], ['', 'ة']], {into: N_IN, out: ['n'], extra: NOT_AL}),
        // فعائل -> فعيلة, فعالة, فعيل: رسائل, حقائق, نتائج, وسائل.
        suffixes(CONS.flatMap((c) => [['ائ' + c, 'ي' + c + 'ة'], ['ائ' + c, 'ا' + c + 'ة'], ['ائ' + c, 'ي' + c]]), {into: N_IN, out: ['n'], extra: NOT_AL}),
        // تفاعيل -> تفعيل: تفاصيل, تقارير, تكاليف.
        cross([['ت', 'ت']], [['', '']], {min: 4, into: N_IN, out: ['n'], extra: {...NOT_AL, stemChange: DROP_ALIF(3)}}),
        // أفعلة -> فعال: أسلحة, أجهزة, أطعمة.
        cross([['أ', '']], CONS.map((c) => [c + 'ة', 'ا' + c]), {into: N_IN, out: ['n'], extra: {...NOT_AL, stemNotEndsWith: '[وي]'}}),
    ], {optional: true});
}

// --------------------------------------------------------------------- verbs
// A verb's dictionary form is its past "he" form (كتب, قال, رمى, استخدم).
// Each transform below is one tense and person, with rules for every kind of

const CONSONANT_ENDINGS = ['ت', 'نا', 'تم', 'تما', 'تن', 'ن'];

function pastRules(ending, {defectiveA = [], defectiveY = [], defectiveI = [], hamza = [], consonant = false, min = consonant && ending !== 'ت' ? 3 : 2}) {
    // A doubled verb writes both letters before ن, نا, تم, تما and تن
    // (مددن, مددنا), so a stem of two letters there is never a verb (فلن is
    const rules = [suffix(ending, '', {min, into: V_IN, out: V_OUT})];
    for (const [i, d] of defectiveA) { rules.push(suffix(i, d, {into: V_IN, out: V_OUT})); }
    // A verb in ي (نسي: نسيت) before one in ى (رمى: رميت) at the same ending,
    // as the plain ending reads it: نسيت is نسي, not نسّى.
    for (const [i] of defectiveY) { if (i.startsWith('ي')) { rules.push(suffix(i, 'ي', {min: 2, into: V_IN, out: V_OUT})); } }
    for (const [i, d] of defectiveI) { rules.push(suffix(i, d, {into: V_IN, out: V_OUT})); }
    for (const [i, d] of defectiveY) { rules.push(suffix(i, d, {into: V_IN, out: V_OUT})); }
    for (const [i, d, m = 1] of hamza) { rules.push(suffix(i, d, {min: m, into: V_IN, out: V_OUT})); }
    if (consonant) {
        // Hollow with a final hamza: أضأت -> أضاء, استأت -> استاء.
        // Form I spells these ئ or ؤ (شئت, بؤت), so the stem has two letters:
        rules.push(suffix('أ' + ending, 'اء', {min: 2, into: V_IN, out: V_OUT}));
        // Hollow: the ا of the dictionary form returns before the last consonant.
        rules.push(suffixes(RADICALS.map((c) => [c + ending, 'ا' + c]), {min: 1, into: V_IN, out: V_OUT}));
        // Doubled: both consonants are written.
        rules.push(suffixes(RADICALS.map((c) => [c + c + ending, c]), {min: 1, into: V_IN, out: V_OUT}));
    }
    return rules;
}

transform('pastI', 'past (I, you, she)', 'The past tense ending ـت: كتبتُ "I wrote", كتبتَ and كتبتِ "you wrote", كتبتْ "she wrote" (all كتبت). Hollow verbs: قلت -> قال, but قالت "she said"; defective verbs: دعوت -> دعا, رميت -> رمى, and دعت, رمت "she called, threw".', [
    ...pastRules('ت', {
        defectiveA: [['وت', 'ا'], ['ت', 'ا']], defectiveY: [['يت', 'ى'], ['ت', 'ى']],
        hamza: [['ئت', 'اء']], consonant: true,
    }),
    // A last ت merges with the ending (متّ -> مات).
    suffix('ت', 'ات', {min: 1, into: V_IN, out: V_OUT}),
    whole('لست', 'ليس', {into: V_IN, out: V_OUT}),
]);
transform('pastTheyTwo', 'past (they two)', 'The past tense ending ـا "they (two) did": كتبا, دعوا (from دعا), رميا (from رمى), قرآ (from قرأ).', [
    ...pastRules('ا', {defectiveA: [['وا', 'ا']], defectiveY: [['يا', 'ى']], hamza: [['آ', 'أ', 2]]}),
]);
transform('pastTheyTwoF', 'past (they f. two)', 'The past tense ending ـتا "they (two women) did": كتبتا, دعتا (from دعا), رمتا (from رمى).', [
    ...pastRules('تا', {defectiveA: [['تا', 'ا']], defectiveY: [['تا', 'ى']]}),
]);
transform('pastThey', 'past (they)', 'The past tense ending ـوا "they did": كتبوا, قالوا; دعوا (from دعا), رموا (from رمى), نسوا (from نسي), قرؤوا (from قرأ), جاؤوا (from جاء).', [
    ...pastRules('وا', {
        defectiveA: [['وا', 'ا']], defectiveY: [['وا', 'ى']], defectiveI: [['وا', 'ي']],
        hamza: [['ؤوا', 'أ', 2], ['ءوا', 'أ', 2], ['ؤوا', 'ء', 2]],
    }),
]);
transform('pastTheyF', 'past (they f.)', 'The past tense ending ـن "they (women) did": كتبن; قلن (from قال), مددن (from مد), دعون (from دعا), رمين (from رمى).', [
    ...pastRules('ن', {defectiveA: [['ون', 'ا']], defectiveY: [['ين', 'ى']], hamza: [['ئن', 'اء']], consonant: true}),
    suffix('ن', 'ان', {min: 1, into: V_IN, out: V_OUT}),
    whole('لسن', 'ليس', {into: V_IN, out: V_OUT}),
]);
for (const [id, ending, who, name, lis] of [
    ['pastYouTwo', 'تما', 'you (two)', 'past (you two)', 'لستما'],
    ['pastYouPl', 'تم', 'you (plural)', 'past (you pl.)', 'لستم'],
    ['pastYouFPl', 'تن', 'you (feminine plural)', 'past (you f. pl.)', 'لستن'],
]) {
    transform(id, name,
        `The past tense ending ـ${ending} "${who} did": كتب${ending}; قل${ending} (from قال), مدد${ending} (from مد), دعو${ending} (from دعا), رمي${ending} (from رمى).`, [
            ...pastRules(ending, {defectiveA: [['و' + ending, 'ا']], defectiveY: [['ي' + ending, 'ى']], hamza: [['ئ' + ending, 'اء']], consonant: true}),
            // A last ت merges with the ending (متّم -> مات, سكتّم -> سكت).
            suffix(ending, 'ات', {min: 1, into: V_IN, out: V_OUT}),
            suffix(ending, 'ت', {into: V_IN, out: V_OUT}),
            whole(lis, 'ليس', {into: V_IN, out: V_OUT}),
        ]);
}
transform('pastWe', 'past (we)', 'The past tense ending ـنا "we did": كتبنا; قلنا (from قال), كنا (from كان), مددنا (from مد), دعونا (from دعا), رمينا (from رمى). Also "us" after a verb (ـنا).', [
    ...pastRules('نا', {defectiveA: [['ونا', 'ا']], defectiveY: [['ينا', 'ى']], hamza: [['ئنا', 'اء']], consonant: true}),
    // A last ن merges with the ending (كنّا -> كان, سكنّا -> سكن).
    suffix('نا', 'ان', {min: 1, into: V_IN, out: V_OUT}),
    suffix('نا', 'ن', {into: V_IN, out: V_OUT}),
    whole('لسنا', 'ليس', {into: V_IN, out: V_OUT}),
]);

// The present tense. Person prefixes, each with what it replaces at the start
// of the dictionary form: nothing (form I, II, III, V, VI), the أ of form IV,
function personPrefixes(p) {
    if (p === 'أ') {
        // I: أكرمُ is the dictionary form itself, so أ never gives أ; آكل is أ + أكل.
        return [['أ', ''], ['أ', 'ا'], ['أ', 'و'], ['أؤ', 'آ'], ['أؤ', 'أ'], ['أؤا', 'آ'], ['آ', 'أ'], ['آ', 'ائ']];
    }
    return [[p, ''], [p, 'أ'], [p, 'ا'], [p, 'و'], [p + 'ؤ', 'آ'], [p + 'ؤ', 'أ'], [p + 'ؤا', 'آ'], [p + 'أ', 'ائ']];
}
const PRESENT = {
    ي: personPrefixes('ي'), ت: personPrefixes('ت'), أ: personPrefixes('أ'), ن: personPrefixes('ن'),
};

// The endings of each person, and the dictionary-form ending each gives for
// the kinds of root (sound, ا, ى, ي, hamza, جاء).
const ASSIMILATED_WITH_ENDING = new Set(['تجدي', 'يضعون', 'يجدوا', 'تثقي', 'تضعي', 'تثقين', 'تضعين', 'يسعون', 'تجدين', 'تصلي', 'يصلوا',
    'يجدون', 'يصلون', 'يقفون', 'تقفين', 'يثقون', 'تصلين', 'يضعوا', 'تقفي', 'تجدوا', 'تسعين', 'تسعون', 'يقعون', 'تضعوا', 'تقعي', 'تقعين',
    'تصلوا', 'تقفوا', 'تقفون', 'يثقوا', 'تثقوا', 'تجدون']);
const ASSIMILATED_PRESENT = ['جد', 'ضع', 'صل', 'قف', 'قع', 'دع', 'جب', 'ثق', 'لد', 'رث', 'زن', 'سع', 'صف', 'هب', 'فد'];
function hollowEndings(ending) { return hollow(ending); }
function presentRules(prefixes, ending, {defective = [], hamza = [], hollow = true, short = false} = {}) {
    const rules = [cross(prefixes, [[ending, '']])];
    // The common verbs like وجد, as whole words, so that they are read before
    // the hollow jussive (يجد is وجد, not لم يجد of جاد); a rule for every
    for (const [p] of prefixes.filter(([, d]) => d === '')) {
        for (const stem of ASSIMILATED_PRESENT) {
            if (ending === '' || ASSIMILATED_WITH_ENDING.has(p + stem + ending)) { rules.push(whole(p + stem + ending, 'و' + stem, {into: V_IN, out: V_OUT})); }
        }
    }
    const plain = prefixes.filter(([, d]) => d === '' || d === 'أ' || d === 'ا');
    rules.push(cross(plain, [[ending, '']], {extra: {stemChange: SEAT_TO_ALIF}}));
    rules.push(cross(plain, [[ending, '']], {extra: {stemChange: SEAT_TO_YA}}));
    if (defective.length > 0) { rules.push(cross(prefixes, defective)); }
    if (hamza.length > 0) { rules.push(cross(prefixes, hamza, {min: 1})); }
    // Hollow verbs are form I, IV, VII, VIII or X. Before ي, form IV comes
    // first (يريد, يصيب, يعيد: أراد, أصاب, أعاد); the frequent form I verbs of
    if (hollow) {
        const hollowPrefixes = prefixes.filter(([, d]) => d === '' || d === 'أ' || d === 'ا');
        // I (أُرِيد): the أ of form IV, which the sound rules leave out because
        // there it gives the word back (أكرم), returns here (أريدك -> أراد).
        if (prefixes[0][0] === 'أ') { hollowPrefixes.push(['أ', 'أ']); }
        rules.push(cross(hollowPrefixes, hollowEndings(ending).filter(([i]) => i.startsWith('و')), {min: 1}));
        rules.push(cross([...hollowPrefixes].sort((a, b) => (a[1] === 'أ' ? 0 : 1) - (b[1] === 'أ' ? 0 : 1)), hollowEndings(ending).filter(([i]) => i.startsWith('ي')), {min: 1}));
    }
    if (short) {
        // Hollow verbs without their long vowel (يقل, يقلن) and doubled verbs
        // with both consonants (يمدد, يمددن).
        rules.push(cross(prefixes, RADICALS.map((c) => [c + ending, 'ا' + c]), {min: 1}));
        rules.push(cross(prefixes, RADICALS.map((c) => [c + c + ending, c]), {min: 1}));
    }
    return rules;
}

const SEE = 'رأى';
function seeRules(prefixes, endings) {
    // رأى drops its hamza in the present: يرى, ترون, ير.
    return [cross(prefixes.filter(([, d]) => d === ''), endings.map((e) => [e, SEE]), {min: 0, extra: {stemCharacters: '[]'}})];
}

const PRESENT_PERSONS = [
    ['presentHe', 'present (he)', 'ي', 'he does', 'يكتب', ['رى']],
    ['presentSheYou', 'present (she, you)', 'ت', 'she does, you (one man) do', 'تكتب', ['رى']],
    ['presentI', 'present (I)', 'أ', 'I do', 'أكتب', ['رى']],
    ['presentWe', 'present (we)', 'ن', 'we do', 'نكتب', ['رى']],
];
// A sound verb with an object pronoun in one step, as Yomitan reads it, so
// that it ties with no two-pronoun chain (يمكنك is not يم + ـكن + ـك).
const OBJECTS = ['ني', 'نا', 'ك', 'كما', 'كم', 'كن', 'ه', 'ها', 'هما', 'هم', 'هن'];
// يمكن (it is possible) is أمكن, with or without a pronoun, not مكن (to be
// strong); يهم (it matters) is همّ, not لم يهم of هام; أموت is مات.
const FORM_IV_PRESENT = ['حب', 'خبر', 'عجب', 'درك', 'صبح'];
const formIV = (p) => FORM_IV_PRESENT.flatMap((stem) => ['', ...OBJECTS].map((pr) => [p + stem + pr, 'أ' + stem]));
const LISTED_PRESENT = {
    'ن': formIV('ن'),
    'ي': [...formIV('ي'), ['يمكن', 'أمكن'], ...OBJECTS.map((pr) => ['يمكن' + pr, 'أمكن']), ['يهم', 'هم'], ['يعنى', 'عنى'], ['يسمى', 'سمى'], ['يسكن', 'سكن']],
    'ت': [...formIV('ت'), ['تمكن', 'أمكن'], ['تهم', 'هم'], ['تعنى', 'عنى'], ['تسمى', 'سمى']],
    'أ': [['أموت', 'مات'], ['أعنى', 'عنى'], ['أيمكن', 'أمكن'], ...OBJECTS.map((pr) => ['أيمكن' + pr, 'أمكن'])],
};
for (const [id, name, p, gloss, example, see] of PRESENT_PERSONS) {
    transform(id, name, `The present tense "${gloss}", which is also its subjunctive and jussive: ${example} (كتب); يقول (قال), يدعو (دعا), يرمي (رمى), ينسى (نسي), يكرم (أكرم), يستخدم (استخدم), يصل (وصل), يرى (رأى). With an object pronoun in the same step: يمكنك, يعرفه.`, [
        ...presentRules(PRESENT[p], '', {defective: [['و', 'ا'], ['ي', 'ى'], ['ى', 'ي'], ['ى', 'ا']], hamza: [['أ', 'ئ']]}),
        ...seeRules(PRESENT[p], see),
        // Only stems without و, ي, ى or ا: a hollow or defective verb is read by
        // its own rules and the pronoun rule (يزوره -> زار, يعطيه -> أعطى). A
        cross(PRESENT[p], OBJECTS.filter((pr) => !((p === 'أ' || p === 'ن') && (pr === 'ني' || pr === 'نا'))).map((pr) => [pr, '']),
            {extra: {stemCharacters: STRONG}}),
        // Frequent words whose ordinary reading the rules would otherwise put
        // after a rarer one the dictionary also names.
        ...(LISTED_PRESENT[p] ?? []).map(([i, d]) => whole(i, d, {into: V_IN, out: V_OUT})),
    ]);
}
for (const [id, name, p, gloss, example] of [
    ['jussiveHe', 'jussive (he)', 'ي', 'he', 'لم يقل'],
    ['jussiveSheYou', 'jussive (she, you)', 'ت', 'she, you (one man)', 'لا تقل'],
    ['jussiveI', 'jussive (I)', 'أ', 'I', 'لم أقل'],
    ['jussiveWe', 'jussive (we)', 'ن', 'we', 'لم نقل'],
]) {
    transform(id, name, `The short jussive "${gloss}" after لم, لا, لـ and in conditions, where a hollow, defective or doubled verb loses a letter or writes both consonants: ${example} (قال), يدع (دعا), يرم (رمى), ينس (نسي), يمدد (مد), يشأ (شاء), ير (رأى).`, [
        // A verb in ي before one in ى, as in the imperative (تنس is نسي).
        cross(PRESENT[p], [['', 'ا'], ['', 'ي'], ['', 'ى']]),
        // نكن (لم نكن) is كان, before the past ناك of pastTheyF.
        ...(p === 'ن' ? [whole('نكن', 'كان', {into: V_IN, out: V_OUT})] : []),
        cross(PRESENT[p], [['أ', 'اء'], ['ئ', 'اء']], {min: 1}),
        cross(PRESENT[p], RADICALS.map((c) => [c, 'ا' + c]), {min: 1}),
        cross(PRESENT[p], RADICALS.map((c) => [c + c, c]), {min: 1}),
        ...seeRules(PRESENT[p], ['ر']),
    ]);
}
const BOTH = [...PRESENT['ي'], ...PRESENT['ت']];
transform('presentTheyTwo', 'present (they two)', 'The present tense ending يـان "they (two) do": يكتبان; يقولان (قال), يدعوان (دعا), يرميان (رمى), ينسيان (نسي), يقرآن (قرأ).', [
    ...presentRules(PRESENT['ي'], 'ان', {defective: [['وان', 'ا'], ['يان', 'ي'], ['يان', 'ى'], ['يان', 'ا']], hamza: [['آن', 'أ'], ['يئان', 'اء']]}),
    ...seeRules(PRESENT['ي'], ['ريان']),
]);
transform('presentYouTwo', 'present (you two, they f. two)', 'The present tense ending تـان "you (two) do, they (two women) do": تكتبان; تقولان (قال), تدعوان (دعا), ترميان (رمى).', [
    ...presentRules(PRESENT['ت'], 'ان', {defective: [['وان', 'ا'], ['يان', 'ي'], ['يان', 'ى'], ['يان', 'ا']], hamza: [['آن', 'أ'], ['يئان', 'اء']]}),
    ...seeRules(PRESENT['ت'], ['ريان']),
]);
for (const [id, name, p, gloss, example] of [
    ['presentThey', 'present (they)', 'ي', 'they do', 'يكتبون'],
    ['presentYouPl', 'present (you pl.)', 'ت', 'you (plural) do', 'تكتبون'],
]) {
    transform(id, name, `The present tense ending ${p}ـون "${gloss}": ${example}; يقولون (قال), يدعون (دعا), يرمون (رمى), ينسون (نسي), يقرؤون (قرأ), يجيئون (جاء), يرون (رأى).`, [
        ...presentRules(PRESENT[p], 'ون', {defective: [['ون', 'ا'], ['ون', 'ي'], ['ون', 'ى']], hamza: [['ؤون', 'أ'], ['ءون', 'أ'], ['يئون', 'اء']]}),
        ...seeRules(PRESENT[p], ['رون']),
    ]);
}
for (const [id, name, p, gloss, example] of [
    ['presentTheyF', 'present (they f.)', 'ي', 'they (women) do', 'يكتبن'],
    ['presentYouFPl', 'present (you f. pl.)', 'ت', 'you (women) do', 'تكتبن'],
]) {
    transform(id, name, `The present tense ending ${p}ـن "${gloss}": ${example}; يقلن (قال), يمددن (مد), يدعون (دعا), يرمين (رمى), ينسين (نسي), يرين (رأى).`, [
        ...presentRules(PRESENT[p], 'ن', {defective: [['ون', 'ا'], ['ين', 'ي'], ['ين', 'ى'], ['ين', 'ا']], hamza: [['ئن', 'اء']], hollow: false, short: true}),
        ...seeRules(PRESENT[p], ['رين']),
    ]);
}
transform('presentYouF', 'present (you f.)', 'The present tense ending تـين "you (one woman) do": تكتبين; تقولين (قال), تدعين (دعا), ترمين (رمى), تنسين (نسي), تقرئين (قرأ), ترين (رأى).', [
    ...presentRules(PRESENT['ت'], 'ين', {defective: [['ين', 'ا'], ['ين', 'ي'], ['ين', 'ى']], hamza: [['ئين', 'أ'], ['يئين', 'اء']]}),
    ...seeRules(PRESENT['ت'], ['رين']),
    // تحبين is أحب, before the defective حبا of presentYouFPl.
    whole('تحبين', 'أحب', {into: V_IN, out: V_OUT}),
]);
transform('subjunctiveTheyTwo', 'subjunctive (they two)', 'The subjunctive and jussive ending يـا "they (two)": لن يكتبا; يقولا (قال), يدعوا (دعا), يرميا (رمى), يقرآ (قرأ).', [
    ...presentRules(PRESENT['ي'], 'ا', {defective: [['وا', 'ا'], ['يا', 'ي'], ['يا', 'ى'], ['يا', 'ا']], hamza: [['آ', 'أ']]}),
    ...seeRules(PRESENT['ي'], ['ريا']),
]);
transform('subjunctiveYouTwo', 'subjunctive (you two, they f. two)', 'The subjunctive and jussive ending تـا "you (two), they (two women)": لن تكتبا; تقولا (قال), تدعوا (دعا), ترميا (رمى).', [
    ...presentRules(PRESENT['ت'], 'ا', {defective: [['وا', 'ا'], ['يا', 'ي'], ['يا', 'ى'], ['يا', 'ا']], hamza: [['آ', 'أ']]}),
    ...seeRules(PRESENT['ت'], ['ريا']),
]);
for (const [id, name, p, gloss, example] of [
    ['subjunctiveThey', 'subjunctive (they)', 'ي', 'they', 'لن يكتبوا'],
    ['subjunctiveYouPl', 'subjunctive (you pl.)', 'ت', 'you (plural)', 'لن تكتبوا'],
]) {
    transform(id, name, `The subjunctive and jussive ending ${p}ـوا "${gloss}": ${example}; يقولوا (قال), يدعوا (دعا), يرموا (رمى), ينسوا (نسي), يقرؤوا (قرأ), يروا (رأى).`, [
        ...presentRules(PRESENT[p], 'وا', {defective: [['وا', 'ا'], ['وا', 'ي'], ['وا', 'ى']], hamza: [['ؤوا', 'أ'], ['ءوا', 'أ'], ['يئوا', 'اء']]}),
        ...seeRules(PRESENT[p], ['روا']),
    ]);
}
transform('subjunctiveYouF', 'subjunctive (you f.)', 'The subjunctive and jussive ending تـي "you (one woman)": لن تكتبي; تقولي (قال), تدعي (دعا), ترمي (رمى), تقرئي (قرأ), تري (رأى).', [
    ...presentRules(PRESENT['ت'], 'ي', {defective: [['ي', 'ا'], ['ي', 'ى']], hamza: [['ئي', 'أ'], ['يئي', 'اء']]}),
    ...seeRules(PRESENT['ت'], ['ري']),
    // Before the defective present of أجدى and تصلى.
    ...[['تجدي', 'وجد'], ['تتصلي', 'اتصل']].map(([i, d]) => whole(i, d, {into: V_IN, out: V_OUT})),
]);

// The imperative. Form I starts with ا (اكتب); the other forms are spelled
// like the dictionary form (كلّم, أكرم, استخدم), so only their endings are
const FORM_I = [['ا', '']];
// Verbs like وصل drop their و in the imperative: صل, صلي, صلوا. A rule that
// adds و to any two letters would read most short words as such verbs, so the
const ASSIMILATED = ['قف', 'ضع', 'دع', 'صل', 'جد', 'عد', 'زن', 'هب', 'صف', 'رث', 'ثق', 'لد', 'قع', 'سع', 'فد', 'سم', 'طأ', 'زع', 'رد', 'صم']
    .map((stem) => [stem, 'و' + stem]);
function imperativeRules(ending, {defective = [], others = [], hollowShort = false, assimilated = true} = {}) {
    // A form I imperative's stem has no long vowel (اكتب, ادع, اقرأ), so a stem
    // with ا, و or ي is not read as one: الان, اين, اول and اكون are words
    const rules = [cross(FORM_I, [[ending, '']], {min: 3, extra: {stemCharacters: STRONG}})];
    rules.push(cross(FORM_I, [[ending, '']], {min: 3, extra: {stemCharacters: STRONG, stemChange: SEAT_TO_ALIF}}));
    rules.push(cross(FORM_I, [[ending, '']], {min: 3, extra: {stemCharacters: STRONG, stemChange: SEAT_TO_YA}}));
    // Before an ending, a final hamza sits on ئ or ؤ, never أ (برئي, not
    // برأي, which is بـ + رأي "my opinion").
    const notAlifHamza = ending === '' ? {} : {stemNotEndsWith: '[أ]'};
    rules.push(suffix(ending, '', {min: 3, into: V_IN, out: V_OUT, extra: {stemChange: SEAT_TO_ALIF, ...notAlifHamza}}));
    if (defective.length > 0) { rules.push(cross(FORM_I, defective, {extra: {stemCharacters: NO_ALIF}})); }
    // Whole words, so that they are read before the hollow imperative (ضع is
    // وضع, not ضاع).
    if (assimilated) { for (const [i, d] of ASSIMILATED) { rules.push(whole(i + ending, d, {into: V_IN, out: V_OUT})); } }
    if (hollowShort) {
        rules.push(suffixes(RADICALS.map((c) => [c + ending, 'ا' + c]), {min: 1, into: V_IN, out: V_OUT}));
        rules.push(cross(FORM_I, RADICALS.map((c) => [c + c + ending, c]), {min: 1, extra: {stemCharacters: STRONG}}));
    } else {
        rules.push(suffixes(hollow(ending), {min: 1, into: V_IN, out: V_OUT}));
    }
    for (const [i, d, m = 3] of others) { rules.push(suffix(i, d, {min: m, into: V_IN, out: V_OUT, extra: i === '' ? {} : {stemNotEndsWith: '[أ]'}})); }
    return rules;
}
transform('imperativeYou', 'imperative (you)', 'The imperative "do!" to one man: اكتب (كتب), قل (قال), ادع (دعا), ارم (رمى), انس (نسي), امدد (مد), قف (وقف), أعط (أعطى), اشتر (اشترى), كل (أكل), خذ (أخذ), مر (أمر), ر (رأى).', [
    // A verb in ي before one in ى: ابق is بقي; بقى is its informal spelling.
    ...imperativeRules('', {defective: [['', 'ا'], ['', 'ي'], ['', 'ى']], hollowShort: true, others: [['', 'ى']]}),
    ...[['كل', 'أكل'], ['خذ', 'أخذ'], ['مر', 'أمر'], ['ر', SEE], ['ائت', 'أتى'], ['جئ', 'جاء']].map(([i, d]) => whole(i, d, {into: V_IN, out: V_OUT})),
    // العب (play!), which the dictionary also lists as الـ + عب.
    whole('العب', 'لعب', {into: V_IN, out: V_OUT}),
    // أعطِ (give!) with an object pronoun, before أ + عط + ني.
    ...['أعطني', 'أعطه', 'أعطها', 'أعطنا', 'أعطهم'].map((i) => whole(i, 'أعطى', {into: V_IN, out: V_OUT})),
]);
transform('imperativeYouF', 'imperative (you f.)', 'The imperative "do!" to one woman, ending in ـي: اكتبي (كتب), قولي (قال), ادعي (دعا), ارمي (رمى), قفي (وقف), علمي (علم), أعطي (أعطى), كلي (أكل), ري (رأى).', [
    // A verb in ي before one in ى: انسي is نسي.
    ...imperativeRules('ي', {defective: [['ي', 'ا'], ['ي', 'ي'], ['ي', 'ى']], others: [['ي', '', 2], ['ي', 'ى']]}),
    ...[['كلي', 'أكل'], ['خذي', 'أخذ'], ['مري', 'أمر'], ['ري', SEE]].map(([i, d]) => whole(i, d, {into: V_IN, out: V_OUT})),
    // Frequent form V and VI imperatives, which the subjunctive of form I
    // (تعالي, "you (f.) rise") would read first.
    ...[['تعالي', 'تعالى'], ['توقفي', 'توقف'], ['تفضلي', 'تفضل'], ['تحدثي', 'تحدث'], ['تمهلي', 'تمهل'], ['تحركي', 'تحرك'], ['تنفسي', 'تنفس'], ['تذكري', 'تذكر'], ['انسي', 'نسي']].map(([i, d]) => whole(i, d, {into: V_IN, out: V_OUT})),
]);
transform('imperativeYouTwo', 'imperative (you two)', 'The imperative "do!" to two people, ending in ـا: اكتبا (كتب), قولا (قال), ادعوا (دعا), ارميا (رمى).', [
    ...imperativeRules('ا', {defective: [['وا', 'ا'], ['يا', 'ي'], ['يا', 'ى']]}),
    ...[['كلا', 'أكل'], ['خذا', 'أخذ'], ['مرا', 'أمر'], ['ريا', SEE]].map(([i, d]) => whole(i, d, {into: V_IN, out: V_OUT})),
]);
transform('imperativeYouPl', 'imperative (you pl.)', 'The imperative "do!" to several people, ending in ـوا: اكتبوا (كتب), قولوا (قال), ادعوا (دعا), ارموا (رمى), انسوا (نسي), قفوا (وقف), كلوا (أكل), روا (رأى).', [
    ...imperativeRules('وا', {defective: [['وا', 'ا'], ['وا', 'ي'], ['وا', 'ى']]}),
    ...[['كلوا', 'أكل'], ['خذوا', 'أخذ'], ['مروا', 'أمر'], ['روا', SEE]].map(([i, d]) => whole(i, d, {into: V_IN, out: V_OUT})),
]);
transform('imperativeYouFPl', 'imperative (you f. pl.)', 'The imperative "do!" to several women, ending in ـن: اكتبن (كتب), قلن (قال), ادعون (دعا), ارمين (رمى).', [
    ...imperativeRules('ن', {defective: [['ون', 'ا'], ['ين', 'ي'], ['ين', 'ى']], hollowShort: true}),
]);

// Passive past tense, where it is spelled differently from the active. It
// comes after the present and imperative, which it ties with in a few spellings
const PASSIVE_ENDINGS = [['', 'he'], ['ت', 'she'], ['تا', 'they f. two'], ['ا', 'they two'], ['وا', 'they'],
    ['تم', 'you pl.'], ['تما', 'you two'], ['تن', 'you f. pl.'], ['نا', 'we'], ['ن', 'they f.']];
{
    const rules = [];
    // Hollow: قيل -> قال, أقيم -> أقام, اختير -> اختار; hamza in the middle: سئل -> سأل.
    rules.push(suffixes(PASSIVE_ENDINGS.flatMap(([ending]) => RADICALS.flatMap((c) => [['ي' + c + ending, 'ا' + c], ['ئ' + c + ending, 'أ' + c]])), {min: 1, into: V_IN, out: V_OUT}));
    // A final hamza on ي: أنبئ -> أنبأ, أنبئت -> أنبأ; with a hollow verb: أضيئت -> أضاء.
    for (const [ending] of PASSIVE_ENDINGS) {
        rules.push(suffix('ئ' + ending, 'أ', {into: V_IN, out: V_OUT}));
        rules.push(suffix('يئ' + ending, 'اء', {min: 1, into: V_IN, out: V_OUT}));
    }
    // Defective: رمي -> رمى, دعي -> دعا, أعطي -> أعطى; دعيت -> دعا.
    rules.push(suffix('ي', 'ى', {into: V_IN, out: V_OUT}), suffix('ي', 'ا', {into: V_IN, out: V_OUT}));
    rules.push(suffix('يت', 'ا', {into: V_IN, out: V_OUT}), suffix('يا', 'ا', {into: V_IN, out: V_OUT}));
    rules.push(suffix('يتا', 'ى', {into: V_IN, out: V_OUT}), suffix('يتا', 'ا', {into: V_IN, out: V_OUT}));
    // Form III and VI: كوتب -> كاتب, تقوبل -> تقابل.
    const formThree = [];
    for (const c of RADICALS) { formThree.push([c + 'و', c + 'ا'], ['ت' + c + 'و', 'ت' + c + 'ا']); }
    rules.push(cross(formThree, [['', ''], ...['ت', 'تا', 'ا', 'وا', ...CONSONANT_ENDINGS.filter((e) => e !== 'ت')].map((e) => [e, ''])]));
    transform('pastPassive', 'past passive', 'The passive past tense where it is spelled differently from the active: قيل "it was said" (قال), أقيم (أقام), اختير (اختار), سئل (سأل), رمي (رمى), دعي (دعا), كوتب (كاتب), with the endings ـت, ـتا, ـا and ـوا.', rules);
}

// ----------------------------------------------- participles and verbal nouns
// Derivation rather than inflection, and dictionaries list most of these words
// on their own, so both transforms are optional (the derivedForms setting).
{
    const rules = [];
    // Forms II-X: م replaces the person prefix (مستخدم, يستخدم -> استخدم).
    rules.push(prefix('م', '', {min: 3, into: N_IN, out: V_OUT}), prefix('م', 'أ', {min: 3, into: N_IN, out: V_OUT}), prefix('م', 'ا', {min: 3, into: N_IN, out: V_OUT}));
    rules.push(cross([['م', 'أ'], ['م', 'ا']], hollow(''), {min: 1, into: N_IN}));
    rules.push(cross([['م', ''], ['م', 'أ'], ['م', 'ا']], [['', 'ى'], ['ي', 'ى']], {into: N_IN}));
    // Form I active فاعل: كاتب -> كتب, قائل -> قال, داع -> دعا, رام -> رمى.
    rules.push(cross(RADICALS.map((c) => [c + 'ا', c]), [['', ''], ['ي', 'ى'], ['ي', 'ا']], {into: N_IN}));
    rules.push(cross(RADICALS.map((c) => [c + 'ا', c]), [['', 'ا'], ['', 'ى']], {min: 1, into: []}));
    rules.push(cross(RADICALS.map((c) => [c + 'ائ', c + 'ا']), [['', '']], {min: 1, into: []}));
    // Form I passive مفعول: مكتوب -> كتب, مقول -> قال, مبيع -> باع, مدعو -> دعا, مرمي -> رمى.
    rules.push(cross([['م', '']], RADICALS.map((c) => ['و' + c, c]), {into: N_IN}));
    rules.push(cross([['م', '']], RADICALS.flatMap((c) => [['و' + c, 'ا' + c], ['ي' + c, 'ا' + c]]), {min: 1, into: []}));
    rules.push(cross([['م', '']], [['و', 'ا'], ['ي', 'ى']], {into: N_IN}));
    transform('participle', 'participle', 'An active or passive participle read as its verb: كاتب and مكتوب (كتب), قائل and مقول (قال), مستخدم (استخدم), مقيم (أقام), معط (أعطى). Off unless the derivedForms setting is on.', rules, {optional: true});
}
{
    const rules = [];
    // II تفعيل, تفعية: تكليم -> كلم, تسمية -> سمى.
    rules.push(cross([['ت', '']], RADICALS.map((c) => ['ي' + c, c]), {into: N_IN}));
    rules.push(cross([['ت', '']], [['ية', 'ى']], {into: N_IN}));
    // III مفاعلة: مساعدة -> ساعد; of a verb in ى: مباراة -> بارى, ملاقاة -> لاقى.
    rules.push(cross([['م', '']], [['ة', '']], {min: 3, into: N_IN}));
    rules.push(cross([['م', '']], [['اة', 'ى']], {min: 3, into: N_IN}));
    // IV إفعال, إفالة, إفعاء: إكرام -> أكرم, إقامة -> أقام, إعطاء -> أعطى.
    rules.push(cross([['إ', 'أ']], RADICALS.map((c) => ['ا' + c, c]), {into: N_IN}));
    rules.push(cross([['إ', 'أ']], RADICALS.map((c) => ['ا' + c + 'ة', 'ا' + c]), {min: 1, into: []}));
    rules.push(cross([['إ', 'أ']], [['اء', 'ى']], {into: N_IN}));
    // VII-X انفعال, افتعال, استفعال: انكسار -> انكسر, اجتماع -> اجتمع, استخدام -> استخدم,
    // استقالة -> استقال, انتهاء -> انتهى, استدعاء -> استدعى.
    rules.push(cross([['ا', 'ا']], RADICALS.map((c) => ['ا' + c, c]), {min: 3, into: []}));
    rules.push(cross([['ا', 'ا']], [['اء', 'ى']], {min: 3, into: []}));
    rules.push(cross([['است', 'است']], RADICALS.map((c) => ['ا' + c + 'ة', 'ا' + c]), {min: 1, into: []}));
    transform('verbalNoun', 'verbal noun', 'The verbal noun of a derived verb read as the verb: تكليم (كلم), مساعدة (ساعد), إكرام (أكرم), إقامة (أقام), اجتماع (اجتمع), استخدام (استخدم), استقالة (استقال), انتهاء (انتهى). Off unless the derivedForms setting is on.', rules, {optional: true});
}

// Frequent words the rules would read as a rarer homograph first (README.md,
// Rule provenance), as whole words of the transform that reads them.
const LISTED = {
    presentHe: [['يمر', 'مر'], ['يبيعان', 'باع'], ['يميل', 'مال'], ['يفيض', 'فاض'], ['يدخن', 'دخن'], ['يضر', 'ضر'], ['يحزن', 'حزن'], ['يتكون', 'تكون'], ['يبيع', 'باع'], ['يغير', 'غير'], ['يسبب', 'سبب'], ['يغلق', 'أغلق'], ['يفلح', 'أفلح'], ['يؤثر', 'أثر'], ['يخفي', 'أخفى'],
        ['يبقي', 'أبقى'], ['يحق', 'حق'], ['يصاب', 'أصاب']],
    presentSheYou: [['تميل', 'مال'], ['تفيض', 'فاض'], ['تدخن', 'دخن'], ['تحزن', 'حزن'], ['تبيع', 'باع'], ['تغلق', 'أغلق'], ['تؤثر', 'أثر'], ['تنهي', 'أنهى'], ['تضيع', 'ضاع'], ['تتم', 'تم'], ['تنسي', 'نسي']],
    presentI: [['أبيع', 'باع'], ['أكرر', 'كرر']],
    presentWe: [['نبقي', 'أبقى'], ['نبيع', 'باع']],
    presentYouF: [['تصبحين', 'أصبح'], ['تعطين', 'أعطى'], ['تمدين', 'مد'], ['تنامين', 'نام'], ['تبيعين', 'باع'], ['تأتين', 'أتى'], ['تدركين', 'أدرك'], ['تودين', 'ود'], ['تعنين', 'عنى']],
    presentThey: [['يصبحون', 'أصبح'], ['يبدون', 'بدا'], ['يدعون', 'دعا'], ['يعطون', 'أعطى'], ['يبيعون', 'باع'], ['يرتدون', 'ارتدى'], ['يبقون', 'بقي']],
    presentYouPl: [['تبقون', 'بقي'], ['تعطون', 'أعطى'], ['تدعون', 'دعا']],
    subjunctiveYouPl: [['تعطوا', 'أعطى']],
    jussiveWe: [['نعط', 'أعطى']],
    presentTheyF: [['يصلن', 'وصل']],
    subjunctiveThey: [['يجدوا', 'وجد'], ['يبيعوا', 'باع'], ['يعطوا', 'أعطى']],
    jussiveHe: [['يعط', 'أعطى']],
    jussiveSheYou: [['تعط', 'أعطى']],
    presentTheyTwo: [['يجدان', 'وجد'], ['يصلان', 'وصل']],
    presentYouTwo: [['تجدان', 'وجد'], ['تصلان', 'وصل']],
    pastTheyTwoF: [['دعتا', 'دعا']],
    subjunctiveYouF: [['تبيعي', 'باع'], ['تصبحي', 'أصبح']],
    imperativeYouPl: [['تعالوا', 'تعالى']],
    pastThey: [],
    pastTheyF: [],
    pastI: [['مرت', 'مر'], ['قالته', 'قال'], ['قلته', 'قال'], ['قابلته', 'قابل'], ['سمعته', 'سمع'], ['كتبتها', 'كتب'], ['دعت', 'دعا'], ['غيرت', 'غير'], ['عمت', 'عم'], ['ألقت', 'ألقى'], ['ارتدت', 'ارتدى'], ['فرت', 'فر'], ['ضيعت', 'ضيع'], ['غطت', 'غطى']],
    imperativeYouF: [['دعى', 'دعا']],
    imperativeYou: [['انهض', 'نهض'], ['أعط', 'أعطى']],
};
const LISTED_NOUNS = [['السنين', 'سنة'], ['سنين', 'سنة'], ['الملفات', 'ملف'], ['ملفات', 'ملف'], ['النيران', 'نار'], ['الجدران', 'جدار'],
    ['الرفاق', 'رفيق'], ['الأخر', 'آخر'], ['الخضراء', 'أخضر'], ['الفرسان', 'فارس'], ['هذين', 'هذا'], ['كلتا', 'كلا'], ['قرون', 'قرن'],
    ['موتي', 'موت'], ['فتي', 'فتى'], ['كيسي', 'كيس'], ['سيئا', 'سيئ'], ['النساء', 'امرأة'], ['الأسباب', 'سبب'], ['العظيمة', 'عظيم'],
    ['أصول', 'أصل'], ['أعين', 'عين'], ['توقيت', 'وقت'], ['رأيا', 'رأي'], ['حزنا', 'حزن'], ['كتبا', 'كتاب'], ['إنسانا', 'إنسان'],
    ['راضيا', 'راض'], ['قاسيا', 'قاس'], ['عضوا', 'عضو'], ['عدوا', 'عدو'], ['أمينا', 'أمين'], ['يسيرا', 'يسير'], ['حلوا', 'حلو'],
    ['صورا', 'صورة'], ['القصور', 'قصر'], ['الشجر', 'شجرة'], ['المشاهد', 'مشهد'], ['الحمر', 'حمار'], ['القطع', 'قطعة'], ['الأنفاق', 'نفق'],
    ['الرمال', 'رمل'], ['قاضيا', 'قاض'], ['كبيرات', 'كبير'], ['الكبيرتان', 'كبير'], ['الطويلة', 'طويل'], ['السرية', 'سري'], ['الباردة', 'بارد'],
    ['الميتة', 'ميت'], ['الاجتماعية', 'اجتماعي'], ['المظلمة', 'مظلم'], ['السيئة', 'سيئ'], ['الرائعة', 'رائع'], ['الغريبة', 'غريب'],
    ['الطبيعية', 'طبيعي'], ['الخاطئة', 'خاطئ'], ['الوطنية', 'وطني'], ['الشمسية', 'شمسي'], ['الإفريقية', 'إفريقي'], ['اليومية', 'يومي'],
    ['الشعبية', 'شعبي']];
// And on the texts: بطريقة (52 in Tatoeba) and بطلاقة (17) are بـ + a noun
// in ة, not a feminine of بطريق and طلاق; والتي is و + التي; سآتي is سـ +
LISTED.bi = [['بطريقة', 'طريقة'], ['بطلاقة', 'طلاقة']];
LISTED.wa = [['والتي', 'الذي']];
LISTED.sa = [['سآتي', 'أتى']];
for (const [id, words] of Object.entries(LISTED)) {
    const verb = !['bi', 'wa'].includes(id);
    transforms.find((t) => t.id === id).rules.push(...words.map(([i, d]) => (verb ? whole(i, d, {into: V_IN, out: V_OUT}) : whole(i, d))));
}
transforms.find((t) => t.id === 'listedNoun').rules.push(...LISTED_NOUNS.map(([i, d]) => whole(i, d)));
// Adjectives whose spelling a noun ending also reaches as a tagged noun: as
// whole words without conditions, first, so that the entries come in the
transforms.find((t) => t.id === 'listedNoun').rules.unshift(...[['كافية', 'كاف'], ['كافي', 'كاف'], ['الكافي', 'كاف'], ['كافيا', 'كاف'],
    ['العلوي', 'علوي'], ['المقبل', 'مقبل'], ['المقبلة', 'مقبل'], ['عارية', 'عار'], ['خالية', 'خال'], ['حرة', 'حر'], ['مستقرة', 'مستقر'],
    ['منخفضة', 'منخفض'], ['جدية', 'جدي'], ['عشرات', 'عشرة'], ['خفيفة', 'خفيف'], ['كريمة', 'كريم'], ['ضيقة', 'ضيق'], ['مؤقتة', 'مؤقت'],
    ['مسرعة', 'مسرع'], ['طيبة', 'طيب'], ['الطيب', 'طيب'], ['كبيرتان', 'كبير'], ['الكبيرات', 'كبير']].map(([i, d]) => whole(i, d)));
// Words whose spelling is also a verb that the dictionary lists first: as
// whole words that give a noun, only the noun entries answer (نفسه is نَفْس
transforms.find((t) => t.id === 'listedNoun').rules.push(...[['نفسه', 'نفس'], ['نفسك', 'نفس'], ['نفسها', 'نفس'], ['نفسي', 'نفس'],
    ['بنفسه', 'نفس'], ['بنفسك', 'نفس'], ['بنفسي', 'نفس'], ['لنفسه', 'نفس'], ['لنفسي', 'نفس'], ['أنفسهم', 'نفس'], ['أنفسنا', 'نفس'],
    ['بشكل', 'شكل'], ['فضلك', 'فضل'], ['فضلكم', 'فضل'], ['وجهه', 'وجه'], ['وجهها', 'وجه'], ['وجهي', 'وجه'], ['وقتي', 'وقت'],
    ['صاحبي', 'صاحب']].map(([i, d]) => whole(i, d, {out: ['n']})));
transforms.find((t) => t.id === 'p1s').rules.push(whole('عندي', 'عند'));
// جيد (good) is untagged, so the noun endings, which give a noun, reach only
// جِيد (neck): its feminine and accusative are written out without conditions.
transforms.find((t) => t.id === 'definiteAdjective').rules.push(...['جيدة', 'جيدا', 'جيدًا', 'الجيد', 'الجيدة', 'جيدين', 'جيدون', 'جيدان'].map((i) => whole(i, 'جيد')));

// ـي (my) after the verb transforms: a tie goes by discovery order (9.6) and
// no verb takes it, so تعني, تجري, ترتدي read as verbs (README.md).
transforms.splice(transforms.findIndex((t) => t.id === 'pastPassive'), 0, ...transforms.splice(transforms.findIndex((t) => t.id === 'p1s'), 1));
const descriptor = {schema: 1, conditions, transforms};
const out = join(dirname(fileURLToPath(import.meta.url)), 'own.json');
writeFileSync(out, formatTransforms(descriptor));
let count = 0;
for (const t of transforms) {
    for (const r of t.rules) {
        count += r.type === 'circumfix' && r.prefixes ? r.prefixes.length * r.suffixes.length : 1;
    }
}
console.log(`${out}: ${transforms.length} transforms, ${transforms.reduce((n, t) => n + t.rules.length, 0)} JSON rules, ${count} rules expanded`);
