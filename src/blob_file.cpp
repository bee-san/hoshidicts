#include "blob_file.hpp"

#include <algorithm>
#include <stdexcept>
#include <utility>

BlobFile::~BlobFile() { release(); }

BlobFile::BlobFile(BlobFile&& other) noexcept
    : mapping_(std::exchange(other.mapping_, {})),
      reader_(std::move(other.reader_)),
      cache_(std::move(other.cache_)),
      file_id_(std::exchange(other.file_id_, 0)),
      size_(std::exchange(other.size_, 0)), kind_(other.kind_) {}

BlobFile& BlobFile::operator=(BlobFile&& other) noexcept {
  if (this != &other) {
    release();
    mapping_ = std::exchange(other.mapping_, {});
    reader_ = std::move(other.reader_);
    cache_ = std::move(other.cache_);
    file_id_ = std::exchange(other.file_id_, 0);
    size_ = std::exchange(other.size_, 0);
    kind_ = other.kind_;
  }
  return *this;
}

BlobFile BlobFile::map(const std::filesystem::path& path) {
  BlobFile file;
  file.mapping_ = memory::map_rd(path);
  file.size_ = file.mapping_.size;
  return file;
}

BlobFile BlobFile::open(const std::filesystem::path& path, std::shared_ptr<memory::page_cache> cache,
                        memory::page_kind kind) {
  BlobFile file;
  file.reader_ = memory::file_reader::open(path);
  if (file.reader_) {
    file.cache_ = std::move(cache);
    file.file_id_ = memory::page_cache::new_file_id();
    file.size_ = file.reader_.size();
    file.kind_ = kind;
  }
  return file;
}

void BlobFile::copy(uint64_t offset, size_t length, void* out) const {
  if (offset > size_ || length > size_ - offset) {
    throw std::out_of_range("a dictionary file range runs past its end");
  }
  if (!paged()) {
    std::memcpy(out, mapping_.data + offset, length);
    return;
  }
  auto* dst = static_cast<uint8_t*>(out);
  const size_t page_bytes = cache_->page_bytes();
  while (length > 0) {
    const auto page = cache_->get(file_id_, reader_, offset / page_bytes, kind_);
    const size_t in_page = offset % page_bytes;
    const size_t n = std::min(length, page->size - in_page);
    std::memcpy(dst, page->data.get() + in_page, n);
    offset += n;
    dst += n;
    length -= n;
  }
  cache_->trim();
}

const uint8_t* BlobFile::paged_range(uint64_t offset, size_t length, BlobPins& pins) const {
  return BlobCursor(*this, offset, pins).bytes(length);
}

void BlobFile::release() {
  memory::unmap(std::exchange(mapping_, {}));
  if (cache_ != nullptr) {
    cache_->forget(file_id_);
    cache_.reset();
  }
  reader_ = {};
  size_ = 0;
}

BlobPins::Held::~Held() {
  const bool held = !pages.empty();
  pages.clear();
  if (held && cache != nullptr) {
    cache->trim();
  }
}

void BlobCursor::past_end() { throw std::out_of_range("a dictionary record runs past the end of blobs.bin"); }

void BlobCursor::require(uint64_t offset, size_t length) const {
  if (length > file_.size_ || offset > file_.size_ - length) {
    past_end();
  }
}

const memory::page& BlobCursor::pin(uint64_t index) {
  auto& held = pins_.get();
  held.cache = file_.cache_.get();
  held.pages.push_back(file_.cache_->get(file_.file_id_, file_.reader_, index, file_.kind_));
  return *held.pages.back();
}

const uint8_t* BlobCursor::bytes_slow(size_t length) {
  const uint64_t start = offset();
  require(start, length);
  const size_t page_bytes = file_.cache_->page_bytes();
  uint64_t index = start / page_bytes;
  const memory::page* page = &pin(index);
  size_t in_page = static_cast<size_t>(start - index * page_bytes);
  const uint8_t* result;
  if (page->size - in_page >= length) {
    result = page->data.get() + in_page;
    in_page += length;
  } else {
    // Followed, like a page, by the bytes that follow the range in the file.
    auto spill = std::make_unique_for_overwrite<uint8_t[]>(length + memory::page_cache::lookahead_bytes);
    size_t copied = 0;
    while (true) {
      const size_t n = std::min(length - copied, page->size - in_page);
      std::memcpy(spill.get() + copied, page->data.get() + in_page, n);
      copied += n;
      in_page += n;
      if (copied == length) {
        break;
      }
      page = &pin(++index);
      in_page = 0;
    }
    std::memcpy(spill.get() + length, page->data.get() + in_page, memory::page_cache::lookahead_bytes);
    result = spill.get();
    pins_.get().spills.push_back(std::move(spill));
  }
  // Carry on from the end of the range, inside the last page it touched.
  pos_ = page->data.get() + in_page;
  end_ = page->data.get() + page->size;
  end_offset_ = index * page_bytes + page->size;
  return result;
}

void BlobCursor::skip_slow(size_t length) {
  const uint64_t start = offset();
  require(start, length);
  // An empty window at the new offset; the next read pins its page.
  pos_ = end_ = nullptr;
  end_offset_ = start + length;
}
