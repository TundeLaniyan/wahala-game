# Hosting regions, Nigerian latency evidence, and costs

**Read this first.** The session's network blocks provider and measurement pages (`wondernetwork.com`, `docs.hetzner.com`, `aws.amazon.com`, `ncc.gov.ng`, `vultr.com`, ... all failed DNS here), so **no figure below was read from the primary page**. Each comes from search-result summaries of the cited page or from third-party summaries, and some sources disagree (noted). Treat every number as *to be re-checked on the provider's own page before any purchase*. Nothing has been bought. The latency figures are published inter-city pings, **not measurements from phones**; the phone test (`ops/latency/index.html`) is what decides.

## 1. Latency evidence

| Path | Evidence | Source |
| --- | --- | --- |
| Lagos ↔ London | **~104 ms** average (30 pings; London-origin page 103.9 ms, min 103.65, max 104.8, last checked 2026-11-16). An older Lagos-origin snapshot reads 113.7 ms (2026-08-11). Distance ~5 014 km. | [WonderNetwork Lagos-London](https://wondernetwork.com/pings/Lagos/London), via search summary |
| Lagos ↔ Frankfurt | ~125 ms, as cited in `docs/CITY_RUMBLE_ONLINE.md` section 9 (2026-11-23). **Not re-verified today.** | [WonderNetwork Lagos-Frankfurt](https://wondernetwork.com/pings/Lagos/Frankfurt) |
| Johannesburg ↔ London | ~158 ms (single round, Aug 2026); Frankfurt ↔ Johannesburg ~188 ms. Lagos ↔ South Africa not found; traffic from West Africa often trombones through Europe, so a South African host is **unlikely to beat London for Lagos** (inference). | [Hats Network JNB](https://hatsnet.io/docs/network/latency/jnb-johannesburg.md), [JNB-FRA](https://hatsnet.io/docs/network/latency/pairs/fra-jnb-rtt.md) |
| Africa routing | Study of probes in Lagos/Johannesburg: median African RTT 46 ms vs 25 ms global; some West African networks route to Paris instead of a local node. Secondary summary. | [Measuring Cloud Latency in Africa](https://pubs.cs.uct.ac.za/1704/1/Measuring_Cloud_Latency_in_Africa.pdf) |
| Lagos edge | AWS announced a CloudFront edge in Nigeria (2023): CDN delivery only, not a compute region. | [AWS](https://aws.amazon.com/about-aws/whats-new/2023/06/aws-edge-location-nigeria) |
| Nigerian mobile (access network) | Ookla data in NCC reports, Dec 2025, idle latency: MTN 29 ms urban / 38 rural; Airtel 30 / 39; Glo 33 / **98**; T2 53 / 85.5. Method (which server) not confirmed. **Loaded** latency: MTN 787 ms (Q4 2025): heavy queueing under load. Opensignal July 2026: reliability MTN 656, Glo 576, T2 536, Airtel 419 (no latency figure found). | [NCC Urban vs Rural](https://ncc.gov.ng/sites/default/files/2026-01/Urban-vs-Rural-Analysis.pdf), [Opensignal](https://insights.opensignal.com/reports/2026/07/nigeria/mobile-network-experience), [AllAfrica summary](https://allafrica.com/stories/202602120023.html) |

**Inference (not measured):** a Lagos 4G phone to London is ~104 ms wide-area plus ~30-40 ms radio, about **135-145 ms** idle, worse on Glo/rural and under load. The server-side tests used a 150 ms ±30, 1 % loss emulation: input → visible p50 **261 ms**, p95 457 ms, 0 kicks, 0 hash mismatches (`CITY_RUMBLE_ONLINE.md` 7.3), with the caveat that it will feel sluggish above ~250 ms and client-side prediction is not built. So London is playable-in-principle, not proven on phones. A Lagos-local host could roughly halve the wide-area part (**no measurement or price found**); defer.

## 2. Candidate regions

| Region | Lagos RTT | Verdict |
| --- | --- | --- |
| **London** | ~104 ms (best published) | **First candidate.** Measure it first. |
| Paris | not found | Measure; West African networks often reach Europe here. |
| Frankfurt / Nuremberg / Falkenstein | ~125 ms (unverified) | Cheapest dedicated-CPU options are here (Hetzner). A ~20 ms delta is small against ~260 ms input→visible; decide on measured numbers. |
| Johannesburg / Cape Town | likely > London (inference) | Not recommended unless the phone test says otherwise. |
| Lagos | unmeasured | Later, needs quotes and a test; not for first release. |

## 3. Cost evidence (compute; prices to re-check, tax excluded unless stated)

| Option (2 vCPU class) | Price seen | Included traffic | Notes and source |
| --- | --- | --- | --- |
| Hetzner **CCX13** (2 *dedicated* vCPU, 8 GB), Germany/Finland | **€42.99/month** after the 15 June 2026 rise (was €15.99); one source says €43.49 | 20 TB in EU reported by one source only | Dedicated vCPU suits the tick loop. No London or African site found in the sources. [byteiota](https://byteiota.com/hetzner-june-2026-price-shock/), [mue.app](https://agent.mue.app/news/hetzner-cloud-price-increase-june-2026), [Better Stack](https://betterstack.com/community/guides/web-servers/hetzner-cloud-review/). Cheaper CX plans reported hard to order. |
| Amazon Lightsail, 2 vCPU / 4 GB / 80 GB | **$24/month** (public IPv4); an IPv6-only $20; a conflicting $44 snippet exists | 4 TB | Overage reported ~$0.09/GB (secondary). London region likely but **not confirmed**; CPU may be burstable (**not confirmed**): check before trusting it with a 60 Hz loop. [AWS bundles](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html) |
| Vultr, 2 vCPU / 4 GB | **~$20/month** regular (Johannesburg listing); High Performance $24 with 5 TB | 3 TB regular | Overage $0.01/GB. London exists; London price for this plan **not found**. Third-party aggregators only. [Better Stack Vultr](https://betterstack.com/community/guides/web-servers/vultr-review/) |
| Cloudflare proxy in front | Free plan: WebSockets supported; rate limiting rules included, **1 rule** (Free) | n/a | Official statements via summaries. No numeric WebSocket cap published; "low usage" language. [Cloudflare blog](https://blog.cloudflare.com/unmetered-ratelimiting/), [docs](https://developers.cloudflare.com/support/network/using-cloudflare-with-websockets/) |
| Monitoring / error tracking | Free tiers exist (not priced here) | | Not researched; low priority. |

## 4. What the first tests would cost (estimates, not quotes)

- **Supervised private test (a few hours, up to ~64 guests):** one 2 vCPU / 4 GB VM billed hourly ≈ $0.03-0.06/hour → **well under $1 for compute**; egress ≈ 36 MB per player-hour → ~9 GB for 64 people over 4 hours, inside every allowance above. Plus a hostname (domain registration is a small yearly fee; not researched). The real risk is a VM left running (~$20-45/month): teardown is step 10 of the runbook.
- **Always-on soft launch, one region:** 1-2 VMs ≈ **$24-90/month** (Lightsail/Vultr class to 2 × CCX13).
- **Scaling (from `CAPACITY.md`, Hetzner-class, egress included):** 100 average CCU in bot-heavy rooms ≈ 7-10 vCPU ≈ **~5 × CCX13 ≈ €215/month**; 100 CCU in full 32-human rooms ≈ 1-2 vCPU ≈ €45-90; 1 000 CCU full rooms ≈ 5 vCPU ≈ €130; the same 1 000 on a hyperscaler pays ~$2 200 for egress alone ($0.09/GB). **Bots dominate cost, not bandwidth.**

## 5. How to turn this into a decision (zero cost)

1. Host `ops/latency/index.html` anywhere static (or open it from the laptop's LAN server) and have 5-10 players across MTN, Airtel, Glo, T2 and home Wi-Fi in Lagos and one other city run it. It measures RTT to London, Paris, Frankfurt, Ireland, Milan and Cape Town through public AWS regional endpoints (no account, no cost) and returns JSON including carrier and connection type.
2. Pick the region with the best **p95 and jitter** (not just median) on the worst carrier; compare the price at that region.
3. Only then ask for approval to create one VM there.
