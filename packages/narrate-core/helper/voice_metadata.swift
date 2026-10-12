import AVFoundation
import Foundation

let genderNames: [AVSpeechSynthesisVoiceGender: String] = [.male: "male", .female: "female"]
let qualityNames: [AVSpeechSynthesisVoiceQuality: String] = [
	.default: "default", .enhanced: "enhanced", .premium: "premium",
]

let voices = AVSpeechSynthesisVoice.speechVoices().map { voice -> [String: Any] in
	var record: [String: Any] = [
		"identifier": voice.identifier,
		"name": voice.name,
		"language": voice.language,
		"novelty": voice.voiceTraits.contains(.isNoveltyVoice),
	]
	// Unspecified gender is 130 of 182 voices here; an omitted key keeps that out of the TypeScript type.
	if let gender = genderNames[voice.gender] { record["gender"] = gender }
	if let quality = qualityNames[voice.quality] { record["quality"] = quality }
	return record
}

FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: voices))
