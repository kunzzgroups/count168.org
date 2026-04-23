import { publicAsset } from '../../lib/publicAsset'

type TelegramAnchorProps = {
  href: string
}

/**
 * 对应 `index.php` 中 `img.telegram-icon`；外包一层 a 以打开链接，样式仍作用于 img（见 LoginPage.css）
 */
export function TelegramAnchor({ href }: TelegramAnchorProps) {
  return (
    <a
      className="telegram-fab"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Telegram"
    >
      <img
        src={publicAsset('images/telegram.png')}
        alt="Telegram"
        className="telegram-icon"
        width={60}
        height={60}
      />
    </a>
  )
}
