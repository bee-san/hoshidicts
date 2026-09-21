// Unit tests for mdict::Reader against the fixtures written by
// tests/fixtures/mdict/gen_fixtures.py.
//
//   mdict_reader_test <tests/fixtures/mdict>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <random>
#include <string>
#include <vector>

#include "mdict/mdict_reader.hpp"
#include "mdict/ripemd128.hpp"

namespace {
int failures = 0;
std::filesystem::path fixtures;

void check(bool ok, const std::string& what) {
  if (!ok) {
    std::printf("FAIL %s\n", what.c_str());
    failures++;
  }
}

template <class T>
void check_eq(const T& actual, const T& expected, const std::string& what) {
  if (actual != expected) {
    std::printf("FAIL %s\n", what.c_str());
    if constexpr (std::is_convertible_v<T, std::string>) {
      std::printf("  expected: %s\n  actual:   %s\n", std::string(expected).c_str(), std::string(actual).c_str());
    } else {
      std::printf("  expected: %s\n  actual:   %s\n", std::to_string(expected).c_str(),
                  std::to_string(actual).c_str());
    }
    failures++;
  }
}

std::string hex(const std::array<uint8_t, 16>& digest) {
  std::string out;
  for (uint8_t b : digest) {
    char buf[3];
    std::snprintf(buf, sizeof buf, "%02x", b);
    out += buf;
  }
  return out;
}

// Reads every record of the file through the block-cursor API.
std::vector<std::pair<std::string, std::string>> all_records(const mdict::Reader& reader, bool text) {
  const std::vector<mdict::KeyEntry> keys = reader.read_all_keys();
  std::vector<std::pair<std::string, std::string>> out;
  size_t block_index = static_cast<size_t>(-1);
  std::vector<uint8_t> block;
  for (size_t i = 0; i < keys.size(); ++i) {
    const uint64_t next = i + 1 < keys.size() ? keys[i + 1].record_offset : reader.record_space_size();
    const size_t wanted = reader.record_block_for(keys[i].record_offset);
    if (wanted != block_index) {
      block = reader.read_record_block(wanted);
      block_index = wanted;
    }
    const std::string_view record = reader.record_in_block(block, block_index, keys[i].record_offset, next);
    out.emplace_back(keys[i].key, text ? reader.record_text(record) : std::string(record));
  }
  return out;
}

void expect_text_fixture(const mdict::Reader& reader, const std::string& name) {
  check_eq<uint64_t>(reader.key_count(), 4, name + ": key count");
  const auto records = all_records(reader, true);
  check_eq<size_t>(records.size(), 4, name + ": record count");
  if (records.size() != 4) {
    return;
  }
  check_eq<std::string>(records[0].first, "alpha", name + ": key 0");
  check_eq<std::string>(records[0].second, "first definition", name + ": record 0");
  check_eq<std::string>(records[1].first, "beta", name + ": key 1");
  check_eq<std::string>(records[1].second, "second\ndefinition with newline", name + ": record 1");
  check_eq<std::string>(records[2].second, "third", name + ": record 2");
  check_eq<std::string>(records[3].first, "日本語", name + ": unicode key");
  check_eq<std::string>(records[3].second, "Japanese text \"quoted\"", name + ": record 3");
}

void test_ripemd128() {
  check_eq<std::string>(hex(mdict::ripemd128(nullptr, 0)), "cdf26213a150dc3ecb610f18f6b38b46", "ripemd128 empty");
  const std::string abc = "abc";
  check_eq<std::string>(hex(mdict::ripemd128(reinterpret_cast<const uint8_t*>(abc.data()), abc.size())),
                        "c14a12199c66e4ba84636b0f69144c77", "ripemd128 abc");
  const std::string md = "message digest";
  check_eq<std::string>(hex(mdict::ripemd128(reinterpret_cast<const uint8_t*>(md.data()), md.size())),
                        "9e327b3d6e523062afc1132d7df9d1b8", "ripemd128 message digest");
  const std::string eighty = "12345678901234567890123456789012345678901234567890123456789012345678901234567890";
  check_eq<std::string>(hex(mdict::ripemd128(reinterpret_cast<const uint8_t*>(eighty.data()), eighty.size())),
                        "3f45ef194732c2dbb2c4a2c769795fa3", "ripemd128 two blocks");
}

void test_v2_text() {
  mdict::Reader reader;
  reader.open(fixtures / "v2_utf8_zlib_text.mdx");
  const auto& h = reader.header();
  check(h.kind == mdict::Kind::Mdx, "v2 text: kind");
  check_eq<std::string>(h.engine_version, "2.0", "v2 text: engine version");
  check(h.encoding == mdict::Encoding::Utf8, "v2 text: encoding");
  check_eq<std::string>(h.format, "Text", "v2 text: format");
  check_eq<std::string>(h.title, "Text Fixture", "v2 text: title");
  check_eq<std::string>(h.description, "A <b>text</b> fixture &amp; entities", "v2 text: description unescaped");
  check_eq<int>(h.encrypted, 0, "v2 text: encrypted");
  check(h.compact, "v2 text: compact");
  check_eq<size_t>(reader.key_blocks().size(), 2, "v2 text: key block count (3 per block)");
  check_eq<std::string>(reader.key_blocks()[0].first_key, "alpha", "v2 text: first key of block 0");
  check_eq<std::string>(reader.key_blocks()[0].last_key, "gamma", "v2 text: last key of block 0");
  expect_text_fixture(reader, "v2 text");
}

void test_v2_lzo_html() {
  mdict::Reader reader;
  reader.open(fixtures / "v2_utf8_lzo_html.mdx");
  check_eq<std::string>(reader.header().format, "Html", "v2 html: format");
  check_eq<std::string>(reader.header().stylesheet, "1\n<b>\n</b>\n2\n<i>\n</i>\n", "v2 html: stylesheet");
  check_eq<uint64_t>(reader.key_count(), 9, "v2 html: key count");
  check_eq<size_t>(reader.key_blocks().size(), 3, "v2 html: key blocks");
  check(reader.record_blocks().size() >= 2, "v2 html: several record blocks");
  const auto records = all_records(reader, true);
  check_eq<size_t>(records.size(), 9, "v2 html: record count");
  if (records.size() != 9) {
    return;
  }
  check_eq<std::string>(records[1].first, "alias", "v2 html: alias key");
  check_eq<std::string>(records[1].second, "@@@LINK=@@@LINK_target\r\n", "v2 html: link record");
  check_eq<std::string>(records[2].first, "dup", "v2 html: duplicate key 1");
  check_eq<std::string>(records[3].first, "dup", "v2 html: duplicate key 2");
  check_eq<std::string>(records[3].second, "<p class=\"a\">second dup</p>", "v2 html: duplicate record kept apart");
  check_eq<std::string>(records[6].second,
                        "<table><tr><td><ruby>漢<rt>かん</rt></ruby></td></tr></table><img src=\"img/pic.png\">",
                        "v2 html: LZO record");
  check_eq<std::string>(records[7].first, "食べる", "v2 html: unicode key");
  check_eq<std::string>(records[7].second, "`1`to eat`2` (ichidan)", "v2 html: backtick styles untouched");

  // Reading one key block at a time gives the same keys as read_all_keys.
  std::vector<mdict::KeyEntry> block1;
  reader.read_key_block(1, block1);
  check_eq<size_t>(block1.size(), 3, "v2 html: block 1 has 3 keys");
  if (block1.size() == 3) {
    check_eq<std::string>(block1[0].key, "dup", "v2 html: block 1 starts at second dup");
  }
}

void test_v2_utf16_encrypted() {
  mdict::Reader reader;
  reader.open(fixtures / "v2_utf16_encrypted2.mdx");
  check(reader.header().encoding == mdict::Encoding::Utf16le, "utf16: encoding");
  check_eq<int>(reader.header().encrypted, 2, "utf16: encrypted flag");
  check_eq<std::string>(reader.key_blocks()[1].first_key, "日本語", "utf16: index key decoded");
  expect_text_fixture(reader, "utf16 encrypted");
}

void test_v1() {
  mdict::Reader reader;
  reader.open(fixtures / "v1_utf8_stored.mdx");
  check_eq<std::string>(reader.header().engine_version, "1.2", "v1: engine version");
  check_eq<std::string>(reader.header().title, "V1 Fixture", "v1: title");
  expect_text_fixture(reader, "v1");
}

void test_mdd() {
  mdict::Reader reader;
  reader.open(fixtures / "v2_utf8_lzo_html.mdd");
  check(reader.header().kind == mdict::Kind::Mdd, "mdd: kind");
  check(reader.header().encoding == mdict::Encoding::Utf16le, "mdd: keys are UTF-16");
  const auto records = all_records(reader, false);
  check_eq<size_t>(records.size(), 5, "mdd: record count");
  if (records.size() != 4) {
    return;
  }
  check_eq<std::string>(records[0].first, "\\a.spx", "mdd: key 0");
  check_eq<std::string>(records[0].second, "not really speex", "mdd: raw record");
  check_eq<std::string>(records[1].first, "\\img\\pic.png", "mdd: key 1");
  check_eq<size_t>(records[1].second.size(), 69, "mdd: png size");
  check(records[1].second.starts_with("\x89PNG"), "mdd: png bytes");
  check_eq<std::string>(records[3].first, "\\..\\evil.png", "mdd: traversal key is delivered verbatim");
}

void expect_open_fails(const char* file, const std::string& needle) {
  mdict::Reader reader;
  try {
    reader.open(fixtures / file);
    // Opening only reads the indexes; a bad record block shows up when read.
    for (size_t i = 0; i < reader.record_blocks().size(); ++i) {
      reader.read_record_block(i);
    }
    check(false, std::string(file) + ": expected an error containing \"" + needle + "\"");
  } catch (const mdict::Error& e) {
    const std::string message = e.what();
    check(message.find(needle) != std::string::npos,
          std::string(file) + ": error \"" + message + "\" does not mention \"" + needle + "\"");
  }
}

void test_malformed() {
  expect_open_fails("bad_truncated.mdx", "truncated file");
  expect_open_fails("bad_adler.mdx", "Adler-32");
  expect_open_fails("bad_huge_block.mdx", "impossible size");
  expect_open_fails("bad_encrypted1.mdx", "registration-protected");
  expect_open_fails("bad_gbk.mdx", "unsupported MDX encoding: GBK");
  expect_open_fails("bad_v3.mdx", "unsupported MDX engine version 3.0");
  expect_open_fails("does_not_exist.mdx", "could not open");
}

void test_sniff() {
  auto head = [](const std::filesystem::path& path) {
    std::ifstream in(path, std::ios::binary);
    std::vector<uint8_t> bytes(64);
    in.read(reinterpret_cast<char*>(bytes.data()), static_cast<std::streamsize>(bytes.size()));
    bytes.resize(static_cast<size_t>(in.gcount()));
    return bytes;
  };
  auto mdx = head(fixtures / "v2_utf8_zlib_text.mdx");
  check(mdict::looks_like_mdict(mdx.data(), mdx.size()), "sniff: mdx");
  auto mdd = head(fixtures / "v2_utf8_lzo_html.mdd");
  check(mdict::looks_like_mdict(mdd.data(), mdd.size()), "sniff: mdd");
  auto zip = head(fixtures / ".." / "yomitan" / "small_dict.zip");
  check(!mdict::looks_like_mdict(zip.data(), zip.size()), "sniff: zip is not mdict");
  const uint8_t junk[] = {0, 0, 0, 0};
  check(!mdict::looks_like_mdict(junk, sizeof junk), "sniff: zeros");
}

void test_utf16() {
  const uint8_t text[] = {0x3d, 0xd8, 0x00, 0xde, 0x41, 0x00, 0x00, 0xdc};  // U+1F600, 'A', lone low surrogate
  check_eq<std::string>(mdict::utf16le_to_utf8(text, sizeof text), "\xf0\x9f\x98\x80" "A" "\xef\xbf\xbd",
                        "utf16: surrogate pair, ascii, lone surrogate");
}

// Corrupt the fixtures at random positions; every outcome must be either a
// clean read or an mdict::Error, never a crash or another exception type.
void test_mutations() {
  std::mt19937 rng(20260921);
  const std::filesystem::path scratch =
      std::filesystem::temp_directory_path() / ("hoshidicts-mdict-mutation-" + std::to_string(rng()));
  std::filesystem::create_directories(scratch);
  const char* sources[] = {"v2_utf8_zlib_text.mdx", "v2_utf8_lzo_html.mdx", "v2_utf16_encrypted2.mdx",
                           "v1_utf8_stored.mdx", "v2_utf8_lzo_html.mdd"};
  size_t clean = 0;
  size_t rejected = 0;
  for (const char* source : sources) {
    std::ifstream in(fixtures / source, std::ios::binary);
    std::vector<char> original((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
    for (int round = 0; round < 400; ++round) {
      std::vector<char> mutated = original;
      const int flips = 1 + static_cast<int>(rng() % 4);
      for (int f = 0; f < flips; ++f) {
        mutated[rng() % mutated.size()] = static_cast<char>(rng());
      }
      if (round % 50 == 49) {
        mutated.resize(rng() % mutated.size());
      }
      const auto path = scratch / "mutant.mdx";
      {
        std::ofstream out(path, std::ios::binary | std::ios::trunc);
        out.write(mutated.data(), static_cast<std::streamsize>(mutated.size()));
      }
      try {
        mdict::Reader reader;
        reader.open(path);
        all_records(reader, reader.header().kind == mdict::Kind::Mdx);
        clean++;
      } catch (const mdict::Error&) {
        rejected++;
      } catch (const std::exception& e) {
        check(false, std::string("mutation of ") + source + " escaped as " + e.what());
      }
    }
  }
  std::filesystem::remove_all(scratch);
  std::printf("mutations: %zu read cleanly, %zu rejected\n", clean, rejected);
}
}

int main(int argc, char** argv) {
  if (argc < 2) {
    std::printf("usage: %s <fixture dir>\n", argv[0]);
    return 2;
  }
  fixtures = argv[1];
  test_ripemd128();
  test_utf16();
  test_v2_text();
  test_v2_lzo_html();
  test_v2_utf16_encrypted();
  test_v1();
  test_mdd();
  test_malformed();
  test_sniff();
  test_mutations();
  if (failures == 0) {
    std::printf("ok\n");
  }
  return failures == 0 ? 0 : 1;
}
