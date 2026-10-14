# Smart Hammer — Development Tasks

Checklist ini adalah rencana implementasi, bukan klaim bahwa fitur sudah selesai. Tandai tugas selesai hanya setelah diverifikasi.

## Phase 0 — Kunci scope dan fondasi

- [x] FE-01 Frontend Foundation: autentikasi Redux, proteksi route, marketplace awal, dan kontrak mock API. Seller draft lifecycle, pagination, dan auction detail diselesaikan pada FE-03.
- [x] FE-02 Authentication: register/login, pemulihan sesi, proteksi route, logout pada mobile, error terstruktur, dan tes terverifikasi pada mock. Baca `FE02_CHANGELOG.md` dan `FE02_IMPLEMENTATION_REPORT.md`; BE-03 produksi tetap belum selesai.
- [x] FE-03 Auction UI: listing/pagination, create draft, owner-only edit draft, detail, start dengan konfirmasi, mock API lifecycle, dan validasi FE-03 terverifikasi. Lihat `FE03_IMPLEMENTATION_REPORT.md`.
- [x] FE-04 Auction Room State Management: snapshot Redux tervalidasi, merge bid/AI deduplicated, version guard, resync state, room isolation, selectors/hooks, dan reducer tests terverifikasi. Lihat `FE04_CHANGELOG.md`.
- [x] FE-06 Live Bidding UI + functional development mock: BidForm, BidHistory, REST submission, UUID idempotency, server-side validation, serialized local mock writes, sliding deadline, and real Socket.IO broadcasts verified. Lihat `FE06_CHANGELOG.md`; BE-05 production transaction/locking remains incomplete.
- [x] FE-07 Countdown and Auction Results: server-time-aware local countdown, zero-time confirmation/resync, authoritative winner/no-bid banner, persistent mock closure scheduler, startup/read-time recovery, serialized bid/closure, and `auction:ended` broadcast verified. Lihat `FE07_CHANGELOG.md`; BE-06 production scheduler/transaction/locking remains incomplete.
- [x] FE-09 Recovery and Stability: bounded GET retries, temporary auth outage preservation, connectivity banner, retryable snapshot resync, React error boundary, and loopback fault tests including lost bid response replay. See `FE09_CHANGELOG.md`; production backend recovery guarantees remain dependent on BE-03/05/06.
- [x] SPA navigation audit: internal routes use React Router, one persistent router/store/provider tree, React-handled forms, and route-driven Socket.IO room membership; nested URLs refresh through Vite fallback. Static regression checks and browser route checks documented in `SPA_NAVIGATION_FIX_CHANGELOG.md`.
- [ ] Cocokkan `PROJECT.md`, `PRD.md`, dan `ARCHITECTURE.md` dengan rubrik/requirement akhir.
- [ ] Periksa struktur repository sebelum mengubah file.
- [ ] Siapkan frontend React + Vite + Tailwind CSS.
- [ ] Install `@reduxjs/toolkit` dan `react-redux`.
- [ ] Buat `configureStore` dan bungkus root React dengan Redux `<Provider>`.
- [ ] Siapkan backend Express dan HTTP server.
- [ ] Buat `.env.example` dan `.gitignore`.
- [ ] Konfigurasikan PostgreSQL dan Sequelize.
- [ ] Tambahkan penanganan error standar.
- [x] Pastikan panggilan nyata ke Groq Chat Completions API (`openai/gpt-oss-120b`) berhasil dari backend setelah `GROQ_API_KEY` dikonfigurasi.

**Checkpoint:** frontend dan backend dapat dijalankan; backend dapat terhubung ke database; credential tidak berada di frontend.

## Phase 1 — Database

- [x] Buat model dan migration `User`.
- [ ] Buat model dan migration `Auction`.
- [ ] Buat model dan migration `Bid` dengan unique `(userId, clientRequestId)`.
- [ ] Buat model dan migration `AIInteraction`, termasuk `visibility`, `missingInformation`, `sourceVersion`, `snapshotAt`, dan `errorCode` sesuai kontrak.
- [ ] Definisikan relasi Sequelize dan alias `seller`, `highestBidder`, `winner`, `bidder`, `auction`, serta AI interactions.
- [ ] Tambahkan constraint/index yang diperlukan.
- [x] Siapkan seed akun demo dan beberapa draft produk dengan fakta yang jelas.
- [x] Verifikasi migration dan seed dapat dijalankan melalui workflow project.

**Checkpoint:** model, relasi, migration, dan seed dapat digunakan oleh service.

## Phase 2 — Authentication

- [x] `POST /users/register` dengan validasi dan hash bcryptjs.
- [x] `POST /users/login` dengan JWT.
- [x] Verifikasi password login menggunakan bcryptjs dan normalisasi email ke lowercase.
- [x] `GET /users/me` untuk pemulihan sesi.
- [x] Middleware JWT untuk route terlindungi; identitas diambil dari subject JWT terverifikasi.
- [x] Validasi input autentikasi, tolak field yang tidak dikenal, dan gunakan format error standar.
- [x] Pastikan respons tidak mengandung password/hash.
- [x] Jalankan dan verifikasi automated tests register, login, input invalid, password salah, token hilang/invalid, `GET /users/me`, password hash tidak terekspos, dan email duplikat.

**Checkpoint:** register/login/restore-session berfungsi dan error mengikuti kontrak.

## Phase 3 — Auction API dan lifecycle

- [x] Buat `POST /auctions` untuk draft.
- [x] Buat `GET /auctions` dengan pagination.
- [x] Buat `GET /auctions/:id` untuk snapshot.
- [x] Buat `PATCH /auctions/:id` untuk edit draft oleh pemilik.
- [x] Buat `POST /auctions/:id/start`.
- [x] Terapkan validasi field, harga integer, durasi 60–604800 detik, category dari daftar subkategori (`smartphone`, `laptop`, `pc`, `camera`, `tablet`, `monitor`, `audio`, `gaming_console`, `accessories`), dan URL gambar HTTPS.
- [x] Pastikan draft tidak dapat diakses user lain.
- [x] Implementasikan `DELETE /auctions/:id` untuk menghapus draft milik sendiri.
- [x] Implementasikan query params `status`, `category`, `seller=me`, dan `search` pada `GET /auctions`.
- [x] Gunakan serializer konsisten untuk objek Auction di REST dan Socket.IO.
- [x] Tambahkan tests permission dan lifecycle.
- [ ] Jalankan tes API berbasis database untuk create, edit draft, dan start dengan durasi 1, 3, dan 7 hari setelah konfigurasi database test tersedia.

**Checkpoint:** seller dapat membuat draft, melihatnya, mengeditnya, dan memulai lelang.

## Phase 4 — Bidding aman dan idempotency

- [x] Implementasikan satu `bidService` sebagai sumber aturan bid.
- [x] Gunakan transaksi dan row lock pada Auction.
- [x] Validasi status, deadline, self-bid, nominal, increment, dan batas nominal.
- [ ] Implementasikan idempotency melalui `clientRequestId`.
- [x] Update Bid, `currentPrice`, `highestBidderId`, `endsAt`, dan `version` dalam transaksi yang konsisten.
- [ ] Broadcast tidak boleh terjadi sebelum commit.
- [x] Buat integration tests untuk bid minimum, request replay, payload conflict, dan bid simultan.

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
- [ ] Implementasikan service penutupan yang memakai lock Auction yang sama dengan bid.
- [x] Tambahkan pemeriksaan deadline berkala.
- [x] Tambahkan startup recovery untuk auction live yang sudah expired.
- [x] Tentukan winner/finalPrice secara idempotent.
- [x] Tangani lelang berakhir tanpa bid.
- [x] Pastikan bid tepat pada/setelah deadline ditolak.
- [x] Uji penutupan berulang, sliding deadline, dan restart recovery.

**Checkpoint:** waktu dan hasil lelang diputuskan backend, termasuk jika scheduler terlambat atau server restart.

## Phase 6 — Socket.IO

- [x] Buat Socket.IO server pada HTTP server.
- [x] Verifikasi JWT melalui handshake.
- [x] Implementasikan `auction:join` dan `auction:leave` beserta acknowledgment.
- [x] Kirim snapshot saat join.
- [x] Broadcast `auction:started`, `bid:updated`, dan `auction:ended` setelah commit.
- [x] Pastikan event memuat `auctionId`, `version`, `serverNow`, dan data relevan.
- [ ] Buat `src/lib/socket.js` service yang mengelola satu instance Socket.IO; jangan simpan instance socket di Redux.
- [ ] Implementasikan join/leave, listener cleanup, reconnect, resync dan status koneksi.
- [ ] Dispatch event socket ke Redux melalui action pada `auctionSlice` dan `socketSlice`.
- [ ] Deduplicate event dan abaikan versi state yang lebih lama.
- [ ] Uji dua browser dan perpindahan antar-room.

**Checkpoint:** dua browser melihat harga, riwayat, deadline, dan status yang sama tanpa refresh.

## Phase 7 — AI Product Q&A

- [x] Buat service provider AI backend.
- [x] Buat `POST /auctions/:id/ai/questions` dengan validasi dan rate limit.
- [x] Simpan interaction `pending` sebelum proses AI.
- [x] Ikat setiap Product Q&A ke pemilik terautentikasi dan simpan sebagai `private`; Auctioneer commentary tetap `public`.
- [x] Ambil product facts dan auction snapshot dari server.
- [x] Batasi output dan validasi struktur JSON (`answer`, `missingInformation`).
- [x] Simpan hasil `completed`/`failed` serta snapshot metadata.
- [x] Batasi `GET /auctions/:id/ai/interactions` ke Q&A milik user aktif serta commentary publik, dengan pagination aman.
- [x] Kirim event Q&A ke room Socket.IO per-user yang dibuat dari JWT; broadcast commentary Auctioneer hanya ke room auction.
- [x] Bangun AIPanel dengan status pending/completed/failed, riwayat Q&A privat, commentary publik, dan pembersihan state saat logout/pergantian akun.
- [x] Uji fakta yang tidak tersedia, prompt injection sederhana, timeout/provider failure, rate limit, privasi REST/Socket.IO, dan snapshot publik.
- [x] Tambahkan Groq Browser Search untuk pertanyaan eksternal yang relevan tanpa structured output; pertanyaan listing tetap memakai jalur JSON yang ada.
- [x] Simpan citation marker dan metadata judul/URL HTTPS dari hasil tool Groq pada AIInteraction privat; jangan masukkan sumber Q&A ke snapshot/room publik.
- [x] Tampilkan citation sebagai tautan aman dan daftar sumber pada Product Q&A.
- [x] Uji keputusan browse/local, citation-source mapping, pencarian gagal/ambigus, timeout panjang, privasi sumber, dan regresi AI Auctioneer.

**Checkpoint:** Q&A nyata berhasil, berbasis konteks server, tersimpan, dan kegagalannya tidak menghentikan bidding.

## Phase 8 — AI Auctioneer

- [x] Tambahkan komentar saat auction mulai.
- [x] Tambahkan trigger milestone bid pada setiap bid ke-3 dan batasi commentary yang berjalan bersamaan per room/global.
- [x] Tambahkan komentar saat auction berakhir.
- [x] Backend menghitung metrik; AI hanya menyusun komentar.
- [x] Batasi satu komentar AI berjalan per room dan tandai snapshot sumber melalui metadata version.
- [x] Pastikan proses AI tidak menahan transaksi bid atau closure.
- [x] Tampilkan komentar sebagai interaksi AI publik.
- [x] Tambahkan tests untuk trigger start, milestone 3/6, closure, retry/rollback, provider failure, deduplikasi, dan event payload.

**Checkpoint:** komentar AI muncul untuk event penting tanpa mengontrol aturan atau menunda bidding.

## Phase 9 — Integrasi dan penyelesaian frontend

### Frontend pages and state
- [x] Bangun halaman login/register, daftar lelang dengan pencarian dan filter kategori/status, create/edit auction, detail, dan `/my-auctions`.
- [x] Implementasikan `authSlice`, `auctionSlice`, dan `socketSlice` dengan Redux Toolkit.
- [x] Gunakan `createAsyncThunk`, selectors, dan reducer idempotent untuk REST, snapshot, serta event.
- [x] Pastikan instance Socket.IO tidak disimpan di Redux dan state tetap serializable.
- [x] Tangani loading, error, empty state, dan error code pada alur utama.
- [x] Pastikan logout menghapus state privat dan disconnect socket.
- [x] Pastikan respons snapshot/event dari room lama tidak menimpa room aktif.
- [x] Pastikan bid tidak menaikkan harga optimistis sebelum server menerima penawaran.
- [x] Skala harga lelang terformat memakai lebar container, pertahankan seluruh digit hingga Rp2.000.000.000, dan jaga layout bid/minimum tetap muat.
- [x] Tombol `Kirim bid` memakai `nextMinimumBid` dari snapshot Redux terbaru saat input kosong; nominal manual tetap dipertahankan, sedangkan request ID, guard eligibility, dan retry idempotent tetap digunakan.
- [x] Tampilkan WinnerBanner hanya dari hasil lelang yang dikonfirmasi server.
- [x] Tambahkan ThemeContext global untuk preferensi light/dark, persistensi lokal, toggle navbar yang accessible, dan token styling tanpa menyimpan tema di Redux.

### REST and backend contract integration
- [x] Cocokkan register/login/session restore dengan `POST /users/register`, `POST /users/login`, dan `GET /users/me`; frontend menerima JWT `accessToken` backend.
- [x] Integrasikan listing, pagination, pencarian, filter, detail, draft create/edit/delete, start, dan seller listing `seller=me`.
- [x] Gunakan kategori backend yang diizinkan dan kirim field `category` dari form.
- [ ] Tawarkan pilihan durasi 1, 3, dan 7 hari; verifikasi melalui browser bahwa nilai detik terkirim dan pilihan draft tetap tampil.
- [x] Cocokkan respons bid/idempotency, tampilkan minimum bid dari state backend, dan sediakan `GET /auctions/:id/bids` terpaginasikan tanpa membocorkan idempotency key.
- [x] Cocokkan Product Q&A dan riwayat AI dengan API; Q&A privat per pemilik, sedangkan commentary Auctioneer tetap publik.
- [x] Konfigurasikan URL API/Socket.IO frontend, CORS Express, dan CORS Socket.IO memakai origin yang dikonfigurasi.

### Realtime integration and verification
- [x] Normalisasi envelope event Socket.IO backend sebelum reducer menggabungkan snapshot, bid, lifecycle, dan AI interaction.
- [x] Snapshot socket mengirim auction, bid history, interaksi AI publik, pagination, version, dan `serverNow`.
- [x] Tambahkan tes untuk kontrak login frontend, normalisasi socket, bid history backend, dan allowlist CORS.
- [x] Jalankan frontend dan backend automated test suites serta production bundle verification.
- [ ] Verifikasi browser dua akun melawan backend nyata untuk seller → buyer → bid → AI → auction ended, termasuk reconnect dan viewport kecil.
- [ ] Verifikasi tampilan responsif lewat browser pada ukuran layar yang didukung.
- [ ] Dokumentasikan install, env, migration, seed, run, test, dan demo lokal pada README/setup guide.

**Checkpoint:** alur end-to-end seller → buyer → AI → bid → auction ended berjalan dari UI.

## FE-10 — Persiapan integrasi akhir (lokal; belum deploy)

- [x] Jalankan regression suite FE-01–FE-09, production build, SPA suite, dan build preview lokal menggunakan mock REST/Socket.IO.
- [x] Verifikasi dua client HTTP/Socket.IO, bid idempotency/lost response, countdown, closure, dan AI melalui integration suite.
- [x] Tambahkan lazy loading per halaman dan lazy image decoding untuk mengurangi JavaScript awal.
- [x] Tambahkan konfigurasi URL production saat build, pemeriksaan HTTPS/WSS, dan pemeriksaan asset/secret pada bundle.
- [x] Tambahkan SPA fallback untuk static hosting, Dockerfile frontend-only, Nginx statis, serta contoh REST/Socket.IO reverse proxy.
- [ ] Jalankan browser automation dua profil dan lima viewport; browser tooling yang tersedia pada sesi ini tidak menyediakan kontrol viewport/network yang dapat diverifikasi.
- [ ] Integrasikan dan uji terhadap backend produksi, TLS/CORS, persistence, migrations, serta AI provider sebenarnya.
- [ ] Deploy setelah persetujuan dan konfigurasi target tersedia (di luar scope FE-10 ini).

**Checkpoint lokal:** lulus untuk mock-backed frontend build dan integration tests. Deployment readiness produksi masih menunggu layanan backend dan verifikasi browser/hosting yang belum tersedia.

## Phase 10 — Verifikasi akhir dan deployment

- [x] Jalankan test suite dan catat hasilnya.
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
