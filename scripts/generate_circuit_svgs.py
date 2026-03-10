"""
Generate SVG circuit layouts for all 2018 F1 tracks using FastF1 position data
Uses FastF1Client wrapper to properly handle Ergast API mirror configuration
"""
import sys
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent.parent / 'backend'
sys.path.insert(0, str(backend_path))

from data_pipeline.fastf1_client import FastF1Client
import numpy as np
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastF1 client (handles Ergast mirror and caching)
f1_client = FastF1Client()

def normalize_coordinates(x, y):
    """Normalize coordinates to 0-1000 range for SVG viewbox"""
    x_min, x_max = x.min(), x.max()
    y_min, y_max = y.min(), y.max()
    
    # Calculate scale to fit in 1000x1000 viewbox with padding
    x_range = x_max - x_min
    y_range = y_max - y_min
    max_range = max(x_range, y_range)
    
    padding = 50  # pixels
    scale = (1000 - 2 * padding) / max_range
    
    # Normalize and center
    x_norm = (x - x_min) * scale + padding
    y_norm = (y - y_min) * scale + padding
    
    # Flip Y axis (SVG has Y increasing downward)
    y_norm = 1000 - y_norm
    
    return x_norm, y_norm

def generate_circuit_svg_path(session):
    """Generate SVG path data from session position data"""
    try:
        # Get position data from fastest lap
        fastest_lap = session.laps.pick_fastest()
        
        if fastest_lap is None:
            logger.warning("No laps found in session")
            return None
            
        pos = fastest_lap.get_pos_data()
        
        if pos is None or len(pos) == 0:
            logger.warning("No position data available")
            return None
        
        # Extract X and Y coordinates
        x = pos['X'].values
        y = pos['Y'].values
        
        # Normalize to SVG coordinates  
        x_norm, y_norm = normalize_coordinates(x, y)
        
        # Generate SVG path
        path_data = f"M {x_norm[0]:.2f},{y_norm[0]:.2f} "
        for i in range(1, len(x_norm)):
            path_data += f"L {x_norm[i]:.2f},{y_norm[i]:.2f} "
        path_data += "Z"  # Close the path
        
        return path_data
        
    except Exception as e:
        logger.error(f"Error generating circuit path: {e}")
        return None

def generate_all_circuits(year=2021):
    """Generate circuit layouts for all races in a season"""
    logger.info(f"=" * 80)
    logger.info(f"Generating Circuit Layouts for {year} Season")
    logger.info(f"=" * 80)
    
    # Get schedule
    schedule = f1_client.get_event_schedule(year)
    circuits = {}
    
    for _, event in schedule.iterrows():
        round_num = int(event['RoundNumber'])
        event_name = event['EventName']
        country = event.get('Country', '')
        location = event.get('Location', '')
        
        logger.info(f"\nProcessing Round {round_num}: {event_name}")
        
        try:
            # Load race session
            session = f1_client.get_session(year, round_num, 'R')
            
            if session is None:
                logger.warning(f"  ✗ Could not load session for {event_name}")
                continue
            
            # Generate SVG path
            svg_path = generate_circuit_svg_path(session)
            
            if svg_path:
                circuits[event_name] = {
                    'round': round_num,
                    'name': event_name,
                    'country': country,
                    'location': location,
                    'svgPath': svg_path
                }
                logger.info(f"  ✓ Generated circuit layout for {event_name}")
            else:
                logger.warning(f"  ✗ Could not generate layout for {event_name}")
                
        except Exception as e:
            logger.error(f"  ✗ Error processing {event_name}: {e}")
            continue
    
    return circuits

def save_circuits_to_typescript(circuits, output_file):
    """Save circuit data as TypeScript file"""
    logger.info(f"\n{('=' * 80)}")
    logger.info(f"Saving circuits to {output_file}")
    
    # Sort by round number
    sorted_circuits = dict(sorted(circuits.items(), key=lambda x: x[1]['round']))
    
    ts_content = """// Auto-generated circuit SVG paths from FastF1 position data
// Generated using scripts/generate_circuit_svgs.py
// Based on fastest lap position data from 2018 F1 season

export interface CircuitLayout {
  round: number;
  name: string;
  country: string;
  location: string;
  svgPath: string;
}

export const circuitLayouts: Record<string, CircuitLayout> = {
"""
    
    for circuit_name, data in sorted_circuits.items():
        # Escape circuit name for TypeScript key
        safe_name = circuit_name.replace("'", "\\'")
        safe_country = data['country'].replace("'", "\\'")
        safe_location = data['location'].replace("'", "\\'")
        
        ts_content += f"  '{safe_name}': {{\n"
        ts_content += f"    round: {data['round']},\n"
        ts_content += f"    name: '{safe_name}',\n"
        ts_content += f"    country: '{safe_country}',\n"
        ts_content += f"    location: '{safe_location}',\n"
        ts_content += f"    svgPath: '{data['svgPath']}'\n"
        ts_content += f"  }},\n"
    
    ts_content += "};\n\n"
    ts_content += "export default circuitLayouts;\n"
    
    # Write to file
    output_file.parent.mkdir(parents=True, exist_ok=True)
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(ts_content)
    
    logger.info(f"✓ Saved {len(circuits)} circuit layouts")

if __name__ == "__main__":
    # Generate circuits
    circuits = generate_all_circuits(2021)
    
    # Save to TypeScript file
    output_file = Path(__file__).parent.parent / 'frontend' / 'src' / 'lib' / 'circuitLayouts.ts'
    save_circuits_to_typescript(circuits, output_file)
    
    logger.info(f"\n{'=' * 80}")
    logger.info(f"✓ COMPLETE! Generated {len(circuits)} circuit layouts")
    logger.info(f"{'=' * 80}")
