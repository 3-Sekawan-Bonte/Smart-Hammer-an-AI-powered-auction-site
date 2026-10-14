---
type: "query"
date: "2026-10-13T05:01:56.850372+00:00"
question: "saya bagian buat frotend jadi langkah pertamanya buat apa dlu anda lihat file mdnya"
contributor: "graphify"
outcome: "useful"
source_nodes: ["Frontend Job Plan FE-01–FE-10", "React Context State Management", "REST API v1 Contract", "JWT Authentication"]
---

# Q: saya bagian buat frotend jadi langkah pertamanya buat apa dlu anda lihat file mdnya

## Answer

Expanded from original query via graph vocab: [frontend, job, plan, react, context, authentication, socket, api]. Langkah pertama adalah FE-01: setup React + Vite + Tailwind, router, layout, Axios/API client dengan base URL dari environment, dan fixtures berdasarkan kontrak bagian 27.2. Buat route /login, /register, /, /auctions/new, /auctions/:id, dan opsional /my-auctions; target selesai ketika semua halaman dasar dapat dibuka dengan data mock. Setelah itu lanjut FE-02 Auth, FE-03 Auction UI, lalu dasar FE-04 AuctionContext. Jangan mulai dari Socket.IO atau AI panel karena keduanya bergantung pada auth, state room, dan kontrak backend.

## Outcome

- Signal: useful

## Source Nodes

- Frontend Job Plan FE-01–FE-10
- React Context State Management
- REST API v1 Contract
- JWT Authentication