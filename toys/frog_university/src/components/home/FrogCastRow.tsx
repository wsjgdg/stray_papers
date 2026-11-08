import { FROG_BY_CHARACTER } from "@/components/frog/Frog";
import type { FrogCharacter } from "@/data/characters";
import { RichText } from "@/components/common/RichText";

interface FrogCastRowProps {
  cast: FrogCharacter[];
}

/** 一排矢量奶蛙立绘：依次蹦出，hover 弹口头禅气泡 */
export function FrogCastRow({ cast }: FrogCastRowProps) {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="rounded-3xl border border-border bg-card p-6 shadow-lg md:p-10">
        <div className="flex flex-col items-center gap-1 text-center">
          <h2 className="text-2xl font-bold text-card-foreground">今天也在场的奶蛙们</h2>
          <p className="text-sm text-muted-foreground">把鼠标放到它们头上，听听今天的第一句话</p>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
          {cast.map((character, index) => {
            const FrogArt = FROG_BY_CHARACTER[character.id];
            return (
              <div
                key={character.id}
                className="group relative flex flex-col items-center gap-3 rounded-2xl px-2 py-3 transition-colors duration-200 hover:bg-muted/60"
              >
                <div className="anim-frog-hop relative" style={{ animationDelay: `${760 + index * 110}ms` }}>
                  <FrogArt size={86} floaty />
                  <div className="pointer-events-none absolute -top-2 left-1/2 w-max max-w-44 -translate-x-1/2 -translate-y-full rounded-2xl rounded-bl-sm border border-border bg-card px-3 py-2 text-center text-xs font-medium text-card-foreground opacity-0 shadow-md transition-opacity duration-200 group-hover:opacity-100">
                    「{character.quote}」
                  </div>
                </div>
                <div className="text-center">
                  <RichText className="text-sm font-bold text-card-foreground" text={character.displayName} />
                  <RichText className="text-xs text-muted-foreground" text={character.role} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
