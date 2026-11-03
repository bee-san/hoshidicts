// SPDX-License-Identifier: GPL-3.0-or-later
// Native pack load time and heap (README.md, Measurements 5): parses a pack's
// language.json and transforms.json with LanguageRegistry::add five times and
// prints the time of each and the heap it holds (glibc mallinfo2), as
// sources/wasm-load.mjs does for Hachidori's WebAssembly engine.
//
//   g++ -O2 -std=c++23 -Iinclude languages/zh/sources/load-time.cpp -o build/zh-load-time \
//       build/libhoshidicts.a build/external/zstd/build/cmake/lib/libzstd.a \
//       build/external/libdeflate/libdeflate.a build/external/utf8proc/libutf8proc.a \
//       build/liblzokay.a build/libgumbo.a
//   build/zh-load-time languages/zh
#include <malloc.h>

#include <chrono>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>

#include "hoshidicts/languages.hpp"

static std::string read(const std::string& path) {
    std::ifstream f(path, std::ios::binary);
    std::stringstream s;
    s << f.rdbuf();
    return s.str();
}

int main(int argc, char** argv) {
    if (argc != 2) {
        std::cerr << "usage: zh-load-time <pack directory>\n";
        return 2;
    }
    const std::string dir = argv[1];
    const std::string language = read(dir + "/language.json");
    const std::string transforms = read(dir + "/transforms.json");
    for (int i = 0; i < 5; ++i) {
        const struct mallinfo2 before = mallinfo2();
        const auto start = std::chrono::steady_clock::now();
        hoshidicts::LanguageRegistry registry;
        std::string error;
        if (!registry.add(language, transforms, &error)) {
            std::cerr << error << "\n";
            return 1;
        }
        const auto end = std::chrono::steady_clock::now();
        const struct mallinfo2 after = mallinfo2();
        std::cout << "load " << std::chrono::duration<double, std::milli>(end - start).count() << " ms, heap +"
                  << static_cast<double>(after.uordblks - before.uordblks) / 1024.0 / 1024.0 << " MiB\n";
    }
}
