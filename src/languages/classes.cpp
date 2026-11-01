// SPDX-License-Identifier: GPL-3.0-or-later
#include "classes.hpp"

#include <utf8proc.h>

#include <algorithm>
#include <array>
#include <mutex>

namespace hoshidicts::lang {

namespace {
constexpr char32_t max_code_point = 0x10FFFF;
constexpr char32_t surrogate_first = 0xD800;
constexpr char32_t surrogate_last = 0xDFFF;

bool is_surrogate(char32_t c) { return c >= surrogate_first && c <= surrogate_last; }

bool is_hex(char32_t c) { return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'); }

uint32_t hex_value(char32_t c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  return c - 'A' + 10;
}

bool is_name_start(char32_t c) { return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c == '_'; }
bool is_name_char(char32_t c) { return is_name_start(c) || (c >= '0' && c <= '9'); }

// The length of `{name}` at `at` in `s`, or 0 when there is none there.
size_t reference_length(std::u32string_view s, size_t at) {
  if (at >= s.size() || s[at] != '{' || at + 1 >= s.size() || !is_name_start(s[at + 1])) {
    return 0;
  }
  size_t i = at + 2;
  while (i < s.size() && is_name_char(s[i])) {
    ++i;
  }
  return i < s.size() && s[i] == '}' ? i + 1 - at : 0;
}

constexpr std::array<std::pair<std::string_view, int>, 30> two_letter_categories = {{
    {"Cn", UTF8PROC_CATEGORY_CN}, {"Lu", UTF8PROC_CATEGORY_LU}, {"Ll", UTF8PROC_CATEGORY_LL},
    {"Lt", UTF8PROC_CATEGORY_LT}, {"Lm", UTF8PROC_CATEGORY_LM}, {"Lo", UTF8PROC_CATEGORY_LO},
    {"Mn", UTF8PROC_CATEGORY_MN}, {"Mc", UTF8PROC_CATEGORY_MC}, {"Me", UTF8PROC_CATEGORY_ME},
    {"Nd", UTF8PROC_CATEGORY_ND}, {"Nl", UTF8PROC_CATEGORY_NL}, {"No", UTF8PROC_CATEGORY_NO},
    {"Pc", UTF8PROC_CATEGORY_PC}, {"Pd", UTF8PROC_CATEGORY_PD}, {"Ps", UTF8PROC_CATEGORY_PS},
    {"Pe", UTF8PROC_CATEGORY_PE}, {"Pi", UTF8PROC_CATEGORY_PI}, {"Pf", UTF8PROC_CATEGORY_PF},
    {"Po", UTF8PROC_CATEGORY_PO}, {"Sm", UTF8PROC_CATEGORY_SM}, {"Sc", UTF8PROC_CATEGORY_SC},
    {"Sk", UTF8PROC_CATEGORY_SK}, {"So", UTF8PROC_CATEGORY_SO}, {"Zs", UTF8PROC_CATEGORY_ZS},
    {"Zl", UTF8PROC_CATEGORY_ZL}, {"Zp", UTF8PROC_CATEGORY_ZP}, {"Cc", UTF8PROC_CATEGORY_CC},
    {"Cf", UTF8PROC_CATEGORY_CF}, {"Cs", UTF8PROC_CATEGORY_CS}, {"Co", UTF8PROC_CATEGORY_CO},
}};

struct CategoryTables {
  std::array<CharClass, 30> two_letter;
  std::array<CharClass, 7> one_letter;  // C L M N P S Z
};

const CategoryTables& category_tables() {
  static const CategoryTables tables = [] {
    CategoryTables t;
    std::array<std::vector<CodePointRange>, 30> ranges;
    std::array<int, 32> slot{};
    slot.fill(-1);
    for (size_t i = 0; i < two_letter_categories.size(); ++i) {
      slot[two_letter_categories[i].second] = static_cast<int>(i);
    }
    for (char32_t c = 0; c <= max_code_point; ++c) {
      if (c == surrogate_first) {
        c = surrogate_last;
        continue;
      }
      const int s = slot[utf8proc_category(static_cast<utf8proc_int32_t>(c))];
      auto& list = ranges[s];
      if (!list.empty() && list.back().last + 1 == c) {
        list.back().last = c;
      } else {
        list.push_back({c, c});
      }
    }
    for (size_t i = 0; i < ranges.size(); ++i) {
      t.two_letter[i] = CharClass(std::move(ranges[i]));
    }
    constexpr std::string_view majors = "CLMNPSZ";
    for (size_t m = 0; m < majors.size(); ++m) {
      std::vector<const CharClass*> parts;
      for (size_t i = 0; i < two_letter_categories.size(); ++i) {
        if (two_letter_categories[i].first[0] == majors[m]) {
          parts.push_back(&t.two_letter[i]);
        }
      }
      t.one_letter[m] = CharClass::unite(parts);
    }
    return t;
  }();
  return tables;
}

std::string quote_source(std::u32string_view source) {
  std::string out = "\"";
  for (char32_t c : source) {
    if (c == '"' || c == '\\') {
      out += '\\';
    }
    append_utf8(out, c);
  }
  return out + "\"";
}

struct ClassParser {
  std::u32string_view s;
  const ClassResolver& resolve;
  std::string* error;
  size_t i = 0;

  bool fail(std::string_view message, size_t offset) {
    if (error != nullptr) {
      *error = std::string(message) + " in " + quote_source(s) + " at offset " + std::to_string(offset);
    }
    return false;
  }

  struct Atom {
    enum Kind { End, Char, Category } kind;
    char32_t cp = 0;
    const CharClass* category = nullptr;
  };

  bool code_point_escape(char32_t& out) {
    // s[i] == '\\', s[i + 1] == 'u'
    const size_t at = i;
    if (i + 2 < s.size() && s[i + 2] == '{') {
      size_t end = i + 3;
      while (end < s.size() && s[end] != '}') {
        ++end;
      }
      const size_t digits = end - (i + 3);
      if (end >= s.size() || digits < 1 || digits > 6 ||
          !std::all_of(s.begin() + static_cast<std::ptrdiff_t>(i + 3), s.begin() + static_cast<std::ptrdiff_t>(end), is_hex)) {
        return fail("\\u{...} needs 1 to 6 hexadecimal digits", at);
      }
      uint32_t value = 0;
      for (size_t k = i + 3; k < end; ++k) {
        value = value * 16 + hex_value(s[k]);
      }
      if (value > max_code_point) {
        return fail("code point above U+10FFFF", at);
      }
      if (is_surrogate(value)) {
        return fail("surrogate code points are not characters", at);
      }
      out = value;
      i = end + 1;
      return true;
    }
    if (i + 6 > s.size() || !std::all_of(s.begin() + static_cast<std::ptrdiff_t>(i + 2),
                                         s.begin() + static_cast<std::ptrdiff_t>(i + 6), is_hex)) {
      return fail("\\u needs four hexadecimal digits", at);
    }
    uint32_t value = 0;
    for (size_t k = i + 2; k < i + 6; ++k) {
      value = value * 16 + hex_value(s[k]);
    }
    if (is_surrogate(value)) {
      return fail("\\u escape of a surrogate; write a character above U+FFFF as \\u{...}", at);
    }
    out = value;
    i += 6;
    return true;
  }

  bool read_atom(Atom& atom) {
    if (i >= s.size()) {
      return fail("the class is not closed with ]", i);
    }
    const size_t at = i;
    const char32_t c = s[i];
    if (c == ']') {
      atom.kind = Atom::End;
      return true;
    }
    if (c == '\\') {
      if (i + 1 >= s.size()) {
        return fail("the class ends with a lone backslash", at);
      }
      const char32_t e = s[i + 1];
      if (e == '\\' || e == ']' || e == '^' || e == '-') {
        i += 2;
        atom = {Atom::Char, e, nullptr};
        return true;
      }
      if (e == 'u') {
        char32_t value = 0;
        if (!code_point_escape(value)) {
          return false;
        }
        atom = {Atom::Char, value, nullptr};
        return true;
      }
      if (e == 'p') {
        size_t end = i + 3;
        while (end < s.size() && s[end] != '}') {
          ++end;
        }
        if (i + 2 >= s.size() || s[i + 2] != '{' || end >= s.size()) {
          return fail("\\p needs a category in braces, such as \\p{L}", at);
        }
        std::string name;
        for (size_t k = i + 3; k < end; ++k) {
          append_utf8(name, s[k]);
        }
        std::string lower = name;
        std::ranges::transform(lower, lower.begin(), [](char ch) { return static_cast<char>(std::tolower(static_cast<unsigned char>(ch))); });
        if (name.find_first_of("=:") != std::string::npos || lower == "script" || lower == "sc" || lower == "scx" ||
            lower == "script_extensions") {
          return fail("script properties such as \\p{" + name + "} are not accepted; write the ranges (section 5)", at);
        }
        const CharClass* category = general_category(name);
        if (category == nullptr) {
          return fail("\\p{" + name + "} is not a general category", at);
        }
        i = end + 1;
        atom = {Atom::Category, 0, category};
        return true;
      }
      if (e == 'P') {
        return fail("\\P{...} is not accepted; negate the whole class with [^...]", at);
      }
      return fail("this escape is not accepted in a class; only \\\\ \\] \\^ \\- \\uXXXX \\u{...} and \\p{...} are", at);
    }
    if (is_surrogate(c)) {
      return fail("a lone surrogate is not a character", at);
    }
    if (c == '-') {
      return fail("a - that is not between two characters must be written \\-", at);
    }
    if (c == '^') {
      return fail("a ^ that does not negate the class must be written \\^", at);
    }
    if (c == '}') {
      return fail("a literal } must be written \\u007D", at);
    }
    ++i;
    atom = {Atom::Char, c, nullptr};
    return true;
  }

  std::optional<CharClass> parse() {
    if (!s.empty() && s[0] == '{') {
      const size_t length = reference_length(s, 0);
      if (length == 0 || length != s.size()) {
        fail("a bare reference is {name}, with a name of letters, digits and _", 0);
        return std::nullopt;
      }
      std::string name;
      for (size_t k = 1; k + 1 < length; ++k) {
        append_utf8(name, s[k]);
      }
      const CharClass* target = resolve(name, error);
      if (target == nullptr) {
        return std::nullopt;
      }
      return *target;
    }
    if (s.empty() || s[0] != '[') {
      fail("a class is one bracket expression [...] or one reference {name}", 0);
      return std::nullopt;
    }
    i = 1;
    bool negated = false;
    if (i < s.size() && s[i] == '^') {
      negated = true;
      ++i;
    }
    std::vector<CodePointRange> ranges;
    std::vector<const CharClass*> sets;
    for (;;) {
      if (i >= s.size()) {
        fail("the class is not closed with ]", i);
        return std::nullopt;
      }
      if (s[i] == '{') {
        const size_t length = reference_length(s, i);
        if (length == 0) {
          fail("a { starts a reference {name}; write a literal { as \\u007B", i);
          return std::nullopt;
        }
        std::string name;
        for (size_t k = i + 1; k + 1 < i + length; ++k) {
          append_utf8(name, s[k]);
        }
        const CharClass* target = resolve(name, error);
        if (target == nullptr) {
          return std::nullopt;
        }
        sets.push_back(target);
        i += length;
        continue;
      }
      const size_t start = i;
      Atom atom{};
      if (!read_atom(atom)) {
        return std::nullopt;
      }
      if (atom.kind == Atom::End) {
        ++i;
        break;
      }
      if (i < s.size() && s[i] == '-' && atom.kind == Atom::Char) {
        if (i + 1 >= s.size() || s[i + 1] == ']') {
          fail("a - that is not between two characters must be written \\-", i);
          return std::nullopt;
        }
        if (s[i + 1] == '{') {
          fail("a range cannot end with a reference", i + 1);
          return std::nullopt;
        }
        ++i;
        Atom end{};
        if (!read_atom(end)) {
          return std::nullopt;
        }
        if (end.kind != Atom::Char) {
          fail("a range needs a character at both ends", start);
          return std::nullopt;
        }
        if (end.cp < atom.cp) {
          fail("the range is out of order", start);
          return std::nullopt;
        }
        ranges.push_back({atom.cp, end.cp});
        continue;
      }
      if (i < s.size() && s[i] == '-' && atom.kind == Atom::Category) {
        fail("a category cannot start a range", start);
        return std::nullopt;
      }
      if (atom.kind == Atom::Category) {
        sets.push_back(atom.category);
      } else {
        ranges.push_back({atom.cp, atom.cp});
      }
    }
    if (i != s.size()) {
      fail("a class is one bracket expression; text follows the closing ]", i);
      return std::nullopt;
    }
    CharClass own(std::move(ranges));
    sets.push_back(&own);
    CharClass result = CharClass::unite(sets);
    return negated ? result.complement() : result;
  }
};
}  // namespace

CharClass::CharClass(std::vector<CodePointRange> ranges) {
  std::ranges::sort(ranges, [](const CodePointRange& a, const CodePointRange& b) {
    return a.first != b.first ? a.first < b.first : a.last < b.last;
  });
  for (const auto& r : ranges) {
    // Without surrogates: split a range around them.
    std::array<CodePointRange, 2> pieces{};
    size_t count = 0;
    if (r.last < surrogate_first || r.first > surrogate_last) {
      pieces[count++] = r;
    } else {
      if (r.first < surrogate_first) pieces[count++] = {r.first, surrogate_first - 1};
      if (r.last > surrogate_last) pieces[count++] = {surrogate_last + 1, r.last};
    }
    for (size_t k = 0; k < count; ++k) {
      const auto& p = pieces[k];
      if (!ranges_.empty() && p.first <= ranges_.back().last + 1 &&
          !(ranges_.back().last == surrogate_first - 1 && p.first == surrogate_last + 1)) {
        ranges_.back().last = std::max(ranges_.back().last, p.last);
      } else {
        ranges_.push_back(p);
      }
    }
  }
  for (const auto& r : ranges_) {
    for (char32_t c = r.first; c <= r.last && c < 0x80; ++c) {
      ascii_[c >> 6] |= uint64_t{1} << (c & 63);
    }
  }
}

CharClass CharClass::complement() const {
  std::vector<CodePointRange> out;
  char32_t next = 0;
  for (const auto& r : ranges_) {
    if (r.first > next) {
      out.push_back({next, r.first - 1});
    }
    next = r.last + 1;
  }
  if (next <= max_code_point) {
    out.push_back({next, max_code_point});
  }
  return CharClass(std::move(out));
}

CharClass CharClass::unite(const std::vector<const CharClass*>& classes) {
  std::vector<CodePointRange> all;
  for (const CharClass* c : classes) {
    all.insert(all.end(), c->ranges_.begin(), c->ranges_.end());
  }
  return CharClass(std::move(all));
}

const CharClass* general_category(std::string_view name) {
  const auto& tables = category_tables();
  if (name.size() == 1) {
    constexpr std::string_view majors = "CLMNPSZ";
    const size_t at = majors.find(name[0]);
    return at == std::string_view::npos ? nullptr : &tables.one_letter[at];
  }
  for (size_t i = 0; i < two_letter_categories.size(); ++i) {
    if (two_letter_categories[i].first == name) {
      return &tables.two_letter[i];
    }
  }
  return nullptr;
}

std::optional<CharClass> parse_class(std::string_view source, const ClassResolver& resolve, std::string* error) {
  std::u32string decoded;
  if (!decode_utf8(source, decoded)) {
    if (error != nullptr) *error = "a class is not valid UTF-8";
    return std::nullopt;
  }
  ClassParser parser{decoded, resolve, error};
  return parser.parse();
}

std::vector<std::string> class_references(std::string_view source) {
  std::vector<std::string> names;
  ClassResolver collect = [&names](std::string_view name, std::string*) -> const CharClass* {
    static const CharClass empty;
    names.emplace_back(name);
    return &empty;
  };
  std::string error;
  if (!parse_class(source, collect, &error)) {
    return {};
  }
  return names;
}

bool is_class_name(std::string_view name) {
  if (name.empty() || !is_name_start(static_cast<unsigned char>(name[0]))) {
    return false;
  }
  return std::ranges::all_of(name, [](char c) { return is_name_char(static_cast<unsigned char>(c)); });
}

bool decode_utf8(std::string_view text, std::u32string& out) {
  out.clear();
  out.reserve(text.size());
  const auto* p = reinterpret_cast<const unsigned char*>(text.data());
  const auto* end = p + text.size();
  while (p < end) {
    const unsigned char b0 = *p;
    if (b0 < 0x80) {
      out.push_back(b0);
      ++p;
      continue;
    }
    char32_t c = 0;
    size_t n = 0;
    char32_t min = 0;
    if ((b0 & 0xE0) == 0xC0) {
      c = b0 & 0x1F;
      n = 1;
      min = 0x80;
    } else if ((b0 & 0xF0) == 0xE0) {
      c = b0 & 0x0F;
      n = 2;
      min = 0x800;
    } else if ((b0 & 0xF8) == 0xF0) {
      c = b0 & 0x07;
      n = 3;
      min = 0x10000;
    } else {
      return false;
    }
    if (static_cast<size_t>(end - p) <= n) {
      return false;
    }
    for (size_t k = 1; k <= n; ++k) {
      if ((p[k] & 0xC0) != 0x80) {
        return false;
      }
      c = (c << 6) | (p[k] & 0x3F);
    }
    if (c < min || c > max_code_point || is_surrogate(c)) {
      return false;
    }
    out.push_back(c);
    p += n + 1;
  }
  return true;
}

void append_utf8(std::string& out, char32_t c) {
  if (c < 0x80) {
    out += static_cast<char>(c);
  } else if (c < 0x800) {
    out += static_cast<char>(0xC0 | (c >> 6));
    out += static_cast<char>(0x80 | (c & 0x3F));
  } else if (c < 0x10000) {
    out += static_cast<char>(0xE0 | (c >> 12));
    out += static_cast<char>(0x80 | ((c >> 6) & 0x3F));
    out += static_cast<char>(0x80 | (c & 0x3F));
  } else {
    out += static_cast<char>(0xF0 | (c >> 18));
    out += static_cast<char>(0x80 | ((c >> 12) & 0x3F));
    out += static_cast<char>(0x80 | ((c >> 6) & 0x3F));
    out += static_cast<char>(0x80 | (c & 0x3F));
  }
}

std::string to_utf8(std::u32string_view text) {
  std::string out;
  out.reserve(text.size() * 3);
  for (char32_t c : text) {
    append_utf8(out, c);
  }
  return out;
}

}  // namespace hoshidicts::lang
