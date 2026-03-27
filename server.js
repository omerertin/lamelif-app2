const fs = require('fs');
const path = require('path');
const express = require('express');
const iconv = require('iconv-lite');
const { parse } = require('csv-parse/sync');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_PATH = process.env.CATALOG_PATH || path.join(__dirname, 'data', 'productsVariants.csv');

function normalizeCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function loadCatalog() {
  const rawBuffer = fs.readFileSync(DATA_PATH);
  const decoded = iconv.decode(rawBuffer, 'cp1254');

  const records = parse(decoded, {
    columns: true,
    skip_empty_lines: true,
    delimiter: ';'
  });

  const productMap = new Map();

  for (const row of records) {
    const modelCode = normalizeCode(row['Ürün Model Kodu']);
    if (!modelCode) continue;

    if (!productMap.has(modelCode)) {
      productMap.set(modelCode, {
        productCode: row['Ürün Model Kodu'],
        productName: row['Ürün Adı'] || '',
        category: row['Kategori Adı'] || '',
        totalVariants: 0,
        totalStock: 0
      });
    }

    const current = productMap.get(modelCode);
    current.totalVariants += 1;
    const stock = Number(String(row['Stok Adedi'] || '0').replace(',', '.'));
    current.totalStock += Number.isFinite(stock) ? stock : 0;
  }

  return productMap;
}

let catalog;

try {
  catalog = loadCatalog();
  console.log(`Katalog yüklendi. Toplam benzersiz ürün kodu: ${catalog.size}`);
} catch (error) {
  console.error('Katalog yüklenemedi:', error);
  process.exit(1);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, totalProductCodes: catalog.size });
});

app.get('/api/check', (req, res) => {
  const queryCode = normalizeCode(req.query.code);

  if (!queryCode) {
    return res.status(400).json({
      ok: false,
      message: 'Lütfen bir ürün kodu girin.'
    });
  }

  const product = catalog.get(queryCode);

  if (product) {
    return res.json({
      ok: true,
      status: 'RPT',
      message: 'Bu ürün listede mevcut. Sonuç: RPT.',
      data: product
    });
  }

  return res.json({
    ok: true,
    status: 'YENI',
    message: 'Bu ürün listede yok. Sonuç: Yeni ürün.'
  });
});

app.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
