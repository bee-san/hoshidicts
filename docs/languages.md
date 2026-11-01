<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
# Languages in hoshidicts

Status: design for review (Phase 1, revision 4). Nothing described here is
implemented yet. Once the framework lands, this file is the contract for
language packs and wins over any prompt, issue or comment that disagrees with
it.

hoshidicts looks words up in Yomitan-format dictionaries. Until now every
lookup ran the Japanese pipeline compiled into `src/deinflector.cpp` and
`src/text_processor/`. This document describes how the engine supports many
languages at once: one generic, data-driven pipeline, and one self-contained
**language pack** per language. Japanese becomes the first pack and must give
exactly the results it gives today.

The host side (Hachidori's per-language profiles, settings, themes, Anki and
audio) is specified in Hachidori's
[`docs/languages.md`](https://github.com/bee-san/hachidori/blob/feat/multi-language/docs/languages.md).
This file covers what lives in this repository: the pack format, the engine
API, the rule format, the tests and the performance budget. The hard choices
are recorded in [`docs/decisions/`](decisions/).

## Contents

1. [Goals and non-goals](#1-goals-and-non-goals)
2. [Concepts](#2-concepts)
3. [Pack layout](#3-pack-layout)
4. [`language.json`](#4-languagejson)
5. [Character classes](#5-character-classes)
6. [Text processors](#6-text-processors)
7. [`transforms.json`: deinflection rules](#7-transformsjson-deinflection-rules)
8. [Porting from Yomitan](#8-porting-from-yomitan)
9. [The lookup pipeline with a language](#9-the-lookup-pipeline-with-a-language)
10. [Engine API](#10-engine-api)
11. [The Japanese pack](#11-the-japanese-pack)
12. [Tests and the conformance check](#12-tests-and-the-conformance-check)
13. [Performance budget](#13-performance-budget)
14. [Adding a language](#14-adding-a-language)
15. [Working on packs in parallel](#15-working-on-packs-in-parallel)
16. [Known limits](#16-known-limits)

## 1. Goals and non-goals

Goals:

- **One engine, many languages at once.** Every lookup and deinflection names
  its language and may name the dictionaries to use. A host can answer a
  Japanese page and an English page from the same loaded engine without
  reloading anything.
- **A language is data.** Adding a language means adding one directory,
  `languages/<code>/`, with no edit to engine code, CMake files, CI workflows
  or any shared list. Packs are discovered by directory.
- **Yomitan's rules port mechanically.** Every rule in Yomitan's
  `ext/js/language/*/*-transforms.js` at
  [d3c54c1](https://github.com/yomidevs/yomitan/tree/d3c54c10264673eca0d66b970ef74cd5c8b048e3/ext/js/language)
  can be written in the pack format (section 8 lists how), the 10,946 literal
  ones are converted by a script, and a differential check compares the
  engine with Yomitan's own transformer.
- **Japanese is unchanged.** The Japanese pack reproduces today's
  deinflections, traces, text-processor variants and lookup results exactly,
  at the same speed (sections 11 and 13).
- **Every pack is tested the same way.** One conformance test validates any
  pack and runs its corpus in CI.

Non-goals:

- Morphological analysers (MeCab-style tokenisers), machine translation,
  language detection from text statistics.
- Localising user-interface text. Rule names and descriptions are shown to
  learners as data; the host's own interface stays English.
- Arbitrary code in packs. A pack can only use the constructs this document
  lists. A language that needs a new algorithm gets a new named builtin in the
  engine through a framework change (section 15).

## 2. Concepts

- **Pack**: everything the engine and its hosts need to know about one
  language, in `languages/<code>/`. A pack has a descriptor
  (`language.json`), optional deinflection rules (`transforms.json`), tests,
  and a README with sources and licences.
- **Registry**: the set of packs a running engine has loaded
  (`LanguageRegistry`). It starts with the built-in Japanese pack; hosts load
  other packs from a directory or from JSON strings.
- **Language code**: the pack's directory name and `code` field. It is
  Yomitan's `iso` value for the language (`en`, `ja`, `grc`, `sga`, `aii`,
  ...); `pt` for Portuguese, which Yomitan describes without transforms.
- **Capability**: a named feature a pack declares, such as a character view
  or ruby readings (section 4.6). Hosts use capabilities to decide which
  settings and popup features apply; the engine does not need them.
- **Dictionary selection**: the ordered list of loaded dictionaries a request
  may use (section 9.7). The engine does not know which language a
  dictionary is for; the host does.

The engine has no notion of a user profile. Profiles are a host concept: a
host maps a profile to a language code and a dictionary selection and passes
both with each request.

## 3. Pack layout

```text
languages/
  _template/              copied to start a new pack; never loaded
  ja/
    language.json         descriptor (required)
    transforms.json       deinflection rules (optional)
    README.md             sources, licences, attribution, provenance, measurements, known gaps (required)
    tests/
      yomitan.tsv         Yomitan's own test cases for the language, converted (optional)
      corpus.tsv          inflected form -> lemma pairs from a licensed source (required with transforms)
      cases.tsv           hand-written tricky cases and negatives (optional)
      gaps.tsv            known failures: reported, not enforced (optional)
      text.tsv            text-processor expectations (optional)
      lookup.tsv          whole-pipeline cases against tests/dictionary/ (optional)
      dictionary/         a tiny Yomitan dictionary as JSON banks (optional)
    sources/              files that are not loaded: own.json, yomitan.json, measurement reports (optional)
```

Rules for the tree:

- A directory whose name starts with `_` is not a pack.
- The engine reads only `language.json` and the file it names as its
  transforms. Everything else is for tests, tools and people.
- Every file in a pack is UTF-8 without a byte-order mark. JSON is formatted
  with two-space indentation, except that each element of a `rules` array may
  sit on one line, which keeps large rule files reviewable.
- `tests/` and `sources/` hold at most 2,000 rows per TSV and 1 MB in total,
  so a fresh clone stays light. Measurements against full dictionaries are
  recorded in the README, not committed as data. `transforms.json` has no size
  limit; section 7.3's cross-product form keeps generated rule sets small.

## 4. `language.json`

Besides its identity fields, the descriptor has seven blocks. The engine
parses `classes`, `text` and `lookup`, and checks the rest only for shape.
Hosts read every block. Unknown keys are an error, so a typo cannot silently
disable a feature.

An abridged English example (section 4.8 has Arabic and Japanese excerpts):

```json
{
  "schema": 1,
  "code": "en",
  "iso639_3": "eng",
  "name": "English",
  "nativeName": "English",
  "bcp47": "en",
  "scripts": ["Latn"],
  "direction": "ltr",
  "classes": {
    "letter": "[A-Za-z\\u00C0-\\u024F]",
    "word": "[{letter}\\p{M}\\p{Nd}]"
  },
  "text": {
    "pattern": "{letter}",
    "scanStart": "word",
    "segmentation": "spaces",
    "wordCharacters": "{word}",
    "wordInternal": null,
    "sentence": {
      "terminators": [".", "!", "?", "\u2026"],
      "quotePairs": [["\u201C", "\u201D"], ["\"", "\""], ["(", ")"]]
    },
    "highlightBreaks": null,
    "lineJoiner": " "
  },
  "lookup": {
    "searchResolution": "word",
    "preprocessors": [
      {"id": "decapitalize", "name": "Decapitalize text", "variants": [[{"case": "lower"}]]},
      {"id": "capitalizeFirstLetter", "name": "Capitalize first letter", "variants": [[{"case": "upperFirst"}]]}
    ],
    "postprocessors": [],
    "readingNormalizer": null,
    "transforms": "transforms.json",
    "traceSelection": "shortest",
    "functionWords": [],
    "variantPasses": []
  },
  "capabilities": {
    "readings": "none",
    "ruby": null,
    "pitchAccent": false,
    "characterView": null,
    "wordHighlighting": true
  },
  "presentation": {
    "typography": {"fontFamily": null, "wordBreak": null, "lineBreak": null, "joinedScript": false},
    "labels": {},
    "displayTransforms": {}
  },
  "settings": [],
  "host": {
    "ttsLanguage": "en-US",
    "audioLanguage": "en",
    "anki": {"noteTypeFamilies": [], "fieldAliases": {"pronunciation": ["IPA"]}, "partOfSpeechLabels": {"v": "Verb", "n": "Noun", "adj": "Adjective", "adv": "Adverb"}},
    "frequencySamples": null,
    "recommendedDictionaries": [
      {"name": "Kaikki English-English (kaikki-to-yomitan)", "url": "https://github.com/yomidevs/kaikki-to-yomitan", "description": "Wiktionary-based English definitions with inflection forms.", "licence": "CC BY-SA 4.0"}
    ],
    "sample": {
      "warmup": "running",
      "practice": {"text": "She was running late, so she took the earlier train.", "lookup": "running"},
      "entry": {"expression": "run", "reading": "run", "glossary": ["to move swiftly on foot"], "definitionTags": "v", "matched": "running", "trace": ["-ing"]},
      "character": null
    }
  }
}
```

### 4.1 Identity

| Field | Type | Meaning |
| --- | --- | --- |
| `schema` | `1` | Descriptor schema version. |
| `code` | string | Equals the directory name. Lowercase ASCII letters, 2-3 characters. |
| `iso639_3` | string | ISO 639-3 code (Yomitan's `iso639_3`). |
| `name` | string | English name, shown in English user interfaces. |
| `nativeName` | string | The language's own name for itself. |
| `bcp47` | string | The tag hosts put in `lang` attributes for text in this language, for example `ja`, `zh-Hans`, `ar`. |
| `scripts` | array of ISO 15924 codes | Scripts the language is written in: `Jpan` (ja), `Latn` (en, es), `Arab` (ar), `Kore` (ko), `Hans` and `Hant` (zh). Hosts use it to decide how to label untagged Han text (Hachidori section 10.3); there, `Hani` matches every code that includes Han (`Hani`, `Hans`, `Hant`, `Hanb`, `Jpan`, `Kore`). |
| `direction` | `"ltr"` or `"rtl"` | Direction of running text in this language. |

### 4.2 `classes`

Named character classes (section 5). Other fields refer to them as
`{name}`. A pack may define as many as it needs; there are no global names.

### 4.3 `text`

How text in this language looks on a page. The engine uses
`wordCharacters` and `wordInternal` (section 9.2); hosts use all of it.

| Field | Type | Meaning |
| --- | --- | --- |
| `pattern` | class | Code points that are text in this language. Hosts use it for the "only scan text in this language" gate, debug-log redaction, and to find the runs of text to split into words (section 9.8). |
| `scanStart` | `"cursor"` or `"word"` | Where a host starts a scan. `cursor`: at the hovered character, as Hachidori does for Japanese. `word`: at the start of the hovered word (Yomitan's `scanning.scanResolution: 'word'`). Section 14 recommends a value per language. |
| `segmentation` | `"scan"` or `"spaces"` | How running text divides into words, for word highlighting and line joining. `scan`: words are not separated by spaces (Japanese, Chinese). `spaces`: spaces and punctuation separate words (English, Arabic, Korean). |
| `wordCharacters` | class | The characters a word is made of, for `scanStart: "word"`, `searchResolution: "word"` and `spaces` segmentation. Every other character separates words. |
| `wordInternal` | class or null | Characters that are part of a word's spelling between two word characters and where a lookup never splits a word, such as the Ukrainian apostrophe (м’ясо) or the Catalan middle dot (col·lecció). Hyphens and the English and French apostrophes are not: they separate words, so *minute* in *five-minute*, *mother* in *mother’s* and *homme* in *l’homme* can be looked up. |
| `sentence.terminators` | array of strings | Characters that end a sentence. |
| `sentence.quotePairs` | array of `[open, close]` | Brackets and quotes that a sentence keeps whole. |
| `highlightBreaks` | object or null | `{"sentenceEnd": [...], "clauseEnd": [...]}`: where a host may cut running text into chunks for word highlighting. Null means `sentence.terminators` and no clause breaks. Japanese lists today's Hachidori tables. |
| `lineJoiner` | string | What replaces a line break when a host joins lines of one sentence (subtitles, OCR): `""` for Japanese, `" "` for space-delimited languages. |

### 4.4 `lookup`

The engine-facing block.

| Field | Type | Meaning |
| --- | --- | --- |
| `searchResolution` | `"character"` or `"word"` | Which prefixes of the scanned text are looked up (section 9.2). This is Yomitan's `translation.searchResolution` (`letter` or `word`); `text.scanStart` is Yomitan's `scanning.scanResolution`. |
| `preprocessors` | array of processors | Text variants tried before deinflection (section 6). |
| `postprocessors` | array of processors | Variants of each deinflected form tried before the dictionary query (section 6). Korean needs them: rules run on jamo, dictionaries are written in syllables. |
| `readingNormalizer` | array of steps or null | Applied to readings when the engine groups results (section 9.6). Chinese pinyin uses it. |
| `transforms` | string or null | File name of the deinflection rules in this directory. |
| `traceSelection` | `"shortest"` or `"first"` | When several deinflections reach one term at the same matched length, which trace the result keeps (section 9.6). `shortest` is Yomitan's choice and the default. Japanese uses `first`, today's behaviour. |
| `functionWords` | array of strings | Words a host's segmenter may split around (section 9.8; Japanese particles today). |
| `variantPasses` | array | Opt-in extra passes, each `{"id", "builtin", "optional": true}`, that a request enables by id. Japanese declares `nekoSpeech` (section 11.4). |

### 4.5 Readings and pronunciations

Yomitan term banks have a `reading` column. The engine keeps it as written
and, as today, writes the expression into it when a bank leaves it empty, so
a reading that "does not exist" arrives equal to the expression. The pack's
`capabilities.readings` tells hosts what the column means for this language:

- `"required"`: every word has a phonetic reading distinct from its spelling
  (Japanese kana). Hosts require it in user-written entries.
- `"optional"`: dictionaries often give one (Chinese pinyin, Korean hanja
  readings).
- `"none"`: the column is normally empty or a copy of the expression
  (English, Arabic). Hosts do not ask for it.

Pronunciations in IPA arrive as Yomitan `ipa` term metadata and are returned
for every language as they are today, in `PitchEntry::transcriptions`.

### 4.6 `capabilities`

Capabilities describe what a language has, not what a host shows. Each one
has one meaning in every pack.

| Capability | Values | Meaning |
| --- | --- | --- |
| `readings` | `"required"`, `"optional"`, `"none"` | Section 4.5. |
| `ruby` | null or `{"alignment": "kana" \| "syllable" \| "word"}` | Readings are drawn as ruby over the spelling. `kana`: Japanese furigana, anchored on the kana in the spelling. `syllable`: one reading syllable per character, separated by spaces or listed per character (Korean hanja, Chinese with spaced pinyin). `word`: one ruby over the whole word. |
| `pitchAccent` | boolean | Japanese mora pitch accent: downstep positions and H/L patterns from Yomitan `pitch` metadata. Only Japanese sets it. Tone and stress are not pitch accent (section 16). |
| `characterView` | null or object | Single characters can be looked up in character dictionaries (Yomitan `kanji_bank`). See below. |
| `wordHighlighting` | boolean | Hosts can split running text in this language into words (section 9.8). |

`characterView` has these fields:

```json
{
  "name": "Kanji",
  "pattern": "[\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF\\u{20000}-\\u{2FA1F}]",
  "readingLabels": {"onyomi": "On", "kunyomi": "Kun"},
  "readingSeparator": "\u3001",
  "optional": false
}
```

`pattern` decides which characters of a headword are clickable.
`readingLabels` names the two reading columns of a `kanji_bank` row, which
Yomitan calls `onyomi` and `kunyomi` whatever the language; a Korean pack
could use `{"onyomi": "Eum", "kunyomi": "Hun"}`, a Chinese one
`{"onyomi": "Pinyin", "kunyomi": "Other readings"}`. `readingSeparator` joins
several readings in a host's character view.

Any capability object may set `"optional": true`. An optional capability is
off unless a pack setting with a `capability` effect turns it on (section
4.7), for example a Korean hanja view that only some learners want.

### 4.7 `presentation` and `settings`

`presentation` holds data hosts use to draw text in this language:

- `typography.fontFamily`: a CSS font-family list for text in this language,
  or null to leave fonts to the host's theme.
- `typography.wordBreak` and `typography.lineBreak`: CSS `word-break` and
  `line-break` values for text in this language (`keep-all` for Korean), or
  null to leave them to the host.
- `typography.joinedScript`: true for scripts whose letters join (Arabic,
  Syriac); hosts then never letter-space text in this language, because
  spacing breaks the joins.
- `labels`: host display labels for this language, not linguistic facts:
  `reading` (the name of the reading, default `Reading`), `traceMarker`
  (written before a rule name in compact deinflection trails; default empty,
  Japanese `～`), `readingBrackets` (around a reading shown inline; default
  `["(", ")"]`, Japanese `["《", "》"]`), `senseSeparator` (between plain
  glosses of one sense; default `"; "`) and `listSeparator` (between items in
  running text; default `", "`, Japanese `"、"`).
- `displayTransforms`: named step lists (section 6.2) a host applies to text
  it displays, never to what it looks up, mines or stores.

`settings` declares settings that exist only for this language. Each one has a
type, a default, a label and exactly one effect from a closed list:

```json
{
  "id": "vowelMarks",
  "type": "enum",
  "default": "show",
  "values": [{"id": "show", "label": "Show"}, {"id": "hide", "label": "Hide"}],
  "label": "Vowel marks in headwords",
  "description": "Arabic dictionaries often write short vowels. Hiding them shows words as they appear in most text.",
  "group": "display",
  "effect": {"display": {"fields": ["expression", "reading"], "when": "hide", "transform": "stripVowelMarks"}}
}
```

| Effect | Allowed on | Meaning | Who applies it |
| --- | --- | --- | --- |
| `{"preprocessor": "<id>"}` | boolean | Turns an optional preprocessor (declared with `"optional": true`) on while the setting is true. | Engine, through the request's `languageOptions`. |
| `{"transforms": ["<id>", ...]}` | boolean | Turns optional transforms (declared with `"optional": true` in `transforms.json`) on. | Engine. |
| `{"variantPass": "<id>"}` | boolean | Enables a declared variant pass. | Engine. |
| `{"display": {"fields": [...], "when": <value>, "transform": "<name>"}}` | any type | Applies a display transform to the named result fields (`expression`, `reading`) while the setting has the given value. | Host renderer. |
| `{"capability": "<name>"}` | boolean | Turns an optional capability on (section 4.6). | Host. |

Types are `boolean`, `enum` (`values` list) and `number` (`min`, `max`,
`step`). `group` is `lookup` (shown with scanning settings) or `display`
(shown with popup appearance). Hosts render these settings without
language-specific code, store their values per profile, keep values whose id
they do not know (a pack may have renamed a setting), and fall back to
`default` for a missing or invalid value. Hachidori's document describes the
user-facing side.

### 4.8 `host`

Data a reading host needs, kept with the language so that one pull request
describes a language completely. The engine checks only its shape.

| Field | Meaning |
| --- | --- |
| `ttsLanguage` | BCP 47 tag for speech synthesis (`ja-JP`, `en-US`, `ar-SA`). |
| `audioLanguage` | The value of `{language}` in audio-source URL templates. Yomitan passes ISO 639-1 codes. |
| `anki.noteTypeFamilies` | Note-type families a host can detect and map automatically. Hachidori knows `kiku`, `lapis` and `senren`; only Japanese lists them. |
| `anki.fieldAliases` | Extra Anki field names that suggest a marker, for example `{"pronunciation": ["IPA"]}`. |
| `anki.partOfSpeechLabels` | Readable names for the part-of-speech tags this language's dictionaries use. |
| `frequencySamples` | `{"common": [10 words], "rare": [10 words]}` a host uses to tell whether a frequency dictionary lists ranks or counts, or null. |
| `recommendedDictionaries` | Links to dictionaries for the language: `name`, `url` (a download or release page), `description`, `licence`. Hosts link to them; they are not installed automatically. |
| `sample.warmup` | A word looked up once after loading to warm the engine. |
| `sample.practice` | A short sentence for a first-run exercise and the word it invites the user to look up. |
| `sample.entry` | A fake dictionary entry for settings previews; hosts add their own scaffolding (frequencies, tags, images) around it. Its `reading` follows the engine: equal to `expression` when the language has no readings. |
| `sample.character` | A fake character entry, or null without a character view. |

Arabic excerpt:

```json
{
  "code": "ar", "bcp47": "ar", "direction": "rtl", "scripts": ["Arab"],
  "classes": {
    "letter": "[\\u0620-\\u065F\\u066E-\\u06D3\\u06D5\\u06EE\\u06EF\\u06FA-\\u06FC\\u06FF]",
    "harakat": "[\\u0618-\\u061A\\u064B-\\u0656\\u0670]"
  },
  "text": {"pattern": "[{letter}{harakat}\\u0640]", "scanStart": "word", "segmentation": "spaces",
           "wordCharacters": "[{letter}{harakat}\\u0640]", "wordInternal": null,
           "sentence": {"terminators": [".", "!", "\u061F", "\u2026"], "quotePairs": [["\u00AB", "\u00BB"], ["(", ")"]]},
           "highlightBreaks": null, "lineJoiner": " "},
  "lookup": {"searchResolution": "word", "preprocessors": [
    {"id": "removeArabicScriptDiacritics", "name": "Remove diacritics", "variants": [[{"strip": "{harakat}"}]]},
    {"id": "removeTatweel", "name": "Remove tatweel", "variants": [[{"strip": "[\\u0640]"}]]},
    {"id": "normalizeUnicode", "name": "Normalize Unicode", "variants": [[{"normalize": "NFKC"}]]},
    {"id": "addHamzaTop", "name": "Add hamza on top", "variants": [[{"map": {"\u0627": "\u0623"}, "at": "first"}]]}
  ]},
  "presentation": {"typography": {"fontFamily": null, "wordBreak": null, "lineBreak": null, "joinedScript": true},
                   "displayTransforms": {"stripVowelMarks": [{"strip": "{harakat}"}]}}
}
```

Japanese excerpt (section 11 has the rest):

```json
{
  "code": "ja", "bcp47": "ja", "direction": "ltr", "scripts": ["Jpan"],
  "text": {"pattern": "[\\u3005-\\u3007\\u303B\\u3040-\\u30FF\\u31F0-\\u31FF\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF\\uFF66-\\uFF9F\\u{20000}-\\u{2FA1F}]",
           "scanStart": "cursor", "segmentation": "scan", "lineJoiner": "",
           "highlightBreaks": {"sentenceEnd": ["\u3002", "\uFF0E", "\uFF01", "\uFF1F", "!", "?", "\u2026", "\u2025"],
                               "clauseEnd": ["\u3001", "\uFF0C", ",", " ", "\u3000"]}},
  "lookup": {"searchResolution": "character", "traceSelection": "first", "preprocessors": [
    {"id": "nfkc", "variants": [[{"builtin": "ja.nfkc"}]]},
    {"id": "kana", "variants": [[{"builtin": "ja.katakanaToHiragana"}], [{"builtin": "ja.hiraganaToKatakana"}]]}
  ]},
  "capabilities": {"readings": "required", "ruby": {"alignment": "kana"}, "pitchAccent": true,
                   "characterView": {"name": "Kanji", "pattern": "[\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF\\u{20000}-\\u{2FA1F}]",
                                     "readingLabels": {"onyomi": "On", "kunyomi": "Kun"}, "readingSeparator": "\u3001"},
                   "wordHighlighting": true}
}
```

## 5. Character classes

A field that holds a class contains either one bracket expression or one bare
reference `{name}`. The syntax is accepted both by the engine's own parser
and, once references are expanded, by JavaScript's `RegExp` with the `u`
flag:

- one bracket expression: `[...]`, optionally negated with `[^...]`;
- literal characters (escape `\`, `]`, `^` and `-` with a backslash);
- `\uXXXX` and `\u{X...}` code point escapes, and ranges `a-z`,
  `\u4E00-\u9FFF`;
- Unicode general categories: `\p{L}`, `\p{Lu}`, `\p{Ll}`, `\p{M}`,
  `\p{Mn}`, `\p{N}`, `\p{Nd}`, `\p{P}`, `\p{S}`, `\p{Z}` and the other
  two-letter categories, answered from utf8proc in the engine;
- `{name}` inside a bracket expression stands for another class's members;
  references may not form cycles.

Script properties (`\p{Script=Latin}`, `\p{scx=Han}`) are not accepted: the
engine has no script table. Write the ranges instead. The conformance test
checks that every class parses in both implementations and that both accept
the same code points over all of Unicode (utf8proc 2.11 and Node 22 both
implement Unicode 17.0 and agree on every general category; the check catches
drift when either moves).

## 6. Text processors

### 6.1 Processors

A processor turns one text into a few variants. The engine applies the pack's
processors in order, each to every variant the previous ones produced, as
`text_processor::process` does for Japanese today:

1. Start with `[(input, steps = 0)]`.
2. For each processor, for each current variant, for each of the processor's
   `variants`: apply its steps; if the output differs from the variant, keep
   it with `steps + 1`. Unless the processor sets `"keepInput": false`, also
   keep the variant itself with its own steps. With `"keepInput": false`, an
   output equal to its input is kept with its own steps, so a text the
   processor does not change (Yiddish without diacritics, text without Hangul)
   is still looked up. A text seen twice keeps its smallest `steps`.
3. After each processor, sort the variants by code points.
4. Stop adding variants for one input after 4,096; the conformance test fails
   a pack whose corpus reaches that limit.

`steps` counts the processors that changed the text. The lookup order
prefers fewer steps (section 9.6), so a word found as written beats one found
through normalisation.

```json
{"id": "kana", "name": "Convert hiragana and katakana",
 "variants": [[{"builtin": "ja.katakanaToHiragana"}], [{"builtin": "ja.hiraganaToKatakana"}]]}
```

`"keepInput": false` means the processor replaces each variant rather than
adding to it, as Yomitan's Korean `disassembleHangul` and Yiddish
`removeYiddishDiacritics` do. `"optional": true` makes the processor off
unless a request turns it on through a pack setting (section 4.7).

### 6.2 Steps

A variant is a list of steps applied in order. The step kinds are a closed
list; anything else needs a builtin.

| Step | Example | Meaning |
| --- | --- | --- |
| `case` | `{"case": "lower"}` | `lower`, `upper`, `upperFirst` (first code point) or `lowerFirst`, with the results JavaScript's `toLowerCase` and `toUpperCase` give: full case mappings including Final_Sigma (ΟΔΟΣ → οδος), U+0130 (İ → i + U+0307) and expansions (ß → SS). The engine adds these SpecialCasing entries to utf8proc's simple mappings. |
| `normalize` | `{"normalize": "NFD"}`, `{"normalize": "NFKD", "within": "[\\u3300-\\u33FF]"}` | Unicode normalisation `NFC`, `NFD`, `NFKC` or `NFKD`, of the whole text or only of the runs of code points in `within`. |
| `strip` | `{"strip": "[\\u0300-\\u036F]"}` | Removes every code point in the class. |
| `map` | `{"map": {"\u00E6": "ae", "\u0153": "oe"}, "at": "all"}` | Literal replacement, longest key first, scanning left to right. `at` is `all` (default), `first`, `last`, `start` (the text must begin with the key) or `end`. |
| `pattern` | `{"pattern": "(l\|dell\|all)['\u2019]", "replace": "", "global": true}` (abridged; Italian's real list has 12 words) | A regular expression replacement in the dialect of section 7.6. With `"repeat": true` it is applied again until the text stops changing, at most 16 times. |
| `alternatives` | `{"alternatives": {"dj": ["\u0111"], "c": ["\u010D", "\u0107"]}, "limit": 4096}` | Produces every combination of the listed alternatives, up to `limit` variants. At each match the key itself is the first choice and the listed alternatives follow in order (c → c, č, ć). As in Yomitan's generator, the first match varies slowest, and the limit keeps the first `limit` variants in that order. Keys may be several characters; at each position the longest key wins. The text is NFC-normalised first. Only allowed as the only step of its variant. |
| `builtin` | `{"builtin": "hangul.disassemble"}` | A named routine compiled into the engine (section 6.3). |

Greek's `removeDoubleAcuteAccents`, which keeps only the first acute accent,
is written as `[{"normalize": "NFD"}, {"pattern": "(\u0301[^\u0301]*)\u0301",
"replace": "$1", "repeat": true}, {"normalize": "NFC"}]`.

`readingNormalizer`, a rule's `then` steps and
`presentation.displayTransforms` are step lists with the same kinds, except
that display transforms and `then` steps may not use `builtin` or
`alternatives`. Hosts implement `case`, `normalize`, `strip`, `map` and
`pattern` for display transforms.

### 6.3 Builtins

Builtins are the only code a pack can name. Each is small, deterministic and
tested in the engine.

| Builtin | Used by | What it does |
| --- | --- | --- |
| `ja.nfkc` | ja | NFKC normalisation as `nfkc` does today. |
| `ja.katakanaToHiragana`, `ja.hiraganaToKatakana` | ja | Today's kana conversions, including the prolonged sound mark. |
| `ja.collapseEmphatic`, `ja.collapseEmphaticFull` | ja | `collapse_emphatic_sequences` with and without the full collapse. |
| `ja.fullwidthAlphanumeric` | ja | `alphanumeric_to_fullwidth`. |
| `ja.standardizeKanji` | ja | The kanji-processor variant table (`kanji_variants.cpp`). |
| `ja.expandIterationMarks`, `ja.kanjiNumbers`, `ja.stripMiddleDots` | ja | Today's three hoshidicts-only processors. |
| `ja.nekoSpeech` | ja (variant pass) | NekoPara cat speech (section 11.4). |
| `hangul.disassemble`, `hangul.assemble` | ko | Hangul syllables to jamo and back, matching [hangul-js](https://github.com/e-/Hangul.js) as Yomitan's Korean rules expect, including compound jamo. |
| `vi.toneMarksOld`, `vi.toneMarksNew` | vi | Yomitan's `normalizeDiacritics`: moves the tone mark to the old-style or new-style vowel. Its regular expressions use lookbehind and case-insensitive matching, which the dialect excludes, so it is code. |

A new builtin is a framework change: it needs an issue, a pull request to
`src/languages/builtins/` with tests, and an entry in this table.

## 7. `transforms.json`: deinflection rules

### 7.1 Shape

The file is Yomitan's `LanguageTransformDescriptor` written as JSON:

```json
{
  "schema": 1,
  "conditions": {
    "v": {"name": "Verb", "isDictionaryForm": true, "subConditions": ["v_phr"]},
    "v_phr": {"name": "Phrasal verb", "isDictionaryForm": true},
    "n": {"name": "Noun", "isDictionaryForm": true, "subConditions": ["np", "ns"]},
    "np": {"name": "Noun plural", "isDictionaryForm": true},
    "ns": {"name": "Noun singular", "isDictionaryForm": true}
  },
  "wordLists": {
    "particles": ["about", "away", "back", "down", "off", "on", "out", "over", "up"]
  },
  "transforms": [
    {
      "id": "plural",
      "name": "plural",
      "description": "Plural form of a noun",
      "source": "yomitan",
      "rules": [
        {"type": "suffix", "inflected": "s", "deinflected": "", "conditionsIn": ["np"], "conditionsOut": ["ns"]},
        {"type": "suffix", "inflected": "ies", "deinflected": "y", "conditionsIn": ["np"], "conditionsOut": ["ns"], "source": "both"}
      ]
    }
  ]
}
```

- `conditions` keeps Yomitan's fields: `name`, `isDictionaryForm`,
  `subConditions`, and optional `i18n` (kept, unused). The engine allocates
  one bit per condition without `subConditions`, in file order; a condition
  with `subConditions` stands for the union of their bits. At most 32 bits.
- `wordLists` names lists of words that `phrasal` and `interposedObject`
  rules refer to.
- `transforms` is an array, so the order of transforms is explicit. Order
  decides the order of results and, with `traceSelection: "first"`, which
  trace a result shows (section 9.6).
- `id` is unique in the file; corpora name transforms by id (section 12.2).
  `name` is the short trace label hosts show (`past`, `-た`).
  `description` is the longer explanation.
- `source` records provenance: `own` (written for this pack), `yomitan`
  (ported from Yomitan) or `both` (written independently and also in
  Yomitan). A rule inherits its transform's `source` unless it sets its own.
- `optional: true` on a transform keeps it off unless a request enables it
  (section 4.7).
- Any rule may have `then`: a list of text steps (section 6.2) applied to that
  rule's output only. Modern Greek uses it to strip accents after removing the
  prefix ξανα-.

### 7.2 Conditions

Conditions mean what they mean in Yomitan:

- A rule applies to a text whose current conditions are 0 or overlap the
  rule's `conditionsIn`. Conditions are 0 for the scanned text itself and for
  the output of a rule with an empty `conditionsOut`; a rule with an empty
  `conditionsIn` therefore applies only to those.
- The rule's output carries `conditionsOut`.
- A dictionary term matches a deinflected form when the form's conditions
  are 0 or overlap the conditions of the term's `rules` tags. A tag counts
  when a condition of that name has `isDictionaryForm: true`; tags the pack
  does not know are ignored, as Yomitan ignores them.

### 7.3 Rule types

Every rule has `type`, `conditionsIn` and `conditionsOut`. The engine indexes
rules by their literal parts, so lookups never scan the whole rule list.

| Type | Fields | Applies when | Produces |
| --- | --- | --- | --- |
| `suffix` | `inflected`, `deinflected`, stem constraints, `stemChange` | the text ends with `inflected` (which may be empty only with a stem constraint) | the text with that ending replaced by `deinflected` |
| `prefix` | `inflected`, `deinflected`, stem constraints | the text starts with `inflected` | the text with that beginning replaced |
| `wholeWord` | `inflected`, `deinflected` | the text equals `inflected` | `deinflected` |
| `circumfix` | `inflectedPrefix`, `deinflectedPrefix`, `inflectedSuffix`, `deinflectedSuffix`, stem constraints, `stemChange`; or the cross-product form below | the text starts and ends with the two parts, which do not overlap | both parts replaced |
| `replace` | `inflected`, `deinflected`, `occurrence` (`all`, `first`, `last`), `notAtStart` | the text contains `inflected` | each chosen occurrence replaced |
| `phrasal` | `inflected`, `deinflected`, `followedBy` (a word list) | the text has at least two words, the first ends with `inflected`, and the second is in the list | the first word's ending replaced; every other word kept (*looked up to* → *look up to*) |
| `interposedObject` | `particles` (a word list), `guardWords` (a word list) | the text is a verb, then one or more space-separated runs of any characters other than a space, none of whose pieces (the parts between non-word characters) is in `guardWords`, then a word in `particles` | the runs between the verb and the particle removed (*put it on*, *put Mary’s coat on*, *put the long-sleeved shirt on* → *put on*) |
| `pattern` | `pattern`, `replacement`, `anchorSuffix` or `anchorPrefix` | the text ends (or starts) with the anchor and matches `pattern` | `pattern` replaced by `replacement` |

In `phrasal` rules, and for the verb and the particle of `interposedObject`,
words are runs of the pack's `text.wordCharacters` separated by single spaces.
A word matches a list entry exactly, and
both keep every word after the particle (*put it on the table* → *put on the
table*). Yomitan matches a particle as a prefix of the next word (*looked
uptown* → *look uptown*); the pack does not, and lists that as a Yomitan defect
(section 8.2).

Stem constraints apply to the stem: the text that remains between the matched
parts.

| Constraint | Meaning |
| --- | --- |
| `stemMinLength` | The stem has at least this many code points (default 0). |
| `stemCharacters` | Every stem code point is in this class. |
| `stemContains` | At least one stem code point is in this class. |
| `stemStartsWith`, `stemEndsWith` | The stem's first (last) code point is in this class. |
| `stemNotStartsWith`, `stemNotEndsWith` | The stem's first (last) code point is not in this class, or the stem is empty. |
| `stemStartsWithText`, `stemNotStartsWithText` | The stem does (does not) begin with this literal string; Spanish *ju* + *ue* uses it. |

`stemChange` changes the stem while the affix is replaced:

```json
{"type": "suffix", "inflected": "o", "deinflected": "ar", "conditionsIn": ["v_ar"], "conditionsOut": ["v_ar"],
 "stemChange": {"from": ["ie"], "to": "e", "occurrence": "first"}}
```

`from` lists strings to look for in the stem; `occurrence` picks the `first`
or `last` match of any of them. Optional `between` is a class that every code
point between the change and the end of the stem must belong to, with
`betweenMinLength` (default 1) of them (Ukrainian `[ое]` → `і` before final
consonants, Tagalog u → o). The rule does not apply when the stem has no
match.

**Cross-product form.** A `circumfix` may give `prefixes` and `suffixes`
instead of the four single fields: `{"type": "circumfix", "prefixes": [["و",
""], ["ف", ""]], "suffixes": [["ه", ""], ["ها", ""]], ...}` stands for every
combination, expanded when the pack loads. Arabic's generated rules fit in a
few dozen such rows instead of 6,570.

Affixes are at most 64 code points; the conformance test rejects longer ones.

### 7.4 Recursion and cycles

Deinflection is the depth-first search hoshidicts uses today:

1. Record the text with its conditions and trace as a result.
2. Find the matching rules, in this order: suffix-indexed rules (`suffix`,
   `wholeWord`, `circumfix` by its suffix, `pattern` with `anchorSuffix`)
   through a trie of reversed suffixes, longest matched suffix first; then
   prefix-indexed rules (`prefix`, `pattern` with `anchorPrefix`) through a
   trie of prefixes, longest first; then `phrasal` rules through a trie of
   first-word endings, longest first; then `interposedObject` and `replace`
   rules in file order. Rules that match at one node apply in file order.
3. Recurse into every output with the rule's `conditionsOut`.

For Japanese, which has only suffix and whole-word rules, this is today's
order exactly (section 11). There is no depth limit, as today and as in
Yomitan. An output equal to one already produced by the same rule from the
same text earlier in the same trace is skipped, as Yomitan's `isCycle` skips
it; this can only happen with rules that do not shorten the text, so it never
happens in Japanese.

The trace of a result lists the transforms applied, in application order, as
`{id, name, description}`. Yomitan lists them newest first; converters and
tests reverse it.

### 7.5 Speed

The engine keeps the matches of one trie walk in a fixed array (64 entries,
the affix limit), allocates nothing per rule application except the output
string, and runs the cycle check only for rules whose output is not shorter
than their input. Repeated outputs are not deduplicated during the search
(section 9.5 skips their repeated queries).

### 7.6 The `pattern` dialect

`pattern` rules and steps use a small regular-expression grammar that the
conformance test parses. Within it, C++ `std::wregex` (ECMAScript grammar,
classic locale) and JavaScript give the same results:

- Allowed: literals, `.`, bracket classes with `\uXXXX` escapes and ranges,
  `{name}` class references (expanded before compiling), groups `(...)`,
  non-capturing `(?:...)`, alternation `|`, quantifiers `? * + {m,n}` and
  their lazy forms, anchors `^ $`, lookahead `(?=...)` and `(?!...)`,
  back-references `\1`-`\9`, and `$1`-`$9` and `$&` in replacements. The only
  flag is `global`.
- Rejected: lookbehind, `\p{...}`, `\u{...}`, named groups, the shorthand
  classes `\s \S \w \W \b \B \d \D` (their meaning differs between the two
  implementations), POSIX brackets such as `[[:alpha:]]`, and any other flag.
  Write the characters as a class, both cases included.
- The engine converts text to UTF-16 and gives `std::wregex` one code unit
  per `wchar_t`, so `.` and negated classes match one UTF-16 unit on every
  platform, as in JavaScript without the `u` flag. Classes in a pattern may
  therefore contain only code points up to U+FFFF. A `{name}` reference
  expands to explicit ranges computed from the same Unicode tables on both
  sides (general categories included); referencing a class with members above
  U+FFFF is an error.
- A `pattern` rule names an anchor literal that every text it matches ends
  with (`anchorSuffix`) or starts with (`anchorPrefix`). The engine tries the
  pattern only on texts with that anchor.
- Each pattern costs heap when it is compiled (about 11 KB for a pattern with
  a 78-word alternation in WebAssembly) and time when it is tried (2.5-9.5 µs
  per `regex_search` in WebAssembly). Section 13 gives the budget.

Use `pattern` only when no other type fits. Section 8 shows the Yomitan rules
that need it: German separated prefixes, the Spanish pronominal rule, Tagalog
reduplication and the Ukrainian fleeting vowel.

`std::wregex` adds 60,106 bytes (2.1%) to Hachidori's single-thread
WebAssembly bundle, measured by building it with and without a function that
compiles, searches and replaces.

## 8. Porting from Yomitan

### 8.1 The port tool

`tools/port-yomitan-transforms.mjs <yomitan checkout> <code>` imports
`ext/js/language/<code>/*-transforms.js` with Node and writes
`languages/<code>/sources/yomitan.json`. It never reads a rule's `type` or
`deinflected` fields, which do not always describe the rule (194 rules in
Yomitan have a misleading `type`, and Yiddish's 60 umlaut rules carry
`deinflected: ''` while their function changes the stem). It classifies each
rule by the shape of its `isInflected` source and by calling its `deinflect`
on probe stems from several scripts (Latin, Cyrillic, Greek, Arabic, Hebrew,
precomposed Hangul, kana, with combining sequences), resetting `lastIndex`
before every call because 28 rules carry the `g` flag:

| Source shape | Check | Pack rule |
| --- | --- | --- |
| `L$` preceded by nothing, by `n` dots or by `.{n}`, `L` free of metacharacters | `deinflect(s + L) == s + D` for every probe stem `s` of at least `n` code points | `suffix` with `inflected: L`, `deinflected: D`, `stemMinLength: n` |
| `^L` | `deinflect(L + s) == D + s` for every probe stem | `prefix` |
| `^L$` | `deinflect` returns one constant | `wholeWord` |
| anything else, or an empty affix | | `{"type": "todo", "isInflected": "<source>", "conditionsIn": [...], "conditionsOut": [...]}` |

`conditions`, transform keys (as `id`), names, descriptions and `i18n` are
copied, and transform key order becomes array order. The conformance test
rejects a pack with a `todo`, so every non-literal rule gets mapped by hand.

`tools/port-yomitan-tests.mjs <yomitan checkout> <code>` converts Yomitan's
`test/language/<name>-transforms.test.js` into `tests/yomitan.tsv`, with
transform ids as reasons, as `tests/generate_deinflection_fixture.mjs` does
for Japanese today.

### 8.2 The differential check

Yomitan's own tests are small or missing for most languages (about 382 cases
for Arabic's 7,157 rules, 14 for Tagalog's 635, none for French, Basque,
Georgian or Old Irish). So `tools/check-yomitan.mjs`, run in CI, compares the
engine with Yomitan's own `LanguageTransformer` for every pack that has
`source: "yomitan"` rules. It generates inputs from each Yomitan rule's
affixes on stems from the pack's letter class, adds Yomitan's test sources and
every prefix of them, runs Yomitan's transformer at d3c54c1 and
`hoshidicts-cli deinflect --transforms <code>/sources/yomitan.json` on each,
and requires the same set of (text, conditions). Yomitan defects the pack does
not reproduce are listed with a reason in `sources/yomitan-differences.tsv`,
for example Korean's `suffixInflection('', '다', [], ['ida'])`, which turns
every text into 다 because `slice(0, -0)` is empty, Yiddish rules that return
`''`, and English particles matched as word prefixes. Inputs for rules without
literal affixes come from the mapped pack rule (circumfix parts,
`stemChange.from`, pattern anchors, word lists) and from the pack's corpus
words. The check resets `lastIndex` before every call to a rule with the `g`
flag, so Yomitan's output does not depend on the order of the inputs.

The same tool compares processors. For each Yomitan pre- and postprocessor of
the language it takes the pack processor with the same `id` and runs both on
the corpus sources, the `host.sample` texts and inputs built from the
characters the processor names, and requires the same set of outputs,
including whether the input is kept. Builtins (Korean, Vietnamese) are
compared with Yomitan's processors through Yomitan's built `ext/lib`. Deliberate
differences are listed in `sources/yomitan-differences.tsv`. Ports that look
plausible can differ: Yiddish `combineYiddishLigatures` replaces the first
occurrence of each ligature in list order, which takes seven `map` steps with
`at: "first"`, not one `map` with `at: "all"`.

### 8.3 Constructs that are not literal

From a census of every Yomitan file at d3c54c1 (18,361 rules: 10,946 literal,
7,415 not):

| Language | Yomitan construct | Count | Pack rule |
| --- | --- | ---: | --- |
| ar | `sandwichInflection`: prefix + Arabic-letter stem + suffix, generated by `getImperfectRules` | 6,570 | `circumfix` in cross-product form, `stemCharacters` Yomitan's `arabicLetters` class (which includes U+064B-U+065F), `stemMinLength: 1` |
| ar | `(?<!ن)` / `(?<!ت)` before an affix (`conditionalSuffixInflection`, `conditionalPrefixInflection`) | 50 | `suffix` with `stemNotEndsWith`, `prefix` with `stemNotStartsWith` |
| de | `^ge([letters]+)t$` → `$1n`, `$1en` | 2 | `circumfix` |
| de | `^(ab\|an\|…)ge([letters]+)t$` | 2 | `circumfix` in cross-product form over the 66 prefixes |
| de | separated prefix `^([letters]+) .+ ab$` → `$1 ab` | 66 | `pattern` with `anchorSuffix: " ab"` |
| el | `^ξανα` removed, then accents stripped | 1 | `prefix` with `then: [{"normalize": "NFD"}, {"strip": "[\\u0300-\\u036F]"}, {"normalize": "NFC"}]` |
| en | phrasal verbs `^\w*ed (?:about\|…)` (from `createPhrasalVerbInflection`) | 38 | `phrasal`, one per suffix rule, `followedBy` the 78-word list |
| en | interposed object | 1 | `interposedObject` with Yomitan's particle and preposition lists |
| es | stem changes `ie→e`, `ue→o`, `i→e`, `u→o` with endings | 26 | `suffix` with `stemChange` |
| es | of those 26, three -ar rules: `ue→u` when the text starts with `jue` (*jugar*), otherwise `ue→o` | 3 of the 26 | a `suffix` with `stemChange` ue → u and `stemStartsWithText: "jue"`, beside the `ue→o` rule with `stemNotStartsWithText: "jue"` |
| es | of those 26, three -er rules: `hue→o` when the text starts with `hue` (*huele* → *oler*), otherwise `ue→o` | 3 of the 26 | a `suffix` with `stemChange` hue → o and `stemStartsWithText: "hue"`, beside the `ue→o` rule with `stemNotStartsWithText: "hue"` |
| es | reflexive `(me\|te\|se\|nos\|os) (\w+)(ar\|er\|ir)` → `$2$3se` | 1 | `pattern` with `anchorPrefix` per pronoun |
| ko | `suffixInflection('', '다', [], ['ida'])` | 1 | not ported (a Yomitan defect; section 8.2) |
| sga | global replacement, optionally not at the start (`tryAlternateOrthography`) | 27 | `replace` with `occurrence: "all"` and `notAtStart` |
| sq | `.*[^j]E$` | 6 | `suffix` with `stemNotEndsWith: "[j]"`, `stemMinLength: 1` |
| tl | `sandwichInflection` (`^P\w+S$`) | 420 | `circumfix`, `stemMinLength: 1` |
| tl | the same with u → o | 60 | `circumfix` with `stemChange` and `between` |
| tl | u → o before consonants at a suffix | 4 | `suffix` with `stemChange` and `between` |
| tl | reduplication `^(P)(C*V)(\2)` | 15 | `pattern` with `anchorPrefix` and a back-reference |
| tl | hyphen removal | 1 | `replace` |
| uk | `[ое]([C]+)E$` → `і$1D` | 29 | `suffix` with `stemChange` and `between` |
| uk | fleeting vowel `([C])([C])E$` → `$1е$2D` and `$1о$2D`, where D is ь for nine endings and empty for и, у, а and ом (`fleetingVowelInflection`, 13 endings × 2 vowels) | 26 | one `pattern` per ending and vowel, anchored on that ending |
| uk | `.[ое]Xі$` | 6 | `suffix` with `stemChange` |
| uk | zero ending after a closed syllable `[V].*[C]$` → text + ending | 3 | `suffix` with empty `inflected`, `stemContains` the vowels and `stemEndsWith` the consonants |
| uk | minimum stems (`requireStem`) | 333 | literal `suffix` with `stemMinLength` |
| yi | umlaut mutation of the stem's last vowel letter | 60 | `suffix` with `stemChange` (`occurrence: "last"`, `between`) |

Every pre- and postprocessor in Yomitan is a step kind of section 6.2, except
Hangul jamo and Vietnamese tone placement (builtins) and Japanese romaji input
(not offered). Georgian's transforms declare `language: 'kat'` although its
descriptor is `ka`, so Yomitan never applies them; the `ka` pack uses them as
written.

## 9. The lookup pipeline with a language

A request names a language. Everything else is as today unless this section
says otherwise.

### 9.1 Scan

The host passes text that starts where the pack's `scanStart` says and a
`scan_length` in code points. The long-key extension for keys longer than 16
code points (`scan.idx`) works for every language: the engine computes the
variants of the first eight code points explicitly, whatever the resolution,
when the scan covers at least eight code points (a shorter scan never extends,
as today), through the pack's pre- and postprocessors without deinflection, so
they are written as dictionaries write keys (for Korean, in syllables again).

### 9.2 Prefixes

`character` resolution looks up every prefix from `scan_length` code points
down to one, as today. `word` resolution looks up only prefixes that end at a
word boundary: the end of the text, or a position after a word character
(`text.wordCharacters`, with `wordInternal` characters counting as word
characters between two of them) followed by a character that is not one.
*reading a book* gives *reading a book*, *reading a* and *reading*, never
*rea*. When `scan_length` ends inside a word, the window grows to that word's
end (up to the text the host passed), so a word longer than the scan length
(*desafortunadamente*, 18 code points) is still looked up. Packs with
character resolution, such as German, reach long keys through the long-key
index instead.

### 9.3 Processing and deinflection

Each prefix goes through the pack's preprocessors (section 6.1), each variant
through the pack's deinflector (section 7), and each deinflected form through
the pack's postprocessors, whose changes add to the variant's `steps` as
preprocessors' do. Enabled variant passes run where they run today for
Japanese (section 11.4).

### 9.4 Query and part-of-speech filter

Each form is looked up in the selected dictionaries. A term is kept when the
form's conditions are 0 or overlap the conditions of the term's `rules` tags
under this pack's conditions (section 7.2). `LookupOptions::pos_filter_exempt`
lists dictionaries whose terms skip the filter, for dictionaries without
`rules` such as MDX imports; it is empty by default, which is today's
behaviour.

### 9.5 Repeated texts

A prefix and variant can produce the same deinflected text more than once:
2,015 of the 22,393 deinflections of the Japanese corpus prefixes repeat a
text, 520 of them with the same conditions. The dictionary query depends only
on the text; conditions only filter its result. The engine therefore queries
each text once per prefix and variant and applies the part-of-speech filter
per deinflection. With `traceSelection: "first"` this gives exactly today's
results; the framework keeps it only if the Japanese benchmark shows it is not
slower than querying every repeat.

### 9.6 Order and grouping

Results are ordered by the comparator hoshidicts uses today: primary reading,
matched length, processor steps, trace length, written form equals the form
looked up, the chosen frequency, dictionary rank, score, written form equals
reading. Dictionary rank is the position in the request's dictionary selection
(section 9.7). Where the reading equals the expression, as for languages
without readings, the reading terms compare equal strings and have no effect.

Candidates are grouped by `(expression, reading)` as today. With
`traceSelection: "first"` a term keeps the first deinflection that reached it
at its longest matched length (today's behaviour); with `shortest` it keeps
the one with the fewest processor steps, then the shortest trace, then the
first, which is how the comparator ranks them. When the pack has a
`readingNormalizer`, readings are compared after normalising (in the
candidate key and in `query_raw`'s merge); a merged result shows the reading
of the first term found, collects frequencies and pitches for every reading
it merged, and `primary_reading` is compared normalised.

### 9.7 Dictionary selection

`LookupOptions::dictionaries` is an ordered list of loaded dictionary paths.
When present, the engine resolves it into indices once per request; term,
frequency, pitch and kanji queries, the long-key length, the choice of the
frequency-sort dictionary and the rank of metadata-only terms then use only
those dictionaries, ranked in that order. A path that is not loaded is
ignored, and an empty list selects nothing, so a new profile without
dictionaries finds nothing rather than another profile's words. When absent,
every loaded dictionary is used in load order, as today.
One engine can hold every dictionary of every language a host uses and answer
each request from the right ones without reloading.

### 9.8 Segmentation

Splitting running text into words (Hachidori's word highlighting) is done by
hosts on top of `lookup`; Hachidori's segmenter lives in its
`wasm/bindings.cpp`. A pack supplies what a segmenter needs:

- `scan` segmentation: the pack's `functionWords`, around which the segmenter
  may split (Japanese particles, as today).
- `spaces` segmentation: runs of `text.pattern` are looked up at each word
  start; a span is the matched text of the best result there, which may cover
  several words (Vietnamese *học sinh*, English *look up*). A word no result
  covers is no span.
- `wordHighlighting: false` tells hosts not to offer it.

### 9.9 Kanji and character lookups

`query_kanji` takes the dictionary selection. Which characters are offered for
lookup is the host's decision, made with the pack's `characterView.pattern`.

## 10. Engine API

### 10.1 C++

```cpp
#include "hoshidicts/languages.hpp"

namespace hoshidicts {

// A parsed, immutable pack: processors, deinflector, scanning data.
class LanguagePack;

class LanguageRegistry {
 public:
  // A registry holding the packs built into the library (Japanese).
  static LanguageRegistry with_builtin();
  // Parses one pack. transforms_json may be empty when the pack has none.
  // A pack with the same code replaces the previous one. add() must not run
  // while lookups use the registry; a host that adds packs while it serves
  // lookups serialises them (Hachidori does). Returns false and sets `error`
  // (pack code, file, JSON path and reason) on any problem.
  bool add(std::string_view language_json, std::string_view transforms_json, std::string* error);
  // Loads every `<dir>/<code>/language.json` whose directory name does not
  // start with '_'.
  bool add_directory(const std::string& languages_dir, std::string* error);
  std::shared_ptr<const LanguagePack> find(std::string_view code) const;
  std::vector<std::string> codes() const;
};

}  // namespace hoshidicts

struct LookupOptions {
  // ... existing fields ...
  std::string language = "ja";
  // Ordered package paths; see section 9.7.
  std::optional<std::vector<std::string>> dictionaries;
  // Ids of optional preprocessors, optional transforms and variant passes to
  // enable for this request (pack settings with engine effects).
  std::vector<std::string> language_options;
  // Dictionaries whose terms skip the part-of-speech filter (section 9.4).
  std::vector<std::string> pos_filter_exempt;
};

class Lookup {
 public:
  Lookup(DictionaryQuery& query, const hoshidicts::LanguageRegistry& languages);
  // Kept for existing callers: the built-in Japanese pack with this deinflector.
  Lookup(DictionaryQuery& query, Deinflector& deinflector);
  // lookup and lookup_dictionary as today; options.language selects the pack.
  // An unknown language throws std::invalid_argument; it never falls back.
};

// The generic deinflector built from a pack's transforms.
class Deinflector {
 public:
  // Kept for existing callers: the built-in Japanese pack's rules.
  Deinflector();
  std::vector<DeinflectionResult> deinflect(const std::string& text) const;
  uint32_t conditions_for_parts_of_speech(std::span<const std::string> tags) const;
  uint32_t conditions_for_types(std::span<const std::string> names) const;
  // Kept for existing callers: Japanese part-of-speech conditions, and
  // NekoPara cat speech (now the Japanese pack's variant pass).
  static uint32_t pos_to_conditions(const std::vector<std::string>& part_of_speech);
  std::vector<DeinflectionResult> deinflect_neko_speech(const std::string& text) const;
  static constexpr std::string_view neko_speech = "neko speech";
  static bool is_neko_speech(const DeinflectionResult& result);
};
```

`TransformGroup` gains an `id` field beside `name` and `description`.

**Built-in packs.** The Japanese pack is also compiled into the library:
`src/languages/builtin_packs.cpp` holds `languages/ja/language.json` and
`transforms.json` as byte arrays, generated by `tools/embed-packs.py` and
committed, so Swift Package builds, which do not run CMake, have it too. The
conformance test fails when the embedded copy differs from the pack.
`LanguageRegistry::with_builtin()` starts with it, so Japanese lookups need no
files and a host that never loads a pack behaves as today. Other packs load
at run time (decision record 0002). A registry may be shared by several
`Lookup` objects; packs are immutable once added and held by `shared_ptr`, so
replacing one never frees a pack another `Lookup` still holds.

### 10.2 C

Existing functions keep their signatures and behaviour: `hd_deinflector_new()`
returns the built-in Japanese deinflector, and `hd_lookup_new(q, d)` looks up
Japanese as today. New functions:

```c
typedef struct hd_languages hd_languages;
hd_languages* hd_languages_new(void);  // starts with the built-in packs
void hd_languages_free(hd_languages* languages);
int hd_languages_add(hd_languages* languages, const char* language_json, const char* transforms_json);
int hd_languages_add_directory(hd_languages* languages, const char* path);
const char* hd_languages_last_error(const hd_languages* languages);

typedef struct hd_language_request {
  size_t struct_size;                   // sizeof(hd_language_request), so fields can be added
  const char* language;                 // NULL means "ja"
  const char* const* dictionaries;      // NULL: every loaded dictionary; non-NULL with count 0: none
  size_t dictionary_count;
  const char* const* language_options;
  size_t language_option_count;
  const char* const* pos_filter_exempt;
  size_t pos_filter_exempt_count;
} hd_language_request;

hd_lookup* hd_lookup_new_with_languages(hd_query* q, const hd_languages* languages);
// Like hd_lookup_run_with_options, for one language and dictionary selection.
// Returns NULL and points *out_error at a message (valid until the next call
// on this thread) on an unknown language.
hd_lookup_results* hd_lookup_run_with_language(const hd_lookup* l, const char* lookup_string, int max_results,
                                               size_t scan_length, const hd_lookup_options* options,
                                               const hd_language_request* request,
                                               const hd_lookup_result** out_results, size_t* out_count,
                                               const char** out_error);
// The transform id of each trace step of result i, step j; hd_transform_group
// keeps its layout for callers built against the existing header.
hd_str hd_lookup_results_trace_id(const hd_lookup_results* r, size_t i, size_t j);
```

### 10.3 Command line

`hoshidicts-cli` gains `--languages <dir>` (default: the build's
`languages/`) and:

```text
hoshidicts-cli languages                                   list loaded packs
hoshidicts-cli deinflect <code> <text> [--transforms <file>]   every deinflection, its conditions and trace
hoshidicts-cli preprocess <code> <text>                    every processor variant with its steps
hoshidicts-cli lookup --language <code> <dict>... <text>
hoshidicts-cli eval-language <code> <file.tsv> [--transforms <file>] [--dictionary <imported dir>] [--per-rule]
```

`eval-language` reads a corpus (section 12.2) and prints JSON. Only
deinflections of the whole source text count, never of shorter prefixes:

- `recall`: the share of `valid = 1` rows for which the term is among the
  deinflections and compatible with the row's `rule`, as the conformance test
  decides it;
- `negativesPassed`: the share of `valid = 0` rows whose term is not among
  them;
- with `--dictionary`: `falseCandidates`, the mean number of distinct
  deinflected texts per row that are headwords of that dictionary, pass its
  part-of-speech filter, and are neither the source text nor the expected
  lemma; and `firstRank`, the share of rows where a full lookup of the source
  ranks the expected lemma first;
- with `--per-rule`: for each rule, the rows only it recovers, the false
  candidates only it adds, and the negatives it breaks.

Language pull requests report these numbers for their own rules, Yomitan's
rules and the final set.

### 10.4 WebAssembly (Hachidori)

Hachidori's `wasm/bindings.cpp` keeps one registry, started with
`with_builtin()`, outside the `Engine` object that `hdw_reset` rebuilds, so
loaded packs survive a reload. It exports:

- `hdw_language_load(language_json, transforms_json)` → 1 or 0 with
  `hdw_last_error`;
- `hdw_languages()` → JSON list of loaded codes;
- `hdw_deinflect(text, code)` → JSON deinflections (tests and diagnostics);
- the `options_json` of `hdw_lookup`, `hdw_lookup_dictionary`, `hdw_segment`
  and a new `hdw_kanji_with_options` accepts `language`, `dictionaries` and
  `languageOptions`. `"dictionaries": []` selects nothing. A request without
  these keys is answered exactly as today.

Engine calls are serialised in Hachidori's engine worker, and import workers
are separate instances that never use the registry.

## 11. The Japanese pack

### 11.1 How it is made

`languages/ja/transforms.json` is generated once from today's
`src/deinflector.cpp` by `tools/export-legacy-japanese.cpp`, which builds the
current deinflector and writes its groups, conditions and rules in insertion
order, with `add_irregular`'s generated rules written out. Transform ids are
the group names, which are unique. The group descriptions keep their Yomitan
attribution in the pack README, as the header of `deinflector.cpp` does today.
The pack is embedded in the library (section 10.1).

The conditions are today's `Conditions` enum in its bit order: the 18 flags
`v1d … ya` as conditions without `subConditions`, and `v1`, `v5s`, `v5`, `v`
as conditions with `subConditions`. `isDictionaryForm` is true exactly for the
six tags `pos_to_conditions` maps today: `v1`, `v5`, `vk`, `vs`, `vz`,
`adj-i`. `traceSelection` is `first`.

The preprocessors are today's eight, in today's order, as builtins: `ja.nfkc`;
kana (two variants); emphatic sequences (two variants); full-width
alphanumerics; kanji variants; iteration marks; kanji numbers; middle dots.

### 11.2 What stays Japanese-only

- Furigana alignment by kana and the KANJIDIC split are host features keyed on
  `ruby.alignment: "kana"`.
- Pitch accent (`pitchAccent: true`) is Japanese mora pitch.
- The 18 hoshidicts auxiliary groups that Yomitan lacks (`-あげる` … `-やる`)
  stay in the pack with `source: "own"`.

### 11.3 Proof of identical results

Today's code is kept, unmodified apart from being placed in
`namespace hoshidicts_legacy`, as a reference in `tests/reference/`:
`legacy_deinflector.cpp`, `legacy_text_processor.cpp` (with the kanji-variant
table), `legacy_query.cpp` and `legacy_lookup.cpp` (the `Lookup` of 35e2dab),
with copies of the internal headers they use (`query_internal.hpp`,
`text_processor.hpp`, `query.hpp`, `lookup.hpp`, `deinflector.hpp`). The
oracle shares only the storage readers (`blob_file`, the page cache,
`scan_index`, the glossary parser), which the framework does not change.
Three tests compare the new code with it and require identical output, every
field in the same order, traces compared by name and description, with each
Japanese transform id equal to its name:

- `ja-deinflect-parity`: deinflections (texts, conditions, traces) for every
  row of `languages/ja/tests/yomitan.tsv` (Yomitan's complete Japanese
  conjugation corpus, 1,446 rows, moved from `tests/fixtures/`), every row of
  `cases.tsv` (today's whole-word, historical kana and cat-speech cases), every
  prefix of every source, deep chains such as 食べ + させ × 40 + る, and
  100,000 strings built from a fixed seed by chaining rule endings onto kana,
  kanji and Latin stems.
- `ja-process-parity`: processor variants and steps for the same inputs.
- `ja-lookup-parity`: `lookup()` and `lookup_dictionary()` results (matched,
  deinflected, trace, term, frequencies, pitches, preprocessor steps) on a
  committed test dictionary with term, frequency, pitch and kanji banks and a
  key longer than 16 code points, for the corpus sources and their prefixes,
  the four benchmark words and the generated strings, at scan lengths below
  and above the long key, with `neko_speech`, `metadata_only_terms`, each
  frequency order and `primary_reading` on and off; the inputs also include
  the long key itself, an inflected form of it, the long key followed by more
  text, and a prefix of it that is not a key. A selection case loads the
  test dictionary, a second Japanese dictionary and an English one; for each
  selection S (one dictionary, two in both orders) the new lookup with
  `dictionaries = S` must equal the legacy lookup with only S loaded, in S's
  order, with every option on and off, and `query_kanji` with and without a
  selection must equal the legacy query's.

### 11.4 NekoPara cat speech

`deinflect_neko_speech` becomes the variant pass `nekoSpeech` of the Japanese
pack (`ja.nekoSpeech`). `LookupOptions::neko_speech = true` keeps working and
means `language_options = {"nekoSpeech"}`; the pass applies only where it
reads more of the text than every ordinary result, as today.

## 12. Tests and the conformance check

### 12.1 What runs

`ctest -R language` (CMake option `HOSHIDICTS_LANGUAGE_TESTS`) builds
`language-conformance-test` and runs it once per pack directory. CMake finds
the pack directories with `file(GLOB ... CONFIGURE_DEPENDS)`, so adding a pack
adds its test, also in an existing build directory. CI runs it together with
every existing test (`HOSHIDICTS_TESTS`), the three Japanese parity tests,
`tools/check-classes.mjs` and `tools/check-yomitan.mjs`.

For every pack it checks:

1. `language.json` and `transforms.json` against the schemas in this file:
   required fields, no unknown keys, `code` equal to the directory name,
   condition and word-list references defined, at most 32 condition bits, no
   cycles in `subConditions` or class references, unique ids, builtins known,
   `then` and display transforms free of `builtin` and `alternatives`,
   engine-effect settings boolean, setting effects naming declared processors,
   transforms, passes, display transforms or optional capabilities, affixes of
   at most 64 code points.
2. Every class parses and means the same in the engine and in JavaScript, and
   every pattern and `case` step gives the same output in both on the pack's
   corpus strings (expectation tables generated with Node by
   `tools/check-classes.mjs`).
3. Every `pattern` is in the dialect of section 7.6 and compiles; no `todo`
   rules remain.
4. Every TSV in `tests/` except `gaps.tsv` passes; `gaps.tsv` is run and its
   pass count printed. No corpus input reaches the 4,096-variant limit.
5. Coverage: every `own` and `both` transform has at least one passing
   `valid = 1` row, and the rules no row exercises are printed.
6. `README.md` exists and has the sections of the template.

### 12.2 Corpus format

Every deinflection TSV uses the format of today's Japanese fixture:

```text
# Source: UniMorph eng (https://github.com/unimorph/eng), CC BY-SA 3.0. 412 rows sampled with seed 1.
# category<TAB>valid<TAB>source<TAB>term<TAB>rule<TAB>reasons
verbs	1	running	run	v	ing
verbs	1	went	go	v	past
nouns	1	buses	bus	n	plural
negatives	0	bus	bu	*	*
```

- `valid`: `1` means `term` must be among the deinflections of `source`;
  `0` means it must not be.
- `rule`: a condition name the term must be compatible with, or `*` for any.
- `reasons`: transform ids separated by `|`, in Yomitan's forward order
  (newest first), or `*` for any trace, or empty for no transform. For
  Japanese the ids are the names, so today's fixture is unchanged.
- The source text goes through the pack's preprocessors first, as in a lookup.

`text.tsv` checks processors: `category valid input variant` (the variant is,
or is not, among the processed variants). `lookup.tsv` checks the whole
pipeline against `tests/dictionary/`: `category valid text expression matched`
(the first result has this expression and matched text). The test writes the
tiny dictionary into a stored ZIP and imports it at run time.

### 12.3 Hachidori's checks

Hachidori runs its own contract tests over the packs it ships (settings
schema, display transforms in JavaScript, samples rendered by every theme).
They are described in Hachidori's `docs/languages.md`.

## 13. Performance budget

Japanese, measured before and after on the same machine with the same
dictionaries:

- native `benchmark-lookup` p50 and p95 for the four reference words
  (`食べました`, `走り出した`, `美しい景色`, `日本語を勉強しています`) and for the
  1,382 distinct sources of the Japanese corpus, and Hachidori's Node
  `hdw_lookup` timings for the same words: within the noise of repeated runs
  (target within 3%). Baseline at 35e2dab, GCC 14.3, Jitendex 2026-10-03:
  reference words p50 14.3 µs, p95 30.7 µs; corpus sources p50 15.4 µs,
  p95 59.3 µs.
- Hachidori's production-path benchmark (`benchmark/run.mjs` with Jitendex and
  Pixiv Light): steady-hit p50 and p95 within noise;
- engine heap after loading and WebAssembly bundle size: growth reported, the
  bundle within 5%;
- built-in pack load at engine start: under 10 ms in Chrome.

Every other pack's pull request reports, with a real dictionary and at least
50 words from real sentences:

- native `benchmark-lookup` p50 and p95, budget 1 ms p50 for a 16-code-point
  scan, and Hachidori's `hdw_lookup` p50 and p95 in WebAssembly;
- pack load time and heap after loading, in Node with the threaded and the
  single-thread builds: budgets 50 ms and 20 MB;
- for packs with `pattern` rules: the number of patterns and their heap.

A pack over budget is not merged until it is fixed or the reason is accepted
in review.

## 14. Adding a language

1. **Start from the template.** `cp -r languages/_template languages/<code>`
   with Yomitan's code for the language. Fill in identity, `classes`, `text`
   and `capabilities` in `language.json`, starting from the language's row in
   the table below.
2. **Write your own rules first.** From grammars, Wiktionary inflection tables
   and UniMorph, write the transforms a learner needs to reach a dictionary
   headword: conjugations, declensions, plurals, comparatives, clitics,
   mutations, orthographic alternations. Use the types in section 7.3. Save
   them as `sources/own.json` and commit that alone.
3. **Port Yomitan's rules.** Run `tools/port-yomitan-transforms.mjs` and map
   every `todo` (section 8.3) in `sources/yomitan.json`. Port Yomitan's
   processors into `lookup.preprocessors` and `postprocessors`. Run
   `tools/port-yomitan-tests.mjs` if Yomitan has tests for the language, and
   `tools/check-yomitan.mjs` until it passes.
4. **Build a corpus.** Take 300-2,000 inflected form → lemma pairs from a
   licensed source (UniMorph, Wiktionary through kaikki.org), add hand-written
   tricky cases and negatives, and record source, licence and attribution in
   the README.
5. **Measure and choose.** Run `hoshidicts-cli eval-language --per-rule` for
   your rules, Yomitan's and their union, with a real dictionary imported by
   `hoshidicts-cli import`. Keep the union minus rules that only add false
   candidates or break negatives, and mark each rule's `source`. Write the
   result to `transforms.json` and the numbers to the README.
6. **Fill in the host data.** `presentation`, `settings` (only if the language
   needs one), `host.recommendedDictionaries`, `host.sample`.
7. **Run the checks.**

   ```sh
   cmake -S . -B build -DHOSHIDICTS_LANGUAGE_TESTS=ON -DHOSHIDICTS_CLI=ON -DHOSHIDICTS_BENCHMARK=ON
   cmake --build build --parallel 8
   ctest --test-dir build -R language --output-on-failure
   node tools/check-classes.mjs <code> && node tools/check-yomitan.mjs <yomitan checkout> <code>
   ```

8. **Open a pull request** that changes only `languages/<code>/`, with the
   rule provenance, the corpus source and licence, own / Yomitan / final
   recall and false candidates, the dictionary you measured with, the
   performance numbers of section 13 and the known gaps.

Checklist for reviewers: only the pack directory changes; conformance and the
differential check pass; no `todo` rules; every corpus file has a source and
licence; recall and false candidates are reported for all three rule sets; no
rule produces a wrong lemma on the negatives; the performance numbers are
within budget.

### 14.1 Starting points

What Yomitan has for each language at d3c54c1, what the pack needs beyond
literal rules, and the recommended text settings (`scanStart`,
`searchResolution`, `segmentation`). These are starting points; a pack author
who measures better values uses them and says why.

| Code | Yomitan rules | Yomitan processors | Beyond literal rules | Start / resolution / segmentation | Notes |
| --- | --- | --- | --- | --- | --- |
| en | 137 (98 literal) | capitalisation | `phrasal`, `interposedObject` | word / word / spaces | Hyphens and apostrophes separate words: `lookup.tsv` cases *minute walk* → minute (from *five-minute*), *mother’s house* → mother; `cases.tsv`: *put Mary’s coat on* → put on. |
| es | 545 (518 literal) | capitalisation | `stemChange` with `stemStartsWithText` (jue, hue), `pattern` (reflexive) | word / word / spaces | `cases.tsv`: *huele* → oler, *juego* → jugar. Yomitan blocks the stem change before ñ (*sueña* → no *soñar*); a pack rule finds *soñar*: list it as a difference. |
| ko | 2,682 (one Yomitan defect) | Hangul disassemble/assemble (`keepInput: false`) | builtins | cursor / character / spaces | No particle rules: nouns are reached by shortening, so character resolution is needed. Add a `lookup.tsv` case 학교에서 → 학교. |
| fr | 2,672 literal | capitalisation, apostrophe variants | none | word / word / spaces | The apostrophe separates words: `lookup.tsv` case *homme est là* → homme (from *l’homme*); elided articles and pronouns (l’, d’, qu’) need own rules. |
| de | 144 (74 literal) | capitalisation, ß | `circumfix`, `pattern` (separated prefixes) | cursor / character / spaces | Character resolution finds parts of compounds. |
| it | none | capitalisation, accents, apostrophed words | own rules only | word / word / spaces | |
| pt | none | capitalisation (descriptor only) | own rules only | word / word / spaces | Nothing in Yomitan. |
| ru | none | capitalisation, ё → е, stress marks | own rules only | word / word / spaces | |
| uk | 3,023 (2,959 literal) | capitalisation, stress marks, apostrophe variants | `stemChange`, `pattern` (fleeting vowel), `stemContains` | word / word / spaces | `wordInternal`: the apostrophes; `lookup.tsv` case *м’ясо свіже* → м’ясо. |
| zh | none | radical normalisation; pinyin reading normaliser | `readingNormalizer` | cursor / character / scan | Hanzi character view; ruby `syllable`. |
| ar | 7,157 (537 literal) | diacritics, tatweel, NFKC, hamza, alif maqsura | `circumfix` cross-product, stem constraints | word / word / spaces | Right to left; `joinedScript`. |
| el | 6 (5 literal) | capitalisation, double acute accents (`pattern` with `repeat`) | `prefix` with `then` | word / word / spaces | Final sigma needs the full case mapping. |
| grc | 55 literal | capitalisation, diacritics, Latin to Greek | none | word / word / spaces | |
| la | 8 literal | capitalisation, diacritics, diphthongs | none | word / word / spaces | |
| eo | 24 literal | capitalisation | none | word / word / spaces | |
| eu | 75 literal | capitalisation | none | word / word / spaces | Agglutinative: long traces. |
| ga | 7 literal (eclipsis) | capitalisation | none | word / word / spaces | Lenition is not in Yomitan. |
| sga | 70 (43 literal) | capitalisation, diacritics | `replace` | word / word / spaces | Orthographic replacements repeat texts; section 9.5 bounds the queries. |
| ka | 16 literal | none | none | word / word / spaces | Yomitan never applies them (`kat` key). |
| sq | 94 (88 literal) | capitalisation | stem constraints | word / word / spaces | |
| tl | 635 (135 literal) | capitalisation, diacritics | `circumfix`, `stemChange`, `pattern` (reduplication), `replace` | word / word / spaces | |
| sh | none | capitalisation, accent marks, diacritic alternatives | own rules only | word / word / spaces | `alternatives` multiplies variants. |
| vi | none | capitalisation, tone placement (builtins) | own rules only (little inflection) | word / word / spaces | Words span syllables; segmentation spans may cover several words. |
| yi | 83 (23 literal) | diacritics, ligatures (`keepInput: false`); final letters (`keepInput: false`), ligatures (postprocessors) | `stemChange` | word / word / spaces | Right to left. Ligatures: seven `map` steps with `at: "first"`. |
| aii | none | Syriac diacritics | own rules only | word / word / spaces | Right to left; `joinedScript`. |

## 15. Working on packs in parallel

- A pack pull request touches only `languages/<code>/`. There is no list of
  languages to edit anywhere, so two pack pull requests never conflict.
- The framework pull request includes every construct section 8 and the table
  above name, so the first 25 packs need no framework change.
- Anything else outside a pack (a new builtin, step or rule type, a schema
  change, a fix in the pipeline) is a framework change. Open an issue
  describing what the language needs and why the existing types cannot
  express it; the framework maintainer batches such changes, updates this
  file, and tells pack authors to rebase.
- Pack pull requests rebase on `main` before merging; because packs do not
  overlap, a rebase never needs conflict resolution.
- Schema changes are additive within `schema: 1`. A breaking change bumps
  `schema` and the conformance test accepts both versions until every pack is
  migrated.

## 16. Known limits

- **No morphology.** Deinflection proposes forms; it does not analyse.
  Agglutinative languages (Korean, Basque, Georgian) produce long traces and
  some false candidates, which the dictionary query and part-of-speech filter
  prune.
- **Tone and stress are not pitch accent.** A future capability could describe
  Chinese tones or Russian stress; today they are visible only in readings and
  IPA.
- **Clitics are deinflected, not segmented.** Arabic `وَ`, `بِ`, `ال` written
  together with a word are removed by rules, not by word splitting.
- **The pattern dialect is small.** It excludes lookbehind, Unicode properties
  and shorthand classes so that one string means the same in C++ and
  JavaScript; Yomitan rules that use them are rewritten with stem constraints
  or dedicated types.
- **Character classes have no script property**; packs list ranges.
- **Dictionary-form redirects** (Yomitan's `[term, [rules]]` glossaries) are
  still skipped by the importer, as today.
