#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The real-use measurements of README.md (Measurements 2-4). Not run by any test.

    python3 measure.py freq     <wty zip> <imported dict> <it_50k.txt> [--top N] [--from N] [--languages DIR] [--against DIR] [--out FILE]
    python3 measure.py text     <wty zip> <imported dict> <pg*.txt>... [--languages DIR] [--out FILE] [--sample N] [--freq it_50k.txt]
    python3 measure.py pronouns <wty zip> <imported dict> <ita_sentences.tsv(.bz2)> [--languages DIR] [--out FILE]
    python3 measure.py eval     <imported dict> [--languages DIR] [--per-rule FILE]
    python3 measure.py bench    <imported dict> [--languages DIR] [--runs N] [--passes N]
    python3 measure.py traces   [--languages DIR]

traces: for the UniMorph verb rows of tests/corpus.tsv and tests/gaps.tsv,
the trace a lookup keeps (traceSelection "shortest": fewest steps, first on a
tie) among the deinflections that reach the row's lemma, and whether its
tense or mood transform is the one the row's UniMorph features name, and its
person too (the Lei and Loro imperatives are the present subjunctive).

bench: build/benchmark-lookup on sources/benchmark-words.txt (64 texts, each
the rest of a sentence from an inflected word, written for the pack) with the
pack, --passes passes per run (default 6) with the first dropped, --runs runs
(default 3); prints p50 and p95 per run in microseconds.

eval: hoshidicts-cli eval-language for the own rules (sources/own.json),
Yomitan's (none for Italian: the pack's conditions with no transform), their
union (tools/merge-transforms.mjs --out) and the final set (transforms.json),
on tests/corpus.tsv with tests/gaps.tsv, tests/cases.tsv and
tests/defaults.tsv, each with the pack's defaults (first line
`# options: default`) and with every option on (the same rows without it).
With --per-rule, the final set's --per-rule JSON on corpus + gaps + cases +
defaults is written to FILE.

Lookups run through build/lookup-batch-it (sources/lookup-batch.cpp) with the
pack's defaults, as a host's hover does. The judge reads the published
dictionary zip: a first result is right when it is the hovered word's own
entry (a row with definitions), a lemma that one of the word's own form-of
rows names (wiktionary-to-yomitan writes `parlavo` → [parlare, ...]), or a
lemma that the rows of such a lemma name (`andati` → andato → andare).
Another form of the same lemma does not count.

freq: of the N most frequent words of the list, those with a form-of row
naming a lemma that the pack's rules also reach (hoshidicts-cli deinflect,
defaults), looked up alone; wrong when the first result is neither.

text: every word of the texts, looked up with the rest of its sentence;
judged where the hovered word has rows in the dictionary, and the rest
counted as unjudged (a random sample of them is written for judging by hand).
The texts are read in the order of their file names, so the random samples
do not depend on the order they are named in.

Where a word's rows name several lemmas (figli: figlio and figliare), any of
them is "right" by the rows, so freq and, with --freq, text also count the
first results over the hovered word alone that are a lemma its own form-of
rows name, other than the word itself, whose citation form is at least 10
times rarer in the frequency list than another lemma they name (figliare for
figlio): the frequency proxy hachi-lang-it's first audit used for the
dominant reading. With --against DIR, freq also looks the words up with the pack in
DIR (such as a copy with untaggedTerms "filter") and counts the first results
that differ, those whose lemma's citation form is at least 10 times rarer
than the other pack's first lemma, and those 10 times more frequent: the
audit's own comparison, with citation forms counted in the whole list.
With --from N, freq reads the words of ranks N+1 to --top only (a range the
preferred readings were not chosen on: --from 10000 --top 50000).

freq and text also count the first results over the word alone in four
classes of ties that README.md's Known gaps lists (tie_class below), and text
writes a random sample of 20 of each, with the words before the hovered one,
for judging by hand.

pronouns: the places in Tatoeba's sentences where a clitic or reflexive
pronoun (mi, ti, si, ci, vi, me, te, se, ce, ve, lo, la, li, le, gli, ne, and
the elided m', t', s', c', v') is followed by a word, looked up from the
pronoun; counts first results whose match covers the pronoun and the verb,
and judges them by the form-of rows of the whole phrase or of the verb.
"""
import bz2
import collections
import json
import os
import random
import re
import unicodedata
import subprocess
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, "..", "..", ".."))
LETTER = "A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F"
WORD = re.compile(f"[{LETTER}][{LETTER}]*")
SENTENCE_END = re.compile(r'(?<=[.!?\u2026])["\u201D\u2019\u00BB)]*\s+')


def option(args, name, default):
    if name in args:
        i = args.index(name)
        value = args[i + 1]
        del args[i:i + 2]
        return value
    return default


GLOSS_LEMMA = re.compile(r"(?:indicative|subjunctive|conditional|imperative|infinitive|participle|gerund|plural|singular|"
                         r"feminine|masculine|reflexive|superlative|form) of ([^\s,;:()\u201C\u201D\"]+)")


def gloss_text(value):
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return " ".join(gloss_text(v) for v in value)
    if isinstance(value, dict):
        return gloss_text(value.get("content", ""))
    return ""


def read_dictionary(path):
    """word -> {"own": bool, "refs": lemmas its form-of rows name, "glossed": lemmas its glosses name}.

    Some wiktionary-to-yomitan rows give the lemma in a definition rather than
    a form-of reference ("third-person singular imperfect indicative of
    capire"); "glossed" holds those.
    """
    rows = collections.defaultdict(lambda: {"own": False, "refs": set(), "glossed": set()})
    with zipfile.ZipFile(path) as z:
        for name in z.namelist():
            if not name.startswith("term_bank_"):
                continue
            for row in json.loads(z.read(name)):
                glosses = row[5]
                refs = [g for g in glosses if isinstance(g, list) and len(g) == 2 and isinstance(g[0], str) and g[0]
                        and isinstance(g[1], list)]
                entry = rows[row[0]]
                if refs:
                    entry["refs"].update(g[0] for g in refs)
                if len(refs) < len(glosses):
                    entry["own"] = True
                    entry["glossed"].update(GLOSS_LEMMA.findall(gloss_text([g for g in glosses if not isinstance(g, list)])))
    return rows


def lookup(texts, dictionary, languages, options=None):
    binary = os.path.join(REPO, "build", "lookup-batch-it")
    cmd = [binary, languages, "it", dictionary]
    if options:
        cmd += ["--options", options]
    out = subprocess.run(cmd, input="\n".join(texts) + "\n", capture_output=True, text=True, check=True)
    return [json.loads(line) for line in out.stdout.splitlines()]


def deinflect(words, languages):
    cli = os.path.join(REPO, "build", "hoshidicts-cli")
    cmd = [cli, "--languages", languages, "deinflect", "it", "--stdin"]
    out = subprocess.run(cmd, input="\n".join(words) + "\n", capture_output=True, text=True, check=True)
    result = {}
    for line in out.stdout.splitlines():
        d = json.loads(line)
        result[d["input"]] = {r["text"] for r in d["results"] if r["trace"]}
    return result


def acceptable(word, rows):
    """The first results that are right for a hovered word, by the dictionary's own rows.

    The word's own entry, a lemma its form-of rows name, and a lemma the rows
    of that lemma name in turn (andati names andato, whose row names andare;
    bellissima names bellissimo, which names bello). Never a sibling: a form
    that names the same lemma (ello for ellos) is not the word's lemma.
    """
    good = set()
    for w in {word, word.lower()}:
        entry = rows.get(w)
        if entry is None:
            continue
        if entry["own"]:
            good.add(w)
        for lemma in entry["refs"] | entry["glossed"]:
            good.add(lemma)
            other = rows.get(lemma)
            if other is not None:
                good |= other["refs"] | other["glossed"]
    return good


ELISIONS = ("l'", "gl'", "un'", "dell'", "all'", "dall'", "nell'", "sull'", "coll'", "pell'", "quest'", "quell'", "bell'",
            "sant'", "grand'", "mezz'", "tutt'", "nient'", "quant'", "tant'", "senz'", "anch'", "ch'", "com'", "cos'", "dov'",
            "quand'", "c'", "d'", "n'", "s'", "m'", "t'", "v'")
APOSTROPHED = re.compile(r"(l|dell|all|dall|nell|sull|coll|un|quest|quell|c|n)'")


def judge_variants(text):
    """The text as the judge compares it: apostrophes as ', lower case, an elided first word removed,
    Yomitan's apostrophed words removed, and (for lower-case text) without accents."""
    base = unicodedata.normalize("NFKC", text).replace("\u2019", "'")
    out = {text, base, base.lower()}
    for _ in range(2):
        for v in list(out):
            for e in ELISIONS:
                if v.lower().startswith(e):
                    out.add(v[len(e):])
            out.add(APOSTROPHED.sub("", v))
    for v in list(out):
        if v == v.lower():
            out.add("".join(c for c in unicodedata.normalize("NFD", v) if not unicodedata.combining(c)))
    return out


def acceptable_any(text, rows):
    good = set()
    for v in judge_variants(text):
        good |= acceptable(v, rows)
    return good


FREQ_FILE = None
FREQ = {}


def load_frequencies(path):
    """Counts of the frequency list, for judging which of several named lemmas dominates."""
    global FREQ_FILE
    if path and path != FREQ_FILE:
        FREQ.clear()
        for line in open(path, encoding="utf-8"):
            w, c = line.rstrip("\n").rsplit(" ", 1)
            FREQ[w] = FREQ.get(w, 0) + int(c)
        FREQ_FILE = path


def referenced(text, rows):
    """The lemmas the form-of rows of the text itself name (figli: figlio, figliare), through the
    judge's variants of the text (case, elision, accents); not the lemmas of glosses or of a lemma."""
    out = set()
    for v in judge_variants(text):
        entry = rows.get(v)
        if entry is not None:
            out |= entry["refs"]
    return out


def rarer_named(expression, word, rows):
    """The lemma a first result hides: when the first result is one of the lemmas the hovered word's
    own form-of rows name, another of them whose citation form is at least 10 times more frequent in
    the frequency list (the first audit's proxy for the dominant reading: figli shows figliare where
    figlio is 18 times more frequent), or None. The word itself is not one of the lemmas compared."""
    named = referenced(word, rows)
    words = judge_variants(word)
    if expression not in named or expression in words:
        return None
    mine = FREQ.get(expression, 0)
    best = max(((FREQ.get(lemma, 0), lemma) for lemma in named if lemma != expression and lemma not in words), default=(0, None))
    if best[1] is not None and best[0] > 0 and best[0] >= 10 * max(mine, 1):
        return best[1]
    return None


VERB_SLOT = r"(present|imperfect|preterite|future|conditional|subjunctive|imperative|participle|gerund)"
TIE_CLASSES = ("feminine noun before the adjective", "-e noun before the -o adjective",
               "-rsi imperative before the participle", "verb before the -a noun", "-co adjective before the -io noun",
               "capital letter at a sentence start")


def tie_class(word, f, rows):
    """The class of a first result over the hovered word alone, among the ties README.md's Known gaps
    counts, or None: a feminine noun shown for a feminine plural whose rows also name the -o adjective
    (nuove: nuova, not nuovo); an -e noun for an -i plural whose rows also name the -o adjective (morti:
    morte, not morto); an -rsi verb through a one-step trace (the dictionary's imperative row) for a word
    in -ati, -iti, -uti (condannati: condannarsi, not condannato); a capital letter's own entry for that
    letter (E, A, I, O starting a sentence); a verb for a word in -e whose rows also name the -a noun (cascate:
    cascare, not cascata); an -co adjective for an -ci or -chi plural whose rows also name the -io noun (marchi:
    marco, not marchio)."""
    if f is None or f["matched"] != word:
        return None
    w, e = word.lower(), f["expression"]
    if len(word) == 1 and word.isupper() and e == word:
        return TIE_CLASSES[5]
    named = referenced(word, rows)
    if w.endswith("e") and f["trace"] == ["plural"]:
        stem = w[:-2] if w.endswith(("che", "ghe")) else w[:-1]
        if e == stem + "a" and stem + "o" in named:
            return TIE_CLASSES[0]
    if w.endswith("i") and f["trace"] == ["plural"] and e == w[:-1] + "e" and w[:-1] + "o" in named:
        return TIE_CLASSES[1]
    if re.search(r"[aiu]ti$", w) and e.endswith("rsi") and len(f["trace"]) == 1:
        return TIE_CLASSES[2]
    if (w.endswith("e") and e.lower() != w and f["trace"] and re.match(VERB_SLOT, f["trace"][-1])
            and re.search(r"[aei]r(e|si)$", e) and w[:-1] + "a" in named):
        return TIE_CLASSES[3]
    if re.search(r"[cg]h?i$", w) and f["trace"] == ["plural"] and e == re.sub(r"h?i$", "o", w) and w[:-1] + "io" in named:
        return TIE_CLASSES[4]
    return None


def first(result):
    return result["results"][0] if result["results"] else None


def describe(r):
    return f"{r['expression']} ({r['matched']}; {'>'.join(r['trace']) or '-'})"


def cmd_freq(args):
    top = int(option(args, "--top", "10000"))
    start = int(option(args, "--from", "0"))
    languages = option(args, "--languages", os.path.join(REPO, "languages"))
    against = option(args, "--against", None)
    out_file = option(args, "--out", None)
    wty, dictionary, freq_file = args
    freq_file_full = freq_file
    rows = read_dictionary(wty)
    words, counts = [], {}
    for line in open(freq_file, encoding="utf-8"):
        w, c = line.rstrip("\n").rsplit(" ", 1)
        words.append(w)
        counts[w] = int(c)
        if len(words) >= top:
            break
    words = words[start:]
    counts = {w: counts[w] for w in words}
    total_tokens = sum(counts.values())
    reached = deinflect(words, languages)
    eligible = [w for w in words if (rows.get(w, {}) or {}).get("refs") and (rows[w]["refs"] & reached.get(w, set()))]
    every = lookup(words, dictionary, languages)
    by_word = dict(zip(words, every))
    results = [by_word[w] for w in eligible]
    wrong = []
    for w, res in zip(eligible, results):
        f = first(res)
        if f is None or f["expression"] not in acceptable(w, rows):
            wrong.append((w, f))
    eligible_tokens = sum(counts[w] for w in eligible)
    wrong_tokens = sum(counts[w] for w, _ in wrong)
    # Every word of the list: is the first result a named lemma 10 times rarer than another named one?
    load_frequencies(freq_file_full)
    rarer = []
    for w, res in zip(words, every):
        f = first(res)
        if f is None:
            continue
        hidden = rarer_named(f["expression"], w, rows) if f["matched"] == w else None
        if hidden is not None:
            rarer.append((w, f, hidden))
    rarer_tokens = sum(counts[w] for w, _, _ in rarer)
    span = f"top {top} words" if start == 0 else f"words {start + 1}-{top}"
    lines = [f"{span} ({total_tokens} tokens); a rule reaches a lemma their form-of rows name: {len(eligible)} words, "
             f"{eligible_tokens / total_tokens:.2%} of the tokens",
             f"wrong first result: {len(wrong)} words ({len(wrong) / max(1, len(eligible)):.2%}), "
             f"{wrong_tokens} tokens = {wrong_tokens / total_tokens:.3%} of the list's tokens, "
             f"{wrong_tokens / max(1, eligible_tokens):.3%} of the reached words' tokens"]
    lines.append(f"first result a named lemma 10 times rarer than another the word's rows name: {len(rarer)} words, "
                 f"{rarer_tokens} tokens = {rarer_tokens / total_tokens:.3%} of the list's tokens")
    compared = []
    their_first = {}
    if against is not None:
        differ, worse, better = [], [], []
        for w, mine, theirs in zip(words, every, lookup(words, dictionary, against)):
            their_first[w] = first(theirs)
            fm, ft = first(mine), first(theirs)
            if fm is None or ft is None or fm["expression"] == ft["expression"]:
                continue
            differ.append(w)
            cm, ct = FREQ.get(fm["expression"], 0), FREQ.get(ft["expression"], 0)
            if ct >= 10 * max(cm, 1):
                worse.append((w, fm, ft))
            elif cm >= 10 * max(ct, 1):
                better.append((w, fm, ft))
        tok = lambda xs: sum(counts[x[0]] for x in xs) / total_tokens
        lines.append(f"against {os.path.basename(os.path.normpath(against))}: {len(differ)} first results differ; this pack's lemma "
                     f"10 times rarer: {len(worse)} words ({tok(worse):.3%} of the list's tokens); 10 times more frequent: "
                     f"{len(better)} words ({tok(better):.3%})")
        for label, xs in (("rarer than", worse), ("more frequent than", better)):
            for w, fm, ft in sorted(xs, key=lambda x: -counts[x[0]]):
                compared.append(f"  {label}\t{w}\t{counts[w]}\t{describe(fm)}\t{describe(ft)}")
    for w, f, hidden in sorted(rarer, key=lambda x: -counts[x[0]]):
        lines.append(f"  rarer\t{w}\t{counts[w]}\t{describe(f)}\tinstead of {hidden} ({FREQ.get(hidden, 0)} vs {FREQ.get(f['expression'], 0)})")
    for w, f in sorted(wrong, key=lambda x: -counts[x[0]]):
        lines.append(f"  {w}\t{counts[w]}\t{describe(f) if f else 'no result'}\tright: {', '.join(sorted(acceptable(w, rows)))}")
    lines += compared
    ties = collections.defaultdict(list)
    for w, res in zip(words, every):
        c = tie_class(w, first(res), rows)
        if c is not None:
            ties[c].append(w)
    for c in TIE_CLASSES[:-1]:
        ws = sorted(ties.get(c, []), key=lambda x: -counts[x])
        lines.append(f"tie class {c}: {len(ws)} words, {sum(counts[w] for w in ws) / total_tokens:.3%} of the tokens: "
                     + ", ".join(f"{w} ({counts[w]})" for w in ws))
        if against is not None:
            other = [w for w in ws if their_first.get(w) and their_first[w]["expression"] != first(by_word[w])["expression"]]
            lines.append(f"  of which {os.path.basename(os.path.normpath(against))} shows another lemma first: {len(other)} words, "
                         f"{sum(counts[w] for w in other) / total_tokens:.3%} of the tokens: "
                         + ", ".join(f"{w} -> {their_first[w]['expression']}" for w in other))
    write(lines, out_file)


LEFTS = []  # the 40 characters before each hovered word, for the tie samples


def hovers_from_texts(paths):
    """(hover text, hovered word, the word after an apostrophe or None) for every word."""
    hovers, words, nexts = [], [], []
    LEFTS.clear()
    for path in paths:
        text = open(path, encoding="utf-8", errors="replace").read()
        start = text.find("*** START")
        if start >= 0:
            text = text[text.find("\n", start) + 1:]
        end = text.find("*** END")
        if end > 0:
            text = text[:end]
        for paragraph in re.split(r"\n\s*\n", text):
            flat = " ".join(paragraph.split())
            for sentence in SENTENCE_END.split(flat):
                for m in WORD.finditer(sentence):
                    LEFTS.append(sentence[max(0, m.start() - 40):m.start()])
                    hovers.append(sentence[m.start():])
                    words.append(m.group(0))
                    after = sentence[m.end():m.end() + 1]
                    following = WORD.match(sentence, m.end() + 1) if after in ("'", "\u2019") else None
                    nexts.append(following.group(0) if following else None)
    return hovers, words, nexts


def bases_of_pronominal(expression):
    """lavarsi → lavare, andarsene → andare, porsi → porre, farcela → fare: the verbs a -rsi form may be made of."""
    m = re.match(r"^(.+?)(r)(si|ci|vi|sene|cene|sela|cela|selo|sele|seli)$", expression)
    if not m:
        return set()
    stem = m.group(1)
    return {stem + "re", stem + "rre"}


def classify(word, nxt, f, rows):
    """right, phrase entry, pronominal (the -rsi form of the verb's lemma), or not confirmed."""
    good = acceptable_any(word, rows) | acceptable_any(f["matched"], rows)
    if nxt is not None:
        good |= acceptable(word + "'", rows) | acceptable_any(nxt, rows)
    if f["expression"] in good:
        return "right"
    if not f["trace"] and f["matched"] != word and f["expression"].lower() in {v.lower() for v in judge_variants(f["matched"]) | judge_variants(f["matched"] + "'")}:
        return "phrase entry"
    if "pronominal" in f["trace"]:
        words = f["matched"].replace("\u2019", "'").replace("'", "' ").split()
        bases = bases_of_pronominal(f["expression"])
        for w in words[1:]:
            named = acceptable_any(w, rows)
            if f["expression"] in named:
                return "right"
            if bases & named:
                return "pronominal"
    return "not confirmed"


TIES = []  # (class, hover index, word, first result) of the last judge_lookups


def judge_lookups(hovers, words, nexts, rows, dictionary, languages):
    results = lookup(hovers, dictionary, languages)
    tally = collections.Counter()
    wrong = collections.Counter()
    wrong_rules = collections.Counter()
    unjudged = []
    pronominal = []
    unconfirmed = []
    rarer = collections.Counter()
    rarer_items = []
    examples = collections.defaultdict(list)
    TIES.clear()
    for i, (hover, word, nxt, res) in enumerate(zip(hovers, words, nexts, results)):
        f = first(res)
        if f is None:
            tally["no result"] += 1
            continue
        c = tie_class(word, f, rows)
        if c is not None:
            TIES.append((c, i, word, f))
        known = acceptable_any(word, rows) or (nxt is not None and (acceptable_any(nxt, rows) or acceptable(word + "'", rows)))
        if not known and f["matched"] == word:
            tally["unjudged"] += 1
            unjudged.append((hover, word, f))
            continue
        verdict = classify(word, nxt, f, rows)
        tally[verdict] += 1
        if verdict == "right" and FREQ and f["matched"] == word:
            hidden = rarer_named(f["expression"], word, rows)
            if hidden is not None:
                tally["rarer named lemma"] += 1
                rarer[(word.lower(), f["expression"], hidden)] += 1
                rarer_items.append((hover, word, f, hidden))
        if verdict == "pronominal":
            pronominal.append((hover, word, f))
        if verdict == "not confirmed":
            unconfirmed.append((hover, word, f))
            key = (word.lower(), f["expression"], ">".join(f["trace"]) or "-")
            wrong[key] += 1
            rule = f["trace"][0] if f["trace"] else ("(longer match)" if f["matched"] != word else "(as written)")
            wrong_rules[rule] += 1
            if len(examples[key]) < 2:
                examples[key].append(hover[:60])
    return tally, wrong, wrong_rules, unjudged, examples, pronominal, unconfirmed, rarer, rarer_items


def cmd_text(args):
    languages = option(args, "--languages", os.path.join(REPO, "languages"))
    out_file = option(args, "--out", None)
    sample = int(option(args, "--sample", "60"))
    load_frequencies(option(args, "--freq", None))
    wty, dictionary, *paths = args
    rows = read_dictionary(wty)
    # Sorted, so the random samples do not depend on the order the texts are named in.
    hovers, words, nexts = hovers_from_texts(sorted(paths, key=os.path.basename))
    tally, wrong, wrong_rules, unjudged, examples, pronominal, unconfirmed, rarer, rarer_items = judge_lookups(hovers, words, nexts, rows, dictionary, languages)
    judged = tally["right"] + tally["not confirmed"] + tally["pronominal"] + tally["phrase entry"]
    lines = [f"{len(hovers)} lookups: {judged} judged by script: {tally['right']} right, {tally['pronominal']} -rsi verbs of the verb's lemma, "
             f"{tally['phrase entry']} phrase entries, {tally['not confirmed']} not confirmed ({tally['not confirmed'] / max(1, judged):.3%}); "
             f"{tally['unjudged']} unjudged (the word has no row), {tally['no result']} no result",
             f"of the right ones, {tally['rarer named lemma']} show a named lemma 10 times rarer than another the rows name"
             + (" (no --freq list given)" if not FREQ else ""),
             "not confirmed first results by the first rule of their trace:"]
    lines += [f"  {rule}\t{n}" for rule, n in wrong_rules.most_common()]
    lines.append("largest groups (word, first result, trace):")
    for (word, expression, trace), n in wrong.most_common(80):
        lines.append(f"  {n}\t{word} -> {expression} [{trace}]\t{' | '.join(examples[(word, expression, trace)])}")
    lines.append("named lemmas 10 times rarer than another, largest groups (word, first result, the more frequent one):")
    for (word, expression, hidden), n in rarer.most_common(40):
        lines.append(f"  {n}\t{word} -> {expression}\tinstead of {hidden}")
    random.seed(20261103)
    lines.append(f"random sample of {min(sample, len(rarer_items))} of those (judge by hand):")
    for hover, word, f, hidden in random.sample(rarer_items, min(sample, len(rarer_items))):
        lines.append(f"  {word}\t{describe(f)}\tinstead of {hidden}\t{hover[:70]}")
    random.seed(20261103)
    lines.append(f"random sample of {min(sample, len(unjudged))} unjudged lookups (judge by hand):")
    for hover, word, f in random.sample(unjudged, min(sample, len(unjudged))):
        lines.append(f"  {word}\t{describe(f)}\t{hover[:70]}")
    lines.append(f"random sample of {min(sample, len(pronominal))} -rsi readings (judge by hand):")
    for hover, word, f in random.sample(pronominal, min(sample, len(pronominal))):
        lines.append(f"  {describe(f)}\t{hover[:70]}")
    lines.append(f"random sample of {min(sample, len(unconfirmed))} not confirmed lookups (judge by hand):")
    for hover, word, f in random.sample(unconfirmed, min(sample, len(unconfirmed))):
        lines.append(f"  {word}\t{describe(f)}\t{hover[:70]}")
    lines.append("first results over the word alone in the tie classes of README.md's Known gaps (lookups, words):")
    for c in TIE_CLASSES:
        items = [t for t in TIES if t[0] == c]
        per_word = collections.Counter(t[2].lower() for t in items)
        lines.append(f"  {c}: {len(items)} ({len(items) / len(hovers):.3%} of the lookups), {len(per_word)} words: "
                     + ", ".join(f"{w} {n}" for w, n in per_word.most_common(15)))
    for c in TIE_CLASSES:
        items = [t for t in TIES if t[0] == c]
        random.seed(20261103)
        lines.append(f"random sample of {min(20, len(items))} of the class {c} (judge by hand):")
        for _, i, word, f in random.sample(items, min(20, len(items))):
            lines.append(f"  {word}\t{describe(f)}\t…{LEFTS[i]}[{hovers[i][:50]}]")
    write(lines, out_file)


PRONOUNS = ["mi", "ti", "si", "ci", "vi", "me", "te", "se", "ce", "ve", "lo", "la", "li", "le", "gli", "ne"]
ELIDED = ["m'", "t'", "s'", "c'", "v'", "m\u2019", "t\u2019", "s\u2019", "c\u2019", "v\u2019"]
PLACE = re.compile(r"(?<![" + LETTER + r"'\u2019])((?:" + "|".join(PRONOUNS) + r") |(?:" + "|".join(ELIDED) + r"))(?=[" + LETTER + "])",
                   re.IGNORECASE)


def cmd_pronouns(args):
    languages = option(args, "--languages", os.path.join(REPO, "languages"))
    out_file = option(args, "--out", None)
    sample = int(option(args, "--sample", "60"))
    wty, dictionary, sentences_file = args
    rows = read_dictionary(wty)
    opener = bz2.open if sentences_file.endswith(".bz2") else open
    hovers, pronouns = [], []
    with opener(sentences_file, "rt", encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 3:
                continue
            sentence = parts[2]
            for m in PLACE.finditer(sentence):
                hovers.append(sentence[m.start():])
                pronouns.append(m.group(1).strip())
    results = lookup(hovers, dictionary, languages)
    tally = collections.Counter()
    groups = collections.Counter()
    examples = {}
    unconfirmed = []
    pronominal = []
    for hover, pronoun, res in zip(hovers, pronouns, results):
        f = first(res)
        if f is None:
            tally["no result"] += 1
            continue
        if len(f["matched"]) <= len(pronoun):
            tally["pronoun alone"] += 1
            continue
        word = re.split(r"[ '\u2019]", hover, maxsplit=1)[0]
        nxt = None
        if re.match(r"[" + LETTER + r"]+['\u2019]", hover):
            following = WORD.match(hover, len(word) + 1)
            nxt = following.group(0) if following else None
        verdict = classify(word, nxt, f, rows)
        tally["phrase"] += 1
        tally[verdict] += 1
        if "pronominal" in f["trace"]:
            tally["phrase through the pronominal rule"] += 1
        key = (verdict, f["matched"].lower(), f["expression"])
        groups[key] += 1
        examples.setdefault(key, hover[:60])
        if verdict == "not confirmed":
            unconfirmed.append((hover, f))
        if verdict == "pronominal":
            pronominal.append((hover, f))
    lines = [f"{len(hovers)} places; " + ", ".join(f"{k}: {v}" for k, v in tally.most_common())]
    lines.append("not confirmed first results over the phrase, largest groups:")
    for (verdict, matched, expression), c in groups.most_common():
        if verdict == "not confirmed" and len(lines) < 120:
            lines.append(f"  {c}\t{matched} -> {expression}\t{examples[(verdict, matched, expression)]}")
    random.seed(20261103)
    lines.append(f"random sample of {min(sample, len(unconfirmed))} not confirmed places (judge by hand):")
    for hover, f in random.sample(unconfirmed, min(sample, len(unconfirmed))):
        lines.append(f"  {describe(f)}\t{hover[:70]}")
    lines.append(f"random sample of {min(sample, len(pronominal))} -rsi readings (judge by hand):")
    for hover, f in random.sample(pronominal, min(sample, len(pronominal))):
        lines.append(f"  {describe(f)}\t{hover[:70]}")
    write(lines, out_file)


def run_eval(languages, code, tsv, transforms, dictionary, per_rule=False):
    cli = os.path.join(REPO, "build", "hoshidicts-cli")
    cmd = [cli, "--languages", languages, "eval-language", code, tsv, "--transforms", transforms, "--dictionary", dictionary]
    if per_rule:
        cmd.append("--per-rule")
    out = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def tsv_rows(path):
    return [line for line in open(path, encoding="utf-8").read().splitlines() if line and not line.startswith("#")]


def cmd_eval(args):
    import tempfile
    languages = option(args, "--languages", os.path.join(REPO, "languages"))
    per_rule_file = option(args, "--per-rule", None)
    (dictionary,) = args
    pack = os.path.join(languages, "it")
    tests = os.path.join(pack, "tests")
    work = tempfile.mkdtemp(prefix="it-eval-")
    final = os.path.join(pack, "transforms.json")
    own = os.path.join(pack, "sources", "own.json")
    yomitan = os.path.join(work, "yomitan-none.json")
    with open(final, encoding="utf-8") as f:
        conditions = json.load(f)["conditions"]
    with open(yomitan, "w", encoding="utf-8") as f:
        json.dump({"schema": 1, "conditions": conditions, "transforms": []}, f)
    union = os.path.join(work, "union.json")
    subprocess.run(["node", os.path.join(REPO, "tools", "merge-transforms.mjs"), "it", "--languages", languages, "--out", union],
                   check=True, capture_output=True)
    files = {
        "corpus + gaps": tsv_rows(os.path.join(tests, "corpus.tsv")) + tsv_rows(os.path.join(tests, "gaps.tsv")),
        "cases": tsv_rows(os.path.join(tests, "cases.tsv")),
        "defaults": tsv_rows(os.path.join(tests, "defaults.tsv")),
    }
    lines = ["set\tfile\toptions\trows\trecall\tnegatives passed\tfalse candidates\tfirst rank"]
    for name, rows in files.items():
        for mode in ("default", "all"):
            path = os.path.join(work, f"{name.replace(' ', '').replace('+', '-')}-{mode}.tsv")
            with open(path, "w", encoding="utf-8") as f:
                if mode == "default":
                    f.write("# options: default\n")
                f.write("# category\tvalid\tsource\tterm\trule\treasons\n" + "\n".join(rows) + "\n")
            for label, transforms in (("own", own), ("Yomitan (none)", yomitan), ("union", union), ("final", final)):
                r = run_eval(languages, "it", path, transforms, dictionary)
                neg = "-" if not r.get("negatives") else f"{r['negativesPassed']:.4f}"
                lines.append(f"{label}\t{name}\t{mode}\t{r['rows']}\t{r['recall']:.4f}\t{neg}\t{r['falseCandidates']:.4f}\t{r['firstRank']:.4f}")
    if per_rule_file:
        path = os.path.join(work, "all-default.tsv")
        with open(path, "w", encoding="utf-8") as f:
            f.write("# options: default\n# category\tvalid\tsource\tterm\trule\treasons\n")
            f.write("\n".join(files["corpus + gaps"] + files["defaults"]) + "\n")
        r = run_eval(languages, "it", path, final, dictionary, per_rule=True)
        with open(per_rule_file, "w", encoding="utf-8") as f:
            json.dump(r, f, ensure_ascii=False, indent=1)
    write(lines, None)


def cmd_bench(args):
    languages = option(args, "--languages", os.path.join(REPO, "languages"))
    runs = int(option(args, "--runs", "3"))
    passes = int(option(args, "--passes", "6"))
    (dictionary,) = args
    words = os.path.join(HERE, "benchmark-words.txt")
    binary = os.path.join(REPO, "build", "benchmark-lookup")
    lines = []
    for run in range(runs):
        out = subprocess.run([binary, words, str(passes), "--term", dictionary, "--languages", languages, "--language", "it", "--json"],
                             capture_output=True, text=True, check=True)
        data = json.loads(out.stdout)
        times = sorted(t for timings in data["passes"][1:] for t in timings)
        p50 = times[len(times) // 2] * 1000
        p95 = times[min(len(times) - 1, int(len(times) * 0.95))] * 1000
        lines.append(f"run {run + 1}: {data['words']} texts x {passes - 1} passes, p50 {p50:.1f} us, p95 {p95:.1f} us, "
                     f"{data['result_count']} results")
    write(lines, None)


def unimorph_slot(tags):
    """The transform id a UniMorph verb feature set names, or None."""
    t = tags.split(";")
    person = {("1", "SG"): "io", ("2", "SG"): "tu", ("3", "SG"): "lui", ("1", "PL"): "noi", ("2", "PL"): "voi", ("3", "PL"): "loro"}
    p = next(((a, b) for a, b in zip(t, t[1:]) if a in "123" and b in ("SG", "PL")), None)
    if t[0] == "V.CVB":
        return "gerund"
    if t[0] == "V.PTCP":
        return "participle-present" if "PRS" in t else "participle"
    if "IMP" in t:
        if p in (("3", "SG"),):
            return "subjunctive-sg"
        if p in (("3", "PL"),):
            return "subjunctive-loro"
        return {("2", "SG"): "imperative-tu", ("1", "PL"): "imperative-noi", ("2", "PL"): "imperative-voi"}.get(p)
    if "COND" in t:
        return f"conditional-{person[p]}"
    if "SBJV" in t and "PRS" in t:
        return "subjunctive-sg" if p[1] == "SG" else f"subjunctive-{person[p]}"
    if "SBJV" in t and "PST" in t:
        return "subjunctive-imperfect-sg" if p in (("1", "SG"), ("2", "SG")) else f"subjunctive-imperfect-{person[p]}"
    if "FUT" in t:
        return f"future-{person[p]}"
    if "PST" in t:
        return f"{'imperfect' if 'IPFV' in t else 'preterite'}-{person[p]}"
    if "PRS" in t:
        return f"present-{person[p]}"
    return None


def cmd_traces(args):
    languages = option(args, "--languages", os.path.join(REPO, "languages"))
    tests = os.path.join(languages, "it", "tests")
    rows = [r.split("\t") for r in tsv_rows(os.path.join(tests, "corpus.tsv")) + tsv_rows(os.path.join(tests, "gaps.tsv"))]
    rows = [r for r in rows if r[0].startswith("V") and unimorph_slot(r[0]) is not None]
    cli = os.path.join(REPO, "build", "hoshidicts-cli")
    sources = sorted({r[2] for r in rows})
    pre = subprocess.run([cli, "--languages", languages, "preprocess", "it", "--stdin"], input="\n".join(sources) + "\n",
                         capture_output=True, text=True, check=True)
    variants = {}
    for line in pre.stdout.splitlines():
        d = json.loads(line)
        variants[d["input"]] = [(v["text"], v["steps"]) for v in d["variants"]]
    texts = sorted({t for vs in variants.values() for t, _ in vs})
    de = subprocess.run([cli, "--languages", languages, "deinflect", "it", "--stdin"], input="\n".join(texts) + "\n",
                        capture_output=True, text=True, check=True)
    results = {}
    for line in de.stdout.splitlines():
        d = json.loads(line)
        results[d["input"]] = d["results"]
    reached = tense = both = finite = person_ok = 0
    misses = collections.Counter()
    for category, _valid, source, lemma, _rule, _reasons in rows:
        best = None
        for text, steps in variants[source]:
            for r in results[text]:
                if r["text"] == lemma and (best is None or (steps, len(r["trace"])) < best[0]):
                    best = ((steps, len(r["trace"])), r["trace"])
        if best is None:
            continue
        reached += 1
        want = unimorph_slot(category)
        trace = best[1]
        tense_of = lambda tid: tid.rsplit("-", 1)[0] if tid.split("-")[-1] in ("io", "tu", "lui", "noi", "voi", "loro", "sg") else tid
        has_tense = any(tense_of(x) == tense_of(want) for x in trace)
        has_slot = want in trace
        tense += has_tense
        if want.split("-")[-1] in ("io", "tu", "lui", "noi", "voi", "loro", "sg"):
            finite += 1
            person_ok += has_slot
        if not has_slot:
            misses[(want, ">".join(trace))] += 1
    lines = [f"{len(rows)} UniMorph verb rows, {reached} reached; the kept trace names the tense or mood in {tense} ({tense / reached:.1%}), "
             f"and of the {finite} finite rows the person too in {person_ok} ({person_ok / max(1, finite):.1%})"]
    lines += [f"  {n}\texpected {want}, kept {trace}" for (want, trace), n in misses.most_common(20)]
    write(lines, None)


def write(lines, out_file):
    text = "\n".join(lines) + "\n"
    if out_file:
        with open(out_file, "w", encoding="utf-8") as f:
            f.write(text)
    sys.stdout.write(text if not out_file else "\n".join(lines[:3]) + "\n")


if __name__ == "__main__":
    command, rest = sys.argv[1], sys.argv[2:]
    {"freq": cmd_freq, "text": cmd_text, "pronouns": cmd_pronouns, "eval": cmd_eval, "bench": cmd_bench, "traces": cmd_traces}[command](rest)
