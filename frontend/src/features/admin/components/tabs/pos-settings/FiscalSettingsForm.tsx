"use client"

import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"

const selectClass =
  "mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"

const selectClassSm =
  "mt-1 flex h-8 w-full rounded-md border border-input bg-background px-2.5 py-1 text-xs shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"

const panelClass = "space-y-3 rounded-lg border border-border bg-muted/30 p-3"

export interface FiscalSettingsFormProps {
  fiscalType: string
  setFiscalType: (val: string) => void
  mockDelay: number
  setMockDelay: (val: number) => void
  mockTriggerError: boolean
  setMockTriggerError: (val: boolean) => void
  mockSimulateOffline: boolean
  setMockSimulateOffline: (val: boolean) => void
  connectionType: string
  setConnectionType: (val: string) => void
  ipAddress: string
  setIpAddress: (val: string) => void
  port: string
  setPort: (val: string) => void
  serialPort: string
  setSerialPort: (val: string) => void
  baudRate: string
  setBaudRate: (val: string) => void
  apiKey: string
  setApiKey: (val: string) => void
  serialNumber: string
  setSerialNumber: (val: string) => void
  clientSecret: string
  setClientSecret: (val: string) => void
  apiUrl: string
  setApiUrl: (val: string) => void
  integratorUser: string
  setIntegratorUser: (val: string) => void
  integratorPassword: string
  setIntegratorPassword: (val: string) => void
  integratorEndpoint: string
  setIntegratorEndpoint: (val: string) => void
  authUrl: string
  setAuthUrl: (val: string) => void
}

type FiscalSettingsPanelProps = Omit<FiscalSettingsFormProps, "setFiscalType"> & {
  fiscalWebhookUrl?: string | null
}

export function FiscalTypeSelect({
  fiscalType,
  setFiscalType,
}: Pick<FiscalSettingsFormProps, "fiscalType" | "setFiscalType">) {
  return (
    <div>
      <Label>Mali Entegrasyon Türü</Label>
      <select
        value={fiscalType}
        onChange={(e) => setFiscalType(e.target.value)}
        className={selectClass}
      >
        <option value="NONE">Mali Entegrasyon Yok</option>
        <option value="MOCK">Sanal Entegrasyon (Test/Simülasyon)</option>
        <option value="BEKO_GMP3">Beko ÖKC (GMP3)</option>
        <option value="HUGIN_GMP3">Hugin ÖKC (GMP3)</option>
        <option value="EARSIV_UYUMSOFT">Uyumsoft e-Arşiv Fatura</option>
      </select>
    </div>
  )
}

export function FiscalSettingsPanel({
  fiscalType,
  mockDelay,
  setMockDelay,
  mockTriggerError,
  setMockTriggerError,
  mockSimulateOffline,
  setMockSimulateOffline,
  connectionType,
  setConnectionType,
  ipAddress,
  setIpAddress,
  port,
  setPort,
  serialPort,
  setSerialPort,
  baudRate,
  setBaudRate,
  apiKey,
  setApiKey,
  serialNumber,
  setSerialNumber,
  clientSecret,
  setClientSecret,
  apiUrl,
  setApiUrl,
  integratorUser,
  setIntegratorUser,
  integratorPassword,
  setIntegratorPassword,
  integratorEndpoint,
  setIntegratorEndpoint,
  authUrl,
  setAuthUrl,
  fiscalWebhookUrl,
}: FiscalSettingsPanelProps) {
  if (fiscalType === "NONE") return null

  return (
    <div className="space-y-3">
      {fiscalType === "MOCK" && (
        <div className={panelClass}>
          <h4 className="text-xs font-ui-bold text-foreground">Sanal Entegrasyon Parametreleri</h4>
          <div>
            <Label className="text-2xs">Simüle Edilen Gecikme (Saniye)</Label>
            <Input
              type="number"
              value={mockDelay}
              onChange={(e) => setMockDelay(parseFloat(e.target.value) || 0)}
              className="mt-1 h-8 text-xs"
            />
          </div>
          <div className="flex items-center justify-between pt-1">
            <Label className="text-2xs">Her Ödemede Sanal Hata Fırlat</Label>
            <Switch checked={mockTriggerError} onCheckedChange={setMockTriggerError} />
          </div>
          <div className="flex items-center justify-between pt-1">
            <Label className="text-2xs">Cihazı Çevrimdışı (Offline) Simüle Et</Label>
            <Switch checked={mockSimulateOffline} onCheckedChange={setMockSimulateOffline} />
          </div>
        </div>
      )}

      {(fiscalType === "BEKO_GMP3" || fiscalType === "HUGIN_GMP3") && (
        <div className={panelClass}>
          <h4 className="text-xs font-ui-bold text-foreground">Yazar Kasa (ÖKC) Parametreleri</h4>
          <div>
            <Label className="text-2xs">Bağlantı Türü</Label>
            <select
              value={connectionType}
              onChange={(e) => setConnectionType(e.target.value)}
              className={selectClassSm}
            >
              <option value="IP">Ağ (TCP/IP - Ethernet/Wi-Fi)</option>
              <option value="SERIAL">Kablolu (Seri Port - USB/COM)</option>
              {fiscalType === "BEKO_GMP3" && (
                <option value="CLOUD">Bulut (Token X-Connect Cloud)</option>
              )}
            </select>
          </div>

          {connectionType === "IP" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-2xs">Cihaz IP Adresi</Label>
                <Input
                  value={ipAddress}
                  onChange={(e) => setIpAddress(e.target.value)}
                  placeholder="192.168.1.150"
                  className="mt-1 h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-2xs">Bağlantı Portu</Label>
                <Input
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="8080"
                  className="mt-1 h-8 text-xs"
                />
              </div>
            </div>
          )}

          {connectionType === "SERIAL" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-2xs">Seri Port Yolu / COM</Label>
                <Input
                  value={serialPort}
                  onChange={(e) => setSerialPort(e.target.value)}
                  placeholder="COM3 veya /dev/ttyUSB0"
                  className="mt-1 h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-2xs">Baud Rate (Hız)</Label>
                <Input
                  value={baudRate}
                  onChange={(e) => setBaudRate(e.target.value)}
                  placeholder="115200"
                  className="mt-1 h-8 text-xs"
                />
              </div>
            </div>
          )}

          {connectionType === "CLOUD" && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-2xs">Client ID</Label>
                  <Input
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Token Client ID"
                    className="mt-1 h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-2xs">Client Secret</Label>
                  <Input
                    type="password"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    placeholder="Token Client Secret"
                    className="mt-1 h-8 text-xs"
                  />
                </div>
              </div>
              <div>
                <Label className="text-2xs">API URL Override (Opsiyonel)</Label>
                <Input
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="https://test-api.devtokeninc.com/app-store/external (Varsayılan)"
                  className="mt-1 h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-2xs">Auth URL Override (Opsiyonel)</Label>
                <Input
                  value={authUrl}
                  onChange={(e) => setAuthUrl(e.target.value)}
                  placeholder="Varsayılan: API URL kullanılır"
                  className="mt-1 h-8 text-xs"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Kimlik doğrulama farklı bir URL&apos;den yapılıyorsa buraya girin.
                </p>
              </div>
              <div className="mt-2 rounded-md border border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30 p-2.5">
                <p className="text-[10px] font-semibold text-blue-700 dark:text-blue-300 mb-1">
                  ℹ️ Webhook Yapılandırması
                </p>
                <p className="text-[10px] text-blue-600 dark:text-blue-400 leading-relaxed">
                  Token X-Connect Cloud, ödeme sonuçlarını webhook ile bildirir.
                  Aşağıdaki URL&apos;yi Token &quot;Set Client Settings&quot; API&apos;si üzerinden tanımlayın.
                </p>
                {fiscalWebhookUrl ? (
                  <div className="mt-2">
                    <Label className="text-[10px] text-blue-700 dark:text-blue-300">Webhook Endpoint URL</Label>
                    <Input
                      readOnly
                      value={fiscalWebhookUrl}
                      className="mt-1 h-8 bg-background text-[10px] font-mono"
                    />
                  </div>
                ) : (
                  <p className="text-[10px] text-blue-600/80 dark:text-blue-400/80 mt-2 leading-relaxed">
                    URL, terminal kaydedildikten ve sunucuda <code className="font-mono">FISCAL_WEBHOOK_BASE_URL</code> tanımlandıktan sonra görünür.
                  </p>
                )}
              </div>
            </div>
          )}

          {connectionType !== "CLOUD" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-2xs">Cihaz Seri Numarası (Yasal)</Label>
                <Input
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  placeholder="BEK000012345"
                  className="mt-1 h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-2xs">Entegrasyon API Key / Token</Label>
                <Input
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Lisans anahtarı"
                  className="mt-1 h-8 text-xs"
                />
              </div>
            </div>
          )}

          {connectionType === "CLOUD" && (
            <div>
              <Label className="text-2xs">Terminal ID (Yasal Seri No: AV/AT...)</Label>
              <Input
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                placeholder="AV0000000658"
                className="mt-1 h-8 text-xs"
              />
            </div>
          )}
        </div>
      )}

      {fiscalType === "EARSIV_UYUMSOFT" && (
        <div className={panelClass}>
          <h4 className="text-xs font-ui-bold text-foreground">e-Arşiv Özel Entegratör Parametreleri</h4>
          <div>
            <Label className="text-2xs">Entegratör Portal Kullanıcı Adı</Label>
            <Input
              value={integratorUser}
              onChange={(e) => setIntegratorUser(e.target.value)}
              placeholder="Uyumsoft kullanıcı adı"
              className="mt-1 h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-2xs">Entegratör Portal Şifresi</Label>
            <Input
              type="password"
              value={integratorPassword}
              onChange={(e) => setIntegratorPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1 h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-2xs">API Endpoint / Servis Adresi</Label>
            <Input
              value={integratorEndpoint}
              onChange={(e) => setIntegratorEndpoint(e.target.value)}
              placeholder="https://efatura-test.uyumsoft.com.tr/"
              className="mt-1 h-8 text-xs"
            />
          </div>
        </div>
      )}
    </div>
  )
}
