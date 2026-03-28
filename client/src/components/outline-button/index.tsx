import styles from './button.module.css'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
    width?: number | string
}

export function OutlineButton({ children, width, ...props }: ButtonProps) {
    return (
        <button className={styles.pushable} {...props}>
            <span className={styles.front} style={{ width }}>{children}</span>
        </button>
    )
}