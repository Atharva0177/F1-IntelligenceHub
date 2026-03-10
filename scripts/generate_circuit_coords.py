"""
Extract circuit coordinates from FastF1 telemetry data
Generates JSON files with X/Y coordinates for 3D visualization
"""
import fastf1
import json
import os
import re
import logging
import numpy as np
from pathlib import Path

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Disable FastF1 verbose logging
logging.getLogger('fastf1').setLevel(logging.WARNING)

# Enable FastF1 cache
cache_dir = Path(__file__).parent.parent / 'fastf1_cache'
cache_dir.mkdir(exist_ok=True)
fastf1.Cache.enable_cache(str(cache_dir))


def rotate(xy, angle):
    """Rotate a point or array of points by angle (radians) — FastF1 official technique."""
    rot_mat = np.array([[np.cos(angle), np.sin(angle)],
                        [-np.sin(angle), np.cos(angle)]])
    return np.matmul(xy, rot_mat)


def extract_circuit_coords(year: int, round_num: int, event_name: str):
    """
    Extract circuit coordinates from a race session
    
    Args:
        year: Season year
        round_num: Round number
        event_name: Event name for the output file
    """
    try:
        logger.info(f"Processing {event_name} (Round {round_num})...")
        
        # Load race session with minimal data to avoid Ergast
        session = fastf1.get_session(year, round_num, 'R')
        
        # Load only telemetry and laps, skip weather and messages
        session.load(telemetry=True, laps=True, weather=False, messages=False)
        
        # Get fastest lap from any driver
        fastest_lap = session.laps.pick_fastest()
        
        if fastest_lap is None:
            logger.warning(f"  No fastest lap found for {event_name}")
            return None
        
        # Get raw position data (FastF1 official approach: get_pos_data() directly)
        try:
            pos = fastest_lap.get_pos_data()
        except Exception as e:
            logger.warning(f"  Could not get position data: {e}")
            return None

        if pos is None or len(pos) == 0:
            logger.warning(f"  Position data is empty for {event_name}")
            return None

        # Get circuit rotation angle (official FastF1 technique)
        try:
            circuit_info = session.get_circuit_info()
            rotation = float(circuit_info.rotation)
        except Exception:
            rotation = 0.0

        # Apply rotation matrix exactly as in FastF1 docs
        track_angle = rotation / 180 * np.pi
        xy = pos.loc[:, ('X', 'Y')].to_numpy(dtype=float)
        rot_mat = np.array([[np.cos(track_angle), np.sin(track_angle)],
                            [-np.sin(track_angle), np.cos(track_angle)]])
        rotated = xy @ rot_mat

        x_coords = rotated[:, 0].tolist()
        y_coords = rotated[:, 1].tolist()

        # Use circuit_info corners if available
        corners = []
        drs_zones = []
        try:
            for _, corner in circuit_info.corners.iterrows():
                cx, cy = rotate([corner['X'], corner['Y']], track_angle)
                corners.append({
                    'number': int(corner['Number']),
                    'letter': str(corner['Letter']),
                    'x': float(cx),
                    'y': float(cy),
                    'angle': float(corner['Angle']),
                })
            logger.info(f"  Identified {len(corners)} corners from circuit_info")
        except Exception:
            logger.info("  No corner data from circuit_info")

        # Create output directory
        output_dir = Path(__file__).parent.parent / 'frontend' / 'public' / 'circuits'
        output_dir.mkdir(parents=True, exist_ok=True)

        # Save as JSON — use ASCII slug to match the frontend's circuitSlug() function
        import unicodedata, re as _re
        _norm = unicodedata.normalize('NFD', event_name)
        _ascii = ''.join(c for c in _norm if unicodedata.category(c) != 'Mn')
        filename = _re.sub(r'[^a-z0-9]+', '_', _ascii.lower()).strip('_') + '.json'
        output_path = output_dir / filename

        data = {
            'name': event_name,
            'year': year,
            'round': round_num,
            'rotation': rotation,
            'x': x_coords,
            'y': y_coords,
            'corners': corners,
            'drs_zones': drs_zones
        }
        
        with open(output_path, 'w') as f:
            json.dump(data, f, indent=2)
        
        logger.info(f"  ✓ Saved {len(x_coords)} coordinates with {len(drs_zones)} DRS zones and {len(corners)} corners to {filename}")
        return output_path
        
    except Exception as e:
        logger.error(f"  ✗ Error processing {event_name}: {e}")
        return None


def slugify(name: str) -> str:
    """Produce ASCII slug matching the frontend circuitSlug() function."""
    import unicodedata
    normalized = unicodedata.normalize('NFD', name)
    ascii_name = ''.join(c for c in normalized if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', '_', ascii_name.lower()).strip('_')


def main():
    """Generate circuit coordinates for all circuits not yet saved to disk."""

    output_dir = Path(__file__).parent.parent / 'frontend' / 'public' / 'circuits'
    output_dir.mkdir(parents=True, exist_ok=True)

    # (year, round, event_name) — use most-recent year with cached data.
    # Only circuits NOT already present in public/circuits/ need entries here.
    circuits = [
        # ── 2020 special / temporary circuits ────────────────────────────────
        (2020, 5,  "70th Anniversary Grand Prix"),  # Silverstone outer
        (2020, 9,  "Tuscan Grand Prix"),             # Mugello
        (2020, 16, "Sakhir Grand Prix"),             # Bahrain outer loop

        # ── Standard circuits missing from 2021 run ──────────────────────────
        (2024, 3,  "Australian Grand Prix"),
        (2024, 4,  "Japanese Grand Prix"),
        (2024, 5,  "Chinese Grand Prix"),
        (2024, 6,  "Miami Grand Prix"),
        (2024, 9,  "Canadian Grand Prix"),
        (2024, 14, "Belgian Grand Prix"),
        (2024, 18, "Singapore Grand Prix"),

        # ── Las Vegas (first appearance 2023) ────────────────────────────────
        (2023, 21, "Las Vegas Grand Prix"),

        # ── 2021 calendar (regenerate with diacritic-safe slug) ──────────────
        (2021, 1,  "Bahrain Grand Prix"),
        (2021, 2,  "Emilia Romagna Grand Prix"),
        (2021, 3,  "Portuguese Grand Prix"),
        (2021, 4,  "Spanish Grand Prix"),
        (2021, 5,  "Monaco Grand Prix"),
        (2021, 6,  "Azerbaijan Grand Prix"),
        (2021, 7,  "French Grand Prix"),
        (2021, 8,  "Styrian Grand Prix"),
        (2021, 9,  "Austrian Grand Prix"),
        (2021, 10, "British Grand Prix"),
        (2021, 11, "Hungarian Grand Prix"),
        (2021, 12, "Belgian Grand Prix"),
        (2021, 13, "Dutch Grand Prix"),
        (2021, 14, "Italian Grand Prix"),
        (2021, 15, "Russian Grand Prix"),
        (2021, 16, "Turkish Grand Prix"),
        (2021, 17, "United States Grand Prix"),
        (2021, 18, "Mexico City Grand Prix"),
        (2021, 19, "Sao Paulo Grand Prix"),
        (2021, 20, "Qatar Grand Prix"),
        (2021, 21, "Saudi Arabian Grand Prix"),
        (2021, 22, "Abu Dhabi Grand Prix"),
    ]

    logger.info("Starting circuit coordinate extraction")
    logger.info("=" * 80)

    successful = 0
    failed = 0
    skipped = 0

    for year, round_num, event_name in circuits:
        slug = slugify(event_name)
        out_path = output_dir / f"{slug}.json"
        if out_path.exists():
            logger.info(f"  ↷ Skipping {event_name} — {slug}.json already exists")
            skipped += 1
            continue
        result = extract_circuit_coords(year, round_num, event_name)
        if result:
            successful += 1
        else:
            failed += 1

    logger.info("\n" + "=" * 80)
    logger.info("Extraction complete!")
    logger.info(f"  ✓ Generated : {successful}")
    logger.info(f"  ↷ Skipped   : {skipped}")
    logger.info(f"  ✗ Failed    : {failed}")
    logger.info("=" * 80)


if __name__ == "__main__":
    main()
