# Smart Hammer — Development Tasks

Checklist ini adalah rencana implementasi, bukan klaim bahwa fitur sudah selesai. Tandai tugas selesai hanya setelah diverifikasi.

## Phase 0 — Kunci scope dan fondasi

- [x] FE-01 Frontend Foundation: autentikasi Redux, proteksi route, marketplace awal, dan kontrak mock API. Seller draft lifecycle, pagination, dan auction detail diselesaikan pada FE-03.
- [x] FE-02 Authentication: register/login, pemulihan sesi, proteksi route, logout pada mobile, error terstruktur, dan tes terverifikasi pada mock. Baca `FE02_CHANGELOG.md` dan `FE02_IMPLEMENTATION_REPORT.md`; BE-03 produksi tetap belum selesai.
- [x] FE-03 Auction UI: listing/pagination, create draft, owner-only edit draft, detail, start dengan konfirmasi, mock API lifecycle, dan validasi FE-03 terverifikasi. Lihat `FE03_IMPLEMENTATION_REPORT.md`.
- [x] FE-04 Auction Room State Management: snapshot Redux tervalidasi, merge bid/AI deduplicated, version guard, resync state, room isolation, selectors/hooks, dan reducer tests terverifikasi. Lihat `FE04_CHANGELOG.md`.
- [x] FE-06 Live Bidding UI + functional development mock: BidForm, BidHistory, REST submission, UUID idempotency, server-side validation, serialized local mock writes, sliding deadline, and real Socket.IO broadcasts verified. Lihat `FE06_CHANGELOG.md`; BE-05 production transaction/locking remains incomplete.
- [x] FE-07 Countdown and Auction Results: server-time-aware local countdown, zero-time confirmation/resync, authoritative winner/no-bid banner, persistent mock closure scheduler, startup/read-time recovery, serialized bid/closure, and `auction:ended` broadcast verified. Lihat `FE07_CHANGELOG.md`; BE-06 production scheduler/transaction/locking remains incomplete.
- [ ] Cocokkan `PROJECT.md`, `PRD.md`, dan `ARCHITECTURE.md` dengan rubrik/requirement akhir.
- [ ] Periksa struktur repository sebelum mengubah file.
- [ ] Siapkan frontend React + Vite + Tailwind CSS.
- [ ] Install `@reduxjs/toolkit` dan `react-redux`.
- [ ] Buat `configureStore` dan bungkus root React dengan Redux `<Provider>`.
- [ ] Siapkan backend Express dan HTTP server.
- [ ] Buat `.env.example` dan `.gitignore`.
- [ ] Konfigurasikan PostgreSQL dan Sequelize.
- [ ] Tambahkan penanganan error standar.
- [ ] Pastikan satu panggilan nyata ke provider Generative AI dapat dilakukan dari backend.

**Checkpoint:** frontend dan backend dapat dijalankan; backend dapat terhubung ke database; credential tidak berada di frontend.

## Phase 1 — Database

- [ ] Buat model dan migration `User`.
- [ ] Buat model dan migration `Auction`.
- [ ] Buat model dan migration `Bid` dengan unique `(userId, clientRequestId)`.
- [ ] Buat model dan migration `AIInteraction`, termasuk `visibility`, `missingInformation`, `sourceVersion`, `snapshotAt`, dan `errorCode` sesuai kontrak.
- [ ] Definisikan relasi Sequelize dan alias `seller`, `highestBidder`, `winner`, `bidder`, `auction`, serta AI interactions.
- [ ] Tambahkan constraint/index yang diperlukan.
- [ ] Siapkan seed akun demo dan beberapa draft produk dengan fakta yang jelas.
- [ ] Verifikasi migration dan seed dapat dijalankan melalui workflow project.

**Checkpoint:** model, relasi, migration, dan seed dapat digunakan oleh service.

## Phase 2 — Authentication

**Development-only auth simulator:** FE-02 can use the contract mock documented in `BE03_MOCK_IMPLEMENTATION.md`. Production BE-03 remains unchecked below.

- [ ] `POST /users/register` dengan validasi dan hash bcrypt.
- [ ] `POST /users/login` dengan JWT.
- [ ] `GET /users/me` untuk pemulihan sesi.
- [ ] Middleware JWT untuk route terlindungi.
- [ ] Pastikan respons tidak mengandung password/hash.
- [ ] Tambahkan tests register, login, token invalid, dan email duplikat.

**Checkpoint:** register/login/restore-session berfungsi dan error mengikuti kontrak.

## Phase 3 — Auction API dan lifecycle

**Catatan:** implementasi endpoint development mock untuk `GET/POST /auctions`, `GET/PATCH /auctions/:id`, dan `POST /auctions/:id/start` tersedia untuk FE-03. Checklist ini tetap melacak backend produksi (database, middleware, transaksi, dan integrasi); mock tersebut tidak menyelesaikan phase ini.

- [ ] Buat `POST /auctions` untuk draft.
- [ ] Buat `GET /auctions` dengan pagination.
- [ ] Buat `GET /auctions/:id` untuk snapshot.
- [ ] Buat `PATCH /auctions/:id` untuk edit draft oleh pemilik.
- [ ] Buat `POST /auctions/:id/start`.
- [ ] Terapkan validasi field, harga integer, durasi, category tetap `electronics`, dan URL gambar HTTPS.
- [ ] Pastikan draft tidak dapat diakses user lain.
- [ ] Gunakan serializer konsisten untuk objek Auction di REST dan Socket.IO.
- [ ] Tambahkan tests permission dan lifecycle.

**Checkpoint:** seller dapat membuat draft, melihatnya, mengeditnya, dan memulai lelang.

## Phase 4 — Bidding aman dan idempotency

**Development mock FE-06:** endpoint `POST/GET /auctions/:id/bids`, serialized single-process mutations, user-scoped idempotency, validation, event broadcast, and sliding deadline are implemented and tested. The production database-backed service below remains incomplete.

- [ ] Implementasikan satu `bidService` sebagai sumber aturan bid.
- [ ] Gunakan transaksi dan row lock pada Auction.
- [ ] Validasi status, deadline, self-bid, nominal, increment, dan batas nominal.
- [ ] Implementasikan idempotency melalui `clientRequestId`.
- [ ] Update Bid, `currentPrice`, `highestBidderId`, `endsAt`, dan `version` dalam transaksi yang konsisten.
- [ ] Broadcast tidak boleh terjadi sebelum commit.
- [ ] Buat integration tests untuk bid minimum, request replay, payload conflict, dan bid simultan.

**Checkpoint:** concurrent/retry bids tidak membuat duplikasi atau harga/state inkonsisten.

## Phase 5 — Penutupan dan countdown

**Development mock FE-07:** countdown memakai server clock offset dan `endsAt`; mock menutup lelang berkala, pada startup, saat snapshot dibaca, dan ketika bid tiba setelah deadline. Closure idempotent, memakai antrean serial yang sama dengan bid, menyimpan winner/no-bid result ke file JSON persisten, lalu menyiarkan `auction:ended`. Integration tests mencakup scheduler, recovery, read-time closure, sliding deadline, dan race bid/closure. Lihat `FE07_CHANGELOG.md`.

- [x] Development mock: service penutupan memakai antrean serial yang sama dengan bid.
- [x] Development mock: pemeriksaan deadline berkala dan graceful timer cleanup.
- [x] Development mock: startup recovery dari file state JSON persisten.
- [x] Development mock: winner/finalPrice serta hasil tanpa bid secara idempotent.
- [x] Development mock: bid tepat pada/setelah deadline ditolak dan state ditutup.
- [x] Frontend: countdown memakai `endsAt` terbaru dan koreksi `serverNow`, tanpa menentukan status akhir.
- [x] Tes mock: closure berulang, sliding deadline, restart recovery, dan race bid/closure.
- [ ] Production BE-06: scheduler, recovery, transaksi dan row lock database masih belum tersedia/terverifikasi.

**Checkpoint:** waktu dan hasil lelang diputuskan backend, termasuk jika scheduler terlambat atau server restart.

## Phase 6 — Socket.IO

- [x] Buat development Socket.IO server nyata pada HTTP mock server yang sama (produksi masih belum tersedia).
- [ ] Verifikasi JWT melalui handshake.
- [ ] Implementasikan `auction:join` dan `auction:leave` beserta acknowledgment.
- [ ] Kirim snapshot saat join.
- [ ] Broadcast `auction:started`, `bid:updated`, dan `auction:ended` setelah commit.
- [ ] Pastikan event memuat `auctionId`, `version`, `serverNow`, dan data relevan.
- [ ] Buat `src/lib/socket.js` service yang mengelola satu instance Socket.IO; jangan simpan instance socket di Redux.
- [ ] Implementasikan join/leave, listener cleanup, reconnect, resync dan status koneksi.
- [ ] Dispatch event socket ke Redux melalui action pada `auctionSlice` dan `socketSlice`.
- [ ] Integrasikan listener lifecycle Socket.IO dengan `processAuctionEvent`, recovery/reconnect, dan cleanup; reducer event FE-04 sudah tersedia.
- [x] Verifikasi dua klien Socket.IO menerima broadcast yang sama, room lain tidak menerima event, dan Redux menerapkan event secara idempotent.
- [x] Uji reconnect setelah server restart, pergantian room cepat, serta pergantian token akun pada tes integrasi multi-klien.

**Batas FE-05:** checklist client lifecycle dan development mock di atas telah diimplementasikan. JWT produksi, broadcast setelah transaksi database, dua browser pada deployment, serta integrasi CORS/hosting masih memerlukan backend produksi dan tetap menjadi pekerjaan backend/integrasi deployment.

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

- [ ] Bangun halaman login/register, daftar lelang, create auction, dan detail lelang.
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
