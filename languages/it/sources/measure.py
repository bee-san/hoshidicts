#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The real-use measurements of README.md (Measurements 2-4). Not run by any test.

    python3 measure.py freq     <wty zip> <imported dict> <it_50k.txt> [--top N] [--languages DIR] [--out FILE]
    python3 measure.py text     <wty zip> <imported dict> <pg*.txt>... [--languages DIR] [--out FILE] [--sample N]
    python3 measure.py pronouns <wty zip> <imported dict> <ita_sentences.tsv(.bz2)> [--languages DIR] [--out FILE]
    python3 measure.py eval     <imported dict> [--languages DIR] [--per-rule FILE]
    python3 measure.py bench    <imported dict> [--languages DIR] [--runs N] [--passes N]

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


def first(result):
    return result["results"][0] if result["results"] else None


def describe(r):
    return f"{r['expression']} ({r['matched']}; {'>'.join(r['trace']) or '-'})"


def cmd_freq(args):
    top = int(option(args, "--top", "10000"))
    languages = option(args, "--languages", os.path.join(REPO, "languages"))
    out_file = option(args, "--out", None)
    wty, dictionary, freq_file = args
    rows = read_dictionary(wty)
    words, counts = [], {}
    for line in open(freq_file, encoding="utf-8"):
        w, c = line.rstrip("\n").rsplit(" ", 1)
        words.append(w)
        counts[w] = int(c)
        if len(words) >= top:
            break
    total_tokens = sum(counts.values())
    reached = deinflect(words, languages)
    eligible = [w for w in words if (rows.get(w, {}) or {}).get("refs") and (rows[w]["refs"] & reached.get(w, set()))]
    results = lookup(eligible, dictionary, languages)
    wrong = []
    for w, res in zip(eligible, results):
        f = first(res)
        if f is None or f["expression"] not in acceptable(w, rows):
            wrong.append((w, f))
    eligible_tokens = sum(counts[w] for w in eligible)
    wrong_tokens = sum(counts[w] for w, _ in wrong)
    lines = [f"top {top} words ({total_tokens} tokens); a rule reaches a lemma their form-of rows name: {len(eligible)} words, "
             f"{eligible_tokens / total_tokens:.2%} of the tokens",
             f"wrong first result: {len(wrong)} words ({len(wrong) / max(1, len(eligible)):.2%}), "
             f"{wrong_tokens} tokens = {wrong_tokens / total_tokens:.3%} of the list's tokens, "
             f"{wrong_tokens / max(1, eligible_tokens):.3%} of the reached words' tokens"]
    for w, f in sorted(wrong, key=lambda x: -counts[x[0]]):
        lines.append(f"  {w}\t{counts[w]}\t{describe(f) if f else 'no result'}\tright: {', '.join(sorted(acceptable(w, rows)))}")
    write(lines, out_file)


def hovers_from_texts(paths):
    """(hover text, hovered word, the word after an apostrophe or None) for every word."""
    hovers, words, nexts = [], [], []
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


def judge_lookups(hovers, words, nexts, rows, dictionary, languages):
    results = lookup(hovers, dictionary, languages)
    tally = collections.Counter()
    wrong = collections.Counter()
    wrong_rules = collections.Counter()
    unjudged = []
    pronominal = []
    unconfirmed = []
    examples = collections.defaultdict(list)
    for hover, word, nxt, res in zip(hovers, words, nexts, results):
        f = first(res)
        if f is None:
            tally["no result"] += 1
            continue
        known = acceptable_any(word, rows) or (nxt is not None and (acceptable_any(nxt, rows) or acceptable(word + "'", rows)))
        if not known and f["matched"] == word:
            tally["unjudged"] += 1
            unjudged.append((hover, word, f))
            continue
        verdict = classify(word, nxt, f, rows)
        tally[verdict] += 1
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
    return tally, wrong, wrong_rules, unjudged, examples, pronominal, unconfirmed


def cmd_text(args):
    languages = option(args, "--languages", os.path.join(REPO, "languages"))
    out_file = option(args, "--out", None)
    sample = int(option(args, "--sample", "60"))
    wty, dictionary, *paths = args
    rows = read_dictionary(wty)
    hovers, words, nexts = hovers_from_texts(paths)
    tally, wrong, wrong_rules, unjudged, examples, pronominal, unconfirmed = judge_lookups(hovers, words, nexts, rows, dictionary, languages)
    judged = tally["right"] + tally["not confirmed"] + tally["pronominal"] + tally["phrase entry"]
    lines = [f"{len(hovers)} lookups: {judged} judged by script: {tally['right']} right, {tally['pronominal']} -rsi verbs of the verb's lemma, "
             f"{tally['phrase entry']} phrase entries, {tally['not confirmed']} not confirmed ({tally['not confirmed'] / max(1, judged):.3%}); "
             f"{tally['unjudged']} unjudged (the word has no row), {tally['no result']} no result",
             "not confirmed first results by the first rule of their trace:"]
    lines += [f"  {rule}\t{n}" for rule, n in wrong_rules.most_common()]
    lines.append("largest groups (word, first result, trace):")
    for (word, expression, trace), n in wrong.most_common(80):
        lines.append(f"  {n}\t{word} -> {expression} [{trace}]\t{' | '.join(examples[(word, expression, trace)])}")
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
    lines = [f"{len(hovers)} places; " + ", ".join(f"{k}: {v}" for k, v in tally.most_common())]
    lines.append("not confirmed first results over the phrase, largest groups:")
    for (verdict, matched, expression), c in groups.most_common():
        if verdict == "not confirmed" and len(lines) < 120:
            lines.append(f"  {c}\t{matched} -> {expression}\t{examples[(verdict, matched, expression)]}")
    random.seed(20261103)
    lines.append(f"random sample of {min(sample, len(unconfirmed))} not confirmed places (judge by hand):")
    for hover, f in random.sample(unconfirmed, min(sample, len(unconfirmed))):
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


def write(lines, out_file):
    text = "\n".join(lines) + "\n"
    if out_file:
        with open(out_file, "w", encoding="utf-8") as f:
            f.write(text)
    sys.stdout.write(text if not out_file else "\n".join(lines[:3]) + "\n")


if __name__ == "__main__":
    command, rest = sys.argv[1], sys.argv[2:]
    {"freq": cmd_freq, "text": cmd_text, "pronouns": cmd_pronouns, "eval": cmd_eval, "bench": cmd_bench}[command](rest)
