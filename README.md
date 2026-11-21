# Alive Store — Loja de overlays

Loja web **estática** (HTML + CSS + JS puro, sem build) para vender seus overlays
de live. Projetada para ser aberta **dentro de uma WebView do app Alive**, com:

- ✅ **Compras in-app pelo Google Play Billing** (o pagamento acontece no app, nunca na web)
- ✅ **Overlays grátis** com download direto
- ✅ Funciona também em navegador comum (fallback instruindo o usuário a abrir o app)
- ✅ Funciona com `file://` (nenhum `fetch`, dados do catálogo em JS)

---

## 📁 Estrutura

```
Aloja/
├── index.html          # Loja (catálogo, filtros, busca, modal de produto)
├── overlay.html        # Página de detalhe (?id=neon-pulse)
├── css/style.css       # Tema neon gamer completo
├── js/
│   ├── catalog.js      # ⭐ PRODUTOS + configurações (edite só isso)
│   ├── alive-bridge.js # Ponte loja ↔ app (compras, downloads, share)
│   ├── art.js          # Gerador de preview em SVG de cada overlay
│   ├── ui.js           # Cards, toasts, favoritos, formatação
│   ├── actions.js      # Comprar / baixar / compartilhar + modal de fallback
│   ├── store.js        # Controller da home
│   └── product.js      # Controller da página de detalhe
└── downloads/          # Coloque aqui os .zip dos overlays grátis
```

---

## ▶️ Rodando localmente

Basta abrir `index.html` no navegador. Para simular a WebView com bridge:

```bash
cd Aloja
python3 -m http.server 8080
# abra http://localhost:8080
```

---

## 🛒 Como adicionar um produto

Edite `js/catalog.js` e adicione um objeto em `ALIVE_CATALOG`:

```js
{
  id: 'meu-overlay',              // id interno da loja
  playId: 'overlay_meu_overlay',  // id do produto IN-APP no Play Console
  name: 'Meu Overlay',
  tagline: 'Frase curta do card.',
  description: 'Texto longo do modal.',
  category: 'tela',               // tela | cenas | molduras | alertas | pacote
  price: 19.90,                   // 0 = grátis
  badge: 'hot',                   // hot | new | sale (opcional)
  featured: 90,                   // prioridade na ordenação "Destaques"
  salesCount: 100,
  releasedAt: '2026-06-01',
  version: '1.0.0',
  updated: '2026-06-01',
  size: '40 MB',
  downloadUrl: 'downloads/meu-overlay.zip', // só para grátis
  includes: ['Item 1', 'Item 2'],
  compat: ['Alive App', 'OBS Studio'],
  theme: { bg1: '#1b1046', bg2: '#070714', a1: '#8b5cf6', a2: '#22d3ee' }
}
```

Para usar uma **imagem real** no preview em vez do SVG, adicione
`image: 'img/meu-overlay.png'`.

Também ajuste em `js/catalog.js` → `ALIVE_CONFIG`: WhatsApp, e-mail e URL da Play Store.

---

## 🤝 Contrato da ponte (WebView ↔ app)

A loja detecta `window.Alive`. Se existir, é app nativo; senão, fallback web.

### O app deve injetar

**Android (Kotlin):**
```kotlin
webView.settings.javaScriptEnabled = true
webView.addJavascriptInterface(object {
    @JavascriptInterface
    fun purchase(requestId: String, productId: String, payloadJson: String) {
        // Inicie o Google Play Billing Flow com productId.
        // Guarde o requestId para devolver o resultado.
    }

    @JavascriptInterface
    fun download(requestId: String, url: String) {
        // Baixe o arquivo e salve/abra no dispositivo.
        // Ao terminar: devolverResultado(requestId, "ok", "{}")
    }

    @JavascriptInterface
    fun share(text: String) { /* Intent.ACTION_SEND */ }

    @JavascriptInterface
    fun openExternal(url: String) { /* Intent.ACTION_VIEW */ }
}, "Alive")
```

**Devolvendo o resultado** (compra concluída, cancelada ou erro):
```kotlin
val js = "window.AliveBridge.nativeResult(" +
         "'$requestId', " +                 // 'ok' | 'cancelled' | 'error'
         "'ok', " +
         "'{\"orderId\":\"GPA.1234\"}')"     // JSON escapado
webView.evaluateJavascript(js, null)
```

> Play Billing exige chamar `acknowledgePurchase` em até 3 dias e só liberar o
> conteúdo depois do `onPurchasesUpdated` com `BillingClient.BillingResponseCode.OK`.

### API disponível na loja (`window.AliveBridge`)

| Método | Descrição |
|---|---|
| `isNative()` | `true` se está dentro do app |
| `purchase({productId, title, priceLabel, payload})` | `Promise` — resolve na compra, rejeita com `code: 'cancelled' \| 'error' \| 'not-native'` |
| `download(url)` | `Promise` — inicia download |
| `share(text)` | Compartilha (ou copia o link) |
| `openExternal(url)` | Abre fora da WebView |
| `setAppInfo(json)` | Opcional: o app se identifica, a loja pode exibir "App conectado" |
| `nativeResult(requestId, status, dataJson)` | **Chamado pelo app** para devolver resultados |

### Fallback fora do app
- **Compra** → modal "Compre dentro do app Alive" com botões para Google Play e WhatsApp.
- **Download grátis** → download direto do arquivo.
- **Deep link** → `index.html?id=neon-pulse` abre o modal do produto automaticamente.

---

## 📦 Overlays grátis

1. Coloque os arquivos `.zip` em `downloads/`.
2. No produto, mantenha `price: 0` e `downloadUrl: 'downloads/arquivo.zip'`.
3. O botão vira **"Baixar grátis"** e funciona tanto no app quanto no navegador.

---

## 🚀 Publicar

Serviços estáticos gratuitos: **Netlify**, **Vercel**, **GitHub Pages** ou Cloudflare Pages.
Basta arrastar a pasta. Nenhum build é necessário.

Para a WebView, use a URL publicada (ou carregue via `file:///android_asset/loja/index.html`
colocando a pasta em `app/src/main/assets/`).

---

## ✅ Checklist antes de lançar

- [ ] Trocar `ALIVE_CONFIG` (WhatsApp, e-mail, URL da Play Store)
- [ ] Criar os produtos **in-app** no Google Play Console com os mesmos `playId`
- [ ] Testar compra de verdade em um dispositivo com conta de teste (licenças de teste)
- [ ] Colocar os `.zip` dos grátis em `downloads/`
- [ ] Criar páginas de Termos e Privacidade e atualizar os links do rodapé
- [ ] Testar a WebView em Android 8+ e em conexão lenta
