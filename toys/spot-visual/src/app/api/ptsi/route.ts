// ═══ PTSI 开放 API ═══
// D2.3: PTSI API Route
// Next.js Route Handler，实时计算 PTSI 出行指数
// GET /api/ptsi?uv=...&conditions=...&stamina=...

import { NextRequest, NextResponse } from 'next/server';
import { calcPTSI, getUVByHour } from '@/lib/ptsi-calculator';
import type { PTSIResult } from '@/lib/spot-data';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // 参数解析
  const uvParam = searchParams.get('uv');
  const uvIndex = uvParam !== null
    ? Math.max(0, Math.min(15, Number(uvParam)))
    : getUVByHour(new Date().getHours());

  const conditionsParam = searchParams.get('conditions');
  const conditions = conditionsParam
    ? conditionsParam.split(',').filter(c => ['knee', 'heart', 'heat'].includes(c))
    : [];

  // 体力消耗值 0–100（景点字段）；不传则不计体力分项
  const staminaParam = searchParams.get('stamina');
  const stamina =
    staminaParam !== null
      ? Math.max(0, Math.min(100, Number(staminaParam)))
      : null;

  // 计算
  const result: PTSIResult = calcPTSI(uvIndex, conditions, { stamina });

  // 响应
  return NextResponse.json({
    success: true,
    data: {
      ...result,
      params: { uvIndex, conditions, stamina },
      timestamp: new Date().toISOString(),
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const uvIndex = Math.max(0, Math.min(15, Number(body.uv ?? getUVByHour(new Date().getHours()))));
    const conditions: string[] = Array.isArray(body.conditions) ? body.conditions : [];
    const stamina = typeof body.stamina === 'number' ? Math.max(0, Math.min(100, body.stamina)) : null;

    const result: PTSIResult = calcPTSI(uvIndex, conditions, { stamina });

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        params: { uvIndex, conditions, stamina },
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 },
    );
  }
}