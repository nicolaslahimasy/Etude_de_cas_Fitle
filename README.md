# Fitle - Size Guide Scraper

Programme qui identifie et synthetise les guides de tailles depuis des sites e-commerce de chaussures, et exporte les resultats dans un fichier Excel structure.

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

L'URL peut etre fournie avec ou sans `https://` :

```bash
npm run scrape -- bocage.fr
npm run scrape -- https://www.prada.com
```

### Exemples

```bash
# Sites avec adaptateurs dedies
npm run scrape -- kleman-france.com        # Shopify - ~276 produits, 2 guides
npm run scrape -- prada.com                # Site custom - ~48 produits, 1 guide
npm run scrape -- labottegardiane.com      # Shopify - ~533 produits

# Sites geres par l'adaptateur generique
npm run scrape -- bocage.fr                # ~164 produits, 1 guide
npm run scrape -- meermin.com              # Shopify - ~208 produits, 1 guide
npm run scrape -- paraboot.com             # ~53 produits, 1 guide
```

Le fichier Excel est genere dans `output/<nom-du-site>_size_guides.xlsx`.

## Architecture

```
src/
  index.ts              # Point d'entree CLI + filtre standardise (EU/UK/US/cm)
  types.ts              # Interfaces TypeScript (Product, SizeGuide, SiteAdapter)
  browser.ts            # Gestion Playwright (Chromium + Firefox)
  exporter.ts           # Export Excel (ExcelJS)
  sites/
    kleman.ts           # Adaptateur Kleman (API Shopify + div-based size tables)
    prada.ts            # Adaptateur Prada (Firefox, crawl HTML, dropdown select)
    labottegardiane.ts  # Adaptateur La Botte Gardiane (API Shopify)
    generic.ts          # Adaptateur generique (fallback pour sites inconnus)
```

### Pattern Site Adapter

Chaque site a un adaptateur qui implemente l'interface `SiteAdapter` :

```typescript
interface SiteAdapter {
  matches(url: string): boolean;
  scrape(url: string): Promise<ScrapingResult>;
}
```

Les adaptateurs sont chaines dans l'ordre : Kleman > Prada > La Botte Gardiane > Generique (fallback).

### Strategies par site

| Site | Produits | Guide de tailles |
|------|----------|------------------|
| Kleman | API Shopify `/products.json` | Div-based tables (`.size-guide-table`) |
| Prada | Crawl HTML (Firefox) | Click trigger + select dropdown (EU/UK/US) |
| La Botte Gardiane | API Shopify `/products.json` | Recherche sur pages + produits |
| Generique | Shopify API ou crawl HTML | Scoring de tables + heuristiques |

### Adaptateur generique

L'adaptateur generique gere les sites inconnus avec plusieurs mecanismes :

- **Detection Shopify** : teste `/products.json` en priorite
- **Crawl de categories** : explore les liens de navigation pour trouver les pages produit
- **Scoring de tables** : evalue chaque `<table>` trouvee et selectionne la meilleure table de conversion (favorise EU/UK/US, penalise les tables de mesures)
- **Transposition** : detecte et transpose les tables verticales (une taille par ligne) en format horizontal (un systeme par ligne)
- **Enrichissement** : si un site ne fournit que les tailles locales (FR/EU ou UK), ajoute automatiquement les conversions manquantes (EU, UK, US) via une table de correspondance standard

### Format Excel de sortie

**Feuille 1 - "Pages produit"** : Nom, genre, type, URL, reference au guide de tailles.

**Feuille 2 - "Guides de taille"** : Tables de correspondance standardisees avec lignes : marque, EU, UK, US, cm (longueur du pied).

## Stack technique

- **TypeScript** - Typage strict
- **Playwright** - Automatisation navigateur (Chromium + Firefox)
- **ExcelJS** - Generation de fichiers .xlsx
- **Node.js** - Runtime

## Notes techniques

- **Prada utilise Firefox** : le site bloque Chromium headless (erreur HTTP/2). Firefox contourne cette protection.
- **Shopify** : les sites Shopify exposent `/products.json`, ce qui permet de lister les produits sans crawler.
- **Standardisation** : tous les guides de tailles sont normalises a 5 lignes max (marque, EU, UK, US, cm). Les systemes non-standard (JP, IT, etc.) sont filtres.
- **Pas d'IA** : le programme utilise uniquement du scraping et du parsing HTML, sans appel a des APIs d'IA.
