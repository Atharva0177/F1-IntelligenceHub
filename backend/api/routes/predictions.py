"""
Race Prediction API
===================
Trains ML / DL models on historical race-result data and predicts the outcome
of any race in the database.

Models available:
    gb  – Gradient Boosting Regressor  (scikit-learn, tree-based ML)
    rf  – Random Forest Regressor      (scikit-learn, tree-based ML)
    nn  – MLP Regressor                (scikit-learn, deep learning)
    xgb – XGBoost Regressor            (extreme gradient boosting)

Features used (17 total):
  grid_pos            – grid position (start position on race day)
  recent_avg          – rolling 5-race average finish position per driver  (shift-1)
  season_pts          – cumulative championship points before this race     (shift-1)
  circuit_avg         – historical average finish at this specific circuit  (shift-1)
  constructor_pts     – team cumulative season pts before race              (shift-1)
  qual_position       – official qualifying classification position
  gap_to_pole         – driver's best session time minus pole time (seconds)
  qual_time_zscore    – z-score of best qual time within the race session
  has_q3              – 1 if driver reached Q3 (top-10 in qualifying)
  circuit_wins        – career wins at this specific circuit                (shift-1)
  podium_rate_5       – rolling 5-race podium rate                          (shift-1)
  recent_team_avg     – team's rolling 3-race best finish avg               (shift-1)
  positions_gained_avg– avg grid-to-finish delta rolling 5                  (shift-1)
  fp2_pace_gap        – FP2 pace gap to session fastest (seconds; weekend form)
  dnf_rate            – rolling career DNF rate before this race            (shift-1)
  avg_pit_stops       – rolling 5-race avg pit-stop count                   (shift-1)
  rainfall            – race held in wet conditions (1=wet, 0=dry)

Note: qualifying features and FP2 pace are known before the race starts so they
do NOT need shift-1 de-leaking; they are legitimate pre-race inputs.
"""

import warnings
warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from database.config import get_db

from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_absolute_error
from xgboost import XGBRegressor

router = APIRouter()

FEATURE_COLS  = [
    "grid_pos",              # start position on race day
    "recent_avg",            # rolling 5-race avg finish position (shift-1)
    "season_pts",            # cumulative driver season pts before race (shift-1)
    "circuit_avg",           # career avg finish at this circuit (shift-1)
    "constructor_pts",       # team cumulative season pts before race (shift-1)
    "qual_position",         # qualifying classification position
    "gap_to_pole",           # time behind pole sitter (seconds)
    "qual_time_zscore",      # z-score of best qual time within the race session
    "has_q3",                # 1 if driver reached Q3 (top-10 in qualifying)
    "circuit_wins",          # career wins at this specific circuit (shift-1)
    "podium_rate_5",         # rolling 5-race podium rate (shift-1)
    "recent_team_avg",       # team's rolling 3-race best finish avg (shift-1)
    "positions_gained_avg",  # avg grid-to-finish positions gained rolling 5 (shift-1)
    "fp2_pace_gap",          # FP2 practice pace gap to session best  (weekend form)
    "dnf_rate",              # rolling career DNF rate before this race (shift-1)
    "avg_pit_stops",         # rolling 5-race avg pit-stop count (shift-1)
    "rainfall",              # race held in wet conditions (1=wet, 0=dry)
]
FEATURE_NAMES = [
    "Grid Position",
    "Recent Form (avg last 5)",
    "Season Points",
    "Circuit Avg Finish",
    "Constructor Season Pts",
    "Qualifying Position",
    "Gap to Pole (s)",
    "Qual Time Z-Score",
    "Reached Q3",
    "Circuit Wins",
    "Podium Rate (last 5)",
    "Team Recent Avg Finish",
    "Avg Positions Gained",
    "FP2 Pace Gap (s)",
    "DNF Rate",
    "Avg Pit Stops",
    "Rainfall",
]

# ─────────────────────────────────────────────────────────────────────────────
# Data helpers
# ─────────────────────────────────────────────────────────────────────────────

def _load_qualifying(db: Session) -> pd.DataFrame:
    """Load qualifying data: best session time and derived gap-to-pole per driver per race."""
    sql = text("""
        SELECT
            q.race_id,
            d.code                              AS driver_code,
            q.position                          AS qual_position,
            LEAST(
                COALESCE(q.q3_time, 999),
                COALESCE(q.q2_time, 999),
                COALESCE(q.q1_time, 999)
            )                                   AS best_qual_time,
            CASE WHEN q.q3_time IS NOT NULL THEN 1 ELSE 0 END AS has_q3
        FROM qualifying q
        JOIN drivers d ON d.id = q.driver_id
        WHERE LEAST(
            COALESCE(q.q3_time, 999),
            COALESCE(q.q2_time, 999),
            COALESCE(q.q1_time, 999)
        ) < 999
    """)
    rows = db.execute(sql).mappings().all()
    if not rows:
        return pd.DataFrame()

    qdf = pd.DataFrame([dict(r) for r in rows])
    qdf["best_qual_time"] = pd.to_numeric(qdf["best_qual_time"], errors="coerce")
    qdf["qual_position"]  = pd.to_numeric(qdf["qual_position"],  errors="coerce")

    # Gap to pole = driver's best time minus the fastest time in that race
    pole_times = (
        qdf.groupby("race_id")["best_qual_time"]
           .min()
           .rename("pole_time")
    )
    qdf = qdf.join(pole_times, on="race_id")
    qdf["gap_to_pole"] = (qdf["best_qual_time"] - qdf["pole_time"]).clip(lower=0.0)
    qdf.drop(columns=["pole_time"], inplace=True)

    return qdf


def _load_results(db: Session) -> pd.DataFrame:
    """Load all non-sprint race results with race/driver metadata."""
    sql = text("""
        SELECT
            r.id                            AS race_id,
            r.circuit_id,
            r.date                          AS race_date,
            r.season_id,
            r.round_number,
            r.name                          AS race_name,
            res.driver_id,
            res.position,
            COALESCE(res.grid_position, 10) AS grid_position,
            COALESCE(res.points, 0)         AS points,
            res.team_id,
            t.name                          AS team_name,
            d.code                          AS driver_code
        FROM results res
        JOIN races   r ON r.id  = res.race_id
        JOIN drivers d ON d.id  = res.driver_id
        JOIN teams   t ON t.id  = res.team_id
        WHERE res.is_sprint = false
        ORDER BY r.date, r.id, res.position
    """)
    rows = db.execute(sql).mappings().all()
    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame([dict(r) for r in rows])
    df["race_date"]      = pd.to_datetime(df["race_date"])
    df["position"]       = pd.to_numeric(df["position"],       errors="coerce")
    df["grid_position"]  = pd.to_numeric(df["grid_position"],  errors="coerce").fillna(10.0)
    df["points"]         = pd.to_numeric(df["points"],         errors="coerce").fillna(0.0)

    df = df.sort_values(["race_date", "race_id", "position"]).reset_index(drop=True)
    return df


def _load_pre_race_candidates(db: Session, race_id: int) -> pd.DataFrame:
    """Build prediction rows for races that have qualifying data but no race result rows yet."""
    sql = text("""
        WITH target_race AS (
            SELECT
                r.id,
                r.circuit_id,
                r.date AS race_date,
                r.season_id,
                r.round_number,
                r.name AS race_name
            FROM races r
            WHERE r.id = :race_id
        ),
        latest_team AS (
            SELECT DISTINCT ON (res.driver_id)
                res.driver_id,
                res.team_id
            FROM results res
            JOIN races rr ON rr.id = res.race_id
            JOIN target_race tr ON TRUE
            WHERE rr.date <= tr.race_date
            ORDER BY res.driver_id, rr.date DESC, rr.id DESC, res.is_sprint ASC
        )
        SELECT
            tr.id                           AS race_id,
            tr.circuit_id,
            tr.race_date,
            tr.season_id,
            tr.round_number,
            tr.race_name,
            q.driver_id,
            NULL::numeric                   AS position,
            COALESCE(q.position, 10)        AS grid_position,
            0.0                             AS points,
            lt.team_id,
            t.name                          AS team_name,
            d.code                          AS driver_code
        FROM target_race tr
        JOIN qualifying q ON q.race_id = tr.id
        JOIN drivers d ON d.id = q.driver_id
        LEFT JOIN latest_team lt ON lt.driver_id = q.driver_id
        LEFT JOIN teams t ON t.id = lt.team_id
        ORDER BY COALESCE(q.position, 999), d.code
    """)
    rows = db.execute(sql, {"race_id": race_id}).mappings().all()
    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame([dict(r) for r in rows])
    df["race_date"] = pd.to_datetime(df["race_date"])
    df["position"] = pd.to_numeric(df["position"], errors="coerce")
    df["grid_position"] = pd.to_numeric(df["grid_position"], errors="coerce").fillna(10.0)
    df["points"] = pd.to_numeric(df["points"], errors="coerce").fillna(0.0)
    df = df.sort_values(["race_date", "race_id", "grid_position", "driver_code"]).reset_index(drop=True)
    return df


def _load_fp2_pace(db: Session) -> pd.DataFrame:
    """
    Compute each driver's FP2 pace gap to the session fastest (seconds) for
    every race weekend that has FP2 lap-time data.

    Method: 25th-percentile of clean FP2 laps per driver minus the overall
    session minimum.  Using P25 (rather than median) rewards the fast laps
    that drivers set during representative runs, while discarding out-laps and
    traffic-affected laps.  Requires at least 3 clean laps to be included.
    """
    sql = text("""
        WITH fp2_clean AS (
            SELECT
                s.race_id,
                d.code                                                             AS driver_code,
                PERCENTILE_CONT(0.25) WITHIN GROUP (
                    ORDER BY lt.lap_time_seconds
                )                                                                  AS p25_time
            FROM lap_times lt
            JOIN sessions s ON s.id = lt.session_id
            JOIN drivers  d ON d.id = lt.driver_id
            WHERE s.session_type = 'FP2'
              AND lt.is_pit_out_lap = false
              AND lt.is_pit_in_lap  = false
              AND lt.lap_time_seconds IS NOT NULL
              AND lt.lap_time_seconds > 0
            GROUP BY s.race_id, d.code
            HAVING COUNT(*) >= 3
        ),
        fp2_min AS (
            SELECT race_id, MIN(p25_time) AS session_best
            FROM fp2_clean
            GROUP BY race_id
        )
        SELECT
            c.race_id,
            c.driver_code,
            ROUND(CAST(c.p25_time - m.session_best AS numeric), 3) AS fp2_pace_gap
        FROM fp2_clean c
        JOIN fp2_min   m ON m.race_id = c.race_id
    """)
    rows = db.execute(sql).mappings().all()
    if not rows:
        return pd.DataFrame(columns=["race_id", "driver_code", "fp2_pace_gap"])
    fp2_df = pd.DataFrame([dict(r) for r in rows])
    fp2_df["fp2_pace_gap"] = pd.to_numeric(fp2_df["fp2_pace_gap"], errors="coerce")
    return fp2_df


# DNF-causing statuses
_DNF_STATUSES = (
    'Retired', 'Collision', 'Collision damage', 'Accident',
    'Engine', 'Gearbox', 'Brakes', 'Power Unit', 'Electrical',
    'Hydraulics', 'Suspension', 'Did not start', 'Disqualified',
    'Mechanical', 'Transmission', 'Wheel', 'Overheating',
    'Damage', 'Water pressure', 'Water leak', 'Oil leak',
    'Fuel pressure', 'Undertray', 'Puncture', 'Turbo',
    'Electronics', 'Spun off', 'Withdrew',
)


def _load_dnf_rates(db: Session) -> pd.DataFrame:
    """
    Compute each driver's rolling DNF rate (career, shift-1) before each race.
    A DNF is any non-finish: mechanical failures, collisions, etc.
    Includes a 20-race rolling window to stay current with driver habits.
    """
    dnf_in = ", ".join(f"'{s}'" for s in _DNF_STATUSES)
    sql = text(f"""
        SELECT
            res.driver_id,
            d.code                                    AS driver_code,
            r.id                                      AS race_id,
            r.date                                    AS race_date,
            CASE WHEN res.status IN ({dnf_in}) THEN 1 ELSE 0 END AS is_dnf
        FROM results res
        JOIN races   r ON r.id = res.race_id
        JOIN drivers d ON d.id = res.driver_id
        WHERE res.is_sprint = false
        ORDER BY d.code, r.date
    """)
    rows = db.execute(sql).mappings().all()
    if not rows:
        return pd.DataFrame(columns=["race_id", "driver_code", "dnf_rate"])

    df = pd.DataFrame([dict(r) for r in rows])
    df["race_date"] = pd.to_datetime(df["race_date"])
    df = df.sort_values(["driver_code", "race_date"])

    # Rolling 20-race career DNF rate (shift-1 to avoid leakage)
    df["dnf_rate"] = (
        df.groupby("driver_code")["is_dnf"]
          .transform(lambda s: s.shift(1).rolling(20, min_periods=1).mean())
          .fillna(0.07)           # global average ~7% if no prior data
    )
    return df[["race_id", "driver_code", "dnf_rate"]]


def _load_pit_counts(db: Session) -> pd.DataFrame:
    """
    Compute rolling 5-race average pit-stop count per driver (shift-1).
    Uses is_pit_in_lap from Race session lap_times.
    """
    sql = text("""
        SELECT
            s.race_id,
            d.code                          AS driver_code,
            r.date                          AS race_date,
            COUNT(CASE WHEN lt.is_pit_in_lap THEN 1 END) AS pit_count
        FROM lap_times lt
        JOIN sessions s ON s.id  = lt.session_id
        JOIN drivers  d ON d.id  = lt.driver_id
        JOIN races    r ON r.id  = s.race_id
        WHERE s.session_type = 'Race'
        GROUP BY s.race_id, d.code, r.date
        ORDER BY d.code, r.date
    """)
    rows = db.execute(sql).mappings().all()
    if not rows:
        return pd.DataFrame(columns=["race_id", "driver_code", "avg_pit_stops"])

    df = pd.DataFrame([dict(r) for r in rows])
    df["race_date"]  = pd.to_datetime(df["race_date"])
    df["pit_count"]  = pd.to_numeric(df["pit_count"], errors="coerce").fillna(2.0)
    df = df.sort_values(["driver_code", "race_date"])

    df["avg_pit_stops"] = (
        df.groupby("driver_code")["pit_count"]
          .transform(lambda s: s.shift(1).rolling(5, min_periods=1).mean())
          .fillna(2.0)           # F1 average is ~2 stops
    )
    return df[["race_id", "driver_code", "avg_pit_stops"]]


def _load_race_weather(db: Session) -> pd.DataFrame:
    """
    Load race weather from the race_weather table (populated by the
    download_fastf1_weather.py script).  Returns a DataFrame with:
      race_id, rainfall (0/1), air_temp_avg, track_temp_avg
    Falls back to empty DataFrame — all races will then use the default
    encoding of 0 (dry) until weather data is downloaded.
    """
    sql = text("""
        SELECT race_id,
               CASE WHEN rainfall THEN 1 ELSE 0 END AS rainfall,
               COALESCE(air_temp_avg,   25.0)        AS air_temp_avg,
               COALESCE(track_temp_avg, 35.0)        AS track_temp_avg
        FROM race_weather
    """)
    try:
        rows = db.execute(sql).mappings().all()
    except Exception:
        return pd.DataFrame(columns=["race_id", "rainfall", "air_temp_avg", "track_temp_avg"])
    if not rows:
        return pd.DataFrame(columns=["race_id", "rainfall", "air_temp_avg", "track_temp_avg"])
    weather_df = pd.DataFrame([dict(r) for r in rows])
    weather_df["rainfall"] = weather_df["rainfall"].fillna(0).astype(int)
    return weather_df


def _engineer_features(
    df: pd.DataFrame,
    qual_df: pd.DataFrame = None,
    fp2_df: pd.DataFrame = None,
    dnf_df: pd.DataFrame = None,
    pit_df: pd.DataFrame = None,
    weather_df: pd.DataFrame = None,
) -> pd.DataFrame:
    """
    Add feature columns to the *sorted* dataframe.
    Rolling race-result features are shifted by 1 to prevent leakage.
    Qualifying, FP2 pace, and other pre-race features are merged without shifting.
    """
    df = df.copy()
    df["pos_filled"] = df["position"].fillna(20.0)
    df["grid_pos"]   = df["grid_position"].fillna(10.0).astype(float)

    # Binary targets computed upfront so they can feed into lag features below
    df["is_win"]    = (df["position"] == 1).astype(int)
    df["is_podium"] = (df["position"] <= 3).astype(int)

    # Rolling 5-race average finish per driver (shift 1 = exclude current race)
    df["recent_avg"] = (
        df.groupby("driver_code")["pos_filled"]
          .transform(lambda s: s.shift(1).rolling(5, min_periods=1).mean())
          .fillna(10.0)
    )

    # Rolling 5-race podium hit-rate per driver
    df["podium_rate_5"] = (
        df.groupby("driver_code")["is_podium"]
          .transform(lambda s: s.shift(1).rolling(5, min_periods=1).mean())
          .fillna(0.0)
    )

    # Career wins at this specific circuit
    df["circuit_wins"] = (
        df.groupby(["driver_code", "circuit_id"])["is_win"]
          .transform(lambda s: s.shift(1).cumsum())
          .fillna(0.0)
    )

    # Average positions gained/lost from grid to finish (positive = gained)
    df["pos_gained"] = df["grid_pos"] - df["pos_filled"]
    df["positions_gained_avg"] = (
        df.groupby("driver_code")["pos_gained"]
          .transform(lambda s: s.shift(1).rolling(5, min_periods=1).mean())
          .fillna(0.0)
    )
    df.drop(columns=["pos_gained"], inplace=True)

    # Cumulative season points before each race
    df["season_pts"] = (
        df.groupby(["driver_code", "season_id"])["points"]
          .transform(lambda s: s.shift(1).cumsum())
          .fillna(0.0)
    )

    # Historical circuit average finish per driver
    df["circuit_avg"] = (
        df.groupby(["driver_code", "circuit_id"])["pos_filled"]
          .transform(lambda s: s.shift(1).expanding().mean())
          .fillna(10.0)
    )

    # Constructor season points (both drivers combined, before this race)
    team_race_pts = (
        df.groupby(["team_id", "race_id"])["points"]
          .sum()
          .reset_index(name="team_race_pts")
    )
    df = df.merge(team_race_pts, on=["team_id", "race_id"], how="left")
    df["constructor_pts"] = (
        df.groupby(["team_id", "season_id"])["team_race_pts"]
          .transform(lambda s: s.shift(1).cumsum())
          .fillna(0.0)
    )

    # Team's rolling 3-race best finish (captures recent car pace trend)
    team_best = (
        df.groupby(["team_id", "race_id"])["pos_filled"]
          .min()
          .reset_index(name="team_best_pos")
    )
    df = df.merge(team_best, on=["team_id", "race_id"], how="left")
    df["recent_team_avg"] = (
        df.groupby("team_id")["team_best_pos"]
          .transform(lambda s: s.shift(1).rolling(3, min_periods=1).mean())
          .fillna(10.0)
    )
    df.drop(columns=["team_best_pos"], inplace=True)

    # Qualifying features (merge on race_id + driver_code)
    if qual_df is not None and not qual_df.empty:
        merge_cols = ["race_id", "driver_code", "qual_position", "gap_to_pole", "best_qual_time", "has_q3"]
        df = df.merge(qual_df[merge_cols], on=["race_id", "driver_code"], how="left")
        df["qual_position"] = df["qual_position"].fillna(15.0)
        df["gap_to_pole"]   = df["gap_to_pole"].fillna(3.0)
        df["has_q3"]        = df["has_q3"].fillna(0).astype(int)
        # Normalise best_qual_time within each race (z-score) so the absolute
        # lap time (which varies 25+ s across circuits) doesn't dominate the model.
        # Races with no qualifying data will have NaN → z-score falls back to 0.
        race_mean = df.groupby("race_id")["best_qual_time"].transform("mean")
        race_std  = df.groupby("race_id")["best_qual_time"].transform("std").fillna(1.0).replace(0, 1.0)
        df["qual_time_zscore"] = ((df["best_qual_time"] - race_mean) / race_std).fillna(0.0)
        df.drop(columns=["best_qual_time"], inplace=True)
    else:
        df["qual_position"]    = 10.0
        df["gap_to_pole"]      = 1.5
        df["has_q3"]           = 0
        df["qual_time_zscore"] = 0.0

    # FP2 practice pace gap (seconds behind the quickest car in that session)
    if fp2_df is not None and not fp2_df.empty:
        df = df.merge(fp2_df[["race_id", "driver_code", "fp2_pace_gap"]],
                      on=["race_id", "driver_code"], how="left")
        df["fp2_pace_gap"] = df["fp2_pace_gap"].fillna(3.0)   # ~median midfield gap
    else:
        df["fp2_pace_gap"] = 3.0

    # Driver career DNF rate (shift-1: excludes current race)
    if dnf_df is not None and not dnf_df.empty:
        df = df.merge(dnf_df[["race_id", "driver_code", "dnf_rate"]],
                      on=["race_id", "driver_code"], how="left")
        df["dnf_rate"] = df["dnf_rate"].fillna(0.07)
    else:
        df["dnf_rate"] = 0.07

    # Rolling 5-race avg pit-stop count (shift-1: excludes current race)
    if pit_df is not None and not pit_df.empty:
        df = df.merge(pit_df[["race_id", "driver_code", "avg_pit_stops"]],
                      on=["race_id", "driver_code"], how="left")
        df["avg_pit_stops"] = df["avg_pit_stops"].fillna(2.0)
    else:
        df["avg_pit_stops"] = 2.0

    # Race weather: rainfall flag (0=dry, 1=wet)
    # This feature is the same for all drivers in a race — merged on race_id only.
    if weather_df is not None and not weather_df.empty:
        df = df.merge(weather_df[["race_id", "rainfall"]], on="race_id", how="left")
        df["rainfall"] = df["rainfall"].fillna(0).astype(int)
    else:
        df["rainfall"] = 0

    return df


# ─────────────────────────────────────────────────────────────────────────────
# Model factory
# ─────────────────────────────────────────────────────────────────────────────

def _make_model(model_type: str):
    if model_type == "nn":
        # Pipeline with StandardScaler to normalise features before feeding to MLP.
        return Pipeline([
            ("scaler", StandardScaler()),
            ("reg", MLPRegressor(
                hidden_layer_sizes=(128, 64, 32),
                activation="relu",
                solver="adam",
                learning_rate_init=0.001,
                alpha=0.001,          # L2 regularisation
                batch_size=64,
                max_iter=1000,
                random_state=42,
                early_stopping=True,
                validation_fraction=0.15,
                n_iter_no_change=25,
                tol=1e-5,
            )),
        ])
    elif model_type == "xgb":
        return XGBRegressor(
            n_estimators=500,
            max_depth=5,
            learning_rate=0.03,
            subsample=0.8,
            colsample_bytree=0.75,
            min_child_weight=2,
            gamma=0.05,
            reg_alpha=0.1,
            reg_lambda=1.0,
            random_state=42,
            n_jobs=-1,
            objective="reg:squarederror",
            eval_metric="mae",
            verbosity=0,
        )
    elif model_type == "rf":
        return RandomForestRegressor(
            n_estimators=400, max_depth=9, min_samples_leaf=2,
            random_state=42, n_jobs=-1,
        )
    else:  # "gb" – default
        return GradientBoostingRegressor(
            n_estimators=300, max_depth=4, learning_rate=0.05,
            subsample=0.8, random_state=42,
        )


def _get_feature_importance(model, model_type: str):
    """Extract feature importances (tree-based models only)."""
    try:
        estimator = model.named_steps.get("reg", model) if hasattr(model, "named_steps") else model
        if hasattr(estimator, "feature_importances_"):
            return [
                {"feature": name, "importance": round(float(imp), 4)}
                for name, imp in sorted(
                    zip(FEATURE_NAMES, estimator.feature_importances_),
                    key=lambda x: -x[1],
                )
            ]
    except Exception:
        pass
    return []


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

MODEL_META = {
    "gb": {
        "name": "Gradient Boosting",
        "label": "ML — Gradient Boosting",
        "description": (
            "Sequentially builds 300 shallow decision trees where each tree corrects "
            "the errors of its predecessor (gradient descent in function space). "
            "Excellent on structured tabular data — the most common winner in competitive ML competitions."
        ),
    },
    "rf": {
        "name": "Random Forest",
        "label": "ML — Random Forest",
        "description": (
            "Parallel ensemble of 300 randomised decision trees with majority-vote aggregation. "
            "Naturally resistant to overfitting and fast to train. "
            "Handles missing values and feature correlation well."
        ),
    },
    "nn": {
        "name": "Neural Network",
        "label": "DL — MLP Neural Network",
        "description": (
            "Multi-layer perceptron with three hidden layers (128 → 64 → 32 neurons), "
            "ReLU activations, Adam optimisation, and L2 regularisation. "
            "Trained with class-balanced sample weights and early stopping. "
            "Captures complex non-linear interactions between race features."
        ),
    },
    "xgb": {
        "name": "XGBoost",
        "label": "ML — XGBoost",
        "description": (
            "Extreme Gradient Boosting with 400 trees and second-order gradient optimisation. "
            "Industry-standard for tabular prediction tasks — combines regularisation (L1+L2), "
            "column sub-sampling, and min-child-weight pruning to prevent overfitting. "
            "Consistently top-ranked in structured-data ML benchmarks."
        ),
    },
}


@router.get("/races")
async def list_predictable_races(db: Session = Depends(get_db)):
    """List races that can be predicted from race results or pre-race qualifying data."""
    sql = text("""
        SELECT
            r.id, r.name, r.date, r.round_number,
            s.year,
            c.country, c.location,
            COUNT(DISTINCT race_res.id) AS race_result_count,
            COUNT(DISTINCT q.id)        AS qualifying_count
        FROM races r
        JOIN seasons  s  ON s.id = r.season_id
        JOIN circuits c  ON c.id = r.circuit_id
        LEFT JOIN results race_res ON race_res.race_id = r.id AND race_res.is_sprint = false
        LEFT JOIN qualifying q ON q.race_id = r.id
        GROUP BY r.id, r.name, r.date, r.round_number, s.year, c.country, c.location
        HAVING COUNT(DISTINCT race_res.id) > 0 OR COUNT(DISTINCT q.id) > 0
        ORDER BY r.date DESC
        LIMIT 60
    """)
    rows = db.execute(sql).mappings().all()
    return [
        {
            "id":          r["id"],
            "name":        r["name"],
            "date":        str(r["date"]),
            "round":       r["round_number"],
            "year":        r["year"],
            "country":     r["country"],
            "location":    r["location"],
            "has_results": r["race_result_count"] > 0,
            "has_prerace_data": r["qualifying_count"] > 0,
        }
        for r in rows
    ]


@router.get("/race/{race_id}")
async def predict_race(
    race_id: int,
    model_type: str = Query("gb", description="Model: 'gb' (Gradient Boosting) | 'rf' (Random Forest) | 'nn' (Neural Network)"),
    db: Session = Depends(get_db),
):
    """
    Train a model on all races *before* `race_id` and predict its outcome.
    Returns a projected finishing order per driver plus feature importances.
    If the race already has results, 'actual_position' is included for validation.
    """
    # 1. Load + engineer features ─────────────────────────────────────────────
    df_raw     = _load_results(db)
    qual_df    = _load_qualifying(db)
    fp2_df     = _load_fp2_pace(db)
    dnf_df     = _load_dnf_rates(db)
    pit_df     = _load_pit_counts(db)
    weather_df = _load_race_weather(db)
    if df_raw.empty:
        raise HTTPException(400, "No race result data in database")

    df = _engineer_features(df_raw, qual_df, fp2_df, dnf_df, pit_df, weather_df)

    # 2. Train / predict split ─────────────────────────────────────────────────
    train_df = df[df["race_id"] != race_id].dropna(subset=FEATURE_COLS)
    predict_df = df[df["race_id"] == race_id].copy()

    # For races without final race results yet, build driver rows from
    # qualifying so we can still generate pre-race predictions.
    if predict_df.empty:
        pre_race_df = _load_pre_race_candidates(db, race_id)
        if pre_race_df.empty:
            raise HTTPException(404, "Race not found or no competitor data (need qualifying or race results)")

        combined_df = pd.concat([df_raw, pre_race_df], ignore_index=True, sort=False)
        combined_df["race_date"] = pd.to_datetime(combined_df["race_date"])
        combined_df["position"] = pd.to_numeric(combined_df["position"], errors="coerce")
        combined_df["grid_position"] = pd.to_numeric(combined_df["grid_position"], errors="coerce").fillna(10.0)
        combined_df["points"] = pd.to_numeric(combined_df["points"], errors="coerce").fillna(0.0)
        combined_df = combined_df.sort_values(
            ["race_date", "race_id", "position"],
            na_position="last",
        ).reset_index(drop=True)

        df = _engineer_features(combined_df, qual_df, fp2_df, dnf_df, pit_df, weather_df)
        train_df = df[df["race_id"] != race_id].dropna(subset=FEATURE_COLS)
        predict_df = df[df["race_id"] == race_id].copy()

    if len(train_df) < 80:
        raise HTTPException(
            400,
            f"Only {len(train_df)} training samples – need at least 80 rows of historical data",
        )

    X_train = train_df[FEATURE_COLS].fillna(10.0).values.astype(float)
    y_finish = train_df["pos_filled"].values.astype(float)
    X_pred = predict_df[FEATURE_COLS].fillna(10.0).values.astype(float)

    # 3. Train direct finishing-position model ─────────────────────────────────
    try:
        model = _make_model(model_type)
        sample_weight = np.clip(25.0 - y_finish, 1.0, None)
        if model_type == "nn":
            model.fit(X_train, y_finish)
        else:
            model.fit(X_train, y_finish, sample_weight=sample_weight)
    except Exception as exc:
        raise HTTPException(500, f"Model training failed: {exc}")

    # 4. Predict expected finishing position ───────────────────────────────────
    raw_finish_pred = np.asarray(model.predict(X_pred), dtype=float)
    raw_finish_pred = np.clip(raw_finish_pred, 1.0, float(max(len(predict_df), 20)))

    # 5. Backtest using ranked finishing positions ─────────────────────────────
    train_raw_pred = np.asarray(model.predict(X_train), dtype=float)
    train_raw_pred = np.clip(train_raw_pred, 1.0, 20.0)
    train_eval = train_df[["race_id", "driver_code", "pos_filled"]].copy()
    train_eval["predicted_finish"] = train_raw_pred
    train_eval = train_eval.sort_values(["race_id", "predicted_finish", "driver_code"]).reset_index(drop=True)
    train_eval["predicted_position"] = train_eval.groupby("race_id").cumcount() + 1
    backtest_mae = round(
        float(mean_absolute_error(train_eval["pos_filled"], train_eval["predicted_position"])),
        3,
    )
    backtest_exact = round(
        float((train_eval["pos_filled"].astype(int) == train_eval["predicted_position"]).mean()),
        3,
    )

    # 6. Build per-driver results ─────────────────────────────────────────────
    drivers_out = []
    for i, row in enumerate(predict_df.itertuples(index=False)):
        drivers_out.append({
            "driver_code":        str(row.driver_code),
            "team_name":          str(row.team_name) if pd.notna(row.team_name) else None,
            "grid_position":      int(row.grid_position) if pd.notna(row.grid_position) else None,
            "qual_position":      int(row.qual_position) if pd.notna(row.qual_position) else None,
            "predicted_finish_value": round(float(raw_finish_pred[i]), 2),
            "gap_to_pole":        round(float(row.gap_to_pole), 3) if pd.notna(row.gap_to_pole) else None,
            "actual_position":    int(row.position) if pd.notna(row.position) else None,
            "features": {
                "recent_avg":           round(float(row.recent_avg),           2),
                "season_pts":           round(float(row.season_pts),           1),
                "circuit_avg":          round(float(row.circuit_avg),          2),
                "constructor_pts":      round(float(row.constructor_pts),      1),
                "qual_position":        int(row.qual_position) if pd.notna(row.qual_position) else None,
                "gap_to_pole":          round(float(row.gap_to_pole),          3) if pd.notna(row.gap_to_pole) else None,
                "circuit_wins":         int(row.circuit_wins),
                "podium_rate_5":        round(float(row.podium_rate_5),        3),
                "recent_team_avg":      round(float(row.recent_team_avg),      2),
                "positions_gained_avg": round(float(row.positions_gained_avg), 2),
                "fp2_pace_gap":         round(float(row.fp2_pace_gap),         3),
                "dnf_rate":             round(float(row.dnf_rate),             4),
                "avg_pit_stops":        round(float(row.avg_pit_stops),        2),
                "rainfall":             int(row.rainfall),
            },
        })

    # Sort by expected finish (lower is better) → assign predicted positions
    drivers_out.sort(
        key=lambda d: (
            d["predicted_finish_value"],
            d["grid_position"] if d["grid_position"] is not None else 999,
            d["driver_code"],
        )
    )
    for i, d in enumerate(drivers_out):
        d["predicted_position"] = i + 1
        d["position_delta"] = (
            d["grid_position"] - d["predicted_position"]
            if d["grid_position"] is not None
            else None
        )

    race_row = predict_df.iloc[0]

    return {
        "race_id":           race_id,
        "race_name":         str(race_row["race_name"]),
        "race_date":         str(race_row["race_date"].date()),
        "model_type":        model_type,
        "model":             MODEL_META.get(model_type, {"name": model_type, "label": model_type, "description": ""}),
        "training_samples":  int(len(train_df)),
        "backtest_mae":      backtest_mae,
        "backtest_accuracy": backtest_exact,
        "drivers":           drivers_out,
        "podium_prediction": drivers_out[:3],
        "winner_prediction": drivers_out[0] if drivers_out else None,
        "feature_importance": _get_feature_importance(model, model_type),
    }


@router.get("/race/{race_id}/simulate")
async def simulate_race_outcomes(
    race_id: int,
    model_type: str = Query("gb", description="Model: 'gb' | 'rf' | 'nn' | 'xgb'"),
    iterations: int = Query(3000, ge=500, le=10000),
    db: Session = Depends(get_db),
):
    """
    Monte Carlo race outcome simulator.

    Inputs are inferred from available pre-race signals:
      - qualifying position / gap to pole
      - long-run pace proxy (FP2 pace gap)
      - degradation proxy (recent team pace + pit profile)
      - pit-stop distributions (avg pit stops)

    Output:
      - per-driver finishing probabilities (P1/P3/P5/P10)
      - expected finishing position
      - full position distribution (P1..Pn)
    """
    # Prepare race-level prediction baseline (same feature pipeline as predict_race)
    df_raw = _load_results(db)
    qual_df = _load_qualifying(db)
    fp2_df = _load_fp2_pace(db)
    dnf_df = _load_dnf_rates(db)
    pit_df = _load_pit_counts(db)
    weather_df = _load_race_weather(db)
    if df_raw.empty:
        raise HTTPException(400, "No race result data in database")

    df = _engineer_features(df_raw, qual_df, fp2_df, dnf_df, pit_df, weather_df)
    train_df = df[df["race_id"] != race_id].dropna(subset=FEATURE_COLS)
    predict_df = df[df["race_id"] == race_id].copy()

    if predict_df.empty:
        pre_race_df = _load_pre_race_candidates(db, race_id)
        if pre_race_df.empty:
            raise HTTPException(404, "Race not found or no competitor data (need qualifying or race results)")

        combined_df = pd.concat([df_raw, pre_race_df], ignore_index=True, sort=False)
        combined_df["race_date"] = pd.to_datetime(combined_df["race_date"])
        combined_df["position"] = pd.to_numeric(combined_df["position"], errors="coerce")
        combined_df["grid_position"] = pd.to_numeric(combined_df["grid_position"], errors="coerce").fillna(10.0)
        combined_df["points"] = pd.to_numeric(combined_df["points"], errors="coerce").fillna(0.0)
        combined_df = combined_df.sort_values(["race_date", "race_id", "position"], na_position="last").reset_index(drop=True)

        df = _engineer_features(combined_df, qual_df, fp2_df, dnf_df, pit_df, weather_df)
        train_df = df[df["race_id"] != race_id].dropna(subset=FEATURE_COLS)
        predict_df = df[df["race_id"] == race_id].copy()

    if len(train_df) < 80:
        raise HTTPException(400, f"Only {len(train_df)} training samples – need at least 80 rows of historical data")

    X_train = train_df[FEATURE_COLS].fillna(10.0).values.astype(float)
    y_finish = train_df["pos_filled"].values.astype(float)
    X_pred = predict_df[FEATURE_COLS].fillna(10.0).values.astype(float)

    try:
        model = _make_model(model_type)
        sample_weight = np.clip(25.0 - y_finish, 1.0, None)
        if model_type == "nn":
            model.fit(X_train, y_finish)
        else:
            model.fit(X_train, y_finish, sample_weight=sample_weight)
    except Exception as exc:
        raise HTTPException(500, f"Model training failed: {exc}")

    raw_finish_pred = np.asarray(model.predict(X_pred), dtype=float)
    raw_finish_pred = np.clip(raw_finish_pred, 1.0, float(max(len(predict_df), 20)))

    drivers = []
    for i, row in enumerate(predict_df.itertuples(index=False)):
        drivers.append({
            "driver_code": str(row.driver_code),
            "team_name": str(row.team_name) if pd.notna(row.team_name) else None,
            "grid_position": int(row.grid_position) if pd.notna(row.grid_position) else None,
            "qual_position": int(row.qual_position) if pd.notna(row.qual_position) else None,
            "mu_finish": float(raw_finish_pred[i]),
            "fp2_pace_gap": float(row.fp2_pace_gap) if pd.notna(row.fp2_pace_gap) else 3.0,
            "dnf_rate": float(row.dnf_rate) if pd.notna(row.dnf_rate) else 0.07,
            "avg_pit_stops": float(row.avg_pit_stops) if pd.notna(row.avg_pit_stops) else 2.0,
            "recent_team_avg": float(row.recent_team_avg) if pd.notna(row.recent_team_avg) else 10.0,
        })

    n = len(drivers)
    if n == 0:
        raise HTTPException(400, "No drivers available for simulation")

    counts = np.zeros((n, n), dtype=np.int32)
    rng = np.random.default_rng(42)

    for _ in range(iterations):
        scored = []
        for idx, d in enumerate(drivers):
            # Base expectation from trained model
            base = d["mu_finish"]

            # Long-run pace variation (larger fp2 gap => larger downside variance)
            pace_sigma = 0.45 + 0.18 * max(0.0, d["fp2_pace_gap"])

            # Degradation / stint risk proxy from pit profile and team trend
            deg_sigma = 0.20 + 0.06 * max(0.0, d["avg_pit_stops"] - 1.0)
            team_penalty = max(0.0, (d["recent_team_avg"] - 7.0) * 0.03)

            # Pit-stop randomness from historical stop profile
            pit_noise = rng.normal(0.0, 0.10 + 0.04 * d["avg_pit_stops"])

            score = base + team_penalty + rng.normal(0.0, pace_sigma) + rng.normal(0.0, deg_sigma) + pit_noise

            # DNF event moves driver to back markers in this simulation run
            dnf_prob = min(max(d["dnf_rate"], 0.0), 0.75) * 0.45
            if rng.random() < dnf_prob:
                score += rng.uniform(8.0, 16.0)

            scored.append((score, idx))

        scored.sort(key=lambda x: x[0])  # lower predicted finish score is better
        for pos, (_, idx) in enumerate(scored):
            counts[idx, pos] += 1

    probs = counts / float(iterations)

    out = []
    for i, d in enumerate(drivers):
        expected_finish = float(np.sum((np.arange(n) + 1) * probs[i]))
        out.append({
            "driver_code": d["driver_code"],
            "team_name": d["team_name"],
            "grid_position": d["grid_position"],
            "qual_position": d["qual_position"],
            "win_probability": round(float(probs[i, 0]), 4),
            "podium_probability": round(float(np.sum(probs[i, : min(3, n)])), 4),
            "top5_probability": round(float(np.sum(probs[i, : min(5, n)])), 4),
            "top10_probability": round(float(np.sum(probs[i, : min(10, n)])), 4),
            "expected_finish": round(expected_finish, 3),
            "position_distribution": [round(float(p), 4) for p in probs[i].tolist()],
        })

    out.sort(key=lambda d: d["expected_finish"])

    race_row = predict_df.iloc[0]
    return {
        "race_id": race_id,
        "race_name": str(race_row["race_name"]),
        "race_date": str(race_row["race_date"].date()),
        "model_type": model_type,
        "iterations": iterations,
        "drivers": out,
    }
