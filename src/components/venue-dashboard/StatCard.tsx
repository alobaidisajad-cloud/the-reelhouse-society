interface StatCardProps {
    icon: React.ElementType;
    label: string;
    value: string | number;
    sub?: string;
    color?: string;
}

export default function StatCard({ icon: Icon, label, value, sub, color = 'var(--sepia)' }: StatCardProps) {
    return (
        <div style={{ background: 'var(--soot)', border: '1px solid var(--ash)', borderTop: `3px solid ${color}`, padding: '1.4rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="section-title-sm" style={{ color: 'var(--fog)' }}>{label}</span>
                <Icon size={14} color={color} />
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.9rem', color: 'var(--parchment)', lineHeight: 1 }}>{value}</div>
            {sub && <div className="ui-micro" style={{ color: 'var(--fog)' }}>{sub}</div>}
        </div>
    )
}
