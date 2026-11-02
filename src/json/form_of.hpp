#pragma once
#include <string>
#include <string_view>
#include <vector>

// A form-of reference of a term bank row: a definition [formOf, [rules...]]
// (Yomitan's deinflection tuple), which Yomitan's translator follows to the
// term formOf and never displays (docs/languages.md, section 9.10).
struct FormOfReference {
  std::string form_of;
  std::vector<std::string> rules;
};

// A term record has a slot that every reader since .hoshidicts_2 skips: a
// count of entries, each [u32 length][formOf][u32 rule count] and per rule
// [u32 length][rule]. Importers before form-of support wrote count 0 for every
// row. Since then a row whose definitions hold a form-of reference gets one
// entry with no rules, whose formOf is empty when the row is only references
// (and arrays that are not references) and is `with_definitions` when it also
// has definitions that are not arrays. The references themselves stay in the
// row's glossary, as the bank wrote them.
namespace form_of_slot {
constexpr std::string_view with_definitions = "+";
}  // namespace form_of_slot
