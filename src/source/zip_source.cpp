#include "zip_source.hpp"

#include <utility>

bool ZipSource::open(const std::filesystem::path& path) {
  if (!zip_.open(path)) {
    return false;
  }
  entries_.clear();
  entries_.reserve(zip_.entries.size());
  for (const auto& entry : zip_.entries) {
    entries_.push_back(SourceEntry{entry.name, entry.uncompressed_size});
  }
  return true;
}

int ZipSource::find(std::string_view name) const {
  for (int i = 0; i < static_cast<int>(entries_.size()); ++i) {
    if (entries_[static_cast<size_t>(i)].name == name) {
      return i;
    }
  }
  return -1;
}

std::string ZipSource::read(int index) const { return zip_.read(index); }

std::optional<SourceMediaFile> ZipSource::read_media(int index) const {
  auto media = zip_.read_media(index);
  if (!media.has_value()) {
    return std::nullopt;
  }
  return SourceMediaFile{std::move(media->path), std::move(media->blob)};
}
