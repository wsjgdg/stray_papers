import { ResultPage } from "./ResultPage"
import { useResult } from "./useResult"

export default function ResultRoute() {
  const vm = useResult()
  return <ResultPage {...vm} />
}
