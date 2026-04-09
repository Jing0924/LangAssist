type TranslateMode = "oneWay" | "bidirectional";

type VoiceGuidePanelProps = {
  id: string;
  translateMode: TranslateMode;
  /** Human-readable label for the language quick-test translates into */
  connectionCheckTargetLabel: string;
};

export const VOICE_GUIDE_PANEL_ID = "voice-guide-panel";

export function VoiceGuidePanel({
  id,
  translateMode,
  connectionCheckTargetLabel,
}: VoiceGuidePanelProps) {
  const connectionLine =
    translateMode === "bidirectional"
      ? `雙向模式下，測試句會翻成目前設定的語言 B（${connectionCheckTargetLabel}），與實際雙向對話時譯向語言 B 的邏輯一致。`
      : `單向模式下，測試句會翻成目前設定的目標語言（${connectionCheckTargetLabel}）。`;

  return (
    <div
      id={id}
      className="speaking-guide"
      role="region"
      aria-labelledby="voice-guide-title"
    >
      <h3 id="voice-guide-title" className="speaking-guide__title">
        新手導引
      </h3>

      <section
        className="speaking-guide__section"
        aria-labelledby="voice-guide-quick-title"
      >
        <h4 id="voice-guide-quick-title" className="speaking-guide__heading">
          快速開始
        </h4>
        <ul className="speaking-guide__list">
          <li>
            <strong>單向翻譯</strong>
            ：選擇來源與目標語言後，點麥克風或按空白鍵開始說話；結束收音後會辨識語音並翻成目標語言，必要時自動朗讀譯文。
          </li>
          <li>
            <strong>雙向對話</strong>
            ：設定語言 A（主辨識）與語言 B，輪流說話時系統會在兩種語言之間互譯。
          </li>
          <li>
            若需設定 API 金鑰或了解「連線檢查」按鈕在做什麼，請閱讀下方章節。
          </li>
        </ul>
      </section>

      <section
        className="speaking-guide__section"
        aria-labelledby="voice-guide-connection-title"
      >
        <h4
          id="voice-guide-connection-title"
          className="speaking-guide__heading"
        >
          連線檢查
        </h4>
        <ul className="speaking-guide__list">
          <li>
            頁面上的「連線檢查」會送出一則固定測試句到翻譯服務，用來確認網路與金鑰是否正常，不會錄下您的聲音。
          </li>
          <li>{connectionLine}</li>
        </ul>
      </section>

      <section
        className="speaking-guide__section"
        aria-labelledby="voice-guide-env-title"
      >
        <h4 id="voice-guide-env-title" className="speaking-guide__heading">
          環境與金鑰
        </h4>
        <ul className="speaking-guide__list">
          <li>
            在專案根目錄建立{" "}
            <code className="speaking-guide__code">.env</code>{" "}
            並設定變數（Vite 只會把前綴{" "}
            <code className="speaking-guide__code">VITE_</code> 的變數暴露給前端）。
          </li>
          <li>
            語音辨識、翻譯與朗讀需要{" "}
            <code className="speaking-guide__code">VITE_GOOGLE_CLOUD_API_KEY</code>
            ；變更後請<strong>重新啟動</strong>開發伺服器。
          </li>
          <li>
            可對照根目錄的{" "}
            <code className="speaking-guide__code">.env.example</code>{" "}
            查看範例變數名稱與說明。
          </li>
        </ul>
      </section>
    </div>
  );
}
