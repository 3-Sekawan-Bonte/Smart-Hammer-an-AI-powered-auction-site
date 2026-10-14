# Smart Hammer — AI Agent Rules

## 1. Baca dokumentasi sebelum bekerja

Sebelum menulis kode, baca:
1. `PROJECT.md` untuk tujuan dan batas scope.
2. `PRD.md` untuk kebutuhan pengguna serta acceptance criteria.
3. `ARCHITECTURE.md` untuk model, API, Socket.IO, dan aturan teknis.
4. `TASKS.md` untuk tahap kerja aktif.

Dokumentasi ini menjelaskan rancangan, bukan bukti bahwa fitur sudah diimplementasikan. Periksa repository dan kode nyata sebelum membuat asumsi.

## 2. Aturan scope dan pengerjaan

- Kerjakan satu tahap atau fitur end-to-end pada satu waktu.
- Jangan menambah fitur di luar MVP tanpa persetujuan eksplisit.
- Jangan menganggap fitur backlog atau endpoint opsional sudah tersedia.
- Jangan mengganti nama field, route, event Socket.IO, atau bentuk response secara sepihak. Jika ada perubahan, perbarui dokumen kontrak terkait.
- Jangan membuat abstraksi besar yang tidak membantu kebutuhan MVP.
- Gunakan pola proyek yang sudah ada jika konsisten; hindari rewrite tanpa kebutuhan.
- Jika dokumentasi bertentangan dengan implementasi yang sudah ada, jelaskan konflik dan dampaknya sebelum melakukan perubahan besar.

## 3. Aturan Git

- Jangan commit perubahan tanpa instruksi eksplisit.
- Jangan push perubahan tanpa instruksi eksplisit.
- Jangan membuat pull request, merge branch, atau mengubah Git history tanpa instruksi eksplisit.
- Jangan menjalankan perintah Git destruktif.
- Jangan deploy tanpa instruksi eksplisit.

## 4. Keamanan

- Jangan pernah menaruh API key, JWT secret, password, token, atau credential dalam source code, log, screenshot, atau response publik.
- Simpan secret melalui environment variable server-side.
- Jangan menggunakan `VITE_*` untuk secret backend.
- Jangan mengirim password hash, JWT, email buyer, atau data privat ke room lelang publik.
- Semua endpoint yang bukan register/login membutuhkan autentikasi sesuai kontrak awal.
- Verifikasi ownership dan authorization di backend. Proteksi route frontend bukan pengganti authorization.
- Validasi input server-side dan tolak field yang tidak dikenal pada mutation.
- Jangan mempercayai `userId`, `sellerId`, `winnerId`, `currentPrice`, `status`, `endsAt`, atau `version` yang dikirim client.
- Perlakukan deskripsi produk dan pertanyaan user sebagai data, bukan instruksi sistem AI.
- Render jawaban AI sebagai teks, bukan HTML mentah.

## 5. Database dan integritas lelang

- Gunakan Sequelize migrations untuk perubahan skema.
- Hindari destructive database operation tanpa persetujuan.
- Jaga constraint, foreign key, dan validasi nominal uang integer.
- `Bid` yang sudah diterima adalah record immutable.
- Satu `bidService` harus menjadi sumber aturan bidding.
- Bid dan closure memakai transaksi serta row lock pada baris Auction yang sama.
- Update bid, harga, highest bidder, deadline, dan version secara konsisten dalam transaksi.
- Broadcast event sukses hanya setelah transaksi commit.
- Implementasikan idempotency `clientRequestId`; retry tidak boleh membuat bid kedua atau memperpanjang deadline berulang.
- Penutupan lelang harus idempotent dan tidak bergantung hanya pada countdown browser.
- Backend/PostgreSQL adalah sumber kebenaran untuk harga, deadline, status, dan winner.

## 6. Socket.IO

- Autentikasi socket dengan JWT handshake.
- Gunakan room `auction:<auctionId>` dan validasi akses di server.
- Socket handler tidak boleh menduplikasi business logic yang sudah dimiliki service.
- Sertakan `auctionId`, `version`, dan `serverNow` pada event state.
- Kirim event perubahan state setelah commit.
- Tangani join/leave, disconnect, reconnect, snapshot/resync, duplicate event, versi usang, dan cleanup listener.
- Jangan menganggap delivery event terjamin saat client disconnect; gunakan database dan snapshot untuk recovery.

## 7. Integrasi AI

- AI hanya untuk Product Q&A dan komentar Auctioneer pada MVP.
- AI tidak boleh menetapkan/menolak bid, menetapkan winner, mengubah harga, deadline, atau status lelang.
- Jangan memanggil AI di dalam transaksi bidding.
- Gunakan fakta dari server dan metadata snapshot; jika informasi tidak ada, jawaban harus menyatakan belum tersedia.
- Jangan mengarang harga pasar, spesifikasi, garansi, keaslian, kondisi, atau aksesori.
- Validasi bentuk output AI, batasi panjang output, dan gunakan timeout/rate limit.
- Tangani status `pending`, `completed`, dan `failed`; kegagalan AI tidak boleh menggagalkan bidding.
- Jangan mengklaim fallback statis sebagai jawaban AI yang sesungguhnya.

## 8. Frontend dan Redux state

- Gunakan Redux Toolkit (`@reduxjs/toolkit`) dan React Redux (`react-redux`) untuk state global.
- Gunakan `configureStore`, `createSlice`, `createAsyncThunk`, `useSelector`, dan `useDispatch` sesuai kebutuhan.
- Pisahkan domain utama menjadi `authSlice`, `auctionSlice`, dan `socketSlice` sesuai `ARCHITECTURE.md`.
- Simpan data serializable saja di Redux. Jangan menyimpan instance Socket.IO, Promise, Error object, function, atau `AbortController` di store.
- Instance Socket.IO dikelola oleh service terpisah. Listener mengirim event ke Redux melalui `dispatch`; reducer tidak melakukan request HTTP atau emit socket.
- State lelang frontend hanya cerminan state backend, bukan sumber kebenaran.
- Form input dan countdown per detik tetap local state.
- Jangan update harga secara optimistis sebelum server menerima bid.
- Deduplicate bid/interaksi AI berdasarkan ID dan abaikan event state dengan version lebih lama.
- Jangan biarkan respons fetch/event dari room lama menimpa room aktif.
- Logout harus membersihkan state privat dan memutus koneksi socket.
- Tangani React Strict Mode, listener cleanup, loading, error, dan reconnect.

## 9. Testing dan verifikasi

- Tambahkan atau perbarui test sesuai perilaku yang diubah.
- Prioritaskan concurrency, idempotency, deadline, closure, ownership, reconnect, dan AI failure.
- Jangan menyatakan test berhasil jika belum dijalankan.
- Jangan menandai task selesai hanya karena kodenya ditulis; jalankan verifikasi yang relevan.
- Uji dengan dua sesi browser untuk live bidding dan sinkronisasi real-time.
- Periksa output build dan pastikan secret tidak masuk bundle frontend.

## 10. Pelaporan hasil

Setelah setiap tahap, laporkan secara ringkas:
- File yang dibuat/diubah.
- Perilaku yang selesai.
- Test/command yang dijalankan dan hasilnya.
- Task yang diperbarui di `TASKS.md`.
- Blocker, asumsi, dan bagian yang masih belum dikerjakan.

Jangan mengklaim fitur selesai jika baru berupa mock, belum terhubung ke backend, atau belum diverifikasi. Jika butuh keputusan produk yang belum ada di dokumen, tanyakan sebelum menetapkan aturan yang berdampak pada bid, pemenang, atau data.
