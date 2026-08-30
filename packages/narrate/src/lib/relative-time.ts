export const relativeTime = (iso: string) => {
	const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
	if (minutes < 60) return `${minutes}m ago`
	if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`
	return `${Math.round(minutes / 60 / 24)}d ago`
}
