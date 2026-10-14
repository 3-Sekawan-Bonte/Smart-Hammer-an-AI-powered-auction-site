# Smart Hammer — Product Requirements Document

## 1. Ringkasan produk

Smart Hammer adalah aplikasi simulasi lelang barang elektronik dengan live bidding dan AI Auctioneer. Peserta dapat melihat informasi produk, mengajukan penawaran, bertanya kepada AI, dan mengikuti perubahan lelang secara langsung.

## 2. Pengguna dan izin

### Guest
- Dapat membuka halaman login dan register.
- Tidak dapat mengakses endpoint aplikasi yang memerlukan autentikasi.

### Registered user
Setiap registered user dapat bertindak sebagai seller pada lelangnya sendiri dan buyer pada lelang pengguna lain.

**Seller dapat:**
- Membuat draft lelang.
- Mengedit draft miliknya.
- Memulai draft miliknya.
- Melihat bid, komentar AI Auctioneer publik, Q&A miliknya sendiri, dan hasil lelang.

**Buyer/peserta dapat:**
- Melihat lelang yang tersedia.
- Bergabung ke room lelang.
- Melihat informasi dan riwayat bid.
- Mengajukan bid valid.
- Mengajukan Q&A produk privat miliknya sendiri dan melihat komentar AI Auctioneer publik.

**Batasan:** seller tidak boleh menawar lelangnya sendiri. Akses dan kepemilikan harus diverifikasi backend, bukan hanya disembunyikan pada UI.

## 3. Alur pengguna

### Seller
Register/login → membuat draft → mengisi informasi barang dan harga → memulai lelang → memantau bidding dan Q&A → melihat hasil.

### Buyer
Register/login → melihat daftar lelang → membuka detail → bertanya kepada AI atau mengajukan bid → mengikuti harga/riwayat secara langsung → melihat hasil.

### Product Q&A
User mengirim pertanyaan → backend mengambil fakta produk dan snapshot lelang → menyimpan interaksi `pending` privat → AI menjawab dari data listing atau menggunakan Groq Browser Search untuk pertanyaan eksternal yang relevan → jawaban, status, dan sumber terverifikasi disimpan → hasil dikirim hanya ke user pemilik. Jika fakta listing tidak tersedia, AI harus menyatakan bahwa informasi tersebut belum tersedia dan perlu dikonfirmasi kepada seller. AI Auctioneer tetap publik.

## 4. Persyaratan fungsional

### FR-01 — Autentikasi
- Register menggunakan username, email, dan password.
- Email unik dan dinormalisasi menjadi lowercase.
- Password disimpan sebagai hash bcryptjs, bukan plaintext.
- Login menghasilkan JWT.
- `GET /users/me` digunakan untuk memvalidasi sesi ketika halaman di-refresh.

### FR-02 — Draft dan data lelang
- User login dapat membuat draft lelang barang elektronik.
- Draft menyimpan judul, deskripsi, kondisi, fakta produk, URL gambar, harga awal, dan minimum increment.
- Data kondisi produk MVP: `new`, `used_good`, atau `used_fair`.
- `productFacts` mencakup spesifikasi, kekurangan/cacat, aksesori, dan garansi.
- Kategori dipilih seller dari daftar subkategori elektronik: `smartphone`, `laptop`, `pc`, `camera`, `tablet`, `monitor`, `audio`, `gaming_console`, `accessories`; backend memvalidasi nilai.
- Hanya pemilik draft yang dapat mengedit, menghapus, atau memulai draft tersebut.
- Durasi lelang dipilih melalui opsi 1, 3, atau 7 hari; API menyimpan durasi sebagai integer detik (`86400`, `259200`, `604800`). Backend menerima rentang 60–604800 detik dan mempertahankan minimum 60 detik.
- Gambar memakai URL HTTPS; upload file tidak termasuk MVP.

### FR-03 — Status dan lifecycle lelang
Status lelang: `draft`, `live`, `ended`.
- Saat draft dibuat, `startsAt` dan `endsAt` belum diisi.
- Saat seller memulai lelang, server mengisi waktu mulai dan deadline awal dari `durationSeconds`.
- Hanya lelang berstatus `live` yang menerima bid.
- Backend menutup lelang setelah deadline terlewati, menentukan pemenang, dan menyimpan hasilnya.
- Pemanggilan penutupan berulang tidak boleh menghasilkan pemenang atau hasil yang berbeda.
- Lelang yang berakhir tanpa bid memiliki `winner = null` dan `finalPrice = null`.

### FR-04 — Validasi bidding
- Nominal bid berupa integer rupiah positif, tidak menerima float, NaN, nilai negatif, atau input nominal yang tidak valid.
- Nilai minimum bid pertama adalah `startingPrice`.
- Setelah ada bid, minimum berikutnya adalah `currentPrice + minIncrement`.
- Seller tidak dapat menawar lelangnya sendiri.
- Bid hanya diterima jika status masih `live` dan waktu server masih sebelum `endsAt`.
- Request bid menggunakan `clientRequestId` untuk idempotency.
- Mengirim ulang ID dan payload yang sama mengembalikan hasil request awal tanpa membuat bid atau memperpanjang deadline lagi.
- Menggunakan ID yang sama untuk payload berbeda ditolak.
- Bid yang bersaing diproses dengan transaksi/locking agar harga tidak turun dan state tidak inkonsisten.

### FR-05 — Sliding deadline
Pada saat lelang dimulai:
`endsAt = startsAt + durationSeconds`

Setelah bid valid, backend menghitung:
`newEndsAt = max(currentEndsAt, acceptedBidTime + 3600 detik)`

Jika `newEndsAt` lebih besar daripada `currentEndsAt`, deadline diperbarui. Semua waktu berasal dari server. Frontend hanya menampilkan countdown; countdown tidak menentukan apakah bid masih sah.

### FR-06 — Live updates dan recovery
- Peserta bergabung ke Socket.IO room berdasarkan `auctionId`.
- Harga, bid baru, waktu akhir, status mulai/selesai, dan komentar AI Auctioneer disebarkan ke room lelang; event Q&A privat hanya dikirim ke room user pemilik.
- Snapshot menyertakan `version` dan waktu server.
- Frontend mengabaikan event state yang lebih lama, menghindari duplikasi berdasarkan ID, dan melakukan resync jika ada celah versi.
- Refresh/reconnect memuat snapshot terbaru dari backend/database.
- Event sukses bidding hanya disebarkan setelah transaksi commit.

### FR-07 — AI Product Q&A
- User dapat mengirim pertanyaan tentang produk dalam lelang `live` atau `ended`.
- Backend menyimpan interaksi sebagai `pending`, lalu memperbaruinya menjadi `completed` atau `failed`.
- Interaksi pertanyaan, jawaban, dan sumber hanya dapat dilihat user pemilik; komentar AI Auctioneer tetap publik.
- Sumber eksternal harus berasal dari citation metadata tool Groq, menggunakan URL HTTPS; harga baru perlu sedikitnya dua domain independen, jika tidak AI tidak memberi angka harga.
- AI menggunakan fakta produk dari seller dan snapshot lelang yang diambil server.
- Pertanyaan yang memerlukan harga ritel, spesifikasi eksternal, informasi resmi, ketersediaan, tanggal rilis, atau ulasan boleh menggunakan Groq Browser Search (`openai/gpt-oss-120b`).
- Untuk klaim eksternal, tampilkan citation marker yang terhubung ke sumber HTTPS dari metadata Groq; jangan membuat URL/citation sendiri. Harga ritel baru harus dibedakan dari harga atau kondisi item lelang dan dinyatakan dapat berubah menurut penjual/tanggal.
- Browser Search menggunakan plain-text completion tanpa `response_format`; Q&A tanpa pencarian tetap memakai kontrak terstruktur `answer` dan `missingInformation`.
- AI harus mengakui jika informasi tidak tersedia.
- AI tidak boleh mengarang spesifikasi, garansi, keaslian, kondisi, kelengkapan, atau harga pasar; informasi pasar dari web harus diberi sumber dan tidak membuktikan kondisi item lelang.
- AI tidak menentukan harga, validitas bid, pemenang, atau lifecycle lelang.
- Kegagalan AI tidak boleh menghentikan bidding.
- Q&A diberi rate limit awal satu pertanyaan per user setiap 10 detik.
- Pertanyaan yang meminta harga ritel baru harus menyertakan sumber independen setidaknya dari dua domain sebelum memberikan harga/rentang; bila tidak, AI menyatakan harga tidak dapat diverifikasi.

### FR-08 — AI Auctioneer
- AI membuat komentar pembukaan, komentar pada **setiap bid ke-3** (bid ke-3, ke-6, ke-9, dst.), dan komentar akhir.
- Komentar hanya dipicu oleh backend; tidak membuat komentar untuk setiap bid.
- Komentar berisi metrik yang dihitung backend, seperti jumlah bid, perubahan dari harga awal, atau waktu tersisa pada snapshot.
- Komentar diproses di luar transaksi bid dan tidak boleh menunda proses bidding/penutupan.
- Respons yang memakai state lama harus ditandai berdasarkan snapshot atau tidak ditampilkan sebagai state terkini.

## 5. Halaman utama

| Route | Tujuan | Isi utama |
|---|---|---|
| `/login` | Login | Email, password, loading/error |
| `/register` | Register | Username, email, password |
| `/` | Daftar lelang | Kartu produk, status, harga, search by title, filter by category/status |
| `/auctions/new` | Buat lelang | Form produk dan aturan harga/durasi |
| `/auctions/:id` | Detail/live auction | Produk, harga, countdown, bid form, riwayat, panel AI dan hasil |
| `/my-auctions` | Lelang milik user | Draft/live/ended milik user; akses via `GET /auctions?seller=me` |

Komponen inti: Navbar, AuctionCard, AuctionForm, BidForm, BidHistory, Countdown, AIPanel, WinnerBanner. Pada layar kecil, kolom halaman detail ditumpuk secara vertikal.

Format tampilan harga: `Rp 1.500.000` (locale Indonesia dengan pemisah titik). Bahasa UI: Bahasa Indonesia.

## 6. Persyaratan nonfungsional

- **Keamanan:** secret hanya di backend; validasi request; autentikasi dan authorization pada REST dan Socket.IO.
- **Integritas:** bid dan penutupan lelang memakai transaksi serta mengunci baris Auction yang sama.
- **Keandalan:** event tidak dikirim sebelum commit; data bisa dipulihkan dari snapshot database setelah reconnect/restart.
- **Keterbacaan UI:** loading, empty state, validasi, error, status koneksi dan status AI dijelaskan kepada user.
- **Skala MVP:** satu proses backend; tidak perlu Redis atau multi-server.
- **Privasi:** response publik hanya menyertakan informasi profil minimum seperti `id` dan `username`; jangan mengirim email, hash password, token, atau secret ke room lelang.

## 7. Kriteria penerimaan MVP

- [ ] User dapat register dan login.
- [ ] Seller dapat membuat draft dan memulai lelang miliknya.
- [ ] Dua buyer pada sesi browser berbeda melihat bid valid tanpa refresh.
- [ ] Bid terlalu rendah, self-bid, bid sesudah deadline, dan payload nominal invalid ditolak.
- [ ] Dua bid yang hampir bersamaan tidak merusak harga atau state akhir.
- [ ] Retry menggunakan `clientRequestId` yang sama tidak membuat bid duplikat.
- [ ] Sliding deadline diperbarui dan countdown menerima `endsAt` terbaru.
- [ ] Penutupan menyimpan pemenang, atau `winner = null` jika tidak ada bid.
- [ ] Refresh/reconnect memperlihatkan state tersimpan terbaru.
- [ ] Q&A nyata dengan API Generative AI berhasil dan jawaban tersimpan.
- [ ] AI menyatakan informasi belum tersedia bila fakta produk tidak tercatat.
- [ ] Kegagalan AI tidak memengaruhi proses bidding.
- [ ] Tidak ada secret, token, atau password hash pada respons publik.

## 8. Di luar scope

AI summary, notifikasi tersimpan, presence, pencarian/filter lanjutan, dashboard riwayat, upload gambar, watchlist, grafik bid, AI Bid Coach, price advisor umum, fraud flags, private chat, voice, payment/wallet, auto-bid, Redis dan multi-server ditunda sampai alur inti stabil. Product Q&A boleh menjawab pertanyaan produk spesifik dengan harga ritel web yang disumberkan; ini bukan rekomendasi harga lelang.
