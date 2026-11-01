// SPDX-License-Identifier: GPL-3.0-or-later
#include "regex.hpp"

#include <cstdio>
#include <locale>
#include <optional>
#include <stdexcept>

namespace hoshidicts::lang {

namespace {

bool is_surrogate_unit(char16_t c) { return c >= 0xD800 && c <= 0xDFFF; }
bool is_digit(char16_t c) { return c >= '0' && c <= '9'; }
bool is_hex_unit(char16_t c) { return is_digit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'); }
bool is_name_start(char16_t c) { return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c == '_'; }
bool is_name_char(char16_t c) { return is_name_start(c) || is_digit(c); }

std::u16string to_u16(std::string_view utf8, bool* ok) {
  std::u32string cps;
  *ok = decode_utf8(utf8, cps);
  std::u16string out;
  out.reserve(cps.size());
  for (char32_t c : cps) {
    if (c > 0xFFFF) {
      c -= 0x10000;
      out.push_back(static_cast<char16_t>(0xD800 + (c >> 10)));
      out.push_back(static_cast<char16_t>(0xDC00 + (c & 0x3FF)));
    } else {
      out.push_back(static_cast<char16_t>(c));
    }
  }
  return out;
}

std::string u16_to_utf8(std::u16string_view s) {
  std::string out;
  for (size_t i = 0; i < s.size(); ++i) {
    char32_t c = s[i];
    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.size() && s[i + 1] >= 0xDC00 && s[i + 1] <= 0xDFFF) {
      c = 0x10000 + ((c - 0xD800) << 10) + (s[i + 1] - 0xDC00);
      ++i;
    } else if (is_surrogate_unit(static_cast<char16_t>(c))) {
      c = 0xFFFD;
    }
    append_utf8(out, c);
  }
  return out;
}

// The code point at `i` as JavaScript's codePointAt gives it.
char32_t code_point_at(std::u16string_view s, size_t i) {
  const char16_t c = s[i];
  if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.size() && s[i + 1] >= 0xDC00 && s[i + 1] <= 0xDFFF) {
    return 0x10000 + ((c - 0xD800) << 10) + (s[i + 1] - 0xDC00);
  }
  return c;
}

size_t reference_length(std::u16string_view s, size_t at) {
  if (at >= s.size() || s[at] != '{' || at + 1 >= s.size() || !is_name_start(s[at + 1])) {
    return 0;
  }
  size_t i = at + 2;
  while (i < s.size() && is_name_char(s[i])) {
    ++i;
  }
  return i < s.size() && s[i] == '}' ? i + 1 - at : 0;
}

// The length of a `{m}`, `{m,}` or `{m,n}` quantifier at `at`, with its
// numbers, or 0.
struct Braces {
  size_t length = 0;
  bool comma = false;
  std::optional<unsigned long> min;
  std::optional<unsigned long> max;  // absent for {m} and {m,}
};

Braces braces_at(std::u16string_view s, size_t at) {
  Braces b;
  if (at >= s.size() || s[at] != '{') return b;
  size_t i = at + 1;
  unsigned long value = 0;
  size_t digits = 0;
  while (i < s.size() && is_digit(s[i])) {
    value = std::min<unsigned long>(value * 10 + (s[i] - '0'), 1000000000UL);
    ++i;
    ++digits;
  }
  if (digits == 0) return b;
  b.min = value;
  if (i < s.size() && s[i] == ',') {
    b.comma = true;
    ++i;
    unsigned long max = 0;
    size_t max_digits = 0;
    while (i < s.size() && is_digit(s[i])) {
      max = std::min<unsigned long>(max * 10 + (s[i] - '0'), 1000000000UL);
      ++i;
      ++max_digits;
    }
    if (max_digits > 0) b.max = max;
  }
  if (i >= s.size() || s[i] != '}') return {};
  b.length = i + 1 - at;
  return b;
}

constexpr std::u16string_view pattern_syntax = u"^$\\.*+?()[]{}|/";

struct Reference {
  std::string name;
  size_t start;
  size_t end;
  bool in_class;
};

// A port of parsePattern in tools/lib/classes.mjs, on UTF-16 code units.
struct DialectParser {
  std::u16string_view p;
  std::string* error;
  size_t i = 0;
  int groups = 0;
  std::vector<bool> closed = std::vector<bool>(10, false);
  std::vector<Reference> references;
  std::vector<size_t> dots;  // positions of `.` outside classes
  bool failed = false;

  void fail(std::string_view message, std::optional<size_t> offset = std::nullopt) {
    if (failed) return;
    failed = true;
    if (error != nullptr) {
      *error = std::string(message) + " in \"" + u16_to_utf8(p) + "\" at offset " + std::to_string(offset.value_or(i));
    }
  }

  char16_t at(size_t k) const { return k < p.size() ? p[k] : char16_t{0}; }
  bool has(size_t k) const { return k < p.size(); }
  bool starts_with(std::u16string_view text) const { return p.substr(i).starts_with(text); }

  size_t quantifier_at(size_t k) const {
    if (!has(k)) return 0;
    const char16_t c = p[k];
    if (c == '*' || c == '+' || c == '?') return 1;
    if (c == '{') return braces_at(p, k).length;
    return 0;
  }

  void parse_quantifier(bool can_repeat) {
    const size_t length = quantifier_at(i);
    if (length == 0) return;
    if (!can_repeat) {
      fail("nothing to repeat: assertions and lookaheads take no quantifier");
      return;
    }
    if (p[i] == '{') {
      const Braces b = braces_at(p, i);
      if (*b.min > 65535 || (b.max && *b.max > 65535)) {
        fail("a quantifier above 65535 is not in the pattern dialect");
        return;
      }
      if (b.comma && b.max && *b.max < *b.min) {
        fail("the quantifier {m,n} needs m <= n");
        return;
      }
    }
    i += length;
    if (at(i) == '?' && has(i)) ++i;
    if (quantifier_at(i) != 0) fail("nothing to repeat");
  }

  // Returns the atom's code point, or -1 at the closing bracket, or -2 on failure.
  long read_class_atom(size_t start) {
    const size_t here = i;
    if (!has(i)) {
      fail("the class is not closed with ]", start);
      return -2;
    }
    const char16_t c = p[i];
    if (c == ']') return -1;
    if (c == '[') {
      if (has(i + 1) && (p[i + 1] == ':' || p[i + 1] == '.' || p[i + 1] == '=')) {
        fail("POSIX brackets such as [[:alpha:]] are not in the pattern dialect");
      } else {
        fail("a [ inside a class must be written \\[");
      }
      return -2;
    }
    if (c == '\\') {
      if (!has(i + 1)) {
        fail("the pattern ends with a lone backslash");
        return -2;
      }
      const char16_t e = p[i + 1];
      if (e == '\\' || e == ']' || e == '^' || e == '-' || e == '[') {
        i += 2;
        return e;
      }
      if (e == 'u') {
        if (at(i + 2) == '{' && has(i + 2)) {
          fail("\\u{...} is not in the pattern dialect; write \\uXXXX (classes in patterns stop at U+FFFF)", i);
          return -2;
        }
        if (i + 6 > p.size() || !is_hex_unit(p[i + 2]) || !is_hex_unit(p[i + 3]) || !is_hex_unit(p[i + 4]) ||
            !is_hex_unit(p[i + 5])) {
          fail("\\u needs four hexadecimal digits", i);
          return -2;
        }
        unsigned value = 0;
        for (size_t k = i + 2; k < i + 6; ++k) {
          const char16_t h = p[k];
          value = value * 16 + (is_digit(h) ? h - '0' : (h | 0x20) - 'a' + 10);
        }
        if (value >= 0xD800 && value <= 0xDFFF) {
          fail("\\u escape of a surrogate; write a character above U+FFFF as a literal outside classes", i);
          return -2;
        }
        i += 6;
        return static_cast<long>(value);
      }
      if (e == 'p' || e == 'P') {
        fail("\\p{...} is not in the pattern dialect; reference a class with {name}");
        return -2;
      }
      if (std::u16string_view(u"sSwWbBdD").find(e) != std::u16string_view::npos) {
        fail("shorthand classes such as \\w are not in the pattern dialect; write the characters as a class");
        return -2;
      }
      fail("this escape is not in the pattern dialect");
      return -2;
    }
    const char32_t cp = code_point_at(p, i);
    if (cp > 0xFFFF) {
      fail("classes in a pattern may only contain code points up to U+FFFF", here);
      return -2;
    }
    if (is_surrogate_unit(static_cast<char16_t>(cp))) {
      fail("a lone surrogate is not a character", here);
      return -2;
    }
    if (c == '-') {
      fail("a - that is not between two characters must be written \\-");
      return -2;
    }
    if (c == '^') {
      fail("a ^ that does not negate the class must be written \\^");
      return -2;
    }
    ++i;
    return static_cast<long>(cp);
  }

  void parse_class() {
    const size_t start = i;
    ++i;
    if (at(i) == '^' && has(i)) ++i;
    size_t count = 0;
    for (;;) {
      if (failed) return;
      if (at(i) == '{' && has(i)) {
        const size_t length = reference_length(p, i);
        if (length == 0) {
          fail("a { inside a class starts a reference {name}; write a literal { as \\u007B");
          return;
        }
        references.push_back({u16_to_utf8(p.substr(i + 1, length - 2)), i, i + length, true});
        i += length;
        ++count;
        continue;
      }
      const size_t item_start = i;
      const long first = read_class_atom(start);
      if (first == -2) return;
      if (first == -1) {
        ++i;
        break;
      }
      ++count;
      if (at(i) == '-' && has(i)) {
        if (!has(i + 1) || p[i + 1] == ']') {
          fail("a - that is not between two characters must be written \\-");
          return;
        }
        if (p[i + 1] == '{') {
          fail("a range cannot end with a reference", i + 1);
          return;
        }
        ++i;
        const long last = read_class_atom(start);
        if (last == -2) return;
        if (last == -1) {
          fail("a range needs a character at both ends", item_start);
          return;
        }
        if (last < first) {
          fail("the range is out of order", item_start);
          return;
        }
      }
    }
    if (count == 0) fail("an empty class [] or [^] is not in the pattern dialect", start);
  }

  void parse_escape() {
    if (!has(i + 1)) {
      fail("the pattern ends with a lone backslash");
      return;
    }
    const char16_t e = p[i + 1];
    if (e >= '1' && e <= '9') {
      if (has(i + 2) && is_digit(p[i + 2])) {
        fail("only back-references \\1 to \\9 are in the dialect");
        return;
      }
      const int group = e - '0';
      if (!closed[group]) {
        fail("a back-reference must follow the end of its group");
        return;
      }
      i += 2;
      return;
    }
    if (e == 'u') {
      if (has(i + 2) && p[i + 2] == '{') {
        fail("\\u{...} is not in the pattern dialect");
        return;
      }
      if (i + 6 > p.size() || !is_hex_unit(p[i + 2]) || !is_hex_unit(p[i + 3]) || !is_hex_unit(p[i + 4]) ||
          !is_hex_unit(p[i + 5])) {
        fail("\\u needs four hexadecimal digits");
        return;
      }
      i += 6;
      return;
    }
    if (e == 'p' || e == 'P') {
      fail("\\p{...} is not in the pattern dialect; reference a class with {name}");
      return;
    }
    if (std::u16string_view(u"sSwWbBdD").find(e) != std::u16string_view::npos) {
      fail("shorthand classes such as \\w are not in the pattern dialect; write the characters as a class");
      return;
    }
    if (e == 'k') {
      fail("named back-references are not in the pattern dialect");
      return;
    }
    if (pattern_syntax.find(e) != std::u16string_view::npos) {
      i += 2;
      return;
    }
    fail("this escape is not in the pattern dialect");
  }

  void parse_disjunction() {
    parse_alternative();
    while (!failed && has(i) && p[i] == '|') {
      ++i;
      parse_alternative();
    }
  }

  void parse_alternative() {
    while (!failed && has(i) && p[i] != '|' && p[i] != ')') {
      parse_term();
    }
  }

  void parse_term() {
    const char16_t c = p[i];
    if (c == '^' || c == '$') {
      ++i;
      parse_quantifier(false);
      return;
    }
    if (c == '(') {
      if (starts_with(u"(?=") || starts_with(u"(?!")) {
        i += 3;
        parse_disjunction();
        if (failed) return;
        if (!has(i) || p[i] != ')') {
          fail("the lookahead is not closed with )");
          return;
        }
        ++i;
        parse_quantifier(false);
        return;
      }
      if (starts_with(u"(?<=") || starts_with(u"(?<!")) {
        fail("lookbehind is not in the pattern dialect; use a stem constraint");
        return;
      }
      if (starts_with(u"(?<")) {
        fail("named groups are not in the pattern dialect");
        return;
      }
      if (starts_with(u"(?:")) {
        i += 3;
        parse_disjunction();
        if (failed) return;
        if (!has(i) || p[i] != ')') {
          fail("the group is not closed with )");
          return;
        }
        ++i;
        parse_quantifier(true);
        return;
      }
      if (starts_with(u"(?")) {
        fail("only (?:...), (?=...) and (?!...) groups are in the pattern dialect");
        return;
      }
      ++i;
      const int group = ++groups;
      parse_disjunction();
      if (failed) return;
      if (!has(i) || p[i] != ')') {
        fail("the group is not closed with )");
        return;
      }
      ++i;
      if (group < 10) closed[group] = true;
      parse_quantifier(true);
      return;
    }
    if (c == '[') {
      parse_class();
      if (failed) return;
      parse_quantifier(true);
      return;
    }
    if (c == '.') {
      dots.push_back(i);
      ++i;
      parse_quantifier(true);
      return;
    }
    if (c == '\\') {
      parse_escape();
      if (failed) return;
      parse_quantifier(true);
      return;
    }
    if (c == '{') {
      const size_t length = reference_length(p, i);
      if (length != 0) {
        references.push_back({u16_to_utf8(p.substr(i + 1, length - 2)), i, i + length, false});
        i += length;
        parse_quantifier(true);
        return;
      }
      if (quantifier_at(i) != 0) {
        fail("nothing to repeat");
        return;
      }
      fail("a { starts a reference {name} or a quantifier; write a literal { as \\{");
      return;
    }
    if (c == '*' || c == '+' || c == '?') {
      fail("nothing to repeat");
      return;
    }
    if (c == ']' || c == '}') {
      fail(c == ']' ? "a literal ] must be written \\]" : "a literal } must be written \\}");
      return;
    }
    const char32_t cp = code_point_at(p, i);
    if (cp <= 0xFFFF && is_surrogate_unit(static_cast<char16_t>(cp))) {
      fail("a lone surrogate is not a character");
      return;
    }
    i += cp > 0xFFFF ? 2 : 1;
    if (cp > 0xFFFF && quantifier_at(i) != 0) {
      fail("a quantifier after a character above U+FFFF repeats only half of it; use (?:...)");
      return;
    }
    parse_quantifier(true);
  }

  bool parse() {
    parse_disjunction();
    if (!failed && i < p.size()) {
      fail(p[i] == ')' ? "unmatched )" : "unexpected character");
    }
    return !failed;
  }
};

void append_hex4(std::u16string& out, unsigned value) {
  char buf[8];
  std::snprintf(buf, sizeof(buf), "\\u%04X", value);
  for (const char* c = buf; *c != 0; ++c) out.push_back(static_cast<char16_t>(*c));
}

}  // namespace

std::wstring to_utf16_units(std::string_view utf8) {
  std::wstring out;
  out.reserve(utf8.size());
  const auto* s = reinterpret_cast<const unsigned char*>(utf8.data());
  const size_t n = utf8.size();
  for (size_t i = 0; i < n;) {
    const unsigned char b0 = s[i];
    char32_t c;
    if (b0 < 0x80) {
      c = b0;
      i += 1;
    } else if ((b0 & 0xE0) == 0xC0 && i + 1 < n) {
      c = ((b0 & 0x1F) << 6) | (s[i + 1] & 0x3F);
      i += 2;
    } else if ((b0 & 0xF0) == 0xE0 && i + 2 < n) {
      c = ((b0 & 0x0F) << 12) | ((s[i + 1] & 0x3F) << 6) | (s[i + 2] & 0x3F);
      i += 3;
    } else if ((b0 & 0xF8) == 0xF0 && i + 3 < n) {
      c = ((b0 & 0x07) << 18) | ((s[i + 1] & 0x3F) << 12) | ((s[i + 2] & 0x3F) << 6) | (s[i + 3] & 0x3F);
      i += 4;
    } else {
      c = 0xFFFD;
      i += 1;
    }
    if (c > 0xFFFF) {
      c -= 0x10000;
      out.push_back(static_cast<wchar_t>(0xD800 + (c >> 10)));
      out.push_back(static_cast<wchar_t>(0xDC00 + (c & 0x3FF)));
    } else {
      out.push_back(static_cast<wchar_t>(c));
    }
  }
  return out;
}

std::string from_utf16_units(std::wstring_view units) {
  std::string out;
  out.reserve(units.size() * 3);
  for (size_t i = 0; i < units.size(); ++i) {
    char32_t c = static_cast<char32_t>(units[i]);
    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < units.size() && units[i + 1] >= 0xDC00 && units[i + 1] <= 0xDFFF) {
      c = 0x10000 + ((c - 0xD800) << 10) + (static_cast<char32_t>(units[i + 1]) - 0xDC00);
      ++i;
    } else if (c >= 0xD800 && c <= 0xDFFF) {
      c = 0xFFFD;
    }
    append_utf8(out, c);
  }
  return out;
}

std::unique_ptr<Pattern> Pattern::compile(std::string_view pattern, std::string_view replacement, bool global,
                                          const PatternClassLookup& classes, std::string* error) {
  bool ok = true;
  const std::u16string p = to_u16(pattern, &ok);
  if (!ok) {
    if (error != nullptr) *error = "the pattern is not valid UTF-8";
    return nullptr;
  }
  DialectParser parser{p, error};
  if (!parser.parse()) {
    return nullptr;
  }

  // checkReplacement: only $1-$9 (for groups the pattern has, not followed by
  // a digit) and $&.
  const std::u16string r = to_u16(replacement, &ok);
  if (!ok) {
    if (error != nullptr) *error = "the replacement is not valid UTF-8";
    return nullptr;
  }
  for (size_t k = 0; k < r.size(); ++k) {
    if (r[k] != '$') continue;
    const char16_t next = k + 1 < r.size() ? r[k + 1] : 0;
    if (next == '&') {
      ++k;
      continue;
    }
    if (next >= '1' && next <= '9') {
      if (k + 2 < r.size() && is_digit(r[k + 2])) {
        if (error != nullptr) *error = "only $1 to $9 are in the dialect; a digit may not follow them";
        return nullptr;
      }
      if (next - '0' > parser.groups) {
        if (error != nullptr) {
          *error = "$" + std::string(1, static_cast<char>(next)) + " names a group the pattern does not have (it has " +
                   std::to_string(parser.groups) + ")";
        }
        return nullptr;
      }
      ++k;
      continue;
    }
    if (error != nullptr) *error = "a $ in a replacement must start $1-$9 or $&";
    return nullptr;
  }

  // Expands the references (as ClassSet.patternSource does) and writes `.`
  // as the class JavaScript means by it, which std::regex implementations
  // do not all agree on.
  std::u16string expanded;
  std::u16string native;
  size_t last = 0;
  size_t ref = 0;
  size_t dot = 0;
  while (ref < parser.references.size() || dot < parser.dots.size()) {
    const bool take_ref =
        dot >= parser.dots.size() || (ref < parser.references.size() && parser.references[ref].start < parser.dots[dot]);
    if (take_ref) {
      const Reference& reference = parser.references[ref++];
      const CharClass* cls = classes(reference.name);
      if (cls == nullptr) {
        if (error != nullptr) *error = "{" + reference.name + "} names no class of this pack";
        return nullptr;
      }
      std::u16string items;
      for (const auto& range : cls->ranges()) {
        if (range.last > 0xFFFF) {
          if (error != nullptr) *error = "{" + reference.name + "} has members above U+FFFF, which a pattern cannot reference";
          return nullptr;
        }
        append_hex4(items, range.first);
        if (range.last != range.first) {
          items.push_back('-');
          append_hex4(items, range.last);
        }
      }
      const std::u16string_view before(p.data() + last, reference.start - last);
      expanded += before;
      native += before;
      if (reference.in_class) {
        expanded += items;
        native += items;
      } else {
        expanded += u"[" + items + u"]";
        // An empty class matches nothing; [] is not portable across std::regex.
        native += items.empty() ? std::u16string(u"[^\\u0000-\\uFFFF]") : u"[" + items + u"]";
      }
      last = reference.end;
    } else {
      const size_t at = parser.dots[dot++];
      const std::u16string_view before(p.data() + last, at - last);
      expanded += before;
      expanded += u".";
      native += before;
      native += u"[^\\u000A\\u000D\\u2028\\u2029]";
      last = at + 1;
    }
  }
  expanded += std::u16string_view(p).substr(last);
  native += std::u16string_view(p).substr(last);
  // A bracket expression whose only items were an empty reference.
  for (const auto& [from, to] : {std::pair<std::u16string_view, std::u16string_view>{u"[^]", u"[\\u0000-\\uFFFF]"},
                                 std::pair<std::u16string_view, std::u16string_view>{u"[]", u"[^\\u0000-\\uFFFF]"}}) {
    for (size_t at = native.find(from); at != std::u16string::npos; at = native.find(from, at + to.size())) {
      // Only where an escape does not precede the bracket.
      size_t backslashes = 0;
      for (size_t k = at; k > 0 && native[k - 1] == '\\'; --k) ++backslashes;
      if (backslashes % 2 == 0) {
        native.replace(at, from.size(), to);
      }
    }
  }

  auto result = std::unique_ptr<Pattern>(new Pattern());
  result->source_ = std::string(pattern);
  result->expanded_ = u16_to_utf8(expanded);
  result->global_ = global;
  std::wstring wide(native.begin(), native.end());
  try {
    result->regex_.imbue(std::locale::classic());
    result->regex_.assign(wide, std::regex_constants::ECMAScript);
  } catch (const std::regex_error& e) {
    if (error != nullptr) *error = std::string("std::wregex rejects the pattern: ") + e.what();
    return nullptr;
  }
  result->replacement_.assign(r.begin(), r.end());
  return result;
}

bool Pattern::search(std::string_view text) const {
  const std::wstring units = to_utf16_units(text);
  try {
    return std::regex_search(units, regex_);
  } catch (const std::regex_error&) {
    return false;
  }
}

bool Pattern::replace(std::string_view text, std::string& out) const {
  const std::wstring units = to_utf16_units(text);
  try {
    std::wsmatch match;
    if (!std::regex_search(units, match, regex_)) {
      return false;
    }
    std::wstring replaced;
    if (global_) {
      replaced = std::regex_replace(units, regex_, replacement_);
    } else {
      replaced.reserve(units.size() + replacement_.size());
      replaced.append(match.prefix().first, match.prefix().second);
      replaced += match.format(replacement_);
      replaced.append(match.suffix().first, match.suffix().second);
    }
    out = from_utf16_units(replaced);
    return true;
  } catch (const std::regex_error&) {
    return false;
  }
}

}  // namespace hoshidicts::lang
