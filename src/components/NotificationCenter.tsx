/**
 * NotificationCenter — Slide-out panel showing all user notifications.
 * Groups by day, supports mark-all-read, and shows follows/endorsements/annotations.
 * Nitrate Noir themed — telegram-style notification cards.
 */
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Bell, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store'
import { EmptyNotifications } from './EmptyStates'
import { supabase, isSupabaseConfigured } from '../supabaseClient'
import { useViewport } from '../hooks/useViewport'

interface Notification {
  id: string
  type: string
  from: string
  message: string
  read: boolean
  created_at: string
  target_url?: string
}

export default function NotificationCenter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const { isTouch } = useViewport()

  useEffect(() => {
    if (!open || !user?.username || !isSupabaseConfigured) return
    setLoading(true)
    supabase
      .from('notifications')
      .select('*')
      .eq('to', user.username)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setNotifications((data || []) as Notification[])
        setLoading(false)
      })
  }, [open, user?.username])

  const markAllRead = async () => {
    if (!user?.username || !isSupabaseConfigured) return
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('to', user.username)
      .eq('read', false)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const handleClick = (n: Notification) => {
    if (n.target_url) navigate(n.target_url)
    else if (n.from) navigate(`/user/${n.from}`)
    onClose()
  }

  // Group by day
  const grouped = notifications.reduce((acc, n) => {
    const day = new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()
    if (!acc[day]) acc[day] = []
    acc[day].push(n)
    return acc
  }, {} as Record<string, Notification[]>)

  const unreadCount = notifications.filter(n => !n.read).length

  const iconForType = (type: string) => {
    switch (type) {
      case 'follow': return '◆'
      case 'endorse': return '✦'
      case 'annotate': return '§'
      case 'retransmit': return '⟐'
      case 'achievement': return '◈'
      default: return '✧'
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed', inset: 0, zIndex: 99998,
              background: 'rgba(5,3,1,0.7)',
            }}
          />
          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', ease: 'easeInOut', duration: 0.25 }}
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0,
              width: isTouch ? '100vw' : 380, maxWidth: isTouch ? '100vw' : '90vw', zIndex: 99999,
              background: 'var(--ink)', borderLeft: '1px solid rgba(139,105,20,0.15)',
              display: 'flex', flexDirection: 'column',
              boxShadow: '-10px 0 40px rgba(0,0,0,0.5)',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(139,105,20,0.1)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Bell size={16} color="var(--sepia)" />
                <span style={{
                  fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em',
                  color: 'var(--parchment)',
                }}>
                  TRANSMISSIONS
                </span>
                {unreadCount > 0 && (
                  <span style={{
                    fontFamily: 'var(--font-ui)', fontSize: '0.4rem', letterSpacing: '0.1em',
                    background: 'var(--sepia)', color: 'var(--ink)',
                    padding: '0.1rem 0.4rem', borderRadius: '1px',
                  }}>
                    {unreadCount}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--sepia)', display: 'flex', alignItems: 'center', gap: '0.3rem',
                      fontFamily: 'var(--font-ui)', fontSize: '0.4rem', letterSpacing: '0.15em',
                    }}
                  >
                    <Check size={10} /> MARK READ
                  </button>
                )}
                <button
                  onClick={onClose}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--fog)', padding: '0.25rem',
                  }}
                  aria-label="Close notifications"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
              {loading ? (
                <div style={{
                  padding: '3rem', textAlign: 'center',
                  fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em',
                  color: 'var(--sepia)', opacity: 0.6,
                }}>
                  RECEIVING TRANSMISSIONS…
                </div>
              ) : notifications.length === 0 ? (
                <EmptyNotifications />
              ) : (
                Object.entries(grouped).map(([day, items]) => (
                  <div key={day}>
                    <div style={{
                      fontFamily: 'var(--font-ui)', fontSize: '0.4rem', letterSpacing: '0.15em',
                      color: 'var(--ash)', padding: '0.75rem 0.5rem 0.25rem',
                    }}>
                      {day}
                    </div>
                    {items.map(n => (
                      <div
                        key={n.id}
                        onClick={() => handleClick(n)}
                        style={{
                          display: 'flex', gap: '0.75rem', padding: '0.75rem',
                          borderRadius: '2px', cursor: 'pointer',
                          background: n.read ? 'transparent' : 'rgba(139,105,20,0.04)',
                          borderLeft: `2px solid ${n.read ? 'transparent' : 'var(--sepia)'}`,
                          transition: 'background 0.2s',
                        }}
                      >
                        <div style={{
                          fontSize: '1rem', color: 'var(--sepia)', lineHeight: 1, minWidth: 20,
                          textAlign: 'center',
                        }}>
                          {iconForType(n.type)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontFamily: 'var(--font-body)', fontSize: '0.8rem',
                            color: n.read ? 'var(--fog)' : 'var(--parchment)',
                            lineHeight: 1.4,
                          }}>
                            <strong style={{ color: 'var(--flicker)' }}>@{n.from}</strong>{' '}
                            {n.message}
                          </div>
                          <div style={{
                            fontFamily: 'var(--font-ui)', fontSize: '0.4rem', letterSpacing: '0.1em',
                            color: 'var(--ash)', marginTop: '0.25rem',
                          }}>
                            {new Date(n.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
