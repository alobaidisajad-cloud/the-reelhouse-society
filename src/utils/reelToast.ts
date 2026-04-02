/**
 * reelToast — Themed toast wrapper for Nitrate Noir consistency.
 * Replaces raw `toast()` calls throughout the app so every notification
 * matches the cinematic dark aesthetic.
 */
import toast, { Renderable } from 'react-hot-toast'

const NOIR_STYLE: React.CSSProperties = {
    background: 'var(--ink)',
    color: 'var(--parchment)',
    border: '1px solid rgba(139,105,20,0.3)',
    fontFamily: 'var(--font-ui)',
    fontSize: '0.7rem',
    letterSpacing: '0.08em',
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
}

const SUCCESS_STYLE: React.CSSProperties = {
    ...NOIR_STYLE,
    border: '1px solid var(--sepia)',
}

const ERROR_STYLE: React.CSSProperties = {
    ...NOIR_STYLE,
    border: '1px solid var(--blood-reel)',
}

interface ReelToastOpts {
    icon?: Renderable
    duration?: number
    id?: string
    style?: React.CSSProperties
}

export function reelToast(message: string, opts?: ReelToastOpts) {
    return toast(message, {
        icon: opts?.icon || '✦',
        duration: opts?.duration || 3000,
        id: opts?.id,
        style: { ...NOIR_STYLE, ...opts?.style },
    })
}

reelToast.success = (message: string, opts?: ReelToastOpts) => {
    return toast.success(message, {
        icon: opts?.icon,
        duration: opts?.duration || 3000,
        id: opts?.id,
        style: { ...SUCCESS_STYLE, ...opts?.style },
    })
}

reelToast.error = (message: string, opts?: ReelToastOpts) => {
    return toast.error(message, {
        icon: opts?.icon,
        duration: opts?.duration || 4000,
        id: opts?.id,
        style: { ...ERROR_STYLE, ...opts?.style },
    })
}

reelToast.loading = (message: string, opts?: ReelToastOpts) => {
    return toast.loading(message, {
        id: opts?.id,
        style: { ...NOIR_STYLE, ...opts?.style },
    })
}

reelToast.dismiss = toast.dismiss

export default reelToast
