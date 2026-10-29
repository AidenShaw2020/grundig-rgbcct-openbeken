save:
stopScript 705 1
if $CH59!=0||$CH57!=$CH58 then goto save_wait
backlog SetStartValue 1 ($CH1/512);SetStartValue 2 ($CH2/512);SetStartValue 3 ($CH3/512);SetStartValue 4 ($CH4/512);SetStartValue 5 ($CH5/512)
backlog SetStartValue 6 ($CH6/512);SetStartValue 7 ($CH7/512);SetStartValue 8 ($CH8/512);SetStartValue 9 ($CH9/512);SetStartValue 10 ($CH10/512)
backlog SetStartValue 11 ($CH11/512);SetStartValue 12 ($CH12/512);SetStartValue 13 ($CH13/512);SetStartValue 14 ($CH14/512);SetStartValue 15 ($CH15/512)
backlog SetStartValue 16 ($CH16/512);SetStartValue 17 ($CH17/512);SetStartValue 18 ($CH18/512);SetStartValue 19 ($CH19/512);SetStartValue 20 ($CH20/512)
backlog SetStartValue 21 ($CH21/512);SetStartValue 22 ($CH22/512);SetStartValue 23 ($CH23/512);SetStartValue 24 ($CH24/512);SetStartValue 25 ($CH25/512)
backlog SetStartValue 26 $CH26+(($CH1/16)%32)*1024;SetStartValue 27 $CH27+(($CH2/16)%32)*1024;SetStartValue 28 $CH28+(($CH3/16)%32)*1024;SetStartValue 29 $CH29+(($CH4/16)%32)*1024;SetStartValue 30 $CH30+(($CH5/16)%32)*1024
backlog SetStartValue 31 $CH31+(($CH6/16)%32)*1024;SetStartValue 32 $CH32+(($CH7/16)%32)*1024;SetStartValue 33 $CH33+(($CH8/16)%32)*1024;SetStartValue 34 $CH34+(($CH9/16)%32)*1024;SetStartValue 35 $CH35+(($CH10/16)%32)*1024
backlog SetStartValue 36 $CH36+(($CH11/16)%32)*1024;SetStartValue 37 $CH37+(($CH12/16)%32)*1024;SetStartValue 38 $CH38+(($CH13/16)%32)*1024;SetStartValue 39 $CH39+(($CH14/16)%32)*1024;SetStartValue 40 $CH40+(($CH15/16)%32)*1024
backlog SetStartValue 41 $CH41+(($CH16/16)%32)*1024;SetStartValue 42 $CH42+(($CH17/16)%32)*1024;SetStartValue 43 $CH43+(($CH18/16)%32)*1024;SetStartValue 44 $CH44+(($CH19/16)%32)*1024;SetStartValue 45 $CH45+(($CH20/16)%32)*1024
backlog SetStartValue 46 $CH46+(($CH21/16)%32)*1024;SetStartValue 47 $CH47+(($CH22/16)%32)*1024;SetStartValue 48 $CH48+(($CH23/16)%32)*1024;SetStartValue 49 $CH49+(($CH24/16)%32)*1024;SetStartValue 50 $CH50+(($CH25/16)%32)*1024
backlog SetStartValue 55 ($CH1%16)+($CH2%16)*16+($CH3%16)*256;SetStartValue 56 4096+($CH4%16)+($CH5%16)*16+($CH6%16)*256;SetStartValue 57 ($CH7%16)+($CH8%16)*16+($CH9%16)*256;SetStartValue 58 ($CH10%16)+($CH11%16)*16+($CH12%16)*256
backlog SetStartValue 59 $CH0+($CH13%16)*128+($CH14%16)*2048;SetStartValue 62 $CH62+($CH15%16)*128+($CH16%16)*2048;SetStartValue 51 $CH51+($CH17%16)*128+($CH18%16)*2048;SetStartValue 52 $CH52+($CH19%16)*128+($CH20%16)*2048
backlog SetStartValue 53 $CH53+($CH21%16)*128+($CH22%16)*2048;SetStartValue 54 $CH54+($CH23%16)*128+($CH24%16)*2048;SetStartValue 61 $CH61+($CH25%16)*128;SetStartValue 60 ($CH60/512);SetStartValue 63 20+($CH63%10)+($CH60%512)*64;SetChannel 63 20+$CH63%10
return
save_wait:
delay_s 0.2
goto save
migrate:
if $CH56==5 then goto migrated
if $CH56<4096 then goto legacy
backlog Ch1 $CH1*512+(($CH26/1024)%32)*16+($CH55%16);Ch2 $CH2*512+(($CH27/1024)%32)*16+(($CH55/16)%16);Ch3 $CH3*512+(($CH28/1024)%32)*16+(($CH55/256)%16);Ch4 $CH4*512+(($CH29/1024)%32)*16+($CH56%16)
backlog Ch5 $CH5*512+(($CH30/1024)%32)*16+(($CH56/16)%16);Ch6 $CH6*512+(($CH31/1024)%32)*16+(($CH56/256)%16);Ch7 $CH7*512+(($CH32/1024)%32)*16+($CH57%16);Ch8 $CH8*512+(($CH33/1024)%32)*16+(($CH57/16)%16)
backlog Ch9 $CH9*512+(($CH34/1024)%32)*16+(($CH57/256)%16);Ch10 $CH10*512+(($CH35/1024)%32)*16+($CH58%16);Ch11 $CH11*512+(($CH36/1024)%32)*16+(($CH58/16)%16);Ch12 $CH12*512+(($CH37/1024)%32)*16+(($CH58/256)%16)
backlog Ch13 $CH13*512+(($CH38/1024)%32)*16+(($CH59/128)%16);Ch14 $CH14*512+(($CH39/1024)%32)*16+(($CH59/2048)%16);Ch15 $CH15*512+(($CH40/1024)%32)*16+(($CH62/128)%16);Ch16 $CH16*512+(($CH41/1024)%32)*16+(($CH62/2048)%16)
backlog Ch17 $CH17*512+(($CH42/1024)%32)*16+(($CH51/128)%16);Ch18 $CH18*512+(($CH43/1024)%32)*16+(($CH51/2048)%16);Ch19 $CH19*512+(($CH44/1024)%32)*16+(($CH52/128)%16);Ch20 $CH20*512+(($CH45/1024)%32)*16+(($CH52/2048)%16)
backlog Ch21 $CH21*512+(($CH46/1024)%32)*16+(($CH53/128)%16);Ch22 $CH22*512+(($CH47/1024)%32)*16+(($CH53/2048)%16);Ch23 $CH23*512+(($CH48/1024)%32)*16+(($CH54/128)%16);Ch24 $CH24*512+(($CH49/1024)%32)*16+(($CH54/2048)%16)
backlog Ch25 $CH25*512+(($CH50/1024)%32)*16+(($CH61/128)%16);Ch60 $CH60*512+(($CH63/64)%512)
backlog Ch26 $CH26%1024;Ch27 $CH27%1024;Ch28 $CH28%1024;Ch29 $CH29%1024;Ch30 $CH30%1024;Ch31 $CH31%1024;Ch32 $CH32%1024
backlog Ch33 $CH33%1024;Ch34 $CH34%1024;Ch35 $CH35%1024;Ch36 $CH36%1024;Ch37 $CH37%1024;Ch38 $CH38%1024
backlog Ch39 $CH39%1024;Ch40 $CH40%1024;Ch41 $CH41%1024;Ch42 $CH42%1024;Ch43 $CH43%1024;Ch44 $CH44%1024
backlog Ch45 $CH45%1024;Ch46 $CH46%1024;Ch47 $CH47%1024;Ch48 $CH48%1024;Ch49 $CH49%1024;Ch50 $CH50%1024
backlog Ch0 $CH59%128;Ch51 $CH51%128;Ch52 $CH52%128;Ch53 $CH53%128;Ch54 $CH54%128;Ch61 $CH61%128;Ch62 $CH62%128;Ch63 $CH63%64
Ch56 4
return
legacy:
backlog Ch26 $CH26+($CH26<2)*1000;Ch27 $CH27+($CH27<2)*1000;Ch28 $CH28+($CH28<2)*1000;Ch29 $CH29+($CH29<2)*1000;Ch30 $CH30+($CH30<2)*1000
backlog Ch31 $CH31+($CH31<2)*1000;Ch32 $CH32+($CH32<2)*1000;Ch33 $CH33+($CH33<2)*1000;Ch34 $CH34+($CH34<2)*1000;Ch35 $CH35+($CH35<2)*1000
backlog Ch36 $CH36+($CH36<2)*1000;Ch37 $CH37+($CH37<2)*1000;Ch38 $CH38+($CH38<2)*1000;Ch39 $CH39+($CH39<2)*1000;Ch40 $CH40+($CH40<2)*1000
backlog Ch41 $CH41+($CH41<2)*1000;Ch42 $CH42+($CH42<2)*1000;Ch43 $CH43+($CH43<2)*1000;Ch44 $CH44+($CH44<2)*1000;Ch45 $CH45+($CH45<2)*1000
backlog Ch46 $CH46+($CH46<2)*1000;Ch47 $CH47+($CH47<2)*1000;Ch48 $CH48+($CH48<2)*1000;Ch49 $CH49+($CH49<2)*1000;Ch50 $CH50+($CH50<2)*1000
migrated:
Ch56 4
return
