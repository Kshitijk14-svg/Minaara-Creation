# VPS Hosting Research — Minaara Kurta Store

> Conversation saved: 2026-06-26
> Stack: Next.js 16 + MySQL (Prisma) + Upstash Redis + Cloudinary + NextAuth v5
> Target: 100 concurrent users, future-proof, cost-effective

---

## Q: How should I host this website for 100 concurrent users?

### Recommended Platform: Railway (all-in-one)

Railway runs Next.js as a **persistent Node.js process** (not serverless), meaning one Prisma connection pool shared across all requests — the safest model for Prisma + MySQL.

| Service | Provider | Estimated Cost |
|---|---|---|
| Next.js app | Railway (Hobby plan) | ~$5–10/mo |
| MySQL database | Railway managed MySQL | ~$5–10/mo |
| Redis cache | Upstash (keep existing) | Free tier |
| Image CDN | Cloudinary (keep existing) | Free tier |
| **Total** | | **~$10–20/mo** |

**Why not Vercel (serverless)?**
Vercel runs code as serverless functions — each request can spin up a fresh process with its own Prisma connection pool. With 100 concurrent users you can open 50–80 MySQL connections simultaneously, crashing MySQL's `max_connections`. You'd need Prisma Accelerate (+$10/mo) to fix this, bringing total to ~$50/mo.

**Why not VPS?**
More control and cheaper, but requires manual Nginx, PM2, SSL certs, MySQL tuning — significant DevOps overhead.

---

## Q: Which is better — VPS or Vercel, cost-wise and traffic-wise?

### Vercel

| Plan | Cost | Notes |
|---|---|---|
| Hobby | Free | Limited — 10s timeout, limited bandwidth |
| Pro | $20/mo | Serverless, needs Prisma Accelerate for DB safety |
| + External MySQL (Aiven) | +$19/mo | Cheapest managed MySQL |
| + Prisma Accelerate | +$10/mo | Required to fix connection pool exhaustion |
| **Total** | **~$50/mo** | |

**Problem:** Vercel serverless = multiple cold starts = multiple Prisma pools = MySQL connection exhaustion under 100 concurrent users.

### VPS (DigitalOcean Bangalore)

| Server | Cost | Specs |
|---|---|---|
| Basic Droplet | $12/mo | 2GB RAM, 1 vCPU, 50GB SSD |
| MySQL on same server | $0 extra | Self-hosted |
| **Total** | **$12/mo** | |

**Why VPS solves the Prisma problem:** PM2 runs Next.js as a persistent Node.js process — one connection pool shared across all requests. 100 concurrent users = 10 queued DB connections max. No crashes.

### Side-by-Side

| | Vercel Pro | VPS (DO Bangalore) |
|---|---|---|
| Monthly cost | ~$39–50/mo | ~$12/mo |
| Setup time | 30 min | 3–4 hours |
| DevOps required | None | Low-medium |
| DB connection safety | Needs Prisma Accelerate | Safe out of the box |
| 100 concurrent users | Yes (with Accelerate) | Yes, comfortably |
| Auto-scaling | Yes | No (manual upgrade) |
| India latency | Good (CDN edge) | Best (Bangalore region) |

**Recommendation:** VPS at $12/mo saves ₹40,000+/year over Vercel. Go VPS.

---

## Q: Are there cheaper VPS options than DigitalOcean?

### Cheaper Alternatives

**Oracle Cloud Free Tier — Free forever**
- 4 vCPU, 24GB RAM (ARM), Mumbai region
- Best value if you can get account approved
- Cons: Account approval nightmare for India, ARM architecture, "out of capacity" errors, can be terminated without notice

**Hetzner — €3.79–5.77/mo (~₹340–520)**
- CX11: 2GB RAM, 2 vCPU | CX22: 4GB RAM, 2 vCPU
- Now has Singapore datacenter (opened 2024)
- Add Cloudflare free CDN to mask European latency for Indian users

**Vultr — $6/mo (~₹500)**
- 2GB RAM, 1 vCPU, Mumbai region
- Best India-region budget option

**Contabo — €5.99/mo (~₹540)**
- 4GB RAM, 4 vCPU, Singapore region
- Best specs per euro, but network quality is average

**AWS Lightsail — $10/mo (~₹830)**
- 2GB RAM, Mumbai region, managed AWS infrastructure
- Easiest setup, most reliable

---

## Q: Honest reviews of Bluehost, GoDaddy, SiteGround, Hostinger, Cloudways, A2 Hosting

| Company | Real Cost/mo | Good for Next.js? | India Region | Verdict |
|---|---|---|---|---|
| Bluehost | $30–80 | No | No | Avoid — built for WordPress, heavy upselling, renewal price spikes |
| GoDaddy | $20+ | No | No | Avoid — oversold servers, scripted support, worst in class |
| SiteGround | $100+ | No | No | Avoid — good tech but wildly overpriced, PHP-focused |
| A2 Hosting | $10–15 | Okay | No | Mediocre — Hostinger gives more RAM for same money |
| Cloudways | $14–20 | Okay | No | Okay — managed layer on DO/Vultr, PHP-focused, manual Node.js setup |
| **Hostinger** | **₹300–400** | **Yes** | Singapore | **Good — best traditional host for budget Next.js** |

**Pattern:** Any company that markets to non-developers (Bluehost, GoDaddy, SiteGround) is built for WordPress. Avoid for Next.js.

---

## Q: List of 15 best cheap VPS providers

### Tier 1 — Ultra Budget (Under ₹500/mo)

| # | Provider | Cost/mo | RAM | India/Asia DC | Notes |
|---|---|---|---|---|---|
| 1 | Oracle Cloud | **Free** | 24GB | Mumbai | Account approval difficult from India |
| 2 | Netcup | **₹270** | 2GB | No (Germany) | Cheapest paid, bad India latency |
| 3 | RackNerd | **₹70–115** | 1–2GB | No (US) | Promo deals only, 1GB too tight for Next.js |
| 4 | Ionos | **₹340** | 2GB | No (Europe) | Watch renewal price spike |
| 5 | Hetzner | **₹340–520** | 2–4GB | Singapore | Best price/quality globally |

### Tier 2 — Budget Sweet Spot (₹400–700/mo)

| # | Provider | Cost/mo | RAM | India/Asia DC | Notes |
|---|---|---|---|---|---|
| 6 | OVHcloud | **₹320–540** | 2GB | Singapore | Good network, confusing UI |
| 7 | Hostinger | **₹340–510** | 2–4GB | Singapore | Best for beginners on budget |
| 8 | Contabo | **₹540** | 4GB | Singapore | Best specs/price, average network |
| 9 | Vultr | **₹500** | 2GB | **Mumbai** | Best India-region budget option |
| 10 | E2E Networks | **₹499–999** | 1–2GB | **India** | Indian company, NSE-listed |

### Tier 3 — Reliable Mid-Range (₹700–1200/mo)

| # | Provider | Cost/mo | RAM | India/Asia DC | Notes |
|---|---|---|---|---|---|
| 11 | Kamatera | **₹340–680** | Custom | Hong Kong | 30-day free trial, pay-per-resource |
| 12 | Linode (Akamai) | **₹830** | 2GB | **Mumbai** | Reliable, backed by Akamai CDN |
| 13 | UpCloud | **₹580–1000** | 1–2GB | Singapore | Great I/O performance |
| 14 | AWS Lightsail | **₹830** | 2GB | **Mumbai** | Easiest setup, AWS reliability |
| 15 | DigitalOcean | **₹1000** | 2GB | **Bangalore** | Best developer experience |

### Pick for Minaara

| Priority | Choice |
|---|---|
| Absolutely free | Oracle Cloud (Mumbai) |
| Cheapest paid + India region | **Vultr Mumbai — ₹500/mo** |
| Best specs for money | **Contabo Singapore — ₹540/mo** |
| Easiest setup + India region | **AWS Lightsail Mumbai — ₹830/mo** |
| Indian company preference | **E2E Networks — ₹999/mo** |

**Minimum RAM required: 2GB** — `next build` consumes ~800MB–1GB during compilation. 1GB VPS plans will crash mid-build.

---

## Q: Honest review and comparison — Contabo vs OVHcloud

### Contabo

**Founded 2003, Munich. Known as "too good to be true."**

**How they're this cheap:** Aggressive VM overselling — more VMs per physical host than competitors. When neighbors spike, you feel it.

#### Contabo Pros
- **Specs per euro is unbeatable** — 4GB RAM + 4 vCPU for €5.99, no one comes close
- **Singapore datacenter** — ~80ms from India
- **100GB SSD** at base plan — competitors give 20–40GB
- Stable enough for low-traffic, predictable workloads

#### Contabo Cons
- **Network quality is the biggest weakness** — shared, throttled, inconsistent; users report bandwidth spikes causing slow page loads during peak hours, occasional packet loss on Singapore nodes
- **Hardware is older** — older Xeon CPUs, SATA SSDs (not NVMe) on older plans
- **Overselling is real** — "4 vCPU" isn't always 4 vCPU under load during peak hours
- **Support is painful** — email-only, 24–48 hour response, no live chat
- **Setup fee** — one-time €5–15 not prominently advertised
- **Billing/cancellation issues** — multiple user reports of difficulty cancelling

---

### OVHcloud

**Founded 1999, Roubaix, France. One of Europe's largest cloud providers. Publicly traded.**

#### OVHcloud Pros
- **Network quality is genuinely good** — owns fiber network across Europe and intercontinental cables; stable routing, low packet loss
- **World-class DDoS protection (VAC)** — included on all plans, one of the best in the industry; critical for e-commerce (bots, scrapers)
- **More modern infrastructure** — NVMe SSDs, newer CPUs
- **Better uptime consistency** — day-to-day reliability is strong
- **Established company** — publicly listed, 25+ years in business

#### OVHcloud Cons
- **The 2021 Strasbourg Fire — critical to know:** OVH's SBG2 datacenter burned down completely. SBG1 was severely damaged. Thousands of customers lost data permanently. Backup services were co-located in the same burning building — customers who paid for backups also lost everything. The biggest mark against OVH.
- **Weaker specs for the price** — €5.99 gets 1 vCPU + 2GB RAM vs Contabo's 4 vCPU + 4GB RAM
- **Confusing control panel** — built for enterprise teams, not individual developers
- **Billing complexity** — hourly/monthly/annual mixed billing, bandwidth overage charges
- **Support is slow** — ticket-based, long waits on free tier

---

### Head-to-Head

| Factor | Contabo | OVHcloud | Winner |
|---|---|---|---|
| Price (entry 4GB RAM) | €5.99 | €7.59 | **Contabo** |
| RAM at base price | 4GB | 2GB | **Contabo** |
| CPU at base price | 4 vCPU | 1–2 vCPU | **Contabo** |
| Network stability | Average | Good | **OVH** |
| DDoS protection | Basic | World-class | **OVH** |
| Hardware quality | Older | Newer | **OVH** |
| Support speed | 24–48hr | 12–24hr | **OVH** |
| Data center fire risk | No incident | **Burned down 2021** | **Contabo** |
| Singapore availability | Yes | Yes | Tie |
| India latency | ~80ms | ~80ms | Tie |
| Uptime consistency | Average | Good | **OVH** |
| Billing transparency | Okay | Confusing | **Contabo** |

### Verdict for Minaara

- **Choose Contabo** if budget is the absolute priority and traffic is predictable. 4GB RAM means MySQL and Next.js run comfortably.
- **Choose OVHcloud Essential (€7.59, 4GB RAM)** if network stability and DDoS protection matter more — an e-commerce site gets hit by bots regularly, and OVH's VAC handles this better. Avoid their base 2GB plan — too tight.
- **Better than both for India:** Vultr Mumbai ($6/mo) or AWS Lightsail Mumbai ($10/mo) — India region, better network, similar or lower price.

---

## Final Recommendation Summary

| Use Case | Provider | Cost/mo |
|---|---|---|
| Free, willing to deal with setup | Oracle Cloud Free (Mumbai) | ₹0 |
| Cheapest paid, India region | Vultr Mumbai | ₹500 |
| Best specs, okay with Singapore latency | Contabo Singapore | ₹540 |
| Best network + DDoS, okay with Singapore | OVHcloud Essential Singapore | ₹685 |
| Easiest setup, India region | AWS Lightsail Mumbai | ₹830 |
| Best developer experience, India region | DigitalOcean Bangalore | ₹1000 |

**DATABASE_URL to use on any VPS (prevents MySQL connection exhaustion):**
```
mysql://user:password@localhost:3306/minaara_prod?connection_limit=10&pool_timeout=20
```
