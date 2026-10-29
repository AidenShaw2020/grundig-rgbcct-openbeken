# Grundig RGB+CCT / OpenBeken

Testovana platforma: BK7231N, OpenBeken 1.18.319. Verejne priklady pouzivaji MQTT topic `grundig_led`.
P9 vede na DI pasku Grundig 3221698 (24 V, 25 segmentu).
Testovano s LittleFS 64 kB. Pred upravou filesystemu zalohovat vlastni zarizeni; zalohy se nezverejnuji a nejsou firmwarem.

## Persistence Stavu A Aktualizace Obrazu LittleFS

Na zarizenich se stock firmwarem 1.18.319 (sestaveni Oct 25 2026 10:15:31) je nasazena persistence stavu pres `SetStartValue` ([grundig-persist.bat](grundig-persist.bat), generovana skriptem [generate_ha.mjs](../tools/generate_ha.mjs)) bez jakychkoli behovych zapisu do LittleFS:

- Po kazdem dokonceni vykresleni renderer naplanuje za 5 s ulozeni stavu (`grundig_save`), ktere v jedinem 20radkovem tiknuti zabali plnych 24 bitu vsech 25 barev segmentu, jejich jasy a zapnuti (`level*10 + on`), globalni barvu, jasy, efekt i posledni aktivni rezim do startovacich hodnot kanalu (`g_cfg.startChannelValues`).
- Pri startu `init:` detekuje zabaleny stav (`$CH56>=4096&&$CH63%64>=21`) a rozbali jej v `migrate:` primo v RAM bez spousteni `grundig-state.bat`. Zůstává zachovana i zpetna kompatibilita se souborem `grundig-state.bat` pro prvni start po nahrani obrazu.
- Offline builder obrazu [lfs_image.c](../tools/lfs_image.c) pouziva `cache_size = 16` a `lookahead_size = 16` shodne s internim flash LittleFS na BK7231N (`src/littlefs/our_lfs.c`).
- [upgrade_device.mjs](../tools/upgrade_device.mjs) podporuje `--resume --prepare` (offline sestaveni a verifikace obrazu bez zapisu do zarizeni), `--resume` / `--apply` (atomicky zapis 64KiB LittleFS obrazu pres `/api/fsblock` s presnym ctenim zpet), `--discovery` (publikace 34 retained Home Assistant discovery konfiguraci s JSON Unicode escapovanim `\u0024` proti expanzi `$CH...` v `publishFile`) a `--verify` (kontrola obnovenych kanalu po restartu).

## Experiment S Odlehcenym Firmwarem

[grundig-noir-1.18.319.patch](grundig-noir-1.18.319.patch) pridava variantu `OBK_VARIANT=11` pro BK7231N do upstream verze `1.18.319`, commit `7b754d6fc80b72115ece31fcf4527f011f90deef`.
Odstranuje IR, RF prijem, nepouzivane senzory, merice, TuyaMCU, I2C, DDP, DGR, SSDP, mDNS, NTP a kalendar. Zachovava SM16703P, PixelAnim, MQTT/HA discovery, HTTP, OTA, LittleFS, skripty a vyrazy rendereru.

Obe varianty byly zkompilovany a slinkovany nad stejnym SDK:

| Varianta | `.data` | `.bss` | Staticka RAM |
| --- | ---: | ---: | ---: |
| Puvodni, `OBK_VARIANT=0` | 7429 B | 137623 B | 145052 B |
| Grundig bez IR, `OBK_VARIANT=11` | 4837 B | 133071 B | 137908 B |

Uspora byla **7144 B staticke RAM** za celou odlehcenou variantu, nikoli za samotne IR. Firmware byl pokusne nasazen pres OTA na jedno ze dvou zarizeni a pozdeji nahrazen puvodnim oficialnim sestavenim. Kratke mereni pri experimentu ukazalo ustaleny volny heap priblizne 55016 B oproti 47624 B pred aktualizaci. To nepotvrzuje odstraneni nahodnych restartu ani MQTT vypadku; po 334 sekundach tehdejsiho behu bylo evidovano jedno MQTT spojeni a jedna chyba.
`stopDriver IR` v puvodni verzi pouze zastavi casovac, neuvolni prijimaci objekt. Pro vypnuti IR v puvodnim firmwaru staci nastavit jeho pin na `None` a restartovat: ovladac se pri startu bez IR pinu neinicializuje. Vlastni firmware k tomu neni nutny.

Patch aplikovat v cistem upstream checkoutu pomoci `git apply`. V pripravenem Linux build prostredi sestavit a porovnat:

```sh
make OBK_VARIANT=0 APP_VERSION=1.18.319-baseline OpenBK7231N
make OBK_VARIANT=11 APP_VERSION=1.18.319-grundig-noir OpenBK7231N
arm-none-eabi-size output/1.18.319-baseline/*.axf output/1.18.319-grundig-noir/*.axf
```

Lokalni [build_firmware.mjs](../tools/build_firmware.mjs) pouziva jiz pripraveny Docker image `grundig-obk-build:1.18.319` a Linux volume `grundig-obk-work-1.18.319`; prepina se `--reference`, `--minimal`, `--size`, `--status`. Neni instalator prostredi a nepouziva VS Code Tasks. Vystupy, zdroje, SDK a logy zustavaji soukrome pod ignorovanym `device/upgrade.local/`.
Pred pripadnou OTA zalohovat firmware i nastaveni, overit podporovany format a moznost fyzicke obnovy. Nemazat ani neformatovat LittleFS; QIO/UA obrazy nejsou urceny k bezne OTA aktualizaci.

[ota_device.mjs](../tools/ota_device.mjs) je zamerne vazany na konkretni overeny lokalni RBL obraz a puvodni renderer; neni univerzalni aktualizator. `--check` overi SHA-256, hlavicku a hranice obrazu, `--monitor <origin>` ulozi pet vzorku heapu z TCP logu. `--backup <origin> --pause-renderer` zalohuje celou 2MiB flash, 64KiB LittleFS, piny a kanaly; pred resetem cache kontroluje vlastnictvi skriptu a renderer po prenosu obnovi. Pri cteni pouziva omezene opakovani; zapisy neopakuje.
`--preflight <origin> <backup-directory>` overuje zalohu i zive zarizeni bez zapisu. `--apply` se stejnymi argumenty nahraje RBL, porovna vsechny bajty ctenim z OTA oblasti, overi nezmenene LittleFS a teprve pote vyzada restart. `--verify` kontroluje novy build, piny, LittleFS a potvrzene kanaly; `--restore` navic vyzaduje cestu k puvodnimu snimku kanalu tvaru pole 64 cisel. Obnovuje pouze RAM, nikoli ulozeny profil. Stavove zaznamy a zalohy zustavaji soukrome. API tohoto sestaveni stale hlasi verzi `1.18.319`; od puvodniho se lisi casem sestaveni.
Volba `--stock` prepina na overeny oficialni RBL 1.18.319 (SHA-256 `c8ac7095764afecd0d4fe8a993930f9ddcd817e4ec51ca0b1f07d8f56f7de84a`). Vylozene vyzadany navrat z experimentu lze provest prikazem `--revert-stock <origin> <existing-full-backup-directory> --stock`: overi existujici uplnou zalohu, zachyti aktualni piny, kanaly a LittleFS a pouzije stejne kontroly OTA bez dalsiho cteni cele 2MiB flash. Stara konfigurace ze zalohy se na zarizeni nezapisuje. Nasledne se pouzije `--verify <origin> <new-settings-backup-directory> --stock`.
Prvni OTA prosla presnym ctenim zpet i kontrolou po restartu. Puvodni renderer, ulozeny profil a cele LittleFS zustaly shodne se zalohou. Puvodni zivy bily rezim a jasy byly obnoveny s potvrzenim rendereru. Nove zmeny persistence a HA timto krokem nasazeny nebyly; vizualni ani cold-boot kontrola neprobehla.

## Ovladani

- Nativni menu: http://192.168.4.1/
- Segmentova stranka: http://192.168.4.1/api/lfs/grundig.html.gz
- Rezim: OFF / RGB / bila / PixelAnim. Volba efektu, jeho jas a interval jsou v nativnim menu.
- Pouzivat pojmenovane ovladace Grundig a PixelAnim; obecne LED ovladace firmwaru nejsou ovladanim tohoto segmentoveho rendereru.
- Picker `Grundig RGB - barva` nastavuje CH60. Skript `grundig-rgb.js` zachyti zmenu pred nativnim odeslanim, aktualizuje zobrazenou barvu a skryje `Toggle Light`, vcetne obnovy menu. Vyzaduje JavaScript a kompatibilni HTML menu OpenBeken.
- Spodni `LED Dimmer/Brightness` nepouzivat; pouzit `RGB - jas`. Pokud picker zustava oznaceny `LED RGB Color`, adapter se nenacetl a je treba pouzit segmentovou stranku. Nativni `apply_smart_light()` prepisuje SPI ramec a pri animaci muze prepsat CH0..4, vcetne ulozenych barev segmentu. Sledovani nativnich LED hodnot neni bezpecne propojeni s rendererem.
- Jas RGB je spolecny vsem segmentum, vcetne jejich HA entit. Barva a zapnuti jsou samostatne pro kazdy segment.
- Bila nezavisi na ulozenych RGB barvach. Zmeny RGB za bileho rezimu ulozena data meni, bilou nevypnou.
- Globalni RGB barva prepise barvu a zapne vsech 25 segmentu.
- Stav (rezim, barvy, jasy i nastaveni animace) se automaticky uklada pres `SetStartValue` s odkladem 5 s po zmene; tlacitko `Ulozit pro restart` v segmentove strance ulozeni provede okamzite.

## Start A Protokol

`autoexec.bat` spousti `grundig.bat init 701`; kratky startup prikaz je `PowerSave 0`.
Pri prvni instalaci nahrat `grundig-state.example.bat` jako `grundig-state.bat`. Pri aktualizaci zachovat vlastni ulozeny profil. Skutecny profil je ignorovany Gitem.
Po inicializaci SPI se ihned posle cerny ramec. Následně `init:` obnovi posledni ulozeny stav ze `SetStartValue` (vcetne toho, zda bylo svetlo zapnute nebo vypnute a jaky melo posledni aktivni rezim `CH63%10`).
Kratky zablesk jeste pred spustenim skriptu neni odstranen ani lokalizovan.
K jeho rozliseni od napajeciho chovani pasku je treba odchytit DI pri cold bootu.

Ramec ma 150 bajtu: 25 blokovych skupin `B R G CW WW 0`.
Staticky renderer pouziva `SM16703P_Init 50 RGB`, animace `SM16703P_Init 25 BRGCCC`.
Pri animaci musi zustat bile slozky nulove. Nepouzivat sestibajtove pixely s upstream VerifyPixel pomocniky s petibajtovym bufferem.
Native LED parametry se aktualizuji pod zamkem CH59, jinak vznikala smycka pozadovanych revizi. Pri startu `PixelAnim` (`led_enableAll 1` v rezimu `Light_Anim`) upstream `apply_smart_light()` nuluje `CH0..4`; renderer proto v `animation_start:` barvy `CH1..4` docasne zabali do vyssich bitu `CH26..33` a ihned po `led_enableAll 1` obnovi `CH0..4` i `CH26..33` v ramci tehoz tiknuti.

## Kanaly

| Kanaly | Vyznam |
| --- | --- |
| 0 | PixelAnim efekt 0..5 |
| 1..25 | Ulozene RGB jako cele cislo R*65536+G*256+B |
| 26..50 | Kodovany jas a zapnuti segmentu `jas*10 + zapnuti` (`0..1001`, 100 % ON = `1001`) |
| 51 | Rezim 0 OFF, 1 RGB, 2 bila, 3 PixelAnim |
| 52, 53, 54 | Jas RGB, jas bile, podil CW v procentech |
| 55 | Pracovni revize rendereru / pracovni globalni barva |
| 56 | Backend 0 init, 1 staticky, 2 PixelAnim (4 rozbaleno v `migrate:`) |
| 57, 58 | Pozadovana / potvrzena revize |
| 59 | Zamek transakce; 0 volno, 701 renderer, 703 globalni kopie |
| 60, 61, 62 | Globalni RGB, jas animace, interval 0..10 |
| 63 | Kodovany stav profilu `20 + posledni_aktivni_rezim` (`21..23`, resp. `11..13` ze souboru) |

## Home Assistant

[homeassistant.yaml](homeassistant.yaml) je HA package v JSON podmnozine YAML (a [generate_ha.mjs](../tools/generate_ha.mjs) soucasne umi generovat 34 MQTT discovery payloadu pro automaticke pridani bez rucniho YAML).
Obsahuje 25 segmentovych RGB svetel (se samostatnym jasem kazdeho segmentu), globalni RGB, bilou CCT, PixelAnim se sesti efekty, hlavni vypinac `Light` (zapina do posledniho aktivniho rezimu `CH63%10`), volbu rezimu a ciselne ovladani jasu/intervalu animace.
Zapojeni do HA packages muze vypadat takto; sloucit s existujicim nastavenim, nepridavat duplicitni korenove klice:

```yaml
homeassistant:
  packages:
    grundig: !include homeassistant.yaml
```

Broker a sit si nastavuje uzivatel. Nastavit `OPENBEKEN_DEVICE_ID` na vlastni MQTT topic a spustit generator; vychozi verejny topic `grundig_led` je pouze priklad. Lokalni vygenerovanou konfiguraci s identifikatory zarizeni nezverejnovat.
Prikazy maji `retain: false` a QoS 0, aby se stare ON prikazy neprehravaly pri dalsim pripojeni.
HA entity nejsou optimisticke; cekaji na stav zarizeni.
Rozsah bile 2700..6500 K je pouze nominalni linearni prevod podilu CW, nikoli zmerena teplota pasku.

MQTT rozhrani:

- Prikazy: `cmnd/grundig_led/Backlog`, telo jsou OpenBeken prikazy oddelene stredniky.
- Dostupnost: `grundig_led/connected`, hodnoty `online` / `offline`.
- Stav: `grundig_led/grundig/state/get`, JSON pole `[rezim,RGB_jas,bila_jas,CW_podil,global_RGB,efekt,anim_jas,interval]`.
- Segment: `grundig_led/grundig/segment01/get` az `segment25/get`, JSON pole `[RGB,zapnuti,rezim,RGB_jas]`.
- Publikace po renderu, pri pripojeni MQTT a kazdych 30 sekund. Prvni stav po pripojeni HA muze prijit az s periodickou publikaci.

## Overeni A Udrzba

```powershell
node tools/generate_ha.mjs
node tools/generate_ha.mjs --check
node tools/check_device.mjs --check-ui
node tools/check_device.mjs
```

`check_device.mjs --deploy` take nahraje aktualni renderer, porovna obsah a obnovi beh bez nacitani ulozeneho profilu.
`check_device.mjs --deploy-ui` nahraje a presne porovna RGB adapter, zaregistruje jeho stitek CH60 a nahraje gzip stranku s porovnanim komprimovaneho i rozbaleneho obsahu. Trvale startovaci nastaveni je v rendereru.
Test kratce zapne animaci a bilou v nastavenem jasu, RGB testuje na 5 %, obnovi puvodni RGB jas a skonci v OFF.
Vychozi ovladaci adresa je 192.168.4.1; jinou adresu nastavit pomoci `OPENBEKEN_URL`.
Volbu `--connect` pouzit jen pri odpojene Wi-Fi a existujicim Windows profilu uvedenem v `OPENBEKEN_WIFI_PROFILE`; opakovane pripojovani muze prerusit uz navazane spojeni.
Po `resetSVM` muze upstream znovu pouzit vlakno se starym waitFor priznakem; kontrolni skript jej probudi udalosti CH57.

Na desce overeno: vsechny tri aktivni rezimy, stabilni pozadovana/potvrzena revize, zachovani vsech 25 ulozenych barev a zaver OFF.
Propojeni sledovanim obecnych LED hodnot bylo zamitnuto kvuli konfliktu driveru s kanaly a SPI. RGB je misto toho premosteno primo v prohlizeci na CH60. Vyber cervene, zelene a modre pri 5 % potvrdil renderer ve vsech 25 segmentech; po testu byl profil obnoven a rezim OFF. Funkcnost vyberu barvy nasledne potvrdil uzivatel.
Stranka byla nahrana s presnym gzip i HTML zpetnym porovnanim; nacteni na sirce 390 px bez horizontalniho pretekani proslo.
Klikaci test PixelAnim -> OFF prosel se zachovanim barev. Prenosove opakovani bylo testovano i pri ztrate odpovedi po jiz provedenem commitu: revize se nezvysi dvakrat.
MQTT transport a prijeti package bezicim HA nejsou otestovane, protoze broker zatim neni nastaven.