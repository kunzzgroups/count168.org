import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { ModuleSidebarLayout } from '@/components/ModuleSidebarLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { type LegacyModuleDef, legacyModuleRows } from '@/config/legacyModuleRegistry'

export default function SystemModulesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const rows = useMemo<LegacyModuleDef[]>(() => legacyModuleRows, [])

  return (
    <ModuleSidebarLayout>
      <div className="mx-auto w-full max-w-6xl space-y-6 py-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[clamp(2.0rem,0.625vw+1.2rem,2.4rem)] font-semibold text-zinc-900">
              {t('modules.title')}
            </h1>
            <p className="text-[clamp(1.2rem,0.15vw+1.0rem,1.3rem)] text-zinc-500">
              {t('modules.subtitle')}
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => navigate('/dashboard')}>
            {t('modules.backToDashboard')}
          </Button>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>{t('modules.tableTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-zinc-600">
                    <th className="py-2 pr-3">{t('modules.columns.module')}</th>
                    <th className="py-2 pr-3">{t('modules.columns.legacy')}</th>
                    <th className="py-2 pr-3">{t('modules.columns.react')}</th>
                    <th className="py-2 pr-3">{t('modules.columns.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => (
                    <tr key={item.key} className="border-b border-zinc-100 text-zinc-800">
                      <td className="py-3 pr-3">{t(`modules.items.${item.key}`)}</td>
                      <td className="py-3 pr-3 font-mono text-xs">{item.legacyFile}</td>
                      <td className="py-3 pr-3">
                        <button
                          type="button"
                          className="font-mono text-xs text-blue-600 underline"
                          onClick={() => navigate(item.reactPath)}
                        >
                          {item.reactPath}
                        </button>
                      </td>
                      <td className="py-3 pr-3">
                        <span
                          className={
                            item.status === 'ready'
                              ? 'rounded-md bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700'
                              : 'rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700'
                          }
                        >
                          {item.status === 'ready' ? t('modules.status.ready') : t('modules.status.pending')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </ModuleSidebarLayout>
  )
}
