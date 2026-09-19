import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  Clock3,
  RefreshCw,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";

import type { DisplayState } from "@/modules/view-model";

const stateConfig = {
  current: { label: "Current fixture", icon: Clock3 },
  resolved: { label: "Resolved", icon: CheckCircle2 },
  stale: { label: "Stale · historical", icon: TriangleAlert },
  incomplete: { label: "Incomplete", icon: CircleDashed },
  failed: { label: "Job failed", icon: AlertCircle },
  void: { label: "Void · excluded", icon: ShieldAlert },
  corrected: { label: "Corrected", icon: RefreshCw },
} as const;

export function StatusBadge({ state }: { readonly state: DisplayState }) {
  const config = stateConfig[state];
  const Icon = config.icon;
  return (
    <span className={`status-badge status-${state}`}>
      <Icon aria-hidden="true" /> {config.label}
    </span>
  );
}
