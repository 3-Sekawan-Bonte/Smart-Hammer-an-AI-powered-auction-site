# User guide

Smart Hammer is a simulated electronics auction. A verified winner can test checkout through Midtrans Sandbox using BCA Virtual Account or Mandiri Bill Payment. This does not process production payments or arrange delivery. The listing is supplied by its seller; auction state comes from the backend; AI-generated information is a separate informational aid.

## Create an account and sign in

Choose **Register**, provide a username, email, and password, then sign in with the normalized email and password. A signed-in session is restored through the backend when the app reloads. Use **Log out** on a shared device to clear private state and disconnect the socket.

## Browse auctions

The home page shows available live and ended auctions. Search matches titles, and category/status controls narrow the listing. Product categories are smartphones, laptops, PCs, cameras, tablets, monitors, audio, gaming consoles, and accessories. Status means:

- **Draft:** seller-only preparation; not visible in public listings.
- **Live:** accepts valid bids before the server deadline.
- **Ended:** closed by the backend; bidding is no longer accepted.

Open a card to view its description, seller username, product facts, starting/current price, bid history, countdown, AI panel, and (after closure) result.

## Create and manage an auction

From **Create auction**, fill in a title, description, condition, electronics category, optional product facts/image URL, starting price, minimum increment, and duration. The duration selector offers **1 day**, **3 days**, or **7 days**. The backend stores the choice as 86,400, 259,200, or 604,800 seconds.

New listings are drafts. In **My auctions**, the owner can edit or delete a draft. Review the listing and choose **Start auction** when ready. The backend records the start and deadline using server time. A live or ended auction cannot be edited as a draft.

Only provide product details you can support. Product facts are seller-provided and are not independently certified by Smart Hammer.

## Place bids and read history

On a live auction, the minimum is the starting price before the first bid. Later bids must be at least the current price plus the minimum increment. If the bid amount field is empty, **Send bid** uses the latest server-provided minimum. You can enter a larger custom integer rupiah amount; values below the current minimum, decimals, and values beyond the allowed cap are rejected.

Accepted bids appear in **Riwayat penawaran** with the bidder's public username, amount, and timestamp. The countdown reflects the latest server deadline. A valid accepted bid can extend the deadline; a browser timer cannot decide whether a bid is still valid. The backend closes expired auctions and determines the winner, or records a no-bid result.

The UI retains a request ID when retrying an uncertain bid submission. Repeating the same request returns the original accepted result instead of creating another bid.

## Product Q&A and Auctioneer commentary

Ask a product question in the AI panel on a live or ended auction. Your question, answer, and any validated source links are private to your account. A rate limit initially allows one question every ten seconds. Questions about facts absent from the listing may be answered with a notice that the seller must confirm them. Some external product research uses Groq Browser Search; citations come from validated provider metadata. External product information does not establish the actual item's condition, authenticity, or included accessories.

AI Auctioneer commentary is public to auction participants and can appear when an auction starts, after every third accepted bid, and when it ends. It uses a saved auction snapshot and does not set prices, accept bids, close auctions, or select winners.

## Winner payment (Sandbox)

After an auction ends with you as its verified winner, the result panel offers **Bayar dengan Midtrans Sandbox**. The checkout is restricted to BCA Virtual Account and Mandiri Bill Payment. Complete the flow with Midtrans Sandbox simulator instructions; browser checkout callbacks do not determine the final status. Use **Perbarui status** to ask the backend to verify the current status. Sandbox transactions do not charge real money. Payment is not available to sellers, other participants, or auctions without a winning bid.

## Theme

Use the theme control in the navigation to choose Light Mode or Dark Mode. The preference is stored locally in the browser and is independent of the auction/account state.

## Connection and sign-in troubleshooting

- **API unavailable:** confirm the backend is running and `VITE_API_BASE_URL` points to its origin. Restart Vite after changing `.env`.
- **Socket disconnected or stale auction:** check `VITE_SOCKET_URL`, backend availability, and CORS. Rejoining the auction room requests a fresh snapshot.
- **401 / sign-in required:** sign in again; JWTs expire according to the server's `JWT_EXPIRES_IN` setting.
- **Can't bid:** confirm the auction is live, the account is not its seller, the entered amount meets the latest minimum, and the server deadline has not passed.
- **AI unavailable:** auction and bidding operations remain available; retry later. Q&A and commentary depend on backend Groq configuration and provider availability.
- **Private draft missing:** only its owner can retrieve it; sign in with the account that created it.
