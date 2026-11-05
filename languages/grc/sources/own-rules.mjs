// SPDX-License-Identifier: GPL-3.0-or-later
// Writes sources/own.json, rules written from Smyth's and Goodwin's grammars (README.md, "Own rules").

import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  NFC, NFD, stripAccents, stripAll, hasAccent, circumflexToAcute, nuclei, recessive,
  PLAIN_VOWEL_CLASS, ACCENTED_VOWEL_CLASS, CONSONANT_CLASS, LETTERS, charClass,
} from './greek.mjs';

const here = dirname(fileURLToPath(import.meta.url));
// Experiments only: GRC_TWINS=1 makes each rule's twin diacritic-free (breathings and subscripts removed too).
const TWINS = process.env.GRC_TWINS === '1';
const OUT = process.env.GRC_OUT ?? join(here, 'own.json');

// ==== Conditions

const conditions = {
  v: {name: 'Verb', isDictionaryForm: true},
  n: {name: 'Noun', isDictionaryForm: true},
  adj: {name: 'Adjective', isDictionaryForm: true},
  fem: {name: 'Feminine form of the first declension', isDictionaryForm: false},
  neu: {name: 'Neuter plural form', isDictionaryForm: false},
  aug: {name: 'Verb with augment', isDictionaryForm: false},
  red: {name: 'Verb with reduplication', isDictionaryForm: false},
  augred: {name: 'Verb with augment and reduplication', isDictionaryForm: false},
  fut: {name: 'Future stem', isDictionaryForm: false},
  aor: {name: 'Aorist stem', isDictionaryForm: false},
  aora: {name: 'Aorist stem with augment', isDictionaryForm: false},
  aor2: {name: 'Second aorist stem', isDictionaryForm: false},
  aor2a: {name: 'Second aorist stem with augment', isDictionaryForm: false},
  aorp: {name: 'Aorist passive stem', isDictionaryForm: false},
  aorpa: {name: 'Aorist passive stem with augment', isDictionaryForm: false},
  pf: {name: 'Perfect active stem', isDictionaryForm: false},
  plpf: {name: 'Pluperfect active stem', isDictionaryForm: false},
  pmp: {name: 'Perfect middle stem', isDictionaryForm: false},
  plpm: {name: 'Pluperfect middle stem', isDictionaryForm: false},
};

// ==== Transforms and rule emission

const transforms = [];
const byId = new Map();

function transform(id, name, description) {
  if (byId.has(id)) return byId.get(id);
  const t = {id, name, description, source: 'own', rules: [], keys: new Set()};
  transforms.push(t);
  byId.set(id, t);
  return t;
}

function add(id, rule) {
  const t = byId.get(id);
  if (!t) throw new Error(`unknown transform ${id}`);
  for (const k of ['inflected', 'deinflected', 'inflectedPrefix', 'deinflectedPrefix', 'inflectedSuffix', 'deinflectedSuffix']) {
    if (k in rule) rule[k] = NFC(rule[k]);
  }
  if (rule.type === 'suffix' || rule.type === 'prefix' || rule.type === 'wholeWord') {
    if (rule.inflected === rule.deinflected && !rule.stemChange && !rule.then && rule.type !== 'suffix') return;
  }
  const key = JSON.stringify(rule);
  if (t.keys.has(key)) return;
  t.keys.add(key);
  t.rules.push(rule);
}

const THEN_CIRC_TO_ACUTE = [{normalize: 'NFD'}, {map: {'\u0342': '\u0301'}}, {normalize: 'NFC'}];
const THEN_ACUTE_TO_CIRC = [{normalize: 'NFD'}, {map: {'\u0301': '\u0342'}}, {normalize: 'NFC'}];
const THEN_STRIP_ACCENTS = [{normalize: 'NFD'}, {strip: '[\\u0300\\u0301\\u0342]'}, {normalize: 'NFC'}];

// Capital Greek letters, plain or with diacritics: proper names start with one.
const UPPER = charClass([...LETTERS.plainVowels, ...LETTERS.accentedVowels, ...LETTERS.consonants].filter((c) => /[\p{Lu}\p{Lt}]/u.test(c)));
const NOT_SPACE = '[^ ]';
// The pack's class of letters without an accent (language.json): a stem the accent transform may accent.
const NO_ACCENT = '{unaccented}';

/** A rule as written and its twin without accents. `opts.then` applies to the written rule only; `opts.stem` to both. */
function emit(type, id, inflected, deinflected, conditionsIn, conditionsOut, opts = {}) {
  const extra = opts.stem ? {...opts.stem} : {};
  const forms = [[NFC(inflected), NFC(deinflected), opts.then]];
  // The twin reads the removeAccents variant, which chains need (ἀγγελοῦσι → ἀγγελουσι → ἀγγελεω → ἀγγέλλω).
  const twin = TWINS ? stripAll : stripAccents;
  const plainAlready = twin(inflected) === NFC(inflected) && twin(deinflected) === NFC(deinflected);
  if (!opts.writtenOnly && !plainAlready) forms.push([twin(inflected), twin(deinflected), undefined]);
  const seen = new Set();
  forms.forEach(([i, d, then], k) => {
    if (k > 0 && i === forms[0][0] && d === forms[0][1] && !forms[0][2]) return;
    const key = `${i}\u0000${d}\u0000${then ? 1 : 0}`;
    if (seen.has(key)) return;
    seen.add(key);
    const r = {type, inflected: i, deinflected: d, conditionsIn, conditionsOut, ...extra};
    if (then) r.then = then;
    add(id, r);
  });
}
const suffix = (id, i, d, cin, cout, opts) => emit('suffix', id, i, d, cin, cout, opts);
const prefix = (id, i, d, cin, cout, opts) => emit('prefix', id, i, d, cin, cout, opts);
const whole = (id, i, d, cin, cout, opts) => emit('wholeWord', id, i, d, cin, cout, opts);

/** Accent variants of an ending: acute on each of its last three nuclei, circumflex on its last two long ones. */
function accentVariants(ending) {
  const s = stripAccents(ending);
  const ns = nuclei(s);
  const out = [];
  for (let k = 0; k < Math.min(3, ns.length); k++) {
    const n = ns[ns.length - 1 - k];
    out.push(NFC(s.slice(0, n.end) + '\u0301' + s.slice(n.end)));
    if (k < 2 && n.length !== 'short') out.push(NFC(s.slice(0, n.end) + '\u0342' + s.slice(n.end)));
  }
  return out;
}

// The accent transform: accents a text that has none (recessive for verbs, every possible place for nouns).

const V = PLAIN_VOWEL_CLASS;
const C = CONSONANT_CLASS;
const ACC = ACCENTED_VOWEL_CLASS;

const PLAIN_TARGETS = [...'αεηιουω'];
const BREATHING_TARGETS = [...'ἀἁἐἑἠἡἰἱὀὁὐὑὠὡ'];
const SUBSCRIPT_TARGETS = [...'ᾳῃῳᾀᾐᾠ'];
const DIAERESIS_TARGETS = [...'ϊϋ'];
// The stem end of athematic verbs before -ωμι, -ημι, -υμι, -αμαι, -ημαι, -ειμι.
const ATHEMATIC_ACCENT = [
  ['ιδ', 'ωμι'], ['ιθ', 'ημι'], ['ἱστ', 'ημι'], ['ιστ', 'ημι'], ['ἱ', 'ημι'], ['ι', 'ημι'], ['ιμπλ', 'ημι'], ['ιμπρ', 'ημι'], ['ιφ', 'ημι'], ['ικν', 'υμι'], ['υγν', 'υμι'], ['ιγν', 'υμι'],
  ['ηγν', 'υμι'], ['ὀλλ', 'υμι'], ['ολλ', 'υμι'], ['ὀμν', 'υμι'], ['ομν', 'υμι'], ['ὀρν', 'υμι'], ['ορν', 'υμι'], ['ανν', 'υμι'], ['εννυ', 'μι'], ['ωνν', 'υμι'], ['ενν', 'υμι'], ['ἐνν', 'υμι'],
  ['υν', 'αμαι'], ['ιστ', 'αμαι'], ['ἀγ', 'αμαι'], ['ἐρ', 'αμαι'], ['εμ', 'αμαι'], ['αρν', 'αμαι'], ['ιδν', 'αμαι'], ['αθ', 'ημαι'],
  ['ἀρ', 'ειμι'], ['αρ', 'ειμι'], ['ἀπ', 'ειμι'], ['απ', 'ειμι'], ['ἐν', 'ειμι'], ['εν', 'ειμι'], ['υν', 'ειμι'], ['ἐξ', 'ειμι'], ['εξ', 'ειμι'], ['ἐπ', 'ειμι'], ['επ', 'ειμι'],
  ['οσ', 'ειμι'], ['ετ', 'ειμι'], ['ατ', 'ειμι'], ['ἀν', 'ειμι'], ['αν', 'ειμι'], ['ἰσ', 'ειμι'], ['ισ', 'ειμι'], ['ὑπ', 'ειμι'], ['υπ', 'ειμι'], ['ι', 'ειμι'], ['ερι', 'ειμι'], ['ρο', 'ειμι'],
];

const acute = (v) => NFC(v + '\u0301');

function buildAccentTransform() {
  transform('accent', 'accent', 'Puts back the dictionary form\'s accent where a rule removed the syllable that carried it (ἔλυσα → λυω → λύω, λυόμενος → λύω, θεοῦ → θεος → θεός): the recessive accent of a verb; the accent of a noun or adjective on its last syllable or, before a short last syllable, further back.');
  // Only a text without an accent takes one; a text accented elsewhere takes a second one and finds nothing.
  const gate = {};
  // Verbs: an acute on the stem's last vowel before -ω and -ομαι (λυω → λύω, βουλομαι → βούλομαι).
  const ACUTE = Object.fromEntries([...PLAIN_TARGETS, ...DIAERESIS_TARGETS, ...BREATHING_TARGETS, ...SUBSCRIPT_TARGETS].map((v) => [v, acute(v)]));
  const LONG = [...'αηιυω', ...'ἀἁἠἡἰἱὐὑὠὡ', ...SUBSCRIPT_TARGETS];
  const CIRCUMFLEX = Object.fromEntries(LONG.map((v) => [v, NFC(v + '\u0342')]));
  // The mark, a private-use code point, never leaves the rule: its last step writes the ending back.
  const onLastVowel = (ending, map, conditions, extra = {}) => {
    const m = '\uE000';
    add('accent', {type: 'suffix', inflected: ending, deinflected: m, conditionsIn: conditions, conditionsOut: conditions, stemCharacters: NO_ACCENT, ...extra,
      then: [{map, at: 'last'}, {map: {[m]: ending}, at: 'end'}]});
  };
  onLastVowel('ω', ACUTE, ['v']);
  onLastVowel('ομαι', ACUTE, ['v']);
  for (const [stem, ending] of ATHEMATIC_ACCENT) {
    const n = nuclei(stem);
    if (!n.length) continue;
    const last = n[n.length - 1];
    const accented = NFC(stem.slice(0, last.end) + '\u0301' + stem.slice(last.end));
    add('accent', {type: 'suffix', inflected: NFC(stem + ending), deinflected: NFC(accented + ending), conditionsIn: ['v'], conditionsOut: ['v'], ...gate});
  }
  // Nouns and adjectives: the last syllable (θεός, ψυχή, νύξ, βασιλεύς, Περικλῆς).
  const finals = [['ος', 'ός'], ['ον', 'όν'], ['ης', 'ής', 'ῆς'], ['ας', 'άς', 'ᾶς'], ['ις', 'ίς'], ['υς', 'ύς', 'ῦς'], ['ευς', 'εύς'], ['ων', 'ών', 'ῶν'],
    ['ην', 'ήν'], ['ηρ', 'ήρ'], ['ωρ', 'ώρ'], ['ους', 'οῦς'], ['ως', 'ώς', 'ῶς'], ['η', 'ή', 'ῆ'], ['α', 'ά', 'ᾶ'], ['ω', 'ώ'], ['ι', 'ί'], ['υ', 'ύ'],
    ['εις', 'είς'], ['ουν', 'οῦν'], ['αν', 'άν', 'ᾶν'], ['αρ', 'άρ'], ['υρ', 'ύρ', 'ῦρ'], ['ηξ', 'ήξ'], ['αξ', 'άξ'], ['ιξ', 'ίξ', 'ῖξ'], ['υξ', 'ύξ', 'ῦξ'],
    ['ωξ', 'ώξ'], ['οξ', 'όξ'], ['ιγξ', 'ίγξ'], ['υγξ', 'ύγξ'], ['αιξ', 'αίξ'], ['ηψ', 'ήψ'], ['αψ', 'άψ'], ['ωψ', 'ώψ', 'ῶψ'], ['οψ', 'όψ'], ['ιψ', 'ίψ'], ['υψ', 'ύψ'],
    ['αυς', 'αῦς'], ['ους', 'ούς'], ['ην', 'ῆν'], ['ηρ', 'ῆρ'], ['ουρ', 'οῦρ'], ['ως', 'ώς']];
  for (const [plain, ...accented] of finals) {
    for (const a of accented) add('accent', {type: 'suffix', inflected: NFC(plain), deinflected: NFC(a), conditionsIn: ['n', 'adj'], conditionsOut: ['n', 'adj'], ...gate, stemMinLength: 1});
  }
  // Further back: patterns anchored on common endings; the carrier is a vowel not followed by its diphthong's second.
  const PV = '[αεηιουωἀἁἐἑἠἡἰἱὀὁὐὑὠὡᾳῃῳϊϋ]';
  const CC = '[βγδζθκλμνξπρστφχψ]';
  const NUC = '(?:[αεοηΑΕΟΗ][ιυ]|[υΥ]ι|[αεηιουωϊϋᾳῃῳ])';
  const carrier = '(?:[αεηοΑΕΗΟ](?![ιυ])|[υΥ](?!ι)|[ιωἀἁἐἑἠἡἰἱὀὁὐὑὠὡᾳῃῳϊϋΙΩἈἉἘἙἨἩἸἹὈὉὙὨὩ])';
  const longCarrier = '(?:[αη](?![ιυ])|υ(?!ι)|[ιωἀἁἠἡἰἱὐὑὠὡᾳῃῳϊϋ])';
  const pat = (anchor, rest, mark) => add('accent', {type: 'pattern', pattern: `(${carrier === mark ? carrier : mark})(${rest})$`, replacement: '$1\u0301$2'.replace('\u0301', mark === longCarrier ? '\u0342' : '\u0301'), anchorSuffix: anchor, conditionsIn: ['n', 'adj'], conditionsOut: ['n', 'adj'], then: [{normalize: 'NFC'}]});
  // The antepenult only before these endings (ἄνθρωπος, ὄνομα, ἀλήθεια): patterns are slow.
  for (const anchor of ['ος', 'ον', 'μα', 'σσα', 'ττα', 'σις', 'ξις', 'ψις']) pat(anchor, `${CC}*${NUC}${CC}*${anchor}`, carrier);
  for (const anchor of ['εια', 'οια', 'υρα', 'αινα']) pat(anchor, `${CC}*${anchor}`, carrier);
  // The penult (χωρῶν → χώρα, ῥητόρων → ῥήτωρ): an acute, or a circumflex where a long vowel may stand.
  for (const ending of ['α', 'η', 'ης', 'ας', 'ων', 'ωρ', 'υς', 'ις', 'ος', 'ον']) {
    onLastVowel(ending, ACUTE, ['n', 'adj'], {stemMinLength: 1});
  }
  // A circumflex where a long vowel stands before a short last syllable (χώρα, but μοῖρα, γλῶσσα, ῥῆσις, δῶρον).
  for (const ending of ['α', 'ας', 'ος', 'ον']) onLastVowel(ending, CIRCUMFLEX, ['n', 'adj'], {stemMinLength: 1});
  void PV;
}

// ==== Nominal declension

// The order is the order of the transforms, which decides between equal traces: the accusative plural -ους of
// the second declension is commoner than the genitive singular -ους of σ-stems (λόγους, γένους).
const CASES = {
  'acc-pl': ['accusative plural', 'Accusative plural: -ους, -ας, -εις, -ῦς.'],
  'gen-sg': ['genitive singular', 'Genitive singular: -ου, -ης, -ας, -ος, -εως, -ους; Epic and Ionic -οιο, -αο, -εω, -ηος.'],
  'dat-sg': ['dative singular', 'Dative singular: -ῳ, -ῃ, -ᾳ, -ι, -ει.'],
  'acc-sg': ['accusative singular', 'Accusative singular: -ον, -ην, -αν, -α, -ν, -η.'],
  'voc-sg': ['vocative singular', 'Vocative singular: -ε, -α, -η, -ι, -υ, -ευ, the bare stem.'],
  'nom-pl': ['nominative plural', 'Nominative and vocative plural: -οι, -αι, -ες, -εις, -η.'],
  'gen-pl': ['genitive plural', 'Genitive plural: -ων; Epic and Ionic -άων, -έων.'],
  'dat-pl': ['dative plural', 'Dative plural: -οις, -αις, -σι(ν); Epic and Ionic -οισι(ν), -ῃσι(ν), -εσσι(ν).'],
  'na-pl': ['nominative/accusative plural', 'Nominative, accusative and vocative plural of neuters: -α, -η.'],
  'nav-du': ['nominative/accusative/vocative dual', 'Dual: -ω, -α, -ε, -η, -ει.'],
  'gd-du': ['genitive/dative dual', 'Genitive and dative dual: -οιν, -αιν, -οῖν.'],
  'epic-phi': ['Epic -φι', 'Epic -φι(ν), the instrumental and locative ending of Homer (βίηφι, θεόφιν, ὄρεσφι).'],
};

function caseTransforms() {
  for (const [id, [name, description]] of Object.entries(CASES)) transform(id, name, description);
}

/** Syllable count and the length class of the last syllable of an ending. */
function ultimaLength(ending, override) {
  if (override) return override;
  const ns = nuclei(stripAccents(ending));
  if (ns.length === 0) return 'none';
  const last = ns[ns.length - 1];
  const tail = stripAccents(ending).slice(last.end);
  // Final -αι and -οι count as short for the accent.
  if ((last.text === 'αι' || last.text === 'οι') && tail === '') return 'short';
  return last.length;
}

/** A noun or adjective ending to the dictionary form's (λόγου → λόγος, δώρου → δῶρον). */
function nominal(id, ending, lemma, conditionsOut, opts = {}) {
  const e = stripAccents(ending);
  const l = stripAccents(lemma);
  const so = {stem: {stemMinLength: 2, ...(opts.stem ?? {})}};
  const cin = opts.cin ?? [];
  // The stem keeps its accent (λόγου → λόγος).
  suffix(id, e, l, cin, conditionsOut, so);
  // Where the last syllable's length changes, an accent on a long penult turns between acute and
  // circumflex (δώρου → δῶρον, γνῶμαι → γνώμη, σώματος → σῶμα).
  const ue = ultimaLength(e, opts.ultima);
  const ul = ultimaLength(l, opts.lemmaUltima);
  const syllablesChange = nuclei(e).length !== nuclei(l).length;
  // A stem without an accent (NO_ACCENT) has no accent to turn.
  if (so.stem.stemCharacters === NO_ACCENT) return;
  if ((ue !== 'short' || syllablesChange) && ul !== 'long') suffix(id, e, l, cin, conditionsOut, {...so, then: THEN_ACUTE_TO_CIRC, writtenOnly: true});
  if ((ue !== 'long' || syllablesChange) && ul !== 'short') suffix(id, e, l, cin, conditionsOut, {...so, then: THEN_CIRC_TO_ACUTE, writtenOnly: true});
  // The accent on the ending (θεοῦ, νυκτός, χωρῶν): the removeAccents variant reaches the rule above, and the
  // accent transform accents the dictionary form.
}

/** A literal rule with accented endings (θεοῦ → θεός), and its diacritic-free twin. */
function literal(id, ending, lemma, conditionsOut, opts = {}) {
  suffix(id, ending, lemma, [], conditionsOut, {stem: {stemMinLength: 2, ...(opts.stem ?? {})}, writtenOnly: opts.writtenOnly});
}

/**
 * The first declension's genitive plural: a noun's is -ῶν, so -ων after an accented stem is an adjective's feminine
 * (ἀξίων) or another word's (ἀνέμων); a noun's -ων needs an unaccented stem (-ῶν without accents).
 */
function firstGenitivePlural(lemma, adjective) {
  nominal('gen-pl', 'ων', lemma, ['n', ...(adjective ? [] : ['adj'])], {stem: {stemCharacters: NO_ACCENT}});
  if (adjective) nominal('gen-pl', 'ων', lemma, ['adj', 'fem']);
}

const NA = ['n', 'adj'];
const ADJ = ['adj'];

/** Nouns and adjectives. Names have no part of speech and no rules: output without a condition is re-read (7.2). */
function nominalBoth(id, ending, lemma, opts = {}) {
  nominal(id, ending, lemma, opts.out ?? NA, opts);
}

function buildNominal() {
  caseTransforms();
  // The nominative, accusative and vocative dual (ἵππω, χώρα, φύλακε) has the endings of common singular and verb
  // forms (μάθω, ἔλαβε): optional, the setting duals.
  byId.get('nav-du').optional = true;

  // Second declension (λόγος, δῶρον) first: the reading found first comes first among equals (φίλων: φίλος, φίλη).
  const second = [
    ['ου', 'gen-sg'], ['οιο', 'gen-sg'], ['οο', 'gen-sg'], ['ῳ', 'dat-sg'], ['ον', 'acc-sg'], ['ε', 'voc-sg'],
    ['οι', 'nom-pl'], ['ων', 'gen-pl'], ['οις', 'dat-pl'], ['οισι', 'dat-pl'], ['οισιν', 'dat-pl'], ['ους', 'acc-pl'],
    ['ω', 'nav-du'], ['οιν', 'gd-du'], ['οφι', 'epic-phi'], ['οφιν', 'epic-phi'],
  ];
  for (const [e, c] of second) nominalBoth(c, e, 'ος');
  const secondNeut = [['ου', 'gen-sg'], ['οιο', 'gen-sg'], ['ῳ', 'dat-sg'], ['α', 'na-pl'], ['ων', 'gen-pl'], ['οις', 'dat-pl'],
    ['οισι', 'dat-pl'], ['οισιν', 'dat-pl'], ['ω', 'nav-du'], ['οιν', 'gd-du']];
  // οὖσα is the participle of εἰμί, not the plural of the rare οὖσον "ship's tackle".
  for (const [e, c] of secondNeut) {
    nominalBoth(c, e, 'ον', {ultima: e === 'α' ? 'short' : undefined, out: c === 'na-pl' ? ['n', 'adj', 'neu'] : NA, ...(c === 'na-pl' ? {stem: {stemNotStartsWithText: 'οὖσ'}} : {})});
  }
  for (const [e, c] of [['οῦ', 'gen-sg'], ['ῷ', 'dat-sg'], ['όν', 'acc-sg'], ['έ', 'voc-sg'], ['οί', 'nom-pl'], ['ῶν', 'gen-pl'], ['οῖς', 'dat-pl'], ['οῖσι', 'dat-pl'], ['οῖσιν', 'dat-pl'], ['ούς', 'acc-pl'], ['ώ', 'nav-du'], ['οῖν', 'gd-du'], ['οῖο', 'gen-sg']]) literal(c, e, 'ός', NA);
  // The plural -ά as written only: its twin without accents is the rule above, which keeps οὖσα from οὖσον.
  for (const [e, c] of [['οῦ', 'gen-sg'], ['ῷ', 'dat-sg'], ['ά', 'na-pl'], ['ῶν', 'gen-pl'], ['οῖς', 'dat-pl'], ['ώ', 'nav-du'], ['οῖν', 'gd-du']]) literal(c, e, 'όν', NA, {writtenOnly: c === 'na-pl'});
  // Attic second declension (νεώς, λεώς, λαγώς) and contracted -οῦς, -οῦν (νοῦς, πλοῦς, ὀστοῦν).
  for (const [e, c] of [['ω', 'gen-sg'], ['ῳ', 'dat-sg'], ['ων', 'acc-sg'], ['ῳ', 'nom-pl'], ['ων', 'gen-pl'], ['ῳς', 'dat-pl'], ['ως', 'acc-pl']]) nominalBoth(c, e, 'ως');
  for (const [e, c] of [['οῦ', 'gen-sg'], ['ῷ', 'dat-sg'], ['οῦν', 'acc-sg'], ['οῖ', 'nom-pl'], ['ῶν', 'gen-pl'], ['οῖς', 'dat-pl'], ['οῦς', 'acc-pl']]) literal(c, e, 'οῦς', NA);
  for (const [e, c] of [['οῦ', 'gen-sg'], ['ῷ', 'dat-sg'], ['ᾶ', 'na-pl'], ['ῶν', 'gen-pl'], ['οῖς', 'dat-pl']]) literal(c, e, 'οῦν', NA);

  // First declension: -η (τιμή, γνώμη), -α (χώρα, θάλαττα, μοῦσα), masculine -ης (πολίτης), -ας (νεανίας).
  const firstFem = [
    ['ης', 'gen-sg'], ['ῃ', 'dat-sg'], ['ην', 'acc-sg'], ['αι', 'nom-pl'], ['ων', 'gen-pl'], ['αις', 'dat-pl'],
    ['ας', 'acc-pl'], ['α', 'nav-du'], ['αιν', 'gd-du'],
    ['ῃσι', 'dat-pl'], ['ῃσιν', 'dat-pl'], ['ῃς', 'dat-pl'], ['αισι', 'dat-pl'], ['αισιν', 'dat-pl'],
    ['εων', 'gen-pl'], ['αων', 'gen-pl'], ['ηφι', 'epic-phi'], ['ηφιν', 'epic-phi'],
  ];
  const NAF = ['n', 'adj', 'fem'];
  for (const [e, c] of firstFem) {
    if (e === 'ων') firstGenitivePlural('η', true);
    else nominalBoth(c, e, 'η', {ultima: e === 'α' ? 'long' : undefined, out: NAF});
  }
  const firstA = [
    ['ας', 'gen-sg'], ['ης', 'gen-sg'], ['ᾳ', 'dat-sg'], ['ῃ', 'dat-sg'], ['αν', 'acc-sg'], ['ην', 'acc-sg'],
    ['αι', 'nom-pl'], ['ων', 'gen-pl'], ['αις', 'dat-pl'], ['ας', 'acc-pl'], ['αιν', 'gd-du'],
    ['ῃσι', 'dat-pl'], ['ῃσιν', 'dat-pl'], ['αισι', 'dat-pl'], ['αισιν', 'dat-pl'], ['εων', 'gen-pl'], ['αων', 'gen-pl'],
  ];
  for (const [e, c] of firstA) {
    if (e === 'ων') firstGenitivePlural('α', true);
    else nominalBoth(c, e, 'α', {out: NAF});
  }
  for (const e of ['ηφι', 'ηφιν']) nominalBoth('epic-phi', e, 'α');
  // Ionic η for Attic ᾱ: χώρη → χώρα. Doric and Aeolic ᾱ for Attic η: δίκα, ἄταν → δίκη, ἄτη.
  transform('ionic-eta', 'Ionic η', 'Ionic η where Attic has ᾱ (χώρη, ἡμέρη → χώρα, ἡμέρα).');
  nominalBoth('ionic-eta', 'η', 'α');
  transform('doric-alpha', 'Doric ᾱ', 'Doric and Aeolic ᾱ where Attic has η, in Pindar and the lyrics of tragedy (δίκα, ἄταν, ψυχᾶς → δίκη, ἄτη, ψυχή). Optional: the doricAlpha setting turns it on.');
  byId.get('doric-alpha').optional = true;
  for (const [e, l] of [['α', 'η'], ['ας', 'η'], ['ᾳ', 'η'], ['αν', 'η'], ['ας', 'ης'], ['α', 'ης'], ['αν', 'ης'], ['ᾳ', 'ης'], ['ᾶν', 'η'], ['ᾶν', 'ης'], ['ᾶν', 'ας']]) nominalBoth('doric-alpha', e, l);
  const firstMasc = [
    ['ου', 'gen-sg'], ['εω', 'gen-sg'], ['αο', 'gen-sg'], ['ῃ', 'dat-sg'], ['ην', 'acc-sg'], ['εα', 'acc-sg'],
    ['α', 'voc-sg'], ['η', 'voc-sg'], ['αι', 'nom-pl'], ['ων', 'gen-pl'], ['αις', 'dat-pl'], ['ας', 'acc-pl'],
    ['ῃσι', 'dat-pl'], ['ῃσιν', 'dat-pl'], ['εων', 'gen-pl'], ['αων', 'gen-pl'], ['αιν', 'gd-du'], ['α', 'nav-du'],
  ];
  for (const [e, c] of firstMasc) {
    if (e === 'ων') firstGenitivePlural('ης', false);
    else nominalBoth(c, e, 'ης', {ultima: e === 'α' ? 'short' : undefined});
  }
  const firstMascA = [['ου', 'gen-sg'], ['α', 'gen-sg'], ['ᾳ', 'dat-sg'], ['αν', 'acc-sg'], ['α', 'voc-sg'],
    ['αι', 'nom-pl'], ['ων', 'gen-pl'], ['αις', 'dat-pl'], ['ας', 'acc-pl'], ['εω', 'gen-sg'], ['αο', 'gen-sg'], ['αιν', 'gd-du']];
  for (const [e, c] of firstMascA) {
    if (e === 'ων') firstGenitivePlural('ας', false);
    else nominalBoth(c, e, 'ας');
  }
  // Oxytones keep the accent on the ending (τιμῆς → τιμή); -ῶν as written only (see firstGenitivePlural).
  for (const [e, c] of [['ῆς', 'gen-sg'], ['ῇ', 'dat-sg'], ['ήν', 'acc-sg'], ['αί', 'nom-pl'], ['ῶν', 'gen-pl'], ['αῖς', 'dat-pl'], ['άς', 'acc-pl'], ['ά', 'nav-du'], ['αῖν', 'gd-du']]) literal(c, e, 'ή', NAF, {writtenOnly: c === 'gen-pl'});
  for (const [e, c] of [['ᾶς', 'gen-sg'], ['ᾷ', 'dat-sg'], ['άν', 'acc-sg'], ['αί', 'nom-pl'], ['ῶν', 'gen-pl'], ['αῖς', 'dat-pl'], ['άς', 'acc-pl']]) literal(c, e, 'ά', NAF, {writtenOnly: c === 'gen-pl'});
  for (const [e, c] of [['οῦ', 'gen-sg'], ['ῇ', 'dat-sg'], ['ήν', 'acc-sg'], ['ά', 'voc-sg'], ['αί', 'nom-pl'], ['ῶν', 'gen-pl'], ['αῖς', 'dat-pl'], ['άς', 'acc-pl']]) literal(c, e, 'ής', NA, {writtenOnly: c === 'gen-pl'});

  // Third declension: [stem end, nominative ending, dative plural]. Neuters have -α in the plural.
  const third = [
    ['κ', 'ξ', 'ξι'], ['γ', 'ξ', 'ξι'], ['χ', 'ξ', 'ξι'], ['κτ', 'ξ', 'ξι'], ['γγ', 'γξ', 'γξι'],
    ['π', 'ψ', 'ψι'], ['β', 'ψ', 'ψι'], ['φ', 'ψ', 'ψι'], ['μπ', 'μψ', 'μψι'],
    ['ιδ', 'ις', 'ισι'], ['ιτ', 'ις', 'ισι'], ['ιθ', 'ις', 'ισι'], ['αδ', 'ας', 'ασι'], ['υδ', 'υς', 'υσι'],
    ['ητ', 'ης', 'ησι'], ['ωτ', 'ως', 'ωσι'], ['οτ', 'ως', 'οσι'], ['υθ', 'υς', 'υσι'], ['οδ', 'ους', 'οσι'],
    ['οντ', 'ων', 'ουσι'], ['οντ', 'ους', 'ουσι'], ['αντ', 'ας', 'ασι'], ['εντ', 'εις', 'εσι'],
    ['ον', 'ων', 'οσι'], ['ων', 'ων', 'ωσι'], ['ωντ', 'ων', 'ωσι'], ['αν', 'αν', 'ασι'], ['αν', 'ας', 'ασι'], ['εν', 'ην', 'εσι'], ['ην', 'ην', 'ησι'], ['ιν', 'ις', 'ισι'], ['ιν', 'ιν', 'ισι'], ['υν', 'υς', 'υσι'],
    ['ορ', 'ωρ', 'ορσι'], ['ωρ', 'ωρ', 'ωρσι'], ['ηρ', 'ηρ', 'ηρσι'], ['ερ', 'ηρ', 'ερσι'], ['υρ', 'υς', 'υσι'], ['ρ', 'ρ', 'ρσι'],
    ['τρ', 'τηρ', 'τρασι'], ['νδρ', 'νηρ', 'νδρασι'],
  ];
  const thirdNeut = [['ματ', 'μα', 'μασι'], ['ατ', 'ας', 'ασι'], ['ατ', 'αρ', 'ασι'], ['ατ', 'ωρ', 'ασι'], ['ατ', 'υ', 'ασι'], ['ακτ', 'α', 'αξι'], ['ωτ', 'ως', 'ωσι'], ['ατ', 'α', 'ασι']];
  const thirdForms = (stem, datpl, neuter) => [
    [`${stem}ος`, 'gen-sg'], [`${stem}ι`, 'dat-sg'], [`${stem}ων`, 'gen-pl'], [`${stem}ε`, 'nav-du'], [`${stem}οιν`, 'gd-du'],
    [datpl, 'dat-pl'], [`${datpl}ν`, 'dat-pl'], [`${stem}εσσι`, 'dat-pl'], [`${stem}εσσιν`, 'dat-pl'], [`${stem}εσι`, 'dat-pl'], [`${stem}εσιν`, 'dat-pl'],
    ...(neuter ? [[`${stem}α`, 'na-pl']] : [[`${stem}α`, 'acc-sg'], [`${stem}ες`, 'nom-pl'], [`${stem}ας`, 'acc-pl']]),
  ];
  // Monosyllabic stems put the accent on the ending in the genitive and dative (νυκτός, παιδί): the accentless twins read them.
  for (const [list, neuter] of [[third, false], [thirdNeut, true]]) {
    for (const [stem, nom, datpl] of list) {
      for (const [e, c] of thirdForms(stem, datpl, neuter)) {
        nominalBoth(c, e, nom, {stem: {stemMinLength: 1}});
      }
    }
  }
  // Accusative singular in -ν of barytone -ις, -υς and of -ους (χάριν, ἔριν, ὄρνιν).
  for (const [e, l] of [['ιν', 'ις'], ['υν', 'υς'], ['ουν', 'ους']]) nominalBoth('acc-sg', e, l);
  // Vocative singular: the bare stem (δαῖμον, ῥῆτορ, πάτερ, παῖ, γύναι).
  for (const [e, l] of [['ον', 'ων'], ['ορ', 'ωρ'], ['ερ', 'ηρ'], ['ι', 'ις'], ['υ', 'υς'], ['ευ', 'ευς'], ['ες', 'ης'], ['ου', 'ους'], ['οι', 'ω'], ['αν', 'ας'], ['ον', 'ους']]) nominalBoth('voc-sg', e, l);
  // Comparatives in -ων: -ω (= -ονα) and -ους (= -ονες, -ονας).
  for (const [e, c] of [['ω', 'acc-sg'], ['ους', 'nom-pl'], ['ους', 'acc-pl'], ['ω', 'na-pl']]) nominal(c, e, 'ων', ADJ);

  // σ-stems: -ος (γένους), -ης (Σωκράτης, ἀληθής); their genitive plural is -ῶν, as -ων is a participle (μένων).
  const sStemNeut = [['ους', 'gen-sg'], ['εος', 'gen-sg'], ['ευς', 'gen-sg'], ['ει', 'dat-sg'], ['εϊ', 'dat-sg'], ['η', 'na-pl'], ['εα', 'na-pl'],
    ['εων', 'gen-pl'], ['εσι', 'dat-pl'], ['εσιν', 'dat-pl'], ['εσσι', 'dat-pl'], ['εσσιν', 'dat-pl'], ['ει', 'nav-du'], ['οιν', 'gd-du'], ['εοιν', 'gd-du'], ['εσφι', 'epic-phi'], ['εσφιν', 'epic-phi']];
  for (const [e, c] of sStemNeut) nominalBoth(c, e, 'ος');
  suffix('gen-pl', 'ῶν', 'ος', [], NA, {stem: {stemMinLength: 2}, then: THEN_STRIP_ACCENTS, writtenOnly: true});
  // The accusative -η of a barytone -ης (Σωκράτη) is left to the dictionary: it is also the plural of neuter -ος (ἔτη).
  const sStemMasc = [['ους', 'gen-sg'], ['εος', 'gen-sg'], ['ευς', 'gen-sg'], ['ει', 'dat-sg'], ['εϊ', 'dat-sg'], ['ην', 'acc-sg'], ['εα', 'acc-sg'],
    ['ες', 'voc-sg'], ['εις', 'nom-pl'], ['εες', 'nom-pl'], ['ων', 'gen-pl'], ['εων', 'gen-pl'], ['εσι', 'dat-pl'], ['εσιν', 'dat-pl'],
    ['εσσι', 'dat-pl'], ['εσσιν', 'dat-pl'], ['εις', 'acc-pl'], ['εας', 'acc-pl'], ['η', 'na-pl'], ['εα', 'na-pl'], ['ει', 'nav-du'], ['οιν', 'gd-du']];
  for (const [e, c] of sStemMasc) nominalBoth(c, e, 'ης', {out: c === 'na-pl' ? ['n', 'adj', 'neu'] : NA});
  // Oxytone -ής (ἀληθοῦς, ἀληθῆ). The accusative and neuter plural -ῆ only as written: without the accent the
  // ending is that of ἔτη, the plural of ἔτος, which the twin read as ἔτης.
  for (const [e, c] of [['οῦς', 'gen-sg'], ['εῖ', 'dat-sg'], ['εῖς', 'nom-pl'], ['ῶν', 'gen-pl'], ['έσι', 'dat-pl'], ['έσιν', 'dat-pl'], ['εῖς', 'acc-pl'], ['ές', 'voc-sg']]) literal(c, e, 'ής', NA);
  for (const c of ['acc-sg', 'na-pl']) suffix(c, 'ῆ', 'ής', [], NA, {stem: {stemMinLength: 2}, writtenOnly: true});
  // -κλῆς names (Περικλῆς, Περικλέους) and αἰδώς, ἠχώ (οι-stems).
  for (const [e, c] of [['έους', 'gen-sg'], ['εῖ', 'dat-sg'], ['έα', 'acc-sg'], ['εις', 'voc-sg'], ['ῆος', 'gen-sg'], ['ῆι', 'dat-sg'], ['ῆα', 'acc-sg']]) literal(c, e, 'ῆς', NA);
  for (const [e, c] of [['οῦς', 'gen-sg'], ['οῖ', 'dat-sg'], ['ῶ', 'acc-sg'], ['όος', 'gen-sg']]) { literal(c, e, 'ώς', NA); literal(c, e, 'ώ', NA); }
  // ι-stems (πόλις, πόλεως) and υ-stems (πῆχυς, ἄστυ, ἰχθύς).
  const iStem = [['εως', 'gen-sg'], ['ιος', 'gen-sg'], ['ηος', 'gen-sg'], ['εος', 'gen-sg'], ['ει', 'dat-sg'], ['ι', 'dat-sg'], ['ηι', 'dat-sg'], ['ιν', 'acc-sg'], ['ηα', 'acc-sg'],
    ['ι', 'voc-sg'], ['εις', 'nom-pl'], ['ιες', 'nom-pl'], ['ηες', 'nom-pl'], ['εων', 'gen-pl'], ['ιων', 'gen-pl'], ['εσι', 'dat-pl'], ['εσιν', 'dat-pl'],
    ['ισι', 'dat-pl'], ['ισιν', 'dat-pl'], ['εις', 'acc-pl'], ['ιας', 'acc-pl'], ['ηας', 'acc-pl'], ['ει', 'nav-du'], ['εοιν', 'gd-du'],
    ['εϊ', 'dat-sg'], ['ηϊ', 'dat-sg'], ['εες', 'nom-pl'], ['εε', 'nav-du'], ['ιος', 'gen-sg']];
  for (const [e, c] of iStem) nominalBoth(c, e, 'ις');
  const uStem = [['εως', 'gen-sg'], ['υος', 'gen-sg'], ['εος', 'gen-sg'], ['ει', 'dat-sg'], ['υι', 'dat-sg'], ['υν', 'acc-sg'], ['εις', 'nom-pl'], ['υες', 'nom-pl'], ['εες', 'nom-pl'], ['εας', 'acc-pl'],
    ['εων', 'gen-pl'], ['υων', 'gen-pl'], ['εσι', 'dat-pl'], ['εσιν', 'dat-pl'], ['υσι', 'dat-pl'], ['υσιν', 'dat-pl'], ['εις', 'acc-pl'], ['υας', 'acc-pl'], ['υς', 'acc-pl'], ['ει', 'nav-du']];
  for (const [e, c] of uStem) nominalBoth(c, e, 'υς');
  for (const [e, c] of [['εως', 'gen-sg'], ['εος', 'gen-sg'], ['ει', 'dat-sg'], ['η', 'na-pl'], ['εα', 'na-pl'], ['εων', 'gen-pl'], ['εσι', 'dat-pl'], ['εσιν', 'dat-pl']]) nominalBoth(c, e, 'υ');
  // ευ-stems (βασιλεύς, ἱερεύς): always accented on the ending; Epic and Ionic -ῆος, -ῆα, -έος.
  const euStem = [['έως', 'gen-sg'], ['ῆος', 'gen-sg'], ['έος', 'gen-sg'], ['εῖ', 'dat-sg'], ['ῆι', 'dat-sg'], ['ῆϊ', 'dat-sg'], ['έϊ', 'dat-sg'], ['έα', 'acc-sg'], ['ῆα', 'acc-sg'],
    ['εῦ', 'voc-sg'], ['ῆς', 'nom-pl'], ['εῖς', 'nom-pl'], ['ῆες', 'nom-pl'], ['έες', 'nom-pl'], ['έων', 'gen-pl'], ['ήων', 'gen-pl'], ['εῦσι', 'dat-pl'], ['εῦσιν', 'dat-pl'],
    ['ήεσσι', 'dat-pl'], ['ήεσσιν', 'dat-pl'], ['έας', 'acc-pl'], ['εῖς', 'acc-pl'], ['ῆας', 'acc-pl'], ['ῆ', 'nav-du']];
  for (const [e, c] of euStem) literal(c, e, 'εύς', NA);
  // ως-stems (ἥρως, ἥρωος) and ω-stems.
  for (const [e, c] of [['ωος', 'gen-sg'], ['ωι', 'dat-sg'], ['ωα', 'acc-sg'], ['ωες', 'nom-pl'], ['ωων', 'gen-pl'], ['ωσι', 'dat-pl'], ['ωσιν', 'dat-pl'], ['ωας', 'acc-pl']]) nominalBoth(c, e, 'ως');

  // Adjectives: feminine and neuter to the masculine dictionary form.
  transform('feminine', 'feminine', 'Feminine of an adjective, pronoun or participle: -η, -α, -εια, -εσσα, -ασα, -ουσα → masculine -ος, -υς, -εις, -ας, -ων.');
  transform('neuter', 'neuter', 'Neuter of an adjective or pronoun: -ον, -ες, -υ, -εν, -αν, -ο → masculine -ος, -ης, -υς, -εις, -ας, -ων.');
  const fem = [['η', 'ος'], ['α', 'ος'], ['εια', 'υς'], ['εσσα', 'εις'], ['ασα', 'ας'], ['αινα', 'ας'], ['ουσα', 'ων'], ['ουσα', 'ους'], ['υια', 'ως'], ['ις', 'ης'], ['αινα', 'ων'], ['ειρα', 'ηρ'], ['ειρα', 'ων'], ['τρια', 'τηρ'], ['τρια', 'τωρ'], ['τις', 'της'], ['ισσα', 'ιξ'], ['εα', 'υς'], ['εη', 'υς']];
  // Feminine: the text as written, or a first-declension form the case rules read (condition fem).
  for (const [e, l] of fem) nominal('feminine', e, l, ADJ, {cin: ['fem']});
  for (const [e, l] of [['ή', 'ός'], ['ά', 'ός'], ['εῖα', 'ύς'], ['ῆ', 'οῦς'], ['ᾶ', 'οῦς']]) suffix('feminine', e, l, ['fem'], ADJ);
  const neut = [['ον', 'ος'], ['ες', 'ης'], ['υ', 'υς'], ['εν', 'εις'], ['αν', 'ας'], ['ον', 'ων'], ['ο', 'ος'], ['αν', 'αινος'], ['ουν', 'ους']];
  // Neuter: the text as written, or a neuter plural the case rules read (condition neu).
  for (const [e, l] of neut) nominal('neuter', e, l, ADJ, {cin: ['neu']});
  for (const [e, l] of [['όν', 'ός'], ['ές', 'ής'], ['ύ', 'ύς'], ['οῦν', 'οῦς']]) suffix('neuter', e, l, ['neu'], ADJ);

  // Comparison: -τερος, -τατος; -ίων, -ιστος (compared adjectives decline as above first).
  transform('comparative', 'comparative', 'Comparative of an adjective: -ότερος, -ώτερος, -έστερος, -ίων → positive.');
  transform('superlative', 'superlative', 'Superlative of an adjective: -ότατος, -ώτατος, -έστατος, -ιστος → positive.');
  const cmp = [
    ['οτερος', 'ος'], ['ωτερος', 'ος'], ['εστερος', 'ης'], ['εστερος', 'ων'], ['ονεστερος', 'ων'], ['υτερος', 'υς'], ['αιτερος', 'αιος'], ['ιστερος', 'ις'], ['εστερος', 'ους'], ['ουστερος', 'ους'],
    ['αντερος', 'ας'], ['εντερος', 'εις'], ['ιων', 'υς'], ['ιων', 'ος'], ['ιων', 'ης'], ['εστερος', 'ος'],
  ];
  for (const [e, l] of cmp) suffix('comparative', e, l, ['adj'], ADJ, {then: THEN_STRIP_ACCENTS});
  // -όεις, -ήεις, -ίεις (χαρίεις, χαριέστερος): the accent stays on the vowel before -εις.
  for (const v of ['ι', 'η', 'ο']) {
    suffix('comparative', `${v}εστερος`, `${acute(v)}εις`, ['adj'], ADJ, {writtenOnly: true});
    suffix('superlative', `${v}εστατος`, `${acute(v)}εις`, ['adj'], ADJ, {writtenOnly: true});
  }
  for (const [e, l] of cmp) {
    const sup = e === 'ιων' ? 'ιστος' : e.replace('τερος', 'τατος');
    suffix('superlative', sup, l, ['adj'], ADJ, {then: THEN_STRIP_ACCENTS});
  }
  // Plural-only adjectives and numerals in -οι (χίλιοι, τριακόσιοι, τρισχίλιοι).
  transform('plural-lemma', 'plural', 'A form of a word listed in the plural (χίλιοι, τριακόσιοι, μύριοι): -ων, -οις, -ους, -αι, -ας, -α → -οι.');
  // On the text without accents: the stem is written with the lemma's accent (χιλίων → χίλιοι, τριακοσίων → τριακόσιοι).
  for (const [stem, lemmaStem] of [['χιλι', 'χίλι'], ['μυρι', 'μύρι'], ['κοσι', 'κόσι']]) {
    for (const e of ['ων', 'οις', 'ους', 'αι', 'ας', 'α', 'αις', 'οισι', 'οισιν', 'ῃσι']) suffix('plural-lemma', stem + e, lemmaStem + 'οι', [], ['adj', 'n'], {writtenOnly: true});
  }
  // Adverbs: -ως from the genitive plural (σοφῶς, δικαίως, ἀληθῶς, ταχέως, εὐδαιμόνως).
  transform('adverb', 'adverb', 'Adverb of manner in -ως made from an adjective (σοφῶς, δικαίως, ἀληθῶς, ταχέως); comparative adverb in -τερον, superlative in -τατα.');
  for (const [e, l] of [['ως', 'ος'], ['ως', 'ης'], ['ονως', 'ων'], ['εως', 'υς'], ['οντως', 'ων'], ['αντως', 'ας'], ['εντως', 'εις'], ['ουντως', 'ων']]) nominal('adverb', e, l, ADJ);
  for (const [e, l] of [['ῶς', 'ός'], ['ῶς', 'ής'], ['έως', 'ύς']]) literal('adverb', e, l, ADJ);
  for (const [e, l] of [['οτερον', 'ος'], ['ωτερον', 'ος'], ['οτατα', 'ος'], ['ωτατα', 'ος'], ['εστερον', 'ης'], ['εστατα', 'ης'], ['ιον', 'υς'], ['ιστα', 'υς'], ['ιον', 'ος'], ['ιστα', 'ος']]) suffix('adverb', e, l, [], ADJ, {then: THEN_STRIP_ACCENTS});
}


// ==== Verbs

const PERSONS = {
  '1sg': '1st singular', '2sg': '2nd singular', '3sg': '3rd singular', '1pl': '1st plural', '2pl': '2nd plural',
  '3pl': '3rd plural', '2du': '2nd dual', '3du': '3rd dual', '23du': '2nd/3rd dual',
};

function verbTransform(id, name, description) {
  return transform(id, name, description);
}

/**
 * A verb ending to the dictionary form's, with the recessive accent kept or left to the accent transform; `ultima`
 * is the last syllable's length where the letters leave it open (-αι, -οι are long only in the optative).
 */
function verbEnding(id, ending, lemma, conditionsOut, opts = {}) {
  const written = NFC(ending);
  const so = opts.stem ? {stem: opts.stem} : {};
  if (hasAccent(written)) {
    // Written with its accent (λαβεῖν, λυθείς): no accent is left on the stem.
    suffix(id, written, stripAccents(lemma), [], conditionsOut, so);
    return;
  }
  const e = written;
  const l = stripAccents(lemma);
  const k = nuclei(e).length;
  let ult = opts.ultima ?? ultimaLength(e);
  if (ult === 'either' || ult === 'none') ult = 'short';
  // Where the recessive accent falls, counted from the end of the stem (0: its last nucleus, as in the dictionary form).
  const fromStemEnd = (ult === 'long' ? 1 : 2) - k;
  if (fromStemEnd < 0) {
    // On the ending (λυόμεθα, λυσάντων): written with it; the twins read the text without accents.
    suffix(id, recessive(e, ult), l, [], conditionsOut, so);
  } else {
    // On the stem: kept. One short syllable after a long stem vowel gives a circumflex (λῦε, λῦσαι), the dictionary form an acute.
    const circ = k === 1 && ult === 'short';
    suffix(id, e, l, [], conditionsOut, circ ? {...so, then: THEN_CIRC_TO_ACUTE} : so);
    // Further back on a longer stem (κέλευε, ἐκέλευον): dropped, and the accent transform accents the dictionary form.
    if (fromStemEnd > 0) suffix(id, e, l, [], conditionsOut, {...so, then: THEN_STRIP_ACCENTS, writtenOnly: true});
  }
}

const OUT_PRIM = ['v', 'fut'];
const OUT_SUBJ = ['v', 'aor', 'aor2', 'pf'];
const OUT_OPT = ['v', 'fut', 'aor2', 'pf'];
const OUT_IMP = ['v', 'aor2'];
const OUT_INF = ['v', 'fut'];
const OUT_PTC = ['v', 'fut', 'aor2'];
const OUT_SEC = ['aug', 'aor2a'];

/** One ending set: [ending, person key, options]. Middle sets give both -ω and -ομαι dictionary forms. */
function endingSet(prefixId, label, endings, conditionsOut, voice, opts = {}) {
  for (const [ending, person, eopts] of endings) {
    const id = `${prefixId}-${person}`;
    verbTransform(id, `${label} ${PERSONS[person] ?? person}`, opts.description ?? `${label}, ${PERSONS[person] ?? person}.`);
    const lemmas = voice === 'mid' ? (opts.lemmas ?? ['ομαι', 'ω']) : (opts.lemmas ?? ['ω']);
    for (const lemma of lemmas) verbEnding(id, ending, lemma, conditionsOut, {...opts, ...(eopts ?? {})});
  }
}

const L = (s) => 'long';

function thematicEndings() {
  // Present and future indicative active (the future through the future stem rules).
  endingSet('ind-act', 'indicative active', [
    ['εις', '2sg'], ['ει', '3sg', {ultima: 'long'}], ['ομεν', '1pl'], ['ετε', '2pl'], ['ουσι', '3pl'], ['ουσιν', '3pl'], ['ετον', '23du'],
    ['οντι', '3pl'], ['εισθα', '2sg'],
  ], OUT_PRIM, 'act');
  // Imperfect and second aorist indicative active, with an augment.
  endingSet('ind-act', 'indicative active', [
    ['ον', '1sg'], ['ες', '2sg'], ['ε', '3sg'], ['εν', '3sg'], ['ομεν', '1pl'], ['ετε', '2pl'], ['ον', '3pl'], ['ετον', '2du'], ['ετην', '3du'],
    ['οσαν', '3pl'], ['εσκον', '1sg'], ['εσκε', '3sg'], ['εσκεν', '3sg'],
  ], OUT_SEC, 'act');
  endingSet('subj-act', 'subjunctive active', [
    ['ῃς', '2sg'], ['ῃ', '3sg'], ['ωμεν', '1pl'], ['ητε', '2pl'], ['ωσι', '3pl'], ['ωσιν', '3pl'], ['ητον', '23du'],
    ['ωμι', '1sg'], ['ῃσθα', '2sg'], ['ῃσι', '3sg'], ['ῃσιν', '3sg'],
  ], OUT_SUBJ, 'act');
  endingSet('opt-act', 'optative active', [
    ['οιμι', '1sg'], ['οις', '2sg'], ['οι', '3sg', {ultima: 'long'}], ['οιμεν', '1pl'], ['οιτε', '2pl'], ['οιεν', '3pl'], ['οιτον', '2du'], ['οιτην', '3du'],
  ], OUT_OPT, 'act');
  endingSet('imp-act', 'imperative active', [
    ['ε', '2sg'], ['ετω', '3sg'], ['ετε', '2pl'], ['οντων', '3pl'], ['ετωσαν', '3pl'], ['ετον', '2du'], ['ετων', '3du'],
  ], OUT_IMP, 'act');
  verbTransform('inf-act', 'infinitive active', 'Infinitive active: -ειν; Epic -εμεν, -εμεναι; Doric -εν.');
  for (const e of ['ειν', 'εμεν', 'εμεναι', 'εν', 'ην']) verbEnding('inf-act', e, 'ω', OUT_INF);
  for (const e of ['εῖν', 'έειν', 'έμεν', 'έμεναι']) verbEnding('inf-act', e, 'ω', ['aor2']);

  // Middle and passive.
  endingSet('ind-mid', 'indicative middle/passive', [
    ['ομαι', '1sg', {ultima: 'short'}], ['ῃ', '2sg'], ['ει', '2sg', {ultima: 'long'}], ['εαι', '2sg', {ultima: 'short'}], ['εται', '3sg', {ultima: 'short'}],
    ['ομεθα', '1pl'], ['ομεσθα', '1pl'], ['εσθε', '2pl'], ['ονται', '3pl', {ultima: 'short'}], ['εσθον', '23du'], ['αται', '3pl', {ultima: 'short'}],
  ], OUT_PRIM, 'mid');
  endingSet('ind-mid', 'indicative middle/passive', [
    ['ομην', '1sg'], ['ου', '2sg'], ['εο', '2sg'], ['ευ', '2sg'], ['ετο', '3sg'], ['ομεθα', '1pl'], ['εσθε', '2pl'], ['οντο', '3pl'],
    ['εσθον', '2du'], ['εσθην', '3du'], ['ατο', '3pl'], ['εσκετο', '3sg'], ['εσκοντο', '3pl'],
  ], OUT_SEC, 'mid');
  endingSet('subj-mid', 'subjunctive middle/passive', [
    ['ωμαι', '1sg', {ultima: 'short'}], ['ῃ', '2sg'], ['ηαι', '2sg', {ultima: 'short'}], ['ηται', '3sg', {ultima: 'short'}], ['ωμεθα', '1pl'],
    ['ησθε', '2pl'], ['ωνται', '3pl', {ultima: 'short'}], ['ησθον', '23du'],
  ], OUT_SUBJ, 'mid');
  endingSet('opt-mid', 'optative middle/passive', [
    ['οιμην', '1sg'], ['οιο', '2sg'], ['οιτο', '3sg'], ['οιμεθα', '1pl'], ['οισθε', '2pl'], ['οιντο', '3pl'], ['οιατο', '3pl'], ['οισθον', '2du'], ['οισθην', '3du'],
  ], OUT_OPT, 'mid');
  endingSet('imp-mid', 'imperative middle/passive', [
    ['ου', '2sg'], ['εο', '2sg'], ['ευ', '2sg'], ['εσθω', '3sg'], ['εσθε', '2pl'], ['εσθων', '3pl'], ['εσθωσαν', '3pl'], ['εσθον', '2du'],
  ], OUT_IMP, 'mid');
  verbTransform('inf-mid', 'infinitive middle/passive', 'Infinitive middle and passive: -εσθαι.');
  for (const lemma of ['ομαι', 'ω']) verbEnding('inf-mid', 'εσθαι', lemma, OUT_INF, {ultima: 'short'});
  for (const lemma of ['ομαι', 'ω']) verbEnding('inf-mid', 'έσθαι', lemma, ['aor2']);
}

const PTC_CASES = {
  'nom-sg': 'nominative singular', 'gen-sg': 'genitive singular', 'dat-sg': 'dative singular', 'acc-sg': 'accusative singular',
  'nom-pl': 'nominative plural', 'gen-pl': 'genitive plural', 'dat-pl': 'dative plural', 'acc-pl': 'accusative plural', 'du': 'dual',
};

/** Participle endings (masculine, feminine, neuter) to one dictionary form. */
function participle(prefixId, label, forms, lemmas, conditionsOut, opts = {}) {
  for (const [ending, kase, gender, ultima] of forms) {
    const id = `${prefixId}-${kase}${gender ? '-' + gender : ''}`;
    verbTransform(id, `${label}, ${PTC_CASES[kase]}${gender === 'f' ? ' feminine' : gender === 'n' ? ' neuter' : ''}`,
      `${label}, ${PTC_CASES[kase]}${gender === 'f' ? ' feminine' : gender === 'n' ? ' neuter' : ''}.`);
    const u = ultima ?? (/(αι|οι|α)$/u.test(stripAccents(ending)) ? 'short' : undefined);
    for (const lemma of lemmas) verbEnding(id, ending, lemma, conditionsOut, {...opts, ultima: u});
  }
}

const PTC_PRES_ACT = [
  ['ων', 'nom-sg'], ['οντος', 'gen-sg'], ['οντι', 'dat-sg'], ['οντα', 'acc-sg'], ['οντες', 'nom-pl'], ['οντων', 'gen-pl'], ['ουσι', 'dat-pl'], ['ουσιν', 'dat-pl'],
  ['οντας', 'acc-pl'], ['οντε', 'du'], ['οντοιν', 'du'], ['ουσα', 'nom-sg', 'f'], ['ουσης', 'gen-sg', 'f'], ['ουσῃ', 'dat-sg', 'f'], ['ουσαν', 'acc-sg', 'f'],
  ['ουσαι', 'nom-pl', 'f'], ['ουσῶν', 'gen-pl', 'f'], ['ουσαις', 'dat-pl', 'f'], ['ουσας', 'acc-pl', 'f', 'long'], ['ον', 'nom-sg', 'n'], ['οντα', 'nom-pl', 'n'],
  ['οντεσσι', 'dat-pl'], ['οντεσσιν', 'dat-pl'],
];

const MENOS = (stem) => [
  [`${stem}ος`, 'nom-sg'], [`${stem}ου`, 'gen-sg'], [`${stem}οιο`, 'gen-sg'], [`${stem}ῳ`, 'dat-sg'], [`${stem}ον`, 'acc-sg'], [`${stem}ε`, 'nom-sg'], [`${stem}οι`, 'nom-pl'],
  [`${stem}ων`, 'gen-pl'], [`${stem}οις`, 'dat-pl'], [`${stem}οισι`, 'dat-pl'], [`${stem}οισιν`, 'dat-pl'], [`${stem}ους`, 'acc-pl'], [`${stem}ω`, 'du'], [`${stem}οιν`, 'du'],
  [`${stem}η`, 'nom-sg', 'f'], [`${stem}ης`, 'gen-sg', 'f'], [`${stem}ῃ`, 'dat-sg', 'f'], [`${stem}ην`, 'acc-sg', 'f'], [`${stem}αι`, 'nom-pl', 'f'],
  [`${stem}αις`, 'dat-pl', 'f'], [`${stem}ῃσι`, 'dat-pl', 'f'], [`${stem}ῃσιν`, 'dat-pl', 'f'], [`${stem}ας`, 'acc-pl', 'f', 'long'],
  [`${stem}ον`, 'nom-sg', 'n'], [`${stem}α`, 'nom-pl', 'n'],
];

function participles() {
  // Present, future and second aorist active (λύων, λύσων, λαβών).
  participle('ptc-act', 'active participle', PTC_PRES_ACT, ['ω'], OUT_PTC);
  participle('ptc-act', 'active participle', [
    ['ών', 'nom-sg'], ['όντος', 'gen-sg'], ['όντι', 'dat-sg'], ['όντα', 'acc-sg'], ['όντες', 'nom-pl'], ['όντων', 'gen-pl'], ['οῦσι', 'dat-pl'], ['οῦσιν', 'dat-pl'],
    ['όντας', 'acc-pl'], ['οῦσα', 'nom-sg', 'f'], ['ούσης', 'gen-sg', 'f'], ['ούσῃ', 'dat-sg', 'f'], ['οῦσαν', 'acc-sg', 'f'], ['οῦσαι', 'nom-pl', 'f'],
    ['ουσῶν', 'gen-pl', 'f'], ['ούσαις', 'dat-pl', 'f'], ['ούσας', 'acc-pl', 'f'], ['όν', 'nom-sg', 'n'], ['όντε', 'du'], ['όντοιν', 'du'], ['όντεσσι', 'dat-pl'], ['όντεσσιν', 'dat-pl'],
  ], ['ω'], ['aor2']);
  // Present, future and second aorist middle/passive (λυόμενος, λυσόμενος, λαβόμενος).
  participle('ptc-mid', 'middle/passive participle', MENOS('ομεν'), ['ομαι', 'ω'], OUT_PTC);
  // First aorist active and middle (λύσας, λυσάμενος), on the σ-stem.
  participle('ptc-act', 'active participle', [
    ['ας', 'nom-sg'], ['αντος', 'gen-sg'], ['αντι', 'dat-sg'], ['αντα', 'acc-sg'], ['αντες', 'nom-pl'], ['αντων', 'gen-pl'], ['ασι', 'dat-pl'], ['ασιν', 'dat-pl'],
    ['αντας', 'acc-pl'], ['αντε', 'du'], ['ασα', 'nom-sg', 'f'], ['ασης', 'gen-sg', 'f'], ['ασῃ', 'dat-sg', 'f'], ['ασαν', 'acc-sg', 'f'], ['ασαι', 'nom-pl', 'f'],
    ['ασῶν', 'gen-pl', 'f'], ['ασαις', 'dat-pl', 'f'], ['ασας', 'acc-pl', 'f', 'long'], ['αν', 'nom-sg', 'n'], ['αντα', 'nom-pl', 'n'],
  ], ['ω'], ['aor']);
  participle('ptc-mid', 'middle/passive participle', MENOS('αμεν'), ['ομαι', 'ω'], ['aor']);
  // Aorist passive (λυθείς, γραφείς), on the passive stem.
  participle('ptc-pass', 'aorist passive participle', [
    ['είς', 'nom-sg'], ['έντος', 'gen-sg'], ['έντι', 'dat-sg'], ['έντα', 'acc-sg'], ['έντες', 'nom-pl'], ['έντων', 'gen-pl'], ['εῖσι', 'dat-pl'], ['εῖσιν', 'dat-pl'],
    ['έντας', 'acc-pl'], ['έντε', 'du'], ['εῖσα', 'nom-sg', 'f'], ['είσης', 'gen-sg', 'f'], ['είσῃ', 'dat-sg', 'f'], ['εῖσαν', 'acc-sg', 'f'], ['εῖσαι', 'nom-pl', 'f'],
    ['εισῶν', 'gen-pl', 'f'], ['είσαις', 'dat-pl', 'f'], ['είσας', 'acc-pl', 'f'], ['έν', 'nom-sg', 'n'], ['έντα', 'nom-pl', 'n'],
  ], ['ω'], ['aorp']);
  // Perfect active (λελυκώς, λελυκυῖα, λελυκός), on the perfect stem.
  participle('ptc-pf', 'perfect active participle', [
    ['ώς', 'nom-sg'], ['ότος', 'gen-sg'], ['ότι', 'dat-sg'], ['ότα', 'acc-sg'], ['ότες', 'nom-pl'], ['ότων', 'gen-pl'], ['όσι', 'dat-pl'], ['όσιν', 'dat-pl'],
    ['ότας', 'acc-pl'], ['υῖα', 'nom-sg', 'f'], ['υίας', 'gen-sg', 'f'], ['υίᾳ', 'dat-sg', 'f'], ['υῖαν', 'acc-sg', 'f'], ['υῖαι', 'nom-pl', 'f'], ['υιῶν', 'gen-pl', 'f'],
    ['υίαις', 'dat-pl', 'f'], ['υίας', 'acc-pl', 'f'], ['ός', 'nom-sg', 'n'], ['ότα', 'nom-pl', 'n'],
    ['ῶτος', 'gen-sg'], ['ῶτι', 'dat-sg'], ['ῶτα', 'acc-sg'], ['ῶτες', 'nom-pl'], ['ώτων', 'gen-pl'], ['ηυῖα', 'nom-sg', 'f'], ['ῶσι', 'dat-pl'], ['ῶτας', 'acc-pl'],
    ['ῶσα', 'nom-sg', 'f'], ['ώσης', 'gen-sg', 'f'], ['ώσῃ', 'dat-sg', 'f'], ['ῶσαν', 'acc-sg', 'f'], ['ῶσαι', 'nom-pl', 'f'], ['ώσας', 'acc-pl', 'f'], ['ός', 'nom-sg', 'n'],
  ], ['ω'], ['pf']);
}

// Aorist, perfect and pluperfect endings on their tense stems.
function tenseEndings() {
  endingSet('ind-act', 'indicative active', [
    ['α', '1sg', {ultima: 'short'}], ['ας', '2sg', {ultima: 'short'}], ['ε', '3sg'], ['εν', '3sg'], ['αμεν', '1pl'], ['ατε', '2pl'], ['ατον', '23du'],
  ], ['aora', 'pf'], 'act');
  endingSet('ind-act', 'indicative active', [['αν', '3pl', {ultima: 'short'}], ['ατην', '3du']], ['aora'], 'act');
  endingSet('ind-act', 'indicative active', [['ασι', '3pl'], ['ασιν', '3pl'], ['ᾱσι', '3pl']], ['pf'], 'act');
  endingSet('opt-act', 'optative active', [
    ['αιμι', '1sg'], ['αις', '2sg'], ['αι', '3sg', {ultima: 'long'}], ['αιμεν', '1pl'], ['αιτε', '2pl'], ['αιεν', '3pl'], ['ειας', '2sg'], ['ειε', '3sg'], ['ειεν', '3sg'], ['ειαν', '3pl'],
  ], ['aor'], 'act');
  endingSet('imp-act', 'imperative active', [['ον', '2sg'], ['ατω', '3sg'], ['ατε', '2pl'], ['αντων', '3pl'], ['ατον', '2du']], ['aor'], 'act');
  verbTransform('inf-act', 'infinitive active', 'Infinitive active.');
  verbEnding('inf-act', 'αι', 'ω', ['aor'], {ultima: 'short'});
  verbEnding('inf-act', 'έναι', 'ω', ['pf']);
  endingSet('ind-mid', 'indicative middle', [
    ['αμην', '1sg'], ['ω', '2sg'], ['ατο', '3sg'], ['αμεθα', '1pl'], ['ασθε', '2pl'], ['αντο', '3pl'], ['ασθον', '2du'], ['ασθην', '3du'],
  ], ['aora'], 'mid');
  endingSet('opt-mid', 'optative middle', [['αιμην', '1sg'], ['αιο', '2sg'], ['αιτο', '3sg'], ['αιμεθα', '1pl'], ['αισθε', '2pl'], ['αιντο', '3pl']], ['aor'], 'mid');
  endingSet('imp-mid', 'imperative middle', [['αι', '2sg', {ultima: 'short'}], ['ασθω', '3sg'], ['ασθε', '2pl'], ['ασθων', '3pl']], ['aor'], 'mid');
  verbTransform('inf-mid', 'infinitive middle/passive', 'Infinitive middle and passive.');
  for (const lemma of ['ομαι', 'ω']) verbEnding('inf-mid', 'ασθαι', lemma, ['aor'], {ultima: 'short'});
  // Aorist passive (ἐλύθην, ἐγράφην) on the passive stem.
  endingSet('ind-pass', 'indicative passive', [
    ['ην', '1sg'], ['ης', '2sg'], ['η', '3sg'], ['ημεν', '1pl'], ['ητε', '2pl'], ['ησαν', '3pl'], ['ητον', '2du'], ['ητην', '3du'], ['εν', '3pl'],
  ], ['aorpa'], 'act');
  endingSet('subj-pass', 'subjunctive passive', [
    ['ῶ', '1sg'], ['ῇς', '2sg'], ['ῇ', '3sg'], ['ῶμεν', '1pl'], ['ῆτε', '2pl'], ['ῶσι', '3pl'], ['ῶσιν', '3pl'],
  ], ['aorp'], 'act');
  endingSet('opt-pass', 'optative passive', [
    ['είην', '1sg'], ['είης', '2sg'], ['είη', '3sg'], ['εῖμεν', '1pl'], ['είημεν', '1pl'], ['εῖτε', '2pl'], ['εῖεν', '3pl'], ['είησαν', '3pl'],
  ], ['aorp'], 'act');
  endingSet('imp-pass', 'imperative passive', [['ητι', '2sg'], ['ηθι', '2sg'], ['ήτω', '3sg'], ['ητε', '2pl'], ['έντων', '3pl']], ['aorp'], 'act');
  verbTransform('inf-pass', 'infinitive passive', 'Aorist infinitive passive: -ῆναι.');
  verbEnding('inf-pass', 'ῆναι', 'ω', ['aorp']);
  verbEnding('inf-pass', 'ήμεναι', 'ω', ['aorp']);
  // Pluperfect active (ἐλελύκη, ἐλελύκειν).
  endingSet('ind-act', 'indicative active', [
    ['η', '1sg'], ['ειν', '1sg'], ['ης', '2sg'], ['εις', '2sg'], ['ει', '3sg', {ultima: 'long'}], ['ειν', '3sg'], ['εμεν', '1pl'], ['ετε', '2pl'], ['εσαν', '3pl'], ['εσαν', '3pl'],
  ], ['plpf'], 'act');
  // Perfect and pluperfect middle of vowel stems (λέλυμαι, ἐλελύμην; πεποίημαι).
  endingSet('ind-mid', 'indicative middle/passive', [
    ['μαι', '1sg', {ultima: 'short'}], ['σαι', '2sg', {ultima: 'short'}], ['ται', '3sg', {ultima: 'short'}], ['μεθα', '1pl'], ['σθε', '2pl'], ['νται', '3pl', {ultima: 'short'}], ['σθον', '23du'],
  ], ['pmp'], 'mid');
  endingSet('ind-mid', 'indicative middle/passive', [
    ['μην', '1sg'], ['σο', '2sg'], ['το', '3sg'], ['μεθα', '1pl'], ['σθε', '2pl'], ['ντο', '3pl'],
  ], ['plpm'], 'mid');
  for (const lemma of ['ομαι', 'ω']) verbEnding('inf-mid', 'σθαι', lemma, ['pmp'], {ultima: 'short'});
  participle('ptc-pfm', 'perfect middle/passive participle', MENOS('μέν').map(([e, c, g]) => [e, c, g]), ['ομαι', 'ω'], ['pmp']);
  // Perfect middle of consonant stems: the ending merges with the stem's consonant (γέγραμμαι, γέγραψαι, γέγραπται).
  const merged = [
    // [ending, person, consonants of the present stem]
    ...['μμαι:1sg', 'ψαι:2sg', 'πται:3sg', 'μμεθα:1pl', 'φθε:2pl', 'μμην:1sg:plpm', 'ψο:2sg:plpm', 'πτο:3sg:plpm'].map((x) => [x, ['π', 'β', 'φ', 'πτ', 'μπ']]),
    ...['γμαι:1sg', 'ξαι:2sg', 'κται:3sg', 'γμεθα:1pl', 'χθε:2pl', 'γμην:1sg:plpm', 'ξο:2sg:plpm', 'κτο:3sg:plpm'].map((x) => [x, ['κ', 'γ', 'χ', 'ττ', 'σσ', 'γγ']]),
    ...['σμαι:1sg', 'σαι:2sg', 'σται:3sg', 'σμεθα:1pl', 'σθε:2pl', 'σμην:1sg:plpm', 'σο:2sg:plpm', 'στο:3sg:plpm'].map((x) => [x, ['θ', 'δ', 'ζ', 'τ', '']]),
    ...['λμαι:1sg', 'λσαι:2sg', 'λται:3sg', 'λμεθα:1pl', 'λθε:2pl', 'λμην:1sg:plpm', 'λτο:3sg:plpm'].map((x) => [x, ['λλ', 'λ']]),
    ...['ρμαι:1sg', 'ρσαι:2sg', 'ρται:3sg', 'ρμεθα:1pl', 'ρθε:2pl', 'ρμην:1sg:plpm', 'ρτο:3sg:plpm'].map((x) => [x, ['ρ']]),
  ];
  for (const [spec, cons] of merged) {
    const [ending, person, tense] = spec.split(':');
    const id = `ind-mid-${person}`;
    verbTransform(id, `indicative middle/passive ${PERSONS[person]}`, `indicative middle/passive, ${PERSONS[person]}.`);
    for (const c of cons) for (const lemma of ['ομαι', 'ω']) {
      verbEnding(id, ending, c + lemma, [tense === 'plpm' ? 'augred' : 'red'], {ultima: /(αι)$/u.test(ending) ? 'short' : undefined});
    }
  }
  for (const [ending, cons] of [['φθαι', ['π', 'β', 'φ', 'πτ', 'μπ']], ['χθαι', ['κ', 'γ', 'χ', 'ττ', 'σσ', 'γγ']], ['σθαι', ['θ', 'δ', 'ζ', 'τ']], ['λθαι', ['λλ', 'λ']], ['ρθαι', ['ρ']]]) {
    for (const c of cons) for (const lemma of ['ομαι', 'ω']) verbEnding('inf-mid', ending, c + lemma, ['red'], {ultima: 'short'});
  }
  for (const [stem, cons, deponent] of [['μμέν', ['π', 'β', 'φ', 'πτ', 'μπ'], false], ['γμέν', ['κ', 'γ', 'χ', 'ττ', 'σσ'], true], ['σμέν', ['θ', 'δ', 'ζ', ''], true], ['λμέν', ['λλ'], false], ['ρμέν', ['ρ'], false]]) {
    participle('ptc-pfm', 'perfect middle/passive participle', MENOS(stem), cons.flatMap((c) => deponent ? [c + 'ω', c + 'ομαι'] : [c + 'ω']), ['red']);
  }
}

/** Contract verbs: -έω, -άω, -όω, written contracted (Attic) or open (Ionic and Epic, which the thematic rules read). */
function contractEndings() {
  const sets = {
    'έω': {
      ind: [['ῶ', '1sg'], ['εῖς', '2sg'], ['εῖ', '3sg'], ['οῦμεν', '1pl'], ['εῖτε', '2pl'], ['οῦσι', '3pl'], ['οῦσιν', '3pl'], ['εῦσι', '3pl'], ['εῦμεν', '1pl'], ['εῖτον', '23du']],
      sec: [['ουν', '1sg'], ['εις', '2sg'], ['ει', '3sg'], ['οῦμεν', '1pl'], ['εῖτε', '2pl'], ['ουν', '3pl'], ['ευν', '1sg'], ['εῦμεν', '1pl'], ['εῖτον', '2du'], ['είτην', '3du']],
      subj: [['ῇς', '2sg'], ['ῇ', '3sg'], ['ῶμεν', '1pl'], ['ῆτε', '2pl'], ['ῶσι', '3pl'], ['ῶσιν', '3pl']],
      opt: [['οίην', '1sg'], ['οίης', '2sg'], ['οίη', '3sg'], ['οῖμι', '1sg'], ['οῖς', '2sg'], ['οῖ', '3sg'], ['οῖμεν', '1pl'], ['οῖτε', '2pl'], ['οῖεν', '3pl'], ['οίημεν', '1pl'], ['οίητε', '2pl'], ['οίησαν', '3pl']],
      imp: [['ει', '2sg'], ['είτω', '3sg'], ['εῖτε', '2pl'], ['ούντων', '3pl'], ['είτωσαν', '3pl']],
      inf: [['εῖν', ''], ['ήμεναι', '']],
      ptc: [['ῶν', 'nom-sg'], ['οῦντος', 'gen-sg'], ['οῦντι', 'dat-sg'], ['οῦντα', 'acc-sg'], ['οῦντες', 'nom-pl'], ['ούντων', 'gen-pl'], ['οῦσι', 'dat-pl'], ['οῦσιν', 'dat-pl'],
        ['οῦντας', 'acc-pl'], ['οῦσα', 'nom-sg', 'f'], ['ούσης', 'gen-sg', 'f'], ['ούσῃ', 'dat-sg', 'f'], ['οῦσαν', 'acc-sg', 'f'], ['οῦσαι', 'nom-pl', 'f'], ['ουσῶν', 'gen-pl', 'f'],
        ['ούσαις', 'dat-pl', 'f'], ['ούσας', 'acc-pl', 'f'], ['οῦν', 'nom-sg', 'n'], ['οῦντα', 'nom-pl', 'n'], ['εῦντες', 'nom-pl'], ['εῦντας', 'acc-pl'], ['εῦσα', 'nom-sg', 'f'], ['εῦσι', 'dat-pl'], ['εύντων', 'gen-pl']],
      mid: [['οῦμαι', '1sg'], ['ῇ', '2sg'], ['εῖ', '2sg'], ['εῖται', '3sg'], ['ούμεθα', '1pl'], ['ούμεσθα', '1pl'], ['εῖσθε', '2pl'], ['οῦνται', '3pl'], ['εῦνται', '3pl'], ['εῦμαι', '1sg']],
      midsec: [['ούμην', '1sg'], ['οῦ', '2sg'], ['εῖτο', '3sg'], ['ούμεθα', '1pl'], ['εῖσθε', '2pl'], ['οῦντο', '3pl'], ['εῦντο', '3pl']],
      midsubj: [['ῶμαι', '1sg'], ['ῆται', '3sg'], ['ώμεθα', '1pl'], ['ῆσθε', '2pl'], ['ῶνται', '3pl']],
      midopt: [['οίμην', '1sg'], ['οῖο', '2sg'], ['οῖτο', '3sg'], ['οίμεθα', '1pl'], ['οῖσθε', '2pl'], ['οῖντο', '3pl']],
      midimp: [['οῦ', '2sg'], ['είσθω', '3sg'], ['εῖσθε', '2pl'], ['είσθων', '3pl']],
      midinf: 'εῖσθαι', midptc: 'ουμεν',
    },
    'άω': {
      ind: [['ῶ', '1sg'], ['ᾷς', '2sg'], ['ᾷ', '3sg'], ['ῶμεν', '1pl'], ['ᾶτε', '2pl'], ['ῶσι', '3pl'], ['ῶσιν', '3pl'], ['ᾶτον', '23du'],
        ['όω', '1sg'], ['άᾳς', '2sg'], ['άᾳ', '3sg'], ['όωσι', '3pl'], ['όωσιν', '3pl'], ['ῇς', '2sg'], ['ῇ', '3sg'], ['ῆτε', '2pl']],
      sec: [['ων', '1sg'], ['ας', '2sg'], ['α', '3sg'], ['ῶμεν', '1pl'], ['ᾶτε', '2pl'], ['ων', '3pl'], ['ᾶτον', '2du'], ['άτην', '3du'], ['η', '3sg'], ['ῆτε', '2pl']],
      subj: [['ᾷς', '2sg'], ['ᾷ', '3sg'], ['ῶμεν', '1pl'], ['ᾶτε', '2pl'], ['ῶσι', '3pl'], ['ῶσιν', '3pl']],
      opt: [['ῴην', '1sg'], ['ῴης', '2sg'], ['ῴη', '3sg'], ['ῷμι', '1sg'], ['ῷς', '2sg'], ['ῷ', '3sg'], ['ῷμεν', '1pl'], ['ῷτε', '2pl'], ['ῷεν', '3pl']],
      imp: [['α', '2sg'], ['άτω', '3sg'], ['ᾶτε', '2pl'], ['ώντων', '3pl']],
      inf: [['ᾶν', ''], ['ῆν', ''], ['ᾶν', '']],
      ptc: [['ῶν', 'nom-sg'], ['ῶντος', 'gen-sg'], ['ῶντι', 'dat-sg'], ['ῶντα', 'acc-sg'], ['ῶντες', 'nom-pl'], ['ώντων', 'gen-pl'], ['ῶσι', 'dat-pl'], ['ῶσιν', 'dat-pl'],
        ['ῶντας', 'acc-pl'], ['ῶσα', 'nom-sg', 'f'], ['ώσης', 'gen-sg', 'f'], ['ώσῃ', 'dat-sg', 'f'], ['ῶσαν', 'acc-sg', 'f'], ['ῶσαι', 'nom-pl', 'f'], ['ωσῶν', 'gen-pl', 'f'],
        ['ώσαις', 'dat-pl', 'f'], ['ώσας', 'acc-pl', 'f'], ['ῶν', 'nom-sg', 'n'], ['ῶντα', 'nom-pl', 'n'], ['όωντες', 'nom-pl'], ['όωντας', 'acc-pl'], ['όωσα', 'nom-sg', 'f'], ['όωντα', 'acc-sg'], ['όων', 'nom-sg'], ['όωντος', 'gen-sg'], ['όωσαι', 'nom-pl', 'f']],
      mid: [['ῶμαι', '1sg'], ['ᾷ', '2sg'], ['ᾶται', '3sg'], ['ώμεθα', '1pl'], ['ᾶσθε', '2pl'], ['ῶνται', '3pl'], ['ῆται', '3sg'], ['όωνται', '3pl'], ['όωμαι', '1sg']],
      midsec: [['ώμην', '1sg'], ['ῶ', '2sg'], ['ᾶτο', '3sg'], ['ώμεθα', '1pl'], ['ᾶσθε', '2pl'], ['ῶντο', '3pl'], ['ῆτο', '3sg'], ['όωντο', '3pl']],
      midsubj: [['ᾶται', '3sg']],
      midopt: [['ῴμην', '1sg'], ['ῷο', '2sg'], ['ῷτο', '3sg'], ['ῴμεθα', '1pl'], ['ῷσθε', '2pl'], ['ῷντο', '3pl']],
      midimp: [['ῶ', '2sg'], ['άσθω', '3sg'], ['ᾶσθε', '2pl'], ['άσθων', '3pl']],
      midinf: 'ᾶσθαι', midptc: 'ωμεν',
    },
    // -όω without the imperfect and imperative in -ου (ἐδήλου, δήλου): πολέμου, δικαίου showed πολεμόω, δικαιόω.
    'όω': {
      ind: [['ῶ', '1sg'], ['οῖς', '2sg'], ['οῖ', '3sg'], ['οῦμεν', '1pl'], ['οῦτε', '2pl'], ['οῦσι', '3pl'], ['οῦσιν', '3pl']],
      sec: [['ουν', '1sg'], ['ους', '2sg'], ['οῦμεν', '1pl'], ['οῦτε', '2pl'], ['ουν', '3pl']],
      subj: [['οῖς', '2sg'], ['οῖ', '3sg'], ['ῶμεν', '1pl'], ['ῶτε', '2pl'], ['ῶσι', '3pl'], ['ῶσιν', '3pl']],
      opt: [['οίην', '1sg'], ['οίης', '2sg'], ['οίη', '3sg'], ['οῖμεν', '1pl'], ['οῖτε', '2pl'], ['οῖεν', '3pl']],
      imp: [['ούτω', '3sg'], ['οῦτε', '2pl'], ['ούντων', '3pl']],
      inf: [['οῦν', '']],
      ptc: [['ῶν', 'nom-sg'], ['οῦντος', 'gen-sg'], ['οῦντι', 'dat-sg'], ['οῦντα', 'acc-sg'], ['οῦντες', 'nom-pl'], ['ούντων', 'gen-pl'], ['οῦσι', 'dat-pl'], ['οῦσιν', 'dat-pl'],
        ['οῦντας', 'acc-pl'], ['οῦσα', 'nom-sg', 'f'], ['ούσης', 'gen-sg', 'f'], ['ούσῃ', 'dat-sg', 'f'], ['οῦσαν', 'acc-sg', 'f'], ['οῦσαι', 'nom-pl', 'f'], ['ουσῶν', 'gen-pl', 'f'],
        ['ούσαις', 'dat-pl', 'f'], ['ούσας', 'acc-pl', 'f'], ['οῦν', 'nom-sg', 'n'], ['οῦντα', 'nom-pl', 'n']],
      mid: [['οῦμαι', '1sg'], ['οῖ', '2sg'], ['οῦται', '3sg'], ['ούμεθα', '1pl'], ['οῦσθε', '2pl'], ['οῦνται', '3pl']],
      midsec: [['ούμην', '1sg'], ['οῦ', '2sg'], ['οῦτο', '3sg'], ['ούμεθα', '1pl'], ['οῦσθε', '2pl'], ['οῦντο', '3pl']],
      midsubj: [['ῶμαι', '1sg'], ['ῶται', '3sg'], ['ῶνται', '3pl']],
      midopt: [['οίμην', '1sg'], ['οῖο', '2sg'], ['οῖτο', '3sg']],
      midimp: [['οῦ', '2sg'], ['ούσθω', '3sg'], ['οῦσθε', '2pl'], ['ούσθων', '3pl']],
      midinf: 'οῦσθαι', midptc: 'ουμεν',
    },
  };
  for (const [lemma, set] of Object.entries(sets)) {
    const mid = stripAccents(lemma).replace(/ω$/u, 'ομαι');
    const lemmasAct = [lemma];
    // -ομαι before -ω, as for thematic verbs (μηχανῶνται → μηχανάομαι before μηχανάω).
    const lemmasMid = [NFC(lemma.replace(/ω$/u, 'ομαι')), lemma];
    const emit = (prefixId, label, list, out, lemmas) => {
      for (const [e, person] of list) {
        const id = `${prefixId}-${person}`;
        verbTransform(id, `${label} ${PERSONS[person]}`, `${label}, ${PERSONS[person]}.`);
        for (const l of lemmas) contractRule(id, e, l, out);
      }
    };
    // Liquid and Attic futures conjugate like -έω (μενῶ, ἀγγελῶ, νομιῶ): the future stem rules read them.
    emit('ind-act', 'indicative active', set.ind, lemma === 'έω' ? ['v', 'fut'] : ['v'], lemmasAct);
    emit('ind-act', 'indicative active', set.sec, ['aug'], lemmasAct);
    emit('subj-act', 'subjunctive active', set.subj, ['v'], lemmasAct);
    emit('opt-act', 'optative active', set.opt, lemma === 'έω' ? ['v', 'fut'] : ['v'], lemmasAct);
    emit('imp-act', 'imperative active', set.imp, ['v'], lemmasAct);
    for (const [e] of set.inf) contractRule('inf-act', e, lemma, lemma === 'έω' ? ['v', 'fut'] : ['v']);
    for (const [e, kase, g] of set.ptc) {
      const id = `ptc-act-${kase}${g ? '-' + g : ''}`;
      verbTransform(id, `active participle, ${PTC_CASES[kase]}${g === 'f' ? ' feminine' : g === 'n' ? ' neuter' : ''}`, `active participle, ${PTC_CASES[kase]}.`);
      contractRule(id, e, lemma, lemma === 'έω' ? ['v', 'fut'] : ['v']);
    }
    emit('ind-mid', 'indicative middle/passive', set.mid, lemma === 'έω' ? ['v', 'fut'] : ['v'], lemmasMid);
    emit('ind-mid', 'indicative middle/passive', set.midsec, ['aug'], lemmasMid);
    emit('subj-mid', 'subjunctive middle/passive', set.midsubj, ['v'], lemmasMid);
    emit('opt-mid', 'optative middle/passive', set.midopt, ['v'], lemmasMid);
    emit('imp-mid', 'imperative middle/passive', set.midimp, ['v'], lemmasMid);
    for (const l of lemmasMid) contractRule('inf-mid', set.midinf, l, lemma === 'έω' ? ['v', 'fut'] : ['v']);
    // -ούμενος, -ώμενος: recessive on the ending; the accent transform puts the dictionary form's back.
    participle('ptc-mid', 'middle/passive participle', MENOS(set.midptc), lemmasMid.map(stripAccents), lemma === 'έω' ? ['v', 'fut'] : ['v']);
  }
}

/** A contracted ending: the dictionary form's accent is on its contract vowel, so any accent on the stem goes. */
function contractRule(id, ending, lemma, conditionsOut) {
  const e = NFC(ending);
  if (hasAccent(e)) {
    suffix(id, e, lemma, [], conditionsOut);
  } else {
    // ἐποίουν, ἐτίμων: the accent is on the stem; the dictionary form has it on the contract vowel.
    suffix(id, e, stripAccents(lemma), [], conditionsOut, {then: THEN_STRIP_ACCENTS});
  }
}

const BOTH = (x) => [x, x.replace(/ω$/u, 'ομαι')];

/** Tense stems to the present stem: [inflected end of the tense form, present ending(s)]. */
function stemRules() {
  verbTransform('future', 'future', 'Future: -σω, -ψω, -ξω, -ήσω, -ώσω, contracted -ῶ of liquid verbs → the present.');
  verbTransform('aorist', 'aorist', 'Aorist: the σ-stem (ἔλυσα, ἔπεμψα, ἔπραξα, ἐποίησα), the liquid stem (ἔμεινα, ἤγγειλα, ἔφηνα) and second aorists (ἔλαβον, ἦλθον) → the present.');
  verbTransform('aorist-passive', 'aorist passive', 'Aorist passive: -θην, -φθην, -χθην, -σθην, -ήθην, second aorist passive -ην → the present.');
  verbTransform('future-passive', 'future passive', 'Future passive: -θήσομαι, -ήσομαι → the aorist passive stem.');
  verbTransform('perfect', 'perfect', 'Perfect active: -κα, -ηκα, -φα, -χα and strong perfects → the present.');
  const sigma = [
    ['σω', ['ω']], ['ψω', ['πω', 'βω', 'φω', 'πτω']], ['ξω', ['κω', 'γω', 'χω', 'ττω', 'σσω', 'ζω']],
    ['σω', ['ζω', 'δω', 'θω', 'τω', 'ττω', 'σσω']], ['ησω', ['αω', 'εω']], ['ασω', ['αω']], ['ωσω', ['οω']], ['εσω', ['εω']], ['υσω', ['υω']],
    ['ισω', ['ιζω']], ['ασω', ['αζω']], ['ευσω', ['εω']], ['αυσω', ['αιω']],
    // Epic doubles the σ after a short vowel (ἐτέλεσσε, κάλεσσε, ὀπάσσας, ἀκοντίσσαντος).
    ['σσω', ['ω', 'εω', 'αω', 'ζω', 'δω', 'θω', 'ννυμι']],
    // -νυμι verbs: δείξω, ζεύξω, πήξω, ῥήξω; κεράσω, σβέσω, ἕσω, ζώσω, στρώσω.
    ['ξω', ['κνυμι', 'γνυμι']], ['σω', ['ννυμι']],
  ];
  const sigmaNoV = [['σω', ['ω']]];
  for (const [i, outs] of sigma) {
    for (const o of outs) {
      for (const [ii, oo] of [[i, o], [i.replace(/ω$/u, 'ομαι'), o.replace(/ω$/u, 'ομαι')], [i.replace(/ω$/u, 'ομαι'), o]]) {
        const contract = /^(εω|αω|οω)$/u.test(o.replace(/ομαι$/u, 'ω'));
        const opts = contract ? {then: THEN_STRIP_ACCENTS} : {then: THEN_CIRC_TO_ACUTE};
        suffix('future', ii, oo, ['fut'], ['v'], opts);
        suffix('aorist', ii, oo, ['aor'], ['v'], opts);
        suffix('aorist', ii, oo, ['aora'], ['aug'], opts);
      }
    }
  }
  // Liquid futures, contracted like -έω (μενῶ, ἀγγελῶ, φανῶ, κτενῶ, ἀρῶ, σπερῶ), and the Attic future in -ιῶ.
  const liquidFut = [['λεω', 'λλω'], ['λεω', 'λω'], ['νεω', 'νω'], ['ανεω', 'αινω'], ['ενεω', 'εινω'], ['ινεω', 'ινω'], ['υνεω', 'υνω'], ['αρεω', 'αιρω'], ['ερεω', 'ειρω'], ['ρεω', 'ρω'], ['ιεω', 'ιζω'], ['μεω', 'μνω'], ['εεω', 'εω']];
  for (const [i, o] of liquidFut) {
    suffix('future', i, o, ['fut'], ['v'], {then: THEN_STRIP_ACCENTS});
    suffix('future', i.replace(/ω$/u, 'ομαι'), o.replace(/ω$/u, 'ομαι'), ['fut'], ['v'], {then: THEN_STRIP_ACCENTS});
    suffix('future', i.replace(/ω$/u, 'ομαι'), o, ['fut'], ['v'], {then: THEN_STRIP_ACCENTS});
  }
  // Liquid aorists (ἔμεινα, ἤγγειλα, ἔφηνα, ἔκρινα, ἔσπειρα, ἔκτεινα).
  const liquidAor = [['ειλω', 'ελλω'], ['ειλω', 'ελω'], ['ειμω', 'εμω'], ['εινω', 'ενω'], ['εινω', 'εινω'], ['ηνω', 'αινω'], ['ανω', 'αινω'], ['ινω', 'ινω'], ['υνω', 'υνω'], ['ειρω', 'ειρω'], ['ειρω', 'ερω'], ['ηρω', 'αιρω'], ['ηλω', 'αλλω'], ['αλω', 'αλλω'], ['ειλω', 'ιλλω']];
  for (const [i, o] of liquidAor) {
    for (const [ii, oo] of [[i, o], [i.replace(/ω$/u, 'ομαι'), o.replace(/ω$/u, 'ομαι')], [i.replace(/ω$/u, 'ομαι'), o]]) {
      suffix('aorist', ii, oo, ['aor'], ['v'], {then: THEN_STRIP_ACCENTS});
      suffix('aorist', ii, oo, ['aora'], ['aug'], {then: THEN_STRIP_ACCENTS});
    }
  }
  // Aorist passive.
  const passive = [
    ['θω', ['ω', 'ομαι']], ['ηθω', ['αω', 'εω', 'ομαι', 'εομαι', 'αομαι', 'αμαι', 'ω']], ['ωθω', ['οω', 'ομαι', 'οομαι']], ['εθω', ['εω', 'εομαι']], ['αθω', ['αω']],
    ['σθω', ['ζω', 'δω', 'θω', 'ω', 'ομαι', 'ζομαι', 'αω', 'εω', 'ννυμι']], ['φθω', ['πω', 'βω', 'φω', 'πτω', 'πομαι']], ['χθω', ['κω', 'γω', 'χω', 'ττω', 'σσω', 'γομαι', 'χομαι', 'κομαι']],
    ['λθω', ['λλω']], ['ιθω', ['ινω']], ['υθω', ['υνω', 'υω']], ['ερθω', ['ειρω']], ['ανθω', ['αινω']], ['υνθω', ['υνω']], ['ινθω', ['ινω']], ['ηνθω', ['αινω']], ['ηθω', ['ημι']], ['εθω', ['ημι']], ['οθω', ['ωμι']], ['αθω', ['ημι']],
  ];
  // Second aorist passive (ἐγράφην, ἐφάνην, ἐστάλην, ἐτράπην, ἐκόπην, ἐβλάβην, ἠλλάγην, ἐπλήγην, ἐχάρην).
  const passive2 = [
    ['φω', ['φω']], ['βω', ['βω']], ['γω', ['γω']], ['πω', ['πω']], ['ανω', ['αινω']], ['αλω', ['ελλω', 'αλλω']], ['αρω', ['ειρω', 'αιρω', 'ερω']], ['απω', ['επω', 'επτω']],
    ['αφω', ['εφω', 'αφω']], ['οπω', ['οπτω']], ['αβω', ['απτω']], ['αγω', ['αττω', 'ασσω', 'ηττω', 'ησσω', 'ηγνυμι']], ['ηγω', ['ηττω', 'ησσω']], ['υω', ['υω']], ['ιγω', ['ειγνυμι', 'ιγνυμι']],
    ['υγω', ['υγω', 'ευγνυμι']], ['ιβω', ['ιβω']], ['αμω', ['εμω']], ['αγω', ['αγω']],
  ];
  for (const [i, outs] of [...passive, ...passive2]) {
    for (const o of outs) {
      const contract = /(εω|αω|οω|ομαι|αμαι|μι)$/u.test(o) || i !== i.replace(/^θ/u, '');
      const opts = {then: THEN_STRIP_ACCENTS};
      suffix('aorist-passive', i, o, ['aorp'], ['v'], opts);
      suffix('aorist-passive', i, o, ['aorpa'], ['aug'], opts);
    }
  }
  // Future passive: λυθήσομαι → the passive stem λυθ-.
  for (const [i, o] of [['ησομαι', 'ω'], ['ησω', 'ω']]) {
    suffix('future-passive', i, o, ['fut'], ['aorp'], {then: THEN_STRIP_ACCENTS});
  }
  // Perfect active stems.
  const perfect = [
    ['κω', ['ω']], ['ηκω', ['αω', 'εω', 'ω']], ['ωκω', ['οω', 'ωμι']], ['εκω', ['εω']], ['ακω', ['αω']], ['κω', ['ζω', 'δω', 'θω', 'τω']], ['ηκω', ['ημι']], ['ακω', ['ημι']],
    ['φω', ['πω', 'βω', 'φω', 'πτω', 'μπω']], ['χω', ['κω', 'γω', 'χω', 'ττω', 'σσω', 'γγω']], ['γω', ['γω']], ['οιπω', ['ειπω']], ['οιθω', ['ειθω']], ['ομφω', ['εμπω']],
    ['οφω', ['εφω', 'επω', 'οπτω']], ['ορω', ['ειρω']], ['αρκω', ['ειρω']], ['αλκω', ['ελλω']], ['ελκω', ['ελλω']], ['ηκω', ['ηγνυμι']], ['ωω', ['ωμι']],
  ];
  for (const [i, outs] of perfect) {
    for (const o of outs) {
      suffix('perfect', i, o, ['pf'], ['red'], {then: THEN_STRIP_ACCENTS});
      suffix('perfect', i, o, ['plpf'], ['augred'], {then: THEN_STRIP_ACCENTS});
    }
  }
  // A perfect that is itself the dictionary form (πέπνυμαι, κέκτημαι, δέδοικα, ἔοικα).
  verbTransform('perfect-lemma', 'perfect', 'A form of a verb whose dictionary form is its perfect (πεπνυμένος → πέπνυμαι, δεδοικότες → δέδοικα).');
  suffix('perfect-lemma', 'ω', 'μαι', ['pmp'], ['v'], {stem: {stemMinLength: 3}});
  suffix('perfect-lemma', 'ω', 'α', ['pf'], ['v'], {stem: {stemMinLength: 3}});
  // Perfect middle of vowel stems (λέλυμαι, πεποίημαι, δεδήλωμαι, τετίμημαι).
  verbTransform('perfect-middle', 'perfect middle/passive', 'Perfect middle and passive of vowel stems: λέλυμαι, πεποίημαι, τετίμημαι, δεδήλωμαι, ἠκούσμην → the present.');
  for (const [i, outs] of [['ω', ['ω']], ['ηω', ['αω', 'εω', 'ω']], ['ωω', ['οω']], ['εω', ['εω']], ['ομαι', ['ομαι']], ['ηομαι', ['εομαι', 'αομαι', 'ομαι']], ['ηω', ['ομαι']], ['ιω', ['ινω']], ['υω', ['υνω']], ['αω', ['εινω']]]) {
    for (const o of outs) {
      const stem = i === 'ω' || i === 'ομαι' ? {stemEndsWith: PLAIN_VOWEL_CLASS} : undefined;
      suffix('perfect-middle', i, o, ['pmp'], ['red'], {then: THEN_STRIP_ACCENTS, stem});
      suffix('perfect-middle', i, o, ['plpm'], ['augred'], {then: THEN_STRIP_ACCENTS, stem});
    }
  }
}

/** Augments, the reduplication of the perfect, and both after a preverb. */
function augmentRules() {
  verbTransform('augment', 'augment', 'Past tense (imperfect, aorist, pluperfect): removes the augment ἐ- or the lengthened first vowel (ἔλυον, ἦγον, ᾤκουν, ηὗρον), also after a preverb (ἀπέλυσα, ἀνήχθη, συνέβαλον).');
  verbTransform('unaugmented', 'unaugmented', 'A past tense without a visible augment: Homer and Ionic often omit it, and verbs beginning with ι, υ, η, ω, ει or ου do not show it.');
  verbTransform('reduplication', 'reduplication', 'Perfect stem: removes the reduplication (λέλυκα, πεπαίδευκα, γέγραφα, τέθηκα, ἔσταλκα, ἤγγελκα).');
  // [augmented beginning, dictionary-form beginning]; the accent may sit on the augment.
  const simple = [
    ['ἐ', ''], ['ἐρρ', 'ῥ'], ['ἠ', 'ἀ'], ['ἠ', 'ἐ'], ['ἡ', 'ἁ'], ['ἡ', 'ἑ'], ['ὠ', 'ὀ'], ['ὡ', 'ὁ'], ['ᾐ', 'αἰ'], ['ᾐ', 'εἰ'], ['ᾑ', 'αἱ'],
    ['ᾠ', 'οἰ'], ['ᾡ', 'οἱ'], ['ηὐ', 'αὐ'], ['ηὐ', 'εὐ'], ['ηὑ', 'εὑ'], ['ηὑ', 'αὑ'], ['εἰ', 'ἐ'], ['εἱ', 'ἑ'], ['ἑω', 'ὁ'], ['ἑα', 'ἁ'],
  ];
  const preverbs = [
    ['ἀπ', 'ἀπο'], ['ἀφ', 'ἀπο'], ['ἀν', 'ἀνα'], ['δι', 'δια'], ['κατ', 'κατα'], ['καθ', 'κατα'], ['μετ', 'μετα'], ['μεθ', 'μετα'], ['παρ', 'παρα'],
    ['ἐπ', 'ἐπι'], ['ἐφ', 'ἐπι'], ['ὑπ', 'ὑπο'], ['ὑφ', 'ὑπο'], ['ἀμφ', 'ἀμφι'], ['ἀντ', 'ἀντι'], ['ἀνθ', 'ἀντι'], ['περι', 'περι'], ['προ', 'προ'],
    ['προσ', 'προσ'], ['εἰσ', 'εἰσ'], ['ἐσ', 'ἐσ'], ['ἐξ', 'ἐκ'], ['ἐν', 'ἐν'], ['ἐν', 'ἐμ'], ['ἐν', 'ἐγ'], ['ἐν', 'ἐλ'], ['συν', 'συν'], ['συν', 'συμ'],
    ['συν', 'συγ'], ['συν', 'συλ'], ['συν', 'συσ'], ['συν', 'συ'], ['ὑπερ', 'ὑπερ'],
    ['ἐπαν', 'ἐπανα'], ['ἐξαπ', 'ἐξαπο'], ['ἐξαν', 'ἐξανα'], ['παρεπ', 'παρεπι'], ['συναπ', 'συναπο'], ['ἀντεπ', 'ἀντεπι'], ['ἐπεξ', 'ἐπεκ'],
  ];
  // They also apply to the text as written; the rest must end like a verb's dictionary form (-ω, -μαι, -μι).
  const VERB_END = {};
  const withAccents = (tid, inflected, deinflected, cin, cout, opts) => {
    // An accented augment (ἔλυσα, ἦγον) is read in the removeAccents variant.
    prefix(tid, inflected, deinflected, cin, cout, {...opts, stem: {...VERB_END, ...(opts.stem ?? {})}});
  };
  const emitAug = (inflected, deinflected, cin, cout, opts = {}) => withAccents('augment', inflected, deinflected, cin, cout, opts);
  // After a preverb the text without diacritics is the dictionary's own form-of row: written forms only.
  const emitAugPreverb = (inflected, deinflected, cin, cout, opts = {}) => withAccents('augment', inflected, deinflected, cin, cout, {...opts, writtenOnly: true});
  for (const [a, b] of simple) {
    emitAug(a, b, ['aug'], ['v']);
    if (a === 'ἐ') emitAug(a, b, ['augred'], ['red']);
  }
  for (const [p, q] of preverbs) {
    // Preverb, augment ἐ, consonant-initial verb: ἀπ-έ-λυσα, κατ-έ-βην, ἐξ-έ-βαλον.
    emitAugPreverb(`${p}ε`, q, ['aug'], ['v']);
    // Preverb, lengthened vowel (ἀν-ή-χθη, ἀπ-ῆλθον, ὑπ-ή-κουσα): the verb's first vowel loses its breathing.
    for (const [aug, vowel] of [['η', 'α'], ['η', 'ε'], ['ω', 'ο'], ['ῃ', 'αι'], ['ῳ', 'οι'], ['ηυ', 'ευ']]) {
      emitAugPreverb(`${p}${aug}`, `${p}${vowel}`, ['aug'], ['v']);
    }
    // προ- and περι- keep their vowel (προέβαλον, περιέβαλε); πρό + ε contracts (προὔβαλον).
  }
  emitAug('προὐ', 'προ', ['aug'], ['v']);
  // Editions also write it without the coronis (προυχώρησε, προύβαλες).
  emitAug('πρου', 'προ', ['aug'], ['v']);
  // Unaugmented: Homeric and Ionic past forms, and verbs whose augment cannot be seen.
  // Only aug → v: the rule also applies to the text as written (docs/languages.md 7.2), where it only adds the verb reading.
  for (const tail of ['ω', 'μαι', 'μι']) add('unaugmented', {type: 'suffix', inflected: tail, deinflected: tail, conditionsIn: ['aug'], conditionsOut: ['v']});
  // Reduplication.
  const redupConsonants = ['β', 'γ', 'δ', 'κ', 'λ', 'μ', 'ν', 'π', 'τ', 'σ'];
  const emitRed = (inflected, deinflected, cin, cout, opts = {}) => withAccents('reduplication', inflected, deinflected, cin, cout, opts);
  for (const c of redupConsonants) emitRed(`${c}ε${c}`, c, ['red'], ['v']);
  for (const [r, c] of [['πεφ', 'φ'], ['τεθ', 'θ'], ['κεχ', 'χ']]) emitRed(r, c, ['red'], ['v']);
  emitRed('ἐ', '', ['red'], ['v'], {stem: {stemStartsWith: CONSONANT_CLASS}});
  emitRed('ἐρρ', 'ῥ', ['red'], ['v']);
  for (const [a, b] of simple.filter(([a]) => a !== 'ἐ' && a !== 'ἐρρ')) emitRed(a, b, ['red'], ['v']);
  // A perfect of a verb beginning with η, ω, ι, υ, ει, ευ or ου shows no reduplication (ἥγημαι, ὤφληκα).
  const LONG_START = charClass([...LETTERS.plainVowels, ...LETTERS.accentedVowels].filter((c) => /^[ηωιυ]/u.test(NFD(c).toLowerCase())));
  for (const tail of ['ω', 'μαι', 'μι']) add('reduplication', {type: 'suffix', inflected: tail, deinflected: tail, conditionsIn: ['red'], conditionsOut: ['v'], stemStartsWith: LONG_START});
  // Reduplication after a preverb (ἀπολέλυκα, συγγέγραφα, καταλέλοιπα): one pattern per preverb.
  verbTransform('reduplication-preverb', 'reduplication', 'Perfect stem of a compound verb: removes the reduplication after the preverb (ἀπολέλυκα, καταλέλοιπα, συγγέγραφα, ἐκπέπτωκα).');
  const pvs = ['ἀπο', 'ἀνα', 'δια', 'κατα', 'μετα', 'παρα', 'ἐπι', 'ὑπο', 'ἀμφι', 'ἀντι', 'περι', 'προ', 'προσ', 'εἰσ', 'ἐκ', 'ἐν', 'ἐμ', 'ἐγ', 'συν', 'συμ', 'συγ', 'συλ', 'ὑπερ', 'ἐξ'];
  const alternation = [...new Set([...pvs, ...pvs.map(stripAll)])].join('|');
  for (const anchor of ['ω', 'μαι', 'μι']) {
    add('reduplication-preverb', {type: 'pattern', pattern: `^(${alternation})([βγδκλμνπτσ])[εέ]\\2`, replacement: '$1$2', anchorSuffix: anchor, conditionsIn: ['red'], conditionsOut: ['v'], then: THEN_STRIP_ACCENTS});
    add('reduplication-preverb', {type: 'pattern', pattern: `^(${alternation})(?:π[εέ](φ)|τ[εέ](θ)|κ[εέ](χ))`, replacement: '$1$2$3$4', anchorSuffix: anchor, conditionsIn: ['red'], conditionsOut: ['v'], then: THEN_STRIP_ACCENTS});
  }
}


// Irregular verbs: principal parts the stem rules cannot reach, written as the ending rules leave them (stem + -ω).

/** Stem rules from an irregular tense stem to the dictionary form, with the stem's accent variants. */
function irregularStem(tid, stem, lemma, pairs) {
  const f = stripAccents(stem);
  // Written only: without diacritics the dictionary's own form-of rows find these forms.
  for (const [cin, cout] of pairs) {
    for (const tail of ['ω', 'ομαι']) suffix(tid, f + tail, stripAccents(lemma), cin, cout, {writtenOnly: true});
  }
}

/** A stem that already contains its augment or reduplication (εἶδον, ἦλθον, εἴληφα). */
function fusedStem(tid, stem, lemma, cin) {
  // A pluperfect keeps its augment before the fused stem (ἐ-πεπτώκεσαν): the augment rules remove it.
  const plain = cin.filter((c) => c !== 'plpf' && c !== 'plpm');
  const aug = cin.filter((c) => c === 'plpf' || c === 'plpm');
  if (plain.length) irregularStem(tid, stem, lemma, [[plain, ['v']]]);
  if (aug.length) irregularStem(tid, stem, lemma, [[aug, ['aug']]]);
  // In a compound the stem loses its breathing; give back a placeholder ε for the preverb rules (ἀπ-ῆλθον, ἀντ-εῖπον).
  const bare = stripAccents(NFC(NFD(stem).replace(/[\u0313\u0314]/gu, '')));
  const l = stripAccents(lemma);
  const vowelInitial = /^[αεηιουωἀἁἐἑἠἡἰἱὀὁὐὑὠὡ]/u.test(l);
  const tailLemma = vowelInitial ? NFC(NFD(l).replace(/[\u0313\u0314]/gu, '')) : 'ε' + l;
  const cout = vowelInitial ? ['v'] : ['aug'];
  for (const tail of ['ω', 'ομαι']) {
    suffix(tid, bare + tail, tailLemma, cin, cout, {stem: {stemMinLength: 2}});
  }
}

const IRREGULAR = [
  // lemma, second aorist stems, fused (augmented) aorist stems, other aorist stems, future stems, perfect stems, perfect middle stems, aorist passive stems
  ['λαμβάνω', {aor2: ['λαβ'], fut: ['λήψ'], pfFused: ['εἰληφ'], pmpFused: ['εἰλημ', 'εἰλημ'], aorp: ['ληφθ']}],
  ['ἔρχομαι', {aor2: ['ἐλθ'], aor2Fused: ['ἦλθ'], fut: ['ἐλεύσ'], pfFused: ['ἐληλυθ']}],
  ['λέγω', {aor2: ['εἰπ'], aor2Fused: ['εἶπ'], aorFused: ['εἶπ'], fut: ['ἐρ', 'λέξ'], futContract: ['ἐρ'], pfFused: ['εἰρηκ'], pmpFused: ['εἰρη'], aorp: ['ῥηθ', 'λεχθ'], aorpFused: ['ἐρρηθ']}],
  ['ὁράω', {aor2: ['ἰδ'], aor2Fused: ['εἶδ'], fut: ['ὄψ'], pfFused: ['ἑωρακ', 'ἑορακ', 'ὀπωπ'], pmpFused: ['ἑωρα', 'ὠμ', 'ὦμ'], aorp: ['ὀφθ'], aorpFused: ['ὠφθ'], secFused: ['ἑώρ']}],
  ['φέρω', {aor2: ['ἐνεγκ'], aor2Fused: ['ἠνεγκ'], aor: ['ἐνεγκ'], aorFused: ['ἠνεγκ'], fut: ['οἰσ'], pfFused: ['ἐνηνοχ'], pmpFused: ['ἐνηνεγ'], aorp: ['ἐνεχθ', 'οἰσθ'], aorpFused: ['ἠνεχθ']}],
  ['δίδωμι', {fut: ['δωσ'], aorp: ['δοθ'], aor: ['δωκ'], pfFused: ['δεδωκ']}],
  ['τίθημι', {fut: ['θησ'], aorp: ['τεθ'], aor: ['θηκ'], pfFused: ['τεθηκ', 'τεθεικ']}],
  ['ἵστημι', {fut: ['στησ'], aorp: ['σταθ'], aor: ['στησ']}],
  ['ἵημι', {fut: ['ἡσ'], aorp: ['ἑθ'], aorFused: ['ἡκ']}],
  ['δείκνυμι', {fut: ['δειξ'], aor: ['δειξ'], pfFused: ['δεδειχ'], aorp: ['δειχθ']}],
  ['τίκτω', {aor2: ['τεκ'], fut: ['τεξ'], pfFused: ['τετοκ']}],
  ['γηράσκω', {fut: ['γηρασ'], aor: ['γηρασ']}],
  ['μιμνήσκω', {fut: ['μνησ'], aor: ['μνησ'], pfFused: ['μεμνη'], aorp: ['μνησθ']}],
  ['καίω', {fut: ['καυσ'], aor: ['καυσ', 'κη'], aorp: ['κα', 'καυθ']}],
  ['κλαίω', {fut: ['κλαυσ'], aor: ['κλαυσ']}],
  ['ἵζω', {aor: ['ἑσ', 'ἱσ']}],
  ['ἕζομαι', {aor: ['ἑσ']}],
  ['ἅπτω', {aorp: ['ἁφθ']}],
  ['σεύω', {aorp: ['συθ'], aor: ['σευ', 'σσευ']}],
  ['αἱρέω', {aor2: ['ἑλ'], aor2Fused: ['εἱλ'], fut: ['αἱρησ', 'ἑλ'], pfFused: ['ᾑρηκ'], pmpFused: ['ᾑρη'], aorp: ['αἱρεθ'], aorpFused: ['ᾑρεθ']}],
  ['ἔχω', {aor2: ['σχ'], fut: ['ἑξ', 'σχησ'], pfFused: ['ἐσχηκ'], pmpFused: ['ἐσχη'], secFused: ['εἶχ']}],
  ['γίγνομαι', {aor2: ['γεν'], fut: ['γενησ'], pfFused: ['γεγον', 'γεγενη'], aorp: ['γενηθ']}],
  ['γίνομαι', {aor2: ['γεν'], fut: ['γενησ']}],
  ['γιγνώσκω', {fut: ['γνωσ'], pfFused: ['ἐγνωκ'], pmpFused: ['ἐγνωσ'], aorp: ['γνωσθ']}],
  ['πάσχω', {aor2: ['παθ'], fut: ['πεισ'], pfFused: ['πεπονθ']}],
  ['μανθάνω', {aor2: ['μαθ'], fut: ['μαθησ'], pfFused: ['μεμαθηκ']}],
  ['τυγχάνω', {aor2: ['τυχ'], fut: ['τευξ'], pfFused: ['τετυχηκ', 'τετευχ']}],
  ['πίπτω', {aor2: ['πεσ'], fut: ['πεσ'], futContract: ['πεσ'], pfFused: ['πεπτωκ']}],
  ['βάλλω', {aor2: ['βαλ'], futContract: ['βαλ'], pfFused: ['βεβληκ', 'βεβλη'], aorp: ['βληθ']}],
  ['ἄγω', {aor2Fused: ['ἠγαγ'], aor2: ['ἀγαγ'], fut: ['ἀξ'], pfFused: ['ἠχ', 'ἠγ'], aorpFused: ['ἠχθ'], aorp: ['ἀχθ']}],
  ['εὑρίσκω', {aor2: ['εὑρ'], aor2Fused: ['ηὑρ'], fut: ['εὑρησ'], pfFused: ['ηὑρηκ', 'εὑρηκ', 'ηὑρη', 'εὑρη'], aorp: ['εὑρεθ'], aorpFused: ['ηὑρεθ']}],
  ['ἀποθνῄσκω', {aor2: ['ἀποθαν'], futContract: ['ἀποθαν']}],
  ['θνῄσκω', {aor2: ['θαν'], futContract: ['θαν'], pfFused: ['τεθνηκ', 'τεθνε', 'τεθνα', 'τεθνηυ']}],
  ['θνήσκω', {aor2: ['θαν'], futContract: ['θαν'], pfFused: ['τεθνηκ']}],
  ['πίνω', {aor2: ['πι'], fut: ['πι'], pfFused: ['πεπωκ'], aorp: ['ποθ']}],
  ['ἐσθίω', {aor2: ['φαγ'], fut: ['ἐδ'], pfFused: ['ἐδηδοκ']}],
  ['τρέχω', {aor2: ['δραμ'], futContract: ['δραμ'], pfFused: ['δεδραμηκ']}],
  ['φεύγω', {aor2: ['φυγ'], fut: ['φευξ'], pfFused: ['πεφευγ']}],
  ['λείπω', {aor2: ['λιπ'], fut: ['λειψ'], pfFused: ['λελοιπ'], aorp: ['λειφθ']}],
  ['βαίνω', {fut: ['βησ'], pfFused: ['βεβηκ']}],
  ['ἀκούω', {fut: ['ἀκουσ'], pfFused: ['ἀκηκο'], aorp: ['ἀκουσθ']}],
  ['ἐλαύνω', {fut: ['ἐλ'], aor: ['ἠλασ', 'ἐλασ', 'ἐλασσ', 'ἠλασσ'], pfFused: ['ἐληλακ', 'ἐληλα']}],
  ['ὄλλυμι', {aor: ['ὠλεσ', 'ὀλεσ', 'ὀλεσσ', 'ὠλεσσ'], aor2: ['ὀλ'], aor2Fused: ['ὠλ'], futContract: ['ὀλ'], pfFused: ['ὀλωλεκ', 'ὀλωλ']}],
  ['ἀπόλλυμι', {aor: ['ἀπωλεσ', 'ἀπολεσ'], aor2: ['ἀπολ'], aor2Fused: ['ἀπωλ'], futContract: ['ἀπολ'], pfFused: ['ἀπολωλεκ', 'ἀπολωλ']}],
  ['ἁμαρτάνω', {aor2: ['ἁμαρτ'], aor2Fused: ['ἡμαρτ'], fut: ['ἁμαρτησ'], pfFused: ['ἡμαρτηκ']}],
  ['αἰσθάνομαι', {aor2: ['αἰσθ'], aor2Fused: ['ᾐσθ'], fut: ['αἰσθησ'], pfFused: ['ᾐσθη']}],
  ['πυνθάνομαι', {aor2: ['πυθ'], fut: ['πευσ'], pfFused: ['πεπυσ']}],
  ['λανθάνω', {aor2: ['λαθ'], fut: ['λησ'], pfFused: ['λεληθ', 'λελησ']}],
  ['ἀφικνέομαι', {aor2: ['ἀφικ'], fut: ['ἀφιξ'], pfFused: ['ἀφιγ']}],
  ['ἱκνέομαι', {aor2: ['ἱκ'], fut: ['ἱξ']}],
  ['ἕπομαι', {aor2: ['σπ', 'ἑσπ'], fut: ['ἑψ'], secFused: ['εἱπ']}],
  ['ἐρωτάω', {aor2: ['ἐρ'], aor2Fused: ['ἠρ'], fut: ['ἐρησ']}],
  ['κάμνω', {aor2: ['καμ'], futContract: ['καμ'], pfFused: ['κεκμηκ']}],
  ['τέμνω', {aor2: ['τεμ', 'ταμ'], futContract: ['τεμ'], pfFused: ['τετμηκ', 'τετμη'], aorp: ['τμηθ']}],
  ['κτείνω', {aor2: ['κταν'], pfFused: ['ἐκτον']}],
  ['ἀποκτείνω', {aor2: ['ἀποκταν'], pfFused: ['ἀπεκτον', 'ἀπεκτον']}],
  ['τρέπω', {aor2: ['τραπ'], pfFused: ['τετροφ', 'τετραμ'], aorp: ['τραπ', 'τρεφθ']}],
  ['τρέφω', {fut: ['θρεψ'], aor: ['θρεψ'], pfFused: ['τετροφ', 'τεθραμ'], aorp: ['τραφ', 'θρεφθ']}],
  ['θάπτω', {aorp: ['ταφ'], pfFused: ['τεθαμ']}],
  ['στέλλω', {futContract: ['στελ'], pfFused: ['ἐσταλκ'], pmpFused: ['ἐσταλ'], aorp: ['σταλ']}],
  ['φαίνω', {futContract: ['φαν'], aorp: ['φαν'], pfFused: ['πεφην', 'πεφασ', 'πεφαγκ']}],
  ['αἴρω', {futContract: ['ἀρ'], aorFused: ['ἠρ'], pfFused: ['ἠρκ', 'ἠρ'], aorpFused: ['ἠρθ'], aorp: ['ἀρθ']}],
  ['ἐγείρω', {futContract: ['ἐγερ'], aor2Fused: ['ἠγρ'], pfFused: ['ἐγρηγορ', 'ἐγηγερ'], aorpFused: ['ἠγερθ'], aorp: ['ἐγερθ']}],
  ['φθείρω', {futContract: ['φθερ'], pfFused: ['ἐφθαρκ', 'ἐφθορ'], pmpFused: ['ἐφθαρ'], aorp: ['φθαρ']}],
  ['καλέω', {futContract: ['καλ'], aor: ['καλεσ'], pfFused: ['κεκληκ', 'κεκλη'], aorp: ['κληθ']}],
  ['τελέω', {aor: ['τελεσ'], pfFused: ['τετελεκ', 'τετελεσ'], aorp: ['τελεσθ']}],
  ['δοκέω', {fut: ['δοξ'], aor: ['δοξ'], pfFused: ['δεδογ']}],
  ['μάχομαι', {futContract: ['μαχ'], fut: ['μαχεσ', 'μαχησ'], aor: ['μαχεσ'], pfFused: ['μεμαχη']}],
  ['βούλομαι', {fut: ['βουλησ'], aorp: ['βουληθ'], pfFused: ['βεβουλη'], secFused: ['ἠβουλ']}],
  ['οἴομαι', {fut: ['οἰησ'], aorpFused: ['ᾠηθ'], secFused: ['ᾠ']}],
  ['ἐθέλω', {fut: ['ἐθελησ'], aor: ['ἐθελησ'], aorFused: ['ἠθελησ'], pfFused: ['ἠθεληκ'], secFused: ['ἠθελ']}],
  ['θέλω', {fut: ['θελησ'], aor: ['θελησ'], aorFused: ['ἠθελησ']}],
  ['μέλλω', {fut: ['μελλησ'], aor: ['μελλησ'], secFused: ['ἠμελλ']}],
  ['πλέω', {fut: ['πλευσ'], aor: ['πλευσ'], pfFused: ['πεπλευκ']}],
  ['πνέω', {fut: ['πνευσ'], aor: ['πνευσ']}],
  ['ῥέω', {fut: ['ῥευσ', 'ῥυησ'], aorp: ['ῥυ'], aorpFused: ['ἐρρυ']}],
  ['χέω', {aor: ['χε'], pfFused: ['κεχυκ', 'κεχυ'], aorp: ['χυθ']}],
  ['δέω', {fut: ['δησ', 'δεησ'], aor: ['δησ', 'δεησ'], pfFused: ['δεδεκ', 'δεδε'], aorp: ['δεθ', 'δεηθ']}],
  ['δέομαι', {fut: ['δεησ'], aorp: ['δεηθ']}],
  ['ζάω', {fut: ['ζησ'], aor: ['ζησ'], pfFused: ['ἐζηκ']}],
  ['χράομαι', {fut: ['χρησ'], aor: ['χρησ'], pfFused: ['κεχρη'], aorp: ['χρησθ']}],
  ['σῴζω', {fut: ['σωσ'], aor: ['σωσ'], pfFused: ['σεσωκ', 'σεσωσ', 'σεσω'], aorp: ['σωθ']}],
  ['σώζω', {fut: ['σωσ'], aor: ['σωσ'], aorp: ['σωθ']}],
  ['πείθω', {pfFused: ['πεποιθ']}],
  ['πέμπω', {pfFused: ['πεπομφ', 'πεπεμ']}],
  ['κλέπτω', {aorp: ['κλαπ'], pfFused: ['κεκλοφ']}],
  ['κόπτω', {aorp: ['κοπ']}],
  ['ἐργάζομαι', {aorFused: ['εἰργασ', 'ἠργασ'], pfFused: ['εἰργασ'], aorpFused: ['εἰργασθ']}],
  ['ὀμνύω', {futContract: ['ὀμ'], aorFused: ['ὠμοσ'], aor: ['ὀμοσ'], pfFused: ['ὀμωμοκ']}],
  ['ὄμνυμι', {futContract: ['ὀμ'], aorFused: ['ὠμοσ'], aor: ['ὀμοσ'], pfFused: ['ὀμωμοκ']}],
  ['ἀνοίγω', {aorFused: ['ἀνεῳξ', 'ἤνοιξ'], pfFused: ['ἀνεῳγ', 'ἀνεῳγ'], aorpFused: ['ἀνεῳχθ']}],
  ['ἀναλίσκω', {fut: ['ἀναλωσ'], aorFused: ['ἀνηλωσ'], aor: ['ἀναλωσ'], pfFused: ['ἀνηλωκ', 'ἀνηλω'], aorp: ['ἀναλωθ'], aorpFused: ['ἀνηλωθ']}],
  ['μιμνῄσκω', {fut: ['μνησ'], aor: ['μνησ'], pfFused: ['μεμνη'], aorp: ['μνησθ']}],
  ['κτάομαι', {fut: ['κτησ'], pfFused: ['κεκτη', 'ἐκτη']}],
  ['πράττω', {pfFused: ['πεπραχ', 'πεπραγ']}],
  ['πράσσω', {pfFused: ['πεπραχ', 'πεπραγ']}],
  ['ἀγγέλλω', {futContract: ['ἀγγελ'], aorFused: ['ἠγγειλ'], pfFused: ['ἠγγελκ', 'ἠγγελ'], aorpFused: ['ἠγγελθ']}],
  ['μένω', {futContract: ['μεν'], aor: ['μειν'], pfFused: ['μεμενηκ']}],
  ['κρίνω', {futContract: ['κριν'], pfFused: ['κεκρικ', 'κεκρι'], aorp: ['κριθ']}],
  ['ἀποκρίνομαι', {futContract: ['ἀποκριν'], aor: ['ἀποκριν'], aorFused: ['ἀπεκριν'], pfFused: ['ἀποκεκρι'], aorpFused: ['ἀπεκριθ'], aorp: ['ἀποκριθ']}],
  ['χαίρω', {fut: ['χαιρησ'], aorp: ['χαρ']}],
  ['σπένδω', {fut: ['σπεισ'], aor: ['σπεισ']}],
  ['κεῖμαι', {fut: ['κεισ']}],
  ['ἵστημι', {pfFused: ['ἑστηκ', 'ἑστ']}],
  ['τρέχω', {pfFused: ['δεδρομ']}],
  ['λαγχάνω', {aor2: ['λαχ'], fut: ['ληξ'], pfFused: ['λελογχ', 'εἰληχ']}],
  ['βλώσκω', {aor2: ['μολ'], futContract: ['μολ'], pfFused: ['μεμβλωκ']}],
  ['μείγνυμι', {fut: ['μειξ'], aor: ['μειξ'], aorp: ['μειχθ', 'μιχθ', 'μιγ'], pfFused: ['μεμειγ', 'μεμιγ']}],
  ['μίγνυμι', {fut: ['μιξ'], aor: ['μιξ'], aorp: ['μιχθ', 'μιγ'], pfFused: ['μεμιγ']}],
  ['ζεύγνυμι', {fut: ['ζευξ'], aor: ['ζευξ'], aorp: ['ζευχθ', 'ζυγ'], pfFused: ['ἐζευγ']}],
  ['ῥήγνυμι', {fut: ['ῥηξ'], aor: ['ῥηξ'], aorp: ['ῥαγ'], aorpFused: ['ἐρραγ'], pfFused: ['ἐρρωγ']}],
  ['πήγνυμι', {fut: ['πηξ'], aor: ['πηξ'], aorp: ['παγ'], pfFused: ['πεπηγ']}],
  ['δείδω', {fut: ['δεισ'], aor: ['δεισ']}],
  ['εἶδον', {aor2: ['ἰδ'], aor2Fused: ['εἶδ']}],
  ['εἶπον', {aor2: ['εἰπ'], aor2Fused: ['εἶπ'], aorFused: ['εἶπ', 'εἰπ']}],
  ['αὐξάνω', {fut: ['αὐξησ'], aor: ['αὐξησ'], aorFused: ['ηὐξησ'], aorp: ['αὐξηθ'], aorpFused: ['ηὐξηθ'], pfFused: ['ηὐξηκ', 'ηὐξη']}],
  ['θιγγάνω', {aor2: ['θιγ'], fut: ['θιξ']}],
  ['τίνω', {fut: ['τισ', 'τεισ'], aor: ['τισ', 'τεισ']}],
  ['ὠθέω', {fut: ['ὠσ'], aor: ['ὠσ'], aorFused: ['ἐωσ'], aorp: ['ὠσθ'], aorpFused: ['ἐωσθ']}],
  ['πίμπλημι', {fut: ['πλησ'], aor: ['πλησ'], aorp: ['πλησθ']}],
  ['κράζω', {pfFused: ['κεκραγ']}],
  ['κάθημαι', {fut: ['καθησ']}],
];

/** Compounds of ἔχω: before σχ- the preverb keeps its vowel (παρα-σχεῖν), the dictionary form elides it (παρ-έχω). */
function buildEchoCompounds() {
  const pvs = [['ἀπο', 'ἀπ'], ['ἀνα', 'ἀν'], ['δια', 'δι'], ['κατα', 'κατ'], ['μετα', 'μετ'], ['παρα', 'παρ'], ['ἐπι', 'ἐπ'], ['ὑπο', 'ὑπ'], ['ἀντι', 'ἀντ'], ['ἀμφι', 'ἀμφ'],
    ['προσ', 'προσ'], ['συ', 'συν'], ['συν', 'συν'], ['ἐν', 'ἐν'], ['ἐκ', 'ἐξ'], ['περι', 'περι'], ['προ', 'προ'], ['ὑπερ', 'ὑπερ'], ['παρα', 'παρ']];
  for (const [full, elided] of pvs) {
    for (const [stem, cin, cout] of [['σχ', ['aor2'], ['v']], ['σχησ', ['fut', 'aor'], ['v']]]) {
      for (const tail of ['ω', 'ομαι']) suffix('aorist', full + stem + tail, elided + 'εχω', cin, cout);
    }
  }
  // Augmented: ἀπ-έ-σχον, παρ-έ-σχε: the preverb is already elided.
  for (const tail of ['ω', 'ομαι']) suffix('aorist', 'έσχ' + tail, 'έχω', ['aor2a'], ['v'], {stem: {stemMinLength: 2}});
}

function buildIrregular() {
  buildEchoCompounds();
  for (const [lemma, parts] of IRREGULAR) {
    for (const st of parts.aor2 ?? []) irregularStem('aorist', st, lemma, [[['aor2'], ['v']], [['aor2a'], ['aug']]]);
    for (const st of parts.aor2Fused ?? []) fusedStem('aorist', st, lemma, ['aor2a']);
    for (const st of parts.aor ?? []) irregularStem('aorist', st, lemma, [[['aor'], ['v']], [['aora'], ['aug']]]);
    for (const st of parts.aorFused ?? []) fusedStem('aorist', st, lemma, ['aora']);
    for (const st of parts.fut ?? []) irregularStem('future', st, lemma, [[['fut'], ['v']]]);
    for (const st of parts.futContract ?? []) {
      // Contracted futures (ἐρῶ, βαλῶ, πεσοῦμαι, θανοῦμαι): the -έω endings leave stem + -εω.
      irregularStem('future', st + 'ε', lemma, [[['fut'], ['v']]]);
    }
    for (const st of parts.pfFused ?? []) fusedStem('perfect', st, lemma, ['pf', 'plpf', 'pmp']);
    for (const st of parts.pmpFused ?? []) fusedStem('perfect-middle', st, lemma, ['pmp', 'plpm']);
    for (const st of parts.aorp ?? []) irregularStem('aorist-passive', st, lemma, [[['aorp'], ['v']], [['aorpa'], ['aug']]]);
    for (const st of parts.aorpFused ?? []) fusedStem('aorist-passive', st, lemma, ['aorpa']);
    for (const st of parts.secFused ?? []) {
      verbTransform('imperfect', 'imperfect', 'Imperfect with an irregular augment (εἶχον, ἑώρων, εἱπόμην, ἤθελον, ἠβουλόμην).');
      fusedStem('imperfect', st, lemma, ['aug']);
    }
  }
}

// Athematic verbs (εἰμί, εἶμι, φημί, οἶδα, κεῖμαι, κάθημαι, δύναμαι, ἐπίσταμαι, δίδωμι, τίθημι, ἵστημι, ἵημι, δείκνυμι).

/**
 * An athematic verb's forms as suffix rules, which read compounds too, with a twin for a compound's form (πάρ-εστι;
 * `opts.compoundLemma`, ιστημι) and an augment placeholder for the preverb rules (ἀπ-έδωκα → ἀπεδίδωμι).
 */
function athematic(lemma, table, opts = {}) {
  const AUGMENTED = new Set(['ath-impf', 'ath-aor', 'ath-plpf', 'ath-pass']);
  for (const [tid, ...forms] of table) {
    const [name, description] = ATHEMATIC_NAMES[tid] ?? [tid, tid];
    transform(tid, name, description);
    for (const f of forms) {
      if (!f) continue;
      const formN = NFC(f);
      if (formN === NFC(lemma)) continue;
      // As written only: the text without diacritics finds the dictionary's own form-of rows.
      suffix(tid, formN, lemma, [], opts.out ?? ['v'], {writtenOnly: true});
      if (opts.compound === false) continue;
      const bare = stripAccents(NFC(NFD(formN).replace(/[\u0313\u0314]/gu, '')));
      const bareLemma = opts.compoundLemma ?? NFC(NFD(stripAccents(lemma)).replace(/[\u0313\u0314]/gu, ''));
      const augmented = AUGMENTED.has(tid) && /^ἐ/u.test(stripAccents(formN)) && !opts.compoundLemma && /^[^αεηιουω]/u.test(bareLemma);
      if (augmented) {
        suffix(tid, bare, 'ε' + bareLemma, [], ['aug'], {stem: {stemMinLength: 2}});
      } else if (bare !== stripAccents(formN) || opts.compoundLemma) {
        suffix(tid, bare, bareLemma, [], opts.out ?? ['v'], {stem: {stemMinLength: 2}});
      }
    }
  }
}

/** The declined forms of a participle in -ς, -ντος (διδούς, τιθείς, ἱστάς, δεικνύς, ὤν, βάς). */
function ntParticiple(nom, obl, fem, neut, datpl) {
  const femStem = fem.replace(/α$/u, '');
  const femAcute = circumflexToAcute(femStem);
  return [nom, obl + 'ος', obl + 'ι', obl + 'α', obl + 'ες', obl + 'ων', datpl, datpl + 'ν', obl + 'ας', obl + 'ε', obl + 'οιν',
    fem, femAcute + 'ης', femAcute + 'ῃ', fem + 'ν', femStem + 'αι', stripAccents(femStem) + 'ῶν', femAcute + 'αις', femAcute + 'ας', neut];
}

/** The declined forms of a participle in -μενος with the recessive accent (διδόμενος, κείμενος). */
function menosParticiple(stem) {
  return MENOS(stripAccents(stem)).map(([e, , , ult]) => recessive(e, ult ?? (/(αι|οι)$/u.test(e) ? 'short' : undefined)));
}

const ATHEMATIC_NAMES = {
  'ath-pres': ['present', 'Present indicative of an athematic (-μι) verb.'],
  'ath-impf': ['imperfect', 'Imperfect of an athematic (-μι) verb.'],
  'ath-subj': ['subjunctive', 'Subjunctive of an athematic (-μι) verb.'],
  'ath-opt': ['optative', 'Optative of an athematic (-μι) verb.'],
  'ath-imp': ['imperative', 'Imperative of an athematic (-μι) verb.'],
  'ath-inf': ['infinitive', 'Infinitive of an athematic (-μι) verb.'],
  'ath-ptc': ['participle', 'Participle of an athematic (-μι) verb.'],
  'ath-fut': ['future', 'Future of an athematic (-μι) verb.'],
  'ath-aor': ['aorist', 'Aorist of an athematic (-μι) verb.'],
  'ath-pf': ['perfect', 'Perfect of an athematic (-μι) verb or of οἶδα.'],
  'ath-plpf': ['pluperfect', 'Pluperfect of an athematic (-μι) verb or of οἶδα.'],
  'ath-mid': ['middle/passive', 'Middle and passive of an athematic (-μι) verb.'],
  'ath-pass': ['aorist passive', 'Aorist passive of an athematic (-μι) verb.'],
};

function buildAthematic() {
  // εἰμί, be.
  athematic('εἰμί', [
    ['ath-pres', 'εἰμι', 'εἶ', 'εἰς', 'ἐσσί', 'ἐστί', 'ἐστίν', 'ἐστι', 'ἐστιν', 'ἔστι', 'ἔστιν', 'ἐσμέν', 'ἐσμεν', 'εἰμέν', 'ἐστέ', 'ἐστε', 'εἰσί', 'εἰσίν', 'εἰσι', 'εἰσιν', 'ἔασι', 'ἔασιν', 'ἐστόν'],
    ['ath-impf', 'ἦ', 'ἦν', 'ἦσθα', 'ἦς', 'ἦμεν', 'ἦτε', 'ἦστε', 'ἦσαν', 'ἔην', 'ἦεν', 'ἔσαν', 'ἔσκε', 'ἔσκεν', 'ἤμην', 'ἦσθον', 'ἤστην'],
    ['ath-subj', 'ὦ', 'ᾖς', 'ᾖ', 'ὦμεν', 'ἦτε', 'ὦσι', 'ὦσιν', 'ἔω', 'ἔῃ', 'ἔωσι', 'ἔωσιν', 'ἔῃσι'],
    ['ath-opt', 'εἴην', 'εἴης', 'εἴη', 'εἶμεν', 'εἴημεν', 'εἶτε', 'εἴητε', 'εἶεν', 'εἴησαν', 'ἔοι', 'εἴη'],
    ['ath-imp', 'ἴσθι', 'ἔστω', 'ἔστε', 'ἔστων', 'ὄντων', 'ἔστωσαν'],
    ['ath-inf', 'εἶναι', 'ἔμμεναι', 'ἔμεναι', 'ἔμμεν', 'ἔμεν'],
    ['ath-ptc', ...ntParticiple('ὤν', 'ὄντ', 'οὖσα', 'ὄν', 'οὖσι'), ...ntParticiple('ἐών', 'ἐόντ', 'ἐοῦσα', 'ἐόν', 'ἐοῦσι'), 'ἐόντεσσι', 'ἐόντεσσιν', 'ἐούσῃσι', 'ἐούσῃσιν'],
    ['ath-fut', 'ἔσομαι', 'ἔσῃ', 'ἔσει', 'ἔσται', 'ἔσεται', 'ἐσόμεθα', 'ἔσεσθε', 'ἔσονται', 'ἔσοιτο', 'ἔσεσθαι', 'ἐσόμενος', 'ἐσομένου', 'ἐσόμενον', 'ἐσόμενοι', 'ἐσομένων', 'ἔσσεται', 'ἔσσεσθαι', 'ἐσσόμενος', 'ἐσσομένοισι', 'ἔσεαι', 'ἔσσομαι'],
  ], {});
  // εἶμι, go (the Attic future of ἔρχομαι).
  athematic('εἶμι', [
    ['ath-pres', 'εἶ', 'εἶσι', 'εἶσιν', 'ἴμεν', 'ἴτε', 'ἴασι', 'ἴασιν', 'εἶσθα'],
    ['ath-impf', 'ᾖα', 'ᾔειν', 'ᾔεις', 'ᾔεισθα', 'ᾔει', 'ᾔειν', 'ᾖμεν', 'ᾖτε', 'ᾖσαν', 'ᾔεσαν', 'ἤϊα', 'ἤϊε', 'ἤϊσαν', 'ἴσαν', 'ᾔεσαν'],
    ['ath-subj', 'ἴω', 'ἴῃς', 'ἴῃ', 'ἴωμεν', 'ἴητε', 'ἴωσι', 'ἴωσιν'],
    ['ath-opt', 'ἴοιμι', 'ἴοις', 'ἴοι', 'ἰοίην', 'ἴοιμεν', 'ἴοιτε', 'ἴοιεν'],
    ['ath-imp', 'ἴθι', 'ἴτω', 'ἴτε', 'ἰόντων', 'ἴτων'],
    ['ath-inf', 'ἰέναι', 'ἴμεναι', 'ἴμεν'],
    ['ath-ptc', ...ntParticiple('ἰών', 'ἰόντ', 'ἰοῦσα', 'ἰόν', 'ἰοῦσι'), 'ἰόντων', 'ἰουσῶν'],
  ], {});
  // φημί, say.
  athematic('φημί', [
    ['ath-pres', 'φημι', 'φῄς', 'φής', 'φησί', 'φησίν', 'φησι', 'φησιν', 'φαμέν', 'φαμεν', 'φατέ', 'φασί', 'φασίν', 'φασι', 'φασιν', 'φῂς'],
    ['ath-impf', 'ἔφην', 'ἔφησθα', 'ἔφης', 'ἔφη', 'ἔφαμεν', 'ἔφατε', 'ἔφασαν', 'φῆ', 'φῆν', 'ἔφαν', 'φάν', 'φάτο', 'ἔφατο', 'ἔφαντο', 'φάσκε'],
    ['ath-subj', 'φῶ', 'φῇς', 'φῇ', 'φῶμεν', 'φῆτε', 'φῶσι', 'φῶσιν'],
    ['ath-opt', 'φαίην', 'φαίης', 'φαίη', 'φαῖμεν', 'φαῖτε', 'φαῖεν', 'φαίησαν'],
    ['ath-imp', 'φάθι', 'φαθί', 'φάτω', 'φάτε'],
    ['ath-inf', 'φάναι'],
    ['ath-ptc', ...ntParticiple('φάς', 'φάντ', 'φᾶσα', 'φάν', 'φᾶσι'), 'φάντων'],
    ['ath-fut', 'φήσω', 'φήσεις', 'φήσει', 'φήσομεν', 'φήσετε', 'φήσουσι', 'φήσουσιν', 'φήσειν'],
    ['ath-aor', 'ἔφησα', 'ἔφησε', 'ἔφησεν', 'φῆσαι', 'φήσας', 'φήσαντος', 'φήσαντες'],
  ], {});
  // οἶδα, know.
  athematic('οἶδα', [
    ['ath-pf', 'οἶσθα', 'οἶδας', 'οἶδε', 'οἶδεν', 'ἴσμεν', 'ἴδμεν', 'οἴδαμεν', 'ἴστε', 'ἴσασι', 'ἴσασιν', 'ἴσαντι', 'οἴδασι', 'οἴδασιν'],
    ['ath-plpf', 'ᾔδη', 'ᾔδειν', 'ᾔδησθα', 'ᾔδεις', 'ᾔδει', 'ᾔδειν', 'ᾖσμεν', 'ᾔδεμεν', 'ᾖστε', 'ᾔδετε', 'ᾖσαν', 'ᾔδεσαν', 'ἤιδεε', 'ἤδεε', 'ἤδει', 'ᾔδεα', 'ἠείδει', 'ἴσαν'],
    ['ath-subj', 'εἰδῶ', 'εἰδῇς', 'εἰδῇ', 'εἰδῶμεν', 'εἰδῆτε', 'εἰδῶσι', 'εἰδῶσιν', 'εἰδέω', 'εἰδῇσι'],
    ['ath-opt', 'εἰδείην', 'εἰδείης', 'εἰδείη', 'εἰδεῖμεν', 'εἰδεῖτε', 'εἰδεῖεν'],
    ['ath-imp', 'ἴσθι', 'ἴστω', 'ἴστε', 'ἴστων'],
    ['ath-inf', 'εἰδέναι', 'ἴδμεναι', 'ἴδμεν'],
    ['ath-ptc', ...ntParticiple('εἰδώς', 'εἰδότ', 'εἰδυῖα', 'εἰδός', 'εἰδόσι'), 'εἰδότων', 'εἰδυιῶν', 'εἰδυίης', 'εἰδυίῃσι', 'ἰδυίῃσι', 'ἰδυῖα', 'ἰδυίῃσιν'],
    ['ath-fut', 'εἴσομαι', 'εἴσῃ', 'εἴσει', 'εἴσεται', 'εἰσόμεθα', 'εἴσεσθε', 'εἴσονται', 'εἴσεσθαι', 'εἰδήσω', 'εἰδήσει', 'εἰδήσειν', 'εἰσόμενος'],
  ], {});
  // κεῖμαι, lie; κάθημαι, sit; δύναμαι, can; ἐπίσταμαι, know how.
  athematic('κεῖμαι', [['ath-impf', 'ἐκείμην', 'ἔκεισο', 'ἔκειτο', 'ἐκείμεθα', 'ἔκεισθε', 'ἔκειντο'], ['ath-mid', 'κεῖσαι', 'κεῖται', 'κείμεθα', 'κεῖσθε', 'κεῖνται', 'κέαται', 'κείαται', 'κεῖτο', 'κέατο', 'κείατο', 'κεῖσο', 'κείσθω', 'κεῖσθαι', ...menosParticiple('κειμεν'), 'κέηται', 'κέωνται', 'κέοιτο', 'κείαται', 'κείατο']]);
  athematic('κάθημαι', [['ath-mid', 'κάθησαι', 'κάθηται', 'καθήμεθα', 'κάθησθε', 'κάθηνται', 'ἐκαθήμην', 'ἐκάθητο', 'καθῆστο', 'ἐκάθηντο', 'καθῆσθαι', ...menosParticiple('καθημεν'), 'κάθησο', 'καθήσθω', 'καθῆται', 'καθῆσθε', 'καθῶμαι', 'καθῆσθαι']]);
  athematic('ἧμαι', [['ath-mid', 'ἧσαι', 'ἧσται', 'ἥμεθα', 'ἧσθε', 'ἧνται', 'ἥαται', 'εἵαται', 'ἥμην', 'ἧστο', 'ἥατο', 'εἵατο', 'ἧσθαι', ...menosParticiple('ἡμεν')]]);
  for (const [lemma, stem, accentedStem] of [['δύναμαι', 'δυν', 'δύν'], ['ἐπίσταμαι', 'ἐπιστ', 'ἐπίστ']]) {
    // The subjunctive and optative are recessive, as the indicative (δύνηται, δύνωνται, δύναιτο; ἐπίστηται).
    const forms = ['ασαι', 'ᾳ', 'αται', 'άμεθα', 'ασθε', 'ανται', 'άμην', 'ασο', 'ω', 'ατο', 'άμεθα', 'αντο', 'ωμαι', 'ῃ', 'ηται', 'ώμεθα', 'ησθε', 'ωνται', 'αίμην', 'αιο', 'αιτο', 'αίμεθα', 'αισθε', 'αιντο', 'ασθαι', 'άμενος', 'αμένου', 'αμένῳ', 'άμενον', 'άμενοι', 'αμένων', 'αμένοις', 'αμένους', 'αμένη', 'αμένης', 'αμένην',
      'ήσομαι', 'ήσῃ', 'ήσεται', 'ησόμεθα', 'ήσεσθε', 'ήσονται', 'ήσεσθαι', 'ησόμενος', 'ήθην', 'ήθης', 'ήθη', 'ήθημεν', 'ήθησαν', 'ηθῆναι', 'ηθείς', 'ηθέντες', 'ηθῶ', 'ηθείην', 'ήθητε'];
    const out = [];
    // An ending without an accent takes the recessive one on the stem's last vowel (δύναται, δύνωμαι, δύνῃ).
    for (const f of forms) out.push(NFC((hasAccent(f) ? stem : accentedStem) + f));
    // ἐδυνάμην, ἠδυνάμην; ἠπιστάμην
    // An ending without an accent takes the recessive one on the stem (ἐδύνατο, ἠπίστατο).
    const aug = lemma === 'δύναμαι' ? [['ἐδυν', 'ἐδύν'], ['ἠδυν', 'ἠδύν']] : [['ἠπιστ', 'ἠπίστ']];
    const past = [];
    for (const [a, accented] of aug) {
      for (const f of ['άμην', 'ω', 'ασο', 'ατο', 'άμεθα', 'ασθε', 'αντο', 'ήθην', 'ήθης', 'ήθη', 'ήθημεν', 'ήθησαν', 'ήθητε']) past.push(NFC((hasAccent(f) ? a : accented) + f));
    }
    athematic(lemma, [['ath-mid', ...out.filter((f) => !/ήθ/u.test(f) || /ηθ[εῆῶ]/u.test(f)), ...menosParticiple(stem + 'αμεν')], ['ath-impf', ...past], ['ath-pass', ...out.filter((f) => /ήθη/u.test(f))]]);
  }
  // δίδωμι, τίθημι, ἵστημι, ἵημι, δείκνυμι.
  const mi = {
    'δίδωμι': {
      pres: ['δίδως', 'δίδωσι', 'δίδωσιν', 'δίδομεν', 'δίδοτε', 'διδόασι', 'διδόασιν', 'διδοῦσι', 'διδοῦσιν', 'δίδοτον', 'διδοῖ', 'διδοῖς'],
      impf: ['ἐδίδουν', 'ἐδίδους', 'ἐδίδου', 'ἐδίδομεν', 'ἐδίδοτε', 'ἐδίδοσαν', 'ἐδίδων', 'δίδου'],
      subj: ['διδῶ', 'διδῷς', 'διδῷ', 'διδῶμεν', 'διδῶτε', 'διδῶσι', 'διδῶσιν'],
      opt: ['διδοίην', 'διδοίης', 'διδοίη', 'διδοῖμεν', 'διδοῖτε', 'διδοῖεν', 'διδοίημεν', 'διδοίησαν'],
      imp: ['δίδου', 'διδότω', 'δίδοτε', 'διδόντων'],
      inf: ['διδόναι', 'διδοῦναι'],
      ptc: [...ntParticiple('διδούς', 'διδόντ', 'διδοῦσα', 'διδόν', 'διδοῦσι'), 'διδόντων'],
      mid: ['δίδομαι', 'δίδοσαι', 'δίδοται', 'διδόμεθα', 'δίδοσθε', 'δίδονται', 'ἐδιδόμην', 'ἐδίδοσο', 'ἐδίδοτο', 'ἐδίδοντο', 'δίδοσθαι', ...menosParticiple('διδόμεν')],
      fut: ['δώσω', 'δώσεις', 'δώσει', 'δώσομεν', 'δώσετε', 'δώσουσι', 'δώσουσιν', 'δώσειν', 'δώσων', 'δώσοντες', 'δώσομαι', 'δοθήσομαι', 'δοθήσεται', 'δώσοι', 'δώσοιεν', 'δώσοντα', 'δώσοντος', 'δώσουσα'],
      aor: ['ἔδωκα', 'ἔδωκας', 'ἔδωκε', 'ἔδωκεν', 'ἔδομεν', 'ἐδώκαμεν', 'ἔδοτε', 'ἐδώκατε', 'ἔδοσαν', 'ἔδωκαν', 'δῶ', 'δῷς', 'δῷ', 'δῶμεν', 'δῶτε', 'δῶσι', 'δῶσιν', 'δοίην', 'δοίης', 'δοίη', 'δοῖμεν', 'δοῖτε', 'δοῖεν', 'δός', 'δότω', 'δότε', 'δόντων', 'δοῦναι', 'δόμεναι', 'δόμεν',
        ...ntParticiple('δούς', 'δόντ', 'δοῦσα', 'δόν', 'δοῦσι'), 'δόντων', 'ἐδόμην', 'ἔδου', 'ἔδοτο', 'ἔδοντο', 'δόσθαι', 'δόμενος', 'δόμενοι', 'δῶκε', 'δῶκεν', 'δῶκαν', 'δόσαν'],
      pf: ['δέδωκα', 'δέδωκας', 'δέδωκε', 'δέδωκεν', 'δεδώκαμεν', 'δεδώκατε', 'δεδώκασι', 'δεδώκασιν', 'δεδωκέναι', 'δεδωκώς', 'δεδωκότες', 'δέδομαι', 'δέδοται', 'δέδονται', 'δεδόσθαι', 'δεδομένος', 'δεδομένον', 'δεδομένα', 'δεδομένοι', 'ἐδεδώκει'],
      pass: ['ἐδόθην', 'ἐδόθης', 'ἐδόθη', 'ἐδόθημεν', 'ἐδόθητε', 'ἐδόθησαν', 'δοθῇ', 'δοθῆναι', 'δοθείς', 'δοθέντος', 'δοθέντα', 'δοθέντες', 'δοθεῖσα', 'δοθέν', 'δοθέντων', 'δοθείσης'],
    },
    'τίθημι': {
      pres: ['τίθης', 'τιθεῖς', 'τίθησι', 'τίθησιν', 'τιθεῖ', 'τίθεμεν', 'τίθετε', 'τιθέασι', 'τιθέασιν', 'τιθεῖσι', 'τιθεῖσιν'],
      impf: ['ἐτίθην', 'ἐτίθεις', 'ἐτίθει', 'ἐτίθεμεν', 'ἐτίθετε', 'ἐτίθεσαν', 'τίθει'],
      subj: ['τιθῶ', 'τιθῇς', 'τιθῇ', 'τιθῶμεν', 'τιθῆτε', 'τιθῶσι', 'τιθῶσιν'],
      opt: ['τιθείην', 'τιθείης', 'τιθείη', 'τιθεῖμεν', 'τιθεῖτε', 'τιθεῖεν'],
      imp: ['τίθει', 'τιθέτω', 'τίθετε', 'τιθέντων'],
      inf: ['τιθέναι', 'τιθήμεναι'],
      ptc: [...ntParticiple('τιθείς', 'τιθέντ', 'τιθεῖσα', 'τιθέν', 'τιθεῖσι'), 'τιθέντων'],
      mid: ['τίθεμαι', 'τίθεσαι', 'τίθεται', 'τιθέμεθα', 'τίθεσθε', 'τίθενται', 'ἐτιθέμην', 'ἐτίθεσο', 'ἐτίθετο', 'ἐτίθεντο', 'τίθεσθαι', ...menosParticiple('τιθέμεν')],
      fut: ['θήσω', 'θήσεις', 'θήσει', 'θήσομεν', 'θήσετε', 'θήσουσι', 'θήσουσιν', 'θήσειν', 'θήσων', 'θήσοντες', 'θήσομαι', 'θήσεται', 'θήσονται', 'τεθήσεται', 'τεθήσομαι', 'θήσεσθαι'],
      aor: ['ἔθηκα', 'ἔθηκας', 'ἔθηκε', 'ἔθηκεν', 'ἔθεμεν', 'ἐθήκαμεν', 'ἔθετε', 'ἔθεσαν', 'ἔθηκαν', 'θῶ', 'θῇς', 'θῇ', 'θῶμεν', 'θῆτε', 'θῶσι', 'θῶσιν', 'θείην', 'θείης', 'θείη', 'θεῖμεν', 'θεῖτε', 'θεῖεν', 'θές', 'θέτω', 'θέτε', 'θέντων', 'θεῖναι', 'θέμεναι', 'θέμεν',
        ...ntParticiple('θείς', 'θέντ', 'θεῖσα', 'θέν', 'θεῖσι'), 'θέντων', 'ἐθέμην', 'ἔθου', 'ἔθετο', 'ἐθέμεθα', 'ἔθεσθε', 'ἔθεντο', 'θέσθαι', 'θέμενος', 'θεμένου', 'θέμενοι', 'θεμένων', 'θῆκε', 'θῆκεν', 'θῆκαν', 'θέτο', 'θέντο', 'θοῦ', 'θέσθω', 'θῶμαι', 'θῆται', 'θεῖτο'],
      pf: ['τέθηκα', 'τέθηκας', 'τέθηκε', 'τέθηκεν', 'τεθήκαμεν', 'τεθήκασι', 'τεθήκασιν', 'τεθηκέναι', 'τεθηκώς', 'τέθεικα', 'τέθεικε', 'τέθειμαι', 'τέθειται', 'τεθεῖσθαι', 'τεθειμένος', 'τεθειμένοι', 'τεθειμένα', 'ἐτεθήκει', 'τέθειται'],
      pass: ['ἐτέθην', 'ἐτέθης', 'ἐτέθη', 'ἐτέθημεν', 'ἐτέθητε', 'ἐτέθησαν', 'τεθῇ', 'τεθῆναι', 'τεθείς', 'τεθέντος', 'τεθέντα', 'τεθέντες', 'τεθεῖσα', 'τεθέν', 'τεθέντων'],
    },
    'ἵστημι': {
      pres: ['ἵστης', 'ἵστησι', 'ἵστησιν', 'ἵσταμεν', 'ἵστατε', 'ἱστᾶσι', 'ἱστᾶσιν'],
      impf: ['ἵστην', 'ἵστης', 'ἵστη', 'ἵσταμεν', 'ἵστατε', 'ἵστασαν'],
      subj: ['ἱστῶ', 'ἱστῇς', 'ἱστῇ', 'ἱστῶμεν', 'ἱστῆτε', 'ἱστῶσι', 'ἱστῶσιν'],
      opt: ['ἱσταίην', 'ἱσταίης', 'ἱσταίη', 'ἱσταῖμεν', 'ἱσταῖτε', 'ἱσταῖεν'],
      imp: ['ἵστη', 'ἱστάτω', 'ἵστατε', 'ἱστάντων'],
      inf: ['ἱστάναι'],
      ptc: [...ntParticiple('ἱστάς', 'ἱστάντ', 'ἱστᾶσα', 'ἱστάν', 'ἱστᾶσι'), 'ἱστάντων'],
      mid: ['ἵσταμαι', 'ἵστασαι', 'ἵσταται', 'ἱστάμεθα', 'ἵστασθε', 'ἵστανται', 'ἱστάμην', 'ἵστασο', 'ἵστατο', 'ἵσταντο', 'ἵστασθαι', ...menosParticiple('ἱστάμεν')],
      fut: ['στήσω', 'στήσεις', 'στήσει', 'στήσομεν', 'στήσετε', 'στήσουσι', 'στήσουσιν', 'στήσειν', 'στήσων', 'στήσομαι', 'στήσεται', 'στήσονται', 'στήσεσθαι', 'σταθήσομαι', 'σταθήσεται', 'ἑστήξω', 'ἑστήξει'],
      aor: ['ἔστησα', 'ἔστησας', 'ἔστησε', 'ἔστησεν', 'ἐστήσαμεν', 'ἐστήσατε', 'ἔστησαν', 'στῆσαι', 'στήσας', 'στήσαντες', 'στήσαντος', 'στῆσον', 'στήσῃ', 'στήσωσι', 'ἐστησάμην', 'ἐστήσατο', 'ἐστήσαντο', 'στήσασθαι', 'στησάμενος', 'στησάμενοι', 'στῆσε', 'στῆσεν', 'στῆσαν',
        'ἔστην', 'ἔστης', 'ἔστη', 'ἔστημεν', 'ἔστητε', 'στῶ', 'στῇς', 'στῇ', 'στῶμεν', 'στῆτε', 'στῶσι', 'στῶσιν', 'σταίην', 'σταίη', 'σταῖεν', 'στῆθι', 'στήτω', 'στῆτε', 'στῆναι', 'στήμεναι',
        ...ntParticiple('στάς', 'στάντ', 'στᾶσα', 'στάν', 'στᾶσι'), 'στάντων', 'στῆ', 'στῆσαν', 'ἔσταν', 'στάν'],
      pf: ['ἕστηκα', 'ἕστηκας', 'ἕστηκε', 'ἕστηκεν', 'ἕσταμεν', 'ἕστατε', 'ἑστᾶσι', 'ἑστᾶσιν', 'ἑστήκασι', 'ἑστήκασιν', 'ἑστάναι', 'ἑστηκέναι', 'ἑστώς', 'ἑστῶτος', 'ἑστῶτι', 'ἑστῶτα', 'ἑστῶτες', 'ἑστώτων', 'ἑστῶσι', 'ἑστῶτας', 'ἑστῶσα', 'ἑστός', 'ἑστηκώς', 'ἑστηκότες', 'ἑστηκότα', 'ἑστηκότων',
        'εἱστήκει', 'ἑστήκει', 'ἑστήκεσαν', 'ἕστασαν', 'ἑστήκειν', 'ἕσταθι', 'ἑσταίη', 'ἑστηώς', 'ἑσταότες', 'ἕστασαν'],
      pass: ['ἐστάθην', 'ἐστάθη', 'ἐστάθησαν', 'σταθῆναι', 'σταθείς', 'σταθέντες', 'σταθέντος', 'σταθεῖσα', 'σταθῇ'],
    },
    'ἵημι': {
      pres: ['ἵης', 'ἱεῖς', 'ἵησι', 'ἵησιν', 'ἵεμεν', 'ἵετε', 'ἱᾶσι', 'ἱᾶσιν', 'ἱεῖσι'],
      impf: ['ἵην', 'ἵεις', 'ἵει', 'ἵεμεν', 'ἵετε', 'ἵεσαν', 'ἵειν'],
      subj: ['ἱῶ', 'ἱῇς', 'ἱῇ', 'ἱῶμεν', 'ἱῆτε', 'ἱῶσι'],
      opt: ['ἱείην', 'ἱείη', 'ἱεῖεν'],
      imp: ['ἵει', 'ἱέτω', 'ἵετε', 'ἱέντων'],
      inf: ['ἱέναι'],
      ptc: [...ntParticiple('ἱείς', 'ἱέντ', 'ἱεῖσα', 'ἱέν', 'ἱεῖσι'), 'ἱέντων'],
      mid: ['ἵεμαι', 'ἵεσαι', 'ἵεται', 'ἱέμεθα', 'ἵεσθε', 'ἵενται', 'ἱέμην', 'ἵετο', 'ἵεντο', 'ἵεσθαι', ...menosParticiple('ἱέμεν')],
      fut: ['ἥσω', 'ἥσεις', 'ἥσει', 'ἥσομεν', 'ἥσετε', 'ἥσουσι', 'ἥσειν', 'ἥσομαι', 'ἥσεται', 'ἥσεσθαι'],
      aor: ['ἧκα', 'ἧκας', 'ἧκε', 'ἧκεν', 'εἷμεν', 'εἷτε', 'εἷσαν', 'ἥκαμεν', 'ἧκαν', 'ὧ', 'ᾗς', 'ᾗ', 'ὧμεν', 'ἧτε', 'ὧσι', 'ὧσιν', 'εἵην', 'εἵη', 'εἷμεν', 'εἷεν', 'ἕς', 'ἕτω', 'ἕτε', 'ἕντων', 'εἷναι', 'ἕμεναι',
        ...ntParticiple('εἵς', 'ἕντ', 'εἷσα', 'ἕν', 'εἷσι'), 'ἕντων', 'εἵμην', 'εἷτο', 'εἷντο', 'ἕσθαι', 'ἕμενος', 'ἕμενοι', 'ἧκε', 'ἕηκα', 'ἕηκε', 'ἕηκεν', 'ἧκαν', 'ἕσαν', 'ἕτο'],
      pf: ['εἷκα', 'εἷκε', 'εἷμαι', 'εἷται', 'εἷνται', 'εἷσθαι', 'εἱμένος', 'εἱμένοι', 'εἱμένα'],
      pass: ['εἵθην', 'εἵθη', 'εἵθησαν', 'ἑθῆναι', 'ἑθείς', 'ἑθέντες', 'ἐθείς', 'ἐθέντος', 'ἑθῇ'],
    },
    'δείκνυμι': {
      pres: ['δείκνυς', 'δείκνυσι', 'δείκνυσιν', 'δείκνυμεν', 'δείκνυτε', 'δεικνύασι', 'δεικνύασιν', 'δεικνύουσι', 'δεικνύει', 'δεικνύεις', 'δεικνύω', 'δεικνύομεν'],
      impf: ['ἐδείκνυν', 'ἐδείκνυς', 'ἐδείκνυ', 'ἐδείκνυμεν', 'ἐδείκνυτε', 'ἐδείκνυσαν', 'ἐδείκνυε', 'ἐδείκνυον'],
      subj: ['δεικνύω', 'δεικνύῃς', 'δεικνύῃ', 'δεικνύωμεν', 'δεικνύητε', 'δεικνύωσι'],
      opt: ['δεικνύοιμι', 'δεικνύοις', 'δεικνύοι', 'δεικνύοιμεν', 'δεικνύοιτε', 'δεικνύοιεν'],
      imp: ['δείκνυ', 'δεικνύτω', 'δείκνυτε', 'δεικνύντων'],
      inf: ['δεικνύναι', 'δεικνύειν'],
      ptc: [...ntParticiple('δεικνύς', 'δεικνύντ', 'δεικνῦσα', 'δεικνύν', 'δεικνῦσι'), 'δεικνύντων', 'δεικνύων', 'δεικνύοντος', 'δεικνύοντες'],
      mid: ['δείκνυμαι', 'δείκνυσαι', 'δείκνυται', 'δεικνύμεθα', 'δείκνυσθε', 'δείκνυνται', 'ἐδεικνύμην', 'ἐδείκνυτο', 'ἐδείκνυντο', 'δείκνυσθαι', ...menosParticiple('δεικνύμεν')],
    },
  };
  for (const [lemma, t] of Object.entries(mi)) {
    // ἵστημι and ἵημι lose the ἱ- of the present outside it; their compounds aspirate the preverb (καθίστημι, ἀφίημι): see buildAthematicCompounds.
    const compoundLemma = lemma === 'ἵστημι' ? 'ιστημι' : lemma === 'ἵημι' ? 'ιημι' : undefined;
    athematic(lemma, [['ath-pres', ...t.pres], ['ath-impf', ...t.impf], ['ath-subj', ...t.subj], ['ath-opt', ...t.opt], ['ath-imp', ...t.imp], ['ath-inf', ...t.inf], ['ath-ptc', ...t.ptc],
      ['ath-mid', ...t.mid], ['ath-fut', ...(t.fut ?? [])], ['ath-aor', ...(t.aor ?? [])], ['ath-pf', ...(t.pf ?? [])], ['ath-pass', ...(t.pass ?? [])]], {compoundLemma});
  }
  buildAthematicCompounds();
  // Root aorists (ἔβην, ἔγνων, ἔδυν, ἔφυν, ἔφθην, ἑάλων, ἐβίων) and a few more athematic forms.
  athematic('βαίνω', [['ath-aor', 'ἔβην', 'ἔβης', 'ἔβη', 'ἔβημεν', 'ἔβητε', 'ἔβησαν', 'ἔβαν', 'βῆ', 'βῆν', 'βάν', 'βῶ', 'βῇς', 'βῇ', 'βῶμεν', 'βῆτε', 'βῶσι', 'βῶσιν', 'βαίην', 'βαίης', 'βαίη', 'βαῖμεν', 'βαῖτε', 'βαῖεν', 'βῆθι', 'βήτω', 'βῆτε', 'βάντων', 'βῆναι', 'βήμεναι', 'βῆμεν', ...ntParticiple('βάς', 'βάντ', 'βᾶσα', 'βάν', 'βᾶσι')]]);
  athematic('γιγνώσκω', [['ath-aor', 'ἔγνων', 'ἔγνως', 'ἔγνω', 'ἔγνωμεν', 'ἔγνωτε', 'ἔγνωσαν', 'γνῶ', 'γνῷς', 'γνῷ', 'γνῶμεν', 'γνῶτε', 'γνῶσι', 'γνῶσιν', 'γνοίην', 'γνοίης', 'γνοίη', 'γνοῖμεν', 'γνοῖτε', 'γνοῖεν', 'γνῶθι', 'γνώτω', 'γνῶναι', 'γνώμεναι', ...ntParticiple('γνούς', 'γνόντ', 'γνοῦσα', 'γνόν', 'γνοῦσι'), 'γνῶ', 'γνῶσαν', 'γνώω']]);
  athematic('γινώσκω', [['ath-aor', 'ἔγνων', 'ἔγνω', 'ἔγνωσαν', 'γνῶναι', 'γνούς', 'γνόντες', 'γνῷ']]);
  athematic('δύω', [['ath-aor', 'ἔδυν', 'ἔδυς', 'ἔδυ', 'ἔδυμεν', 'ἔδυτε', 'ἔδυσαν', 'δῦ', 'δῦναι', 'δύμεναι', 'δῦθι', ...ntParticiple('δύς', 'δύντ', 'δῦσα', 'δύν', 'δῦσι'), 'δύω', 'δύῃ']]);
  athematic('φύω', [['ath-aor', 'ἔφυν', 'ἔφυς', 'ἔφυ', 'ἔφυμεν', 'ἔφυτε', 'ἔφυσαν', 'φῦ', 'φῦναι', ...ntParticiple('φύς', 'φύντ', 'φῦσα', 'φύν', 'φῦσι'), 'φύω', 'φύῃ']]);
  athematic('φθάνω', [['ath-aor', 'ἔφθην', 'ἔφθης', 'ἔφθη', 'ἔφθημεν', 'ἔφθητε', 'ἔφθησαν', 'φθῆ', 'φθῆναι', 'φθαίη', 'φθάς', 'φθάντες', 'φθάντα', ...menosParticiple('φθαμεν'), 'φθάσας', 'φθάσαι', 'ἔφθασα', 'ἔφθασε', 'ἔφθασεν', 'φθήσομαι', 'φθήσεται']]);
  athematic('ἁλίσκομαι', [['ath-aor', 'ἑάλων', 'ἑάλως', 'ἑάλω', 'ἑάλωμεν', 'ἑάλωσαν', 'ἥλων', 'ἥλω', 'ἥλωσαν', 'ἁλῶ', 'ἁλῷ', 'ἁλῶσι', 'ἁλοίην', 'ἁλοίη', 'ἁλῶναι', ...ntParticiple('ἁλούς', 'ἁλόντ', 'ἁλοῦσα', 'ἁλόν', 'ἁλοῦσι'), 'ἁλώσομαι', 'ἁλώσεται', 'ἑάλωκα', 'ἑάλωκε', 'ἑαλώκασι', 'ἥλωκα', 'ἥλωκε', ...ntParticiple('ἑαλωκώς', 'ἑαλωκότ', 'ἑαλωκυῖα', 'ἑαλωκός', 'ἑαλωκόσι')]]);
  athematic('βιόω', [['ath-aor', 'ἐβίων', 'ἐβίως', 'ἐβίω', 'ἐβίωσαν', 'βιῶναι', 'βιῷ', 'βιοίην', ...ntParticiple('βιούς', 'βιόντ', 'βιοῦσα', 'βιόν', 'βιοῦσι')]]);
  athematic('σβέννυμι', [['ath-aor', 'ἔσβην', 'ἔσβη', 'σβῆναι']]);
  athematic('πέτομαι', [['ath-aor', 'ἐπτάμην', 'ἔπτατο', 'ἔπταντο', 'πτάσθαι', ...menosParticiple('πταμεν'), 'πτῆναι', 'ἔπτην', 'ἔπτη']]);
  athematic('ἔχω', [['ath-imp', 'σχές', 'σχέτω', 'σχέτε', 'σχεῖν', 'σχοίην', 'σχοίη', 'σχῶ', 'σχῇ', 'σχῶσι']]);
  athematic('πίνω', [['ath-imp', 'πῖθι', 'πίε']]);
  // Generic athematic -αμαι presents (μάρναμαι, κίδναμαι, πέταμαι, κρέμαμαι, ἄγαμαι, ἔραμαι, πέρναμαι).
  transform('amai', 'present (-αμαι)', 'Present system of an athematic -αμαι verb: -ασαι, -αται, -άμεθα, -ασθε, -ανται, -άμην, -ατο, -αντο, -ασθαι, -άμενος.');
  for (const e of ['ασαι', 'αται', 'αμεθα', 'αμεσθα', 'ασθε', 'ανται', 'αμην', 'ασο', 'ατο', 'αντο', 'ασθαι', 'αμενος', 'αμενου', 'αμενῳ', 'αμενον', 'αμενοι', 'αμενων', 'αμενοις', 'αμενους', 'αμενη', 'αμενης', 'αμενῃ', 'αμενην', 'αμεναι', 'αμενα', 'αμενοιο', 'αμενοισι', 'αμενοισιν']) {
    suffix('amai', e, 'αμαι', [], ['v'], {then: THEN_STRIP_ACCENTS, stem: {stemMinLength: 2}});
  }
  athematic('οἶδα', [['ath-pf', 'σύνοιδα']], {compound: false});
  athematic('εἶμι', [['ath-fut', 'εἴσομαι', 'εἴσεται', 'εἰσόμεθα', 'εἴσονται']], {compound: false});
  athematic('ἔοικα', [['ath-pf', 'ἔοικας', 'ἔοικε', 'ἔοικεν', 'ἐοίκαμεν', 'ἔοιγμεν', 'ἐοίκατε', 'ἐοίκασι', 'ἐοίκασιν', 'εἴξασι', 'ἐοικέναι', 'εἰκέναι', ...ntParticiple('ἐοικώς', 'ἐοικότ', 'ἐοικυῖα', 'ἐοικός', 'ἐοικόσι'), ...ntParticiple('εἰκώς', 'εἰκότ', 'εἰκυῖα', 'εἰκός', 'εἰκόσι')],
    ['ath-plpf', 'ἐῴκειν', 'ἐῴκει', 'ἐῴκεσαν', 'ἐῴκη', 'ἐοίκει']]);
  athematic('δείδω', [['ath-pf', 'δέδοικα', 'δέδοικας', 'δέδοικε', 'δέδοικεν', 'δεδοίκαμεν', 'δεδοίκατε', 'δεδοίκασι', 'δεδοίκασιν', 'δέδια', 'δέδιας', 'δέδιε', 'δέδιεν', 'δέδιμεν', 'δέδιτε', 'δεδίασι', 'δεδίασιν', 'δείδια', 'δείδιε', 'δείδιμεν', 'δείδιτε', 'δεδιέναι', 'δεδοικέναι',
    ...ntParticiple('δεδοικώς', 'δεδοικότ', 'δεδοικυῖα', 'δεδοικός', 'δεδοικόσι'), ...ntParticiple('δεδιώς', 'δεδιότ', 'δεδιυῖα', 'δεδιός', 'δεδιόσι'), 'δείδιθι', 'δέδιθι'],
    ['ath-plpf', 'ἐδεδοίκειν', 'ἐδεδοίκει', 'ἐδεδίεσαν', 'ἐδεδίει', 'δείδισαν']]);
  athematic('γηράσκω', [['ath-aor', 'ἐγήρα', 'γηρᾶναι', 'γηράναι', 'γηράς', 'γηράντα', 'γηράσας']]);
  // Other -νυμι verbs follow δείκνυμι: the present system on -νυ-, with the thematic -νύω beside it.
  transform('nymi', 'present (-νυμι)', 'Present system of a -νυμι verb: -νυς, -νυσι, -νυμεν, -νυτε, -νύασι; -νυν, -νυ; -νύναι; -νύς, -νύντος; -νυμαι, -νυται, -νυσθαι, -νύμενος.');
  for (const e of ['νυς', 'νυσι', 'νυσιν', 'νυμεν', 'νυτε', 'νυασι', 'νυασιν', 'νυν', 'νυ', 'νυναι', 'νυς', 'νυντος', 'νυντι', 'νυντα', 'νυντες', 'νυντων', 'νυσα', 'νυν', 'νυμαι', 'νυσαι', 'νυται', 'νυμεθα', 'νυσθε', 'νυνται', 'νυμην', 'νυτο', 'νυντο', 'νυσθαι', 'νυμενος', 'νυμενου', 'νυμενον', 'νυμενοι', 'νυμενων', 'νυμενη', 'νυμενην', 'νυμενα']) {
    suffix('nymi', e, 'νυμι', [], ['v'], {then: THEN_STRIP_ACCENTS});
    if (/^(νυν|νυ|νυς|νυμεν|νυτε|νυσαν|νυμην|νυσο|νυτο|νυμεθα|νυσθε|νυντο)$/u.test(e)) suffix('nymi', e, 'νυμι', [], ['aug'], {then: THEN_STRIP_ACCENTS});
  }
}

/** Compounds of ἵστημι and ἵημι: the preverb before a rough breathing (καθ-ίστημι), not before στ- (κατα-στήσας). */
function buildAthematicCompounds() {
  transform('compound', 'compound', 'The dictionary form of a compound of ἵστημι or ἵημι: the preverb before a rough breathing (καταστήσας → καθίστημι, ἀπέστη → ἀφίστημι, ἀφεῖναι → ἀφίημι).');
  const pairs = [
    ['', 'ἱ'], ['κατα', 'καθ'], ['κατ', 'καθ'], ['ἀπο', 'ἀφ'], ['ἀπ', 'ἀφ'], ['ἐπι', 'ἐφ'], ['ἐπ', 'ἐφ'], ['ὑπο', 'ὑφ'], ['ὑπ', 'ὑφ'], ['μετα', 'μεθ'], ['μετ', 'μεθ'],
    ['ἀντι', 'ἀνθ'], ['ἀντ', 'ἀνθ'], ['ἀνα', 'ἀν'], ['παρα', 'παρ'], ['δια', 'δι'], ['συ', 'συν'], ['ξυ', 'ξυν'], ['ἐκ', 'ἐξ'], ['προ', 'προϊ'], ['ἀμφι', 'ἀμφ'],
    ['ἐπανα', 'ἐπαν'], ['ἀντικατα', 'ἀντικαθ'], ['συγκατα', 'συγκαθ'], ['ἀποκατα', 'ἀποκαθ'], ['παρακατα', 'παρακαθ'], ['συναπο', 'συναφ'], ['ἐξανα', 'ἐξαν'], ['ἐπικατα', 'ἐπικαθ'],
  ];
  for (const verb of ['ιστημι', 'ιημι']) {
    for (const [a, b] of pairs) {
      const from = a + verb;
      const to = b === 'προϊ' ? 'προϊ' + verb.slice(1) : b === 'ἱ' ? 'ἱ' + verb.slice(1) : b + verb;
      if (from !== to) add('compound', {type: 'wholeWord', inflected: NFC(from), deinflected: NFC(to), conditionsIn: ['v'], conditionsOut: ['v']});
    }
  }
}

// The article, pronouns, numerals and other own paradigms; the dictionary gives them no part of speech, nor do these.

const PENDING_CLOSED = [];

// Comparatives that are headwords (ἀμείνων, πλείων) read as themselves, others as the positive; -ττ- as -σσ-.
const COMPARISON_LEMMAS = [
  [/^αμειν/u, 'ἀμείνων'], [/^βελτιστ/u, 'βέλτιστος'], [/^βελτι/u, 'βελτίων'], [/^κρει(ττ|σσ)/u, 'κρείσσων'], [/^αριστ/u, 'ἄριστος'],
  [/^κρατιστ/u, 'κράτιστος'], [/^χειριστ/u, 'χείριστος'], [/^χειρ/u, 'χείρων'], [/^ηκιστ/u, 'ἥκιστος'], [/^η(ττ|σσ)/u, 'ἥσσων'],
  [/^μεγιστ/u, 'μέγιστος'], [/^με[ι]?ζ/u, 'μείζων'], [/^πλειστ/u, 'πλεῖστος'], [/^πλε/u, 'πλείων'], [/^ελαχιστ/u, 'ἐλάχιστος'],
  [/^ελα(ττ|σσ)/u, 'ἐλάσσων'], [/^μει/u, 'μείων'], [/^θα(ττ|σσ)/u, 'θάσσων'],
];

/**
 * -ίων and -ιστος of an adjective in -ρός, which lose the ρ (ἐχθρός: ἔχθιστος, not ἔχθος "hatred"); `stem` is
 * written with the recessive accent (ἔχθ), `plain` without (ἐχθ).
 */
function rhoComparison(stem, plain) {
  const cmp = ['ίων', 'ίονος', 'ίονι', 'ίονα', 'ίω', 'ίονες', 'ίους', 'ιόνων', 'ίοσι', 'ίοσιν'].map((e) => plain + e);
  const sup = ['ίστη', 'ίστου', 'ίστης', 'ίστῳ', 'ίστῃ', 'ίστην', 'ίστων', 'ίστοις', 'ίσταις', 'ίστους', 'ίστας'].map((e) => plain + e);
  return [...cmp, stem + 'ιον', ...sup, ...['ιστος', 'ιστον', 'ιστοι', 'ισται', 'ιστα'].map((e) => stem + e)];
}

function closed(tid, name, description, lemma, forms, opts = {}) {
  transform(tid, name, description);
  for (const f of forms) {
    if (!f || NFC(f) === NFC(lemma)) continue;
    const own = tid === 'comparison' ? COMPARISON_LEMMAS.find(([re]) => re.test(stripAll(f))) : undefined;
    const target = own ? own[1] : lemma;
    if (NFC(f) === NFC(target)) continue;
    PENDING_CLOSED.push([tid, NFC(f), NFC(target), opts]);
  }
}

/** Closed-class forms; of four letters or more a suffix rule, unless it ends another (κεῖνος in ἐκεῖνος). */
function flushClosed() {
  const lemmas = [...new Set(PENDING_CLOSED.map(([, , l]) => l))];
  for (const [tid, f, lemma, opts] of PENDING_CLOSED) {
    const loops = lemmas.some((l) => l.endsWith(f) || stripAll(l).endsWith(stripAll(f)));
    if ([...f].length >= 4 && !opts.whole && !loops) suffix(tid, f, lemma, [], opts.out ?? [], {writtenOnly: true});
    else whole(tid, f, lemma, [], opts.out ?? [], {writtenOnly: true});
  }
  PENDING_CLOSED.length = 0;
}

function buildClosedClasses() {
  const D = 'Forms of the article, pronouns and numerals, which have paradigms of their own.';
  closed('article', 'article', 'The definite article ὁ, ἡ, τό.', 'ὁ', ['ἡ', 'τό', 'τοῦ', 'τῆς', 'τῷ', 'τῇ', 'τόν', 'τήν', 'οἱ', 'αἱ', 'τά', 'τῶν', 'τοῖς', 'ταῖς', 'τούς', 'τάς', 'τώ', 'τοῖν', 'ταῖν', 'τοῖσι', 'τοῖσιν', 'τῇσι', 'τῇσιν', 'τοί', 'ταί', 'τοῖο', 'τάων', 'τᾶς', 'τᾷ', 'τάν', 'ἁ'], {whole: true});
  closed('pronoun', 'pronoun', D, 'ἐγώ', ['ἐμοῦ', 'μου', 'ἐμοί', 'μοι', 'ἐμέ', 'με', 'ἐμεῖο', 'ἐμέο', 'ἐμεῦ', 'μευ', 'ἐμέθεν', 'ἔγωγε', 'ἔμοιγε', 'ἔμεγε', 'ἐγών', 'μοί', 'μέ', 'μού', 'γώ', 'γὼ', 'νῶ', 'νῷν', 'νῶι', 'νῶϊ', 'νῶιν', 'νῶϊν']);
  closed('pronoun', 'pronoun', D, 'σφεῖς', ['σφῶν', 'σφίσι', 'σφίσιν', 'σφᾶς', 'σφέας', 'σφεας', 'σφέων', 'σφε', 'σφι', 'σφιν', 'σφωε', 'σφωϊν', 'σφέα', 'σφεα']);
  closed('pronoun', 'pronoun', D, 'ἡμεῖς', ['ἡμῶν', 'ἡμῖν', 'ἡμᾶς', 'ἡμέων', 'ἡμεῖων', 'ἡμῖν', 'ἧμιν', 'ἡμέας', 'ἄμμες', 'ἄμμι', 'ἄμμε', 'νῶ', 'νῷν', 'νῶι', 'νῶϊ']);
  closed('pronoun', 'pronoun', D, 'σύ', ['σοῦ', 'σου', 'σοί', 'σοι', 'σέ', 'σε', 'τοι', 'σεῖο', 'σέο', 'σεῦ', 'σευ', 'τεοῖο', 'σέθεν', 'τύνη', 'τοί', 'τέ', 'σύγε', 'τυ', 'τίν', 'τεΐν']);
  closed('pronoun', 'pronoun', D, 'ὑμεῖς', ['ὑμῶν', 'ὑμῖν', 'ὑμᾶς', 'ὑμέων', 'ὕμμες', 'ὔμμες', 'ὕμμι', 'ὔμμι', 'ὕμμε', 'ὔμμε', 'ὑμέας', 'σφῶϊ', 'σφῷν', 'σφώ', 'σφῶιν']);
  closed('pronoun', 'pronoun', D, 'οὗ', ['οὑ', 'οἷ', 'οἱ', 'ἕ', 'ἑ', 'σφεῖς', 'σφῶν', 'σφίσι', 'σφίσιν', 'σφᾶς', 'σφέα', 'σφε', 'σφι', 'σφιν', 'σφας', 'σφέων', 'σφεων', 'ἑοῦ', 'εἷο', 'ἕο', 'ἑέ', 'ἑοῖ', 'ἕθεν', 'μιν', 'νιν', 'σφισι', 'σφισιν']);
  // αὐτός and the demonstratives.
  const adj212 = (m, f, n) => {
    const [mb, fb, nb] = [m.slice(0, -2), f.slice(0, -1), n.slice(0, -1)];
    return [];
  };
  closed('pronoun', 'pronoun', D, 'αὐτός', ['αὐτή', 'αὐτό', 'αὐτοῦ', 'αὐτῆς', 'αὐτῷ', 'αὐτῇ', 'αὐτόν', 'αὐτήν', 'αὐτοί', 'αὐταί', 'αὐτά', 'αὐτῶν', 'αὐτοῖς', 'αὐταῖς', 'αὐτούς', 'αὐτάς', 'αὐτώ', 'αὐτοῖν', 'αὐτοῖσι', 'αὐτοῖσιν', 'αὐτῇσι', 'αὐτῇσιν', 'αὐτέων', 'αὐτέου', 'αὐτοῖο', 'αὐτῆφι', 'αὐτόφι', 'αὐτάων', 'αὐτοὶ', 'αὐτᾶς', 'αὐτᾷ', 'αὐτάν']);
  closed('pronoun', 'pronoun', D, 'οὗτος', ['αὕτη', 'τοῦτο', 'τούτου', 'ταύτης', 'τούτῳ', 'ταύτῃ', 'τοῦτον', 'ταύτην', 'οὗτοι', 'αὗται', 'ταῦτα', 'τούτων', 'τούτοις', 'ταύταις', 'τούτους', 'ταύτας', 'τούτω', 'τούτοιν', 'τούτοισι', 'τούτοισιν', 'ταύτῃσι', 'ταύτῃσιν', 'τουτέων', 'τουτέου', 'τουτέῳ', 'τουτέων', 'ταυτέων', 'οὑτοσί', 'αὑτηί', 'τουτί', 'τουτουί', 'ταυτηί', 'τουτονί', 'ταυτί', 'τουτοισί', 'οὑτοσίν', 'τουτοΐ', 'ταυτῃί']);
  closed('pronoun', 'pronoun', D, 'ὅδε', ['ἥδε', 'τόδε', 'τοῦδε', 'τῆσδε', 'τῷδε', 'τῇδε', 'τόνδε', 'τήνδε', 'οἵδε', 'αἵδε', 'τάδε', 'τῶνδε', 'τοῖσδε', 'ταῖσδε', 'τούσδε', 'τάσδε', 'τοῖσδεσι', 'τοῖσδεσσι', 'τοίσδεσσι', 'τοίσδεσι', 'τοισίδε', 'τώδε', 'τοῖνδε', 'ὁδί', 'ἡδί', 'τοδί', 'τουδί', 'τῳδί', 'τονδί', 'τηνδί', 'ταδί', 'τᾶσδε', 'τάνδε']);
  for (const [lemma, stem] of [['τοιόσδε', 'τοι'], ['τοσόσδε', 'τοσ'], ['τηλικόσδε', 'τηλικ']]) {
    closed('pronoun', 'pronoun', D, lemma, ['άδε', 'όνδε', 'οῦδε', 'ᾶσδε', 'ῷδε', 'ᾷδε', 'άνδε', 'οίδε', 'αίδε', 'ῶνδε', 'οῖσδε', 'αῖσδε', 'ούσδε', 'άσδε', 'ήδε', 'ῆσδε', 'ῇδε', 'ήνδε', 'όνδ’', 'άδ’', 'άνδ’', 'οίδ’', 'αίδ’'].map((e) => stem + e));
  }
  closed('pronoun', 'pronoun', D, 'ἐκεῖνος', ['ἐκείνη', 'ἐκεῖνο', 'ἐκείνου', 'ἐκείνης', 'ἐκείνῳ', 'ἐκείνῃ', 'ἐκεῖνον', 'ἐκείνην', 'ἐκεῖνοι', 'ἐκεῖναι', 'ἐκεῖνα', 'ἐκείνων', 'ἐκείνοις', 'ἐκείναις', 'ἐκείνους', 'ἐκείνας', 'κεῖνος', 'κείνη', 'κεῖνο', 'κείνου', 'κείνης', 'κείνῳ', 'κείνῃ', 'κεῖνον', 'κείνην', 'κεῖνοι', 'κεῖναι', 'κεῖνα', 'κείνων', 'κείνοις', 'κείνους', 'κείνας', 'κείνοισι', 'ἐκεινοσί', 'ἐκεινουί', 'ἐκείνοισι', 'κεῖνοι']);
  // Relatives and interrogatives.
  closed('pronoun', 'pronoun', D, 'ὅς', ['ἥ', 'ὅ', 'οὗ', 'ἧς', 'ᾧ', 'ᾗ', 'ὅν', 'ἥν', 'οἵ', 'αἵ', 'ἅ', 'ὧν', 'οἷς', 'αἷς', 'οὕς', 'ἅς', 'ὅου', 'οὗ', 'ἧσι', 'οἷσι', 'οἷσιν', 'ᾗσι', 'ᾗσιν', 'ἧς', 'ἕης', 'ὅο', 'ἇς', 'ἅν']);
  closed('pronoun', 'pronoun', D, 'ὅστις', ['ἥτις', 'ὅτι', 'ὅ τι', 'οὗτινος', 'ὅτου', 'ἧστινος', 'ᾧτινι', 'ὅτῳ', 'ᾗτινι', 'ὅντινα', 'ἥντινα', 'οἵτινες', 'αἵτινες', 'ἅτινα', 'ἅττα', 'ὧντινων', 'ὅτων', 'οἷστισι', 'οἷστισιν', 'ὅτοις', 'αἷστισι', 'οὕστινας', 'ἅστινας', 'ὅτεο', 'ὅττεο', 'ὅτευ', 'ὅτεῳ', 'ὅτεων', 'ὅτεοισι', 'ὅττι', 'ὅντιν', 'ὅτις', 'ὅτινα', 'ὅτινας', 'ὅτινες']);
  closed('pronoun', 'pronoun', D, 'τίς', ['τί', 'τίνος', 'τοῦ', 'τίνι', 'τῷ', 'τίνα', 'τίνες', 'τίνων', 'τίσι', 'τίσιν', 'τίνας', 'τέο', 'τεῦ', 'τέῳ', 'τέων', 'τέοισι', 'τίπτε', 'τίη']);
  closed('pronoun', 'pronoun', D, 'τις', ['τι', 'τινός', 'τινος', 'του', 'τινί', 'τινι', 'τῳ', 'τινά', 'τινα', 'τινές', 'τινες', 'τινῶν', 'τινων', 'τισί', 'τισίν', 'τισι', 'τισιν', 'τινάς', 'τινας', 'ἄττα', 'ἄσσα', 'τευ', 'τεο', 'τεῳ', 'τεων', 'τέ', 'τὶς', 'τίς', 'τί']);
  closed('pronoun', 'pronoun', D, 'ἀλλήλων', ['ἀλλήλοις', 'ἀλλήλαις', 'ἀλλήλους', 'ἀλλήλας', 'ἄλληλα', 'ἀλλήλοιν', 'ἀλλήλοισι', 'ἀλλήλοισιν', 'ἀλλήλῃσι', 'ἀλλήλοιιν']);
  for (const [lemma, stem] of [['ἑαυτοῦ', 'ἑαυτ'], ['ἐμαυτοῦ', 'ἐμαυτ'], ['σεαυτοῦ', 'σεαυτ'], ['αὑτοῦ', 'αὑτ'], ['ἑαυτοῦ', 'αὑτ'], ['σαυτοῦ', 'σαυτ'], ['σεαυτοῦ', 'σαυτ'], ['ἑαυτοῦ', 'ἑωυτ'], ['ἑαυτοῦ', 'ἐωυτ']]) {
    closed('pronoun', 'pronoun', D, lemma, ['οῦ', 'ῆς', 'ῷ', 'ῇ', 'όν', 'ήν', 'ό', 'ῶν', 'οῖς', 'αῖς', 'ούς', 'άς', 'ά', 'οῖσι', 'ῇσι', 'έων'].map((e) => stem + e));
  }
  // πᾶς, εἷς, οὐδείς, μηδείς, numerals.
  closed('pronoun', 'pronoun', D, 'πᾶς', ['πᾶσα', 'πᾶν', 'παντός', 'πάσης', 'παντί', 'πάσῃ', 'πάντα', 'πᾶσαν', 'πάντες', 'πᾶσαι', 'πάντων', 'πασῶν', 'πᾶσι', 'πᾶσιν', 'πάσαις', 'πάντας', 'πάσας', 'πάσῃσι', 'πάσῃσιν', 'πάντεσσι', 'πάντεσσιν', 'πασέων', 'πασάων', 'πάντεσι', 'πᾶσα', 'πάσᾳ', 'πάσας', 'πάσαν']);
  closed('pronoun', 'pronoun', D, 'ἅπας', ['ἅπασα', 'ἅπαν', 'ἅπαντος', 'ἁπάσης', 'ἅπαντι', 'ἁπάσῃ', 'ἅπαντα', 'ἅπασαν', 'ἅπαντες', 'ἅπασαι', 'ἁπάντων', 'ἁπασῶν', 'ἅπασι', 'ἅπασιν', 'ἁπάσαις', 'ἅπαντας', 'ἁπάσας']);
  closed('pronoun', 'pronoun', D, 'σύμπας', ['σύμπασα', 'σύμπαν', 'σύμπαντος', 'συμπάσης', 'σύμπαντι', 'σύμπαντα', 'σύμπασαν', 'σύμπαντες', 'συμπάντων', 'σύμπασι', 'σύμπασιν', 'σύμπαντας', 'ξύμπας', 'ξύμπαντες', 'ξύμπασα', 'ξυμπάντων', 'ξύμπαντα']);
  closed('numeral', 'numeral', 'Forms of the numerals εἷς, δύο, τρεῖς, τέτταρες and of οὐδείς, μηδείς.', 'εἷς', ['μία', 'ἕν', 'ἑνός', 'μιᾶς', 'ἑνί', 'μιᾷ', 'ἕνα', 'μίαν', 'μιῆς', 'μιῇ', 'ἴα', 'ἰῆς', 'ἰῷ', 'ἰῇ', 'ἴαν']);
  closed('numeral', 'numeral', '', 'οὐδείς', ['οὐδεμία', 'οὐδέν', 'οὐδενός', 'οὐδεμιᾶς', 'οὐδενί', 'οὐδεμιᾷ', 'οὐδένα', 'οὐδεμίαν', 'οὐδένες', 'οὐδένων', 'οὐδέσι', 'οὐδέσιν', 'οὐδένας', 'οὐθείς', 'οὐθέν', 'οὐθενός', 'οὐθενί', 'οὐθένα', 'οὐδαμά']);
  closed('numeral', 'numeral', '', 'μηδείς', ['μηδεμία', 'μηδέν', 'μηδενός', 'μηδεμιᾶς', 'μηδενί', 'μηδεμιᾷ', 'μηδένα', 'μηδεμίαν', 'μηδένες', 'μηδένων', 'μηδέσι', 'μηδένας', 'μηθείς', 'μηθέν', 'μηθενός', 'μηθενί']);
  closed('numeral', 'numeral', '', 'δύο', ['δυοῖν', 'δυεῖν', 'δυσί', 'δυσίν', 'δύω', 'δοιώ', 'δοιοί', 'δοιαί', 'δοιά', 'δοιούς', 'δοιοῖσι']);
  closed('numeral', 'numeral', '', 'τρεῖς', ['τρία', 'τριῶν', 'τρισί', 'τρισίν', 'τρεῖς', 'τρίς']);
  closed('numeral', 'numeral', '', 'τέτταρες', ['τέτταρα', 'τεττάρων', 'τέτταρσι', 'τέτταρσιν', 'τέτταρας', 'τέσσαρες', 'τέσσαρα', 'τεσσάρων', 'τέσσαρσι', 'τέσσαρσιν', 'τέσσαρας', 'πίσυρες', 'πίσυρας']);
  closed('numeral', 'numeral', '', 'τέσσαρες', ['τέσσαρα', 'τεσσάρων', 'τέσσαρσι', 'τέσσαρσιν', 'τέσσαρας']);
  closed('impersonal', 'impersonal verb', 'Forms of the impersonal verbs χρή and δεῖ.', 'χρή', ['χρῆν', 'ἐχρῆν', 'χρῆναι', 'χρείη', 'χρῇ', 'χρεών', 'χρῆσται', 'χρῆσθαι'], {out: ['v']});
  closed('impersonal', 'impersonal verb', '', 'δεῖ', ['ἔδει', 'δεῖν', 'δέῃ', 'δέοι', 'δέον', 'δεήσει', 'ἐδέησε', 'ἐδέησεν', 'δεήσειν', 'δεῖσθαι'], {out: ['v']});
  // Nouns with irregular stems.
  closed('irregular-noun', 'irregular noun', 'Nouns whose stems change (υἱός, γυνή, ἀνήρ, Ζεύς, ναῦς, βοῦς, πούς, γῆ, ὗς).', 'υἱός', ['υἱέος', 'υἱεῖ', 'υἱέα', 'υἱεῖς', 'υἱέων', 'υἱέσι', 'υἱέσιν', 'υἷος', 'υἷι', 'υἷα', 'υἷες', 'υἷας', 'υἷϊ', 'υἱέε', 'υἱέοιν', 'υἱῆος', 'υἱέϊ'], {out: ['n']});
  closed('irregular-noun', 'irregular noun', '', 'γυνή', ['γυναικός', 'γυναικί', 'γυναῖκα', 'γύναι', 'γυναῖκες', 'γυναικῶν', 'γυναιξί', 'γυναιξίν', 'γυναῖκας', 'γυναῖκε', 'γυναικοῖν'], {out: ['n']});
  closed('irregular-noun', 'irregular noun', '', 'ἀνήρ', ['ἀνδρός', 'ἀνδρί', 'ἄνδρα', 'ἄνερ', 'ἄνδρες', 'ἀνδρῶν', 'ἀνδράσι', 'ἀνδράσιν', 'ἄνδρας', 'ἄνδρε', 'ἀνδροῖν', 'ἀνέρος', 'ἀνέρι', 'ἀνέρα', 'ἀνέρες', 'ἀνέρας', 'ἀνέρων', 'ἄνδρεσσι', 'ἄνδρεσσιν', 'ἀνέρε'], {out: ['n']});
  closed('irregular-noun', 'irregular noun', '', 'Ζεύς', ['Διός', 'Διί', 'Δία', 'Ζεῦ', 'Ζηνός', 'Ζηνί', 'Ζῆνα', 'Δεύς', 'Δῖα']);
  closed('irregular-noun', 'irregular noun', '', 'ναῦς', ['νεώς', 'νηί', 'νηΐ', 'ναῦν', 'νῆες', 'νεῶν', 'ναυσί', 'ναυσίν', 'νηός', 'νεός', 'νῆα', 'νέα', 'νηῶν', 'νηυσί', 'νηυσίν', 'νήεσσι', 'νήεσσιν', 'νέεσσι', 'νῆας', 'νέας', 'νᾶες', 'νᾶας', 'ναός', 'νᾶα', 'νῆε'], {out: ['n']});
  closed('irregular-noun', 'irregular noun', '', 'βοῦς', ['βοός', 'βοΐ', 'βοῦν', 'βόες', 'βοῶν', 'βουσί', 'βουσίν', 'βόεσσι', 'βόεσσιν', 'βόας', 'βοῦς', 'βῶν', 'βόε'], {out: ['n']});
  closed('irregular-noun', 'irregular noun', '', 'πούς', ['ποδός', 'ποδί', 'πόδα', 'πόδες', 'ποδῶν', 'ποσί', 'ποσίν', 'ποσσί', 'ποσσίν', 'πόδεσσι', 'πόδεσσιν', 'πόδας', 'πόδε', 'ποδοῖν', 'ποδοῖιν'], {out: ['n']});
  closed('irregular-noun', 'irregular noun', '', 'γῆ', ['γῆς', 'γῇ', 'γῆν', 'γαῖα', 'γαίης', 'γαίῃ', 'γαῖαν', 'γᾶ', 'γᾶς', 'γᾷ', 'γᾶν'], {out: ['n']});
  closed('irregular-noun', 'irregular noun', '', 'ὗς', ['ὑός', 'ὑί', 'ὗν', 'ὕες', 'ὑῶν', 'ὑσί', 'ὕας', 'σῦς', 'συός', 'συί', 'σῦν', 'σύες', 'συῶν', 'συσί', 'σύεσσι', 'σύας', 'σῦς'], {out: ['n']});
  closed('irregular-noun', 'irregular noun', '', 'χείρ', ['χειρός', 'χειρί', 'χεῖρα', 'χεῖρες', 'χειρῶν', 'χερσί', 'χερσίν', 'χεῖρας', 'χερός', 'χερί', 'χέρα', 'χέρες', 'χερῶν', 'χείρεσσι', 'χείρεσσιν', 'χέρας', 'χεῖρε', 'χεροῖν', 'χειροῖν', 'χεῖρε'], {out: ['n']});
  closed('irregular-noun', 'irregular noun', '', 'οὖς', ['ὠτός', 'ὠτί', 'ὦτα', 'ὤτων', 'ὠσί', 'ὠσίν', 'οὔατος', 'οὔατα', 'οὔασι', 'οὔασιν', 'ὦτε'], {out: ['n']});
  closed('irregular-noun', 'irregular noun', '', 'ὕδωρ', ['ὕδατος', 'ὕδατι', 'ὕδατα', 'ὑδάτων', 'ὕδασι', 'ὕδασιν', 'ὕδει'], {out: ['n']});
  closed('irregular-noun', 'irregular noun', '', 'πῦρ', ['πυρός', 'πυρί', 'πυρά', 'πυρῶν', 'πυροῖς'], {out: ['n']});
  closed('irregular-noun', 'irregular noun', '', 'γόνυ', ['γόνατος', 'γόνατι', 'γόνατα', 'γονάτων', 'γόνασι', 'γόνασιν', 'γουνός', 'γουνί', 'γούνατα', 'γούνασι', 'γούνων', 'γούνατος', 'γούνατι', 'γοῦνα', 'γούνεσσι'], {out: ['n']});
  closed('irregular-noun', 'irregular noun', '', 'δόρυ', ['δόρατος', 'δόρατι', 'δόρατα', 'δοράτων', 'δόρασι', 'δορός', 'δορί', 'δουρός', 'δουρί', 'δούρατος', 'δούρατι', 'δούρατα', 'δούρασι', 'δοῦρα', 'δούρων', 'δούρεσσι', 'δοῦρε'], {out: ['n']});
  closed('irregular-noun', 'irregular noun', '', 'κύων', ['κυνός', 'κυνί', 'κύνα', 'κύον', 'κύνες', 'κυνῶν', 'κυσί', 'κυσίν', 'κύνας', 'κύνεσσι', 'κύνεσσιν', 'κύνε'], {out: ['n']});
  closed('irregular-noun', 'irregular noun', '', 'πατήρ', ['πατρός', 'πατρί', 'πατέρα', 'πάτερ', 'πατέρες', 'πατέρων', 'πατράσι', 'πατράσιν', 'πατέρας', 'πατέρος', 'πατέρι', 'πατρῶν', 'πατέρε'], {out: ['n']});
  closed('irregular-noun', 'irregular noun', '', 'μήτηρ', ['μητρός', 'μητρί', 'μητέρα', 'μῆτερ', 'μητέρες', 'μητέρων', 'μητράσι', 'μητράσιν', 'μητέρας', 'μητέρος', 'μητέρι'], {out: ['n']});
  closed('irregular-noun', 'irregular noun', '', 'θυγάτηρ', ['θυγατρός', 'θυγατρί', 'θυγατέρα', 'θύγατερ', 'θυγατέρες', 'θυγατέρων', 'θυγατράσι', 'θυγατράσιν', 'θυγατέρας', 'θυγατέρος', 'θυγατέρι', 'θύγατρα', 'θύγατρες', 'θυγατρῶν', 'θύγατρας'], {out: ['n']});
  closed('irregular-noun', 'irregular noun', '', 'Δημήτηρ', ['Δήμητρος', 'Δήμητρι', 'Δήμητρα', 'Δήματερ', 'Δημήτερ', 'Δήμητερ']);
  closed('irregular-noun', 'irregular noun', '', 'νύξ', ['νυκτός', 'νυκτί', 'νύκτα', 'νύκτες', 'νυκτῶν', 'νυξί', 'νυξίν', 'νύκτας'], {out: ['n']});
  closed('irregular-noun', 'irregular noun', '', 'παῖς', ['παιδός', 'παιδί', 'παῖδα', 'παῖ', 'παῖδες', 'παίδων', 'παισί', 'παισίν', 'παῖδας', 'παῖδε', 'παίδοιν', 'παιδὸς', 'πάϊς', 'παίδεσσι', 'παίδεσσιν'], {out: ['n']});
  closed('irregular-noun', 'irregular noun', '', 'θρίξ', ['τριχός', 'τριχί', 'τρίχα', 'τρίχες', 'τριχῶν', 'θριξί', 'θριξίν', 'τρίχας'], {out: ['n']});
  closed('irregular-noun', 'irregular noun', '', 'Ἀπόλλων', ['Ἀπόλλωνος', 'Ἀπόλλωνι', 'Ἀπόλλωνα', 'Ἀπόλλω', 'Ἄπολλον']);
  closed('irregular-noun', 'irregular noun', '', 'Ποσειδῶν', ['Ποσειδῶνος', 'Ποσειδῶνι', 'Ποσειδῶνα', 'Ποσειδῶ', 'Πόσειδον', 'Ποσειδάων', 'Ποσειδάωνος', 'Ποσειδάωνι', 'Ποσειδάωνα', 'Ποσειδέων']);
  closed('irregular-noun', 'irregular noun', '', 'Ἄρης', ['Ἄρεως', 'Ἄρεος', 'Ἄρει', 'Ἄρη', 'Ἄρην', 'Ἆρες', 'Ἄρηος', 'Ἄρηϊ', 'Ἄρηα', 'Ἄρηι']);
  // Irregular adjectives and comparisons.
  closed('irregular-adjective', 'irregular adjective', 'Forms of μέγας and πολύς, whose stems change.', 'μέγας', ['μεγάλη', 'μέγα', 'μεγάλου', 'μεγάλης', 'μεγάλῳ', 'μεγάλῃ', 'μέγαν', 'μεγάλην', 'μεγάλοι', 'μεγάλαι', 'μεγάλα', 'μεγάλων', 'μεγάλοις', 'μεγάλαις', 'μεγάλους', 'μεγάλας', 'μεγάλω', 'μεγάλοισι', 'μεγάλοισιν', 'μεγάλῃσι', 'μεγάλῃσιν', 'μεγάλοιο', 'μεγάλης', 'μεγάλην'], {out: ['adj']});
  closed('irregular-adjective', 'irregular adjective', '', 'πολύς', ['πολλή', 'πολύ', 'πολλοῦ', 'πολλῆς', 'πολλῷ', 'πολλῇ', 'πολύν', 'πολλήν', 'πολλοί', 'πολλαί', 'πολλά', 'πολλῶν', 'πολλοῖς', 'πολλαῖς', 'πολλούς', 'πολλάς', 'πουλύς', 'πουλύ', 'πολέος', 'πολέες', 'πολέας', 'πολέων', 'πολέσι', 'πολέσσι', 'πολέεσσι', 'πολλοῖσι', 'πολλοῖσιν', 'πολλῇσι', 'πολλῇσιν', 'πολλόν', 'πολλός', 'πολλά', 'πολέα', 'πουλύν'], {out: ['adj']});
  closed('comparison', 'comparison', 'Irregular comparatives and superlatives: a form of one the dictionary lists reads as it (ἀμείνονος → ἀμείνων, πλείους → πλείων, μεγίστη → μέγιστος), another as the positive (καλλίονα → καλός).', 'ἀγαθός',
    ['ἀμείνων', 'ἄμεινον', 'ἀμείνονος', 'ἀμείνονι', 'ἀμείνονα', 'ἀμείνω', 'ἀμείνονες', 'ἀμείνους', 'ἀμεινόνων', 'ἀμείνοσι', 'βελτίων', 'βέλτιον', 'βελτίονος', 'βελτίονα', 'βελτίω', 'βελτίονες', 'βελτίους', 'βελτιόνων', 'κρείττων', 'κρεῖττον', 'κρείττονος', 'κρείττονα', 'κρείττω', 'κρείττονες', 'κρείττους', 'κρειττόνων', 'κρείσσων', 'κρεῖσσον', 'κρείσσονος', 'κρείσσονα', 'κρείσσω', 'κρείσσονες', 'κρείσσους',
      'ἄριστος', 'ἀρίστη', 'ἄριστον', 'ἀρίστου', 'ἀρίστης', 'ἀρίστῳ', 'ἄριστοι', 'ἄρισται', 'ἄριστα', 'ἀρίστων', 'ἀρίστοις', 'ἀρίστους', 'βέλτιστος', 'βελτίστη', 'βέλτιστον', 'βέλτιστοι', 'βέλτιστα', 'βελτίστου', 'κράτιστος', 'κρατίστη', 'κράτιστον', 'κράτιστοι', 'κράτιστα', 'κρατίστου', 'κρατίστων', 'λῴων', 'λῷστος', 'ἀρείων', 'φέρτερος', 'φέρτατος', 'φέριστος'], {out: ['adj']});
  closed('comparison', 'comparison', '', 'κακός', ['κακίων', 'κάκιον', 'κακίονος', 'κακίονα', 'κακίω', 'κακίονες', 'κακίους', 'κάκιστος', 'κακίστη', 'κάκιστον', 'κάκιστοι', 'κάκιστα', 'κακίστου', 'κακίστων', 'χείρων', 'χεῖρον', 'χείρονος', 'χείρονα', 'χείρω', 'χείρονες', 'χείρους', 'χειρόνων', 'χείριστος', 'χειρίστη', 'χείριστον', 'χείριστα', 'ἥττων', 'ἧττον', 'ἥττονος', 'ἥττονα', 'ἥττω', 'ἥττονες', 'ἥττους', 'ἥσσων', 'ἧσσον', 'ἥσσονος', 'ἥσσονα', 'ἥσσονες', 'ἥκιστα', 'ἥκιστος'], {out: ['adj']});
  closed('comparison', 'comparison', '', 'μέγας', ['μείζων', 'μεῖζον', 'μείζονος', 'μείζονι', 'μείζονα', 'μείζω', 'μείζονες', 'μείζους', 'μειζόνων', 'μείζοσι', 'μείζοσιν', 'μέγιστος', 'μεγίστη', 'μέγιστον', 'μεγίστου', 'μεγίστης', 'μεγίστῳ', 'μεγίστῃ', 'μεγίστην', 'μέγιστοι', 'μέγισται', 'μέγιστα', 'μεγίστων', 'μεγίστοις', 'μεγίσταις', 'μεγίστους', 'μεγίστας', 'μέζων', 'μέζονα'], {out: ['adj']});
  closed('comparison', 'comparison', '', 'πολύς', ['πλείων', 'πλέων', 'πλεῖον', 'πλέον', 'πλείονος', 'πλέονος', 'πλείονι', 'πλείονα', 'πλέονα', 'πλείω', 'πλέω', 'πλείονες', 'πλέονες', 'πλείους', 'πλέους', 'πλειόνων', 'πλεόνων', 'πλείοσι', 'πλείοσιν', 'πλέοσι', 'πλεῖστος', 'πλείστη', 'πλεῖστον', 'πλείστου', 'πλείστης', 'πλείστῳ', 'πλείστην', 'πλεῖστοι', 'πλεῖσται', 'πλεῖστα', 'πλείστων', 'πλείστοις', 'πλείστους', 'πλείστας', 'πλεῦνες', 'πλεόνεσσι'], {out: ['adj']});
  closed('comparison', 'comparison', '', 'μικρός', ['ἐλάττων', 'ἔλαττον', 'ἐλάττονος', 'ἐλάττονα', 'ἐλάττω', 'ἐλάττονες', 'ἐλάττους', 'ἐλαττόνων', 'ἐλάσσων', 'ἔλασσον', 'ἐλάσσονος', 'ἐλάσσονα', 'ἐλάσσω', 'ἐλάσσονες', 'ἐλάσσους', 'ἐλάχιστος', 'ἐλαχίστη', 'ἐλάχιστον', 'ἐλάχιστα', 'ἐλαχίστου', 'ἐλαχίστων', 'μικρότερος', 'μικρότατος'], {out: ['adj']});
  closed('comparison', 'comparison', '', 'ὀλίγος', ['ὀλίγιστος', 'ὀλιγίστη', 'ὀλίγιστον', 'ὀλίγιστα', 'ἐλάττων', 'ἐλάσσων', 'μείων', 'μεῖον', 'μείονος', 'μείονα', 'μείους', 'μείονες'], {out: ['adj']});
  closed('comparison', 'comparison', '', 'καλός', ['καλλίων', 'κάλλιον', 'καλλίονος', 'καλλίονα', 'καλλίω', 'καλλίονες', 'καλλίους', 'κάλλιστος', 'καλλίστη', 'κάλλιστον', 'κάλλιστοι', 'κάλλισται', 'κάλλιστα', 'καλλίστου', 'καλλίστης', 'καλλίστων', 'καλλίστῳ', 'καλλίστην'], {out: ['adj']});
  closed('comparison', 'comparison', '', 'ῥᾴδιος', ['ῥᾴων', 'ῥᾷον', 'ῥᾴονος', 'ῥᾴονα', 'ῥᾴω', 'ῥᾴους', 'ῥᾷστος', 'ῥᾴστη', 'ῥᾷστον', 'ῥᾷστα'], {out: ['adj']});
  for (const [lemma, stem, plain] of [['ἐχθρός', 'ἔχθ', 'ἐχθ'], ['αἰσχρός', 'αἴσχ', 'αἰσχ'], ['οἰκτρός', 'οἴκτ', 'οἰκτ']]) {
    closed('comparison', 'comparison', '', lemma, rhoComparison(stem, plain), {out: ['adj']});
  }
  closed('comparison', 'comparison', '', 'ταχύς', ['θάττων', 'θᾶττον', 'θάττονος', 'θάττονα', 'θάττω', 'θάττους', 'θάσσων', 'θᾶσσον', 'τάχιστος', 'τάχιστα', 'ταχίστη', 'τάχιστον', 'ταχίστην'], {out: ['adj']});
  flushClosed();
}

// ==== Clitics and spelling: elision, crasis, enclitic particles.

function buildSpelling() {
  transform('spelling-variant', 'spelling', 'A dictionary form in another spelling: -σσω for -ττω and back (πράττω, πράσσω), γιγν- for γιν- (γίνομαι, γιγνώσκω).');
  for (const [a, b] of [['ττω', 'σσω'], ['σσω', 'ττω'], ['ττομαι', 'σσομαι'], ['σσομαι', 'ττομαι'], ['γινομαι', 'γιγνομαι'], ['γινωσκω', 'γιγνωσκω'], ['γίνομαι', 'γίγνομαι'], ['γινώσκω', 'γιγνώσκω']]) {
    suffix('spelling-variant', a, b, ['v'], ['v']);
  }
  transform('spelling', 'spelling', 'The older spelling ξυν- for συν- (Thucydides and tragedy: ξυμφορά, ξυνίημι).');
  // ξυ- covers ξυν-, ξυμ-, ξυγ-, ξυλ-, ξυσ- (the assimilated forms keep their consonant).
  for (const [a, b] of [['ξυ', 'συ'], ['ξύ', 'σύ'], ['Ξυ', 'Συ'], ['Ξύ', 'Σύ']]) {
    prefix('spelling', a, b, [], []);
  }

}

function buildClitics() {
  // A text without diacritics (the removeDiacritics variant) is not restored: there every vowel gives some form-of row.
  const MARKED = charClass([...LETTERS.accentedVowels, ...LETTERS.plainVowels.filter((c) => /[\u0313\u0314\u0345\u0308]/u.test(NFD(c)))]);
  transform('elision', 'elision', 'An elided final vowel (δ’ → δέ, ἀλλ’ → ἀλλά, γένοιτ’ → γένοιτο, ταῦτ’ → ταῦτα; before a rough breathing θ’, φ’, χ’ for τ’, π’, κ’: ἐφ’, καθ’, νύχθ’).');
  for (const apo of ['’']) {
    for (const v of ['α', 'ε', 'ι', 'ο', 'αι']) {
      // The accent stays (ταῦτ’ → ταῦτα) or was on the lost vowel (πόλλ’ → πολλά): the accent transform tries both.
      add('elision', {type: 'suffix', inflected: apo, deinflected: v, conditionsIn: [], conditionsOut: [], stemContains: MARKED, stemNotEndsWith: '[\\u0020]'});
      // The same without the accents, for the rules that read the unaccented stem (γένοιτ’ → γενοιτο → γίγνομαι).
      add('elision', {type: 'suffix', inflected: apo, deinflected: v, conditionsIn: [], conditionsOut: [], stemContains: ACC, stemNotEndsWith: '[\\u0020]', then: THEN_STRIP_ACCENTS});

      for (const [asp, plain] of [['θ', 'τ'], ['φ', 'π'], ['χ', 'κ'], ['χθ', 'κτ'], ['φθ', 'πτ']]) {
        add('elision', {type: 'suffix', inflected: asp + apo, deinflected: plain + v, conditionsIn: [], conditionsOut: [], stemContains: MARKED});

      }
    }
  }
  for (const apo of ['’']) {
    for (const [e, l] of [['ποτ', 'ποτε'], ['ποθ', 'ποτε'], ['τ', 'τε'], ['θ', 'τε'], ['δ', 'δέ'], ['γ', 'γε'], ['μ', 'με'], ['μ', 'μοι'], ['σ', 'σε'], ['σ', 'σοι'], ['κατ', 'κατά'], ['καθ', 'κατά'], ['παρ', 'παρά'],
      ['μετ', 'μετά'], ['μεθ', 'μετά'], ['μηδ', 'μηδέ'], ['μηθ', 'μηδέ'], ['τοτ', 'τότε'], ['κοτ', 'κοτε'], ['πω', 'πω'], ['πολλ', 'πολλά'], ['δι', 'διά'], ['τουτ', 'τοῦτο'], ['ταυτ', 'ταῦτα'], ['ἀλλ', 'ἀλλά'],
      // Prepositions and particles (ἀπ’ and ἐπ’ before a vowel; ἀφ’, ἐφ’, ὑφ’, ἀνθ’ before a rough breathing).
      ['ἀπ', 'ἀπό'], ['ἀφ', 'ἀπό'], ['ἐπ', 'ἐπί'], ['ἐφ', 'ἐπί'], ['ὑπ', 'ὑπό'], ['ὑφ', 'ὑπό'], ['ἀντ', 'ἀντί'], ['ἀνθ', 'ἀντί'], ['ἀμφ', 'ἀμφί'], ['ἀν', 'ἀνά'],
      ['παρ', 'παρά'], ['οὐδ', 'οὐδέ'], ['οὐθ', 'οὐδέ'], ['οὔτ', 'οὔτε'], ['οὔθ', 'οὔτε'], ['μήτ', 'μήτε'], ['μήθ', 'μήτε'], ['ὥστ', 'ὥστε'], ['ὥσθ', 'ὥστε'], ['ἵν', 'ἵνα'],
      ['ἔτ', 'ἔτι'], ['ὅτ', 'ὅτε'], ['ἆρ', 'ἆρα'], ['ἄρ', 'ἄρα'], ['ῥ', 'ῥα'], ['εἶτ', 'εἶτα'], ['ἔπειτ', 'ἔπειτα'], ['ἔπειθ', 'ἔπειτα'], ['ἅμ', 'ἅμα'], ['ἀλλ', 'ἄλλα']]) {
      add('elision', {type: 'wholeWord', inflected: NFC(e + apo), deinflected: NFC(l), conditionsIn: [], conditionsOut: []});
    }
  }
  transform('crasis', 'crasis', 'Crasis: καί, the article or ὦ merged with the next word (κἀγώ = καὶ ἐγώ, κἀν, κοὐ, χὠ = καὶ ὁ, τοὔνομα = τὸ ὄνομα, τἀγαθά, τἄλλα, ταὐτό, οὑμός = ὁ ἐμός).');
  const crasis = [
    ['κἀ', 'ἀ'], ['κἀ', 'ἐ'], ['κἄ', 'ἄ'], ['κἄ', 'ἔ'], ['κᾆ', 'εἶ'], ['κεἰ', 'εἰ'], ['κεἴ', 'εἴ'], ['κοὐ', 'οὐ'], ['κοὔ', 'οὔ'], ['κοὐ', 'οὐ'],
    ['χὠ', 'ὁ'], ['χὤ', 'ὅ'], ['χἠ', 'ἡ'], ['χἤ', 'ἥ'], ['χοἰ', 'οἱ'], ['χαἰ', 'αἱ'], ['χἀ', 'ἁ'], ['κὠ', 'ὠ'], ['κὤ', 'ὤ'], ['κᾀ', 'ἀ'], ['κᾠ', 'ὠ'], ['χᾠ', 'ᾡ'],
    ['τοὔ', 'ἔ'], ['τοὔ', 'ὄ'], ['τοὐ', 'ἐ'], ['τοὐ', 'ὀ'], ['τἀ', 'ἀ'], ['τἀ', 'ἐ'], ['τἄ', 'ἄ'], ['τἄ', 'ἔ'], ['ταὐ', 'αὐ'], ['ταὐ', 'αὑ'], ['τὠ', 'ἐ'], ['τὠ', 'ὀ'], ['τᾀ', 'ἀ'],
    ['θοἰ', 'ἱ'], ['θἠ', 'ἡ'], ['θἀ', 'ἑ'], ['θἄ', 'ἕ'], ['οὑ', 'ἐ'], ['οὑ', 'ὀ'], ['οὕ', 'ἕ'], ['οὑ', 'ἑ'], ['ὡνήρ', 'ἀνήρ'], ['ὤνθρωπε', 'ἄνθρωπε'], ['ὦνθρωπε', 'ἄνθρωπε'], ['ὦγαθέ', 'ἀγαθέ'], ['ὦγαθε', 'ἀγαθέ'],
    ['ἐγᾦ', 'οἶ'], ['μοὐ', 'οὐ'], ['σοὐ', 'οὐ'], ['τοὐ', 'οὐ'], ['ἁ', 'ἀ'],
  ];
  for (const [a, b] of crasis) {
    if (a === 'ἁ') continue;
    prefix('crasis', a, b, [], [], {writtenOnly: true});
  }
  // The acute an enclitic puts on the last syllable of the word before it, only where the word has its own accent
  // before it (a word accented on the last syllable keeps its accent).
  transform('enclitic-accent', 'enclitic accent', 'The second accent an enclitic gives the word before it (ἄνθρωπός τις, σῶμά τι, ἔχουσί τινες → ἄνθρωπος, σῶμα, ἔχουσι).');
  for (const v of ['α', 'ε', 'η', 'ι', 'ο', 'υ', 'ω', 'ᾳ', 'ῃ', 'ῳ']) {
    for (const f of ['', 'ς', 'ν', 'ρ', 'ξ', 'ψ']) {
      add('enclitic-accent', {type: 'suffix', inflected: acute(v) + f, deinflected: v + f, conditionsIn: [], conditionsOut: [], stemContains: ACC});
    }
  }
  // An enclitic the text writes without the accent its dictionary form has (ποτε → ποτέ): found by a rule, it
  // comes before what a longer chain makes of the same text (the vocative ποτός of ποτε).
  transform('enclitic', 'enclitic', 'An enclitic as its dictionary form writes it: ποτε → ποτέ.');
  whole('enclitic', 'ποτε', 'ποτέ', [], [], {writtenOnly: true});
  transform('enclitic-particle', 'enclitic particle', 'The particle -περ written onto the word before it (οὗπερ, ἧσπερ, ἐπείπερ, ὅσπερ).');
  // Not -γε after any word: ἔφυγε, ἐπέλεγε are verbs (ἔγωγε, ἔμοιγε, σύγε are pronoun forms).
  for (const [e, l] of [['περ', ''], ['σπερ', 'ς'], ['σγε', 'ς']]) {
    // Also after a one-letter relative (ἅπερ, ὅπερ, ᾗπερ, ὅσπερ → ὅς).
    add('enclitic-particle', {type: 'suffix', inflected: e, deinflected: l, conditionsIn: [], conditionsOut: [], stemMinLength: 1, stemNotEndsWith: '[\\u0020]'});
  }
}


// ==== Exceptions

// Common forms other rules read first as a rarer word (ἔλεγε as ἔλεγος), as whole words: exceptions.tsv and
// exceptions-manual.tsv (README.md, "Own rules"). Left out of the list: forms that fit Homer only.
const EXCEPTIONS_LEFT_OUT = {
  'ἄκουσα': 'Homer\'s unaugmented aorist of ἀκούω; in Attic the feminine of ἄκων "unwilling", which the rules read',
  'ἄκουσαν': 'Homer\'s unaugmented aorist of ἀκούω; in Attic the feminine of ἄκων "unwilling", which the rules read',
  ...Object.fromEntries(['ἐχρήσατο', 'ἐχρῶντο', 'χρώμενος', 'χρησόμενος'].map((f) => [f, 'the treebank\'s χράω for χράομαι "use"; wty-grc-en\'s χράω is "attack"'])),
};

const readTsv = (name) => readFileSync(join(here, name), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t'));

/** The exceptions: [{form, term, tag}], from sources/exceptions.tsv and sources/exceptions-manual.tsv. */
export function exceptionList() {
  const rows = readTsv('exceptions.tsv').filter(([form]) => !(NFC(form) in EXCEPTIONS_LEFT_OUT));
  return [...rows, ...readTsv('exceptions-manual.tsv')].map(([form, term, tags]) => ({
    form: NFC(form), term: NFC(term), tag: tags.split(' ').find((t) => t in conditions && conditions[t].isDictionaryForm),
  }));
}

// Exceptions with a spelling without accents (exceptions-accentless.txt), and those that stay wholeWord rules, whose
// term ranks before a dictionary-confirmed one (exceptions-whole-word.txt, 9.6); GRC_ALL_* gives every one both.
const WHOLE = process.env.GRC_ALL_WHOLE === '1' ? null : new Set(readTsv('exceptions-whole-word.txt').map(([f]) => NFC(f)));
export const ACCENTLESS = process.env.GRC_ALL_ACCENTLESS === '1' ? null : new Set(readTsv('exceptions-accentless.txt').map(([f]) => NFC(f)));

function buildExceptions() {
  transform('exc', 'common form', 'A common form that other rules read first as a rarer word, read as the term the dictionary alone puts first (ἔλεγε → λέγω, not ἔλεγος; ἐμοῦ → ἐγώ, not ἐμός; ἔτη → ἔτος, not ἔτης).');
  for (const {form, term, tag} of exceptionList()) {
    // graveToAcute has turned a grave into an acute before any rule reads the text (δεινὰ → δεινά).
    const written = NFC(NFD(form).replace(/\u0300/gu, '\u0301'));
    const listed = (set) => set === null || set.has(form) || set.has(written);
    for (const spelling of new Set(listed(ACCENTLESS) ? [written, stripAccents(written)] : [written])) {
      add('exc', {type: 'wholeWord', inflected: spelling, deinflected: term, conditionsIn: [], conditionsOut: tag ? [tag] : [],
        ...(listed(WHOLE) ? {standing: true} : {})});
    }
  }
}

// ==== Output

/** Two-space JSON with each rule on one line (docs/languages.md section 3). */
export function format(pack) {
  const lines = ['{', '  "schema": 1,', '  "conditions": {'];
  const conds = Object.entries(pack.conditions);
  conds.forEach(([k, v], i) => lines.push(`    ${JSON.stringify(k)}: ${JSON.stringify(v).replace(/":/gu, '": ').replace(/,"/gu, ', "')}${i < conds.length - 1 ? ',' : ''}`));
  lines.push('  },');
  lines.push('  "transforms": [');
  pack.transforms.forEach((t, ti) => {
    lines.push('    {');
    lines.push(`      "id": ${JSON.stringify(t.id)},`);
    lines.push(`      "name": ${JSON.stringify(t.name)},`);
    if (t.description !== undefined) lines.push(`      "description": ${JSON.stringify(t.description)},`);
    if (t.i18n !== undefined) lines.push(`      "i18n": ${JSON.stringify(t.i18n)},`);
    lines.push(`      "source": ${JSON.stringify(t.source)},`);
    if (t.optional) lines.push('      "optional": true,');
    lines.push('      "rules": [');
    t.rules.forEach((r, ri) => lines.push(`        ${JSON.stringify(r)}${ri < t.rules.length - 1 ? ',' : ''}`));
    lines.push('      ]');
    lines.push(`    }${ti < pack.transforms.length - 1 ? ',' : ''}`);
  });
  lines.push('  ]');
  lines.push('}');
  return lines.join('\n') + '\n';
}

/** Suffix rules that share conditions and constraints become one cross-product circumfix row (docs/languages.md 7.3). */
function compact(rules) {
  const groups = new Map();
  const order = [];
  for (let r of rules) {
    if (r.standing) {
      const {standing, ...rule} = r;
      order.push({single: rule});
      continue;
    }
    if (r.type === 'wholeWord') {
      // A whole word is a suffix whose stem is empty (no code point is in the class []): suffix rules are
      // indexed by their endings, so the cross product below stays as fast as single rules.
      r = {...r, type: 'suffix', stemCharacters: '[]'};
    }
    if (r.type !== 'suffix') {
      order.push({single: r});
      continue;
    }
    const {type, inflected, deinflected, ...shape} = r;
    const key = JSON.stringify(shape);
    if (!groups.has(key)) {
      const g = {type, shape, pairs: []};
      groups.set(key, g);
      order.push({group: g});
    }
    groups.get(key).pairs.push([inflected, deinflected]);
  }
  return order.map(({single, group}) => {
    if (single) return single;
    if (group.pairs.length === 1) return {type: group.type, inflected: group.pairs[0][0], deinflected: group.pairs[0][1], ...group.shape};
    const {conditionsIn, conditionsOut, ...extra} = group.shape;
    // A cross product with no prefix is the same set of suffix rules (docs/languages.md 7.3). Prefix rules stay
    // single: a cross product of prefixes alone is tried on every text, which made lookups 0.3 ms slower.
    return {type: 'circumfix', prefixes: [['', '']], suffixes: group.pairs, conditionsIn, conditionsOut, ...extra};
  });
}

export function build() {
  buildExceptions();
  buildNominal();
  thematicEndings();
  participles();
  tenseEndings();
  contractEndings();
  stemRules();
  buildIrregular();
  augmentRules();
  buildAthematic();
  buildClosedClasses();
  buildSpelling();
  buildClitics();
  buildAccentTransform();
  const used = transforms.filter((t) => t.rules.length > 0);
  return {schema: 1, conditions, transforms: used.map(({id, name, description, source, optional, rules}) => ({id, name, description, source, ...(optional ? {optional} : {}), rules: compact(rules)}))};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pack = build();
  const out = process.argv[2] ?? join(here, 'own.json');
  writeFileSync(out, format(pack));
  const rows = pack.transforms.reduce((n, t) => n + t.rules.length, 0);
  const rules = pack.transforms.reduce((n, t) => n + t.rules.reduce((m, r) => m + (r.type === 'circumfix' ? r.prefixes.length * r.suffixes.length : 1), 0), 0);
  console.log(`${out}: ${pack.transforms.length} transforms, ${rows} rows, ${rules} rules`);
}

export {conditions, transforms, transform, add, suffix, prefix, whole, accentVariants, buildAccentTransform, buildNominal, nominal, literal,
  thematicEndings, participles, tenseEndings, contractEndings, stemRules, augmentRules, verbEnding, BOTH,
  buildIrregular, buildAthematic, buildClosedClasses, buildClitics,
  THEN_CIRC_TO_ACUTE, THEN_ACUTE_TO_CIRC, THEN_STRIP_ACCENTS, UPPER, NOT_SPACE, NA, ADJ, here};
