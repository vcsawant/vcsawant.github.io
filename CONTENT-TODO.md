# Content TODO

Every `{{TODO: …}}` placeholder in the site, in one place. Real copy comes from Viren —
never invented. When an item lands: replace the placeholder, flip `placeholder: false` in the
project frontmatter (where applicable), and check it off here.

## Copy

- [ ] **Positioning line** — `src/components/Hero.astro` — one sentence under the name.
      Current placeholder: "Technical consultant and co-founder. I own delivery:
      architecture, code, and shipping."
- [ ] **About blurb** — `src/pages/index.astro` (about section) — 2–3 sentences: the
      consulting startup, the co-founder role, what "owning technical delivery" means.
- [ ] **Contact pitch** — `src/components/SiteFooter.astro` — one line above the contact
      links (availability, what kind of work you want).
- [ ] **Bughouse chess project** — `src/content/projects/bughouse.md` — summary (≤280 chars) + body: what bughouse is, the LiveView/real-time architecture story, what was hard.
      Also: `links.live` / `links.repo` URLs.
- [ ] **Marketing site project** — `src/content/projects/marketing-site.md` — company name
      (title has a TODO), summary + body, `links.live`.
- [ ] **Engagement tracker project** — `src/content/projects/engagement-tracker.md` —
      summary + body (what's shareable about an internal tool), any links.

## Links & assets

All identity links live in `src/lib/site.ts` — links render only when set, so nothing broken
ever ships.

- [ ] **LinkedIn URL** — set `site.linkedin` in `src/lib/site.ts` (currently omitted from the
      footer).
- [x] **GitHub URL** — `https://github.com/vcsawant` (set in `src/lib/site.ts`).
- [ ] **Current resume PDF** — drop at `public/resume.pdf`, then flip
      `site.resumeAvailable = true` in `src/lib/site.ts` (restores the nav link, hero CTA, and
      footer link). The 2019 one lives only in the `archive/gatsby-2018` tag; don't reuse it.
- [ ] **Meta description** — `src/pages/index.astro` — currently a neutral one-liner; wants a
      real one from Viren.
- [ ] **Project role labels** — confirm `role:` frontmatter wording in all three
      `src/content/projects/*.md` (currently: "Personal project" / "Technical delivery" ×2).
- [ ] **OG image decision** — Phase 8: static designed 1200×630; needs final say on whether
      it's a graph render, initials, or a photo.

## Data

- [ ] **Skill list pruning** — `src/data/skills.json` — 16 seeded skills; prune/add to match
      reality (weights 1–5 drive node size in the graph).
