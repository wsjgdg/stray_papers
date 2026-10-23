// 中国味道 · 一省一菜数据集
// 数据为基于公开资料（百度百科《中国菜》名录、今晚报《地名与特色美食》等）自行整理的原创汇编，
// 仅作文化科普与可视化演示，非权威出处；口味雷达数值为按菜系特征的估算标签。

export type TasteKey = '咸' | '甜' | '酸' | '辣' | '香' | '鲜';

export interface ProvinceFood {
  code: string;
  name: string; // 简称
  fullName: string; // 全称
  dish: string; // 代表菜
  cuisine: string; // 菜系 / 风味流派
  region: string; // 大区
  taste: Record<TasteKey, number>; // 0-100 口味强度
  desc: string;
}

export const TASTE_KEYS: TasteKey[] = ['咸', '甜', '酸', '辣', '香', '鲜'];

export const CUISINE_COLORS: Record<string, string> = {
  鲁菜: '#C2410C', 川菜: '#DC2626', 粤菜: '#0EA5E9', 闽菜: '#0891B2',
  苏菜: '#D97706', 浙菜: '#16A34A', 湘菜: '#EA580C', 徽菜: '#65A30D',
  京菜: '#7C3AED', 沪菜: '#DB2777', 东北菜: '#CA8A04', 冀菜: '#9A3412',
  晋菜: '#B45309', 豫菜: '#A16207', 鄂菜: '#059669', 赣菜: '#B91C1C',
  秦菜: '#D97706', 西北菜: '#B45309', 蒙餐: '#92400E', 藏餐: '#4D7C0F',
  滇菜: '#CA8A04', 黔菜: '#B45309', 桂菜: '#0D9488', 琼菜: '#0891B2',
  渝菜: '#DC2626', 台菜: '#0EA5E9', 港澳菜: '#7C3AED', 其他: '#64748B',
};

export const REGIONS = ['华北', '东北', '华东', '华中', '华南', '西南', '西北'];

export const PROVINCE_FOODS: ProvinceFood[] = [
  { code: 'BJ', name: '北京', fullName: '北京市', dish: '北京烤鸭', cuisine: '京菜', region: '华北', taste: { 咸: 60, 甜: 35, 酸: 15, 辣: 5, 香: 70, 鲜: 65 }, desc: '果木炭火烤制，皮酥肉嫩，蘸甜面酱与葱丝，是宫廷御膳流入民间的代表。' },
  { code: 'TJ', name: '天津', fullName: '天津市', dish: '煎饼馃子', cuisine: '其他', region: '华北', taste: { 咸: 55, 甜: 20, 酸: 10, 辣: 5, 香: 60, 鲜: 50 }, desc: '绿豆面薄饼裹油条（馃子），刷甜面酱辣酱，是津门街头早餐之王。' },
  { code: 'HE', name: '河北', fullName: '河北省', dish: '驴肉火烧', cuisine: '冀菜', region: '华北', taste: { 咸: 70, 甜: 15, 酸: 10, 辣: 10, 香: 65, 鲜: 55 }, desc: '酥脆火烧夹卤制驴肉，咸香醇厚，有"天上龙肉，地上驴肉"之说。' },
  { code: 'SX', name: '山西', fullName: '山西省', dish: '刀削面', cuisine: '晋菜', region: '华北', taste: { 咸: 55, 甜: 10, 酸: 70, 辣: 10, 香: 50, 鲜: 45 }, desc: '中厚边薄的柳叶面，浇酸香浓郁的浇头，山西"醋乡"风味尽显。' },
  { code: 'NM', name: '内蒙古', fullName: '内蒙古自治区', dish: '手扒肉', cuisine: '蒙餐', region: '华北', taste: { 咸: 65, 甜: 10, 酸: 5, 辣: 5, 香: 70, 鲜: 60 }, desc: '带骨羊肉清水煮制，原汁原味，蘸韭菜花酱，草原牧民待客之礼。' },
  { code: 'LN', name: '辽宁', fullName: '辽宁省', dish: '朝鲜冷面', cuisine: '东北菜', region: '东北', taste: { 咸: 45, 甜: 40, 酸: 55, 辣: 30, 香: 50, 鲜: 55 }, desc: '荞麦冷面配牛肉汤、辣白菜与鸡蛋，冰凉爽口，酸甜微辣。' },
  { code: 'JL', name: '吉林', fullName: '吉林省', dish: '锅包肉', cuisine: '东北菜', region: '东北', taste: { 咸: 40, 甜: 60, 酸: 45, 辣: 10, 香: 55, 鲜: 45 }, desc: '猪里脊炸至金黄，浇糖醋汁，外酥里嫩，是东北宴席名菜。' },
  { code: 'HL', name: '黑龙江', fullName: '黑龙江省', dish: '锅包肉', cuisine: '东北菜', region: '东北', taste: { 咸: 40, 甜: 60, 酸: 45, 辣: 10, 香: 55, 鲜: 45 }, desc: '与吉林同源，哈尔滨版锅包肉讲究酸甜酥脆，是闯关东饮食的代表。' },
  { code: 'SH', name: '上海', fullName: '上海市', dish: '红烧肉', cuisine: '沪菜', region: '华东', taste: { 咸: 45, 甜: 70, 酸: 10, 辣: 5, 香: 60, 鲜: 55 }, desc: '浓油赤酱、冰糖收汁，肥而不腻，是海派家常菜的灵魂。' },
  { code: 'JS', name: '江苏', fullName: '江苏省', dish: '盐水鸭', cuisine: '苏菜', region: '华东', taste: { 咸: 60, 甜: 30, 酸: 10, 辣: 5, 香: 65, 鲜: 70 }, desc: '淮扬名菜，皮白肉嫩，咸鲜清香，被誉为"金陵第一味"。' },
  { code: 'ZJ', name: '浙江', fullName: '浙江省', dish: '西湖醋鱼', cuisine: '浙菜', region: '华东', taste: { 咸: 50, 甜: 55, 酸: 45, 辣: 5, 香: 55, 鲜: 70 }, desc: '草鱼活养后断生，浇糖醋汁，鱼肉鲜嫩，是杭帮菜招牌。' },
  { code: 'AH', name: '安徽', fullName: '安徽省', dish: '臭鳜鱼', cuisine: '徽菜', region: '华东', taste: { 咸: 65, 甜: 15, 酸: 25, 辣: 15, 香: 60, 鲜: 70 }, desc: '鳜鱼微发酵后红烧，闻着臭吃着香，是徽菜"重风味"的极致。' },
  { code: 'FJ', name: '福建', fullName: '福建省', dish: '佛跳墙', cuisine: '闽菜', region: '华东', taste: { 咸: 55, 甜: 30, 酸: 10, 辣: 5, 香: 80, 鲜: 85 }, desc: '鲍参翅肚十余种食材入坛慢煨，醇厚鲜香，"坛启荤香飘四邻"。' },
  { code: 'JX', name: '江西', fullName: '江西省', dish: '粉蒸肉', cuisine: '赣菜', region: '华东', taste: { 咸: 60, 甜: 30, 酸: 10, 辣: 45, 香: 65, 鲜: 55 }, desc: '米粉裹五花肉蒸制，软糯油润，是赣菜"咸辣鲜香"的代表。' },
  { code: 'SD', name: '山东', fullName: '山东省', dish: '葱烧海参', cuisine: '鲁菜', region: '华东', taste: { 咸: 65, 甜: 25, 酸: 10, 辣: 10, 香: 70, 鲜: 80 }, desc: '水发海参配章丘大葱烧制，咸鲜醇厚，是鲁菜"咸鲜"的标杆。' },
  { code: 'HA', name: '河南', fullName: '河南省', dish: '烩面', cuisine: '豫菜', region: '华中', taste: { 咸: 60, 甜: 20, 酸: 15, 辣: 15, 香: 55, 鲜: 60 }, desc: '羊汤烩宽面，汤白味鲜，配粉丝木耳，中原第一大面。' },
  { code: 'HB', name: '湖北', fullName: '湖北省', dish: '清蒸武昌鱼', cuisine: '鄂菜', region: '华中', taste: { 咸: 50, 甜: 25, 酸: 10, 辣: 20, 香: 55, 鲜: 80 }, desc: '武昌鱼清蒸淋豉油，"才饮长沙水，又食武昌鱼"名扬天下。' },
  { code: 'HN', name: '湖南', fullName: '湖南省', dish: '剁椒鱼头', cuisine: '湘菜', region: '华中', taste: { 咸: 55, 甜: 20, 酸: 15, 辣: 85, 香: 60, 鲜: 70 }, desc: '胖头鱼头铺满剁椒清蒸，鲜辣入味，是湘菜"无辣不欢"的灵魂。' },
  { code: 'GD', name: '广东', fullName: '广东省', dish: '白切鸡', cuisine: '粤菜', region: '华南', taste: { 咸: 45, 甜: 20, 酸: 5, 辣: 5, 香: 55, 鲜: 90 }, desc: '浸熟后过冰水，皮爽肉滑，蘸姜葱蓉，尽显粤菜"鲜"字真谛。' },
  { code: 'GX', name: '广西', fullName: '广西壮族自治区', dish: '螺蛳粉', cuisine: '桂菜', region: '华南', taste: { 咸: 60, 甜: 10, 酸: 65, 辣: 55, 香: 55, 鲜: 60 }, desc: '酸笋与螺蛳熬汤，酸辣臭香俱全，是柳州现象级小吃。' },
  { code: 'HI', name: '海南', fullName: '海南省', dish: '文昌鸡', cuisine: '琼菜', region: '华南', taste: { 咸: 45, 甜: 20, 酸: 5, 辣: 5, 香: 55, 鲜: 85 }, desc: '海南四大名菜之首，皮薄肉嫩，白切蘸蒜蓉酱油，椰香隐约。' },
  { code: 'CQ', name: '重庆', fullName: '重庆市', dish: '重庆火锅', cuisine: '渝菜', region: '西南', taste: { 咸: 55, 甜: 15, 酸: 15, 辣: 95, 香: 70, 鲜: 60 }, desc: '牛油锅底红亮醇厚，毛肚鸭肠"七上八下"，山城热辣文化的缩影。' },
  { code: 'SC', name: '四川', fullName: '四川省', dish: '麻婆豆腐', cuisine: '川菜', region: '西南', taste: { 咸: 55, 甜: 20, 酸: 10, 辣: 90, 香: 65, 鲜: 65 }, desc: '豆瓣与花椒同烧，麻、辣、烫、鲜、嫩、香六味俱全，川菜符号。' },
  { code: 'GZ', name: '贵州', fullName: '贵州省', dish: '酸汤鱼', cuisine: '黔菜', region: '西南', taste: { 咸: 50, 甜: 10, 酸: 80, 辣: 60, 香: 55, 鲜: 65 }, desc: '番茄酸汤煮鱼，加木姜子与糟辣椒，酸辣开胃，黔地少数民族风味。' },
  { code: 'YN', name: '云南', fullName: '云南省', dish: '过桥米线', cuisine: '滇菜', region: '西南', taste: { 咸: 50, 甜: 15, 酸: 20, 辣: 30, 香: 60, 鲜: 75 }, desc: '滚汤烫熟生片与米线，配料丰盈，是滇味"鲜"的代表。' },
  { code: 'XZ', name: '西藏', fullName: '西藏自治区', dish: '酥油茶', cuisine: '藏餐', region: '西南', taste: { 咸: 70, 甜: 30, 酸: 5, 辣: 5, 香: 65, 鲜: 40 }, desc: '酥油与浓茶捶打交融，咸香浓醇，高原御寒保暖的必备饮品。' },
  { code: 'SN', name: '陕西', fullName: '陕西省', dish: '羊肉泡馍', cuisine: '秦菜', region: '西北', taste: { 咸: 65, 甜: 15, 酸: 10, 辣: 25, 香: 70, 鲜: 60 }, desc: '掰馍煮羊肉汤，配辣酱糖蒜，是关中"泡馍"文化的结晶。' },
  { code: 'GS', name: '甘肃', fullName: '甘肃省', dish: '兰州牛肉面', cuisine: '西北菜', region: '西北', taste: { 咸: 60, 甜: 10, 酸: 15, 辣: 35, 香: 60, 鲜: 70 }, desc: '一清二白三红四绿五黄，辣子红油香而不燥，西北面食名片。' },
  { code: 'QH', name: '青海', fullName: '青海省', dish: '手抓羊肉', cuisine: '西北菜', region: '西北', taste: { 咸: 65, 甜: 10, 酸: 5, 辣: 5, 香: 70, 鲜: 60 }, desc: '清水煮羊肉手抓而食，原味鲜嫩，配椒盐蒜片，高原牧区至味。' },
  { code: 'NX', name: '宁夏', fullName: '宁夏回族自治区', dish: '烩羊杂', cuisine: '西北菜', region: '西北', taste: { 咸: 65, 甜: 10, 酸: 15, 辣: 30, 香: 65, 鲜: 60 }, desc: '羊心肝肚肠烩汤，撒辣油香菜，是回乡早餐的暖胃首选。' },
  { code: 'XJ', name: '新疆', fullName: '新疆维吾尔自治区', dish: '大盘鸡', cuisine: '新疆菜', region: '西北', taste: { 咸: 55, 甜: 20, 酸: 15, 辣: 50, 香: 75, 鲜: 60 }, desc: '鸡块土豆爆炒炖煮，配皮带面吸汁，天山南北的豪放滋味。' },
  { code: 'HK', name: '香港', fullName: '香港特别行政区', dish: '叉烧', cuisine: '港澳菜', region: '华南', taste: { 咸: 50, 甜: 55, 酸: 10, 辣: 5, 香: 70, 鲜: 60 }, desc: '梅头肉蜜汁烧烤，外焦里嫩，港式茶餐厅的必备经典。' },
  { code: 'MO', name: '澳门', fullName: '澳门特别行政区', dish: '葡国鸡', cuisine: '港澳菜', region: '华南', taste: { 咸: 50, 甜: 35, 酸: 20, 辣: 5, 香: 75, 鲜: 65 }, desc: '鸡肉土豆椰奶焖煮，融合葡式与粤式，是中西饮食交融的见证。' },
  { code: 'TW', name: '台湾', fullName: '台湾省', dish: '卤肉饭', cuisine: '台菜', region: '华东', taste: { 咸: 60, 甜: 35, 酸: 10, 辣: 10, 香: 65, 鲜: 65 }, desc: '碎卤肉浇米饭，酱香微甜，是宝岛街头最治愈的家常味。' },
];

export function getProvince(code: string): ProvinceFood | undefined {
  return PROVINCE_FOODS.find((p) => p.code === code);
}
