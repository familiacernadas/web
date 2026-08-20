/**
 * ============================================================
 * FAMILIA CERNADAS
 * ACTUALIZADOR AUTOMÁTICO LALIGA 2026/27
 * ============================================================
 *
 * Fuente:
 * API-Football / API-SPORTS
 *
 * IMPORTANTE:
 * La API KEY NO está aquí.
 * Se obtiene desde:
 *
 * process.env.API_FOOTBALL_KEY
 *
 * y será proporcionada por GitHub Actions.
 * ============================================================
 */

import fs from "node:fs/promises";
import path from "node:path";


// ------------------------------------------------------------
// CONFIGURACIÓN
// ------------------------------------------------------------

const API_KEY = process.env.API_FOOTBALL_KEY;

if (!API_KEY) {
    console.error("ERROR: falta API_FOOTBALL_KEY");
    process.exit(1);
}

const API_BASE =
    "https://v3.football.api-sports.io";

const LEAGUE_ID = 140;
const SEASON = 2026;

const DATA_FILE =
    path.resolve("data/laliga_2026_27.json");


// ------------------------------------------------------------
// CONTROL DE PETICIONES
// ------------------------------------------------------------

let requestsThisRun = 0;

// Dejamos margen respecto al límite gratuito.
const MAX_REQUESTS = 90;

// Hasta 20 partidos por petición.
const MAX_DETAIL_FIXTURES = 60;


// ------------------------------------------------------------
// UTILIDADES
// ------------------------------------------------------------

function sleep(ms) {

    return new Promise(resolve =>
        setTimeout(resolve, ms)
    );

}


function number(value, fallback = 0) {

    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : fallback;

}


function percentage(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    const n = Number(
        String(value)
            .replace("%", "")
            .trim()
    );

    return Number.isFinite(n)
        ? n
        : null;
}


function statisticValue(statistics, type) {

    if (!Array.isArray(statistics)) {
        return null;
    }

    const item = statistics.find(
        x =>
            String(x.type).toLowerCase() ===
            String(type).toLowerCase()
    );

    if (!item) {
        return null;
    }

    return item.value;
}


// ------------------------------------------------------------
// LLAMADA API
// ------------------------------------------------------------

async function api(endpoint, params = {}) {

    if (requestsThisRun >= MAX_REQUESTS) {

        throw new Error(
            "Límite de seguridad de peticiones alcanzado."
        );

    }

    const url =
        new URL(API_BASE + endpoint);

    for (
        const [key, value]
        of Object.entries(params)
    ) {

        if (
            value !== undefined &&
            value !== null &&
            value !== ""
        ) {

            url.searchParams.set(
                key,
                value
            );

        }

    }


    requestsThisRun++;


    console.log(
        `API ${requestsThisRun}: ${url.pathname}${url.search}`
    );


    const response =
        await fetch(url, {

            headers: {
                "x-apisports-key": API_KEY
            }

        });


    const text =
        await response.text();


    let json;

    try {

        json =
            JSON.parse(text);

    } catch {

        throw new Error(
            `Respuesta no válida de API (${response.status})`
        );

    }


    if (!response.ok) {

        throw new Error(
            `API ${response.status}: ` +
            JSON.stringify(
                json.errors || json
            )
        );

    }


    if (
        json.errors &&
        Object.keys(json.errors).length
    ) {

        throw new Error(
            "API error: " +
            JSON.stringify(json.errors)
        );

    }


    await sleep(150);


    return json;
}


// ------------------------------------------------------------
// CARGAR JSON EXISTENTE
// ------------------------------------------------------------

async function loadData() {

    try {

        const text =
            await fs.readFile(
                DATA_FILE,
                "utf8"
            );

        const data =
            JSON.parse(text);


        data.matches ||= [];
        data.standings ||= [];
        data.scorers ||= [];
        data.injuries ||= [];
        data.predictionBalance ||= {};
        data.meta ||= {};


        return data;

    } catch {

        return {

            meta: {
                leagueId: LEAGUE_ID,
                season: SEASON,
                league: "LaLiga",
                seasonLabel: "2026/27"
            },

            matches: [],

            standings: [],

            scorers: [],

            injuries: [],

            predictionBalance: {
                total: 0,
                correct: 0,
                accuracy: 0
            }

        };

    }

}


// ------------------------------------------------------------
// NORMALIZAR PARTIDO
// ------------------------------------------------------------

function normalizeFixture(fixture) {

    return {

        id:
            fixture.fixture?.id,

        round:
            fixture.league?.round || null,

        date:
            fixture.fixture?.date || null,

        timestamp:
            fixture.fixture?.timestamp || null,

        status:
            fixture.fixture?.status?.short || null,

        statusLong:
            fixture.fixture?.status?.long || null,

        venue: {

            id:
                fixture.fixture?.venue?.id || null,

            name:
                fixture.fixture?.venue?.name || null,

            city:
                fixture.fixture?.venue?.city || null

        },

        home: {

            id:
                fixture.teams?.home?.id,

            name:
                fixture.teams?.home?.name,

            logo:
                fixture.teams?.home?.logo

        },

        away: {

            id:
                fixture.teams?.away?.id,

            name:
                fixture.teams?.away?.name,

            logo:
                fixture.teams?.away?.logo

        },

        score: {

            halftime:
                fixture.score?.halftime || null,

            fulltime:
                fixture.score?.fulltime || null,

            extratime:
                fixture.score?.extratime || null,

            penalty:
                fixture.score?.penalty || null

        }

    };

}


// ------------------------------------------------------------
// RESULTADO 1/X/2
// ------------------------------------------------------------

function getResult(match) {

    const home =
        match.score?.fulltime?.home;

    const away =
        match.score?.fulltime?.away;


    if (
        home === null ||
        away === null ||
        home === undefined ||
        away === undefined
    ) {

        return null;

    }


    if (home > away) {

        return "1";

    }


    if (home < away) {

        return "2";

    }


    return "X";

}


// ------------------------------------------------------------
// FUSIONAR CALENDARIO
// ------------------------------------------------------------

function mergeFixtures(data, fixtures) {

    const existing =
        new Map(
            data.matches.map(
                match => [
                    match.id,
                    match
                ]
            )
        );


    for (const fixture of fixtures) {

        const normalized =
            normalizeFixture(fixture);


        if (!normalized.id) {
            continue;
        }


        const old =
            existing.get(
                normalized.id
            );


        if (old) {

            const prediction =
                old.prediction;

            const details =
                old.details;


            Object.assign(
                old,
                normalized
            );


            if (prediction) {

                old.prediction =
                    prediction;

            }


            if (details) {

                old.details =
                    details;

            }

        } else {

            existing.set(
                normalized.id,
                normalized
            );

        }

    }


    data.matches =
        Array.from(
            existing.values()
        )
        .sort(
            (a, b) =>
                (a.timestamp || 0) -
                (b.timestamp || 0)
        );

}


// ------------------------------------------------------------
// DETALLES DEL PARTIDO
// ------------------------------------------------------------

function saveFixtureDetails(
    match,
    fixture
) {


    // --------------------------------------------------------
    // ALINEACIONES
    // --------------------------------------------------------

    const lineups = [];


    for (
        const lineup
        of fixture.lineups || []
    ) {

        lineups.push({

            teamId:
                lineup.team?.id || null,

            teamName:
                lineup.team?.name || null,

            formation:
                lineup.formation || null,

            coach:
                lineup.coach
                    ? {
                        id:
                            lineup.coach.id || null,

                        name:
                            lineup.coach.name || null
                    }
                    : null,

            starters:
                (lineup.startXI || [])
                .map(player => ({

                    id:
                        player.player?.id || null,

                    name:
                        player.player?.name || null,

                    number:
                        player.player?.number || null,

                    position:
                        player.player?.pos || null,

                    grid:
                        player.player?.grid || null

                })),

            substitutes:
                (lineup.substitutes || [])
                .map(player => ({

                    id:
                        player.player?.id || null,

                    name:
                        player.player?.name || null,

                    number:
                        player.player?.number || null,

                    position:
                        player.player?.pos || null

                }))

        });

    }


    // --------------------------------------------------------
    // ESTADÍSTICAS
    // --------------------------------------------------------

    const statistics = [];


    for (
        const teamStats
        of fixture.statistics || []
    ) {

        const stats =
            teamStats.statistics || [];


        statistics.push({

            teamId:
                teamStats.team?.id || null,

            teamName:
                teamStats.team?.name || null,

            possession:
                percentage(
                    statisticValue(
                        stats,
                        "Ball Possession"
                    )
                ),

            shotsTotal:
                statisticValue(
                    stats,
                    "Total Shots"
                ),

            shotsOnTarget:
                statisticValue(
                    stats,
                    "Shots on Goal"
                ),

            shotsOffTarget:
                statisticValue(
                    stats,
                    "Shots off Goal"
                ),

            blockedShots:
                statisticValue(
                    stats,
                    "Blocked Shots"
                ),

            corners:
                statisticValue(
                    stats,
                    "Corner Kicks"
                ),

            fouls:
                statisticValue(
                    stats,
                    "Fouls"
                ),

            offsides:
                statisticValue(
                    stats,
                    "Offsides"
                ),

            yellowCards:
                statisticValue(
                    stats,
                    "Yellow Cards"
                ),

            redCards:
                statisticValue(
                    stats,
                    "Red Cards"
                ),

            goalkeeperSaves:
                statisticValue(
                    stats,
                    "Goalkeeper Saves"
                ),

            passes:
                statisticValue(
                    stats,
                    "Total passes"
                ),

            accuratePasses:
                statisticValue(
                    stats,
                    "Passes accurate"
                )

        });

    }


    // --------------------------------------------------------
    // JUGADORES
    // --------------------------------------------------------

    const players = [];


    for (
        const teamPlayers
        of fixture.players || []
    ) {

        players.push({

            teamId:
                teamPlayers.team?.id || null,

            teamName:
                teamPlayers.team?.name || null,

            players:
                (teamPlayers.players || [])
                .map(player => ({

                    id:
                        player.player?.id || null,

                    name:
                        player.player?.name || null,

                    statistics:
                        player.statistics || []

                }))

        });

    }


    // --------------------------------------------------------
    // EVENTOS
    // --------------------------------------------------------

    const events =
        (fixture.events || [])
        .map(event => ({

            minute:
                event.time?.elapsed || null,

            extra:
                event.time?.extra || null,

            teamId:
                event.team?.id || null,

            player:
                event.player?.name || null,

            assist:
                event.assist?.name || null,

            type:
                event.type || null,

            detail:
                event.detail || null

        }));


    match.details = {

        updatedAt:
            new Date().toISOString(),

        lineups,

        statistics,

        players,

        events

    };

}


// ------------------------------------------------------------
// HISTORIAL DE EQUIPO
// ------------------------------------------------------------

function teamHistory(
    data,
    teamId,
    beforeTimestamp
) {

    return data.matches

        .filter(match =>

            match.timestamp &&
            match.timestamp < beforeTimestamp &&

            ["FT", "AET", "PEN"]
                .includes(match.status) &&

            (
                match.home?.id === teamId ||
                match.away?.id === teamId
            )

        )

        .sort(
            (a, b) =>
                a.timestamp -
                b.timestamp
        );

}


// ------------------------------------------------------------
// MÉTRICAS DE EQUIPO
// ------------------------------------------------------------

function teamMetrics(
    data,
    teamId,
    beforeTimestamp,
    venue = null
) {

    let matches =
        teamHistory(
            data,
            teamId,
            beforeTimestamp
        );


    if (venue === "home") {

        matches =
            matches.filter(
                match =>
                    match.home?.id === teamId
            );

    }


    if (venue === "away") {

        matches =
            matches.filter(
                match =>
                    match.away?.id === teamId
            );

    }


    const last5 =
        matches.slice(-5);


    const last10 =
        matches.slice(-10);


    function aggregate(list) {

        let gf = 0;
        let ga = 0;
        let points = 0;
        let wins = 0;
        let draws = 0;
        let losses = 0;


        for (
            const match
            of list
        ) {

            const home =
                match.home.id === teamId;


            const scored =
                home
                    ? match.score.fulltime.home
                    : match.score.fulltime.away;


            const conceded =
                home
                    ? match.score.fulltime.away
                    : match.score.fulltime.home;


            gf += number(scored);
            ga += number(conceded);


            if (scored > conceded) {

                points += 3;
                wins++;

            } else if (scored === conceded) {

                points++;
                draws++;

            } else {

                losses++;

            }

        }


        return {

            matches:
                list.length,

            gf,

            ga,

            gfPerGame:
                list.length
                    ? gf / list.length
                    : 0,

            gaPerGame:
                list.length
                    ? ga / list.length
                    : 0,

            points,

            pointsPerGame:
                list.length
                    ? points / list.length
                    : 0,

            wins,

            draws,

            losses

        };

    }


    return {

        last5:
            aggregate(last5),

        last10:
            aggregate(last10),

        venue:
            aggregate(matches)

    };

}


// ------------------------------------------------------------
// PORTEROS
// ------------------------------------------------------------

function goalkeeperMetrics(
    data,
    teamId,
    beforeTimestamp
) {

    let saves = 0;
    let conceded = 0;

    let appearances = 0;


    for (
        const match
        of data.matches
    ) {

        if (
            !match.timestamp ||
            match.timestamp >= beforeTimestamp
        ) {
            continue;
        }


        if (
            !["FT", "AET", "PEN"]
                .includes(match.status)
        ) {
            continue;
        }


        if (!match.details?.players) {
            continue;
        }


        for (
            const team
            of match.details.players
        ) {

            if (
                team.teamId !== teamId
            ) {
                continue;
            }


            for (
                const player
                of team.players || []
            ) {

                const stat =
                    player.statistics?.[0];


                if (!stat) {
                    continue;
                }


                const position =
                    String(
                        stat.games?.position || ""
                    )
                    .toLowerCase();


                if (position !== "g") {
                    continue;
                }


                appearances++;


                saves +=
                    number(
                        stat.goals?.saves
                    );


                conceded +=
                    number(
                        stat.goals?.conceded
                    );

            }

        }

    }


    const shots =
        saves + conceded;


    return {

        appearances,

        saves,

        conceded,

        shots,

        savePercentage:
            shots
                ? Number(
                    (
                        saves /
                        shots *
                        100
                    ).toFixed(2)
                )
                : null

    };

}


// ------------------------------------------------------------
// FORMACIONES
// ------------------------------------------------------------

function formationMetrics(
    data,
    teamId,
    beforeTimestamp
) {

    const formations = {};


    for (
        const match
        of data.matches
    ) {

        if (
            !match.timestamp ||
            match.timestamp >= beforeTimestamp
        ) {
            continue;
        }


        if (
            !["FT", "AET", "PEN"]
                .includes(match.status)
        ) {
            continue;
        }


        if (!match.details?.lineups) {
            continue;
        }


        const lineup =
            match.details.lineups.find(
                x =>
                    x.teamId === teamId
            );


        if (
            !lineup?.formation
        ) {
            continue;
        }


        const formation =
            lineup.formation;


        if (!formations[formation]) {

            formations[formation] = {

                matches: 0,

                wins: 0,

                draws: 0,

                losses: 0,

                gf: 0,

                ga: 0

            };

        }


        const row =
            formations[formation];


        row.matches++;


        const home =
            match.home.id === teamId;


        const gf =
            home
                ? number(
                    match.score.fulltime.home
                )
                : number(
                    match.score.fulltime.away
                );


        const ga =
            home
                ? number(
                    match.score.fulltime.away
                )
                : number(
                    match.score.fulltime.home
                );


        row.gf += gf;
        row.ga += ga;


        if (gf > ga) {

            row.wins++;

        } else if (gf === ga) {

            row.draws++;

        } else {

            row.losses++;

        }

    }


    return formations;

}


// ------------------------------------------------------------
// PRONÓSTICO
// ------------------------------------------------------------

function createPrediction(
    data,
    match
) {

    const timestamp =
        match.timestamp;


    const home =
        teamMetrics(
            data,
            match.home.id,
            timestamp,
            "home"
        );


    const away =
        teamMetrics(
            data,
            match.away.id,
            timestamp,
            "away"
        );


    const homeRecent =
        teamMetrics(
            data,
            match.home.id,
            timestamp
        );


    const awayRecent =
        teamMetrics(
            data,
            match.away.id,
            timestamp
        );


    /*
     * MODELO INICIAL
     *
     * 30% forma
     * 30% ataque/defensa
     * 20% localía
     * 10% portero
     * 10% ausencias/táctica
     *
     * Lo importante es que los pesos quedan registrados
     * para poder estudiar posteriormente qué variables
     * funcionan realmente.
     */


    let homeScore = 1;
    let awayScore = 1;


    // FORMA

    homeScore +=
        (
            homeRecent.last5.pointsPerGame -
            awayRecent.last5.pointsPerGame
        ) * 0.40;


    awayScore +=
        (
            awayRecent.last5.pointsPerGame -
            homeRecent.last5.pointsPerGame
        ) * 0.40;


    // ATAQUE / DEFENSA

    homeScore +=
        (
            home.venue.gfPerGame -
            away.venue.gaPerGame
        ) * 0.25;


    awayScore +=
        (
            away.venue.gfPerGame -
            home.venue.gaPerGame
        ) * 0.25;


    // VENTAJA DE CAMPO

    homeScore += 0.30;


    // PORTEROS

    const homeGK =
        goalkeeperMetrics(
            data,
            match.home.id,
            timestamp
        );


    const awayGK =
        goalkeeperMetrics(
            data,
            match.away.id,
            timestamp
        );


    if (
        homeGK.savePercentage !== null
    ) {

        homeScore +=
            (
                homeGK.savePercentage -
                70
            ) / 100;

    }


    if (
        awayGK.savePercentage !== null
    ) {

        awayScore +=
            (
                awayGK.savePercentage -
                70
            ) / 100;

    }


    homeScore =
        Math.max(
            0.05,
            homeScore
        );


    awayScore =
        Math.max(
            0.05,
            awayScore
        );


    const drawScore =
        Math.max(
            0.15,
            0.72 -
            Math.abs(
                homeScore -
                awayScore
            ) * 0.16
        );


    const total =
        homeScore +
        awayScore +
        drawScore;


    const p1 =
        homeScore / total;


    const px =
        drawScore / total;


    const p2 =
        awayScore / total;


    let sign = "X";


    if (
        p1 >= px &&
        p1 >= p2
    ) {

        sign = "1";

    } else if (
        p2 >= px &&
        p2 >= p1
    ) {

        sign = "2";

    }


    const confidence =
        Math.max(
            p1,
            px,
            p2
        );


    let difficulty;


    if (confidence >= 0.58) {

        difficulty = "fácil";

    } else if (
        confidence >= 0.48
    ) {

        difficulty = "media";

    } else {

        difficulty = "difícil";

    }


    return {

        sign,

        probabilities: {

            "1":
                Number(
                    p1.toFixed(4)
                ),

            "X":
                Number(
                    px.toFixed(4)
                ),

            "2":
                Number(
                    p2.toFixed(4)
                )

        },

        confidence:
            Number(
                confidence.toFixed(4)
            ),

        difficulty,

        generatedAt:
            new Date().toISOString(),

        lockedAt:
            null,

        model: {

            version:
                "1.0",

            weights: {

                form: 0.30,

                attackDefense: 0.30,

                homeAdvantage: 0.20,

                goalkeeper: 0.10,

                tacticalAbsences: 0.10

            }

        },

        evidence: {

            homeLast5:
                homeRecent.last5,

            awayLast5:
                awayRecent.last5,

            homeVenue:
                home.venue,

            awayVenue:
                away.venue,

            homeGoalkeeper:
                homeGK,

            awayGoalkeeper:
                awayGK,

            homeFormations:
                formationMetrics(
                    data,
                    match.home.id,
                    timestamp
                ),

            awayFormations:
                formationMetrics(
                    data,
                    match.away.id,
                    timestamp
                )

        }

    };

}


// ------------------------------------------------------------
// BALANCE DE PRONÓSTICOS
// ------------------------------------------------------------

function updatePredictionBalance(data) {

    const balance = {

        total: 0,

        correct: 0,

        accuracy: 0,

        bySign: {

            "1": {
                total: 0,
                correct: 0
            },

            "X": {
                total: 0,
                correct: 0
            },

            "2": {
                total: 0,
                correct: 0
            }

        },

        byDifficulty: {

            "fácil": {
                total: 0,
                correct: 0
            },

            "media": {
                total: 0,
                correct: 0
            },

            "difícil": {
                total: 0,
                correct: 0
            }

        }

    };


    for (
        const match
        of data.matches
    ) {

        if (
            !match.prediction?.sign
        ) {
            continue;
        }


        if (
            !["FT", "AET", "PEN"]
                .includes(match.status)
        ) {
            continue;
        }


        const real =
            getResult(match);


        if (!real) {
            continue;
        }


        const prediction =
            match.prediction.sign;


        const correct =
            prediction === real;


        balance.total++;


        if (correct) {

            balance.correct++;

        }


        if (
            balance.bySign[prediction]
        ) {

            balance.bySign[prediction].total++;

            if (correct) {

                balance.bySign[prediction].correct++;

            }

        }


        const difficulty =
            match.prediction.difficulty ||
            "media";


        if (
            balance.byDifficulty[difficulty]
        ) {

            balance.byDifficulty[difficulty].total++;

            if (correct) {

                balance.byDifficulty[difficulty].correct++;

            }

        }

    }


    balance.accuracy =
        balance.total
            ? Number(
                (
                    balance.correct /
                    balance.total *
                    100
                ).toFixed(2)
            )
            : 0;


    data.predictionBalance =
        balance;

}


// ------------------------------------------------------------
// OBTENER DETALLES EN GRUPOS DE 20
// ------------------------------------------------------------

async function getFixtureDetails(ids) {

    const results = [];


    for (
        let i = 0;
        i < ids.length;
        i += 20
    ) {

        const chunk =
            ids.slice(
                i,
                i + 20
            );


        const result =
            await api(
                "/fixtures",
                {
                    ids:
                        chunk.join("-")
                }
            );


        results.push(
            ...(result.response || [])
        );

    }


    return results;

}


// ------------------------------------------------------------
// PROGRAMA PRINCIPAL
// ------------------------------------------------------------

async function main() {

    const data =
        await loadData();


    const now =
        Math.floor(
            Date.now() / 1000
        );


    const recentLimit =
        now -
        14 * 24 * 60 * 60;


    const futureLimit =
        now +
        10 * 24 * 60 * 60;


    console.log(
        "=========================================="
    );

    console.log(
        "ACTUALIZACIÓN LALIGA 2026/27"
    );

    console.log(
        "=========================================="
    );


    // --------------------------------------------------------
    // 1. CALENDARIO
    // --------------------------------------------------------

    console.log(
        "1. Descargando calendario..."
    );


    const fixtures =
        await api(
            "/fixtures",
            {
                league:
                    LEAGUE_ID,

                season:
                    SEASON
            }
        );


    mergeFixtures(
        data,
        fixtures.response || []
    );


    // --------------------------------------------------------
    // 2. CLASIFICACIÓN
    // --------------------------------------------------------

    console.log(
        "2. Descargando clasificación..."
    );


    try {

        const standings =
            await api(
                "/standings",
                {
                    league:
                        LEAGUE_ID,

                    season:
                        SEASON
                }
            );


        const table =
            standings
                .response?.[0]
                ?.league
                ?.standings?.[0] || [];


        data.standings =
            table.map(row => ({

                rank:
                    row.rank,

                team:
                    row.team
                        ? {

                            id:
                                row.team.id,

                            name:
                                row.team.name,

                            logo:
                                row.team.logo

                        }
                        : null,

                points:
                    row.points,

                goalsDiff:
                    row.goalsDiff,

                form:
                    row.form,

                played:
                    row.all?.played,

                wins:
                    row.all?.win,

                draws:
                    row.all?.draw,

                losses:
                    row.all?.lose,

                gf:
                    row.all?.goals?.for,

                ga:
                    row.all?.goals?.against,

                home:
                    row.home,

                away:
                    row.away

            }));


    } catch (error) {

        console.warn(
            "No se pudo actualizar clasificación:",
            error.message
        );

    }


    // --------------------------------------------------------
    // 3. GOLEADORES
    // --------------------------------------------------------

    console.log(
        "3. Descargando goleadores..."
    );


    try {

        const scorers =
            await api(
                "/players/topscorers",
                {
                    league:
                        LEAGUE_ID,

                    season:
                        SEASON
                }
            );


        data.scorers =
            (scorers.response || [])
            .slice(0, 20)
            .map(row => {

                const stat =
                    row.statistics?.[0];


                return {

                    player:
                        row.player,

                    team:
                        stat?.team || null,

                    goals:
                        stat?.goals || null,

                    assists:
                        stat?.goals?.assists ?? null,

                    appearances:
                        stat?.games?.appearences ?? null,

                    minutes:
                        stat?.games?.minutes ?? null,

                    rating:
                        stat?.games?.rating ?? null

                };

            });


    } catch (error) {

        console.warn(
            "No se pudieron actualizar goleadores:",
            error.message
        );

    }


    // --------------------------------------------------------
    // 4. LESIONES
    // --------------------------------------------------------

    console.log(
        "4. Descargando lesiones/sanciones..."
    );


    try {

        const injuries =
            await api(
                "/injuries",
                {
                    league:
                        LEAGUE_ID,

                    season:
                        SEASON
                }
            );


        data.injuries =
            injuries.response || [];


    } catch (error) {

        console.warn(
            "No se pudieron actualizar lesiones:",
            error.message
        );

    }


    // --------------------------------------------------------
    // 5. DETALLES DE PARTIDOS
    // --------------------------------------------------------

    console.log(
        "5. Buscando partidos que necesitan detalles..."
    );


    const candidates =
        data.matches

            .filter(match => {

                const timestamp =
                    match.timestamp || 0;


                const finished =
                    [
                        "FT",
                        "AET",
                        "PEN"
                    ].includes(
                        match.status
                    );


                const recent =
                    timestamp >=
                    recentLimit;


                const upcoming =
                    timestamp >= now &&
                    timestamp <= futureLimit;


                return (
                    !match.details &&
                    (
                        (finished && recent) ||
                        upcoming
                    )
                );

            })

            .sort(
                (a, b) =>
                    (a.timestamp || 0) -
                    (b.timestamp || 0)
            )

            .slice(
                0,
                MAX_DETAIL_FIXTURES
            );


    if (candidates.length) {

        console.log(
            `Detalles para ${candidates.length} partidos`
        );


        const details =
            await getFixtureDetails(
                candidates.map(
                    x => x.id
                )
            );


        const detailMap =
            new Map(
                details.map(
                    x => [
                        x.fixture?.id,
                        x
                    ]
                )
            );


        for (
            const match
            of candidates
        ) {

            const fixture =
                detailMap.get(
                    match.id
                );


            if (fixture) {

                saveFixtureDetails(
                    match,
                    fixture
                );

            }

        }

    }


    // --------------------------------------------------------
    // 6. RESULTADOS
    // --------------------------------------------------------

    for (
        const match
        of data.matches
    ) {

        if (
            [
                "FT",
                "AET",
                "PEN"
            ].includes(
                match.status
            )
        ) {

            match.result =
                getResult(match);

        }

    }


    // --------------------------------------------------------
    // 7. PRONÓSTICOS
    // --------------------------------------------------------

    console.log(
        "6. Actualizando pronósticos..."
    );


    for (
        const match
        of data.matches
    ) {

        if (
            !match.timestamp
        ) {
            continue;
        }


        // Sólo partidos futuros.

        if (
            match.timestamp <= now
        ) {
            continue;
        }


        const hours =
            (
                match.timestamp -
                now
            ) / 3600;


        /*
         * El pronóstico queda congelado
         * 12 horas antes del comienzo.
         */

        if (
            !match.prediction ||
            (
                !match.prediction.lockedAt &&
                hours > 12
            )
        ) {

            match.prediction =
                createPrediction(
                    data,
                    match
                );


            if (
                hours <= 12
            ) {

                match.prediction.lockedAt =
                    new Date().toISOString();

            }

        } else if (
            !match.prediction.lockedAt &&
            hours <= 12
        ) {

            match.prediction.lockedAt =
                new Date().toISOString();

        }

    }


    // --------------------------------------------------------
    // 8. BALANCE
    // --------------------------------------------------------

    console.log(
        "7. Calculando balance..."
    );


    updatePredictionBalance(
        data
    );


    // --------------------------------------------------------
    // 9. METADATOS
    // --------------------------------------------------------

    data.meta = {

        ...(data.meta || {}),

        leagueId:
            LEAGUE_ID,

        season:
            SEASON,

        league:
            "LaLiga",

        seasonLabel:
            "2026/27",

        source:
            "API-Football",

        generatedAt:
            new Date().toISOString(),

        requestsThisRun

    };


    // --------------------------------------------------------
    // 10. GUARDAR
    // --------------------------------------------------------

    await fs.mkdir(
        path.dirname(DATA_FILE),
        {
            recursive: true
        }
    );


    await fs.writeFile(
        DATA_FILE,
        JSON.stringify(
            data,
            null,
            2
        ),
        "utf8"
    );


    console.log(
        "=========================================="
    );

    console.log(
        "ACTUALIZACIÓN COMPLETADA"
    );

    console.log(
        `Partidos: ${data.matches.length}`
    );

    console.log(
        `Equipos: ${data.standings.length}`
    );

    console.log(
        `Goleadores: ${data.scorers.length}`
    );

    console.log(
        `Peticiones: ${requestsThisRun}`
    );

    console.log(
        `Aciertos acumulados: ${data.predictionBalance.correct}/${data.predictionBalance.total}`
    );

    console.log(
        `Precisión: ${data.predictionBalance.accuracy}%`
    );

    console.log(
        "=========================================="
    );

}


main()
    .catch(error => {

        console.error(
            "ERROR FATAL:",
            error
        );

        process.exit(1);

    });
