# Cittel Website

De website van Cittel – Coppens Computercenter, Maldegem.

## Tech stack

Plain HTML · CSS · Vanilla JS — geen framework, geen build tool nodig.

## Structuur

```
cittel/
├── index.html              # Homepage
├── diensten.html           # Diensten-overzicht
├── over-ons.html           # Over ons
├── contact.html            # Contactpagina
├── privacy.html            # Privacybeleid (wettelijk verplicht)
├── 404.html                # Custom 404
├── .htaccess               # Redirects, compressie, cache-headers
├── sitemap.xml
├── robots.txt
├── css/
│   ├── base.css            # Layout, nav, footer, modal, shared styling
│   └── index.css           # Hero + homepage-specifieke styling
├── js/
│   └── script.js           # Nav-toggle, Google Places, download-modal
├── img/
│   ├── icons.svg           # SVG sprite (FontAwesome-subset)
│   ├── download-popup.png  # Illustratie Windows download
│   ├── CittelRemoteMac*.png# Illustraties Mac download-flow
│   └── …                   # Overige afbeeldingen (WebP)
└── download/
    ├── WIN/Cittel Remote.exe
    └── MAC/Cittel Remote-MacOS.zip
```

## Download-modal

Wanneer een bezoeker op een download-link klikt (`download/WIN/…` of `download/MAC/…`):

- De download start onmiddellijk (geen `preventDefault`)
- Er opent een modal met een 3-stappen-uitleg (platform-specifiek)
- De modal toont het telefoonnummer en de tariefvermelding zodat de klant dit niet meer hoeft voor te lezen aan de telefoon

Logica staat onderaan [`js/script.js`](js/script.js). Stappen worden dynamisch opgebouwd uit `winSteps` / `macSteps`.

## Performance

- Assets worden aangeboden met `Cache-Control: public, max-age=31536000, immutable` (zie `.htaccess`)
- HTML: `max-age=3600, must-revalidate`
- Cache-busting via `?v=N` op CSS/JS/sprite URLs — versie handmatig bumpen bij een deploy waarbij clients moeten verversen
- Hero-afbeelding heeft een mobiele variant (`shop-front-mobile.webp`) onder 768px
- Google Places script wordt lazy geladen via `requestIdleCallback`

## Lokaal starten

`index.html` openen in je browser, of via Live Server in VS Code.

> Let op: de `.htaccess` redirects werken niet onder Live Server. Link-testen best op staging doen.

## Deployment

Uploaden via WinSCP naar de server van Cittel (Combell-hosting).
