// Zip64 writers (Info-ZIP's -fz, Python's force_zip64, yazl's
// forceZip64Format, zip.js's zip64) put an entry's sizes and local header
// offset in a Zip64 extended information extra field (APPNOTE 4.5.3) and the
// 0xFFFFFFFF sentinel in the 32-bit fields. Requires that those archives
// import, including zip.js's form whose local header has the sentinel and no
// Zip64 field, and that a Zip64 size that disagrees with the central directory
// or an extra field too short for its values is still refused.
#include "hoshidicts/importer.hpp"
#include "hoshidicts/query.hpp"

#include <cstdint>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <random>
#include <string>
#include <utility>
#include <vector>

namespace {

uint32_t crc32(const std::string& data) {
  uint32_t crc = 0xFFFFFFFFu;
  for (unsigned char c : data) {
    crc ^= c;
    for (int i = 0; i < 8; ++i) {
      crc = (crc >> 1) ^ (0xEDB88320u & (0u - (crc & 1u)));
    }
  }
  return ~crc;
}

template <typename T>
void put(std::string& out, T value) {
  char buf[sizeof(T)];
  std::memcpy(buf, &value, sizeof(T));
  out.append(buf, sizeof(T));
}

constexpr uint32_t kSentinel = 0xFFFFFFFFu;

struct Layout {
  bool central_zip64 = true;   // sentinel sizes and offset, values in the central Zip64 field
  bool local_zip64 = true;     // sentinel sizes, values in a local Zip64 field
  bool local_field = true;     // with local_zip64 off: still write the sentinel, but no field (zip.js)
  uint64_t forged_local_size = 0;  // when nonzero, the term bank's local Zip64 sizes
  bool truncated_central = false;  // the term bank's central field omits the offset it owes
};

// A stored (method 0) ZIP.
std::string build_zip(const std::vector<std::pair<std::string, std::string>>& files, const Layout& layout) {
  std::string out;
  std::string central;
  for (const auto& [name, data] : files) {
    const uint64_t offset = out.size();
    const uint32_t crc = crc32(data);
    const uint64_t size = data.size();
    const bool term_bank = name == "term_bank_1.json";
    const uint64_t local_size = layout.forged_local_size != 0 && term_bank ? layout.forged_local_size : size;

    std::string local_extra;
    if (layout.local_zip64) {
      put<uint16_t>(local_extra, 0x0001);
      put<uint16_t>(local_extra, 16);
      put<uint64_t>(local_extra, local_size);
      put<uint64_t>(local_extra, local_size);
    }
    const bool local_sentinel = layout.local_zip64 || !layout.local_field;
    put<uint32_t>(out, 0x04034b50);
    put<uint16_t>(out, 45);
    put<uint16_t>(out, 0x0800);
    put<uint16_t>(out, 0);  // stored
    put<uint16_t>(out, 0);
    put<uint16_t>(out, 0);
    put<uint32_t>(out, crc);
    put<uint32_t>(out, local_sentinel ? kSentinel : static_cast<uint32_t>(size));
    put<uint32_t>(out, local_sentinel ? kSentinel : static_cast<uint32_t>(size));
    put<uint16_t>(out, static_cast<uint16_t>(name.size()));
    put<uint16_t>(out, static_cast<uint16_t>(local_extra.size()));
    out += name;
    out += local_extra;
    out += data;

    std::string central_extra;
    if (layout.central_zip64) {
      const bool truncated = layout.truncated_central && term_bank;
      put<uint16_t>(central_extra, 0x0001);
      put<uint16_t>(central_extra, truncated ? 16 : 24);
      put<uint64_t>(central_extra, size);
      put<uint64_t>(central_extra, size);
      if (!truncated) {
        put<uint64_t>(central_extra, offset);
      }
    }
    put<uint32_t>(central, 0x02014b50);
    put<uint16_t>(central, 45);
    put<uint16_t>(central, 45);
    put<uint16_t>(central, 0x0800);
    put<uint16_t>(central, 0);
    put<uint16_t>(central, 0);
    put<uint16_t>(central, 0);
    put<uint32_t>(central, crc);
    put<uint32_t>(central, layout.central_zip64 ? kSentinel : static_cast<uint32_t>(size));
    put<uint32_t>(central, layout.central_zip64 ? kSentinel : static_cast<uint32_t>(size));
    put<uint16_t>(central, static_cast<uint16_t>(name.size()));
    put<uint16_t>(central, static_cast<uint16_t>(central_extra.size()));
    put<uint16_t>(central, 0);
    put<uint16_t>(central, 0);
    put<uint16_t>(central, 0);
    put<uint32_t>(central, 0);
    put<uint32_t>(central, layout.central_zip64 ? kSentinel : static_cast<uint32_t>(offset));
    central += name;
    central += central_extra;
  }
  const uint64_t central_offset = out.size();
  out += central;
  const uint64_t eocd64_offset = out.size();
  put<uint32_t>(out, 0x06064b50);
  put<uint64_t>(out, 44);
  put<uint16_t>(out, 45);
  put<uint16_t>(out, 45);
  put<uint32_t>(out, 0);
  put<uint32_t>(out, 0);
  put<uint64_t>(out, files.size());
  put<uint64_t>(out, files.size());
  put<uint64_t>(out, central.size());
  put<uint64_t>(out, central_offset);
  put<uint32_t>(out, 0x07064b50);
  put<uint32_t>(out, 0);
  put<uint64_t>(out, eocd64_offset);
  put<uint32_t>(out, 1);
  put<uint32_t>(out, 0x06054b50);
  put<uint16_t>(out, 0);
  put<uint16_t>(out, 0);
  put<uint16_t>(out, 0xFFFF);
  put<uint16_t>(out, 0xFFFF);
  put<uint32_t>(out, kSentinel);
  put<uint32_t>(out, kSentinel);
  put<uint16_t>(out, 0);
  return out;
}

int failures = 0;

void check(bool ok, const std::string& what) {
  if (!ok) {
    ++failures;
    std::fprintf(stderr, "FAIL: %s\n", what.c_str());
  }
}

const std::vector<std::pair<std::string, std::string>> kFiles = {
    {"index.json", R"({"title":"zip64-test","format":3,"revision":"1"})"},
    {"term_bank_1.json", R"([["辞書","じしょ","","",0,["dictionary"],1,""]])"},
};

ImportResult import_archive(const std::filesystem::path& root, const std::string& name, const Layout& layout) {
  const std::filesystem::path zip_path = root / (name + ".zip");
  {
    const std::string zip = build_zip(kFiles, layout);
    std::ofstream f(zip_path, std::ios::binary);
    f.write(zip.data(), static_cast<std::streamsize>(zip.size()));
  }
  const std::filesystem::path out_dir = root / name;
  std::filesystem::create_directories(out_dir);
  return dictionary_importer::import(zip_path.string(), out_dir.string());
}

void check_imports(const std::filesystem::path& root, const std::string& name, const Layout& layout) {
  const ImportResult result = import_archive(root, name, layout);
  check(result.success, name + " imports: " + result.error);
  if (!result.success) {
    return;
  }
  DictionaryQuery query;
  check(query.add_term_dict((root / name / result.summary.title).string()), name + " add_term_dict");
  const auto terms = query.query("辞書");
  check(terms.size() == 1 && terms[0].glossaries.size() == 1 && terms[0].glossaries[0].glossary == R"(["dictionary"])",
        name + " reads its glossary through the Zip64 sizes");
}

}  // namespace

int main() {
  const std::filesystem::path root =
      std::filesystem::temp_directory_path() / ("hoshidicts-zip64-test-" + std::to_string(std::random_device{}()));
  std::filesystem::remove_all(root);
  std::filesystem::create_directories(root);

  check_imports(root, "zip64-both", {});
  check_imports(root, "zip64-central-only", {.local_zip64 = false, .local_field = true});
  check_imports(root, "zip64-local-only", {.central_zip64 = false});
  // zip.js with zip64 and no data descriptor.
  check_imports(root, "zip64-sentinel-without-local-field", {.local_zip64 = false, .local_field = false});

  {
    const ImportResult result = import_archive(root, "zip64-forged", {.forged_local_size = 4096});
    check(!result.success && result.error == "archive entry sizes disagree between headers",
          "a local Zip64 size that disagrees is refused: " + result.error);
  }
  {
    const ImportResult result = import_archive(root, "zip64-truncated", {.truncated_central = true});
    check(!result.success && result.error == "archive entry has an unreadable Zip64 extra field",
          "a Zip64 field without the offset it owes is refused: " + result.error);
  }

  std::filesystem::remove_all(root);
  if (failures == 0) {
    std::printf("zip64: all checks passed\n");
  }
  return failures == 0 ? 0 : 1;
}
