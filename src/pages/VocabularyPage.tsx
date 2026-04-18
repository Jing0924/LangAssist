import { BookOpen } from 'lucide-react'
import { GlassBentoCard } from '../components/GlassBentoCard'

export default function VocabularyPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <GlassBentoCard className="flex flex-wrap items-start justify-between gap-4 rounded-[18px] px-5 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-[0.35rem]">
          <h2 className="m-0 flex items-center gap-2 text-[1.1rem] font-semibold tracking-tight text-foreground">
            <BookOpen className="size-[1.15rem] shrink-0 opacity-90" aria-hidden />
            單字學習
          </h2>
          <p className="m-0 max-w-[56ch] text-[0.8125rem] leading-snug text-muted">
            此區塊規劃中。先前的小測驗流程已移除，後續若新增單字相關功能會放在此頁。
          </p>
        </div>
      </GlassBentoCard>

      <GlassBentoCard className="flex min-h-[min(40vh,320px)] min-w-0 flex-1 flex-col items-center justify-center gap-3 rounded-[18px] p-[clamp(1rem,2.5vw,1.25rem)]">
        <p className="m-0 text-center text-[0.875rem] leading-normal text-muted">
          敬請期待
        </p>
      </GlassBentoCard>
    </div>
  )
}
