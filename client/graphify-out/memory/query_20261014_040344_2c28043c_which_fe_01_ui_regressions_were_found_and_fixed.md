---
type: "query"
date: "2026-10-14T04:03:44.818763+00:00"
question: "Which FE-01 UI regressions were found and fixed?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["AuctionListPage", "AuctionDetailPage", "auctionSlice", "authSlice", "mock/start.mjs"]
---

# Q: Which FE-01 UI regressions were found and fixed?

## Answer

The browser audit found authenticated navbar overflow, a tablet detail grid that stayed three columns, a later tablet media query overriding the one-column mobile detail layout, clipped bid controls/history, misleading live/AI copy, and fixture images all showing the keyboard because the API serializer omitted sprite offsets. The fixes add responsive layout rules, localized truthful unavailable states, per-fixture sprite fallback mapping, consistent status labels, and corrected mock records. Verified with 12 automated tests, a production build, browser flows, and screenshots at 375x812, 430x932, 768x1024, 1366x768, and 1920x1080.

## Outcome

- Signal: useful

## Source Nodes

- AuctionListPage
- AuctionDetailPage
- auctionSlice
- authSlice
- mock/start.mjs