# SPDX-License-Identifier: GPL-3.0-or-later
# hoshidicts-cli eval-language with lookup.untaggedTerms (docs/languages.md,
# sections 4.4, 9.4 and 10.3): the untagged-terms probe pack of
# tests/fixtures/untagged-terms/ (ut) says "filter" and follows form-of
# references; copies say "pass" (up), "filter" with formOf "asTerm" (uf) and
# "pass" with "asTerm" (ua).
#
#   cmake -DCLI=<hoshidicts-cli> -DFIXTURES=<tests/fixtures/untagged-terms> -DSCRATCH=<dir> -P tests/cli_untagged_terms_test.cmake
#
# corpus.tsv: recall is 6/7 in every mode (unspoke reaches speak only through
# the dictionary's form-of row, and recall counts the rules' deinflections).
# With "filter" only walked finds its lemma first (firstRank 1/7): talk, use,
# casar, bake, the noun row of sail and the row spoke have no tags, and there
# are no false candidates. With "pass" every row does (7/7); the false
# candidates (2/7) are us, which the past rule reaches from used, and bark,
# which the untagged row bak names (both through past's first rule); casa,
# which casa-se reaches with the intermediate vf only, is none. With "pass"
# and "asTerm" the rows spoke and bak are terms: unspoke finds spoke first
# (firstRank 6/7), and us, spoke and bak are the false candidates (3/7).

set(WORK ${SCRATCH}/cli-untagged-terms)
file(REMOVE_RECURSE ${WORK})
file(COPY ${FIXTURES}/languages/ut DESTINATION ${WORK}/languages)
file(READ ${FIXTURES}/languages/ut/language.json language)

# copy(<code> <from> <to> [<from> <to>]): a copy of ut with code <code> and
# these replacements, each of which must apply.
function(copy code)
  string(REPLACE [=["code": "ut"]=] "\"code\": \"${code}\"" text "${language}")
  set(edits ${ARGN})
  while(edits)
    list(POP_FRONT edits from to)
    string(REPLACE "${from}" "${to}" edited "${text}")
    if(edited STREQUAL text)
      message(FATAL_ERROR "the untagged-terms probe pack has no ${from}")
    endif()
    set(text "${edited}")
  endwhile()
  file(MAKE_DIRECTORY ${WORK}/languages/${code})
  file(WRITE ${WORK}/languages/${code}/language.json "${text}")
  file(COPY ${FIXTURES}/languages/ut/transforms.json DESTINATION ${WORK}/languages/${code})
endfunction()
set(PASS [=["untaggedTerms": "filter"]=] [=["untaggedTerms": "pass"]=])
set(AS_TERM [=["formOf": "follow"]=] [=["formOf": "asTerm"]=])
copy(up ${PASS})
copy(uf ${AS_TERM})
copy(ua ${PASS} ${AS_TERM})

# The dictionary, zipped and imported by the CLI next to the archive.
execute_process(COMMAND ${CMAKE_COMMAND} -E tar cf ${WORK}/untagged.zip --format=zip index.json term_bank_1.json
                WORKING_DIRECTORY ${FIXTURES}/dictionary RESULT_VARIABLE rc)
if(NOT rc EQUAL 0)
  message(FATAL_ERROR "cannot zip ${FIXTURES}/dictionary")
endif()
execute_process(COMMAND ${CLI} import ${WORK}/untagged.zip OUTPUT_VARIABLE out RESULT_VARIABLE rc
                WORKING_DIRECTORY ${WORK})
if(NOT rc EQUAL 0 OR NOT out MATCHES "title: untagged")
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

set(CORPUS ${FIXTURES}/corpus.tsv)
expect("eval-language: filter"
  [=[{"rows":7,"positives":7,"negatives":0,"recall":0.8571428571428571,"negativesPassed":null,"falseCandidates":0,"firstRank":0.14285714285714285}
]=]
  eval-language ut ${CORPUS} --dictionary ${WORK}/untagged)
expect("eval-language: pass"
  [=[{"rows":7,"positives":7,"negatives":0,"recall":0.8571428571428571,"negativesPassed":null,"falseCandidates":0.2857142857142857,"firstRank":1}
]=]
  eval-language up ${CORPUS} --dictionary ${WORK}/untagged)
expect("eval-language: filter, asTerm"
  [=[{"rows":7,"positives":7,"negatives":0,"recall":0.8571428571428571,"negativesPassed":null,"falseCandidates":0,"firstRank":0.14285714285714285}
]=]
  eval-language uf ${CORPUS} --dictionary ${WORK}/untagged)
expect("eval-language: pass, asTerm"
  [=[{"rows":7,"positives":7,"negatives":0,"recall":0.8571428571428571,"negativesPassed":null,"falseCandidates":0.42857142857142855,"firstRank":0.8571428571428571}
]=]
  eval-language ua ${CORPUS} --dictionary ${WORK}/untagged)
expect("eval-language --per-rule: pass"
  [=[{"rows":7,"positives":7,"negatives":0,"recall":0.8571428571428571,"negativesPassed":null,"falseCandidates":0.2857142857142857,"firstRank":1,"perRule":[{"transform":"past","rule":0,"recovers":2,"falseCandidates":2,"breaks":0},{"transform":"past","rule":1,"recovers":2,"falseCandidates":0,"breaks":0},{"transform":"neg","rule":0,"recovers":0,"falseCandidates":0,"breaks":0},{"transform":"plural","rule":0,"recovers":1,"falseCandidates":0,"breaks":0},{"transform":"enclitic","rule":0,"recovers":1,"falseCandidates":0,"breaks":0},{"transform":"infinitive","rule":0,"recovers":1,"falseCandidates":0,"breaks":0}]}
]=]
  eval-language up ${CORPUS} --dictionary ${WORK}/untagged --per-rule)
