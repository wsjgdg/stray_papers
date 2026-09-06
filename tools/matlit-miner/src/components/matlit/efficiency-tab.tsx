'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Zap,
  Loader2,
  Plus,
  Trash2,
  Pencil,
  Award,
  ExternalLink,
  TrendingUp,
  Download,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts'
import { toast } from 'sonner'
import { api, doiUrl } from '@/lib/api-client'
import { useChartTheme } from '@/components/use-chart-theme'
import { useI18n } from '@/components/i18n/provider'
import { EfficiencyLeaderboard } from '@/components/matlit/efficiency-leaderboard'
import { EmptyState } from '@/components/matlit/empty-state'

interface EfficiencyRecord {
  id: string
  materialId: string
  efficiencyValue: number
  certified: boolean
  source: string
  sourceType: string
  testConditions: string
  doi: string
  year: number | null
  notes: string
  material: { name: string; id: string }
}

const SOURCE_PRESETS = [
  'NREL Best Research-Cell',
  'Perovskite Database',
  'Emerging PV Reports',
  'Literature (single paper)',
  'Materials Project',
  'Manual entry',
]

const BAR_COLORS = ['#f97316', '#fb923c', '#fdba74', '#fed7aa', '#ffedd5']

export default function EfficiencyTab({ focusMaterialId, onConsumeFocus }: { focusMaterialId?: string | null; onConsumeFocus?: () => void }) {
  const { t } = useI18n()
  const ctheme = useChartTheme()
  const qc = useQueryClient()
  const [filterMatId, setFilterMatId] = useState('')

  // When navigated here with a focusMaterialId, set the filter
  useEffect(() => {
    if (focusMaterialId) {
      setFilterMatId(focusMaterialId)
      onConsumeFocus?.()
    }
  }, [focusMaterialId, onConsumeFocus])

  const { data: matData } = useQuery<{ materials: Array<{ id: string; name: string }> }>({
    queryKey: ['materials-mini'],
    queryFn: () => api('/api/materials'),
  })

  const { data, isLoading } = useQuery<{ records: EfficiencyRecord[] }>({
    queryKey: ['efficiency', filterMatId],
    queryFn: () => {
      const params = new URLSearchParams()
      if (filterMatId) params.set('materialId', filterMatId)
      return api(`/api/efficiency?${params.toString()}`)
    },
  })

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/api/efficiency', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success('Efficiency record added')
      qc.invalidateQueries({ queryKey: ['efficiency'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e) => toast.error(`Failed: ${(e as Error).message}`),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/api/efficiency/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Record deleted')
      qc.invalidateQueries({ queryKey: ['efficiency'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e) => toast.error(`Delete failed: ${(e as Error).message}`),
  })

  // U18: edit existing record
  const [editingRecord, setEditingRecord] = useState<EfficiencyRecord | null>(null)
  // Lift the "add" dialog open-state up so the EmptyState CTA can trigger it
  // (previously lived inside AddEfficiencyDialog itself).
  const [addOpen, setAddOpen] = useState(false)
  const updateMut = useMutation({
    mutationFn: (data: { id: string } & Record<string, unknown>) =>
      api(`/api/efficiency/${data.id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => {
      toast.success('Record updated')
      qc.invalidateQueries({ queryKey: ['efficiency'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      setEditingRecord(null)
    },
    onError: (e) => toast.error(`Update failed: ${(e as Error).message}`),
  })

  const records = data?.records ?? []
  const chartData = [...records]
    .sort((a, b) => b.efficiencyValue - a.efficiencyValue)
    .slice(0, 12)
    .map((r) => ({ name: r.material.name, efficiency: r.efficiencyValue, certified: r.certified }))

  // Summary stats
  const maxEff = records.length > 0 ? Math.max(...records.map((r) => r.efficiencyValue)) : 0
  const avgEff = records.length > 0 ? records.reduce((a, r) => a + r.efficiencyValue, 0) / records.length : 0
  const certifiedCount = records.filter((r) => r.certified).length
  const maxCertified = records.filter((r) => r.certified).length > 0
    ? Math.max(...records.filter((r) => r.certified).map((r) => r.efficiencyValue))
    : 0

  const importMut = useMutation({
    mutationFn: () => api<{ imported: number; skipped: number; total: number }>('/api/efficiency/import-from-extraction', { method: 'POST' }),
    onSuccess: (d: { imported: number; skipped: number; total: number }) => {
      toast.success(t('efficiency.toast.imported', { imported: d.imported, skipped: d.skipped }))
      qc.invalidateQueries({ queryKey: ['efficiency'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e) => toast.error(`Import failed: ${(e as Error).message}`),
  })

  return (
    <div className="space-y-4">
      <EfficiencyLeaderboard />
      <Card className="border-orange-200/60 dark:border-orange-900/60">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-orange-500" /> {t('eff.title')}
              </CardTitle>
              <CardDescription>
                {t('eff.desc')}
              </CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => importMut.mutate()} disabled={importMut.isPending} className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300">
                {importMut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1" />}
                {t('efficiency.importFromExtraction')}
              </Button>
              <Select value={filterMatId || '__all__'} onValueChange={(v) => setFilterMatId(v === '__all__' ? '' : v)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={t('common.allMaterials')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t('common.allMaterials')}</SelectItem>
                  {(matData?.materials ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <AddEfficiencyDialog
                open={addOpen}
                onOpenChange={setAddOpen}
                materials={matData?.materials ?? []}
                onSubmit={(b) => createMut.mutate(b)}
                isPending={createMut.isPending}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Summary stats */}
          {records.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              <div className="rounded-lg p-2 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 text-center">
                <div className="text-lg font-bold tabular-nums text-orange-600 dark:text-orange-400">{maxEff.toFixed(2)}%</div>
                <div className="text-[10px] text-orange-600 dark:text-orange-400">{t('efficiency.stat.maxEff')}</div>
              </div>
              <div className="rounded-lg p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-center">
                <div className="text-lg font-bold tabular-nums text-slate-700 dark:text-slate-200">{avgEff.toFixed(2)}%</div>
                <div className="text-[10px] text-slate-500">{t('efficiency.stat.avg')}</div>
              </div>
              <div className="rounded-lg p-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-center">
                <div className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{maxCertified > 0 ? `${maxCertified.toFixed(2)}%` : '—'}</div>
                <div className="text-[10px] text-emerald-600 dark:text-emerald-400">{t('efficiency.stat.maxCert')}</div>
              </div>
              <div className="rounded-lg p-2 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 text-center">
                <div className="text-lg font-bold tabular-nums text-sky-600 dark:text-sky-400">{records.length}</div>
                <div className="text-[10px] text-sky-600 dark:text-sky-400">{t('efficiency.stat.total')}</div>
              </div>
            </div>
          )}
          {/* Chart */}
          {chartData.length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-slate-500 mb-2 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" /> {t('eff.topChart')}
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={ctheme.grid} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: ctheme.axis }} stroke={ctheme.axis} unit="%" />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10, fill: ctheme.axis }} stroke={ctheme.axis} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: `1px solid ${ctheme.tooltipBorder}`, fontSize: 12, background: ctheme.tooltipBg, color: ctheme.tooltipText }}
                    formatter={(v) => [`${(v as number).toFixed(2)}%`, t('eff.col.efficiency')]}
                  />
                  <Bar dataKey="efficiency" radius={[0, 4, 4, 0]}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Table */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 max-h-[55vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 z-10">
                <tr className="text-left text-xs text-slate-500">
                  <th className="p-2 font-medium">{t('eff.col.material')}</th>
                  <th className="p-2 font-medium text-right">{t('eff.col.efficiency')}</th>
                  <th className="p-2 font-medium">{t('eff.col.source')}</th>
                  <th className="p-2 font-medium">{t('eff.col.year')}</th>
                  <th className="p-2 font-medium">{t('eff.col.doi')}</th>
                  <th className="p-2 font-medium w-8"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={6} className="text-center py-8 text-slate-400"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></td></tr>
                ) : records.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-0">
                      <EmptyState
                        icon={<Zap className="w-8 h-8" />}
                        title={t('efficiency.emptyTitle')}
                        description={t('efficiency.empty.desc')}
                        action={{
                          label: t('efficiency.empty.cta'),
                          onClick: () => setAddOpen(true),
                        }}
                        hint={t('efficiency.empty.hint')}
                      />
                    </td>
                  </tr>
                ) : (
                  records.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50">
                      <td className="p-2 font-mono text-xs">
                        <div className="flex items-center gap-1.5">
                          {r.material.name}
                          {r.certified && (
                            <Badge variant="outline" className="text-[9px] gap-0.5 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900">
                              <Award className="w-2.5 h-2.5" /> {t('dashboard.charts.certified')}
                            </Badge>
                          )}
                        </div>
                        {r.testConditions && <div className="text-[10px] text-slate-400 mt-0.5">{r.testConditions}</div>}
                      </td>
                      <td className="p-2 text-right font-bold text-orange-600 dark:text-orange-400 tabular-nums">
                        {r.efficiencyValue.toFixed(2)}%
                      </td>
                      <td className="p-2 text-xs">
                        <Badge variant="outline" className="text-[10px]">{r.source || r.sourceType}</Badge>
                      </td>
                      <td className="p-2 text-xs text-slate-500 tabular-nums">{r.year ?? '—'}</td>
                      <td className="p-2 text-xs">
                        {r.doi ? (
                          <a href={doiUrl(r.doi)} target="_blank" rel="noopener noreferrer" className="text-sky-600 dark:text-sky-400 hover:underline inline-flex items-center gap-0.5">
                            DOI <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-slate-500 hover:text-emerald-600"
                            onClick={() => setEditingRecord(r)}
                            aria-label="Edit record"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-red-500"
                            onClick={() => {
                              if (confirm('Delete this efficiency record?')) deleteMut.mutate(r.id)
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {/* U18: edit record dialog */}
      <EditEfficiencyDialog
        record={editingRecord}
        onClose={() => setEditingRecord(null)}
        onSubmit={(body) => updateMut.mutate({ id: editingRecord!.id, ...body })}
        isPending={updateMut.isPending}
      />
    </div>
  )
}

function EditEfficiencyDialog({
  record,
  onClose,
  onSubmit,
  isPending,
}: {
  record: EfficiencyRecord | null
  onClose: () => void
  onSubmit: (body: Record<string, unknown>) => void
  isPending: boolean
}) {
  const { t } = useI18n()
  const [efficiency, setEfficiency] = useState('')
  const [certified, setCertified] = useState(false)
  const [source, setSource] = useState('')
  const [doi, setDoi] = useState('')
  const [year, setYear] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (record) {
      setEfficiency(String(record.efficiencyValue))
      setCertified(record.certified)
      setSource(record.source || '')
      setDoi(record.doi || '')
      setYear(record.year ? String(record.year) : '')
      setNotes(record.notes || '')
    }
  }, [record])

  return (
    <Dialog open={!!record} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Pencil className="w-4 h-4 text-emerald-500" /> {t('eff.editTitle')}
          </DialogTitle>
          <DialogDescription>
            {record?.material?.name ? `${record.material.name} — ` : ''}{t('eff.editDesc')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">{t('eff.efficiency')} (%)</Label>
            <Input value={efficiency} onChange={(e) => setEfficiency(e.target.value)} type="number" step="0.01" className="mt-1" />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={certified} onCheckedChange={setCertified} id="edit-certified" />
            <Label htmlFor="edit-certified" className="text-xs cursor-pointer">{t('eff.certified')}</Label>
          </div>
          <div>
            <Label className="text-xs">{t('eff.source')}</Label>
            <Input value={source} onChange={(e) => setSource(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">DOI</Label>
            <Input value={doi} onChange={(e) => setDoi(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">{t('eff.year')}</Label>
            <Input value={year} onChange={(e) => setYear(e.target.value)} type="number" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">{t('eff.notes')}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            onClick={() => {
              const eff = parseFloat(efficiency)
              if (isNaN(eff) || eff < 0 || eff > 100) return
              const body: Record<string, unknown> = {
                efficiencyValue: eff,
                certified,
                source,
                doi,
                notes,
              }
              const y = parseInt(year, 10)
              if (!isNaN(y)) body.year = y
              onSubmit(body)
            }}
            disabled={isPending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {isPending && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AddEfficiencyDialog({
  open,
  onOpenChange,
  materials,
  onSubmit,
  isPending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  materials: Array<{ id: string; name: string }>
  onSubmit: (body: Record<string, unknown>) => void
  isPending: boolean
}) {
  const { t } = useI18n()
  const [materialId, setMaterialId] = useState('')
  const [efficiency, setEfficiency] = useState('')
  const [certified, setCertified] = useState(false)
  const [source, setSource] = useState('NREL Best Research-Cell')
  const [testConditions, setTestConditions] = useState('')
  const [doi, setDoi] = useState('')
  const [year, setYear] = useState('')
  const [notes, setNotes] = useState('')

  const reset = () => {
    setMaterialId(''); setEfficiency(''); setCertified(false); setSource('NREL Best Research-Cell')
    setTestConditions(''); setDoi(''); setYear(''); setNotes('')
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset() }}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-orange-600 hover:bg-orange-700">
          <Plus className="w-4 h-4 mr-1" /> {t('eff.add')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('eff.form.title')}</DialogTitle>
          <DialogDescription>{t('eff.form.desc')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
          <div>
            <Label>{t('eff.form.material')}</Label>
            <Select value={materialId} onValueChange={setMaterialId}>
              <SelectTrigger><SelectValue placeholder={t('eff.form.materialPh')} /></SelectTrigger>
              <SelectContent>
                {materials.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="e-eff">{t('eff.form.efficiency')}</Label>
              <Input id="e-eff" type="number" step="0.01" placeholder="25.7" value={efficiency} onChange={(e) => setEfficiency(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="e-year">{t('eff.form.year')}</Label>
              <Input id="e-year" type="number" placeholder="2024" value={year} onChange={(e) => setYear(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>{t('eff.form.source')}</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SOURCE_PRESETS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="e-cond">{t('eff.form.conditions')}</Label>
            <Input id="e-cond" placeholder="AM1.5G, 100 mW/cm², 0.1 cm²" value={testConditions} onChange={(e) => setTestConditions(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="e-doi">{t('eff.form.doi')}</Label>
            <Input id="e-doi" placeholder={t('verify.doiPh')} value={doi} onChange={(e) => setDoi(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="e-notes">{t('eff.form.notes')}</Label>
            <Textarea id="e-notes" rows={2} placeholder="Optional notes…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="e-cert" checked={certified} onCheckedChange={setCertified} />
            <Label htmlFor="e-cert" className="text-xs cursor-pointer">{t('eff.form.certified')}</Label>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              const eff = parseFloat(efficiency)
              if (!materialId || isNaN(eff)) {
                toast.error('Material and a numeric efficiency are required')
                return
              }
              onSubmit({
                materialId,
                efficiencyValue: eff,
                certified,
                source,
                sourceType: source.toLowerCase().includes('literature') ? 'literature' : 'database',
                testConditions,
                doi,
                year: year ? parseInt(year, 10) : null,
                notes,
              })
              onOpenChange(false)
              reset()
            }}
            disabled={isPending}
          >
            {isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {t('eff.form.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
