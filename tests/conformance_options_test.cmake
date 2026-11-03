# SPDX-License-Identifier: GPL-3.0-or-later
# The options line of docs/languages.md section 12.2 in the conformance test,
# on the od fixture and on edited copies of it:
#
#   cmake -DTEST=<language-conformance-test> -DPACK=<tests/fixtures/conformance/od> -DSCRATCH=<dir>
#         -P tests/conformance_options_test.cmake
#
# od's tests/cases.tsv, text.tsv and lookup.tsv start with `# options: default`
# and run with the pack's defaults; tests/corpus.tsv runs with every optional
# processor and transform on. Each case copies the pack, replaces FROM by TO
# in the files it names (EDIT <file> <from> <to>, repeated), runs the test and
# checks its exit status, the texts its output must have (EXPECT) and those
# it must not (REJECT).

# An empty TO is a list element of its own.
cmake_policy(SET CMP0007 NEW)

get_filename_component(PACK_NAME ${PACK} NAME)
set(COPY ${SCRATCH}/conformance-options)

function(check name expected_rc)
  cmake_parse_arguments(PARSE_ARGV 2 A "" "" "EDIT;EXPECT;REJECT")
  file(REMOVE_RECURSE ${COPY})
  file(COPY ${PACK} DESTINATION ${COPY})
  set(dir ${COPY}/${PACK_NAME})
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
      message(SEND_ERROR "${name}: ${PACK_NAME}/${edit_file} has no ${from}")
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

check("the fixture conforms; three files run with the pack's defaults" 0
  EXPECT "od: tests/corpus.tsv: 3/3 pass\n"
         "od: tests/cases.tsv: 3/3 pass with the pack's defaults\n"
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
  EXPECT "od: tests/corpus.tsv: 3/3 pass\n"
         "tests/cases.tsv:4: estan -> estar is not among the deinflections"
         "tests/lookup.tsv:4: estan -> nothing, expected estar (estan)"
         "od: 2 failures")

# Without the options line, each file runs with every option on, and its
# negatives fail: the processor gives están, the optional transform walk.
check("cases.tsv without its options line" 1
  EDIT tests/cases.tsv "${DIRECTIVE}" ""
  EXPECT "tests/cases.tsv:4: estan -> están is among the deinflections"
         "tests/cases.tsv:5: walketh -> walk is among the deinflections"
         "od: tests/cases.tsv: 1/3 pass\n"
         "od: 2 failures")
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

# The line is exact and first; anything that starts like it elsewhere is an
# error, so a file never runs in a mode its author did not write.
check("an options line below the first line is refused" 1
  EDIT tests/cases.tsv "${DIRECTIVE}# Hand-written for the test." "# Hand-written for the test.\n${DIRECTIVE}#"
  EXPECT "tests/cases.tsv:2: an options line is \"# options: default\", and only on the first line"
         "od: 1 failures"
  REJECT "od: tests/cases.tsv: ")
foreach(spelling "# Options: default" "#options: default" "# options: defaults" "# options:default" "# options : default"
                 "# options: all" "#\toptions: default")
  check("the misspelt options line ${spelling} is refused" 1
    EDIT tests/lookup.tsv "${DIRECTIVE}" "${spelling}\n"
    EXPECT "tests/lookup.tsv:1: an options line is \"# options: default\", and only on the first line"
           "od: 1 failures"
    REJECT "od: tests/lookup.tsv: ")
endforeach()
# Other comments stay comments, also when they mention options.
check("a comment that does not start like the options line is a comment" 0
  EDIT tests/cases.tsv "# Hand-written for the test." "# Options of this pack are off here, as options: default above says.\n# Hand-written for the test."
  EXPECT "od: tests/cases.tsv: 3/3 pass with the pack's defaults\n"
         "od: conforms")
