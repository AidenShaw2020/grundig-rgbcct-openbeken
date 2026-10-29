init:
PowerSave 0
SetPinRole 24 None
startDriver SM16703P
SM16703P_Init 50 RGB
SM16703P_SetPixel all 0 0 0
SM16703P_Start
led_enableAll 0
startDriver PixelAnim
Anim -1
stopDriver PixelAnim
if $CH56>=4096&&$CH63%64>=21 then goto migrate_start
SetChannel 56 0
SetChannel 59 1
SetChannel 63 0
SetChannel 51 0
startScript grundig-state.bat
restore_wait:
delay_s 0.1
if $CH63!=1&&$CH56!=3&&$CH56!=5 then goto restore_wait
if $CH63<11 then SetChannel 63 11
migrate_start:
startScript grundig-persist.bat migrate 706
migrate_wait:
delay_s 0.1
if $CH56!=4 then goto migrate_wait
SetChannel 57 1
SetChannel 58 0
SetChannel 59 0
SetPinRole 28 Btn_ScriptOnly
alias grundig_on SetChannel 51 $CH63%10
alias grundig_button if $CH51==0 then grundig_on else "SetChannel 51 0"
addEventHandler OnClick 28 grundig_button
alias grundig_timeout backlog SetChannel 51 0; SetChannel 59 0; AddChannel 57 1
alias grundig_lock if $CH59==0 then "cancelRepeatingEvent 702" else "addRepeatingEventID 20 1 702 grundig_timeout"
addEventHandler OnChannelChange 59 grundig_lock
alias grundig_changed if $CH59==0||$CH59==705 then AddChannel 57 1
alias grundig_global if $CH59==0||$CH59==703 then startScript grundig.bat all 703
alias grundig_save backlog cancelRepeatingEvent 705; addRepeatingEventID 5 1 705 startScript grundig-persist.bat save 705
alias grundig_publish backlog stopScript 704; startScript grundig.bat publish 704
addEventHandler OnChannelChange 0 grundig_changed
addEventHandler OnChannelChange 1 grundig_changed
addEventHandler OnChannelChange 2 grundig_changed
addEventHandler OnChannelChange 3 grundig_changed
addEventHandler OnChannelChange 4 grundig_changed
addEventHandler OnChannelChange 5 grundig_changed
addEventHandler OnChannelChange 6 grundig_changed
addEventHandler OnChannelChange 7 grundig_changed
addEventHandler OnChannelChange 8 grundig_changed
addEventHandler OnChannelChange 9 grundig_changed
addEventHandler OnChannelChange 10 grundig_changed
addEventHandler OnChannelChange 11 grundig_changed
addEventHandler OnChannelChange 12 grundig_changed
addEventHandler OnChannelChange 13 grundig_changed
addEventHandler OnChannelChange 14 grundig_changed
addEventHandler OnChannelChange 15 grundig_changed
addEventHandler OnChannelChange 16 grundig_changed
addEventHandler OnChannelChange 17 grundig_changed
addEventHandler OnChannelChange 18 grundig_changed
addEventHandler OnChannelChange 19 grundig_changed
addEventHandler OnChannelChange 20 grundig_changed
addEventHandler OnChannelChange 21 grundig_changed
addEventHandler OnChannelChange 22 grundig_changed
addEventHandler OnChannelChange 23 grundig_changed
addEventHandler OnChannelChange 24 grundig_changed
addEventHandler OnChannelChange 25 grundig_changed
addEventHandler OnChannelChange 26 grundig_changed
addEventHandler OnChannelChange 27 grundig_changed
addEventHandler OnChannelChange 28 grundig_changed
addEventHandler OnChannelChange 29 grundig_changed
addEventHandler OnChannelChange 30 grundig_changed
addEventHandler OnChannelChange 31 grundig_changed
addEventHandler OnChannelChange 32 grundig_changed
addEventHandler OnChannelChange 33 grundig_changed
addEventHandler OnChannelChange 34 grundig_changed
addEventHandler OnChannelChange 35 grundig_changed
addEventHandler OnChannelChange 36 grundig_changed
addEventHandler OnChannelChange 37 grundig_changed
addEventHandler OnChannelChange 38 grundig_changed
addEventHandler OnChannelChange 39 grundig_changed
addEventHandler OnChannelChange 40 grundig_changed
addEventHandler OnChannelChange 41 grundig_changed
addEventHandler OnChannelChange 42 grundig_changed
addEventHandler OnChannelChange 43 grundig_changed
addEventHandler OnChannelChange 44 grundig_changed
addEventHandler OnChannelChange 45 grundig_changed
addEventHandler OnChannelChange 46 grundig_changed
addEventHandler OnChannelChange 47 grundig_changed
addEventHandler OnChannelChange 48 grundig_changed
addEventHandler OnChannelChange 49 grundig_changed
addEventHandler OnChannelChange 50 grundig_changed
addEventHandler OnChannelChange 51 grundig_changed
addEventHandler OnChannelChange 52 grundig_changed
addEventHandler OnChannelChange 53 grundig_changed
addEventHandler OnChannelChange 54 grundig_changed
addEventHandler OnChannelChange 60 grundig_global
addEventHandler OnChannelChange 61 grundig_changed
addEventHandler OnChannelChange 62 grundig_changed
addChangeHandler MQTTState == 1 grundig_publish
addRepeatingEventID 30 -1 704 grundig_publish
setChannelType 51 Enum
setChannelLabel 51 "Grundig - rezim"
setChannelEnum 51 1:RGB 2:Bila 3:PixelAnim
setChannelType 52 Dimmer
setChannelLabel 52 "RGB - jas"
setChannelType 53 Dimmer
setChannelLabel 53 "Bila - jas"
setChannelType 54 Dimmer
setChannelLabel 54 "Bila - podil CW"
setChannelType 0 Enum
setChannelLabel 0 "PixelAnim - efekt"
setChannelEnum 0 "0:Rainbow Cycle" "1:Fire" "2:Shooting Star" "3:Comet" "4:Theater Chase" "5:Theater Chase Rainbow"
setChannelType 61 Dimmer
setChannelLabel 61 "PixelAnim - jas"
setChannelType 62 Enum
setChannelLabel 62 "PixelAnim - interval"
setChannelEnum 62 0:Minimum 1:Plynuly 2:2 3:3 4:4 5:5 6:6 7:7 8:8 9:9 10:Pomalu
setChannelType 56 ReadOnly
setChannelLabel 56 "<a href='/api/lfs/grundig.html.gz'>Grundig RGB+CCT - segmenty</a>"
setChannelType 60 ReadOnly
setChannelLabel 60 "<span id='grundig-rgb-state'>RGB</span><script src='/api/lfs/grundig-rgb.js'></script>"
SetChannel 56 1
render:
if $CH59!=0 then goto locked_wait
if $CH57==$CH58 then goto idle
if $CH51>0 then SetChannel 63 $CH63-$CH63%10+$CH51
SetChannel 55 $CH57
if $CH51==3 then goto animation
if $CH56!=2 then goto static
SetChannel 59 701+$CH0*1024
Anim -1
led_enableAll 0
stopDriver PixelAnim
SM16703P_Init 50 RGB
SetChannel 0 ($CH59/1024)%8
SetChannel 56 1
SetChannel 59 0
static:
SM16703P_SetPixel all 0 0 0
if $CH51==1 then goto rgb
if $CH51==2 then goto white
goto send
rgb:
SM16703P_SetPixel 0 ($CH1%256)*$CH52/100*($CH26%10)*($CH26-$CH26%10)/1000 (($CH1/65536)%256)*$CH52/100*($CH26%10)*($CH26-$CH26%10)/1000 (($CH1/256)%256)*$CH52/100*($CH26%10)*($CH26-$CH26%10)/1000
SM16703P_SetPixel 2 ($CH2%256)*$CH52/100*($CH27%10)*($CH27-$CH27%10)/1000 (($CH2/65536)%256)*$CH52/100*($CH27%10)*($CH27-$CH27%10)/1000 (($CH2/256)%256)*$CH52/100*($CH27%10)*($CH27-$CH27%10)/1000
SM16703P_SetPixel 4 ($CH3%256)*$CH52/100*($CH28%10)*($CH28-$CH28%10)/1000 (($CH3/65536)%256)*$CH52/100*($CH28%10)*($CH28-$CH28%10)/1000 (($CH3/256)%256)*$CH52/100*($CH28%10)*($CH28-$CH28%10)/1000
SM16703P_SetPixel 6 ($CH4%256)*$CH52/100*($CH29%10)*($CH29-$CH29%10)/1000 (($CH4/65536)%256)*$CH52/100*($CH29%10)*($CH29-$CH29%10)/1000 (($CH4/256)%256)*$CH52/100*($CH29%10)*($CH29-$CH29%10)/1000
SM16703P_SetPixel 8 ($CH5%256)*$CH52/100*($CH30%10)*($CH30-$CH30%10)/1000 (($CH5/65536)%256)*$CH52/100*($CH30%10)*($CH30-$CH30%10)/1000 (($CH5/256)%256)*$CH52/100*($CH30%10)*($CH30-$CH30%10)/1000
SM16703P_SetPixel 10 ($CH6%256)*$CH52/100*($CH31%10)*($CH31-$CH31%10)/1000 (($CH6/65536)%256)*$CH52/100*($CH31%10)*($CH31-$CH31%10)/1000 (($CH6/256)%256)*$CH52/100*($CH31%10)*($CH31-$CH31%10)/1000
SM16703P_SetPixel 12 ($CH7%256)*$CH52/100*($CH32%10)*($CH32-$CH32%10)/1000 (($CH7/65536)%256)*$CH52/100*($CH32%10)*($CH32-$CH32%10)/1000 (($CH7/256)%256)*$CH52/100*($CH32%10)*($CH32-$CH32%10)/1000
SM16703P_SetPixel 14 ($CH8%256)*$CH52/100*($CH33%10)*($CH33-$CH33%10)/1000 (($CH8/65536)%256)*$CH52/100*($CH33%10)*($CH33-$CH33%10)/1000 (($CH8/256)%256)*$CH52/100*($CH33%10)*($CH33-$CH33%10)/1000
SM16703P_SetPixel 16 ($CH9%256)*$CH52/100*($CH34%10)*($CH34-$CH34%10)/1000 (($CH9/65536)%256)*$CH52/100*($CH34%10)*($CH34-$CH34%10)/1000 (($CH9/256)%256)*$CH52/100*($CH34%10)*($CH34-$CH34%10)/1000
SM16703P_SetPixel 18 ($CH10%256)*$CH52/100*($CH35%10)*($CH35-$CH35%10)/1000 (($CH10/65536)%256)*$CH52/100*($CH35%10)*($CH35-$CH35%10)/1000 (($CH10/256)%256)*$CH52/100*($CH35%10)*($CH35-$CH35%10)/1000
SM16703P_SetPixel 20 ($CH11%256)*$CH52/100*($CH36%10)*($CH36-$CH36%10)/1000 (($CH11/65536)%256)*$CH52/100*($CH36%10)*($CH36-$CH36%10)/1000 (($CH11/256)%256)*$CH52/100*($CH36%10)*($CH36-$CH36%10)/1000
SM16703P_SetPixel 22 ($CH12%256)*$CH52/100*($CH37%10)*($CH37-$CH37%10)/1000 (($CH12/65536)%256)*$CH52/100*($CH37%10)*($CH37-$CH37%10)/1000 (($CH12/256)%256)*$CH52/100*($CH37%10)*($CH37-$CH37%10)/1000
SM16703P_SetPixel 24 ($CH13%256)*$CH52/100*($CH38%10)*($CH38-$CH38%10)/1000 (($CH13/65536)%256)*$CH52/100*($CH38%10)*($CH38-$CH38%10)/1000 (($CH13/256)%256)*$CH52/100*($CH38%10)*($CH38-$CH38%10)/1000
SM16703P_SetPixel 26 ($CH14%256)*$CH52/100*($CH39%10)*($CH39-$CH39%10)/1000 (($CH14/65536)%256)*$CH52/100*($CH39%10)*($CH39-$CH39%10)/1000 (($CH14/256)%256)*$CH52/100*($CH39%10)*($CH39-$CH39%10)/1000
SM16703P_SetPixel 28 ($CH15%256)*$CH52/100*($CH40%10)*($CH40-$CH40%10)/1000 (($CH15/65536)%256)*$CH52/100*($CH40%10)*($CH40-$CH40%10)/1000 (($CH15/256)%256)*$CH52/100*($CH40%10)*($CH40-$CH40%10)/1000
SM16703P_SetPixel 30 ($CH16%256)*$CH52/100*($CH41%10)*($CH41-$CH41%10)/1000 (($CH16/65536)%256)*$CH52/100*($CH41%10)*($CH41-$CH41%10)/1000 (($CH16/256)%256)*$CH52/100*($CH41%10)*($CH41-$CH41%10)/1000
SM16703P_SetPixel 32 ($CH17%256)*$CH52/100*($CH42%10)*($CH42-$CH42%10)/1000 (($CH17/65536)%256)*$CH52/100*($CH42%10)*($CH42-$CH42%10)/1000 (($CH17/256)%256)*$CH52/100*($CH42%10)*($CH42-$CH42%10)/1000
SM16703P_SetPixel 34 ($CH18%256)*$CH52/100*($CH43%10)*($CH43-$CH43%10)/1000 (($CH18/65536)%256)*$CH52/100*($CH43%10)*($CH43-$CH43%10)/1000 (($CH18/256)%256)*$CH52/100*($CH43%10)*($CH43-$CH43%10)/1000
SM16703P_SetPixel 36 ($CH19%256)*$CH52/100*($CH44%10)*($CH44-$CH44%10)/1000 (($CH19/65536)%256)*$CH52/100*($CH44%10)*($CH44-$CH44%10)/1000 (($CH19/256)%256)*$CH52/100*($CH44%10)*($CH44-$CH44%10)/1000
SM16703P_SetPixel 38 ($CH20%256)*$CH52/100*($CH45%10)*($CH45-$CH45%10)/1000 (($CH20/65536)%256)*$CH52/100*($CH45%10)*($CH45-$CH45%10)/1000 (($CH20/256)%256)*$CH52/100*($CH45%10)*($CH45-$CH45%10)/1000
SM16703P_SetPixel 40 ($CH21%256)*$CH52/100*($CH46%10)*($CH46-$CH46%10)/1000 (($CH21/65536)%256)*$CH52/100*($CH46%10)*($CH46-$CH46%10)/1000 (($CH21/256)%256)*$CH52/100*($CH46%10)*($CH46-$CH46%10)/1000
SM16703P_SetPixel 42 ($CH22%256)*$CH52/100*($CH47%10)*($CH47-$CH47%10)/1000 (($CH22/65536)%256)*$CH52/100*($CH47%10)*($CH47-$CH47%10)/1000 (($CH22/256)%256)*$CH52/100*($CH47%10)*($CH47-$CH47%10)/1000
SM16703P_SetPixel 44 ($CH23%256)*$CH52/100*($CH48%10)*($CH48-$CH48%10)/1000 (($CH23/65536)%256)*$CH52/100*($CH48%10)*($CH48-$CH48%10)/1000 (($CH23/256)%256)*$CH52/100*($CH48%10)*($CH48-$CH48%10)/1000
SM16703P_SetPixel 46 ($CH24%256)*$CH52/100*($CH49%10)*($CH49-$CH49%10)/1000 (($CH24/65536)%256)*$CH52/100*($CH49%10)*($CH49-$CH49%10)/1000 (($CH24/256)%256)*$CH52/100*($CH49%10)*($CH49-$CH49%10)/1000
SM16703P_SetPixel 48 ($CH25%256)*$CH52/100*($CH50%10)*($CH50-$CH50%10)/1000 (($CH25/65536)%256)*$CH52/100*($CH50%10)*($CH50-$CH50%10)/1000 (($CH25/256)%256)*$CH52/100*($CH50%10)*($CH50-$CH50%10)/1000
goto send
white:
SM16703P_SetPixel 1 ((($CH53*255/100)%256)*$CH54/100)%256 (($CH53*255/100)%256)-(((($CH53*255/100)%256)*$CH54/100)%256) 0
SM16703P_SetPixel 3 ((($CH53*255/100)%256)*$CH54/100)%256 (($CH53*255/100)%256)-(((($CH53*255/100)%256)*$CH54/100)%256) 0
SM16703P_SetPixel 5 ((($CH53*255/100)%256)*$CH54/100)%256 (($CH53*255/100)%256)-(((($CH53*255/100)%256)*$CH54/100)%256) 0
SM16703P_SetPixel 7 ((($CH53*255/100)%256)*$CH54/100)%256 (($CH53*255/100)%256)-(((($CH53*255/100)%256)*$CH54/100)%256) 0
SM16703P_SetPixel 9 ((($CH53*255/100)%256)*$CH54/100)%256 (($CH53*255/100)%256)-(((($CH53*255/100)%256)*$CH54/100)%256) 0
SM16703P_SetPixel 11 ((($CH53*255/100)%256)*$CH54/100)%256 (($CH53*255/100)%256)-(((($CH53*255/100)%256)*$CH54/100)%256) 0
SM16703P_SetPixel 13 ((($CH53*255/100)%256)*$CH54/100)%256 (($CH53*255/100)%256)-(((($CH53*255/100)%256)*$CH54/100)%256) 0
SM16703P_SetPixel 15 ((($CH53*255/100)%256)*$CH54/100)%256 (($CH53*255/100)%256)-(((($CH53*255/100)%256)*$CH54/100)%256) 0
SM16703P_SetPixel 17 ((($CH53*255/100)%256)*$CH54/100)%256 (($CH53*255/100)%256)-(((($CH53*255/100)%256)*$CH54/100)%256) 0
SM16703P_SetPixel 19 ((($CH53*255/100)%256)*$CH54/100)%256 (($CH53*255/100)%256)-(((($CH53*255/100)%256)*$CH54/100)%256) 0
SM16703P_SetPixel 21 ((($CH53*255/100)%256)*$CH54/100)%256 (($CH53*255/100)%256)-(((($CH53*255/100)%256)*$CH54/100)%256) 0
SM16703P_SetPixel 23 ((($CH53*255/100)%256)*$CH54/100)%256 (($CH53*255/100)%256)-(((($CH53*255/100)%256)*$CH54/100)%256) 0
SM16703P_SetPixel 25 ((($CH53*255/100)%256)*$CH54/100)%256 (($CH53*255/100)%256)-(((($CH53*255/100)%256)*$CH54/100)%256) 0
SM16703P_SetPixel 27 ((($CH53*255/100)%256)*$CH54/100)%256 (($CH53*255/100)%256)-(((($CH53*255/100)%256)*$CH54/100)%256) 0
SM16703P_SetPixel 29 ((($CH53*255/100)%256)*$CH54/100)%256 (($CH53*255/100)%256)-(((($CH53*255/100)%256)*$CH54/100)%256) 0
SM16703P_SetPixel 31 ((($CH53*255/100)%256)*$CH54/100)%256 (($CH53*255/100)%256)-(((($CH53*255/100)%256)*$CH54/100)%256) 0
SM16703P_SetPixel 33 ((($CH53*255/100)%256)*$CH54/100)%256 (($CH53*255/100)%256)-(((($CH53*255/100)%256)*$CH54/100)%256) 0
SM16703P_SetPixel 35 ((($CH53*255/100)%256)*$CH54/100)%256 (($CH53*255/100)%256)-(((($CH53*255/100)%256)*$CH54/100)%256) 0
SM16703P_SetPixel 37 ((($CH53*255/100)%256)*$CH54/100)%256 (($CH53*255/100)%256)-(((($CH53*255/100)%256)*$CH54/100)%256) 0
SM16703P_SetPixel 39 ((($CH53*255/100)%256)*$CH54/100)%256 (($CH53*255/100)%256)-(((($CH53*255/100)%256)*$CH54/100)%256) 0
SM16703P_SetPixel 41 ((($CH53*255/100)%256)*$CH54/100)%256 (($CH53*255/100)%256)-(((($CH53*255/100)%256)*$CH54/100)%256) 0
SM16703P_SetPixel 43 ((($CH53*255/100)%256)*$CH54/100)%256 (($CH53*255/100)%256)-(((($CH53*255/100)%256)*$CH54/100)%256) 0
SM16703P_SetPixel 45 ((($CH53*255/100)%256)*$CH54/100)%256 (($CH53*255/100)%256)-(((($CH53*255/100)%256)*$CH54/100)%256) 0
SM16703P_SetPixel 47 ((($CH53*255/100)%256)*$CH54/100)%256 (($CH53*255/100)%256)-(((($CH53*255/100)%256)*$CH54/100)%256) 0
SM16703P_SetPixel 49 ((($CH53*255/100)%256)*$CH54/100)%256 (($CH53*255/100)%256)-(((($CH53*255/100)%256)*$CH54/100)%256) 0
send:
if $CH59!=0 then goto locked_wait
if $CH57!=$CH55 then goto render
SM16703P_Start
SetChannel 58 $CH55
grundig_save
grundig_publish
idle:
waitFor Channel57 ! -1
goto render
locked_wait:
delay_s 0.1
goto render
animation:
if $CH0<0||$CH0>5||$CH61<0||$CH61>100||$CH62<0||$CH62>10 then goto invalid_animation
SetChannel 59 701+$CH0*1024
if $CH56==2 then goto animation_start
backlog SM16703P_Init 25 BRGCCC;startDriver PixelAnim;Anim -1;SM16703P_SetPixel all 0 0 0 0 0;SM16703P_Start;SetChannel 56 2
animation_start:
if $CH51!=3||$CH57!=$CH55 then goto animation_retry
backlog Ch26 ($CH26%1024)+($CH1%4096)*1024;Ch27 ($CH27%1024)+(($CH1/4096)%4096)*1024;Ch28 ($CH28%1024)+($CH2%4096)*1024;Ch29 ($CH29%1024)+(($CH2/4096)%4096)*1024
backlog Ch30 ($CH30%1024)+($CH3%4096)*1024;Ch31 ($CH31%1024)+(($CH3/4096)%4096)*1024;Ch32 ($CH32%1024)+($CH4%4096)*1024;Ch33 ($CH33%1024)+(($CH4/4096)%4096)*1024
backlog led_enableAll 0;Ch133 ($CH60/65536)%256;Ch134 ($CH60/256)%256;Ch135 $CH60%256;Ch136 0;Ch137 0;led_dimmer $CH61;AnimSpeed $CH62;Anim ($CH59/1024)%8;led_enableAll 1
backlog Ch0 ($CH59/1024)%8;Ch1 (($CH26/1024)%4096)+(($CH27/1024)%4096)*4096;Ch2 (($CH28/1024)%4096)+(($CH29/1024)%4096)*4096;Ch3 (($CH30/1024)%4096)+(($CH31/1024)%4096)*4096;Ch4 (($CH32/1024)%4096)+(($CH33/1024)%4096)*4096
backlog Ch26 $CH26%1024;Ch27 $CH27%1024;Ch28 $CH28%1024;Ch29 $CH29%1024;Ch30 $CH30%1024;Ch31 $CH31%1024;Ch32 $CH32%1024;Ch33 $CH33%1024
backlog SetChannel 58 $CH55;SetChannel 59 0;grundig_save;grundig_publish
goto idle
animation_retry:
SetChannel 59 0
AddChannel 57 1
goto render
invalid_animation:
SetChannel 51 0
goto render
all:
stopScript 703 1
if $CH59==703 then goto all_copy
if $CH59!=0 then goto all_wait
SetChannel 59 703
all_copy:
SetChannel 55 $CH60
SetChannel 1 $CH55
SetChannel 2 $CH55
SetChannel 3 $CH55
SetChannel 4 $CH55
SetChannel 5 $CH55
SetChannel 6 $CH55
SetChannel 7 $CH55
SetChannel 8 $CH55
SetChannel 9 $CH55
SetChannel 10 $CH55
SetChannel 11 $CH55
SetChannel 12 $CH55
SetChannel 13 $CH55
SetChannel 14 $CH55
SetChannel 15 $CH55
SetChannel 16 $CH55
SetChannel 17 $CH55
SetChannel 18 $CH55
SetChannel 19 $CH55
SetChannel 20 $CH55
SetChannel 21 $CH55
SetChannel 22 $CH55
SetChannel 23 $CH55
SetChannel 24 $CH55
SetChannel 25 $CH55
SetChannel 26 $CH26-$CH26%10+1
SetChannel 27 $CH27-$CH27%10+1
SetChannel 28 $CH28-$CH28%10+1
SetChannel 29 $CH29-$CH29%10+1
SetChannel 30 $CH30-$CH30%10+1
SetChannel 31 $CH31-$CH31%10+1
SetChannel 32 $CH32-$CH32%10+1
SetChannel 33 $CH33-$CH33%10+1
SetChannel 34 $CH34-$CH34%10+1
SetChannel 35 $CH35-$CH35%10+1
SetChannel 36 $CH36-$CH36%10+1
SetChannel 37 $CH37-$CH37%10+1
SetChannel 38 $CH38-$CH38%10+1
SetChannel 39 $CH39-$CH39%10+1
SetChannel 40 $CH40-$CH40%10+1
SetChannel 41 $CH41-$CH41%10+1
SetChannel 42 $CH42-$CH42%10+1
SetChannel 43 $CH43-$CH43%10+1
SetChannel 44 $CH44-$CH44%10+1
SetChannel 45 $CH45-$CH45%10+1
SetChannel 46 $CH46-$CH46%10+1
SetChannel 47 $CH47-$CH47%10+1
SetChannel 48 $CH48-$CH48%10+1
SetChannel 49 $CH49-$CH49%10+1
SetChannel 50 $CH50-$CH50%10+1
if $CH60!=$CH55 then goto all_copy
SetChannel 59 0
AddChannel 57 1
return
all_wait:
delay_s 0.1
goto all
publish:
stopScript 704 1
if MQTTOn==0 then return
publish grundig/state [$CH51,$CH52,$CH53,$CH54,$CH60,$CH0,$CH61,$CH62,$CH63]
delay_s 0.1
publish grundig/segment01 [$CH1,$CH26,$CH51,$CH52]
delay_s 0.1
publish grundig/segment02 [$CH2,$CH27,$CH51,$CH52]
delay_s 0.1
publish grundig/segment03 [$CH3,$CH28,$CH51,$CH52]
delay_s 0.1
publish grundig/segment04 [$CH4,$CH29,$CH51,$CH52]
delay_s 0.1
publish grundig/segment05 [$CH5,$CH30,$CH51,$CH52]
delay_s 0.1
publish grundig/segment06 [$CH6,$CH31,$CH51,$CH52]
delay_s 0.1
publish grundig/segment07 [$CH7,$CH32,$CH51,$CH52]
delay_s 0.1
publish grundig/segment08 [$CH8,$CH33,$CH51,$CH52]
delay_s 0.1
publish grundig/segment09 [$CH9,$CH34,$CH51,$CH52]
delay_s 0.1
publish grundig/segment10 [$CH10,$CH35,$CH51,$CH52]
delay_s 0.1
publish grundig/segment11 [$CH11,$CH36,$CH51,$CH52]
delay_s 0.1
publish grundig/segment12 [$CH12,$CH37,$CH51,$CH52]
delay_s 0.1
publish grundig/segment13 [$CH13,$CH38,$CH51,$CH52]
delay_s 0.1
publish grundig/segment14 [$CH14,$CH39,$CH51,$CH52]
delay_s 0.1
publish grundig/segment15 [$CH15,$CH40,$CH51,$CH52]
delay_s 0.1
publish grundig/segment16 [$CH16,$CH41,$CH51,$CH52]
delay_s 0.1
publish grundig/segment17 [$CH17,$CH42,$CH51,$CH52]
delay_s 0.1
publish grundig/segment18 [$CH18,$CH43,$CH51,$CH52]
delay_s 0.1
publish grundig/segment19 [$CH19,$CH44,$CH51,$CH52]
delay_s 0.1
publish grundig/segment20 [$CH20,$CH45,$CH51,$CH52]
delay_s 0.1
publish grundig/segment21 [$CH21,$CH46,$CH51,$CH52]
delay_s 0.1
publish grundig/segment22 [$CH22,$CH47,$CH51,$CH52]
delay_s 0.1
publish grundig/segment23 [$CH23,$CH48,$CH51,$CH52]
delay_s 0.1
publish grundig/segment24 [$CH24,$CH49,$CH51,$CH52]
delay_s 0.1
publish grundig/segment25 [$CH25,$CH50,$CH51,$CH52]
return