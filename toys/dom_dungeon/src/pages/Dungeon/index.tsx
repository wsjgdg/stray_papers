import { DungeonPage } from "./DungeonPage"
import { useDungeon } from "./useDungeon"

export default function DungeonRoute() {
  const vm = useDungeon()
  return <DungeonPage {...vm} />
}
