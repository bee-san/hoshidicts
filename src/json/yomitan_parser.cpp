#include "yomitan_parser.hpp"

#include <algorithm>
#include <charconv>
#include <cstring>
#include <limits>
#include <optional>
#include <string>
#include <string_view>
#include <variant>

template <>
struct glz::meta<Index> {
  using T = Index;
  static constexpr auto value =
      object("title", &T::title, "format", &T::format, "version", &T::version, "revision", &T::revision,
             "minimumYomitanVersion", &T::minimumYomitanVersion, "sequenced", &T::sequenced, "isUpdatable",
             &T::isUpdatable, "indexUrl", &T::indexUrl, "downloadUrl", &T::downloadUrl, "author", &T::author, "url",
             &T::url, "description", &T::description, "attribution", &T::attribution, "sourceLanguage",
             &T::sourceLanguage, "targetLanguage", &T::targetLanguage, "frequencyMode", &T::frequencyMode);
};

template <>
struct glz::meta<Term> {
  using T = Term;
  static constexpr auto value =
      array(glz::raw_string<&T::expression>, glz::raw_string<&T::reading>, glz::raw_string<&T::definition_tags>,
            glz::raw_string<&T::rules>, &T::score, &T::glossary, &T::sequence, glz::raw_string<&T::term_tags>);
};

template <>
struct glz::meta<Meta> {
  using T = Meta;
  static constexpr auto value = array(glz::raw_string<&T::expression>, glz::raw_string<&T::mode>, &T::data);
};

template <>
struct glz::meta<Kanji> {
  using T = Kanji;
  static constexpr auto value = array(glz::raw_string<&T::character>, glz::raw_string<&T::onyomi>,
                                      glz::raw_string<&T::kunyomi>, glz::raw_string<&T::tags>, &T::definitions, &T::stats);
};

// Decoded like a term bank's definitionTags, so a tag still matches the names
// that refer to it.
template <>
struct glz::meta<Tag> {
  using T = Tag;
  static constexpr auto value = array(&T::name, &T::category, &T::order, &T::notes, &T::score);
};

namespace internal {
struct FrequencyValue {
  int value;
  std::optional<std::string> display_value;
};

struct RawFrequencyFlat {
  std::optional<std::string> reading;
  int value;
  std::optional<std::string> display_value;
};

struct RawFrequency {
  std::optional<std::string> reading;
  std::variant<int, std::string, FrequencyValue> frequency;
};

struct PitchesArray {
  std::variant<int, std::string> position;
  std::optional<std::variant<int, std::vector<int>>> nasal;
  std::optional<std::variant<int, std::vector<int>>> devoice;
};

struct RawPitch {
  std::string reading;
  std::vector<PitchesArray> pitches;
};

struct TranscriptionsArray {
  std::string ipa;
};

struct RawIPA {
  std::string reading;
  std::vector<TranscriptionsArray> transcriptions;
};
};

template <>
struct glz::meta<internal::RawFrequencyFlat> {
  using T = internal::RawFrequencyFlat;
  static constexpr auto value = object("reading", &T::reading, "value", &T::value, "displayValue", &T::display_value);
};

template <>
struct glz::meta<internal::FrequencyValue> {
  using T = internal::FrequencyValue;
  static constexpr auto value = object("value", &T::value, "displayValue", &T::display_value);
};

template <>
struct glz::meta<internal::RawFrequency> {
  using T = internal::RawFrequency;
  static constexpr auto value = object("reading", &T::reading, "frequency", &T::frequency);
};

template <>
struct glz::meta<internal::PitchesArray> {
  using T = internal::PitchesArray;
  static constexpr auto value = object("position", &T::position, "nasal", &T::nasal, "devoice", &T::devoice);
};

template <>
struct glz::meta<internal::RawPitch> {
  using T = internal::RawPitch;
  static constexpr auto value = object("reading", &T::reading, "pitches", &T::pitches);
};

template <>
struct glz::meta<internal::TranscriptionsArray> {
  using T = internal::TranscriptionsArray;
  static constexpr auto value = object("ipa", &T::ipa);
};

template <>
struct glz::meta<internal::RawIPA> {
  using T = internal::RawIPA;
  static constexpr auto value = object("reading", &T::reading, "transcriptions", &T::transcriptions);
};

bool yomitan_parser::parse_index(std::string_view content, Index& out) {
  auto error = glz::read<glz::opts{.error_on_unknown_keys = false, .error_on_missing_keys = false}>(out, content);
  return !error;
}

namespace {
// Bank strings are captured raw (raw_string / raw_json_view) and copied through
// unchanged, so glaze's UTF-8 validation of every skipped string bought
// nothing but time: it was ~12-14% of a Jitendex or Pixiv Light import. A bank
// with malformed UTF-8 now imports with the bytes as they are (a renderer
// shows U+FFFD, as Yomitan does) instead of being dropped whole.
struct BankOpts : glz::opts {
  bool validate_utf8 = false;
};
constexpr BankOpts bank_opts{{.error_on_unknown_keys = false, .error_on_missing_keys = false}};
}  // namespace

namespace {
// Decodes a raw JSON string's escapes over its own bytes in `content` and
// narrows the view to the result. Decoding never lengthens a string: every
// escape is at least as long as the UTF-8 it stands for, a surrogate pair's
// twelve bytes become four, and a lone surrogate's six become U+FFFD's three,
// which is how a renderer shows the unpaired UTF-16 JSON.parse would keep. An
// unknown escape keeps its character.
void decode_in_place(std::string& content, std::string_view& view) {
  if (view.find('\\') == std::string_view::npos) {
    return;
  }
  const size_t offset = static_cast<size_t>(view.data() - content.data());
  char* out = content.data() + offset;
  const char* in = out;
  const char* const end = in + view.size();
  char* write = out;
  const auto hex4 = [&](const char* at, uint32_t& value) {
    if (end - at < 4) {
      return false;
    }
    value = 0;
    for (int i = 0; i < 4; ++i) {
      const char c = at[i];
      const int digit = c >= '0' && c <= '9' ? c - '0' : c >= 'a' && c <= 'f' ? c - 'a' + 10
                                                       : c >= 'A' && c <= 'F' ? c - 'A' + 10 : -1;
      if (digit < 0) {
        return false;
      }
      value = value * 16 + static_cast<uint32_t>(digit);
    }
    return true;
  };
  const auto put_utf8 = [&](uint32_t cp) {
    if (cp < 0x80) {
      *write++ = static_cast<char>(cp);
    } else if (cp < 0x800) {
      *write++ = static_cast<char>(0xC0 | (cp >> 6));
      *write++ = static_cast<char>(0x80 | (cp & 0x3F));
    } else if (cp < 0x10000) {
      *write++ = static_cast<char>(0xE0 | (cp >> 12));
      *write++ = static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
      *write++ = static_cast<char>(0x80 | (cp & 0x3F));
    } else {
      *write++ = static_cast<char>(0xF0 | (cp >> 18));
      *write++ = static_cast<char>(0x80 | ((cp >> 12) & 0x3F));
      *write++ = static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
      *write++ = static_cast<char>(0x80 | (cp & 0x3F));
    }
  };
  while (in < end) {
    if (*in != '\\' || end - in < 2) {
      *write++ = *in++;
      continue;
    }
    const char kind = in[1];
    in += 2;
    switch (kind) {
      case 'b': *write++ = '\b'; break;
      case 'f': *write++ = '\f'; break;
      case 'n': *write++ = '\n'; break;
      case 'r': *write++ = '\r'; break;
      case 't': *write++ = '\t'; break;
      case 'u': {
        uint32_t cp = 0;
        if (!hex4(in, cp)) {
          *write++ = 'u';
          break;
        }
        in += 4;
        if (cp >= 0xD800 && cp <= 0xDBFF) {
          uint32_t low = 0;
          if (end - in >= 6 && in[0] == '\\' && in[1] == 'u' && hex4(in + 2, low) && low >= 0xDC00 && low <= 0xDFFF) {
            in += 6;
            cp = 0x10000 + ((cp - 0xD800) << 10) + (low - 0xDC00);
          } else {
            cp = 0xFFFD;
          }
        } else if (cp >= 0xDC00 && cp <= 0xDFFF) {
          cp = 0xFFFD;
        }
        put_utf8(cp);
        break;
      }
      default: *write++ = kind; break;  // \" \\ \/ and anything unknown
    }
  }
  view = std::string_view(out, static_cast<size_t>(write - out));
}

void decode_in_place(std::string& content, std::optional<std::string_view>& view) {
  if (view) {
    decode_in_place(content, *view);
  }
}
}  // namespace

bool yomitan_parser::parse_term_bank(std::string& content, std::vector<Term>& out) {
  if (glz::read<bank_opts>(out, std::string_view(content))) {
    return false;
  }
  if (content.find('\\') != std::string::npos) {
    for (auto& term : out) {
      decode_in_place(content, term.expression);
      decode_in_place(content, term.reading);
      decode_in_place(content, term.definition_tags);
      decode_in_place(content, term.rules);
      decode_in_place(content, term.term_tags);
    }
  }
  return true;
}

bool yomitan_parser::parse_meta_bank(std::string& content, std::vector<Meta>& out) {
  if (glz::read<bank_opts>(out, std::string_view(content))) {
    return false;
  }
  if (content.find('\\') != std::string::npos) {
    for (auto& meta : out) {
      decode_in_place(content, meta.expression);
      decode_in_place(content, meta.mode);
    }
  }
  return true;
}

bool yomitan_parser::parse_kanji_bank(std::string& content, std::vector<Kanji>& out) {
  if (glz::read<bank_opts>(out, std::string_view(content))) {
    return false;
  }
  if (content.find('\\') != std::string::npos) {
    for (auto& kanji : out) {
      decode_in_place(content, kanji.character);
      decode_in_place(content, kanji.onyomi);
      decode_in_place(content, kanji.kunyomi);
      decode_in_place(content, kanji.tags);
      for (auto& definition : kanji.definitions) {
        decode_in_place(content, definition);
      }
    }
  }
  return true;
}

bool yomitan_parser::parse_tag_bank(std::string_view content, std::vector<Tag>& out) {
  auto error = glz::read<bank_opts>(out, content);
  return !error;
}

namespace {
// Yomitan's Translator._convertStringToNumber: parseFloat of the first match of
// /[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/, or 0 when there is none or it is out
// of range. "324/37459" is 324, "five (5)" is 5 and "four" is 0.
double first_number(std::string_view text) {
  const auto digit = [text](size_t i) { return i < text.size() && text[i] >= '0' && text[i] <= '9'; };
  for (size_t start = 0; start < text.size(); ++start) {
    const size_t i = start + (text[start] == '+' || text[start] == '-' ? 1 : 0);
    if (digit(i) || (i < text.size() && text[i] == '.' && digit(i + 1))) {
      // from_chars reads the rest of the match, but unlike parseFloat it refuses a leading '+'.
      double value = 0;
      const auto result =
          std::from_chars(text.data() + start + (text[start] == '+' ? 1 : 0), text.data() + text.size(), value);
      return result.ec == std::errc{} ? value : 0;
    }
  }
  return 0;
}

// Yomitan's _getFrequencyInfo for a string: the text is the display value and its
// first number the value, which Frequency::value truncates and saturates to an int.
void read_text_frequency(std::string text, ParsedFrequency& out) {
  constexpr double min = std::numeric_limits<int>::min();
  constexpr double max = std::numeric_limits<int>::max();
  out.value = static_cast<int>(std::clamp(first_number(text), min, max));
  out.display_value = std::move(text);
}
}  // namespace

bool yomitan_parser::parse_frequency(std::string_view content, ParsedFrequency& out) {
  internal::RawFrequencyFlat parsed_flat;
  auto error =
      glz::read<glz::opts{.error_on_unknown_keys = false, .error_on_missing_keys = true}>(parsed_flat, content);
  if (!error) {
    out.reading = std::move(parsed_flat.reading).value_or("");
    out.value = parsed_flat.value;
    out.display_value = parsed_flat.display_value.value_or(std::to_string(parsed_flat.value));
    return true;
  }

  int val;
  error = glz::read_json(val, content);
  if (!error) {
    out.value = val;
    out.display_value = std::to_string(val);
    out.reading = "";
    return true;
  }

  // The stored value is the row's exact JSON token, so only a string pays for this read.
  if (std::string text; content.starts_with('"') && !glz::read_json(text, content)) {
    out.reading = "";
    read_text_frequency(std::move(text), out);
    return true;
  }

  internal::RawFrequency parsed;
  error = glz::read<glz::opts{.error_on_unknown_keys = false, .error_on_missing_keys = true}>(parsed, content);
  if (error) {
    return false;
  }

  out.reading = std::move(parsed.reading).value_or("");
  if (std::holds_alternative<int>(parsed.frequency)) {
    int freq = std::get<int>(parsed.frequency);
    out.value = freq;
    out.display_value = std::to_string(freq);
  } else if (auto* text = std::get_if<std::string>(&parsed.frequency)) {
    read_text_frequency(std::move(*text), out);
  } else {
    auto& freq = std::get<internal::FrequencyValue>(parsed.frequency);
    out.value = freq.value;
    out.display_value = freq.display_value.value_or(std::to_string(freq.value));
  }
  return true;
}

bool yomitan_parser::parse_pitch(std::string_view content, ParsedPitch& out) {
  internal::RawPitch parsed;
  auto error = glz::read<glz::opts{.error_on_unknown_keys = false, .error_on_missing_keys = true}>(parsed, content);
  if (error) {
    return false;
  }

  auto to_number_array = [](const std::optional<std::variant<int, std::vector<int>>>& value) -> std::vector<int> {
    if (!value) {
      return {};
    }
    if (std::holds_alternative<int>(*value)) {
      return {std::get<int>(*value)};
    }
    return std::get<std::vector<int>>(*value);
  };

  out.reading = std::move(parsed.reading);
  for (auto& pitch : parsed.pitches) {
    ParsedAccent accent{.nasal = to_number_array(pitch.nasal), .devoice = to_number_array(pitch.devoice)};
    if (std::holds_alternative<int>(pitch.position)) {
      accent.position = std::get<int>(pitch.position);
    } else {
      accent.pattern = std::move(std::get<std::string>(pitch.position));
    }
    out.pitches.emplace_back(std::move(accent));
  }
  return true;
}

bool yomitan_parser::parse_ipa(std::string_view content, ParsedPitch& out) {
  internal::RawIPA parsed;
  auto error = glz::read<glz::opts{.error_on_unknown_keys = false, .error_on_missing_keys = false}>(parsed, content);
  if (error) {
    return false;
  }

  out.reading = std::move(parsed.reading);
  for (auto& transcription : parsed.transcriptions) {
    out.transcriptions.push_back(std::move(transcription.ipa));
  }
  return true;
}
