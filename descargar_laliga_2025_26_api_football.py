#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Descarga completa de datos de LaLiga 2025/26 desde API-Football.

Genera:
    data/laliga_2025_26.json

No guarda la API key en el archivo ni en el proyecto.
Al ejecutarlo, la solicita de forma segura.

IMPORTANTE:
- LaLiga = league ID 140
- API-Football representa la temporada 2025/26 como season=2025.
- El JSON conserva la respuesta de API-Football y añade una capa "meta"
  para facilitar el trabajo posterior.
"""

import json
import time
from datetime import datetime, timezone
from getpass import getpass
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

BASE_URL = "https://v3.football.api-sports.io"
LEAGUE_ID = 140
SEASON = 2025
TIMEZONE = "Europe/Madrid"
OUTPUT = Path("data/laliga_2025_26.json")

def api_get(path, params, api_key):
    query = urlencode(params)
    url = f"{BASE_URL}/{path}?{query}"
    req = Request(
        url,
        headers={
            "x-apisports-key": api_key,
            "Accept": "application/json",
            "User-Agent": "LaLiga-Predicciones-Downloader/1.0",
        },
        method="GET",
    )
    try:
        with urlopen(req, timeout=60) as response:
            raw = response.read()
            data = json.loads(raw.decode("utf-8"))
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"API-Football HTTP {e.code}: {body[:1000]}") from e
    except URLError as e:
        raise RuntimeError(f"No se pudo conectar con API-Football: {e}") from e

    if data.get("errors"):
        raise RuntimeError(f"API-Football devolvió errores: {data['errors']}")
    return data

def pause():
    # Pequeña pausa para evitar ráfagas innecesarias.
    time.sleep(0.25)

def main():
    print("=" * 68)
    print("  LaLiga 2025/26 — descarga desde API-Football")
    print("=" * 68)
    print(f"Competición: LaLiga (ID {LEAGUE_ID})")
    print(f"Temporada:   {SEASON} (2025/26)")
    print(f"Salida:      {OUTPUT}")
    print()

    api_key = getpass("Introduce tu API key de API-Football: ").strip()
    if not api_key:
        raise SystemExit("No se ha introducido ninguna API key.")

    print("\n1/6  Comprobando cobertura de la competición...")
    league = api_get("leagues", {
        "id": LEAGUE_ID,
        "season": SEASON
    }, api_key)

    coverage = {}
    try:
        coverage = league["response"][0]["seasons"][0]["coverage"]
    except (KeyError, IndexError, TypeError):
        pass

    print("     Cobertura:", json.dumps(coverage, ensure_ascii=False))

    print("2/6  Descargando información de los equipos...")
    teams = api_get("teams", {
        "league": LEAGUE_ID,
        "season": SEASON
    }, api_key)
    pause()

    print("3/6  Descargando TODOS los partidos de la temporada...")
    fixtures = api_get("fixtures", {
        "league": LEAGUE_ID,
        "season": SEASON,
        "timezone": TIMEZONE
    }, api_key)
    pause()

    fixture_rows = fixtures.get("response", [])
    print(f"     Partidos recibidos: {len(fixture_rows)}")

    print("4/6  Descargando clasificación final...")
    standings = api_get("standings", {
        "league": LEAGUE_ID,
        "season": SEASON
    }, api_key)
    pause()

    print("5/6  Descargando máximos goleadores...")
    top_scorers = api_get("players/topscorers", {
        "league": LEAGUE_ID,
        "season": SEASON,
        "page": 1
    }, api_key)
    pause()

    # Este bloque obtiene además los detalles por partido cuando la API los
    # ofrece. API-Football documenta que /fixtures?id=... integra eventos,
    # alineaciones, estadísticas y estadísticas de jugadores. Para no exceder
    # la cuota del plan, se hace por lotes de hasta 20 IDs.
    details = []
    fixture_ids = [
        str(x["fixture"]["id"])
        for x in fixture_rows
        if x.get("fixture", {}).get("id") is not None
    ]

    details_enabled = all([
        coverage.get("fixtures", {}).get("events", True),
        coverage.get("fixtures", {}).get("lineups", True),
        coverage.get("fixtures", {}).get("statistics_fixtures", True),
        coverage.get("fixtures", {}).get("statistics_players", True),
    ])

    if details_enabled:
        print("6/6  Descargando detalles de partidos en lotes de 20...")
        for i in range(0, len(fixture_ids), 20):
            batch = fixture_ids[i:i+20]
            ids = "-".join(batch)
            data = api_get("fixtures", {"ids": ids}, api_key)
            details.extend(data.get("response", []))
            print(f"     {min(i+20, len(fixture_ids))}/{len(fixture_ids)} partidos")
            pause()
    else:
        print("6/6  La cobertura de detalles no está completa; se conserva la")
        print("     respuesta principal de fixtures sin inventar campos.")

    output = {
        "meta": {
            "source": "API-Football / API-SPORTS",
            "league_id": LEAGUE_ID,
            "league": "LaLiga",
            "country": "Spain",
            "season": SEASON,
            "season_label": "2025/26",
            "timezone": TIMEZONE,
            "downloaded_at": datetime.now(timezone.utc).isoformat(),
            "fixture_count": len(fixture_rows),
            "detail_count": len(details),
            "note": "Datos conservados en estructura API-Football para posterior conversión a CSV."
        },
        "league": league,
        "teams": teams,
        "fixtures": fixtures,
        "standings": standings,
        "top_scorers": top_scorers,
        "fixture_details": details,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUTPUT.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    tmp.replace(OUTPUT)

    print()
    print("=" * 68)
    print("DESCARGA TERMINADA")
    print("=" * 68)
    print(f"Archivo: {OUTPUT.resolve()}")
    print(f"Partidos: {len(fixture_rows)}")
    print(f"Detalles: {len(details)}")
    if len(fixture_rows) != 380:
        print("AVISO: API-Football no ha devuelto exactamente 380 partidos.")
        print("Revisa la respuesta antes de convertir a CSV.")
    else:
        print("OK: se han recibido los 380 partidos de la temporada.")
    print()

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nProceso cancelado.")
    except Exception as e:
        print(f"\nERROR: {e}")
        raise
