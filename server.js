const fs = require('fs');
const path = require('path');
const express = require('express');
const iconv = require('iconv-lite');
const XLSX = require('xlsx');
const { parse } = require('csv-parse/sync');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_PATH = process.env.CATALOG_PATH || findCatalogFile();

function findCatalogFile() {
  const candidates = [
    'products.csv',
    'products.xlsx',
    'products.xls',
    'productsVariants.csv'
  ];

  for (const file of candidates) {
    const fullPath = path.join(DATA_DIR, file);
    if (fs.existsSync(fullPath)) return fullPath;
  }

  const existing = fs.existsSync(DATA_DIR)
    ? fs.readdirSync(DATA_DIR)
        .filter((file) => /\.(csv|xlsx|xls)$/i.test(file))
        .sort()
    : [];

  if (existing.length > 0) {
    return path.join(DATA_DIR, existing[0]);
  }

  throw new Error('data klasörü içinde csv/xls/xlsx katalog dosyası bulunamadı.');
}

function normalizeCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function parseCsvFile(filePath) {
  const rawBuffer = fs.readFileSync(filePath);
  const decodedCandidates = [
    iconv.decode(rawBuffer, 'utf8'),
    iconv.decode(rawBuffer, 'utf-8'),
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

        if (records.length > 0 && typeof records[0] === 'object') {
          return records;
        }
      } catch (_error) {
        // sıradaki kombinasyonu dene
      }
    }
  }

  throw new Error('CSV dosyası okunamadı. Ayraç veya encoding uygun değil.');
}

function parseExcelFile(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error('Excel dosyasında çalışma sayfası bulunamadı.');
  }

  const sheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

function getField(row, possibleNames) {
  for (const name of possibleNames) {
    if (row[name] !== undefined && row[name] !== null && String(row[name]).trim() !== '') {
      return row[name];
    }
  }
  return '';
}

function loadRawRows(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.csv') return parseCsvFile(filePath);
  if (ext === '.xlsx' || ext === '.xls') return parseExcelFile(filePath);

  throw new Error(`Desteklenmeyen dosya uzantısı: ${ext}`);
}

function loadCatalog() {
  const rows = loadRawRows(DATA_PATH);
  const productMap = new Map();

  for (const row of rows) {
    const rawCode = getField(row, ['Ürün Kodu', 'Ürün Model Kodu', 'Urun Kodu', 'Urun Model Kodu']);
    const productCode = normalizeCode(rawCode);
    if (!productCode) continue;

    const productName = getField(row, ['Ürün Adı', 'Urun Adı', 'Urun Adi']);
    const category = getField(row, ['Kategori Adı', 'Kategori ID', 'Kategori']);
    const stockField = getField(row, ['Variant - Stok', 'Stok Adedi']);

    const variantKeyRaw = getField(row, ['Renk ID/ERP Kod', 'Renk ID', 'ERP Kod', 'Varyant Kodu', 'Variant Kodu']);
    const variantKey = normalizeCode(variantKeyRaw) || `ROW_${productMap.size}_${Math.random().toString(36).slice(2, 10)}`;

    if (!productMap.has(productCode)) {
      productMap.set(productCode, {
        productCode: String(rawCode).trim(),
        productName: String(productName || '').trim(),
        category: String(category || '').trim(),
        totalVariants: 0,
        totalStock: 0,
        variantKeys: new Set()
      });
    }

    const current = productMap.get(productCode);
    current.variantKeys.add(variantKey);

    const stockMatches = String(stockField || '').match(/\[(\d+(?:[.,]\d+)?)\]/g) || [];
    const stockTotal = stockMatches
      .map((match) => Number(match.replace(/[\[\]]/g, '').replace(',', '.')))
      .filter((value) => Number.isFinite(value))
      .reduce((sum, value) => sum + value, 0);

    current.totalStock += stockTotal;
  }

  for (const product of productMap.values()) {
    product.totalVariants = product.variantKeys.size;
    delete product.variantKeys;
  }

  return productMap;
}

let catalog;

try {
  catalog = loadCatalog();
  console.log(`Katalog yüklendi: ${DATA_PATH}`);
  console.log(`Toplam benzersiz ürün kodu: ${catalog.size}`);
} catch (error) {
  console.error('Katalog yüklenemedi:', error);
  process.exit(1);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    dataFile: path.basename(DATA_PATH),
    totalProductCodes: catalog.size
  });
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
