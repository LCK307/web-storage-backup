# 💾 Web Storage Backup & Restore v3.0

Userscript giúp **sao lưu / khôi phục** toàn bộ dữ liệu trình duyệt: `localStorage`, `sessionStorage`, `cookies`, `IndexedDB` với **mã hóa AES‑256‑GCM** và **nén GZIP**.

---

## 📥 Cài Đặt

1. Cài extension [Tampermonkey](https://www.tampermonkey.net/) cho trình duyệt
2. Click vào link: **[Cài đặt script](https://raw.githubusercontent.com/YourUsername/web-storage-backup/main/web-storage-backup.user.js)**
3. Nhấn **Install**
4. Hoàn tất! Nút 💾 sẽ xuất hiện góc phải dưới màn hình

---

## 🔐 Bảo Mật

| Thành phần | Mô tả |
|-----------|------|
| AES‑256‑GCM | Chuẩn mã hóa cấp quân sự
| PBKDF2 | 100.000 vòng lặp sinh khóa
| Salt | 16 bytes, ngẫu nhiên mỗi lần
| IV | 12 bytes, chống tấn công replay
| GZIP | Nén trước mã hóa, giảm 60–80%
| Offline | Không cần Internet

---

## 🎯 Chức Năng

### Dữ Liệu Hỗ Trợ

| Storage | JSON | Mã hóa | Nhập file | Copy |
|--------|------|--------|-----------|------|
| Toàn bộ | ✅ | ✅ | ✅ | ✅ |
| localStorage | ✅ | ✅ | ✅ | — |
| sessionStorage | ✅ | ✅ | ✅ | — |
| cookies | ✅ | ✅ | ✅ | — |
| IndexedDB | ✅ | ✅ | ✅ | — |

### Tính Năng

- Nút kéo thả trên màn hình
- Xuất file `.json` hoặc `.enc`
- Nhập file `.json` hoặc `.enc`
- Hoạt động hoàn toàn offline

---

## 📱 Khuyến Cáo

| Thiết bị | Nên dùng | Tránh |
|---------|---------|-------|
| Điện thoại | 💾 Tải File | ❌ Copy |
| Máy tính | 💾 Tải File / 📤 Copy | — |

> ⚠️ Clipboard điện thoại không ổn định với dữ liệu lớn.

---

## 📂 Định Dạng File

| File | Mã hóa | Nén | Đọc | Mục đích |
|------|------|-----|------|---------|
| .json | ❌ | ❌ | ✅ | Debug
| .enc | ✅ | ✅ | ❌ | Dữ liệu nhạy cảm |

**So sánh:** 500 KB `.json` → 100 KB `.enc`

---

## 📖 Hướng Dẫn Sử Dụng

### 🔐 Xuất có mã hóa

1. Nhấn 💾 → **Tải File .enc**
2. Nhập mật khẩu
3. Tải file

### 💾 Xuất không mã hóa

1. Nhấn 💾 → **Tải JSON**

### 📂 Nhập từ file

1. 💾 → **Nhập từ File**
2. Chọn `.json` / `.enc`
3. Nhập mật khẩu nếu cần
4. Reload trang

### 📤 Copy/Paste (PC)

- Xuất: **Copy JSON** / **Copy Base64**
- Nhập: **Nhập JSON** / **Nhập mã hóa Base64**

---

## 🎨 Giao Diện & Màu Sắc

| Màu | Ý nghĩa |
|----|--------|
| 🟢 | An toàn (mã hóa)
| 🟡 | Cảnh báo (không mã hóa)
| ⚪ | Bình thường

---

## ⚠️ Giới Hạn

- Chỉ dùng cùng domain
- Không xuất được HttpOnly cookies
- Không backup dữ liệu server
- **Quên mật khẩu = mất file mã hóa**

### Trình duyệt hỗ trợ

Chrome 80+, Edge 80+, Firefox 113+, Safari 16.4+

---

## 🔒 Quy Trình Mã Hóa

JSON → GZIP → Salt → PBKDF2 → IV → AES‑256‑GCM → Output

---

## 📄 License

MIT

