// A streaming ZIP writer sets general-purpose bit 3, leaves CRC and sizes zero
// in each local header, and writes them in a data descriptor after the data
// (APPNOTE 4.3.9, 4.4.4). Readers take the sizes from the central directory, as
// Yomitan's zip.js does (bee-san/hachidori#491). Requires that such an archive
// imports and answers a lookup, also when its local headers zero only the
// compressed size, and that a local header which records a size still has to
// agree with the central directory, with or without bit 3.
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

struct Layout {
  bool descriptor = true;           // set bit 3 and write a signed data descriptor
  uint32_t forged_local_size = 0;   // when nonzero, record this local size for the term bank
  bool local_uncompressed = false;  // with bit 3, record only the uncompressed size locally
};

// A stored (method 0) ZIP: local headers, then the central directory, then EOCD.
std::string build_zip(const std::vector<std::pair<std::string, std::string>>& files, const Layout& layout) {
  const uint16_t flags = layout.descriptor ? 0x0808 : 0x0800;
  std::string out;
  std::string central;
  for (const auto& [name, data] : files) {
    const uint32_t offset = static_cast<uint32_t>(out.size());
    const uint32_t crc = crc32(data);
    const uint32_t size = static_cast<uint32_t>(data.size());
    const bool forged = layout.forged_local_size != 0 && name == "term_bank_1.json";
    const uint32_t local_size = forged ? layout.forged_local_size : layout.descriptor ? 0 : size;
    put<uint32_t>(out, 0x04034b50);
    put<uint16_t>(out, 20);
    put<uint16_t>(out, flags);
    put<uint16_t>(out, 0);  // stored
    put<uint16_t>(out, 0);
    put<uint16_t>(out, 0);
    put<uint32_t>(out, layout.descriptor ? 0 : crc);
    put<uint32_t>(out, local_size);
    put<uint32_t>(out, layout.local_uncompressed ? size : local_size);
    put<uint16_t>(out, static_cast<uint16_t>(name.size()));
    put<uint16_t>(out, 0);
    out += name;
    out += data;
    if (layout.descriptor) {
      put<uint32_t>(out, 0x08074b50);
      put<uint32_t>(out, crc);
      put<uint32_t>(out, size);
      put<uint32_t>(out, size);
    }

    put<uint32_t>(central, 0x02014b50);
    put<uint16_t>(central, 20);
    put<uint16_t>(central, 20);
    put<uint16_t>(central, flags);
    put<uint16_t>(central, 0);
    put<uint16_t>(central, 0);
    put<uint16_t>(central, 0);
    put<uint32_t>(central, crc);
    put<uint32_t>(central, size);
    put<uint32_t>(central, size);
    put<uint16_t>(central, static_cast<uint16_t>(name.size()));
    put<uint16_t>(central, 0);
    put<uint16_t>(central, 0);
    put<uint16_t>(central, 0);
    put<uint16_t>(central, 0);
    put<uint32_t>(central, 0);
    put<uint32_t>(central, offset);
    central += name;
  }
  const uint32_t central_offset = static_cast<uint32_t>(out.size());
  out += central;
  put<uint32_t>(out, 0x06054b50);
  put<uint16_t>(out, 0);
  put<uint16_t>(out, 0);
  put<uint16_t>(out, static_cast<uint16_t>(files.size()));
  put<uint16_t>(out, static_cast<uint16_t>(files.size()));
  put<uint32_t>(out, static_cast<uint32_t>(central.size()));
  put<uint32_t>(out, central_offset);
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
    {"index.json", R"({"title":"descriptor-test","format":3,"revision":"1"})"},
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

}  // namespace

int main() {
  const std::filesystem::path root = std::filesystem::temp_directory_path() /
                                     ("hoshidicts-data-descriptor-test-" + std::to_string(std::random_device{}()));
  std::filesystem::remove_all(root);
  std::filesystem::create_directories(root);

  {
    const ImportResult result = import_archive(root, "descriptor", {});
    check(result.success, "a data-descriptor archive imports: " + result.error);
    check(result.summary.counts.terms.total == 1,
          "it imports its one term, got " + std::to_string(result.summary.counts.terms.total));
    if (result.success) {
      DictionaryQuery query;
      check(query.add_term_dict((root / "descriptor" / result.summary.title).string()), "add_term_dict");
      const auto terms = query.query("辞書");
      check(terms.size() == 1, "one result for 辞書");
      check(!terms.empty() && terms[0].glossaries.size() == 1 && terms[0].glossaries[0].glossary == R"(["dictionary"])",
            "the glossary reads back from the central directory's sizes");
    }
  }

  {
    // The NHK日本語発音アクセント新辞典 archive (bee-san/hachidori#512) sets bit 3
    // and zeroes only the compressed size.
    const ImportResult result = import_archive(root, "uncompressed-known", {.local_uncompressed = true});
    check(result.success, "a bit-3 local header that records only the uncompressed size imports: " + result.error);
  }

  {
    const ImportResult result =
        import_archive(root, "forged-descriptor", {.descriptor = true, .forged_local_size = 4096});
    check(!result.success, "a bit-3 local header that records other sizes is refused");
    check(result.error == "archive entry sizes disagree between headers",
          "the bit-3 disagreement names the size check, got: " + result.error);
  }

  {
    const ImportResult result = import_archive(root, "forged-plain", {.descriptor = false, .forged_local_size = 4096});
    check(!result.success, "a local header without bit 3 that records other sizes is refused");
    check(result.error == "archive entry sizes disagree between headers",
          "the plain disagreement names the size check, got: " + result.error);
  }

  std::filesystem::remove_all(root);
  if (failures == 0) {
    std::printf("data-descriptor: all checks passed\n");
  }
  return failures == 0 ? 0 : 1;
}
