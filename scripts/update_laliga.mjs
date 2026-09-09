/**
 * ============================================================
 * FAMILIA CERNADAS
 * ACTUALIZADOR AUTOMÁTICO LALIGA 2026/27
 * MODELO DE PRONÓSTICOS V3.0
 * ============================================================
 *
 * FUENTES
 * ------------------------------------------------------------
 * Principal:
 *   ESPN
 *
 * Secundaria:
 *   API-Football
 *
 * DATOS ACTUALIZADOS
 * ------------------------------------------------------------
 * - Calendario completo LaLiga
 * - Resultados
 * - Clasificación
 * - Goleadores
 * - Lesiones disponibles
 * - Noticias
 * - Detalles de partidos
 * - Estadísticas de partidos
 * - Alineaciones
 * - Formaciones
 * - Porteros
 * - Historial de equipos
 * - Rendimiento local / visitante
 * - Forma últimos 5 / 10
 * - Competición europea
 * - Balance histórico de pronósticos
 *
 * IMPORTANTE
 * ------------------------------------------------------------
 * La API KEY de API-Football NO está aquí.
 *
 * GitHub Actions la proporciona mediante:
 *
 * process.env.API_FOOTBALL_KEY
 *
 * ============================================================
 */

import fs from "node:fs/promises";
import path from "node:path";

// ============================================================
// CONFIGURACIÓN
// ============================================================

const API_FOOTBALL_KEY =
    process.env.API_FOOTBALL_KEY || "";

const ESPN_BASE =
    "https://site.api.espn.com/apis/site/v2";

const ESPN_CORE_BASE =
    "https://sports.core.api.espn.com/v2";

const API_FOOTBALL_BASE =
    "https://v3.football.api-sports.io";

const LEAGUE_ID = 140;

const SEASON = 2026;

const SEASON_LABEL = "2026/27";

const DATA_FILE =
    path.resolve("data/laliga_2026_27.json");

// ============================================================
// CONTROL DE PETICIONES
// ============================================================

let requestsThisRun = 0;

const MAX_REQUESTS = 85;

const DETAIL_BATCH_SIZE = 20;

const MAX_DETAIL_FIXTURES = 60;

// ============================================================
// COMPETICIONES EUROPEAS
// ============================================================

const EUROPEAN_LEAGUES = [

    {
        key: "champions",
        name: "Champions League",
        slug: "uefa.champions"
    },

    {
        key: "europa",
        name: "Europa League",
        slug: "uefa.europa"
    },

    {
        key: "conference",
        name: "Conference League",
        slug: "uefa.europa-conference"
    }

];

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

function safeString(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }

    return String(value);

}

function getStatistic(statistics, type) {

    if (!Array.isArray(statistics)) {

        return null;

    }

    const item =
        statistics.find(
            x =>
                String(x.name || x.type || "")
                    .toLowerCase() ===
                String(type).toLowerCase()
        );

    return item?.value ?? null;

}

function espnEventStatus(event) {

    return (
        event?.competitions?.[0]
            ?.status?.type?.name ||
        null
    );

}

function isFinishedStatus(status) {

    return [
        "STATUS_FINAL",
        "STATUS_FINAL_OT",
        "STATUS_FINAL_PEN"
    ].includes(status);

}

function isFinishedMatch(match) {

    return [
        "FT",
        "AET",
        "PEN"
    ].includes(match?.status);

}

function getResult(match) {

    const home =
        match?.score?.fulltime?.home;

    const away =
        match?.score?.fulltime?.away;

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

function resultFromESPN(event) {

    const competition =
        event?.competitions?.[0];

    const competitors =
        competition?.competitors || [];

    const home =
        competitors.find(
            x => x.homeAway === "home"
        );

    const away =
        competitors.find(
            x => x.homeAway === "away"
        );

    if (
        !home ||
        !away
    ) {

        return null;

    }

    const homeScore =
        Number(home.score);

    const awayScore =
        Number(away.score);

    if (
        !Number.isFinite(homeScore) ||
        !Number.isFinite(awayScore)
    ) {

        return null;

    }

    if (homeScore > awayScore) {

        return "1";

    }

    if (homeScore < awayScore) {

        return "2";

    }

    return "X";

}

// ============================================================
// LLAMADAS ESPN
// ============================================================

async function espnJSON(url, description) {

    if (requestsThisRun >= MAX_REQUESTS) {

        throw new Error(
            "Límite de seguridad de peticiones alcanzado."
        );

    }

    requestsThisRun++;

    console.log(
        `HTTP ${requestsThisRun}: ${description}`
    );

    const response =
        await fetch(url, {

            headers: {
                "User-Agent":
                    "Familia-Cernadas-LaLiga-Updater/3.0"
            }

        });

    const text =
        await response.text();

    let json;

    try {

        json = JSON.parse(text);

    } catch {

        throw new Error(
            `ESPN devolvió una respuesta no JSON (${response.status})`
        );

    }

    if (!response.ok) {

        throw new Error(
            `HTTP ${response.status}: ` +
            JSON.stringify(json)
        );

    }

    await sleep(100);

    return json;

}

// ============================================================
// API-FOOTBALL
// ============================================================

async function apiFootball(endpoint, params = {}) {

    if (!API_FOOTBALL_KEY) {

        throw new Error(
            "API_FOOTBALL_KEY no configurada"
        );

    }

    if (requestsThisRun >= MAX_REQUESTS) {

        throw new Error(
            "Límite de seguridad de peticiones alcanzado."
        );

    }

    const url =
        new URL(
            API_FOOTBALL_BASE + endpoint
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

    console.log(
        `HTTP ${requestsThisRun}: API-Football ${endpoint}`
    );

    const response =
        await fetch(url, {

            headers: {
                "x-apisports-key":
                    API_FOOTBALL_KEY
            }

        });

    const text =
        await response.text();

    let json;

    try {

        json = JSON.parse(text);

    } catch {

        throw new Error(
            `API-Football devolvió respuesta no válida (${response.status})`
        );

    }

    if (!response.ok) {

        throw new Error(
            `API-Football HTTP ${response.status}: ` +
            JSON.stringify(json.errors || json)
        );

    }

    if (
        json.errors &&
        Object.keys(json.errors).length
    ) {

        throw new Error(
            "API-Football error: " +
            JSON.stringify(json.errors)
        );

    }

    await sleep(150);

    return json;

}

// ============================================================
// CARGAR DATOS EXISTENTES
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

        data.europeanMatches ||= [];

        data.predictionBalance ||= {};

        data.modelPerformance ||= {};

        return data;

    } catch {

        return {

            meta: {

                leagueId: LEAGUE_ID,

                season: SEASON,

                league: "LaLiga",

                seasonLabel:
                    SEASON_LABEL

            },

            matches: [],

            standings: [],

            scorers: [],

            injuries: [],

            news: [],

            europeanMatches: [],

            predictionBalance: {

                total: 0,

                correct: 0,

                accuracy: 0

            },

            modelPerformance: {}

        };

    }

}

// ============================================================
// NORMALIZAR EVENTO ESPN
// ============================================================

function normalizeESPNEvent(event) {

    const competition =
        event?.competitions?.[0];

    const competitors =
        competition?.competitors || [];

    const home =
        competitors.find(
            x => x.homeAway === "home"
        );

    const away =
        competitors.find(
            x => x.homeAway === "away"
        );

    const status =
        espnEventStatus(event);

    const completed =
        isFinishedStatus(status);

    const homeScore =
        Number(home?.score);

    const awayScore =
        Number(away?.score);

    return {

        id:
            event.id
                ? Number(event.id)
                : event.id,

        round:
            event?.season?.slug ||
            event?.week?.text ||
            event?.league?.round ||
            null,

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
                : status,

        statusLong:
            competition
                ?.status
                ?.type
                ?.description ||
            null,

        venue: {

            id:
                competition
                    ?.venue
                    ?.id || null,

            name:
                competition
                    ?.venue
                    ?.fullName || null,

            city:
                competition
                    ?.venue
                    ?.address
                    ?.city || null

        },

        home: {

            id:
                home?.team?.id
                    ? Number(home.team.id)
                    : null,

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
                away?.team?.id
                    ? Number(away.team.id)
                    : null,

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

            halftime: null,

            fulltime:
                completed &&
                Number.isFinite(homeScore) &&
                Number.isFinite(awayScore)
                    ? {
                        home: homeScore,
                        away: awayScore
                    }
                    : null,

            extratime: null,

            penalty: null

        },

        competition: {

            id:
                event?.league?.id ||
                null,

            name:
                event?.league?.name ||
                "LaLiga"

        }

    };

}

// ============================================================
// FUSIONAR CALENDARIO
// ============================================================

function mergeFixtures(data, events) {

    const existing =
        new Map(
            data.matches.map(
                match => [
                    String(match.id),
                    match
                ]
            )
        );

    for (const event of events) {

        const normalized =
            normalizeESPNEvent(event);

        if (!normalized.id) {

            continue;

        }

        const key =
            String(normalized.id);

        const old =
            existing.get(key);

        if (old) {

            const prediction =
                old.prediction;

            const details =
                old.details;

            const quiniela =
                old.quiniela;

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

            if (quiniela) {

                old.quiniela =
                    quiniela;

            }

        } else {

            existing.set(
                key,
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

// ============================================================
// CALENDARIO ESPN
// ============================================================

async function getLaLigaCalendar() {

    const start =
        "20260801";

    const end =
        "20270601";

    const url =
        `${ESPN_BASE}/sports/soccer/esp.1/scoreboard` +
        `?limit=1000&dates=${start}-${end}`;

    const json =
        await espnJSON(
            url,
            "ESPN LaLiga calendario"
        );

    const events =
        json.events || [];

    console.log(
        `ESPN devuelve ${events.length} eventos.`
    );

    return events;

}

// ============================================================
// CLASIFICACIÓN ESPN
// ============================================================

async function getStandings() {

    /*
     * IMPORTANTE:
     *
     * Para standings ESPN utiliza la ruta:
     *
     * /apis/v2/sports/soccer/esp.1/standings
     *
     * La ruta /apis/site/v2/.../standings puede devolver
     * únicamente un objeto incompleto.
     */

    const url =
        `${ESPN_BASE.replace(
            "/apis/site/v2",
            "/apis/v2"
        )}/sports/soccer/esp.1/standings`;

    const json =
        await espnJSON(
            url,
            "ESPN LaLiga clasificación"
        );

    /*
     * ESPN puede presentar la clasificación bajo:
     *
     * children[].standings.entries
     *
     * o mediante grupos/entries según la versión
     * de la respuesta.
     */

    let entries = [];

    if (
        Array.isArray(
            json?.children
        )
    ) {

        for (
            const child
            of json.children
        ) {

            if (
                Array.isArray(
                    child?.standings?.entries
                )
            ) {

                entries.push(
                    ...child.standings.entries
                );

            }

        }

    }

    /*
     * Compatibilidad con respuestas que utilizan
     * directamente groups[].entries.
     */

    if (
        !entries.length &&
        Array.isArray(json?.groups)
    ) {

        for (
            const group
            of json.groups
        ) {

            if (
                Array.isArray(
                    group?.entries
                )
            ) {

                entries.push(
                    ...group.entries
                );

            }

        }

    }

    /*
     * Compatibilidad adicional con respuestas
     * donde standings está directamente disponible.
     */

    if (
        !entries.length &&
        Array.isArray(
            json?.standings?.entries
        )
    ) {

        entries =
            json.standings.entries;

    }

    const result =
        entries.map(
            (entry, index) => {

                const stats =
                    Array.isArray(
                        entry?.stats
                    )
                        ? entry.stats
                        : [];

                /*
                 * Algunas respuestas de ESPN devuelven
                 * stats como array y otras como objeto.
                 */

                function stat(name) {

                    if (
                        Array.isArray(stats)
                    ) {

                        const item =
                            stats.find(
                                x =>
                                    String(
                                        x?.name ||
                                        x?.type ||
                                        ""
                                    ).toLowerCase() ===
                                    String(
                                        name
                                    ).toLowerCase()
                            );

                        return (
                            item?.value ??
                            item?.displayValue ??
                            0
                        );

                    }

                    if (
                        stats &&
                        typeof stats === "object"
                    ) {

                        return (
                            stats[name] ??
                            0
                        );

                    }

                    return 0;

                }

                const team =
                    entry?.team ||
                    {};

                return {

                    rank:
                        Number(
                            entry?.note?.rank ||
                            entry?.rank ||
                            index + 1
                        ),

                    team: {

                        id:
                            Number(
                                team?.id
                            ),

                        name:
                            team?.displayName ||
                            team?.name ||
                            null,

                        abbreviation:
                            team?.abbreviation ||
                            null,

                        logo:
                            team?.logos?.[0]?.href ||
                            team?.logo ||
                            null

                    },

                    points:
                        Number(
                            stat("points")
                        ),

                    goalsDiff:
                        Number(
                            stat("pointDifferential")
                        ),

                    played:
                        Number(
                            stat("gamesPlayed")
                        ),

                    wins:
                        Number(
                            stat("wins")
                        ),

                    draws:
                        Number(
                            stat("ties")
                        ),

                    losses:
                        Number(
                            stat("losses")
                        ),

                    gf:
                        Number(
                            stat("pointsFor")
                        ),

                    ga:
                        Number(
                            stat("pointsAgainst")
                        ),

                    form:
                        entry?.form ||
                        stat("form") ||
                        null

                };

            }
        )
        .filter(
            row =>
                row.team?.id &&
                row.team?.name
        );

    /*
     * Orden de clasificación.
     *
     * Si ESPN ya proporciona rank lo respetamos.
     * Si no, ordenamos por puntos y diferencia.
     */

    result.sort(
        (a, b) => {

            if (
                a.rank !== b.rank
            ) {

                return a.rank - b.rank;

            }

            if (
                b.points !== a.points
            ) {

                return b.points - a.points;

            }

            return (
                b.goalsDiff -
                a.goalsDiff
            );

        }
    );

    /*
     * Reasignamos posición consecutiva.
     */

    result.forEach(
        (row, index) => {

            row.rank =
                index + 1;

        }
    );

    console.log(
        `Equipos en clasificación: ${result.length}`
    );

    return result;

}


// ============================================================
// GOLEADORES ESPN
// ============================================================

async function getScorers() {

    /*
     * ESPN dispone de un endpoint de estadísticas
     * que actualmente devuelve las categorías de
     * líderes dentro de:
     *
     * json.stats[].leaders[]
     *
     *
     * Ejemplo:
     *
     * stats
     *   └── goalsLeaders
     *        └── leaders[]
     *             ├── athlete
     *             ├── team
     *             ├── value
     *             └── statistics[]
     *
     * Esta estructura es la que utilizamos aquí.
     */

    const url =
        `${ESPN_BASE}/sports/soccer/esp.1/statistics`;

    const json =
        await espnJSON(
            url,
            "ESPN goleadores"
        );

    const scorers = [];

    /*
     * Localizar la categoría de goles.
     */

    const statsCategories =
        Array.isArray(json?.stats)
            ? json.stats
            : [];

    let goalsCategory =
        statsCategories.find(
            category =>
                [
                    "goalsLeaders",
                    "goals",
                    "totalGoals"
                ].includes(
                    category?.name
                )
        );

    /*
     * Si ESPN cambia el nombre de la categoría,
     * buscamos cualquier categoría que contenga
     * "goal".
     */

    if (
        !goalsCategory
    ) {

        goalsCategory =
            statsCategories.find(
                category =>
                    String(
                        category?.name ||
                        ""
                    )
                    .toLowerCase()
                    .includes("goal")
            );

    }

    const leaders =
        Array.isArray(
            goalsCategory?.leaders
        )
            ? goalsCategory.leaders
            : [];

    /*
     * Convertimos cada líder al formato utilizado
     * actualmente por laliga_2026_27.json.
     */

    for (
        const row
        of leaders
    ) {

        const athlete =
            row?.athlete ||
            row?.player ||
            {};

        if (
            !athlete?.id
        ) {

            continue;

        }

        const playerStats =
            Array.isArray(
                row?.statistics
            )
                ? row.statistics
                : [];

        function playerStat(name) {

            const item =
                playerStats.find(
                    x =>
                        String(
                            x?.name ||
                            ""
                        ).toLowerCase() ===
                        String(
                            name
                        ).toLowerCase()
                );

            return (
                item?.value ??
                item?.displayValue ??
                null
            );

        }

        const goals =
            Number(
                row?.value ??
                playerStat("totalGoals") ??
                playerStat("goals") ??
                0
            );

        const assists =
            Number(
                playerStat("goalAssists") ??
                playerStat("assists") ??
                0
            );

        const appearances =
            Number(
                playerStat("appearances") ??
                playerStat("appearences") ??
                0
            );

        /*
         * ESPN devuelve la información del equipo
         * dentro del propio leader.
         */

        const team =
            row?.team ||
            athlete?.team ||
            null;

        scorers.push({

            player: {

                id:
                    Number(
                        athlete.id
                    ),

                name:
                    athlete.displayName ||
                    athlete.fullName ||
                    athlete.name ||
                    "Jugador",

                shortName:
                    athlete.shortName ||
                    null,

                nationality:
                    athlete.nationality ||
                    null,

                position:
                    athlete.position
                        ?.displayName ||
                    athlete.position
                        ?.abbreviation ||
                    null,

                photo:
                    athlete.headshot
                        ?.href ||
                    null

            },

            team: team
                ? {

                    id:
                        Number(
                            team.id
                        ),

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

                }
                : null,

            goals: {

                total:
                    Number.isFinite(
                        goals
                    )
                        ? goals
                        : 0,

                assists:
                    Number.isFinite(
                        assists
                    )
                        ? assists
                        : 0

            },

            appearances:
                Number.isFinite(
                    appearances
                )
                    ? appearances
                    : 0,

            minutes:
                Number(
                    playerStat("minutes") ??
                    0
                ),

            rating:
                playerStat("rating")

        });

    }

    /*
     * Ordenar por:
     *
     * 1. Goles
     * 2. Asistencias
     * 3. Apariciones
     *
     * Así conseguimos una clasificación estable.
     */

    scorers.sort(
        (a, b) => {

            const goalsDiff =
                number(
                    b.goals?.total
                ) -
                number(
                    a.goals?.total
                );

            if (
                goalsDiff !== 0
            ) {

                return goalsDiff;

            }

            const assistsDiff =
                number(
                    b.goals?.assists
                ) -
                number(
                    a.goals?.assists
                );

            if (
                assistsDiff !== 0
            ) {

                return assistsDiff;

            }

            return (
                number(
                    b.appearances
                ) -
                number(
                    a.appearances
                )
            );

        }
    );

    /*
     * Guardamos los 20 primeros.
     */

    const result =
        scorers.slice(
            0,
            20
        );

    console.log(
        `Goleadores obtenidos: ${result.length}`
    );

    return result;

}


// ============================================================
// LESIONES
// ============================================================

async function getInjuries() {

    /*
     * ESPN puede devolver información limitada.
     * Si no existe información, devolvemos [] sin
     * provocar fallo del workflow.
     */

    const url =
        `${ESPN_BASE}/sports/soccer/esp.1/injuries`;

    try {

        const json =
            await espnJSON(
                url,
                "ESPN lesiones"
            );

        const injuries =
            json?.injuries ||
            json?.athletes ||
            json?.results ||
            [];

        console.log(
            `Lesiones obtenidas: ${injuries.length}`
        );

        return injuries;

    } catch (error) {

        console.warn(
            "ESPN lesiones no disponible:",
            error.message
        );

        return [];

    }

}

// ============================================================
// NOTICIAS
// ============================================================

async function getNews() {

    try {

        const url =
            `${ESPN_BASE}/sports/soccer/esp.1/news`;

        const json =
            await espnJSON(
                url,
                "ESPN noticias"
            );

        const articles =
            json?.articles ||
            [];

        const result =
            articles
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
                            article.links
                                ?.web
                                ?.href ||
                            null,

                        images:
                            article.images ||
                            [],

                        related:
                            article.related ||
                            []

                    })
                );

        console.log(
            `Noticias obtenidas: ${result.length}`
        );

        return result;

    } catch (error) {

        console.warn(
            "Noticias no disponibles:",
            error.message
        );

        return [];

    }

}

// ============================================================
// COMPETICIONES EUROPEAS
// ============================================================

async function getEuropeanMatches() {

    const all = [];

    /*
     * Intentamos obtener las tres competiciones.
     *
     * Si ESPN no dispone todavía del calendario de una
     * competición, no detenemos el proceso completo.
     */

    for (
        const competition
        of EUROPEAN_LEAGUES
    ) {

        try {

            const start =
                "20260701";

            const end =
                "20270601";

            const url =
                `${ESPN_BASE}/sports/soccer/${competition.slug}/scoreboard` +
                `?limit=1000&dates=${start}-${end}`;

            const json =
                await espnJSON(
                    url,
                    `ESPN ${competition.name}`
                );

            const events =
                json?.events || [];

            for (
                const event
                of events
            ) {

                const normalized =
                    normalizeEuropeanEvent(
                        event,
                        competition
                    );

                if (normalized) {

                    all.push(
                        normalized
                    );

                }

            }

        } catch (error) {

            console.warn(
                `Europa ${competition.name} no disponible:`,
                error.message
            );

        }

    }

    console.log(
        `Partidos europeos obtenidos: ${all.length}`
    );

    return all;

}

// ============================================================
// NORMALIZAR PARTIDO EUROPEO
// ============================================================

function normalizeEuropeanEvent(
    event,
    competition
) {

    const competitors =
        event?.competitions?.[0]
            ?.competitors ||
        [];

    const home =
        competitors.find(
            x =>
                x.homeAway === "home"
        );

    const away =
        competitors.find(
            x =>
                x.homeAway === "away"
        );

    if (
        !home ||
        !away
    ) {

        return null;

    }

    return {

        id:
            Number(event.id),

        competition:
            competition.name,

        competitionKey:
            competition.key,

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
            espnEventStatus(event),

        home: {

            id:
                Number(
                    home.team?.id
                ),

            name:
                home.team?.displayName ||
                home.team?.name ||
                null

        },

        away: {

            id:
                Number(
                    away.team?.id
                ),

            name:
                away.team?.displayName ||
                away.team?.name ||
                null

        },

        score: {

            home:
                Number.isFinite(
                    Number(home.score)
                )
                    ? Number(home.score)
                    : null,

            away:
                Number.isFinite(
                    Number(away.score)
                )
                    ? Number(away.score)
                    : null

        }

    };

}

// ============================================================
// IMPACTO EUROPEO
// ============================================================

function europeanImpact(
    data,
    teamId,
    matchTimestamp
) {

    const previousWindow =
        7 * 24 * 60 * 60;

    const nextWindow =
        4 * 24 * 60 * 60;

    const previous =
        data.europeanMatches.filter(
            match =>

                match.timestamp &&
                match.timestamp <
                    matchTimestamp &&
                match.timestamp >=
                    matchTimestamp -
                    previousWindow &&
                (
                    match.home?.id === teamId ||
                    match.away?.id === teamId
                )
        );

    const next =
        data.europeanMatches.filter(
            match =>

                match.timestamp &&
                match.timestamp >
                    matchTimestamp &&
                match.timestamp <=
                    matchTimestamp +
                    nextWindow &&
                (
                    match.home?.id === teamId ||
                    match.away?.id === teamId
                )
        );

    return {

        playedPrevious7Days:
            previous.length,

        scheduledNext4Days:
            next.length,

        previousMatches:
            previous.map(
                match => ({

                    competition:
                        match.competition,

                    date:
                        match.date,

                    opponent:
                        match.home?.id === teamId
                            ? match.away?.name
                            : match.home?.name

                })
            ),

        nextMatches:
            next.map(
                match => ({

                    competition:
                        match.competition,

                    date:
                        match.date,

                    opponent:
                        match.home?.id === teamId
                            ? match.away?.name
                            : match.home?.name

                })
            ),

        fatiguePenalty:
            previous.length > 0
                ? Math.min(
                    0.15,
                    previous.length * 0.05
                )
                : 0

    };

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

                isFinishedMatch(match) &&

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

// ============================================================
// MÉTRICAS DE EQUIPO
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

    // --------------------------------------------------------
    // FILTRO LOCAL / VISITANTE
    // --------------------------------------------------------

    if (venue === "home") {

        matches =
            matches.filter(
                match =>
                    Number(match.home?.id) ===
                    Number(teamId)
            );

    }

    if (venue === "away") {

        matches =
            matches.filter(
                match =>
                    Number(match.away?.id) ===
                    Number(teamId)
            );

    }

    // --------------------------------------------------------
    // ÚLTIMOS PARTIDOS
    // --------------------------------------------------------

    const last5 =
        matches.slice(-5);

    const last10 =
        matches.slice(-10);


    // ========================================================
    // AGREGACIÓN ESTADÍSTICA
    // ========================================================

    function aggregate(list) {

        let gf = 0;

        let ga = 0;

        let points = 0;

        let wins = 0;

        let draws = 0;

        let losses = 0;

        let cleanSheets = 0;

        let scoredMatches = 0;

        let concededMatches = 0;


        for (
            const match
            of list
        ) {

            const isHome =
                Number(match.home?.id) ===
                Number(teamId);


            const scored =
                isHome
                    ? match.score?.fulltime?.home
                    : match.score?.fulltime?.away;


            const conceded =
                isHome
                    ? match.score?.fulltime?.away
                    : match.score?.fulltime?.home;


            if (
                scored === null ||
                conceded === null ||
                scored === undefined ||
                conceded === undefined
            ) {

                continue;

            }


            const goalsFor =
                number(scored);

            const goalsAgainst =
                number(conceded);


            gf += goalsFor;

            ga += goalsAgainst;


            // ------------------------------------------------
            // RESULTADO
            // ------------------------------------------------

            if (
                goalsFor > goalsAgainst
            ) {

                points += 3;

                wins++;

            } else if (
                goalsFor === goalsAgainst
            ) {

                points++;

                draws++;

            } else {

                losses++;

            }


            // ------------------------------------------------
            // PORTERÍA A CERO
            // ------------------------------------------------

            if (
                goalsAgainst === 0
            ) {

                cleanSheets++;

            }


            // ------------------------------------------------
            // MARCÓ AL MENOS UN GOL
            // ------------------------------------------------

            if (
                goalsFor > 0
            ) {

                scoredMatches++;

            }


            // ------------------------------------------------
            // RECIBIÓ AL MENOS UN GOL
            // ------------------------------------------------

            if (
                goalsAgainst > 0
            ) {

                concededMatches++;

            }

        }


        const played =
            list.length;


        return {

            matches:
                played,

            gf,

            ga,

            gfPerGame:
                played
                    ? Number(
                        (
                            gf /
                            played
                        ).toFixed(3)
                    )
                    : 0,

            gaPerGame:
                played
                    ? Number(
                        (
                            ga /
                            played
                        ).toFixed(3)
                    )
                    : 0,

            goalDifference:
                gf - ga,

            points,

            pointsPerGame:
                played
                    ? Number(
                        (
                            points /
                            played
                        ).toFixed(3)
                    )
                    : 0,

            wins,

            draws,

            losses,

            winPercentage:
                played
                    ? Number(
                        (
                            wins /
                            played *
                            100
                        ).toFixed(2)
                    )
                    : 0,

            drawPercentage:
                played
                    ? Number(
                        (
                            draws /
                            played *
                            100
                        ).toFixed(2)
                    )
                    : 0,

            lossPercentage:
                played
                    ? Number(
                        (
                            losses /
                            played *
                            100
                        ).toFixed(2)
                    )
                    : 0,

            cleanSheets,

            cleanSheetPercentage:
                played
                    ? Number(
                        (
                            cleanSheets /
                            played *
                            100
                        ).toFixed(2)
                    )
                    : 0,

            scoredMatches,

            scoredPercentage:
                played
                    ? Number(
                        (
                            scoredMatches /
                            played *
                            100
                        ).toFixed(2)
                    )
                    : 0,

            concededMatches,

            concededPercentage:
                played
                    ? Number(
                        (
                            concededMatches /
                            played *
                            100
                        ).toFixed(2)
                    )
                    : 0

        };

    }


    // ========================================================
    // PONDERACIÓN POR RECENCIA
    // ========================================================

    /*
     * Los partidos recientes tienen más valor para el modelo.
     *
     * Peso:
     *
     * Partido más reciente  -> 1.00
     * Anteriores            -> progresivamente menor
     *
     * Esto permite que una racha reciente de un equipo tenga
     * más influencia que resultados de hace varios meses.
     */

    function recentForm(list) {

        if (!list.length) {

            return {

                weightedPoints: 0,

                weightedGoalsFor: 0,

                weightedGoalsAgainst: 0,

                weightedGoalDifference: 0,

                sample: 0

            };

        }


        let weightedPoints = 0;

        let weightedGoalsFor = 0;

        let weightedGoalsAgainst = 0;

        let totalWeight = 0;


        list.forEach(
            (match, index) => {

                const isHome =
                    Number(match.home?.id) ===
                    Number(teamId);


                const scored =
                    isHome
                        ? match.score?.fulltime?.home
                        : match.score?.fulltime?.away;


                const conceded =
                    isHome
                        ? match.score?.fulltime?.away
                        : match.score?.fulltime?.home;


                if (
                    scored === null ||
                    conceded === null ||
                    scored === undefined ||
                    conceded === undefined
                ) {

                    return;

                }


                /*
                 * El índice mayor corresponde al partido
                 * más reciente.
                 *
                 * Los pesos van de 0.60 a 1.00.
                 */

                const weight =
                    0.60 +
                    (
                        0.40 *
                        (
                            (index + 1) /
                            list.length
                        )
                    );


                const gf =
                    number(scored);

                const ga =
                    number(conceded);


                let pts = 0;


                if (gf > ga) {

                    pts = 3;

                } else if (
                    gf === ga
                ) {

                    pts = 1;

                }


                weightedPoints +=
                    pts * weight;

                weightedGoalsFor +=
                    gf * weight;

                weightedGoalsAgainst +=
                    ga * weight;

                totalWeight +=
                    weight;

            }
        );


        if (!totalWeight) {

            return {

                weightedPoints: 0,

                weightedGoalsFor: 0,

                weightedGoalsAgainst: 0,

                weightedGoalDifference: 0,

                sample: 0

            };

        }


        const goalsFor =
            weightedGoalsFor /
            totalWeight;

        const goalsAgainst =
            weightedGoalsAgainst /
            totalWeight;


        return {

            weightedPoints:
                Number(
                    (
                        weightedPoints /
                        totalWeight
                    ).toFixed(3)
                ),

            weightedGoalsFor:
                Number(
                    goalsFor.toFixed(3)
                ),

            weightedGoalsAgainst:
                Number(
                    goalsAgainst.toFixed(3)
                ),

            weightedGoalDifference:
                Number(
                    (
                        goalsFor -
                        goalsAgainst
                    ).toFixed(3)
                ),

            sample:
                list.length

        };

    }


    // ========================================================
    // RESULTADOS AGREGADOS
    // ========================================================

    const last5Stats =
        aggregate(last5);

    const last10Stats =
        aggregate(last10);

    const venueStats =
        aggregate(matches);


    // ========================================================
    // FORMA PONDERADA
    // ========================================================

    const last5Weighted =
        recentForm(last5);

    const last10Weighted =
        recentForm(last10);


    // ========================================================
    // DEVOLVER PERFIL COMPLETO
    // ========================================================

    return {

        last5:
            last5Stats,

        last10:
            last10Stats,

        venue:
            venueStats,

        recentWeighted: {

            last5:
                last5Weighted,

            last10:
                last10Weighted

        },

        sample: {

            totalMatches:
                matches.length,

            last5:
                last5.length,

            last10:
                last10.length

        }

    };

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

    let cleanSheets = 0;


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
            !isFinishedMatch(match)
        ) {

            continue;

        }


        const players =
            match.details?.players;


        if (!players) {

            continue;

        }


        for (
            const team
            of players
        ) {

            if (
                Number(team.teamId) !==
                Number(teamId)
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
                    ![
                        "g",
                        "goalkeeper"
                    ].includes(position)
                ) {

                    continue;

                }


                appearances++;


                const playerSaves =
                    number(
                        stat.goals?.saves
                    );


                const playerConceded =
                    number(
                        stat.goals?.conceded
                    );


                saves +=
                    playerSaves;


                conceded +=
                    playerConceded;


                if (
                    playerConceded === 0
                ) {

                    cleanSheets++;

                }

            }

        }

    }


    // ========================================================
    // PORCENTAJE DE PARADAS
    // ========================================================

    const shots =
        saves +
        conceded;


    const savePercentage =
        shots
            ? Number(
                (
                    saves /
                    shots *
                    100
                ).toFixed(2)
            )
            : null;


    // ========================================================
    // PORCENTAJE DE PORTERÍAS A CERO
    // ========================================================

    const cleanSheetPercentage =
        appearances
            ? Number(
                (
                    cleanSheets /
                    appearances *
                    100
                ).toFixed(2)
            )
            : null;


    return {

        appearances,

        saves,

        conceded,

        shots,

        savePercentage,

        cleanSheets,

        cleanSheetPercentage

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


    // --------------------------------------------------------
    // RECORRER PARTIDOS ANTERIORES
    // --------------------------------------------------------

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
            !isFinishedMatch(match)
        ) {

            continue;

        }


        const lineups =
            match.details?.lineups;


        if (!Array.isArray(lineups)) {

            continue;

        }


        const lineup =
            lineups.find(
                x =>
                    Number(x.teamId) ===
                    Number(teamId)
            );


        if (
            !lineup?.formation
        ) {

            continue;

        }


        const formation =
            String(
                lineup.formation
            ).trim();


        if (!formation) {

            continue;

        }


        // ----------------------------------------------------
        // CREAR REGISTRO DE FORMACIÓN
        // ----------------------------------------------------

        if (!formations[formation]) {

            formations[formation] = {

                matches: 0,

                wins: 0,

                draws: 0,

                losses: 0,

                gf: 0,

                ga: 0,

                points: 0,

                cleanSheets: 0,

                scoredMatches: 0,

                lastMatches: []

            };

        }


        const row =
            formations[formation];


        // ----------------------------------------------------
        // LOCAL / VISITANTE
        // ----------------------------------------------------

        const home =
            Number(
                match.home?.id
            ) ===
            Number(teamId);


        const gf =
            home
                ? number(
                    match.score
                        ?.fulltime
                        ?.home
                )
                : number(
                    match.score
                        ?.fulltime
                        ?.away
                );


        const ga =
            home
                ? number(
                    match.score
                        ?.fulltime
                        ?.away
                )
                : number(
                    match.score
                        ?.fulltime
                        ?.home
                );


        // ----------------------------------------------------
        // ESTADÍSTICAS BÁSICAS
        // ----------------------------------------------------

        row.matches++;

        row.gf += gf;

        row.ga += ga;


        // ----------------------------------------------------
        // RESULTADO
        // ----------------------------------------------------

        let result = "X";


        if (
            gf > ga
        ) {

            result = "1";

            row.wins++;

            row.points += 3;

        } else if (
            gf === ga
        ) {

            result = "X";

            row.draws++;

            row.points += 1;

        } else {

            result = "2";

            row.losses++;

        }


        // ----------------------------------------------------
        // PORTERÍA A CERO
        // ----------------------------------------------------

        if (
            ga === 0
        ) {

            row.cleanSheets++;

        }


        // ----------------------------------------------------
        // PARTIDO MARCANDO
        // ----------------------------------------------------

        if (
            gf > 0
        ) {

            row.scoredMatches++;

        }


        // ----------------------------------------------------
        // GUARDAR PARTIDO PARA ANALIZAR RECENCIA
        // ----------------------------------------------------

        row.lastMatches.push({

            timestamp:
                match.timestamp,

            result,

            gf,

            ga,

            points:
                result === "1"
                    ? 3
                    : result === "X"
                        ? 1
                        : 0

        });

    }


    // ========================================================
    // CALCULAR MÉTRICAS DE CADA FORMACIÓN
    // ========================================================

    for (
        const formation
        of Object.keys(formations)
    ) {

        const row =
            formations[formation];


        const matches =
            row.matches;


        // ----------------------------------------------------
        // ÚLTIMOS 5 PARTIDOS CON ESTA FORMACIÓN
        // ----------------------------------------------------

        const recent =
            row.lastMatches
                .slice(-5);


        let recentWins = 0;

        let recentDraws = 0;

        let recentLosses = 0;

        let recentPoints = 0;

        let recentGF = 0;

        let recentGA = 0;


        for (
            const match
            of recent
        ) {

            recentPoints +=
                match.points;

            recentGF +=
                match.gf;

            recentGA +=
                match.ga;


            if (
                match.result === "1"
            ) {

                recentWins++;

            } else if (
                match.result === "X"
            ) {

                recentDraws++;

            } else {

                recentLosses++;

            }

        }


        // ----------------------------------------------------
        // PORCENTAJES GENERALES
        // ----------------------------------------------------

        row.winPercentage =
            matches
                ? Number(
                    (
                        row.wins /
                        matches *
                        100
                    ).toFixed(2)
                )
                : 0;


        row.drawPercentage =
            matches
                ? Number(
                    (
                        row.draws /
                        matches *
                        100
                    ).toFixed(2)
                )
                : 0;


        row.lossPercentage =
            matches
                ? Number(
                    (
                        row.losses /
                        matches *
                        100
                    ).toFixed(2)
                )
                : 0;


        // ----------------------------------------------------
        // PUNTOS POR PARTIDO
        // ----------------------------------------------------

        row.pointsPerGame =
            matches
                ? Number(
                    (
                        row.points /
                        matches
                    ).toFixed(3)
                )
                : 0;


        // ----------------------------------------------------
        // GOLES POR PARTIDO
        // ----------------------------------------------------

        row.gfPerGame =
            matches
                ? Number(
                    (
                        row.gf /
                        matches
                    ).toFixed(3)
                )
                : 0;


        row.gaPerGame =
            matches
                ? Number(
                    (
                        row.ga /
                        matches
                    ).toFixed(3)
                )
                : 0;


        row.goalDifference =
            row.gf -
            row.ga;


        row.goalDifferencePerGame =
            matches
                ? Number(
                    (
                        row.goalDifference /
                        matches
                    ).toFixed(3)
                )
                : 0;


        // ----------------------------------------------------
        // PORTERÍAS A CERO
        // ----------------------------------------------------

        row.cleanSheetPercentage =
            matches
                ? Number(
                    (
                        row.cleanSheets /
                        matches *
                        100
                    ).toFixed(2)
                )
                : 0;


        // ----------------------------------------------------
        // PARTIDOS MARCANDO
        // ----------------------------------------------------

        row.scoredPercentage =
            matches
                ? Number(
                    (
                        row.scoredMatches /
                        matches *
                        100
                    ).toFixed(2)
                )
                : 0;


        // ----------------------------------------------------
        // RENDIMIENTO ÚLTIMOS 5
        // ----------------------------------------------------

        row.recent5 = {

            matches:
                recent.length,

            wins:
                recentWins,

            draws:
                recentDraws,

            losses:
                recentLosses,

            points:
                recentPoints,

            pointsPerGame:
                recent.length
                    ? Number(
                        (
                            recentPoints /
                            recent.length
                        ).toFixed(3)
                    )
                    : 0,

            gf:
                recentGF,

            ga:
                recentGA,

            gfPerGame:
                recent.length
                    ? Number(
                        (
                            recentGF /
                            recent.length
                        ).toFixed(3)
                    )
                    : 0,

            gaPerGame:
                recent.length
                    ? Number(
                        (
                            recentGA /
                            recent.length
                        ).toFixed(3)
                    )
                    : 0,

            goalDifference:
                recentGF -
                recentGA,

            winPercentage:
                recent.length
                    ? Number(
                        (
                            recentWins /
                            recent.length *
                            100
                        ).toFixed(2)
                    )
                    : 0

        };


        // ----------------------------------------------------
        // RENDIMIENTO PONDERADO POR RECENCIA
        // ----------------------------------------------------

        /*
         * El partido más reciente tiene mayor peso.
         *
         * Primer partido:
         * peso aproximado 0.60
         *
         * Último partido:
         * peso 1.00
         *
         * Esto permite que una formación utilizada
         * recientemente tenga mayor influencia.
         */

        let weightedPoints = 0;

        let weightedGF = 0;

        let weightedGA = 0;

        let totalWeight = 0;


        row.lastMatches.forEach(
            (match, index) => {

                const total =
                    row.lastMatches.length;


                if (!total) {

                    return;

                }


                const weight =
                    0.60 +
                    (
                        0.40 *
                        (
                            (index + 1) /
                            total
                        )
                    );


                weightedPoints +=
                    match.points *
                    weight;


                weightedGF +=
                    match.gf *
                    weight;


                weightedGA +=
                    match.ga *
                    weight;


                totalWeight +=
                    weight;

            }
        );


        row.recentWeighted = {

            pointsPerGame:
                totalWeight
                    ? Number(
                        (
                            weightedPoints /
                            totalWeight
                        ).toFixed(3)
                    )
                    : 0,

            gfPerGame:
                totalWeight
                    ? Number(
                        (
                            weightedGF /
                            totalWeight
                        ).toFixed(3)
                    )
                    : 0,

            gaPerGame:
                totalWeight
                    ? Number(
                        (
                            weightedGA /
                            totalWeight
                        ).toFixed(3)
                    )
                    : 0,

            goalDifferencePerGame:
                totalWeight
                    ? Number(
                        (
                            (
                                weightedGF -
                                weightedGA
                            ) /
                            totalWeight
                        ).toFixed(3)
                    )
                    : 0

        };


        // ----------------------------------------------------
        // ELIMINAR HISTORIAL INTERNO
        // ----------------------------------------------------

        /*
         * No necesitamos guardar todos los partidos dentro
         * de cada formación porque los datos originales ya
         * existen en data.matches.
         *
         * Esto evita hacer crecer innecesariamente el JSON.
         */

        delete row.lastMatches;

    }


    // ========================================================
    // ORDENAR FORMACIONES POR RENDIMIENTO
    // ========================================================

    /*
     * No cambiamos el objeto a un array porque el resto del
     * programa puede estar utilizando formations[formation].
     *
     * Simplemente añadimos información que permitirá a
     * createPrediction() identificar posteriormente cuál
     * es la formación más eficaz.
     */

    return formations;

}

// ============================================================
// CREAR PRONÓSTICO
// ============================================================

function createPrediction(
    data,
    match
) {

    const timestamp =
        match.timestamp;

    if (!timestamp) {

        return null;

    }

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

    const homeFormations =
        formationMetrics(
            data,
            match.home.id,
            timestamp
        );

    const awayFormations =
        formationMetrics(
            data,
            match.away.id,
            timestamp
        );

    const homeEurope =
        europeanImpact(
            data,
            match.home.id,
            timestamp
        );

    const awayEurope =
        europeanImpact(
            data,
            match.away.id,
            timestamp
        );

    /*
     * ========================================================
     * MODELO V3.0
     * ========================================================
     *
     * FORMA                35%
     * ATAQUE/DEFENSA       25%
     * LOCALÍA              15%
     * PORTERO              10%
     * EUROPA/FATIGA        10%
     * TÁCTICA               5%
     *
     * Los pesos se guardan para poder analizarlos después.
     */

    let homeScore = 1;

    let awayScore = 1;

    // --------------------------------------------------------
    // FORMA
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // ATAQUE / DEFENSA
    // --------------------------------------------------------

    homeScore +=
        (
            home.venue.gfPerGame -
            away.venue.gaPerGame
        ) * 0.30;

    awayScore +=
        (
            away.venue.gfPerGame -
            home.venue.gaPerGame
        ) * 0.30;

    // --------------------------------------------------------
    // LOCALÍA
    // --------------------------------------------------------

    homeScore += 0.30;

    // --------------------------------------------------------
    // PORTEROS
    // --------------------------------------------------------

    if (
        homeGK.savePercentage !== null
    ) {

        homeScore +=
            (
                homeGK.savePercentage -
                70
            ) / 120;

    }

    if (
        awayGK.savePercentage !== null
    ) {

        awayScore +=
            (
                awayGK.savePercentage -
                70
            ) / 120;

    }

    // --------------------------------------------------------
    // EUROPA
    // --------------------------------------------------------

    /*
     * Si un equipo jugó competición europea
     * recientemente, aplicamos una pequeña penalización
     * por fatiga.
     */

    homeScore -=
        homeEurope.fatiguePenalty;

    awayScore -=
        awayEurope.fatiguePenalty;

    /*
     * Si tiene otro partido europeo inmediatamente
     * después, la penalización es ligeramente menor,
     * porque todavía no sabemos el desgaste real.
     */

    if (
        awayEurope.scheduledNext4Days > 0
    ) {

        homeScore += 0.02;

    }

    if (
        homeEurope.scheduledNext4Days > 0
    ) {

        awayScore += 0.02;

    }

    // --------------------------------------------------------
    // TÁCTICA / FORMACIONES
    // --------------------------------------------------------

    const homeFormationCount =
        Object.keys(
            homeFormations
        ).length;

    const awayFormationCount =
        Object.keys(
            awayFormations
        ).length;

    /*
     * No imponemos una ventaja artificial por formación.
     *
     * El histórico queda registrado para que posteriormente
     * podamos descubrir qué sistemas funcionan mejor.
     */

    if (
        homeFormationCount === 1 &&
        awayFormationCount > 1
    ) {

        homeScore += 0.01;

    }

    if (
        awayFormationCount === 1 &&
        homeFormationCount > 1
    ) {

        awayScore += 0.01;

    }

    // --------------------------------------------------------
    // LIMITAR
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
            0.72 -
            difference * 0.16
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

    // --------------------------------------------------------
    // SIGNO
    // --------------------------------------------------------

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

    if (
        confidence >= 0.58
    ) {

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
                "3.0",

            weights: {

                form: 0.35,

                attackDefense: 0.25,

                homeAdvantage: 0.15,

                goalkeeper: 0.10,

                europeanFatigue: 0.10,

                tactical: 0.05

            }

        },

        evidence: {

            homeLast5:
                homeRecent.last5,

            awayLast5:
                awayRecent.last5,

            homeLast10:
                homeRecent.last10,

            awayLast10:
                awayRecent.last10,

            homeVenue:
                home.venue,

            awayVenue:
                away.venue,

            homeGoalkeeper:
                homeGK,

            awayGoalkeeper:
                awayGK,

            homeFormations,

            awayFormations,

            homeEuropeanImpact:
                homeEurope,

            awayEuropeanImpact:
                awayEurope

        }

    };

}

// ============================================================
// BALANCE DE PRONÓSTICOS
// ============================================================

function updatePredictionBalance(data) {

    const balance = {

        total: 0,

        correct: 0,

        accuracy: 0,

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

        },

        byRound: {}

    };


    for (
        const match
        of data.matches
    ) {

        /*
         * Solo evaluamos partidos que:
         *
         * 1. Tengan pronóstico.
         * 2. Hayan terminado.
         * 3. Tengan resultado real.
         */

        if (
            !match.prediction?.sign ||
            !isFinishedMatch(match)
        ) {

            continue;

        }


        const real =
            match.result ||
            getResult(match);


        if (!real) {

            continue;

        }


        const prediction =
            match.prediction;


        const correct =
            prediction.sign === real;


        balance.total++;


        if (correct) {

            balance.correct++;

        }


        // ----------------------------------------------------
        // POR SIGNO
        // ----------------------------------------------------

        if (
            balance.bySign[prediction.sign]
        ) {

            balance.bySign[
                prediction.sign
            ].total++;


            if (correct) {

                balance.bySign[
                    prediction.sign
                ].correct++;

            }

        }


        // ----------------------------------------------------
        // POR DIFICULTAD
        // ----------------------------------------------------

        const difficulty =
            prediction.difficulty ||
            "media";


        if (
            balance.byDifficulty[difficulty]
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


        // ----------------------------------------------------
        // POR JORNADA
        // ----------------------------------------------------

        const round =
            match.round ||
            "Sin jornada";


        if (
            !balance.byRound[round]
        ) {

            balance.byRound[round] = {

                total: 0,

                correct: 0,

                accuracy: 0

            };

        }


        balance.byRound[round].total++;


        if (correct) {

            balance.byRound[round].correct++;

        }

    }


    // --------------------------------------------------------
    // PRECISIÓN GENERAL
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // PRECISIÓN POR SIGNO
    // --------------------------------------------------------

    for (
        const group
        of Object.values(balance.bySign)
    ) {

        group.accuracy =
            group.total
                ? Number(
                    (
                        group.correct /
                        group.total *
                        100
                    ).toFixed(2)
                )
                : 0;

    }


    // --------------------------------------------------------
    // PRECISIÓN POR DIFICULTAD
    // --------------------------------------------------------

    for (
        const group
        of Object.values(balance.byDifficulty)
    ) {

        group.accuracy =
            group.total
                ? Number(
                    (
                        group.correct /
                        group.total *
                        100
                    ).toFixed(2)
                )
                : 0;

    }


    // --------------------------------------------------------
    // PRECISIÓN POR JORNADA
    // --------------------------------------------------------

    for (
        const group
        of Object.values(balance.byRound)
    ) {

        group.accuracy =
            group.total
                ? Number(
                    (
                        group.correct /
                        group.total *
                        100
                    ).toFixed(2)
                )
                : 0;

    }


    data.predictionBalance =
        balance;

}

// ============================================================
// ANÁLISIS DEL MODELO
// ============================================================

function updateModelPerformance(data) {

    const bySign = {

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

    };

    const byDifficulty = {

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

    };

    const byEuropeanImpact = {

        affected: {

            total: 0,

            correct: 0,

            accuracy: 0

        },

        notAffected: {

            total: 0,

            correct: 0,

            accuracy: 0

        }

    };

    for (
        const match
        of data.matches
    ) {

        if (
            !match.prediction?.sign ||
            !isFinishedMatch(match)
        ) {

            continue;

        }

        const real =
            match.result ||
            getResult(match);

        if (!real) {

            continue;

        }

        const prediction =
            match.prediction;

        const correct =
            prediction.sign === real;

        if (
            bySign[prediction.sign]
        ) {

            bySign[
                prediction.sign
            ].total++;

            if (correct) {

                bySign[
                    prediction.sign
                ].correct++;

            }

        }

        const difficulty =
            prediction.difficulty ||
            "media";

        if (
            byDifficulty[difficulty]
        ) {

            byDifficulty[difficulty].total++;

            if (correct) {

                byDifficulty[difficulty].correct++;

            }

        }

        const homeEurope =
            prediction
                ?.evidence
                ?.homeEuropeanImpact;

        const awayEurope =
            prediction
                ?.evidence
                ?.awayEuropeanImpact;

        const affected =
            number(
                homeEurope?.playedPrevious7Days
            ) > 0 ||
            number(
                awayEurope?.playedPrevious7Days
            ) > 0;

        const group =
            affected
                ? byEuropeanImpact.affected
                : byEuropeanImpact.notAffected;

        group.total++;

        if (correct) {

            group.correct++;

        }

    }

    for (
        const group
        of Object.values(bySign)
    ) {

        group.accuracy =
            group.total
                ? Number(
                    (
                        group.correct /
                        group.total *
                        100
                    ).toFixed(2)
                )
                : 0;

    }

    for (
        const group
        of Object.values(byDifficulty)
    ) {

        group.accuracy =
            group.total
                ? Number(
                    (
                        group.correct /
                        group.total *
                        100
                    ).toFixed(2)
                )
                : 0;

    }

    for (
        const group
        of Object.values(byEuropeanImpact)
    ) {

        group.accuracy =
            group.total
                ? Number(
                    (
                        group.correct /
                        group.total *
                        100
                    ).toFixed(2)
                )
                : 0;

    }

    data.modelPerformance = {

        modelVersion:
            "3.0",

        updatedAt:
            new Date().toISOString(),

        bySign,

        byDifficulty,

        byEuropeanImpact

    };

}

// ============================================================
// DETALLES DE PARTIDOS ESPN
// ============================================================

async function getMatchSummary(id) {

    const url =
        `${ESPN_BASE}/sports/soccer/esp.1/summary` +
        `?event=${id}`;

    return espnJSON(
        url,
        `ESPN resumen partido ${id}`
    );

}

// ============================================================
// GUARDAR DETALLES
// ============================================================

function saveESPNDetails(
    match,
    summary
) {

    const boxscore =
        summary?.boxscore ||
        null;

    const leaders =
        summary?.leaders ||
        [];

    const competitions =
        summary?.competitions ||
        [];

    const incidents =
        summary?.commentary ||
        summary?.plays ||
        [];

    const details = {

        updatedAt:
            new Date().toISOString(),

        formations: [],

        statistics: [],

        players: [],

        events: [],

        leaders: leaders,

        boxscore:

            boxscore,

        competitions:

            competitions

    };

    /*
     * ESTADÍSTICAS DE EQUIPO
     */

    if (
        Array.isArray(
            boxscore?.teams
        )
    ) {

        for (
            const team
            of boxscore.teams
        ) {

            const statistics =
                team.statistics ||
                [];

            details.statistics.push({

                teamId:
                    Number(
                        team.team?.id
                    ),

                teamName:
                    team.team
                        ?.displayName ||
                    team.team
                        ?.name ||
                    null,

                possession:
                    percentage(
                        getStatistic(
                            statistics,
                            "possession"
                        )
                    ),

                shotsTotal:
                    getStatistic(
                        statistics,
                        "totalShots"
                    ),

                shotsOnTarget:
                    getStatistic(
                        statistics,
                        "shotsOnTarget"
                    ),

                corners:
                    getStatistic(
                        statistics,
                        "wonCorners"
                    ),

                fouls:
                    getStatistic(
                        statistics,
                        "fouls"
                    ),

                offsides:
                    getStatistic(
                        statistics,
                        "offsides"
                    ),

                saves:
                    getStatistic(
                        statistics,
                        "saves"
                    ),

                passes:
                    getStatistic(
                        statistics,
                        "totalPasses"
                    ),

                accuratePasses:
                    getStatistic(
                        statistics,
                        "accuratePasses"
                    )

            });

        }

    }

    /*
     * ALINEACIONES / FORMACIONES
     */

    if (
        Array.isArray(
            summary?.rosters
        )
    ) {

        for (
            const roster
            of summary.rosters
        ) {

            details.formations.push({

                teamId:
                    Number(
                        roster.team?.id
                    ),

                teamName:
                    roster.team
                        ?.displayName ||
                    roster.team
                        ?.name ||
                    null,

                formation:
                    roster.formation ||
                    null,

                players:
                    roster.roster ||
                    []

            });

        }

    }

    /*
     * EVENTOS
     */

    if (
        Array.isArray(incidents)
    ) {

        details.events =
            incidents.map(
                event => ({

                    minute:
                        event.clock?.displayValue ||
                        event.period?.displayValue ||
                        null,

                    teamId:
                        Number(
                            event.team?.id
                        ) || null,

                    player:
                        event.text ||
                        event.participants
                            ?.map(
                                x =>
                                    x.athlete
                                        ?.displayName
                            )
                            .filter(Boolean)
                            .join(", ") ||
                        null,

                    type:
                        event.type?.text ||
                        event.type?.id ||
                        null

                })
            );

    }

    match.details =
        details;

}

// ============================================================
// ACTUALIZAR DETALLES
// ============================================================

async function updateMatchDetails(
    data,
    now
) {

    const recentLimit =
        now -
        14 * 24 * 60 * 60;

    const futureLimit =
        now +
        10 * 24 * 60 * 60;

    const candidates =
        data.matches

            .filter(
                match => {

                    if (
                        !match.id ||
                        !match.timestamp
                    ) {

                        return false;

                    }

                    const finished =
                        isFinishedMatch(
                            match
                        );

                    const recent =
                        match.timestamp >=
                        recentLimit;

                    const upcoming =
                        match.timestamp >= now &&
                        match.timestamp <=
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
                    a.timestamp -
                    b.timestamp
            )

            .slice(
                0,
                MAX_DETAIL_FIXTURES
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

            saveESPNDetails(
                match,
                summary
            );

        } catch (error) {

            console.warn(
                `No se pudo obtener detalle ${match.id}:`,
                error.message
            );

        }

    }

}

// ============================================================
// RESULTADOS
// ============================================================

function updateResults(data) {

    for (
        const match
        of data.matches
    ) {

        if (
            isFinishedMatch(match)
        ) {

            const result =
                getResult(match);

            if (result) {

                match.result =
                    result;

                match.resultUpdatedAt =
                    new Date().toISOString();

            }

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
            !match.timestamp ||
            !match.home?.id ||
            !match.away?.id
        ) {

            continue;

        }

        /*
         * ========================================================
         * PARTIDOS YA INICIADOS / TERMINADOS
         * ========================================================
         *
         * Si el partido ya comenzó:
         *
         * - NO recalculamos el pronóstico.
         * - Si ya existía, lo conservamos.
         * - Esto permite utilizar posteriormente el pronóstico
         *   histórico para calcular el balance.
         *
         * Si por alguna razón un partido antiguo no tiene
         * pronóstico, NO lo generamos ahora, porque eso introduciría
         * información posterior al inicio del partido en el modelo.
         */

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
         * ========================================================
         * PARTIDOS FUTUROS
         * ========================================================
         *
         * Generamos el pronóstico únicamente con información
         * disponible antes del partido.
         *
         * Una vez creado, el pronóstico queda congelado 12 horas
         * antes del comienzo.
         */

        if (
            !match.prediction
        ) {

            const prediction =
                createPrediction(
                    data,
                    match
                );

            if (prediction) {

                match.prediction =
                    prediction;

            }

        }

        /*
         * --------------------------------------------------------
         * BLOQUEO DEL PRONÓSTICO
         * --------------------------------------------------------
         *
         * A partir de 12 horas antes del partido no se vuelve
         * a modificar el pronóstico.
         */

        if (
            match.prediction &&
            !match.prediction.lockedAt &&
            hours <= 12
        ) {

            match.prediction.lockedAt =
                new Date().toISOString();

        }

    }

}

// ============================================================
// QUINIELA
// ============================================================

function updateQuiniela(data) {

    for (
        const match
        of data.matches
    ) {

        if (
            !match.prediction
        ) {

            continue;

        }

        match.quiniela = {

            prediction:
                match.prediction.sign,

            probability1:
                match.prediction
                    .probabilities
                    ?.["1"] ??
                null,

            probabilityX:
                match.prediction
                    .probabilities
                    ?.["X"] ??
                null,

            probability2:
                match.prediction
                    .probabilities
                    ?.["2"] ??
                null,

            difficulty:
                match.prediction
                    .difficulty ||
                null,

            confidence:
                match.prediction
                    .confidence ??
                null,

            realResult:
                match.result ||
                null

        };

    }

}

// ============================================================
// API-FOOTBALL: COMPROBACIÓN SECUNDARIA
// ============================================================

async function checkAPIFootball() {

    if (!API_FOOTBALL_KEY) {

        console.log(
            "API-Football no configurada. Se utiliza ESPN."
        );

        return {

            available: false,

            reason:
                "API_FOOTBALL_KEY no configurada"

        };

    }

    try {

        const result =
            await apiFootball(
                "/standings",
                {

                    league:
                        LEAGUE_ID,

                    season:
                        SEASON

                }
            );

        return {

            available:
                Boolean(
                    result?.response?.length
                ),

            response:
                result?.response || []

        };

    } catch (error) {

        console.warn(
            "API-Football no disponible para temporada 2026:",
            error.message
        );

        return {

            available: false,

            reason:
                error.message

        };

    }

}

// ============================================================
// VALIDACIÓN
// ============================================================

function validateData(data) {

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
        data.matches.length &&
        data.matches.length !== 380
    ) {

        console.warn(
            `Advertencia: se esperaban 380 partidos y hay ${data.matches.length}.`
        );

    }

    for (
        const match
        of data.matches
    ) {

        if (!match.id) {

            errors.push(
                "Existe un partido sin id"
            );

            break;

        }

        if (
            !match.home?.name ||
            !match.away?.name
        ) {

            errors.push(
                `Partido ${match.id} sin equipos`
            );

            break;

        }

    }

    if (errors.length) {

        throw new Error(
            "Validación fallida: " +
            errors.join("; ")
        );

    }

    console.log(
        "Validación completada correctamente."
    );

}

// ============================================================
// MAIN
// ============================================================

async function main() {

    const data =
        await loadData();

    const now =
        Math.floor(
            Date.now() / 1000
        );

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

    // --------------------------------------------------------
    // 1. CALENDARIO
    // --------------------------------------------------------

    console.log(
        "1. Descargando calendario ESPN..."
    );

    try {

        const fixtures =
            await getLaLigaCalendar();

        mergeFixtures(
            data,
            fixtures
        );

    } catch (error) {

        /*
         * Si ESPN falla pero ya tenemos calendario,
         * conservamos los datos existentes.
         */

        console.error(
            "Error descargando calendario:",
            error.message
        );

        if (
            !data.matches.length
        ) {

            throw error;

        }

    }

    // --------------------------------------------------------
    // 2. CLASIFICACIÓN
    // --------------------------------------------------------

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
        "3. Descargando goleadores ESPN..."
    );

    try {

        const scorers =
            await getScorers();

        /*
         * Sólo reemplazamos la tabla si ESPN
         * realmente devuelve jugadores.
         */

        if (
            scorers.length
        ) {

            data.scorers =
                scorers;

        }

    } catch (error) {

        console.warn(
            "No se pudieron actualizar goleadores:",
            error.message
        );

        /*
         * No borramos los goleadores existentes
         * si la API falla temporalmente.
         */

    }

    // --------------------------------------------------------
    // 4. LESIONES
    // --------------------------------------------------------

    console.log(
        "4. Descargando lesiones ESPN..."
    );

    data.injuries =
        await getInjuries();

    // --------------------------------------------------------
    // 5. NOTICIAS
    // --------------------------------------------------------

    console.log(
        "5. Descargando noticias ESPN..."
    );

    data.news =
        await getNews();

    // --------------------------------------------------------
    // 6. COMPETICIONES EUROPEAS
    // --------------------------------------------------------

    console.log(
        "6. Descargando partidos europeos..."
    );

    data.europeanMatches =
        await getEuropeanMatches();

    // --------------------------------------------------------
    // 7. API FOOTBALL
    // --------------------------------------------------------

    console.log(
        "7. Comprobando API-Football..."
    );

    const apiFootballStatus =
        await checkAPIFootball();

    // --------------------------------------------------------
    // 8. DETALLES
    // --------------------------------------------------------

    console.log(
        "8. Actualizando detalles de partidos..."
    );

    await updateMatchDetails(
        data,
        now
    );

    // --------------------------------------------------------
    // 9. RESULTADOS
    // --------------------------------------------------------

    console.log(
        "9. Actualizando resultados..."
    );

    updateResults(
        data
    );

    // --------------------------------------------------------
    // 10. PRONÓSTICOS
    // --------------------------------------------------------

    console.log(
        "10. Actualizando pronósticos..."
    );

    updatePredictions(
        data,
        now
    );

    // --------------------------------------------------------
    // 11. QUINIELA
    // --------------------------------------------------------

    console.log(
        "11. Actualizando Quiniela..."
    );

    updateQuiniela(
        data
    );

    // --------------------------------------------------------
    // 12. BALANCE
    // --------------------------------------------------------

    console.log(
        "12. Calculando balance..."
    );

    updatePredictionBalance(
        data
    );

    // --------------------------------------------------------
    // 13. RENDIMIENTO MODELO
    // --------------------------------------------------------

    console.log(
        "13. Analizando rendimiento del modelo..."
    );

    updateModelPerformance(
        data
    );

    // --------------------------------------------------------
    // 14. METADATOS
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
            SEASON_LABEL,

        source:
            "ESPN + API-Football",

        primarySource:
            "ESPN",

        secondarySource:
            "API-Football",

        apiFootballSeasonAvailable:
            apiFootballStatus.available,

        generatedAt:
            new Date().toISOString(),

        requestsThisRun

    };

    // --------------------------------------------------------
    // 15. VALIDACIÓN
    // --------------------------------------------------------

    console.log(
        "14. Validando datos..."
    );

    validateData(
        data
    );

    // --------------------------------------------------------
    // 16. GUARDAR
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

    // --------------------------------------------------------
    // INFORME FINAL
    // --------------------------------------------------------

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
        `Partidos europeos: ${data.europeanMatches.length}`
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
        `Modelo: ${data.modelPerformance.modelVersion || "3.0"}`
    );

    console.log(
        "=========================================="
    );

}

// ============================================================
// EJECUCIÓN
// ============================================================

main()
    .catch(error => {

        console.error(
            "ERROR FATAL:"
        );

        console.error(
            error
        );

        process.exit(1);

    });
