/**
 * Export film logs as a CSV file for download.
 * @param {Array} logs - Array of log objects
 * @param {string} username - Username for the filename
 */
export default function exportLogsCSV(logs, username) {
    const headers = ['Title', 'Year', 'Rating', 'Status', 'Date Watched', 'Review', 'Physical Media', 'Watched With', 'Pull Quote']
    const rows = logs.map(l => [
        `"${(l.title || '').replace(/"/g, '""')}"`,
        l.year || '',
        l.rating || '',
        l.status || 'watched',
        l.watchedDate || l.createdAt?.slice(0, 10) || '',
        `"${(l.review || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
        l.physicalMedia || '',
        `"${(l.watchedWith || '').replace(/"/g, '""')}"`,
        `"${(l.pullQuote || '').replace(/"/g, '""')}"`,
    ])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reelhouse_${username}_archive_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
}
