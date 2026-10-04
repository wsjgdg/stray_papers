import { PlayPage } from "./PlayPage"
import { usePlay } from "./usePlay"

export default function PlayRoute() {
  const vm = usePlay()
  return <PlayPage {...vm} />
}
