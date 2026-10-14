# Graph Report - BidWar  (2026-10-13)

## Corpus Check
- 31 files · ~104,331 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 1, .example 1, .css 1)

## Summary
- 180 nodes · 315 edges · 13 communities (12 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Bid Transaction Service
- start.mjs
- AuctionContext.jsx
- Q: jangan yang ke backend dulu dan ini backendnya pake json.server dulu aja
- Graphify Workflow
- site/package.json
- App.jsx
- AuctionDetailPage.jsx
- Q: UInya kurang modern sih coba anda cari lagi yang lebih modern
- Q: oke langsung lanjut aja
- scripts
- db.json
- Q: terus selanjutnya buat apa?

## God Nodes (most connected - your core abstractions)
1. `react` - 11 edges
2. `useAuth()` - 11 edges
3. `react-router-dom` - 10 edges
4. `App()` - 9 edges
5. `ArrowIcon()` - 9 edges
6. `AuctionDetailPage()` - 8 edges
7. `AuctionProvider()` - 7 edges
8. `useAuction()` - 7 edges
9. `Bid Transaction Service` - 7 edges
10. `BidWar MVP` - 7 edges

## Surprising Connections (you probably didn't know these)
- `FE-01 Frontend Foundation` --implements--> `REST API v1 Contract`  [EXTRACTED]
  graphify-out/memory/query_20261013_050156_acb49a38_saya_bagian_buat_frotend_jadi_langkah_pertamanya_b.md → RENCANA_BIDWAR_AI_SAMPAI_KAMIS.md
- `Frontend Job Plan FE-01–FE-10` --conceptually_related_to--> `Auction Control Room UI`  [INFERRED]
  RENCANA_BIDWAR_AI_SAMPAI_KAMIS.md → graphify-out/memory/query_20261013_050814_92d0b01e_uinya_menurut_anda_bagusnya_gimana.md
- `Server-Authoritative Bidding` --rationale_for--> `AuctionContext`  [EXTRACTED]
  graphify-out/memory/query_20261013_050814_92d0b01e_uinya_menurut_anda_bagusnya_gimana.md → RENCANA_BIDWAR_AI_SAMPAI_KAMIS.md
- `Defer Socket.IO and AI Panel` --rationale_for--> `JWT Authentication`  [EXTRACTED]
  graphify-out/memory/query_20261013_050156_acb49a38_saya_bagian_buat_frotend_jadi_langkah_pertamanya_b.md → RENCANA_BIDWAR_AI_SAMPAI_KAMIS.md
- `Explicit Real-Time Status` --conceptually_related_to--> `Socket.IO Real-Time Synchronization`  [EXTRACTED]
  graphify-out/memory/query_20261013_050814_92d0b01e_uinya_menurut_anda_bagusnya_gimana.md → RENCANA_BIDWAR_AI_SAMPAI_KAMIS.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Core Live Auction Flow** — rencana_bidwar_ai_sampai_kamis_auction_lifecycle, rencana_bidwar_ai_sampai_kamis_bid_transaction_service, rencana_bidwar_ai_sampai_kamis_auction_closure_service, rencana_bidwar_ai_sampai_kamis_socket_io_realtime, rencana_bidwar_ai_sampai_kamis_product_qa, rencana_bidwar_ai_sampai_kamis_ai_auctioneer [EXTRACTED 1.00]
- **Frontend State Synchronization** — rencana_bidwar_ai_sampai_kamis_socket_context, rencana_bidwar_ai_sampai_kamis_auction_context, rencana_bidwar_ai_sampai_kamis_snapshot_version_resync, rencana_bidwar_ai_sampai_kamis_socket_io_v1 [EXTRACTED 1.00]
- **Transactional Consistency Pattern** — rencana_bidwar_ai_sampai_kamis_bid_transaction_service, rencana_bidwar_ai_sampai_kamis_auction_closure_service, rencana_bidwar_ai_sampai_kamis_broadcast_after_commit, rencana_bidwar_ai_sampai_kamis_sequelize_postgresql_persistence [EXTRACTED 1.00]
- **Frontend Foundation Sequence** — graphify_out_memory_query_20261013_050156_acb49a38_saya_bagian_buat_frotend_jadi_langkah_pertamanya_b_fe_01_foundation, rencana_bidwar_ai_sampai_kamis_jwt_authentication, rencana_bidwar_ai_sampai_kamis_react_context_state_management [EXTRACTED 1.00]
- **Live Auction UI State Flow** — rencana_bidwar_ai_sampai_kamis_auction_context, graphify_out_memory_query_20261013_050814_92d0b01e_uinya_menurut_anda_bagusnya_gimana_server_authoritative_bidding, graphify_out_memory_query_20261013_050814_92d0b01e_uinya_menurut_anda_bagusnya_gimana_explicit_realtime_status, rencana_bidwar_ai_sampai_kamis_socket_io_realtime [INFERRED 0.85]

## Communities (13 total, 1 thin omitted)

### Community 0 - "Bid Transaction Service"
Cohesion: 0.10
Nodes (26): FE-01 Frontend Foundation, Frontend First Steps, Auction Control Room UI, AI Auctioneer, AI Interaction Lifecycle, Auction Closure Service, AuctionContext, Auction Lifecycle (+18 more)

### Community 1 - "start.mjs"
Cohesion: 0.16
Nodes (8): databasePath, jsonServerBin, port, readBody(), readDatabase(), saveDatabase(), send(), startFallbackServer()

### Community 2 - "AuctionContext.jsx"
Cohesion: 0.17
Nodes (13): axios, api, TOKEN_KEY, AuctionContext, AuctionProvider(), auctionReducer(), dedupe(), initialState (+5 more)

### Community 3 - "Q: jangan yang ke backend dulu dan ini backendnya pake json.server dulu aja"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: jangan yang ke backend dulu dan ini backendnya pake json.server dulu aja, Source Nodes

### Community 5 - "site/package.json"
Cohesion: 0.07
Nodes (27): json-server, react-dom, tailwindcss, @tailwindcss/vite, vite, @vitejs/plugin-react, dependencies, axios (+19 more)

### Community 6 - "App.jsx"
Cohesion: 0.17
Nodes (18): react-router-dom, App(), AuctionRoomRoute(), GavelIcon(), Brand(), Layout(), ProtectedRoute(), AuthContext (+10 more)

### Community 7 - "AuctionDetailPage.jsx"
Cohesion: 0.34
Nodes (10): react, AuctionCard(), money(), Countdown(), ArrowIcon(), SparkIcon(), useAuction(), useSocket() (+2 more)

### Community 8 - "Q: UInya kurang modern sih coba anda cari lagi yang lebih modern"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: UInya kurang modern sih coba anda cari lagi yang lebih modern, Source Nodes

### Community 9 - "Q: oke langsung lanjut aja"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: oke langsung lanjut aja, Source Nodes

### Community 10 - "scripts"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, dev, mock, preview, setup (+1 more)

### Community 11 - "db.json"
Cohesion: 0.33
Nodes (5): aiInteractions, auctions, bids, $schema, users

### Community 12 - "Q: terus selanjutnya buat apa?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: terus selanjutnya buat apa?, Source Nodes

## Knowledge Gaps
- **58 isolated node(s):** `name`, `private`, `version`, `setup`, `dev` (+53 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 77 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Work-memory lessons

**Preferred sources** — corroborated by past sessions; start here.
- `Frontend Job Plan FE-01–FE-10` (4× useful, score=3.996257361)
- `AuctionDetailPage()` (3× useful, score=2.999749214)
- `AuctionListPage()` (3× useful, score=2.999749214) _(code changed — re-verify)_
- `AuctionCard()` (2× useful, score=1.999764991)
- `React Context State Management` (2× useful, score=1.997144032)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `AuctionDetailPage.jsx` to `AuctionContext.jsx`, `site/package.json`, `App.jsx`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _58 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Bid Transaction Service` be split into smaller, more focused modules?**
  _Cohesion score 0.10476190476190476 - nodes in this community are weakly interconnected._
- **Why does `react-router-dom` connect `App.jsx` to `site/package.json`, `AuctionDetailPage.jsx`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Should `site/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.07389162561576355 - nodes in this community are weakly interconnected._