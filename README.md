# English Stories for Kids 🎈

Thư viện truyện hoạt hình tiếng Anh cho bé (Level 1 + 2) — card có ảnh, tìm theo tên,
click mở player có phụ đề bật/tắt.

- **Site**: static HTML/CSS/JS, deploy GitHub Pages.
- **Media** (video MP4 + phụ đề VTT + thumbnail): Cloudflare R2 (`pub-…r2.dev`), tự chứa, độc lập với site.
- **Catalog**: `data/catalog.json` (25 chủ đề, 1389 tập).

Đổi nguồn media: sửa `VIDEO_BASE` trong `app.js`.
