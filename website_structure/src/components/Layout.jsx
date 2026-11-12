import { NavLink, Outlet } from 'react-router-dom'
import styles from './Layout.module.css'

const navItems = [
  { to: '/',                 label: 'Dashboard'      },
  { to: '/planner',          label: 'Planner'        },
  { to: '/study-assistant',  label: 'Study Assistant'},
  { to: '/vocabulary',       label: 'Vocabulary'     },
]

export default function Layout() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logo}>🎓</span>
          <span className={styles.brandName}>CoursePilot</span>
          <span className={styles.tagline}>Your learning companion</span>
        </div>
        <nav className={styles.nav} aria-label="Main navigation">
          {navItems.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                isActive ? `${styles.navLink} ${styles.active}` : styles.navLink
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className={styles.main}>
        <Outlet />
      </main>

      <footer className={styles.footer}>
        <p>CoursePilot — helping ESL students succeed, one step at a time.</p>
      </footer>
    </div>
  )
}
