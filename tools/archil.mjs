/**
 * archil.mjs — lager, der overlever mellem kørsler.
 *
 * Kortet er ellers ren statisk filservering, men et par ting hører ikke hjemme
 * i git: uploadede illustrationer, kladder og andet, der skal blive liggende
 * fra den ene kørsel til den næste. Det lægger vi på en Archil-disk.
 *
 * Modulet samler det, resten af projektet har brug for:
 *
 *   hentDisk()          disken i ARCHIL_DISK_ID
 *   koerPaaDisk(cmd)    kør en kommando i en frisk container med disken på /mnt/data
 *   skrivFil / læsFil   skriv og læs en fil som objekt
 *   opretDisk(navn)     lav en ny disk (mount-tokenet bruges ikke her)
 *
 * Nøglen læses fra ARCHIL_API_KEY og hører kun til på serveren: den er ikke en
 * disk- eller mount-token (adt_…) og må aldrig ud til browseren.
 *
 *   import { koerPaaDisk, skrivFil, læsFil } from './archil.mjs';
 */

import * as archil from 'disk';

/** Nøglen er bundet til én region; et kald fra en anden region giver 401. */
export const REGION = (process.env.ARCHIL_REGION || 'aws-us-east-1').trim();

/** API-nøglen — med en klar besked, hvis den mangler. */
export function apiNoegle() {
  const noegle = (process.env.ARCHIL_API_KEY || '').trim();
  if (!noegle) {
    throw new Error(
      'ARCHIL_API_KEY er ikke sat. Hent en nøgle på https://console.archil.com/api-keys '
      + '(den starter med key-) og læg den i .env — ikke en disk-token (adt_…).',
    );
  }
  return noegle;
}

let forbundet = false;

/** Sætter SDK'et op én gang ud fra miljøvariablerne. */
function forbind() {
  if (!forbundet) {
    archil.configure({ apiKey: apiNoegle(), region: REGION });
    forbundet = true;
  }
  return archil;
}

/** Disken i ARCHIL_DISK_ID (eller en bestemt id). */
export async function hentDisk(id = process.env.ARCHIL_DISK_ID) {
  const diskId = (id || '').trim();
  if (!diskId) {
    throw new Error('ARCHIL_DISK_ID er ikke sat — opret en disk og læg id-et (dsk-…) i .env.');
  }
  forbind();
  return archil.getDisk(diskId);
}

/**
 * Opretter en ny disk. Mount-tokenet er engangs og bruges ikke her, så det
 * bliver aldrig skrevet ud i terminalen.
 */
export async function opretDisk(navn) {
  forbind();
  const { disk } = await archil.createDisk({ name: navn });
  return disk;
}

/**
 * Kører en kommando på disken. Containeren er frisk hver gang, disken er den
 * samme: filer på /mnt/data (også arbejdsmappen) bliver liggende mellem kørsler.
 */
export async function koerPaaDisk(kommando, id) {
  const disk = await hentDisk(id);
  return disk.exec(kommando);
}

/** Skriver en fil på disken som objekt. */
export async function skrivFil(noegle, indhold, id) {
  const disk = await hentDisk(id);
  return disk.putObject(noegle, indhold);
}

/** Læser en fil fra disken som objekt og giver indholdet som tekst. */
export async function læsFil(noegle, id) {
  const disk = await hentDisk(id);
  return new TextDecoder().decode(await disk.getObject(noegle));
}
