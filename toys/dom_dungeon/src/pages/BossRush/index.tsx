import { BossRushPage } from "./BossRushPage"
import { useBossRush } from "./useBossRush"

export default function BossRushRoute() {
  const vm = useBossRush()
  return <BossRushPage {...vm} />
}
