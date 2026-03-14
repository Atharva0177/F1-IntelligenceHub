export type DriverStyle = {
  color: string;
  dashArray?: string;
  lineStyle: "solid" | "dotted";
  teamName?: string;
};

const TEAM_COLORS: Record<string, string> = {
  mercedes: "#00D2BE",
  "red bull": "#3671C6",
  "red bull racing": "#3671C6",
  ferrari: "#E8002D",
  mclaren: "#FF8000",
  alpine: "#0090FF",
  williams: "#005AFF",
  aston: "#358C75",
  "aston martin": "#358C75",
  haas: "#B6503A",
  sauber: "#00E8C6",
  "kick sauber": "#00E8C6",
  "alfa romeo": "#900040",
  "alpha tauri": "#4E7CFF",
  alphatauri: "#4E7CFF",
  rb: "#2A5CFF",
  "racing bulls": "#2A5CFF",
  "visa cash app rb": "#2A5CFF",
  toro: "#3A66CC",
  "toro rosso": "#3A66CC",
  renault: "#FFF500",
  "racing point": "#F596C8",
  "force india": "#FF7A00",
};

const FALLBACK_COLORS = [
  "#50C8F0",
  "#F5A623",
  "#CC3333",
  "#64C4FF",
  "#4895EF",
  "#9B9B9B",
  "#D4006C",
  "#6692FF",
];

function normTeam(team?: string): string {
  return (team || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveTeamColor(teamName: string, teamOrderIndex: number): string {
  const n = normTeam(teamName);
  if (!n) return FALLBACK_COLORS[teamOrderIndex % FALLBACK_COLORS.length];

  if (TEAM_COLORS[n]) return TEAM_COLORS[n];

  for (const key of Object.keys(TEAM_COLORS)) {
    if (n.includes(key) || key.includes(n)) return TEAM_COLORS[key];
  }

  return FALLBACK_COLORS[teamOrderIndex % FALLBACK_COLORS.length];
}

export type DriverStyleInput = {
  driver_code: string;
  team_name?: string;
  position?: number;
  predicted_position?: number;
  grid_position?: number;
};

export function buildDriverStyles(rows: DriverStyleInput[]): Record<string, DriverStyle> {
  const bestByDriver = new Map<string, DriverStyleInput>();

  for (const row of rows) {
    if (!row.driver_code) continue;

    const score =
      row.position ?? row.predicted_position ?? row.grid_position ?? 999;

    const prev = bestByDriver.get(row.driver_code);
    if (!prev) {
      bestByDriver.set(row.driver_code, row);
      continue;
    }

    const prevScore =
      prev.position ?? prev.predicted_position ?? prev.grid_position ?? 999;

    if (score < prevScore || (!prev.team_name && row.team_name)) {
      bestByDriver.set(row.driver_code, row);
    }
  }

  const grouped = new Map<string, DriverStyleInput[]>();
  for (const row of bestByDriver.values()) {
    const teamKey = normTeam(row.team_name) || "unknown";
    if (!grouped.has(teamKey)) grouped.set(teamKey, []);
    grouped.get(teamKey)!.push(row);
  }

  const styles: Record<string, DriverStyle> = {};
  const teamKeys = Array.from(grouped.keys()).sort();

  teamKeys.forEach((teamKey, teamIdx) => {
    const drivers = grouped.get(teamKey)!;
    drivers.sort((a, b) => {
      const sa = a.position ?? a.predicted_position ?? a.grid_position ?? 999;
      const sb = b.position ?? b.predicted_position ?? b.grid_position ?? 999;
      if (sa !== sb) return sa - sb;
      return a.driver_code.localeCompare(b.driver_code);
    });

    const teamName = drivers.find((d) => d.team_name)?.team_name || teamKey;
    const color = resolveTeamColor(teamName, teamIdx);

    drivers.forEach((d, idx) => {
      const dotted = idx % 2 === 1;
      styles[d.driver_code] = {
        color,
        dashArray: dotted ? "7 5" : undefined,
        lineStyle: dotted ? "dotted" : "solid",
        teamName: d.team_name,
      };
    });
  });

  return styles;
}
