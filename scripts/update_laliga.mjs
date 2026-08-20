/**
 * ============================================================
 * FAMILIA CERNADAS
 * ACTUALIZADOR AUTOMÁTICO LALIGA 2026/27
 * ============================================================
 *
 * FUENTES
 *
 * 1. ESPN
 *    Fuente principal para la temporada 2026/27:
 *      - calendario
 *      - resultados
 *      - clasificación
 *      - equipos
 *      - noticias
 *
 * 2. API-FOOTBALL / API-SPORTS
 *    Fuente secundaria para:
 *      - estadísticas
 *      - alineaciones
 *      - formaciones
 *      - eventos
 *      - jugadores
 *      - porteros
 *
 * IMPORTANTE
 *
 * API-Football Free NO permite actualmente consultar la
 * temporada 2026/27.
 *
 * Por ello el programa NO falla si API-Football devuelve
 * un error de temporada.
 *
 * ============================================================
 */

import fs from "node:fs/promises";
import path from "node:path";


// ============================================================
// CONFIGURACIÓN
// ============================================================

const API_KEY =
    process.env.API_FOOTBALL_KEY || "";

const LEAGUE_ID = 140;

const SEASON = 2026;

const DATA_FILE =
    path.resolve("data/laliga_2026_27.json");


// ============================================================
// ESPN
// ============================================================

const ESPN_SITE =
    "https://site.api.espn.com/apis/site/v2";

const ESPN_V2 =
    "https://site.api.espn.com/apis/v2";

const ESPN_LEAGUE =
    "soccer/esp.1";


// ============================================================
// API-FOOTBALL
// ============================================================

const API_FOOTBALL_BASE =
    "https://v3.football.api-sports.io";


// ============================================================
// CONTROL DE PETICIONES
// ============================================================

let requestsThisRun = 0;

const MAX_REQUESTS = 90;

const MAX_DETAIL_FIXTURES = 40;


// ============================================================
// UTILIDADES
// ============================================================

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


function safeArray(value) {

    return Array.isArray(value)
        ? value
        : [];

}


function resultFromGoals(home, away) {

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


// ============================================================
// PETICIÓN GENÉRICA
// ============================================================

async function fetchJSON(
    url,
    options = {}
) {

    console.log(
        `GET ${url}`
    );

    const response =
        await fetch(
            url,
            {
                ...options,
                headers: {
                    Accept:
                        "application/json",
                    ...(options.headers || {})
                }
            }
        );


    const text =
        await response.text();


    let json;

    try {

        json =
            JSON.parse(text);

    } catch {

        throw new Error(
            `Respuesta no JSON (${response.status})`
        );

    }


    if (!response.ok) {

        throw new Error(
            `HTTP ${response.status}: ` +
            JSON.stringify(
                json.errors ||
                json
            )
        );

    }


    return json;

}


// ============================================================
// API-FOOTBALL
// ============================================================

async function apiFootball(
    endpoint,
    params = {}
) {

    if (!API_KEY) {

        throw new Error(
            "API_FOOTBALL_KEY no configurada"
        );

    }


    if (
        requestsThisRun >=
        MAX_REQUESTS
    ) {

        throw new Error(
            "Límite de seguridad de peticiones alcanzado"
        );

    }


    const url =
        new URL(
            API_FOOTBALL_BASE +
            endpoint
        );


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


    const json =
        await fetchJSON(
            url.toString(),
            {
                headers: {
                    "x-apisports-key":
                        API_KEY
                }
            }
        );


    if (
        json.errors &&
        Object.keys(json.errors).length
    ) {

        throw new Error(
            "API error: " +
            JSON.stringify(
                json.errors
            )
        );

    }


    await sleep(150);


    return json;

}


// ============================================================
// ESPN SCOREBOARD
// ============================================================

async function getESPNScoreboard(
    startDate,
    endDate
) {

    const url =
        `${ESPN_SITE}/${ESPN_LEAGUE}/scoreboard` +
        `?dates=${startDate}-${endDate}` +
        `&limit=500`;


    return fetchJSON(url);

}


// ============================================================
// NORMALIZAR ESPN
// ============================================================

function normalizeESPNEvent(event) {

    const competition =
        event.competitions?.[0];

    const competitors =
        safeArray(
            competition?.competitors
        );


    const home =
        competitors.find(
            x =>
                x.homeAway ===
                "home"
        );


    const away =
        competitors.find(
            x =>
                x.homeAway ===
                "away"
        );


    const status =
        event.status ||
        competition?.status;


    const homeScore =
        home?.score !== undefined
            ? number(home.score, null)
            : null;


    const awayScore =
        away?.score !== undefined
            ? number(away.score, null)
            : null;


    let normalizedStatus =
        "NS";


    if (
        status?.type?.completed
    ) {

        normalizedStatus =
            "FT";

    } else if (
        status?.type?.state ===
        "in"
    ) {

        normalizedStatus =
            "LIVE";

    } else if (
        status?.type?.state ===
        "post"
    ) {

        normalizedStatus =
            "FT";

    }


    return {

        id:
            `espn-${event.id}`,

        source:
            "ESPN",

        sourceId:
            String(event.id),

        round:
            event.week?.number ||
            event.season?.slug ||
            null,

        date:
            event.date ||
            null,

        timestamp:
            event.date
                ? Math.floor(
                    new Date(
                        event.date
                    ).getTime() /
                    1000
                )
                : null,

        status:
            normalizedStatus,

        statusLong:
            status?.type?.description ||
            null,

        venue: {

            id:
                competition?.venue?.id ||
                null,

            name:
                competition?.venue?.fullName ||
                competition?.venue?.address?.city ||
                null,

            city:
                competition?.venue?.address?.city ||
                null

        },

        home: {

            id:
                home?.team?.id ||
                null,

            name:
                home?.team?.displayName ||
                home?.team?.name ||
                null,

            abbreviation:
                home?.team?.abbreviation ||
                null,

            logo:
                home?.team?.logo ||
                null

        },

        away: {

            id:
                away?.team?.id ||
                null,

            name:
                away?.team?.displayName ||
                away?.team?.name ||
                null,

            abbreviation:
                away?.team?.abbreviation ||
                null,

            logo:
                away?.team?.logo ||
                null

        },

        score: {

            halftime:
                null,

            fulltime: {

                home:
                    homeScore,

                away:
                    awayScore

            },

            extratime:
                null,

            penalty:
                null

        },

        broadcasts:
            safeArray(
                competition?.broadcasts
            )
            .map(
                broadcast => ({
                    name:
                        broadcast.names?.[0] ||
                        broadcast.market ||
                        null,

                    type:
                        broadcast.type ||
                        null
                })
            )

    };

}


// ============================================================
// DESCARGAR TEMPORADA DESDE ESPN
// ============================================================

async function getSeasonFixturesESPN() {

    console.log(
        "Descargando calendario 2026/27 desde ESPN..."
    );


    /*
     * La temporada 2026/27 empieza en agosto de 2026.
     *
     * Dividimos la consulta en bloques para evitar
     * problemas con intervalos excesivamente grandes.
     */

    const ranges = [

        [
            "20260801",
            "20260930"
        ],

        [
            "20261001",
            "20261130"
        ],

        [
            "20261201",
            "20270131"
        ],

        [
            "20270201",
            "20270331"
        ],

        [
            "20270401",
            "20270531"
        ]

    ];


    const all = [];


    for (
        const [
            start,
            end
        ]
        of ranges
    ) {

        try {

            const data =
                await getESPNScoreboard(
                    start,
                    end
                );


            all.push(
                ...safeArray(
                    data.events
                )
            );


            console.log(
                `ESPN ${start}-${end}: ` +
                `${safeArray(data.events).length} partidos`
            );

        } catch (error) {

            console.warn(
                `ESPN no pudo consultar ${start}-${end}:`,
                error.message
            );

        }

    }


    const unique =
        new Map();


    for (
        const event
        of all
    ) {

        if (
            event?.id
        ) {

            unique.set(
                String(event.id),
                event
            );

        }

    }


    return Array.from(
        unique.values()
    )
    .map(
        normalizeESPNEvent
    )
    .sort(
        (a, b) =>
            (a.timestamp || 0) -
            (b.timestamp || 0)
    );

}


// ============================================================
// CARGAR JSON
// ============================================================

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
        data.news ||= [];


        return data;

    } catch {

        return {

            meta: {

                leagueId:
                    LEAGUE_ID,

                season:
                    SEASON,

                league:
                    "LaLiga",

                seasonLabel:
                    "2026/27"

            },

            matches: [],

            standings: [],

            scorers: [],

            injuries: [],

            news: [],

            predictionBalance: {

                total: 0,

                correct: 0,

                accuracy: 0

            }

        };

    }

}


// ============================================================
// FUSIONAR PARTIDOS ESPN
// ============================================================

function mergeESPNFixtures(
    data,
    fixtures
) {

    const existing =
        new Map();


    for (
        const match
        of data.matches
    ) {

        existing.set(
            String(match.id),
            match
        );

        if (
            match.sourceId
        ) {

            existing.set(
                `espn-${match.sourceId}`,
                match
            );

        }

    }


    for (
        const fixture
        of fixtures
    ) {

        if (!fixture.id) {
            continue;
        }


        /*
         * Intentamos localizar también
         * un partido existente por equipos
         * y fecha.
         */

        let old =
            existing.get(
                String(fixture.id)
            );


        if (!old) {

            old =
                data.matches.find(
                    match =>

                        match.home?.name ===
                        fixture.home?.name &&

                        match.away?.name ===
                        fixture.away?.name &&

                        Math.abs(
                            number(
                                match.timestamp
                            ) -
                            number(
                                fixture.timestamp
                            )
                        ) <
                        86400
                );

        }


        if (old) {

            const prediction =
                old.prediction;

            const details =
                old.details;

            const oldId =
                old.id;


            Object.assign(
                old,
                fixture
            );


            /*
             * Conservamos el ID antiguo
             * si procedía de API-Football.
             */

            if (
                oldId &&
                !String(oldId)
                    .startsWith("espn-")
            ) {

                old.id =
                    oldId;

            }


            if (prediction) {

                old.prediction =
                    prediction;

            }


            if (details) {

                old.details =
                    details;

            }

        } else {

            data.matches.push(
                fixture
            );

        }

    }


    data.matches =
        data.matches
            .sort(
                (a, b) =>
                    (a.timestamp || 0) -
                    (b.timestamp || 0)
            );

}


// ============================================================
// RESULTADO
// ============================================================

function getResult(match) {

    const home =
        match.score?.fulltime?.home;

    const away =
        match.score?.fulltime?.away;


    return resultFromGoals(
        home,
        away
    );

}


// ============================================================
// HISTORIAL
// ============================================================

function teamHistory(
    data,
    teamId,
    beforeTimestamp
) {

    return data.matches

        .filter(
            match =>

                match.timestamp &&
                match.timestamp <
                    beforeTimestamp &&

                ["FT", "AET", "PEN"]
                    .includes(
                        match.status
                    ) &&

                (
                    String(match.home?.id) ===
                    String(teamId) ||

                    String(match.away?.id) ===
                    String(teamId)
                )
        )

        .sort(
            (a, b) =>
                a.timestamp -
                b.timestamp
        );

}


// ============================================================
// MÉTRICAS
// ============================================================

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


    if (
        venue === "home"
    ) {

        matches =
            matches.filter(
                match =>
                    String(
                        match.home?.id
                    ) ===
                    String(teamId)
            );

    }


    if (
        venue === "away"
    ) {

        matches =
            matches.filter(
                match =>
                    String(
                        match.away?.id
                    ) ===
                    String(teamId)
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

            const isHome =
                String(
                    match.home?.id
                ) ===
                String(teamId);


            const scored =
                isHome
                    ? match.score?.fulltime?.home
                    : match.score?.fulltime?.away;


            const conceded =
                isHome
                    ? match.score?.fulltime?.away
                    : match.score?.fulltime?.home;


            gf += number(
                scored
            );

            ga += number(
                conceded
            );


            if (
                scored > conceded
            ) {

                points += 3;
                wins++;

            } else if (
                scored === conceded
            ) {

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


// ============================================================
// FORMACIONES
// ============================================================

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
            match.timestamp >=
                beforeTimestamp
        ) {
            continue;
        }


        if (
            !["FT", "AET", "PEN"]
                .includes(
                    match.status
                )
        ) {
            continue;
        }


        const lineups =
            match.details?.lineups;


        if (
            !Array.isArray(lineups)
        ) {
            continue;
        }


        const lineup =
            lineups.find(
                x =>
                    String(x.teamId) ===
                    String(teamId)
            );


        if (
            !lineup?.formation
        ) {
            continue;
        }


        const formation =
            lineup.formation;


        if (
            !formations[formation]
        ) {

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


        const isHome =
            String(
                match.home?.id
            ) ===
            String(teamId);


        const gf =
            isHome
                ? number(
                    match.score?.fulltime?.home
                )
                : number(
                    match.score?.fulltime?.away
                );


        const ga =
            isHome
                ? number(
                    match.score?.fulltime?.away
                )
                : number(
                    match.score?.fulltime?.home
                );


        row.gf += gf;

        row.ga += ga;


        if (
            gf > ga
        ) {

            row.wins++;

        } else if (
            gf === ga
        ) {

            row.draws++;

        } else {

            row.losses++;

        }

    }


    return formations;

}


// ============================================================
// PORTEROS
// ============================================================

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
            match.timestamp >=
                beforeTimestamp
        ) {
            continue;
        }


        if (
            !["FT", "AET", "PEN"]
                .includes(
                    match.status
                )
        ) {
            continue;
        }


        for (
            const team
            of match.details?.players || []
        ) {

            if (
                String(team.teamId) !==
                String(teamId)
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
                        stat.games?.position ||
                        ""
                    )
                    .toLowerCase();


                if (
                    position !== "g"
                ) {
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
        saves +
        conceded;


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


// ============================================================
// PRONÓSTICO
// ============================================================

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


    let homeScore = 1;

    let awayScore = 1;


    /*
     * FORMA
     */

    homeScore +=
        (
            homeRecent.last5.pointsPerGame -
            awayRecent.last5.pointsPerGame
        ) *
        0.40;


    awayScore +=
        (
            awayRecent.last5.pointsPerGame -
            homeRecent.last5.pointsPerGame
        ) *
        0.40;


    /*
     * ATAQUE / DEFENSA
     */

    homeScore +=
        (
            home.venue.gfPerGame -
            away.venue.gaPerGame
        ) *
        0.25;


    awayScore +=
        (
            away.venue.gfPerGame -
            home.venue.gaPerGame
        ) *
        0.25;


    /*
     * LOCALÍA
     */

    homeScore += 0.30;


    /*
     * PORTEROS
     */

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
        homeGK.savePercentage !==
        null
    ) {

        homeScore +=
            (
                homeGK.savePercentage -
                70
            ) /
            100;

    }


    if (
        awayGK.savePercentage !==
        null
    ) {

        awayScore +=
            (
                awayGK.savePercentage -
                70
            ) /
            100;

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
            ) *
            0.16
        );


    const total =
        homeScore +
        awayScore +
        drawScore;


    const p1 =
        homeScore /
        total;


    const px =
        drawScore /
        total;


    const p2 =
        awayScore /
        total;


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


    let difficulty =
        "difícil";


    if (
        confidence >= 0.58
    ) {

        difficulty =
            "fácil";

    } else if (
        confidence >= 0.48
    ) {

        difficulty =
            "media";

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
                "2.0-ESPN-APIFOOTBALL",

            weights: {

                form:
                    0.30,

                attackDefense:
                    0.30,

                homeAdvantage:
                    0.20,

                goalkeeper:
                    0.10,

                tacticalAbsences:
                    0.10

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


// ============================================================
// CLASIFICACIÓN ESPN
// ============================================================

async function updateStandingsESPN(
    data
) {

    console.log(
        "Actualizando clasificación desde ESPN..."
    );


    try {

        const url =
            `${ESPN_V2}/${ESPN_LEAGUE}/standings` +
            `?season=${SEASON}`;


        const json =
            await fetchJSON(
                url
            );


        const children =
            safeArray(
                json.children
            );


        const rows = [];


        for (
            const group
            of children
        ) {

            for (
                const entry
                of safeArray(
                    group.standings?.entries
                )
            ) {

                const team =
                    entry.team;


                const stats =
                    safeArray(
                        entry.stats
                    );


                const value =
                    name => {

                        const item =
                            stats.find(
                                x =>
                                    x.name ===
                                    name
                            );

                        return item?.value ??
                            item?.displayValue ??
                            null;

                    };


                rows.push({

                    rank:
                        number(
                            value("rank"),
                            rows.length + 1
                        ),

                    team: {

                        id:
                            team?.id ||
                            null,

                        name:
                            team?.displayName ||
                            team?.name ||
                            null,

                        logo:
                            team?.logos?.[0]?.href ||
                            null

                    },

                    points:
                        number(
                            value("points")
                        ),

                    goalsDiff:
                        number(
                            value("differential")
                        ),

                    form:
                        value("streak") ||
                        value("form") ||
                        null,

                    played:
                        number(
                            value("gamesPlayed")
                        ),

                    wins:
                        number(
                            value("wins")
                        ),

                    draws:
                        number(
                            value("ties")
                        ),

                    losses:
                        number(
                            value("losses")
                        ),

                    gf:
                        number(
                            value("pointsFor")
                        ),

                    ga:
                        number(
                            value("pointsAgainst")
                        )

                });

            }

        }


        if (
            rows.length
        ) {

            data.standings =
                rows;

            console.log(
                `Clasificación ESPN: ${rows.length} equipos`
            );

        } else {

            console.warn(
                "ESPN devolvió una clasificación vacía"
            );

        }

    } catch (error) {

        console.warn(
            "No se pudo actualizar clasificación ESPN:",
            error.message
        );

    }

}


// ============================================================
// GOLEADORES
// ============================================================

async function updateScorers(
    data
) {

    /*
     * ESPN no garantiza el endpoint de leaders
     * de fútbol de la misma forma para todas las
     * temporadas.
     *
     * Primero intentamos la fuente web.
     * Si no existe, conservamos los datos anteriores.
     */

    try {

        const url =
            `${ESPN_SITE}/${ESPN_LEAGUE}/leaders`;


        const json =
            await fetchJSON(
                url
            );


        const leaders =
            safeArray(
                json.leaders
            );


        const scorerRows = [];


        for (
            const category
            of leaders
        ) {

            const name =
                String(
                    category.name ||
                    category.displayName ||
                    ""
                )
                .toLowerCase();


            if (
                !name.includes("goal") &&
                !name.includes("scor")
            ) {
                continue;
            }


            for (
                const athlete
                of safeArray(
                    category.leaders
                )
            ) {

                scorerRows.push({

                    player:
                        athlete.athlete ||
                        null,

                    team:
                        athlete.athlete?.team ||
                        null,

                    goals:
                        number(
                            athlete.value
                        ),

                    assists:
                        null,

                    appearances:
                        null,

                    minutes:
                        null,

                    rating:
                        null

                });

            }

        }


        if (
            scorerRows.length
        ) {

            data.scorers =
                scorerRows
                    .sort(
                        (a, b) =>
                            b.goals -
                            a.goals
                    )
                    .slice(
                        0,
                        20
                    );

            console.log(
                `Goleadores ESPN: ${data.scorers.length}`
            );

        } else {

            console.warn(
                "ESPN no devolvió goleadores"
            );

        }

    } catch (error) {

        console.warn(
            "No se pudieron actualizar goleadores ESPN:",
            error.message
        );

    }

}


// ============================================================
// NOTICIAS ESPN
// ============================================================

async function updateNews(
    data
) {

    try {

        const url =
            `${ESPN_SITE}/${ESPN_LEAGUE}/news?limit=20`;


        const json =
            await fetchJSON(
                url
            );


        data.news =
            safeArray(
                json.articles
            )
            .slice(
                0,
                20
            )
            .map(
                article => ({

                    id:
                        article.id ||
                        null,

                    headline:
                        article.headline ||
                        article.title ||
                        null,

                    description:
                        article.description ||
                        null,

                    published:
                        article.published ||
                        null,

                    link:
                        article.links?.web?.href ||
                        null,

                    image:
                        article.images?.[0]?.url ||
                        null

                })
            );


        console.log(
            `Noticias ESPN: ${data.news.length}`
        );

    } catch (error) {

        console.warn(
            "No se pudieron actualizar noticias:",
            error.message
        );

    }

}


// ============================================================
// INTENTO API-FOOTBALL
// ============================================================

async function tryAPIfootballEnhancement(
    data
) {

    if (!API_KEY) {

        console.warn(
            "API_FOOTBALL_KEY no disponible. " +
            "Se continuará exclusivamente con ESPN."
        );

        return;

    }


    console.log(
        "Intentando comprobar disponibilidad de API-Football 2026..."
    );


    try {

        const test =
            await apiFootball(
                "/leagues",
                {
                    id:
                        LEAGUE_ID,

                    season:
                        SEASON
                }
            );


        const season =
            test.response?.[0]
                ?.seasons
                ?.find(
                    x =>
                        x.year ===
                        SEASON
                );


        if (
            !season
        ) {

            console.warn(
                "API-Football no tiene disponible " +
                "la temporada 2026/27 para esta cuenta."
            );

            return;

        }


        console.log(
            "API-Football 2026/27 disponible."
        );


        /*
         * Sólo si realmente existe la temporada
         * intentamos utilizarla.
         */

        const fixtures =
            await apiFootball(
                "/fixtures",
                {
                    league:
                        LEAGUE_ID,

                    season:
                        SEASON
                }
            );


        const response =
            fixtures.response ||
            [];


        if (
            response.length
        ) {

            /*
             * En caso de disponer de la temporada,
             * incorporamos información adicional.
             */

            for (
                const fixture
                of response
            ) {

                const id =
                    fixture.fixture?.id;


                const match =
                    data.matches.find(
                        x =>
                            String(
                                x.apiFootballId
                            ) ===
                            String(id)
                    );


                if (match) {

                    match.apiFootball =
                        fixture;

                }

            }

        }

    } catch (error) {

        /*
         * MUY IMPORTANTE:
         *
         * No hacemos process.exit(1).
         *
         * El problema de temporada de la cuenta Free
         * no debe impedir que ESPN actualice nuestra web.
         */

        console.warn(
            "API-Football no disponible para 2026/27:",
            error.message
        );

    }

}


// ============================================================
// DETALLES API-FOOTBALL
// ============================================================

async function getFixtureDetails(
    ids
) {

    if (!API_KEY) {

        return [];

    }


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


        try {

            const result =
                await apiFootball(
                    "/fixtures",
                    {
                        ids:
                            chunk.join("-")
                    }
                );


            results.push(
                ...(result.response || [])
            );

        } catch (error) {

            console.warn(
                "Error obteniendo detalles:",
                error.message
            );

        }

    }


    return results;

}


// ============================================================
// DETALLES
// ============================================================

function saveFixtureDetails(
    match,
    fixture
) {

    const lineups = [];


    for (
        const lineup
        of fixture.lineups || []
    ) {

        lineups.push({

            teamId:
                lineup.team?.id ||
                null,

            teamName:
                lineup.team?.name ||
                null,

            formation:
                lineup.formation ||
                null,

            coach:
                lineup.coach
                    ? {

                        id:
                            lineup.coach.id ||
                            null,

                        name:
                            lineup.coach.name ||
                            null

                    }
                    : null,

            starters:
                safeArray(
                    lineup.startXI
                )
                .map(
                    player => ({

                        id:
                            player.player?.id ||
                            null,

                        name:
                            player.player?.name ||
                            null,

                        number:
                            player.player?.number ||
                            null,

                        position:
                            player.player?.pos ||
                            null,

                        grid:
                            player.player?.grid ||
                            null

                    })
                ),

            substitutes:
                safeArray(
                    lineup.substitutes
                )
                .map(
                    player => ({

                        id:
                            player.player?.id ||
                            null,

                        name:
                            player.player?.name ||
                            null,

                        number:
                            player.player?.number ||
                            null,

                        position:
                            player.player?.pos ||
                            null

                    })
                )

        });

    }


    const statistics = [];


    for (
        const teamStats
        of fixture.statistics || []
    ) {

        const stats =
            teamStats.statistics ||
            [];


        const statisticValue =
            type => {

                const item =
                    stats.find(
                        x =>
                            String(
                                x.type
                            )
                            .toLowerCase() ===
                            String(
                                type
                            )
                            .toLowerCase()
                    );

                return item?.value ??
                    null;

            };


        statistics.push({

            teamId:
                teamStats.team?.id ||
                null,

            teamName:
                teamStats.team?.name ||
                null,

            possession:
                percentage(
                    statisticValue(
                        "Ball Possession"
                    )
                ),

            shotsTotal:
                statisticValue(
                    "Total Shots"
                ),

            shotsOnTarget:
                statisticValue(
                    "Shots on Goal"
                ),

            shotsOffTarget:
                statisticValue(
                    "Shots off Goal"
                ),

            blockedShots:
                statisticValue(
                    "Blocked Shots"
                ),

            corners:
                statisticValue(
                    "Corner Kicks"
                ),

            fouls:
                statisticValue(
                    "Fouls"
                ),

            offsides:
                statisticValue(
                    "Offsides"
                ),

            yellowCards:
                statisticValue(
                    "Yellow Cards"
                ),

            redCards:
                statisticValue(
                    "Red Cards"
                ),

            goalkeeperSaves:
                statisticValue(
                    "Goalkeeper Saves"
                ),

            passes:
                statisticValue(
                    "Total passes"
                ),

            accuratePasses:
                statisticValue(
                    "Passes accurate"
                )

        });

    }


    const players = [];


    for (
        const teamPlayers
        of fixture.players || []
    ) {

        players.push({

            teamId:
                teamPlayers.team?.id ||
                null,

            teamName:
                teamPlayers.team?.name ||
                null,

            players:
                safeArray(
                    teamPlayers.players
                )
                .map(
                    player => ({

                        id:
                            player.player?.id ||
                            null,

                        name:
                            player.player?.name ||
                            null,

                        statistics:
                            player.statistics ||
                            []

                    })
                )

        });

    }


    const events =
        safeArray(
            fixture.events
        )
        .map(
            event => ({

                minute:
                    event.time?.elapsed ||
                    null,

                extra:
                    event.time?.extra ||
                    null,

                teamId:
                    event.team?.id ||
                    null,

                player:
                    event.player?.name ||
                    null,

                assist:
                    event.assist?.name ||
                    null,

                type:
                    event.type ||
                    null,

                detail:
                    event.detail ||
                    null

            })
        );


    match.details = {

        updatedAt:
            new Date().toISOString(),

        lineups,

        statistics,

        players,

        events

    };

}


// ============================================================
// BALANCE
// ============================================================

function updatePredictionBalance(
    data
) {

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
                .includes(
                    match.status
                )
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

            balance.bySign[prediction]
                .total++;


            if (correct) {

                balance.bySign[prediction]
                    .correct++;

            }

        }


        const difficulty =
            match.prediction.difficulty ||
            "media";


        if (
            balance.byDifficulty[
                difficulty
            ]
        ) {

            balance.byDifficulty[
                difficulty
            ].total++;


            if (correct) {

                balance.byDifficulty[
                    difficulty
                ].correct++;

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


// ============================================================
// ACTUALIZAR RESULTADOS
// ============================================================

function updateResults(
    data
) {

    for (
        const match
        of data.matches
    ) {

        if (
            ["FT", "AET", "PEN"]
                .includes(
                    match.status
                )
        ) {

            match.result =
                getResult(
                    match
                );

        }

    }

}


// ============================================================
// PRONÓSTICOS
// ============================================================

function updatePredictions(
    data,
    now
) {

    for (
        const match
        of data.matches
    ) {

        if (
            !match.timestamp
        ) {
            continue;
        }


        if (
            match.timestamp <=
            now
        ) {
            continue;
        }


        /*
         * Los partidos sin estadísticas
         * suficientes reciben igualmente
         * un pronóstico básico.
         */

        const hours =
            (
                match.timestamp -
                now
            ) /
            3600;


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
                    new Date()
                        .toISOString();

            }

        } else if (
            !match.prediction.lockedAt &&
            hours <= 12
        ) {

            match.prediction.lockedAt =
                new Date()
                    .toISOString();

        }

    }

}


// ============================================================
// MAIN
// ============================================================

async function main() {

    const data =
        await loadData();


    const now =
        Math.floor(
            Date.now() /
            1000
        );


    console.log(
        "=========================================="
    );

    console.log(
        "ACTUALIZACIÓN LALIGA 2026/27"
    );

    console.log(
        "=========================================="
    );


    // ========================================================
    // 1. CALENDARIO ESPN
    // ========================================================

    console.log(
        "1. Descargando calendario..."
    );


    const espnFixtures =
        await getSeasonFixturesESPN();


    mergeESPNFixtures(
        data,
        espnFixtures
    );


    console.log(
        `Partidos ESPN incorporados: ${espnFixtures.length}`
    );


    // ========================================================
    // 2. CLASIFICACIÓN
    // ========================================================

    console.log(
        "2. Descargando clasificación..."
    );


    await updateStandingsESPN(
        data
    );


    // ========================================================
    // 3. GOLEADORES
    // ========================================================

    console.log(
        "3. Descargando goleadores..."
    );


    await updateScorers(
        data
    );


    /*
     * Si estamos al principio de temporada
     * y todavía no hay goleadores, dejamos
     * explícitamente la tabla a cero.
     */

    if (
        !data.scorers.length
    ) {

        data.scorers = [];

    }


    // ========================================================
    // 4. NOTICIAS
    // ========================================================

    console.log(
        "4. Descargando noticias..."
    );


    await updateNews(
        data
    );


    // ========================================================
    // 5. API-FOOTBALL
    // ========================================================

    console.log(
        "5. Comprobando datos complementarios..."
    );


    await tryAPIfootballEnhancement(
        data
    );


    // ========================================================
    // 6. DETALLES
    // ========================================================

    console.log(
        "6. Buscando partidos que necesitan detalles..."
    );


    const recentLimit =
        now -
        14 *
        24 *
        60 *
        60;


    const futureLimit =
        now +
        10 *
        24 *
        60 *
        60;


    const candidates =
        data.matches

            .filter(
                match => {

                    const timestamp =
                        match.timestamp ||
                        0;


                    const finished =
                        [
                            "FT",
                            "AET",
                            "PEN"
                        ]
                        .includes(
                            match.status
                        );


                    const recent =
                        timestamp >=
                        recentLimit;


                    const upcoming =
                        timestamp >= now &&
                        timestamp <=
                        futureLimit;


                    return (

                        !match.details &&

                        (
                            (
                                finished &&
                                recent
                            ) ||

                            upcoming

                        ) &&

                        match.apiFootballId

                    );

                }
            )

            .slice(
                0,
                MAX_DETAIL_FIXTURES
            );


    if (
        candidates.length &&
        API_KEY
    ) {

        const details =
            await getFixtureDetails(
                candidates.map(
                    x =>
                        x.apiFootballId
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
                    match.apiFootballId
                );


            if (
                fixture
            ) {

                saveFixtureDetails(
                    match,
                    fixture
                );

            }

        }

    }


    // ========================================================
    // 7. RESULTADOS
    // ========================================================

    console.log(
        "7. Actualizando resultados..."
    );


    updateResults(
        data
    );


    // ========================================================
    // 8. PRONÓSTICOS
    // ========================================================

    console.log(
        "8. Actualizando pronósticos..."
    );


    updatePredictions(
        data,
        now
    );


    // ========================================================
    // 9. BALANCE
    // ========================================================

    console.log(
        "9. Calculando balance..."
    );


    updatePredictionBalance(
        data
    );


    // ========================================================
    // 10. METADATOS
    // ========================================================

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
            "ESPN + API-Football",

        primarySource:
            "ESPN",

        secondarySource:
            API_KEY
                ? "API-Football"
                : null,

        generatedAt:
            new Date()
                .toISOString(),

        requestsThisRun,

        apiFootballSeasonAvailable:
            false

    };


    // ========================================================
    // 11. GUARDAR
    // ========================================================

    await fs.mkdir(
        path.dirname(
            DATA_FILE
        ),
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
        `Noticias: ${data.news.length}`
    );

    console.log(
        `Peticiones API-Football: ${requestsThisRun}`
    );

    console.log(
        `Aciertos: ${data.predictionBalance.correct}/${data.predictionBalance.total}`
    );

    console.log(
        `Precisión: ${data.predictionBalance.accuracy}%`
    );

    console.log(
        "=========================================="
    );

}


main()
    .catch(
        error => {

            console.error(
                "ERROR FATAL:",
                error
            );

            process.exit(1);

        }
    );
