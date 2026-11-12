import styles from './ComingSoon.module.css'

export default function ComingSoon({ icon, title, description }) {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <span className={styles.icon} aria-hidden="true">{icon}</span>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.description}>{description}</p>
        <p className={styles.note}>
          This page is under construction. Your teammate will build it here.
        </p>
      </div>
    </div>
  )
}
