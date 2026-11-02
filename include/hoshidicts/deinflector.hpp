#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>
#include <span>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace hoshidicts {
class LanguagePack;
}

struct TransformGroup {
  std::string name;
  std::string description;
  // The transform's id in its pack (docs/languages.md, section 7.1). Japanese
  // ids are the names; the cat-speech step's id is its variant pass,
  // nekoSpeech.
  std::string id;
};

struct DeinflectionResult {
  std::string text;
  uint32_t conditions;
  std::vector<TransformGroup> trace;
};

// The generic deinflector built from a pack's transforms
// (docs/languages.md, section 7).
class Deinflector {
 public:
  // Kept for existing callers: the built-in Japanese pack's rules.
  Deinflector();
  // The rules of `pack` (which must not be null).
  explicit Deinflector(std::shared_ptr<const hoshidicts::LanguagePack> pack);

  // Every deinflection of `text`, depth first, the text itself first.
  std::vector<DeinflectionResult> deinflect(const std::string& text) const;
  // The condition bits of the dictionary-form tags among `tags` (a term
  // bank's `rules`); tags the pack does not know are ignored.
  uint32_t conditions_for_parts_of_speech(std::span<const std::string> tags) const;
  // The condition bits of condition names (a corpus `rule`).
  uint32_t conditions_for_types(std::span<const std::string> names) const;

  // Kept for existing callers: Japanese part-of-speech conditions, and
  // NekoPara cat speech (now the Japanese pack's variant pass nekoSpeech).
  static uint32_t pos_to_conditions(const std::vector<std::string>& part_of_speech);
  // Readings of NekoPara's cat speech: each にゃ in text, one at a time, read as
  // な, だ, ら, ま or じゃ and deinflected, with neko_speech as the trace's first
  // step. Empty when text has no にゃ, or the pack has no nekoSpeech pass.
  // deinflect() never returns these.
  std::vector<DeinflectionResult> deinflect_neko_speech(const std::string& text) const;

  // The name of the first trace step of a deinflect_neko_speech() result.
  static constexpr std::string_view neko_speech = "neko speech";
  static bool is_neko_speech(const DeinflectionResult& result) {
    return !result.trace.empty() && result.trace.front().name == neko_speech;
  }

  const std::shared_ptr<const hoshidicts::LanguagePack>& pack() const { return pack_; }

 private:
  std::shared_ptr<const hoshidicts::LanguagePack> pack_;
};
