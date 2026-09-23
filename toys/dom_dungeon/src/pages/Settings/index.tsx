import { SettingsPage } from "./SettingsPage"
import { useSettings } from "./useSettings"

export default function SettingsRoute() {
  const vm = useSettings()
  return <SettingsPage {...vm} />
}
