import { motion } from 'framer-motion'
import Buster from '../Buster'
import { tmdb } from '../../tmdb'

export function TicketBooth({ stubs }) {
    if (stubs.length === 0) {
        return (
            <div style={{ textAlign: 'center', padding: '4rem' }}>
                <Buster size={100} mood="crying" message="No stubs collected yet. Watch something in a Palace." />
            </div>
        )
    }

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {stubs.map(stub => (
                <motion.div
                    key={stub.id}
                    className="admission-stub"
                    whileHover={{ scale: 1.02, transition: { type: 'spring', damping: 12 } }}
                >
                    <div className="stub-left">
                        <div className="stub-code">NO. {stub.id.split('-')[1].slice(-6)}</div>
                    </div>
                    <div className="stub-right">
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.25rem' }}>ADMISSION STUB</div>
                        <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--parchment)', lineHeight: 1.2, marginBottom: '0.5rem' }}>{stub.title.toUpperCase()}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto' }}>
                            <div>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', color: 'var(--fog)' }}>DATE</div>
                                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', color: 'var(--bone)' }}>{stub.date}</div>
                            </div>
                            <div>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', color: 'var(--fog)' }}>SEAT</div>
                                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', color: 'var(--bone)' }}>{stub.seat}</div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            ))}
        </div>
    )
}
