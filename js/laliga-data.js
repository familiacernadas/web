/**
 * ============================================================
 * DATOS LALIGA 2026/27
 * FAMILIA CERNADAS
 * ============================================================
 *
 * Este fichero NO llama a API-Football.
 *
 * Lee:
 *
 * data/laliga_2026_27.json
 *
 * que es generado automáticamente por GitHub Actions.
 * ============================================================
 */

const DATA_URL =
    "./data/laliga_2026_27.json";


// ------------------------------------------------------------
// CARGAR DATOS
// ------------------------------------------------------------

export async function loadLaLigaData() {

    const url =
        `${DATA_URL}?v=${Date.now()}`;


    const response =
        await fetch(
            url,
            {
                cache: "no-store"
            }
        );


    if (!response.ok) {

        throw new Error(
            `No se pudo cargar ${DATA_URL} ` +
            `(${response.status})`
        );

    }


    return response.json();

}


// ------------------------------------------------------------
// PARTIDO TERMINADO
// ------------------------------------------------------------

export function isFinished(match) {

    return [
        "FT",
        "AET",
        "PEN"
    ].includes(
        match.status
    );

}


// ------------------------------------------------------------
// JORNADAS
// ------------------------------------------------------------

export function getMatchdays(data) {

    const map =
        new Map();


    for (
        const match
        of data.matches || []
    ) {

        const round =
            match.round ||
            match.league?.round ||
            "Sin jornada";


        if (!map.has(round)) {

            map.set(
                round,
                []
            );

        }


        map.get(round)
            .push(match);

    }


    return Array.from(
        map.entries()
    )

        .map(
            ([round, matches]) => ({

                round,

                number:
                    extractRoundNumber(
                        round
                    ),

                matches:
                    matches.sort(
                        (a, b) =>
                            (
                                a.timestamp || 0
                            ) -
                            (
                                b.timestamp || 0
                            )
                    )

            })
        )

        .sort(
            (a, b) =>
                (
                    a.number ?? 999
                ) -
                (
                    b.number ?? 999
                )
        );

}


// ------------------------------------------------------------
// NÚMERO DE JORNADA
// ------------------------------------------------------------

function extractRoundNumber(round) {

    const match =
        String(round)
        .match(
            /(\d+)/
        );


    return match
        ? Number(match[1])
        : null;

}


// ------------------------------------------------------------
// JORNADA ACTUAL / ANTERIOR / PRÓXIMA
// ------------------------------------------------------------

export function getMatchday(
    data,
    mode = "current"
) {

    const rounds =
        getMatchdays(data);


    if (!rounds.length) {

        return null;

    }


    const now =
        Math.floor(
            Date.now() / 1000
        );


    const currentIndex =
        rounds.findIndex(
            round =>
                round.matches.some(
                    match =>
                        (
                            match.timestamp || 0
                        ) >= now &&
                        !isFinished(match)
                )
        );


    if (
        mode === "previous"
    ) {

        if (
            currentIndex <= 0
        ) {

            return rounds[0];

        }


        return rounds[
            currentIndex - 1
        ];

    }


    if (
        mode === "next"
    ) {

        if (
            currentIndex < 0
        ) {

            return rounds[
                rounds.length - 1
            ];

        }


        return rounds[
            Math.min(
                currentIndex + 1,
                rounds.length - 1
            )
        ];

    }


    if (
        currentIndex >= 0
    ) {

        return rounds[
            currentIndex
        ];

    }


    return rounds[
        rounds.length - 1
    ];

}


// ------------------------------------------------------------
// TEXTO 1/X/2
// ------------------------------------------------------------

export function predictionLabel(
    sign
) {

    if (
        sign === "1" ||
        sign === "X" ||
        sign === "2"
    ) {

        return sign;

    }


    return "-";

}


// ------------------------------------------------------------
// PORCENTAJES
// ------------------------------------------------------------

export function probabilityText(
    value
) {

    if (
        value === null ||
        value === undefined
    ) {

        return "-";

    }


    return (
        Number(value) * 100
    ).toFixed(0) + "%";

}


// ------------------------------------------------------------
// PRECISIÓN
// ------------------------------------------------------------

export function accuracy(
    correct,
    total
) {

    if (!total) {

        return "0.0%";

    }


    return (
        correct /
        total *
        100
    ).toFixed(1) + "%";

}


// ------------------------------------------------------------
// CLASE PARA ACIERTO/ERROR
// ------------------------------------------------------------

export function resultClass(
    prediction,
    result
) {

    if (
        !prediction ||
        !result
    ) {

        return "";

    }


    return (
        prediction === result
            ? "prediction-hit"
            : "prediction-miss"
    );

}


// ------------------------------------------------------------
// BALANCE
// ------------------------------------------------------------

export function renderBalance(
    data,
    root = document
) {

    const balance =
        data.predictionBalance || {};


    const total =
        Number(
            balance.total || 0
        );


    const correct =
        Number(
            balance.correct || 0
        );


    function set(
        id,
        value
    ) {

        const element =
            root.getElementById(
                id
            );


        if (element) {

            element.textContent =
                value;

        }

    }


    set(
        "balance-total",
        total
    );


    set(
        "balance-correct",
        correct
    );


    set(
        "balance-accuracy",
        accuracy(
            correct,
            total
        )
    );


    for (
        const sign
        of ["1", "X", "2"]
    ) {

        const row =
            balance
                .bySign?.[sign]
            || {
                total: 0,
                correct: 0
            };


        set(
            `balance-${sign}-total`,
            row.total
        );


        set(
            `balance-${sign}-accuracy`,
            accuracy(
                row.correct,
                row.total
            )
        );

    }

}
