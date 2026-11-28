"""Generate the static SEO pages for CheckAm into frontend/public/.

Run from anywhere:  python scripts/gen_seo_pages.py
Output is deterministic: no timestamps other than the fixed dates below.
Writes: /faq/, /how-to-check-nafdac-number/, /check-a-product-before-you-buy/,
/guides/ and /guides/<slug>/, robots.txt and sitemap.xml.
"""
import html
import json
import os
import re

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.join(REPO, "frontend", "public")
LOGO_SVG = os.path.join(REPO, "logo-assets", "svg", "lockup-horizontal-reversed.svg")
BASE = "https://checkam.com.ng"
OG = BASE + "/og-3-steps.png"
PUBLISHED = "2026-11-28"
UPDATED = "2026-11-28"


def load_logo():
    with open(LOGO_SVG, encoding="utf-8") as f:
        svg = f.read().strip()
    svg = re.sub(r"<title[^>]*>.*?</title>", "", svg)
    svg = svg.replace(' role="img" aria-labelledby="t"', ' aria-hidden="true" focusable="false"')
    svg = svg.replace("<svg ", '<svg height="38" width="auto" style="display:block" ', 1)
    return svg


LOGO = load_logo()

CSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#EAF4E1;color:#1D2A1A;line-height:1.6;font-size:17px}
a{color:#4B2A7B}
.top{background:#4B2A7B;color:#fff;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.top a{color:#fff;text-decoration:none;font-weight:800}.top .logo{display:flex;align-items:center}.top .logo svg{height:38px;width:auto}
.top .links{display:flex;align-items:center;gap:16px}
.top .btn{background:#fff;color:#4B2A7B;border-radius:999px;padding:8px 16px;font-size:15px}
main{max-width:720px;margin:0 auto;padding:28px 20px 56px}
h1{font-family:Nunito,'DM Sans',sans-serif;font-weight:900;font-size:34px;line-height:1.12;color:#4B2A7B;margin-bottom:14px}
h2{font-family:Nunito,'DM Sans',sans-serif;font-weight:900;font-size:23px;margin:30px 0 8px}
h3{font-family:Nunito,'DM Sans',sans-serif;font-weight:900;font-size:18px;margin:18px 0 4px}
p,ul,ol{margin-bottom:14px}ul,ol{padding-left:22px}li{margin-bottom:6px}
.lead{font-size:19px;color:#55654F}
.card{background:#fff;border:2px solid #1D2A1A;border-radius:20px;padding:18px 20px;margin:22px 0}
.card h2,.card h3{margin-top:0}
.cta{display:inline-block;background:#4B2A7B;color:#fff;text-decoration:none;font-weight:800;border-radius:999px;padding:14px 26px;border:2px solid #1D2A1A}
.note{font-size:15px;color:#55654F;border-top:2px solid #C5DBB6;padding-top:14px;margin-top:30px}
nav.rel a{display:block;margin-bottom:6px}
.crumbs{font-size:14px;color:#55654F;margin-bottom:10px}
.cards{display:grid;gap:14px;margin:18px 0}
.cards a.card{display:block;text-decoration:none;color:#1D2A1A;margin:0}
.cards a.card b{display:block;font-family:Nunito,'DM Sans',sans-serif;font-weight:900;font-size:19px;color:#4B2A7B;margin-bottom:4px}
"""

HEAD_LINKS = """<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/favicon.svg" type="image/svg+xml" sizes="any"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><meta name="theme-color" content="#4B2A7B"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Nunito:wght@900&display=swap" rel="stylesheet">"""

DISCLAIMER = "CheckAm shows what the NAFDAC public registry says. It does not decide whether a product is genuine, and it is not affiliated with NAFDAC. Inspect the pack yourself and contact NAFDAC directly for enforcement."

# Every page that appears in "related" lists and the guides index: (path, title, one-line description)
OLD_PAGES = [
    ("/how-to-check-nafdac-number/", "How to check a NAFDAC number",
     "Find the registration number on a pack and look it up step by step."),
    ("/check-a-product-before-you-buy/", "What to check on the pack before you buy",
     "A quick checklist of the number, maker, seal, dates and print."),
    ("/faq/", "CheckAm questions and answers",
     "What CheckAm is, how it works, and what it does not do."),
]

# New guides: slug -> related slugs (3 each) are set on each guide below.
GUIDE_LIST = [
    ("/guides/how-to-check-if-a-product-is-fake-in-nigeria/", "How to check if a product is fake in Nigeria: 7 checks before you buy",
     "Seven practical checks on the pack, the number, the price and the seller, and what each one can and cannot tell you."),
    ("/guides/nafdac-registration-number-format/", "What does a NAFDAC registration number look like?",
     "Where the number is printed, the examples you may see, and what we cannot tell you about it."),
    ("/guides/check-nafdac-registered-food-and-drinks/", "How to check if food and drinks are NAFDAC registered",
     "Packaged food, bottled drinks and local drinks: how to look up the registration and compare it with the pack."),
    ("/guides/check-if-a-drug-is-nafdac-registered/", "How to check if a drug or medicine is NAFDAC registered",
     "A careful guide for over-the-counter medicines, with advice to ask a pharmacist."),
]
ALL_LINKS = {p: (t, d) for p, t, d in GUIDE_LIST + OLD_PAGES}


def related_for(path, wanted=None):
    """Return list of (path, title) for the related block."""
    if wanted is None:
        wanted = [p for p, _, _ in GUIDE_LIST + OLD_PAGES]
    return [(p, ALL_LINKS[p][0]) for p in wanted if p != path]


def write(path, content):
    d = os.path.join(ROOT, path.strip("/"))
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "index.html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(content)


def shell(path, title, desc, h1, body_html, ld, og_type="article"):
    url = BASE + path
    ld_json = json.dumps({"@context": "https://schema.org", "@graph": ld}, ensure_ascii=False)
    return f"""<!doctype html>
<html lang="en-NG">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<link rel="canonical" href="{url}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="CheckAm">
<meta property="og:locale" content="en_NG">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{OG}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{html.escape(title)}">
<meta name="twitter:description" content="{html.escape(desc)}">
<meta name="twitter:image" content="{OG}">
{HEAD_LINKS}
<style>{CSS}</style>
<script type="application/ld+json">{ld_json}</script>
</head>
<body>
<header class="top"><a class="logo" href="/" aria-label="CheckAm home">{LOGO}</a><div class="links"><a href="/guides/">Guides</a><a class="btn" href="/">Open the app</a></div></header>
<main>
{body_html}
</main>
</body>
</html>
"""


def related_html(items):
    links = "".join(f'<a href="{p}">{html.escape(t)}</a>' for p, t in items)
    return f'<h2>Related guides</h2>\n<nav class="rel" aria-label="Related guides">{links}</nav>'


def basic_page(path, title, desc, h1, body, extra_ld=None, crumb=None):
    """Older style pages (kept at their original URLs)."""
    url = BASE + path
    ld = [
        {
            "@type": "WebPage",
            "@id": url + "#webpage",
            "url": url,
            "name": title,
            "description": desc,
            "inLanguage": "en-NG",
            "isPartOf": {"@id": BASE + "/#website"},
            "dateModified": UPDATED,
        },
        {
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "CheckAm", "item": BASE + "/"},
                {"@type": "ListItem", "position": 2, "name": crumb or h1, "item": url},
            ],
        },
    ]
    if extra_ld:
        ld.append(extra_ld)
    body_html = f"""<h1>{html.escape(h1)}</h1>
{body}
<div class="card"><p><b>Check a number now.</b> Type a name or NAFDAC number, or take a photo of the pack. Free, and it works offline.</p><a class="cta" href="/">Open CheckAm</a></div>
{related_html(related_for(path))}
<p class="note">{html.escape(DISCLAIMER)}</p>"""
    write(path, shell(path, title, desc, h1, body_html, ld, og_type="article"))


def guide_page(slug, title, desc, h1, lead, keypoints, sections, faqs, related_slugs, crumb=None):
    path = f"/guides/{slug}/"
    url = BASE + path
    utm = f"{BASE}/?utm_source=guide&utm_medium=seo&utm_campaign={slug}"
    org = {"@type": "Organization", "name": "CheckAm", "url": BASE + "/"}
    ld = [
        {
            "@type": "Article",
            "@id": url + "#article",
            "mainEntityOfPage": url,
            "headline": h1,
            "description": desc,
            "image": OG,
            "inLanguage": "en-NG",
            "datePublished": PUBLISHED,
            "dateModified": UPDATED,
            "author": org,
            "publisher": org,
        },
        {
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "CheckAm", "item": BASE + "/"},
                {"@type": "ListItem", "position": 2, "name": "Guides", "item": BASE + "/guides/"},
                {"@type": "ListItem", "position": 3, "name": crumb or h1, "item": url},
            ],
        },
        {
            "@type": "FAQPage",
            "mainEntity": [
                {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": re.sub(r"<[^>]+>", "", a)}}
                for q, a in faqs
            ],
        },
    ]
    kp = "".join(f"<li>{k}</li>" for k in keypoints)
    secs = "".join(f"<h2>{html.escape(h)}</h2>\n{b}\n" for h, b in sections)
    faq_html = "".join(f"<h3>{html.escape(q)}</h3>\n<p>{a}</p>\n" for q, a in faqs)
    body_html = f"""<p class="crumbs"><a href="/">CheckAm</a> / <a href="/guides/">Guides</a></p>
<h1>{html.escape(h1)}</h1>
<p class="lead">{lead}</p>
<div class="card"><h2>Key points</h2><ul>{kp}</ul></div>
{secs}<h2>Frequently asked questions</h2>
{faq_html}<div class="card"><p><b>Look it up now.</b> Type a name or NAFDAC number, or take a photo of the pack. Free, and it works offline.</p><a class="cta" href="{utm}">Open CheckAm</a></div>
{related_html(related_for(path, [f"/guides/{s}/" if not s.startswith("/") else s for s in related_slugs]))}
<p class="note">{html.escape(DISCLAIMER)} For more about the regulator, see the <a href="https://nafdac.gov.ng/" rel="noopener">NAFDAC website</a>.</p>"""
    write(path, shell(path, title, desc, h1, body_html, ld))


S_FAKE = "how-to-check-if-a-product-is-fake-in-nigeria"
S_FORMAT = "nafdac-registration-number-format"
S_FOOD = "check-nafdac-registered-food-and-drinks"
S_DRUG = "check-if-a-drug-is-nafdac-registered"

# ---------------------------------------------------------------------------------------------
# New guides
# ---------------------------------------------------------------------------------------------

guide_page(
    S_FAKE,
    "How to check if a product is fake in Nigeria: 7 checks before you buy | CheckAm",
    "Seven practical checks for food, drinks and medicines: the NAFDAC number, the registry, batch and dates, print, seal, price and seller. What each check shows and where it stops.",
    "How to check if a product is fake in Nigeria: 7 checks before you buy",
    "No single check can prove a product is genuine. But seven quick checks, done together, tell you a lot before you pay. Here is what each one shows and where it stops.",
    [
        "Look for a NAFDAC number on the pack, then look it up in the public registry.",
        "Compare the product name and the maker on the pack with what the registry shows.",
        "Check the batch number and the manufacture and expiry dates.",
        "Look closely at print quality, spelling, the seal and the packaging.",
        "A price far below the usual price is a warning sign, not proof.",
        "If you are unsure, do not buy or use it. Keep the pack and report it to NAFDAC.",
    ],
    [
        ("Check 1: Is there a NAFDAC number, and does it look right?",
         """<p>Packaged food, drinks and medicines sold in Nigeria are expected to carry a NAFDAC registration number. It is normally printed on the pack next to the words "NAFDAC Reg. No." or "NAFDAC No.". Look near the ingredients, the barcode or the side panel.</p>
<p>First, is there a number at all? A pack with none is a reason to stop and ask questions. Second, does it look like one? It is usually a short code made of a prefix and digits, such as <b>A4-2260</b> or <b>01-4721</b>.</p>
<p><b>Limit:</b> a number that looks right is not proof. Anyone can print a real-looking number on a pack. That is why the next check matters.</p>"""),
        ("Check 2: Look it up in the registry and compare the details",
         """<p>Type the number into CheckAm, or take a photo of the pack and let the app read it. You will see what the NAFDAC public registry shows for that number: the product name, the company and the registration status.</p>
<p>Now compare. Does the product name match the pack in your hand? Does the maker match the company named on the pack? A number that exists in the registry but belongs to a different product, or a different company, is a mismatch worth taking seriously.</p>
<p><b>Limit:</b> a registry match tells you the number is on record and what it is on record for. It does not prove that this particular pack was made by that company. CheckAm shows what the registry says. It does not decide whether a product is genuine.</p>"""),
        ("Check 3: Batch number and dates",
         """<p>Most genuine packs show a batch or lot number, and a manufacture date, an expiry date, or both. Look for them on the base, the side, the cap or the label.</p>
<ul>
<li>Is the expiry date there, and is it still in the future?</li>
<li>Is the date printed clearly, or does it look rubbed, scratched or stuck over?</li>
</ul>
<p><b>Limit:</b> dates and batch codes are easy to print on any pack. They help you spot expired stock and obvious tampering, but they cannot confirm that a pack is genuine.</p>"""),
        ("Check 4: Print quality and spelling",
         """<p>Hold the pack in good light and read it slowly. Many poor copies give themselves away in small ways:</p>
<ul>
<li>blurry or uneven printing, especially on the logo and the small text;</li>
<li>spelling or grammar mistakes in the brand name, the ingredients or the instructions;</li>
<li>colours that look faded or different from the pack you usually buy;</li>
<li>a logo or picture that is stretched, pixelated or in the wrong place.</li>
</ul>
<p><b>Limit:</b> some genuine packs are printed badly, and some careful copies are printed well. Treat print quality as a clue, not a verdict.</p>"""),
        ("Check 5: Seal and packaging",
         """<p>Check that the pack is closed the way the maker intended. Look at the seal under the cap of a bottle, the foil on a jar, the heat-sealed edge of a sachet or the carton around a medicine blister pack.</p>
<ul>
<li>Is the seal broken, loose, re-stuck or covered with extra tape?</li>
<li>Does the bottle or tin look dented, leaking or opened and closed again?</li>
<li>For tablets and capsules, do they look uniform, or are some chipped, discoloured or mixed?</li>
</ul>
<p><b>Limit:</b> damage can also happen in transport. But a pack that looks opened or repacked is not one to take a chance on, particularly if it is something you will eat, drink or swallow.</p>"""),
        ("Check 6: Is the price too good to be true?",
         """<p>If you buy the same product often, you know roughly what it costs. A price far below what other shops charge deserves a pause. A very low price can mean the product is old, stolen or not what it claims to be.</p>
<p><b>Limit:</b> promotions and bulk discounts are real, so a low price alone proves nothing. Use it together with the other checks. A low price plus a missing number, or a number that does not match, should make you walk away.</p>"""),
        ("Check 7: Where was it sold?",
         """<p>Think about where you are buying. A shop that stores goods properly and that you can go back to is safer than a seller who cannot be found tomorrow. For medicines, buy from a licensed pharmacy and not from a roadside table or a hawker. For food and drinks, look at how the stock is kept: out of the sun, off the wet floor and away from chemicals.</p>
<p><b>Limit:</b> a good shop can still receive bad stock, and an unknown seller can sell a genuine product. Where you buy lowers the risk. It does not remove it.</p>"""),
        ("What to do if you are unsure",
         """<ul>
<li><b>Do not buy it, and do not use it.</b> If you already bought it, stop using it, especially if it is a medicine or something for a child.</li>
<li><b>Keep the pack.</b> Keep the wrapper, the bottle, the batch number and your receipt. They are useful if you report it.</li>
<li><b>Report it to NAFDAC.</b> Use the contact details on the official <a href="https://nafdac.gov.ng/" rel="noopener">NAFDAC website</a>. CheckAm is not a reporting channel.</li>
<li><b>If you feel unwell after eating, drinking or taking something,</b> seek help from a doctor, a pharmacist or a health centre.</li>
</ul>
"""),
    ],
    [
        ("Can CheckAm tell me if a product is fake?",
         "No. CheckAm shows what the NAFDAC public registry says about a name or number. It does not decide whether a pack is genuine, so use it together with the other checks on this page."),
        ("What if the NAFDAC number is not in the registry?",
         "It could be a typing or reading mistake, so check the digits again. It could also be a number that is not on the public list. Either way, treat it as a warning and look closely at the rest of the pack before you buy."),
        ("Is a registry match enough to trust a product?",
         "No. A match means the number is on record. You still need to compare the name and the maker with the pack and look at the seal, the dates and the print."),
        ("Who do I report a suspicious product to?",
         "Contact NAFDAC directly using the details on its official website. Keep the pack and your receipt."),
    ],
    [S_FORMAT, S_FOOD, "/check-a-product-before-you-buy/"],
    crumb="How to check if a product is fake in Nigeria",
)

guide_page(
    S_FORMAT,
    "What does a NAFDAC registration number look like? | CheckAm",
    "Where to find the NAFDAC registration number on a pack, the kind of code it is, and examples such as A4-2260 and 01-4721. Plain facts only.",
    "What does a NAFDAC registration number look like?",
    "It is a short code printed on the pack. This guide describes what you can safely say about it, and is open about what we cannot say.",
    [
        "It is printed on the pack next to the words NAFDAC Reg. No. or NAFDAC No.",
        "It is made of a prefix and digits, for example A4-2260 or 01-4721.",
        "The format can differ between product types, and between older and newer products.",
        "We do not explain what individual letters or digits mean, because we cannot verify it.",
        "Looking the number up in the registry is more useful than judging it by its shape.",
    ],
    [
        ("Where is the number printed?",
         """<p>Look for the words "NAFDAC Reg. No." or "NAFDAC No." on the pack. The number follows those words. On many products it sits close to the ingredients list, the barcode, the batch details or the side panel. On a small sachet it may be on the back or along an edge. On a bottle, check the label, and sometimes the back label.</p>
<p>If you cannot find it, turn the pack over and read all sides slowly. Some products print it in small type.</p>"""),
        ("What kind of code is it?",
         """<p>In general, a NAFDAC registration number is a short code. It is made of a prefix, which can be letters, digits or a mix, followed by digits. Many packs show a dash between the prefix and the rest of the number.</p>
<p>Two examples of the shape you may see are:</p>
<ul>
<li><b>A4-2260</b>, a letter and a digit, a dash, then four digits;</li>
<li><b>01-4721</b>, two digits, a dash, then four digits.</li>
</ul>
<p>These are examples of the shape only. They are here to show you what to look for on a pack, not to tell you what a given product is.</p>"""),
        ("Do all numbers look the same?",
         """<p>No. The format is not the same for every product. Numbers can look different between product types, such as foods, drinks and medicines, and between older and newer products. You may also see small differences in spacing, dashes or capital letters from one pack to another.</p>
<p>So do not reject a pack only because its number does not match an example you have seen. Look the number up instead.</p>"""),
        ("What we cannot tell you",
         """<p>You may read online that each prefix letter or each group of digits stands for something, such as a product type or a year. We do not explain what individual prefix letters or digits mean, because we cannot verify it, and we would rather leave it out than guess. If you want an official explanation, ask NAFDAC through the contact details on its <a href="https://nafdac.gov.ng/" rel="noopener">official website</a>.</p>
<p>For the same reason, CheckAm does not try to judge a number by its shape. A number that "looks right" can be copied onto any pack, and a real number can be printed in an unusual style.</p>"""),
        ("A better test than looking at the shape",
         """<p>The most useful thing you can do with a number is look it up. Here is how:</p>
<ol>
<li>Read the number carefully from the pack. Zero and the letter O, and the number 1 and the letter I, are easy to mix up.</li>
<li>Type it into CheckAm, or take a photo of the pack and let the app read it. If a character is misread, you can correct it before you check.</li>
<li>Read the result: the product name, the company and the registration status shown in the NAFDAC public registry.</li>
<li>Compare the result with the pack in your hand. The name and the maker should agree.</li>
</ol>
<p>If the number is not found, check the digits again before you decide anything. A single wrong character will give no result.</p>"""),
        ("What a result does and does not mean",
         """<p>If the registry shows the number, you know it is on record and you can see what it is on record for. That helps you notice a mismatch, such as a number that belongs to a different product.</p>
<p>It does not prove that the pack in your hand is genuine. CheckAm shows what the registry says. It does not decide whether a product is genuine. For the other things to look at, such as the seal, the dates and the print, read our guide on <a href="/guides/how-to-check-if-a-product-is-fake-in-nigeria/">how to check if a product is fake in Nigeria</a>.</p>"""),
        ("Numbers that are missing, damaged or unclear",
         """<ul>
<li><b>No number at all.</b> Ask the seller why. A packaged product without a number is worth thinking twice about.</li>
<li><b>A smudged or scratched number.</b> Try the product name in the search instead, and compare the maker and the address on the pack.</li>
<li><b>A number that is hard to read in a photo.</b> Move into better light, hold the phone steady and drag the box over the number.</li>
</ul>"""),
    ],
    [
        ("Where do I find the NAFDAC number on a pack?",
         "Look for the words NAFDAC Reg. No. or NAFDAC No. The number is printed next to them, often near the ingredients, the barcode or the side panel."),
        ("What does the NAFDAC number look like?",
         "It is a short code made of a prefix and digits, for example A4-2260 or 01-4721. The format can differ between product types and between older and newer products."),
        ("What do the letters and digits in the number mean?",
         "We do not explain this, because we cannot verify it. Ask NAFDAC through its official website if you need an official answer."),
        ("If a number looks right, is the product registered?",
         "Not necessarily. Look the number up in the registry and compare the name and the maker with the pack."),
    ],
    [S_FAKE, "/how-to-check-nafdac-number/", S_FOOD],
)

guide_page(
    S_FOOD,
    "How to check if food and drinks are NAFDAC registered | CheckAm",
    "How to look up packaged food and bottled drinks in the NAFDAC public registry, including local drinks like zobo and tigernut drink, and what to compare on the pack.",
    "How to check if food and drinks are NAFDAC registered",
    "Packaged food and bottled drinks should be registered before they are sold. Here is how to check one in a few minutes, and how to read the result.",
    [
        "According to NAFDAC public statements, packaged food and drinks need registration before sale.",
        "This includes bottled local drinks such as zobo and tigernut drink.",
        "Find the NAFDAC number on the pack, then look it up by number or by name.",
        "Compare the name and the maker in the registry with the pack.",
        "A registry match is a helpful check, not a guarantee. Look at the seal and the dates too.",
    ],
    [
        ("Which food and drinks should be registered?",
         """<p>NAFDAC has said publicly that packaged food and drinks need to be registered before they are sold. This covers the kinds of products you see in supermarkets, kiosks and markets: biscuits, noodles, seasonings, cooking oil, bottled water, soft drinks, juices and many others.</p>
<p>It also includes local drinks that are packed in bottles or sachets for sale, such as zobo and tigernut drink. Many small producers do this well and have a registered product. If a drink is sold in a labelled pack, it is fair to expect a NAFDAC number on it.</p>
<p>The rules have detail that we do not cover here. For the official position on what needs registration, see the <a href="https://nafdac.gov.ng/" rel="noopener">NAFDAC website</a>.</p>"""),
        ("Step 1: Find the number on the pack",
         """<p>Look for "NAFDAC Reg. No." or "NAFDAC No." and the code after it. It is usually a prefix and digits, for example <b>A4-2260</b> or <b>01-4721</b>. Check the label, the back of the pack, the side panel and the area near the ingredients and the barcode.</p>
<p>Write the number down or take a clear photo. Then note the brand name and the name of the company on the pack, because you will compare them with the result.</p>"""),
        ("Step 2: Look it up",
         """<p>Open CheckAm and do one of these:</p>
<ul>
<li><b>Type the NAFDAC number.</b> This is usually the most exact way.</li>
<li><b>Type the product name.</b> Useful when the number is hard to read, though a name can match more than one product.</li>
<li><b>Take a photo of the pack.</b> Drag the box over the number and the app reads it on your phone. If a character is wrong, fix it before you check.</li>
</ul>
<p>CheckAm keeps the registry list on your phone, so you can look something up at the market even with no data.</p>"""),
        ("Step 3: Read the result and compare",
         """<p>The result shows what the NAFDAC public registry has on record for that number or name. Compare it with the pack in your hand:</p>
<ul>
<li>Does the product name agree with the label?</li>
<li>Is the company the same as the maker named on the pack?</li>
<li>Does the registration status look current?</li>
<li>If you searched by name, is the entry the same product, with the same size or variant?</li>
</ul>
<p>If something does not agree, do not assume the worst, but do not ignore it either. It may be a spelling difference, an older registration or a different variant. It may also be a number that belongs to a different product.</p>"""),
        ("Step 4: Look at the rest of the pack",
         """<p>A registry check does not look at the pack. You do that part. Check the expiry date, the seal, the cap and the print quality. For drinks, look at the colour and clarity of the liquid, and check that the bottle is not leaking or swollen. For more detail, read <a href="/guides/how-to-check-if-a-product-is-fake-in-nigeria/">how to check if a product is fake in Nigeria</a>.</p>"""),
        ("When the product is not found",
         """<p>Do not stop at the first search. Try these:</p>
<ul>
<li>Read the number again and correct any wrong digit.</li>
<li>Search by brand name, then by the name of the maker.</li>
<li>Try a shorter form of the name, without the size or flavour.</li>
</ul>
<p>If it still cannot be found, it could be a product that is not on the public list, or a number that is not real. CheckAm cannot tell you which. Ask the seller to show you the registration, and think about buying a product you can verify instead. If you are worried about a product, report it to NAFDAC through its official website.</p>"""),
        ("Buying from small producers and markets",
         """<p>Many good products come from small producers. A missing number does not mean that a producer is dishonest, but it does mean you cannot check the product against the registry. If you choose to buy it, you carry that risk yourself. Pay extra attention to how the product is stored, whether the pack is sealed and whether the producer's name and address are on the label.</p>"""),
    ],
    [
        ("Do bottled drinks like zobo and tigernut drink need NAFDAC registration?",
         "Based on NAFDAC public statements, drinks sold in packs need registration before sale, and that includes local drinks. For the official rules, see the NAFDAC website."),
        ("Can I check food by name instead of number?",
         "Yes. You can type the product name in CheckAm. A name can match more than one product, so compare the maker and the details with the pack."),
        ("Does a registry match mean the food is safe to eat?",
         "No. It means the number is on record. It does not tell you the pack is genuine, in date or well stored, so look at the pack too."),
        ("Does it work without internet?",
         "Yes. CheckAm keeps the registry list on your phone, so searching works offline."),
    ],
    [S_FAKE, S_FORMAT, "/check-a-product-before-you-buy/"],
)

guide_page(
    S_DRUG,
    "How to check if a drug or medicine is NAFDAC registered | CheckAm",
    "How to look up an over-the-counter medicine in the NAFDAC public registry, what to compare on the pack, and why you should ask a pharmacist and buy from licensed pharmacies.",
    "How to check if a drug or medicine is NAFDAC registered",
    "A registry lookup is one useful step before you buy a medicine. It is not medical advice, and it never replaces a pharmacist.",
    [
        "CheckAm is not medical advice. Ask a pharmacist or a doctor about any medicine.",
        "Look for the NAFDAC number on the pack and look it up in the registry.",
        "Compare the product name and the maker with the pack.",
        "Check the batch number, the expiry date and the seal.",
        "Buy from licensed pharmacies, not from roadside sellers or hawkers.",
    ],
    [
        ("A word first about safety",
         """<p>CheckAm is not medical advice and cannot tell you whether a medicine is right for you, safe for a child, safe in pregnancy or safe with other medicines. Only a doctor or a pharmacist can do that. This guide is about one thing: looking up what the NAFDAC public registry says about a product, so that you notice a mismatch before you pay.</p>
<p>This guide is mainly about over-the-counter medicines, the ones you can buy without a prescription. For anything prescribed, follow what your doctor and your pharmacist tell you.</p>"""),
        ("Step 1: Find the NAFDAC number on the pack",
         """<p>Look on the outer carton and on the inner pack, such as the blister strip or the bottle label. The number is printed after the words "NAFDAC Reg. No." or "NAFDAC No.". It is usually a prefix and digits, for example <b>A4-2260</b> or <b>01-4721</b>.</p>
<p>If you cannot see a number, that is worth noting before you buy. Also write down the product name, the strength if it is shown, and the name of the maker.</p>"""),
        ("Step 2: Look it up",
         """<p>In CheckAm, type the number or the product name, or take a photo of the pack and let the app read the number. If the app misreads a character, correct it and check again.</p>
<p>The result shows what the NAFDAC public registry has on record: the product, the company and the registration status. Medicine names can be similar, and one brand can come in several forms and strengths, so read the entry carefully.</p>"""),
        ("Step 3: Compare the result with the pack",
         """<ul>
<li>Does the product name match the pack?</li>
<li>Is the maker or the company the same as the one printed on the pack?</li>
<li>Do the form and strength look consistent, for example syrup or tablet, if the entry shows them?</li>
</ul>
<p>A number that is on record for a different product or a different company is a mismatch. Do not buy the product, and ask the pharmacist about it. If you already have it, do not use it until you have spoken to a pharmacist or a doctor.</p>"""),
        ("Step 4: Check the pack itself",
         """<p>The registry cannot see your pack, so look at it carefully:</p>
<ul>
<li><b>Batch number and dates.</b> The batch number and the expiry date should be printed clearly. Do not buy anything that is expired.</li>
<li><b>Seal and carton.</b> A torn, re-stuck or opened carton is a warning sign.</li>
<li><b>Print and spelling.</b> Look for blurry print, spelling mistakes and colours that look wrong.</li>
<li><b>The medicine itself.</b> Tablets that are chipped, damaged or different in colour from the rest of the strip, or a liquid that looks cloudy or has changed colour, are reasons to stop.</li>
<li><b>The leaflet.</b> Many medicines come with an information leaflet. Check that it is there and readable.</li>
</ul>
<p>For more on these checks, see <a href="/guides/how-to-check-if-a-product-is-fake-in-nigeria/">how to check if a product is fake in Nigeria</a>.</p>"""),
        ("Where you buy matters",
         """<p>Buy medicines from a licensed pharmacy. A pharmacy has a pharmacist who can answer your questions, and it is a fixed place you can go back to. Medicines sold from a bag, a roadside table or a moving vehicle are harder to trust, because you do not know how they were stored or where they came from.</p>
<p>Ask the pharmacist to confirm that the product suits you, and tell them about any other medicine you take. Keep the receipt.</p>"""),
        ("What a registry check cannot tell you",
         """<p>A registry match means that the number is on record and shows what it is on record for. It does not tell you that a pack is genuine, that the medicine inside is what the label says, or that it is right for you. CheckAm shows what the registry says. It does not decide whether a product is genuine.</p>
<p>That is why the pharmacist, the seal, the dates and where you buy all matter.</p>"""),
        ("If you are unsure or feel unwell",
         """<ul>
<li>Do not buy it, and stop using it if you already have it.</li>
<li>Keep the pack, the batch number and your receipt.</li>
<li>If you feel unwell after taking a medicine, get help from a doctor, a pharmacist or a health centre.</li>
<li>Report the product to NAFDAC through the contact details on its <a href="https://nafdac.gov.ng/" rel="noopener">official website</a>.</li>
</ul>"""),
    ],
    [
        ("Is CheckAm medical advice?",
         "No. CheckAm only shows what the NAFDAC public registry says about a name or number. Ask a pharmacist or a doctor about any medicine."),
        ("Can I check a drug by name?",
         "Yes. You can type the name in CheckAm. Names can be similar and one brand can have several forms, so compare the entry with the pack."),
        ("Does a registry match mean the medicine is genuine and safe?",
         "No. It means the number is on record. It does not prove the pack or the medicine is genuine, and it cannot say whether the medicine suits you."),
        ("Where should I buy medicines?",
         "Buy from a licensed pharmacy, where you can ask a pharmacist your questions and keep a receipt."),
    ],
    [S_FAKE, S_FORMAT, S_FOOD],
)

# ---------------------------------------------------------------------------------------------
# Guides index
# ---------------------------------------------------------------------------------------------


def guides_index():
    path = "/guides/"
    url = BASE + path
    title = "CheckAm guides: check food, drinks and medicines in Nigeria"
    desc = "Plain-English guides on checking NAFDAC numbers, spotting problems on a pack and looking up food, drinks and medicines in the NAFDAC registry."
    h1 = "CheckAm guides"
    ld = [
        {
            "@type": "CollectionPage",
            "@id": url + "#webpage",
            "url": url,
            "name": h1,
            "description": desc,
            "inLanguage": "en-NG",
            "isPartOf": {"@id": BASE + "/#website"},
            "dateModified": UPDATED,
        },
        {
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "CheckAm", "item": BASE + "/"},
                {"@type": "ListItem", "position": 2, "name": "Guides", "item": url},
            ],
        },
        {
            "@type": "ItemList",
            "itemListElement": [
                {"@type": "ListItem", "position": i + 1, "url": BASE + p, "name": t}
                for i, (p, t, _) in enumerate(GUIDE_LIST + OLD_PAGES)
            ],
        },
    ]
    cards = "".join(
        f'<a class="card" href="{p}"><b>{html.escape(t)}</b>{html.escape(d)}</a>'
        for p, t, d in GUIDE_LIST + OLD_PAGES
    )
    body = f"""<p class="crumbs"><a href="/">CheckAm</a> / Guides</p>
<h1>{h1}</h1>
<p class="lead">Short, plain guides on checking food, drinks and medicines before you buy.</p>
<div class="cards">{cards}</div>
<div class="card"><p><b>Check a number now.</b> Type a name or NAFDAC number, or take a photo of the pack. Free, and it works offline.</p><a class="cta" href="{BASE}/?utm_source=guide&amp;utm_medium=seo&amp;utm_campaign=guides-index">Open CheckAm</a></div>
<p class="note">{html.escape(DISCLAIMER)}</p>"""
    write(path, shell(path, title, desc, h1, body, ld, og_type="website"))


guides_index()

# ---------------------------------------------------------------------------------------------
# Older pages (same URLs as before)
# ---------------------------------------------------------------------------------------------

basic_page(
    "/how-to-check-nafdac-number/",
    "How to check a NAFDAC number (step by step) | CheckAm",
    "Find the NAFDAC registration number on a food, drink or medicine pack and look it up in seconds. Works offline, free to use.",
    "How to check a NAFDAC number",
    """<p class="lead">Every NAFDAC-registered food, drink and medicine should carry a registration number on its pack. Here is how to find it and look it up before you buy.</p>
<h2>1. Find the number on the pack</h2>
<p>Look near the ingredients, the barcode or the side panel for the words "NAFDAC Reg. No." or "NAFDAC No." followed by a short code. It is usually a prefix and digits, for example <b>A4-2260</b> or <b>01-4721</b>. If you cannot find any number, that is worth noting before you buy.</p>
<h2>2. Type it in, or take a photo</h2>
<p>In CheckAm, type the number or the product name. Or tap the scan button, take a photo of the pack, drag the box over the number and let the app read it. If a character is misread, you can fix it before checking, and the app suggests close matches.</p>
<h2>3. Read the answer</h2>
<p>You will see what the NAFDAC registry shows for that number: the product, the maker and the registration status. Then compare it with the pack in your hand: the name, the maker and the number should agree.</p>
<h2>4. Use your own judgement</h2>
<p>A registry entry is a helpful check, not a guarantee. Look at the packaging, the seals and the expiry date, buy from places you trust, and report concerns to NAFDAC directly.</p>
<h2>No data? No problem</h2>
<p>CheckAm keeps the registry list on your phone, so you can check at the market stall even without a connection.</p>""",
)

basic_page(
    "/check-a-product-before-you-buy/",
    "What to check on a pack before you buy | CheckAm",
    "A simple checklist for food, drinks and medicines: the NAFDAC number, the maker, the seal, the dates and the print. Check it before you buy it.",
    "What to check on a pack before you buy",
    """<p class="lead">A few quick checks take less than a minute and tell you a lot. Use them together with the NAFDAC registry result.</p>
<h2>On the pack</h2>
<ul>
<li><b>NAFDAC number:</b> is there one, and is it printed clearly?</li>
<li><b>Name and maker:</b> do they match what the registry shows for that number?</li>
<li><b>Dates:</b> is there a manufacture or expiry date, and is it still in date?</li>
<li><b>Print quality:</b> look for blurry print, spelling mistakes or colours that look different from the usual pack.</li>
<li><b>Seal and wrapper:</b> torn, loose or re-stuck seals are a reason to look twice.</li>
<li><b>Size and details:</b> does the pack size and address look right for the brand?</li>
</ul>
<h2>Before you pay</h2>
<ul>
<li>Check the number in CheckAm and compare the result with the pack.</li>
<li>Buy from shops and sellers you trust, and keep your receipt.</li>
<li>If something does not match, do not buy it, and consider reporting it to NAFDAC.</li>
</ul>
<h2>What a registry check can and cannot tell you</h2>
<p>A registry match means the number exists in the registry and shows the product details on file. It does not prove that the pack in your hand is genuine. That is why the checklist above matters too.</p>""",
)

faqs = [
    ("What is CheckAm?", "CheckAm is a free web app that lets you look up food, drinks and medicines in the NAFDAC public registry by name or NAFDAC number, or by taking a photo of the pack."),
    ("Is CheckAm official or run by NAFDAC?", "No. CheckAm is independent and is not affiliated with NAFDAC. It shows what the NAFDAC public registry says and links you to take the next step yourself."),
    ("Does CheckAm tell me if a product is fake?", "No. CheckAm reports what the registry shows. It does not decide whether a product is genuine, so always inspect the pack and contact NAFDAC for enforcement."),
    ("Does it work without internet?", "Yes. The registry list is saved on your phone, so searching and checking works offline. Some extras, such as the optional AI help, need a connection."),
    ("Is it free?", "Yes. CheckAm is free to use and there is nothing to install: open it in your browser and, if you like, add it to your home screen."),
    ("Where do I find the NAFDAC number on a pack?", "Look for the words NAFDAC Reg. No. near the ingredients, barcode or side panel. It is usually a prefix and digits, such as A4-2260 or 01-4721."),
    ("Is my photo uploaded?", "No. The photo of the pack is read on your phone and is not uploaded. If you use the optional AI help, only the text you typed is sent."),
    ("What does the optional AI help do?", "When a product is not in the registry, you can ask AI for a summary of what the genuine pack looks like. It can make mistakes and is not from NAFDAC, and a small number of lookups are available each day."),
    ("Which products can I check?", "Food, drinks and medicines in the NAFDAC registry, with some care products too. The list is updated as the registry changes."),
]
faq_ld = {
    "@type": "FAQPage",
    "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faqs
    ],
}
faq_body = '<p class="lead">Quick answers about checking products with CheckAm.</p>' + "".join(
    f"<h2>{html.escape(q)}</h2><p>{html.escape(a)}</p>" for q, a in faqs
)
basic_page(
    "/faq/",
    "CheckAm questions and answers (NAFDAC registry checks)",
    "Answers about CheckAm: what it is, whether it is official, how to find a NAFDAC number, offline use, photos and the optional AI help.",
    "CheckAm questions and answers",
    faq_body,
    extra_ld=faq_ld,
    crumb="Questions and answers",
)

# ---------------------------------------------------------------------------------------------
# robots + sitemap
# ---------------------------------------------------------------------------------------------
with open(os.path.join(ROOT, "robots.txt"), "w", encoding="utf-8", newline="\n") as f:
    f.write(f"""User-agent: *
Allow: /
# App screens that only make sense inside the app
Disallow: /result/
Disallow: /search
Disallow: /scan
Disallow: /saved
Disallow: /tesseract/

Sitemap: {BASE}/sitemap.xml
""")

urls = (
    [("/", "1.0", "weekly"), ("/guides/", "0.8", "monthly")]
    + [(p, "0.8", "monthly") for p, _, _ in OLD_PAGES]
    + [(p, "0.8", "monthly") for p, _, _ in GUIDE_LIST]
)
with open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8", newline="\n") as f:
    f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')
    for p, prio, freq in urls:
        f.write(f"  <url><loc>{BASE}{p}</loc><lastmod>{UPDATED}</lastmod><changefreq>{freq}</changefreq><priority>{prio}</priority></url>\n")
    f.write("</urlset>\n")
print("done")
