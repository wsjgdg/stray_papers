// ═══ 景点数据类型 ═══
export interface Spot {
  id: string;
  name: string;
  image: string;
  photos?: string[];
  address: string;
  facilities: string[];
  projects: string[];
  category: string;
  description: string;
  location?: unknown;
}

// ═══ 分类颜色映射 ═══
export const CATEGORY_COLORS: Record<string, string> = {
  '自然风光': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '自然风景': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '历史人文': 'bg-amber-50 text-amber-700 border-amber-200',
  '历史文化': 'bg-amber-50 text-amber-700 border-amber-200',
  '主题乐园': 'bg-pink-50 text-pink-700 border-pink-200',
  '城市地标': 'bg-slate-100 text-slate-700 border-slate-200',
  '海滨度假': 'bg-sky-50 text-sky-700 border-sky-200',
  '山岳景区': 'bg-lime-50 text-lime-700 border-lime-200',
  '古镇村落': 'bg-orange-50 text-orange-700 border-orange-200',
  '宗教寺庙': 'bg-violet-50 text-violet-700 border-violet-200',
  '美食小吃': 'bg-rose-50 text-rose-700 border-rose-200',
  '轻运动': 'bg-teal-50 text-teal-700 border-teal-200',
};

// ═══ 分类主题色（用于占位图） ═══
export const CATEGORY_THEME: Record<string, { from: string; to: string; icon: string }> = {
  '自然风光': { from: '#D1FAE5', to: '#A7F3D0', icon: '🌲' },
  '自然风景': { from: '#D1FAE5', to: '#A7F3D0', icon: '🌲' },
  '历史人文': { from: '#FEF3C7', to: '#FDE68A', icon: '🏛️' },
  '历史文化': { from: '#FEF3C7', to: '#FDE68A', icon: '🏛️' },
  '主题乐园': { from: '#FCE7F3', to: '#FBCFE8', icon: '🎡' },
  '城市地标': { from: '#F1F5F9', to: '#E2E8F0', icon: '🏙️' },
  '海滨度假': { from: '#E0F2FE', to: '#BAE6FD', icon: '🏖️' },
  '山岳景区': { from: '#ECFCCB', to: '#D9F99D', icon: '⛰️' },
  '古镇村落': { from: '#FFEDD5', to: '#FED7AA', icon: '🏘️' },
  '宗教寺庙': { from: '#EDE9FE', to: '#DDD6FE', icon: '⛩️' },
  '美食小吃': { from: '#FFE4E6', to: '#FECDD3', icon: '🍜' },
  '轻运动':   { from: '#CCFBF1', to: '#99F6E4', icon: '🚴' },
};

// ═══ 分类 → 本地图片池（API 降级用，全部为通过 API 验证的真实 URL） ═══
const CATEGORY_PHOTOS: Record<string, string[]> = {
  '自然风光': [
    'https://images.unsplash.com/photo-1598439473183-42c9301db5dc?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1615134732800-ca7ef7a3388c?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1683041132892-0fe990b3afc3?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1658056366953-e2e93b1c1099?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1664604655363-f6050b3ca4d8?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1596905738125-a6b51b1bdbb6?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1700148676800-a12f8a016deb?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1732808460864-b8e5eb489a52?w=800&h=500&fit=crop&q=80',
  ],
  '自然风景': [
    'https://images.unsplash.com/photo-1598439473183-42c9301db5dc?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1615134732800-ca7ef7a3388c?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1683041132892-0fe990b3afc3?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1658056366953-e2e93b1c1099?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1664604655363-f6050b3ca4d8?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1596905738125-a6b51b1bdbb6?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1700148676800-a12f8a016deb?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1732808460864-b8e5eb489a52?w=800&h=500&fit=crop&q=80',
  ],
  '历史人文': [
    'https://images.unsplash.com/photo-1628620843425-75da163c80f2?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1512102917795-4edc80a0aa63?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1514461835410-ddd29ff89d14?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1522787345986-d5c7885a889e?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1458022799175-1eb17cf09d90?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1697455621145-c688d7558143?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1649523217385-f27a01e148dc?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1777245144514-7ed23da44abb?w=800&h=500&fit=crop&q=80',
  ],
  '历史文化': [
    'https://images.unsplash.com/photo-1628620843425-75da163c80f2?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1512102917795-4edc80a0aa63?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1514461835410-ddd29ff89d14?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1522787345986-d5c7885a889e?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1458022799175-1eb17cf09d90?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1697455621145-c688d7558143?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1649523217385-f27a01e148dc?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1777245144514-7ed23da44abb?w=800&h=500&fit=crop&q=80',
  ],
  '主题乐园': [
    'https://images.unsplash.com/photo-1502136969935-8d8eef54d77b?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1627035983655-0ceec61bb733?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1615493749624-7a97d4b18fe6?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1761242606389-0a45db29fdee?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1669570083880-0d9cb0ad1dea?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1613546167482-b3280d75f796?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1567617849031-8655483b300b?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1707112244220-6cc774e9ac15?w=800&h=500&fit=crop&q=80',
  ],
  '城市地标': [
    'https://images.unsplash.com/photo-1554793000-245d3a3c2a51?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1487506878145-e78516feade7?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1683041134049-28843fae8c1f?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1771945031979-55fa29dd9716?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1636834620871-d22004dd9e07?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1773852031792-fbb826750ded?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1505617483630-e5a543eaaa86?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1761727946659-27115be461ed?w=800&h=500&fit=crop&q=80',
  ],
  '海滨度假': [
    'https://images.unsplash.com/photo-1650970366119-34cb82f8b4c1?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1611946022552-d2ca5ffba186?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1617371067811-6f7535979874?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1631535152690-ba1a85229136?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1701785924585-d2b4bc6a66cf?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1660486358484-975da44dc68e?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1660486360130-02ec33fa1ccb?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1660486358746-8bc9f2a94496?w=800&h=500&fit=crop&q=80',
  ],
  '山岳景区': [
    'https://images.unsplash.com/photo-1558469070-b0bb906830a2?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1583606317098-8926d58c73c6?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1664648853617-127a94346600?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1613587905169-736ffb75de9e?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1661901697097-ed11697502f4?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1630562392473-83a289d6155f?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1616794448732-17b953353db0?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1603893964388-18a64012afea?w=800&h=500&fit=crop&q=80',
  ],
  '古镇村落': [
    'https://images.unsplash.com/photo-1605096048662-5ab61695a122?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1611144222869-ca3d1bafa89c?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1653931565039-c500acbb31d2?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1667831083048-4ddd6a8cd4db?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1766337996174-d6766b8ce932?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1761552505189-3933cea126f7?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1783441113959-945f3774a320?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1762996770562-ffce7254c4cc?w=800&h=500&fit=crop&q=80',
  ],
  '宗教寺庙': [
    'https://images.unsplash.com/photo-1530634082454-f57b7d567b25?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1543160058-bb08f2f22c21?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1580355275559-10c832e123f1?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1713346643669-ab7793501846?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1575642158817-5bc47aea404f?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1562777578-3e432ed38f03?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1740203493443-b17b8d904405?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1583200698551-6b032ba0f19f?w=800&h=500&fit=crop&q=80',
  ],
  '美食小吃': [
    'https://images.unsplash.com/photo-1552912470-ee2e96439539?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1506781961370-37a89d6b3095?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1628324716243-0c9c29971a58?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1718942900361-d01a1ee8d077?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1471110338536-858caa3dbe45?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1545324053-41b04f1a8e8a?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1506159094651-959dec66fac6?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1711127498984-84bea628db02?w=800&h=500&fit=crop&q=80',
  ],
  '轻运动': [
    'https://images.unsplash.com/photo-1603102859961-64b17d43580d?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1456613820599-bfe244172af5?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1615632778185-48e15a6f68bf?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1764067522124-b51d909061a6?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1760115338751-cc810cb0a591?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1774050021466-369013ca33ef?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1607429289025-ee36ac310746?w=800&h=500&fit=crop&q=80',
    'https://images.unsplash.com/photo-1610432151528-67e398f52d0a?w=800&h=500&fit=crop&q=80',
  ],
};

// 通用风景图（未知分类时使用）
const FALLBACK_PHOTOS = [
  'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&h=500&fit=crop&q=80',
  'https://images.unsplash.com/photo-1438786657495-640937046d18?w=800&h=500&fit=crop&q=80',
  'https://images.unsplash.com/photo-1598439473183-42c9301db5dc?w=800&h=500&fit=crop&q=80',
  'https://images.unsplash.com/photo-1615134732800-ca7ef7a3388c?w=800&h=500&fit=crop&q=80',
  'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&h=500&fit=crop&q=80',
  'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800&h=500&fit=crop&q=80',
  'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&h=500&fit=crop&q=80',
  'https://images.unsplash.com/photo-1470071459604-3b5ec3a7b628?w=800&h=500&fit=crop&q=80',
];

// ═══ 按分类追踪已用索引，确保同分类内不重复分配 ═══
const _usedIndices: Map<string, Set<number>> = new Map();

/**
 * 同步降级：从本地图片池取一张图。仅在 API 失败时使用。
 * 按分类独立追踪已用索引，同分类内不重复；池耗尽后从头轮换。
 */
export function getCategoryImageUrl(category: string, _index?: number): string {
  const pool = CATEGORY_PHOTOS[category] || FALLBACK_PHOTOS;
  if (pool.length === 0) return '';

  // 如果调用方指定了索引，直接用
  if (_index !== undefined) return pool[_index % pool.length];

  // 按分类获取已用索引集合
  let used = _usedIndices.get(category);
  if (!used) { used = new Set(); _usedIndices.set(category, used); }

  // 找一个未使用的索引
  let idx = -1;
  for (let i = 0; i < pool.length; i++) {
    if (!used.has(i)) { idx = i; break; }
  }

  // 池内全部用过，清空重轮
  if (idx === -1) {
    used.clear();
    idx = 0;
  }

  used.add(idx);
  return pool[idx];
}

export const DEFAULT_CATEGORIES = ['自然风光', '历史人文', '主题乐园', '城市地标', '海滨度假', '山岳景区', '古镇村落', '宗教寺庙'];

export const getCategoryColor = (cat: string) => CATEGORY_COLORS[cat] || 'bg-gray-100 text-gray-600 border-gray-200';

// ═══ 分类图标名映射 ═══
export const CATEGORY_ICON_NAMES: Record<string, string> = {
  '自然风光': 'TreePine', '自然风景': 'TreePine',
  '历史人文': 'Landmark', '历史文化': 'Landmark',
  '主题乐园': 'Sparkles', '城市地标': 'Building2',
  '海滨度假': 'Waves', '山岳景区': 'Mountain',
  '古镇村落': 'HomeIcon', '宗教寺庙': 'Church',
  '美食小吃': 'UtensilsCrossed', '轻运动': 'Bike',
};

// ═══ 解析坐标 ═══
export function parseCoords(spot: Spot): { lat: number; lng: number } | null {
  const loc = spot.location;
  if (!loc) return null;
  if (typeof loc === 'object' && !Array.isArray(loc)) {
    const o = loc as Record<string, unknown>;
    const lat = Number(o.lat ?? o.latitude ?? o.y);
    const lng = Number(o.lng ?? o.lon ?? o.longitude ?? o.x);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
  }
  if (Array.isArray(loc) && loc.length >= 2) {
    const lat = Number(loc[0]), lng = Number(loc[1]);
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
  }
  if (typeof loc === 'string') {
    const nums = loc.match(/-?\d+\.?\d*/g)?.map(Number).filter(n => !isNaN(n));
    if (nums && nums.length >= 2) return { lat: nums[0], lng: nums[1] };
  }
  return null;
}

// ═══ 提取区域 ═══
export function getDistrict(address: string): string {
  const m = address.match(/(.{2,6}市)(.{2,4}[区县市])/);
  return m ? m[0] : address.slice(0, 8) || '未知区域';
}

// ═══ 导入 JSON 解析 ═══
export function parseImportedSpots(raw: unknown): Spot[] {
  let arr: unknown[] = Array.isArray(raw) ? raw : [];
  if (!Array.isArray(raw) && raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const candidate = obj.data ?? obj.spots ?? obj.list ?? obj.items;
    if (Array.isArray(candidate)) arr = candidate;
  }
  return arr.filter((item) => { const o = item as Record<string, unknown>; return o.name && typeof o.name === 'string'; })
    .map((item, idx) => {
      const o = item as Record<string, unknown>;
      // photos
      const rawPhotos = o.photo ?? o.photos ?? o.images ?? o.pictures;
      let photos: string[] = [];
      if (Array.isArray(rawPhotos)) photos = rawPhotos.map(String).filter(p => p.startsWith('http'));
      else if (typeof rawPhotos === 'string' && rawPhotos.startsWith('http')) photos = [rawPhotos];
      const image = photos[0] || String(o.image || o.cover || o.pic || o.imageUrl || o.thumb || '');
      const extraPhotos = photos.length > 1 ? photos.slice(1) : undefined;
      // facilities / projects
      const parseArr = (v: unknown): string[] => {
        if (Array.isArray(v)) return v.map(String);
        if (typeof v === 'string') return v.split(/[,，、;；|]/).map(s => s.trim()).filter(Boolean);
        return [];
      };
      return {
        id: String(o.id || `imp-${Date.now()}-${idx}`),
        name: String(o.name || ''),
        image: image || '',  // 空字符串 = 需要从 API 拉取或降级
        photos: extraPhotos,
        address: String(o.address || o.location_addr || o.addr || ''),
        facilities: parseArr(o.facilities ?? o.facility),
        projects: parseArr(o.projects ?? o.project ?? o.activities),
        category: String(o.category || o.type || o.classify || o.tag || '其他'),
        description: String(o.description || o.intro || o.desc || o.about || o.content || ''),
        location: o.location ?? o.coord ?? o.coordinates ?? o.lat_lng ?? o.lng_lat,
      };
    });
}

// ═══ 示例景点数据（含坐标） ═══
export const sampleSpots: Spot[] = [
  {
    id: '1', name: '张家界国家森林公园',
    image: getCategoryImageUrl('自然风光', 0),
    address: '湖南省张家界市武陵源区',
    facilities: ['游客中心', '索道', '环保车', '餐厅', '医务室', '停车场'],
    projects: ['天门山玻璃栈道', '百龙天梯', '金鞭溪徒步', '袁家界观景台', '天子山云海'],
    category: '自然风光',
    description: '张家界国家森林公园是中国第一个国家森林公园，以独特的石英砂岩峰林地貌闻名于世。公园内有三千多座形态各异的奇峰，被誉为"缩小的仙境，放大的盆景"。电影《阿凡达》中悬浮山的原型就取景于此。这里四季分明，春赏百花、夏避酷暑、秋观红叶、冬览雪景。',
    location: { lat: 29.3249, lng: 110.4343 },
  },
  {
    id: '2', name: '故宫博物院',
    image: getCategoryImageUrl('历史人文', 0),
    address: '北京市东城区景山前街4号',
    facilities: ['语音导览', '文创商店', '餐厅', '无障碍通道', '存包处', '母婴室'],
    projects: ['太和殿参观', '珍宝馆', '钟表馆', '御花园漫步', '数字故宫体验'],
    category: '历史人文',
    description: '故宫博物院又称紫禁城，建于明永乐十八年（1420年），是中国明清两代的皇家宫殿，也是世界上现存规模最大、保存最完整的木质结构古建筑群。占地面积72万平方米，馆藏文物超过186万件。',
    location: { lat: 39.9163, lng: 116.3972 },
  },
  {
    id: '3', name: '上海迪士尼乐园',
    image: getCategoryImageUrl('主题乐园', 0),
    address: '上海市浦东新区川沙镇黄赵路310号',
    facilities: ['主题酒店', '停车场', '婴儿车租赁', '轮椅租赁', '寄存柜', '急救站'],
    projects: ['创极速光轮', '翱翔·飞越地平线', '加勒比海盗', '七个小矮人矿山车', '奇幻童话城堡'],
    category: '主题乐园',
    description: '上海迪士尼乐园是中国内地首座迪士尼主题乐园，拥有七大主题园区，包括全球最大的迪士尼城堡——奇幻童话城堡。融合了中国传统文化元素与迪士尼经典故事。',
    location: { lat: 31.1440, lng: 121.6570 },
  },
  {
    id: '4', name: '广州塔',
    image: getCategoryImageUrl('城市地标', 0),
    address: '广东省广州市海珠区阅江西路222号',
    facilities: ['观光层', '旋转餐厅', '户外观景平台', '纪念品商店', '电梯', '地下停车场'],
    projects: ['488米户外观景台', '极速云霄跳楼机', '摩天轮', '珠江夜游'],
    category: '城市地标',
    description: '广州塔又称"小蛮腰"，总高度600米，是中国第一高塔。塔身采用独特的扭转造型，拥有世界最高的户外观景平台、横向摩天轮和垂直速降体验项目。',
    location: { lat: 23.1066, lng: 113.3245 },
  },
  {
    id: '5', name: '三亚亚龙湾',
    image: getCategoryImageUrl('海滨度假', 0),
    address: '海南省三亚市吉阳区亚龙湾',
    facilities: ['更衣室', '淋浴间', '防晒用品店', '潜水中心', '餐饮区', '救生站'],
    projects: ['沙滩漫步', '潜水体验', '帆船出海', '摩托艇', '海边瑜伽'],
    category: '海滨度假',
    description: '亚龙湾被誉为"天下第一湾"，拥有7.5公里长的银白色海滩，沙质细腻、海水清澈见底。年均气温25.5°C，终年可游泳，是中国南方最理想的海滨度假胜地。',
    location: { lat: 18.1920, lng: 109.6387 },
  },
  {
    id: '6', name: '黄山风景区',
    image: getCategoryImageUrl('山岳景区', 0),
    address: '安徽省黄山市黄山区汤口镇',
    facilities: ['索道', '山上酒店', '环保车', '医疗点', '餐厅', '行李托运'],
    projects: ['迎客松打卡', '光明顶日出', '西海大峡谷', '飞来石', '云谷寺徒步'],
    category: '山岳景区',
    description: '黄山以奇松、怪石、云海、温泉、冬雪"五绝"著称于世，被列为世界文化与自然双重遗产。主峰莲花峰海拔1864.8米。徐霞客曾赞叹："登黄山，天下无山，观止矣！"',
    location: { lat: 30.1374, lng: 118.1694 },
  },
  {
    id: '7', name: '丽江古城',
    image: getCategoryImageUrl('古镇村落', 0),
    address: '云南省丽江市古城区',
    facilities: ['特色客栈', '美食街', '酒吧街', '手工艺品店', '导游服务'],
    projects: ['四方街夜游', '木府参观', '纳西古乐欣赏', '黑龙潭公园', '束河古镇'],
    category: '古镇村落',
    description: '丽江古城始建于宋末元初，距今已有800多年历史。融合了纳西族、汉族、白族等多个民族的建筑风格与文化传统，是中国以整座古城申报世界文化遗产获得成功的两座古城之一。',
    location: { lat: 26.8721, lng: 100.2259 },
  },
  {
    id: '8', name: '少林寺',
    image: getCategoryImageUrl('宗教寺庙', 0),
    address: '河南省郑州市登封市嵩山五乳峰下',
    facilities: ['停车场', '游客中心', '纪念品商店', '素斋餐厅', '讲解服务', '医务室'],
    projects: ['少林功夫表演', '塔林参观', '达摩洞朝拜', '武术体验课', '嵩山游览'],
    category: '宗教寺庙',
    description: '少林寺始建于北魏太和十九年（495年），是汉传佛教的禅宗祖庭，也是少林武术的发源地。少林功夫以刚柔并济、内外兼修的特点享誉世界，千佛殿内的五百罗汉壁画是不可多得的艺术珍品。',
    location: { lat: 34.5082, lng: 112.9365 },
  },
  {
    id: '9', name: '九寨沟风景区',
    image: getCategoryImageUrl('自然风光', 1),
    address: '四川省阿坝藏族羌族自治州九寨沟县',
    facilities: ['观光车', '栈道', '餐厅', '环保厕所', '氧气站', '纪念品店'],
    projects: ['五花海', '珍珠滩瀑布', '诺日朗瀑布', '长海', '镜海倒影'],
    category: '自然风光',
    description: '九寨沟以翠海、叠瀑、彩林、雪峰、藏情"五绝"闻名。景区内共有114个海子，湖水清澈见底，色彩斑斓变幻。秋季漫山遍野的彩林倒映在碧蓝的湖水中，如同人间仙境。',
    location: { lat: 33.2600, lng: 103.9200 },
  },
  {
    id: '10', name: '长城·八达岭',
    image: getCategoryImageUrl('历史人文', 1),
    address: '北京市延庆区G6京藏高速58号出口',
    facilities: ['缆车', '滑车', '停车场', '游客中心', '无障碍通道', '餐饮服务'],
    projects: ['北八楼登顶', '南长城徒步', '长城夜景', '好汉坡打卡', '熊乐园'],
    category: '历史人文',
    description: '八达岭长城是万里长城中最具代表性的段落，始建于明弘治十八年（1505年），海拔高度达1015米。"不到长城非好汉"使其成为到北京的必游之地。',
    location: { lat: 40.3588, lng: 116.0198 },
  },
  {
    id: '11', name: '长隆海洋王国',
    image: getCategoryImageUrl('主题乐园', 1),
    address: '广东省珠海市横琴新区富祥湾长隆海洋王国',
    facilities: ['主题酒店', '亲子设施', '轮椅租赁', '婴儿车租赁', '餐厅', '急救站'],
    projects: ['鲸鲨馆', '白鲸剧场', '海豚剧场', '鹦鹉过山车', '超级激流'],
    category: '主题乐园',
    description: '长隆海洋王国是全球最大的海洋主题乐园之一，拥有多项吉尼斯世界纪录：全球最大的海洋鱼类展馆、最大的亚克力玻璃观景窗等。夜间烟花无人机汇演令人叹为观止。',
    location: { lat: 22.0996, lng: 113.5338 },
  },
  {
    id: '12', name: '鼓浪屿',
    image: getCategoryImageUrl('海滨度假', 1),
    address: '福建省厦门市思明区鼓浪屿',
    facilities: ['轮渡码头', '特色民宿', '美食街', '导游服务', '公共厕所', '急救站'],
    projects: ['日光岩登顶', '菽庄花园', '皓月园', '风琴博物馆', '环岛漫步'],
    category: '海滨度假',
    description: '鼓浪屿面积仅1.88平方公里，完好地保留了上千幢中外风格各异的建筑物，被誉为"万国建筑博览"。还被誉为"钢琴之岛"和"音乐之岛"，被列为世界文化遗产。',
    location: { lat: 24.4488, lng: 118.0646 },
  },
];