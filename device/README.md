# Grundig RGB+CCT / OpenBeken

Testovana platforma: BK7231N, OpenBeken 1.18.319. Verejne priklady pouzivaji MQTT topic `grundig_led`.
P9 vede na DI pasku Grundig 3221698 (24 V, 25 segmentu).
Testovano s LittleFS 64 kB. Pred upravou filesystemu zalohovat vlastni zarizeni; zalohy se nezverejnuji a nejsou firmwarem.

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
- Ulozit pro restart zapisuje profil do flash. Bez tohoto prikazu jsou zmeny pouze v RAM.

## Start A Protokol

`autoexec.bat` spousti `grundig.bat init 701`; kratky startup prikaz je `PowerSave 0`.
Pri prvni instalaci nahrat `grundig-state.example.bat` jako `grundig-state.bat`. Pri aktualizaci zachovat vlastni ulozeny profil. Skutecny profil je ignorovany Gitem.
Po inicializaci SPI se ihned posle cerny ramec. Obnova profilu neobnovuje rezim ON.
Kratky zablesk jeste pred spustenim skriptu neni odstranen ani lokalizovan.
K jeho rozliseni od napajeciho chovani pasku je treba odchytit DI pri cold bootu.

Ramec ma 150 bajtu: 25 blokovych skupin `B R G CW WW 0`.
Staticky renderer pouziva `SM16703P_Init 50 RGB`, animace `SM16703P_Init 25 BRGCCC`.
Pri animaci musi zustat bile slozky nulove. Nepouzivat sestibajtove pixely s upstream VerifyPixel pomocniky s petibajtovym bufferem.
Native LED parametry se aktualizuji pod zamkem CH59, jinak vznikala smycka pozadovanych revizi.

## Kanaly

| Kanaly | Vyznam |
| --- | --- |
| 0 | PixelAnim efekt 0..5 |
| 1..25 | Ulozene RGB jako cele cislo R*65536+G*256+B |
| 26..50 | Zapnuti odpovidajicich RGB segmentu |
| 51 | Rezim 0 OFF, 1 RGB, 2 bila, 3 PixelAnim |
| 52, 53, 54 | Jas RGB, jas bile, podil CW v procentech |
| 55 | Pracovni revize rendereru / pracovni globalni barva |
| 56 | Backend 0 init, 1 staticky, 2 PixelAnim |
| 57, 58 | Pozadovana / potvrzena revize |
| 59 | Zamek transakce; 0 volno, 701 renderer, 703 globalni kopie |
| 60, 61, 62 | Globalni RGB, jas animace, interval 0..10 |
| 63 | Obnovovaci sentinel a nasledne ochrana globalni kopie |

## Home Assistant

[homeassistant.yaml](homeassistant.yaml) je HA package v JSON podmnozine YAML.
Obsahuje 25 segmentovych RGB svetel, globalni RGB, bilou CCT, PixelAnim se sesti efekty a ciselny interval.
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