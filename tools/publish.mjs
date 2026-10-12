#!/usr/bin/env node
/**
 * publish.mjs — fra kladde til live i ét skridt.
 *
 * Finder den pakke, "Hent kortet" lagde i din Downloads-mappe, kontrollerer at
 * den er hel og fornuftig, lægger filerne på plads i projektet og udgiver kortet
 * med et git-commit og et push. Ingen afhængigheder — zip læses med zlib.
 *
 *   node tools/publish.mjs                    nyeste *-kort.zip i Downloads
 *   node tools/publish.mjs pakke.zip          en bestemt pakke (zip eller mappe)
 *   node tools/publish.mjs --tør              vis hvad der ville ske, skriv intet
 *   node tools/publish.mjs --uden-push        læg filerne på plads, udgiv ikke
 *   node tools/publish.mjs --tilbage          rul det forrige sæt tilbage og udgiv
 *   node tools/publish.mjs --gren andet        udgiv til en anden gren
 *
 * Alt andet end pakken bestemmes ud fra projektet selv: hvilke filnavne der
 * bruges (SHARED_FILE, DEFAULT_IMAGE, LOW_IMAGE i assets/app.js) og hvor der
 * skal udgives hen (git-remote).
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync,
  rmSync, statSync, writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const HER = dirname(fileURLToPath(import.meta.url));
const ÆNDRINGER = '.work/forrige';          // hvor det forrige sæt gemmes
const sha = (d) => createHash('sha256').update(d).digest('hex').slice(0, 12);

/* ── små ting ─────────────────────────────────────────────────── */

const fed = (s) => `\x1b[1m${s}\x1b[0m`;
const dæmpet = (s) => `\x1b[2m${s}\x1b[0m`;
const grøn = (s) => `\x1b[32m${s}\x1b[0m`;
const gul = (s) => `\x1b[33m${s}\x1b[0m`;
const rød = (s) => `\x1b[31m${s}\x1b[0m`;

const bytes = (n) => (n < 1024 ? `${n} B`
  : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} kB`
    : `${(n / 1024 / 1024).toFixed(1)} MB`);

function stop(linjer) {
  for (const l of [].concat(linjer)) console.error(l);
  process.exit(1);
}

/* ── zip uden afhængigheder ───────────────────────────────────── */

const CRC_TABEL = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABEL[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** Læser en zip-fil (metode 0 og 8) og efterprøver CRC på hver post. */
function læsZip(sti) {
  const buf = readFileSync(sti);
  let slut = -1;
  const grænse = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= grænse; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { slut = i; break; }
  }
  if (slut < 0) throw new Error('filen er ikke en zip (mangler slutposten)');

  const antal = buf.readUInt16LE(slut + 10);
  let p = buf.readUInt32LE(slut + 16);
  const poster = [];
  for (let n = 0; n < antal; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) {
      throw new Error('zip-indholdsfortegnelsen er i stykker');
    }
    const metode = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const pakket = buf.readUInt32LE(p + 20);
    const rå = buf.readUInt32LE(p + 24);
    const navnL = buf.readUInt16LE(p + 28);
    const ekstraL = buf.readUInt16LE(p + 30);
    const kommentarL = buf.readUInt16LE(p + 32);
    const start = buf.readUInt32LE(p + 42);
    const navn = buf.toString('utf8', p + 46, p + 46 + navnL);

    if (start + 30 > buf.length || buf.readUInt32LE(start) !== 0x04034b50) {
      throw new Error(`zip-posten "${navn}" peger uden for filen`);
    }
    const dataStart = start + 30 + buf.readUInt16LE(start + 26) + buf.readUInt16LE(start + 28);
    const pakketData = buf.subarray(dataStart, dataStart + pakket);
    let data;
    if (metode === 0) data = Buffer.from(pakketData);
    else if (metode === 8) data = inflateRawSync(pakketData);
    else throw new Error(`zip-posten "${navn}" er pakket med en metode, jeg ikke kender (${metode})`);

    if (data.length !== rå) throw new Error(`zip-posten "${navn}" har forkert længde`);
    if (crc32(data) !== crc) throw new Error(`zip-posten "${navn}" er beskadiget (CRC stemmer ikke)`);

    poster.push({ navn, data });
    p += 46 + navnL + ekstraL + kommentarL;
  }
  if (!poster.length) throw new Error('zip-filen er tom');
  return poster;
}

/** Læser en allerede udpakket mappe i stedet for en zip. */
function læsMappe(sti) {
  return readdirSync(sti)
    .filter((n) => statSync(join(sti, n)).isFile())
    .map((n) => ({ navn: n, data: readFileSync(join(sti, n)) }));
}

/* ── webp-mål (så et halvt billede ikke ryger ud) ─────────────── */

function webpMål(data) {
  if (data.length < 30) throw new Error('billedet er for kort til at være webp');
  if (data.toString('latin1', 0, 4) !== 'RIFF' || data.toString('latin1', 8, 12) !== 'WEBP') {
    throw new Error('billedet er ikke webp (RIFF/WEBP mangler)');
  }
  const slags = data.toString('latin1', 12, 16);
  if (slags === 'VP8X') {
    return {
      b: (data[24] | (data[25] << 8) | (data[26] << 16)) + 1,
      h: (data[27] | (data[28] << 8) | (data[29] << 16)) + 1,
    };
  }
  if (slags === 'VP8 ') {
    if (data[23] !== 0x9d || data[24] !== 0x01 || data[25] !== 0x2a) {
      throw new Error('webp-billedet har en uventet startkode');
    }
    return { b: (data[26] | (data[27] << 8)) & 0x3fff, h: (data[28] | (data[29] << 8)) & 0x3fff };
  }
  if (slags === 'VP8L') {
    if (data[20] !== 0x2f) throw new Error('webp-billedet har en uventet signatur');
    const bits = data[21] | (data[22] << 8) | (data[23] << 16) | (data[24] << 24);
    return { b: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  throw new Error(`webp-billedet bruger en variant, jeg ikke kender (${slags})`);
}

/* ── projektet ────────────────────────────────────────────────── */

function læsIndstillinger(rod) {
  const fil = join(rod, 'assets', 'app.js');
  if (!existsSync(fil)) {
    stop([rød(`Fandt ikke ${fil}.`), 'Kør kommandoen fra projektet, eller peg på det med --rod.']);
  }
  const src = readFileSync(fil, 'utf8');
  const tag = (navn) => {
    const m = src.match(new RegExp(`${navn}\\s*=\\s*['"]([^'"]+)['"]`));
    if (!m) stop(rød(`Kunne ikke finde ${navn} i assets/app.js.`));
    return m[1];
  };
  const tal = (navn) => {
    const m = src.match(new RegExp(`${navn}\\s*=\\s*(\\d+)`));
    return m ? Number(m[1]) : null;
  };
  return {
    delt: tag('SHARED_FILE'),
    fuld: tag('DEFAULT_IMAGE'),
    lav: tag('LOW_IMAGE'),
    fuldBredde: tal('FULL_SIDE'),
    lavBredde: tal('LOW_SIDE'),
  };
}

/** Kun kendte filnavne uden stier — intet må kunne skrive uden for projektet. */
function godkendNavn(navn, kendte) {
  const rent = String(navn).replace(/\\/g, '/');
  const base = basename(rent);
  if (/^[A-Za-z]:/.test(rent) || rent.startsWith('/') || rent.split('/').includes('..')) {
    throw new Error(`pakken indeholder en utryg sti: "${navn}"`);
  }
  if (rent.startsWith('__MACOSX/') || base.startsWith('._') || base === '.DS_Store') return null;   // skrald fra mac
  if (rent !== base) return null;                                                                    // vi udgiver kun flade filer
  if (!kendte.includes(base)) {
    throw new Error(`pakken indeholder "${base}", som siden ikke bruger. Kendte filer: ${kendte.join(', ')}`);
  }
  return base;
}

function læsSteder(data, filnavn) {
  let dataJson;
  try {
    dataJson = JSON.parse(data.toString('utf8'));
  } catch (e) {
    throw new Error(`${filnavn} kunne ikke læses som JSON: ${e.message}`);
  }
  if (!Array.isArray(dataJson.places) || !dataJson.places.length) {
    throw new Error(`${filnavn} indeholder ingen steder`);
  }
  dataJson.places.forEach((p, i) => {
    const navn = String(p && p.navn ? p.navn : '').trim();
    if (!navn) throw new Error(`sted ${i + 1} mangler et navn`);
    for (const k of ['x', 'y']) {
      const v = Number(p[k]);
      if (!Number.isFinite(v) || v < 0 || v > 1) {
        throw new Error(`"${navn}" har ${k} = ${p[k]} — den skal ligge mellem 0 og 1`);
      }
    }
    if (p.zoom !== undefined && p.zoom !== null) {
      const z = Number(p.zoom);
      if (!Number.isFinite(z) || z < 1 || z > 12) {
        throw new Error(`"${navn}" har zoom = ${p.zoom} — den skal ligge mellem 1 og 12`);
      }
    }
  });
  return dataJson;
}

/* ── git ──────────────────────────────────────────────────────── */

function git(rod, args, ekstra = {}) {
  const r = spawnSync('git', args, {
    cwd: rod,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },   // hellere fejle end at hænge på et password-spørgsmål
    ...ekstra,
  });
  if (r.error) throw new Error(`kunne ikke køre git: ${r.error.message}`);
  return {
    ok: r.status === 0,
    ud: (r.stdout || '').trim(),
    udRå: r.stdout || '',          // urørt: status-linjer begynder med et mellemrum
    fejl: (r.stderr || '').trim(),
  };
}

/** https://github.com/ejer/repo → https://ejer.github.io/repo/ */
function liveAdresse(remote) {
  const m = String(remote).match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!m) return null;
  const [, ejer, repo] = m;
  return repo.toLowerCase() === `${ejer.toLowerCase()}.github.io`
    ? `https://${ejer.toLowerCase()}.github.io/`
    : `https://${ejer.toLowerCase()}.github.io/${repo}/`;
}

function pagesStatus(remote) {
  const m = String(remote).match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!m) return null;
  const r = spawnSync('gh', ['api', `repos/${m[1]}/${m[2]}`, '--jq', '.has_pages'], {
    encoding: 'utf8', timeout: 12000,
  });
  if (r.error || r.status !== 0) return null;
  return (r.stdout || '').trim() === 'true';
}

/* ── hjælp ────────────────────────────────────────────────────── */

function hjælp() {
  console.log(`${fed('Fra kladde til live i ét skridt')}

  I redigeringen: tryk ${fed('Hent kortet')} — du får en zip i Downloads.
  I terminalen:

    ${grøn('node tools/publish.mjs')}              nyeste *-kort.zip i Downloads
    node tools/publish.mjs pakke.zip        en bestemt pakke (zip eller mappe)
    node tools/publish.mjs --tør            vis hvad der ville ske
    node tools/publish.mjs --uden-push      læg filerne på plads, udgiv ikke
    node tools/publish.mjs --tilbage        rul det forrige sæt tilbage og udgiv
    node tools/publish.mjs --tvang          udgiv selvom indholdet er det samme
    node tools/publish.mjs --gren andet      udgiv til en anden gren

    --rod <mappe>     et andet projekt end dette (til prøvekørsler)
    -h, --hjælp       denne tekst`);
}

/* ── hovedforløbet ────────────────────────────────────────────── */

const arg = process.argv.slice(2);
const valg = { tør: false, udenPush: false, tilbage: false, tvang: false, gren: null, rod: null, pakke: null, besked: null };
for (let i = 0; i < arg.length; i++) {
  const a = arg[i];
  if (a === '--tør' || a === '--tor') valg.tør = true;
  else if (a === '--uden-push') valg.udenPush = true;
  else if (a === '--tvang') valg.tvang = true;
  else if (a === '--tilbage') valg.tilbage = true;
  else if (a === '--gren') valg.gren = arg[++i];
  else if (a === '--rod') valg.rod = arg[++i];
  else if (a === '--besked') valg.besked = arg[++i];
  else if (a === '-h' || a === '--hjælp' || a === '--hjaelp') { hjælp(); process.exit(0); }
  else if (a.startsWith('-')) stop([rød(`Kender ikke valget ${a}.`), 'Prøv --hjælp.']);
  else if (!valg.pakke) valg.pakke = a;
  else stop(rød(`Der er mere end én pakke angivet: ${valg.pakke} og ${a}`));
}

const ROD = resolve(valg.rod ? valg.rod : join(HER, '..'));
const BACKUP = join(ROD, ÆNDRINGER);
const ind = læsIndstillinger(ROD);
const KENDTE = [ind.delt, ind.fuld, ind.lav];

/** Finder pakken: den angivne, eller den nyeste *-kort.zip i Downloads. */
function findPakke() {
  if (valg.pakke) {
    const sti = resolve(valg.pakke);
    if (!existsSync(sti)) stop(rød(`Fandt ikke ${sti}`));
    return sti;
  }
  const kandidater = [];
  const set = new Set();
  for (const mappe of [
    join(process.env.USERPROFILE || homedir(), 'Downloads'),
    join(homedir(), 'Downloads'),
    join(process.env.USERPROFILE || homedir(), 'OneDrive', 'Downloads'),
  ]) {
    if (!existsSync(mappe)) continue;
    if (set.has(resolve(mappe).toLowerCase())) continue;      // samme mappe flere gange
    set.add(resolve(mappe).toLowerCase());
    for (const n of readdirSync(mappe)) {
      if (!/kort\.zip$/i.test(n)) continue;
      const sti = join(mappe, n);
      try {
        if (set.has(resolve(sti).toLowerCase())) continue;
        set.add(resolve(sti).toLowerCase());
        kandidater.push({ sti, tid: statSync(sti).mtimeMs, str: statSync(sti).size });
      } catch { /* blev lige slettet */ }
    }
  }
  if (!kandidater.length) {
    stop([
      rød('Fandt ingen *-kort.zip i din Downloads-mappe.'),
      `Tryk ${fed('Hent kortet')} i redigeringen først, eller peg på pakken:`,
      dæmpet('  node tools/publish.mjs "C:/sti/til/fil.zip"'),
    ]);
  }
  kandidater.sort((a, b) => b.tid - a.tid);
  if (kandidater.length > 1) {
    console.log(dæmpet(`Fandt ${kandidater.length} pakker i Downloads:`));
    for (const k of kandidater.slice(0, 4)) {
      console.log(dæmpet(`   ${new Date(k.tid).toLocaleString('da-DK')}  ${bytes(k.str).padStart(8)}  ${basename(k.sti)}${k === kandidater[0] ? '   ← bruges' : ''}`));
    }
    console.log('');
  }
  return kandidater[0].sti;
}

function hentIndhold() {
  if (valg.tilbage) {
    if (!existsSync(BACKUP)) stop(rød('Der er intet forrige sæt at rulle tilbage til (.work/forrige).'));
    const poster = readdirSync(BACKUP)
      .filter((n) => KENDTE.includes(n))
      .map((n) => ({ navn: n, data: readFileSync(join(BACKUP, n)) }));
    if (!poster.length) stop(rød('Backuppen i .work/forrige indeholder ingen af kortets filer.'));
    console.log(gul(`Ruller tilbage til sættet i ${ÆNDRINGER}.`));
    return { sti: BACKUP, poster, kilde: 'forrige' };
  }
  const sti = findPakke();
  const erZip = statSync(sti).isDirectory() ? false : /\.zip$/i.test(sti);
  if (!statSync(sti).isDirectory() && !erZip) {
    stop([rød(`${basename(sti)} er hverken en zip eller en mappe.`), 'I redigeringen: tryk "Hent kortet".']);
  }
  const poster = statSync(sti).isDirectory() ? læsMappe(sti) : læsZip(sti);
  return { sti, poster, kilde: basename(sti) };
}

/* ── 1. find og læs ───────────────────────────────────────────── */

console.log(`${fed('Udgiv kortet')}  ${dæmpet(ROD)}\n`);

const gammelSti = join(ROD, ind.delt);
let pakke, nye, nySteder, gamleSteder, billeder;
try {
  pakke = hentIndhold();
  console.log(`Pakke: ${fed(pakke.kilde)}  ${dæmpet(`${bytes(statSync(pakke.sti).size)} — ${pakke.sti}`)}\n`);

  nye = new Map();
  const skrald = [];
  for (const post of pakke.poster) {
    const navn = godkendNavn(post.navn, KENDTE);
    if (!navn) { skrald.push(post.navn); continue; }
    if (nye.has(navn)) throw new Error(`pakken indeholder "${navn}" to gange`);
    nye.set(navn, post.data);
  }
  if (skrald.length) console.log(dæmpet(`Springer over: ${skrald.join(', ')}`));
  if (!nye.has(ind.delt)) {
    throw new Error(`pakken mangler ${ind.delt} (poster i pakken: ${pakke.poster.map((p) => p.navn).join(', ') || 'ingen'})`);
  }

  nySteder = læsSteder(nye.get(ind.delt), ind.delt);
  gamleSteder = existsSync(gammelSti) ? læsSteder(readFileSync(gammelSti), ind.delt) : { places: [] };

  billeder = [];
  for (const navn of [ind.fuld, ind.lav]) {
    if (!nye.has(navn)) continue;
    const mål = webpMål(nye.get(navn));
    const ønsket = navn === ind.fuld ? ind.fuldBredde : ind.lavBredde;
    billeder.push({ navn, mål, ønsket, ny: sha(nye.get(navn)),
      gammel: existsSync(join(ROD, navn)) ? sha(readFileSync(join(ROD, navn))) : null,
      str: nye.get(navn).length });
  }
} catch (e) {
  stop([rød(`Pakken blev afvist: ${e.message}`), dæmpet(`(${pakke ? pakke.sti : valg.pakke || 'pakken'})`)]);
}

/* ── 2. vis hvad der sker ─────────────────────────────────────── */

/** Sammenligner indhold, ikke felt-rækkefølge — eksporten skriver felterne i en anden orden. */
const sammeSted = (a, b) => !!a && !!b
  && a.navn === b.navn
  && String(a.tekst ?? '') === String(b.tekst ?? '')
  && Number(a.x) === Number(b.x)
  && Number(a.y) === Number(b.y)
  && Number(a.zoom || 3) === Number(b.zoom || 3);

const navneFør = new Set(gamleSteder.places.map((p) => p.navn));
const navneEfter = new Set(nySteder.places.map((p) => p.navn));
const tilføjet = [...navneEfter].filter((n) => !navneFør.has(n));
const fjernet = [...navneFør].filter((n) => !navneEfter.has(n));
const rettet = nySteder.places.filter((p) => {
  const f = gamleSteder.places.find((q) => q.navn === p.navn);
  return f && !sammeSted(f, p);
}).map((p) => p.navn);
const indholdEns = nySteder.places.length === gamleSteder.places.length
  && nySteder.places.every((p, i) => sammeSted(p, gamleSteder.places[i]))
  && (nySteder.navn || '') === (gamleSteder.navn || '');

console.log(`Kortet: ${fed(nySteder.navn || 'uden navn')}   ${nySteder.places.length} steder`);
if (gamleSteder.places.length) {
  const forskel = [...tilføjet, ...fjernet, ...rettet];
  console.log(forskel.length
    ? `  ${gul(`${gamleSteder.places.length} → ${nySteder.places.length} steder`)}   ${dæmpet([
      tilføjet.length ? `+${tilføjet.length} nye` : '',
      fjernet.length ? `−${fjernet.length} fjernet` : '',
      rettet.length ? `${rettet.length} rettet` : '',
    ].filter(Boolean).join(', '))}`
    : dæmpet(`  uændret (${gamleSteder.places.length} steder)`));
  for (const n of tilføjet.slice(0, 6)) console.log(grøn(`   + ${n}`));
  if (tilføjet.length > 6) console.log(dæmpet(`   + … og ${tilføjet.length - 6} flere`));
  for (const n of fjernet.slice(0, 6)) console.log(rød(`   − ${n}`));
  for (const n of rettet.slice(0, 6)) console.log(gul(`   ~ ${n}`));
}
for (const b of billeder) {
  const bemærk = b.ønsket && b.mål.b !== b.ønsket ? gul(` (ventet ${b.ønsket} px)`) : '';
  const nyt = b.gammel && b.gammel !== b.ny ? gul(' — nyt billede') : b.gammel ? dæmpet(' — uændret') : grøn(' — nyt');
  console.log(`Billede: ${b.navn}  ${b.mål.b}×${b.mål.h}  ${bytes(b.str)}${nyt}${bemærk}`);
}
if (!billeder.length) console.log(dæmpet('Billede: ingen i pakken — det nuværende bliver liggende'));

const stederByteEns = existsSync(gammelSti) && sha(readFileSync(gammelSti)) === sha(nye.get(ind.delt));
const billederEns = billeder.every((b) => b.gammel === b.ny);
if (stederByteEns && billederEns) {
  console.log(`\n${grøn('Pakken er identisk med det, der ligger i projektet.')} Der er intet at udgive.`);
  process.exit(0);
}
if (indholdEns && billederEns && !valg.tvang) {
  console.log(`\n${gul('Pakken indeholder præcis de samme steder som den udgivne fil')} ${dæmpet('(kun tidsstemplet er nyt).')}`);
  console.log('Der er intet nyt at udgive — brug --tvang, hvis tidsstemplet alligevel skal med.');
  process.exit(0);
}

if (valg.tør) {
  console.log(`\n${gul('Tør-kørsel.')} Intet er skrevet, intet er udgivet.`);
  process.exit(0);
}

/* ── 3. læg filerne på plads ──────────────────────────────────── */

mkdirSync(BACKUP, { recursive: true });
const skrevne = [];
for (const [navn, data] of nye) {
  const mål = join(ROD, navn);
  if (existsSync(mål) && readFileSync(mål).equals(data)) { skrevne.push(navn); continue; }
  if (existsSync(mål)) copyFileSync(mål, join(BACKUP, navn));
  const midlertidig = `${mål}.ny`;
  writeFileSync(midlertidig, data);
  renameSync(midlertidig, mål);
  skrevne.push(navn);
}
console.log(`\n${grøn('Skrevet:')} ${skrevne.join(', ')}`);
console.log(dæmpet(`Det forrige sæt ligger i ${ÆNDRINGER} (rul tilbage med --tilbage).`));

/* ── 4. udgiv ─────────────────────────────────────────────────── */

if (valg.udenPush) {
  console.log(`\n${gul('--uden-push:')} filerne ligger på plads, men kortet er ikke udgivet endnu.`);
  process.exit(0);
}

const inde = git(ROD, ['rev-parse', '--is-inside-work-tree']);
if (!inde.ok) {
  stop([rød('Projektet er ikke et git-depot, så jeg kan ikke udgive.'),
    'Kør `git init` (og sæt et remote op), eller brug --uden-push.']);
}

const gren = valg.gren || (git(ROD, ['symbolic-ref', '--short', 'HEAD']).ud || 'main');

/** Læser git-porcelain med NUL-separator: stier kommer ud, som de er, uden citationstegn. */
const statusLinjer = (stier) => git(ROD, ['status', '--porcelain', '-z', '--', ...stier]).udRå
  .split('\0').filter(Boolean).map((l) => l.slice(3).trim());

// Hvilke af kortets filer er reelt ændret i arbejdsområdet?
const ændredeFiler = statusLinjer(skrevne);
if (!ændredeFiler.length) {
  console.log(`\n${gul('Ingen ændringer at udgive.')} Filen på serveren er allerede den nyeste.`);
  process.exit(0);
}

const linjer = `${nySteder.places.length} steder`;
const krop = [
  '',
  ...(tilføjet.length ? [`Tilføjet: ${tilføjet.join(', ')}`] : []),
  ...(fjernet.length ? [`Fjernet: ${fjernet.join(', ')}`] : []),
  ...(rettet.length ? [`Rettet: ${rettet.join(', ')}`] : []),
  ...(billeder.some((b) => b.gammel !== b.ny) ? ['Nyt billede'] : []),
];
const besked = valg.besked || `Udgiv: ${linjer} — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
// Stinavnene til sidst: så ryger kun kortets egne filer med, uanset hvad der
// ellers måtte være lagt klar i mellemlageret.
const commit = git(ROD, ['commit', '-m', besked, ...(krop.length > 1 ? ['-m', krop.join('\n')] : []), '--', ...ændredeFiler]);
if (!commit.ok) stop([rød('git kunne ikke lave commit:'), dæmpet(commit.fejl || commit.ud)]);
console.log(`\n${grøn('Commit:')} ${git(ROD, ['log', '-1', '--pretty=%h %s']).ud}`);

const remote = git(ROD, ['remote', 'get-url', 'origin']).ud;
const push = git(ROD, ['push', 'origin', `HEAD:${gren}`]);
if (!push.ok) {
  stop([
    rød(`Push til ${gren} mislykkedes.`),
    dæmpet(push.fejl || push.ud),
    '',
    'Commit’en ligger klar lokalt. Tjek at du er logget ind (fx `gh auth login`), og prøv:',
    dæmpet(`  git push origin HEAD:${gren}`),
  ]);
}
console.log(`${grøn('Push:')} ${remote} [${gren}]`);

const tilbage = statusLinjer(KENDTE);
if (tilbage.length) {
  console.log(`\n${gul('Bemærk:')} der står også ændringer i ${dæmpet(tilbage.join(', '))}`);
  console.log(dæmpet('De hører ikke til denne pakke og blev ikke udgivet. Vil du have dem med, kan du committe dem selv.'));
}

const adresse = liveAdresse(remote);
if (adresse) {
  const slåetTil = pagesStatus(remote);
  console.log(`\n${fed('Live:')} ${grøn(adresse)}`);
  if (slåetTil === false) {
    console.log(gul('GitHub Pages er ikke slået til på repoet endnu — gør det én gang:'));
    console.log(dæmpet('  gh api -X POST repos/<ejer>/<repo>/pages -f "source[branch]=' + gren + '" -f "source[path]=/"'));
  } else if (slåetTil === null) {
    console.log(dæmpet('GitHub Pages bygger siden om et øjeblik.'));
  }
  console.log(dæmpet('Åbne sider følger selv med: de læser places.json igen hvert 15. sekund.'));
}
console.log('');
