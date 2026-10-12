use regex::{NoExpand, Regex};
use serde_json::Value;
use strsim::levenshtein;

/// The user's words: a vocabulary to steer whisper toward and snap spellings to, and exact phrases to swap.
#[derive(Default)]
pub struct Dictionary {
    vocabulary: Vec<Word>,
    replacements: Vec<(Regex, String)>,
}

struct Word {
    spelling: String,
    key: String,
}

/// Spacing, case and punctuation dropped: `ClaudeMD`, `claude.md` and `Claude MD` all key to `claudemd`.
fn key(text: &str) -> String {
    text.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

/// Measured on 197 real recordings, where a second typo already turned `config` into `tsconfig`.
const TYPO_MIN_CHARS: usize = 8;

/// Whisper punctuates the way its prompt does, and with nothing said yet there is no prompt: on a real
/// session the smallest model then wrote 22 s without a single period, and with this none was missing.
const OPENING: &str = "Hello. Here is what I think.";

/// Up to three words, so `daisy UI` and `mono repo` can close into one.
const MAX_WORDS: usize = 3;

/// Leading and trailing punctuation, around the part that is matched.
fn split(word: &str) -> (&str, &str, &str) {
    let Some(start) = word.find(char::is_alphanumeric) else {
        return (word, "", "");
    };
    let end = word
        .char_indices()
        .rev()
        .find(|(_, c)| c.is_alphanumeric())
        .map_or(word.len(), |(at, c)| at + c.len_utf8());
    (&word[..start], &word[start..end], &word[end..])
}

impl Dictionary {
    pub fn parse(json: &str) -> Result<Self, String> {
        let value: Value =
            serde_json::from_str(json).map_err(|error| format!("Bad dictionary: {error}"))?;
        let vocabulary = value["vocabulary"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(|spelling| Word {
                spelling: spelling.trim().to_string(),
                key: key(spelling),
            })
            .filter(|word| !word.key.is_empty())
            .collect();
        let mut replacements = Vec::new();
        for (from, to) in value["replacements"].as_object().into_iter().flatten() {
            let to = to
                .as_str()
                .ok_or_else(|| format!("Replacement for {from} is not text"))?;
            replacements.push((phrase(from)?, to.to_string()));
        }
        Ok(Self {
            vocabulary,
            replacements,
        })
    }

    /// Vocabulary first: whisper keeps only the last 224 prompt tokens, so an overlong vocabulary
    /// loses its head rather than the sentence the speaker is in the middle of.
    pub fn prompt(&self, recent: &str) -> Option<String> {
        let recent = if recent.is_empty() { OPENING } else { recent };
        let words: Vec<&str> = self
            .vocabulary
            .iter()
            .map(|word| word.spelling.as_str())
            .collect();
        let words = words.join(", ");
        let parts: Vec<&str> = [words.as_str(), recent]
            .into_iter()
            .filter(|part| !part.is_empty())
            .collect();
        (!parts.is_empty()).then(|| parts.join(" "))
    }

    /// Replacements first, so the vocabulary pass cannot rewrite half of a phrase before the exact rule
    /// for the whole phrase gets to see it.
    pub fn correct(&self, raw: &str) -> String {
        let mut text = raw.to_string();
        for (pattern, to) in &self.replacements {
            text = pattern.replace_all(&text, NoExpand(to)).into_owned();
        }
        if self.vocabulary.is_empty() {
            return text;
        }
        self.respell(&text)
    }

    /// Not Handy's `apply_custom_words`: on real recordings its soundex scoring and length slack
    /// deleted words ("my SuperWhisper" → "Superwhisper"), cut paths ("@trenaryja/ui" → "@trenaryja")
    /// and rewrote English ("suppression" → "Superwhisper"). This matches keys exactly, allowing one
    /// typo only inside a single long word.
    fn respell(&self, text: &str) -> String {
        let words: Vec<&str> = text.split_whitespace().collect();
        let mut out = Vec::with_capacity(words.len());
        let mut at = 0;
        while at < words.len() {
            match self.best(&words[at..]) {
                Some((taken, spelling)) => {
                    let (prefix, _, _) = split(words[at]);
                    let (_, _, suffix) = split(words[at + taken - 1]);
                    let said = words[at..at + taken].join(" ");
                    let said = said.strip_suffix(suffix).unwrap_or(&said);
                    // `.claude` keyed like `claude`: its own dot is already in the spelling.
                    let prefix = if said.eq_ignore_ascii_case(spelling) {
                        ""
                    } else {
                        prefix
                    };
                    out.push(format!("{prefix}{spelling}{suffix}"));
                    at += taken;
                }
                None => {
                    out.push(words[at].to_string());
                    at += 1;
                }
            }
        }
        out.join(" ")
    }

    /// The closest vocabulary word starting at `words[0]`, and how many words it consumes. Ties go to the
    /// longer phrase (`claude md` over `claude`), then to the entry spelled exactly as said — `.claude`
    /// and `Claude` share a key.
    fn best<'a>(&'a self, words: &[&str]) -> Option<(usize, &'a str)> {
        let mut best: Option<((usize, usize, bool), usize, &str)> = None;
        for taken in (1..=MAX_WORDS.min(words.len())).rev() {
            let span = &words[..taken];
            let parts: Vec<_> = span.iter().map(|word| split(word)).collect();
            // A comma closes a phrase, and a path or handle is never one of the user's words.
            if parts[..taken - 1]
                .iter()
                .any(|(_, _, suffix)| !suffix.is_empty())
                || parts.iter().any(|(_, core, _)| {
                    core.chars()
                        .any(|c| !(c.is_alphanumeric() || c == '.' || c == '-'))
                })
            {
                continue;
            }
            let said_key: String = parts.iter().map(|(_, core, _)| key(core)).collect();
            let said = span.join(" ").to_lowercase();
            for word in &self.vocabulary {
                let distance = if word.key == said_key {
                    0
                } else if taken == 1
                    && word.key.chars().count() >= TYPO_MIN_CHARS
                    && word.key.chars().count().abs_diff(said_key.chars().count()) <= 1
                {
                    levenshtein(&word.key, &said_key)
                } else {
                    continue;
                };
                if distance > 1 {
                    continue;
                }
                let exact = said
                    .trim_end_matches(|c: char| !c.is_alphanumeric())
                    .eq_ignore_ascii_case(&word.spelling);
                let rank = (distance, MAX_WORDS - taken, !exact);
                if best.as_ref().is_none_or(|(held, _, _)| rank < *held) {
                    best = Some((rank, taken, &word.spelling));
                }
            }
        }
        best.map(|(_, taken, spelling)| (taken, spelling))
    }
}

/// Case-insensitive and whole-word — but only at an edge that is a word character, because `\b`
/// never matches before the dot of `.cloud`.
fn phrase(from: &str) -> Result<Regex, String> {
    if from.trim().is_empty() {
        return Err("A replacement needs something to replace".into());
    }
    let edge = |end: Option<char>| {
        if end.is_some_and(|c| c.is_alphanumeric() || c == '_') {
            r"\b"
        } else {
            ""
        }
    };
    let (first, last) = (from.chars().next(), from.chars().last());
    Regex::new(&format!(
        "(?i){}{}{}",
        edge(first),
        regex::escape(from),
        edge(last)
    ))
    .map_err(|error| error.to_string())
}
