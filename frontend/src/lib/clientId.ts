let _clientIdSeq = 0

/**
 * Geçici istemci anahtarları (form satırları, listeler) için id.
 * `crypto.randomUUID` yalnızca güvenli bağlamda (HTTPS / localhost) vardır; HTTP veya
 * bazı WebView’larda hata/eksik API oluşur — bu nedenle Web Crypto burada kullanılmaz.
 */
export function newClientId(prefix = "id"): string {
  _clientIdSeq += 1
  return `${prefix}-${Date.now()}-${_clientIdSeq}-${Math.random().toString(36).slice(2, 10)}`
}
