/**
 * FAMILIA CERNADAS - LALIGA FANTASY 2026/27 - FASE 1
 * Mantiene data/fantasy_2026_27.json.
 * No accede a APIs privadas ni intenta saltarse protecciones.
 */
import fs from "node:fs/promises";
import path from "node:path";

const DATA_FILE = path.resolve("data/fantasy_2026_27.json");
const SOURCE_URL = "https://preciofantasy.com/";
const SEASON = 2026;

const num = v => {
  if (v === null || v === undefined || v === "") return 0;
  const x = Number(String(v).replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(x) ? x : 0;
};
const clean = v => String(v ?? "").replace(/\s+/g, " ").trim();

async function loadData() {
  try {
    const d = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
    d.meta ||= {}; d.players ||= []; d.marketHistory ||= [];
    return d;
  } catch {
    return {meta:{season:SEASON,seasonLabel:"2026/27",schemaVersion:"1.0"},players:[],marketHistory:[]};
  }
}

async function fetchText(url) {
  const r = await fetch(url,{headers:{"user-agent":"Familia-Cernadas-Laliga-Fantasy/1.0","accept":"text/html,application/xhtml+xml,application/json"}});
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return text;
}

function recursiveObjects(value,out=[]) {
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) { for (const x of value) recursiveObjects(x,out); return out; }
  const keys=Object.keys(value).map(k=>k.toLowerCase());
  if (keys.some(k=>["name","player","jugador"].includes(k)) && keys.some(k=>["price","precio","value","valor"].includes(k))) out.push(value);
  for (const x of Object.values(value)) recursiveObjects(x,out);
  return out;
}

function extractEmbeddedJson(html) {
  const roots=[];
  const patterns=[/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,/<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi];
  for (const re of patterns) { let m; while ((m=re.exec(html))!==null) { try { roots.push(JSON.parse(m[1])); } catch {} } }
  const objects=[]; for (const root of roots) recursiveObjects(root,objects);
  const rows=[];
  for (const o of objects) {
    const name=clean(o.name??o.player??o.jugador);
    const team=clean(o.team?.name??o.teamName??o.equipo?.name??o.equipo??o.club?.name??o.club);
    const rawPos=clean(o.position??o.pos??o.positionName??o.posicion).toUpperCase();
    const price=num(o.price??o.precio??o.value??o.valor??o.marketValue);
    if (!name || !price) continue;
    let position=rawPos;
    if (["G","GK","POR","PORTERO"].includes(position)) position="POR";
    else if (["D","DEF","DEFENDER","DEFENSA"].includes(position)) position="DEF";
    else if (["M","MID","MED","CENTROCAMPISTA"].includes(position)) position="MED";
    else if (["F","FW","DEL","DELANTERO"].includes(position)) position="DEL";
    rows.push({name,team:team||null,position:position||null,price,points:num(o.points??o.puntos??o.fantasyPoints),trend:num(o.trend??o.variation??o.variacion??o.change24h),minutes:num(o.minutes??o.minutos),starts:num(o.starts??o.titularidades??o.start),nextOpponent:clean(o.nextOpponent??o.rival??o.nextRival)||null,nextHomeAway:clean(o.nextHomeAway??o.homeAway)||null,rentability:0,opportunity:num(o.score??o.opportunity??o.opportunityScore)});
  }
  const unique=new Map(); for (const p of rows) { const k=`${p.name}|${p.team??""}`.toLowerCase(); if(!unique.has(k)) unique.set(k,p); }
  return [...unique.values()];
}

function calculateMetrics(players) {
  const maxPPM=Math.max(1,...players.map(p=>p.points>0&&p.price>0?p.points/p.price:0));
  return players.map(p=>{
    const rentability=p.price>0?Number((p.points/p.price).toFixed(3)):0;
    const valueScore=Math.min(100,(rentability/maxPPM)*100);
    const trendScore=Math.max(0,Math.min(100,50+p.trend*5));
    const minutesScore=Math.min(100,p.minutes/27);
    const pointsScore=Math.min(100,p.points/2);
    const opportunity=0.45*valueScore+0.20*pointsScore+0.15*trendScore+0.20*minutesScore;
    return {...p,rentability,opportunity:Number(opportunity.toFixed(1))};
  });
}

async function main() {
  console.log("==========================================");
  console.log("ACTUALIZACIÓN LALIGA FANTASY 2026/27");
  console.log("FASE 1");
  console.log("==========================================");
  const data=await loadData();
  const now=new Date().toISOString();
  let players=[];
  try {
    console.log(`Consultando fuente pública: ${SOURCE_URL}`);
    const html=await fetchText(SOURCE_URL);
    players=extractEmbeddedJson(html);
    console.log(`Jugadores detectados: ${players.length}`);
  } catch(e) { console.warn("No se pudo consultar la fuente Fantasy:",e.message); }

  if (players.length) {
    players=calculateMetrics(players);
    const oldByKey=new Map(data.players.map(p=>[`${p.name}|${p.team??""}`.toLowerCase(),p]));
    for (const p of players) {
      const old=oldByKey.get(`${p.name}|${p.team??""}`.toLowerCase());
      p.previousPrice=old?.price??null;
      p.priceChange=old?.price&&p.price?Number((p.price-old.price).toFixed(3)):null;
    }
    data.players=players;
    data.meta.status="Datos sincronizados correctamente.";
  } else {
    data.meta.status=data.players.length?"Fuente no disponible; se conserva el último dato válido.":"Sin datos Fantasy todavía: fuente pública sin estructura importable.";
  }

  data.marketHistory.push({timestamp:now,players:data.players.map(p=>({name:p.name,team:p.team,price:p.price,points:p.points}))});
  if(data.marketHistory.length>180) data.marketHistory=data.marketHistory.slice(-180);
  data.meta={...data.meta,season:SEASON,seasonLabel:"2026/27",source:"PrecioFantasy / fuentes Fantasy disponibles",sourceShort:"PrecioFantasy",generatedAt:now,playersCount:data.players.length,schemaVersion:"1.0"};
  await fs.mkdir(path.dirname(DATA_FILE),{recursive:true});
  await fs.writeFile(DATA_FILE,JSON.stringify(data,null,2),"utf8");
  console.log(`Jugadores: ${data.players.length}`);
  console.log(`Históricos: ${data.marketHistory.length}`);
  console.log(`Estado: ${data.meta.status}`);
}
main().catch(e=>{console.error("ERROR FATAL:",e);process.exit(1);});
