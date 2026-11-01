<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
# Languages in hoshidicts

Status: design for review (Phase 1). Nothing described here is implemented
yet. Once the framework lands, this file is the contract for language packs
and wins over any prompt, issue or comment that disagrees with it.

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
8. [Porting a Yomitan transforms file](#8-porting-a-yomitan-transforms-file)
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

- **One engine, many languages at once.** Every lookup and deinflection
  names its language and may name the dictionaries to use. A host can answer
  a Japanese page and an English page from the same loaded engine without
  reloading anything.
- **A language is data.** Adding a language means adding one directory,
  `languages/<code>/`, with no edit to engine code, CMake files, CI workflows
  or any shared list. Packs are discovered by directory.
- **Yomitan's rules port mechanically.** Every rule in Yomitan's
  `ext/js/language/*/*-transforms.js` at
  [d3c54c1](https://github.com/yomidevs/yomitan/tree/d3c54c10264673eca0d66b970ef74cd5c8b048e3/ext/js/language)
  can be written in the pack format; the ordinary ones (suffix, prefix,
  whole word) are converted by a script.
- **Japanese is unchanged.** The Japanese pack reproduces today's
  deinflection results, traces, text-processor variants and lookup order
  exactly, at the same speed (section 11, section 13).
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
  (`LanguageRegistry`). Hosts load packs from a directory or from JSON
  strings.
- **Language code**: the pack's directory name and `code` field. It is
  Yomitan's `iso` value for the language (`en`, `ja`, `grc`, `sga`, `aii`,
  ...); `pt` for Portuguese, which Yomitan describes without transforms.
- **Capability**: a named feature a pack declares, such as a character view
  or ruby readings (section 4.6). The engine uses only the capabilities that
  change lookups; hosts use them to decide which settings and popup features
  apply.
- **Dictionary selection**: the ordered list of loaded dictionaries a request
  may use. A host passes one per request (section 9.6). The engine does not
  know which language a dictionary is for; the host does.

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
    README.md             sources, licences, attribution, provenance, known gaps (required)
    tests/
      yomitan.tsv         Yomitan's own test cases for the language, converted (optional)
      corpus.tsv          inflected form -> lemma pairs from a licensed source (required when transforms exist)
      cases.tsv           hand-written tricky cases and negatives (optional)
      gaps.tsv            known failures: reported, not enforced (optional)
      text.tsv            text-processor expectations (optional)
      lookup.tsv          whole-pipeline cases against tests/dictionary/ (optional)
      dictionary/         a tiny Yomitan dictionary as JSON banks (optional)
    sources/              working files that are not loaded: own.json, yomitan.json, eval reports (optional)
```

Rules for the tree:

- A directory whose name starts with `_` is not a pack.
- The engine reads only `language.json` and the file it names as its
  transforms. Everything else is for tests, tools and people.
- Every file in a pack is UTF-8 without a byte-order mark. JSON files are
  formatted with two-space indentation so diffs stay readable.
- Committed corpora are small: at most 2,000 rows per TSV and 1 MB per pack
  directory, so a fresh clone stays light. Measurements against full
  dictionaries are recorded in the README, not committed as data.

## 4. `language.json`

Besides its identity fields, the descriptor has seven blocks. The engine
parses `code`, `classes`, `text` and `lookup`, and checks the rest only for
shape. Hosts read `capabilities`,
`presentation`, `settings` and `host`. Unknown keys are an error, so a typo
cannot silently disable a feature.

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
    "word": "[{letter}\\p{M}\\p{Nd}]",
    "wordJoiner": "['\\u2019\\-]"
  },
  "text": {
    "pattern": "[{letter}]",
    "segmentation": "spaces",
    "wordCharacters": "{word}",
    "wordInternal": "{wordJoiner}",
    "sentence": {
      "terminators": [".", "!", "?", "\u2026"],
      "quotePairs": [["\u201C", "\u201D"], ["\"", "\""], ["(", ")"]]
    },
    "lineJoiner": " "
  },
  "lookup": {
    "scanResolution": "word",
    "preprocessors": [
      {"id": "decapitalize", "name": "Decapitalize text", "variants": [[{"case": "lower"}]]},
      {"id": "capitalizeFirstLetter", "name": "Capitalize first letter", "variants": [[{"case": "upperFirst"}]]}
    ],
    "postprocessors": [],
    "readingNormalizer": null,
    "transforms": "transforms.json",
    "functionWords": []
  },
  "capabilities": {
    "readings": "none",
    "ruby": null,
    "pitchAccent": false,
    "characterView": null,
    "wordHighlighting": true
  },
  "presentation": {
    "typography": {"fontFamily": null, "wordBreak": "normal", "lineBreak": "auto"},
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
      "entry": {"expression": "run", "reading": "", "glossary": ["to move swiftly on foot"], "definitionTags": "v", "matched": "running", "trace": ["-ing"]},
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
| `scripts` | array of ISO 15924 codes | Scripts the language is written in (`Jpan`, `Latn`, `Arab`, `Hang`, `Hani`, ...). Informational. |
| `direction` | `"ltr"` or `"rtl"` | Direction of running text in this language. |

### 4.2 `classes`

Named character classes (section 5). Other fields refer to them as
`{name}`. A pack may define as many as it needs; there are no global names.

### 4.3 `text`

How text in this language looks on a page. The engine uses `wordCharacters`
and `wordInternal` (section 9.2); hosts use all of it.

| Field | Type | Meaning |
| --- | --- | --- |
| `pattern` | class | Code points that are text in this language. Hosts use it for the "only scan text in this language" gate, debug-log redaction, and to find the runs of text to split into words (section 9.7). |
| `segmentation` | `"scan"` or `"spaces"` | `scan`: words are not separated by spaces and are found by scanning dictionary keys from the cursor (Japanese, Chinese). `spaces`: words are delimited by spaces and punctuation (English, Arabic, Korean). |
| `wordCharacters` | class | For `spaces`: the characters a word is made of. Hosts move a scan's start back to the beginning of the hovered word with it. |
| `wordInternal` | class or null | For `spaces`: characters that belong to a word only between two word characters, such as the apostrophe in *don't* or the hyphen in *mother-in-law*. |
| `sentence.terminators` | array of strings | Characters that end a sentence. |
| `sentence.quotePairs` | array of `[open, close]` | Brackets and quotes that a sentence keeps whole. |
| `lineJoiner` | string | What replaces a line break when a host joins lines of one sentence (subtitles, OCR): `""` for Japanese, `" "` for space-delimited languages. |

### 4.4 `lookup`

The engine-facing block.

| Field | Type | Meaning |
| --- | --- | --- |
| `scanResolution` | `"character"` or `"word"` | Which prefixes of the scanned text are looked up (section 9.2). `character` for `scan` languages, `word` for `spaces` languages. |
| `preprocessors` | array of processors | Text variants tried before deinflection (section 6). |
| `postprocessors` | array of processors | Variants of each deinflected form tried before the dictionary query (section 6). Korean needs them: rules run on jamo, dictionaries are written in syllables. |
| `readingNormalizer` | array of steps or null | Applied to readings when the engine groups results by `(expression, reading)`. Chinese pinyin uses it. |
| `transforms` | string or null | File name of the deinflection rules in this directory. |
| `functionWords` | array of strings | Words a host's segmenter may split around (section 9.7; Japanese particles today). |
| `variantPasses` | array (optional) | Opt-in extra passes, each a builtin with an id that a request enables by name. Japanese declares `nekoSpeech` (section 11.4). |

### 4.5 Readings and pronunciations

Yomitan term banks have a `reading` column. The engine keeps it as written
and, as today, writes the expression into it when a bank leaves it empty. The
pack's `capabilities.readings` tells hosts what the column means for this
language:

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
| `wordHighlighting` | boolean | Hosts can split running text in this language into words (section 9.7). |

`characterView` has these fields:

```json
{
  "name": "Kanji",
  "pattern": "[\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF\\u{20000}-\\u{2FA1F}]",
  "readingLabels": {"onyomi": "On", "kunyomi": "Kun"}
}
```

`pattern` decides which characters of a headword are clickable.
`readingLabels` names the two reading columns of a `kanji_bank` row, which
Yomitan calls `onyomi` and `kunyomi` whatever the language. A Korean pack
could use `{"onyomi": "Eum", "kunyomi": "Hun"}`, a Chinese one
`{"onyomi": "Pinyin", "kunyomi": "Other readings"}`.

### 4.7 `presentation` and `settings`

`presentation` holds data hosts use to draw text in this language:

- `typography.fontFamily`: a CSS font-family list for text in this language,
  or null to leave fonts to the host's theme.
- `typography.wordBreak` and `typography.lineBreak`: CSS `word-break` and
  `line-break` values for text in this language (`keep-all` for Korean,
  `strict` for Japanese).
- `labels`: words and marks a host shows for this language: `reading` (the
  name of the reading, default `Reading`), `traceMarker` (written before a
  rule name in compact deinflection trails; default empty, Japanese `～`) and
  `readingBrackets` (around a reading shown inline; default `["(", ")"]`,
  Japanese `["《", "》"]`). The character view's name and reading labels are
  in `capabilities.characterView`.
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

| Effect | Meaning | Who applies it |
| --- | --- | --- |
| `{"preprocessor": "<id>"}` | Turns an optional preprocessor (one declared with `"optional": true`) on when the setting is on. | Engine, through the request's `languageOptions`. |
| `{"transforms": ["<id>", ...]}` | Turns optional transforms (declared with `"optional": true` in `transforms.json`) on. | Engine. |
| `{"variantPass": "<id>"}` | Enables a declared variant pass. | Engine. |
| `{"display": {"fields": [...], "when": <value>, "transform": "<name>"}}` | Applies a display transform to the named result fields (`expression`, `reading`, `sentence`) while the setting has the given value. | Host renderer. |
| `{"capability": "<name>"}` | Turns an optional capability on (a capability declared as `{"optional": true, ...}`), for example a Korean hanja character view. | Host. |

Types are `boolean`, `enum` (`values` list) and `number` (`min`, `max`,
`step`). `group` is `lookup` (shown with scanning settings) or `display`
(shown with popup appearance). Hosts render these settings without
language-specific code, store their values per profile, and fall back to
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
| `sample.entry` | A fake dictionary entry for settings previews and theme tests. |
| `sample.character` | A fake character entry, or null without a character view. |

Arabic excerpt:

```json
{
  "code": "ar", "bcp47": "ar", "direction": "rtl", "scripts": ["Arab"],
  "classes": {
    "letter": "[\\u0620-\\u064A\\u066E-\\u06D3\\u06D5\\u06EE\\u06EF\\u06FA-\\u06FC\\u06FF]",
    "harakat": "[\\u0618-\\u061A\\u064B-\\u0656\\u0670]"
  },
  "text": {"pattern": "[{letter}{harakat}\\u0640]", "segmentation": "spaces", "wordCharacters": "[{letter}{harakat}\\u0640]", "wordInternal": null,
           "sentence": {"terminators": [".", "!", "\u061F", "\u2026"], "quotePairs": [["\u00AB", "\u00BB"], ["(", ")"]]}, "lineJoiner": " "},
  "lookup": {"scanResolution": "word", "preprocessors": [
    {"id": "removeArabicScriptDiacritics", "name": "Remove diacritics", "variants": [[{"strip": "{harakat}"}]]},
    {"id": "removeTatweel", "name": "Remove tatweel", "variants": [[{"strip": "[\\u0640]"}]]},
    {"id": "normalizeUnicode", "name": "Normalize Unicode", "variants": [[{"normalize": "NFKC"}]]},
    {"id": "addHamzaTop", "name": "Add hamza on top", "variants": [[{"map": {"\u0627": "\u0623"}, "at": "first"}]]}
  ]},
  "presentation": {"displayTransforms": {"stripVowelMarks": [{"strip": "{harakat}"}]}}
}
```

Japanese excerpt (the full file is section 11):

```json
{
  "code": "ja", "bcp47": "ja", "direction": "ltr", "scripts": ["Jpan"],
  "text": {"pattern": "[\\u3005-\\u3007\\u303B\\u3040-\\u30FF\\u31F0-\\u31FF\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF\\uFF66-\\uFF9F\\u{20000}-\\u{2FA1F}]",
           "segmentation": "scan", "lineJoiner": ""},
  "lookup": {"scanResolution": "character", "preprocessors": [
    {"id": "nfkc", "variants": [[{"builtin": "ja.nfkc"}]]},
    {"id": "kana", "variants": [[{"builtin": "ja.katakanaToHiragana"}], [{"builtin": "ja.hiraganaToKatakana"}]]}
  ]},
  "capabilities": {"readings": "required", "ruby": {"alignment": "kana"}, "pitchAccent": true,
                   "characterView": {"name": "Kanji", "pattern": "[\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF\\u{20000}-\\u{2FA1F}]", "readingLabels": {"onyomi": "On", "kunyomi": "Kun"}},
                   "wordHighlighting": true}
}
```

## 5. Character classes

Fields that hold a class use one portable syntax, accepted both by the
engine's own parser and, once `{name}` references are expanded, by
JavaScript's `RegExp` with the `u` flag:

- one bracket expression: `[...]`, optionally negated with `[^...]`;
- literal characters (escape `\`, `]`, `^` and `-` with a backslash);
- `\uXXXX` and `\u{X...}` code point escapes, and ranges `a-z`,
  `\u4E00-\u9FFF`;
- Unicode general categories: `\p{L}`, `\p{Lu}`, `\p{Ll}`, `\p{M}`,
  `\p{Mn}`, `\p{N}`, `\p{Nd}`, `\p{P}`, `\p{S}`, `\p{Z}` and the other
  two-letter categories, answered from utf8proc in the engine;
- `{name}` refers to another class of the same pack and stands for its
  members (no cycles).

Script properties (`\p{Script=Latin}`, `\p{scx=Han}`) are not accepted: the
engine has no script table. Write the ranges instead. The conformance test
checks that every class parses in both implementations and that both accept
the same code points over all of Unicode.

## 6. Text processors

### 6.1 Processors

A processor turns one text into the text itself plus a few variants. The
engine applies the pack's processors in order, each to every variant the
previous ones produced, exactly as `text_processor::process` does for
Japanese today:

1. Start with `[(input, steps = 0)]`.
2. For each processor, for each current variant, for each of the processor's
   `variants`: apply its steps; if the output differs from the variant, keep
   it with `steps + 1`. Keep the variant itself with its own steps. A text
   seen twice keeps its smallest `steps`.
3. After each processor, sort the variants by code points.

`steps` counts the processors that changed the text. The lookup order
prefers fewer steps (section 9.5), so a word found as written beats one found
through normalisation.

```json
{"id": "kana", "name": "Convert hiragana and katakana", "optional": false,
 "variants": [[{"builtin": "ja.katakanaToHiragana"}], [{"builtin": "ja.hiraganaToKatakana"}]]}
```

`optional: true` makes the processor off unless a request turns it on
through a pack setting (section 4.7).

### 6.2 Steps

A variant is a list of steps applied in order. The step kinds are a closed
list; anything else needs a builtin.

| Step | Example | Meaning |
| --- | --- | --- |
| `case` | `{"case": "lower"}` | `lower`, `upper`, `upperFirst` (first code point) or `lowerFirst`, using Unicode simple case mappings. |
| `normalize` | `{"normalize": "NFD"}`, `{"normalize": "NFKD", "within": "[\\u3300-\\u33FF]"}` | Unicode normalisation `NFC`, `NFD`, `NFKC` or `NFKD`, of the whole text or only of the runs of code points in `within`. |
| `strip` | `{"strip": "[\\u0300-\\u036F]"}` | Removes every code point in the class. |
| `map` | `{"map": {"\u00E6": "ae", "\u0153": "oe"}, "at": "all"}` | Literal replacement, longest key first, scanning left to right. `at` is `all` (default), `first`, `last`, `start` (the text must begin with the key) or `end`. |
| `pattern` | `{"pattern": "(l\|dell\|all)['\u2019]", "replace": "", "global": true}` | A regular expression replacement (section 7.5 gives the dialect). With `"repeat": true` it is applied again until the text stops changing, at most 16 times. |
| `alternatives` | `{"alternatives": {"c": ["\u010D", "\u0107"], "z": ["\u017E"]}, "limit": 4096}` | Produces every combination of the listed alternatives, up to `limit` variants. Only allowed as the only step of its variant. Serbo-Croatian uses it. |
| `builtin` | `{"builtin": "hangul.disassemble"}` | A named routine compiled into the engine (section 6.3). |

`readingNormalizer` and `presentation.displayTransforms` are step lists with
the same kinds. Hosts implement `case`, `normalize`, `strip`, `map` and
`pattern` for display transforms; a display transform may not use `builtin`
or `alternatives`.

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
- `transforms` is an array, so the order of transforms is explicit. Order
  decides only the order of results, never which results exist.
- `id` is unique in the file. `name` is the short trace label hosts show
  (`past`, `-た`). `description` is the longer explanation.
- `source` records provenance: `own` (written for this pack), `yomitan`
  (ported from Yomitan) or `both` (written independently and also in
  Yomitan). A rule inherits its transform's `source` unless it sets its own.
- `optional: true` on a transform keeps it off unless a request enables it
  (section 4.7).
- Any rule may have `then`: a list of text steps (section 6.2, without
  `builtin` and `alternatives`) applied to that rule's output only. Modern
  Greek uses it to strip accents after removing the prefix ξανα-.

### 7.2 Conditions

Conditions mean what they mean in Yomitan:

- A rule applies to a text whose current conditions are 0 (the scanned text
  itself, or a form whose rule set no conditions) or overlap the rule's
  `conditionsIn`. An empty `conditionsIn` therefore applies only to the
  scanned text.
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
| `suffix` | `inflected`, `deinflected`, optional stem constraints, optional `stemChange` | the text ends with `inflected` | the text with that ending replaced by `deinflected` |
| `prefix` | `inflected`, `deinflected`, optional stem constraints | the text starts with `inflected` | the text with that beginning replaced |
| `wholeWord` | `inflected`, `deinflected` | the text equals `inflected` | `deinflected` |
| `circumfix` | `inflectedPrefix`, `deinflectedPrefix`, `inflectedSuffix`, `deinflectedSuffix`, optional stem constraints, optional `stemChange` | the text starts and ends with the two parts, which do not overlap | both parts replaced |
| `replace` | `inflected`, `deinflected`, `occurrence` (`all`, `first`, `last`), optional `notAtStart` | the text contains `inflected` | each chosen occurrence replaced |
| `pattern` | `pattern`, `replacement`, `anchorSuffix` or `anchorPrefix` | the text ends (or starts) with the anchor and matches `pattern` | `pattern` replaced by `replacement` |

Stem constraints apply to the stem: the text that remains between the
matched parts.

| Constraint | Meaning |
| --- | --- |
| `stemMinLength` | The stem has at least this many code points (default 0). |
| `stemCharacters` | Every stem code point is in this class. |
| `stemStartsWith`, `stemEndsWith` | The stem's first (last) code point is in this class. |
| `stemNotStartsWith`, `stemNotEndsWith` | The stem's first (last) code point is not in this class, or the stem is empty. |

`stemChange` changes the stem while the affix is replaced:

```json
{"type": "suffix", "inflected": "o", "deinflected": "ar", "conditionsIn": ["v_ar"], "conditionsOut": ["v_ar"],
 "stemChange": {"from": ["ie"], "to": "e", "occurrence": "first"}}
```

`from` lists strings to look for in the stem; `occurrence` picks the
`first` or `last` match of any of them; optional `between` is a class that
every code point between the change and the end of the stem must belong to
(Ukrainian `[ое]` → `і` before final consonants). The rule does not apply
when the stem has no match.

### 7.4 Recursion, cycles and order

Deinflection is the same depth-first search hoshidicts uses today:

1. Record the text with its conditions and trace as a result.
2. Find the rules whose literal parts match: suffix-indexed rules (`suffix`,
   `wholeWord`, `circumfix`, `pattern` with `anchorSuffix`) through a trie of
   reversed suffixes, prefix-indexed rules (`prefix`, `pattern` with
   `anchorPrefix`) through a trie of prefixes, then `replace` rules in file
   order.
3. Apply them, longest matched affix first; rules of one affix in file order.
4. Recurse into every output with the rule's `conditionsOut`.

The order in step 3 is today's order for the suffix trie, which keeps
Japanese identical (section 11). An output equal to one already produced by
the same rule from the same text earlier in the same trace is skipped, as
Yomitan's `isCycle` skips it; this matters only for rules that do not shorten
the text. A trace stops at 32 steps, the limit the hosts' bridges already
enforce for returned traces.

The trace of a result lists the transforms applied, in application order, as
`{name, description}` pairs. Yomitan lists them newest first; converters and
tests reverse it.

### 7.5 The `pattern` dialect

`pattern` rules and steps use ECMAScript regular expressions as C++
`std::wregex` accepts them, so the same string works in the engine and in
JavaScript:

- Allowed: literals, `.`, classes `[...]` with `\uXXXX` escapes and ranges,
  `{name}` class references (expanded before compiling), groups `(...)`,
  non-capturing `(?:...)`, alternation `|`, quantifiers `? * + {m,n}`, lazy
  quantifiers, anchors `^ $`, lookahead `(?=...)` and `(?!...)`,
  back-references `\1`, and `$1`, `$2`, `$&` in replacements.
- Not allowed: lookbehind, `\p{...}`, the `u` flag, `\u{...}` escapes,
  named groups, and `\w`, `\b`, `\d` (they are ASCII-only in one
  implementation and Unicode-aware in the other). Use a class reference.
- A class referenced from a pattern may contain only code points up to
  U+FFFF, because the dialect has no `u` flag.
- A `pattern` rule must name an anchor literal that every matching text ends
  with (`anchorSuffix`) or starts with (`anchorPrefix`). The engine tries the
  pattern only on texts with that anchor, which keeps it as cheap as a suffix
  rule. The conformance test checks that the corpus rows the rule produces
  all carry the anchor.

Use `pattern` only when no other type fits. Section 8 shows which Yomitan
rules need it.

Where `wchar_t` is 16 bits (Windows), a pattern cannot match code points
above U+FFFF; the conformance test rejects such patterns. The framework pull
request measures what `std::wregex` adds to Hachidori's WebAssembly bundles.
If it is more than 5% of a bundle, `pattern` is replaced by dedicated rule
types for the four uses section 8 lists, before any pack depends on it.

## 8. Porting a Yomitan transforms file

`tools/port-yomitan-transforms.mjs <yomitan checkout> <code>` loads
`ext/js/language/<code>/*-transforms.js` with Node, walks the descriptor and
writes `languages/<code>/sources/yomitan.json`:

| Yomitan | Pack rule |
| --- | --- |
| `suffixInflection(a, b, in, out)` | `{"type": "suffix", "inflected": a, "deinflected": b, "conditionsIn": in, "conditionsOut": out}` |
| `prefixInflection(a, b, in, out)` | `{"type": "prefix", ...}`; `deinflected` is recovered by calling `deinflect(a + "\uE000")` |
| `wholeWordInflection(a, b, in, out)` | `{"type": "wholeWord", ...}` |
| any other rule | a `{"type": "todo", "isInflected": "<regex source>", "conditionsIn": ..., "conditionsOut": ...}` placeholder, which the conformance test rejects until it is replaced |
| `conditions`, transform `name`, `description`, `i18n` | copied |
| transform key order | array order |

`tools/port-yomitan-tests.mjs <yomitan checkout> <code>` converts Yomitan's
`test/language/<name>-transforms.test.js` into `tests/yomitan.tsv`, as
`tests/generate_deinflection_fixture.mjs` does for Japanese today.

How the rules the script cannot convert map to rule types, from a census of
every Yomitan file at d3c54c1:

| Language | Yomitan construct | Pack rule |
| --- | --- | --- |
| ar | `sandwichInflection` (prefix + Arabic-letter stem + suffix; thousands generated by `getImperfectRules`) | `circumfix` with `stemCharacters: "{letter}"`, `stemMinLength: 1`; the generator's cross product is written out |
| ar | `conditionalSuffixInflection` / `conditionalPrefixInflection` (`(?<!ن)` before the affix) | `suffix` / `prefix` with `stemNotEndsWith` / `stemNotStartsWith` |
| de | `^ge([letters]+)t$` → `$1n`, `$1en` | `circumfix` |
| de | separable past participles `^(ab\|an\|…)ge(...)t$` | `circumfix` per prefix, written out |
| de | separated prefix `^([letters]+) .+ ab$` → `$1 ab` | `pattern` with `anchorSuffix: " ab"` |
| el | `^ξανα` stripped, then accents removed | `prefix` with `then` steps (`normalize` NFD, `strip` combining marks) |
| en | phrasal verbs (`createPhrasalVerbInflection`, interposed object) | `pattern` with `anchorPrefix` per verb ending and particle, or one per particle with `anchorSuffix` |
| es | stem changes `ie→e`, `ue→o`, `ue→u` after `ju`, `i→e`, `u→o` | `suffix` with `stemChange` (and `stemStartsWith` for `jue`) |
| es | reflexive `(me\|te\|se\|nos\|os) (\w+)(ar\|er\|ir)` → `$2$3se` | `pattern` with `anchorPrefix` per pronoun |
| sga | `tryAlternateOrthography` (global replacement, optionally not at the start) | `replace` with `occurrence: "all"` and `notAtStart` |
| sq | suffix after a stem not ending in `j` | `suffix` with `stemNotEndsWith: "[j]"` |
| tl | hyphen removal | `replace` |
| tl | `u` → `o` sound change before consonants | `suffix` or `circumfix` with `stemChange` and `between` |
| tl | reduplication `^(prefix)(C*V)(\2)` | `pattern` with `anchorPrefix` and a back-reference |
| tl | `sandwichInflection` | `circumfix` |
| uk | `[ое]` → `і` before consonants | `suffix` with `stemChange` and `between` |
| uk | zero-ending after a closed syllable | `suffix` with empty `inflected` and stem constraints |
| yi | umlaut mutation (last vowel letter of the stem) | `suffix` with `stemChange` (`occurrence: "last"`) |
| ko | rules on decomposed jamo | plain `suffix` rules with `hangul.disassemble` / `hangul.assemble` processors |

Yomitan labels some regex rules `prefix` (Tagalog) and some custom functions
`suffix` (Yiddish); its transformer never reads `type`. Port by behaviour.
Georgian's transforms declare `language: 'kat'` although its descriptor is
`ka`, so Yomitan never applies them; the `ka` pack uses them as written.

Text processors port the same way: every Yomitan preprocessor and
postprocessor is a `case`, `normalize`, `strip`, `map`, `pattern` or
`alternatives` step except Hangul jamo (builtins) and Japanese romaji input,
which hoshidicts does not offer.

## 9. The lookup pipeline with a language

A request names a language. Everything else is as today unless this section
says otherwise.

### 9.1 Scan

The host passes text that starts where the user's cursor is (for `spaces`
languages, hosts move the start back to the beginning of the hovered word)
and a `scan_length` in code points. The long-key extension for keys longer
than 16 code points (`scan.idx`) works for every language.

### 9.2 Prefixes

`character` resolution looks up every prefix from `scan_length` code points
down to one, as today. `word` resolution looks up only prefixes that end at a
word boundary: the end of the text, or a position after a word character
(`text.wordCharacters`, with `wordInternal` characters counting as word
characters between two of them) followed by a character that is not one.
`reading a book` gives `reading a book`, `reading a` and `reading`, never
`rea`. This is Yomitan's `searchResolution: 'word'` without its
whole-substring regex.

### 9.3 Processing and deinflection

Each prefix goes through the pack's preprocessors (section 6.1), each
variant through the pack's deinflector (section 7), and each deinflected form
through the pack's postprocessors, whose changes add to the variant's
`steps` as preprocessors' do. Enabled variant passes run where they run today
for Japanese (section 11.4).

### 9.4 Query and part-of-speech filter

Each form is looked up in the selected dictionaries. A term is kept when the
form's conditions are 0 or overlap the conditions of the term's `rules` tags
under this pack's conditions (section 7.2).

### 9.5 Order

Results are ordered by the comparator hoshidicts uses today (primary
reading, matched length, processor steps, trace length, written form equals
the form looked up, the chosen frequency, dictionary rank, score, written
form equals reading). Dictionary rank is the position in the request's
dictionary selection (section 9.6). When the pack has a `readingNormalizer`,
results are grouped by `(expression, normalized reading)` instead of
`(expression, reading)`. For packs whose readings are `none`, the reading
terms of the comparator compare equal strings and have no effect.

### 9.6 Dictionary selection

`LookupOptions::dictionaries` is an ordered list of loaded dictionary paths.
When present, term, frequency, pitch and kanji queries use only those
dictionaries, ranked in that order; a path that is not loaded is ignored.
When absent, every loaded dictionary is used in load order, as today. One
engine can hold every dictionary of every language a host uses and answer
each request from the right ones without reloading.

### 9.7 Segmentation

Splitting running text into words (Hachidori's word highlighting) is done by
hosts on top of `lookup`; Hachidori's segmenter lives in its
`wasm/bindings.cpp`. A pack supplies what a segmenter needs:

- `scan` languages: the pack's `functionWords`, around which the segmenter
  may split (Japanese particles, as today).
- `spaces` languages: `text.pattern`, `wordCharacters` and `wordInternal`
  split runs into words; each word is looked up from its start and is a span
  when a result's matched text covers the whole word.
- `wordHighlighting: false` tells hosts not to offer it.

### 9.8 Kanji and character lookups

`query_kanji` takes the dictionary selection. Which characters are offered
for lookup is the host's decision, made with the pack's
`characterView.pattern`.

## 10. Engine API

### 10.1 C++

```cpp
#include "hoshidicts/languages.hpp"

namespace hoshidicts {

class LanguagePack;  // A parsed pack: processors, deinflector, scanning data.

class LanguageRegistry {
 public:
  // A registry holding the packs built into the library (Japanese).
  static LanguageRegistry with_builtin();
  // Parses one pack. transforms_json may be empty when the pack has none.
  // A pack with the same code replaces the previous one. Returns false and
  // sets `error` (pack code, file, JSON path and reason) on any problem.
  bool add(std::string_view language_json, std::string_view transforms_json, std::string* error);
  // Loads every `<dir>/<code>/language.json` whose directory name does not
  // start with '_'.
  bool add_directory(const std::string& languages_dir, std::string* error);
  const LanguagePack* find(std::string_view code) const;
  std::vector<std::string> codes() const;
};

}  // namespace hoshidicts

struct LookupOptions {
  // ... existing fields ...
  std::string language = "ja";
  // Ordered package paths; see section 9.6.
  std::optional<std::vector<std::string>> dictionaries;
  // Pack settings with engine effects: ids of optional preprocessors,
  // optional transforms and variant passes to enable for this request.
  std::vector<std::string> language_options;
};

class Lookup {
 public:
  Lookup(DictionaryQuery& query, const hoshidicts::LanguageRegistry& languages);
  // lookup, lookup_dictionary as today; options.language selects the pack.
  // An unknown language is an error result, never a silent fallback.
};

// Deinflector becomes the generic engine built from a pack's transforms.
class Deinflector {
 public:
  std::vector<DeinflectionResult> deinflect(const std::string& text) const;
  uint32_t conditions_for_parts_of_speech(std::span<const std::string> tags) const;
  uint32_t conditions_for_types(std::span<const std::string> names) const;
};
```

`Lookup(DictionaryQuery&, Deinflector&)` and `Deinflector()` (Japanese
built in) are removed; the C API below keeps their behaviour for C callers.

**Built-in packs.** The Japanese pack is also compiled into the library:
`src/languages/builtin_packs.cpp` holds `languages/ja/language.json` and
`transforms.json` as byte arrays, generated by `tools/embed-packs.py` and
committed (so Swift Package builds, which do not run CMake, have it too). The
conformance test fails when the embedded copy differs from the pack.
`LanguageRegistry::with_builtin()` starts with it, so Japanese lookups need no
files and a host that never loads a pack behaves as today. Other packs are
loaded at run time (decision record 0002).

### 10.2 C

Existing functions keep their signatures and behaviour: `hd_deinflector_new()`
returns the built-in Japanese pack's deinflector, and `hd_lookup_new(q, d)`
looks up Japanese as today. New functions:

```c
typedef struct hd_languages hd_languages;
hd_languages* hd_languages_new(void);
void hd_languages_free(hd_languages* languages);
int hd_languages_add(hd_languages* languages, const char* language_json, const char* transforms_json);
int hd_languages_add_directory(hd_languages* languages, const char* path);
const char* hd_languages_last_error(const hd_languages* languages);

hd_lookup* hd_lookup_new_with_languages(hd_query* q, const hd_languages* languages);
// Like hd_lookup_run_with_options, with a language code and an optional
// ordered dictionary selection (count 0 = every loaded dictionary).
hd_lookup_results* hd_lookup_run_with_language(const hd_lookup* l, const char* lookup_string, int max_results,
                                               size_t scan_length, const hd_lookup_options* options,
                                               const char* language, const char* const* dictionaries,
                                               size_t dictionary_count, const hd_lookup_result** out_results,
                                               size_t* out_count);
```

### 10.3 Command line

`hoshidicts-cli` gains `--languages <dir>` (default: the build's
`languages/`) and:

```text
hoshidicts-cli languages                          list loaded packs
hoshidicts-cli deinflect <code> <text>            every deinflection with its conditions and trace
hoshidicts-cli preprocess <code> <text>           every processor variant with its steps
hoshidicts-cli lookup --language <code> <dict>... <text>
hoshidicts-cli eval-language <code> <file.tsv> [--dictionary <imported dir>]
```

`eval-language` reads a corpus in the format of section 12.2 and prints JSON:

- `cases` and `recall`: the share of `valid = 1` rows whose lemma is among
  the deinflections of the source;
- `negativesPassed`: the share of `valid = 0` rows whose term is not among
  them;
- with `--dictionary`: `falseCandidates`, the mean number of deinflections
  per row that are headwords of that dictionary, pass its part-of-speech
  filter, and are neither the source text nor the expected lemma; and
  `firstRank`, the share of rows where a full lookup of the source ranks the
  expected lemma first.
Language pull requests report these numbers for their own rules, Yomitan's
rules and the final set.

### 10.4 WebAssembly (Hachidori)

Hachidori's `wasm/bindings.cpp` keeps one registry, started with
`with_builtin()`, and exports:

- `hdw_language_load(language_json, transforms_json)` → 1 or 0 with
  `hdw_last_error`;
- `hdw_languages()` → JSON list of loaded codes;
- `hdw_deinflect(text, code)` → JSON deinflections (tests and diagnostics);
- the `options_json` of `hdw_lookup`, `hdw_lookup_dictionary`, `hdw_segment`
  and a new `hdw_kanji_with_options` accepts `language` (default `ja`),
  `dictionaries` and `languageOptions`. A request without these keys is
  answered exactly as today.

The extension ships the pack JSON files and hands them to the engine, so a
data-only pack reaches users without rebuilding the WebAssembly.

## 11. The Japanese pack

### 11.1 How it is made

`languages/ja/transforms.json` is generated once from today's
`src/deinflector.cpp` by `tools/export-legacy-japanese.cpp`, which builds the
current deinflector and writes its groups, conditions and rules in insertion
order, with `add_irregular`'s generated rules written out. Today's C++ is
then kept, unmodified apart from a renamed class, as
`tests/reference/legacy_deinflector.cpp`, the oracle for section 11.3. The
group descriptions keep their Yomitan attribution in the pack README, as the
header of `deinflector.cpp` does today. The pack is embedded in the library
(section 10.1).

The conditions are today's `Conditions` enum in its bit order: the 18 flags
`v1d … ya` as conditions without `subConditions`, and `v1`, `v5s`, `v5`, `v`
as conditions with `subConditions`. `isDictionaryForm` is true exactly for
the six tags `pos_to_conditions` maps today: `v1`, `v5`, `vk`, `vs`, `vz`,
`adj-i`.

The preprocessors are today's eight, in today's order, as builtins:
`ja.nfkc`; kana (two variants); emphatic sequences (two variants); full-width
alphanumerics; kanji variants; iteration marks; kanji numbers; middle dots.

### 11.2 What stays Japanese-only

- Furigana alignment by kana and the KANJIDIC split are host features keyed
  on `ruby.alignment: "kana"`.
- Pitch accent (`pitchAccent: true`) is Japanese mora pitch.
- The 18 hoshidicts auxiliary groups that Yomitan lacks (`-あげる` … `-やる`)
  stay in the pack with `source: "own"`.

### 11.3 Proof of identical results

`tests/ja_parity_test.cpp` runs the legacy deinflector and the Japanese pack
side by side and requires identical output (texts, conditions, traces, in the
same order) for:

- every row of `languages/ja/tests/yomitan.tsv` (Yomitan's complete Japanese
  conjugation corpus, 1,446 rows, moved from `tests/fixtures/`) and
  `languages/ja/tests/cases.tsv` (today's whole-word, historical kana and
  cat-speech cases);
- every prefix of every row's source;
- 100,000 strings generated from a fixed seed out of kana, kanji, Latin
  letters and the endings that appear in the rules.

Processor parity is checked the same way against today's
`text_processor::process`. Hachidori's complete test suites, which pin the
engine's JSON replies byte for byte, then prove the whole pipeline.

### 11.4 NekoPara cat speech

`deinflect_neko_speech` becomes the variant pass `nekoSpeech` of the
Japanese pack (`ja.nekoSpeech`). `LookupOptions::neko_speech = true` keeps
working and means `language_options = {"nekoSpeech"}`; the pass applies only
where it reads more of the text than every ordinary result, as today.

## 12. Tests and the conformance check

### 12.1 What runs

`ctest -R language` (CMake option `HOSHIDICTS_LANGUAGE_TESTS`) builds
`language-conformance-test` and runs it once per pack directory; CMake finds
the pack directories when it configures, so adding a pack adds its test. CI
runs it together with every existing test (`HOSHIDICTS_TESTS`) and the
Japanese parity test.

For every pack it checks:

1. `language.json` and `transforms.json` against the schemas in this file:
   required fields, no unknown keys, `code` equal to the directory name,
   condition references defined, at most 32 condition bits, no cycles in
   `subConditions` or class references, unique ids, builtins known, display
   transforms free of `builtin`, setting effects naming declared processors,
   transforms, passes, display transforms or capabilities.
2. Every class parses and means the same in the engine and in JavaScript
   (the test embeds a table of expectations generated by
   `tools/check-classes.mjs`, which CI runs with Node).
3. Every `pattern` compiles with `std::wregex`; no `todo` rules remain.
4. Every TSV in `tests/` except `gaps.tsv` passes; `gaps.tsv` is run and its
   pass count printed.
5. `README.md` exists and names the source, licence and attribution of every
   corpus file and of any ported rules.

### 12.2 Corpus format

Every deinflection TSV uses the format of today's Japanese fixture:

```text
# Source: UniMorph eng (https://github.com/unimorph/eng), CC BY-SA 3.0. 412 rows sampled with seed 1.
# category<TAB>valid<TAB>source<TAB>term<TAB>rule<TAB>reasons
verbs	1	running	run	v	-ing
verbs	1	went	go	v	past
nouns	1	buses	bus	n	plural
negatives	0	bus	bu	*	*
```

- `valid`: `1` means `term` must be among the deinflections of `source`;
  `0` means it must not be.
- `rule`: a condition name the term must be compatible with, or `*` for any.
- `reasons`: transform names separated by `|`, in Yomitan's forward order
  (newest first), or `*` for any trace, or empty for no transform.
- The source text goes through the pack's preprocessors first, as in a
  lookup.

`text.tsv` checks processors: `category valid input variant` (the variant is,
or is not, among the processed variants). `lookup.tsv` checks the whole
pipeline against `tests/dictionary/`: `category valid text expression
matched` (the first result has this expression and matched text). The test
builds the tiny dictionary into a temporary import at run time.

### 12.3 Hachidori's checks

Hachidori runs its own contract tests over the packs it ships (settings
schema, display transforms in JavaScript, samples rendered by every theme).
They are described in Hachidori's `docs/languages.md`.

## 13. Performance budget

Japanese, measured before and after on the same machine with the same
dictionaries:

- native `benchmark-lookup` and Hachidori's Node `hdw_lookup` p50 for
  `食べました`, `走り出した`, `美しい景色`, `日本語を勉強しています`:
  no slower than the noise of repeated runs (target within 3%);
- Hachidori's production-path benchmark (`benchmark/run.mjs` with Jitendex
  and Pixiv Light): steady-hit p50 and p95 within noise;
- engine heap after loading: no growth beyond the size of the rule data;
- pack load (parse and index): under 10 ms for Japanese in Chrome.

Other languages: each language pull request reports `hdw_lookup` (or
`benchmark-lookup`) p50 and p95 with a real dictionary and a list of at
least 50 words from real sentences, and the pack load time. The budget for
a 16-code-point scan is 1 ms p50 natively. A pack over budget is not merged
until it is fixed or the reason is accepted in review.

## 14. Adding a language

1. **Start from the template.**
   `cp -r languages/_template languages/<code>` with Yomitan's code for the
   language. Fill in identity, `classes`, `text` and `capabilities` in
   `language.json`.
2. **Write your own rules first.** From grammars, Wiktionary inflection
   tables and UniMorph, write the transforms a learner needs to reach a
   dictionary headword: conjugations, declensions, plurals, comparatives,
   clitics, mutations, orthographic alternations. Use the types in section
   7.3. Save them as `sources/own.json` and commit that alone.
3. **Port Yomitan's rules.** Run `tools/port-yomitan-transforms.mjs` and
   replace every `todo` with a rule type (section 8) in
   `sources/yomitan.json`. Port Yomitan's processors into
   `lookup.preprocessors` and `postprocessors`. Run
   `tools/port-yomitan-tests.mjs` if Yomitan has tests for the language.
4. **Build a corpus.** Take 300-2,000 inflected form → lemma pairs from a
   licensed source (UniMorph, Wiktionary through kaikki.org), add hand-written
   tricky cases and negatives, and record source, licence and attribution in
   the README.
5. **Measure and choose.** Run `hoshidicts-cli eval-language` for your
   rules, Yomitan's and their union, with a real dictionary imported by
   `hoshidicts-cli import`. Keep the union minus rules that only add false
   candidates, and mark each rule's `source`. Write the result to
   `transforms.json` and the numbers to the README.
6. **Fill in the host data.** `presentation`, `settings` (only if the
   language needs one), `host.recommendedDictionaries`, `host.sample`.
7. **Run the checks.**

   ```sh
   cmake -S . -B build -DHOSHIDICTS_LANGUAGE_TESTS=ON -DHOSHIDICTS_CLI=ON
   cmake --build build --parallel 8
   ctest --test-dir build -R language --output-on-failure
   ```

8. **Open a pull request** that changes only `languages/<code>/`, with the
   rule provenance, the corpus source and licence, own / Yomitan / final
   recall and false candidates, the dictionary you measured with, and the
   known gaps.

Checklist for reviewers: only the pack directory changes; conformance passes;
no `todo` rules; every corpus file has a source and licence; recall and false
candidates are reported for all three rule sets; no rule produces a wrong
lemma on the negatives; the performance numbers are within budget.

## 15. Working on packs in parallel

- A pack pull request touches only `languages/<code>/`. There is no list of
  languages to edit anywhere, so two pack pull requests never conflict.
- Anything outside a pack (a new builtin, a new step or rule type, a schema
  change, a fix in the pipeline) is a framework change. Open an issue
  describing what the language needs and why the existing types cannot
  express it; the framework maintainer batches such changes, updates this
  file, and tells pack authors to rebase.
- Pack pull requests rebase on `main` before merging; because packs do not
  overlap, a rebase never needs conflict resolution.
- Schema changes are additive within `schema: 1`. A breaking change bumps
  `schema` and the conformance test accepts both versions until every pack
  is migrated.

## 16. Known limits

- **No morphology.** Deinflection proposes forms; it does not analyse.
  Agglutinative languages (Korean, Basque, Georgian) produce long traces and
  some false candidates, which the dictionary query and part-of-speech filter
  prune.
- **Tone and stress are not pitch accent.** A future capability could
  describe Chinese tones or Russian stress; today they are visible only in
  readings and IPA.
- **Word segmentation of `spaces` languages is per word.** Clitics written
  together with a word (Arabic `وَ`, `بِ`, `ال`) are handled by deinflection,
  not by segmentation.
- **`pattern` rules share one dialect.** The dialect excludes lookbehind and
  Unicode properties so that one string means the same in C++ and JavaScript;
  Yomitan rules that use them are rewritten with stem constraints.
- **Character classes have no script property**; packs list ranges.
- **Patterns are limited to the Basic Multilingual Plane on Windows**
  (section 7.5).
- **Dictionary-form redirects** (Yomitan's `[term, [rules]]` glossaries) are
  still skipped by the importer, as today.
