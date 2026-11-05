/* ============================================================
   AI Exploration Base - scam anatomy simulator script data
   8 stages of a realistic pig-butchering (杀猪盘) playbook.
   Pure data module: consumed by pages/anti-scam.html engine.
   Stage 5 (index 4) offers the "继续投资 / 停下查证" branch.
   Stage order: 专家人设 → 甜头 → 稀缺 → 下载App → 账面诱惑
                → 提现收费 → 情感施压 → 收网
   ============================================================ */
(function (root) {
  'use strict';

  var SCAM_SCRIPT = [
    {
      stage: 1,
      persona: '投资交流群 · 李老师',
      me: false,
      message: '欢迎新朋友进群！我做了15年私募，每天晚上8点免费分享大盘解读。进群福利：今晚荐一只票，跟上操作的这周都吃到肉了！',
      hookTitle: '第一步：让你相信"他是专家"',
      anatomy: '群里晒收益截图的"群友"，很多是托。真正的私募经理公开荐股给陌生人免费带操作？这本身就不合规矩。',
      correctMove: '查他的"牌照"：证监会官网查不到的"私募"，一律是假的。'
    },
    {
      stage: 2,
      persona: '李老师',
      me: false,
      message: '新来的姐妹先别大资金，先投500试试水，就当交个朋友。三个月下来群里的张姐都赚了小两千了！',
      hookTitle: '第二步：让你尝到甜头',
      anatomy: '让你先小赚是剧本里的固定情节。你看到的"盈利数字"是平台后台画的，不是真钱。钓鱼先下饵，才好收竿。',
      correctMove: '记住：稳赚不赔的"试水"，本身就是骗局的信号。'
    },
    {
      stage: 3,
      persona: '李老师',
      me: false,
      message: '机会来了！我们对接了一个"国家扶持的量化基金项目"，年化18%，保本保息。名额只剩最后7个，今晚12点截止。',
      hookTitle: '第三步：制造"再不上车就没了"',
      anatomy: '"国家扶持"＋"名额有限"＋"今晚截止"——稀缺和权威同时压上来，让你来不及思考。真项目不会催你今晚交钱。',
      correctMove: '任何"保本保息"都是违规承诺，正规产品法律上不允许这么说。',
      askSide: true
    },
    {
      stage: 4,
      persona: '李老师',
      me: false,
      message: '群里的都下载我们平台的App操作，比股票软件方便，我发你安装包链接，手机上也方便随时看收益。',
      hookTitle: '第四步：引你下载陌生App',
      anatomy: '这个"平台App"是骗子自己做的：假行情、假账户，里面每一分"盈利"都是后台随手画的数字。官方应用商店搜不到的App，一律不装。',
      correctMove: '只从手机官方应用商店装App；任何人发来的链接和安装包，一律不点、不装。'
    },
    {
      stage: 5,
      persona: '你',
      me: true,
      message: '（你投入2万）账户显示：盈利 6,000 元。……好像真的在赚钱？要不要把养老金也转进来？',
      caption: '（你投入了 2 万元）好像真的在赚钱？要不要把养老金也转进来？',
      hookTitle: '第五步：账面数字让你松懈',
      anatomy: '屏幕上的数字可以随便改，提现出来才是钱。此刻你开始想的"养老金"，正是他们等的那句话。',
      correctMove: '只看一条：钱能不能顺利取出来。取不出来，数字再好看都是零。',
      choice: true,
      dashboard: true
    },
    {
      stage: 6,
      persona: '平台客服',
      me: false,
      message: '尊敬的用户，您申请提现需先缴纳20%保证金以完成账户解冻，解冻后本金收益将一并到账。',
      hookTitle: '第六步：收网——取钱先交钱',
      anatomy: '"提现要交钱"，无论理由叫保证金、税费还是解冻金，100% 是骗局。这是整场骗局的目的地。',
      correctMove: '铁律：任何让你先交钱才能取钱的，直接认定是骗局，停止转账。'
    },
    {
      stage: 7,
      persona: '李老师',
      me: false,
      message: '姐，我知道你一个人带孩子不容易，这钱对你很重要。就差这最后一笔了，做完这次咱们就真正落袋为安，我在群里等你。',
      hookTitle: '第七步：换上"知心人"的面孔',
      anatomy: '前几步是专家，这一步是"懂你的家人"。硬的不行来软的——这套感情牌是针对多少人排练过的话术，不是真的懂你。',
      correctMove: '越是这时候越要停。给儿子或家人打个电话，五分钟后再决定。',
      callSon: true
    },
    {
      stage: 8,
      persona: '结局',
      me: false,
      message: '——模拟结束。这不是编剧的想象力，这是全国每天都在真实发生的剧本。',
      hookTitle: '解剖全貌',
      anatomy: '整条链：专家人设 → 小额甜头 → 制造稀缺 → 下载App → 账面诱惑 → 提现收费 → 情感施压 → 收网。每一步都有名字，你走的时候看得见，就赢了一半。',
      correctMove: '转发给群里的朋友，你还能救别人。',
      final: true
    }
  ];

  /* Progress-chain labels, one per stage, shown as lit/unlit chips. */
  root.SCAM_STEPS = ['专家人设', '甜头', '稀缺', '下载App', '账面诱惑', '提现收费', '情感施压', '收网'];

  /* Side-branch data: asking "张姐" about her profits (stage 3). */
  root.SCAM_SIDE_ZHANG = {
    persona: '群友 · 张姐',
    message: '李老师带得准！我上周投的8000，这周账户上已经9400了。妹妹你放心跟，我都跟了一年多啦，群里天天有人晒单呢。',
    decode: '晒单是"托"的日常工作：数字可以随便改，账户本来就是假面板，截图想多好看有多好看。"大家都赚了"的群，恰恰是托最多的群——因为真群没人天天晒收益。'
  };

  /* Side-branch data: calling her son (stage 7, emotional pressure). */
  root.SCAM_SON_CALL = {
    title: '📞 电话接通了——这通电话就是最好的风控',
    body: '儿子也许不懂投资，但旁边多一双眼睛、多一句"妈，先别转"，骗子就没了办法。记住：真感情经得起商量；越催你"别告诉家人"的，越有鬼。'
  };

  root.SCAM_SCRIPT = SCAM_SCRIPT;

  /* Psychological mechanisms + phrase dictionary + toolkit data */
  root.SCAM_MECHANISMS = [
    { name: '沉没成本', line: '"都投这么多了，现在退出就全亏了。"',
      why: '已经花掉的钱让人不甘心放手——骗子赌的就是这份"舍不得"。想赚钱不是错，但已经亏的部分不该决定下一步。' },
    { name: '稀缺紧迫', line: '"名额只剩最后 7 个，今晚 12 点截止。"',
      why: '倒计时让你来不及思考、来不及问家人。真机会不会怕你冷静一晚。' },
    { name: '权威包装', line: '"国家扶持项目""15 年私募老师""内部渠道"',
      why: '帽子越大越唬人。真权威可以查证：证监会官网、企业查查，5 分钟见真伪。' },
    { name: '社会认同', line: '"群里的张姐都赚了小两千了！"',
      why: '晒单截图可以批量伪造。大家都赚了的群，恰恰是托最多的群。' },
    { name: '情感哄骗', line: '"姐，我知道你不容易，就差这最后一笔。"',
      why: '先做专家再做知心人，是排练好的剧本。真感情不会催你转账。' }
  ];

  root.SCAM_PHRASES = [
    { phrase: '"稳赚不赔"', decode: '正规投资产品法律上禁止承诺保本。说这话的，不是无知就是骗子——多数是后者。' },
    { phrase: '"内部渠道 / 内部消息"', decode: '真有稳赚的内部渠道，他不会拉陌生人进群分享。' },
    { phrase: '"国家扶持项目"', decode: '真扶持项目走官方渠道公开申报，不会在微信群里募资。上证监会官网一查便知。' },
    { phrase: '"名额有限，今晚截止"', decode: '倒计时是让你跳过思考的开关。关掉它：任何好项目都经得起你睡一觉再决定。' },
    { phrase: '"老师带你操作"', decode: '持牌投顾不会私下带人炒股。所谓"带你"，是带你进剧本。' },
    { phrase: '"先交税/保证金/解冻金才能提现"', decode: '这是骗局的目的地。记住铁律：让你先交钱才能取钱的，100% 是骗局。' }
  ];

  root.SCAM_TOOLKIT = [
    { name: '国家反诈中心 App', how: '手机应用商店搜"国家反诈中心"官方下载，开启来电预警——它能提前识别诈骗电话和 App。' },
    { name: '反诈专线 96110', how: '接到可疑电话、拿不准一件事，先拨 96110 问一句。这是公安的反诈劝阻专线，不收咨询费。如果 96110 打电话给你，一定要接——那是公安在劝阻你。' },
    { name: '证监会官网 + 企业查查', how: 'www.csrc.gov.cn 查基金/投顾牌照；企业查查看公司注册时间和经营异常。投资前花 5 分钟查这三样。' }
  ];

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      SCAM_SCRIPT: SCAM_SCRIPT,
      SCAM_STEPS: root.SCAM_STEPS,
      SCAM_SIDE_ZHANG: root.SCAM_SIDE_ZHANG,
      SCAM_SON_CALL: root.SCAM_SON_CALL,
      SCAM_MECHANISMS: root.SCAM_MECHANISMS,
      SCAM_PHRASES: root.SCAM_PHRASES,
      SCAM_TOOLKIT: root.SCAM_TOOLKIT
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
