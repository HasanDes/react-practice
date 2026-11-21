# Glossary

Six architecture terms in plain words, each tied to something real in the Bug Bazaar (D5-4). Each entry has:

- **a one-line version:** what to say first
- **a longer explanation**
- **an example from the store,** with a link to the code or doc
- **what the term is often confused with**

| Term                                          | One line                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| [Latency](#latency)                           | How long one thing takes to come back                                        |
| [Idempotency](#idempotency)                   | Doing it twice has the same effect as doing it once                          |
| [Horizontal scaling](#horizontal-scaling)     | Handling more load by adding more machines, not bigger ones                  |
| [CDN](#cdn-content-delivery-network)          | Copies of your files on servers near your users                              |
| [Cache invalidation](#cache-invalidation)     | Deciding when a saved copy is no longer true, and getting rid of it          |
| [Eventual consistency](#eventual-consistency) | Different parts may disagree for a while, but they settle on the same answer |

---

## Latency

**One line:** the time between asking for something and getting it back.

**Explained:**

- It's a delay, measured for **one** request or action: "the product list took 320 ms".
- It adds up. A page that needs three requests one after another pays three latencies.
- The user feels the slowest step, so latency is usually reported as a percentile, such as "p75 = 850 ms" (three users in four waited 850 ms or less), not as an average.

**In the store:**

- **The mock backend adds latency on purpose:** every response waits 300 ms plus up to 300 ms of random jitter (`VITE_MOCK_LATENCY_MS`). That makes loading states and race conditions show up during development, instead of only on real networks.
- **The app is built around latency rather than pretending it isn't there:**
  - skeletons the same shape as the cards, so nothing jumps when data arrives
  - a 300 ms debounce on search, so typing "duck" sends one request, not four
  - cached pages shown instantly on revisits (D3-5)
  - a 10 s timeout, so a request can't hang forever
- **D4-2 measured it:** product cards became visible 147 ms (20%) sooner on a cold visit ([performance.md](performance.md)).

**Often confused with throughput.** Throughput is how _many_ requests a system handles per second. A road can carry lots of cars (high throughput) while each trip is long (high latency). Adding servers raises throughput; it rarely makes one request faster.

---

## Idempotency

**One line:** an operation is idempotent if doing it twice leaves things exactly as doing it once.

**Explained:**

- Networks lose replies. When a request times out, the client can't tell whether it never arrived or arrived and its answer got lost.
- If the operation is idempotent, the client can simply **retry**. If it isn't, a retry might do the thing twice.
- Some operations are naturally idempotent: reading, or "set quantity to 3". Others, like "create an order", aren't. They're made idempotent with an **idempotency key**: a unique id the client sends with the request, which the server remembers. When it sees the same key again, it returns the original result instead of acting again.

**In the store:**

- **Checkout sends an `Idempotency-Key` header** ([checkoutKey.ts](../src/features/orders/checkoutKey.ts)).
  - The key belongs to the cart's contents, so a retry after a timeout, a double click, or a reload mid-checkout all send the same key.
  - The server returns the original order (same `o-00017`) and doesn't reserve stock again.
  - A different cart gets a new key, because it's a different purchase.
- **The same idea runs through the order design** ([orders.md](orders.md)): the payment worker charges with the order id as its key, because a queue can deliver the same job twice.
- **Naturally idempotent:** the cart's `quantityChanged({ quantity: 3 })` is idempotent; "add one more" isn't. The stepper's **+** button sends the _target_ number (`quantityChanged({ quantity: 3 })`, worked out from what's on screen), so the same update arriving twice still lands on 3.

**Often confused with "safe".** A _safe_ request changes nothing (`GET`). An _idempotent_ one may change things, but repeating it changes nothing more. Deleting order 17 twice leaves it just as deleted as deleting it once.

---

## Horizontal scaling

**One line:** handling more traffic by running more copies of a service side by side, instead of moving to a bigger machine.

**Explained:**

- **Vertical scaling** is a bigger server: more CPU, more memory. It's simple, but it has a ceiling, and that one server is still a single point of failure.
- **Horizontal scaling** is more servers behind a load balancer. It has no hard ceiling, and losing one server doesn't take the service down.
- The catch: any copy must be able to handle any request. A server can't keep anything important in its own memory, such as "who is logged in" or "what's in the cart". That state has to live somewhere shared: a database, a cache, or the client.

**In the store:**

- **The frontend already scales horizontally for free.** It's static files, so any number of servers or CDN nodes can serve it, and none of them needs to know about the others.
- **The API is ready for it:**
  - Requests carry a **bearer token**, and the session lookup lives in shared storage, so any API server can check any request.
  - The cart lives in the browser (`localStorage`), not in a server's memory.
- **The order design scales each part separately** ([orders.md](orders.md)). During a sale you can run ten payment workers and one email worker, and the queue spreads jobs across however many are running.

**Often confused with "the database scales too".** Adding API servers doesn't help if they all wait on one database. Scaling the data layer (read replicas, partitioning) is a separate and harder problem.

---

## CDN (Content Delivery Network)

**One line:** a network of servers around the world that keep copies of your files, so each user downloads them from somewhere close.

**Explained:**

- Distance is latency: a round trip from Sydney to a server in Virginia takes about 200 ms, before any work happens.
- A CDN caches files at "edge" locations near users. The first request in a region goes to the origin server, and later ones are answered from the nearby copy.
- It suits files that are the same for everyone: JavaScript, CSS, images, fonts. It also takes load off the origin.

**In the store:**

- **The deployed store** is served by GitHub Pages, which sits behind a CDN ([ci.md](ci.md)).
- **Vite names built files by content:** for example `assets/index-<hash>.js`. A new release has new file names, so a CDN or browser can keep old files for a long time without ever serving stale code. Only `index.html`, which points at the current names, needs to be fresh.
- **Product images** (`/images/products/*.svg`) are the same for every user, the ideal CDN content.
- **API responses aren't CDN-cached:** they're personal (orders, the session) or change quickly (stock).

**Often confused with hosting.** A CDN usually doesn't _own_ your files. It's a cache in front of an origin, so it faces the same question as any cache: when is a copy out of date? (See the next term.)

---

## Cache invalidation

**One line:** deciding when a saved copy of some data stops being true, and removing or refreshing it.

**Explained:**

- A cache makes things fast by **not** asking the source. That's also its danger: the source can change without the cache knowing.
- There are two main tools:
  - **Expiry:** trust a copy for a fixed time, then ask again. It's simple, but data can be wrong until it expires.
  - **Explicit invalidation:** when you _know_ something changed, throw the affected copies away right then. It's precise, but you have to know everything that a change affects.
- Most real systems use both.

**In the store** ([catalogCache.ts](../src/features/products/catalogCache.ts), D3-5):

- **Expiry:** product lists and details are trusted for 30 s. After that they're shown at once and refreshed in the background (stale-while-revalidate). Related products are trusted for 5 minutes, because suggestions can be a bit old.
- **Explicit invalidation:** after an order goes through, or a 409 says stock is lower than we thought, `forgetProducts(ids)` removes every cached entry that shows those products: lists, details and related products. "Continue shopping" then shows real stock, not the pre-order number.
- **Size limit:** the cache keeps at most 100 entries and drops the least recently used. That isn't about correctness, it's about memory.
- **Not cached at all:** orders and the signed-in user, which must always be current.
- **Hashed file names** (the previous term) are cache invalidation done by renaming: new content, new name, so no copy of the old file can be mistaken for it.

**Often confused with cache eviction.** _Eviction_ removes entries to save space (the LRU limit). _Invalidation_ removes them because they're **wrong**.

---

## Eventual consistency

**One line:** after a change, different parts of a system can disagree for a while, but if nothing else changes, they all end up with the same answer.

**Explained:**

- Keeping everything perfectly in sync at every moment (strong consistency) means every part waits for every other part. That's slow, and fragile when something is down.
- Many systems accept a short window where some copies are behind, in exchange for speed and availability.
- The design question is what happens inside that window, and making sure nothing important goes wrong in it.

**In the store:**

- **Stock:** a product's stock can be shown from three sources at once:
  - a cached list, up to 30 s old
  - the live WebSocket feed
  - the stock saved in the cart line when it was added

  They can disagree for a moment. They converge as the cache refreshes, the feed pushes updates (which also lower cart lines that exceed stock), and checkout asks the server. The safety net is that **the server has the final word**: if the cart is still wrong at checkout, the 409 names each short item and fixes the cart.

- **Order status:** right after checkout, the order is `queued`, not "paid". The confirmation page polls every 3 s and fills in steps as it moves `queued → processing → completed`. In the queue design ([orders.md](orders.md)), that's literally workers catching up.
- **A counter-example:** two tabs with the same cart don't sync with each other. Each writes its own version to `localStorage`, and the last write wins on the next reload. That's not eventual consistency, because nothing makes them converge. Listening for the browser's `storage` event would fix it.

**Often confused with "eventually correct, so it doesn't matter".** The window still has to be safe. Stale stock in a list is fine, because checkout checks. Stale stock at the moment of charging a card wouldn't be, which is why the stock check happens inside the order transaction.
