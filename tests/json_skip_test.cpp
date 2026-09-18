// Differential test: skip_json_array must stop exactly where glaze's raw_json_view
// skip stops (or fail exactly when it fails) on generated arrays with nested
// values, strings full of quotes, brackets and backslash runs straddling the
// 64-byte blocks, multibyte text, and truncated input.
#include "json/json_skip.hpp"
#include <cstdio>
#include <random>
#include <string>
#include <vector>

static std::string gen(std::mt19937& rng, int depth) {
  std::uniform_int_distribution<int> kind(0, 9);
  std::string s = "[";
  int n = std::uniform_int_distribution<int>(0, 6)(rng);
  for (int i = 0; i < n; ++i) {
    if (i) s += ",";
    int k = kind(rng);
    if (k < 4 || depth > 4) {
      // string with random content including quotes, brackets, backslash runs, multibyte
      s += '"';
      int len = std::uniform_int_distribution<int>(0, 150)(rng);
      for (int j = 0; j < len; ++j) {
        int c = std::uniform_int_distribution<int>(0, 12)(rng);
        switch (c) {
          case 0: s += "\\\""; break;
          case 1: s += "\\\\"; break;
          case 2: { int run = std::uniform_int_distribution<int>(1, 9)(rng); for (int r = 0; r < run; ++r) s += "\\\\"; if (rng() & 1) s += "\\\""; break; }
          case 3: s += "["; break;
          case 4: s += "]"; break;
          case 5: s += "\\u30c6"; break;
          case 6: s += "テスト"; break;
          case 7: s += "\\n"; break;
          default: s += char('a' + (rng() % 26)); break;
        }
      }
      s += '"';
    } else if (k < 6) {
      s += std::to_string(int(rng() % 1000));
    } else if (k < 8) {
      s += gen(rng, depth + 1);
    } else {
      s += "{\"k\":" + gen(rng, depth + 1) + ",\"x\":\"]]][[\\\"\"}";
    }
  }
  s += "]";
  return s;
}

int main() {
  std::mt19937 rng(12345);
  long cases = 0, mismatches = 0;
  for (int iter = 0; iter < 200000; ++iter) {
    std::string doc = gen(rng, 0);
    // pad with a tail so the value is followed by more input, like in a bank
    std::string buf = doc + ",\"tail\",[1,2]]";
    // sometimes truncate to test the unexpected-end path
    bool truncated = (iter % 7 == 0);
    if (truncated) buf = doc.substr(0, std::uniform_int_distribution<size_t>(0, doc.size() - 1)(rng));
    const char* begin = buf.data();
    const char* end = buf.data() + buf.size();
    const char* mine = hoshidicts::skip_json_array(begin, end);
    glz::raw_json_view ref;
    glz::context ctx{};
    const char* it = begin;
    glz::from<glz::JSON, glz::raw_json_view>::op<glz::opts{}>(ref, ctx, it, end);
    bool ref_ok = !bool(ctx.error);
    const char* ref_end = ref_ok ? it : nullptr;
    ++cases;
    if ((mine == nullptr) != (ref_end == nullptr) || (mine && mine != ref_end)) {
      ++mismatches;
      if (mismatches <= 5) {
        std::printf("MISMATCH truncated=%d mine=%ld ref=%ld doc=%.*s\n", truncated, mine ? long(mine - begin) : -1L,
                    ref_end ? long(ref_end - begin) : -1L, int(std::min<size_t>(buf.size(), 300)), buf.data());
      }
    }
  }
  std::printf("cases=%ld mismatches=%ld\n", cases, mismatches);
  return mismatches ? 1 : 0;
}
