import { CodexPage } from "./CodexPage"
import { useCodex } from "./useCodex"

export default function CodexRoute() {
  const vm = useCodex()
  return <CodexPage {...vm} />
}
