/**
 * 毕业照（批次 AX「同届」之一）
 * 合影洗出来了——第三排左起第 N 个是你，档案上写的。
 * 但照片不核对脸，只核对位置：这一学期教室里坐过替身的话，那一格站的不一定是你。
 */
import { Camera } from "lucide-react";
import type { GraduationDiplomaData } from "@/pages/Endings/useEndings";

interface GraduationPhotoProps {
  data: GraduationDiplomaData;
}

export function GraduationPhoto({ data }: GraduationPhotoProps) {
  const seat = data.photoSeat ?? 1;
  return (
    <section
      aria-label="毕业合影"
      className="mt-5 rounded-2xl border border-dashed border-border bg-background/60 p-4 text-left"
    >
      <p className="inline-flex items-center gap-1.5 text-xs font-bold tracking-widest text-muted-foreground">
        <Camera size={13} aria-hidden />
        毕业合影 · 冲印件
      </p>
      <p className="mt-2 text-sm leading-relaxed text-card-foreground">
        毕业照洗出来了。第三排左起第 {seat} 个是你——档案上写的。
      </p>
      {data.photoSurrogate ? (
        <p className="mt-2 text-sm leading-relaxed text-card-foreground">
          照片上那一格，站着的是替你上过课的那只。照片不核对脸，只核对位置；点名册不核对，档案更不。
          照片上那一行会写你的名字——它在档案里的名字，从这一学期起就不只是你的了。
        </p>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-card-foreground">
          这一学期你去过的课比替你的多：位置核对过了，脸也对上了。照片上那一行写你的名字——
          这一次，名字和脸是同一只蛙的。
        </p>
      )}
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground/70">
        同届的合影里还有别的蛙。你不认识它们——合影不提供认识的功能，只提供排列。
      </p>
    </section>
  );
}
