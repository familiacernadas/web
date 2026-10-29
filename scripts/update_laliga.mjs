import fs from "node:fs/promises";
import path from "node:path";
const LEAGUE_ID = 140;
const SEASON = 2026;
const ESPN_LEAGUE = "esp.1";
const ESPN_SITE_BASE =
    "https://site.api.espn.com/apis/site/v2/sports/soccer";
const ESPN_SITE_V2_BASE =
    "https://site.api.espn.com/apis/v2/sports/soccer";
const ESPN_CORE_BASE =
    "https://sports.core.api.espn.com/v2/sports/soccer/leagues";
const API_FOOTBALL_KEY =
    process.env.API_FOOTBALL_KEY || "";
const API_FOOTBALL_BASE =
    "https://v3.football.api-sports.io";
const DATA_FILE =
    path.resolve("data/laliga_2026_27.json");
let requestsThisRun = 0;
const MAX_REQUESTS = 90;
const MAX_DETAIL_FIXTURES = 40;
const MAX_EUROPEAN_TEAMS = 8;
const EUROPEAN_LOOKBACK_DAYS = 10;
const EUROPEAN_LOOKAHEAD_DAYS = 10;
const FETCH_RETRIES = 3;
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
            String(x.name || x.type || "")
                .toLowerCase() ===
            String(type)
                .toLowerCase()
    );
    if (!item) {
        return null;
    }
    return item.displayValue ??
        item.value ??
        null;
}
function dateToYYYYMMDD(date) {
    const year =
        date.getUTCFullYear();
    const month =
        String(
            date.getUTCMonth() + 1
        ).padStart(2, "0");
    const day =
        String(
            date.getUTCDate()
        ).padStart(2, "0");
    return `${year}${month}${day}`;
}
function getCurrentSeasonStart() {
    return new Date(
        Date.UTC(
            2026,
            7,
            1
        )
    );
}
function getCurrentSeasonEnd() {
    return new Date(
        Date.UTC(
            2027,
            5,
            1
        )
    );
}
async function fetchJSON(
    url,
    options = {},
    label = ""
) {
    let lastError = null;
    for (
        let attempt = 1;
        attempt <= FETCH_RETRIES;
        attempt++
    ) {
        try {
            if (
                requestsThisRun >= MAX_REQUESTS
            ) {
                throw new Error(
                    "Límite de seguridad de peticiones alcanzado."
                );
            }
            requestsThisRun++;
            console.log(
                `HTTP ${requestsThisRun}: ${label || url}`
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
                        json.message ||
                        json
                    )
                );
            }
            await sleep(120);
            return json;
        } catch (error) {
            lastError = error;
            console.warn(
                `Intento ${attempt}/${FETCH_RETRIES} fallido:`,
                error.message
            );
            if (
                attempt <
                FETCH_RETRIES
            ) {
                await sleep(
                    500 * attempt
                );
            }
        }
    }
    throw lastError;
}
async function espn(
    endpoint,
    params = {},
    label = ""
) {
    const url =
        new URL(
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
        url.toString(),
        {},
        label || url.toString()
    );
}
async function apiFootball(
    endpoint,
    params = {}
) {
    if (!API_FOOTBALL_KEY) {
        throw new Error(
            "API_FOOTBALL_KEY no configurada."
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
        url.toString(),
        {
            headers: {
                "x-apisports-key":
                    API_FOOTBALL_KEY
            }
        },
        `API-Football ${url.pathname}${url.search}`
    );
}
async function loadData() {
    // Fallo cerrado: nunca sustituir el JSON real por un conjunto vacío si el
    // archivo no existe, está dañado o no se puede leer.
    let text;
    try {
        text = await fs.readFile(DATA_FILE, "utf8");
    } catch (error) {
        throw new Error(
            `No se pudo leer el JSON existente (${DATA_FILE}). ` +
            `La actualización se cancela sin crear ni sobrescribir datos. ${error.message}`
        );
    }

    let data;
    try {
        data = JSON.parse(text);
    } catch (error) {
        throw new Error(
            `El JSON existente está dañado o no es JSON válido (${DATA_FILE}). ` +
            `La actualización se cancela y el archivo no se modifica. ${error.message}`
        );
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error(
            `El JSON existente no contiene un objeto de datos válido (${DATA_FILE}). ` +
            "La actualización se cancela sin modificarlo."
        );
    }
    if (!Array.isArray(data.matches) || !Array.isArray(data.standings)) {
        throw new Error(
            `El JSON existente no contiene arrays válidos de matches y standings (${DATA_FILE}). ` +
            "La actualización se cancela sin modificarlo."
        );
    }

    data.meta ||= {};
    data.scorers ||= [];
    data.injuries ||= [];
    data.news ||= [];
    data.europeanMatches ||= [];
    data.europeanLoad ||= {};
    data.modelEvaluation ||= {};
    data.predictionBalance ||= {};
    data.predictionBalanceV31 ||= {};
    return data;
}

function normalizeESPNEvent(event) {
    const competition =
        event.competitions?.[0];
    const competitors =
        competition?.competitors || [];
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
    const status =
        event.status || {};
    const completed =
        Boolean(
            status.type?.completed
        );
    let shortStatus =
        status.type?.shortDetail ||
        status.type?.name ||
        null;
    if (completed) {
        shortStatus = "FT";
    }
    // ESPN puede publicar la lista completa en event.broadcasts y dejar
    // competition.broadcasts vacío. No priorizar un array vacío.
    const broadcasts =
        (Array.isArray(competition?.broadcasts) && competition.broadcasts.length
            ? competition.broadcasts
            : event.broadcasts) ||
        [];
    const tv =
        broadcasts
            .flatMap(
                x =>
                    x.names ||
                    []
            )
            .filter(Boolean);
    const date =
        event.date || null;
    return {
        id:
            Number(event.id),
        espnId:
            String(event.id),
        round:
            event.week?.number ??
            competition?.week?.number ??
            null,
        seasonType:
            event.season?.slug ||
            event.season?.type?.slug ||
            null,
        date,
        timestamp:
            date
                ? Math.floor(
                    new Date(date)
                        .getTime() / 1000
                )
                : null,
        status:
            shortStatus,
        statusLong:
            status.type?.description ||
            status.type?.detail ||
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
            halftime: {
                home:
                    null,
                away:
                    null
            },
            fulltime: {
                home:
                    completed
                        ? number(
                            home?.score
                        )
                        : null,
                away:
                    completed
                        ? number(
                            away?.score
                        )
                        : null
            },
            extratime:
                null,
            penalty:
                null
        },
        broadcasts:
            tv,
        odds:
            competition?.odds ||
            []
    };
}
// Combina datos del proveedor sin borrar valores ya conocidos cuando la
// respuesta nueva llega incompleta. Los valores 0 y false son válidos; solo
// se consideran ausentes null, undefined, cadenas vacías y arrays vacíos.
function mergePreservingKnown(previous, incoming) {
    if (incoming === null || incoming === undefined || incoming === "") {
        return previous ?? incoming;
    }
    if (Array.isArray(incoming)) {
        return incoming.length ? incoming : (Array.isArray(previous) && previous.length ? previous : incoming);
    }
    if (typeof incoming === "object") {
        const result = {};
        const keys = new Set([
            ...Object.keys(previous && typeof previous === "object" ? previous : {}),
            ...Object.keys(incoming)
        ]);
        for (const key of keys) {
            result[key] = mergePreservingKnown(previous?.[key], incoming[key]);
        }
        return result;
    }
    return incoming;
}

function mergeFixtures(
    data,
    fixtures
) {
    const existing =
        new Map(
            data.matches.map(
                match => [
                    String(match.id),
                    match
                ]
            )
        );
    for (
        const fixture
        of fixtures
    ) {
        const normalized =
            normalizeESPNEvent(
                fixture
            );
        if (!normalized.id) {
            continue;
        }
        const key =
            String(
                normalized.id
            );
        const old =
            existing.get(key);
        if (old) {
            const prediction = old.prediction;
            const details = old.details;
            const previousKnownFields = {
                date: old.date, timestamp: old.timestamp, status: old.status,
                statusLong: old.statusLong, seasonType: old.seasonType,
                venue: old.venue, home: old.home, away: old.away,
                score: old.score, odds: old.odds
            };
            const previousBroadcasts = Array.isArray(old.broadcasts)
                ? old.broadcasts.filter(Boolean)
                : [];
            const incomingBroadcasts = Array.isArray(normalized.broadcasts)
                ? normalized.broadcasts.filter(Boolean)
                : [];

            // Protección: ESPN puede devolver round=null o una jornada
            // incorrecta. Conservamos la jornada anterior si es válida;
            // applyOfficialRounds la sustituirá cuando haya fuente oficial.
            const previousRound = Number(old.round);
            const hadValidPreviousRound =
                Number.isInteger(previousRound) &&
                previousRound >= 1 &&
                previousRound <= 38;

            Object.assign(old, normalized);

            if (hadValidPreviousRound) {
                old.round = previousRound;
            }
            if (prediction !== undefined) {
                old.prediction = prediction;
            }
            if (details !== undefined) {
                old.details = details;
            }
            // No permitimos que campos ausentes en la respuesta de ESPN borren
            // marcadores, datos de equipos, fecha, estadio u cuotas ya conocidos.
            for (const field of Object.keys(previousKnownFields)) {
                old[field] = mergePreservingKnown(
                    previousKnownFields[field],
                    normalized[field]
                );
            }

            // ESPN puede omitir emisiones o devolver solo una parte. Conservamos
            // las ya conocidas y añadimos las nuevas sin duplicados. Así una
            // respuesta incompleta nunca borra retransmisiones previamente guardadas.
            const mergedBroadcasts = [...previousBroadcasts];
            const knownBroadcasts = new Set(
                mergedBroadcasts.map(name => String(name).trim().toLocaleLowerCase())
            );
            for (const name of incomingBroadcasts) {
                const key = String(name).trim().toLocaleLowerCase();
                if (key && !knownBroadcasts.has(key)) {
                    mergedBroadcasts.push(name);
                    knownBroadcasts.add(key);
                }
            }
            old.broadcasts = mergedBroadcasts;
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
async function getESPNFixtures() {
    const start =
        getCurrentSeasonStart();
    const end =
        getCurrentSeasonEnd();
    const dates =
        `${dateToYYYYMMDD(start)}-` +
        `${dateToYYYYMMDD(end)}`;
    console.log(
        `ESPN calendario: ${dates}`
    );
    const data =
        await espn(
            `${ESPN_SITE_BASE}/${ESPN_LEAGUE}/scoreboard`,
            {
                dates,
                limit: 1000
            },
            "ESPN LaLiga calendario"
        );
    return data.events || [];
}
function extractStandingsRows(
    json
) {
    const rows = [];
    function walk(node) {
        if (!node) {
            return;
        }
        if (Array.isArray(node)) {
            for (
                const item
                of node
            ) {
                walk(item);
            }
            return;
        }
        if (
            typeof node !==
            "object"
        ) {
            return;
        }
        if (
            node.team &&
            (
                node.stats ||
                node.records ||
                node.note
            )
        ) {
            rows.push(node);
        }
        for (
            const value
            of Object.values(node)
        ) {
            if (
                value &&
                typeof value ===
                "object"
            ) {
                walk(value);
            }
        }
    }
    walk(json);
    return rows;
}
function getStatValue(
    stats,
    names
) {
    if (!Array.isArray(stats)) {
        return null;
    }
    const wanted =
        names.map(
            x =>
                String(x)
                    .toLowerCase()
        );
    const item =
        stats.find(
            x => {
                const name =
                    String(
                        x.name ||
                        x.displayName ||
                        x.abbreviation ||
                        ""
                    )
                    .toLowerCase();
                return wanted.includes(
                    name
                );
            }
        );
    if (!item) {
        return null;
    }
    return (
        item.value ??
        item.displayValue ??
        null
    );
}
function normalizeESPNStanding(
    row,
    index
) {
    const team =
        row.team || {};
    const stats =
        row.stats ||
        row.statistics ||
        [];
    const records =
        row.records ||
        [];
    let wins =
        getStatValue(
            stats,
            ["wins", "w"]
        );
    let draws =
        getStatValue(
            stats,
            ["ties", "draws", "d"]
        );
    let losses =
        getStatValue(
            stats,
            ["losses", "l"]
        );
    let played =
        getStatValue(
            stats,
            ["gamesPlayed", "gp", "played"]
        );
    let points =
        getStatValue(
            stats,
            ["points", "p"]
        );
    let gf =
        getStatValue(
            stats,
            ["pointsFor", "goalsFor", "gf", "f"]
        );
    let ga =
        getStatValue(
            stats,
            ["pointsAgainst", "goalsAgainst", "ga", "a"]
        );
    let gd =
        getStatValue(
            stats,
            ["pointDifferential", "goalDifference", "gd"]
        );
    if (
        !played &&
        Array.isArray(records)
    ) {
        const total =
            records.find(
                x =>
                    x.type ===
                    "total"
            ) ||
            records[0];
        if (total?.summary) {
            const parts =
                String(
                    total.summary
                )
                .split("-")
                .map(Number);
            if (
                parts.length === 3
            ) {
                wins ??= parts[0];
                draws ??= parts[1];
                losses ??= parts[2];
                played =
                    parts.reduce(
                        (a, b) =>
                            a + b,
                        0
                    );
            }
        }
    }


    return {
        rank:
            row.order ??
            row.rank ??
            index + 1,
        team: {
            id:
                team.id
                    ? Number(team.id)
                    : null,
            name:
                team.displayName ||
                team.name ||
                null,
            abbreviation:
                team.abbreviation ||
                null,
            logo:
                team.logos?.[0]?.href ||
                team.logo ||
                null
        },
        points:
            number(points, 0),
        goalsDiff:
            number(gd, 0),
        form:
            row.form ||
            null,
        played:
            number(played, 0),
        wins:
            number(wins, 0),
        draws:
            number(draws, 0),
        losses:
            number(losses, 0),
        gf:
            number(gf, 0),
        ga:
            number(ga, 0),
        home:
            null,
        away:
            null
    };
}
async function getESPNStandings() {
    const json =
        await espn(
            `${ESPN_SITE_V2_BASE}/${ESPN_LEAGUE}/standings`,
            {
                limit: 100
            },
            "ESPN LaLiga clasificación"
        );
    const rows =
        extractStandingsRows(
            json
        );
    return rows
        .map(
            normalizeESPNStanding
        )
        .sort(
            (a, b) =>
                a.rank -
                b.rank
        );
}
function extractLeadersFromJSON(
    json
) {
    const result = [];
    function walk(node) {
        if (!node) {
            return;
        }
        if (Array.isArray(node)) {
            for (
                const item
                of node
            ) {
                walk(item);
            }
            return;
        }
        if (
            typeof node !==
            "object"
        ) {
            return;
        }
        const athlete =
            node.athlete ||
            node.player;
        if (
            athlete &&
            (
                node.value !==
                undefined ||
                node.displayValue ||
                node.stats
            )
        ) {
            result.push({
                athlete,
                row: node
            });
        }
        for (
            const value
            of Object.values(node)
        ) {
            if (
                value &&
                typeof value ===
                "object"
            ) {
                walk(value);
            }
        }
    }
    walk(json);
    return result;
}
async function getESPNScorers() {
    const json = await fetchJSON(
        `${ESPN_SITE_BASE}/${ESPN_LEAGUE}/statistics`,
        "ESPN goleadores"
    );
    const goalsBlock = (json?.stats || []).find(x =>
        String(x?.name || "").toLowerCase() === "goalsleaders" ||
        String(x?.abbreviation || "").toLowerCase() === "g"
    );
    if (!goalsBlock?.leaders?.length) {
        throw new Error("ESPN no ha devuelto stats.goalsLeaders.leaders");
    }
    return goalsBlock.leaders
        .map((leader, index) => {
            const athlete = leader?.athlete || {};
            const stats = Array.isArray(leader?.statistics) ? leader.statistics : [];
            const get = (...names) => {
                const wanted = names.map(x => String(x).toLowerCase());
                const item = stats.find(x =>
                    wanted.includes(String(x?.name || x?.abbreviation || "").toLowerCase())
                );
                return item?.value ?? item?.displayValue ?? null;
            };
            return {
                rank: index + 1,
                player: {
                    id: athlete.id ? Number(athlete.id) : null,
                    name: athlete.displayName || athlete.fullName || athlete.shortName || null,
                    shortName: athlete.shortName || null,
                    photo: athlete.headshot?.href || null
                },
                team: athlete.team ? {
                    id: Number(athlete.team.id) || null,
                    name: athlete.team.displayName || athlete.team.name || null,
                    abbreviation: athlete.team.abbreviation || null,
                    logo: athlete.team.logos?.[0]?.href || null
                } : null,
                goals: {
                    total: number(leader?.value, 0),
                    assists: number(get("goalAssists", "assists"), 0)
                },
                assists: number(get("goalAssists", "assists"), 0),
                appearances: number(get("appearances", "apps"), 0),
                minutes: number(get("minutes"), 0),
                rating: null
            };
        })
        .filter(x => x.player.name)
        .sort((a, b) => b.goals.total - a.goals.total || b.assists - a.assists)
        .slice(0, 20);
}
async function updateScorers(data) {
    try {
        const scorers = await getESPNScorers();
        if (scorers.length) data.scorers = scorers;
        console.log(`Goleadores obtenidos: ${data.scorers.length}`);
        if (data.scorers.length) {
            const top = data.scorers[0];
            console.log(`Máximo goleador: ${top.player.name} (${top.goals.total} goles, ${top.appearances} partidos)`);
        }
    } catch (error) {
        console.warn("No se pudieron actualizar goleadores ESPN:", error.message);
    }
}
async function getESPNInjuries() {
    try {
        const json =
            await espn(
                `${ESPN_SITE_BASE}/${ESPN_LEAGUE}/injuries`,
                {
                    limit: 500
                },
                "ESPN lesiones"
            );
        return (
            json.injuries ||
            json.items ||
            json.results ||
            []
        );
    } catch (error) {
        console.warn(
            "ESPN lesiones no disponibles:",
            error.message
        );
        return [];
    }
}
async function getESPNNews() {
    try {
        const json =
            await espn(
                `${ESPN_SITE_BASE}/${ESPN_LEAGUE}/news`,
                {
                    limit: 20
                },
                "ESPN noticias"
            );
        return (
            json.articles ||
            json.items ||
            []
        )
        .slice(0, 20)
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
                    article.published ||
                    null,
                published:
                    article.published ||
                    null,
                link:
                    article.links?.web?.href ||
                    article.link ||
                    null,
                images:
                    article.images ||
                    []
            })
        );
    } catch (error) {
        console.warn(
            "ESPN noticias no disponibles:",
            error.message
        );
        return [];
    }
}
async function getESPNMatchSummary(
    eventId
) {
    return espn(
        `${ESPN_SITE_BASE}/${ESPN_LEAGUE}/summary`,
        {
            event:
                eventId
        },
        `ESPN resumen partido ${eventId}`
    );
}
// Considera útil un detalle solo si contiene información deportiva real.
// Los identificadores/nombres de los equipos por sí solos no cuentan: ESPN
// puede devolver un boxscore vacío con todos los valores estadísticos a null.
function hasUsefulMatchDetails(details) {
    if (!details || typeof details !== "object") return false;

    const hasValue = value => {
        if (value === null || value === undefined) return false;
        if (typeof value === "string") {
            const normalized = value.trim().toLowerCase();
            return normalized !== "" && normalized !== "—" && normalized !== "-" && normalized !== "n/a" && normalized !== "null";
        }
        return true; // Incluye 0: una estadística de cero es un dato válido.
    };

    if (Array.isArray(details.events) && details.events.length > 0) return true;
    if (Array.isArray(details.players) && details.players.length > 0) return true;

    if (Array.isArray(details.lineups) && details.lineups.some(lineup =>
        hasValue(lineup?.formation) ||
        (Array.isArray(lineup?.starters) && lineup.starters.length > 0) ||
        (Array.isArray(lineup?.substitutes) && lineup.substitutes.length > 0)
    )) return true;

    if (Array.isArray(details.statistics) && details.statistics.some(teamStats =>
        Object.entries(teamStats || {}).some(([key, value]) =>
            !["teamId", "teamName"].includes(key) && hasValue(value)
        )
    )) return true;

    return false;
}

function saveESPNDetails(
    match,
    summary
) {
    const boxscore =
        summary.boxscore || {};
    const teams =
        boxscore.teams ||
        [];
    const statistics = [];
    for (
        const team
        of teams
    ) {
        const stats =
            team.statistics ||
            [];
        statistics.push({
            teamId:
                team.team?.id
                    ? Number(
                        team.team.id
                    )
                    : null,
            teamName:
                team.team?.displayName ||
                team.team?.name ||
                null,
            possession:
                percentage(
                    statisticValue(
                        stats,
                        "possessionPct"
                    ) ??
                    statisticValue(
                        stats,
                        "possession"
                    )
                ),
            shotsTotal:
                statisticValue(
                    stats,
                    "shots"
                ),
            shotsOnTarget:
                statisticValue(
                    stats,
                    "shotsOnTarget"
                ),
            corners:
                statisticValue(
                    stats,
                    "corners"
                ),
            fouls:
                statisticValue(
                    stats,
                    "fouls"
                ),
            offsides:
                statisticValue(
                    stats,
                    "offsides"
                ),
            yellowCards:
                statisticValue(
                    stats,
                    "yellowCards"
                ),
            redCards:
                statisticValue(
                    stats,
                    "redCards"
                ),
            goalkeeperSaves:
                statisticValue(
                    stats,
                    "saves"
                ),
            passes:
                statisticValue(
                    stats,
                    "passes"
                ),
            accuratePasses:
                statisticValue(
                    stats,
                    "accuratePasses"
                )
        });
    }
    const competitions =
        summary.header?.competitions ||
        summary.competitions ||
        [];
    const competition =
        competitions[0] ||
        {};
    const competitors =
        competition.competitors ||
        [];
    const lineups =
        [];
    for (
        const competitor
        of competitors
    ) {
        const lineup =
            competitor.lineup ||
            competitor.lineups ||
            null;
        if (
            lineup
        ) {
            lineups.push({
                teamId:
                    competitor.team?.id
                        ? Number(
                            competitor.team.id
                        )
                        : null,
                teamName:
                    competitor.team?.displayName ||
                    competitor.team?.name ||
                    null,
                formation:
                    lineup.formation ||
                    null,
                coach:
                    null,
                starters:
                    [],
                substitutes:
                    []
            });
        }
    }
    const events =
        (
            summary.commentary ||
            summary.plays ||
            []
        )
        .map(
            event => ({
                minute:
                    event.clock?.displayValue ||
                    event.time?.displayValue ||
                    null,
                extra:
                    null,
                teamId:
                    event.team?.id
                        ? Number(
                            event.team.id
                        )
                        : null,
                player:
                    event.participants?.[0]
                        ?.athlete
                        ?.displayName ||
                    event.text ||
                    null,
                assist:
                    null,
                type:
                    event.type?.text ||
                    event.type?.id ||
                    null,
                detail:
                    event.text ||
                    null
            })
        );
    const newDetails = {
        updatedAt: new Date().toISOString(),
        source: "ESPN",
        lineups,
        statistics,
        players: [],
        events
    };

    if (hasUsefulMatchDetails(newDetails)) {
        match.details = newDetails;
    } else if (!hasUsefulMatchDetails(match.details)) {
        // Elimina el objeto vacío heredado para que el partido pueda volver
        // a intentarse en futuras ejecuciones. No borra detalles útiles previos.
        delete match.details;
        console.warn(`ESPN no devolvió estadísticas, alineaciones ni eventos útiles para ${match.id}; no se guardan detalles vacíos.`);
    } else {
        console.warn(`ESPN devolvió detalles vacíos para ${match.id}; se conservan los detalles útiles existentes.`);
    }

    const broadcasts = (competition.broadcasts || [])
        .flatMap(x => x.names || [])
        .filter(Boolean);
    // Un resumen también puede traer solo parte de las emisiones. Unimos
    // lo recibido con lo existente, sin duplicados y sin perder datos previos.
    const existingBroadcasts = Array.isArray(match.broadcasts)
        ? match.broadcasts.filter(Boolean)
        : [];
    const mergedBroadcasts = [...existingBroadcasts];
    const knownBroadcasts = new Set(
        mergedBroadcasts.map(name => String(name).trim().toLocaleLowerCase())
    );
    for (const name of broadcasts) {
        const key = String(name).trim().toLocaleLowerCase();
        if (key && !knownBroadcasts.has(key)) {
            mergedBroadcasts.push(name);
            knownBroadcasts.add(key);
        }
    }
    match.broadcasts = mergedBroadcasts;
}


const UEFA_COMPETITIONS = [
    { slug: "uefa.champions", name: "Champions League", short: "UCL" },
    { slug: "uefa.europa", name: "Europa League", short: "UEL" },
    { slug: "uefa.europa-conference", name: "Conference League", short: "UECL" }
];
function normalizeEuropeanEvent(event, competition) {
    const competitors = event.competitions?.[0]?.competitors || [];
    const home = competitors.find(x => x.homeAway === "home");
    const away = competitors.find(x => x.homeAway === "away");
    const status = event.status || {};
    const completed = Boolean(status.type?.completed);
    const date = event.date || null;
    return {
        id: String(event.id),
        date,
        timestamp: date ? Math.floor(new Date(date).getTime() / 1000) : null,
        status: completed ? "FT" : (status.type?.name || status.type?.shortDetail || null),
        competition: competition.name,
        competitionShort: competition.short,
        round: event.week?.number ?? event.competitions?.[0]?.week?.number ?? null,
        home: {
            id: home?.team?.id ? Number(home.team.id) : null,
            name: home?.team?.displayName || home?.team?.name || null,
            logo: home?.team?.logo || null
        },
        away: {
            id: away?.team?.id ? Number(away.team.id) : null,
            name: away?.team?.displayName || away?.team?.name || null,
            logo: away?.team?.logo || null
        },
        score: {
            home: completed ? number(home?.score, null) : null,
            away: completed ? number(away?.score, null) : null
        }
    };
}
function europeanContextForTeam(data, teamId, timestamp) {
    const events = (data.europeanMatches || [])
        .filter(x =>
            x.timestamp &&
            (x.home?.id === teamId || x.away?.id === teamId)
        )
        .sort((a, b) => a.timestamp - b.timestamp);
    const previous = events
        .filter(x => x.timestamp < timestamp && x.status === "FT")
        .slice(-3);
    const next = events
        .filter(x => x.timestamp >= timestamp && x.status !== "FT")
        .slice(0, 3);
    const previousEuropean = previous.at(-1) || null;
    const restHours = previousEuropean
        ? Number(((timestamp - previousEuropean.timestamp) / 3600).toFixed(1))
        : null;
    const matchesLast7d = previous.filter(x => timestamp - x.timestamp <= 7 * 86400).length;
    let fatigueScore = 0;
    if (restHours !== null) {
        if (restHours < 72) fatigueScore += 3;
        else if (restHours < 96) fatigueScore += 2;
        else if (restHours < 120) fatigueScore += 1;
    }
    if (matchesLast7d >= 2) fatigueScore += 2;
    else if (matchesLast7d === 1) fatigueScore += 1;
    return {
        europeanMatchesLast7d: matchesLast7d,
        previousEuropeanMatch: previousEuropean,
        nextEuropeanMatches: next,
        hoursSincePreviousEuropean: restHours,
        fatigueScore,
        fatigueLevel: fatigueScore >= 4 ? "alta" : fatigueScore >= 2 ? "media" : "baja"
    };
}
async function getEuropeanMatches(data) {
    const teamByName = new Map();
    for (const row of data.standings || []) {
        if (row.team?.id && row.team?.name) teamByName.set(row.team.name, row.team);
    }
    const aliases = {
        "FC Barcelona": ["FC Barcelona", "Barcelona"],
        "Real Madrid": ["Real Madrid"],
        "Atlético de Madrid": ["Atlético de Madrid", "Atletico Madrid"],
        "Villarreal CF": ["Villarreal CF", "Villarreal"],
        "Real Betis": ["Real Betis", "Betis"],
        "Celta": ["Celta", "RC Celta", "Celta Vigo"],
        "Real Sociedad": ["Real Sociedad"],
        "Getafe CF": ["Getafe CF", "Getafe"]
    };
    function findTeam(canonical) {
        for (const name of aliases[canonical] || [canonical]) {
            if (teamByName.has(name)) return teamByName.get(name);
        }
        return null;
    }
    const assignments = [
        { competition: UEFA_COMPETITIONS[0], teams: ["FC Barcelona", "Real Madrid", "Atlético de Madrid", "Villarreal CF"] },
        { competition: UEFA_COMPETITIONS[1], teams: ["Real Betis", "Celta", "Real Sociedad"] },
        { competition: UEFA_COMPETITIONS[2], teams: ["Getafe CF"] }
    ];
    const result = [];
    const seen = new Set();
    for (const assignment of assignments) {
        for (const canonical of assignment.teams) {
            const team = findTeam(canonical);
            if (!team?.id) continue;
            try {
                const json = await espn(
                    `${ESPN_SITE_BASE}/${assignment.competition.slug}/teams/${team.id}/schedule`,
                    { season: SEASON, limit: 100 },
                    `ESPN ${assignment.competition.short} ${team.displayName || team.name}`
                );
                for (const event of json.events || []) {
                    const normalized = normalizeEuropeanEvent(event, assignment.competition);
                    if (!normalized.id || !normalized.timestamp || seen.has(normalized.id)) continue;
                    seen.add(normalized.id);
                    result.push(normalized);
                }
            } catch (error) {
                console.warn(
                    `No disponible ${assignment.competition.name} para ${team.displayName || team.name}:`,
                    error.message
                );
            }
        }
    }
    return result.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
}
function updateEuropeanLoad(data) {
    const load = {};
    const matches = data.europeanMatches || [];
    const now = Math.floor(Date.now() / 1000);
    for (const row of data.standings || []) {
        const teamId = row.team?.id;
        if (!teamId) continue;
        const history = data.matches
            .filter(m =>
                m.timestamp && m.timestamp < now &&
                ["FT", "AET", "PEN"].includes(m.status) &&
                (m.home?.id === teamId || m.away?.id === teamId)
            )
            .sort((a, b) => a.timestamp - b.timestamp);
        const europe = matches
            .filter(m =>
                m.timestamp &&
                (m.home?.id === teamId || m.away?.id === teamId)
            )
            .sort((a, b) => a.timestamp - b.timestamp);
        const recentEurope = europe.filter(m =>
            m.timestamp < now &&
            now - m.timestamp <= 7 * 86400 &&
            m.status === "FT"
        );
        const lastDomestic = history.at(-1) || null;
        const lastEurope = recentEurope.at(-1) || null;
        const nextEurope = europe.find(m => m.timestamp >= now && m.status !== "FT") || null;
        const hoursFromEuropeToNextLeague =
            lastEurope && nextEurope && nextEurope.timestamp > lastEurope.timestamp
                ? Number(((nextEurope.timestamp - lastEurope.timestamp) / 3600).toFixed(1))
                : null;
        load[String(teamId)] = {
            teamId,
            teamName: row.team?.name || null,
            europeanMatchesLast7d: recentEurope.length,
            lastEuropeanMatch: lastEurope,
            nextEuropeanMatch: nextEurope,
            lastDomesticMatch: lastDomestic,
            hoursFromLastEuropeanToNextLeague: hoursFromEuropeToNextLeague
        };
    }
    data.europeanLoad = load;
}
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
    if (
        home >
        away
    ) {
        return "1";
    }
    if (
        home <
        away
    ) {
        return "2";
    }
    return "X";
}
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
                [
                    "FT",
                    "AET",
                    "PEN"
                ].includes(
                    match.status
                ) &&
                (
                    match.home?.id ===
                        teamId ||
                    match.away?.id ===
                        teamId
                )
        )
        .sort(
            (a, b) =>
                a.timestamp -
                b.timestamp
        );
}


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
                    match.home?.id ===
                    teamId
            );
    }
    if (
        venue === "away"
    ) {
        matches =
            matches.filter(
                match =>
                    match.away?.id ===
                    teamId
            );
    }
    const last5 =
        matches.slice(-5);
    const last10 =
        matches.slice(-10);
    function aggregate(
        list
    ) {
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
                match.home?.id ===
                teamId;
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
                scored >
                conceded
            ) {
                points += 3;
                wins++;
            } else if (
                scored ===
                conceded
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
            ![
                "FT",
                "AET",
                "PEN"
            ].includes(
                match.status
            )
        ) {
            continue;
        }
        const statistics =
            match.details?.statistics ||
            [];
        const teamStats =
            statistics.find(
                x =>
                    x.teamId ===
                    teamId
            );
        if (
            teamStats
        ) {
            saves +=
                number(
                    teamStats.goalkeeperSaves
                );
        }
        const isHome =
            match.home?.id ===
            teamId;
        const goals =
            isHome
                ? match.score?.fulltime?.away
                : match.score?.fulltime?.home;
        conceded +=
            number(
                goals
            );
        appearances++;
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
            ![
                "FT",
                "AET",
                "PEN"
            ].includes(
                match.status
            )
        ) {
            continue;
        }
        const lineups =
            match.details?.lineups ||
            [];
        const lineup =
            lineups.find(
                x =>
                    x.teamId ===
                    teamId
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
        const home =
            match.home?.id ===
            teamId;
        const gf =
            home
                ? number(
                    match.score?.fulltime?.home
                )
                : number(
                    match.score?.fulltime?.away
                );
        const ga =
            home
                ? number(
                    match.score?.fulltime?.away
                )
                : number(
                    match.score?.fulltime?.home
                );
        row.gf += gf;
        row.ga += ga;
        if (
            gf >
            ga
        ) {
            row.wins++;
        } else if (
            gf ===
            ga
        ) {
            row.draws++;
        } else {
            row.losses++;
        }
    }
    return formations;
}
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
    homeScore +=
        0.30;
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
                "3.0-official",
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
function createPredictionV31(data, match) {
    const base = createPrediction(data, match);
    const timestamp = match.timestamp;
    const homeEurope = europeanContextForTeam(data, match.home.id, timestamp);
    const awayEurope = europeanContextForTeam(data, match.away.id, timestamp);
    let p1 = base.probabilities["1"];
    let px = base.probabilities["X"];
    let p2 = base.probabilities["2"];
    function fatiguePenalty(ctx) {
        if (ctx.fatigueScore >= 5) return 0.055;
        if (ctx.fatigueScore >= 3) return 0.035;
        if (ctx.fatigueScore >= 1) return 0.015;
        return 0;
    }
    const homePenalty = fatiguePenalty(homeEurope);
    const awayPenalty = fatiguePenalty(awayEurope);
    p1 -= homePenalty;
    p2 -= awayPenalty;
    px += (homePenalty + awayPenalty) * 0.55;
    if (homeEurope.hoursSincePreviousEuropean !== null && homeEurope.hoursSincePreviousEuropean < 72) {
        p1 -= 0.025;
        px += 0.012;
        p2 += 0.013;
    }
    if (awayEurope.hoursSincePreviousEuropean !== null && awayEurope.hoursSincePreviousEuropean < 72) {
        p2 -= 0.025;
        px += 0.012;
        p1 += 0.013;
    }
    p1 = Math.max(0.01, p1);
    px = Math.max(0.01, px);
    p2 = Math.max(0.01, p2);
    const total = p1 + px + p2;
    p1 /= total; px /= total; p2 /= total;
    let sign = "X";
    if (p1 >= px && p1 >= p2) sign = "1";
    else if (p2 >= px && p2 >= p1) sign = "2";
    const confidence = Math.max(p1, px, p2);
    const difficulty = confidence >= 0.58 ? "fácil" : confidence >= 0.48 ? "media" : "difícil";
    return {
        ...base,
        sign,
        probabilities: {
            "1": Number(p1.toFixed(4)),
            "X": Number(px.toFixed(4)),
            "2": Number(p2.toFixed(4))
        },
        confidence: Number(confidence.toFixed(4)),
        difficulty,
        generatedAt: new Date().toISOString(),
        model: {
            version: "3.1-experimental",
            baseModel: "3.0-official",
            weights: {
                form: 0.30,
                attackDefense: 0.30,
                homeAdvantage: 0.20,
                goalkeeper: 0.10,
                tacticalAbsences: 0.10
            },
            experimentalAdjustment: {
                europeanLoad: 0.05
            }
        },
        evidence: {
            ...base.evidence,
            homeEuropean: homeEurope,
            awayEuropean: awayEurope
        }
    };
}
function updateModelBalance(data, predictionField, targetField) {
    const balance = {
        total: 0,
        correct: 0,
        accuracy: 0,
        bySign: { "1": { total: 0, correct: 0 }, "X": { total: 0, correct: 0 }, "2": { total: 0, correct: 0 } },
        byDifficulty: { "fácil": { total: 0, correct: 0 }, "media": { total: 0, correct: 0 }, "difícil": { total: 0, correct: 0 } }
    };
    for (const match of data.matches) {
        const prediction = match[predictionField];
        if (!prediction?.sign || !["FT", "AET", "PEN"].includes(match.status)) continue;
        const real = getResult(match);
        if (!real) continue;
        const correct = prediction.sign === real;
        balance.total++;
        if (correct) balance.correct++;
        if (balance.bySign[prediction.sign]) {
            balance.bySign[prediction.sign].total++;
            if (correct) balance.bySign[prediction.sign].correct++;
        }
        const difficulty = prediction.difficulty || "media";
        if (balance.byDifficulty[difficulty]) {
            balance.byDifficulty[difficulty].total++;
            if (correct) balance.byDifficulty[difficulty].correct++;
        }
    }
    balance.accuracy = balance.total ? Number((balance.correct / balance.total * 100).toFixed(2)) : 0;
    data[targetField] = balance;
}
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
            ![
                "FT",
                "AET",
                "PEN"
            ].includes(
                match.status
            )
        ) {
            continue;
        }
        const real =
            getResult(
                match
            );
        if (!real) {
            continue;
        }
        const prediction =
            match.prediction.sign;
        const correct =
            prediction ===
            real;
        balance.total++;
        if (correct) {
            balance.correct++;
        }

   
            if (
            balance.bySign[
                prediction
            ]
        ) {
            balance.bySign[
                prediction
            ].total++;
            if (correct) {
                balance.bySign[
                    prediction
                ].correct++;
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
async function tryAPIFootballData(
    data
) {
    if (!API_FOOTBALL_KEY) {
        console.log(
            "API-Football no configurada; se utiliza ESPN."
        );
        data.meta.apiFootballSeasonAvailable =
            false;
        return;
    }
    try {
        const standings =
            await apiFootball(
                "/standings",
                {
                    league:
                        LEAGUE_ID,
                    season:
                        SEASON
                }
            );
        const table =
            standings.response?.[0]
                ?.league
                ?.standings?.[0] ||
            [];
        if (
            table.length
        ) {
            data.meta.apiFootballSeasonAvailable =
                true;
            data.meta.apiFootballStandings =
                table.length;
            console.log(
                `API-Football clasificación disponible: ${table.length}`
            );
        }
    } catch (error) {
        data.meta.apiFootballSeasonAvailable =
            false;
        console.warn(
            "API-Football no disponible para 2026/27:",
            error.message
        );
    }
}
async function updateMatchDetails(
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
                        ].includes(
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
                        !hasUsefulMatchDetails(match.details) &&
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
                    (
                        a.timestamp ||
                        0
                    ) -
                    (
                        b.timestamp ||
                        0
                    )
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
                await getESPNMatchSummary(
                    match.espnId ||
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
const ROUND_SOURCE_URL =
    "https://raw.githubusercontent.com/openfootball/espana/master/2026-27/1-liga.txt";
function normalizeRoundTeamName(name) {
    const n = String(name || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\b(?:cf|fc|ud)\b/g, "")
        .replace(/[.,]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const aliases = {
        "real betis balompie": "real betis",
        "real sociedad de futbol": "real sociedad",
        "club atletico de madrid": "atletico de madrid",
        "atletico madrid": "atletico de madrid",
        "rc deportivo la coruna": "rc deportivo",
        "rc deportivo de a coruna": "rc deportivo",
        "deportivo": "rc deportivo",
        "real racing club de santander": "r racing club",
        "racing de santander": "r racing club",
        "racing santander": "r racing club",
        "racing club santander": "r racing club",
        "racing": "r racing club",
        "rayo vallecano de madrid": "rayo vallecano",
        "rc celta de vigo": "celta",
        "celta vigo": "celta",
        "club atletico osasuna": "ca osasuna",
        "osasuna": "ca osasuna",
        "deportivo alaves": "alaves",
        "athletic bilbao": "athletic club",
        "athletic club de bilbao": "athletic club",
        "rcd espanyol": "espanyol",
        "rcd espanyol de barcelona": "espanyol",
        "espanyol de barcelona": "espanyol",
        "espanyol barcelona": "espanyol",
        "rcd mallorca": "mallorca"
    };

    return aliases[n] || n;
}

function officialFixtureKey(home, away) {
    return normalizeRoundTeamName(home) + "|" + normalizeRoundTeamName(away);
}
async function getOfficialRoundMap() {
    try {
        const response = await fetch(ROUND_SOURCE_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        const map = new Map();
        let round = null;
        for (const raw of text.split(/\r?\n/)) {
            const line = raw.trim();
            const rm = line.match(/Matchday\s+(\d+)/i);
            if (rm) { round = Number(rm[1]); continue; }
            if (!round) continue;
            const fm = line.match(/^(?:\d{1,2}:\d{2}\s+)?(.+?)\s+v\s+(.+?)(?:\s+\d+-\d+(?:\s+\(\d+-\d+\))?)?$/);
            if (fm) map.set(officialFixtureKey(fm[1], fm[2]), round);
        }
        return map;
    } catch (error) {
        console.warn("No se pudo cargar calendario oficial de jornadas:", error.message);
        return new Map();
    }
}
function applyOfficialRounds(data, roundMap) {
    if (!roundMap.size) {
        console.warn(
            "Calendario oficial de jornadas no disponible; se conservan las jornadas válidas existentes."
        );
        return;
    }
    let fixed = 0;
    let unmatched = 0;
    for (const match of data.matches) {
        const round = roundMap.get(officialFixtureKey(match.home?.name, match.away?.name));
        if (Number.isInteger(round) && round >= 1 && round <= 38) {
            if (Number(match.round) !== round) {
                match.round = round;
                fixed++;
            }
        } else {
            unmatched++;
        }
    }
    console.log(`Jornadas corregidas/asignadas: ${fixed}`);
    if (unmatched) {
        console.warn(`Partidos sin coincidencia en el calendario oficial: ${unmatched}; se mantiene su jornada previa si era válida.`);
    }
}

// La temporada completa de Primera División debe tener 380 partidos,
// 38 jornadas y 10 partidos por jornada. Si no se cumple, NO se escribe
// el JSON final: así un fallo de una API o del calendario no destruye el
// último fichero válido. Esta función no altera ni predicciones ni resultados.
function validateSeasonCalendar(data) {
    const errors = [];
    const matches = Array.isArray(data.matches) ? data.matches : [];
    const ids = matches.map(match => String(match.id ?? "").trim());
    const uniqueIds = new Set(ids);

    if (matches.length !== 380) {
        errors.push(`Se esperaban 380 partidos y hay ${matches.length}.`);
    }
    if (uniqueIds.size !== ids.length) {
        errors.push(`Hay IDs duplicados: ${ids.length - uniqueIds.size}.`);
    }

    const byRound = new Map();
    const missingRound = [];
    for (const match of matches) {
        const round = Number(match.round);
        if (!Number.isInteger(round) || round < 1 || round > 38) {
            missingRound.push(String(match.id));
            continue;
        }
        byRound.set(round, (byRound.get(round) || 0) + 1);
    }

    if (missingRound.length) {
        errors.push(`${missingRound.length} partidos tienen jornada inválida (muestra IDs: ${missingRound.slice(0, 10).join(", ")}).`);
    }
    for (let round = 1; round <= 38; round++) {
        const count = byRound.get(round) || 0;
        if (count !== 10) {
            errors.push(`Jornada ${round}: hay ${count} partidos; deberían ser 10.`);
        }
    }

    // Cada jornada debe incluir 20 equipos distintos.
    for (let round = 1; round <= 38; round++) {
        const teams = new Set();
        for (const match of matches) {
            if (Number(match.round) !== round) continue;
            const home = String(match.home?.name || "").trim();
            const away = String(match.away?.name || "").trim();
            if (home) teams.add(home);
            if (away) teams.add(away);
        }
        if (teams.size !== 20) {
            errors.push(`Jornada ${round}: hay ${teams.size} equipos distintos; deberían ser 20.`);
        }
    }

    return {
        ok: errors.length === 0,
        matchCount: matches.length,
        uniqueIdCount: uniqueIds.size,
        roundsFound: byRound.size,
        roundCounts: Object.fromEntries(
            Array.from({ length: 38 }, (_, i) => [i + 1, byRound.get(i + 1) || 0])
        ),
        errors
    };
}

function normalizedBroadcastSet(values) {
    return new Set((Array.isArray(values) ? values : [])
        .filter(value => value !== null && value !== undefined && String(value).trim())
        .map(value => String(value).trim().toLocaleLowerCase()));
}

function assertNoLossOfExistingMatchData(previousData, nextData) {
    const nextById = new Map((nextData.matches || []).map(match => [String(match.id), match]));
    const errors = [];
    for (const previous of previousData.matches || []) {
        const current = nextById.get(String(previous.id));
        if (!current) {
            errors.push(`Desapareció el partido ${previous.id}.`);
            continue;
        }
        const oldBroadcasts = normalizedBroadcastSet(previous.broadcasts);
        const newBroadcasts = normalizedBroadcastSet(current.broadcasts);
        for (const name of oldBroadcasts) {
            if (!newBroadcasts.has(name)) {
                errors.push(`El partido ${previous.id} perdería la retransmisión «${name}».`);
            }
        }
        if (hasUsefulMatchDetails(previous.details) && !hasUsefulMatchDetails(current.details)) {
            errors.push(`El partido ${previous.id} perdería detalles deportivos útiles.`);
        }
        // Un resultado conocido nunca debe convertirse en null por una respuesta parcial.
        for (const part of ["halftime", "fulltime", "extratime", "penalty"]) {
            for (const side of ["home", "away"]) {
                const oldValue = previous.score?.[part]?.[side];
                const newValue = current.score?.[part]?.[side];
                if (oldValue !== null && oldValue !== undefined &&
                    (newValue === null || newValue === undefined)) {
                    errors.push(`El partido ${previous.id} perdería score.${part}.${side}.`);
                }
            }
        }
    }
    if (errors.length) {
        throw new Error("Protección de integridad: la actualización eliminaría datos existentes:\n - " + errors.slice(0, 30).join("\n - ") + (errors.length > 30 ? `\n - ... y ${errors.length - 30} errores más` : ""));
    }
}

async function main() {
    const data =
        await loadData();
    // Snapshot inmutable del estado inicial para detectar pérdidas antes de guardar.
    const originalDataSnapshot = JSON.parse(JSON.stringify(data));
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
        "=========================================="
    );
    console.log(
        "1. Descargando calendario ESPN..."
    );
    try {
        const fixtures =
            await getESPNFixtures();
        console.log(
            `ESPN devuelve ${fixtures.length} eventos.`
        );
        if (
            fixtures.length
        ) {
            mergeFixtures(
                data,
                fixtures
            );
        }
    } catch (error) {
        console.error(
            "ERROR calendario ESPN:",
            error.message
        );
    }
    console.log("1b. Aplicando calendario oficial de jornadas...");
    const officialRoundMap = await getOfficialRoundMap();

    if (officialRoundMap.size !== 380) {
        throw new Error(
            `Calendario oficial incompleto: ${officialRoundMap.size} cruces únicos; se esperaban 380. No se debe guardar la actualización.`
        );
    }

    applyOfficialRounds(data, officialRoundMap);
    console.log(
        "2. Descargando clasificación ESPN..."
    );
    try {
        const standings =
            await getESPNStandings();
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
        console.error(
            "ERROR clasificación ESPN:",
            error.message
        );
    }
    console.log(
        "3. Descargando goleadores ESPN..."
    );
    try {
        const scorers =
            await getESPNScorers();
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
            "No se pudieron obtener goleadores:",
            error.message
        );
    }
    console.log(
        "4. Descargando lesiones ESPN..."
    );
    const incomingInjuries = await getESPNInjuries();
    if (incomingInjuries.length > 0) {
        data.injuries = incomingInjuries;
    } else {
        console.warn("ESPN no devolvió lesiones; se conservan los datos de lesiones ya guardados.");
    }
    console.log(
        `Lesiones disponibles: ${data.injuries.length}`
    );
    console.log(
        "5. Descargando noticias ESPN..."
    );
    const incomingNews = await getESPNNews();
    if (incomingNews.length > 0) {
        data.news = incomingNews;
    } else {
        console.warn("ESPN no devolvió noticias; se conservan las noticias ya guardadas.");
    }
    console.log(
        `Noticias disponibles: ${data.news.length}`
    );
    console.log(
        "6. Comprobando API-Football..."
    );
    await tryAPIFootballData(
        data
    );
    console.log(
        "7. Descargando calendario europeo..."
    );
    try {
        const incomingEuropeanMatches = await getEuropeanMatches(data);
        if (incomingEuropeanMatches.length > 0) {
            data.europeanMatches = incomingEuropeanMatches;
        } else {
            console.warn("Las fuentes no devolvieron partidos europeos; se conserva el calendario europeo anterior.");
        }
        updateEuropeanLoad(data);
        console.log(
            `Partidos europeos relevantes: ${data.europeanMatches.length}`
        );
    } catch (error) {
        console.warn(
            "No se pudo actualizar el contexto europeo:",
            error.message
        );
    }
    console.log(
        "7. Actualizando detalles de partidos..."
    );
    await updateMatchDetails(
        data
    );
    console.log(
        "8. Actualizando resultados..."
    );
    for (const match of data.matches) {
        const status = String(match.status || "").toUpperCase();
        const finalStatus = ["FT", "AET", "PEN"].includes(status);
        const homeScore = match.score?.fulltime?.home;
        const awayScore = match.score?.fulltime?.away;

        const hasFulltimeScore =
            homeScore !== null &&
            homeScore !== undefined &&
            awayScore !== null &&
            awayScore !== undefined &&
            Number.isFinite(Number(homeScore)) &&
            Number.isFinite(Number(awayScore));

        const realResult =
            finalStatus && hasFulltimeScore
                ? getResult(match)
                : null;

        if (realResult) {
            match.result = realResult;

            if (match.quiniela && typeof match.quiniela === "object") {
                match.quiniela.realResult = realResult;
            }
        } else {
            delete match.result;

            if (match.quiniela && typeof match.quiniela === "object") {
                delete match.quiniela.realResult;
            }
        }
    }
    console.log(
        "9. Actualizando pronósticos..."
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
        if (
            match.timestamp <=
            now
        ) {
            continue;
        }
        const hours =
            (
                match.timestamp -
                now
            ) /
            3600;
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
                new Date()
                    .toISOString();
        }
    }
    console.log(
        "11. Calculando pronósticos V3.1 experimentales..."
    );
    for (const match of data.matches) {
        if (!match.timestamp || match.timestamp <= now) continue;
        if (!match.predictionV31 || !match.predictionV31.lockedAt) {
            const hours = (match.timestamp - now) / 3600;
            if (!match.predictionV31) {
                match.predictionV31 = createPredictionV31(data, match);
            }
            if (!match.predictionV31.lockedAt && hours <= 12) {
                match.predictionV31.lockedAt = new Date().toISOString();
            }
        }
    }
    console.log(
        "12. Calculando balance..."
    );
    updatePredictionBalance(
        data
    );
    updateModelBalance(
        data,
        "predictionV31",
        "predictionBalanceV31"
    );
    data.modelEvaluation = {
        officialModel: "V3.0",
        experimentalModel: "V3.1",
        officialAccuracy: data.predictionBalance.accuracy || 0,
        experimentalAccuracy: data.predictionBalanceV31.accuracy || 0,
        officialTotal: data.predictionBalance.total || 0,
        experimentalTotal: data.predictionBalanceV31.total || 0,
        updatedAt: new Date().toISOString(),
        note: "V3.1 permanece experimental hasta disponer de una muestra suficiente para comparar con V3.0."
    };
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
            "API-Football",
        generatedAt:
            new Date()
                .toISOString(),
        requestsThisRun,
        matchesCount:
            data.matches.length,
        standingsCount:
            data.standings.length,
        scorersCount:
            data.scorers.length,
        injuriesCount:
            data.injuries.length,
        newsCount:
            data.news.length,
        europeanMatchesCount:
            data.europeanMatches?.length || 0,
        modelVersion:
            "3.0-oficial + 3.1-experimental",
        predictionBalanceV31:
            data.predictionBalanceV31
    };
    console.log(
        "11. Validando datos..."
    );
    const validationErrors = [];
    if (data.matches.length === 0) {
        validationErrors.push("No hay partidos en el conjunto de datos.");
    }
    if (data.standings.length !== 20) {
        validationErrors.push(`La clasificación debe contener 20 equipos; hay ${data.standings.length}.`);
    }
    const standingTeamIds = data.standings
        .map(row => String(row.team?.id ?? row.team?.name ?? "").trim())
        .filter(Boolean);
    if (new Set(standingTeamIds).size !== standingTeamIds.length) {
        validationErrors.push("La clasificación contiene equipos duplicados.");
    }

    const calendarValidation = validateSeasonCalendar(data);
    console.log(`Calendario: ${calendarValidation.matchCount} partidos, ${calendarValidation.roundsFound} jornadas detectadas.`);
    if (!calendarValidation.ok) {
        validationErrors.push(...calendarValidation.errors);
    }

    if (validationErrors.length) {
        console.error("\nACTUALIZACIÓN BLOQUEADA: el JSON final NO se ha sobrescrito.");
        for (const error of validationErrors) {
            console.error(` - ${error}`);
        }
        throw new Error(
            "Validación de seguridad fallida. Revisa el calendario y las fuentes; el JSON anterior se conserva."
        );
    }

    // Verificación final de que el proceso no elimina retransmisiones, detalles
    // deportivos útiles, resultados conocidos ni partidos ya existentes.
    assertNoLossOfExistingMatchData(originalDataSnapshot, data);

    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    const tempFile = `${DATA_FILE}.tmp`;
    const backupFile = `${DATA_FILE}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

    // Escribir y validar el temporal antes de tocar el JSON actual.
    await fs.writeFile(tempFile, JSON.stringify(data, null, 2), "utf8" );
    let tempParsed;
    try {
        tempParsed = JSON.parse(await fs.readFile(tempFile, "utf8"));
        const tempValidation = validateSeasonCalendar(tempParsed);
        if (!tempValidation.ok) {
            throw new Error("El JSON temporal no supera la validación del calendario: " + tempValidation.errors.join(" | "));
        }
        assertNoLossOfExistingMatchData(originalDataSnapshot, tempParsed);
    } catch (error) {
        await fs.rm(tempFile, { force: true }).catch(() => {});
        throw new Error(`Guardado cancelado: el archivo temporal no superó la verificación. El JSON original no se ha sustituido. ${error.message}`);
    }

    // Copia de seguridad completa del JSON anterior, sin sobrescribir backups.
    try {
        await fs.copyFile(DATA_FILE, backupFile);
    } catch (error) {
        await fs.rm(tempFile, { force: true }).catch(() => {});
        throw new Error(`Guardado cancelado: no se pudo crear la copia de seguridad ${backupFile}. El JSON original no se ha sustituido. ${error.message}`);
    }

    // En Windows no dependemos de renombrar directamente sobre un destino
    // existente: apartamos el original dentro del mismo directorio. El backup
    // permanente se conserva incluso si falla la sustitución o la restauración.
    const displacedFile = `${DATA_FILE}.previous-${new Date().toISOString().replace(/[:.]/g, "-")}.tmp`;
    let originalDisplaced = false;
    let newFileInstalled = false;
    try {
        await fs.rename(DATA_FILE, displacedFile);
        originalDisplaced = true;

        await fs.rename(tempFile, DATA_FILE);
        newFileInstalled = true;

        const saved = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
        const savedValidation = validateSeasonCalendar(saved);
        if (!savedValidation.ok) {
            throw new Error("El JSON guardado no supera la validación: " + savedValidation.errors.join(" | "));
        }
        assertNoLossOfExistingMatchData(originalDataSnapshot, saved);

        // Solo se elimina el desplazado tras superar todas las verificaciones.
        await fs.rm(displacedFile, { force: true });
        console.log(`Copia de seguridad previa: ${backupFile}`);
        console.log("Verificación posterior al guardado: correcta.");
    } catch (error) {
        let restored = false;

        // Primero intentamos restaurar el archivo original exacto que apartamos.
        try {
            if (originalDisplaced) {
                if (newFileInstalled) {
                    const rejectedFile = `${DATA_FILE}.rejected-${new Date().toISOString().replace(/[:.]/g, "-")}.tmp`;
                    await fs.rename(DATA_FILE, rejectedFile);
                }
                await fs.rename(displacedFile, DATA_FILE);
                restored = true;
                console.error(`Se restauró el JSON original desde: ${displacedFile}`);
            }
        } catch (rollbackError) {
            console.error("No se pudo restaurar mediante renombrado:", rollbackError.message);
        }

        // Último recurso: copiar el backup permanente, que no se elimina.
        if (!restored) {
            try {
                await fs.copyFile(backupFile, DATA_FILE);
                const restoredData = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
                if (!Array.isArray(restoredData.matches) || !Array.isArray(restoredData.standings)) {
                    throw new Error("La copia restaurada no contiene matches y standings válidos.");
                }
                restored = true;
                console.error(`Se restauró el JSON desde la copia de seguridad: ${backupFile}`);
            } catch (rollbackError) {
                console.error(`ATENCIÓN: no se pudo confirmar la restauración automática. Conserva la copia íntegra: ${backupFile}`);
                console.error(rollbackError.message);
            }
        }

        await fs.rm(tempFile, { force: true }).catch(() => {});
        if (restored) {
            throw new Error(`Guardado cancelado: se ha restaurado el JSON anterior. Motivo: ${error.message}`);
        }
        throw new Error(`FALLO CRÍTICO: la verificación del guardado falló y no se pudo confirmar la restauración. No borres la copia ${backupFile}. Motivo: ${error.message}`);
    }
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
        `Lesiones: ${data.injuries.length}`
    );
    console.log(
        `Noticias: ${data.news.length}`
    );
    console.log(
        `Peticiones: ${requestsThisRun}`
    );
    console.log(
        `Aciertos acumulados: ${
            data.predictionBalance.correct
        }/${
            data.predictionBalance.total
        }`
    );
    console.log(
        `Precisión: ${
            data.predictionBalance.accuracy
        }%`
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
