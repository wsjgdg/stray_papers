import { EndingsPage } from "./EndingsPage"
import { useEndings } from "./useEndings"

export default function EndingsRoute() {
  const vm = useEndings()
  return <EndingsPage {...vm} />
}
