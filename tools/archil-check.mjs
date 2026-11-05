#!/usr/bin/env node
/**
 * archil-check.mjs — beviser at en fil overlever mellem to kørsler.
 *
 * Skriver en unik linje i en frisk mappe i én exec, læser den tilbage i en
 * anden, helt selvstændig exec og fejler, hvis linjen ikke kommer med ud igen.
 * Bruger disken i ARCHIL_DISK_ID; er den tom, oprettes en ny — dens engangs
 * mount-token udskrives aldrig.
 *
 *   npm run archil:check
 *   node --env-file-if-exists=.env tools/archil-check.mjs
 */

import { randomUUID } from 'node:crypto';
import { REGION, hentDisk, opretDisk } from './archil.mjs';

const fed = (s) => `\x1b[1m${s}\x1b[0m`;
const dæmpet = (s) => `\x1b[2m${s}\x1b[0m`;
const grøn = (s) => `\x1b[32m${s}\x1b[0m`;
const rød = (s) => `\x1b[31m${s}\x1b[0m`;

async function hoved() {
  const noegle = (process.env.ARCHIL_API_KEY || '').trim();
  if (!noegle) {
    throw new Error(
      'ARCHIL_API_KEY er ikke sat. Hent en nøgle på https://console.archil.com/api-keys '
      + '(den starter med key-) og læg den i .env — ikke en disk-token (adt_…).',
    );
  }                                   // stop tidligt uden nøgle

  let diskId = (process.env.ARCHIL_DISK_ID || '').trim();
  let nyDisk = false;
  if (!diskId) {
    const navn = `plakatrundvisning-${Math.random().toString(36).slice(2, 8)}`;
    const disk = await opretDisk(navn);
    diskId = disk.id;
    nyDisk = true;
    console.log(`Oprettede disk ${fed(navn)}  ${dæmpet(diskId)}`);
  }
  const disk = await hentDisk(diskId);                        // fejler tidligt på nøgle/region/id
  console.log(`Disk ${fed(diskId)}   region ${REGION}\n`);

  // En frisk undermappe pr. kørsel: exec mountes delt, så hver job-mappe får
  // sin egen ejer og bliver skrivbar uden ``read-only file system''.
  const job = `check-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const mappe = `/mnt/data/${job}`;
  const linje = `arkivet virker ${new Date().toISOString()} ${randomUUID()}`;

  // 1. exec: skriv linjen.
  const skriv = await disk.exec(`mkdir -p '${mappe}' && printf '%s\\n' '${linje}' > '${mappe}/bevis.txt'`);
  if (skriv.exitCode !== 0) {
    throw new Error(`skrive-exec fejlede (exit ${skriv.exitCode}): ${skriv.stderr || skriv.stdout}`);
  }
  console.log(`Skrev  ${dæmpet(`${mappe}/bevis.txt`)}   exit ${skriv.exitCode}`);

  // 2. exec: læs den tilbage — en helt ny container.
  const læs = await disk.exec(`cat '${mappe}/bevis.txt'`);
  if (læs.exitCode !== 0) {
    throw new Error(`læse-exec fejlede (exit ${læs.exitCode}): ${læs.stderr || læs.stdout}`);
  }
  const ud = (læs.stdout || '').trim();
  if (!ud.includes(linje)) {
    throw new Error(`linjen kom ikke tilbage.\n  skrev: ${linje}\n  læste: ${ud || '(tomt)'}`);
  }

  console.log(`Læste  ${dæmpet(`${mappe}/bevis.txt`)}   ${grøn(ud)}`);
  console.log(`\n${grøn('Filen holdt mellem to kørsler.')}  ${dæmpet('(to selvstændige execs, ikke ét kald)')}`);
  console.log(`${fed('Disk:')} ${diskId}`);
  if (nyDisk) {
    console.log(dæmpet(`Læg ARCHIL_DISK_ID=${diskId} i .env, så næste kørsel bruger samme disk.`));
  }
}

hoved().catch((fejl) => {
  console.error(rød(fejl && fejl.message ? fejl.message : String(fejl)));
  process.exitCode = 1;
});
