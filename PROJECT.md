# Smart Hammer — Project Overview

## 1. Ringkasan

Smart Hammer adalah aplikasi simulasi lelang barang elektronik. Seller membuat dan memulai lelang, buyer melihat detail produk serta mengajukan penawaran, dan semua peserta melihat harga, riwayat bid, komentar AI, serta hasil lelang secara real-time.

AI memiliki dua fungsi utama: **Product Q&A** untuk menjawab pertanyaan tentang barang berdasarkan fakta yang tersimpan dan **AI Auctioneer** untuk memberi komentar pada momen penting lelang. AI hanya menjadi pemandu informasi; backend tetap menentukan bid yang valid, harga, waktu penutupan, dan pemenang.

Aplikasi ini menggunakan nominal simulasi. MVP tidak memproses uang nyata, pembayaran, pengiriman, atau wallet.

## 2. Tujuan

- Menyediakan alur lelang elektronik dari pembuatan draft sampai pengumuman hasil.
- Menyinkronkan penawaran dan perubahan lelang kepada semua peserta tanpa refresh manual.
- Menjamin harga dan hasil lelang ditentukan backend serta disimpan konsisten di PostgreSQL.
- Menghadirkan Q&A produk dan komentar AI yang didasarkan pada fakta yang tersedia.
- Mendukung refresh dan reconnect dengan memulihkan state dari backend.

## 3. Teknologi

### Frontend
- JavaScript
- React + Vite
- Tailwind CSS v4
- React Router
- Redux Toolkit (`@reduxjs/toolkit`) dan React Redux (`react-redux`)
- `useState` untuk state lokal komponen
- Axios
- Socket.IO Client

### Backend
- Node.js
- Express
- REST API
- Socket.IO
- Sequelize ORM
- PostgreSQL
- JWT untuk autentikasi (expiry 7 hari)
- bcrypt untuk hash password
- OpenAI API (`gpt-4o-mini`) via raw HTTP call untuk fitur AI
- Jest dan Supertest untuk testing

Gunakan Redux Toolkit untuk state global aplikasi. Instance Socket.IO tetap dikelola service terpisah dan tidak disimpan di Redux.

## 4. Peran pengguna

Setiap akun dapat menjadi:
- **Seller:** membuat draft lelang, mengedit draft miliknya, memulai lelang, dan memantau hasil.
- **Buyer:** melihat lelang yang tersedia, bertanya kepada AI, dan mengajukan bid pada lelang milik user lain.

Seller tidak boleh menawar lelangnya sendiri. Dashboard admin terpisah tidak termasuk MVP.

## 5. Fitur MVP

1. Register, login, dan pemulihan sesi.
2. Membuat, melihat, mengedit draft, dan memulai lelang.
3. Daftar serta detail lelang barang elektronik.
4. Live bidding dengan riwayat bid tersimpan.
5. Real-time update menggunakan Socket.IO.
6. Countdown dengan sliding deadline.
7. Penutupan lelang dan penentuan pemenang oleh backend.
8. Product Q&A yang menyimpan status dan jawaban.
9. AI Auctioneer untuk pembukaan, milestone bid, dan akhir lelang.
10. Pemulihan state sesudah refresh/reconnect serta handling kegagalan AI.

Kategori produk dipilih seller dari daftar subkategori elektronik: `smartphone`, `laptop`, `pc`, `camera`, `tablet`, `monitor`, `audio`, `gaming_console`, `accessories`. Gambar produk menggunakan URL HTTPS pada MVP.

## 6. Bukan bagian MVP

- Pembayaran, pengiriman, wallet, atau transaksi uang nyata.
- Auto-bid, price advisor, fraud detection, private chat, voice Q&A.
- Redis atau arsitektur multi-server.
- Upload file gambar; URL gambar manual tetap digunakan.
- Budget pribadi/AI bid coach dan watchlist.
- Dashboard admin terpisah.

Fitur tambahan baru dipertimbangkan setelah alur MVP stabil dan kebutuhan dasarnya teruji.

## 7. Prinsip utama

- Backend dan PostgreSQL adalah sumber kebenaran.
- Socket.IO mendistribusikan state; bukan otoritas yang menentukan sahnya bid.
- Semua nilai uang berupa integer rupiah, tidak menggunakan desimal.
- AI hanya menjelaskan fakta dan snapshot yang diterima dari backend; AI tidak boleh mengubah lelang.
- Event real-time dikirim setelah transaksi database berhasil commit.
- API key dan JWT secret hanya berada di backend.
- Struktur folder menggunakan `client/` dan `server/`.
- Deployment: frontend di Vercel, backend di Railway.


## 8. State management frontend

Redux Toolkit digunakan untuk state global yang dibagikan antarhalaman. Slice awal:

- `auth`: user, access token, status autentikasi, loading/error.
- `auction`: snapshot lelang aktif, riwayat bid, interaksi AI publik, version, loading/error.
- `socket`: status koneksi saja; bukan instance socket.

Gunakan `configureStore`, `createSlice`, `createAsyncThunk`, `Provider`, `useSelector`, dan `useDispatch`. Permintaan REST asynchronous seperti login, pemulihan sesi, load snapshot, submit bid, dan ask AI dapat dikelola melalui thunk. Instance Socket.IO berada di service terpisah; event socket men-dispatch action Redux. Redux hanya menyimpan data serializable, bukan instance Socket.IO, Promise, atau Error object. Input form dan countdown tick tetap local state. Backend/PostgreSQL tetap sumber kebenaran.
