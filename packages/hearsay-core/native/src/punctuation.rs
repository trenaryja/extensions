use regex::Regex;
use std::sync::LazyLock;

const ELLIPSES: [&str; 2] = ["...", "…"];

/// Whether whisper heard the sentence end. A trail-off comes back as "It's not..." from the larger
/// models and as a bare "It's not" from the smallest, and neither is a place to break the sentence.
pub fn finished(text: &str) -> bool {
    text.is_empty()
        || (text.ends_with(['.', '!', '?'])
            && !ELLIPSES.iter().any(|ellipsis| text.ends_with(ellipsis)))
}

/// A pause to find the next word, not a break in the sentence: "wraps... or doesn't" → "wraps or doesn't".
pub fn smooth(text: &str) -> String {
    static HESITATION: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"(\w)(?:\.\.\.|…) ([a-z])").expect("valid pattern"));
    HESITATION.replace_all(text, "$1 $2").into_owned()
}

/// The end of what was said: a trailing ellipsis becomes a period, and an open end gets one. Whisper
/// leaves short utterances open, and an open one in the prompt spreads — replayed on a real session,
/// every later utterance dropped its punctuation until the prompt carried a period.
pub fn close(text: &str) -> String {
    let text = ELLIPSES
        .iter()
        .find_map(|ellipsis| text.strip_suffix(ellipsis))
        .unwrap_or(text);
    if text.ends_with(char::is_alphanumeric) {
        format!("{text}.")
    } else {
        text.to_string()
    }
}
