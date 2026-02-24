import ExcelJS from 'exceljs';
import { ScrapingResult } from './types';
import path from 'path';

export async function exportToExcel(result: ScrapingResult, outputPath: string): Promise<void> {
  const workbook = new ExcelJS.Workbook();

  // --- Sheet 1: Pages produit ---
  const sheet1 = workbook.addWorksheet('Pages produit');

  // Headers
  sheet1.columns = [
    { header: 'Nom Produit', key: 'name', width: 50 },
    { header: 'Gender', key: 'gender', width: 12 },
    { header: 'Type', key: 'type', width: 15 },
    { header: 'URL', key: 'url', width: 70 },
    { header: 'Guide de taille', key: 'sizeGuideId', width: 18 },
  ];

  // Style header row
  sheet1.getRow(1).font = { bold: true };

  // Add products
  for (const product of result.products) {
    sheet1.addRow({
      name: product.name,
      gender: product.gender,
      type: product.type,
      url: product.url,
      sizeGuideId: product.sizeGuideId,
    });
  }

  // --- Sheet 2: Guides de taille ---
  const sheet2 = workbook.addWorksheet('Guides de taille');

  let currentRow = 1;

  for (const guide of result.sizeGuides) {
    // Header row for this guide
    sheet2.getCell(currentRow, 1).value = 'Guide de taille';
    sheet2.getCell(currentRow, 1).font = { bold: true };
    sheet2.getCell(currentRow, 2).value = guide.id;
    sheet2.getCell(currentRow, 3).value = 'URL';
    sheet2.getCell(currentRow, 4).value = guide.url;

    currentRow += 2; // Skip a row

    // Column headers: "Systemes metriques" | Taille 1 | Taille 2 | ...
    const maxValues = Math.max(...guide.rows.map((r) => r.values.length));
    sheet2.getCell(currentRow, 2).value = 'Syst\u00e8mes m\u00e9triques';
    sheet2.getCell(currentRow, 2).font = { bold: true };
    for (let i = 0; i < maxValues; i++) {
      sheet2.getCell(currentRow, 3 + i).value = `Taille ${i + 1}`;
      sheet2.getCell(currentRow, 3 + i).font = { bold: true };
    }

    currentRow++;

    // Brand row
    sheet2.getCell(currentRow, 1).value = guide.brand;
    sheet2.getCell(currentRow, 1).font = { bold: true };
    sheet2.getCell(currentRow, 2).value = guide.brand;

    // Fill brand-specific size values (first row of data)
    if (guide.rows.length > 0) {
      const firstRow = guide.rows[0];
      for (let i = 0; i < firstRow.values.length; i++) {
        sheet2.getCell(currentRow, 3 + i).value = parseNumericValue(firstRow.values[i]);
      }
    }

    currentRow++;

    // Remaining rows (EU, UK, US, cm...)
    for (let r = 1; r < guide.rows.length; r++) {
      const row = guide.rows[r];
      sheet2.getCell(currentRow, 1).value = row.label;

      // Don't put shortLabel in column B for the foot length row (matches template)
      if (row.shortLabel !== 'cm') {
        sheet2.getCell(currentRow, 2).value = row.shortLabel;
      }

      for (let i = 0; i < row.values.length; i++) {
        sheet2.getCell(currentRow, 3 + i).value = parseNumericValue(row.values[i]);
      }

      currentRow++;
    }

    currentRow += 2; // Space between guides
  }

  // Set column widths for sheet 2
  sheet2.getColumn(1).width = 20;
  sheet2.getColumn(2).width = 22;
  for (let i = 3; i <= 25; i++) {
    sheet2.getColumn(i).width = 10;
  }

  // Save
  const outputDir = path.dirname(outputPath);
  await workbook.xlsx.writeFile(outputPath);
  console.log(`\nExcel file saved: ${outputPath}`);
}

function parseNumericValue(val: string): string | number {
  // Try to parse as number
  const num = Number(val);
  if (!isNaN(num) && val.trim() !== '') return num;
  return val;
}
