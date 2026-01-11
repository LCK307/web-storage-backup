# 💾 Web Storage Backup & Restore

Userscript giúp **sao lưu / khôi phục** toàn bộ dữ liệu trình duyệt: `localStorage`, `sessionStorage`, `cookies`, `IndexedDB`, `Cache Storage`, `Service Workers` với **mã hóa AES‑256‑GCM** và **nén GZIP**.

![Version](https://img.shields.io/badge/version-4.2-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## 📥 Cài Đặt

1. Cài extension [Tampermonkey](https://www.tampermonkey.net/) cho trình duyệt
2. Click vào link: **[Cài đặt script](https://raw.githubusercontent.com/LCK307/web-storage-backup/main/web-storage-backup.user.js)**
3. Nhấn **Install**
4. Hoàn tất! Nút 💾 sẽ xuất hiện góc phải dưới màn hình

---

## ✨ Có Gì Mới (v4.2)

| Tính năng | Mô tả |
|-----------|-------|
| 📝 **Xuất Text → Clipboard** | Copy từng loại storage hoặc tất cả ra clipboard (dưới dạng text/base64, có nén/mã hóa tuỳ chọn) |
| 📂 **Xuất file riêng từng loại** | Xuất từng loại storage ra file riêng biệt |
| ❌ **Loại bỏ "Copy tất cả (Base64)"** | Đã gộp vào tính năng "Xuất Text → Clipboard" |
| 💽 **Cache Storage** | Xuất/Nhập đầy đủ, hỗ trợ binary (images, audio, video) |
| ⚙️ **Service Workers** | Lưu thông tin registrations (scope, scriptURL, state) |
| 🗄️ **IndexedDB nâng cấp** | Hỗ trợ keyPath, autoIncrement, indexes đầy đủ |
| 🎨 **UI cải tiến** | Giao diện đẹp hơn với animations |
| 🗑️ **Xóa chi tiết** | Xóa riêng từng loại storage |
| 📊 **Thống kê chi tiết** | Hiển thị tên databases, caches |

---

## 🔐 Bảo Mật

| Thành phần | Mô tả |
|-----------|------|
| AES‑256‑GCM | Chuẩn mã hóa cấp quân sự |
| PBKDF2 | 100.000 vòng lặp sinh khóa |
| Salt | 16 bytes, ngẫu nhiên mỗi lần |
| IV | 12 bytes, chống tấn công replay |
| GZIP | Nén trước mã hóa, giảm 60–80% |
| Offline | Không cần Internet |

---

## 🎯 Chức Năng

### Dữ Liệu Hỗ Trợ

| Storage | Xuất | Nhập | Mã hóa | Nén | Xóa |
|---------|------|------|--------|-----|-----|
| 🌐 Toàn bộ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 📦 localStorage | ✅ | ✅ | ✅ | ✅ | ✅ |
| 📋 sessionStorage | ✅ | ✅ | ✅ | ✅ | ✅ |
| 🍪 cookies | ✅ | ✅ | ✅ | ✅ | ✅ |
| 🗄️ IndexedDB | ✅ | ✅ | ✅ | ✅ | ✅ |
| 💽 Cache Storage | ✅ | ✅ | ✅ | ✅ | ✅ |
| ⚙️ Service Workers | ✅ | ℹ️ | ✅ | ✅ | ✅ |

> ℹ️ Service Workers: Chỉ lưu thông tin, không thể tự động đăng ký lại

### Tính Năng Chính

- 🔄 Toggle bật/tắt nén GZIP
- 🔐 Toggle bật/tắt mã hóa AES-256
- 🖱️ Nút kéo thả trên màn hình
- 💾 Xuất file `.json`, `.gz`, `.enc`
- 📂 Nhập file `.json`, `.gz`, `.enc`
- 📝 **Xuất Text → Clipboard** (từng loại hoặc tất cả, có nén/mã hóa)
- 📂 **Xuất file riêng từng loại** (localStorage, sessionStorage, cookies, IndexedDB, Cache Storage, Service Workers)
- 📋 Copy/Paste qua clipboard
- 👁️ Xem thống kê storage
- 🗑️ Xóa từng loại hoặc tất cả
- 🌐 Hoạt động hoàn toàn offline

---

## 📱 Khuyến Cáo

| Thiết bị | Nên dùng | Tránh |
|---------|---------|-------|
| 📱 Điện thoại | 💾 Tải File | ❌ Copy |
| 💻 Máy tính | 💾 Tải File / 📋 Copy | — |

> ⚠️ Clipboard điện thoại không ổn định với dữ liệu lớn.

---

## 📂 Định Dạng File

| Đuôi file | Nén | Mã hóa | Đọc được | Mục đích |
|-----------|-----|--------|----------|----------|
| `.json` | ❌ | ❌ | ✅ | Debug, dữ liệu công khai |
| `.gz` | ✅ | ❌ | ❌ | Tiết kiệm dung lượng |
| `.enc` | ✅ | ✅ | ❌ | Dữ liệu nhạy cảm |

### So Sánh Kích Thước

| Dữ liệu gốc | `.json` | `.gz` | `.enc` |
|-------------|---------|-------|--------|
| 500 KB | 500 KB | ~100 KB | ~105 KB |
| 1 MB | 1 MB | ~200 KB | ~210 KB |

---

## 📖 Hướng Dẫn Sử Dụng

### 💾 Xuất Dữ Liệu

#### Có mã hóa (khuyến nghị)

1. Bật toggle **🔐 Mã hóa AES-256**
2. Nhấn **💾 Tải file - Tất cả storage**
3. Nhập mật khẩu (tối thiểu 4 ký tự)
4. Xác nhận mật khẩu
5. Tải file `.enc`

#### Chỉ nén (không mã hóa)

1. Bật toggle **🗜️ Nén GZIP**
2. Tắt toggle **🔐 Mã hóa AES-256**
3. Nhấn **💾 Tải file - Tất cả storage**
4. Tải file `.gz`

#### Không nén, không mã hóa

1. Tắt cả 2 toggles
2. Nhấn **💾 Tải file - Tất cả storage**
3. Tải file `.json`

#### **Xuất Text → Clipboard** (TÍNH NĂNG MỚI)

1. Nhấn **📝 Xuất Text → Clipboard**
2. Chọn loại storage (hoặc tất cả)
3. Nhập mật khẩu nếu muốn mã hóa (hoặc bỏ trống)
4. Dữ liệu sẽ được nén/mã hóa (nếu bật), encode base64 và copy vào clipboard
5. Dán vào chat, file text, email, ghi chú...

#### **Xuất file riêng từng loại**

1. Chọn loại storage ở mục **"Xuất file riêng từng loại"**
2. Làm theo hướng dẫn như xuất tất cả

### 📂 Nhập Dữ Liệu

#### Từ file

1. Nhấn **📂 Chọn file (.json/.gz/.enc)**
2. Chọn file backup
3. Nhập mật khẩu nếu là file `.enc`
4. Xác nhận nhập
5. Reload trang

#### Từ clipboard

1. Nhấn **📋 Dán từ clipboard**
2. Dán dữ liệu (JSON hoặc Base64)
3. Nhập mật khẩu nếu cần
4. Reload trang

### 👁️ Xem Thống Kê

1. Nhấn **👁️ Xem thống kê storage**
2. Hiển thị số lượng items của từng loại
3. Hiển thị tên databases và caches

### 🗑️ Xóa Dữ Liệu

1. Nhấn **🗑️ Xóa dữ liệu**
2. Chọn loại cần xóa:
   - `1` - localStorage
   - `2` - sessionStorage
   - `3` - cookies
   - `4` - IndexedDB
   - `5` - Cache Storage
   - `6` - Service Workers
   - `7` - ⚠️ Tất cả

---

## 🔒 Quy Trình Xử Lý

### Xuất (Export)

```
JSON Data
    ↓
[🗜️ Nén GZIP] (nếu bật)
    ↓
[🔐 Mã hóa AES-256-GCM] (nếu bật)
    ↓
File (.json / .gz / .enc) hoặc Base64 (Clipboard)
```

### Nhập (Import)

```
File (.json / .gz / .enc) hoặc Base64 (Clipboard)
    ↓
[🔓 Giải mã AES-256-GCM] (nếu .enc)
    ↓
[📦 Giải nén GZIP] (nếu .gz hoặc .enc)
    ↓
JSON Data
```

---

## 📊 Cấu Trúc Dữ Liệu Export

```json
{
  "_meta": {
    "hostname": "example.com",
    "pathname": "/page",
    "exportedAt": "2024-01-15T10:30:00.000Z",
    "userAgent": "...",
    "version": "4.2"
  },
  "localStorage": { "key": "value" },
  "sessionStorage": { "key": "value" },
  "cookies": { "name": "value" },
  "indexedDB": {
    "dbName": {
      "version": 1,
      "stores": {
        "storeName": {
          "keyPath": "id",
          "autoIncrement": false,
          "indexes": [],
          "data": [{ "key": 1, "value": {} }]
        }
      }
    }
  },
  "cacheStorage": {
    "cacheName": [{
      "url": "https://...",
      "method": "GET",
      "headers": {},
      "body": "...",
      "bodyType": "text",
      "status": 200
    }]
  },
  "serviceWorkers": [{
    "scope": "https://example.com/",
    "active": { "scriptURL": "...", "state": "activated" }
  }]
}
```

---

## ⚠️ Giới Hạn

### Chung

- ❌ Chỉ dùng được trên cùng domain
- ❌ Không xuất được HttpOnly cookies
- ❌ Không backup dữ liệu server
- ❌ **Quên mật khẩu = mất file mã hóa**

### Theo Loại Storage

| Storage | Giới hạn |
|---------|----------|
| Service Workers | Chỉ lưu info, không thể đăng ký lại |
| Cache Storage | Binary data tăng ~33% khi convert base64 |
| IndexedDB | Một số DB phức tạp có thể không restore 100% |
| Cookies | Chỉ cookies accessible từ JavaScript |

### Trình Duyệt Hỗ Trợ

| Trình duyệt | Phiên bản tối thiểu |
|-------------|---------------------|
| Chrome | 80+ |
| Edge | 80+ |
| Firefox | 113+ |
| Safari | 16.4+ |

---

## 🎨 Giao Diện

### Màu Sắc

| Màu | Ý nghĩa |
|----|--------|
| 🟣 Tím gradient | Nút chính |
| 🟢 Xanh | Toggle bật |
| ⚪ Xám | Toggle tắt |
| 🟡 Vàng | Cảnh báo |
| 🔴 Đỏ | Nguy hiểm (xóa) |

### Toggle Settings

| Toggle | Mặc định | Mô tả |
|--------|----------|-------|
| 🗜️ Nén GZIP | ✅ Bật | Giảm 60-80% kích thước |
| 🔐 Mã hóa AES-256 | ❌ Tắt | Bảo vệ bằng mật khẩu |

---

## 📝 Changelog

### v4.2

- 📝 **Xuất Text → Clipboard**: Copy từng loại storage hoặc tất cả ra clipboard (có nén/mã hóa tuỳ chọn)
- 📂 **Xuất file riêng từng loại**: Xuất từng loại storage ra file riêng biệt
- ❌ **Loại bỏ "Copy tất cả (Base64)"**: Đã gộp vào "Xuất Text → Clipboard"
- ⚡ Tối ưu UI, cập nhật version

### v4.0

- ✨ Thêm Cache Storage export/import
- ✨ Thêm Service Workers info
- ✨ IndexedDB: hỗ trợ keyPath, indexes
- ✨ Thêm file định dạng `.gz`
- ✨ UI mới với animations
- ✨ Xóa riêng từng loại storage
- ✨ Thống kê chi tiết hơn
- 🔧 Backward compatible với v3.x

### v3.1

- ✨ Mã hóa AES-256-GCM
- ✨ Nén GZIP
- ✨ Toggle settings
- ✨ Drag & drop button

---

## 🤝 Đóng Góp

1. Fork repo
2. Tạo branch: `git checkout -b feature/ten-tinh-nang`
3. Commit: `git commit -m 'Thêm tính năng X'`
4. Push: `git push origin feature/ten-tinh-nang`
5. Tạo Pull Request

---

## 📄 License

MIT License - Xem file [LICENSE](LICENSE) để biết thêm chi tiết.

---

## 👨‍💻 Tác Giả

**LCK307**

- GitHub: [@LCK307](https://github.com/LCK307)

---

<p align="center">
  Made with ❤️ for the community
</p>

---

**Tóm tắt điểm mới v4.2:**  
- **Xuất Text → Clipboard**: Copy từng loại storage hoặc tất cả, có nén/mã hóa, dán vào chat/file/email dễ dàng  
- **Xuất file riêng từng loại**: Xuất từng loại storage ra file riêng biệt  
- **Loại bỏ "Copy tất cả (Base64)"**: Đã gộp vào "Xuất Text → Clipboard"  
- **UI tối ưu, dễ dùng hơn**

---

**Về sau sẽ thấy các bản nâng cấp tại đây:[Nhấn để xem!](google.com)
