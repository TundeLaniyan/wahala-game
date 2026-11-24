# 05 — Low-cost hosting regions: latency and cost evidence

**How to read this.** Research was done on 2026-11-24 with web search. The sandbox's network policy blocked fetching the
provider and measurement pages themselves (DNS errors on `wondernetwork.com`, `hetzner.com`, `digitalocean.com`, `ncc.gov.ng`,
and others), so **every number below is EVIDENCE: seen in a search-result snippet, not read on the page.** Snippets are summaries
and can be wrong or out of date. Prices change (Hetzner raised prices in June 2026; Oracle cut its free tier in 2026). Re-check
each figure on the provider's own page before any purchase. Nothing here is a quote; nothing was bought.

## 1. Latency from Nigeria

### Wired round-trip time (data centre to data centre, WonderNetwork method: ping averages)

| Region | RTT from Lagos | Source (snippet only) | Date seen on source | Notes |
| --- | --- | --- | --- | --- |
| Paris | 105–107 ms | wondernetwork.com/pings/Lagos, /Paris | undated | |
| London | **104–114 ms** (Lagos→London 113.7 on 2026-08-11; London→Lagos 103.9 on 2026-11-16) | wondernetwork.com/pings/Lagos, /London | 2026-08 / 2026-11 | confirms Architecture's "~114 ms"; newest reading is ~10 ms lower |
| Amsterdam | ~110 ms | wondernetwork.com/pings/Lagos, /Amsterdam | undated | |
| Frankfurt | 121–125 ms | wondernetwork.com/pings/Lagos/Frankfurt | 2026-08 / 2026-11 | confirms "~125 ms" |
| Helsinki | ~139 ms | wondernetwork.com/pings/Lagos/Helsinki | undated | |
| Madrid | ~87 ms | wondernetwork.com/pings/Lagos | 2026-08 | not a candidate region in this plan; shows the cables favour Iberia / France |
| Lisbon | ~111 ms | wondernetwork.com/pings/Lagos/Lisbon | 2026-09 | |
| **Johannesburg** | **~73 ms** | wondernetwork.com/pings/Lagos/Johannesburg | "late 2025" sample | **surprising, unverified**: it would beat every European site; it contradicts the next row; may reflect that one host's peering |
| Cape Town | ~240 ms | wondernetwork.com/pings/Lagos/Cape%20Town | undated | **anomalous** (more than 3× Johannesburg): suggests routing through Europe; do not assume Cape Town (AWS `af-south-1`) is near |
| Nairobi | ~193–196 ms | wondernetwork.com/pings/Nairobi/Lagos | 2026-05 | |
| US East | Washington ~229 ms; Atlanta ~198 ms | wondernetwork.com | 2026-08 / 2025-11 | no Ashburn-specific figure found |
| Lagos data centre | **no measurement found** | | | AWS markets "single-digit ms" for its Lagos Local Zone (2023, vendor claim); whether compute is available there was not found |

Stale and contradicted: a 2020 analysis put a Lagos median at 191 ms; the 2026 figures above are what to use.
A forum benchmark by a Nigerian host reported ~93–95 ms to London (anecdotal, undated, different vantage point).

**Correction to `docs/CITY_RUMBLE_ONLINE.md` §9:** it prices "Hetzner-class" servers next to a "prefer London" recommendation,
but **Hetzner Cloud has no London region** (Nuremberg, Falkenstein, Helsinki, Ashburn, Hillsboro, Singapore: EVIDENCE, secondary
sources; check). Hetzner's European sites are Frankfurt-area (+10–17 ms vs London) and Helsinki (+25–35 ms). London-region
choices are DigitalOcean LON1, Akamai/Linode London, UpCloud London, Vultr London, AWS `eu-west-2`, Fly `lhr`.

### Mobile access adds to this, and no source here measures it

- Regulator-published Ookla-based latency to nearby test servers (NCC reports, Dec 2025 – Jun 2026, snippets): MTN ≈ 28–29 ms urban /
  38 ms rural; Airtel ≈ 30–31 / 39–41; Glo ≈ 33 / 38 (one report says 98 for Glo rural: **the two reports conflict**); T2
  (formerly 9mobile) 63 / 92. This excludes transit to Europe. It suggests roughly **30 ms of radio + local network** before any
  long-haul (an inference, not a published figure).
- Jitter (NCC Q4 2025 snippet): MTN and T2 about 11–12 ms; Glo flagged weakest. Under load, MTN loaded latency 787 ms and
  Airtel / T2 under 1,000 ms (allAfrica, Feb 2026): **bufferbloat**, not idle RTT. One undated Lagos spot test saw jitter from 4 to
  642 ms across 13 areas (TechNext).
- Cable facts (snippets): Lagos has about eight submarine cables; WACS lands in London, SAT-3 in Spain / Portugal, Equiano
  starts in Portugal: this is why Europe is close. A landslide in March 2024 cut four cables at once: expect rare multi-day
  degradations with Europe-bound routes (Internet Society report, 2024).
- AWS has a CloudFront edge in Nigeria (June 2023) and a Direct Connect location in Lagos (Rack Centre); Google Cloud and
  Azure: no Nigerian region found.
- Nothing found for Abuja, Port Harcourt, Ibadan or Kano.

### Architecture's emulated game latency (not phones)

Input → visible with a London-like 114 ms profile: 191 / 211 ms (p50 / p95); on a mobile profile (150 ms ± 30, 1 % loss) 261 / 457 ms;
bad mobile (250 ms ± 60, 3 % loss) 448 / 678 ms. I re-measured the clean profile on loopback: 112 / 146 ms (the ~110 ms floor is the
jitter buffer and send batching, not the network). Without client-side prediction, "feel" = RTT + ~70–110 ms; above ~250 ms it
will feel sluggish. **Client-side prediction is Architecture's lever, and a bigger one than a 10 ms region difference.**

### Ranking (evidence, not decision)

1. **Test first, free:** London, Paris, Amsterdam are within ~10 ms of each other on wired evidence: pick on price and quality.
   Frankfurt +10–17 ms. Helsinki, US East, Nairobi, Cape Town: avoid.
2. **Johannesburg**: if (and only if) the phone test confirms ~75–110 ms on MTN / Airtel / Glo it becomes the best region; no
   verified low-cost dedicated-vCPU offering there was found (below).
3. **A Lagos data centre**: probably lowest latency and jitter, but no measurement, opaque pricing, unverified vCPU quality. A
   later experiment, after the first phone data.
4. Final choice **cannot** be made without phones: operator peering varies by ISP, city and hour.

## 2. The free phone test that decides it (no hosting needed)

`ops/probes/latency/index.html` times 30 small requests from the phone to each address and reports min / median / p95 / jitter /
loss, with a "copy results" button. VALIDATED against local servers with known delays (15 ms → 18, 120 → 123, a 50 %-loss server →
42 % loss, a dead address → 100 %). Defaults are public AWS regional `…/ping` endpoints (London, Paris, Frankfurt, Stockholm, Cape
Town, N. Virginia): they are reachable (HTTP 200 here through the sandbox proxy, whose timings mean nothing) and cost nothing, but they
are **not ours and can change**. Add Johannesburg / Madrid / candidate-provider endpoints with `?t=name | https://url,…`.

Plan (30 minutes of people's time): 4–8 testers in Lagos (plus one in Abuja and one in Port Harcourt if possible), each phone on
its own network (MTN, Airtel, Glo, T2, and one on Wi-Fi), at an evening peak and a quiet hour, 3 runs each. Ways to get the page to
a phone: open it from the laptop's LAN server on Wi-Fi (Wi-Fi only); send the single HTML file by WhatsApp and open it locally
(Android; iOS Safari cannot open local HTML easily); or put it on a throwaway static host such as a separate repository's Pages
(a founder decision; do not use this repository's Pages publisher). Decision rule: choose the region with the lowest **p95** (not
median) on the majority of networks; reject any region above ~10 % loss.

## 3. Cost evidence

Sizes: "2 vCPU class" is the private-test box; "4 vCPU class" the next step (06). **Dedicated vCPU strongly preferred**
(a 60 Hz loop and noisy neighbours); shared plans are fine for a throwaway test only after the botstorm rehearsal shows ~70 % /
0 dropped ticks. All prices: EVIDENCE (snippets), seen 2026-11-24, in the currency published.

| Provider / region | Plan | vCPU | Price / month | Included traffic | Overage | Source |
| --- | --- | --- | --- | --- | --- | --- |
| DigitalOcean (LON1 / FRA1 / AMS3: regions not verified) | CPU-Optimized 2 vCPU / 4 GiB | dedicated | **$42** (official snippet; a third party says $40) | 4,000 GiB | $0.01 / GiB (official) | digitalocean.com/pricing/droplets |
| DigitalOcean | CPU-Optimized 4 vCPU / 8 GiB | dedicated | $84 (third party) | 5,000 GiB | $0.01 / GiB | whtop.com listing |
| Akamai / Linode (London exists) | Dedicated G6 4 GB | dedicated | $36 (may be an outdated plan; G8 ≈ $51 with no traffic listed) | 4 TB (G6) | $0.005 / GB | akamai.com/cloud/pricing/cpu |
| UpCloud (London) | 2 vCPU / 4 GB | not stated | $30 or EUR 26 | 4 TB | not found | vpsbenchmarks.com (third party) |
| Hetzner (DE / FI only) | CCX13 2 dedicated / 8 GB | dedicated | **EUR 42.99** (was 15.99 before June 2026) | 20 TB claimed (not confirmed for CCX); US / SG far lower | ~EUR 1 / TB | northflank.com, cloudtally.eu (third party) |
| Hetzner | CCX23 4 dedicated / 16 GB | dedicated | EUR 85.99 | not found | not found | trackvps.com (third party) |
| Hetzner | CPX22 / CPX32 2 / 4 shared | shared | EUR 19.49 / 35.49 | 20 TB | ~EUR 1 / TB | betterstack.com (third party) |
| AWS `eu-west-2` London | c7i.large (2 vCPU / 4 GB) | on-demand | $0.1061 / h ≈ **$77** | none | **$0.09 / GB** after the first 100 GB | doit.com; AWS Lightsail docs |
| AWS `af-south-1` Cape Town | c7i.large | on-demand | ~$0.12 / h ≈ $88 (source row unclear) | none | **~$0.154 / GB** | devzero.io; CloudZero |
| Fly.io (`lhr`; `jnb` unverified) | performance-2x (2 vCPU / 4 GB) | dedicated | $66 (from 2026-10-01) | not found | EU $0.02 / GB; Africa / India $0.12 / GB | fly.io/pricing-update |
| Oracle Cloud Always Free (UK South / Frankfurt) | Ampere A1: cut to 2 OCPU / 12 GB in 2026 | ARM | $0 | 10 TB (one guide) | | InfoQ, linuxiac |
| Lagos hosts | AfriCloud 2 vCPU / 4 GB | not stated | **NGN 140,000** | not stated | | techeconomy.ng review |
| Lagos hosts | Lineserve VPS from NGN 21,950; Whogohost C2 NGN 18,275 | unknown | | | | provider pages / whtop |
| Lagos colocation | Rack Centre, Equinix, MainOne, Galaxy Backbone, ADC | | **no published prices** (quote forms) | | | |

Cautions in the evidence: Hetzner has reportedly restricted new-server creation for some customers since 26 June 2026 (one
source): check in the console before planning around it. Oracle's idle-reclamation rule (CPU 95th percentile under 20 % for 7
days) could reclaim a quiet game server; its free tier is a hobbyist option for a private test only. Hosts advertised as
"Nigerian hosting" may resell European capacity (a guide's warning): ask where the VM physically runs.

### What it adds up to (arithmetic from 06 and the table; assumptions stated)

| Scenario | Compute | Egress at the provider | Monthly total (indicative) |
| --- | --- | --- | --- |
| Private test (2 vCPU dedicated, ~45 GB) | DO $42 · Akamai $36 · Hetzner EUR 43 · Fly $66 · AWS $77 | inside any allowance (AWS: inside the free first 100 GB) | **about $36–77**; plus a domain (~$10 / year) |
| Soft launch (4–6 vCPU, ~1.3 TB) | DO 4 vCPU $84 (or two 2 vCPU $84) · Hetzner CCX23 EUR 86 | DO inside 5,000 GiB; AWS London ≈ $111 | **~$85–170** with multi-process wiring |
| 100 average players, bot-heavy (~10 vCPU, 2.7 TB) | ~$200–250 (3 × 4 vCPU class) | DO inside allowances; AWS London ≈ $231; AWS Cape Town ≈ $396 | ~$200–250 on a host with included traffic; **~$620 on AWS London** (5 × c7i.large ≈ $387 + ≈ $231 egress) |
| 100 average players, full rooms (2 vCPU, 2.7 TB) | ~$42 | DO inside 4,000 GiB; AWS ≈ $231 | ~$42 (DO) vs ~$310 (AWS) |
| 1,000 average players, full rooms (~6 vCPU, 27 TB) | ~$130–170 | DO: ≈ 25,100 GiB − 9,000 GiB pooled allowance ≈ 16,100 GiB × $0.01 ≈ $160–220 over; AWS up to ≈ $2,400 (tiers beyond 10 TB not confirmed, so possibly lower) | ~$300–390 (DO) vs up to ~$2,550 (AWS) |

Reading: **the egress model decides hyperscaler versus included-traffic hosts**; CPU decides everything for bot-heavy rooms.
A Hetzner-class host is the cheapest per CPU, but its nearest sites add roughly 10–35 ms of round trip for Lagos players compared with a London host.

### What a player pays (EVIDENCE: Nigerian mobile data price per GB in 2026)

Reported averages: about NGN 575 / GB (TechCabal, 2025), NGN 431 / GB (Legit.ng, H1 2026), and larger plans near NGN 200–256 / GB.
At those rates the measured 37 MB per player-hour costs a player **about NGN 7–21**, and a 5-minute match (~3.3 MB) about
**NGN 1–2** (downstream only). The initial download of the game itself (models, audio) is a separate and larger cost that this
work did not measure.

### Other costs and free tiers (EVIDENCE: snippets; verify)

Let's Encrypt certificates are free (my knowledge; not re-checked). Grafana Cloud Free (50 GB logs, 14-day retention), Better Stack
Free (10 monitors, 3-minute checks), UptimeRobot Free (50 monitors at 5 minutes; one source says non-commercial only: check the
terms), Sentry Developer plan (about 5,000 errors / month: not confirmed). The watcher and error reporter in `/ops` need none of them.
Foreign-currency billing from Nigeria: the CBN's December 2025 circular requires extra authentication above USD 200 a day on
foreign cards (EVIDENCE); budget for failed-payment risk and keep a second payment method.

## 4. Recommendation (conditional, honest)

1. Do the phone latency test first (free, 30 minutes of testers' time). It either picks a region or shows that no region is good
   enough without prediction.
2. For the **private internet test**, after founder approval: one 2-vCPU dedicated VM, London-class if the test says so
   (DigitalOcean LON1 at $42 with 4,000 GiB is the best-documented option; Akamai London at $36 is a close second, plan to be
   confirmed), Docker + the `ops` compose stack, billing alert set, cancel after the test. About **$40–45 + ~$10 domain**.
3. Do **not** choose on the Hetzner price alone for Nigerian players until the phone test shows the extra 10–35 ms does not matter.
4. Do not commit to AWS for a bandwidth-heavy game: the egress line alone is several times the compute.
5. Lagos colocation and Cloudflare-in-front are experiments for after the first phone data, not first-release dependencies.

## Sources (all seen in search snippets on 2026-11-24; the fetches failed)

WonderNetwork: wondernetwork.com/pings/Lagos · /London · /Frankfurt · /Amsterdam · /Paris · /Lagos/Johannesburg · /Lagos/Cape%20Town ·
/Nairobi/Lagos · /Atlanta/Lagos. NCC: ncc.gov.ng/sites/default/files/2026-01/Network-Performance-%26-5G-Reality.pdf and
/2026-07/Urban-vs-Rural-Analysis.pdf. Opensignal: insights.opensignal.com/reports/2026/07/nigeria/mobile-network-experience.
allAfrica 2026-02-12 (loaded latency). TechNext (jitter spot test). TechCabal (cables; data price). Internet Society 2024 West
Africa cable outage report. AWS: connectingafrica.com (Lagos Local Zone), aws.amazon.com/about-aws/whats-new/2023/06/aws-edge-location-nigeria,
/2023/05/aws-direct-connect-location-lagos-nigeria. Pricing: digitalocean.com/pricing/droplets, akamai.com/cloud/pricing/cpu,
northflank.com/blog/hetzner-cloud-server-price-increases, cloudtally.eu/blog/hetzner-june-2026-price-increase, trackvps.com,
betterstack.com/community/guides/web-servers/hetzner-cloud-review, vpsbenchmarks.com, whtop.com, doit.com, devzero.io, CloudZero,
fly.io/pricing-update, InfoQ and linuxiac (Oracle), techeconomy.ng (AfriCloud), Lineserve and Whogohost pages, grafana.com/pricing.
