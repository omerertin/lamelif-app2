# Lamelif RPT Kontrol Uygulaması

Bu uygulama, girilen ürün kodunu katalogdaki `Ürün Model Kodu` alanına göre kontrol eder.

- Kod katalogda varsa: **RPT**
- Kod katalogda yoksa: **Yeni ürün**

## Lokal çalıştırma

```bash
npm install
npm start
```

Ardından tarayıcıda `http://localhost:3000` adresini aç.

## Render yayına alma

1. Bu klasörü GitHub'a yükle.
2. Render'da **New + > Web Service** seç.
3. GitHub reposunu bağla.
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Deploy et.

## Veri dosyası

Katalog dosyası şu konumdadır:

`data/productsVariants.csv`

Güncel katalog geldiğinde aynı dosya adını koruyarak bununla değiştirebilirsin.
