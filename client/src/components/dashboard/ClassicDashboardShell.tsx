import { useEffect, type ReactNode } from 'react'
import type { DashboardBootstrapData } from '../../types/dashboard'
import { DashboardShell } from './DashboardShell'

/** 与经典 `sidebar.php` 同套的侧栏/通知样式；仅在本组件中 import 一次即可覆盖所有经典路由 */
import '../../../../css/sidebar.css'

type Props = {
  data: DashboardBootstrapData
  /** 对应经典全页 PHP，如 `dashboard_classic.php`、`transaction_classic.php`（壳层「经典版」链接等） */
  classicPage: string
  /** 与经典页 `<title>` 一致；省略则不修改 `document.title` */
  documentTitle?: string
  children?: ReactNode
}

/**
 * 经典整页路由统一壳层：已包含 `sidebar.css`、`classicSidebarLayout`、`ClassicInformationMenu`。
 * 新路由在 bootstrap 成功后渲染：`<ClassicDashboardShell data={data} classicPage="..." documentTitle="..." />`。
 */
export function ClassicDashboardShell({ data, classicPage, documentTitle, children }: Props) {
  useEffect(() => {
    if (documentTitle == null || documentTitle === '') return
    const prev = document.title
    document.title = documentTitle
    return () => {
      document.title = prev
    }
  }, [documentTitle])

  return (
    <DashboardShell data={data} classicPage={classicPage} classicSidebarLayout>
      {children}
    </DashboardShell>
  )
}
