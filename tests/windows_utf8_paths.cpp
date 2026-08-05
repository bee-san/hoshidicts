#include "hoshidicts_c.h"

#include <chrono>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>
#include <string_view>
#include <vector>

namespace {
namespace fs = std::filesystem;

struct ZipEntry {
  std::string name;
  std::string data;
  uint32_t crc = 0;
  uint32_t offset = 0;
};

template <typename T>
void write_le(std::ofstream& out, T value) {
  for (size_t i = 0; i < sizeof(T); ++i) {
    out.put(static_cast<char>((value >> (i * 8)) & 0xff));
  }
}

uint32_t crc32(std::string_view value) {
  uint32_t crc = 0xffffffff;
  for (unsigned char byte : value) {
    crc ^= byte;
    for (int bit = 0; bit < 8; ++bit) {
      crc = (crc >> 1) ^ (0xedb88320U & (0U - (crc & 1U)));
    }
  }
  return ~crc;
}

std::string utf8_bytes(std::u8string_view value) {
  return {reinterpret_cast<const char*>(value.data()), value.size()};
}

std::string path_utf8(const fs::path& value) {
  const std::u8string encoded = value.u8string();
  return {reinterpret_cast<const char*>(encoded.data()), encoded.size()};
}

fs::path native(std::u8string_view value) {
  return fs::path(value);
}

bool write_fixture(const fs::path& path) {
  std::vector<ZipEntry> entries{
      {"index.json",
       utf8_bytes(
           u8R"({"title":"日本語辞書","format":3,"revision":"1","sequenced":false,"sourceLanguage":"ja"})")},
      {"term_bank_1.json", utf8_bytes(u8R"([["食べる","たべる","","v1",0,["to eat"],1,""]])")},
  };

  std::ofstream out(path, std::ios::binary);
  if (!out) {
    return false;
  }

  for (auto& entry : entries) {
    entry.crc = crc32(entry.data);
    entry.offset = static_cast<uint32_t>(out.tellp());
    write_le<uint32_t>(out, 0x04034b50);
    write_le<uint16_t>(out, 20);
    write_le<uint16_t>(out, 0x0800);
    write_le<uint16_t>(out, 0);
    write_le<uint16_t>(out, 0);
    write_le<uint16_t>(out, 0);
    write_le<uint32_t>(out, entry.crc);
    write_le<uint32_t>(out, static_cast<uint32_t>(entry.data.size()));
    write_le<uint32_t>(out, static_cast<uint32_t>(entry.data.size()));
    write_le<uint16_t>(out, static_cast<uint16_t>(entry.name.size()));
    write_le<uint16_t>(out, 0);
    out.write(entry.name.data(), static_cast<std::streamsize>(entry.name.size()));
    out.write(entry.data.data(), static_cast<std::streamsize>(entry.data.size()));
  }

  const uint32_t central_offset = static_cast<uint32_t>(out.tellp());
  for (const auto& entry : entries) {
    write_le<uint32_t>(out, 0x02014b50);
    write_le<uint16_t>(out, 20);
    write_le<uint16_t>(out, 20);
    write_le<uint16_t>(out, 0x0800);
    write_le<uint16_t>(out, 0);
    write_le<uint16_t>(out, 0);
    write_le<uint16_t>(out, 0);
    write_le<uint32_t>(out, entry.crc);
    write_le<uint32_t>(out, static_cast<uint32_t>(entry.data.size()));
    write_le<uint32_t>(out, static_cast<uint32_t>(entry.data.size()));
    write_le<uint16_t>(out, static_cast<uint16_t>(entry.name.size()));
    write_le<uint16_t>(out, 0);
    write_le<uint16_t>(out, 0);
    write_le<uint16_t>(out, 0);
    write_le<uint16_t>(out, 0);
    write_le<uint32_t>(out, 0);
    write_le<uint32_t>(out, entry.offset);
    out.write(entry.name.data(), static_cast<std::streamsize>(entry.name.size()));
  }

  const uint32_t central_size = static_cast<uint32_t>(out.tellp()) - central_offset;
  write_le<uint32_t>(out, 0x06054b50);
  write_le<uint16_t>(out, 0);
  write_le<uint16_t>(out, 0);
  write_le<uint16_t>(out, static_cast<uint16_t>(entries.size()));
  write_le<uint16_t>(out, static_cast<uint16_t>(entries.size()));
  write_le<uint32_t>(out, central_size);
  write_le<uint32_t>(out, central_offset);
  write_le<uint16_t>(out, 0);
  return out.good();
}

bool same(hd_str value, std::string_view expected) {
  return std::string_view(value.ptr, value.len) == expected;
}
}

int main() {
  const auto nonce = std::chrono::steady_clock::now().time_since_epoch().count();
  const fs::path root =
      fs::temp_directory_path() / native(u8"利用者_山田") / ("hoshidicts-" + std::to_string(nonce));
  const fs::path zip_path = root / native(u8"入力_日本語辞書.zip");
  const fs::path output_path = root / native(u8"出力_日本語");
  const fs::path dictionary_path = output_path / native(u8"日本語辞書");

  std::error_code error;
  fs::create_directories(output_path, error);
  if (error || !write_fixture(zip_path)) {
    std::cerr << "failed to create test fixture\n";
    return 1;
  }

  const std::string zip_utf8 = path_utf8(zip_path);
  const std::string output_utf8 = path_utf8(output_path);
  hd_import_result* import_result = hd_import(zip_utf8.c_str(), output_utf8.c_str(), 1);
  if (import_result == nullptr || hd_import_result_success(import_result) == 0) {
    std::cerr << "import failed: "
              << (import_result == nullptr ? "null result" : hd_import_result_error(import_result)) << '\n';
    hd_import_result_free(import_result);
    fs::remove_all(root, error);
    return 1;
  }
  hd_import_result_free(import_result);

  hd_query* query = hd_query_new();
  hd_deinflector* deinflector = hd_deinflector_new();
  const std::string dictionary_utf8 = path_utf8(dictionary_path);
  if (query == nullptr || deinflector == nullptr || hd_query_add_term_dict(query, dictionary_utf8.c_str()) != 0) {
    std::cerr << "failed to reopen imported dictionary\n";
    hd_deinflector_free(deinflector);
    hd_query_free(query);
    fs::remove_all(root, error);
    return 1;
  }

  hd_lookup* lookup = hd_lookup_new(query, deinflector);
  const hd_lookup_result* results = nullptr;
  size_t result_count = 0;
  const std::string expression = utf8_bytes(u8"食べる");
  hd_lookup_results* owned_results =
      lookup == nullptr ? nullptr : hd_lookup_run(lookup, expression.c_str(), 8, 10, &results, &result_count);

  const bool success = owned_results != nullptr && result_count > 0 && same(results[0].term.expression, expression);
  if (!success) {
    std::cerr << "lookup failed after reopening dictionary\n";
  }

  hd_lookup_results_free(owned_results);
  hd_lookup_free(lookup);
  hd_deinflector_free(deinflector);
  hd_query_free(query);
  fs::remove_all(root, error);
  return success ? 0 : 1;
}
