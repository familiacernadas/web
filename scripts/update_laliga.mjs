/**
 * ============================================================
 * FAMILIA CERNADAS
 * ACTUALIZADOR AUTOMÁTICO LALIGA 2026/27
 *
 * VERSIÓN 3.0
 * ============================================================
 *
 * FUENTES
 * ------------------------------------------------------------
 * 1. ESPN
 *    - Calendario
 *    - Clasificación
 *    - Estadísticas
 *    - Goleadores
 *    - Noticias
 *    - Resúmenes de partidos
 *
 * 2. API-FOOTBALL
 *    - Fuente secundaria cuando está disponible
 *
 * ============================================================
 *
 * OBJETIVO DE LA VERSIÓN 3.0
 * ------------------------------------------------------------
 *
 * Construir una base histórica que permita mejorar
 * progresivamente el modelo de pronósticos.
 *
 * El sistema almacena:
 *
 * - resultados
 * - forma
 * - local/visitante
 * - goles
 * - estadísticas de partido
 * - formaciones
 * - porteros
 * - lesiones
 * - noticias
 * - probabilidades
 * - dificultad
 * - aciertos
 *
 * y posteriormente permite estudiar qué variables son
 * realmente predictivas.
 *
 * ============================================================
 */

import fs from "node:fs/promises";
import path from "node:path";


// ============================================================
// CONFIGURACIÓN
// ============================================================

const ESPN_BASE =
    "https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1";

const ESPN_CORE_BASE =
    "https://sports.core.api.espn.com/v2/sports/soccer/leagues/esp.1";

const API_FOOTBALL_BASE =
    "https://v3.football.api-sports.io";

const API_KEY =
    process.env.API_FOOTBALL_KEY || null;

const LEAGUE_ID = 140;

const SEASON = 2026;

const SEASON_LABEL = "2026/27";

const DATA_FILE =
    path.resolve("data/laliga_2026_27.json");


// ============================================================
// CONTROL DE PETICIONES
// ============================================================

let requestsThisRun = 0;

const MAX_REQUESTS = 90;

const MAX_DETAIL_FIXTURES = 60;

const DETAIL_BATCH_SIZE = 20;


// ============================================================
// UTILIDADES
// ============================================================

function sleep(ms) {

    return new Promise(
        resolve => setTimeout(resolve, ms)
    );

}


function number(value, fallback = 0) {

    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : fallback;

}


function nullableNumber(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : null;

}


function percentage(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    const n =
        Number(
            String(value)
                .replace("%", "")
                .trim()
        );

    return Number.isFinite(n)
        ? n
        : null;

}


function round(value, decimals = 4) {

    if (!Number.isFinite(Number(value))) {
        return null;
    }

    return Number(
        Number(value).toFixed(decimals)
    );

}


function statisticValue(statistics, type) {

    if (!Array.isArray(statistics)) {
        return null;
    }

    const wanted =
        String(type)
            .toLowerCase();

    const item =
        statistics.find(
            x =>
                String(x.type || "")
                    .toLowerCase() === wanted
        );

    return item?.value ?? null;

}


function resultFromScore(home, away) {

    if (
        home === null ||
        home === undefined ||
        away === null ||
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


function isFinished(status) {

    return [
        "FT",
        "AET",
        "PEN"
    ].includes(status);

}


function safeArray(value) {

    return Array.isArray(value)
        ? value
        : [];

}


// ============================================================
// HTTP GENÉRICO
// ============================================================

async function fetchJSON(
    url,
    options = {},
    label = "HTTP"
) {

    if (
        requestsThisRun >=
        MAX_REQUESTS
    ) {

        throw new Error(
            "Límite de seguridad de peticiones alcanzado."
        );

    }


    requestsThisRun++;


    console.log(
        `HTTP ${requestsThisRun}: ${label}`
    );


    const response =
        await fetch(
            url,
            options
        );


    const text =
        await response.text();


    let json;


    try {

        json =
            JSON.parse(text);

    } catch {

        throw new Error(
            `${label}: respuesta no JSON HTTP ${response.status}`
        );

    }


    if (!response.ok) {

        throw new Error(
            `${label}: HTTP ${response.status}: ` +
            JSON.stringify(json)
        );

    }


    await sleep(120);


    return json;

}


// ============================================================
// ESPN
// ============================================================

async function espn(
    url,
    label
) {

    return fetchJSON(
        url,
        {},
        label
    );

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


    return fetchJSON(
        url,
        {
            headers: {
                "x-apisports-key":
                    API_KEY
            }
        },
        `API-Football ${endpoint}`
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


        data.meta ||= {};

        data.matches ||= [];

        data.standings ||= [];

        data.scorers ||= [];

        data.injuries ||= [];

        data.news ||= [];

        data.predictionBalance ||= {};

        data.modelLearning ||= {};

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
                    SEASON_LABEL
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
            },

            modelLearning: {}

        };

    }

}


// ============================================================
// CALENDARIO ESPN
// ============================================================

async function getCalendar() {

    const start =
        "20260801";

    const end =
        "20270601";


    const url =
        `${ESPN_BASE}/scoreboard` +
        `?limit=1000` +
        `&dates=${start}-${end}`;


    const data =
        await espn(
            url,
            "ESPN LaLiga calendario"
        );


    return safeArray(
        data.events
    );

}


// ============================================================
// NORMALIZAR PARTIDO ESPN
// ============================================================

function normalizeESPNMatch(event) {

    const competition =
        event.competitions?.[0];

    const home =
        competition?.competitors?.find(
            x => x.homeAway === "home"
        );

    const away =
        competition?.competitors?.find(
            x => x.homeAway === "away"
        );


    const status =
        competition?.status ||
        event.status ||
        {};


    const completed =
        status.type?.completed === true;


    const homeScore =
        home?.score !== undefined
            ? nullableNumber(home.score)
            : null;


    const awayScore =
        away?.score !== undefined
            ? nullableNumber(away.score)
            : null;


    return {

        id:
            Number(event.id),

        uid:
            event.uid || null,

        date:
            event.date || null,

        timestamp:
            event.date
                ? Math.floor(
                    new Date(event.date)
                        .getTime() / 1000
                )
                : null,

        status:
            completed
                ? "FT"
                : (
                    status.type?.name ||
                    status.type?.abbreviation ||
                    "NS"
                ),

        statusLong:
            status.type?.description ||
            null,

        round:
            event.week?.number ||
            null,

        season:
            SEASON,

        home: {

            id:
                Number(home?.team?.id),

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
                Number(away?.team?.id),

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

        venue: {

            name:
                competition?.venue?.fullName ||
                null,

            city:
                competition?.venue?.address?.city ||
                null

        },

        score: {

            halftime: null,

            fulltime: {

                home:
                    homeScore,

                away:
                    awayScore

            },

            extratime: null,

            penalty: null

        },

        result:
            resultFromScore(
                homeScore,
                awayScore
            )

    };

}


// ============================================================
// FUSIONAR CALENDARIO
// ============================================================

function mergeCalendar(
    data,
    events
) {

    const map =
        new Map(
            data.matches.map(
                match => [
                    String(match.id),
                    match
                ]
            )
        );


    for (
        const event
        of events
    ) {

        const normalized =
            normalizeESPNMatch(event);


        if (
            !normalized.id ||
            !normalized.home?.id ||
            !normalized.away?.id
        ) {
            continue;
        }


        const key =
            String(normalized.id);


        const old =
            map.get(key);


        if (old) {

            const prediction =
                old.prediction;

            const details =
                old.details;

            const model =
                old.modelFeatures;

            const historical =
                old.historical;


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


            if (model) {
                old.modelFeatures =
                    model;
            }


            if (historical) {
                old.historical =
                    historical;
            }

        } else {

            map.set(
                key,
                normalized
            );

        }

    }


    data.matches =
        Array.from(
            map.values()
        )
        .sort(
            (a, b) =>
                (a.timestamp || 0) -
                (b.timestamp || 0)
        );

}


// ============================================================
// CLASIFICACIÓN ESPN
// ============================================================

async function getStandings() {

    const url =
        `${ESPN_BASE}/standings`;


    const data =
        await espn(
            url,
            "ESPN LaLiga clasificación"
        );


    const entries =
        data.standings?.entries ||
        data.children?.[0]?.standings?.entries ||
        [];


    return entries.map(
        row => {

            const stats =
                {};


            for (
                const item
                of safeArray(row.stats)
            ) {

                if (item.name) {

                    stats[item.name] =
                        item.value;

                }

            }


            const team =
                row.team || {};


            return {

                rank:
                    nullableNumber(
                        row.position
                    ),

                team: {

                    id:
                        Number(team.id),

                    name:
                        team.displayName ||
                        team.name ||
                        null,

                    abbreviation:
                        team.abbreviation ||
                        null,

                    logo:
                        team.logos?.[0]?.href ||
                        null

                },

                points:
                    nullableNumber(
                        stats.points
                    ),

                played:
                    nullableNumber(
                        stats.gamesPlayed
                    ),

                wins:
                    nullableNumber(
                        stats.wins
                    ),

                draws:
                    nullableNumber(
                        stats.ties
                    ),

                losses:
                    nullableNumber(
                        stats.losses
                    ),

                gf:
                    nullableNumber(
                        stats.pointsFor
                    ),

                ga:
                    nullableNumber(
                        stats.pointsAgainst
                    ),

                goalsDiff:
                    nullableNumber(
                        stats.pointDifferential
                    ),

                form:
                    row.form ||
                    null,

                home:
                    null,

                away:
                    null

            };

        }
    );

}


// ============================================================
// GOLEADORES ESPN
// ============================================================

async function getScorers() {

    /*
     * NO utilizamos:
     *
     * /leaders
     *
     * porque ESPN devuelve:
     *
     * getLeadersAllTime not supported
     *
     * para soccer/esp.1.
     *
     * Utilizamos el endpoint de estadísticas.
     */

    const url =
        `${ESPN_BASE}/statistics`;


    const data =
        await espn(
            url,
            "ESPN goleadores"
        );


    const athletes =
        data.athletes ||
        data.players ||
        data.results ||
        [];


    const rows = [];


    for (
        const item
        of athletes
    ) {

        const athlete =
            item.athlete ||
            item.player ||
            item;


        const stats =
            item.statistics ||
            item.stats ||
            {};


        const goals =
            nullableNumber(
                stats.goals ??
                stats.totalGoals ??
                stats.soccerGoals ??
                item.goals
            );


        if (
            goals === null
        ) {
            continue;
        }


        rows.push({

            player: {

                id:
                    athlete.id ||
                    null,

                name:
                    athlete.displayName ||
                    athlete.fullName ||
                    athlete.name ||
                    null,

                shortName:
                    athlete.shortName ||
                    null,

                photo:
                    athlete.headshot?.href ||
                    null

            },

            team:
                item.team ||
                athlete.team ||
                null,

            goals: {

                total:
                    goals,

                assists:
                    nullableNumber(
                        stats.assists ??
                        item.assists
                    )

            },

            appearances:
                nullableNumber(
                    stats.appearances ??
                    stats.games ??
                    item.appearances
                ),

            minutes:
                nullableNumber(
                    stats.minutes ??
                    item.minutes
                ),

            rating:
                stats.rating ??
                item.rating ??
                null

        });

    }


    rows.sort(
        (a, b) =>
            number(
                b.goals?.total
            ) -
            number(
                a.goals?.total
            )
    );


    return rows.slice(
        0,
        20
    );

}


// ============================================================
// NOTICIAS
// ============================================================

async function getNews() {

    const url =
        `${ESPN_BASE}/news`;


    const data =
        await espn(
            url,
            "ESPN noticias"
        );


    return safeArray(
        data.articles
    )
    .slice(0, 20)
    .map(
        article => ({

            id:
                article.id ||
                null,

            headline:
                article.headline ||
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

}


// ============================================================
// LESIONES
// ============================================================

async function getInjuries() {

    /*
     * ESPN no siempre ofrece lesiones para LaLiga
     * mediante este endpoint.
     *
     * Si no existe información, devolvemos [].
     */

    try {

        const url =
            `${ESPN_BASE}/injuries`;


        const data =
            await espn(
                url,
                "ESPN lesiones"
            );


        return safeArray(
            data.injuries
        );

    } catch {

        console.warn(
            "ESPN lesiones no disponible."
        );

        return [];

    }

}


// ============================================================
// RESUMEN / DETALLES DE PARTIDO
// ============================================================

async function getMatchSummary(
    id
) {

    const url =
        `${ESPN_BASE}/summary?event=${id}`;


    return espn(
        url,
        `ESPN resumen partido ${id}`
    );

}


// ============================================================
// NORMALIZAR DETALLES
// ============================================================

function extractMatchDetails(
    summary
) {

    const details = {

        updatedAt:
            new Date().toISOString(),

        lineups: [],

        statistics: [],

        players: [],

        events: [],

        formations: [],

        goalkeepers: [],

        injuries: []

    };


    // --------------------------------------------------------
    // ALINEACIONES
    // --------------------------------------------------------

    for (
        const lineup
        of safeArray(summary.rosters)
    ) {

        const team =
            lineup.team || {};


        const formation =
            lineup.formation ||
            lineup.formationName ||
            null;


        const players =
            safeArray(
                lineup.roster
            )
            .map(
                player => ({

                    id:
                        player.athlete?.id ||
                        null,

                    name:
                        player.athlete?.displayName ||
                        null,

                    position:
                        player.position?.abbreviation ||
                        player.position?.name ||
                        null,

                    starter:
                        player.starter === true,

                    substitute:
                        player.substitute === true,

                    minutes:
                        nullableNumber(
                            player.minutes
                        )

                })
            );


        details.lineups.push({

            teamId:
                Number(team.id) ||
                null,

            teamName:
                team.displayName ||
                team.name ||
                null,

            formation,

            players

        });


        if (formation) {

            details.formations.push({

                teamId:
                    Number(team.id) ||
                    null,

                teamName:
                    team.displayName ||
                    team.name ||
                    null,

                formation

            });

        }

    }


    // --------------------------------------------------------
    // ESTADÍSTICAS
    // --------------------------------------------------------

    for (
        const teamStats
        of safeArray(summary.boxscore?.teams)
    ) {

        const team =
            teamStats.team ||
            {};


        const statistics = {};


        for (
            const stat
            of safeArray(
                teamStats.statistics
            )
        ) {

            if (!stat.name) {
                continue;
            }


            statistics[stat.name] =
                stat.displayValue ??
                stat.value ??
                null;

        }


        details.statistics.push({

            teamId:
                Number(team.id) ||
                null,

            teamName:
                team.displayName ||
                team.name ||
                null,

            possession:
                percentage(
                    statistics.possession
                ),

            shotsTotal:
                nullableNumber(
                    statistics.shots
                ),

            shotsOnTarget:
                nullableNumber(
                    statistics.shotsOnTarget
                ),

            corners:
                nullableNumber(
                    statistics.corners
                ),

            fouls:
                nullableNumber(
                    statistics.fouls
                ),

            offsides:
                nullableNumber(
                    statistics.offsides
                ),

            yellowCards:
                nullableNumber(
                    statistics.yellowCards
                ),

            redCards:
                nullableNumber(
                    statistics.redCards
                ),

            goalkeeperSaves:
                nullableNumber(
                    statistics.saves
                ),

            passes:
                nullableNumber(
                    statistics.passes
                ),

            accuratePasses:
                nullableNumber(
                    statistics.accuratePasses
                ),

            raw:
                statistics

        });

    }


    // --------------------------------------------------------
    // JUGADORES
    // --------------------------------------------------------

    for (
        const teamPlayers
        of safeArray(
            summary.boxscore?.players
        )
    ) {

        const team =
            teamPlayers.team ||
            {};


        details.players.push({

            teamId:
                Number(team.id) ||
                null,

            teamName:
                team.displayName ||
                team.name ||
                null,

            players:
                safeArray(
                    teamPlayers.statistics
                )

        });

    }


    // --------------------------------------------------------
    // EVENTOS
    // --------------------------------------------------------

    for (
        const event
        of safeArray(
            summary.keyEvents
        )
    ) {

        details.events.push({

            id:
                event.id ||
                null,

            clock:
                event.clock?.displayValue ||
                null,

            minute:
                nullableNumber(
                    event.clock?.value
                ),

            teamId:
                Number(
                    event.team?.id
                ) || null,

            teamName:
                event.team?.displayName ||
                null,

            type:
                event.type?.text ||
                event.type?.name ||
                null,

            text:
                event.text ||
                null,

            athlete:
                event.athletes?.[0]?.athlete?.displayName ||
                event.athlete?.displayName ||
                null

        });

    }


    return details;

}


// ============================================================
// HISTORIAL DE EQUIPO
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
                match.timestamp < beforeTimestamp &&

                isFinished(
                    match.status
                ) &&

                (
                    Number(match.home?.id) ===
                    Number(teamId) ||

                    Number(match.away?.id) ===
                    Number(teamId)
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

function aggregateTeamMatches(
    matches,
    teamId
) {

    let gf = 0;

    let ga = 0;

    let points = 0;

    let wins = 0;

    let draws = 0;

    let losses = 0;


    for (
        const match
        of matches
    ) {

        const home =
            Number(match.home?.id) ===
            Number(teamId);


        const scored =
            home
                ? nullableNumber(
                    match.score?.fulltime?.home
                )
                : nullableNumber(
                    match.score?.fulltime?.away
                );


        const conceded =
            home
                ? nullableNumber(
                    match.score?.fulltime?.away
                )
                : nullableNumber(
                    match.score?.fulltime?.home
                );


        if (
            scored === null ||
            conceded === null
        ) {
            continue;
        }


        gf += scored;

        ga += conceded;


        if (scored > conceded) {

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


    const played =
        matches.length;


    return {

        matches:
            played,

        gf,

        ga,

        goalDifference:
            gf - ga,

        gfPerGame:
            played
                ? round(
                    gf / played,
                    3
                )
                : 0,

        gaPerGame:
            played
                ? round(
                    ga / played,
                    3
                )
                : 0,

        points,

        pointsPerGame:
            played
                ? round(
                    points / played,
                    3
                )
                : 0,

        wins,

        draws,

        losses

    };

}


// ============================================================
// MÉTRICAS COMPLETAS DEL EQUIPO
// ============================================================

function teamMetrics(
    data,
    teamId,
    timestamp
) {

    const all =
        teamHistory(
            data,
            teamId,
            timestamp
        );


    const home =
        all.filter(
            match =>
                Number(match.home?.id) ===
                Number(teamId)
        );


    const away =
        all.filter(
            match =>
                Number(match.away?.id) ===
                Number(teamId)
        );


    const last5 =
        all.slice(-5);


    const last10 =
        all.slice(-10);


    const last3 =
        all.slice(-3);


    return {

        all:
            aggregateTeamMatches(
                all,
                teamId
            ),

        last3:
            aggregateTeamMatches(
                last3,
                teamId
            ),

        last5:
            aggregateTeamMatches(
                last5,
                teamId
            ),

        last10:
            aggregateTeamMatches(
                last10,
                teamId
            ),

        home:
            aggregateTeamMatches(
                home,
                teamId
            ),

        away:
            aggregateTeamMatches(
                away,
                teamId
            )

    };

}


// ============================================================
// PORTEROS
// ============================================================

function goalkeeperMetrics(
    data,
    teamId,
    timestamp
) {

    let saves = 0;

    let conceded = 0;

    let matches = 0;


    for (
        const match
        of teamHistory(
            data,
            teamId,
            timestamp
        )
    ) {

        const statistics =
            safeArray(
                match.details?.statistics
            );


        const row =
            statistics.find(
                x =>
                    Number(x.teamId) ===
                    Number(teamId)
            );


        if (!row) {
            continue;
        }


        const saveValue =
            nullableNumber(
                row.goalkeeperSaves
            );


        const home =
            Number(match.home?.id) ===
            Number(teamId);


        const goalsAgainst =
            home
                ? nullableNumber(
                    match.score?.fulltime?.away
                )
                : nullableNumber(
                    match.score?.fulltime?.home
                );


        if (
            saveValue !== null
        ) {

            saves += saveValue;

        }


        if (
            goalsAgainst !== null
        ) {

            conceded +=
                goalsAgainst;

        }


        matches++;

    }


    const shots =
        saves +
        conceded;


    return {

        matches,

        saves,

        conceded,

        shots,

        savePercentage:
            shots
                ? round(
                    saves /
                    shots *
                    100,
                    2
                )
                : null,

        savesPerGame:
            matches
                ? round(
                    saves /
                    matches,
                    2
                )
                : null

    };

}


// ============================================================
// FORMACIONES
// ============================================================

function formationMetrics(
    data,
    teamId,
    timestamp
) {

    const formations = {};


    for (
        const match
        of teamHistory(
            data,
            teamId,
            timestamp
        )
    ) {

        const lineup =
            safeArray(
                match.details?.lineups
            )
            .find(
                row =>
                    Number(row.teamId) ===
                    Number(teamId)
            );


        if (
            !lineup?.formation
        ) {
            continue;
        }


        const formation =
            lineup.formation;


        formations[formation] ||= {

            matches: 0,

            wins: 0,

            draws: 0,

            losses: 0,

            gf: 0,

            ga: 0,

            points: 0

        };


        const row =
            formations[formation];


        const home =
            Number(match.home?.id) ===
            Number(teamId);


        const gf =
            home
                ? nullableNumber(
                    match.score?.fulltime?.home
                )
                : nullableNumber(
                    match.score?.fulltime?.away
                );


        const ga =
            home
                ? nullableNumber(
                    match.score?.fulltime?.away
                )
                : nullableNumber(
                    match.score?.fulltime?.home
                );


        if (
            gf === null ||
            ga === null
        ) {
            continue;
        }


        row.matches++;

        row.gf += gf;

        row.ga += ga;


        if (gf > ga) {

            row.wins++;

            row.points += 3;

        } else if (
            gf === ga
        ) {

            row.draws++;

            row.points++;

        } else {

            row.losses++;

        }

    }


    for (
        const row
        of Object.values(formations)
    ) {

        row.pointsPerGame =
            row.matches
                ? round(
                    row.points /
                    row.matches,
                    3
                )
                : 0;

        row.winRate =
            row.matches
                ? round(
                    row.wins /
                    row.matches *
                    100,
                    2
                )
                : 0;

    }


    return formations;

}


// ============================================================
// COMPARACIÓN DE FORMACIONES
// ============================================================

function formationAdvantage(
    homeFormations,
    awayFormations
) {

    const homeRows =
        Object.entries(
            homeFormations
        );


    const awayRows =
        Object.entries(
            awayFormations
        );


    if (
        !homeRows.length &&
        !awayRows.length
    ) {

        return null;

    }


    const bestHome =
        homeRows.sort(
            (a, b) =>
                number(
                    b[1].pointsPerGame
                ) -
                number(
                    a[1].pointsPerGame
                )
        )[0] || null;


    const bestAway =
        awayRows.sort(
            (a, b) =>
                number(
                    b[1].pointsPerGame
                ) -
                number(
                    a[1].pointsPerGame
                )
        )[0] || null;


    return {

        home:
            bestHome
                ? {
                    formation:
                        bestHome[0],

                    stats:
                        bestHome[1]
                }
                : null,

        away:
            bestAway
                ? {
                    formation:
                        bestAway[0],

                    stats:
                        bestAway[1]
                }
                : null

    };

}


// ============================================================
// LESIONES POR EQUIPO
// ============================================================

function teamInjuries(
    data,
    teamId
) {

    return safeArray(
        data.injuries
    )
    .filter(
        injury =>
            Number(
                injury.team?.id ||
                injury.teamId
            ) ===
            Number(teamId)
    );

}


// ============================================================
// FACTORES DEL MODELO
// ============================================================

function buildModelFeatures(
    data,
    match
) {

    const timestamp =
        match.timestamp;


    const homeId =
        match.home.id;


    const awayId =
        match.away.id;


    const home =
        teamMetrics(
            data,
            homeId,
            timestamp
        );


    const away =
        teamMetrics(
            data,
            awayId,
            timestamp
        );


    const homeGK =
        goalkeeperMetrics(
            data,
            homeId,
            timestamp
        );


    const awayGK =
        goalkeeperMetrics(
            data,
            awayId,
            timestamp
        );


    const homeFormations =
        formationMetrics(
            data,
            homeId,
            timestamp
        );


    const awayFormations =
        formationMetrics(
            data,
            awayId,
            timestamp
        );


    const homeInjuries =
        teamInjuries(
            data,
            homeId
        );


    const awayInjuries =
        teamInjuries(
            data,
            awayId
        );


    return {

        home,

        away,

        homeGoalkeeper:
            homeGK,

        awayGoalkeeper:
            awayGK,

        homeFormations,

        awayFormations,

        formationAdvantage:
            formationAdvantage(
                homeFormations,
                awayFormations
            ),

        homeInjuries:
            homeInjuries.length,

        awayInjuries:
            awayInjuries.length,

        homeInjuryList:
            homeInjuries,

        awayInjuryList:
            awayInjuries

    };

}


// ============================================================
// PRONÓSTICO V3
// ============================================================

function createPrediction(
    data,
    match
) {

    const features =
        buildModelFeatures(
            data,
            match
        );


    const home =
        features.home;


    const away =
        features.away;


    /*
     * ========================================================
     * MODELO V3
     *
     * Los pesos están registrados explícitamente.
     *
     * Posteriormente podremos calcular qué peso funciona
     * mejor utilizando el histórico de aciertos.
     *
     * ========================================================
     */

    const weights = {

        form:
            0.30,

        attackDefense:
            0.25,

        homeAdvantage:
            0.12,

        goalkeeper:
            0.10,

        recentMomentum:
            0.10,

        formation:
            0.05,

        injuries:
            0.05,

        drawBase:
            0.03

    };


    let homeScore = 1;

    let awayScore = 1;


    // --------------------------------------------------------
    // FORMA
    // --------------------------------------------------------

    homeScore +=
        (
            number(
                home.last5.pointsPerGame
            ) -
            number(
                away.last5.pointsPerGame
            )
        ) *
        weights.form;


    awayScore +=
        (
            number(
                away.last5.pointsPerGame
            ) -
            number(
                home.last5.pointsPerGame
            )
        ) *
        weights.form;


    // --------------------------------------------------------
    // ATAQUE / DEFENSA
    // --------------------------------------------------------

    homeScore +=
        (
            number(
                home.home.gfPerGame
            ) -
            number(
                away.away.gaPerGame
            )
        ) *
        weights.attackDefense;


    awayScore +=
        (
            number(
                away.away.gfPerGame
            ) -
            number(
                home.home.gaPerGame
            )
        ) *
        weights.attackDefense;


    // --------------------------------------------------------
    // LOCALÍA
    // --------------------------------------------------------

    homeScore +=
        weights.homeAdvantage;


    // --------------------------------------------------------
    // MOMENTO RECIENTE
    // --------------------------------------------------------

    homeScore +=
        (
            number(
                home.last3.pointsPerGame
            ) -
            number(
                away.last3.pointsPerGame
            )
        ) *
        weights.recentMomentum;


    awayScore +=
        (
            number(
                away.last3.pointsPerGame
            ) -
            number(
                home.last3.pointsPerGame
            )
        ) *
        weights.recentMomentum;


    // --------------------------------------------------------
    // PORTEROS
    // --------------------------------------------------------

    if (
        features.homeGoalkeeper
            .savePercentage !== null
    ) {

        homeScore +=
            (
                features.homeGoalkeeper
                    .savePercentage -
                70
            ) /
            100 *
            weights.goalkeeper;

    }


    if (
        features.awayGoalkeeper
            .savePercentage !== null
    ) {

        awayScore +=
            (
                features.awayGoalkeeper
                    .savePercentage -
                70
            ) /
            100 *
            weights.goalkeeper;

    }


    // --------------------------------------------------------
    // FORMACIONES
    // --------------------------------------------------------

    const formation =
        features.formationAdvantage;


    if (
        formation?.home?.stats
    ) {

        homeScore +=
            (
                number(
                    formation.home.stats
                        .pointsPerGame
                ) -
                1.2
            ) *
            weights.formation;

    }


    if (
        formation?.away?.stats
    ) {

        awayScore +=
            (
                number(
                    formation.away.stats
                        .pointsPerGame
                ) -
                1.2
            ) *
            weights.formation;

    }


    // --------------------------------------------------------
    // LESIONES
    // --------------------------------------------------------

    /*
     * En esta fase no suponemos que toda lesión tenga
     * el mismo impacto.
     *
     * Simplemente aplicamos una penalización muy pequeña
     * para no sobrerreaccionar.
     */

    homeScore -=
        Math.min(
            features.homeInjuries,
            5
        ) *
        0.01 *
        weights.injuries;


    awayScore -=
        Math.min(
            features.awayInjuries,
            5
        ) *
        0.01 *
        weights.injuries;


    // --------------------------------------------------------
    // PROTECCIÓN
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // EMPATE
    // --------------------------------------------------------

    const difference =
        Math.abs(
            homeScore -
            awayScore
        );


    const drawScore =
        Math.max(
            0.15,
            0.75 -
            difference *
            0.18
        );


    // --------------------------------------------------------
    // NORMALIZAR
    // --------------------------------------------------------

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


    let sign =
        "X";


    if (
        p1 >= px &&
        p1 >= p2
    ) {

        sign =
            "1";

    } else if (
        p2 >= px &&
        p2 >= p1
    ) {

        sign =
            "2";

    }


    const confidence =
        Math.max(
            p1,
            px,
            p2
        );


    let difficulty;


    if (
        confidence >=
        0.58
    ) {

        difficulty =
            "fácil";

    } else if (
        confidence >=
        0.48
    ) {

        difficulty =
            "media";

    } else {

        difficulty =
            "difícil";

    }


    return {

        sign,

        probabilities: {

            "1":
                round(
                    p1,
                    4
                ),

            "X":
                round(
                    px,
                    4
                ),

            "2":
                round(
                    p2,
                    4
                )

        },

        confidence:
            round(
                confidence,
                4
            ),

        difficulty,

        generatedAt:
            new Date().toISOString(),

        lockedAt:
            null,

        model: {

            version:
                "3.0",

            weights

        },

        evidence:
            features

    };

}


// ============================================================
// BALANCE
// ============================================================

function updatePredictionBalance(
    data
) {

    const balance = {

        total:
            0,

        correct:
            0,

        incorrect:
            0,

        accuracy:
            0,

        bySign: {

            "1": {
                total: 0,
                correct: 0,
                accuracy: 0
            },

            "X": {
                total: 0,
                correct: 0,
                accuracy: 0
            },

            "2": {
                total: 0,
                correct: 0,
                accuracy: 0
            }

        },

        byDifficulty: {

            "fácil": {
                total: 0,
                correct: 0,
                accuracy: 0
            },

            "media": {
                total: 0,
                correct: 0,
                accuracy: 0
            },

            "difícil": {
                total: 0,
                correct: 0,
                accuracy: 0
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
            !isFinished(
                match.status
            )
        ) {
            continue;
        }


        const real =
            match.result ||
            resultFromScore(
                match.score?.fulltime?.home,
                match.score?.fulltime?.away
            );


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

        } else {

            balance.incorrect++;

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
            ? round(
                balance.correct /
                balance.total *
                100,
                2
            )
            : 0;


    for (
        const row
        of Object.values(
            balance.bySign
        )
    ) {

        row.accuracy =
            row.total
                ? round(
                    row.correct /
                    row.total *
                    100,
                    2
                )
                : 0;

    }


    for (
        const row
        of Object.values(
            balance.byDifficulty
        )
    ) {

        row.accuracy =
            row.total
                ? round(
                    row.correct /
                    row.total *
                    100,
                    2
                )
                : 0;

    }


    data.predictionBalance =
        balance;

}


// ============================================================
// APRENDIZAJE DEL MODELO
// ============================================================

function calculateModelLearning(
    data
) {

    const result = {

        version:
            "3.0",

        totalEvaluated:
            0,

        correct:
            0,

        accuracy:
            0,

        variables: {

            form:
                {
                    samples: 0,
                    correct: 0
                },

            attackDefense:
                {
                    samples: 0,
                    correct: 0
                },

            goalkeeper:
                {
                    samples: 0,
                    correct: 0
                },

            formation:
                {
                    samples: 0,
                    correct: 0
                },

            injuries:
                {
                    samples: 0,
                    correct: 0
                }

        },

        notes: [

            "La V3.0 registra las variables utilizadas en cada pronóstico.",

            "El sistema todavía no modifica automáticamente los pesos del modelo.",

            "Los pesos deben recalibrarse con una muestra suficiente de partidos.",

            "No se considera fiable optimizar el modelo con pocas jornadas."

        ]

    };


    for (
        const match
        of data.matches
    ) {

        if (
            !match.prediction?.sign ||
            !isFinished(
                match.status
            )
        ) {
            continue;
        }


        const real =
            match.result ||
            resultFromScore(
                match.score?.fulltime?.home,
                match.score?.fulltime?.away
            );


        if (!real) {
            continue;
        }


        const correct =
            match.prediction.sign ===
            real;


        result.totalEvaluated++;


        if (correct) {

            result.correct++;

        }


        for (
            const variable
            of Object.keys(
                result.variables
            )
        ) {

            if (
                match.prediction
                    ?.evidence
            ) {

                result.variables[
                    variable
                ].samples++;


                if (correct) {

                    result.variables[
                        variable
                    ].correct++;

                }

            }

        }

    }


    result.accuracy =
        result.totalEvaluated
            ? round(
                result.correct /
                result.totalEvaluated *
                100,
                2
            )
            : 0;


    for (
        const row
        of Object.values(
            result.variables
        )
    ) {

        row.accuracy =
            row.samples
                ? round(
                    row.correct /
                    row.samples *
                    100,
                    2
                )
                : 0;

    }


    data.modelLearning =
        result;

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
            isFinished(
                match.status
            )
        ) {

            const result =
                resultFromScore(
                    match.score?.fulltime?.home,
                    match.score?.fulltime?.away
                );


            if (result) {

                match.result =
                    result;

            }

        }

    }

}


// ============================================================
// DETALLES NECESARIOS
// ============================================================

function getDetailCandidates(
    data
) {

    const now =
        Math.floor(
            Date.now() / 1000
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


    return data.matches

        .filter(
            match => {

                const timestamp =
                    match.timestamp ||
                    0;


                const finished =
                    isFinished(
                        match.status
                    );


                const recent =
                    timestamp >=
                    recentLimit;


                const upcoming =
                    timestamp >=
                    now &&
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

                    )

                );

            }
        )

        .sort(
            (a, b) =>
                (a.timestamp || 0) -
                (b.timestamp || 0)
        )

        .slice(
            0,
            MAX_DETAIL_FIXTURES
        );

}


// ============================================================
// ACTUALIZAR DETALLES
// ============================================================

async function updateMatchDetails(
    data
) {

    const candidates =
        getDetailCandidates(
            data
        );


    if (!candidates.length) {

        console.log(
            "No hay partidos que necesiten detalles."
        );

        return;

    }


    console.log(
        `Obteniendo detalles para ${candidates.length} partidos`
    );


    for (
        const match
        of candidates
    ) {

        try {

            const summary =
                await getMatchSummary(
                    match.id
                );


            match.details =
                extractMatchDetails(
                    summary
                );

        } catch (error) {

            console.warn(
                `No se pudieron obtener detalles ${match.id}:`,
                error.message
            );

        }

    }

}


// ============================================================
// PRONÓSTICOS
// ============================================================

function updatePredictions(
    data
) {

    const now =
        Math.floor(
            Date.now() / 1000
        );


    for (
        const match
        of data.matches
    ) {

        if (
            !match.timestamp ||
            match.timestamp <= now
        ) {
            continue;
        }


        const hours =
            (
                match.timestamp -
                now
            ) /
            3600;


        /*
         * El pronóstico se genera normalmente.
         *
         * Se congela 12 horas antes.
         */

        if (
            !match.prediction
        ) {

            match.prediction =
                createPrediction(
                    data,
                    match
                );

        }


        if (
            !match.prediction.lockedAt &&
            hours <= 12
        ) {

            match.prediction.lockedAt =
                new Date().toISOString();

        }

    }

}


// ============================================================
// VALIDACIÓN
// ============================================================

function validateData(
    data
) {

    const errors = [];


    if (
        !Array.isArray(
            data.matches
        )
    ) {

        errors.push(
            "matches no es un array"
        );

    }


    if (
        !Array.isArray(
            data.standings
        )
    ) {

        errors.push(
            "standings no es un array"
        );

    }


    if (
        !Array.isArray(
            data.scorers
        )
    ) {

        errors.push(
            "scorers no es un array"
        );

    }


    if (
        data.matches.length >
        0
    ) {

        const ids =
            new Set();


        for (
            const match
            of data.matches
        ) {

            if (!match.id) {

                errors.push(
                    "Partido sin ID"
                );

            }


            if (
                ids.has(
                    String(match.id)
                )
            ) {

                errors.push(
                    `Partido duplicado: ${match.id}`
                );

            }


            ids.add(
                String(match.id)
            );

        }

    }


    if (
        errors.length
    ) {

        throw new Error(
            "VALIDACIÓN FALLIDA:\n" +
            errors.join("\n")
        );

    }

}


// ============================================================
// API-FOOTBALL SECUNDARIA
// ============================================================

async function checkAPIFootball(
    data
) {

    if (!API_KEY) {

        console.log(
            "API-Football no configurada."
        );

        return;

    }


    try {

        await apiFootball(
            "/standings",
            {
                league:
                    LEAGUE_ID,

                season:
                    SEASON
            }
        );


        data.meta.apiFootballSeasonAvailable =
            true;

    } catch (error) {

        console.warn(
            "API-Football no disponible para 2026:",
            error.message
        );


        data.meta.apiFootballSeasonAvailable =
            false;

    }

}


// ============================================================
// MAIN
// ============================================================

async function main() {

    const data =
        await loadData();


    console.log(
        "=========================================="
    );

    console.log(
        "ACTUALIZACIÓN LALIGA 2026/27"
    );

    console.log(
        "MODELO V3.0"
    );

    console.log(
        "=========================================="
    );


    // ========================================================
    // 1. CALENDARIO
    // ========================================================

    console.log(
        "1. Descargando calendario ESPN..."
    );


    try {

        const events =
            await getCalendar();


        console.log(
            `ESPN devuelve ${events.length} eventos.`
        );


        mergeCalendar(
            data,
            events
        );

    } catch (error) {

        console.error(
            "ERROR calendario:",
            error.message
        );


        if (
            data.matches.length === 0
        ) {

            throw error;

        }

    }


    // ========================================================
    // 2. CLASIFICACIÓN
    // ========================================================

    console.log(
        "2. Descargando clasificación ESPN..."
    );


    try {

        const standings =
            await getStandings();


        if (
            standings.length
        ) {

            data.standings =
                standings;

        }


        console.log(
            `Equipos en clasificación: ${data.standings.length}`
        );

    } catch (error) {

        console.warn(
            "No se pudo actualizar clasificación:",
            error.message
        );

    }


    // ========================================================
    // 3. GOLEADORES
    // ========================================================

    console.log(
        "3. Descargando goleadores ESPN..."
    );


    try {

        const scorers =
            await getScorers();


        if (
            scorers.length
        ) {

            data.scorers =
                scorers;

        }


        console.log(
            `Goleadores obtenidos: ${data.scorers.length}`
        );

    } catch (error) {

        console.warn(
            "No se pudieron actualizar goleadores:",
            error.message
        );

    }


    // ========================================================
    // 4. LESIONES
    // ========================================================

    console.log(
        "4. Descargando lesiones ESPN..."
    );


    try {

        data.injuries =
            await getInjuries();


        console.log(
            `Lesiones obtenidas: ${data.injuries.length}`
        );

    } catch (error) {

        console.warn(
            "Lesiones no disponibles:",
            error.message
        );

    }


    // ========================================================
    // 5. NOTICIAS
    // ========================================================

    console.log(
        "5. Descargando noticias ESPN..."
    );


    try {

        const news =
            await getNews();


        if (
            news.length
        ) {

            data.news =
                news;

        }


        console.log(
            `Noticias obtenidas: ${data.news.length}`
        );

    } catch (error) {

        console.warn(
            "Noticias no disponibles:",
            error.message
        );

    }


    // ========================================================
    // 6. API-FOOTBALL
    // ========================================================

    console.log(
        "6. Comprobando API-Football..."
    );


    await checkAPIFootball(
        data
    );


    // ========================================================
    // 7. DETALLES
    // ========================================================

    console.log(
        "7. Actualizando detalles de partidos..."
    );


    await updateMatchDetails(
        data
    );


    // ========================================================
    // 8. RESULTADOS
    // ========================================================

    console.log(
        "8. Actualizando resultados..."
    );


    updateResults(
        data
    );


    // ========================================================
    // 9. PRONÓSTICOS
    // ========================================================

    console.log(
        "9. Actualizando pronósticos..."
    );


    updatePredictions(
        data
    );


    // ========================================================
    // 10. BALANCE
    // ========================================================

    console.log(
        "10. Calculando balance..."
    );


    updatePredictionBalance(
        data
    );


    // ========================================================
    // 11. APRENDIZAJE
    // ========================================================

    console.log(
        "11. Analizando rendimiento del modelo..."
    );


    calculateModelLearning(
        data
    );


    // ========================================================
    // 12. METADATOS
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
            SEASON_LABEL,

        source:
            "ESPN + API-Football",

        primarySource:
            "ESPN",

        secondarySource:
            "API-Football",

        modelVersion:
            "3.0",

        generatedAt:
            new Date().toISOString(),

        requestsThisRun

    };


    // ========================================================
    // 13. VALIDACIÓN
    // ========================================================

    console.log(
        "12. Validando datos..."
    );


    validateData(
        data
    );


    // ========================================================
    // 14. GUARDAR
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


    // ========================================================
    // RESUMEN
    // ========================================================

    console.log(
        "=========================================="
    );

    console.log(
        "ACTUALIZACIÓN COMPLETADA"
    );

    console.log(
        "=========================================="
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
        `Lesiones: ${data.injuries.length}`
    );

    console.log(
        `Noticias: ${data.news.length}`
    );

    console.log(
        `Peticiones: ${requestsThisRun}`
    );

    console.log(
        `Aciertos acumulados: ` +
        `${data.predictionBalance.correct}/` +
        `${data.predictionBalance.total}`
    );

    console.log(
        `Precisión: ` +
        `${data.predictionBalance.accuracy}%`
    );

    console.log(
        `Modelo: ${data.modelLearning.version}`
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
