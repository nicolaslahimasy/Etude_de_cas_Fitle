# Fitle - Size Guide Scraper

Programme qui identifie et synthetise les guides de tailles depuis des sites e-commerce, et exporte les resultats dans un fichier Excel structure.

## Installation

```bash
# Installer les dependances
npm install

# Installer les navigateurs Playwright (Chromium + Firefox)
npx playwright install chromium firefox
```

## Utilisation

```bash
npm run scrape -- <url-du-site>
```

### Exemples

```bash
# Kleman (Shopify) - 276 produits, 2 guides de tailles
npm run scrape -- https://www.kleman-france.com

# Prada (site custom) - 48 produits, 1 guide de tailles
npm run scrape -- https://www.prada.com

# La Botte Gardiane (Shopify) - 533 produits, pas de guide
npm run scrape -- https://www.labottegardiane.com

# N'importe quel autre site (adaptateur generique)
npm run scrape -- https://www.exemple.com
```

Le fichier Excel est genere dans `output/<nom-du-site>_size_guides.xlsx`.

## Architecture

```
src/
  index.ts              # Point d'entree CLI
  types.ts              # Interfaces TypeScript (Product, SizeGuide, SiteAdapter)
  browser.ts            # Gestion Playwright (Chromium + Firefox)
  exporter.ts           # Export Excel (ExcelJS)
  sites/
    kleman.ts           # Adaptateur Kleman (API Shopify + div-based size tables)
    prada.ts            # Adaptateur Prada (Firefox, crawl HTML, cookie dismissal)
    labottegardiane.ts  # Adaptateur La Botte Gardiane (API Shopify)
    generic.ts          # Adaptateur generique (fallback pour sites inconnus)
```

### Pattern Site Adapter

Chaque site a un adaptateur qui implemente l'interface `SiteAdapter` :

```typescript
interface SiteAdapter {
  matches(url: string): boolean;    // Detecte si cet adaptateur gere l'URL
  scrape(url: string): Promise<ScrapingResult>;  // Scrape produits + guides
}
```

Les adaptateurs sont chaines dans l'ordre : Kleman > Prada > La Botte Gardiane > Generique (fallback).

### Strategies par site

| Site | Produits | Guide de tailles |
|------|----------|------------------|
| Kleman | API Shopify `/products.json` | Div-based tables (`.size-guide-table`) |
| Prada | Crawl HTML (Firefox requis) | Click trigger + parse `<table>` |
| La Botte Gardiane | API Shopify `/products.json` | Recherche exhaustive (aucun trouve) |
| Generique | Shopify API ou crawl HTML | Heuristiques (pages dediees, produits) |

### Format Excel de sortie

**Feuille 1 - "Pages produit"** : Liste des produits avec nom, genre, type, URL, et reference au guide de tailles.

**Feuille 2 - "Guides de taille"** : Tables de correspondance des tailles (EU, UK, US, cm, etc.) pour chaque guide trouve.

## Stack technique

- **TypeScript** - Typage strict
- **Playwright** - Automatisation navigateur (Chromium + Firefox)
- **ExcelJS** - Generation de fichiers .xlsx
- **Node.js** - Runtime

## Notes techniques

- **Prada utilise Firefox** : le site bloque Chromium headless (erreur HTTP/2). Firefox contourne cette protection.
- **Shopify** : les sites Shopify exposent `/products.json`, ce qui permet de lister les produits sans crawler.
- **Adaptateur generique** : tente d'abord l'API Shopify, puis crawle avec des heuristiques pour les sites inconnus.
