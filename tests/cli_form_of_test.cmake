# SPDX-License-Identifier: GPL-3.0-or-later
# hoshidicts-cli with form-of references (docs/languages.md, sections 9.10
# and 10.3): the form-of probe pack of tests/fixtures/form-of/ follows them,
# and a copy of it that says "asTerm" reads such a row as a term.
#
#   cmake -DCLI=<hoshidicts-cli> -DFIXTURES=<tests/fixtures/form-of> -DSCRATCH=<dir> -P tests/cli_form_of_test.cmake
#
# eval-language --dictionary: falseCandidates and firstRank follow the
# references. corpus.tsv: with "follow" the lemma is first for all seven rows,
# and the false candidates are leaf (named by the row leaves itself, so no
# rule), podar (present-yo's -ar rule), zap (named by the row of zo, which the
# dim rule reaches, so dim), and for fué ir (the chain fué -> fue -> ir, no
# rule) and fuera (voseo, then fuer's reference, and the chain fué -> fue ->
# fuer -> fuera, so no rule every path uses); with "asTerm" the row is
# first for five rows (firstRank 2/7), and podar, the row zo and the row fuer
# are the false candidates. Recall counts rules only, and no rule reaches ser
# from fué (6/7). lookup prints the dictionary's rule as the trace.

set(WORK ${SCRATCH}/cli-form-of)
file(REMOVE_RECURSE ${WORK})
file(MAKE_DIRECTORY ${WORK}/languages/fa)
file(COPY ${FIXTURES}/languages/fo DESTINATION ${WORK}/languages)
file(READ ${FIXTURES}/languages/fo/language.json language)
string(REPLACE [=["code": "fo"]=] [=["code": "fa"]=] as_term "${language}")
string(REPLACE [=["formOf": "follow"]=] [=["formOf": "asTerm"]=] as_term "${as_term}")
if(as_term STREQUAL language)
  message(FATAL_ERROR "the form-of probe pack has no formOf to replace")
endif()
file(WRITE ${WORK}/languages/fa/language.json "${as_term}")
file(COPY ${FIXTURES}/languages/fo/transforms.json DESTINATION ${WORK}/languages/fa)

# The dictionary, zipped and imported by the CLI next to the archive.
execute_process(COMMAND ${CMAKE_COMMAND} -E tar cf ${WORK}/forms.zip --format=zip
                        index.json term_bank_1.json term_meta_bank_1.json
                WORKING_DIRECTORY ${FIXTURES}/forms RESULT_VARIABLE rc)
if(NOT rc EQUAL 0)
  message(FATAL_ERROR "cannot zip ${FIXTURES}/forms")
endif()
execute_process(COMMAND ${CLI} import ${WORK}/forms.zip OUTPUT_VARIABLE out RESULT_VARIABLE rc)
if(NOT rc EQUAL 0 OR NOT out MATCHES "title: forms")
  message(FATAL_ERROR "import: exit ${rc}\n${out}")
endif()

# expect(<name> <stdout> <arguments>...): exit 0 and exactly this output.
function(expect name expected_out)
  execute_process(COMMAND ${CLI} --languages ${WORK}/languages ${ARGN}
                  OUTPUT_VARIABLE out ERROR_VARIABLE err RESULT_VARIABLE rc)
  if(NOT rc EQUAL 0 OR NOT out STREQUAL expected_out)
    message(SEND_ERROR "${name}: exit ${rc}\n  stdout:   ${out}\n  expected: ${expected_out}\n  stderr: ${err}")
  else()
    message(STATUS "ok: ${name}")
  endif()
endfunction()

# expect_text(<name> <a part of stdout> <arguments>...): exit 0 and the text.
function(expect_text name text)
  execute_process(COMMAND ${CLI} --languages ${WORK}/languages ${ARGN}
                  OUTPUT_VARIABLE out ERROR_VARIABLE err RESULT_VARIABLE rc)
  string(FIND "${out}" "${text}" at)
  if(NOT rc EQUAL 0 OR at EQUAL -1)
    message(SEND_ERROR "${name}: exit ${rc}; the output lacks\n  ${text}\n  stdout: ${out}\n  stderr: ${err}")
  else()
    message(STATUS "ok: ${name}")
  endif()
endfunction()

set(CORPUS ${FIXTURES}/corpus.tsv)
expect("eval-language: follow"
  [=[{"rows":7,"positives":7,"negatives":0,"recall":0.8571428571428571,"negativesPassed":null,"falseCandidates":0.7142857142857143,"firstRank":1}
]=]
  eval-language fo ${CORPUS} --dictionary ${WORK}/forms)
expect("eval-language: asTerm"
  [=[{"rows":7,"positives":7,"negatives":0,"recall":0.8571428571428571,"negativesPassed":null,"falseCandidates":0.42857142857142855,"firstRank":0.2857142857142857}
]=]
  eval-language fa ${CORPUS} --dictionary ${WORK}/forms)
expect("eval-language --per-rule: follow"
  [=[{"rows":7,"positives":7,"negatives":0,"recall":0.8571428571428571,"negativesPassed":null,"falseCandidates":0.7142857142857143,"firstRank":1,"perRule":[{"transform":"past","rule":0,"recovers":3,"falseCandidates":0,"breaks":0},{"transform":"neg","rule":0,"recovers":1,"falseCandidates":0,"breaks":0},{"transform":"present-yo","rule":0,"recovers":0,"falseCandidates":1,"breaks":0},{"transform":"present-yo","rule":1,"recovers":1,"falseCandidates":0,"breaks":0},{"transform":"dim","rule":0,"recovers":0,"falseCandidates":1,"breaks":0},{"transform":"tie","rule":0,"recovers":0,"falseCandidates":0,"breaks":0},{"transform":"tie","rule":1,"recovers":0,"falseCandidates":0,"breaks":0},{"transform":"tie","rule":2,"recovers":0,"falseCandidates":0,"breaks":0},{"transform":"tie","rule":3,"recovers":0,"falseCandidates":0,"breaks":0},{"transform":"tie2","rule":0,"recovers":0,"falseCandidates":0,"breaks":0},{"transform":"tie2","rule":1,"recovers":0,"falseCandidates":0,"breaks":0},{"transform":"plural","rule":0,"recovers":2,"falseCandidates":0,"breaks":0},{"transform":"voseo","rule":0,"recovers":0,"falseCandidates":0,"breaks":0}]}
]=]
  eval-language fo ${CORPUS} --dictionary ${WORK}/forms --per-rule)

expect_text("lookup: the dictionary's rule is the trace" "unwalked\n  negative past\nwalk walk\n"
  lookup --language fo ${WORK}/forms unwalked)
expect_text("lookup: asTerm shows the row" "1 results\n" lookup --language fa ${WORK}/forms gone)
expect_text("lookup: follow drops a row whose lemma is missing" "0 results\n" lookup --language fo ${WORK}/forms gone)

file(REMOVE_RECURSE ${WORK})
