# SPDX-License-Identifier: GPL-3.0-or-later
# Runs language-conformance-test on a pack that must fail for exactly one
# reason (docs/languages.md, section 12.1):
#
#   cmake -DTEST=<language-conformance-test> -DPACK=<dir> -DSCRATCH=<dir> -DREASON=<text>
#         [-DEDIT=<file of the pack> -DFROM=<text> -DTO=<text>] -P tests/conformance_refuses_test.cmake
#
# With EDIT, the test runs on a copy of the pack in SCRATCH whose file EDIT
# has every FROM replaced by TO.

if(DEFINED EDIT)
  get_filename_component(name ${PACK} NAME)
  set(copies ${SCRATCH}/conformance-refuses)
  file(REMOVE_RECURSE ${copies}/${name})
  file(COPY ${PACK} DESTINATION ${copies})
  file(READ ${copies}/${name}/${EDIT} text)
  string(REPLACE "${FROM}" "${TO}" edited "${text}")
  if(edited STREQUAL text)
    message(FATAL_ERROR "${PACK}/${EDIT} has no ${FROM}")
  endif()
  file(WRITE ${copies}/${name}/${EDIT} "${edited}")
  set(PACK ${copies}/${name})
endif()
execute_process(COMMAND ${TEST} ${PACK} ${SCRATCH} OUTPUT_VARIABLE out ERROR_VARIABLE err RESULT_VARIABLE rc)
string(FIND "${err}" "${REASON}" reported)
string(FIND "${out}" ": 1 failures" one)
if(rc EQUAL 0 OR reported EQUAL -1 OR one EQUAL -1)
  message(FATAL_ERROR "${PACK} should fail with exactly \"${REASON}\": exit ${rc}\n  stdout: ${out}\n  stderr: ${err}")
endif()
message(STATUS "refused as expected: ${REASON}")
