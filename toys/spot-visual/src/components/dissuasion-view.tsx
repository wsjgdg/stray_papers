'use client';

// ═══ 劝退日记 · 反向游记主视图 ═══
// D3.1: 劝退日记主视图
// 用户浏览和筛选已记录的劝退日记

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookX, Plus, Trash2, ThumbsUp, Filter, Search, X } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { DISSUASION_TAGS, type DissuasionRecord } from '@/lib/spot-data';
import DissuasionEditor from './dissuasion-editor';

/* ═══ 翻车标签的颜色映射 ═══ */
function getTagStyle(tagId: string): string {
  const colors: Record<string, string> = {
    queue: 'bg-red-100 text-red-700',
    closed: 'bg-amber-100 text-amber-700',
    fake: 'bg-purple-100 text-purple-700',
    expensive: 'bg-orange-100 text-orange-700',
    toilet: 'bg-yellow-100 text-yellow-700',
    parking: 'bg-blue-100 text-blue-700',
    sun: 'bg-rose-100 text-rose-700',
    stairs: 'bg-lime-100 text-lime-700',
    crowded: 'bg-gray-100 text-gray-700',
    signal: 'bg-slate-100 text-slate-700',
    food: 'bg-green-100 text-green-700',
    danger: 'bg-red-100 text-red-700',
  };
  return colors[tagId] || 'bg-gray-100 text-gray-600';
}

/* ═══ 单个日记卡片 ═══ */
function DissuasionCard({ record, onVote, onDelete }: {
  record: DissuasionRecord;
  onVote: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const timeStr = new Date(record.timestamp).toLocaleDateString('zh-CN', {
    month: 'short', day: 'numeric',
  });

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
    >
      <div className="p-4">
        {/* 头部 */}
        <div className="flex items-start justify-between mb-2">
          <div>
            <h4 className="text-sm font-bold text-gray-900">{record.spotName}</h4>
            <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
              <span>{timeStr}</span>
              <span>·</span>
              <span>{record.timePeriod}</span>
            </div>
          </div>
          <button
            onClick={() => onDelete(record.id)}
            className="w-7 h-7 rounded-full bg-gray-100 hover:bg-red-100 flex items-center justify-center transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
          </button>
        </div>

        {/* 翻车标签 */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {record.tags.map(tagId => {
            const tag = DISSUASION_TAGS.find(t => t.id === tagId);
            if (!tag) return null;
            return (
              <span key={tagId} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${getTagStyle(tagId)}`}>
                {tag.emoji} {tag.label}
              </span>
            );
          })}
        </div>

        {/* 评论 */}
        {record.comment && (
          <p className="text-xs text-gray-600 leading-relaxed mb-3 bg-gray-50 rounded-xl p-3">
            &ldquo;{record.comment}&rdquo;
          </p>
        )}

        {/* 底部操作 */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {record.bodyConditions.map(bc => (
              <span key={bc} className="text-[10px] text-gray-400">
                {bc === 'knee' ? '🦵' : bc === 'heart' ? '❤️' : '🌡️'}
              </span>
            ))}
          </div>
          <button
            onClick={() => onVote(record.id)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-50 hover:bg-emerald-50 transition-colors text-xs"
          >
            <ThumbsUp className="w-3 h-3" />
            <span className="font-medium">{record.voteCount}</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════
   劝退日记主页面
   ═══════════════════════════════════════════════════ */
export default function DissuasionView() {
  const { dissuasionRecords, addDissuasionRecord, removeDissuasionRecord, voteDissuasionRecord } = useAppStore();
  const [showEditor, setShowEditor] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTag, setFilterTag] = useState<string | null>(null);

  // 过滤和搜索
  const filtered = useMemo(() => {
    let items = dissuasionRecords;
    if (filterTag) {
      items = items.filter(r => r.tags.includes(filterTag));
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(r =>
        r.spotName.toLowerCase().includes(q) ||
        r.comment.toLowerCase().includes(q)
      );
    }
    return items.sort((a, b) => b.timestamp - a.timestamp);
  }, [dissuasionRecords, filterTag, searchQuery]);

  // 统计
  const stats = useMemo(() => ({
    total: dissuasionRecords.length,
    tags: DISSUASION_TAGS.map(t => ({
      ...t,
      count: dissuasionRecords.filter(r => r.tags.includes(t.id)).length,
    })).filter(t => t.count > 0),
  }), [dissuasionRecords]);

  return (
    <div className="min-h-full bg-gray-50/50">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
        {/* 标题 */}
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center shadow-lg">
            <BookX className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">劝退日记</h2>
            <p className="text-xs text-gray-500">记录那些让你后悔的景点 · {dissuasionRecords.length} 条记录</p>
          </div>
        </div>

        {/* 搜索 + 新增 */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              placeholder="搜索景点或评论…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-8 h-10 bg-white rounded-xl border border-gray-200 text-sm outline-none focus:border-rose-300 transition-colors"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowEditor(true)}
            className="flex items-center gap-1.5 px-4 h-10 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 text-white text-sm font-bold shadow-lg hover:shadow-xl transition-shadow"
          >
            <Plus className="w-4 h-4" />
            记录
          </button>
        </div>

        {/* 翻车统计标签云 */}
        {stats.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {stats.tags.map(t => (
              <button
                key={t.id}
                onClick={() => setFilterTag(filterTag === t.id ? null : t.id)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                  filterTag === t.id
                    ? 'ring-2 ring-rose-300 bg-rose-50 text-rose-700'
                    : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
                }`}
              >
                {t.emoji} {t.label} ({t.count})
              </button>
            ))}
          </div>
        )}

        {/* 列表 */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <BookX className="w-12 h-12 text-gray-300 mb-4" />
            <p className="text-gray-500 font-medium mb-1">
              {dissuasionRecords.length === 0 ? '还没有劝退记录' : '没有匹配的记录'}
            </p>
            <p className="text-sm text-gray-400 mb-4">
              {dissuasionRecords.length === 0 ? '点击「记录」分享你的翻车经历' : '试试其他筛选条件'}
            </p>
            {dissuasionRecords.length === 0 && (
              <button
                onClick={() => setShowEditor(true)}
                className="px-4 py-2 bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-xl text-sm font-bold shadow-lg"
              >
                写第一条日记
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {filtered.map(r => (
                <DissuasionCard
                  key={r.id}
                  record={r}
                  onVote={voteDissuasionRecord}
                  onDelete={removeDissuasionRecord}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* 编辑器弹窗 */}
      <AnimatePresence>
        {showEditor && (
          <DissuasionEditor
            onSave={(record) => {
              addDissuasionRecord(record);
              setShowEditor(false);
            }}
            onClose={() => setShowEditor(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}