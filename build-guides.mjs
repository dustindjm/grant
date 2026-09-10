// Builds /public/guides/*.html plus sitemap.xml from the content below.
// Run: npm run build:guides
import { mkdirSync, writeFileSync } from 'node:fs';

const SITE = process.env.SITE_URL || 'https://grant3.netlify.app';
const TODAY = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Content. Each guide targets a real search intent a small nonprofit has, and
// answers it properly — thin pages built purely for keywords get filtered out
// and do the brand no favours anyway.
// ---------------------------------------------------------------------------
const GUIDES = [
  {
    slug: 'how-to-write-a-grant-application',
    title: 'How to write a grant application (for organizations with no grant writer)',
    description:
      'The seven sections nearly every grant application asks for, what reviewers look for in each, and how to write them when nobody on staff has done this before.',
    blurb: 'The seven sections nearly every application asks for, and what reviewers are actually looking for in each.',
    keyword: 'how to write a grant application',
    body: `
<p>Most grant applications ask for the same seven things in a slightly different order. Once you can see that structure, the work stops feeling like a blank page and starts feeling like filling in a form you already understand.</p>

<h2>1. The opening request</h2>
<p>Two or three sentences: who you are, what you do, how much you are asking for, and what for. Reviewers read dozens of these. If they cannot answer those four questions after your first paragraph, everything after it is working uphill.</p>
<p>Write it last. You will know what you are actually arguing only after you have written the rest.</p>

<h2>2. The need</h2>
<p>Describe the problem in the specific community you serve, not in general. "Food insecurity affects millions of Americans" tells a reviewer nothing about you. "The nearest full-service grocery is eleven miles from the neighborhood we serve, and roughly a third of our clients do not have a car" is a case.</p>
<p>Use whatever local evidence you have: county data, your own intake numbers, what staff observe. Cite the source when you have one.</p>

<h2>3. Funder fit</h2>
<p>This is the section small organizations most often skip, and it is the one that decides borderline applications. Say plainly why <em>this</em> funder, in <em>their</em> words. If their guidelines name equity, sustainability and rural access as priorities, those three concepts should appear in your narrative doing real work, not as decoration.</p>

<h2>4. The program</h2>
<p>What actually happens, who delivers it, who it reaches, and how often. Be concrete. "Weekly evening clinic staffed by two nurse practitioners, roughly 40 patients per session" beats any amount of language about commitment and passion.</p>

<h2>5. Evidence and track record</h2>
<p>Reviewers are asking one question: has this organization done something like this before, and did it work? Answer with what you have. If your data is informal, say so and describe it honestly — see our guide on <a href="/guides/grant-writing-without-outcomes-data.html">grant writing without outcomes data</a>.</p>

<h2>6. Budget and use of funds</h2>
<p>What the money buys and what that makes possible. Round numbers are fine; unexplained numbers are not. The narrative around the budget matters more than the spreadsheet for most small grants — more on this in <a href="/guides/grant-budget-narrative.html">writing the budget narrative</a>.</p>

<h2>7. The closing ask</h2>
<p>Name the amount and the purpose one more time, in one sentence. Do not end on gratitude. End on clarity.</p>

<h2>Before you submit</h2>
<ul>
  <li>Check the word or character limit and cut to fit. Applications get disqualified on this.</li>
  <li>Verify every number, date and name. One wrong figure undermines the whole document.</li>
  <li>Read it aloud. Anything you stumble over, a reviewer will too.</li>
  <li>Have someone outside your organization read it. Jargon is invisible from the inside.</li>
</ul>
`
  },
  {
    slug: 'general-operating-support-grants',
    title: 'How to win general operating support grants',
    description:
      'Unrestricted funding is judged on organizational stability, leadership and governance rather than program metrics. How to make that case as a small nonprofit.',
    blurb: 'Unrestricted money is judged on stability and governance, not program metrics. How to make that case.',
    keyword: 'general operating support grant',
    body: `
<p>General operating support is the money nonprofits want most and ask for worst. The usual mistake is writing it like a program request with the program removed.</p>

<h2>What is actually being judged</h2>
<p>When a funder restricts money to a program, they are betting on the program. When they give unrestricted money, they are betting on <strong>you</strong> — your leadership, your judgment about where money should go, and your likelihood of still existing in three years.</p>
<p>So the evidence that matters shifts. Financial health, board engagement, staff retention and a clear sense of priorities carry more weight than any single program's outcome numbers.</p>

<h2>Say how you decide</h2>
<p>A reviewer handing over unrestricted money wants to know how you will decide what to spend it on. Most applications never address this. A short passage explaining how your organization sets priorities — who is involved, how often, against what criteria — is unusually persuasive precisely because it is rare.</p>

<h2>Name the constraint</h2>
<p>Unrestricted funding is most compelling when it solves a problem restricted funding created. Many small nonprofits can fund the activity but not the supervision, scheduling, bookkeeping and insurance that make the activity possible. Say that directly. Funders who offer general operating support already believe it; you are confirming you understand your own situation.</p>

<h2>Do not pretend to be bigger</h2>
<p>Small organizations often inflate their language to sound established. It reads as insecurity. A clear-eyed account of a five-person organization that knows exactly what it does is stronger than a five-person organization writing like a fifty-person one.</p>

<h2>What to include</h2>
<ul>
  <li>Years operating, and a one-line history of how you got here</li>
  <li>Budget size and the rough shape of your funding mix</li>
  <li>Board composition and how actively it governs</li>
  <li>What breaks first if this funding does not come through</li>
  <li>What becomes possible if it does</li>
</ul>
<p>That last pair is the whole argument. Everything else is context.</p>
`
  },
  {
    slug: 'grant-writing-without-outcomes-data',
    title: 'Grant writing when you have no outcomes data',
    description:
      'What to write in the evidence section of a grant application when your nonprofit has no evaluation budget and no clean numbers to point at.',
    blurb: 'What to write when you have no evaluation budget and no clean numbers to point at.',
    keyword: 'grant application without outcomes data',
    body: `
<p>Nearly every grant application asks for outcomes. Nearly every small nonprofit does not have them, because measurement costs money that no one funds. Here is what to do instead of panicking or inventing something.</p>

<h2>Do not fabricate. Ever.</h2>
<p>The temptation is to round an impression up into a statistic — "we reduced emergency room visits by 30%" when nobody measured that. Reviewers who work in your field can smell an unsourced number, and one fabricated figure invalidates everything else you wrote. It can also end a funder relationship permanently.</p>

<h2>You have more evidence than you think</h2>
<p>Output data is still data, and most organizations are sitting on it without realizing:</p>
<ul>
  <li>How many people you served last year, and the year before</li>
  <li>How many were new versus returning — retention is a real signal</li>
  <li>Waitlist length, or how quickly slots fill</li>
  <li>Referral sources, especially when other agencies send people to you</li>
  <li>Volunteer hours and volunteer retention</li>
  <li>Partnerships that renewed</li>
</ul>
<p>None of that proves impact. All of it demonstrates that the work is real and that other people trust it.</p>

<h2>Qualitative evidence, described honestly</h2>
<p>Staff observation is legitimate evidence when it is labeled as such. "Clinic staff report fewer patients arriving in crisis than two years ago, though we have not measured this formally" is credible. The same sentence without the caveat is not.</p>
<p>Client stories work the same way. One specific, permissioned story is worth more than three vague ones.</p>

<h2>Turn the gap into an ask</h2>
<p>If you cannot measure because you cannot afford to, say so — and consider asking for the capacity to fix it. Funders are increasingly aware that they created this problem by never funding evaluation. An application that names the gap and proposes a modest step toward closing it reads as self-aware rather than underprepared.</p>

<h2>The sentence that works</h2>
<p>A pattern worth reusing: describe what you observe, state how you know it, and note the limits of that knowledge. It costs you one clause and buys you the reviewer's trust for the rest of the document.</p>
`
  },
  {
    slug: 'reading-a-funder-rfp',
    title: 'How to read a funder RFP before you waste a weekend on it',
    description:
      'The signals in a funder RFP or guidelines page that tell you whether your nonprofit is eligible, competitive, or wasting its time.',
    blurb: 'The signals in a guidelines page that tell you whether you are even eligible before you spend a weekend.',
    keyword: 'how to read a funder RFP',
    body: `
<p>The most expensive mistake in grant seeking is not writing a weak application. It is writing a good application to a funder who was never going to fund you. Twenty minutes of reading prevents it.</p>

<h2>Check the hard filters first</h2>
<p>Before anything else, confirm:</p>
<ul>
  <li><strong>Geography.</strong> Many funders restrict by county, not state.</li>
  <li><strong>Budget size.</strong> "Organizations with budgets between $250,000 and $2 million" excludes you if you are at $80,000, no matter how good the fit.</li>
  <li><strong>Tax status.</strong> Some require 501(c)(3) determination; fiscal sponsorship is sometimes accepted, sometimes not.</li>
  <li><strong>Request type.</strong> If they do not fund general operating support, do not ask for it.</li>
  <li><strong>Deadline and cycle.</strong> Check the year on the page you are reading.</li>
</ul>

<h2>Read the grant range, then read it again</h2>
<p>If typical grants are $10,000 to $25,000 and you ask for $90,000, you are signaling you did not read. Ask inside the range, toward the middle unless you have reason to reach.</p>

<h2>Find the funder's actual vocabulary</h2>
<p>Underline the nouns that repeat: equity, sustainability, access, capacity, systems change, dignity. These are not filler. They are what the reviewer has been told to look for. Your narrative should use those words where they honestly apply to your work.</p>

<h2>Look at who they funded last year</h2>
<p>Most funders publish a grantee list, and every US foundation's 990-PF lists its grants. Five minutes there tells you more about real priorities than the guidelines page does. If every grantee has a budget ten times yours, believe the pattern.</p>

<h2>Notice what they do not say</h2>
<p>A guidelines page with no mention of evaluation is telling you something. So is one that spends three paragraphs on measurement. Match the emphasis you find.</p>

<div class="callout">
<p><strong>Shortcut:</strong> paste the guidelines into Grantwright and it will write a draft that mirrors the funder's own framing back at them. The preview is free.</p>
<p><a class="btn btn-primary" href="/#start">Try it on your next RFP</a></p>
</div>
`
  },
  {
    slug: 'capacity-building-grants',
    title: 'Capacity building grants: why growth framing loses',
    description:
      'Capacity building requests succeed when they name a specific constraint the organization is hitting now, not when they describe general ambitions to grow.',
    blurb: 'Why growth framing loses and constraint framing wins.',
    keyword: 'capacity building grant request',
    body: `
<p>Capacity building is the vaguest category in grant seeking, which is why so many requests in it fail. "We want to grow" is not a case. "We turn away eleven people a week because one person does all our intake" is.</p>

<h2>Lead with the constraint, not the ambition</h2>
<p>Funders are not buying your growth. They are buying the removal of a specific bottleneck that is limiting work they already believe in. Name the bottleneck in the first paragraph and the rest of the application writes itself.</p>
<p>Good constraints are concrete and current: a database that cannot produce the reports your funders now require, a director doing bookkeeping instead of fundraising, a program that cannot expand because nobody is licensed to supervise.</p>

<h2>Show what becomes possible</h2>
<p>Then draw the line from the fix to the outcome. Not "improved efficiency" — something you can picture. "A part-time intake coordinator would let the clinical director return to direct service two days a week, which is roughly 25 additional patient visits a month."</p>

<h2>Address the durability question</h2>
<p>Every capacity reviewer is thinking the same thing: what happens when this grant ends? If you are asking for a position, say how it will be sustained or why it is genuinely one-time. Avoiding the question does not make the reviewer stop asking it.</p>

<h2>Common capacity requests that work</h2>
<ul>
  <li>Staff role that unlocks existing capacity elsewhere</li>
  <li>Systems that other funders now require — accounting, case management, outcome tracking</li>
  <li>Strategic planning at a genuine inflection point, not as routine</li>
  <li>Board development where you can name the gap</li>
  <li>Fundraising infrastructure, if you can show the return</li>
</ul>

<h2>What to avoid</h2>
<p>Requests that are really program requests wearing a different hat. If the money buys direct service, call it program support. Reviewers notice, and miscategorizing reads as either confusion or evasion.</p>
`
  },
  {
    slug: 'grant-budget-narrative',
    title: 'Writing the grant budget narrative',
    description:
      'The budget narrative explains what each line buys and why. It is the section small nonprofits rush and finance reviewers read first.',
    blurb: 'The section most small nonprofits rush, and the one finance reviewers read first.',
    keyword: 'grant budget narrative',
    body: `
<p>The budget spreadsheet says what you will spend. The budget narrative says why, and it is often the first thing a finance-minded reviewer turns to. Small organizations tend to write it in fifteen minutes at the end. It deserves better.</p>

<h2>Explain every line a reviewer might question</h2>
<p>You do not need a paragraph per line. You need one for anything that would make a stranger pause: an unusually large line, a vague one like "supplies", anything above ten percent of the request, and every personnel cost.</p>

<h2>Show your math</h2>
<p>"Program coordinator, 0.5 FTE at $52,000 annually = $26,000" is answerable. "Personnel: $26,000" invites suspicion. The arithmetic is the argument.</p>

<h2>Be straight about indirect costs</h2>
<p>Rent, insurance, accounting and administration are real costs of delivering the program. If the funder allows indirect costs, include them at the rate they permit. Organizations that zero out overhead to look lean are not fooling anyone and are quietly underfunding themselves.</p>

<h2>Name other funding</h2>
<p>If the project has committed or pending funds elsewhere, say so and be clear which is which. Funders rarely want to be the only source, and a partly-funded project signals that someone else has already assessed you.</p>

<h2>Match the narrative to the spreadsheet</h2>
<p>The single most common error is a narrative that describes a budget different from the one attached, usually because the numbers changed and only one document got updated. Check the totals against each other before submitting. Every time.</p>

<h2>A workable structure</h2>
<ol>
  <li>One sentence on the total request and period</li>
  <li>Personnel, with roles, FTE and rates</li>
  <li>Direct program costs, grouped sensibly</li>
  <li>Indirect, at the allowed rate</li>
  <li>Other committed or pending funding</li>
  <li>One sentence on what the total makes possible</li>
</ol>
`
  }
];

// ---------------------------------------------------------------------------
// Templating
// ---------------------------------------------------------------------------
const nav = `
<header class="nav">
  <div class="wrap nav-inner">
    <a href="/" class="brand"><span class="logomark">G</span> Grantwright</a>
    <nav class="nav-links">
      <a href="/guides/">Guides</a>
      <a href="/#pricing">Pricing</a>
      <a href="/#start" class="btn btn-primary btn-sm">Start a free draft</a>
    </nav>
  </div>
</header>`;

const footer = (links) => `
<footer class="footer">
  <div class="wrap">
    <div class="footer-grid">
      <div>
        <a href="/" class="brand"><span class="logomark">G</span> Grantwright</a>
        <p class="caption" style="margin-top:16px;max-width:280px">Grant application drafts for small nonprofits without a grant writer on staff.</p>
      </div>
      <div>
        <h4>Product</h4>
        <ul>
          <li><a href="/#start">Start a draft</a></li>
          <li><a href="/#pricing">Pricing</a></li>
          <li><a href="/#faq">FAQ</a></li>
        </ul>
      </div>
      <div>
        <h4>Guides</h4>
        <ul>${links}</ul>
      </div>
      <div>
        <h4>Legal</h4>
        <ul>
          <li><a href="/privacy.html">Privacy</a></li>
          <li><a href="/terms.html">Terms</a></li>
          <li><a href="mailto:dustindjm@outlook.com">Contact</a></li>
        </ul>
      </div>
    </div>
    <p class="footer-base">Grantwright is an independent service and is not affiliated with any funder or foundation. Drafts are a starting point, not a guarantee of funding.</p>
  </div>
</footer>`;

const head = (title, description, canonical, extraJsonLd = '') => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} | Grantwright</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<meta property="og:type" content="article">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="Grantwright">
<meta name="twitter:card" content="summary">
<link rel="icon" href="/icon-192.png">
<meta name="theme-color" content="#ffffff">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
${extraJsonLd}
</head>
<body>`;

const footerLinks = GUIDES.slice(0, 4).map((g) => `<li><a href="/guides/${g.slug}.html">${g.blurb ? g.title.split(':')[0] : g.title}</a></li>`).join('');

mkdirSync('public/guides', { recursive: true });

// individual guides
for (const g of GUIDES) {
  const canonical = `${SITE}/guides/${g.slug}.html`;
  const related = GUIDES.filter((o) => o.slug !== g.slug)
    .slice(0, 3)
    .map((o) => `<a class="guide-card" href="/guides/${o.slug}.html"><h3>${o.title.split(':')[0]}</h3><p>${o.blurb}</p></a>`)
    .join('');

  const jsonLd = `<script type="application/ld+json">
{
  "@context":"https://schema.org",
  "@type":"Article",
  "headline":${JSON.stringify(g.title)},
  "description":${JSON.stringify(g.description)},
  "datePublished":"${TODAY}",
  "dateModified":"${TODAY}",
  "mainEntityOfPage":{"@type":"WebPage","@id":"${canonical}"},
  "author":{"@type":"Organization","name":"Grantwright"},
  "publisher":{"@type":"Organization","name":"Grantwright"}
}
</script>
<script type="application/ld+json">
{
  "@context":"https://schema.org",
  "@type":"BreadcrumbList",
  "itemListElement":[
    {"@type":"ListItem","position":1,"name":"Home","item":"${SITE}/"},
    {"@type":"ListItem","position":2,"name":"Guides","item":"${SITE}/guides/"},
    {"@type":"ListItem","position":3,"name":${JSON.stringify(g.title)},"item":"${canonical}"}
  ]
}
</script>`;

  writeFileSync(
    `public/guides/${g.slug}.html`,
    `${head(g.title, g.description, canonical, jsonLd)}
${nav}
<main>
<section>
  <div class="wrap">
    <article class="article">
      <p class="caption"><a href="/guides/">Guides</a> → ${g.title.split(':')[0]}</p>
      <h1>${g.title}</h1>
      <p class="article-meta">Written for organizations doing this without a development department.</p>
      ${g.body.trim()}
      <div class="callout">
        <p><strong>Skip the blank page.</strong> Paste the funder's guidelines into Grantwright and get a draft written to their priorities. The preview is free and needs no account.</p>
        <p style="margin:0"><a class="btn btn-primary" href="/#start">Start a free draft</a></p>
      </div>
    </article>
  </div>
</section>
<section class="tinted">
  <div class="wrap">
    <h2>Related guides</h2>
    <div class="guide-grid">${related}</div>
  </div>
</section>
</main>
${footer(footerLinks)}
</body>
</html>
`
  );
}

// guides index
const indexCards = GUIDES.map(
  (g) => `<a class="guide-card" href="/guides/${g.slug}.html"><h3>${g.title.split(':')[0]}</h3><p>${g.blurb}</p></a>`
).join('');

writeFileSync(
  'public/guides/index.html',
  `${head(
    'Grant writing guides for small nonprofits',
    'Practical guides to writing grant applications without a development department: structure, funder fit, evidence, budgets and capacity requests.',
    `${SITE}/guides/`
  )}
${nav}
<main>
<section>
  <div class="wrap">
    <div class="section-head">
      <span class="eyebrow">Free guides</span>
      <h1 style="font-size:32px;letter-spacing:.512px;margin-bottom:20px">Grant writing guides for small nonprofits</h1>
      <p class="lead">No development department, no evaluation budget, no grant writer on staff. These are written for that situation specifically.</p>
    </div>
    <div class="guide-grid">${indexCards}</div>
  </div>
</section>
<section class="tinted">
  <div class="wrap center">
    <h2>Stop staring at the blank page</h2>
    <p class="lead" style="margin:20px auto 32px;max-width:520px">Paste a funder's guidelines and get an application narrative matched to their priorities. Free preview, no account.</p>
    <a class="btn btn-primary" href="/#start">Start a free draft</a>
  </div>
</section>
</main>
${footer(footerLinks)}
</body>
</html>
`
);

// sitemap
const urls = [
  { loc: `${SITE}/`, priority: '1.0', freq: 'weekly' },
  { loc: `${SITE}/guides/`, priority: '0.8', freq: 'weekly' },
  ...GUIDES.map((g) => ({ loc: `${SITE}/guides/${g.slug}.html`, priority: '0.7', freq: 'monthly' })),
  { loc: `${SITE}/privacy.html`, priority: '0.3', freq: 'yearly' },
  { loc: `${SITE}/terms.html`, priority: '0.3', freq: 'yearly' }
];

writeFileSync(
  'public/sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map((u) => `  <url><loc>${u.loc}</loc><lastmod>${TODAY}</lastmod><changefreq>${u.freq}</changefreq><priority>${u.priority}</priority></url>`)
  .join('\n')}
</urlset>
`
);

writeFileSync(
  'public/robots.txt',
  `User-agent: *
Allow: /
Disallow: /admin.html

Sitemap: ${SITE}/sitemap.xml
`
);

console.log(`Built ${GUIDES.length} guides, guides index, sitemap.xml and robots.txt.`);
