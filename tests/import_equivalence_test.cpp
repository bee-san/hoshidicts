// Regression guard for the importer's output format.
//
// Imports tests/fixtures/yomitan/small_dict.zip into a fresh directory and
// checks the SHA-256 of every output file against tests/fixtures/yomitan/
// golden.sha256, which was produced by the importer before the DictionarySource
// seam existed. index.json is compared with its importDate removed. The import
// is run twice, normal and low_ram, and both must match the golden.
//
//   import_equivalence_test <small_dict.zip> <golden.sha256>
#include <array>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <map>
#include <random>
#include <regex>
#include <sstream>
#include <string>
#include <vector>

#include "hoshidicts/importer.hpp"

namespace {
// FIPS 180-4 SHA-256, enough for a test.
class Sha256 {
 public:
  void update(const uint8_t* data, size_t len) {
    total_ += len;
    while (len > 0) {
      const size_t take = std::min(len, buffer_.size() - buffered_);
      std::memcpy(buffer_.data() + buffered_, data, take);
      buffered_ += take;
      data += take;
      len -= take;
      if (buffered_ == buffer_.size()) {
        block(buffer_.data());
        buffered_ = 0;
      }
    }
  }

  std::string hex() {
    const uint64_t bits = total_ * 8;
    const uint8_t one = 0x80;
    update(&one, 1);
    const uint8_t zero = 0;
    while (buffered_ != 56) {
      update(&zero, 1);
    }
    std::array<uint8_t, 8> length{};
    for (int i = 0; i < 8; ++i) {
      length[static_cast<size_t>(i)] = static_cast<uint8_t>(bits >> (56 - 8 * i));
    }
    update(length.data(), length.size());
    std::string out;
    static const char digits[] = "0123456789abcdef";
    for (uint32_t word : state_) {
      for (int shift = 28; shift >= 0; shift -= 4) {
        out += digits[(word >> shift) & 0xf];
      }
    }
    return out;
  }

 private:
  static uint32_t rotr(uint32_t x, int n) { return (x >> n) | (x << (32 - n)); }

  void block(const uint8_t* p) {
    static constexpr std::array<uint32_t, 64> k = {
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2};
    std::array<uint32_t, 64> w{};
    for (size_t i = 0; i < 16; ++i) {
      w[i] = (uint32_t{p[4 * i]} << 24) | (uint32_t{p[4 * i + 1]} << 16) | (uint32_t{p[4 * i + 2]} << 8) |
             uint32_t{p[4 * i + 3]};
    }
    for (size_t i = 16; i < 64; ++i) {
      const uint32_t s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >> 3);
      const uint32_t s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >> 10);
      w[i] = w[i - 16] + s0 + w[i - 7] + s1;
    }
    uint32_t a = state_[0], b = state_[1], c = state_[2], d = state_[3];
    uint32_t e = state_[4], f = state_[5], g = state_[6], h = state_[7];
    for (size_t i = 0; i < 64; ++i) {
      const uint32_t s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const uint32_t ch = (e & f) ^ (~e & g);
      const uint32_t t1 = h + s1 + ch + k[i] + w[i];
      const uint32_t s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const uint32_t maj = (a & b) ^ (a & c) ^ (b & c);
      const uint32_t t2 = s0 + maj;
      h = g;
      g = f;
      f = e;
      e = d + t1;
      d = c;
      c = b;
      b = a;
      a = t1 + t2;
    }
    state_[0] += a;
    state_[1] += b;
    state_[2] += c;
    state_[3] += d;
    state_[4] += e;
    state_[5] += f;
    state_[6] += g;
    state_[7] += h;
  }

  std::array<uint32_t, 8> state_ = {0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                                    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19};
  std::array<uint8_t, 64> buffer_{};
  size_t buffered_ = 0;
  uint64_t total_ = 0;
};

std::string read_file(const std::filesystem::path& path) {
  std::ifstream in(path, std::ios::binary);
  std::ostringstream out;
  out << in.rdbuf();
  return out.str();
}

std::string sha256_hex(std::string data) {
  Sha256 sha;
  sha.update(reinterpret_cast<const uint8_t*>(data.data()), data.size());
  return sha.hex();
}

// The import date is the only thing that legitimately differs between runs.
std::string strip_import_date(std::string json) {
  static const std::regex import_date(R"("importDate":\d+)");
  return std::regex_replace(json, import_date, R"("importDate":0)");
}

std::map<std::string, std::string> load_golden(const std::filesystem::path& path) {
  std::map<std::string, std::string> golden;
  std::ifstream in(path);
  std::string line;
  while (std::getline(in, line)) {
    if (line.empty() || line[0] == '#') {
      continue;
    }
    const size_t split = line.find_first_of(" \t");
    if (split == std::string::npos) {
      continue;
    }
    const std::string hash = line.substr(0, split);
    const size_t name_start = line.find_first_not_of(" \t*", split);
    golden[line.substr(name_start)] = hash;
  }
  return golden;
}

std::filesystem::path fresh_temp_dir(const char* tag) {
  std::random_device rd;
  const auto dir = std::filesystem::temp_directory_path() /
                   ("hoshidicts-eq-" + std::string(tag) + "-" + std::to_string(rd()));
  std::filesystem::create_directories(dir);
  return dir;
}

int check_import(const std::string& fixture, const std::map<std::string, std::string>& golden, bool low_ram) {
  const auto out_dir = fresh_temp_dir(low_ram ? "lowram" : "normal");
  int failures = 0;
  const ImportResult result = dictionary_importer::import(fixture, out_dir.string(), low_ram);
  if (!result.success) {
    std::printf("FAIL low_ram=%d import failed: %s\n", low_ram, result.error.c_str());
    std::filesystem::remove_all(out_dir);
    return 1;
  }
  const auto dict_dir = out_dir / result.title;

  std::map<std::string, std::string> actual;
  for (const auto& entry : std::filesystem::directory_iterator(dict_dir)) {
    std::string data = read_file(entry.path());
    const std::string name = entry.path().filename().string();
    if (name == "index.json") {
      data = strip_import_date(std::move(data));
    }
    actual[name] = sha256_hex(std::move(data));
  }

  for (const auto& [name, hash] : golden) {
    auto it = actual.find(name);
    if (it == actual.end()) {
      std::printf("FAIL low_ram=%d missing output %s\n", low_ram, name.c_str());
      failures++;
    } else if (it->second != hash) {
      std::printf("FAIL low_ram=%d %s\n  expected %s\n  actual   %s\n", low_ram, name.c_str(), hash.c_str(),
                  it->second.c_str());
      failures++;
    }
  }
  for (const auto& [name, hash] : actual) {
    if (!golden.contains(name)) {
      std::printf("FAIL low_ram=%d unexpected output %s (%s)\n", low_ram, name.c_str(), hash.c_str());
      failures++;
    }
  }

  std::filesystem::remove_all(out_dir);
  if (failures == 0) {
    std::printf("ok low_ram=%d %zu files match\n", low_ram, golden.size());
  }
  return failures;
}
}

int main(int argc, char** argv) {
  if (argc < 3) {
    std::printf("usage: %s <small_dict.zip> <golden.sha256>\n", argv[0]);
    return 2;
  }
  // Known-answer check so a broken hash cannot make everything "match".
  if (sha256_hex("abc") != "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad") {
    std::printf("FAIL sha256 self test\n");
    return 1;
  }
  const auto golden = load_golden(argv[2]);
  if (golden.empty()) {
    std::printf("FAIL no golden hashes in %s\n", argv[2]);
    return 1;
  }
  int failures = 0;
  failures += check_import(argv[1], golden, false);
  failures += check_import(argv[1], golden, true);
  return failures == 0 ? 0 : 1;
}
