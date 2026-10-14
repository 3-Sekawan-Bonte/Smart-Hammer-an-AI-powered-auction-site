---
type: "query"
date: "2026-10-13T05:39:51.138206+00:00"
question: "jangan yang ke backend dulu dan ini backendnya pake json.server dulu aja"
contributor: "graphify"
outcome: "useful"
source_nodes: ["AuthContext.jsx", "client.js", "Frontend Job Plan FE-01–FE-10"]
---

# Q: jangan yang ke backend dulu dan ini backendnya pake json.server dulu aja

## Answer

Expanded from original query via vocab: [frontend, auth, context, client, api, axios, fixture, json, server, token]. Frontend now uses JSON Server on port 3001 for temporary users and seeded auction data. AuthContext implements login, register, restoreSession, logout, and mock session persistence; auctions/new is protected. Production backend, JWT, and Socket.IO remain deferred.

## Outcome

- Signal: useful

## Source Nodes

- AuthContext.jsx
- client.js
- Frontend Job Plan FE-01–FE-10