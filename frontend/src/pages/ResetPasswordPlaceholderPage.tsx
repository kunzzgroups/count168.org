import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function ResetPasswordPlaceholderPage() {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-md space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-[clamp(1.6rem,0.3125vw+1.2rem,1.8rem)]">
              {t('modules.items.resetPassword')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-[clamp(1.4rem,0.3125vw+1.0rem,1.6rem)] text-zinc-700">{t('placeholder.body')}</p>
            <p className="text-[clamp(1.2rem,0.15vw+1.0rem,1.3rem)] text-zinc-500">{t('resetPassword.hint')}</p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/login" replace>
                {t('resetPassword.backToLogin')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
