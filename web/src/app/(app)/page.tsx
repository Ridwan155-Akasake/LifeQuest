import { CockpitView } from "@/components/views/cockpit";
import { HybridView } from "@/components/views/hybrid";
import { QuestView } from "@/components/views/quest";
import { getHome } from "@/lib/play";
import { getScope, inScope } from "@/lib/scope";

export const metadata = { title: "Now" };

/**
 * Home. Same data, three looks — picked in Settings → View:
 * Hybrid (one thing now + bosses), Quest (the game board), Cockpit (timeline + feed).
 */
export default async function HomePage() {
  const scope = await getScope();
  const home = await getHome(inScope(scope));
  if (scope.settings.view === "quest") return <QuestView home={home} />;
  if (scope.settings.view === "cockpit") return <CockpitView home={home} />;
  return <HybridView home={home} />;
}
