import { DailyPage } from "./DailyPage"
import { useDaily } from "./useDaily"

export default function DailyRoute() {
  const vm = useDaily()
  return <DailyPage {...vm} />
}
