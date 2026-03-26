import { supabase } from '../supabaseClient'
import { useAuthStore } from '../store'

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
}

export const subscribeToWebPush = async () => {
    try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('Web Push not supported in this browser.')
            return false
        }

        const registration = await navigator.serviceWorker.ready
        const permission = await Notification.requestPermission()
        
        if (permission !== 'granted') {
            console.warn('Push permission denied.')
            return false
        }

        const publicVapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
        if (!publicVapidKey) {
            console.error('Missing VITE_VAPID_PUBLIC_KEY environment variable.')
            return false
        }

        // Negotiate cryptographic subscription token with browser Apple/Google backend
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
        })

        const subJSON = subscription.toJSON()
        const user = useAuthStore.getState().user

        if (!user) return false

        // Deposit physical token into Supabase for Edge Function routing
        const { error } = await supabase.from('push_subscriptions').upsert({
            user_id: user.id,
            endpoint: subJSON.endpoint,
            p256dh: subJSON.keys?.p256dh,
            auth: subJSON.keys?.auth
        }, { onConflict: 'endpoint' })

        if (error) {
            console.error('Failed to link subscription to user profile:', error)
            return false
        }

        return true
    } catch (err) {
        console.error('Subscription error:', err)
        return false
    }
}
