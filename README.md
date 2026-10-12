# Skarresø — interaktivt kort

Et lille, gennem-animeret site til **store illustrationer**. Illustrationen fylder
skærmen, og menuen ved siden af viser en række steder. Klik på et sted, og kameraet
glider hen på det — med en tråd fra menupunktet til prikken på billedet.

Stederne kommer fra **én fælles fil**, `places.json`, som alle besøgende læser.
Siden følger filen: ændrer den sig på serveren, tegner åbne sider om af sig selv —
uden at nogen skal genindlæse.

Brugbart til tekniske tegninger, kunstværker, oversigtskort, festivalplakater og
alt andet hvor man vil "dykke ned" i et stort billede.

## Kør det

Siden skal serveres over HTTP (så `fetch`, `localStorage` og `IndexedDB` virker):

```bash
node .work/serve.mjs . 4321      # → http://127.0.0.1:4321/
```

Åbn adressen i browseren. Alt er statisk — læg `index.html`, `assets/`, `places.json`
og `plakat-*.webp` på en vilkårlig statisk host (Netlify, Cloudflare Pages, GitHub
Pages, en mappe på et webhotel …). Der er ingen build og ingen afhængigheder.

## Sådan bruges det

| Handling | Sådan |
| --- | --- |
| **Guidet rundtur** | **Se rundturen** nederst i panelet, eller tryk `t` |
| Pause undervejs | `mellemrum`, eller knappen **Pause** |
| Se et sted | Klik på et menupunkt, på en prik eller tryk `1`–`9` |
| Næste/forrige | `↑`/`↓` eller knapperne i detaljefeltet |
| Panorer / zoom | Træk i billedet · rul / knib |
| Se det hele | `⤢` eller `0` |
| Redigere | Knappen **Redigér steder** → skriv redigeringsnøglen |
| Nyt sted | **＋ Nyt sted** → klik på illustrationen, hvor det ligger |
| Flytte et sted | Træk i prikken (kun i redigeringstilstand) |
| Nyt billede | **Nyt billede** → vælg en JPG/PNG/WebP (kodes til WebP i to størrelser) |
| Udgive | **Hent kortet** → en zip med `places.json` og billedfilerne |
| Fortryde alt lokalt | **Kassér** → viser den udgivne fil igen |
| Låse igen | **Lås** |

## Den guidede rundtur

Trykker man på **Se rundturen** (eller `t`), tager siden selv turen gennem alle
steder i rækkefølge: kameraet glider hen, tråden tegnes fra menupunktet, og
fortællingen glider ind over illustrationen med stedets navn og tekst. Man kan
læne sig tilbage og følge med — eller tage over når som helst.

- **Tempo:** hvert sted får tid efter hvor lang fortællingen er (godt 5–10 sekunder),
  plus den tid kameraet er undervejs. Knappen viser hvor lang tid hele turen tager.
- **Pause:** `mellemrum` eller **Pause**. **Fortsæt** tager resten af turen.
- **Tager man selv fat** — klikker, panorerer, ruller eller bruger piletasterne —
  holder rundturen op, så man ikke kæmper med kameraet. `Escape` og **Stop** gør det
  samme.
- **Stopper man midtvejs**, bliver man stående ved det sted, man så på, og panelet
  viser det. Så ligger startknappen bag det valgte sted; den kommer frem igen med
  `⤢` (Vis hele illustrationen) — eller man kan starte forfra med `t`.
- **Til ende:** kameraet glider tilbage til hele illustrationen, og man kan starte
  forfra med samme knap.

Fortællingen ligger i et felt over illustrationen, så den også kan læses på en
telefon, hvor panelet kun viser listen.

## Den fælles kilde

```
places.json      ← alle besøgende læser denne fil
```

```json
{
  "navn": "Skarresø",
  "udgave": 1,
  "opdateret": "2026-10-12T19:26:15Z",
  "places": [
    { "navn": "Drivhusene", "x": 0.235, "y": 0.222, "zoom": 3.2, "tekst": "Glasshusene …" }
  ]
}
```

`x` og `y` er 0–1 i forhold til billedet, og `zoom` er hvor tæt kameraet går ind.
Siden tjekker filen med jævne mellemrum (`POLL_MS` i [assets/app.js](assets/app.js))
og når fanen får fokus igen. Er der nye steder, tegnes menuen og prikkerne om med
det samme — kameraet bliver hvor det er, og det sted du kigger på, følges ad.

Kan filen ikke læses, falder siden tilbage til `DEFAULT_PLACES` i
[assets/app.js](assets/app.js). Filen er altså kilden, og standardstederne er
nødløsningen og frøet til den første udgivelse.

## Redigering og udgivelse

Redigering lå bag en nøgle:

```js
const EDIT_KEY = 'drivhuset';     // ← skift den
```

Nøglen ligger i filen og er altså **ikke hemmelig** — enhver kan læse den i
kildekoden. Det er med vilje: uden en server kan en browser ikke holde på en
hemmelighed. Det egentlige værn er, at intet slår igennem af sig selv.

Sådan hænger det sammen:

1. Du skriver nøglen og låser redigeringen op. Den huskes i denne browser.
2. Alle ændringer samles i en **kladde** (i browserens `localStorage`). Ikonet i
   redigeringslinjen siger "Kladde — ikke udgivet", og imens holder siden op med at
   følge filen, så du ikke mister dit arbejde.
3. **Hent kortet** giver en zip med de filer, der skal lægges op:

   ```
   places.json
   plakat-web.webp     (kun hvis du har valgt et nyt billede)
   plakat-low.webp
   ```

4. Udgiv med én kommando (se nedenfor). Indtil da viser siden stadig dit kort; er
   filen i mellemtiden blevet ændret af en anden, siger den til, før den overskriver.

Besøgende, der ikke skriver nøglen, kan se og klikke — men ikke rette noget, og de
rører aldrig den fælles fil.

## Fra kladde til live i ét skridt

```bash
node tools/publish.mjs
```

Kommandoen finder selv den nyeste `*-kort.zip` i din Downloads-mappe, kontrollerer
pakken, lægger filerne på plads og udgiver kortet med et commit og et push — hvorefter
GitHub Pages viser det nye kort. Kortet ligger på
<https://villadsclaes.github.io/Plakatrundvisning/>.

| | |
| --- | --- |
| `node tools/publish.mjs` | nyeste pakke fra Downloads |
| `node tools/publish.mjs pakke.zip` | en bestemt pakke (zip **eller** udpakket mappe) |
| `--tør` | vis hvad der ville ske, skriv intet |
| `--uden-push` | læg filerne på plads, men udgiv ikke |
| `--tilbage` | rul det forrige sæt tilbage og udgiv det |
| `--tvang` | udgiv selvom indholdet er det samme |
| `--gren <navn>` | udgiv til en anden gren |

**Den kontrollerer, før den skriver.** Zip'en læses uden hjælpemidler, og hver post
tjekkes med sin egen CRC. Derudover: stederne skal have navn og koordinater mellem 0 og
1, billederne skal være rigtige webp-filer med de ventede mål (4600 px og 1500 px), og
pakken må ikke indeholde andre filer end dem, siden bruger. Er noget galt, sker der
intet — du får beskeden og en fejlkode.

**Den rører ikke andet.** Kun kortets egne filer (`places.json` og billederne) skrives,
kun dem der er ændret, og de skrives atomisk. Det forrige sæt gemmes i
`.work/forrige`, så `--tilbage` altid kan føre dig et skridt tilbage. Er der andet
uudgivet i projektet, siger den til frem for at tage det med.

## Filer

```
index.html                   struktur
assets/app.css               design, animationer, responsivt layout
assets/app.js                kamera, zoom, markører, tråd, redigering, zip, fillæsning
tools/publish.mjs            fra kladde til live i ét skridt
places.json                  den fælles kilde — stederne
plakat-low.webp              1500 px — vises med det samme
plakat-web.webp              4600 px — byttes ind i baggrunden (samme udsnit)
plakat.jpg / plakat.png      originalerne (11522 × 8138)
legacy-foretagsomheden.html  den tidligere forside, bevaret
```

Den lette webp-fil males straks, og fuld opløsning overtager, så snart den er
dekodet — uden at kameraet flytter sig. Det giver hurtig første visning og skarp
zoom samtidig.

## Indstillinger i [assets/app.js](assets/app.js)

- `SHARED_FILE` — navnet på den fælles fil (`places.json`)
- `POLL_MS` — hvor tit der lyttes efter ændringer (15 s)
- `EDIT_KEY` — nøglen til redigeringstilstanden
- `DEFAULT_PLACES` — standardstederne, hvis filen mangler
- `DEFAULT_IMAGE` / `LOW_IMAGE` — illustrationerne
- `FULL_SIDE` / `LOW_SIDE` — bredden på de to udgivne billedfiler
- `MIN_ZOOM` / `MAX_ZOOM` — hvor langt der kan zoomes
- `dwellFor()` — hvor længe rundturen hviler på hvert sted
