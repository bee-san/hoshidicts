# SPDX-License-Identifier: GPL-3.0-or-later
# The options line of docs/languages.md section 12.2 in the conformance test,
# on the od fixture, on edited copies of it and on a copy of the Japanese pack:
#
#   cmake -DTEST=<language-conformance-test> -DPACK=<tests/fixtures/conformance/od> -DJA=<languages/ja>
#         -DSCRATCH=<dir> -P tests/conformance_options_test.cmake
#
# od's tests/defaults.tsv, text.tsv and lookup.tsv start with
# `# options: default` and run with the pack's defaults; tests/corpus.tsv and
# cases.tsv run with every optional processor and transform on. Each case
# copies a pack (PACK <dir>, od by default), writes files (WRITE <file>
# <text>, repeated), replaces FROM by TO in files (EDIT <file> <from> <to>,
# repeated), runs the test and checks its exit status, the texts its output
# must have (EXPECT) and those it must not (REJECT).

# An empty TO is a list element of its own.
cmake_policy(SET CMP0007 NEW)

set(COPY ${SCRATCH}/conformance-options)

function(check name expected_rc)
  cmake_parse_arguments(PARSE_ARGV 2 A "" "PACK" "WRITE;EDIT;EXPECT;REJECT")
  if(NOT A_PACK)
    set(A_PACK ${PACK})
  endif()
  get_filename_component(pack_name ${A_PACK} NAME)
  file(REMOVE_RECURSE ${COPY})
  file(COPY ${A_PACK} DESTINATION ${COPY})
  set(dir ${COPY}/${pack_name})
  list(LENGTH A_WRITE count)
  set(i 0)
  while(i LESS count)
    math(EXPR j "${i} + 1")
    list(GET A_WRITE ${i} write_file)
    list(GET A_WRITE ${j} text)
    file(WRITE ${dir}/${write_file} "${text}")
    math(EXPR i "${i} + 2")
  endwhile()
  list(LENGTH A_EDIT count)
  set(i 0)
  while(i LESS count)
    math(EXPR j "${i} + 1")
    math(EXPR k "${i} + 2")
    list(GET A_EDIT ${i} edit_file)
    list(GET A_EDIT ${j} from)
    list(GET A_EDIT ${k} to)
    file(READ ${dir}/${edit_file} text)
    string(REPLACE "${from}" "${to}" edited "${text}")
    if(edited STREQUAL text)
      message(SEND_ERROR "${name}: ${pack_name}/${edit_file} has no ${from}")
      return()
    endif()
    file(WRITE ${dir}/${edit_file} "${edited}")
    math(EXPR i "${i} + 3")
  endwhile()
  execute_process(COMMAND ${TEST} ${dir} ${SCRATCH} OUTPUT_VARIABLE out ERROR_VARIABLE err RESULT_VARIABLE rc)
  set(output "${out}${err}")
  set(problems "")
  if(NOT rc EQUAL expected_rc)
    string(APPEND problems "\n  exit ${rc}, expected ${expected_rc}")
  endif()
  foreach(wanted IN LISTS A_EXPECT)
    string(FIND "${output}" "${wanted}" at)
    if(at EQUAL -1)
      string(APPEND problems "\n  missing: ${wanted}")
    endif()
  endforeach()
  foreach(unwanted IN LISTS A_REJECT)
    string(FIND "${output}" "${unwanted}" at)
    if(NOT at EQUAL -1)
      string(APPEND problems "\n  unexpected: ${unwanted}")
    endif()
  endforeach()
  if(problems STREQUAL "")
    message(STATUS "ok: ${name}")
  else()
    message(SEND_ERROR "${name}:${problems}\n  stdout: ${out}\n  stderr: ${err}")
  endif()
endfunction()

set(DIRECTIVE "# options: default\n")
set(HEADER "# category\tvalid\tsource\tterm\trule\treasons\n")

check("the fixture conforms; three files run with the pack's defaults" 0
  EXPECT "od: tests/corpus.tsv: 2/2 pass\n"
         "od: tests/cases.tsv: 2/2 pass\n"
         "od: tests/defaults.tsv: 4/4 pass with the pack's defaults\n"
         "od: tests/text.tsv: 2/2 pass with the pack's defaults\n"
         "od: tests/lookup.tsv: 2/2 pass with the pack's defaults\n"
         "od: conforms")

# Without present's rule for estan, the optional processor still reaches estar
# (estan -> están -> estar) in the file with every option on, so only the files
# with the pack's defaults fail.
check("an optional processor hides a missing rule only from a file with every option on" 1
  EDIT transforms.json
       ",\n        {\"type\": \"suffix\", \"inflected\": \"an\", \"deinflected\": \"ar\", \"conditionsIn\": [], \"conditionsOut\": [\"v\"], \"stemMinLength\": 2}"
       ""
  EXPECT "od: tests/corpus.tsv: 2/2 pass\n"
         "tests/defaults.tsv:4: estan -> estar is not among the deinflections"
         "tests/defaults.tsv:5: Trabajan -> trabajar is not among the deinflections"
         "tests/lookup.tsv:4: estan -> nothing, expected estar (estan)"
         "od: 3 failures")

# tests/defaults.tsv says so on its first line; without it the file still
# runs with the defaults, and the test fails.
check("defaults.tsv without its options line" 1
  EDIT tests/defaults.tsv "${DIRECTIVE}" ""
  EXPECT "tests/defaults.tsv runs with the pack's defaults: its first line is \"# options: default\""
         "od: tests/defaults.tsv: 4/4 pass with the pack's defaults\n"
         "od: 1 failures")

# The line turns any file to the defaults: cases.tsv then loses its rows for
# the optional features, and the coverage check its only archaic row.
check("cases.tsv with the options line" 1
  EDIT tests/cases.tsv "# Hand-written" "${DIRECTIVE}# Hand-written"
  EXPECT "tests/cases.tsv:4: estan -> están is not among the deinflections"
         "tests/cases.tsv:5: walketh -> walk is not among the deinflections"
         "od: tests/cases.tsv: 0/2 pass with the pack's defaults\n"
         "the own transform archaic has no passing valid = 1 row"
         "od: 3 failures")
check("corpus.tsv with the options line" 0
  EDIT tests/corpus.tsv "# Hand-written" "${DIRECTIVE}# Hand-written"
  EXPECT "od: tests/corpus.tsv: 2/2 pass with the pack's defaults\n"
         "od: conforms")
# Their sources are od's first and others it has, so tests/classes.json still
# lists the same corpus strings.
check("gaps.tsv and yomitan.tsv with the options line" 0
  WRITE tests/gaps.tsv "${DIRECTIVE}${HEADER}archaic\t1\twalketh\twalk\tv\tarchaic\npresent\t1\testan\testar\tv\tpresent\n"
        tests/yomitan.tsv "${DIRECTIVE}${HEADER}present\t1\testán\testar\tv\tpresent\n"
  EXPECT "od: tests/yomitan.tsv: 1/1 pass with the pack's defaults\n"
         "od: tests/gaps.tsv: 1/2 pass with the pack's defaults (gaps are reported, not enforced)\n"
         "od: conforms")
check("text.tsv without its options line" 1
  EDIT tests/text.tsv "${DIRECTIVE}" ""
  EXPECT "tests/text.tsv:4: estan -> están is a variant"
         "od: tests/text.tsv: 1/2 pass\n"
         "od: 1 failures")
check("lookup.tsv without its options line" 1
  EDIT tests/lookup.tsv "${DIRECTIVE}" ""
  EXPECT "tests/lookup.tsv:4: walketh -> walk (walketh), not expected walk (walketh)"
         "od: tests/lookup.tsv: 1/2 pass\n"
         "od: 1 failures")

# An optional postprocessor is off with the defaults too.
check("an optional postprocessor is off with the defaults" 0
  EDIT language.json "\"postprocessors\": [],"
       "\"postprocessors\": [{\"id\": \"accentLemma\", \"optional\": true, \"variants\": [[{\"map\": {\"ar\": \"ár\"}, \"at\": \"end\"}]]}],"
       tests/cases.tsv "archaic\t1\twalketh\twalk\tv\tarchaic\n" "archaic\t1\twalketh\twalk\tv\tarchaic\naccents\t1\testan\testár\t*\t*\n"
       tests/defaults.tsv "negatives\t0\twalketh\twalk\t*\t*\n" "negatives\t0\twalketh\twalk\t*\t*\nnegatives\t0\testan\testár\t*\t*\n"
  EXPECT "od: tests/cases.tsv: 3/3 pass\n"
         "od: tests/defaults.tsv: 5/5 pass with the pack's defaults\n"
         "od: conforms")

# Variant passes are optional: a lookup.tsv with the line reads no cat
# speech (a copy of the Japanese pack with a lookup.tsv and a dictionary).
check("a lookup.tsv with the options line runs no variant pass" 0
  PACK ${JA}
  WRITE tests/lookup.tsv "${DIRECTIVE}# category\tvalid\ttext\texpression\tmatched\nneko\t0\tできにゃい\tできる\tできにゃい\nplain\t1\tできない\tできる\tできない\n"
        tests/dictionary/index.json "{\"title\": \"ja-options-test\", \"revision\": \"1\", \"format\": 3}\n"
        tests/dictionary/term_bank_1.json "[[\"できる\", \"できる\", \"v1\", \"v1\", 0, [\"to be able to\"], 1, \"\"]]\n"
  EXPECT "ja: tests/lookup.tsv: 2/2 pass with the pack's defaults\n"
         "ja: conforms")

# The line is exact and first; a comment whose first word is option or
# options is an error anywhere else, so the usual misspellings never leave a
# file in the wrong mode.
check("an options line below the first line is refused" 1
  EDIT tests/defaults.tsv "${DIRECTIVE}# Hand-written for the test" "# Hand-written for the test\n${DIRECTIVE}#"
  EXPECT "tests/defaults.tsv:2: an options line is \"# options: default\", and only on the first line"
         "od: 1 failures"
  REJECT "od: tests/defaults.tsv: ")
foreach(spelling "# Options: default" "#options: default" "# options: defaults" "# options:default" "# options : default"
                 "# options: all" "#\toptions: default" "# options: default " "# option: default" "# options default"
                 "# options = default" "# OPTION - default")
  check("the misspelt options line '${spelling}' is refused" 1
    EDIT tests/lookup.tsv "${DIRECTIVE}" "${spelling}\n"
    EXPECT "tests/lookup.tsv:1: an options line is \"# options: default\", and only on the first line"
           "od: 1 failures"
    REJECT "od: tests/lookup.tsv: ")
endforeach()
# Other comments stay comments, also when they mention options.
check("a comment whose first word is not option or options is a comment" 0
  EDIT tests/defaults.tsv "# Hand-written for the test"
       "# The options of this pack are off here, as options: default above says.\n# Optional features: none here.\n# Hand-written for the test"
  EXPECT "od: tests/defaults.tsv: 4/4 pass with the pack's defaults\n"
         "od: conforms")
