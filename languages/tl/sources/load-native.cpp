// SPDX-License-Identifier: GPL-3.0-or-later
// Native pack load time and heap for README.md (Measurements, Performance).
// Not built by CMake and not run by any test. Build it against a configured
// build, as sources/lookup-batch.cpp:
//
//   g++ -O2 -std=c++23 -Iinclude languages/tl/sources/load-native.cpp -o build/tl-load-native \
//     build/libhoshidicts.a build/external/zstd/build/cmake/lib/libzstd.a \
//     build/external/libdeflate/libdeflate.a build/external/utf8proc/libutf8proc.a \
//     build/liblzokay.a build/libgumbo.a
//
//   build/tl-load-native languages/tl
//
// Parses the pack's language.json and transforms.json into a fresh
// LanguageRegistry 51 times, drops the first run, and prints the median and
// minimum of the other 50 and the heap the last registry holds (glibc's
// mallinfo2, bytes in use after the add minus before it).
#include <algorithm>
#include <chrono>
#include <fstream>
#include <iostream>
#include <malloc.h>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

#include "hoshidicts/languages.hpp"

static std::string read(const std::string& path) {
    std::ifstream f(path, std::ios::binary);
    std::stringstream s;
    s << f.rdbuf();
    return s.str();
}

int main(int argc, char** argv) {
    if (argc != 2) {
        std::cerr << "usage: tl-load-native <pack directory>\n";
        return 2;
    }
    const std::string language = read(std::string(argv[1]) + "/language.json");
    const std::string transforms = read(std::string(argv[1]) + "/transforms.json");
    std::vector<double> times;
    size_t heap = 0;
    for (int i = 0; i < 51; i++) {
        const size_t before = mallinfo2().uordblks;
        const auto start = std::chrono::steady_clock::now();
        auto registry = std::make_unique<hoshidicts::LanguageRegistry>();
        std::string error;
        if (!registry->add(language, transforms, &error)) {
            std::cerr << error << "\n";
            return 1;
        }
        const auto end = std::chrono::steady_clock::now();
        heap = mallinfo2().uordblks - before;
        if (i > 0) {
            times.push_back(std::chrono::duration<double, std::milli>(end - start).count());
        }
    }
    std::sort(times.begin(), times.end());
    std::cout << "median " << times[times.size() / 2] << " ms, min " << times.front() << " ms; heap " << heap << " bytes\n";
    return 0;
}
