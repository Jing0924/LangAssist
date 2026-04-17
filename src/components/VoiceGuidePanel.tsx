type TranslateMode = "oneWay" | "bidirectional";

type VoiceGuidePanelProps = {
  id: string;
  translateMode: TranslateMode;
  /** Human-readable label for the language quick-test translates into */
  connectionCheckTargetLabel: string;
};

export const VOICE_GUIDE_PANEL_ID = "voice-guide-panel";

const guideSection =
  "m-0 flex flex-col gap-[0.45rem] p-0 [&_strong]:font-[650] [&_strong]:text-foreground";
const guideList =
  "m-0 flex list-none flex-col gap-[0.4rem] pl-[1.15rem] text-[0.8125rem] leading-normal text-secondary";
const guideHeading =
  "m-0 text-[0.8125rem] font-[650] uppercase tracking-[0.03em] text-muted";
const guideCode =
  "rounded-md border border-white/10 bg-[rgb(15_23_42/0.55)] px-[0.35em] py-[0.12em] font-mono text-[0.78em] text-accent [word-break:break-all]";

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
      className="flex min-w-0 flex-col gap-[1.1rem]"
      role="region"
      aria-labelledby="voice-guide-title"
    >
      <h3
        id="voice-guide-title"
        className="m-0 text-base font-[650] tracking-tight text-foreground"
      >
        新手導引
      </h3>

      <section
        className={guideSection}
        aria-labelledby="voice-guide-quick-title"
      >
        <h4 id="voice-guide-quick-title" className={guideHeading}>
          快速開始
        </h4>
        <ul className={guideList}>
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
        className={guideSection}
        aria-labelledby="voice-guide-connection-title"
      >
        <h4
          id="voice-guide-connection-title"
          className={guideHeading}
        >
          連線檢查
        </h4>
        <ul className={guideList}>
          <li>
            頁面上的「連線檢查」會送出一則固定測試句到翻譯服務，用來確認網路與金鑰是否正常，不會錄下您的聲音。
          </li>
          <li>{connectionLine}</li>
        </ul>
      </section>

      <section
        className={guideSection}
        aria-labelledby="voice-guide-env-title"
      >
        <h4 id="voice-guide-env-title" className={guideHeading}>
          環境與金鑰
        </h4>
        <ul className={guideList}>
          <li>
            在專案根目錄建立{" "}
            <code className={guideCode}>.env</code>{" "}
            並設定變數（Vite 只會把前綴{" "}
            <code className={guideCode}>VITE_</code> 的變數暴露給前端）。
          </li>
          <li>
            語音辨識、翻譯與朗讀需要{" "}
            <code className={guideCode}>VITE_GOOGLE_CLOUD_API_KEY</code>
            ；變更後請<strong>重新啟動</strong>開發伺服器。
          </li>
          <li>
            可對照根目錄的{" "}
            <code className={guideCode}>.env.example</code>{" "}
            查看範例變數名稱與說明。
          </li>
        </ul>
      </section>
    </div>
  );
}
