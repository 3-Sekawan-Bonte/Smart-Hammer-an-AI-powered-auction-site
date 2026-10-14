# Smart Hammer — Development Tasks

Checklist ini adalah rencana implementasi, bukan klaim bahwa fitur sudah selesai. Tandai tugas selesai hanya setelah diverifikasi.

## Phase 0 — Kunci scope dan fondasi

- [ ] Cocokkan `PROJECT.md`, `PRD.md`, dan `ARCHITECTURE.md` dengan rubrik/requirement akhir.
- [ ] Periksa struktur repository sebelum mengubah file.
- [ ] Siapkan frontend React + Vite + Tailwind CSS v4.
- [ ] Install `@reduxjs/toolkit` dan `react-redux`.
- [ ] Buat `configureStore` dan bungkus root React dengan Redux `<Provider>`.
- [ ] Siapkan backend Express dan HTTP server.
- [ ] Buat `.env.example` dan `.gitignore`.
- [ ] Konfigurasikan PostgreSQL dan Sequelize.
- [ ] Tambahkan penanganan error standar.
- [ ] Pastikan satu panggilan nyata ke OpenAI API (`gpt-4o-mini`) dapat dilakukan dari backend.

**Checkpoint:** frontend dan backend dapat dijalankan; backend dapat terhubung ke database; credential tidak berada di frontend.

## Phase 1 — Database

- [x] Buat model dan migration `User`.
- [ ] Buat model dan migration `Auction`.
- [ ] Buat model dan migration `Bid` dengan unique `(userId, clientRequestId)`.
- [ ] Buat model dan migration `AIInteraction`, termasuk `visibility`, `missingInformation`, `sourceVersion`, `snapshotAt`, dan `errorCode` sesuai kontrak.
- [ ] Definisikan relasi Sequelize dan alias `seller`, `highestBidder`, `winner`, `bidder`, `auction`, serta AI interactions.
- [ ] Tambahkan constraint/index yang diperlukan.
- [ ] Siapkan seed akun demo dan beberapa draft produk dengan fakta yang jelas.
- [ ] Verifikasi migration dan seed dapat dijalankan melalui workflow project.

**Checkpoint:** model, relasi, migration, dan seed dapat digunakan oleh service.

## Phase 2 — Authentication

- [x] `POST /users/register` dengan validasi dan hash bcryptjs.
- [x] `POST /users/login` dengan JWT.
- [x] Verifikasi password login menggunakan bcryptjs dan normalisasi email ke lowercase.
- [x] `GET /users/me` untuk pemulihan sesi.
- [x] Middleware JWT untuk route terlindungi; identitas diambil dari subject JWT terverifikasi.
- [x] Validasi input autentikasi, tolak field yang tidak dikenal, dan gunakan format error standar.
- [x] Pastikan respons tidak mengandung password/hash.
- [ ] Jalankan dan verifikasi automated tests register, login, input invalid, password salah, token hilang/invalid, `GET /users/me`, password hash tidak terekspos, dan email duplikat.

**Checkpoint:** register/login/restore-session berfungsi dan error mengikuti kontrak.

## Phase 3 — Auction API dan lifecycle

- [x] Buat `POST /auctions` untuk draft.
- [x] Buat `GET /auctions` dengan pagination.
- [x] Buat `GET /auctions/:id` untuk snapshot.
- [x] Buat `PATCH /auctions/:id` untuk edit draft oleh pemilik.
- [x] Buat `POST /auctions/:id/start`.
- [x] Terapkan validasi field, harga integer, durasi, category dari daftar subkategori (`smartphone`, `laptop`, `pc`, `camera`, `tablet`, `monitor`, `audio`, `gaming_console`, `accessories`), dan URL gambar HTTPS.
- [x] Pastikan draft tidak dapat diakses user lain.
- [x] Implementasikan `DELETE /auctions/:id` untuk menghapus draft milik sendiri.
- [x] Implementasikan query params `status`, `category`, `seller=me`, dan `search` pada `GET /auctions`.
- [x] Gunakan serializer konsisten untuk objek Auction di REST dan Socket.IO.
- [ ] Tambahkan tests permission dan lifecycle.

**Checkpoint:** seller dapat membuat draft, melihatnya, mengeditnya, dan memulai lelang.

## Phase 4 — Bidding aman dan idempotency

- [x] Implementasikan satu `bidService` sebagai sumber aturan bid.
- [x] Gunakan transaksi dan row lock pada Auction.
- [x] Validasi status, deadline, self-bid, nominal, increment, dan batas nominal.
- [ ] Implementasikan idempotency melalui `clientRequestId`.
- [x] Update Bid, `currentPrice`, `highestBidderId`, `endsAt`, dan `version` dalam transaksi yang konsisten.
- [ ] Broadcast tidak boleh terjadi sebelum commit.
- [ ] Buat integration tests untuk bid minimum, request replay, payload conflict, dan bid simultan.

**Checkpoint:** concurrent/retry bids tidak membuat duplikasi atau harga/state inkonsisten.

## Phase 5 — Penutupan dan countdown

- [ ] Implementasikan service penutupan yang memakai lock Auction yang sama dengan bid.
- [ ] Tambahkan pemeriksaan deadline berkala.
- [ ] Tambahkan startup recovery untuk auction live yang sudah expired.
- [ ] Tentukan winner/finalPrice secara idempotent.
- [ ] Tangani lelang berakhir tanpa bid.
- [ ] Pastikan bid tepat pada/setelah deadline ditolak.
- [ ] Implementasikan countdown frontend dengan `endsAt` terbaru dan koreksi `serverNow`.
- [ ] Uji penutupan berulang, sliding deadline, dan restart recovery.

**Checkpoint:** waktu dan hasil lelang diputuskan backend, termasuk jika scheduler terlambat atau server restart.

## Phase 6 — Socket.IO

- [ ] Buat Socket.IO server pada HTTP server.
- [ ] Verifikasi JWT melalui handshake.
- [ ] Implementasikan `auction:join` dan `auction:leave` beserta acknowledgment.
- [ ] Kirim snapshot saat join.
- [ ] Broadcast `auction:started`, `bid:updated`, dan `auction:ended` setelah commit.
- [ ] Pastikan event memuat `auctionId`, `version`, `serverNow`, dan data relevan.
- [ ] Buat `src/lib/socket.js` service yang mengelola satu instance Socket.IO; jangan simpan instance socket di Redux.
- [ ] Implementasikan join/leave, listener cleanup, reconnect, resync dan status koneksi.
- [ ] Dispatch event socket ke Redux melalui action pada `auctionSlice` dan `socketSlice`.
- [ ] Deduplicate event dan abaikan versi state yang lebih lama.
- [ ] Uji dua browser dan perpindahan antar-room.

**Checkpoint:** dua browser melihat harga, riwayat, deadline, dan status yang sama tanpa refresh.

## Phase 7 — AI Product Q&A

- [ ] Buat service provider AI backend.
- [ ] Buat `POST /auctions/:id/ai/questions` dengan validasi dan rate limit.
- [ ] Simpan interaction `pending` sebelum proses AI.
- [ ] Ambil product facts dan auction snapshot dari server.
- [ ] Batasi output dan validasi struktur JSON (`answer`, `missingInformation`).
- [ ] Simpan hasil `completed`/`failed` serta snapshot metadata.
- [ ] Buat `GET /auctions/:id/ai/interactions` untuk recovery/history.
- [ ] Broadcast `ai:pending`, `ai:message`, atau `ai:error`.
- [ ] Bangun AIPanel frontend dengan status pending/completed/failed.
- [ ] Uji fakta yang tidak tersedia, prompt injection sederhana, timeout/provider failure, dan rate limit.

**Checkpoint:** Q&A nyata berhasil, berbasis konteks server, tersimpan, dan kegagalannya tidak menghentikan bidding.

## Phase 8 — AI Auctioneer

- [ ] Tambahkan komentar saat auction mulai.
- [ ] Tambahkan trigger milestone bid dengan cooldown, bukan pada setiap bid.
- [ ] Tambahkan komentar saat auction berakhir.
- [ ] Backend menghitung metrik; AI hanya menyusun komentar.
- [ ] Batasi satu komentar AI berjalan per room dan tangani response usang melalui snapshot metadata.
- [ ] Pastikan proses AI tidak menahan transaksi bid atau closure.
- [ ] Tampilkan komentar sebagai interaksi AI publik.

**Checkpoint:** komentar AI muncul untuk event penting tanpa mengontrol aturan atau menunda bidding.

## Phase 9 — Integrasi dan penyelesaian frontend

- [ ] Bangun halaman login/register, daftar lelang (dengan search dan filter category/status), create auction, detail lelang, dan `/my-auctions`.
- [ ] Implementasikan `authSlice`, `auctionSlice`, dan `socketSlice` sesuai arsitektur.
- [ ] Gunakan `createAsyncThunk` untuk request REST asynchronous yang sesuai.
- [ ] Gunakan selectors dan reducer idempotent untuk menggabungkan snapshot, response REST, serta event socket.
- [ ] Pastikan instance Socket.IO tidak disimpan di Redux dan state tetap serializable.
- [ ] Tangani loading, error, empty state, dan error code.
- [ ] Pastikan logout menghapus state privat dan disconnect socket.
- [ ] Pastikan response dari room lama tidak menimpa room aktif.
- [ ] Pastikan form tidak menaikkan harga optimistis sebelum server menerima bid.
- [ ] Buat WinnerBanner untuk pemenang dan hasil tanpa bid.
- [ ] Pastikan layout responsif dan dapat digunakan di layar kecil.
- [ ] Buat README untuk install, env, migration, seed, run, test, dan demo.

**Checkpoint:** alur end-to-end seller → buyer → AI → bid → auction ended berjalan dari UI.

## Phase 10 — Verifikasi akhir dan deployment

- [ ] Jalankan test suite dan catat hasilnya.
- [ ] Uji alur dengan dua sesi/browser terpisah.
- [ ] Uji concurrency, idempotency, deadline, reconnect, dan AI failure.
- [ ] Verifikasi CORS, `CLIENT_ORIGIN`, URL API, dan koneksi Socket.IO pada hosting.
- [ ] Pastikan backend berjalan persisten dan database dapat diakses.
- [ ] Jalankan migration/seed yang dibutuhkan pada environment target.
- [ ] Pastikan tidak ada `.env`, token, atau API key dalam repository/build frontend.
- [ ] Siapkan akun demo dan data lelang yang dapat diulang.
- [ ] Siapkan demo lokal sebagai cadangan jika deployment gagal.
- [ ] Deploy frontend ke Vercel dan backend ke Railway.

**Checkpoint:** satu skenario end-to-end dapat diulang tanpa mengedit data database secara manual.

## Backlog opsional — jangan mulai sebelum alur inti stabil

### Prioritas tambahan
- [ ] AI summary sesudah lelang selesai.
- [ ] Notifikasi tersimpan.
- [ ] Peserta online/presence.
- [ ] Search/filter/sort lanjutan.
- [ ] Dashboard seller dan riwayat buyer.

### Iterasi berikutnya
- [ ] AI Smart Listing.
- [ ] Upload gambar.
- [ ] Budget pribadi dan AI Bid Coach.
- [ ] Watchlist.
- [ ] Grafik bid.

### Tidak direncanakan untuk MVP
- [ ] AI Price Advisor.
- [ ] Fraud/risk flags dan admin tools.
- [ ] Private chat.
- [ ] Voice Q&A.
- [ ] Payment, delivery, atau wallet.
- [ ] Auto-bid.
- [ ] Redis/multi-server.
