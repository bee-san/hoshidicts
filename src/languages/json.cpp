// SPDX-License-Identifier: GPL-3.0-or-later
#include "json.hpp"

#include <charconv>
#include <cstring>

#include "size.hpp"

namespace hoshidicts::lang::json {

HOSHIDICTS_LOAD_TIME_BEGIN

namespace {
constexpr size_t max_depth = 128;

// Bytes that end the fast scan of a string: the quote, the backslash and
// control characters.
struct StringStops {
  bool stop[256] = {};
  constexpr StringStops() {
    for (int c = 0; c < 0x20; ++c) stop[c] = true;
    stop[static_cast<unsigned char>('"')] = true;
    stop[static_cast<unsigned char>('\\')] = true;
  }
};
constexpr StringStops string_stops;

// The offset of the first byte that is not valid UTF-8 (RFC 3629: no
// overlong forms, surrogates or code points above U+10FFFF), or npos.
size_t invalid_utf8(std::string_view text) {
  const auto* s = reinterpret_cast<const unsigned char*>(text.data());
  const size_t n = text.size();
  size_t i = 0;
  while (i < n) {
    const unsigned char b0 = s[i];
    if (b0 < 0x80) {
      ++i;
      continue;
    }
    size_t length;
    unsigned char lo = 0x80;
    unsigned char hi = 0xBF;
    if (b0 >= 0xC2 && b0 <= 0xDF) {
      length = 2;
    } else if (b0 >= 0xE0 && b0 <= 0xEF) {
      length = 3;
      if (b0 == 0xE0) lo = 0xA0;
      if (b0 == 0xED) hi = 0x9F;
    } else if (b0 >= 0xF0 && b0 <= 0xF4) {
      length = 4;
      if (b0 == 0xF0) lo = 0x90;
      if (b0 == 0xF4) hi = 0x8F;
    } else {
      return i;
    }
    if (i + length > n || s[i + 1] < lo || s[i + 1] > hi) return i;
    for (size_t k = 2; k < length; ++k) {
      if ((s[i + k] & 0xC0) != 0x80) return i;
    }
    i += length;
  }
  return std::string_view::npos;
}
}  // namespace

struct Parser {
  std::string_view text;
  std::vector<Value>& nodes;
  std::deque<std::string>& strings;
  std::string* error;
  std::vector<Value> stack;
  size_t i = 0;
  bool failed = false;

  bool fail(const char* reason) {
    if (failed) return false;
    failed = true;
    if (error != nullptr) {
      size_t line = 1;
      size_t column = 1;
      for (size_t k = 0; k < i && k < text.size(); ++k) {
        if (text[k] == '\n') {
          ++line;
          column = 1;
        } else if ((static_cast<unsigned char>(text[k]) & 0xC0) != 0x80) {
          ++column;
        }
      }
      *error = std::string(reason) + " at line " + std::to_string(line) + " column " + std::to_string(column);
    }
    return false;
  }

  void skip_space() {
    while (i < text.size()) {
      const char c = text[i];
      if (c != ' ' && c != '\t' && c != '\n' && c != '\r') return;
      ++i;
    }
  }

  static int hex(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
  }

  bool read_hex4(uint32_t& out) {
    if (i + 4 > text.size()) return fail("a \\u escape needs four hexadecimal digits");
    out = 0;
    for (size_t k = 0; k < 4; ++k) {
      const int h = hex(text[i + k]);
      if (h < 0) return fail("a \\u escape needs four hexadecimal digits");
      out = out * 16 + static_cast<uint32_t>(h);
    }
    i += 4;
    return true;
  }

  static void append_utf8(std::string& out, uint32_t c) {
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

  // A string at i (the opening quote), as a view into the text or into a
  // decoded copy. The whole text is valid UTF-8 (Document::parse checks it
  // first), so bytes above 0x7F need no look here.
  bool read_string(std::string_view& out) {
    ++i;
    const size_t start = i;
    // Fast path: no escapes.
    const auto* s = reinterpret_cast<const unsigned char*>(text.data());
    const size_t n = text.size();
    while (i < n && !string_stops.stop[s[i]]) ++i;
    if (i < n && s[i] == '"') {
      out = text.substr(start, i - start);
      ++i;
      return true;
    }
    if (i < n && s[i] != '\\') return fail("a control character must be escaped in a string");
    if (i >= text.size()) return fail("a string is not closed");
    std::string& decoded = strings.emplace_back(text.substr(start, i - start));
    while (i < text.size()) {
      const auto c = static_cast<unsigned char>(text[i]);
      if (c == '"') {
        out = decoded;
        ++i;
        return true;
      }
      if (c < 0x20) return fail("a control character must be escaped in a string");
      if (c != '\\') {
        decoded += static_cast<char>(c);
        ++i;
        continue;
      }
      ++i;
      if (i >= text.size()) return fail("a string is not closed");
      const char e = text[i++];
      switch (e) {
        case '"':
          decoded += '"';
          break;
        case '\\':
          decoded += '\\';
          break;
        case '/':
          decoded += '/';
          break;
        case 'b':
          decoded += '\b';
          break;
        case 'f':
          decoded += '\f';
          break;
        case 'n':
          decoded += '\n';
          break;
        case 'r':
          decoded += '\r';
          break;
        case 't':
          decoded += '\t';
          break;
        case 'u': {
          uint32_t cp = 0;
          if (!read_hex4(cp)) return false;
          if (cp >= 0xD800 && cp <= 0xDBFF) {
            uint32_t low = 0;
            if (i + 1 >= text.size() || text[i] != '\\' || text[i + 1] != 'u') {
              return fail("a high surrogate escape needs a low surrogate escape after it");
            }
            i += 2;
            if (!read_hex4(low)) return false;
            if (low < 0xDC00 || low > 0xDFFF) return fail("a high surrogate escape needs a low surrogate escape after it");
            cp = 0x10000 + ((cp - 0xD800) << 10) + (low - 0xDC00);
          } else if (cp >= 0xDC00 && cp <= 0xDFFF) {
            return fail("a lone low surrogate escape");
          }
          append_utf8(decoded, cp);
          break;
        }
        default:
          return fail("an unknown escape in a string");
      }
    }
    return fail("a string is not closed");
  }

  bool read_number(Value& v) {
    const size_t start = i;
    if (i < text.size() && text[i] == '-') ++i;
    if (i >= text.size()) return fail("a number is cut off");
    if (text[i] == '0') {
      ++i;
    } else if (text[i] >= '1' && text[i] <= '9') {
      while (i < text.size() && text[i] >= '0' && text[i] <= '9') ++i;
    } else {
      return fail("not a valid number");
    }
    if (i < text.size() && text[i] == '.') {
      ++i;
      if (i >= text.size() || text[i] < '0' || text[i] > '9') return fail("not a valid number");
      while (i < text.size() && text[i] >= '0' && text[i] <= '9') ++i;
    }
    if (i < text.size() && (text[i] == 'e' || text[i] == 'E')) {
      ++i;
      if (i < text.size() && (text[i] == '+' || text[i] == '-')) ++i;
      if (i >= text.size() || text[i] < '0' || text[i] > '9') return fail("not a valid number");
      while (i < text.size() && text[i] >= '0' && text[i] <= '9') ++i;
    }
    double value = 0;
    const auto [end, ec] = std::from_chars(text.data() + start, text.data() + i, value);
    if (ec != std::errc() || end != text.data() + i) return fail("not a valid number");
    v.type_ = Value::Type::Number;
    v.number_ = value;
    return true;
  }

  bool literal(std::string_view word) {
    if (text.substr(i, word.size()) != word) return fail("not a valid JSON value");
    i += word.size();
    return true;
  }

  // Moves the children pushed since `base` into the node storage.
  void close(Value& container, size_t base) {
    container.first_ = static_cast<uint32_t>(nodes.size());
    container.count_ = static_cast<uint32_t>(stack.size() - base);
    for (size_t k = base; k < stack.size(); ++k) nodes.push_back(stack[k]);
    stack.resize(base);
  }

  bool read_value(Value& v, size_t depth) {
    skip_space();
    if (i >= text.size()) return fail("a value is missing");
    const char c = text[i];
    switch (c) {
      case '{': {
        if (depth >= max_depth) return fail("JSON nested too deeply");
        ++i;
        v.type_ = Value::Type::Object;
        const size_t base = stack.size();
        skip_space();
        if (i < text.size() && text[i] == '}') {
          ++i;
          close(v, base);
          return true;
        }
        while (true) {
          skip_space();
          if (i >= text.size() || text[i] != '"') return fail("an object key must be a string");
          std::string_view key;
          if (!read_string(key)) return false;
          for (size_t k = base; k < stack.size(); ++k) {
            if (stack[k].key_ == key) return fail("a key is repeated in an object");
          }
          skip_space();
          if (i >= text.size() || text[i] != ':') return fail("a : must follow an object key");
          ++i;
          Value member;
          if (!read_value(member, depth + 1)) return false;
          member.key_ = key;
          stack.push_back(member);
          skip_space();
          if (i < text.size() && text[i] == ',') {
            ++i;
            continue;
          }
          if (i < text.size() && text[i] == '}') {
            ++i;
            close(v, base);
            return true;
          }
          return fail("a , or } must follow an object member");
        }
      }
      case '[': {
        if (depth >= max_depth) return fail("JSON nested too deeply");
        ++i;
        v.type_ = Value::Type::Array;
        const size_t base = stack.size();
        skip_space();
        if (i < text.size() && text[i] == ']') {
          ++i;
          close(v, base);
          return true;
        }
        while (true) {
          Value element;
          if (!read_value(element, depth + 1)) return false;
          stack.push_back(element);
          skip_space();
          if (i < text.size() && text[i] == ',') {
            ++i;
            continue;
          }
          if (i < text.size() && text[i] == ']') {
            ++i;
            close(v, base);
            return true;
          }
          return fail("a , or ] must follow an array element");
        }
      }
      case '"':
        v.type_ = Value::Type::String;
        return read_string(v.string_);
      case 't':
        v.type_ = Value::Type::Boolean;
        v.boolean_ = true;
        return literal("true");
      case 'f':
        v.type_ = Value::Type::Boolean;
        v.boolean_ = false;
        return literal("false");
      case 'n':
        v.type_ = Value::Type::Null;
        return literal("null");
      default:
        if (c == '-' || (c >= '0' && c <= '9')) return read_number(v);
        return fail("not a valid JSON value");
    }
  }
};

bool Document::parse(std::string_view text, std::string* error) {
  nodes_.clear();
  strings_.clear();
  nodes_.reserve(text.size() / 8);
  Parser parser{text, nodes_, strings_, error, {}};
  parser.stack.reserve(256);
  root_ = Value();
  if (const size_t bad = invalid_utf8(text); bad != std::string_view::npos) {
    parser.i = bad;
    return parser.fail("the text is not valid UTF-8");
  }
  if (!parser.read_value(root_, 0)) return false;
  parser.skip_space();
  if (parser.i != text.size()) return parser.fail("text follows the JSON value");
  // Children were stored by index while the storage grew.
  for (auto& node : nodes_) {
    if (node.type_ == Value::Type::Array || node.type_ == Value::Type::Object) node.children_ = nodes_.data() + node.first_;
  }
  if (root_.type_ == Value::Type::Array || root_.type_ == Value::Type::Object) root_.children_ = nodes_.data() + root_.first_;
  return true;
}

HOSHIDICTS_LOAD_TIME_END

}  // namespace hoshidicts::lang::json
