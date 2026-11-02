// SPDX-License-Identifier: GPL-3.0-or-later
#include <libdeflate.h>

#include <algorithm>
#include <filesystem>
#include <fstream>
#include <mutex>
#include <stdexcept>

#include "../path_utils.hpp"
#include "builtin_packs.hpp"
#include "hoshidicts/languages.hpp"
#include "pack.hpp"
#include "size.hpp"

namespace hoshidicts {

HOSHIDICTS_LOAD_TIME_BEGIN

LanguagePack::LanguagePack(std::unique_ptr<lang::PackData> data) : data_(std::move(data)) {}
LanguagePack::~LanguagePack() = default;

const std::string& LanguagePack::code() const { return data_->code; }
const std::string& LanguagePack::name() const { return data_->name; }

std::shared_ptr<const LanguagePack> parse_language_pack(std::string_view language_json,
                                                        std::string_view transforms_json, std::string* error) {
  auto data = lang::parse_pack(language_json, transforms_json, error);
  if (!data) {
    return nullptr;
  }
  return std::make_shared<const LanguagePack>(std::move(data));
}

namespace lang {
std::string unpack(const PackedFile& file) {
  std::string out;
  if (file.packed_size == 0) return out;
  out.resize(file.size);
  struct Free {
    void operator()(libdeflate_decompressor* d) const { libdeflate_free_decompressor(d); }
  };
  std::unique_ptr<libdeflate_decompressor, Free> inflater(libdeflate_alloc_decompressor());
  size_t actual = 0;
  if (!inflater || libdeflate_deflate_decompress(inflater.get(), file.data, file.packed_size, out.data(), out.size(),
                                                 &actual) != LIBDEFLATE_SUCCESS ||
      actual != file.size) {
    throw std::logic_error("the built-in language pack data is corrupt");
  }
  return out;
}
}  // namespace lang

std::shared_ptr<const LanguagePack> builtin_language_pack(std::string_view code) {
  struct Parsed {
    std::once_flag once;
    std::shared_ptr<const LanguagePack> pack;
  };
  static Parsed parsed[8];
  for (size_t i = 0; i < lang::builtin_pack_count && i < std::size(parsed); ++i) {
    const auto& builtin = lang::builtin_packs[i];
    if (builtin.code != code) continue;
    std::call_once(parsed[i].once, [&] {
      std::string error;
      // Trusted: language-conformance-test checks these bytes, which must
      // equal languages/<code>/, against the full schema.
      auto data = lang::parse_pack(lang::unpack(builtin.language_json), lang::unpack(builtin.transforms_json), &error,
                                   /*trusted=*/true);
      if (data) parsed[i].pack = std::make_shared<const LanguagePack>(std::move(data));
      if (!parsed[i].pack) {
        throw std::logic_error("the built-in language pack does not load: " + error);
      }
    });
    return parsed[i].pack;
  }
  return nullptr;
}

LanguageRegistry::LanguageRegistry() = default;

LanguageRegistry LanguageRegistry::with_builtin() {
  LanguageRegistry registry;
  for (size_t i = 0; i < lang::builtin_pack_count; ++i) {
    registry.add(builtin_language_pack(lang::builtin_packs[i].code));
  }
  return registry;
}

void LanguageRegistry::add(std::shared_ptr<const LanguagePack> pack) {
  if (!pack) return;
  for (auto& existing : packs_) {
    if (existing->code() == pack->code()) {
      existing = std::move(pack);
      return;
    }
  }
  packs_.push_back(std::move(pack));
}

bool LanguageRegistry::add(std::string_view language_json, std::string_view transforms_json, std::string* error) {
  auto pack = parse_language_pack(language_json, transforms_json, error);
  if (!pack) {
    return false;
  }
  add(std::move(pack));
  return true;
}

namespace {
bool read_file(const std::filesystem::path& path, std::string& out) {
  std::ifstream file(path, std::ios::binary);
  if (!file) return false;
  out.assign(std::istreambuf_iterator<char>(file), {});
  return true;
}

}  // namespace

bool LanguageRegistry::add_directory(const std::string& languages_dir, std::string* error) {
  std::string errors;
  std::error_code ec;
  const auto root = path_utils::from_utf8(languages_dir);
  std::vector<std::filesystem::path> dirs;
  for (const auto& entry : std::filesystem::directory_iterator(root, ec)) {
    if (!entry.is_directory()) continue;
    const std::string name = path_utils::to_utf8(entry.path().filename());
    if (name.empty() || name[0] == '_' || name[0] == '.') continue;
    if (!std::filesystem::is_regular_file(entry.path() / "language.json")) continue;
    dirs.push_back(entry.path());
  }
  if (ec) {
    if (error != nullptr) *error = languages_dir + ": " + ec.message();
    return false;
  }
  std::ranges::sort(dirs);
  for (const auto& dir : dirs) {
    const std::string name = path_utils::to_utf8(dir.filename());
    std::string language;
    if (!read_file(dir / "language.json", language)) {
      errors += name + ": language.json: cannot be read\n";
      continue;
    }
    std::string transforms;
    const std::string file = lang::transforms_file_name(language);
    if (!file.empty() && file.find_first_of("/\\") == std::string::npos && !read_file(dir / file, transforms)) {
      errors += name + ": " + file + ": cannot be read\n";
      continue;
    }
    std::string pack_error;
    auto pack = parse_language_pack(language, transforms, &pack_error);
    if (!pack) {
      errors += pack_error + "\n";
      continue;
    }
    if (pack->code() != name) {
      errors += name + ": language.json: code: is " + pack->code() + ", not the directory name " + name + "\n";
      continue;
    }
    add(std::move(pack));
  }
  if (!errors.empty()) {
    errors.pop_back();
    if (error != nullptr) *error = errors;
    return false;
  }
  return true;
}

std::shared_ptr<const LanguagePack> LanguageRegistry::find(std::string_view code) const {
  for (const auto& pack : packs_) {
    if (pack->code() == code) return pack;
  }
  return nullptr;
}

std::vector<std::string> LanguageRegistry::codes() const {
  std::vector<std::string> out;
  for (const auto& pack : packs_) out.push_back(pack->code());
  std::ranges::sort(out);
  return out;
}

HOSHIDICTS_LOAD_TIME_END

}  // namespace hoshidicts
