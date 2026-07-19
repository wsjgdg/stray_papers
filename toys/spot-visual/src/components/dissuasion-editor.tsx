'use client';

// ═══ 劝退日记编辑器 ═══
// D3.2: 劝退日记编辑器
// 用户撰写翻车经历的表单

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, MapPin, Send } from 'lucide-react';
import { DISSUASION_TAGS, type DissuasionRecord } from '@/lib/spot-data';
import { useAppStore } from '@/lib/store';

const TIME_PERIODS = ['清晨', '正午', '黄昏'];
const BODY_CONDITIONS = [
  { id: 'knee', label: '膝盖不适', emoji: '🦵' },
  { id: 'heart', label: '心脏负担', emoji: '❤️' },
  { id: 'heat', label: '怕热中暑', emoji: '🌡️' },
];

export default function DissuasionEditor({ onSave, onClose }: {
  onSave: (record: DissuasionRecord) => void;
  onClose: () => void;
}) {
  const { spots } = useAppStore();
  const [selectedSpot, setSelectedSpot] = useState<string>('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [timePeriod, setTimePeriod] = useState('正午');
  const [bodyConditions, setBodyConditions] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [searchSpot, setSearchSpot] = useState('');

  // 景点搜索过滤
  const filteredSpots = spots.filter(s =>
    s.name.toLowerCase().includes(searchSpot.toLowerCase())
  );

  const toggleTag = (id: string) => {
    setSelectedTags(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const toggleBodyCondition = (id: string) => {
    setBodyConditions(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handleSubmit = () => {
    if (!selectedSpot) return;
    const spot = spots.find(s => s.id === selectedSpot);
    if (!spot) return;

    const record: DissuasionRecord = {
      id: `diss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      spotId: selectedSpot,
      spotName: spot.name,
      timestamp: Date.now(),
      tags: selectedTags,
      timePeriod,
      bodyConditions,
      comment: comment.trim(),
      voteCount: 0,
    };
    onSave(record);
  };

  const isValid = selectedSpot && selectedTags.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative w-full max-w-lg bg-white rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 手柄 */}
        <div className="sticky top-0 bg-white z-10 pt-3 pb-2 px-6 border-b border-gray-100">
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-gray-900">记录翻车经历</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* 选择景点 */}
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" /> 哪个景点让你后悔？
            </label>
            <input
              placeholder="搜索景点…"
              value={searchSpot}
              onChange={e => setSearchSpot(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm outline-none focus:border-rose-300 mb-2"
            />
            <div className="max-h-32 overflow-y-auto space-y-1">
              {filteredSpots.map(s => (
                <button
                  key={s.id}
                  onClick={() => { setSelectedSpot(s.id); setSearchSpot(s.name); }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedSpot === s.id
                      ? 'bg-rose-50 text-rose-700 font-semibold'
                      : 'hover:bg-gray-50 text-gray-600'
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          {/* 翻车标签 */}
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-2 block">翻车原因（可多选）</label>
            <div className="flex flex-wrap gap-2">
              {DISSUASION_TAGS.map(t => (
                <button
                  key={t.id}
                  onClick={() => toggleTag(t.id)}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                    selectedTags.includes(t.id)
                      ? 'bg-rose-100 text-rose-700 ring-2 ring-rose-300'
                      : 'bg-gray-50 text-gray-500 border border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 时段 */}
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-2 block">前往时段</label>
            <div className="flex gap-2">
              {TIME_PERIODS.map(p => (
                <button
                  key={p}
                  onClick={() => setTimePeriod(p)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                    timePeriod === p
                      ? 'bg-rose-100 text-rose-700 ring-2 ring-rose-300'
                      : 'bg-gray-50 text-gray-500 border border-gray-200'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* 身体条件 */}
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-2 block">当时的身体状态</label>
            <div className="flex gap-2">
              {BODY_CONDITIONS.map(c => (
                <button
                  key={c.id}
                  onClick={() => toggleBodyCondition(c.id)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                    bodyConditions.includes(c.id)
                      ? 'bg-rose-100 text-rose-700 ring-2 ring-rose-300'
                      : 'bg-gray-50 text-gray-500 border border-gray-200'
                  }`}
                >
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* 评论 */}
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-2 block">你的吐槽</label>
            <textarea
              placeholder="说说你为什么后悔来这里…"
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm outline-none focus:border-rose-300 resize-none"
            />
            <div className="text-right text-[10px] text-gray-400 mt-1">{comment.length}/500</div>
          </div>

          {/* 提交 */}
          <button
            onClick={handleSubmit}
            disabled={!isValid}
            className={`w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              isValid
                ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-lg hover:shadow-xl'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            <Send className="w-4 h-4" />
            提交劝退记录
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}