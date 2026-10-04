import { CampusMapPage } from "./CampusMapPage"
import { useCampusMap } from "./useCampusMap"

export default function CampusMapRoute() {
  const vm = useCampusMap()
  return <CampusMapPage {...vm} />
}
