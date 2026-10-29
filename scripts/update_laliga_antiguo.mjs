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
        data.europeanLoad ||= {};
        data.modelEvaluation ||= {};
        data.predictionBalance ||= {};
        data.predictionBalanceV31 ||= {};
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
            europeanMatches: [],
            europeanLoad: {},
            modelEvaluation: {},
            predictionBalanceV31: {
                total: 0,
                correct: 0,
                accuracy: 0
            },
            predictionBalance: {
                total: 0,
                correct: 0,
                accuracy: 0
            }
        };
    }
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
    const broadcasts =
        competition?.broadcasts ||
        event.broadcasts ||
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
    match.details = {
        updatedAt:
            new Date().toISOString(),
        source:
            "ESPN",
        lineups,
        statistics,
        players:
            [],
        events
    };
    const broadcasts =
        competition.broadcasts ||
        [];
    if (
        broadcasts.length
    ) {
        match.broadcasts =
            broadcasts
                .flatMap(
                    x =>
                        x.names ||
                        []
                )
                .filter(Boolean);
    }
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
        .trim();
    const aliases = {
        "real madrid cf": "real madrid",
        "real betis balompie": "real betis",
        "real sociedad de futbol": "real sociedad",
        "club atletico de madrid": "atletico de madrid",
        "rc deportivo la coruna": "rc deportivo",
        "rc deportivo de a coruna": "rc deportivo",
        "real racing club de santander": "r racing club",
        "racing de santander": "r racing club",
        "racing": "r racing club",
        "rayo vallecano de madrid": "rayo vallecano",
        "rc celta de vigo": "celta",
        "club atletico osasuna": "ca osasuna"
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
            const rm = line.match(/^▪\s*Matchday\s+(\d+)/i);
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
    if (!roundMap.size) return;
    let fixed = 0;
    for (const match of data.matches) {
        const round = roundMap.get(officialFixtureKey(match.home?.name, match.away?.name));
        if (round && Number(match.round) !== round) {
            match.round = round;
            fixed++;
        }
    }
    console.log(`Jornadas corregidas/asignadas: ${fixed}`);
}
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
            const officialRoundMap = await getOfficialRoundMap();
            applyOfficialRounds(data, officialRoundMap);
        }
    } catch (error) {
        console.error(
            "ERROR calendario ESPN:",
            error.message
        );
    }
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
    data.injuries =
        await getESPNInjuries();
    console.log(
        `Lesiones obtenidas: ${data.injuries.length}`
    );
    console.log(
        "5. Descargando noticias ESPN..."
    );
    data.news =
        await getESPNNews();
    console.log(
        `Noticias obtenidas: ${data.news.length}`
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
        data.europeanMatches = await getEuropeanMatches(data);
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
                getResult(
                    match
                );
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
    if (
        data.matches.length === 0
    ) {
        validationErrors.push(
            "ESPN no ha devuelto ningún partido."
        );
    }
    if (
        data.standings.length === 0
    ) {
        validationErrors.push(
            "ESPN no ha devuelto clasificación."
        );
    }
    if (
        validationErrors.length
    ) {
        console.error(
            "ADVERTENCIA DE DATOS:"
        );
        for (
            const error
            of validationErrors
        ) {
            console.error(
                ` - ${error}`
            );
        }
    }
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
