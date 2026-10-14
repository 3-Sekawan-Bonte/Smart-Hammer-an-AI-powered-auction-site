# Graph Report - Smart-Hammer-an-AI-powered-auction-site  (2026-10-14)

## Corpus Check
- 49 files · ~184,326 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 1, .example 1, .css 1)

## Summary
- 411 nodes · 657 edges · 28 communities (24 shown, 4 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 25 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `64e9158d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Bid Transaction Service
- start.mjs
- SocketContext.jsx
- Q: jangan yang ke backend dulu dan ini backendnya pake json.server dulu aja
- Graphify Workflow
- client/package.json
- auctionSlice.js
- Q: oke buat yang ini
- Q: UInya kurang modern sih coba anda cari lagi yang lebih modern
- Q: oke langsung lanjut aja
- scripts
- Smart Hammer — Technical Architecture
- Q: terus selanjutnya buat apa?
- Q: masih sebanyak apa lgi fiurnya?
- Q: ini kalo saya ganti ai gitu nanti dia bisa saya langsung suruh pake graphify buat lihat semuanya kan/
- AuctionListPage.jsx
- 4. Persyaratan fungsional
- Q: FE-01 frontend foundation review after fixes
- Smart Hammer — Development Tasks
- Smart Hammer — AI Agent Rules
- Smart Hammer — Project Overview
- db.json
- commit-auth.sh
- FE-01 audit and completion record
- AuctionDetailPage.jsx
- Q: FE-01 foundation fixes and verification

## God Nodes (most connected - your core abstractions)
1. `createMockServer()` - 19 edges
2. `AuctionDetailPage()` - 18 edges
3. `getApiData()` - 14 edges
4. `Smart Hammer — Technical Architecture` - 13 edges
5. `Smart Hammer — Development Tasks` - 13 edges
6. `react-router-dom` - 11 edges
7. `useAuth()` - 11 edges
8. `AuctionListPage()` - 11 edges
9. `Smart Hammer — AI Agent Rules` - 11 edges
10. `AuthProvider()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `8. State management frontend` --references--> `auth()`  [INFERRED]
  PROJECT.md → client/test/mock-api.test.mjs
- `FE-01 Frontend Foundation` --implements--> `REST API v1 Contract`  [EXTRACTED]
  graphify-out/memory/query_20261013_050156_acb49a38_saya_bagian_buat_frotend_jadi_langkah_pertamanya_b.md → RENCANA_BIDWAR_AI_SAMPAI_KAMIS.md
- `Frontend Job Plan FE-01–FE-10` --conceptually_related_to--> `Auction Control Room UI`  [INFERRED]
  RENCANA_BIDWAR_AI_SAMPAI_KAMIS.md → graphify-out/memory/query_20261013_050814_92d0b01e_uinya_menurut_anda_bagusnya_gimana.md
- `Server-Authoritative Bidding` --rationale_for--> `AuctionContext`  [EXTRACTED]
  graphify-out/memory/query_20261013_050814_92d0b01e_uinya_menurut_anda_bagusnya_gimana.md → RENCANA_BIDWAR_AI_SAMPAI_KAMIS.md
- `Defer Socket.IO and AI Panel` --rationale_for--> `JWT Authentication`  [EXTRACTED]
  graphify-out/memory/query_20261013_050156_acb49a38_saya_bagian_buat_frotend_jadi_langkah_pertamanya_b.md → RENCANA_BIDWAR_AI_SAMPAI_KAMIS.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Core Live Auction Flow** — rencana_bidwar_ai_sampai_kamis_auction_lifecycle, rencana_bidwar_ai_sampai_kamis_bid_transaction_service, rencana_bidwar_ai_sampai_kamis_auction_closure_service, rencana_bidwar_ai_sampai_kamis_socket_io_realtime, rencana_bidwar_ai_sampai_kamis_product_qa, rencana_bidwar_ai_sampai_kamis_ai_auctioneer [EXTRACTED 1.00]
- **Frontend State Synchronization** — rencana_bidwar_ai_sampai_kamis_socket_context, rencana_bidwar_ai_sampai_kamis_auction_context, rencana_bidwar_ai_sampai_kamis_snapshot_version_resync, rencana_bidwar_ai_sampai_kamis_socket_io_v1 [EXTRACTED 1.00]
- **Transactional Consistency Pattern** — rencana_bidwar_ai_sampai_kamis_bid_transaction_service, rencana_bidwar_ai_sampai_kamis_auction_closure_service, rencana_bidwar_ai_sampai_kamis_broadcast_after_commit, rencana_bidwar_ai_sampai_kamis_sequelize_postgresql_persistence [EXTRACTED 1.00]
- **Frontend Foundation Sequence** — graphify_out_memory_query_20261013_050156_acb49a38_saya_bagian_buat_frotend_jadi_langkah_pertamanya_b_fe_01_foundation, rencana_bidwar_ai_sampai_kamis_jwt_authentication, rencana_bidwar_ai_sampai_kamis_react_context_state_management [EXTRACTED 1.00]
- **Live Auction UI State Flow** — rencana_bidwar_ai_sampai_kamis_auction_context, graphify_out_memory_query_20261013_050814_92d0b01e_uinya_menurut_anda_bagusnya_gimana_server_authoritative_bidding, graphify_out_memory_query_20261013_050814_92d0b01e_uinya_menurut_anda_bagusnya_gimana_explicit_realtime_status, rencana_bidwar_ai_sampai_kamis_socket_io_realtime [INFERRED 0.85]

## Communities (28 total, 4 thin omitted)

### Community 0 - "Bid Transaction Service"
Cohesion: 0.10
Nodes (26): FE-01 Frontend Foundation, Frontend First Steps, Auction Control Room UI, AI Auctioneer, AI Interaction Lifecycle, Auction Closure Service, AuctionContext, Auction Lifecycle (+18 more)

### Community 1 - "start.mjs"
Cohesion: 0.10
Nodes (24): AUCTION_FIELDS, CONDITIONS, createMockServer(), defaultDatabasePath, defaultPort, errorResponse(), getCurrentUser(), isOwner() (+16 more)

### Community 2 - "SocketContext.jsx"
Cohesion: 0.14
Nodes (16): store, SocketContext, SocketProvider(), initialState, selectConnectionStatus(), socketSlice, disconnectSocket(), initSocket() (+8 more)

### Community 3 - "Q: jangan yang ke backend dulu dan ini backendnya pake json.server dulu aja"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: jangan yang ke backend dulu dan ini backendnya pake json.server dulu aja, Source Nodes

### Community 5 - "client/package.json"
Cohesion: 0.07
Nodes (27): dependencies, axios, react, react-dom, react-redux, react-router-dom, @reduxjs/toolkit, socket.io-client (+19 more)

### Community 6 - "auctionSlice.js"
Cohesion: 0.11
Nodes (30): AuthContext, AuthProvider(), askAI, auctionSlice, createAuction, fixtureImagePositions, initialState, loadAIInteractions (+22 more)

### Community 7 - "Q: oke buat yang ini"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: oke buat yang ini, Source Nodes

### Community 8 - "Q: UInya kurang modern sih coba anda cari lagi yang lebih modern"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: UInya kurang modern sih coba anda cari lagi yang lebih modern, Source Nodes

### Community 9 - "Q: oke langsung lanjut aja"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: oke langsung lanjut aja, Source Nodes

### Community 10 - "scripts"
Cohesion: 0.18
Nodes (10): name, private, scripts, build, dev, mock, preview, setup (+2 more)

### Community 11 - "Smart Hammer — Technical Architecture"
Cohesion: 0.05
Nodes (43): 10.1 Stack dan store, 10.2 Pembagian state, 10.3 Pembagian tanggung jawab, 10.4 Socket.IO dan sinkronisasi Redux, 10.5 Serializability dan state lokal, 10.6 Contoh struktur frontend, 10. Frontend state management dengan Redux Toolkit, 11. Environment variables (+35 more)

### Community 12 - "Q: terus selanjutnya buat apa?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: terus selanjutnya buat apa?, Source Nodes

### Community 13 - "Q: masih sebanyak apa lgi fiurnya?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: masih sebanyak apa lgi fiurnya?, Source Nodes

### Community 14 - "Q: ini kalo saya ganti ai gitu nanti dia bisa saya langsung suruh pake graphify buat lihat semuanya kan/"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: ini kalo saya ganti ai gitu nanti dia bisa saya langsung suruh pake graphify buat lihat semuanya kan/, Source Nodes

### Community 15 - "AuctionListPage.jsx"
Cohesion: 0.15
Nodes (25): App(), AuctionCard(), conditionLabel(), money(), Countdown(), ArrowIcon(), EyeIcon(), EyeOffIcon() (+17 more)

### Community 16 - "4. Persyaratan fungsional"
Cohesion: 0.09
Nodes (22): 1. Ringkasan produk, 2. Pengguna dan izin, 3. Alur pengguna, 4. Persyaratan fungsional, 5. Halaman utama, 6. Persyaratan nonfungsional, 7. Kriteria penerimaan MVP, 8. Di luar scope (+14 more)

### Community 17 - "Q: FE-01 frontend foundation review after fixes"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: FE-01 frontend foundation review after fixes, Source Nodes

### Community 18 - "Smart Hammer — Development Tasks"
Cohesion: 0.12
Nodes (16): Backlog opsional — jangan mulai sebelum alur inti stabil, Iterasi berikutnya, Phase 0 — Kunci scope dan fondasi, Phase 10 — Verifikasi akhir dan deployment, Phase 1 — Database, Phase 2 — Authentication, Phase 3 — Auction API dan lifecycle, Phase 4 — Bidding aman dan idempotency (+8 more)

### Community 19 - "Smart Hammer — AI Agent Rules"
Cohesion: 0.17
Nodes (11): 10. Pelaporan hasil, 1. Baca dokumentasi sebelum bekerja, 2. Aturan scope dan pengerjaan, 3. Aturan Git, 4. Keamanan, 5. Database dan integritas lelang, 6. Socket.IO, 7. Integrasi AI (+3 more)

### Community 20 - "Smart Hammer — Project Overview"
Cohesion: 0.15
Nodes (12): auth(), 1. Ringkasan, 2. Tujuan, 3. Teknologi, 4. Peran pengguna, 5. Fitur MVP, 6. Bukan bagian MVP, 7. Prinsip utama (+4 more)

### Community 21 - "db.json"
Cohesion: 0.33
Nodes (5): aiInteractions, auctions, bids, $schema, users

### Community 23 - "FE-01 audit and completion record"
Cohesion: 0.14
Nodes (12): Backend handoff, FE-01 audit and completion record, Files, Requirement reconciliation, Scope completed, Verification, Demo accounts, FE-01 scope (+4 more)

### Community 26 - "AuctionDetailPage.jsx"
Cohesion: 0.27
Nodes (13): SparkIcon(), useSocket(), selectActiveAIInteractions(), selectActiveAuction(), selectActiveBids(), selectActiveError(), selectActiveId(), selectActiveLoading() (+5 more)

### Community 27 - "Q: FE-01 foundation fixes and verification"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: FE-01 foundation fixes and verification, Source Nodes

## Knowledge Gaps
- **173 isolated node(s):** `$schema`, `users`, `auctions`, `bids`, `aiInteractions` (+168 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 215 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Work-memory lessons

**Preferred sources** — corroborated by past sessions; start here.
- `Frontend Job Plan FE-01–FE-10` (6× useful, score=5.876964753)
- `AuctionDetailPage()` (4× useful, score=3.920126757) _(code changed — re-verify)_
- `AuctionListPage()` (4× useful, score=3.920074607) _(code changed — re-verify)_
- `start.mjs` (2× useful, score=1.999976458) _(code changed — re-verify)_
- `App.jsx` (2× useful, score=1.999976458) _(code changed — re-verify)_
- `auctionSlice.js` (2× useful, score=1.999976458) _(code changed — re-verify)_
- `api.js` (2× useful, score=1.999976458) _(code changed — re-verify)_
- `AuctionDetailPage.jsx` (2× useful, score=1.999976458) _(code changed — re-verify)_
- `FE-01 Frontend Foundation` (2× useful, score=1.999976458)
- `CreateAuctionPage()` (2× useful, score=1.960169544) _(code changed — re-verify)_

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@reduxjs/toolkit` connect `SocketContext.jsx` to `client/package.json`, `auctionSlice.js`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `AuctionDetailPage()` (e.g. with `selectActiveAIInteractions()` and `selectActiveAuction()`) actually correct?**
  _`AuctionDetailPage()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **What connects `$schema`, `users`, `auctions` to the rest of the system?**
  _173 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Bid Transaction Service` be split into smaller, more focused modules?**
  _Cohesion score 0.10476190476190476 - nodes in this community are weakly interconnected._
- **Why does `auth()` connect `Smart Hammer — Project Overview` to `start.mjs`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Should `start.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.10160427807486631 - nodes in this community are weakly interconnected._
- **Should `SocketContext.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.13538461538461538 - nodes in this community are weakly interconnected._