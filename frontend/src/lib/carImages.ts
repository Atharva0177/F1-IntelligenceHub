/* ── Season car livery images (f1-fansite.com) ──────────────────── */
export const CAR_IMAGES: Record<number, Record<string, string>> = {
  // 2020 full-size images confirmed available on the server
  2020: {
    'Red Bull Racing': 'https://www.f1-fansite.com/wp-content/uploads/2017/10/redbull-rb14.png',
    'Ferrari':         'https://www.f1-fansite.com/wp-content/uploads/2017/10/ferrari-SF71H.png',
    'Mercedes':        'https://www.f1-fansite.com/wp-content/uploads/2017/10/mercedes-w09.png',
    'McLaren':         'https://www.f1-fansite.com/wp-content/uploads/2020/03/McLaren-MCL35-sidevie-mirrorw.png',
    'Racing Point':    'https://www.f1-fansite.com/wp-content/uploads/2017/10/forceindia-VJM11.png',
    'Force India':     'https://www.f1-fansite.com/wp-content/uploads/2017/10/forceindia-VJM11.png',
    'Renault':         'https://www.f1-fansite.com/wp-content/uploads/2017/10/renault-rs18.png',
    'Haas F1 Team':    'https://www.f1-fansite.com/wp-content/uploads/2017/10/haas-VF-18.png',
    'Haas':            'https://www.f1-fansite.com/wp-content/uploads/2017/10/haas-VF-18.png',
    'Alfa Romeo':      'https://www.f1-fansite.com/wp-content/uploads/2017/10/sauber-C37.png',
    'Williams':        'https://www.f1-fansite.com/wp-content/uploads/2020/03/Williams-FW43-sideview.jpg',
  },
  2023: {
    'Red Bull Racing': 'https://www.f1-fansite.com/wp-content/uploads/2023/02/Red-Bull-RB18-sideview.jpg',
    'Ferrari':         'https://www.f1-fansite.com/wp-content/uploads/2023/02/Right-side-view-Ferrari-F1-75.jpg',
    'Mercedes':        'https://www.f1-fansite.com/wp-content/uploads/2023/02/Mercedes-W14-right-side-view.jpg',
    'McLaren':         'https://www.f1-fansite.com/wp-content/uploads/2023/02/MCL60-right-side-view.jpg',
    'Aston Martin':    'https://www.f1-fansite.com/wp-content/uploads/2023/02/AMR23-right-side-view.jpg',
    'Alpine':          'https://www.f1-fansite.com/wp-content/uploads/2023/02/Left-side-view-Alpine-A523.jpg',
    'Williams':        'https://www.f1-fansite.com/wp-content/uploads/2023/02/Williams-FW45-side-view-website.jpg',
    'AlphaTauri':      'https://www.f1-fansite.com/wp-content/uploads/2023/02/AlphaTauri-AT04-1.jpg',
    'Toro Rosso':      'https://www.f1-fansite.com/wp-content/uploads/2023/02/AlphaTauri-AT04-1.jpg',
    'Alfa Romeo':      'https://www.f1-fansite.com/wp-content/uploads/2023/02/Alfa-Romeo-C42-right-side-view.jpg',
    'Haas F1 Team':    'https://www.f1-fansite.com/wp-content/uploads/2023/02/Right-side-view-Haas-VF-23.jpg',
    'Haas':            'https://www.f1-fansite.com/wp-content/uploads/2023/02/Right-side-view-Haas-VF-23.jpg',
    'Racing Point':    'https://www.f1-fansite.com/wp-content/uploads/2023/02/AMR23-right-side-view.jpg',
    'Renault':         'https://www.f1-fansite.com/wp-content/uploads/2023/02/Left-side-view-Alpine-A523.jpg',
  },
  2024: {
    'Red Bull Racing': 'https://www.f1-fansite.com/wp-content/uploads/2024/05/Red-Bull-RB20.jpg',
    'Ferrari':         'https://www.f1-fansite.com/wp-content/uploads/2024/05/Ferrari-SF-24.jpg',
    'Sauber':          'https://www.f1-fansite.com/wp-content/uploads/2024/05/Sauber-C44.jpg',
    'Kick Sauber':     'https://www.f1-fansite.com/wp-content/uploads/2024/05/Sauber-C44.jpg',
    'RB':              'https://www.f1-fansite.com/wp-content/uploads/2024/05/VCARB01.jpg',
    'Racing Bulls':    'https://www.f1-fansite.com/wp-content/uploads/2024/05/VCARB01.jpg',
  },
  2025: {
    'McLaren':         'https://www.f1-fansite.com/wp-content/uploads/2025/11/2025_mcl_website_menu_mcl39.webp',
  },
  2026: {
    'McLaren':         'https://www.f1-fansite.com/wp-content/uploads/2026/02/McLaren-Mastercard-Formula-1-Team-MCL40-sideview.jpg',
  },
};

/** Find the best available car image URL for a team/season.
 *  Walks backwards from the given season through available year maps.
 *  For pre-2023 seasons, falls back to the 2023 map as a final catch-all
 *  (covers teams like Alpine/Aston Martin that didn't exist in 2020). */
export function getCarImage(teamName: string, season: number): string | undefined {
  const lower = teamName.toLowerCase();
  const tryMap = (yearMap: Record<string, string>) => {
    const exact = yearMap[teamName];
    if (exact) return exact;
    return Object.entries(yearMap).find(
      ([k]) => lower.includes(k.toLowerCase()) || k.toLowerCase().includes(lower)
    )?.[1];
  };

  // Walk from season downwards through available year maps
  for (let yr = season; yr >= 2020; yr--) {
    const yearMap = CAR_IMAGES[yr];
    if (!yearMap) continue;
    const result = tryMap(yearMap);
    if (result) return result;
  }

  // Final fallback to 2023 for teams not covered above (e.g. Alpine/Aston Martin pre-2023)
  if (season < 2023 && CAR_IMAGES[2023]) {
    return tryMap(CAR_IMAGES[2023]);
  }

  return undefined;
}
