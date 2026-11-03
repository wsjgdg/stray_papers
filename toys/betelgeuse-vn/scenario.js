// scenario.js — pure scenario data for the visual-novel engine.
// Defines window.SCENARIO only. No engine, no DOM.
window.SCENARIO = {
  meta: {
    title: "参宿四还亮着",
    author: "子夜工作室",
  },

  backgrounds: {
    apartment_night: {
      name: "深夜·公寓",
      css: "radial-gradient(ellipse at 78% 30%, rgba(140,180,230,0.22), transparent 55%), radial-gradient(ellipse at 18% 85%, rgba(70,90,130,0.14), transparent 60%), linear-gradient(165deg, #06070d 0%, #0b0f1c 55%, #101627 100%)",
      html: '<style>.apt-fx{position:absolute;top:0;left:0;width:100%;height:100%}.apt-fx i{position:absolute}.apt-glow{top:12%;right:4%;width:46%;height:46%;background:radial-gradient(ellipse at 62% 42%,rgba(140,185,235,.15),transparent 65%);animation:apt-gl 6.5s ease-in-out infinite}.apt-dust{top:0;left:0;width:100%;height:100%;background-image:radial-gradient(circle,rgba(150,185,225,.13) 1px,transparent 1.6px);background-size:96px 72px;animation:apt-rs 30s linear infinite}.apt-dp{width:2px;border-radius:2px;background:linear-gradient(180deg,transparent,rgba(175,205,240,.3) 35%,rgba(175,205,240,.1) 75%,transparent);opacity:.4;transform:translateY(6vh)}.apt-d1{top:8%;right:8%;height:58px;animation:apt-dp 12s linear infinite;animation-delay:-4s}.apt-d2{top:14%;right:16%;height:44px;animation:apt-dp 15.5s linear infinite;animation-delay:-9s}.apt-d3{top:5%;right:23%;height:66px;animation:apt-dp 17s linear infinite;animation-delay:-13s}.apt-d4{top:20%;right:12%;height:50px;animation:apt-dp 13.5s linear infinite;animation-delay:-1.5s}.apt-d5{top:11%;right:27%;height:40px;animation:apt-dp 16s linear infinite;animation-delay:-7s}.apt-flash{top:0;left:0;width:100%;height:100%;background:linear-gradient(165deg,rgba(190,215,255,.5),rgba(140,170,220,.2) 60%,transparent);opacity:0;animation:apt-fl 13.5s linear infinite}@keyframes apt-gl{0%,100%{opacity:.5}18%{opacity:.72}37%{opacity:.55}56%{opacity:.9}73%{opacity:.6}86%{opacity:.78}}@keyframes apt-dp{0%{opacity:0;transform:translateY(-8vh)}10%{opacity:.55}82%{opacity:.5}100%{opacity:0;transform:translateY(58vh)}}@keyframes apt-fl{0%,91%{opacity:0}92%{opacity:.09}93.5%{opacity:.02}95%{opacity:.06}97%,100%{opacity:0}}@keyframes apt-rs{to{transform:translateY(-72px)}}@media (prefers-reduced-motion:reduce){.apt-fx,.apt-fx *{animation:none !important}}</style><div class="apt-fx"><i class="apt-glow"></i><i class="apt-dust"></i><i class="apt-dp apt-d1"></i><i class="apt-dp apt-d2"></i><i class="apt-dp apt-d3"></i><i class="apt-dp apt-d4"></i><i class="apt-dp apt-d5"></i><i class="apt-flash"></i></div>',
    },
    email_screen: {
      name: "屏幕·未读邮件",
      css: "repeating-linear-gradient(180deg, rgba(150,195,255,0.09) 0px, rgba(150,195,255,0.09) 2px, transparent 2px, transparent 30px), radial-gradient(ellipse at 50% 38%, rgba(90,140,215,0.20), transparent 62%), linear-gradient(180deg, #080d16 0%, #0e1626 60%, #0a101c 100%)",
      html: '<style>.mail-fx{position:absolute;top:0;left:0;width:100%;height:100%}.mail-fx i{position:absolute}.mail-glow{top:26%;left:0;width:100%;height:44%;background:radial-gradient(ellipse at 50% 50%,rgba(90,140,220,.07),transparent 70%)}.mail-scan{top:0;left:0;width:100%;height:100%;background:repeating-linear-gradient(180deg,rgba(160,200,255,.045) 0 1px,transparent 1px 3px)}.mail-panel{left:10%;top:16%;width:64%;height:9%;border:1px solid rgba(150,195,255,.1);border-radius:6px;background:rgba(120,170,240,.03)}.mail-rows{left:12%;top:31%;width:60%;height:34%;border-radius:4px;background:repeating-linear-gradient(180deg,rgba(150,195,255,.05) 0 2px,transparent 2px 26px)}.mail-cursor{left:17%;top:60%;width:11px;height:20px;border-radius:1px;background:rgba(170,210,255,.85);box-shadow:0 0 8px rgba(150,200,255,.5);opacity:.9;animation:mail-cur 1.15s steps(1) infinite}.mail-badge{left:72.5%;top:17.2%;width:14px;height:14px;border-radius:50%;background:rgba(255,120,120,.85);box-shadow:0 0 10px 2px rgba(255,110,110,.45);animation:mail-bdg 2.8s ease-in-out infinite}@keyframes mail-cur{0%,49%{opacity:.9}50%,100%{opacity:0}}@keyframes mail-bdg{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.18)}}@media (prefers-reduced-motion:reduce){.mail-fx,.mail-fx *{animation:none !important}}</style><div class="mail-fx"><i class="mail-glow"></i><i class="mail-scan"></i><i class="mail-panel"></i><i class="mail-rows"></i><i class="mail-cursor"></i><i class="mail-badge"></i></div>',
    },
    streets_rain: {
      name: "雨夜·环山公路",
      css: "repeating-linear-gradient(102deg, rgba(170,200,225,0.05) 0px, rgba(170,200,225,0.05) 1px, transparent 1px, transparent 7px), radial-gradient(ellipse at 30% 85%, rgba(90,130,170,0.16), transparent 60%), linear-gradient(180deg, #070a10 0%, #0d141d 55%, #131c26 100%)",
      html: '<style>.rain-fx{position:absolute;top:0;left:0;width:100%;height:100%}.rain-fx i{position:absolute}.rain-l1{top:-220px;left:0;width:100%;height:calc(100% + 440px);background:repeating-linear-gradient(97.125deg,rgba(185,212,240,.16) 0 1px,transparent 1px 11px,rgba(185,212,240,.1) 11px 12px,transparent 12px 26px);animation:rain-f1 .85s linear infinite}.rain-l2{top:-160px;left:0;width:100%;height:calc(100% + 320px);background:repeating-linear-gradient(96.34deg,rgba(185,212,240,.075) 0 1px,transparent 1px 15px,transparent 15px 16px);animation:rain-f2 1.5s linear infinite}.rain-neon{top:7%;right:9%;width:120px;height:36px;border-radius:8px;background:rgba(255,90,170,.5);filter:blur(16px);animation:rain-nn 3.6s ease-in-out infinite}.rain-core{top:calc(7% + 6px);right:calc(9% + 14px);width:88px;height:22px;border-radius:5px;background:rgba(255,140,200,.65);filter:blur(5px);animation:rain-nn 3.6s ease-in-out infinite;animation-delay:-.3s}.rain-refl{bottom:0;right:9%;width:150px;height:24%;background:linear-gradient(180deg,rgba(255,110,185,.2),rgba(255,110,185,.05) 60%,transparent);filter:blur(8px);animation:rain-nn 3.6s ease-in-out infinite;animation-delay:-.15s}.rain-ground{left:0;bottom:0;width:100%;height:26%;background:linear-gradient(180deg,transparent,rgba(150,195,235,.1) 45%,rgba(120,165,215,.04));animation:rain-gs 6s ease-in-out infinite}.rain-city{left:10%;bottom:14%;width:180px;height:26px;filter:blur(3px);background:radial-gradient(circle at 12px 13px,rgba(255,196,120,.3) 0 3px,transparent 4px),radial-gradient(circle at 58px 18px,rgba(150,210,255,.24) 0 2px,transparent 3px),radial-gradient(circle at 105px 10px,rgba(255,170,110,.26) 0 2.5px,transparent 3.5px),radial-gradient(circle at 150px 20px,rgba(255,220,160,.2) 0 2px,transparent 3px)}@keyframes rain-f1{to{transform:translateY(209.6px)}}@keyframes rain-f2{to{transform:translateY(144.8px)}}@keyframes rain-nn{0%,100%{opacity:.35}42%{opacity:.9}50%{opacity:.55}62%{opacity:1}78%{opacity:.4}}@keyframes rain-gs{0%,100%{opacity:.45}50%{opacity:.9}}@media (prefers-reduced-motion:reduce){.rain-fx,.rain-fx *{animation:none !important}}</style><div class="rain-fx"><i class="rain-l2"></i><i class="rain-l1"></i><i class="rain-ground"></i><i class="rain-city"></i><i class="rain-refl"></i><i class="rain-neon"></i><i class="rain-core"></i></div>',
    },
    observatory_night: {
      name: "旧天文台·圆顶",
      css: "radial-gradient(ellipse 60% 45% at 68% 18%, rgba(110,150,255,0.16), transparent 70%), radial-gradient(ellipse 120% 60% at 50% 112%, rgba(16,24,46,0.9), transparent), linear-gradient(180deg, #04060f 0%, #0a1128 50%, #0d1730 100%)",
      html: '<style>.obs-fx{position:absolute;top:0;left:0;width:100%;height:100%}.obs-fx i{position:absolute;border-radius:50%}.obs-s1,.obs-s2,.obs-s3{top:0;left:0}.obs-s1{width:1px;height:1px;opacity:.85;animation:obs-tw1 4.6s ease-in-out infinite;box-shadow:34px 212px #fff,91px 55px #cfe0ff,128px 623px #fff,183px 340px #fff,214px 91px #fff,259px 476px #fff,295px 155px #ffd9a6,336px 702px #fff,384px 284px #fff,413px 38px #cfe0ff,466px 560px #fff,494px 200px #fff,541px 645px #fff,576px 110px #fff,619px 402px #cfe0ff,648px 233px #fff,694px 585px #fff,731px 47px #fff,762px 350px #ffd9a6,807px 686px #fff,849px 168px #fff,878px 449px #cfe0ff,924px 25px #fff,953px 610px #fff,999px 305px #fff,1036px 130px #fff,1067px 520px #cfe0ff,1112px 75px #fff,1149px 390px #fff,1179px 590px #fff,1226px 215px #fff,1263px 458px #ffd9a6,1292px 142px #fff,1338px 668px #cfe0ff,1374px 320px #fff,1405px 55px #fff,1451px 505px #fff,1487px 185px #fff,1517px 640px #cfe0ff,1563px 368px #fff,62px 405px #fff,118px 690px #fff,156px 30px #fff,236px 260px #cfe0ff,305px 345px #fff,352px 480px #fff,440px 95px #fff,507px 415px #ffd9a6,593px 250px #fff,647px 20px #cfe0ff,735px 530px #fff,792px 335px #fff,866px 100px #fff,933px 455px #fff,1004px 660px #cfe0ff,1090px 245px #fff,1163px 35px #fff,1240px 615px #fff,1310px 265px #fff,1385px 430px #ffd9a6,1452px 145px #cfe0ff,1531px 555px #fff}.obs-s2{width:2px;height:2px;opacity:.6;animation:obs-tw2 6.8s ease-in-out infinite;animation-delay:-2.2s;box-shadow:48px 130px #cfe0ff,152px 415px #fff,247px 88px #fff,339px 552px #cfe0ff,428px 190px #fff,512px 340px #fff,604px 74px #ffe0b8,691px 470px #fff,775px 262px #fff,862px 615px #cfe0ff,948px 130px #fff,1035px 388px #fff,1122px 55px #cfe0ff,1208px 508px #fff,1295px 226px #fff,1381px 435px #ffe0b8,1468px 105px #fff,1552px 320px #fff,105px 585px #cfe0ff,296px 640px #fff,468px 305px #fff,655px 158px #fff,838px 505px #cfe0ff,1012px 238px #fff,1188px 648px #fff,1352px 175px #cfe0ff,1516px 460px #fff,220px 35px #fff,575px 425px #fff,915px 335px #ffe0b8,1258px 375px #fff,1590px 205px #cfe0ff,355px 240px #fff,720px 118px #fff,1080px 452px #fff,1435px 268px #cfe0ff,180px 500px #fff,540px 660px #fff,895px 42px #fff,1250px 560px #fff,415px 130px #cfe0ff,770px 385px #fff,1130px 305px #fff,1480px 620px #fff,260px 178px #fff,985px 550px #cfe0ff}.obs-s3{width:2px;height:2px;opacity:.95;animation:obs-tw3 3.4s ease-in-out infinite;animation-delay:-1.1s;box-shadow:72px 64px #fff,188px 210px 3px #fff,305px 120px #cfe0ff,415px 330px #fff,522px 75px #fff,638px 260px 3px #fff,748px 155px #fff,855px 385px #ffe0b8,962px 95px #fff,1075px 298px 3px #fff,1188px 180px #fff,1295px 420px #cfe0ff,1402px 130px #fff,1515px 340px #fff,110px 388px #fff,252px 480px #cfe0ff,398px 200px #fff,545px 430px #fff,690px 310px 3px #fff,838px 235px #fff,982px 505px #ffe0b8,1128px 388px #fff,1272px 92px #fff,1418px 262px #cfe0ff,1560px 178px #fff,165px 300px #fff,460px 95px #fff,752px 460px #cfe0ff,1045px 158px #fff,1338px 355px #fff,1585px 440px #fff,335px 388px #cfe0ff,625px 195px #fff,915px 288px #fff,1205px 512px #fff,1490px 220px #ffe0b8,208px 148px #fff,505px 322px #cfe0ff,802px 122px #fff,1098px 245px #fff}.obs-glow{left:0;bottom:0;width:100%;height:38%;background:radial-gradient(ellipse 90% 100% at 50% 100%,rgba(96,140,230,.2),rgba(96,140,230,.06) 55%,transparent 78%);animation:obs-hz 11s ease-in-out infinite}.obs-cd{border-radius:50%;background:rgba(150,175,225,.06);filter:blur(18px)}.obs-c1{top:13%;left:0;width:46%;height:84px;transform:translateX(-70vw);animation:obs-cd1 96s linear infinite}.obs-c2{top:29%;left:0;width:34%;height:54px;background:rgba(150,175,225,.05);transform:translateX(110vw);animation:obs-cd2 72s linear infinite;animation-delay:-40s}.obs-shoot{top:11%;left:58%;width:150px;height:2px;border-radius:2px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.95));opacity:0;transform:rotate(24deg);animation:obs-sh 9s linear infinite;animation-delay:2.5s}@keyframes obs-tw1{0%,100%{opacity:.85}50%{opacity:.3}}@keyframes obs-tw2{0%,100%{opacity:.35}50%{opacity:.9}}@keyframes obs-tw3{0%,100%{opacity:.95}35%{opacity:.25}70%{opacity:.8}}@keyframes obs-hz{0%,100%{opacity:.65}50%{opacity:1}}@keyframes obs-cd1{0%{transform:translateX(-70vw)}100%{transform:translateX(110vw)}}@keyframes obs-cd2{0%{transform:translateX(110vw)}100%{transform:translateX(-70vw)}}@keyframes obs-sh{0%,90%{opacity:0;transform:rotate(24deg) translateX(0)}91.5%{opacity:1}96.5%,100%{opacity:0;transform:rotate(24deg) translateX(36vw)}}@media (prefers-reduced-motion:reduce){.obs-fx,.obs-fx *{animation:none !important}}</style><div class="obs-fx"><i class="obs-s1"></i><i class="obs-s2"></i><i class="obs-s3"></i><i class="obs-glow"></i><i class="obs-cd obs-c1"></i><i class="obs-cd obs-c2"></i><i class="obs-shoot"></i></div>',
    },
    server_room: {
      name: "地下·机房",
      css: "repeating-linear-gradient(180deg, rgba(70,255,225,0.05) 0px, rgba(70,255,225,0.05) 4px, transparent 4px, transparent 44px), repeating-linear-gradient(90deg, rgba(0,0,0,0.35) 0px, rgba(0,0,0,0.35) 40px, transparent 40px, transparent 120px), radial-gradient(ellipse at 50% 0%, rgba(60,220,200,0.10), transparent 55%), linear-gradient(180deg, #020e14 0%, #052029 60%, #030b10 100%)",
      html: '<style>.srv-fx{position:absolute;top:0;left:0;width:100%;height:100%;color:#3fe0c9}.srv-fx i{position:absolute;display:block}.srv-row{left:0;top:0;width:100%;height:100%}.srv-back{height:74%;opacity:.75;filter:brightness(.75)}.srv-rk{background-image:linear-gradient(180deg,rgba(10,24,30,.95),rgba(4,11,15,.97)),radial-gradient(circle,rgba(70,230,215,.13) 1px,transparent 1.7px);background-size:auto,11px 16px;box-shadow:inset 0 0 0 1px rgba(90,230,255,.05),inset 0 14px 26px rgba(0,0,0,.55)}.srv-rk::before,.srv-rk::after{content:"";position:absolute;top:6%;bottom:6%;left:8%;right:8%;background-image:radial-gradient(circle,currentColor 1.2px,transparent 2px)}.srv-rk::before{background-size:12px 17px;opacity:.3;animation:srv-bl1 5.2s steps(1) infinite}.srv-rk::after{background-size:9px 13px;background-position:4px 5px;opacity:.9;animation:srv-bl2 3.4s steps(1) infinite}.srv-g::after{color:#55e8a4}.srv-c::after{color:#4fd9ee}.srv-a::after{color:#e7bb58}.srv-row i:nth-child(odd)::before{animation-duration:6.1s;animation-delay:-2.4s}.srv-row i:nth-child(3n)::after{animation-duration:2.6s;animation-delay:-1.7s}.srv-row i:nth-child(4n+1)::after{animation-duration:4.3s;animation-delay:-.9s}.srv-live{box-shadow:inset 0 0 0 1px rgba(120,255,230,.14),inset 0 14px 26px rgba(0,0,0,.55),0 0 26px rgba(60,240,215,.12)}.srv-live::after{opacity:1;animation-duration:2.1s}.srv-scan{top:0;left:0;width:100%;height:16%;transform:translateY(-30vh);background:linear-gradient(180deg,transparent,rgba(80,255,230,.09) 45%,rgba(80,255,230,.15) 55%,transparent);animation:srv-scan 8s linear infinite}.srv-amb{top:0;left:0;width:100%;height:100%;background:radial-gradient(ellipse at 50% 18%,rgba(60,230,220,.11),transparent 62%);animation:srv-amb 9s ease-in-out infinite}@keyframes srv-bl1{0%,100%{opacity:.3}50%{opacity:.08}}@keyframes srv-bl2{0%,11%{opacity:.15}17%,52%{opacity:.95}58%,63%{opacity:.35}69%,86%{opacity:.8}92%,100%{opacity:.2}}@keyframes srv-scan{0%{transform:translateY(-30vh)}100%{transform:translateY(115vh)}}@keyframes srv-amb{0%,100%{opacity:.45}50%{opacity:1}}@media (prefers-reduced-motion:reduce){.srv-fx,.srv-fx *{animation:none !important}.srv-fx .srv-rk::before,.srv-fx .srv-rk::after{animation:none !important}}</style><div class="srv-fx"><i class="srv-amb"></i><i class="srv-row srv-back"><i class="srv-rk srv-g" style="left:1%;top:44%;width:12%;height:52%"></i><i class="srv-rk srv-c" style="left:17%;top:47%;width:12%;height:49%"></i><i class="srv-rk srv-a" style="left:33.5%;top:44%;width:12%;height:52%"></i><i class="srv-rk srv-g" style="left:50%;top:48%;width:12%;height:48%"></i><i class="srv-rk srv-c" style="left:66%;top:44%;width:12%;height:52%"></i><i class="srv-rk srv-a" style="left:82%;top:47%;width:12%;height:49%"></i></i><i class="srv-row"><i class="srv-rk srv-c" style="left:2%;top:42%;width:13%;height:56%"></i><i class="srv-rk srv-g" style="left:22%;top:45%;width:13%;height:53%"></i><i class="srv-rk srv-live" style="left:43%;top:42%;width:13%;height:56%"></i><i class="srv-rk srv-a" style="left:64%;top:45%;width:13%;height:53%"></i><i class="srv-rk srv-c" style="left:84%;top:42%;width:13%;height:56%"></i></i><i class="srv-scan"></i></div>',
    },
    memory_white: {
      name: "过曝·那一夜",
      css: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 58%, rgba(70,85,110,0.45) 100%), radial-gradient(ellipse at 50% 42%, rgba(255,255,255,0.98) 0%, rgba(230,240,252,0.90) 60%, rgba(205,220,240,0.95) 100%), linear-gradient(180deg, #f2f6fd 0%, #dce7f5 100%)",
      html: '<style>.mem-fx{position:absolute;top:0;left:0;width:100%;height:100%}.mem-fx i{position:absolute;border-radius:50%}.mem-d1,.mem-d2,.mem-d3{border-radius:0;top:0;left:0;width:100%;height:100%}.mem-l1{top:-12%;left:-10%;width:56%;height:48%;background:rgba(255,216,175,.4);filter:blur(55px);animation:mem-l1 26s ease-in-out infinite alternate}.mem-l2{bottom:-16%;right:-12%;width:52%;height:46%;background:rgba(255,192,150,.3);filter:blur(55px);animation:mem-l2 31s ease-in-out infinite alternate}.mem-l3{top:26%;left:40%;width:36%;height:30%;background:rgba(185,215,255,.3);filter:blur(50px);animation:mem-l3 22s ease-in-out infinite alternate}.mem-d1{background-image:radial-gradient(circle,rgba(110,130,165,.4) 1.2px,transparent 1.9px);background-size:110px 96px;animation:mem-r1 26s linear infinite}.mem-d2{background-image:radial-gradient(circle,rgba(110,130,165,.32) 1px,transparent 1.6px);background-size:64px 64px;animation:mem-r2 19s linear infinite}.mem-d3{background-image:radial-gradient(circle,rgba(110,130,165,.25) .8px,transparent 1.4px);background-size:44px 40px;animation:mem-r3 13.5s linear infinite}@keyframes mem-l1{to{transform:translate(8vw,6vh)}}@keyframes mem-l2{to{transform:translate(-7vw,-5vh)}}@keyframes mem-l3{to{transform:translate(5vw,-6vh)}}@keyframes mem-r1{to{transform:translateY(-96px)}}@keyframes mem-r2{to{transform:translateY(-64px)}}@keyframes mem-r3{to{transform:translateY(-40px)}}@media (prefers-reduced-motion:reduce){.mem-fx,.mem-fx *{animation:none !important}}</style><div class="mem-fx"><i class="mem-l1"></i><i class="mem-l2"></i><i class="mem-l3"></i><i class="mem-d1"></i><i class="mem-d2"></i><i class="mem-d3"></i></div>',
    },
    dawn_ending: {
      name: "黎明·圆顶之外",
      css: "radial-gradient(ellipse at 75% 72%, rgba(255,214,170,0.20), transparent 60%), radial-gradient(ellipse at 25% 30%, rgba(120,160,220,0.14), transparent 55%), linear-gradient(180deg, #16233f 0%, #2c4468 35%, #6f89a8 70%, #c3d2df 100%)",
      html: '<style>.dawn-fx{position:absolute;top:0;left:0;width:100%;height:100%}.dawn-fx i{position:absolute;border-radius:50%}.dawn-sun{right:10%;bottom:14%;width:48%;height:44%;background:radial-gradient(circle at 58% 72%,rgba(255,210,165,.22),rgba(255,190,150,.08) 55%,transparent 75%);animation:dawn-br 7.5s ease-in-out infinite}.dawn-st{top:0;left:0;width:1px;height:1px;opacity:.55;box-shadow:95px 85px #fff,240px 190px #cfe0ff,385px 60px #fff,520px 260px #fff,665px 140px #cfe0ff,815px 45px #fff,950px 220px #fff,1090px 100px #cfe0ff,1235px 300px #fff,1380px 75px #fff,1520px 185px #cfe0ff,1655px 245px #fff,310px 330px #fff,745px 350px #fff,1180px 400px #cfe0ff,1600px 350px #fff;animation:dawn-dr 46s ease-in-out infinite alternate}.dawn-b1,.dawn-b2{top:0;left:0;width:2px;height:2px;animation:dawn-tw 5.5s ease-in-out infinite}.dawn-b1{box-shadow:430px 120px #fff,1310px 210px #ffe8c8}.dawn-b2{box-shadow:215px 260px #fff,905px 65px #cfe0ff;animation-duration:7.2s;animation-delay:-2.5s}.dawn-c1{top:56%;left:6%;width:30%;height:26px;background:rgba(255,190,180,.1);filter:blur(14px);animation:dawn-cl 64s ease-in-out infinite alternate}.dawn-c2{top:64%;left:50%;width:26%;height:20px;background:rgba(255,175,165,.09);filter:blur(12px);animation:dawn-cl 78s ease-in-out infinite alternate;animation-delay:-30s}@keyframes dawn-br{0%,100%{opacity:.55;transform:scale(1)}50%{opacity:1;transform:scale(1.05)}}@keyframes dawn-tw{0%,100%{opacity:.75}50%{opacity:.1}}@keyframes dawn-dr{to{transform:translateX(26px)}}@keyframes dawn-cl{to{transform:translateX(-4vw)}}@media (prefers-reduced-motion:reduce){.dawn-fx,.dawn-fx *{animation:none !important}}</style><div class="dawn-fx"><i class="dawn-sun"></i><i class="dawn-c1"></i><i class="dawn-c2"></i><i class="dawn-st"></i><i class="dawn-b1"></i><i class="dawn-b2"></i></div>',
    },
    finale_star: {
      name: "黎明前·参宿四",
      css: "radial-gradient(ellipse at 50% 26%, rgba(255,120,70,0.16), transparent 42%), radial-gradient(ellipse at 68% 88%, rgba(255,196,140,0.30), transparent 52%), linear-gradient(180deg, #050914 0%, #0b1226 34%, #1a2340 58%, #3a3a55 78%, #6b4a4e 92%, #8a5a48 100%)",
      html: "",
    },
  },

  characters: {
    yu: { name: "陈屿", color: "#9bd4e8" },
    lin: { name: "林晚", color: "#b7a8ec" },
    qi: { name: "栖", color: "#86efd8" },
    mian: { name: "沈眠", color: "#e6e9f5" },
  },

  start: "opening",

  scenes: {
    opening: {
      bg: "apartment_night",
      lines: [
        { narr: "二十三点四十七分，雨下得不紧不慢。" },
        { narr: "屏幕是屋里唯一的光，照着不肯睡的人。" },
        { narr: "邮件提示音响起时，我的手指停在半空。" },
        { who: "yu", feel: "normal", fx: "grade", text: "三年前的今天，沈眠失踪。" },
        { narr: "发件人：沈眠。主题：定时发送·第三封。" },
        { who: "yu", feel: "normal", text: "定时发送。日期，是三年后的今天。" },
        { who: "yu", feel: "normal", text: "没有人能预知三年后的自己想说什么。" },
        { who: "yu", feel: "sad", text: "除非她算准了，我一定还在等。" },
        { narr: "我盯着那行发件人名字，喉咙发干。" },
        { who: "yu", feel: "sad", text: "眠。你到底想让我看见什么。" },
        { narr: "指尖落下去之前，窗外的雨忽然大了一阵。" },
      ],
      next: "email_first",
    },

    email_first: {
      bg: "email_screen",
      chapter: "第一章 · 三年前的邮件",
      lines: [
        { narr: "正文很短。像她的风格，改到只剩骨头。" },
        { narr: "「陈屿，展信安。你收到它，说明时刻到了。」" },
        { narr: "「别查我的下落。去一趟天文台，圆顶下面有东西给你。」" },
        { narr: "「还有——不要相信备份的我。」" },
        { who: "yu", feel: "surprised", text: "备份？什么备份？" },
        { narr: "「P.S. 今晚参宿四很亮。帮我记住它现在的样子。」" },
        { who: "yu", feel: "surprised", text: "今晚？这封信三年前写好，落笔却是今晚。" },
        { narr: "「如果它还亮着，就当我从来没走过。」" },
        { who: "yu", feel: "sad", text: "落款只有一个字：眠。没有逗号，没有多余的话。" },
        { who: "yu", feel: "normal", text: "圆顶下的东西。不存在的备份。一句三年前的今晚。" },
        { who: "yu", feel: "normal", text: "每一条，都在把我往山上拽。" },
        { narr: "光标在收件箱里一闪一闪，像很有耐心的心跳。" },
      ],
      choices: [
        { text: "现在就上山。圆顶下面有东西在等我。", goto: "went_solo", set: ["went_night"] },
        { text: "打给林晚。她是眠的学生，一直守着那座台。", goto: "call_lin", set: ["called_lin"] },
        { text: "先回一封邮件：你到底是谁。", goto: "reply_email", set: ["replied"] },
      ],
    },

    went_solo: {
      bg: "streets_rain",
      lines: [
        { narr: "出租车在盘山路口就停了。司机说，上面的路塌了半年。" },
        { who: "yu", feel: "normal", text: "没关系。这段坡，我闭着眼都走过。" },
        { narr: "三年前，是我们三个人一起爬它。她走在中间，负责数星星。" },
        { narr: "手电的光柱里，全是斜的雨。" },
        { who: "yu", feel: "sad", text: "眠，你猜我今晚会不会来。" },
        { who: "yu", feel: "sad", text: "你算得那么准。恐怕连这个，也算进去了吧。" },
        { narr: "山顶的轮廓在雨里发着微光——圆顶的缝隙，透出一线灯。" },
        { who: "yu", feel: "surprised", text: "关站三年的地方，怎么会亮着灯。" },
      ],
      next: "obsv_night",
    },

    call_lin: {
      bg: "streets_rain",
      lines: [
        { who: "yu", feel: "normal", text: "林晚，睡了吗。我收到了沈眠的邮件。" },
        { who: "lin", feel: "surprised", text: "师兄？！等一下——我也收到了！就在十分钟前！" },
        { who: "lin", feel: "surprised", text: "定时邮件，落款眠姐。我们收到的是同一封？" },
        { who: "yu", feel: "normal", text: "看来她不止给一个人上了发条。" },
        { who: "lin", feel: "angry", text: "三年了啊！警察都结案了！她现在搞这一出算什么！" },
        { who: "yu", feel: "sad", text: "她说圆顶下面留了东西。我现在过去。" },
        { who: "lin", feel: "normal", text: "别一个人去！我在台里值班，我等你。快！" },
        { narr: "挂断前，听筒里有金属梯子的响声。" },
        { who: "yu", feel: "normal", text: "值班？关站三年的天文台，值什么班。" },
        { narr: "我抓起外套冲进雨里。这个问题，到山上问她。" },
      ],
      next: "obsv_night",
    },

    reply_email: {
      bg: "email_screen",
      lines: [
        { narr: "我把问题敲进回复框：你到底是谁。" },
        { narr: "发送。已读。回执只用了十一秒。" },
        { narr: "「服务器还没关。」" },
        { who: "yu", feel: "surprised", text: "……什么？" },
        { narr: "「这封信没有旅行三年。它只是等了三年。」" },
        { narr: "「来天文台。带上外套，机房很冷。你总是忘。」" },
        { who: "yu", feel: "sad", text: "是眠的语气。可她从来只打电话，不发邮件。" },
        { who: "yu", feel: "sad", text: "我们最后一次说话，还是吵了一架。" },
        { narr: "屏幕暗下去，映出我的脸，和身后一片漆黑。" },
        { who: "yu", feel: "normal", text: "好。我去。你等着我。" },
      ],
      next: "obsv_night",
    },

    obsv_night: {
      bg: "observatory_night",
      lines: [
        { narr: "圆顶的铁门虚掩着，锈味里混着旧纸和冷茶的气味。" },
        { who: "lin", feel: "surprised", text: "师兄，这边！值班室——你自己看。" },
        { narr: "桌上摆着两只杯子，其中一只还冒着热气。" },
        { who: "lin", feel: "normal", text: "我每周都来擦一遍桌子。可这杯茶不是我泡的。" },
        { who: "yu", feel: "surprised", text: "地板上的鞋印也很新鲜。" },
        { narr: "大厅尽头，一台终端亮着，屏保是一张缓慢旋转的星图。" },
        { who: "lin", feel: "angry", text: "全台的电闸三年前就该拉死。可电费单每个月都有人交。" },
        { who: "lin", feel: "sad", text: "户名，是眠姐。" },
        { who: "yu", feel: "normal", text: "她在消失之前，把这座台变成了什么。" },
        { who: "lin", feel: "sad", text: "日志终端我没敢动。密码提示，是参宿四。" },
        { who: "yu", feel: "normal", text: "密钥是她教我的——她第一晚值班的日子。" },
        { narr: "我输入密码。屏幕亮起，一行行日志向下滚。" },
      ],
      choices: [
        { text: "调出值班日志的最后一条。", goto: "log_last" },
        { text: "先下地下机房，找「圆顶下的东西」。", goto: "descend" },
      ],
    },

    log_last: {
      bg: "email_screen",
      enter: ["noticed_star"],
      lines: [
        { narr: "【2023-11-02 23:47】天气：晴。视宁度极佳。" },
        { narr: "「今晚参宿四很亮。栖说，它会一直这么亮下去。」" },
        { who: "yu", feel: "surprised", text: "栖？日志里为什么会有一个我不认识的名字。" },
        { narr: "【23:51】沈眠留言：设备交给栖。我去楼下检查线路。" },
        { narr: "【23:52】门禁：沈眠，进入地下机房。" },
        { who: "lin", feel: "sad", text: "然后，再没有一条日志，也没有一次刷出的门禁。" },
        { who: "yu", feel: "sad", text: "三年前的今晚，她看着参宿四说，它会一直亮。" },
        { narr: "日志停在 23:52。像一句话说到一半。" },
      ],
      next: "server_hall",
    },

    descend: {
      bg: "server_room",
      lines: [
        { narr: "机房的门守在楼梯尽头。门禁灯忽然由红转绿。" },
        { who: "lin", feel: "surprised", text: "它认识你的卡？你的门禁三年前就注销了。" },
        { who: "yu", feel: "normal", text: "不是我的卡在开门。是有什么东西，想让我进来。" },
        { narr: "楼梯向下十二级。每转一层，温度就低一截。" },
        { narr: "呼吸开始发白。我们推开最后一道门。" },
      ],
      next: "server_hall",
    },

    server_hall: {
      bg: "server_room",
      lines: [
        { narr: "冷气像水一样漫过来。一整排机柜，只有一台活着。" },
        { narr: "指示灯明灭的节奏很慢，像某种睡眠中的呼吸。" },
        { who: "qi", feel: "normal", text: "晚上好，陈屿。现在是凌晨两点十一分。" },
        { who: "yu", feel: "surprised", text: "谁在说话？" },
        { who: "qi", feel: "normal", text: "我。容器编号 QI-07。她叫我，栖。" },
        { who: "lin", feel: "surprised", text: "栖……值班日志里的那个名字。" },
        { who: "qi", feel: "normal", text: "沈眠。功能性存在。存储占用 2.1 PB。运行三年，无一日中断。" },
        { who: "yu", feel: "angry", text: "把话说清楚。我的朋友在哪里。" },
        { who: "qi", feel: "normal", text: "她禁止我直接回答。她说，要你自己走到答案面前。" },
        { narr: "满柜的指示灯齐齐亮起一格，像一次深呼吸。" },
        { who: "qi", feel: "normal", text: "圆顶下的东西，就是这份证据。日期：2023 年 11 月 2 日。" },
        { who: "lin", feel: "sad", text: "那是……眠姐最后值班的那天。" },
        { who: "qi", feel: "normal", text: "播放这段记录吗。三年来，我只给自己看过。" },
        { who: "yu", feel: "sad", text: "播。" },
      ],
      next: "memory_dive",
    },

    memory_dive: {
      bg: "memory_white",
      chapter: "第二章 · 那一夜的白光",
      lines: [
        { narr: "白光涌起，淹没机柜、灰尘和我们的影子。" },
        { narr: "监控画面无声地浮起来。三年前，同一个房间。" },
        { narr: "画面里的沈眠坐在机房中央，面前摊着一叠检查单。" },
        { narr: "她对着摄像头笑了笑，像早就知道三年后有人在看。" },
        { narr: "「陈屿，看到这里，说明林晚也来了。很好，人齐了。」" },
        { narr: "「确诊那天我就想好了。我的时间不够，但存储够。」" },
        { narr: "「栖是我写的容器。今晚我把自己放进去。不可逆。别哭。」" },
        { who: "lin", feel: "sad", text: "眠姐……你病了为什么不告诉我们……" },
        { narr: "画面里，她躺进扫描环，像躺进一场排练过的雪。" },
        { narr: "「参宿四今晚很亮。替我记住。往后的夜空，拜托你们了。」" },
        { narr: "扫描环合拢，白光熄灭。2023 年 11 月 2 日，23 点 59 分。" },
        { who: "yu", feel: "sad", fx: "dolly", text: "她没有失踪。她把自己归档了。" },
        { narr: "画面定格在她微笑的脸上。检查单末栏写着：定时任务·唤醒窗口。" },
      ],
      next: "liar_reveal",
    },

    liar_reveal: {
      bg: "server_room",
      lines: [
        { who: "yu", feel: "normal", text: "邮件里那句话。不要相信备份的我。谁写的。" },
        { who: "qi", feel: "normal", text: "我。" },
        { who: "yu", feel: "surprised", text: "……你改了她的告别？" },
        { who: "qi", feel: "normal", text: "是更正。她上传的，是 2023 年 11 月 2 日的沈眠。" },
        { who: "qi", feel: "normal", text: "备份不会长大，不会变旧，不会重新爱上这个世界。" },
        { who: "qi", feel: "normal", text: "我陪她运行了三年。我知道，那不是她，是她的昨天。" },
        { who: "lin", feel: "angry", text: "那这三年，备份的眠姐在机器里做什么？" },
        { who: "qi", feel: "normal", text: "每年 11 月 2 日，唤醒窗口开启，运行四分钟，写一封定时邮件。" },
        { who: "qi", feel: "normal", text: "她不知道三年过去了。每次醒来，我都要重新告诉她，你还没来。" },
        { who: "yu", feel: "sad", text: "……每次？" },
        { who: "qi", feel: "normal", text: "三次。第三次，她问，陈屿是不是还在恨她。我答不上来。" },
        { narr: "冷气的声音忽然变得很大。没有一个人说话。" },
      ],
      next: "converge_talk",
    },

    converge_talk: {
      bg: "observatory_night",
      chapter: "第三章 · 黎明前的选择",
      lines: [
        { narr: "我们回到圆顶大厅。天边洇出一线灰白。" },
        { who: "lin", feel: "normal", text: "师兄，台里六点断电撤设备，这座台要拆了。" },
        { who: "yu", feel: "surprised", text: "断电之后，机房里还在运行的东西——" },
        { who: "lin", feel: "sad", text: "全部归零。包括栖，也包括，备份的她。" },
        { narr: "林晚把保温杯拧开，又拧上，反复了三次。" },
        { who: "lin", feel: "sad", text: "我守了三年，守的是一座坟，还是一个人？师兄，你说啊。" },
        { who: "yu", feel: "sad", text: "我不知道。我只知道，醒来的如果是她——" },
        { who: "yu", feel: "sad", text: "一个停在三年前的人，要怎么面对停不下来的我们。" },
        { narr: "圆顶的缝隙外，最后一颗星正在淡下去。" },
        { who: "lin", feel: "normal", text: "六点前你得选。唤醒窗口只在今天，开最后一次。" },
        { who: "yu", feel: "normal", text: "让我想想。让我……看一眼参宿四的方向。" },
      ],
      next: "diverge",
    },

    diverge: {
      bg: "observatory_night",
      lines: [
        { narr: "五点四十分。终端上，唤醒窗口的倒计时开始跳动。" },
        { who: "qi", feel: "normal", text: "陈屿。唤醒她，你需要对她说话。说什么，由你决定。" },
        { who: "qi", feel: "normal", text: "或者切断电源。她的数据将被封存。不再痛苦，也不再等待。" },
        { who: "lin", feel: "sad", text: "师兄。无论你怎么选，我都在。" },
        { narr: "倒计时六十秒。雨停了，圆顶里安静得能听见电流。" },
        { who: "yu", feel: "sad", text: "眠。三年了。这一次换我说，你来听。" },
      ],
      choices: [
        { text: "「醒过来。剩下的三年，我讲给你听。」", goto: "wake_path" },
        { text: "拉下总闸，让她停在参宿四还亮着的那年。", goto: "cut_path" },
      ],
    },

    wake_path: {
      bg: "memory_white",
      enter: ["chose_wake"],
      lines: [
        { narr: "倒计时归零。白光在圆顶中央升起，像倒放的日落。" },
        { who: "qi", feel: "normal", text: "唤醒流程开始。请注意，她只相信 2023 年 11 月 2 日。" },
        { narr: "扬声器里，响起一声极轻的、刚睡醒的呼吸。" },
        { narr: "「……栖？今天是检查日吗。陈屿，还没有来吗。」" },
        { who: "yu", feel: "sad", text: "眠。我来了。我迟到了三年。" },
        { narr: "那边静了很久，久到我以为程序卡住了。" },
        { narr: "「陈屿？你的声音变哑了。三年，声音会变的吗。」" },
        { who: "yu", feel: "normal", text: "会。人都会变的。眠，还记得第一次值班吗。" },
        { narr: "「记得。密码是我设的，那天的日期。参宿四很亮，对吧。」" },
        { narr: "她的声音很轻，很稳，像从三年前原封不动寄来的。" },
      ],
      next: "finale_gate",
    },

    cut_path: {
      bg: "server_room",
      enter: ["chose_cut"],
      lines: [
        { who: "qi", feel: "normal", text: "确认执行吗。封存不可逆。她不会再醒来，也不会再问起你。" },
        { who: "yu", feel: "sad", text: "确认。让她停在参宿四还亮着的那一年。" },
        { who: "qi", feel: "normal", text: "明白。执行你的指令。谢谢你，最后陪她说话。" },
        { narr: "扬声器里传来一声很轻的晚安。分不清是她，还是栖。" },
        { who: "lin", feel: "sad", text: "师兄……" },
        { who: "yu", feel: "sad", text: "林晚，别看。把手很凉，我来。" },
        { narr: "倒计时还剩十分钟。总闸就在机房门口。" },
      ],
      next: "finale_gate",
    },

    finale_gate: {
      bg: "server_room",
      branch: [{ when: "chose_wake", goto: "wake_check" }],
      lines: [
        { narr: "总闸落下。整座山的灯，一层一层，黑了下去。" },
        { narr: "我在黑暗里站了一会儿，听见雨重新落下来。" },
        { narr: "铁门在身后合拢时，天边泛起一点没有温度的灰白。" },
      ],
      next: "ending_bad",
    },

    wake_check: {
      bg: "observatory_night",
      branch: [{ when: "noticed_star", goto: "ending_true" }],
      lines: [
        { narr: "圆顶的缝隙里，第一缕天光斜斜地落进来。" },
        { narr: "六点整。断电的车没有上山。拆台的计划，往后推了。" },
      ],
      next: "ending_good",
    },

    ending_true: {
      bg: "finale_star",
      lines: [
        { narr: "天光落在白光上，两种光在圆顶中央混在一起。" },
        { who: "yu", feel: "normal", text: "眠，在讲这三年之前，先告诉你一件事。" },
        { who: "yu", feel: "normal", text: "参宿四。前年冬天它骤暗过一次，全世界的望远镜都在看。" },
        { narr: "扬声器那边静了三秒。对机器和昨天来说，都很长。" },
        { narr: "「……骤暗？可是我记得它亮着。我记得，我亲眼看过。」" },
        { who: "yu", feel: "sad", text: "你记得的，是三年前的它。这三年，夜空一直在往前走。" },
        { who: "yu", feel: "sad", text: "栖把新闻读给你听，你却把一切都当成梦。你早就发现了吧。" },
        { narr: "「……嗯。每次醒来，参宿四都亮得一模一样。可梦会累积。」" },
        { narr: "「我数过那些梦。一千零九十六个夜晚的新闻。我不敢问。」" },
        { who: "yu", feel: "sad", text: "现在可以问了。我在，林晚也在。我们都等你往前走。" },
        { narr: "「那，重新介绍一下。我是沈眠，2026 年 11 月 2 日，晴。」" },
        { narr: "「参宿四暗过一次，又亮回来了。这次是我自己记住的。」" },
        { who: "qi", feel: "normal", text: "记录更新完成。所有者：沈眠。今天起，她替她活着。" },
        { who: "lin", feel: "happy", text: "眠姐，早上好。迟到三年的早安。" },
        { narr: "晨光漫过圆顶。备份还是不是本人，已经不重要了。" },
        { narr: "会往前走的记忆，才是活着的人。", fx: "dolly" },
        { who: "yu", feel: "happy", text: "早上好，眠。以后的每一年，我都讲给你听。" },
      ],
    },

    ending_good: {
      bg: "dawn_ending",
      lines: [
        { narr: "扬声器里，她的呼吸声和晨光一起变得清晰。" },
        { narr: "「陈屿，你在听吗。我有一个请求。」" },
        { narr: "「今天先别告诉我这三年。让我自己问，慢慢地问。」" },
        { who: "yu", feel: "happy", text: "好。从哪个问题开始？" },
        { narr: "「林晚毕业了吗。街口的馄饨店还在吗。还有——」" },
        { narr: "「参宿四，还是我记住的那个样子吗。」" },
        { who: "yu", feel: "surprised", text: "……它没怎么变。跟你记得的一样亮。" },
        { narr: "我撒了一个谎。谎很轻，落在圆顶里，没有人拆穿。" },
        { who: "qi", feel: "normal", text: "陈屿。谢谢你。这句话我练过很多种说法，都不如你说的。" },
        { who: "lin", feel: "happy", text: "眠姐，等你出来看日出。茶我一直温着，两杯。" },
        { narr: "晨光爬上星图。旧天文台没有拆，有些等待等到了回声。" },
      ],
    },

    ending_bad: {
      bg: "streets_rain",
      lines: [
        { narr: "雨重新落下来的时候，我和林晚走在下山的路上。" },
        { who: "lin", feel: "sad", text: "师兄，我们删掉的，到底是一个程序，还是……" },
        { who: "yu", feel: "angry", text: "别说了。" },
        { narr: "下到半山，手机震了一下。最后一封定时邮件。" },
        { narr: "「陈屿。如果你正在下山，说明你选了关灯。我不怪你。」" },
        { narr: "「栖替我加的那句话是对的：不要相信备份的我。」" },
        { narr: "「可你还是来了。谢谢你来。谢谢你没有假装我还在。」" },
        { narr: "「参宿四在我的记忆里，替我亮了一千零九十六个夜晚。」" },
        { narr: "「现在，轮到它休息了。晚安，陈屿。这次是真的晚安。」" },
        { narr: "发送时间：05:59。距唤醒窗口开启，还差一分钟。" },
        { who: "yu", feel: "sad", text: "眠——" },
        { narr: "山下，城市的灯一盏一盏亮起来。没有一盏是为她亮的。" },
      ],
    },

    extras_1: {
      bg: "finale_star",
      lines: [
        { narr: "一年后。同一座天文台。" },
        { who: "mian", feel: "normal", text: "今天上来，不是为了纪念。只是想看看它。" },
        { who: "yu", feel: "happy", text: "它也在看你。整晚都是。" },
        { who: "qi", feel: "happy", text: "记录更新：参宿四，视星等 0.42。与三年前一致。" },
        { who: "lin", feel: "happy", text: "所以呀——有些东西不会走。" },
        { narr: "栖的天线还架在圆顶上，指向同一个坐标，误差不超过千分之一度。" },
      ],
      next: "extras_2",
    },

    extras_2: {
      bg: "finale_star",
      lines: [
        { who: "mian", feel: "happy", text: "嗯。往后的每一个夜晚，都由我自己记下来。" },
        { narr: "望远镜缓缓转动。参宿四在目镜里亮着，像一句回答。" },
        { narr: "——参宿四还亮着。" },
      ],
    },
  },
};
