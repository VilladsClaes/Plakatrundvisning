# Skarresø — interaktivt kort

Et lille, gennem-animeret site til **store illustrationer**. Illustrationen fylder
skærmen, og menuen ved siden af viser en række steder. Klik på et sted, og kameraet
glider hen på det — med en tråd fra menupunktet til prikken på billedet.

Stederne kommer fra **én fælles fil**, `places.json`, som alle besøgende læser.
Siden følger filen: ændrer den sig på serveren, tegner åbne sider om af sig selv —
uden at nogen skal genindlæse.

Brugbart til tekniske tegninger, kunstværker, oversigtskort, festivalplakater og
alt andet hvor man vil "dykke ned" i et stort billede.

Og til dit **eget** billede: enhver besøgende kan uploade sin egen illustration,
sætte sine egne steder og sende gennemgangen videre som én selvstændig fil. Se
[Lav en gennemgang af din egen illustration](#lav-en-gennemgang-af-din-egen-illustration).

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
| Din egen rundtur | Sæt hak i listen (eller `v`), tryk **▶ Se din rundtur** |
| Dele sin rundtur | **Del** i rute-linjen → et link med ruten ligger i udklipsholderen (kun det fælles kort) |
| Egen illustration | **＋ Ny** øverst i panelet → vælg en fil, eller start fra et eksempel |
| Rette sin gennemgang | **Redigér steder** → klik for at flytte, træk i prikkerne, skriv i listen |
| Sende sin gennemgang | **Redigér steder** → **Videre** → **Send som fil** eller **Hent pakke** |
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

## Din egen rundtur

En besøgende kan sætte hak ved de steder, de gerne vil se, og få turen i præcis
den rækkefølge de valgte dem:

- **Sæt hak** med kassen til venstre i listen, eller med `v` mens man ser et sted.
  Tallet i kassen viser pladsen i rækkefølgen — 1 er det første, der bliver vist.
  Prikken ude på illustrationen får en ring, så man kan se sin rute på kortet.
- **Linjen over detaljerne** viser hvor mange steder der er valgt og hvor lang tid
  turen tager, med **▶ Se din rundtur**, **Del**, **Alle** og **Ryd**.
- **I sin egen rækkefølge:** turen følger den rækkefølge, der blev sat hak i —
  ikke rækkefølgen i listen. Fjerner man et hak, rykker de andre op.
- **Dele ruten:** **Del** lægger et link i udklipsholderen — fx
  `…/#rute=Tr%C3%A6platformen,H%C3%B8nseg%C3%A5rden` — med ens egne steder i ens
  egen rækkefølge. Åbner nogen linket, bliver ruten deres, og turen sætter selv i
  gang. Adressen ryddes bagefter, så et genindlæsning ikke begynder forfra.
  Sender man et link til steder, der er fjernet fra filen, falder de bare væk.
- **Ellers kun i din browser:** ruten huskes i `localStorage` og lægges ikke op
  nogen steder. Den fælles fil er stadig kun stederne — uden et link ser andre
  besøgende ikke ens rute.

Er der ingen hak, er knappen den samme som før: hele rundturen gennem alle steder.
Sætter man hak undervejs i en tur, holder turen op som ved ethvert andet indgreb —
og det nye valg gælder næste tur.

## Din egen illustration

Siden kan bruges til meget andet end én plakat: et landkort, en forlystelsespark,
en teknisk tegning eller et kunstværk. Enhver kan lave sin egen gennemgang af
den grafik, de har — uden nøgle og uden at noget forlader browseren.

**Sådan gør man**

1. **＋ Ny** øverst i panelet. Træk et billede ind, vælg en fil (JPG, PNG, WebP
   eller SVG) — eller start fra et af de to indbyggede eksempler,
   *Forlystelsesparken* og *Teknisk tegning*, som allerede har steder sat.
2. **Sæt steder.** Klik på illustrationen, hvor et sted ligger. Navn og fortælling
   skriver man i listen til venstre, og prikken kan trækkes på plads bagefter.
   Kortet zoomer, panorerer og kører som altid.
3. **Del.** Giv gennemgangen et navn, og vælg mellem:
   - **▶ Kør gennemgangen** — turen kører med det samme.
   - **Send som fil** — én selvstændig `.html`-fil med billedet indbygget. Den
     kan sendes som den er og åbnes i en browser uden server og uden netadgang.
   - **Hent pakke** — en zip med `index.html`, billedfilerne, `places.json` og en
     `LAES-MIG.txt`, klar til at lægge på et webhotel, GitHub Pages eller Netlify.

Billedet kodes til to WebP-størrelser (2600 og 1500 px bredt) og gemmes sammen
med stederne i browserens eget lager. Gennemgangen dukker op i **Skift**-menuen
øverst i panelet, hvor man også skifter tilbage til det fælles kort og sletter
igen. Har man flere, står de øverst dem, man sidst har rettet i.

To ting er værd at vide:

- **Kun i denne browser.** En gennemgang ligger lokalt, indtil man selv sender
  filen eller pakken videre. Der bliver intet sendt op på en server.
- **Del-knappen i rute-linjen hører til det fælles kort.** Et link med en rute
  virker kun, hvor stederne findes; på egne gennemgange er delingen filen eller
  pakken i stedet.

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
assets/app.js                kamera, zoom, markører, tråd, redigering, egne gennemgange, zip
tools/publish.mjs            fra kladde til live i ét skridt
examples/forlystelsespark.svg  indbygget eksempel — oversigtskort
examples/teknisk-tegning.svg   indbygget eksempel — teknisk snit
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
- `RUTE_LS` — nøglen hvor den besøgendes egen rute huskes i browseren
- `EGEN_LS` — nøglen hvor den gennemgang, man sidst har åbnet, huskes
- `EGEN_LISTE` / `EGEN_NOEGLE(id)` — hvor egne gennemgange gemmes i IndexedDB
- `EGEN_FULD` / `EGEN_LET` — bredden på de to WebP-filer, et upload kodes til
- `PRØVER` — de indbyggede eksempler med deres steder
- `DEFAULT_PLACES` — standardstederne, hvis filen mangler
- `DEFAULT_IMAGE` / `LOW_IMAGE` — illustrationerne
- `FULL_SIDE` / `LOW_SIDE` — bredden på de to udgivne billedfiler
- `MIN_ZOOM` / `MAX_ZOOM` — hvor langt der kan zoomes
- `dwellFor()` — hvor længe rundturen hviler på hvert sted
