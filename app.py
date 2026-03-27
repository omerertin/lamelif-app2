import streamlit as st
import pandas as pd

st.set_page_config(page_title="Lamelif RPT Kontrol", layout="centered")

st.title("📦 Ürün Durum Sorgulama")

@st.cache_data
def load_data():
    # CSV dosyasını noktalı virgül ayracıyla okuyoruz
    df = pd.read_csv('productsVariants.csv', sep=';', encoding='utf-8')
    return set(df['Ürün Model Kodu'].astype(str).unique())

try:
    existing_models = load_data()
    query = st.text_input("Ürün Model Kodunu Girin", placeholder="Örn: WND5003").strip().upper()

    if query:
        if query in existing_models:
            st.error(f"🚨 {query} -> **RPT** (Bu ürün listede var!)", icon="🔄")
        else:
            st.success(f"✅ {query} -> **YENİ** (Bu ürün ilk kez geliyor)", icon="✨")
except Exception as e:
    st.info("Lütfen 'productsVariants.csv' dosyasının klasörde olduğundan emin olun.")