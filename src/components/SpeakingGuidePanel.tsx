type SpeakingGuidePanelProps = {
  id: string;
};

export const SPEAKING_GUIDE_PANEL_ID = "speaking-guide-panel";
export const SPEAKING_GUIDE_ORAL_SECTION_ID = "speaking-guide-oral";

const guideSection =
  "m-0 flex flex-col gap-[0.45rem] p-0 [&_strong]:font-[650] [&_strong]:text-foreground";
const guideList =
  "m-0 flex list-none flex-col gap-[0.4rem] pl-[1.15rem] text-[0.8125rem] leading-normal text-secondary";
const guideHeading =
  "m-0 text-[0.8125rem] font-[650] uppercase tracking-[0.03em] text-muted";
const guideCode =
  "rounded-md border border-white/10 bg-[rgb(15_23_42/0.55)] px-[0.35em] py-[0.12em] font-mono text-[0.78em] text-accent [word-break:break-all]";

export function SpeakingGuidePanel({ id }: SpeakingGuidePanelProps) {
  return (
    <div
      id={id}
      className="flex min-w-0 flex-col gap-[1.1rem]"
      role="region"
      aria-labelledby="speaking-guide-title"
    >
      <h3
        id="speaking-guide-title"
        className="m-0 text-base font-[650] tracking-tight text-foreground"
      >
        設定與說明
      </h3>

      <section
        className={guideSection}
        aria-labelledby="speaking-guide-quick-title"
      >
        <h4 id="speaking-guide-quick-title" className={guideHeading}>
          快速開始
        </h4>
        <ul className={guideList}>
          <li>
            在文字框輸入內容並送出，即可與助手練習對話。
          </li>
          <li>
            選擇口說模式後使用「口說練習」區塊的按鈕，以麥克風練習。
          </li>
          <li>
            第一次使用或要排查連線問題時，請展開下方「環境與金鑰」。
          </li>
        </ul>
      </section>

      <section
        id={SPEAKING_GUIDE_ORAL_SECTION_ID}
        className={`scroll-mt-4 ${guideSection}`}
        aria-labelledby="speaking-guide-oral-heading"
      >
        <h4 id="speaking-guide-oral-heading" className={guideHeading}>
          口說模式（Live 與語音管道）
        </h4>
        <ul className={guideList}>
          <li>
            <strong>Gemini Live</strong>
            ：瀏覽器即時麥克風／音訊串流，通常只需設定{" "}
            <code className={guideCode}>VITE_GEMINI_API_KEY</code>
            。
          </li>
          <li>
            <strong>Flash Lite 管道</strong>
            ：錄音後經 Google Cloud Speech-to-Text → Gemini 2.5 Flash
            Lite（串流）→ Text-to-Speech 朗讀；需{" "}
            <code className={guideCode}>VITE_GOOGLE_CLOUD_API_KEY</code>
            ，並在 Google Cloud 專案中啟用 STT 與 TTS API。
          </li>
          <li>
            文字聊天使用上方顯示的文字模型；管道口說的 LLM 固定為 flash-lite，與文字模型選項無關。
          </li>
        </ul>
      </section>

      <section
        className={guideSection}
        aria-labelledby="speaking-guide-env-title"
      >
        <h4 id="speaking-guide-env-title" className={guideHeading}>
          環境與金鑰
        </h4>
        <ul className={guideList}>
          <li>
            在專案根目錄的 <code className={guideCode}>.env</code>{" "}
            設定變數（Vite 暴露給前端的前綴為 <code className={guideCode}>VITE_</code>
            ）。
          </li>
          <li>
            文字與 Gemini Live 需要{" "}
            <code className={guideCode}>VITE_GEMINI_API_KEY</code>
            ；變更後請<strong>重新啟動</strong>開發伺服器。
          </li>
          <li>
            語音管道（STT／TTS）需要{" "}
            <code className={guideCode}>VITE_GOOGLE_CLOUD_API_KEY</code>
            ，並確認該金鑰對應的專案已啟用 Speech-to-Text 與 Text-to-Speech。
          </li>
        </ul>
      </section>

      <section
        className={guideSection}
        aria-labelledby="speaking-guide-history-title"
      >
        <h4 id="speaking-guide-history-title" className={guideHeading}>
          對話紀錄
        </h4>
        <ul className={guideList}>
          <li>
            對話與暫存僅保存在此瀏覽器本機，換裝置或清除網站資料後不會保留。
          </li>
          <li>同一側欄最多可保留 30 則對話紀錄。</li>
        </ul>
      </section>
    </div>
  );
}
