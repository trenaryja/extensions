import * as R from 'remeda'

export type WavFormat = { sampleRate: number; channels: number; bitsPerSample: number }

export type Wav = { format: WavFormat; data: Uint8Array }

const HEADER_BYTES = 44
const HEADER_SCAN_BYTES = 65_536

const frameBytes = ({ channels, bitsPerSample }: WavFormat) => (channels * bitsPerSample) / 8

const bytesPerSecond = (format: WavFormat) => format.sampleRate * frameBytes(format)

export const wavSeconds = ({ format, data }: Wav) => data.length / bytesPerSecond(format)

const chunkId = (bytes: Uint8Array, at: number) =>
	String.fromCharCode(bytes[at]!, bytes[at + 1]!, bytes[at + 2]!, bytes[at + 3]!)

// A RIFF header is 12 bytes, then [4-byte id][4-byte size] chunks: `fmt ` carries the channel count,
// sample rate and bit depth, `data` the payload. Both live well inside the first 64 KB of any wav.
const readHeader = (bytes: Uint8Array) => {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	let format: WavFormat | null = null

	for (let offset = 12; offset + 8 <= bytes.length;) {
		const id = chunkId(bytes, offset)
		const size = view.getUint32(offset + 4, true)

		if (id === 'fmt ')
			format = {
				channels: view.getUint16(offset + 10, true),
				sampleRate: view.getUint32(offset + 12, true),
				bitsPerSample: view.getUint16(offset + 22, true),
			}

		if (id === 'data') {
			if (!format) throw new Error('wav data chunk arrived before its fmt chunk')
			return { format, dataOffset: offset + 8, dataSize: size }
		}

		offset += 8 + size + (size % 2)
	}

	throw new Error('no readable RIFF data chunk')
}

export const wavDuration = async (path: string) => {
	const bytes = new Uint8Array(await Bun.file(path).slice(0, HEADER_SCAN_BYTES).arrayBuffer())
	const { format, dataSize } = readHeader(bytes)
	return dataSize / bytesPerSecond(format)
}

export const readWav = async (path: string): Promise<Wav> => {
	const bytes = new Uint8Array(await Bun.file(path).arrayBuffer())
	const { format, dataOffset, dataSize } = readHeader(bytes)
	return { format, data: bytes.subarray(dataOffset, dataOffset + Math.min(dataSize, bytes.length - dataOffset)) }
}

export const encodeWav = ({ format, data }: Wav) => {
	const bytes = new Uint8Array(HEADER_BYTES + data.length)
	const view = new DataView(bytes.buffer)
	const tag = (at: number, text: string) => {
		for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i))
	}

	tag(0, 'RIFF')
	view.setUint32(4, HEADER_BYTES - 8 + data.length, true)
	tag(8, 'WAVE')
	tag(12, 'fmt ')
	view.setUint32(16, 16, true)
	view.setUint16(20, 1, true)
	view.setUint16(22, format.channels, true)
	view.setUint32(24, format.sampleRate, true)
	view.setUint32(28, bytesPerSecond(format), true)
	view.setUint16(32, frameBytes(format), true)
	view.setUint16(34, format.bitsPerSample, true)
	tag(36, 'data')
	view.setUint32(40, data.length, true)
	bytes.set(data, HEADER_BYTES)
	return bytes
}

export const writeWav = (path: string, wav: Wav) => Bun.write(path, encodeWav(wav))

const describeFormat = ({ sampleRate, channels, bitsPerSample }: WavFormat) =>
	`${sampleRate} Hz, ${channels} ch, ${bitsPerSample}-bit`

const sameFormat = (a: WavFormat, b: WavFormat) =>
	a.sampleRate === b.sampleRate && a.channels === b.channels && a.bitsPerSample === b.bitsPerSample

export const concatWav = (pieces: Wav[]): Wav => {
	const [first, ...rest] = pieces
	if (!first) throw new Error('concatWav needs at least one piece')

	for (const piece of rest)
		if (!sameFormat(first.format, piece.format))
			throw new Error(`cannot concatenate ${describeFormat(first.format)} with ${describeFormat(piece.format)}`)

	const data = new Uint8Array(R.sumBy(pieces, (piece) => piece.data.length))
	let at = 0

	for (const piece of pieces) {
		data.set(piece.data, at)
		at += piece.data.length
	}

	return { format: first.format, data }
}

// afplay has no start offset, so seeking means handing it a wav that starts where the listener wants.
export const sliceWav = ({ format, data }: Wav, startSeconds: number): Wav => {
	const frame = frameBytes(format)
	const at = Math.min(data.length, Math.max(0, Math.round(startSeconds * format.sampleRate)) * frame)
	return { format, data: data.subarray(at) }
}

export const silentWav = (format: WavFormat, seconds: number): Wav => ({
	format,
	data: new Uint8Array(Math.round(seconds * format.sampleRate) * frameBytes(format)),
})
