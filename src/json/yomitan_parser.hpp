#pragma once
#include <cstdint>
#include <glaze/glaze.hpp>

#include "json_skip.hpp"
#include <optional>
#include <string>
#include <string_view>
#include <vector>

// index.json's strings are read decoded, unlike the banks' raw views: a
// writer may escape any character ("\\n" in a description, "\\u9752" for
// every non-ASCII character from Python's json.dump), and the title names the
// dictionary everywhere.
struct Index {
  std::string title;
  std::optional<int> format;
  std::optional<int> version;
  std::string revision;
  std::optional<std::string> minimumYomitanVersion;
  bool sequenced = false;
  std::optional<bool> isUpdatable;
  std::optional<std::string> indexUrl;
  std::optional<std::string> downloadUrl;
  std::optional<std::string> author;
  std::optional<std::string> url;
  std::optional<std::string> description;
  std::optional<std::string> attribution;
  std::optional<std::string> sourceLanguage;
  std::optional<std::string> targetLanguage;
  std::optional<std::string> frequencyMode;
};

struct Term {
  std::string_view expression;
  std::string_view reading;
  std::optional<std::string_view> definition_tags;
  std::string_view rules;
  double score = 0;
  hoshidicts::raw_value_view glossary;
  int64_t sequence = 0;
  std::string_view term_tags;
};

struct Meta {
  std::string_view expression;
  std::string_view mode;
  hoshidicts::raw_value_view data;
};

struct Kanji {
  std::string_view character;
  std::string_view onyomi;
  std::string_view kunyomi;
  std::string_view tags;
  std::vector<std::string_view> definitions;
  std::unordered_map<std::string, std::string> stats;
};

// A tag-bank row. Yomitan's schema makes order and score any JSON number.
struct Tag {
  std::string name;
  std::string category;
  double order = 0;
  std::string notes;
  double score = 0;
};

struct ParsedFrequency {
  std::string reading;
  int value;
  std::string display_value;
};

struct ParsedAccent {
  int position = 0;
  std::string pattern;
  std::vector<int> nasal;
  std::vector<int> devoice;
};

struct ParsedPitch {
  std::string reading;
  std::vector<ParsedAccent> pitches;
  std::vector<std::string> transcriptions;
};

namespace yomitan_parser {
bool parse_index(std::string_view content, Index& out);
// The bank parsers keep each string as a view into `content`. A string the
// bank spells with JSON escapes ("\\u98df" for 食, as Python's json.dump
// writes every non-ASCII character by default) is decoded in place, which a
// decoded string always fits, so the views stay valid while `content` lives.
// Glossaries and meta data stay raw JSON.
bool parse_term_bank(std::string& content, std::vector<Term>& out);
bool parse_meta_bank(std::string& content, std::vector<Meta>& out);
bool parse_kanji_bank(std::string& content, std::vector<Kanji>& out);
bool parse_tag_bank(std::string_view content, std::vector<Tag>& out);
bool parse_frequency(std::string_view content, ParsedFrequency& out);
bool parse_pitch(std::string_view content, ParsedPitch& out);
bool parse_ipa(std::string_view content, ParsedPitch& out);
};
