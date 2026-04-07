import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const links = [
  { to: '/voice', labelKey: 'nav.voice' as const },
  { to: '/vocabulary', labelKey: 'nav.vocabulary' as const },
  { to: '/news', labelKey: 'nav.news' as const },
  { to: '/speaking', labelKey: 'nav.speaking' as const },
] as const

export function TopNav() {
  const { t } = useTranslation()

  return (
    <div className="site-header__actions">
      <nav className="top-nav" aria-label={t('nav.mainAria')}>
      {links.map(({ to, labelKey }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            ['top-nav__link', isActive ? 'top-nav__link--active' : '']
              .filter(Boolean)
              .join(' ')
          }
          end
        >
          {t(labelKey)}
        </NavLink>
      ))}
      </nav>
    </div>
  )
}
