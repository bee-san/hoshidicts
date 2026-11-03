#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-or-later
# The commands behind README.md's Rule provenance and Measurements. Not run
# by any test. Run from the repository root, after building hoshidicts-cli
# and lookup-batch (languages/en/sources/lookup-batch.cpp; its header says
# how):
#
#   languages/fr/sources/measure.sh inputs <cache> <work>   lemma-only copy, index, hovers, word set, universe
#   languages/fr/sources/measure.sh final  <cache> <work>   sources/yomitan-provenance.tsv and transforms.json
#   languages/fr/sources/measure.sh sets   <cache> <work>   the own, Yomitan, union and final packs in <work>/packs
#   languages/fr/sources/measure.sh eval   <cache> <work>   eval-language for every set, file and option mode
#   languages/fr/sources/measure.sh lookups <cache> <work> <set>...   frequent words, real text, Tatoeba, pronominal verbs
#   languages/fr/sources/measure.sh displaced <cache> <work>   the first results the kept Yomitan rules change
#   languages/fr/sources/measure.sh bench  <cache> <work> <set>...   benchmark-lookup on sources/benchmark-sentences.txt
#
# <cache> holds the downloads of README.md (Sources and licences):
# wty-fr-en.zip and its import wty-fr-en/ (hoshidicts-cli import), unimorph/
# (fra, fra.um4), fr_50k.txt, fra_sentences.tsv (unpacked) and gutenberg/
# (pg800.txt, pg14155.txt, pg4791.txt). <work> receives everything else.
set -eu
cmd=$1; C=$2; W=$3; shift 3
S=languages/fr/sources
LOOKUP=${LOOKUP_BATCH:-build/lookup-batch}
LD="$W/lemmaonly/wty-fr-en (lemma rows only)"
IDX=$W/wty-fr-en-index.json
case $cmd in
  inputs)
    mkdir -p $W/lemmaonly $W/text $W/tatoeba
    python3 $S/lemma-only.py $C/wty-fr-en.zip $W/lemmaonly/wty-fr-en-lemmas.zip
    (cd $W/lemmaonly && "$OLDPWD/build/hoshidicts-cli" import wty-fr-en-lemmas.zip)
    python3 $S/dictindex.py $C/wty-fr-en.zip $IDX
    python3 $S/make-hovers.py $W/text $C/gutenberg/pg800.txt $C/gutenberg/pg14155.txt $C/gutenberg/pg4791.txt
    python3 $S/tatoeba-hovers.py $C/fra_sentences.tsv $W/tatoeba 7
    python3 $S/universe.py $C/unimorph/fra.um4 $C/fr_50k.txt $C/wty-fr-en.zip $W/universe.tsv --index $IDX
    python3 - "$C" "$W" <<'EOF'
import re, sys
C, W = sys.argv[1], sys.argv[2]
WORD = re.compile(r'^[a-zàâäæçéèêëîïôöœùûüÿ]+$')
ws = set()
for path in (C + '/unimorph/fra.um4', C + '/unimorph/fra'):
    for line in open(path, encoding='utf-8'):
        p = line.rstrip('\n').split('\t')
        if len(p) >= 3 and WORD.match(p[1]):
            ws.add(p[1])
for line in open(C + '/fr_50k.txt', encoding='utf-8'):
    w = line.rsplit(' ', 1)[0].lower()
    if WORD.match(w):
        ws.add(w)
for line in open(W + '/text/words.txt', encoding='utf-8'):
    w = line.strip().lower()
    if WORD.match(w):
        ws.add(w)
open(W + '/wordset.txt', 'w', encoding='utf-8').write('\n'.join(sorted(ws)) + '\n')
EOF
    ;;
  final)
    P=languages/fr
    node $S/build-own.mjs
    python3 $S/yomitan-rules.py languages $C/wty-fr-en.zip $C/unimorph/fra.um4 $C/unimorph/fra $C/fr_50k.txt $W/text/words.txt \
      $W/yomitan-provenance --cli build/hoshidicts-cli --index $IDX
    cp $W/yomitan-provenance.tsv $S/yomitan-provenance.tsv
    mkdir -p $W/packs/own/fr $W/packs/final/fr
    cp $P/language.json $W/packs/own/fr/ && cp $S/own.json $W/packs/own/fr/transforms.json
    cp $P/language.json $W/packs/final/fr/
    for it in 1 2 3 4 5 6 7 8 9 10; do
      node $S/build-final.mjs
      cp $P/transforms.json $W/packs/final/fr/transforms.json
      out=$(python3 $S/yomitan-harm.py $W/packs/final $S/yomitan-provenance.tsv $W/yomitan-provenance-false.tsv $LOOKUP \
        $C/wty-fr-en "$LD" --cli build/hoshidicts-cli --own $W/packs/own --words $W/wordset.txt --zip $C/wty-fr-en.zip \
        --um4 $C/unimorph/fra.um4 --index $IDX --hovers $W/text/hover.txt --hovers $W/tatoeba/hover.txt)
      echo "$out"
      if echo "$out" | grep -q '^0 rules changed'; then break; fi
    done
    ;;
  sets)
    node tools/merge-transforms.mjs fr --out $W/union.json --force
    for set in own yomitan union final; do
      mkdir -p $W/packs/$set/fr
      cp languages/fr/language.json $W/packs/$set/fr/
    done
    cp $S/own.json $W/packs/own/fr/transforms.json
    cp $S/yomitan.json $W/packs/yomitan/fr/transforms.json
    cp $W/union.json $W/packs/union/fr/transforms.json
    cp languages/fr/transforms.json $W/packs/final/fr/transforms.json
    { echo '# corpus.tsv and gaps.tsv'; grep -hv '^#' languages/fr/tests/corpus.tsv languages/fr/tests/gaps.tsv; } > $W/sample.tsv
    { echo '# corpus.tsv, gaps.tsv and cases.tsv'; grep -hv '^#' $W/sample.tsv languages/fr/tests/cases.tsv; } > $W/sample-cases.tsv
    ;;
  eval)
    # eval-language for each rule set on the sample (corpus.tsv and gaps.tsv),
    # cases.tsv and the universe, with every option on and with the defaults
    # (the pack has no optional feature, so both give the same numbers);
    # --per-rule for the final set on the sample and cases.tsv.
    mkdir -p $W/results
    for f in sample cases universe; do
      case $f in sample) T=$W/sample.tsv ;; cases) T=languages/fr/tests/cases.tsv ;; universe) T=$W/universe.tsv ;; esac
      { echo '# options: default'; grep -v '^# options' $T; } > $W/$f-default.tsv
      for set in own yomitan union final; do
        for mode in all default; do
          if [ $mode = all ]; then F=$T; else F=$W/$f-default.tsv; fi
          echo "$f $set $mode $(build/hoshidicts-cli eval-language fr $F --transforms $W/packs/$set/fr/transforms.json --dictionary $C/wty-fr-en)"
        done
      done
    done > $W/results/eval.txt
    build/hoshidicts-cli eval-language fr $W/sample-cases.tsv --transforms languages/fr/transforms.json --dictionary $C/wty-fr-en --per-rule > $W/results/per-rule-final.json
    ;;
  lookups)
    mkdir -p $W/results
    for set in "$@"; do
      for dict in full lemma; do
        if [ $dict = full ]; then D=$C/wty-fr-en; else D="$LD"; fi
        out=$W/results/$set-$dict
        python3 $S/measure-frequent.py $W/packs/$set fr "$D" $C/wty-fr-en.zip $C/fr_50k.txt --cli build/hoshidicts-cli \
          --lookup $LOOKUP --index $IDX --wrong $out-frequent-wrong.tsv > $out-frequent.json
        $LOOKUP $W/packs/$set fr "$D" < $W/text/hover.txt > $W/results/lookups.jsonl
        python3 $S/judge-hovers.py $W/text/words.txt $W/results/lookups.jsonl $C/wty-fr-en.zip --index $IDX --out $out-text > $out-text.json
        $LOOKUP $W/packs/$set fr "$D" < $W/tatoeba/hover.txt > $W/results/lookups.jsonl
        python3 $S/judge-hovers.py $W/tatoeba/words.txt $W/results/lookups.jsonl $C/wty-fr-en.zip --index $IDX \
          --out $out-tatoeba --classes $W/tatoeba/classes.txt > $out-tatoeba.json
        rm -f $W/results/lookups.jsonl
        python3 $S/traces.py $W/sample.tsv $W/packs/$set "$D" $LOOKUP > $out-traces.json
        python3 $S/pronominal-subject.py $C/fra_sentences.tsv $LOOKUP $W/packs/$set "$D" --out $out-pronominal > $out-pronominal.json
        echo "$set $dict done"
      done
    done
    ;;
  displaced)
    # The first results the kept Yomitan rules change: the word set looked up
    # with the own rules and with the final rules, with wty-fr-en and the
    # lemma-only copy (README.md, Rule provenance).
    python3 $S/displaced.py $W/packs/own $W/packs/final $LOOKUP $W/wordset.txt --dictionary $C/wty-fr-en --dictionary "$LD" > $W/results/displaced.tsv
    tail -1 $W/results/displaced.tsv
    ;;
  bench)
    # benchmark-lookup on the texts from each word of four letters or more (or
    # an elided word, or me, se, te) of sources/benchmark-sentences.txt to the
    # end of its sentence, 6 passes, for each pack in <work>/packs.
    python3 - $S/benchmark-sentences.txt $W/benchmark-words.txt <<'EOF2'
import re, sys
WORD = re.compile(r"[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F]+")
out = []
for s in open(sys.argv[1], encoding='utf-8'):
    s = s.rstrip('\n')
    if not s or s.startswith('#'):
        continue
    for m in WORD.finditer(s):
        t = s[m.start():]
        if len(m.group(0)) >= 4 or t[:2] in ("l'", "j'", "s'", "m'", "t'", "d'", 'qu') or t.startswith(('me ', 'se ', 'te ')):
            out.append(t)
open(sys.argv[2], 'w', encoding='utf-8').write('\n'.join(out) + '\n')
EOF2
    for set in "$@"; do
      for run in 1 2 3; do
        build/benchmark-lookup $W/benchmark-words.txt 6 --term $C/wty-fr-en --languages $W/packs/$set --language fr --json > $W/results/bench-$set-$run.json
      done
    done
    ;;
  *) echo "unknown command $cmd" >&2; exit 2 ;;
esac
