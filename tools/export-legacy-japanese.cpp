// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/ja/transforms.json from the Japanese deinflector of 35e2dab,
// which tests/reference keeps (docs/languages.md, section 11.1):
//
//   export-legacy-japanese <path/to/languages/ja/transforms.json>
//
// It builds that deinflector and writes its groups as transforms (id = name),
// its conditions in the bit order of its Conditions enum, and its rules in the
// order Deinflector::add_rule received them, with add_irregular's generated
// rules written out. The neko speech group is not a transform: it becomes the
// Japanese pack's variant pass nekoSpeech (section 11.4).
//
// The rules sit in a trie, which keeps their order within one ending but not
// across endings. add_rule's first statement measures rule.from with
// utf8::distance, so the exact-match overload below, which wins over utfcpp's
// template, records the endings in call order while the deinflector is built;
// the k-th time an ending is recorded is the k-th rule in its trie node. The
// private members are read through explicit instantiations, which may name
// them ([temp.spec.general]/6).
//
// The rules and descriptions are Yomitan's (GPL-3.0-or-later, Copyright (C)
// 2024-2026 Yomitan Authors), as the header of tests/reference/legacy_deinflector.cpp
// says; languages/ja/README.md carries the attribution.

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

#include <utf8.h>

namespace export_legacy {
// Every string utf8::distance measured while recording, in call order.
std::vector<std::string>* recorded = nullptr;
}  // namespace export_legacy

namespace utf8 {
std::ptrdiff_t distance(std::string::const_iterator first, std::string::const_iterator last) {
  if (export_legacy::recorded != nullptr) {
    export_legacy::recorded->emplace_back(first, last);
  }
  return utf8::distance<std::string::const_iterator>(first, last);
}
}  // namespace utf8

#include "../tests/reference/legacy_deinflector.cpp"

#include <algorithm>
#include <bit>
#include <cstdio>
#include <fstream>
#include <map>
#include <set>
#include <stdexcept>
#include <string_view>
#include <tuple>

namespace export_legacy {

template <auto Member, typename Tag>
struct Expose {
  friend constexpr auto member(Tag) { return Member; }
};
struct GroupsTag {
  friend constexpr auto member(GroupsTag);
};
struct RuleListsTag {
  friend constexpr auto member(RuleListsTag);
};
struct NekoGroupTag {
  friend constexpr auto member(NekoGroupTag);
};

template struct Expose<&hoshidicts_legacy::Deinflector::groups_, GroupsTag>;
template struct Expose<&hoshidicts_legacy::Deinflector::rule_lists_, RuleListsTag>;
template struct Expose<&hoshidicts_legacy::Deinflector::neko_group_, NekoGroupTag>;

struct Condition {
  std::string_view key;
  std::string_view name;
  bool dictionary_form;
  std::string_view i18n_ja;  // Yomitan's Japanese name, or empty
  std::vector<std::string_view> sub_conditions;
};

// The Conditions enum of tests/reference/deinflector.hpp: its 18 flags in bit
// order (V1D = bit 0 ... YA = bit 17), then its unions V1, V5S, V5 and V. Keys,
// names and Japanese names are Yomitan's for the same conditions
// (ext/js/language/ja/japanese-transforms.js at d3c54c1). isDictionaryForm is
// true for the six tags Deinflector::pos_to_conditions maps.
const std::vector<Condition>& conditions() {
  static const std::vector<Condition> table = {
      {"v1d", "Ichidan verb, dictionary form", false, "一段動詞、終止形", {}},
      {"v1p", "Ichidan verb, progressive or perfect form", false, "一段動詞、～てる・でる", {}},
      {"v5d", "Godan verb, dictionary form", false, "五段動詞、終止形", {}},
      {"v5ss", "Godan verb, short causative form having さす ending (cannot conjugate with passive form)", false,
       "五段動詞、～さす", {}},
      {"v5sp", "Godan verb, short causative form not having さす ending (can conjugate with passive form)", false,
       "五段動詞、～す", {}},
      {"vk", "Kuru verb", true, "来る動詞", {}},
      {"vs", "Suru verb", true, "する動詞", {}},
      {"vz", "Zuru verb", true, "ずる動詞", {}},
      {"adj-i", "Adjective with i ending", true, "形容詞", {}},
      {"-ます", "Polite -ます ending", false, "", {}},
      {"-ません", "Polite negative -ません ending", false, "", {}},
      {"-て", "Intermediate -て endings for progressive or perfect tense", false, "", {}},
      {"-ば", "Intermediate -ば endings for conditional contraction", false, "", {}},
      {"-く", "Intermediate -く endings for adverbs", false, "", {}},
      {"-た", "-た form ending", false, "", {}},
      {"-ん", "-ん negative ending", false, "", {}},
      {"-なさい", "Intermediate -なさい ending (polite imperative)", false, "", {}},
      {"-ゃ", "Intermediate -や ending (conditional contraction)", false, "", {}},
      {"v1", "Ichidan verb", true, "一段動詞", {"v1d", "v1p"}},
      {"v5s", "Godan verb, short causative form", false, "五段動詞、～す・さす", {"v5ss", "v5sp"}},
      {"v5", "Godan verb", true, "五段動詞", {"v5d", "v5s"}},
      {"v", "Verb", false, "動詞", {"v1", "v5", "vk", "vs", "vz"}},
  };
  return table;
}

// The bits each condition stands for, allocated as docs/languages.md 7.1 says:
// one bit per condition without subConditions, in file order.
std::map<std::string_view, uint32_t> condition_bits() {
  std::map<std::string_view, uint32_t> bits;
  uint32_t next = 0;
  for (const auto& condition : conditions()) {
    if (condition.sub_conditions.empty()) {
      bits[condition.key] = 1u << next++;
    }
  }
  for (const auto& condition : conditions()) {
    if (!condition.sub_conditions.empty()) {
      uint32_t union_bits = 0;
      for (auto sub : condition.sub_conditions) {
        union_bits |= bits.at(sub);
      }
      bits[condition.key] = union_bits;
    }
  }
  return bits;
}

// The names whose union is `mask`: the widest conditions that fit first, then
// listed in declaration order.
std::vector<std::string_view> condition_names(uint32_t mask) {
  const auto bits = condition_bits();
  std::vector<std::pair<int, size_t>> candidates;
  for (size_t i = 0; i < conditions().size(); ++i) {
    candidates.emplace_back(-std::popcount(bits.at(conditions()[i].key)), i);
  }
  std::ranges::sort(candidates);
  std::set<size_t> picked;
  uint32_t remaining = mask;
  for (const auto& [_, i] : candidates) {
    const uint32_t b = bits.at(conditions()[i].key);
    if ((b & ~mask) == 0 && (b & remaining) != 0) {
      picked.insert(i);
      remaining &= ~b;
    }
  }
  if (remaining != 0) {
    throw std::runtime_error("condition mask has bits no condition names: " + std::to_string(mask));
  }
  std::vector<std::string_view> names;
  for (size_t i : picked) {
    names.push_back(conditions()[i].key);
  }
  return names;
}

// The 18 hoshidicts auxiliary groups Yomitan lacks (docs/languages.md 11.2):
// every group of 35e2dab that is not a transform of Yomitan's Japanese
// descriptor at d3c54c1.
bool own_group(std::string_view name) {
  static const std::set<std::string_view> own = {
      "-ましゅ", "-ください", "-くださる", "-ごらん", "-ごらんなさい", "-いただく", "-あげる", "-くれる", "-もらう",
      "-やる",   "-さしあげる", "-みる",   "-みせる", "-ある",       "-いく",     "-くる",   "-なさそう", "-ながら",
  };
  return own.contains(name);
}

// Rules of Yomitan transforms that Yomitan's descriptor at d3c54c1 lacks, by
// transform, ending and replacement; they carry their own `source`.
bool own_rule(std::string_view group, std::string_view from, std::string_view to) {
  static const std::set<std::tuple<std::string_view, std::string_view, std::string_view>> own = {
      {"imperative", "ませ", "ます"},
      {"imperative", "くれ", "くれる"},
  };
  return own.contains({group, from, to});
}

std::string quote(std::string_view text) {
  std::string out = "\"";
  for (unsigned char c : text) {
    switch (c) {
      case '"':
        out += "\\\"";
        break;
      case '\\':
        out += "\\\\";
        break;
      case '\n':
        out += "\\n";
        break;
      case '\r':
        out += "\\r";
        break;
      case '\t':
        out += "\\t";
        break;
      case '\b':
        out += "\\b";
        break;
      case '\f':
        out += "\\f";
        break;
      default:
        if (c < 0x20) {
          char buf[8];
          std::snprintf(buf, sizeof(buf), "\\u%04X", c);
          out += buf;
        } else {
          out += static_cast<char>(c);
        }
    }
  }
  return out + "\"";
}

std::string names_array(const std::vector<std::string_view>& names) {
  std::string out = "[";
  for (size_t i = 0; i < names.size(); ++i) {
    out += (i ? ", " : "") + quote(names[i]);
  }
  return out + "]";
}

}  // namespace export_legacy

int main(int argc, char** argv) {
  using namespace export_legacy;
  if (argc != 2) {
    std::fprintf(stderr, "usage: %s <path/to/languages/ja/transforms.json>\n", argv[0]);
    return 2;
  }
  try {
    std::vector<std::string> order;
    recorded = &order;
    const hoshidicts_legacy::Deinflector deinflector;
    recorded = nullptr;

    const auto& groups = deinflector.*member(GroupsTag{});
    const auto& rule_lists = deinflector.*member(RuleListsTag{});
    const int neko_group = deinflector.*member(NekoGroupTag{});

    // Every rule of a trie node has the node's ending.
    std::map<std::string, size_t> list_of_ending;
    size_t rule_total = 0;
    for (size_t i = 0; i < rule_lists.size(); ++i) {
      rule_total += rule_lists[i].size();
      for (const auto& rule : rule_lists[i]) {
        if (rule.from != rule_lists[i].front().from) {
          throw std::runtime_error("a trie node holds two endings");
        }
      }
      if (!list_of_ending.emplace(rule_lists[i].front().from, i).second) {
        throw std::runtime_error("an ending has two trie nodes");
      }
    }
    if (order.size() != rule_total) {
      throw std::runtime_error("recorded " + std::to_string(order.size()) + " add_rule calls for " +
                               std::to_string(rule_total) + " rules");
    }

    // The rules in add_rule order.
    using Rule = std::decay_t<decltype(rule_lists[0][0])>;
    std::vector<const Rule*> rules;
    std::vector<size_t> taken(rule_lists.size(), 0);
    for (const auto& ending : order) {
      const auto it = list_of_ending.find(ending);
      if (it == list_of_ending.end() || taken[it->second] >= rule_lists[it->second].size()) {
        throw std::runtime_error("a recorded ending has no rule left: " + ending);
      }
      rules.push_back(&rule_lists[it->second][taken[it->second]++]);
    }

    // Each group's rules were added together, after the group, in group order,
    // so writing them under their transforms keeps the add_rule order.
    for (size_t i = 0; i < rules.size(); ++i) {
      const Rule& rule = *rules[i];
      if (rule.from.empty()) {
        throw std::runtime_error("a rule with an empty ending");
      }
      if (rule.group_id == neko_group || rule.group_id < 0 || static_cast<size_t>(rule.group_id) >= groups.size()) {
        throw std::runtime_error("a rule outside the transforms: " + rule.from);
      }
      if (i > 0 && rule.group_id < rules[i - 1]->group_id) {
        throw std::runtime_error("rules of group " + groups[rule.group_id].name + " are not contiguous");
      }
    }
    if (neko_group != static_cast<int>(groups.size()) - 1) {
      throw std::runtime_error("the neko speech group is not the last group");
    }

    // The table above against the deinflector: pos_to_conditions gives the
    // dictionary forms' bits, and no rule uses a bit the table lacks.
    const auto bits = condition_bits();
    for (const auto& condition : conditions()) {
      if (condition.dictionary_form &&
          hoshidicts_legacy::Deinflector::pos_to_conditions({std::string(condition.key)}) != bits.at(condition.key)) {
        throw std::runtime_error("condition bits differ from pos_to_conditions: " + std::string(condition.key));
      }
    }
    uint32_t all_bits = 0;
    for (const auto& [_, b] : bits) {
      all_bits |= b;
    }
    for (const Rule* rule : rules) {
      if ((rule->conditions_in | rule->conditions_out) & ~all_bits) {
        throw std::runtime_error("a rule uses an unknown condition bit: " + rule->from);
      }
    }

    std::string out;
    out += "{\n  \"schema\": 1,\n  \"conditions\": {\n";
    for (size_t i = 0; i < conditions().size(); ++i) {
      const auto& c = conditions()[i];
      out += "    " + quote(c.key) + ": {\n";
      out += "      \"name\": " + quote(c.name) + ",\n";
      out += std::string("      \"isDictionaryForm\": ") + (c.dictionary_form ? "true" : "false");
      if (!c.sub_conditions.empty()) {
        out += ",\n      \"subConditions\": " + names_array(c.sub_conditions);
      }
      if (!c.i18n_ja.empty()) {
        out += ",\n      \"i18n\": [\n        {\n          \"language\": \"ja\",\n          \"name\": " + quote(c.i18n_ja) +
               "\n        }\n      ]";
      }
      out += std::string("\n    }") + (i + 1 < conditions().size() ? "," : "") + "\n";
    }
    out += "  },\n  \"transforms\": [\n";
    size_t written_groups = 0;
    size_t written_rules = 0;
    for (size_t g = 0; g < groups.size(); ++g) {
      if (static_cast<int>(g) == neko_group) {
        continue;
      }
      const auto& group = groups[g];
      out += written_groups ? ",\n" : "";
      out += "    {\n";
      out += "      \"id\": " + quote(group.name) + ",\n";
      out += "      \"name\": " + quote(group.name) + ",\n";
      out += "      \"description\": " + quote(group.description) + ",\n";
      out += std::string("      \"source\": ") + (own_group(group.name) ? "\"own\"" : "\"yomitan\"") + ",\n";
      out += "      \"rules\": [";
      bool first = true;
      for (const Rule* rule : rules) {
        if (rule->group_id != static_cast<int>(g)) {
          continue;
        }
        out += first ? "\n" : ",\n";
        first = false;
        out += std::string("        {\"type\": ") + (rule->whole_word ? "\"wholeWord\"" : "\"suffix\"") +
               ", \"inflected\": " + quote(rule->from) + ", \"deinflected\": " + quote(rule->to) +
               ", \"conditionsIn\": " + names_array(condition_names(rule->conditions_in)) +
               ", \"conditionsOut\": " + names_array(condition_names(rule->conditions_out)) +
               (!own_group(group.name) && own_rule(group.name, rule->from, rule->to) ? ", \"source\": \"own\"" : "") +
               "}";
        ++written_rules;
      }
      out += first ? "]\n" : "\n      ]\n";
      out += "    }";
      ++written_groups;
    }
    out += "\n  ]\n}\n";
    if (written_rules != rules.size()) {
      throw std::runtime_error("not every rule was written");
    }

    std::ofstream file(argv[1], std::ios::binary);
    file << out;
    if (!file) {
      throw std::runtime_error(std::string("cannot write ") + argv[1]);
    }
    std::printf("wrote %zu transforms and %zu rules to %s\n", written_groups, written_rules, argv[1]);
    return 0;
  } catch (const std::exception& error) {
    std::fprintf(stderr, "export-legacy-japanese: %s\n", error.what());
    return 1;
  }
}
