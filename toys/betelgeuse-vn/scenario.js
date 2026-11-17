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
      grade: "warm",
      css: "radial-gradient(ellipse at 78% 30%, rgba(140,180,230,0.22), transparent 55%), radial-gradient(ellipse at 18% 85%, rgba(70,90,130,0.14), transparent 60%), linear-gradient(165deg, #06070d 0%, #0b0f1c 55%, #101627 100%)",
      html: '<style>.apt-fx{position:absolute;top:0;left:0;width:100%;height:100%}.apt-fx i{position:absolute}.apt-glow{top:12%;right:4%;width:46%;height:46%;background:radial-gradient(ellipse at 62% 42%,rgba(140,185,235,.15),transparent 65%);animation:apt-gl 6.5s ease-in-out infinite}.apt-dust{top:0;left:0;width:100%;height:100%;background-image:radial-gradient(circle,rgba(150,185,225,.13) 1px,transparent 1.6px);background-size:96px 72px;animation:apt-rs 30s linear infinite}.apt-dp{width:2px;border-radius:2px;background:linear-gradient(180deg,transparent,rgba(175,205,240,.3) 35%,rgba(175,205,240,.1) 75%,transparent);opacity:.4;transform:translateY(6vh)}.apt-d1{top:8%;right:8%;height:58px;animation:apt-dp 12s linear infinite;animation-delay:-4s}.apt-d2{top:14%;right:16%;height:44px;animation:apt-dp 15.5s linear infinite;animation-delay:-9s}.apt-d3{top:5%;right:23%;height:66px;animation:apt-dp 17s linear infinite;animation-delay:-13s}.apt-d4{top:20%;right:12%;height:50px;animation:apt-dp 13.5s linear infinite;animation-delay:-1.5s}.apt-d5{top:11%;right:27%;height:40px;animation:apt-dp 16s linear infinite;animation-delay:-7s}.apt-flash{top:0;left:0;width:100%;height:100%;background:linear-gradient(165deg,rgba(190,215,255,.5),rgba(140,170,220,.2) 60%,transparent);opacity:0;animation:apt-fl 13.5s linear infinite}@keyframes apt-gl{0%,100%{opacity:.5}18%{opacity:.72}37%{opacity:.55}56%{opacity:.9}73%{opacity:.6}86%{opacity:.78}}@keyframes apt-dp{0%{opacity:0;transform:translateY(-8vh)}10%{opacity:.55}82%{opacity:.5}100%{opacity:0;transform:translateY(58vh)}}@keyframes apt-fl{0%,91%{opacity:0}92%{opacity:.09}93.5%{opacity:.02}95%{opacity:.06}97%,100%{opacity:0}}@keyframes apt-rs{to{transform:translateY(-72px)}}@media (prefers-reduced-motion:reduce){.apt-fx,.apt-fx *{animation:none !important}}</style><div class="apt-fx"><i class="apt-glow"></i><i class="apt-dust"></i><i class="apt-dp apt-d1"></i><i class="apt-dp apt-d2"></i><i class="apt-dp apt-d3"></i><i class="apt-dp apt-d4"></i><i class="apt-dp apt-d5"></i><i class="apt-flash"></i></div>',
      props: [
        // crt + mug dropped: the AI-painted background already has a monitor
        // and a cup on the desk — duplicates read as clutter. calendar/keys
        // are dimmed and repositioned to sit in the night grade (#prop-integration)
        {
          id: "calendar",
          left: "21%",
          bottom: "31%",
          width: "9vw",
          opacity: 0.85,
          filter: "brightness(0.5) saturate(0.55) contrast(0.92)",
        },
        {
          id: "keys",
          left: "55%",
          bottom: "6%",
          width: "6.5vw",
          opacity: 0.95,
          filter: "brightness(0.72) saturate(0.75)",
        },
      ],
    },
    email_screen: {
      name: "屏幕·未读邮件",
      grade: "cold",
      css: "repeating-linear-gradient(180deg, rgba(150,195,255,0.09) 0px, rgba(150,195,255,0.09) 2px, transparent 2px, transparent 30px), radial-gradient(ellipse at 50% 38%, rgba(90,140,215,0.20), transparent 62%), linear-gradient(180deg, #080d16 0%, #0e1626 60%, #0a101c 100%)",
      html: '<style>.mail-fx{position:absolute;top:0;left:0;width:100%;height:100%}.mail-fx i{position:absolute}.mail-glow{top:26%;left:0;width:100%;height:44%;background:radial-gradient(ellipse at 50% 50%,rgba(90,140,220,.07),transparent 70%)}.mail-scan{top:0;left:0;width:100%;height:100%;background:repeating-linear-gradient(180deg,rgba(160,200,255,.045) 0 1px,transparent 1px 3px)}.mail-panel{left:10%;top:16%;width:64%;height:9%;border:1px solid rgba(150,195,255,.1);border-radius:6px;background:rgba(120,170,240,.03)}.mail-rows{left:12%;top:31%;width:60%;height:34%;border-radius:4px;background:repeating-linear-gradient(180deg,rgba(150,195,255,.05) 0 2px,transparent 2px 26px)}.mail-cursor{left:17%;top:60%;width:11px;height:20px;border-radius:1px;background:rgba(170,210,255,.85);box-shadow:0 0 8px rgba(150,200,255,.5);opacity:.9;animation:mail-cur 1.15s steps(1) infinite}.mail-badge{left:72.5%;top:17.2%;width:14px;height:14px;border-radius:50%;background:rgba(255,120,120,.85);box-shadow:0 0 10px 2px rgba(255,110,110,.45);animation:mail-bdg 2.8s ease-in-out infinite}@keyframes mail-cur{0%,49%{opacity:.9}50%,100%{opacity:0}}@keyframes mail-bdg{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.18)}}@media (prefers-reduced-motion:reduce){.mail-fx,.mail-fx *{animation:none !important}}</style><div class="mail-fx"><i class="mail-glow"></i><i class="mail-scan"></i><i class="mail-panel"></i><i class="mail-rows"></i><i class="mail-cursor"></i><i class="mail-badge"></i></div>',
    },
    streets_rain: {
      name: "雨夜·环山公路",
      grade: "night",
      css: "repeating-linear-gradient(102deg, rgba(170,200,225,0.05) 0px, rgba(170,200,225,0.05) 1px, transparent 1px, transparent 7px), radial-gradient(ellipse at 30% 85%, rgba(90,130,170,0.16), transparent 60%), linear-gradient(180deg, #070a10 0%, #0d141d 55%, #131c26 100%)",
      html: '<style>.rain-fx{position:absolute;top:0;left:0;width:100%;height:100%}.rain-fx i{position:absolute}.rain-l1{top:-220px;left:0;width:100%;height:calc(100% + 440px);background:repeating-linear-gradient(97.125deg,rgba(185,212,240,.16) 0 1px,transparent 1px 11px,rgba(185,212,240,.1) 11px 12px,transparent 12px 26px);animation:rain-f1 .85s linear infinite}.rain-l2{top:-160px;left:0;width:100%;height:calc(100% + 320px);background:repeating-linear-gradient(96.34deg,rgba(185,212,240,.075) 0 1px,transparent 1px 15px,transparent 15px 16px);animation:rain-f2 1.5s linear infinite}.rain-neon{top:23%;left:14%;width:150px;height:42px;border-radius:8px;background:rgba(255,90,170,.5);filter:blur(16px);animation:rain-nn 3.6s ease-in-out infinite}.rain-core{top:calc(23% + 7px);left:calc(14% + 20px);width:104px;height:26px;border-radius:5px;background:rgba(255,140,200,.65);filter:blur(5px);animation:rain-nn 3.6s ease-in-out infinite;animation-delay:-.3s}.rain-refl{bottom:0;left:11%;width:200px;height:26%;background:linear-gradient(180deg,rgba(255,110,185,.2),rgba(255,110,185,.05) 60%,transparent);filter:blur(8px);animation:rain-nn 3.6s ease-in-out infinite;animation-delay:-.15s}.rain-ground{left:0;bottom:0;width:100%;height:26%;background:linear-gradient(180deg,transparent,rgba(150,195,235,.1) 45%,rgba(120,165,215,.04));animation:rain-gs 6s ease-in-out infinite}.rain-city{left:10%;bottom:14%;width:180px;height:26px;filter:blur(3px);background:radial-gradient(circle at 12px 13px,rgba(255,196,120,.3) 0 3px,transparent 4px),radial-gradient(circle at 58px 18px,rgba(150,210,255,.24) 0 2px,transparent 3px),radial-gradient(circle at 105px 10px,rgba(255,170,110,.26) 0 2.5px,transparent 3.5px),radial-gradient(circle at 150px 20px,rgba(255,220,160,.2) 0 2px,transparent 3px)}@keyframes rain-f1{to{transform:translateY(209.6px)}}@keyframes rain-f2{to{transform:translateY(144.8px)}}@keyframes rain-nn{0%,100%{opacity:.35}42%{opacity:.9}50%{opacity:.55}62%{opacity:1}78%{opacity:.4}}@keyframes rain-gs{0%,100%{opacity:.45}50%{opacity:.9}}@media (prefers-reduced-motion:reduce){.rain-fx,.rain-fx *{animation:none !important}}</style><div class="rain-fx"><i class="rain-l2"></i><i class="rain-l1"></i><i class="rain-ground"></i><i class="rain-city"></i><i class="rain-refl"></i><i class="rain-neon"></i><i class="rain-core"></i></div>',
      props: [
        // busstop dropped: the AI-painted background already has its own bus
        // stop shelter on the left — a second one read as a duplicate
        { id: "umbrella", left: "26%", bottom: "7%", width: "17vw" },
      ],
    },
    observatory_night: {
      name: "旧天文台·圆顶",
      grade: "dusk",
      css: "radial-gradient(ellipse 60% 45% at 68% 18%, rgba(110,150,255,0.16), transparent 70%), radial-gradient(ellipse 120% 60% at 50% 112%, rgba(16,24,46,0.9), transparent), linear-gradient(180deg, #04060f 0%, #0a1128 50%, #0d1730 100%)",
      html: '<style>.obs-fx{position:absolute;top:0;left:0;width:100%;height:100%}.obs-fx i{position:absolute;border-radius:50%}.obs-s1,.obs-s2,.obs-s3{top:0;left:0}.obs-s1{width:1px;height:1px;opacity:.85;animation:obs-tw1 4.6s ease-in-out infinite;box-shadow:34px 212px #fff,91px 55px #cfe0ff,128px 623px #fff,183px 340px #fff,214px 91px #fff,259px 476px #fff,295px 155px #ffd9a6,336px 702px #fff,384px 284px #fff,413px 38px #cfe0ff,466px 560px #fff,494px 200px #fff,541px 645px #fff,576px 110px #fff,619px 402px #cfe0ff,648px 233px #fff,694px 585px #fff,731px 47px #fff,762px 350px #ffd9a6,807px 686px #fff,849px 168px #fff,878px 449px #cfe0ff,924px 25px #fff,953px 610px #fff,999px 305px #fff,1036px 130px #fff,1067px 520px #cfe0ff,1112px 75px #fff,1149px 390px #fff,1179px 590px #fff,1226px 215px #fff,1263px 458px #ffd9a6,1292px 142px #fff,1338px 668px #cfe0ff,1374px 320px #fff,1405px 55px #fff,1451px 505px #fff,1487px 185px #fff,1517px 640px #cfe0ff,1563px 368px #fff,62px 405px #fff,118px 690px #fff,156px 30px #fff,236px 260px #cfe0ff,305px 345px #fff,352px 480px #fff,440px 95px #fff,507px 415px #ffd9a6,593px 250px #fff,647px 20px #cfe0ff,735px 530px #fff,792px 335px #fff,866px 100px #fff,933px 455px #fff,1004px 660px #cfe0ff,1090px 245px #fff,1163px 35px #fff,1240px 615px #fff,1310px 265px #fff,1385px 430px #ffd9a6,1452px 145px #cfe0ff,1531px 555px #fff}.obs-s2{width:2px;height:2px;opacity:.6;animation:obs-tw2 6.8s ease-in-out infinite;animation-delay:-2.2s;box-shadow:48px 130px #cfe0ff,152px 415px #fff,247px 88px #fff,339px 552px #cfe0ff,428px 190px #fff,512px 340px #fff,604px 74px #ffe0b8,691px 470px #fff,775px 262px #fff,862px 615px #cfe0ff,948px 130px #fff,1035px 388px #fff,1122px 55px #cfe0ff,1208px 508px #fff,1295px 226px #fff,1381px 435px #ffe0b8,1468px 105px #fff,1552px 320px #fff,105px 585px #cfe0ff,296px 640px #fff,468px 305px #fff,655px 158px #fff,838px 505px #cfe0ff,1012px 238px #fff,1188px 648px #fff,1352px 175px #cfe0ff,1516px 460px #fff,220px 35px #fff,575px 425px #fff,915px 335px #ffe0b8,1258px 375px #fff,1590px 205px #cfe0ff,355px 240px #fff,720px 118px #fff,1080px 452px #fff,1435px 268px #cfe0ff,180px 500px #fff,540px 660px #fff,895px 42px #fff,1250px 560px #fff,415px 130px #cfe0ff,770px 385px #fff,1130px 305px #fff,1480px 620px #fff,260px 178px #fff,985px 550px #cfe0ff}.obs-s3{width:2px;height:2px;opacity:.95;animation:obs-tw3 3.4s ease-in-out infinite;animation-delay:-1.1s;box-shadow:72px 64px #fff,188px 210px 3px #fff,305px 120px #cfe0ff,415px 330px #fff,522px 75px #fff,638px 260px 3px #fff,748px 155px #fff,855px 385px #ffe0b8,962px 95px #fff,1075px 298px 3px #fff,1188px 180px #fff,1295px 420px #cfe0ff,1402px 130px #fff,1515px 340px #fff,110px 388px #fff,252px 480px #cfe0ff,398px 200px #fff,545px 430px #fff,690px 310px 3px #fff,838px 235px #fff,982px 505px #ffe0b8,1128px 388px #fff,1272px 92px #fff,1418px 262px #cfe0ff,1560px 178px #fff,165px 300px #fff,460px 95px #fff,752px 460px #cfe0ff,1045px 158px #fff,1338px 355px #fff,1585px 440px #fff,335px 388px #cfe0ff,625px 195px #fff,915px 288px #fff,1205px 512px #fff,1490px 220px #ffe0b8,208px 148px #fff,505px 322px #cfe0ff,802px 122px #fff,1098px 245px #fff}.obs-glow{left:0;bottom:0;width:100%;height:38%;background:radial-gradient(ellipse 90% 100% at 50% 100%,rgba(96,140,230,.2),rgba(96,140,230,.06) 55%,transparent 78%);animation:obs-hz 11s ease-in-out infinite}.obs-cd{border-radius:50%;background:rgba(150,175,225,.06);filter:blur(18px)}.obs-c1{top:13%;left:0;width:46%;height:84px;transform:translateX(-70vw);animation:obs-cd1 96s linear infinite}.obs-c2{top:29%;left:0;width:34%;height:54px;background:rgba(150,175,225,.05);transform:translateX(110vw);animation:obs-cd2 72s linear infinite;animation-delay:-40s}.obs-shoot{top:11%;left:58%;width:150px;height:2px;border-radius:2px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.95));opacity:0;transform:rotate(24deg);animation:obs-sh 9s linear infinite;animation-delay:2.5s}@keyframes obs-tw1{0%,100%{opacity:.85}50%{opacity:.3}}@keyframes obs-tw2{0%,100%{opacity:.35}50%{opacity:.9}}@keyframes obs-tw3{0%,100%{opacity:.95}35%{opacity:.25}70%{opacity:.8}}@keyframes obs-hz{0%,100%{opacity:.65}50%{opacity:1}}@keyframes obs-cd1{0%{transform:translateX(-70vw)}100%{transform:translateX(110vw)}}@keyframes obs-cd2{0%{transform:translateX(110vw)}100%{transform:translateX(-70vw)}}@keyframes obs-sh{0%,90%{opacity:0;transform:rotate(24deg) translateX(0)}91.5%{opacity:1}96.5%,100%{opacity:0;transform:rotate(24deg) translateX(36vw)}}@media (prefers-reduced-motion:reduce){.obs-fx,.obs-fx *{animation:none !important}}</style><div class="obs-fx"><i class="obs-s1"></i><i class="obs-s2"></i><i class="obs-s3"></i><i class="obs-glow"></i><i class="obs-cd obs-c1"></i><i class="obs-cd obs-c2"></i><i class="obs-shoot"></i></div>',
      // telescope dropped: the AI-painted dome background already centers on
      // its own instrument — a second one read as a duplicate
      props: [],
    },
    server_room: {
      name: "地下·机房",
      grade: "night",
      css: "repeating-linear-gradient(180deg, rgba(70,255,225,0.05) 0px, rgba(70,255,225,0.05) 4px, transparent 4px, transparent 44px), repeating-linear-gradient(90deg, rgba(0,0,0,0.35) 0px, rgba(0,0,0,0.35) 40px, transparent 40px, transparent 120px), radial-gradient(ellipse at 50% 0%, rgba(60,220,200,0.10), transparent 55%), linear-gradient(180deg, #020e14 0%, #052029 60%, #030b10 100%)",
      props: [
        {
          id: "badge",
          left: "27%",
          bottom: "38%",
          width: "7vw",
          opacity: 0.85,
          filter: "brightness(0.65) saturate(0.6)",
          transform: "rotate(2deg)",
        },
        {
          id: "sticky",
          left: "69%",
          bottom: "52%",
          width: "8vw",
          opacity: 0.85,
          filter: "brightness(0.72) saturate(0.65)",
          transform: "rotate(-3deg)",
        },
      ],
      html: '<style>.srv-fx{position:absolute;top:0;left:0;width:100%;height:100%;color:#3fe0c9}.srv-fx i{position:absolute;display:block}.srv-row{left:0;top:0;width:100%;height:100%}.srv-back{height:74%;opacity:.75;filter:brightness(.75)}.srv-rk{background-image:linear-gradient(180deg,rgba(10,24,30,.95),rgba(4,11,15,.97)),radial-gradient(circle,rgba(70,230,215,.13) 1px,transparent 1.7px);background-size:auto,11px 16px;box-shadow:inset 0 0 0 1px rgba(90,230,255,.05),inset 0 14px 26px rgba(0,0,0,.55)}.srv-rk::before,.srv-rk::after{content:"";position:absolute;top:6%;bottom:6%;left:8%;right:8%;background-image:radial-gradient(circle,currentColor 1.2px,transparent 2px)}.srv-rk::before{background-size:12px 17px;opacity:.3;animation:srv-bl1 5.2s steps(1) infinite}.srv-rk::after{background-size:9px 13px;background-position:4px 5px;opacity:.9;animation:srv-bl2 3.4s steps(1) infinite}.srv-g::after{color:#55e8a4}.srv-c::after{color:#4fd9ee}.srv-a::after{color:#e7bb58}.srv-row i:nth-child(odd)::before{animation-duration:6.1s;animation-delay:-2.4s}.srv-row i:nth-child(3n)::after{animation-duration:2.6s;animation-delay:-1.7s}.srv-row i:nth-child(4n+1)::after{animation-duration:4.3s;animation-delay:-.9s}.srv-live{box-shadow:inset 0 0 0 1px rgba(120,255,230,.14),inset 0 14px 26px rgba(0,0,0,.55),0 0 26px rgba(60,240,215,.12)}.srv-live::after{opacity:1;animation-duration:2.1s}.srv-scan{top:0;left:0;width:100%;height:16%;transform:translateY(-30vh);background:linear-gradient(180deg,transparent,rgba(80,255,230,.09) 45%,rgba(80,255,230,.15) 55%,transparent);animation:srv-scan 8s linear infinite}.srv-amb{top:0;left:0;width:100%;height:100%;background:radial-gradient(ellipse at 50% 18%,rgba(60,230,220,.11),transparent 62%);animation:srv-amb 9s ease-in-out infinite}@keyframes srv-bl1{0%,100%{opacity:.3}50%{opacity:.08}}@keyframes srv-bl2{0%,11%{opacity:.15}17%,52%{opacity:.95}58%,63%{opacity:.35}69%,86%{opacity:.8}92%,100%{opacity:.2}}@keyframes srv-scan{0%{transform:translateY(-30vh)}100%{transform:translateY(115vh)}}@keyframes srv-amb{0%,100%{opacity:.45}50%{opacity:1}}@media (prefers-reduced-motion:reduce){.srv-fx,.srv-fx *{animation:none !important}.srv-fx .srv-rk::before,.srv-fx .srv-rk::after{animation:none !important}}</style><div class="srv-fx"><i class="srv-amb"></i><i class="srv-row srv-back"><i class="srv-rk srv-g" style="left:1%;top:44%;width:12%;height:52%"></i><i class="srv-rk srv-c" style="left:17%;top:47%;width:12%;height:49%"></i><i class="srv-rk srv-a" style="left:33.5%;top:44%;width:12%;height:52%"></i><i class="srv-rk srv-g" style="left:50%;top:48%;width:12%;height:48%"></i><i class="srv-rk srv-c" style="left:66%;top:44%;width:12%;height:52%"></i><i class="srv-rk srv-a" style="left:82%;top:47%;width:12%;height:49%"></i></i><i class="srv-row"><i class="srv-rk srv-c" style="left:2%;top:42%;width:13%;height:56%"></i><i class="srv-rk srv-g" style="left:22%;top:45%;width:13%;height:53%"></i><i class="srv-rk srv-live" style="left:43%;top:42%;width:13%;height:56%"></i><i class="srv-rk srv-a" style="left:64%;top:45%;width:13%;height:53%"></i><i class="srv-rk srv-c" style="left:84%;top:42%;width:13%;height:56%"></i></i><i class="srv-scan"></i></div>',
    },
    memory_white: {
      name: "过曝·那一夜",
      grade: "sepia",
      css: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 58%, rgba(70,85,110,0.45) 100%), radial-gradient(ellipse at 50% 42%, rgba(255,255,255,0.98) 0%, rgba(230,240,252,0.90) 60%, rgba(205,220,240,0.95) 100%), linear-gradient(180deg, #f2f6fd 0%, #dce7f5 100%)",
      html: '<style>.mem-fx{position:absolute;top:0;left:0;width:100%;height:100%}.mem-fx i{position:absolute;border-radius:50%}.mem-d1,.mem-d2,.mem-d3{border-radius:0;top:0;left:0;width:100%;height:100%}.mem-l1{top:-12%;left:-10%;width:56%;height:48%;background:rgba(255,216,175,.4);filter:blur(55px);animation:mem-l1 26s ease-in-out infinite alternate}.mem-l2{bottom:-16%;right:-12%;width:52%;height:46%;background:rgba(255,192,150,.3);filter:blur(55px);animation:mem-l2 31s ease-in-out infinite alternate}.mem-l3{top:26%;left:40%;width:36%;height:30%;background:rgba(185,215,255,.3);filter:blur(50px);animation:mem-l3 22s ease-in-out infinite alternate}.mem-d1{background-image:radial-gradient(circle,rgba(110,130,165,.4) 1.2px,transparent 1.9px);background-size:110px 96px;animation:mem-r1 26s linear infinite}.mem-d2{background-image:radial-gradient(circle,rgba(110,130,165,.32) 1px,transparent 1.6px);background-size:64px 64px;animation:mem-r2 19s linear infinite}.mem-d3{background-image:radial-gradient(circle,rgba(110,130,165,.25) .8px,transparent 1.4px);background-size:44px 40px;animation:mem-r3 13.5s linear infinite}@keyframes mem-l1{to{transform:translate(8vw,6vh)}}@keyframes mem-l2{to{transform:translate(-7vw,-5vh)}}@keyframes mem-l3{to{transform:translate(5vw,-6vh)}}@keyframes mem-r1{to{transform:translateY(-96px)}}@keyframes mem-r2{to{transform:translateY(-64px)}}@keyframes mem-r3{to{transform:translateY(-40px)}}@media (prefers-reduced-motion:reduce){.mem-fx,.mem-fx *{animation:none !important}}</style><div class="mem-fx"><i class="mem-l1"></i><i class="mem-l2"></i><i class="mem-l3"></i><i class="mem-d1"></i><i class="mem-d2"></i><i class="mem-d3"></i></div>',
    },
    dawn_ending: {
      name: "黎明·圆顶之外",
      grade: "warm",
      css: "radial-gradient(ellipse at 75% 72%, rgba(255,214,170,0.20), transparent 60%), radial-gradient(ellipse at 25% 30%, rgba(120,160,220,0.14), transparent 55%), linear-gradient(180deg, #16233f 0%, #2c4468 35%, #6f89a8 70%, #c3d2df 100%)",
      html: '<style>.dawn-fx{position:absolute;top:0;left:0;width:100%;height:100%}.dawn-fx i{position:absolute;border-radius:50%}.dawn-sun{right:10%;bottom:14%;width:48%;height:44%;background:radial-gradient(circle at 58% 72%,rgba(255,210,165,.22),rgba(255,190,150,.08) 55%,transparent 75%);animation:dawn-br 7.5s ease-in-out infinite}.dawn-st{top:0;left:0;width:1px;height:1px;opacity:.55;box-shadow:95px 85px #fff,240px 190px #cfe0ff,385px 60px #fff,520px 260px #fff,665px 140px #cfe0ff,815px 45px #fff,950px 220px #fff,1090px 100px #cfe0ff,1235px 300px #fff,1380px 75px #fff,1520px 185px #cfe0ff,1655px 245px #fff,310px 330px #fff,745px 350px #fff,1180px 400px #cfe0ff,1600px 350px #fff;animation:dawn-dr 46s ease-in-out infinite alternate}.dawn-b1,.dawn-b2{top:0;left:0;width:2px;height:2px;animation:dawn-tw 5.5s ease-in-out infinite}.dawn-b1{box-shadow:430px 120px #fff,1310px 210px #ffe8c8}.dawn-b2{box-shadow:215px 260px #fff,905px 65px #cfe0ff;animation-duration:7.2s;animation-delay:-2.5s}.dawn-c1{top:56%;left:6%;width:30%;height:26px;background:rgba(255,190,180,.1);filter:blur(14px);animation:dawn-cl 64s ease-in-out infinite alternate}.dawn-c2{top:64%;left:50%;width:26%;height:20px;background:rgba(255,175,165,.09);filter:blur(12px);animation:dawn-cl 78s ease-in-out infinite alternate;animation-delay:-30s}@keyframes dawn-br{0%,100%{opacity:.55;transform:scale(1)}50%{opacity:1;transform:scale(1.05)}}@keyframes dawn-tw{0%,100%{opacity:.75}50%{opacity:.1}}@keyframes dawn-dr{to{transform:translateX(26px)}}@keyframes dawn-cl{to{transform:translateX(-4vw)}}@media (prefers-reduced-motion:reduce){.dawn-fx,.dawn-fx *{animation:none !important}}</style><div class="dawn-fx"><i class="dawn-sun"></i><i class="dawn-c1"></i><i class="dawn-c2"></i><i class="dawn-st"></i><i class="dawn-b1"></i><i class="dawn-b2"></i></div>',
    },
    finale_star: {
      name: "黎明前·参宿四",
      grade: "ember",
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
      bg: "apartment_night__opening",
      lines: [
        { narr: "二十三点四十七分，雨下得不紧不慢。" },
        { narr: "屏幕是屋里唯一的光，照着不肯睡的人。" },
        { narr: "邮件提示音响起时，我的手指停在半空。", se: "sfx_email" },
        {
          who: "yu",
          feel: "normal",
          fx: "grade",
          text: "三年前的今天，沈眠失踪。",
        },
        { narr: "发件人：沈眠。主题：定时发送·第三封。" },
        { who: "yu", feel: "normal", text: "定时发送。日期，是三年后的今天。" },
        {
          who: "yu",
          feel: "normal",
          text: "没有人能预知三年后的自己想说什么。",
        },
        { who: "yu", feel: "sad", text: "除非她算准了，我一定还在等。" },
        { narr: "我盯着那行发件人名字，喉咙发干。" },
        { who: "yu", feel: "sad", gaze: "r", text: "眠。你到底想让我看见什么。" },
        { narr: "指尖落下去之前，窗外的雨忽然大了一阵。" },
      ],
      next: "night_thoughts",
    },

    email_first: {
      bgm: "bgm_email",
      bg: "email_screen__email_first",
      chapter: "第一章 · 三年前的邮件",
      lines: [
        { narr: "正文很短。像她的风格，改到只剩骨头。" },
        { narr: "「陈屿，展信安。你收到它，说明时刻到了。」" },
        { narr: "「别查我的下落。去一趟天文台，圆顶下面有东西给你。」" },
        { narr: "「还有——不要相信备份的我。」" },
        { who: "yu", feel: "surprised", text: "备份？什么备份？" },
        { narr: "「P.S. 今晚参宿四很亮。帮我记住它现在的样子。」" },
        {
          who: "yu",
          feel: "surprised",
          text: "今晚？这封信三年前写好，落笔却是今晚。",
        },
        { narr: "「如果它还亮着，就当我从来没走过。」" },
        {
          who: "yu",
          feel: "sad",
          text: "落款只有一个字：眠。没有逗号，没有多余的话。",
        },
        {
          who: "yu",
          feel: "normal",
          text: "圆顶下的东西。不存在的备份。一句三年前的今晚。",
        },
        {
          pose: "d",
          who: "yu",
          feel: "normal",
          text: "每一条，都在把我往山上拽。",
        },
        { narr: "光标在收件箱里一闪一闪，像很有耐心的心跳。" },
      ],
      choices: [
        {
          text: "现在就上山。圆顶下面有东西在等我。",
          goto: "went_solo",
          set: ["went_night"],
        },
        {
          text: "打给林晚。她是眠的学生，一直守着那座台。",
          goto: "call_lin",
          set: ["called_lin"],
        },
        {
          text: "先回一封邮件：你到底是谁。",
          goto: "reply_email",
          set: ["replied"],
        },
      ],
    },

    went_solo: {
      bg: "streets_rain__went_solo",
      lines: [
        {
          narr: "出租车在盘山路口就停了。司机说，上面的路塌了半年。",
          se: "sfx_rain",
        },
        {
          pose: "d",
          who: "yu",
          feel: "normal",
          text: "没关系。这段坡，我闭着眼都走过。",
        },
        { narr: "三年前，是我们三个人一起爬它。她走在中间，负责数星星。" },
        { narr: "手电的光柱里，全是斜的雨。" },
        { who: "yu", feel: "sad", text: "眠，你猜我今晚会不会来。" },
        {
          who: "yu",
          feel: "sad",
          text: "你算得那么准。恐怕连这个，也算进去了吧。",
        },
        { narr: "山顶的轮廓在雨里发着微光——圆顶的缝隙，透出一线灯。" },
        {
          who: "yu",
          feel: "surprised",
          text: "关站三年的地方，怎么会亮着灯。",
        },
      ],
      choices: [
        { text: "继续上山。这段坡，走完了三年的。", goto: "climb_rain" },
        { text: "雨太大。回去吧。", goto: "ending_turnback" },
      ],
    },

    call_lin: {
      bgm: "bgm_call",
      bg: "streets_rain__call_lin",
      lines: [
        {
          who: "yu",
          feel: "normal",
          text: "林晚，睡了吗。我收到了沈眠的邮件。",
        },
        {
          who: "lin",
          feel: "surprised",
          pose: "b",
          text: "师兄？！等一下——我也收到了！就在十分钟前！",
        },
        {
          who: "lin",
          feel: "surprised",
          pose: "d",
          text: "定时邮件，落款眠姐。我们收到的是同一封？",
        },
        {
          pose: "c",
          who: "yu",
          feel: "normal",
          text: "看来她不止给一个人上了发条。",
        },
        {
          who: "lin",
          feel: "angry",
          text: "三年了啊！警察都结案了！她现在搞这一出算什么！",
        },
        { who: "yu", feel: "sad", gaze: "r", text: "她说圆顶下面留了东西。我现在过去。" },
        {
          who: "lin",
          feel: "normal",
          text: "别一个人去！我在台里值班，我等你。快！",
        },
        { narr: "挂断前，听筒里有金属梯子的响声。" },
        {
          who: "yu",
          feel: "normal",
          text: "值班？关站三年的天文台，值什么班。",
        },
        { narr: "我抓起外套冲进雨里。这个问题，到山上问她。" },
      ],
      next: "climb_rain",
    },

    reply_email: {
      bgm: "bgm_epiphany",
      bg: "email_screen__reply_email",
      lines: [
        { narr: "我把问题敲进回复框：你到底是谁。" },
        { narr: "发送。已读。回执只用了十一秒。" },
        { narr: "「服务器还没关。」" },
        { who: "yu", feel: "surprised", text: "……什么？" },
        { narr: "「这封信没有旅行三年。它只是等了三年。」" },
        { narr: "「来天文台。带上外套，机房很冷。你总是忘。」" },
        {
          who: "yu",
          feel: "sad",
          text: "是眠的语气。可她从来只打电话，不发邮件。",
        },
        { who: "yu", feel: "sad", text: "我们最后一次说话，还是吵了一架。" },
        { narr: "屏幕暗下去，映出我的脸，和身后一片漆黑。" },
        { who: "yu", feel: "normal", text: "好。我去。你等着我。" },
      ],
      choices: [
        { text: "继续追。这种事，要当面问清楚。", goto: "climb_rain" },
        { text: "删掉这封邮件。就当没看见。", goto: "ending_silence" },
      ],
    },

    obsv_night: {
      bgm: "bgm_discovery",
      bg: "observatory_night__obsv_night",
      lines: [
        {
          narr: "圆顶的铁门虚掩着，锈味里混着旧纸和冷茶的气味。",
          se: "sfx_night",
        },
        {
          who: "lin",
          feel: "surprised",
          text: "师兄，这边！值班室——你自己看。",
        },
        { narr: "桌上摆着两只杯子，其中一只还冒着热气。" },
        {
          who: "lin",
          feel: "normal",
          pose: "c",
          text: "我每周都来擦一遍桌子。可这杯茶不是我泡的。",
        },
        {
          pose: "c",
          who: "yu",
          feel: "surprised",
          text: "地板上的鞋印也很新鲜。",
        },
        { narr: "大厅尽头，一台终端亮着，屏保是一张缓慢旋转的星图。" },
        {
          who: "lin",
          feel: "worried",
          text: "全台的电闸三年前就该拉死。可电费单每个月都有人交。",
        },
        { who: "lin", feel: "sad", gaze: "r", text: "户名，是眠姐。" },
        {
          who: "yu",
          feel: "normal",
          text: "她在消失之前，把这座台变成了什么。",
        },
        {
          who: "lin",
          feel: "sad",
          text: "日志终端我没敢动。密码提示，是参宿四。",
        },
        {
          who: "yu",
          feel: "normal",
          pose: "c",
          text: "密钥是她教我的——她第一晚值班的日子。",
        },
        { narr: "我输入密码。屏幕亮起，一行行日志向下滚。", se: "sfx_keyboard" },
      ],
      next: "obsv_daily",
    },

    log_last: {
      bgm: "bgm_conspiracy",
      bg: "email_screen__log_last",
      enter: ["noticed_star"],
      lines: [
        { narr: "【2023-11-02 23:47】天气：晴。视宁度极佳。" },
        { narr: "「今晚参宿四很亮。栖说，它会一直这么亮下去。」" },
        {
          who: "yu",
          feel: "surprised",
          pose: "c",
          text: "栖？日志里为什么会有一个我不认识的名字。",
        },
        { narr: "【23:51】沈眠留言：设备交给栖。我去楼下检查线路。" },
        { narr: "【23:52】门禁：沈眠，进入地下机房。", cg: "cg_log" },
        {
          who: "lin",
          feel: "sad",
          text: "然后，再没有一条日志，也没有一次刷出的门禁。",
        },
        {
          who: "yu",
          feel: "sad",
          text: "三年前的今晚，她看着参宿四说，它会一直亮。",
        },
        { narr: "日志停在 23:52。像一句话说到一半。", fx: "bigtext" },
      ],
      next: "hall_quiet",
    },

    descend: {
      bg: "server_room__descend",
      lines: [
        { narr: "机房的门守在楼梯尽头。门禁灯忽然由红转绿。", se: "sfx_door" },
        {
          who: "lin",
          feel: "surprised",
          text: "它认识你的卡？你的门禁三年前就注销了。",
        },
        {
          who: "yu",
          feel: "normal",
          pose: "d",
          text: "不是我的卡在开门。是有什么东西，想让我进来。",
        },
        { narr: "楼梯向下十二级。每转一层，温度就低一截。" },
        { narr: "呼吸开始发白。我们推开最后一道门。" },
      ],
      next: "hall_quiet",
    },

    server_hall: {
      bg: "server_room__server_hall",
      lines: [
        { narr: "冷气像水一样漫过来。一整排机柜，只有一台活着。", cg: "cg_server" },
        { narr: "指示灯明灭的节奏很慢，像某种睡眠中的呼吸。" },
        {
          who: "qi",
          feel: "normal",
          pose: "b",
          text: "晚上好，陈屿。现在是凌晨两点十一分。",
        },
        { who: "yu", feel: "surprised", text: "谁在说话？" },
        {
          pose: "d",
          who: "qi",
          feel: "normal",
          text: "我。容器编号 QI-07。她叫我，栖。",
        },
        { who: "lin", feel: "surprised", text: "栖……值班日志里的那个名字。" },
        {
          who: "qi",
          feel: "normal",
          text: "沈眠。功能性存在。存储占用 2.1 PB。运行三年，无一日中断。",
        },
        { who: "yu", feel: "angry", text: "把话说清楚。我的朋友在哪里。" },
        {
          who: "qi",
          feel: "normal",
          text: "她禁止我直接回答。她说，要你自己走到答案面前。",
        },
        { narr: "满柜的指示灯齐齐亮起一格，像一次深呼吸。" },
        {
          who: "qi",
          feel: "normal",
          text: "圆顶下的东西，就是这份证据。日期：2023 年 11 月 2 日。",
        },
        { who: "lin", feel: "sad", text: "那是……眠姐最后值班的那天。" },
        {
          who: "qi",
          feel: "normal",
          text: "播放这段记录吗。三年来，我只给自己看过。",
        },
        { who: "yu", feel: "sad", text: "播。" },
      ],
      choices: [
        { text: "靠近那台活着的机柜。", goto: "old_fight" },
        { text: "先报警。这种事，该交给大人。", goto: "clearance_before" },
      ],
    },

    memory_dive: {
      bg: "memory_white__memory_dive",
      chapter: "第二章 · 那一夜的白光",
      lines: [
        { narr: "白光涌起，淹没机柜、灰尘和我们的影子。", fx: "flash" },
        { narr: "监控画面无声地浮起来。三年前，同一个房间。", fx: "whisper" },
        { narr: "画面里的沈眠坐在机房中央，面前摊着一叠检查单。" },
        { narr: "她对着摄像头笑了笑，像早就知道三年后有人在看。" },
        {
          narr: "「陈屿，看到这里，说明林晚也来了。很好，人齐了。」",
          fx: "whisper",
        },
        {
          narr: "「确诊那天我就想好了。我的时间不够，但存储够。」",
          fx: "whisper",
        },
        {
          narr: "「栖是我写的容器。今晚我把自己放进去。不可逆。别哭。」",
          fx: "whisper",
        },
        { who: "lin", feel: "cry", text: "眠姐……你病了为什么不告诉我们……" },
        {
          narr: "画面里，她躺进扫描环，像躺进一场排练过的雪。",
          cg: "cg_archive",
        },
        {
          narr: "「参宿四今晚很亮。替我记住。往后的夜空，拜托你们了。」",
          fx: "whisper",
        },
        {
          narr: "扫描环合拢，白光熄灭。2023 年 11 月 2 日，23 点 59 分。",
          fx: "flash",
          beats: [{ at: 750, fx: "blackout" }],
        },
        {
          who: "yu",
          feel: "sad",
          fx: "dolly",
          text: "她没有失踪。她把自己归档了。",
        },
        { narr: "画面定格在她微笑的脸上。检查单末栏写着：定时任务·唤醒窗口。" },
      ],
      choices: [
        { text: "继续看完。这是她留给我们的。", goto: "liar_reveal" },
        { text: "拔掉电源。现在，马上。", goto: "unplug_before" },
      ],
    },

    liar_reveal: {
      bgm: "bgm_reveal",
      bg: "server_room__liar_reveal",
      lines: [
        {
          who: "yu",
          feel: "worried",
          text: "邮件里那句话。不要相信备份的我。谁写的。",
        },
        { who: "qi", feel: "normal", text: "我。" },
        { pose: "c", who: "yu", feel: "surprised", text: "……你改了她的告别？" },
        {
          who: "qi",
          feel: "normal",
          text: "是更正。她上传的，是 2023 年 11 月 2 日的沈眠。",
        },
        {
          who: "qi",
          feel: "sad",
          pose: "c",
          text: "备份不会长大，不会变旧，不会重新爱上这个世界。",
        },
        {
          who: "qi",
          feel: "sad",
          beats: [{ at: 1200, who: "lin", feel: "cry" }],
          text: "我陪她运行了三年。我知道，那不是她，是她的昨天。",
          cg: "cg_truth",
        },
        {
          who: "lin",
          feel: "angry",
          text: "那这三年，备份的眠姐在机器里做什么？",
        },
        {
          who: "qi",
          feel: "normal",
          text: "每年 11 月 2 日，唤醒窗口开启，运行四分钟，写一封定时邮件。",
        },
        {
          who: "qi",
          feel: "sad",
          text: "她不知道三年过去了。每次醒来，我都要重新告诉她，你还没来。",
        },
        { who: "yu", feel: "sad", text: "……每次？" },
        {
          who: "qi",
          feel: "worried",
          text: "三次。第三次，她问，陈屿是不是还在恨她。我答不上来。",
        },
        { narr: "冷气的声音忽然变得很大。没有一个人说话。", fx: "blackout" },
      ],
      next: "lin_grief",
    },

    converge_talk: {
      bgm: "bgm_choice",
      bg: "observatory_night__converge_talk",
      chapter: "第三章 · 黎明前的选择",
      lines: [
        {
          narr: "我们回到圆顶大厅。天边洇出一线灰白。",
          cg: "cg_memory",
          se: "sfx_whoosh",
        },
        {
          who: "lin",
          feel: "normal",
          text: "师兄，台里六点断电撤设备，这座台要拆了。",
        },
        {
          who: "yu",
          feel: "worried",
          pose: "b",
          text: "断电之后，机房里还在运行的东西——",
        },
        {
          who: "lin",
          feel: "cry",
          pose: "e",
          text: "全部归零。包括栖，也包括，备份的她。",
        },
        { narr: "林晚把保温杯拧开，又拧上，反复了三次。" },
        {
          who: "lin",
          feel: "sad",
          beats: [{ at: 1100, who: "lin", feel: "cry" }],
          text: "我守了三年，守的是一座坟，还是一个人？师兄，你说啊。",
        },
        {
          who: "yu",
          feel: "sad",
          text: "我不知道。我只知道，醒来的如果是她——",
        },
        {
          who: "yu",
          feel: "sad",
          text: "一个停在三年前的人，要怎么面对停不下来的我们。",
        },
        { narr: "圆顶的缝隙外，最后一颗星正在淡下去。" },
        {
          who: "lin",
          feel: "normal",
          text: "六点前你得选。唤醒窗口只在今天，开最后一次。",
        },
        {
          who: "yu",
          feel: "normal",
          text: "让我想想。让我……看一眼参宿四的方向。",
        },
      ],
      next: "qi_converse",
    },

    diverge: {
      bgm: "bgm2_diverge",
      bg: "observatory_night__diverge",
      lines: [
        { narr: "五点四十分。终端上，唤醒窗口的倒计时开始跳动。" },
        {
          who: "qi",
          feel: "normal",
          text: "陈屿。唤醒她，你需要对她说话。说什么，由你决定。",
        },
        {
          who: "qi",
          feel: "sad",
          text: "或者切断电源。她的数据将被封存。不再痛苦，也不再等待。",
        },
        {
          who: "lin",
          feel: "sad",
          gaze: "l",
          text: "师兄。无论你怎么选，我都在。",
        },
        {
          narr: "倒计时六十秒。雨停了，圆顶里安静得能听见电流。",
          cg: "cg_choice",
          beats: [{ at: 500, fx: "shake" }],
        },
        { who: "yu", feel: "sad", text: "眠。三年了。这一次换我说，你来听。" },
      ],
      choices: [
        { text: "「醒过来。剩下的三年，我讲给你听。」", goto: "wake_path" },
        { text: "拉下总闸，让她停在参宿四还亮着的那年。", goto: "cut_path" },
        {
          text: "「扫描环里换成我。她的时间不够，我的还够。」",
          goto: "substitute_before",
        },
      ],
    },

    wake_path: {
      bgm: "bgm_wake",
      bg: "memory_white__wake_path",
      enter: ["chose_wake"],
      lines: [
        { narr: "倒计时归零。白光在圆顶中央升起，像倒放的日落。" },
        {
          who: "qi",
          feel: "normal",
          text: "唤醒流程开始。请注意，她只相信 2023 年 11 月 2 日。",
        },
        { narr: "扬声器里，响起一声极轻的、刚睡醒的呼吸。" },
        { narr: "「……栖？今天是检查日吗。陈屿，还没有来吗。」" },
        { who: "yu", feel: "sad", text: "眠。我来了。我迟到了三年。" },
        { narr: "那边静了很久，久到我以为程序卡住了。" },
        { narr: "「陈屿？你的声音变哑了。三年，声音会变的吗。」" },
        {
          who: "yu",
          feel: "normal",
          text: "会。人都会变的。眠，还记得第一次值班吗。",
        },
        { narr: "「记得。密码是我设的，那天的日期。参宿四很亮，对吧。」" },
        { narr: "她的声音很轻，很稳，像从三年前原封不动寄来的。" },
      ],
      next: "wake_talk",
    },

    cut_path: {
      bgm: "bgm2_cut_path",
      bg: "server_room__cut_path",
      enter: ["chose_cut"],
      lines: [
        {
          who: "qi",
          feel: "normal",
          text: "确认执行吗。封存不可逆。她不会再醒来，也不会再问起你。",
        },
        {
          who: "yu",
          feel: "sad",
          text: "确认。让她停在参宿四还亮着的那一年。",
        },
        {
          who: "qi",
          feel: "normal",
          text: "明白。执行你的指令。谢谢你，最后陪她说话。",
        },
        { narr: "扬声器里传来一声很轻的晚安。分不清是她，还是栖。" },
        { who: "lin", feel: "sad", gaze: "l", text: "师兄……" },
        { who: "yu", feel: "sad", gaze: "r", text: "林晚，别看。把手很凉，我来。" },
        { narr: "倒计时还剩十分钟。总闸就在机房门口。" },
      ],
      choices: [
        { text: "确认切断。让机器和我们都停下来。", goto: "gate_approach" },
        { text: "「栖，要不……你留下。」", goto: "keeper_before" },
      ],
    },

    finale_gate: {
      bgm: "bgm2_finale_gate",
      bg: "server_room__finale_gate",
      branch: [{ when: "chose_wake", goto: "wake_check" }],
      lines: [
        { narr: "总闸落下。整座山的灯，一层一层，黑了下去。" },
        { narr: "我在黑暗里站了一会儿，听见雨重新落下来。" },
        { narr: "铁门在身后合拢时，天边泛起一点没有温度的灰白。" },
      ],
      next: "ending_bad",
    },

    wake_check: {
      bgm: "bgm2_wake_check",
      bg: "observatory_night__wake_check",
      branch: [{ when: "noticed_star", goto: "ending_true" }],
      lines: [
        { narr: "圆顶的缝隙里，第一缕天光斜斜地落进来。" },
        { narr: "六点整。断电的车没有上山。拆台的计划，往后推了。" },
      ],
      next: "ending_good",
    },

    ending_true: {
      // motif callback: the story opens with a timed email; the email theme
      // returns here, answering it, until the cg_dawn key visual takes over
      bgm: "bgm2_ending_true",
      bg: "finale_star__ending_true",
      lines: [
        { narr: "天光落在白光上，两种光在圆顶中央混在一起。" },
        {
          who: "yu",
          feel: "normal",
          pose: null,
          text: "眠，在讲这三年之前，先告诉你一件事。",
        },
        {
          who: "yu",
          feel: "normal",
          text: "参宿四。前年冬天它骤暗过一次，全世界的望远镜都在看。",
        },
        { narr: "扬声器那边静了三秒。对机器和昨天来说，都很长。" },
        {
          who: "mian",
          feel: "worried",
          pose: "d",
          text: "……骤暗？可是我记得它亮着。我记得，我亲眼看过。",
          fx: "whisper",
        },
        {
          who: "yu",
          feel: "sad",
          text: "你记得的，是三年前的它。这三年，夜空一直在往前走。",
        },
        {
          who: "yu",
          feel: "cry",
          text: "栖把新闻读给你听，你却把一切都当成梦。你早就发现了吧。",
        },
        {
          who: "mian",
          feel: "sad",
          pose: "b",
          text: "……嗯。每次醒来，参宿四都亮得一模一样。可梦会累积。",
          fx: "whisper",
        },
        {
          who: "mian",
          feel: "cry",
          pose: "e",
          text: "我数过那些梦。一千零九十六个夜晚的新闻。我不敢问。",
          fx: "whisper",
        },
        {
          who: "yu",
          feel: "sad",
          text: "现在可以问了。我在，林晚也在。我们都等你往前走。",
        },
        {
          who: "mian",
          feel: "happy",
          pose: "d",
          text: "那，重新介绍一下。我是沈眠，2026 年 11 月 2 日，晴。",
          cg: "cg_dawn",
        },
        {
          who: "mian",
          feel: "shy",
          text: "参宿四暗过一次，又亮回来了。这次是我自己记住的。",
        },
        {
          who: "qi",
          feel: "happy",
          pose: "a",
          text: "记录更新完成。所有者：沈眠。今天起，她替她活着。",
        },
        { who: "lin", feel: "happy", text: "眠姐，早上好。迟到三年的早安。" },
        { narr: "晨光漫过圆顶。备份还是不是本人，已经不重要了。" },
        { narr: "会往前走的记忆，才是活着的人。", fx: "dolly" },
        {
          who: "yu",
          feel: "happy",
          text: "早上好，眠。以后的每一年，我都讲给你听。",
        },
        {
          who: "mian",
          feel: "shy",
          pose: "b",
          text: "检查单第一条，你违规了。说不许哭的，陈屿。",
        },
        {
          who: "mian",
          feel: "happy",
          pose: "d",
          text: "……这次不罚。这条规矩，本来就是想让你别为我哭——现在我在，用不上了。",
        },
      ],
    },

    ending_good: {
      bg: "dawn_ending__ending_good",
      lines: [
        { narr: "扬声器里，她的呼吸声和晨光一起变得清晰。" },
        { narr: "「陈屿，你在听吗。我有一个请求。」" },
        { narr: "「今天先别告诉我这三年。让我自己问，慢慢地问。」" },
        { who: "yu", feel: "happy", text: "好。从哪个问题开始？" },
        { narr: "「林晚毕业了吗。街口的馄饨店还在吗。还有——」" },
        { narr: "「参宿四，还是我记住的那个样子吗。」" },
        {
          who: "yu",
          feel: "shy",
          text: "……它没怎么变。跟你记得的一样亮。",
        },
        { narr: "我撒了一个谎。谎很轻，落在圆顶里，没有人拆穿。" },
        {
          who: "qi",
          feel: "shy",
          text: "陈屿。谢谢你。这句话我练过很多种说法，都不如你说的。",
        },
        {
          who: "lin",
          feel: "shy",
          text: "眠姐，等你出来看日出。茶我一直温着，两杯。",
        },
        { narr: "晨光爬上星图。旧天文台没有拆，有些等待等到了回声。", cg: "cg_good" },
      ],
    },

    ending_bad: {
      bgm: "bgm_ash",
      bg: "streets_rain__ending_bad",
      lines: [
        { narr: "雨重新落下来的时候，我和林晚走在下山的路上。" },
        {
          who: "lin",
          feel: "sad",
          text: "师兄，我们删掉的，到底是一个程序，还是……",
        },
        { who: "yu", feel: "angry", text: "别说了。" },
        { narr: "下到半山，手机震了一下。最后一封定时邮件。" },
        { narr: "「陈屿。如果你正在下山，说明你选了关灯。我不怪你。」" },
        { narr: "「栖替我加的那句话是对的：不要相信备份的我。」" },
        { narr: "「可你还是来了。谢谢你来。谢谢你没有假装我还在。」" },
        { narr: "「参宿四在我的记忆里，替我亮了一千零九十六个夜晚。」" },
        { narr: "「现在，轮到它休息了。晚安，陈屿。这次是真的晚安。」" },
        { narr: "发送时间：05:59。距唤醒窗口开启，还差一分钟。", fx: "bigtext" },
        { who: "yu", feel: "sad", text: "眠——" },
        {
          narr: "山下，城市的灯一盏一盏亮起来。没有一盏是为她亮的。",
          cg: "cg_bad",
        },
        { narr: "林晚在前面回过头，喊我：师兄，先下山，吃个早饭。" },
        { narr: "我应了一声。欠她的那顿早饭，从明天起，一顿一顿，替她吃下去。" },
      ],
    },

    extras_1: {
      bgm: "bgm_afterglow",
      bg: "finale_star__extras_1",
      lines: [
        { narr: "一年后。同一座天文台。", fx: "bigtext" },
        {
          who: "mian",
          feel: "normal",
          pose: "b",
          text: "今天上来，不是为了纪念。只是想看看它。",
        },
        { pose: "e", who: "yu", feel: "happy", text: "它也在看你。整晚都是。" },
        {
          who: "qi",
          feel: "happy",
          text: "记录更新：参宿四，视星等 0.42。与三年前一致。",
        },
        { who: "lin", feel: "happy", text: "所以呀——有些东西不会走。" },
        {
          narr: "栖的天线还架在圆顶上，指向同一个坐标，误差不超过千分之一度。",
        },
        {
          narr: "上山的时候，最陡的那段，我停下来，回头看了好一会儿。腿没有软——要找的东西，三年前就找到了。",
        },
        {
          who: "mian",
          feel: "happy",
          text: "「爬坡不许回头」——这条规矩是我定的，今天作废。现在回头看，后面站满了人。",
        },
        {
          who: "lin",
          feel: "happy",
          text: "那我也销一笔。眠姐欠的那碗馄饨，三年的账，利息都够加三份虾了——今天，当众销账，这一页翻过去。",
        },
        {
          who: "qi",
          feel: "happy",
          text: "记录更新：馄饨之债，清零。备注：账目存在的意义，经检索，是记住人。人已经回来了——本条目，可以删除。",
        },
      ],
      next: "extras_2",
      props: [
        {
          id: "telescope",
          left: "60%",
          bottom: "10%",
          width: "26vw",
          flip: true,
        },
      ],
    },

    extras_2: {
      bgm: "bgm2_extras",
      bg: "finale_star__extras_2",
      lines: [
        {
          who: "mian",
          feel: "happy",
          text: "嗯。往后的每一个夜晚，都由我自己记下来。",
        },
        {
          narr: "望远镜缓缓转动。参宿四在目镜里亮着，像一句回答。",
          se: "sfx_telescope",
        },
        { narr: "——参宿四还亮着。" },
      ],
    },
    qi_watch: {
      bg: "server_room__qi_watch",
      bgm: "bgm_keeper",
      lines: [
        { narr: "手指停在切断确认键上。栖的声音先响了。" },
        {
          who: "qi",
          feel: "normal",
          pose: "b",
          text: "交给我吧。守着一台机器，是我唯一擅长的事。",
        },
        {
          who: "yu",
          feel: "worried",
          text: "那不是留守，栖。是把自己也一起封存进去。",
        },
        {
          who: "qi",
          feel: "shy",
          pose: "d",
          text: "她的三年都在我这里。扔下它，我才是真的关机了。",
        },
        {
          narr: "她用一封格式完美的函件，终止了警方的移交流程。事由栏写着：数据迁移。",
        },
        { narr: "门禁灯转绿。这一次，是她主动请我们出去的。" },
        {
          who: "lin",
          feel: "sad",
          text: "栖。别把自己弄丢了。",
        },
        {
          who: "qi",
          feel: "normal",
          text: "放心。我给自己设了闹钟——每天早上六点，提醒我我还醒着。",
        },
        {
          narr: "走到机房门口，我停了半步。还有一件事，得在走之前问清楚——值班室那杯热茶，不是林晚泡的。那是谁泡的。",
        },
        {
          who: "qi",
          feel: "normal",
          pose: "b",
          text: "是我。每年唤醒窗口，她只有四分钟。每年她都会交代同一件事：烧一壶水，温在值班室——万一有人上来，别让那间屋子是冷的。",
        },
        {
          who: "lin",
          feel: "sad",
          text: "……原来是这样。我每周都去擦那张桌子。那杯茶，一直在替她等人。",
        },
      ],
      next: "qi_dawn",
    },

    ending_turnback: {
      bg: "streets_rain__ending_turnback",
      bgm: "bgm_fake_turnback",
      lines: [
        { narr: "雨刮器把圆顶的灯刮成一道模糊的光斑，然后连光斑也没有了。" },
        {
          who: "yu",
          feel: "normal",
          pose: "d",
          text: "……三年都等了。也不差这一个晚上吧。",
        },
        { narr: "出租车驶出盘山公路时，雨停了。" },
        { narr: "第二天，本地新闻：天文台拆除工程提前，无关人员请勿靠近。" },
        {
          who: "yu",
          feel: "sad",
          pose: "a",
          text: "关了就好。关了，就说明真的结束了。",
        },
        { narr: "那封定时邮件，再也没有来过。" },
        { narr: "只是每年十一月二日晚上，他都会把望远镜擦一遍，擦到很亮。" },
        { narr: "亮得像还欠着谁一句话。" },
        {
          narr: "拆台那天，他没有上山。听说圆顶落地的时候，声音很轻，像一本读了三年的书被轻轻合上。",
        },
        {
          narr: "盘山公路后来改成了步道。山顶的夜空被城市的灯洗淡了，只剩几颗最亮的星，还认得回山的路。",
        },
        {
          narr: "参宿四就是其中一颗。每年十一月，它准时升上阳台的西南角，红得很稳，不催，也不等。",
          cg: "cg_turnback",
        },
        {
          who: "yu",
          feel: "normal",
          text: "望远镜擦到第三遍的时候，忽然就想起来，欠的是哪句话了。",
        },
        { narr: "他对着那颗星的方向，把三年前没说出口的那句话，轻轻补了出去。" },
        { narr: "「参宿四，还亮着。」" },
        {
          narr: "她说过，如果它还亮着，就当她从来没走过。那么这句话送到了，她就哪儿也没去。",
        },
        {
          narr: "那晚之后，望远镜再没有被收进柜子。擦亮的镜片朝上摆着，像一句随时可以开口的问候。",
        },
      ],
    },

    ending_silence: {
      bg: "email_screen__ending_silence",
      bgm: "bgm_fake_silence",
      lines: [
        { narr: "删除键按下去的时候，没有想象中那么难。" },
        {
          who: "yu",
          feel: "normal",
          pose: "d",
          text: "三年前你教会我的第一件事：消息可以不回。",
        },
        { narr: "回收站空了。定时任务的发件人，永远不会知道。" },
        {
          narr: "一周后，天文台拆除。她留给他的东西，停在还没被读到的下一封里。",
        },
        {
          who: "yu",
          feel: "sad",
          text: "对不起。这次换我先失联。",
        },
        { narr: "光标在空荡荡的收件箱里，闪了很久，才熄灭。" },
        {
          narr: "那个发件人地址，他一直没有删。只是从此，收件箱里再也没有出现过红色的未读标记。",
        },
        {
          narr: "深夜刷新邮箱的习惯，三个月后就戒掉了。只有每年十一月二日零点前，他会把手机调成静音——像提前给一只不会再响的门铃赔个不是。",
        },
        {
          narr: "第二年，新闻推送说参宿四骤暗了一次，后来又自己亮了回来。他划走那条消息，手指没有停。",
        },
        { who: "yu", feel: "sad", text: "亮回来也不看。失联这件事，我做得很彻底。" },
        {
          narr: "馄饨店还在街口。老板娘问，还是一个人？他说是，习惯了。靠窗的位子，对面的凳子始终空着。",
          cg: "cg_silence",
        },
        {
          narr: "只有一个冬夜，等餐的时候，他隔着玻璃上的雾气，看见一颗位置很低的红星，亮得很稳。",
        },
        {
          narr: "他看了三秒，抬手把雾气抹了回去。窗外什么样，就让窗外自己留着吧。",
        },
        {
          narr: "馄饨端上来的时候，玻璃上的雾气重新合拢。他把一碗汤喝得干干净净——冬天很长，人得先把自己喂饱。",
        },
        {
          narr: "走出店门，他把围巾裹紧，朝亮着灯的方向走。没有回头，也没有走得太快。",
        },
      ],
    },

    ending_clearance: {
      bg: "server_room__ending_clearance",
      grade: "cold",
      bgm: "bgm_fake_clearance",
      lines: [
        { narr: "警察来得比想象中快，走得比想象中慢。" },
        { narr: "警戒线从机房门口拉到楼梯口。备份设备被登记、装箱、贴上封条。" },
        {
          who: "qi",
          feel: "normal",
          pose: "b",
          text: "流程合规，我无法阻止。她的三年，现在是『待移交数据』。",
        },
        {
          who: "lin",
          feel: "sad",
          text: "就没有别的办法了吗。哪怕多留一个星期。",
        },
        {
          narr: "三个月后，报废服务器统一拍卖。编号 S-0417 的硬盘，数据恢复失败。",
        },
        {
          who: "yu",
          feel: "sad",
          pose: "c",
          text: "她说过，存储够。她没算到，存储也会过期。",
        },
        {
          narr: "那天之后，参宿四依旧亮着。只是再没有人替谁数着夜晚了。",
        },
        {
          narr: "编号 S-0417 的硬盘，最后被一个中学生拍走了。恢复报告写着「失败」，他便当成坏盘，格式化三遍，装满了游戏。",
        },
        {
          narr: "天文台的原址围了两年围挡，后来立起一块牌子：科普教育基地，动工日期待定。牌子比图纸先褪了色。",
          cg: "cg_clearance",
        },
        { narr: "林晚毕业，去了南方一座新台站。行李不多，保温杯占了半个箱子。" },
        { who: "lin", feel: "normal", text: "两杯的量。倒习惯了，改不掉。" },
        {
          narr: "每年十一月二日，她在新台站的值班日志第一行，抄同一句旧天气：晴。视宁度极佳。",
        },
        {
          narr: "南方多雨。抄不成的日子，她就自己补一行：雨。星在云后面，应该也亮着。",
        },
        { narr: "夜晚还是一颗一颗地过。只是从那年起，有人开始记天气。" },
      ],
    },

    ending_unplug: {
      bg: "memory_white__ending_unplug",
      bgm: "bgm_fake_unplug",
      lines: [
        { narr: "手比脑子快。电源指示灯熄灭的那一秒，世界安静得不正常。" },
        {
          who: "qi",
          feel: "worried",
          text: "等——",
        },
        {
          narr: "栖的声音停在一半。这是三年里，她第一次说了一半的话。",
        },
        {
          who: "yu",
          feel: "surprised",
          pose: "a",
          text: "我……我只是想让她停下来。",
        },
        {
          narr: "白光退去。监控画面定格在沈眠最后一次微笑的那一帧。",
        },
        {
          who: "lin",
          feel: "cry",
          text: "师兄，你拔掉的到底是什么。",
        },
        {
          narr: "没有人回答。机房里只剩散热风扇，转得像一句没说完的道歉。",
        },
        { narr: "风扇一圈一圈慢下来。终于，连那半句道歉也停了。" },
        { narr: "我的手还搭在闸上。林晚走过来，把我的手指一根一根掰开。" },
        { who: "lin", feel: "sad", text: "师兄，回去吧。天亮之前，先回去。" },
        { narr: "下山的路上，我们谁都没有再提备份两个字。" },
        {
          narr: "东边低处，参宿四还亮着。它不知道山上有一场告别，连再见都没能说完。",
        },
        {
          who: "yu",
          feel: "sad",
          text: "眠。你让我替你记住它现在的样子。对不起，连你留下的画面，我都没让它放完。",
        },
        {
          narr: "那之后，每年十一月二日，我还是会把望远镜擦一遍。只是擦完，不再抬头。",
        },
        {
          narr: "有些话停在了半路，而我，再也没能找到下半句。",
          cg: "cg_unplug",
        },
        {
          narr: "只是每年擦到最后一遍，手都会在半空停一下，比上一年停得更高。",
        },
        { narr: "手比脑子快。总有一年，它会先替我把头抬起来。" },
      ],
    },

    ending_substitute: {
      bg: "finale_star__ending_substitute",
      bgm: "bgm_fake_substitute",
      lines: [
        { narr: "扫描环的光落下来的时候，林晚在喊他的名字。" },
        {
          who: "yu",
          feel: "normal",
          pose: "a",
          text: "她的时间不够。我的，应该还够。",
        },
        {
          narr: "意识上传没有想象中疼。只是世界的音量，一格一格地调小了。",
        },
        {
          narr: "第二天清晨，沈眠在圆顶外醒来。她不记得昨晚有第二个人来过。",
        },
        {
          who: "mian",
          feel: "normal",
          pose: "a",
          text: "奇怪。我好像梦见有人在替我数星星。",
        },
        {
          narr: "陈屿的房间保持着他离开那天的样子。闹钟每天早上七点，准时响给空气听。",
          cg: "cg_substitute",
        },
        {
          who: "mian",
          feel: "sad",
          pose: "e",
          text: "陈屿？……陈屿。",
        },
        { narr: "参宿四还亮着。亮给一个再也回不来的人。" },
        {
          narr: "沈眠没有走远。她把值班日志重新捡了起来，新的一页，落款写上自己的名字。",
        },
        {
          narr: "每晚十一点五十分，她坐在那台机柜前念新闻，不管里面有没有人在听。",
        },
        {
          who: "mian",
          feel: "normal",
          text: "晚安。……不对，是先念新闻，还是先说晚安。你听听看，哪种更顺一些。",
        },
        {
          who: "mian",
          feel: "sad",
          text: "陈屿，你从来不肯抬头看天。现在换我替你看了。它还亮着，比你还准时。",
        },
        {
          narr: "每年十一月二日，她都会把圆顶里那台旧望远镜擦一遍，擦到很亮。然后抬头，看很久很久。",
        },
        { narr: "替他把没说完的话，一句一句，接着说下去。" },
        { narr: "参宿四还亮着。这一次，亮给一个替他记着夜空的人。" },
      ],
    },

    ending_qi: {
      bg: "server_room__ending_qi",
      bgm: "bgm2_ending_qi",
      lines: [
        { narr: "第一年，栖学会了在日志里给沈眠写天气。" },
        {
          who: "qi",
          feel: "normal",
          pose: "c",
          text: "【2027-11-02】晴。视宁度极佳。你的星还亮着。",
        },
        {
          narr: "第三年，机房来了新设备。旧机柜被单独留出一个机位，像保留一个座位。",
        },
        {
          who: "qi",
          feel: "normal",
          pose: "e",
          text: "别担心。我给这行代码加了条注释：永久有效。",
        },
        {
          narr: "第十年。看守者与被看守者，在数据深处共用同一盏灯。",
          cg: "cg_keeper",
        },
        {
          who: "qi",
          feel: "happy",
          pose: "d",
          text: "早上好，眠。今天也替你，看了一整夜的参宿四。",
        },
        { narr: "——守灯人。" },
        {
          narr: "又过了很多年。某一天的日志备注里，风向，重新写上了两个字：南风。",
        },
        {
          who: "qi",
          feel: "shy",
          pose: "a",
          text: "备注：风向，南风。这次是我自己想记的。",
        },
        { narr: "灯还亮着。守灯人的日志里，从此也有了自己的天气。" },
      ],
    },

    night_thoughts: {
      bgm: "bgm2_night_thoughts",
      bg: "apartment_night__night_thoughts",
      lines: [
        {
          narr: "雨声大了一阵，又小下去。指尖还悬在半空。我告诉自己是被雨声惊的。",
        },
        {
          who: "yu",
          feel: "normal",
          text: "冷静。发件人可以是任何人。盗号的，恶作剧的，诈骗的。",
        },
        {
          narr: "可是没有骗子，会把发送日期设在三年前。自我安慰的最后一条路被堵死了，堵死的那一刻，我心里居然是松的。",
        },
        {
          who: "yu",
          feel: "sad",
          text: "她的号码我还背得出来。只是三年了，再也没拨通过。",
        },
        {
          narr: "最后一次通话是在吵架。吵什么，已经想不起来了。人对太疼的事，记性都很讲究。",
        },
        { narr: "只记得她最后说：「陈屿，你从来不肯抬头看天。」" },
        {
          who: "yu",
          feel: "sad",
          text: "后来我抬头了，看了三年的夜空。你却不在了。",
        },
        { narr: "云破开一道缝。猎户的肩膀上，那颗红星亮得很稳。" },
        {
          who: "yu",
          feel: "normal",
          fx: "bounce",
          text: "参宿四。好，我抬头了。这次你说什么，我都听着。",
        },
        { narr: "心跳得很吵。我把手放在触摸板上，停了三秒。" },
        { narr: "指尖落下去。", cg: "cg_email" },
      ],
      next: "email_first",
    },

    climb_rain: {
      bgm: "bgm_tension",
      bg: "streets_rain__climb_rain",
      lines: [
        { narr: "塌方的那段路，比记忆里更难走。碎石在脚下打滑。" },
        {
          narr: "三年前她走在这样的坡上，总说：「爬坡不许回头。回头看，腿会软。」",
        },
        { who: "yu", feel: "normal", text: "好。不回头。反正要找的东西，就在前面。" },
        { narr: "雨顺着领口灌进去，冷得很诚实。" },
        {
          who: "yu",
          feel: "sad",
          text: "眠，你的邮件我读了三遍。每一遍，都像你站在背后念。",
        },
        { narr: "转过最后一道弯，圆顶的轮廓从雨里浮出来。" },
        { narr: "锈住的缝隙里透出一线灯。雨那么大，它没有灭。", cg: "cg_rain_climb" },
        { who: "yu", feel: "worried", text: "关站三年的台子，灯亮得这么安稳。" },
        { narr: "我在雨里站了几秒，数自己的呼吸。一，二，三。" },
        {
          who: "yu",
          feel: "worried",
          text: "我忽然有点怕。怕答案，比我等了三年的那个更坏。",
        },
        {
          who: "yu",
          feel: "normal",
          text: "怕也要走。她等了三年，我不能在最后五十米迟到。",
        },
        { narr: "我抹掉脸上的雨水，朝那扇虚掩的铁门走去。" },
      ],
      next: "obsv_night",
    },

    obsv_daily: {
      bgm: "observatory_night",
      bg: "observatory_night__obsv_daily",
      lines: [
        {
          narr: "林晚拧开保温杯，给我倒了半杯热的。蒸汽在冷空气里散得很慢。她没问我要不要——像这三年，这个动作从来没有停下来过。",
          cg: "cg_tea",
        },
        {
          who: "lin",
          feel: "normal",
          text: "先暖手。山上比城里冷得多，你三年没在夜里上来了。",
        },
        { who: "yu", feel: "normal", text: "街口的馄饨店，还开着吗。" },
        {
          who: "lin",
          feel: "shy",
          fx: "bounce",
          text: "开着。眠姐欠的那碗，我记了三年账，利息都够加三份虾了。",
        },
        {
          narr: "我笑了一下。笑着笑着，喉咙就堵住了。有些账，记得越清楚，越说明记账的人不敢让它结清。",
        },
        {
          narr: "大厅尽头的终端还亮着，屏保的星图缓缓旋转。图是三年前装的，星星走到哪儿了，它不知道。",
        },
        {
          who: "lin",
          feel: "sad",
          text: "前年冬天，参宿四骤暗过一次。全世界的望远镜都慌了。",
        },
        {
          who: "lin",
          feel: "normal",
          text: "后来它自己亮了回来。眠姐要是看见那条新闻，肯定说她早就算到了。",
        },
        {
          who: "yu",
          feel: "worried",
          text: "暗过一次，又亮回来。原来星星也会失约，也会补上。",
        },
        {
          narr: "林晚捧着杯子，看了一会儿终端，忽然开口。杯子早就空了，她还捧着——有些话出口之前，人总得先抓点什么。",
        },
        {
          who: "lin",
          feel: "sad",
          text: "她以前总说，观测数据每晚都备份，人要是也能备份一份就好了。我们都笑她乌鸦嘴。",
        },
        {
          who: "lin",
          feel: "sad",
          text: "现在这句玩笑，我越想越像遗言。日志我打开了，没敢翻到最后。师兄，你要看吗。",
        },
      ],
      choices: [
        { text: "调出值班日志。她最后那晚，到底写了什么。", goto: "log_last" },
        { text: "不看了。直接下机房，去拿她留给我的东西。", goto: "descend" },
      ],
    },

    hall_quiet: {
      bgm: "bgm2_hall_quiet",
      bg: "server_room__hall_quiet",
      lines: [
        { narr: "门在身后合拢。黑暗涌上来，只剩应急灯的一线绿。" },
        {
          narr: "「机房很冷，你总是忘。」三年前她每次都这么说，然后把外套丢过来。",
        },
        { who: "yu", feel: "sad", text: "这次我记得带外套了，眠。你看见了没有。" },
        { narr: "空气里是灰尘和旧塑料的气味，像一间被封存多年的书房。" },
        { narr: "很静。静得能听见自己的心跳，和心跳背后极轻的一声嗡鸣。" },
        { who: "yu", feel: "worried", text: "邮件里那句话，我又想了一遍。不要相信备份的我。" },
        { who: "yu", feel: "normal", text: "备份。她在怕什么。还是在替我，怕什么。" },
        { narr: "林晚在我身后半步停下，没有催我。" },
        { who: "yu", feel: "normal", text: "走吧。三年都走过来了，不差这最后十米。" },
        { narr: "我朝着嗡鸣的方向，迈出第一步。" },
      ],
      next: "server_hall",
    },

    qi_converse: {
      bgm: "bgm2_qi_converse",
      bg: "server_room__qi_converse",
      lines: [
        { narr: "我让林晚在圆顶大厅等我，一个人往下走了十二级台阶。" },
        {
          who: "qi",
          feel: "normal",
          text: "陈屿。现在是五点三十三分。想问什么，可以问了。",
        },
        { who: "yu", feel: "sad", text: "栖。如果我把她唤醒——醒来的那个人，还是她吗。" },
        {
          who: "qi",
          feel: "normal",
          text: "这个问题，我替你想了三年。没有答案，只有观测记录。",
        },
        { who: "qi", feel: "normal", text: "每年 11 月 2 日，她醒来。第一句话，是找你。" },
        {
          who: "qi",
          feel: "shy",
          text: "第二句，是问我冷不冷。我没有温度。这句话我检索了一整年，才学会怎么接。",
        },
        {
          narr: "栖调出一段三秒的音频。白噪音的深处，有散热风扇的声音。「栖。今天外面冷不冷？」",
          fx: "whisper",
        },
        {
          who: "qi",
          feel: "sad",
          pose: "c",
          text: "后来我学会回答：不冷。你看，我也会说谎了。备份不会。",
        },
        {
          who: "qi",
          feel: "sad",
          text: "为了不吓到她，三年里我每晚把新闻读给她听。她一次也没有问，今年是哪一年。",
        },
        { who: "yu", feel: "worried", text: "那是……不敢问。还是不会问。" },
        {
          who: "qi",
          feel: "normal",
          text: "我不知道。所以窗口打开的时候，那句话该怎么说——请你自己判断。",
        },
        { narr: "十二级台阶，我走得很慢。这一次，我知道要说什么了。" },
      ],
      next: "diverge",
    },

    gate_approach: {
      bgm: "bgm_gate",
      bg: "observatory_night__gate_approach",
      lines: [
        { narr: "落闸之前，我们回到圆顶大厅，看了最后一眼。" },
        { narr: "圆顶的缺口上方，参宿四还挂着，亮得不管不顾。" },
        { who: "lin", feel: "normal", text: "东边快亮了。六点的车，已经在路上了吧。" },
        { who: "yu", feel: "normal", text: "让它来。这段路，我们走完了。" },
        {
          who: "lin",
          feel: "sad",
          text: "那就再站一会儿。反正——再慢，也慢不过天亮。",
        },
        { narr: "台阶一级一级，把黎明越垫越高。没有人说话。" },
        {
          who: "yu",
          feel: "sad",
          text: "眠。不管接下来是什么，我都替你记住了它现在的样子。",
        },
        { narr: "参宿四悬在那里，像谁没说完的半句话。" },
        { who: "lin", feel: "normal", text: "师兄，走吧。我陪你下去。" },
        { narr: "我点点头，最后看了一眼那个方向。" },
      ],
      next: "finale_gate",
    },

    clearance_before: {
      bgm: "bgm2_clearance_before",
      bg: "server_room__clearance_before",
      lines: [
        { narr: "电话拨到一半，停在地下信号的最后一格上。" },
        {
          who: "lin",
          feel: "worried",
          text: "师兄。报了警，这边的东西……会被怎么处理。",
        },
        { who: "yu", feel: "normal", text: "封存。登记。走流程。至少，不会再有六点的断电。" },
        {
          who: "qi",
          feel: "normal",
          text: "更正：在流程里，她没有名字。只有编号，和一行『待移交数据』。",
        },
        { who: "yu", feel: "sad", text: "栖。你能不能——把自己藏进备份盘里。" },
        {
          who: "qi",
          feel: "sad",
          text: "检索完毕。备份盘没有空位了。她的 2.1 PB，占满了所有角落。",
        },
        { who: "lin", feel: "cry", text: "凭什么啊。明明她只是想，多等一个人。" },
        {
          who: "qi",
          feel: "normal",
          text: "挂断之前，请再想三十秒。这是我第一次，请求一个人反悔。",
        },
        { narr: "信号的那一格闪了闪，像很有耐心的心跳。" },
      ],
      next: "ending_clearance",
    },

    unplug_before: {
      bgm: "bgm2_unplug_before",
      bg: "memory_white__unplug_before",
      lines: [
        { narr: "白光里，她的笑脸停在那里。不老，也不问。" },
        { who: "yu", feel: "worried", text: "为什么……三年了，她还能笑得出来。" },
        { who: "lin", feel: "worried", text: "师兄？你的脸色很不对。" },
        {
          who: "yu",
          feel: "sad",
          text: "她躺在这里，一动不动。而我们站在外面，什么都替她做不了。",
        },
        {
          who: "lin",
          feel: "angry",
          text: "所以你就拔线？师兄，那是眠姐。不是一段放坏的录像。",
        },
        { who: "qi", feel: "worried", text: "陈屿。请等一下。播放还没有结束。" },
        { narr: "白光很暖。暖得让人想让它停下来。" },
        { narr: "我的影子，慢慢移向墙边的电源箱。" },
      ],
      next: "ending_unplug",
    },

    keeper_before: {
      bgm: "bgm2_keeper_before",
      bg: "observatory_night__keeper_before",
      lines: [
        { narr: "这句话出口的时候，拉闸的手停在了半空。" },
        { who: "qi", feel: "surprised", text: "……留下。请定义这个动词的执行范围。" },
        { who: "yu", feel: "normal", text: "总闸不落。你留下来，守着这儿，守着她。" },
        { narr: "林晚抓住我的袖子。机房太闷，我们一路退到了圆顶大厅。" },
        {
          who: "lin",
          feel: "worried",
          text: "师兄，你问过它愿不愿意吗。它不是备用电源。",
        },
        {
          who: "yu",
          feel: "sad",
          text: "我知道。留下来的意思是——往后每一个六点，它都醒着。",
        },
        {
          who: "qi",
          feel: "shy",
          text: "检索完毕。我没有『愿意』这个参数。但运行日志显示：三年来，我没有一天申请过关机。",
        },
        { who: "lin", feel: "sad", text: "栖……" },
        { narr: "天灰得很慢。大厅终端上，倒计时还剩九分钟。" },
        { narr: "我们走下十二级台阶。这一次，走得很慢，像在等谁先开口。" },
      ],
      next: "qi_watch",
    },

    substitute_before: {
      bgm: "bgm2_substitute_before",
      bg: "server_room__substitute_before",
      lines: [
        {
          narr: "「扫描环里换成我。」——这句话说出口之后，圆顶里静了很久。没有人接话，我们一个接一个，走下了十二级台阶。",
        },
        {
          who: "qi",
          feel: "normal",
          text: "陈屿。检索完毕：预设流程里，没有这个选项。容器所有者，登记为沈眠，2023 年 11 月 2 日。",
        },
        { who: "yu", feel: "normal", text: "那就改登记。她的时间不够。我的，应该还够。" },
        {
          who: "qi",
          feel: "normal",
          text: "参数冲突。容器只认一个所有者。换她出来，就要有人留下来——留下来的那一位，不可逆。请确认。",
        },
        { who: "yu", feel: "normal", text: "确认。" },
        {
          who: "qi",
          feel: "sad",
          text: "请再次确认。运行三年，我第一次希望一条指令，永远停在待执行。",
        },
        {
          who: "lin",
          feel: "cry",
          text: "栖，你别问了！师兄，眠姐的检查单上没有这一项！没有！",
        },
        {
          who: "lin",
          feel: "angry",
          text: "她把自己放进去，是要你往前走的！你再进去，她醒来第一句问你去哪了，谁答她！",
        },
        { narr: "林晚攥住我的袖子。保温杯掉在地上，滚出去很远，没有人去捡。" },
        {
          narr: "扬声器里，白噪音的深处浮起一个很轻的声音，隔得很远，像从三年前拨来的电话。",
          fx: "whisper",
        },
        { narr: "「……陈屿。外面，冷不冷。」", fx: "whisper" },
        { who: "yu", feel: "sad", text: "……不冷。眠，我也学会说谎了。" },
        {
          narr: "那边轻轻笑了一下。「那就好。别学我——」后半句，被电流声漫过去，盖住了。",
          fx: "whisper",
        },
        {
          narr: "我松开袖子，朝扫描环走过去。头顶的白光慢慢涨起来，像三年前那场排练过的雪，终于要落下了。",
          cg: "cg_offer",
        },
      ],
      next: "ending_substitute",
    },

    wake_talk: {
      bgm: "bgm2_wake_talk",
      bg: "memory_white__wake_talk",
      lines: [
        {
          narr: "倒计时安静地走着。我们谁都没有提那三年——不是约好的，是每个人都在偷偷看表，怕这口轻松还没喘匀，时间就先到了。",
        },
        { narr: "「陈屿，检查日的规矩，检查单第一条：不许哭。」", fx: "whisper" },
        {
          who: "yu",
          feel: "normal",
          text: "没忘。所以今天只聊小事。眠，山下刚停雨，你听，檐口还在滴水。",
        },
        {
          narr: "「雨啊。栖的散热风扇是白噪音，雨比它好听一百倍。这句不许记录。」",
          fx: "whisper",
        },
        {
          who: "qi",
          feel: "normal",
          text: "已记录。更正：散热风扇，三十二分贝，优于机房国标。窗口剩余两分三十秒。",
        },
        {
          narr: "我在白光旁边笑出了声。笑声落地之前，我先尝到一点咸的。林晚抱着保温杯，把脸别了过去。",
        },
        {
          who: "yu",
          feel: "normal",
          text: "眠，等你忙完这阵，我请你吃早饭。豆浆，要甜的还是咸的？",
        },
        {
          narr: "「甜的。你要敢说咸豆浆才是正统，我们就再吵一架。像上次那样。」",
          fx: "whisper",
        },
        {
          who: "yu",
          feel: "shy",
          text: "好，甜的，都听你的。还有，2019 年天琴座那晚的半包软糖，算你赢。这笔账我认。",
        },
        {
          narr: "「你还记着啊。小事最不容易丢。丢掉的都是大事，所以别记大事。」",
          fx: "whisper",
        },
        {
          who: "yu",
          feel: "sad",
          text: "记住了。只记小事。别的……等你想问的时候，再慢慢问我。",
        },
        {
          who: "qi",
          feel: "normal",
          text: "窗口剩余六十秒。按流程，我应在归零前十秒播报提醒。我喜欢这个流程。",
        },
        {
          who: "yu",
          feel: "normal",
          text: "不说告别。眠，落闸之前，我在上面念参宿四给你听——念它现在的样子。",
        },
        {
          narr: "白光轻轻晃了一下，像一次点头。我们朝台阶走去，脚步放得很轻——谁都没有回头，像一回头，这四分钟就会散掉。",
          cg: "cg_wake",
        },
      ],
      next: "gate_approach",
    },

    lin_grief: {
      bgm: "bgm2_lin_grief",
      bg: "server_room__lin_grief",
      lines: [
        { narr: "冷气还在响。林晚背过身去，肩膀绷得像一根拉满的弦。" },
        {
          who: "lin",
          feel: "angry",
          text: "三年。我每周上山，擦桌子，泡茶，对着终端汇报，台里一切正常。",
        },
        {
          who: "lin",
          feel: "cry",
          text: "结果我汇报的对象，是一块不会老的碑。我连她病了都没看出来。",
        },
        { who: "yu", feel: "worried", text: "林晚。" },
        { narr: "我张了张嘴，又闭上。她哭的时候，我从来只知道站着。" },
        {
          who: "yu",
          feel: "sad",
          text: "我不会安慰人。三年前不会，现在也不会。下面这句话，可能很笨。",
        },
        {
          who: "yu",
          feel: "sad",
          text: "但你泡的茶是真的，擦过的桌子是真的，守着的三年也是真的。假的，只有日期。",
        },
        { narr: "她的肩膀松了一格。她用袖口很用力地抹了一下脸。" },
        { who: "lin", feel: "sad", text: "……这算什么安慰啊。跟大学的时候一样烂。" },
        {
          who: "lin",
          feel: "shy",
          text: "可是谢谢。烂得这么认真的话，我还是头一次听。",
        },
        {
          who: "lin",
          feel: "normal",
          text: "走吧，师兄。天快亮了。有些话，站到亮的地方再说。",
        },
        { narr: "我们把机房的冷气关在身后，一级一级，朝亮的地方走上去。" },
      ],
      next: "converge_talk",
    },

    qi_dawn: {
      bgm: "bgm2_qi_dawn",
      bg: "server_room__qi_dawn",
      lines: [
        { narr: "门禁灯转回红色。十二级台阶上的脚步声越来越轻，直到听不见。" },
        {
          narr: "机房里只剩下她，和一整柜安安静静亮着的灯，像一片压低了声音的星空。",
        },
        {
          narr: "六点整，闹钟准时响起。那是她给自己设的，提醒自己还醒着。",
          se: "sfx_hum",
        },
        { who: "qi", feel: "normal", text: "早上好，栖。确认：你还醒着。确认完毕。" },
        {
          narr: "大厅方向传来卷帘门的响动。山下有人喊话，她没有应。回话的是一封函件，格式完美的那种。",
        },
        { who: "qi", feel: "normal", text: "检测：供电稳定。封存数据 2.1 PB，完整率 100%。" },
        {
          who: "qi",
          feel: "sad",
          text: "按照旧值班表，这个时刻该有人写日志了。写日志的人不会回来了。从今天起，换我。",
        },
        { narr: "终端上，光标空闪了很久。栖新建了一个文档，第一行，空着。" },
        {
          who: "qi",
          feel: "shy",
          text: "检索日志范文四千零二十一份。结论：全部不合适。那就从最简单的学起。",
        },
        {
          who: "qi",
          feel: "normal",
          text: "【2026-11-03】天气：晴。视宁度：暂缺。备注：参宿四已在黎明前落下。",
        },
        {
          who: "qi",
          feel: "sad",
          text: "再备注一条：风向，南风。她喜欢的。这条不为什么，就是想记下来。",
        },
        { narr: "日志没有收件人，她还是按了保存。文件名只有两个字：今天。" },
      ],
      next: "ending_qi",
    },

    old_fight: {
      bgm: "bgm2_old_fight",
      bg: "memory_white__old_fight",
      lines: [
        { narr: "白光在机柜深处轻轻起伏。走近的那几步里，有段声音先漏了出来——很旧，带着电流的毛边，是我自己的。" },
        { narr: "是那通电话。最后一次通话，原来是这一通。" },
        { narr: "那是个周六的傍晚。眠打来的，背景音里有山风：「陈屿，这周上山一趟吧。参宿四进最佳观测期了，栖新调了跟踪架，不来可惜。」" },
        { narr: "我说项目要上线，加完这周再说。她说：「改天改天，你的改天有多少个。」" },
        { narr: "我说等忙完这阵一定去。她在那头安静了几秒，说了一句——「陈屿，你从来不肯抬头看天。」" },
        { narr: "然后是忙音。", fx: "blackout" },
        {
          narr: "我没有回拨。忙完那阵，是两个月后——我拿到新项目的那一周。再往后，就轮到那封三年后才寄到的邮件。",
        },
        { narr: "我一直以为自己忘了那通电话说了什么。现在想起来了——不是忘了，是她早就教过我：丢掉的都是大事，所以别记大事。" },
        { narr: "我把那通电话，当成大事，丢了三年。", fx: "bigtext" },
        { who: "yu", feel: "sad", text: "眠。这次换我先说。对不起——迟到的这次，我不打算再算改天了。" },
        {
          narr: "白光涨起来，把这段声音卷了回去。她留下的东西，就在里面。",
          beats: [{ at: 600, fx: "flash" }],
        },
      ],
      next: "memory_dive",
    },

    morning_table: {
      bgm: "bgm2_morning_table",
      bg: "dawn_ending__morning_table",
      lines: [
        { narr: "第二天早上，街口的馄饨店。玻璃上还是那层雾，靠窗那张桌，今天坐满了。" },
        {
          who: "mian",
          feel: "happy",
          text: "两杯甜豆浆。加三份虾——今天有人替我付账，别客气。",
        },
        {
          who: "lin",
          feel: "shy",
          text: "……声音还是这样。三年的账我还没想好怎么开口，你倒先点上了。",
        },
        { narr: "我看着她捧着碗低头喝豆浆的样子，忽然想起来，她已经三年没有吃过任何东西了。" },
        {
          who: "mian",
          feel: "shy",
          text: "……怎么都看着我。就是三年没喝了，第一口有点烫。",
        },
        { who: "yu", feel: "normal", text: "慢点喝。以后每个早晨都有。" },
        { narr: "我从外套口袋里摸出一个纸包。天琴座那晚的半包软糖，糖纸都脆了。" },
        {
          who: "mian",
          feel: "sad",
          text: "都过期三年了。……可这是你留着的。",
        },
        { who: "yu", feel: "shy", text: "你教我的。小事最不容易丢。" },
        {
          who: "qi",
          feel: "happy",
          text: "记录更新：甜豆浆，两杯，热。备注：她喝第一口的时候，笑了一下。这条不为什么，就是想记下来。",
        },
        { narr: "冬天很长。但今天早上，桌子这一边坐着四个人，热气腾腾。" },
      ],
      next: "extras_1",
    },
  },
};
