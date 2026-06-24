const fs = require('fs');
const fetch = require('node-fetch');

const API_KEY = "bfd6931d068d64af26b5e952e8e9d09b"; 
const LEAGUE_ID = 1; 
const SEASON = 2026;
const INTERVALO = 20 * 60 * 1000; // 10 minutos en milisegundos

async function actualizarCache() {
    try {
        console.log("🔄 Consultando la API de Deportes y actualizando caché local...");
        
        // 1. Petición de partidos
        const resFixtures = await fetch(`https://v3.football.api-sports.io/fixtures?league=${LEAGUE_ID}&season=${SEASON}`, {
            headers: { "x-rapidapi-key": API_KEY, "x-rapidapi-host": "v3.football.api-sports.io" }
        });
        const dataFixtures = await resFixtures.json();

        // 2. Petición de goleadores
        const resScorers = await fetch(`https://v3.football.api-sports.io/players/topscorers?league=${LEAGUE_ID}&season=${SEASON}`, {
            headers: { "x-rapidapi-key": API_KEY, "x-rapidapi-host": "v3.football.api-sports.io" }
        });
        const dataScorers = await resScorers.json();

        // Estructura unificada para guardar
        const cacheData = {
            ultimaActualizacion: new Date().toISOString(),
            fixtures: dataFixtures.response || [],
            scorers: dataScorers.response || []
        };

        // Guardar el archivo JSON en tu servidor web
        fs.writeFileSync('./mundial-cache.json', JSON.stringify(cacheData, null, 2));
        console.log("✅ Archivo 'mundial-cache.json' actualizado con éxito.");

    } catch (error) {
        console.error("❌ Error al actualizar la caché:", error);
    }
}

// Ejecutar inmediatamente al arrancar y luego cada 10 minutos
actualizarCache();
setInterval(actualizarCache, INTERVALO);
