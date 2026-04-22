import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { ModuleSidebarLayout } from '@/components/ModuleSidebarLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type ModuleMigrationPlaceholderPageProps = {
  i18nKey: string
}

export default function ModuleMigrationPlaceholderPage({ i18nKey }: ModuleMigrationPlaceholderPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const title = t(`modules.items.${i18nKey}`)

  return (
    <ModuleSidebarLayout>
      <div className="mx-auto w-full max-w-3xl space-y-6 py-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[clamp(2.0rem,0.625vw+1.2rem,2.4rem)] font-semibold text-zinc-900">{title}</h1>
            <p className="text-[clamp(1.2rem,0.15vw+1.0rem,1.3rem)] text-zinc-500">{t('placeholder.subtitle')}</p>
          </div>
          <Button type="button" variant="outline" onClick={() => navigate('/modules')}>
            {t('placeholder.backToModules')}
          </Button>
        </header>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('placeholder.cardTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[clamp(1.4rem,0.3125vw+1.0rem,1.6rem)] text-zinc-700">{t('placeholder.body')}</p>
          </CardContent>
        </Card>
      </div>
    </ModuleSidebarLayout>
  )
}
