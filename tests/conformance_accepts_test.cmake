# SPDX-License-Identifier: GPL-3.0-or-later
# Runs language-conformance-test on a copy of a conforming pack whose file
# EDIT has every FROM replaced by TO, and requires it to pass
# (docs/languages.md, section 12.1):
#
#   cmake -DTEST=<language-conformance-test> -DPACK=<dir> -DSCRATCH=<dir>
#         -DEDIT=<file of the pack> -DFROM=<text> -DTO=<text> -P tests/conformance_accepts_test.cmake

get_filename_component(name ${PACK} NAME)
set(copies ${SCRATCH}/conformance-accepts)
file(REMOVE_RECURSE ${copies}/${name})
file(COPY ${PACK} DESTINATION ${copies})
file(READ ${copies}/${name}/${EDIT} text)
string(REPLACE "${FROM}" "${TO}" edited "${text}")
if(edited STREQUAL text)
  message(FATAL_ERROR "${PACK}/${EDIT} has no ${FROM}")
endif()
file(WRITE ${copies}/${name}/${EDIT} "${edited}")
execute_process(COMMAND ${TEST} ${copies}/${name} ${SCRATCH} OUTPUT_VARIABLE out ERROR_VARIABLE err RESULT_VARIABLE rc)
if(NOT rc EQUAL 0)
  message(FATAL_ERROR "${PACK} with ${TO} should conform: exit ${rc}\n  stdout: ${out}\n  stderr: ${err}")
endif()
message(STATUS "conforms with ${TO}")
