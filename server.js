const fs = require('fs');
const path = require('path');
const express = require('express');
const iconv = require('iconv-lite');
const { parse } = require('csv-parse/sync');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_PATH = path.join(__dirname, 'data', 'products.csv');

function normalize(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function parseCsvFile(filePath) {
  const rawBuffer = fs.readFileSync(filePath);

  const decodedCandidates = [
    iconv.decode(rawBuffer, 'utf8'),
    iconv.decode(rawBuffer, 'cp1254'),
    iconv.decode(rawBuffer, 'latin1')
  ];

  const delimiterCandidates = [';', ',', '\t'];

  for (const content of decodedCandidates) {
    for (const delimiter of delimiterCandidates) {
      try {
        const records = parse(content, {
          columns: true,
          skip_empty_lines: true,
          delimiter,
          relax_column_count: true,
          bom: true
        });

        if (records.length > 0) return records;
      } catch (err) {}
    }
  }

  throw new Error('products.csv okunamadı.');
}

function getField(row, names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null && String(row[name]).trim() !== '') {
      return row[name];
    }
  }
  return '';
}

function loadCatalog() {
  if (!fs.existsSync(DATA_PATH)) {
    throw new Error('data/products.csv bulunamadı.');
  }

  const rows = parseCsvFile(DATA_PATH);
  const productMap = new Map();

  for (const row of rows) {
    const rawCode = getField(row, ['Ürün Kodu', 'Urun Kodu']);
    const productCode = normalize(rawCode);
    if (!productCode) continue;

    const productName = getField(row, ['Ürün Adı', 'Urun Adı', 'Urun Adi']);
    const category = getField(row, ['Kategori Adı', 'Kategori ID', 'Kategori']);
    const stockField = getField(row, ['Variant - Stok', 'Stok Adedi']);

    const colorKeyRaw = getField(row, ['Renk ID/ERP Kod', 'Renk ID', 'ERP Kod']);
    const colorKey = normalize(colorKeyRaw);

    if (!productMap.has(productCode)) {
      productMap.set(productCode, {
        productCode: String(rawCode).trim(),
        productName: String(productName || '').trim(),
        category: String(category || '').trim(),
        totalVariants: 0,
        totalStock: 0,
        colorKeys: new Set()
      });
    }

    const current = productMap.get(productCode);

    if (colorKey) {
      current.colorKeys.add(colorKey);
    }

    const stockMatches = String(stockField || '').match(/\[(\d+(?:[.,]\d+)?)\]/g) || [];
    const stockTotal = stockMatches
      .map((x) => Number(x.replace(/[\[\]]/g, '').replace(',', '.')))
      .filter((x) => Number.isFinite(x))
      .reduce((sum, x) => sum + x, 0);

    current.totalStock += stockTotal;
  }

  for (const product of productMap.values()) {
    product.totalVariants = product.colorKeys.size;
    delete product.colorKeys;
  }

  return productMap;
}

let catalog = loadCatalog();

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    dataFile: 'products.csv',
    totalProductCodes: catalog.size,
    bt4616: catalog.get('BT4616') || null
  });
});

app.get('/api/check', (req, res) => {
  const queryCode = normalize(req.query.code);

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
